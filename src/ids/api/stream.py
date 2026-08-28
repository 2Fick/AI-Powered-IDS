"""Replay a capture over a WebSocket so the dashboard sees live detection.

The replay split was held out before training, so nothing streamed here was
ever seen by a model. Flows go out in the order they were captured, at a rate
the client controls, and every flow is scored by all three models one at a
time. Scoring a single flow is what a real sensor would do, and it is also the
only honest way to report a per inference latency.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from ids.detectors import MODEL_KINDS, MODEL_LABELS, DetectorBundle
from ids.intel.client import ThreatIntelClient


@dataclass
class ModelCounters:
    """Running confusion matrix and latency for one model."""

    true_positive: int = 0
    false_positive: int = 0
    true_negative: int = 0
    false_negative: int = 0
    latency_total_ms: float = 0.0
    decisions: int = 0

    def update(self, alert: bool, is_attack: bool, latency_ms: float) -> None:
        if alert and is_attack:
            self.true_positive += 1
        elif alert and not is_attack:
            self.false_positive += 1
        elif not alert and is_attack:
            self.false_negative += 1
        else:
            self.true_negative += 1
        self.latency_total_ms += latency_ms
        self.decisions += 1

    def snapshot(self) -> dict[str, Any]:
        attacks = self.true_positive + self.false_negative
        benign = self.true_negative + self.false_positive
        alerts = self.true_positive + self.false_positive
        return {
            "alerts": alerts,
            "true_positive": self.true_positive,
            "false_positive": self.false_positive,
            "true_negative": self.true_negative,
            "false_negative": self.false_negative,
            "recall": self.true_positive / attacks if attacks else None,
            "false_positive_rate": self.false_positive / benign if benign else None,
            "precision": self.true_positive / alerts if alerts else None,
            "mean_latency_ms": (
                self.latency_total_ms / self.decisions if self.decisions else None
            ),
        }


@dataclass
class ReplayState:
    """Everything one connected dashboard controls about its own stream."""

    flows_per_second: float
    position: int = 0
    paused: bool = False
    counters: dict[str, ModelCounters] = field(default_factory=dict)
    started_at: float = field(default_factory=time.monotonic)

    def reset(self) -> None:
        self.position = 0
        self.counters = {name: ModelCounters() for name in self.counters}
        self.started_at = time.monotonic()


def score_single_flow(
    bundle: DetectorBundle, features: np.ndarray
) -> dict[str, dict[str, Any]]:
    """Run one flow through all three models, timing each one separately."""
    single = features.reshape(1, -1)
    scaled = bundle.prepare(single)

    verdicts = {}
    for name, detector in bundle.detectors.items():
        started = time.perf_counter()
        score = float(detector.score(scaled)[0])
        latency_ms = (time.perf_counter() - started) * 1000.0
        threshold = detector.threshold()
        verdicts[name] = {
            "label": MODEL_LABELS[name],
            "kind": MODEL_KINDS[name],
            "score": score,
            "threshold": float(threshold),
            "alert": bool(score >= threshold),
            "latency_ms": latency_ms,
        }
    return verdicts


def describe_flow(row: pd.Series, index: int) -> dict[str, Any]:
    timestamp = row.get("Timestamp")
    return {
        "id": int(index),
        "flow_id": str(row.get("Flow ID", "")),
        "source_ip": str(row.get("Source IP", "")),
        "source_port": int(row.get("Source Port", 0) or 0),
        "destination_ip": str(row.get("Destination IP", "")),
        "destination_port": int(row.get("Destination Port", 0) or 0),
        "protocol": int(row.get("Protocol", 0) or 0),
        "captured_at": timestamp.isoformat() if pd.notna(timestamp) else None,
        "duration_us": int(row.get("Flow Duration", 0) or 0),
        "forward_packets": int(row.get("Total Fwd Packets", 0) or 0),
        "backward_packets": int(row.get("Total Backward Packets", 0) or 0),
    }


class ReplayEngine:
    """Drives one dashboard connection through the replay split."""

    def __init__(
        self,
        bundle: DetectorBundle,
        replay: pd.DataFrame,
        intel: ThreatIntelClient,
        flows_per_second: float,
        max_flows_per_second: float,
    ) -> None:
        self.bundle = bundle
        self.replay = replay
        self.intel = intel
        self.max_flows_per_second = max_flows_per_second
        self.state = ReplayState(flows_per_second=flows_per_second)
        self.state.counters = {name: ModelCounters() for name in bundle.detectors}
        self.matrix = replay[bundle.features].to_numpy(dtype=np.float32, copy=False)
        self.attack_flags = replay["is_attack"].to_numpy()
        self.attack_types = replay["attack_type"].to_numpy()

    @property
    def total_flows(self) -> int:
        return len(self.replay)

    def apply_command(self, message: dict[str, Any]) -> dict[str, Any] | None:
        kind = message.get("type")
        if kind == "pause":
            self.state.paused = True
        elif kind == "resume":
            self.state.paused = False
        elif kind == "reset":
            self.state.reset()
        elif kind == "config":
            rate = float(message.get("flows_per_second", self.state.flows_per_second))
            self.state.flows_per_second = max(
                0.5, min(rate, self.max_flows_per_second)
            )
        else:
            return {"type": "error", "message": f"unknown command: {kind}"}
        return {
            "type": "status",
            "paused": self.state.paused,
            "flows_per_second": self.state.flows_per_second,
            "position": self.state.position,
        }

    def next_event(self) -> dict[str, Any]:
        """Score the flow at the current position and advance."""
        index = self.state.position % self.total_flows
        row = self.replay.iloc[index]
        verdicts = score_single_flow(self.bundle, self.matrix[index])

        is_attack = bool(self.attack_flags[index])
        for name, verdict in verdicts.items():
            self.state.counters[name].update(
                verdict["alert"], is_attack, verdict["latency_ms"]
            )

        self.state.position += 1
        return {
            "type": "flow",
            "flow": describe_flow(row, index),
            "truth": {
                "is_attack": is_attack,
                "attack_type": str(self.attack_types[index]),
            },
            "verdicts": verdicts,
            "any_alert": any(v["alert"] for v in verdicts.values()),
        }

    def stats_event(self) -> dict[str, Any]:
        elapsed = max(time.monotonic() - self.state.started_at, 1e-6)
        return {
            "type": "stats",
            "processed": self.state.position,
            "total_flows": self.total_flows,
            "elapsed_seconds": elapsed,
            "actual_flows_per_second": self.state.position / elapsed,
            "flows_per_second": self.state.flows_per_second,
            "paused": self.state.paused,
            "models": {
                name: counters.snapshot()
                for name, counters in self.state.counters.items()
            },
        }

    async def intel_event(self, ip: str) -> dict[str, Any]:
        report = await self.intel.lookup(ip)
        return {"type": "intel", **report.to_dict()}


def should_enrich(event: dict[str, Any]) -> bool:
    """Only spend threat intelligence quota on flows that raised an alert."""
    return bool(event.get("any_alert"))


async def run_stream(
    engine: ReplayEngine,
    send: Any,
    stop: asyncio.Event,
    stats_interval_seconds: float = 1.0,
) -> None:
    """Push flows to the client until it disconnects."""
    await send(
        {
            "type": "ready",
            "total_flows": engine.total_flows,
            "flows_per_second": engine.state.flows_per_second,
            "models": [
                {"name": name, "label": MODEL_LABELS[name], "kind": MODEL_KINDS[name]}
                for name in engine.bundle.detectors
            ],
            "intel_enabled": engine.intel.enabled,
        }
    )

    last_stats = time.monotonic()
    pending_intel: set[asyncio.Task] = set()
    seen_addresses: set[str] = set()

    while not stop.is_set():
        if engine.state.paused:
            await asyncio.sleep(0.1)
            continue

        cycle_started = time.monotonic()
        event = await asyncio.to_thread(engine.next_event)
        await send(event)

        source_ip = event["flow"]["source_ip"]
        if (
            engine.intel.enabled
            and should_enrich(event)
            and source_ip not in seen_addresses
        ):
            seen_addresses.add(source_ip)
            task = asyncio.create_task(engine.intel_event(source_ip))
            task.add_done_callback(pending_intel.discard)
            pending_intel.add(task)

        for task in [t for t in pending_intel if t.done()]:
            pending_intel.discard(task)
            try:
                await send(task.result())
            except Exception:
                pass

        now = time.monotonic()
        if now - last_stats >= stats_interval_seconds:
            last_stats = now
            await send(engine.stats_event())

        # Subtract the time scoring took so the stream keeps the rate the
        # client asked for instead of drifting behind it.
        budget = 1.0 / engine.state.flows_per_second
        await asyncio.sleep(max(0.0, budget - (time.monotonic() - cycle_started)))

    for task in pending_intel:
        task.cancel()
