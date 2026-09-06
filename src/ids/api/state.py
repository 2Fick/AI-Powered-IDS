"""Objects the API loads once at start up and shares across requests.

Loading the three models and the replay split takes a few seconds, so it
happens during the application lifespan rather than on the first request.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from ids.dataset import load_split
from ids.detectors import DetectorBundle
from ids.intel.client import ThreatIntelClient
from ids.settings import Settings


# Reports the API serves as they are, each written by the command of the same
# name. A missing one is normal on a fresh clone, the endpoint says so.
REPORT_NAMES = ("benchmark", "validation", "sweeps", "curves", "novelty")


def read_report(reports_dir: Path, name: str) -> dict | None:
    path = Path(reports_dir) / f"{name}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass
class AppState:
    bundle: DetectorBundle
    replay: pd.DataFrame
    reports: dict[str, dict | None]
    intel: ThreatIntelClient
    settings: Settings

    @property
    def benchmark(self) -> dict | None:
        return self.reports.get("benchmark")

    @classmethod
    def load(cls, settings: Settings) -> "AppState":
        bundle = DetectorBundle.load(settings.models_dir)
        replay = load_split("replay", settings.processed_dir)

        reports = {
            name: read_report(settings.reports_dir, name) for name in REPORT_NAMES
        }

        intel = ThreatIntelClient(
            virustotal_api_key=settings.virustotal_api_key,
            abuseipdb_api_key=settings.abuseipdb_api_key,
            cache_ttl_seconds=settings.intel_cache_ttl_seconds,
        )
        return cls(
            bundle=bundle,
            replay=replay,
            reports=reports,
            intel=intel,
            settings=settings,
        )

    async def aclose(self) -> None:
        await self.intel.aclose()
