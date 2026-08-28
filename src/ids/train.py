"""Fit the three detectors and save everything the API needs to serve them.

The three models answer the same question in different ways:

  Random Forest      supervised, learns from labelled attacks
  Isolation Forest   unsupervised, isolates points that sit apart from the rest
  Autoencoder        unsupervised, flags flows it cannot reconstruct

The two unsupervised models only ever see benign traffic during training. Their
thresholds come from the benign score distribution, so both are tuned to the
same target false positive rate and the comparison stays fair.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import torch
from sklearn.ensemble import IsolationForest, RandomForestClassifier

from ids.config import MODELS_DIR, PROCESSED_DIR, RANDOM_SEED, ensure_dirs
from ids.dataset import feature_names, load_split, to_matrix
from ids.models.autoencoder import (
    TrainingConfig,
    reconstruction_error,
    train_autoencoder,
)
from ids.models.scaling import LogStandardScaler


def threshold_at_fpr(benign_scores: np.ndarray, target_fpr: float) -> float:
    """Score above which at most target_fpr of benign traffic falls."""
    return float(np.quantile(benign_scores, 1.0 - target_fpr))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--models-dir", type=Path, default=MODELS_DIR)
    parser.add_argument("--target-fpr", type=float, default=0.01)
    parser.add_argument("--rf-trees", type=int, default=100)
    parser.add_argument("--if-trees", type=int, default=200)
    parser.add_argument("--if-sample-size", type=int, default=4096)
    parser.add_argument("--ae-epochs", type=int, default=20)
    parser.add_argument(
        "--max-train-rows",
        type=int,
        default=0,
        help="subsample the training split, 0 keeps every row",
    )
    args = parser.parse_args(argv)

    ensure_dirs()
    args.models_dir.mkdir(parents=True, exist_ok=True)

    features = feature_names(args.processed_dir)
    train = load_split("train", args.processed_dir)
    if args.max_train_rows and args.max_train_rows < len(train):
        train = train.sample(n=args.max_train_rows, random_state=RANDOM_SEED)
        print(f"Training on a {len(train):,} row subsample")

    x_train = to_matrix(train, features)
    y_train = train["is_attack"].to_numpy()
    print(f"Train split: {len(train):,} rows, {len(features)} features")
    print(f"  attacks {int(y_train.sum()):,}, benign {int((1 - y_train).sum()):,}")

    print("Fitting the scaler")
    started = time.perf_counter()
    scaler = LogStandardScaler().fit(x_train)
    x_train_scaled = scaler.transform(x_train).astype(np.float32)
    print(f"  done in {time.perf_counter() - started:.1f}s")

    benign_scaled = x_train_scaled[y_train == 0]
    print(f"Benign only training pool: {len(benign_scaled):,} rows")

    timings: dict[str, float] = {}

    print("Training the random forest")
    started = time.perf_counter()
    forest = RandomForestClassifier(
        n_estimators=args.rf_trees,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=RANDOM_SEED,
    )
    forest.fit(x_train_scaled, y_train)
    timings["random_forest"] = time.perf_counter() - started
    print(f"  done in {timings['random_forest']:.1f}s")

    print("Training the isolation forest on benign traffic")
    started = time.perf_counter()
    # The scikit-learn default of 256 samples per tree is far too coarse for a
    # feature space this wide, and it left the model barely above chance.
    isolation = IsolationForest(
        n_estimators=args.if_trees,
        max_samples=args.if_sample_size,
        contamination="auto",
        n_jobs=-1,
        random_state=RANDOM_SEED,
    )
    isolation.fit(benign_scaled)
    timings["isolation_forest"] = time.perf_counter() - started
    print(f"  done in {timings['isolation_forest']:.1f}s")

    # score_samples returns higher values for normal points, so negate it to
    # get an anomaly score that grows with how suspicious a flow looks.
    isolation_benign_scores = -isolation.score_samples(benign_scaled)
    isolation_threshold = threshold_at_fpr(isolation_benign_scores, args.target_fpr)
    print(f"  anomaly threshold at {args.target_fpr:.1%} FPR: {isolation_threshold:.4f}")

    print("Training the autoencoder on benign traffic")
    started = time.perf_counter()
    autoencoder_config = TrainingConfig(epochs=args.ae_epochs, seed=RANDOM_SEED)
    autoencoder = train_autoencoder(benign_scaled, autoencoder_config)
    timings["autoencoder"] = time.perf_counter() - started
    print(f"  done in {timings['autoencoder']:.1f}s")

    autoencoder_benign_scores = reconstruction_error(autoencoder, benign_scaled)
    autoencoder_threshold = threshold_at_fpr(
        autoencoder_benign_scores, args.target_fpr
    )
    print(
        f"  reconstruction threshold at {args.target_fpr:.1%} FPR:"
        f" {autoencoder_threshold:.6f}"
    )

    print("Saving artefacts")
    joblib.dump(scaler, args.models_dir / "scaler.joblib", compress=3)
    joblib.dump(forest, args.models_dir / "random_forest.joblib", compress=3)
    joblib.dump(isolation, args.models_dir / "isolation_forest.joblib", compress=3)
    torch.save(
        {
            "state_dict": autoencoder.state_dict(),
            "input_dim": autoencoder.input_dim,
            "hidden_dims": list(autoencoder.hidden_dims),
            "latent_dim": autoencoder.latent_dim,
        },
        args.models_dir / "autoencoder.pt",
    )

    metadata = {
        "features": features,
        "target_fpr": args.target_fpr,
        "train_rows": int(len(train)),
        "benign_train_rows": int(len(benign_scaled)),
        "thresholds": {
            "isolation_forest": isolation_threshold,
            "autoencoder": autoencoder_threshold,
        },
        "training_seconds": timings,
        "hyperparameters": {
            "random_forest": {
                "n_estimators": args.rf_trees,
                "min_samples_leaf": 2,
                "class_weight": "balanced_subsample",
            },
            "isolation_forest": {
                "n_estimators": args.if_trees,
                "max_samples": args.if_sample_size,
            },
            "autoencoder": {
                "epochs": autoencoder_config.epochs,
                "batch_size": autoencoder_config.batch_size,
                "learning_rate": autoencoder_config.learning_rate,
                "hidden_dims": list(autoencoder_config.hidden_dims),
                "latent_dim": autoencoder_config.latent_dim,
            },
        },
    }
    (args.models_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Artefacts written to {args.models_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
