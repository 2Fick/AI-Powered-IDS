"""Look up suspicious addresses against free threat intelligence services.

Four sources are queried, and they answer different questions:

  VirusTotal   how many security vendors call this address malicious
  AbuseIPDB    how many people have reported it, and for what
  Shodan       what it exposes to the internet, and which CVEs those services
               are known to be vulnerable to
  GreyNoise    whether it is one of the machines that scan the whole internet
               all day, which is the difference between being targeted and
               being background noise

The first two need a free API key. The last two answer without one, so the
enrichment is never completely dark even on a fresh clone. Any source with no
key reports that instead of failing.

Three things keep the free tiers usable. Private and reserved addresses are
never sent anywhere, which alone skips most of the CICIDS2017 traffic since the
test bed runs on a private network. Answers are cached in memory for an hour,
and the same address shows up in hundreds of flows. A token bucket holds the
request rate under what the free plans allow.
"""

from __future__ import annotations

import asyncio
import ipaddress
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

VIRUSTOTAL_URL = "https://www.virustotal.com/api/v3/ip_addresses/{ip}"
ABUSEIPDB_URL = "https://api.abuseipdb.com/api/v2/check"
SHODAN_URL = "https://internetdb.shodan.io/{ip}"
GREYNOISE_URL = "https://api.greynoise.io/v3/community/{ip}"

# The VirusTotal public plan allows four requests a minute. AbuseIPDB is far
# more generous per minute but caps the day, so it gets a gentle limit too.
# The two keyless services are polite defaults rather than published limits.
VIRUSTOTAL_PER_MINUTE = 4
ABUSEIPDB_PER_MINUTE = 20
SHODAN_PER_MINUTE = 30
GREYNOISE_PER_MINUTE = 30


class RateLimiter:
    """A token bucket that refills at a fixed number of calls per minute."""

    def __init__(self, per_minute: int) -> None:
        self.capacity = float(per_minute)
        self.tokens = float(per_minute)
        self.refill_per_second = per_minute / 60.0
        self.updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> bool:
        """Take a token, or report that the budget is spent."""
        async with self._lock:
            now = time.monotonic()
            self.tokens = min(
                self.capacity,
                self.tokens + (now - self.updated) * self.refill_per_second,
            )
            self.updated = now
            if self.tokens < 1.0:
                return False
            self.tokens -= 1.0
            return True


@dataclass
class CacheEntry:
    value: dict[str, Any]
    expires_at: float


@dataclass
class IntelReport:
    ip: str
    routable: bool
    sources: dict[str, Any] = field(default_factory=dict)
    cached: bool = False

    @property
    def malicious(self) -> bool:
        """True when a source that names names says this address is bad.

        Shodan and GreyNoise are deliberately left out of this decision. An
        exposed service is not an attack and an internet wide scanner is not
        aimed at anyone in particular, so both are context rather than a
        verdict.
        """
        virustotal = self.sources.get("virustotal", {})
        abuseipdb = self.sources.get("abuseipdb", {})
        return bool(virustotal.get("malicious", 0)) or (
            abuseipdb.get("abuse_confidence_score", 0) >= 25
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "ip": self.ip,
            "routable": self.routable,
            "malicious": self.malicious,
            "cached": self.cached,
            "sources": self.sources,
        }


