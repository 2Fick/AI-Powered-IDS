"""FastAPI application serving the three detectors and the live replay stream.

Endpoints:

  GET  /api/health          liveness and what is loaded
  GET  /api/models          the three models, their thresholds and settings
  GET  /api/benchmark       the offline comparison report
  GET  /api/replay/summary  what the live stream is about to replay
  GET  /api/intel/{ip}      threat intelligence for one address
  POST /api/predict         score a batch of flows
  WS   /ws/stream           replay flows and score them live
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import AsyncIterator

import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from ids.api.schemas import (
    FlowVerdict,
    HealthResponse,
    ModelInfo,
    ModelVerdict,
    PredictRequest,
    PredictResponse,
)
from ids.api.state import AppState
from ids.api.stream import ReplayEngine, run_stream, score_single_flow
from ids.detectors import MODEL_KINDS, MODEL_LABELS
from ids.settings import settings


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.ids = AppState.load(settings)
    try:
        yield
    finally:
        await app.state.ids.aclose()


app = FastAPI(
    title="AI intrusion detection system",
    description=(
        "Three detectors trained on CICIDS2017, compared side by side and "
        "served over a live replay stream."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_state(request: Request) -> AppState:
    return request.app.state.ids


@app.get("/api/health", response_model=HealthResponse)
async def health(state: AppState = Depends(get_state)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        models_loaded=list(state.bundle.detectors),
        replay_flows=len(state.replay),
        benchmark_available=state.benchmark is not None,
        threat_intel_enabled=state.intel.enabled,
    )


@app.get("/api/models", response_model=list[ModelInfo])
async def models(state: AppState = Depends(get_state)) -> list[ModelInfo]:
    hyperparameters = state.bundle.metadata.get("hyperparameters", {})
    return [
        ModelInfo(
            name=name,
            label=MODEL_LABELS[name],
            kind=MODEL_KINDS[name],
            threshold=float(detector.threshold()),
            hyperparameters=hyperparameters.get(name, {}),
        )
        for name, detector in state.bundle.detectors.items()
    ]


@app.get("/api/benchmark")
async def benchmark(state: AppState = Depends(get_state)) -> dict:
    if state.benchmark is None:
        raise HTTPException(
            status_code=404,
            detail="no benchmark report yet, run: python -m ids.benchmark",
        )
    return state.benchmark


@app.get("/api/replay/summary")
async def replay_summary(state: AppState = Depends(get_state)) -> dict:
    counts = state.replay["attack_type"].value_counts()
    return {
        "flows": int(len(state.replay)),
        "attacks": int(state.replay["is_attack"].sum()),
        "attack_types": {str(k): int(v) for k, v in counts.items()},
        "first_captured_at": str(state.replay["Timestamp"].min()),
        "last_captured_at": str(state.replay["Timestamp"].max()),
        "default_flows_per_second": settings.default_flows_per_second,
        "max_flows_per_second": settings.max_flows_per_second,
    }


@app.get("/api/intel/{ip}")
async def intel(ip: str, state: AppState = Depends(get_state)) -> dict:
    report = await state.intel.lookup(ip)
    return {"enabled": state.intel.enabled, **report.to_dict()}


@app.post("/api/predict", response_model=PredictResponse)
async def predict(
    payload: PredictRequest, state: AppState = Depends(get_state)
) -> PredictResponse:
    features = state.bundle.features
    matrix = np.array(
        [[flow.features.get(name, 0.0) for name in features] for flow in payload.flows],
        dtype=np.float32,
    )

    started = time.perf_counter()
    results = []
    for index, row in enumerate(matrix):
        verdicts = score_single_flow(state.bundle, row)
        results.append(
            FlowVerdict(
                index=index,
                any_alert=any(v["alert"] for v in verdicts.values()),
                verdicts={
                    name: ModelVerdict(**verdict) for name, verdict in verdicts.items()
                },
            )
        )
    return PredictResponse(
        results=results, total_seconds=time.perf_counter() - started
    )


@app.websocket("/ws/stream")
async def stream(websocket: WebSocket) -> None:
    await websocket.accept()
    state: AppState = websocket.app.state.ids

    engine = ReplayEngine(
        bundle=state.bundle,
        replay=state.replay,
        intel=state.intel,
        flows_per_second=settings.default_flows_per_second,
        max_flows_per_second=settings.max_flows_per_second,
    )
    stop = asyncio.Event()
    send_lock = asyncio.Lock()

    async def send(message: dict) -> None:
        async with send_lock:
            await websocket.send_json(message)

    producer = asyncio.create_task(run_stream(engine, send, stop))
    try:
        while True:
            message = await websocket.receive_json()
            reply = engine.apply_command(message)
            if reply is not None:
                await send(reply)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        stop.set()
        producer.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await producer
