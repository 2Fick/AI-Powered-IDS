"""Helpers to load the processed splits and turn them into model input."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ids.config import PROCESSED_DIR

META_COLUMNS = ("attack_type", "is_attack", "capture_session")


def feature_names(processed_dir: Path = PROCESSED_DIR) -> list[str]:
    path = processed_dir / "features.txt"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing, run: python -m ids.data.preprocess"
        )
    return [line for line in path.read_text(encoding="utf-8").splitlines() if line]


def load_split(name: str, processed_dir: Path = PROCESSED_DIR) -> pd.DataFrame:
    path = processed_dir / f"{name}.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing, run: python -m ids.data.preprocess"
        )
    return pd.read_parquet(path)


def to_matrix(frame: pd.DataFrame, features: list[str]) -> np.ndarray:
    return frame[features].to_numpy(dtype=np.float32, copy=False)
