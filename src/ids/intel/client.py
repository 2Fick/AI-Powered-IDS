"""Look up suspicious addresses against free threat intelligence services.

Two sources are queried, VirusTotal and AbuseIPDB. Both are optional: with no
API key configured the lookup returns a result that says so instead of failing,
which keeps the rest of the system working out of the box.

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

# The VirusTotal public plan allows four requests a minute. AbuseIPDB is far
# more generous per minute but caps the day, so it gets a gentle limit too.
VIRUSTOTAL_PER_MINUTE = 4
ABUSEIPDB_PER_MINUTE = 20


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

    @property
    def enabled(self) -> bool:
        return bool(self.virustotal_api_key or self.abuseipdb_api_key)

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

        virustotal, abuseipdb = await asyncio.gather(
            self._query_virustotal(ip), self._query_abuseipdb(ip)
        )
        sources = {"virustotal": virustotal, "abuseipdb": abuseipdb}

        # Only cache answers that actually came back, so a rate limited call is
        # retried later instead of being remembered as a miss.
        if virustotal.get("status") == "ok" or abuseipdb.get("status") == "ok":
            self._cache[ip] = CacheEntry(
                value=sources, expires_at=time.monotonic() + self.cache_ttl_seconds
            )
        return IntelReport(ip=ip, routable=True, sources=sources)
