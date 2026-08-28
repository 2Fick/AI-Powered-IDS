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


@dataclass
class AppState:
    bundle: DetectorBundle
    replay: pd.DataFrame
    benchmark: dict | None
    intel: ThreatIntelClient
    settings: Settings

    @classmethod
    def load(cls, settings: Settings) -> "AppState":
        bundle = DetectorBundle.load(settings.models_dir)
        replay = load_split("replay", settings.processed_dir)

        benchmark_path = Path(settings.reports_dir) / "benchmark.json"
        benchmark = (
            json.loads(benchmark_path.read_text(encoding="utf-8"))
            if benchmark_path.exists()
            else None
        )

        intel = ThreatIntelClient(
            virustotal_api_key=settings.virustotal_api_key,
            abuseipdb_api_key=settings.abuseipdb_api_key,
            cache_ttl_seconds=settings.intel_cache_ttl_seconds,
        )
        return cls(
            bundle=bundle,
            replay=replay,
            benchmark=benchmark,
            intel=intel,
            settings=settings,
        )

    async def aclose(self) -> None:
        await self.intel.aclose()
