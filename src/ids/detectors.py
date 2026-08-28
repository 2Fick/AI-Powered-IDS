"""Load the trained models and run them behind one common interface.

The benchmark and the API both go through this module, so a number printed in
the comparison table is produced by exactly the same code path that serves a
live prediction.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import torch

from ids.config import MODELS_DIR
from ids.models.autoencoder import Autoencoder, reconstruction_error

MODEL_NAMES = ("random_forest", "isolation_forest", "autoencoder")

MODEL_LABELS = {
    "random_forest": "Random Forest",
    "isolation_forest": "Isolation Forest",
    "autoencoder": "Autoencoder",
}

MODEL_KINDS = {
    "random_forest": "supervised",
    "isolation_forest": "unsupervised",
    "autoencoder": "deep learning",
}


@dataclass
class ScoreResult:
    """Raw scores and the decisions they lead to, for one model."""

    name: str
    scores: np.ndarray
    predictions: np.ndarray
    threshold: float
    seconds: float

    @property
    def latency_ms_per_flow(self) -> float:
        return 1000.0 * self.seconds / max(len(self.scores), 1)


class Detector:
    """Common shape for the three models."""

    name: str = ""

    def score(self, features: np.ndarray) -> np.ndarray:
        raise NotImplementedError

    def threshold(self) -> float:
        raise NotImplementedError

    def run(self, features: np.ndarray) -> ScoreResult:
        started = time.perf_counter()
        scores = self.score(features)
        elapsed = time.perf_counter() - started
        cut = self.threshold()
        return ScoreResult(
            name=self.name,
            scores=scores,
            predictions=(scores >= cut).astype(np.int8),
            threshold=cut,
            seconds=elapsed,
        )


class RandomForestDetector(Detector):
    name = "random_forest"

    def __init__(self, model, decision_threshold: float = 0.5) -> None:
        self.model = model
        self.decision_threshold = decision_threshold

    def score(self, features: np.ndarray) -> np.ndarray:
        return self.model.predict_proba(features)[:, 1]

    def threshold(self) -> float:
        return self.decision_threshold


class IsolationForestDetector(Detector):
    name = "isolation_forest"

    def __init__(self, model, anomaly_threshold: float) -> None:
        self.model = model
        self.anomaly_threshold = anomaly_threshold

    def score(self, features: np.ndarray) -> np.ndarray:
        # score_samples is high for normal points, negate so that a bigger
        # number always means a more suspicious flow.
        return -self.model.score_samples(features)

    def threshold(self) -> float:
        return self.anomaly_threshold


class AutoencoderDetector(Detector):
    name = "autoencoder"

    def __init__(self, model: Autoencoder, error_threshold: float) -> None:
        self.model = model
        self.error_threshold = error_threshold

    def score(self, features: np.ndarray) -> np.ndarray:
        return reconstruction_error(self.model, features)

    def threshold(self) -> float:
        return self.error_threshold


@dataclass
class DetectorBundle:
    scaler: object
    detectors: dict[str, Detector]
    features: list[str]
    metadata: dict = field(default_factory=dict)

    @classmethod
    def load(cls, models_dir: Path = MODELS_DIR) -> "DetectorBundle":
        metadata_path = models_dir / "metadata.json"
        if not metadata_path.exists():
            raise FileNotFoundError(
                f"{metadata_path} is missing, run: python -m ids.train"
            )
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

        scaler = joblib.load(models_dir / "scaler.joblib")
        forest = joblib.load(models_dir / "random_forest.joblib")
        isolation = joblib.load(models_dir / "isolation_forest.joblib")

        # Training spreads the trees over every core, but serving scores one
        # flow at a time and the cost of handing work to a thread pool then
        # dwarfs the work itself. Dropping to a single worker takes the random
        # forest from about 17 ms per flow to about 3 ms.
        forest.n_jobs = 1
        isolation.n_jobs = 1

        checkpoint = torch.load(
            models_dir / "autoencoder.pt", map_location="cpu", weights_only=True
        )
        autoencoder = Autoencoder(
            input_dim=checkpoint["input_dim"],
            hidden_dims=tuple(checkpoint["hidden_dims"]),
            latent_dim=checkpoint["latent_dim"],
        )
        autoencoder.load_state_dict(checkpoint["state_dict"])
        autoencoder.eval()

        thresholds = metadata["thresholds"]
        detectors = {
            "random_forest": RandomForestDetector(forest),
            "isolation_forest": IsolationForestDetector(
                isolation, thresholds["isolation_forest"]
            ),
            "autoencoder": AutoencoderDetector(
                autoencoder, thresholds["autoencoder"]
            ),
        }
        return cls(
            scaler=scaler,
            detectors=detectors,
            features=metadata["features"],
            metadata=metadata,
        )

    def prepare(self, raw_features: np.ndarray) -> np.ndarray:
        return self.scaler.transform(raw_features).astype(np.float32)

    def run_all(self, raw_features: np.ndarray) -> dict[str, ScoreResult]:
        scaled = self.prepare(raw_features)
        return {name: detector.run(scaled) for name, detector in self.detectors.items()}
