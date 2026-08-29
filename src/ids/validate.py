"""Check whether the headline scores are real or an artefact of the split.

A random train and test split on CICIDS2017 flatters every model, for two
reasons that have nothing to do with how good the model is.

The first is duplicates. A denial of service burst produces thousands of flows
that are identical in every feature. Split at random and the same row lands on
both sides, so the model is graded on rows it memorised.

The second is time. Flows from one attack burst are all alike, so a random
split lets the model see the first half of a burst and be tested on the second
half. A real sensor never gets that: it is trained on what happened before it
was deployed and judged on what comes after.

This module measures the first and re-runs the comparison under a split that
removes the second, so the gap between the two numbers is visible instead of
being something a reader has to guess at.

    python -m ids.validate
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import confusion_matrix, roc_auc_score

from ids.config import PROCESSED_DIR, RANDOM_SEED, REPORTS_DIR, ensure_dirs
from ids.dataset import feature_names, load_split, to_matrix
from ids.models.autoencoder import (
    TrainingConfig,
    reconstruction_error,
    train_autoencoder,
)
from ids.models.scaling import LogStandardScaler


def load_everything(processed_dir: Path) -> tuple[pd.DataFrame, list[str]]:
    """Put the three splits back together so we can cut them a different way."""
    features = feature_names(processed_dir)
    frame = pd.concat(
        [load_split(name, processed_dir) for name in ("train", "test", "replay")],
        ignore_index=True,
    )
    return frame, features


def duplicate_overlap(
    frame: pd.DataFrame, features: list[str], seed: int
) -> dict[str, float]:
    """How much of a random test split is a copy of something in the train half.

    Hashing the feature vector is enough here. Two flows with the same 69
    numbers are the same row as far as any of these models can tell.
    """
    matrix = to_matrix(frame, features)
    digests = pd.util.hash_pandas_object(
        pd.DataFrame(matrix), index=False
    ).to_numpy()

    rng = np.random.default_rng(seed)
    in_test = rng.random(len(frame)) < 0.25

    train_digests = set(digests[~in_test].tolist())
    test_digests = digests[in_test]
    duplicated = np.fromiter(
        (digest in train_digests for digest in test_digests.tolist()),
        dtype=bool,
        count=len(test_digests),
    )

    attacks = frame["is_attack"].to_numpy()[in_test] == 1
    return {
        "unique_flows": int(len(set(digests.tolist()))),
        "total_flows": int(len(frame)),
        "test_rows": int(in_test.sum()),
        "test_rows_seen_in_train": int(duplicated.sum()),
        "share_of_test_seen_in_train": float(duplicated.mean()),
        "share_of_test_attacks_seen_in_train": float(
            duplicated[attacks].mean() if attacks.any() else 0.0
        ),
    }


def time_ordered_split(
    frame: pd.DataFrame, test_share: float
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Train on the earlier part of every capture session, test on the later part.

    Splitting inside each session rather than holding out whole days keeps
    every attack family on both sides. Holding out whole days would instead
    ask a supervised model to name attacks it has never been shown, which is a
    different question and one no supervised model can answer.
    """
    frame = frame.sort_values(["capture_session", "Timestamp"])
    cutoffs = frame.groupby("capture_session")["Timestamp"].transform(
        lambda column: column.quantile(1.0 - test_share)
    )
    later = frame["Timestamp"] > cutoffs
    return frame[~later].reset_index(drop=True), frame[later].reset_index(drop=True)


