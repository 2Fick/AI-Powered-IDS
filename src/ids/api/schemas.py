"""Request and response shapes for the REST endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FlowFeatures(BaseModel):
    """One network flow, keyed by the feature names the models were fitted on."""

    features: dict[str, float] = Field(
        description="feature name to value, missing features default to zero"
    )
    source_ip: str | None = None
    destination_ip: str | None = None


class PredictRequest(BaseModel):
    flows: list[FlowFeatures] = Field(min_length=1, max_length=1000)


class ModelVerdict(BaseModel):
    label: str
    kind: str
    score: float
    threshold: float
    alert: bool
    latency_ms: float


class FlowVerdict(BaseModel):
    index: int
    any_alert: bool
    verdicts: dict[str, ModelVerdict]


class PredictResponse(BaseModel):
    results: list[FlowVerdict]
    total_seconds: float


class ModelInfo(BaseModel):
    name: str
    label: str
    kind: str
    threshold: float
    hyperparameters: dict[str, Any] = {}


class HealthResponse(BaseModel):
    status: str
    models_loaded: list[str]
    replay_flows: int
    benchmark_available: bool
    threat_intel_enabled: bool
