import asyncio

from ids.intel.client import RateLimiter, ThreatIntelClient, is_routable


def test_private_addresses_are_not_routable():
    assert not is_routable("192.168.10.50")
    assert not is_routable("10.0.0.1")
    assert not is_routable("127.0.0.1")
    assert not is_routable("not an address")


def test_public_addresses_are_routable():
    assert is_routable("205.174.165.73")
    assert is_routable("8.8.8.8")


def test_private_address_is_never_sent_out():
    client = ThreatIntelClient(virustotal_api_key="fake", abuseipdb_api_key="fake")
    report = asyncio.run(client.lookup("192.168.10.50"))
    assert not report.routable
    assert not report.malicious
    assert "virustotal" not in report.sources


def test_lookup_without_keys_reports_it_instead_of_failing():
    client = ThreatIntelClient()
    report = asyncio.run(client.lookup("205.174.165.73"))
    assert report.routable
    assert report.sources["virustotal"]["status"] == "no api key"
    assert report.sources["abuseipdb"]["status"] == "no api key"


def test_rate_limiter_runs_out_of_tokens():
    limiter = RateLimiter(per_minute=2)

    async def drain():
        return [await limiter.acquire() for _ in range(3)]

    assert asyncio.run(drain()) == [True, True, False]