def score_row(truth: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    predictions = (scores >= threshold).astype(np.int8)
    matrix = confusion_matrix(truth, predictions, labels=[0, 1])
    true_negative, false_positive, false_negative, true_positive = matrix.ravel()
    recall = true_positive / max(true_positive + false_negative, 1)
    false_positive_rate = false_positive / max(false_positive + true_negative, 1)
    precision = true_positive / max(true_positive + false_positive, 1)
    return {
        "recall": float(recall),
        "false_positive_rate": float(false_positive_rate),
        "precision": float(precision),
        "f1": float(2 * precision * recall / max(precision + recall, 1e-12)),
        "roc_auc": float(roc_auc_score(truth, scores)),
        "missed_attacks": int(false_negative),
    }


def run_under_split(
    train: pd.DataFrame,
    test: pd.DataFrame,
    features: list[str],
    target_fpr: float,
    rf_trees: int,
    if_trees: int,
    ae_epochs: int,
) -> dict:
    x_train = to_matrix(train, features)
    y_train = train["is_attack"].to_numpy()
    x_test = to_matrix(test, features)
    y_test = test["is_attack"].to_numpy()

    scaler = LogStandardScaler().fit(x_train)
    x_train_scaled = scaler.transform(x_train).astype(np.float32)
    x_test_scaled = scaler.transform(x_test).astype(np.float32)
    benign = x_train_scaled[y_train == 0]

    print(f"    train {len(train):,} rows, test {len(test):,} rows")

    started = time.perf_counter()
    forest = RandomForestClassifier(
        n_estimators=rf_trees,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=RANDOM_SEED,
    )
    forest.fit(x_train_scaled, y_train)
    print(f"    random forest fitted in {time.perf_counter() - started:.0f}s")
    results = {
        "random_forest": score_row(
            y_test, forest.predict_proba(x_test_scaled)[:, 1], 0.5
        )
    }

    isolation = IsolationForest(
        n_estimators=if_trees,
        max_samples=4096,
        n_jobs=-1,
        random_state=RANDOM_SEED,
    ).fit(benign)
    threshold = float(np.quantile(-isolation.score_samples(benign), 1.0 - target_fpr))
    results["isolation_forest"] = score_row(
        y_test, -isolation.score_samples(x_test_scaled), threshold
    )
    print("    isolation forest done")

    autoencoder = train_autoencoder(
        benign, TrainingConfig(epochs=ae_epochs, seed=RANDOM_SEED), verbose=False
    )
    threshold = float(
        np.quantile(reconstruction_error(autoencoder, benign), 1.0 - target_fpr)
    )
    results["autoencoder"] = score_row(
        y_test, reconstruction_error(autoencoder, x_test_scaled), threshold
    )
    print("    autoencoder done")

    return results


def to_markdown(random_split: dict, time_split: dict) -> str:
    lines = [
        "| Model | Recall random | Recall time ordered | False positives random |"
        " False positives time ordered |",
        "| --- | --- | --- | --- | --- |",
    ]
    labels = {
        "random_forest": "Random Forest",
        "isolation_forest": "Isolation Forest",
        "autoencoder": "Autoencoder",
    }
    for name, label in labels.items():
        left, right = random_split[name], time_split[name]
        lines.append(
            f"| {label} | {left['recall']:.3f} | {right['recall']:.3f} |"
            f" {left['false_positive_rate']:.4f} |"
            f" {right['false_positive_rate']:.4f} |"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument("--target-fpr", type=float, default=0.01)
    parser.add_argument("--test-share", type=float, default=0.25)
    parser.add_argument("--rf-trees", type=int, default=100)
    parser.add_argument("--if-trees", type=int, default=200)
    parser.add_argument("--ae-epochs", type=int, default=20)
    args = parser.parse_args(argv)

    ensure_dirs()
    args.reports_dir.mkdir(parents=True, exist_ok=True)

    frame, features = load_everything(args.processed_dir)
    print(f"Loaded {len(frame):,} flows")

    print("Measuring duplicate overlap under a random split")
    overlap = duplicate_overlap(frame, features, RANDOM_SEED)
    print(
        f"  {overlap['unique_flows']:,} distinct feature vectors out of"
        f" {overlap['total_flows']:,} flows"
    )
    print(
        f"  {overlap['share_of_test_seen_in_train']:.1%} of a random test split"
        " has an identical twin in the train half"
    )
    print(
        f"  {overlap['share_of_test_attacks_seen_in_train']:.1%} of the test"
        " attacks do"
    )

    print("Random split")
    random_train = frame.sample(frac=1.0 - args.test_share, random_state=RANDOM_SEED)
    random_test = frame.drop(index=random_train.index)
    random_results = run_under_split(
        random_train,
        random_test,
        features,
        args.target_fpr,
        args.rf_trees,
        args.if_trees,
        args.ae_epochs,
    )

    print("Time ordered split")
    time_train, time_test = time_ordered_split(frame, args.test_share)
    time_results = run_under_split(
        time_train,
        time_test,
        features,
        args.target_fpr,
        args.rf_trees,
        args.if_trees,
        args.ae_epochs,
    )

    report = {
        "duplicate_overlap": overlap,
        "random_split": random_results,
        "time_ordered_split": time_results,
    }
    (args.reports_dir / "validation.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )

    table = to_markdown(random_results, time_results)
    (args.reports_dir / "validation.md").write_text(
        "# Does the split flatter the models\n\n"
        f"{overlap['share_of_test_seen_in_train']:.1%} of a random test split has"
        " an identical twin in the train half, and\n"
        f"{overlap['share_of_test_attacks_seen_in_train']:.1%} of the test attacks"
        " do. The table compares the same three models\nunder a random split and"
        " under a split that trains on the earlier part of every capture\nsession"
        " and tests on the later part.\n\n"
        f"{table}\n",
        encoding="utf-8",
    )

    print()
    print(table)
    print(f"\nWritten to {args.reports_dir / 'validation.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
