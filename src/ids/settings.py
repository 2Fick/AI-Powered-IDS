"""Runtime settings, read from the environment or a local .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from ids.config import MODELS_DIR, PROCESSED_DIR, PROJECT_ROOT, REPORTS_DIR


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    models_dir: Path = MODELS_DIR
    processed_dir: Path = PROCESSED_DIR
    reports_dir: Path = REPORTS_DIR

    # Threat intelligence. Both services have a free tier and both are
    # optional: without a key the API simply reports that enrichment is off.
    virustotal_api_key: str = ""
    abuseipdb_api_key: str = ""
    intel_cache_ttl_seconds: int = 3600

    # Replay stream defaults.
    default_flows_per_second: float = 12.0
    max_flows_per_second: float = 80.0

    # Browser origins allowed to call the API.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
