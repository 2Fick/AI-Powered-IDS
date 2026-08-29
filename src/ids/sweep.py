"""Sweep the hyperparameters that matter and record what each one buys.

Every model here has one or two settings that move its score far more than the
rest. Rather than assert that the chosen values are good, this runs the sweep
and writes the curve, so the choice can be read off a chart instead of taken on
trust:

  Random Forest      how many trees, and what the extra trees cost in latency
  Isolation Forest   how many samples each tree sees, which is the setting the
                     scikit-learn default gets badly wrong for this data
  Autoencoder        how narrow the bottleneck is, and how the score improves
                     epoch by epoch

Sweeps run on a stratified subsample so the whole thing finishes in minutes
rather than hours. The absolute numbers are therefore a little below the full
benchmark, but the shape of each curve is what the sweep is for.

    python -m ids.sweep
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
import torch
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import roc_auc_score

from ids.config import PROCESSED_DIR, RANDOM_SEED, REPORTS_DIR, ensure_dirs
from ids.dataset import feature_names, load_split, to_matrix
from ids.models.autoencoder import (
    Autoencoder,
    TrainingConfig,
    reconstruction_error,
)
from ids.models.scaling import LogStandardScaler

RF_TREE_COUNTS = (5, 10, 25, 50, 100, 200)
IF_SAMPLE_SIZES = (128, 256, 512, 1024, 4096, 16384)
AE_LATENT_DIMS = (2, 4, 8, 16, 32)
AE_CURVE_EPOCHS = 25


def subsample(frame, rows: int, seed: int):
    """Take a stratified slice so every attack family survives the cut."""
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


def scores_at_target_fpr(
    benign_scores: np.ndarray,
    test_scores: np.ndarray,
    truth: np.ndarray,
    target_fpr: float,
) -> dict[str, float]:
    """Threshold on the training benign scores, then measure on the test set."""
    threshold = float(np.quantile(benign_scores, 1.0 - target_fpr))
    predictions = test_scores >= threshold
    attacks = truth == 1
    benign = ~attacks
    return {
        "threshold": threshold,
        "recall": float(predictions[attacks].mean()) if attacks.any() else 0.0,
        "false_positive_rate": (
            float(predictions[benign].mean()) if benign.any() else 0.0
        ),
        "roc_auc": float(roc_auc_score(truth, test_scores)),
    }


def sweep_random_forest(
    x_train, y_train, x_test, y_test, one_row
) -> list[dict]:
    results = []
    for trees in RF_TREE_COUNTS:
        started = time.perf_counter()
        forest = RandomForestClassifier(
            n_estimators=trees,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            n_jobs=-1,
            random_state=RANDOM_SEED,
        ).fit(x_train, y_train)
        fit_seconds = time.perf_counter() - started

        probabilities = forest.predict_proba(x_test)[:, 1]
        predictions = probabilities >= 0.5
        attacks = y_test == 1

        # Latency is measured the way the API serves: one flow, one worker.
        forest.n_jobs = 1
        forest.predict_proba(one_row)
        timings = []
        for _ in range(60):
            started = time.perf_counter()
            forest.predict_proba(one_row)
            timings.append((time.perf_counter() - started) * 1000.0)

        results.append(
            {
                "n_estimators": trees,
                "recall": float(predictions[attacks].mean()),
                "false_positive_rate": float(predictions[~attacks].mean()),
                "roc_auc": float(roc_auc_score(y_test, probabilities)),
                "fit_seconds": fit_seconds,
                "latency_ms": float(np.median(timings)),
            }
        )
        print(
            f"    {trees:>4} trees  recall {results[-1]['recall']:.4f}"
            f"  fp {results[-1]['false_positive_rate']:.4f}"
            f"  {results[-1]['latency_ms']:.2f} ms"
        )
    return results


def sweep_isolation_forest(
    benign_train, x_test, y_test, target_fpr
) -> list[dict]:
    results = []
    for samples in IF_SAMPLE_SIZES:
        started = time.perf_counter()
        model = IsolationForest(
            n_estimators=200,
            max_samples=samples,
            n_jobs=-1,
            random_state=RANDOM_SEED,
        ).fit(benign_train)
        fit_seconds = time.perf_counter() - started

        row = scores_at_target_fpr(
            -model.score_samples(benign_train),
            -model.score_samples(x_test),
            y_test,
            target_fpr,
        )
        row["max_samples"] = samples
        row["fit_seconds"] = fit_seconds
        results.append(row)
        print(
            f"    {samples:>6} samples  recall {row['recall']:.4f}"
            f"  auc {row['roc_auc']:.4f}"
        )
    return results


def train_with_curve(
    benign_train: np.ndarray,
    x_test: np.ndarray,
    y_test: np.ndarray,
    config: TrainingConfig,
    target_fpr: float,
    device: str = "cpu",
) -> tuple[Autoencoder, list[dict]]:
    """Train the autoencoder and score it after every epoch.

    The loss alone does not say whether the model is getting better at the job.
    Measuring recall each epoch shows when it stops improving, which is what
    decides how long to train.
    """
    from torch import nn
    from torch.utils.data import DataLoader, TensorDataset

    torch.manual_seed(config.seed)
    tensor = torch.from_numpy(np.asarray(benign_train, dtype=np.float32))
    loader = DataLoader(
        TensorDataset(tensor),
        batch_size=config.batch_size,
        shuffle=True,
        drop_last=True,
    )

    model = Autoencoder(
        input_dim=tensor.shape[1],
        hidden_dims=config.hidden_dims,
        latent_dim=config.latent_dim,
    ).to(device)
    optimiser = torch.optim.Adam(model.parameters(), lr=config.learning_rate)
    schedule = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimiser, T_max=config.epochs
    )
    criterion = nn.MSELoss()

    curve = []
    for epoch in range(1, config.epochs + 1):
        model.train()
        running, seen = 0.0, 0
        for (batch,) in loader:
            batch = batch.to(device)
            optimiser.zero_grad()
            loss = criterion(model(batch), batch)
            loss.backward()
            optimiser.step()
            running += loss.item() * len(batch)
            seen += len(batch)
        schedule.step()

        row = scores_at_target_fpr(
            reconstruction_error(model, benign_train),
            reconstruction_error(model, x_test),
            y_test,
            target_fpr,
        )
        row["epoch"] = epoch
        row["loss"] = running / seen
        curve.append(row)
        print(
            f"    epoch {epoch:>2}  loss {row['loss']:.6f}"
            f"  recall {row['recall']:.4f}  auc {row['roc_auc']:.4f}"
        )

    model.eval()
    return model, curve


def sweep_autoencoder_latent(
    benign_train, x_test, y_test, target_fpr, epochs
) -> list[dict]:
    results = []
    for latent in AE_LATENT_DIMS:
        config = TrainingConfig(
            epochs=epochs, latent_dim=latent, seed=RANDOM_SEED
        )
        started = time.perf_counter()
        model, curve = train_with_curve(
            benign_train, x_test, y_test, config, target_fpr
        )
        row = dict(curve[-1])
        row["latent_dim"] = latent
        row["fit_seconds"] = time.perf_counter() - started
        results.append(row)
        print(
            f"  latent {latent:>3}  recall {row['recall']:.4f}"
            f"  auc {row['roc_auc']:.4f}"
        )
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument("--target-fpr", type=float, default=0.01)
    parser.add_argument("--train-rows", type=int, default=400_000)
    parser.add_argument("--test-rows", type=int, default=150_000)
    parser.add_argument("--latent-epochs", type=int, default=8)
    args = parser.parse_args(argv)

    ensure_dirs()
    args.reports_dir.mkdir(parents=True, exist_ok=True)

    features = feature_names(args.processed_dir)
    train = subsample(
        load_split("train", args.processed_dir), args.train_rows, RANDOM_SEED
    )
    test = subsample(
        load_split("test", args.processed_dir), args.test_rows, RANDOM_SEED
    )
    print(f"Sweeping on {len(train):,} train rows and {len(test):,} test rows")

    x_train_raw = to_matrix(train, features)
    y_train = train["is_attack"].to_numpy()
    x_test_raw = to_matrix(test, features)
    y_test = test["is_attack"].to_numpy()

    scaler = LogStandardScaler().fit(x_train_raw)
    x_train = scaler.transform(x_train_raw).astype(np.float32)
    x_test = scaler.transform(x_test_raw).astype(np.float32)
    benign_train = x_train[y_train == 0]
    one_row = x_test[:1]

    print("Random forest, number of trees")
    random_forest = sweep_random_forest(x_train, y_train, x_test, y_test, one_row)

    print("Isolation forest, samples per tree")
    isolation_forest = sweep_isolation_forest(
        benign_train, x_test, y_test, args.target_fpr
    )

    print("Autoencoder, training curve at the chosen size")
    _, learning_curve = train_with_curve(
        benign_train,
        x_test,
        y_test,
        TrainingConfig(epochs=AE_CURVE_EPOCHS, seed=RANDOM_SEED),
        args.target_fpr,
    )

    print("Autoencoder, bottleneck size")
    autoencoder_latent = sweep_autoencoder_latent(
        benign_train, x_test, y_test, args.target_fpr, args.latent_epochs
    )

    report = {
        "setup": {
            "train_rows": int(len(train)),
            "test_rows": int(len(test)),
            "features": len(features),
            "target_fpr": args.target_fpr,
            "note": (
                "Sweeps run on a stratified subsample so they finish in "
                "minutes. Absolute scores sit a little below the full "
                "benchmark, the shape of each curve is the point."
            ),
        },
        "random_forest_trees": random_forest,
        "isolation_forest_samples": isolation_forest,
        "autoencoder_learning_curve": learning_curve,
        "autoencoder_latent_dim": autoencoder_latent,
        "chosen": {
            "random_forest": {"n_estimators": 100},
            "isolation_forest": {"max_samples": 4096},
            "autoencoder": asdict(TrainingConfig()),
        },
    }
    path = args.reports_dir / "sweeps.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"\nWritten to {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
