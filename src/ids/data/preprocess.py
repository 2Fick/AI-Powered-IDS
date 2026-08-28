"""Turn the raw CICIDS2017 CSV files into clean train, test and replay splits.

The raw files need a fair amount of cleaning before any model can use them:
column names carry stray spaces, one column is duplicated, throughput columns
contain infinities when a flow lasts zero microseconds, and a few rows are
repeated header lines. This module does that once and writes Parquet files so
training runs stay fast.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from ids.config import (
    BENIGN_LABEL,
    CICIDS2017_FILES,
    LABEL_COLUMN,
    PROCESSED_DIR,
    RANDOM_SEED,
    RAW_DIR,
    ensure_dirs,
)

# Columns that hold no signal: they are constant across the whole dataset or
# they leak the capture setup rather than describing the flow.
CONSTANT_COLUMNS = [
    "Bwd PSH Flags",
    "Bwd URG Flags",
    "Fwd Avg Bytes/Bulk",
    "Fwd Avg Packets/Bulk",
    "Fwd Avg Bulk Rate",
    "Bwd Avg Bytes/Bulk",
    "Bwd Avg Packets/Bulk",
    "Bwd Avg Bulk Rate",
]


def normalise_columns(frame: pd.DataFrame) -> pd.DataFrame:
    """Strip padding from column names and drop the duplicated one."""
    frame.columns = [str(column).strip() for column in frame.columns]
    return frame.loc[:, ~frame.columns.duplicated()]


def load_raw(raw_dir: Path) -> pd.DataFrame:
    frames = []
    for name in CICIDS2017_FILES:
        path = raw_dir / name
        if not path.exists():
            raise FileNotFoundError(
                f"{path} is missing, run: python -m ids.data.download"
            )
        frame = pd.read_csv(path, low_memory=False, encoding="latin-1")
        frame = normalise_columns(frame)
        frame["capture_file"] = name
        frames.append(frame)
        print(f"  {name}: {len(frame):>9,} rows")
    return pd.concat(frames, ignore_index=True)


def clean(frame: pd.DataFrame) -> pd.DataFrame:
    """Drop unusable rows and columns, and make every feature a finite float."""
    before = len(frame)

    # Some files repeat their header in the middle of the data.
    frame = frame[frame[LABEL_COLUMN] != LABEL_COLUMN]
    frame[LABEL_COLUMN] = frame[LABEL_COLUMN].astype(str).str.strip()

    frame = frame.drop(columns=[c for c in CONSTANT_COLUMNS if c in frame.columns])

    feature_columns = [
        column
        for column in frame.columns
        if column not in (LABEL_COLUMN, "capture_file")
    ]
    frame[feature_columns] = frame[feature_columns].apply(
        pd.to_numeric, errors="coerce"
    )

    # Flow Bytes/s and Flow Packets/s go infinite on zero duration flows.
    frame[feature_columns] = frame[feature_columns].replace(
        [np.inf, -np.inf], np.nan
    )
    frame = frame.dropna(subset=feature_columns)

    # Negative header lengths and durations are capture artefacts.
    frame = frame[frame["Flow Duration"] >= 0]

    frame[feature_columns] = frame[feature_columns].astype(np.float32)
    print(f"  cleaning removed {before - len(frame):,} rows, {len(frame):,} left")
    return frame.reset_index(drop=True)


def add_labels(frame: pd.DataFrame) -> pd.DataFrame:
    frame["attack_type"] = frame[LABEL_COLUMN]
    frame["is_attack"] = (frame[LABEL_COLUMN] != BENIGN_LABEL).astype(np.int8)
    return frame.drop(columns=[LABEL_COLUMN])


def split(frame: pd.DataFrame, replay_size: int, test_size: float):
    """Carve out a replay slice first, then split the rest into train and test.

    The replay slice is what the live dashboard streams. It is taken from the
    data before the train and test split so that nothing the models were fitted
    on shows up in the demo.
    """
    replay = frame.sample(
        n=min(replay_size, len(frame)), random_state=RANDOM_SEED
    ).sort_index()
    remaining = frame.drop(index=replay.index)

    train, test = train_test_split(
        remaining,
        test_size=test_size,
        random_state=RANDOM_SEED,
        stratify=remaining["attack_type"],
    )
    return (
        train.reset_index(drop=True),
        test.reset_index(drop=True),
        replay.reset_index(drop=True),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--out-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument(
        "--replay-size",
        type=int,
        default=60_000,
        help="rows reserved for the live replay stream",
    )
    args = parser.parse_args(argv)

    ensure_dirs()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print("Reading raw CSV files")
    frame = load_raw(args.raw_dir)
    print(f"Combined: {len(frame):,} rows, {len(frame.columns)} columns")

    print("Cleaning")
    frame = clean(frame)
    frame = add_labels(frame)

    counts = frame["attack_type"].value_counts()
    print("Label distribution:")
    for label, count in counts.items():
        print(f"  {label:<28} {count:>9,}  ({100 * count / len(frame):5.2f}%)")

    print("Splitting")
    train, test, replay = split(frame, args.replay_size, args.test_size)
    for name, part in (("train", train), ("test", test), ("replay", replay)):
        attacks = int(part["is_attack"].sum())
        print(
            f"  {name:<7} {len(part):>9,} rows, {attacks:>8,} attacks"
            f" ({100 * attacks / len(part):5.2f}%)"
        )
        part.to_parquet(args.out_dir / f"{name}.parquet", index=False)

    feature_columns = [
        column
        for column in train.columns
        if column not in ("attack_type", "is_attack", "capture_file")
    ]
    (args.out_dir / "features.txt").write_text(
        "\n".join(feature_columns) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(feature_columns)} feature names to features.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
