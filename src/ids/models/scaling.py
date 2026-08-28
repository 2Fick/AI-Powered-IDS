"""Feature scaling built for single flow inference.

CICIDS2017 features are extremely heavy tailed. A handful of flows carry packet
counts, durations and byte rates several orders of magnitude above the rest, so
plain standardisation leaves those outliers dominating the autoencoder loss and
the whole thing learns very little.

The obvious fix is a quantile transform, and that is what this project used
first. It worked, but it cost about 20 ms to transform a single row, which was
more than all three models spent deciding put together. A signed logarithm
compresses the same long tails, runs in a few microseconds, and is a plain
numpy expression with no per call validation, so that is what is used here.

The transform is sign(x) * log1p(|x|) followed by standardisation. The sign
keeps the few features that go negative working, and log1p leaves values near
zero almost untouched.
"""

from __future__ import annotations

import numpy as np


class LogStandardScaler:
    """Signed log compression followed by standardisation.

    The interface is the small part of the scikit-learn transformer API that
    the rest of the project uses, which keeps it a drop in replacement.
    """

    def __init__(self) -> None:
        self.mean_: np.ndarray | None = None
        self.scale_: np.ndarray | None = None
        self.n_features_in_: int = 0

    @staticmethod
    def _compress(features: np.ndarray) -> np.ndarray:
        return np.sign(features) * np.log1p(np.abs(features))

    def fit(self, features: np.ndarray, y=None) -> "LogStandardScaler":
        compressed = self._compress(np.asarray(features, dtype=np.float64))
        self.mean_ = compressed.mean(axis=0)
        scale = compressed.std(axis=0)
        # A constant feature would divide by zero. Leave it centred instead.
        scale[scale == 0.0] = 1.0
        self.scale_ = scale
        self.n_features_in_ = compressed.shape[1]
        return self

    def transform(self, features: np.ndarray) -> np.ndarray:
        if self.mean_ is None or self.scale_ is None:
            raise RuntimeError("the scaler has not been fitted")
        compressed = self._compress(np.asarray(features, dtype=np.float64))
        return (compressed - self.mean_) / self.scale_

    def fit_transform(self, features: np.ndarray, y=None) -> np.ndarray:
        return self.fit(features).transform(features)
