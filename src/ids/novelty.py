"""Test what happens when an attack the supervised model has never seen arrives.

This is the experiment that decides whether the project needs three models or
just the best one.

The random forest reaches 99.9 percent recall, which makes the other two look
pointless. But it works under a closed world assumption: it can only recognise
the fourteen families it was trained on. Real traffic does not agree to stay
inside a training set.

So one family at a time is removed from the training data entirely, all three
models are refitted on what is left, and every model is then asked about the
family none of them was told about. The two unsupervised models never see any
attack during training, so nothing changes for them. Only the supervised model
is being tested here, and the point is what it loses.

    python -m ids.novelty
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

from ids.config import PROCESSED_DIR, RANDOM_SEED, REPORTS_DIR, ensure_dirs
from ids.dataset import feature_names, load_split, to_matrix
from ids.models.autoencoder import (
    TrainingConfig,
    reconstruction_error,
    train_autoencoder,
)
from ids.models.scaling import LogStandardScaler

# Families worth holding out. Each one is a different kind of attack, so a
# model that misses one is not obviously going to miss the next.
HELD_OUT_FAMILIES = (
    "PortScan",
    "DDoS",
    "Bot",
    "FTP-Patator",
    "DoS slowloris",
    "Web Attack Brute Force",
)


def stratified_sample(frame: pd.DataFrame, rows: int, seed: int) -> pd.DataFrame:
    if rows >= len(frame):
        return frame
    share = rows / len(frame)
    return (
        frame.groupby("attack_type", group_keys=False)[frame.columns.tolist()]
        .apply(
            lambda part: part.sample(
                n=max(1, int(round(len(part) * share))), random_state=seed
            )
        )
        .reset_index(drop=True)
    )


def recall_on(scores: np.ndarray, threshold: float) -> float:
    return float((scores >= threshold).mean()) if len(scores) else 0.0


def run_one(
    family: str,
    train: pd.DataFrame,
    test: pd.DataFrame,
    features: list[str],
    target_fpr: float,
    ae_epochs: int,
) -> dict:
    """Refit everything without one family, then ask about that family."""
    kept = train[train["attack_type"] != family]
    unseen = test[test["attack_type"] == family]
    benign_test = test[test["is_attack"] == 0]

    if len(unseen) == 0:
        return {"family": family, "skipped": "no rows in the test split"}

    x_train_raw = to_matrix(kept, features)
    y_train = kept["is_attack"].to_numpy()

    scaler = LogStandardScaler().fit(x_train_raw)
    x_train = scaler.transform(x_train_raw).astype(np.float32)
    benign_train = x_train[y_train == 0]
    x_unseen = scaler.transform(to_matrix(unseen, features)).astype(np.float32)
    x_benign_test = scaler.transform(
        to_matrix(benign_test, features)
    ).astype(np.float32)

    print(
        f"  {family}: training without it, {len(kept):,} rows left,"
        f" {len(unseen):,} held out flows to find"
    )

    started = time.perf_counter()
    forest = RandomForestClassifier(
        n_estimators=100,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=RANDOM_SEED,
    ).fit(x_train, y_train)
    forest.n_jobs = 1

    isolation = IsolationForest(
        n_estimators=200,
        max_samples=4096,
        n_jobs=-1,
        random_state=RANDOM_SEED,
    ).fit(benign_train)
    isolation_threshold = float(
        np.quantile(-isolation.score_samples(benign_train), 1.0 - target_fpr)
    )

    autoencoder = train_autoencoder(
        benign_train,
        TrainingConfig(epochs=ae_epochs, seed=RANDOM_SEED),
        verbose=False,
    )
    autoencoder_threshold = float(
        np.quantile(
            reconstruction_error(autoencoder, benign_train), 1.0 - target_fpr
        )
    )

    result = {
        "family": family,
        "training_rows": int(len(kept)),
        "held_out_flows": int(len(unseen)),
        "seconds": time.perf_counter() - started,
        "recall_on_unseen": {
            "random_forest": recall_on(forest.predict_proba(x_unseen)[:, 1], 0.5),
            "isolation_forest": recall_on(
                -isolation.score_samples(x_unseen), isolation_threshold
            ),
            "autoencoder": recall_on(
                reconstruction_error(autoencoder, x_unseen), autoencoder_threshold
            ),
        },
        "false_positive_rate": {
            "random_forest": recall_on(
                forest.predict_proba(x_benign_test)[:, 1], 0.5
            ),
            "isolation_forest": recall_on(
                -isolation.score_samples(x_benign_test), isolation_threshold
            ),
            "autoencoder": recall_on(
                reconstruction_error(autoencoder, x_benign_test),
                autoencoder_threshold,
            ),
        },
    }

    # What a union of the three would catch, which is how these would actually
    # be wired together.
    union = max(result["recall_on_unseen"].values())
    result["best_single_model"] = union
    print(
        f"    random forest {result['recall_on_unseen']['random_forest']:.3f}"
        f"  isolation forest {result['recall_on_unseen']['isolation_forest']:.3f}"
        f"  autoencoder {result['recall_on_unseen']['autoencoder']:.3f}"
    )
    return result


def to_markdown(results: list[dict]) -> str:
    lines = [
        "| Held out family | Flows | Random Forest | Isolation Forest |"
        " Autoencoder |",
        "| --- | --- | --- | --- |  --- |",
    ]
    for row in results:
        if "skipped" in row:
            continue
        recalls = row["recall_on_unseen"]
        lines.append(
            f"| {row['family']} | {row['held_out_flows']:,} |"
            f" {recalls['random_forest']:.1%} |"
            f" {recalls['isolation_forest']:.1%} |"
            f" {recalls['autoencoder']:.1%} |"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument("--target-fpr", type=float, default=0.01)
    parser.add_argument("--train-rows", type=int, default=500_000)
    parser.add_argument("--test-rows", type=int, default=200_000)
    parser.add_argument("--ae-epochs", type=int, default=12)
    parser.add_argument(
        "--families",
        nargs="*",
        default=list(HELD_OUT_FAMILIES),
        help="attack families to hold out, one run each",
    )
    args = parser.parse_args(argv)

    ensure_dirs()
    args.reports_dir.mkdir(parents=True, exist_ok=True)

    features = feature_names(args.processed_dir)
    train = stratified_sample(
        load_split("train", args.processed_dir), args.train_rows, RANDOM_SEED
    )
    test = stratified_sample(
        load_split("test", args.processed_dir), args.test_rows, RANDOM_SEED
    )
    print(
        f"Holding out one family at a time from {len(train):,} training rows"
    )

    results = [
        run_one(family, train, test, features, args.target_fpr, args.ae_epochs)
        for family in args.families
    ]

    report = {
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "target_fpr": args.target_fpr,
        "results": results,
    }
    (args.reports_dir / "novelty.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )

    table = to_markdown(results)
    (args.reports_dir / "novelty.md").write_text(
        "# What happens on an attack nobody trained on\n\n"
        "One family at a time is removed from the training data, all three\n"
        "models are refitted, and each is then asked about the family none of\n"
        "them was told about. The two unsupervised models never see any attack\n"
        "during training, so this measures what the supervised model loses.\n\n"
        f"{table}\n",
        encoding="utf-8",
    )

    print()
    print(table)
    print(f"\nWritten to {args.reports_dir / 'novelty.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