def is_routable(ip: str) -> bool:
    """True when an address is worth sending to an external service."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


class ThreatIntelClient:
    def __init__(
        self,
        virustotal_api_key: str = "",
        abuseipdb_api_key: str = "",
        cache_ttl_seconds: int = 3600,
        timeout_seconds: float = 8.0,
    ) -> None:
        self.virustotal_api_key = virustotal_api_key
        self.abuseipdb_api_key = abuseipdb_api_key
        self.cache_ttl_seconds = cache_ttl_seconds
        self._cache: dict[str, CacheEntry] = {}
        self._client = httpx.AsyncClient(timeout=timeout_seconds)
        self._virustotal_limit = RateLimiter(VIRUSTOTAL_PER_MINUTE)
        self._abuseipdb_limit = RateLimiter(ABUSEIPDB_PER_MINUTE)
        self._shodan_limit = RateLimiter(SHODAN_PER_MINUTE)
        self._greynoise_limit = RateLimiter(GREYNOISE_PER_MINUTE)

    @property
    def enabled(self) -> bool:
        """Two of the four sources need no key, so enrichment is always on."""
        return True

    @property
    def keyed_sources(self) -> list[str]:
        """Which of the key based sources are actually configured."""
        configured = []
        if self.virustotal_api_key:
            configured.append("virustotal")
        if self.abuseipdb_api_key:
            configured.append("abuseipdb")
        return configured

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _query_virustotal(self, ip: str) -> dict[str, Any]:
        if not self.virustotal_api_key:
            return {"status": "no api key"}
        if not await self._virustotal_limit.acquire():
            return {"status": "rate limited locally"}
        try:
            response = await self._client.get(
                VIRUSTOTAL_URL.format(ip=ip),
                headers={"x-apikey": self.virustotal_api_key},
            )
        except httpx.HTTPError as error:
            return {"status": f"request failed: {error.__class__.__name__}"}
        if response.status_code == 429:
            return {"status": "quota exhausted"}
        if response.status_code != 200:
            return {"status": f"http {response.status_code}"}

        attributes = response.json().get("data", {}).get("attributes", {})
        stats = attributes.get("last_analysis_stats", {})
        return {
            "status": "ok",
            "malicious": stats.get("malicious", 0),
            "suspicious": stats.get("suspicious", 0),
            "harmless": stats.get("harmless", 0),
            "reputation": attributes.get("reputation"),
            "country": attributes.get("country"),
            "owner": attributes.get("as_owner"),
        }

    async def _query_abuseipdb(self, ip: str) -> dict[str, Any]:
        if not self.abuseipdb_api_key:
            return {"status": "no api key"}
        if not await self._abuseipdb_limit.acquire():
            return {"status": "rate limited locally"}
        try:
            response = await self._client.get(
                ABUSEIPDB_URL,
                headers={"Key": self.abuseipdb_api_key, "Accept": "application/json"},
                params={"ipAddress": ip, "maxAgeInDays": 90},
            )
        except httpx.HTTPError as error:
            return {"status": f"request failed: {error.__class__.__name__}"}
        if response.status_code == 429:
            return {"status": "quota exhausted"}
        if response.status_code != 200:
            return {"status": f"http {response.status_code}"}

        data = response.json().get("data", {})
        return {
            "status": "ok",
            "abuse_confidence_score": data.get("abuseConfidenceScore", 0),
            "total_reports": data.get("totalReports", 0),
            "country": data.get("countryCode"),
            "isp": data.get("isp"),
            "usage_type": data.get("usageType"),
        }

    async def _query_shodan(self, ip: str) -> dict[str, Any]:
        """Ask what this address exposes. No key, no account, no quota page."""
        if not await self._shodan_limit.acquire():
            return {"status": "rate limited locally"}
        try:
            response = await self._client.get(SHODAN_URL.format(ip=ip))
        except httpx.HTTPError as error:
            return {"status": f"request failed: {error.__class__.__name__}"}
        if response.status_code == 404:
            return {"status": "ok", "known": False}
        if response.status_code != 200:
            return {"status": f"http {response.status_code}"}

        data = response.json()
        vulnerabilities = data.get("vulns", [])
        return {
            "status": "ok",
            "known": True,
            "open_ports": data.get("ports", [])[:20],
            "port_count": len(data.get("ports", [])),
            "tags": data.get("tags", []),
            "vulnerability_count": len(vulnerabilities),
            "vulnerabilities": vulnerabilities[:10],
            "hostnames": data.get("hostnames", [])[:3],
        }

    async def _query_greynoise(self, ip: str) -> dict[str, Any]:
        """Ask whether this address scans the whole internet all day.

        A hit here downgrades an alert rather than raising it: mass scanners
        hit every address on the internet, so seeing one says nothing about
        being singled out.
        """
        if not await self._greynoise_limit.acquire():
            return {"status": "rate limited locally"}
        try:
            response = await self._client.get(GREYNOISE_URL.format(ip=ip))
        except httpx.HTTPError as error:
            return {"status": f"request failed: {error.__class__.__name__}"}
        if response.status_code == 429:
            return {"status": "quota exhausted"}
        if response.status_code not in (200, 404):
            return {"status": f"http {response.status_code}"}

        data = response.json()
        return {
            "status": "ok",
            "internet_scanner": bool(data.get("noise", False)),
            "common_business_service": bool(data.get("riot", False)),
            "classification": data.get("classification"),
            "name": data.get("name"),
            "last_seen": data.get("last_seen"),
        }

    async def lookup(self, ip: str) -> IntelReport:
        if not is_routable(ip):
            return IntelReport(
                ip=ip,
                routable=False,
                sources={"note": "private or reserved address, not looked up"},
            )

        entry = self._cache.get(ip)
        if entry and entry.expires_at > time.monotonic():
            return IntelReport(ip=ip, routable=True, sources=entry.value, cached=True)

        virustotal, abuseipdb, shodan, greynoise = await asyncio.gather(
            self._query_virustotal(ip),
            self._query_abuseipdb(ip),
            self._query_shodan(ip),
            self._query_greynoise(ip),
        )
        sources = {
            "virustotal": virustotal,
            "abuseipdb": abuseipdb,
            "shodan": shodan,
            "greynoise": greynoise,
        }

        # Only cache answers that actually came back, so a rate limited call is
        # retried later instead of being remembered as a miss.
        if any(source.get("status") == "ok" for source in sources.values()):
            self._cache[ip] = CacheEntry(
                value=sources, expires_at=time.monotonic() + self.cache_ttl_seconds
            )
        return IntelReport(ip=ip, routable=True, sources=sources)
