"""Curves that explain the numbers in the comparison table.

The benchmark reports one operating point per model. That hides the question a
reviewer will ask first: what would happen at a different threshold. These
curves answer it, and they also show what the models are looking at.

  ROC and precision recall   the whole trade off, not one point on it
  Threshold sweep            recall against false positive rate, so the cost of
                             tightening or loosening an alert is visible
  Score separation           where benign and attack scores actually sit
  Feature distributions      the handful of measurements that carry the signal,
                             benign against attack

Everything comes from the models that are actually served, so a curve here and
a number in the comparison table cannot drift apart.

    python -m ids.curves
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)

from ids.config import MODELS_DIR, PROCESSED_DIR, RANDOM_SEED, REPORTS_DIR, ensure_dirs
from ids.dataset import load_split, to_matrix
from ids.detectors import MODEL_KINDS, MODEL_LABELS, DetectorBundle

# Curves are drawn in a browser, so a few hundred points is plenty and keeps
# the report small.
CURVE_POINTS = 200
HISTOGRAM_BINS = 40
TOP_FEATURES = 6


def thin(values: np.ndarray, points: int = CURVE_POINTS) -> np.ndarray:
    """Evenly spaced sample of an array, keeping both ends."""
    if len(values) <= points:
        return values
    index = np.linspace(0, len(values) - 1, points).astype(int)
    return values[index]


def roc_points(truth: np.ndarray, scores: np.ndarray) -> list[dict]:
    false_positive_rate, true_positive_rate, _ = roc_curve(truth, scores)
    return [
        {"fpr": float(x), "tpr": float(y)}
        for x, y in zip(
            thin(false_positive_rate), thin(true_positive_rate), strict=True
        )
    ]


def precision_recall_points(truth: np.ndarray, scores: np.ndarray) -> list[dict]:
    precision, recall, _ = precision_recall_curve(truth, scores)
    return [
        {"recall": float(x), "precision": float(y)}
        for x, y in zip(thin(recall), thin(precision), strict=True)
    ]


def threshold_sweep(
    truth: np.ndarray, scores: np.ndarray, chosen: float
) -> dict:
    """Recall and false positive rate across the range of possible thresholds.

    This is the chart that answers "why that threshold and not another one".
    """
    attacks = truth == 1
    benign = ~attacks
    candidates = np.quantile(scores, np.linspace(0.5, 0.9999, 60))
    candidates = np.unique(np.append(candidates, chosen))

    points = []
    for threshold in candidates:
        flagged = scores >= threshold
        points.append(
            {
                "threshold": float(threshold),
                "recall": float(flagged[attacks].mean()),
                "false_positive_rate": float(flagged[benign].mean()),
                "chosen": bool(np.isclose(threshold, chosen)),
            }
        )
    return {"points": points, "chosen_threshold": float(chosen)}


def score_histogram(scores: np.ndarray, truth: np.ndarray, chosen: float) -> dict:
    """Where benign and attack scores sit, on one shared set of bins.

    Two distributions that overlap heavily are a model that cannot separate the
    classes at any threshold, which no single metric makes obvious.
    """
    low, high = np.quantile(scores, [0.001, 0.999])
    if not np.isfinite(low) or not np.isfinite(high) or high <= low:
        low, high = float(scores.min()), float(scores.max() + 1e-9)
    edges = np.linspace(low, high, HISTOGRAM_BINS + 1)

    benign_counts, _ = np.histogram(scores[truth == 0], bins=edges)
    attack_counts, _ = np.histogram(scores[truth == 1], bins=edges)
    centres = (edges[:-1] + edges[1:]) / 2

    return {
        "chosen_threshold": float(chosen),
        "bins": [
            {
                "score": float(centre),
                # Shares rather than counts, since benign outnumbers attacks
                # four to one and would flatten the attack curve to nothing.
                "benign": float(count_benign / max(int((truth == 0).sum()), 1)),
                "attack": float(count_attack / max(int((truth == 1).sum()), 1)),
            }
            for centre, count_benign, count_attack in zip(
                centres, benign_counts, attack_counts, strict=True
            )
        ],
    }


def feature_distributions(
    raw: np.ndarray, truth: np.ndarray, features: list[str], importances: np.ndarray
) -> list[dict]:
    """The features the forest leans on most, benign against attack.

    Drawn on a log scale, because these columns span nine orders of magnitude
    and a linear axis shows a single spike and nothing else.
    """
    order = np.argsort(importances)[::-1][:TOP_FEATURES]
    result = []
    for index in order:
        column = raw[:, index].astype(np.float64)
        compressed = np.sign(column) * np.log10(1.0 + np.abs(column))
        low, high = np.quantile(compressed, [0.0, 0.995])
        if high <= low:
            high = low + 1.0
        edges = np.linspace(low, high, HISTOGRAM_BINS + 1)

        benign_counts, _ = np.histogram(compressed[truth == 0], bins=edges)
        attack_counts, _ = np.histogram(compressed[truth == 1], bins=edges)
        centres = (edges[:-1] + edges[1:]) / 2

        result.append(
            {
                "feature": features[index],
                "importance": float(importances[index]),
                "benign_median": float(np.median(column[truth == 0])),
                "attack_median": float(np.median(column[truth == 1])),
                "bins": [
                    {
                        "value": float(centre),
                        "benign": float(b / max(int((truth == 0).sum()), 1)),
                        "attack": float(a / max(int((truth == 1).sum()), 1)),
                    }
                    for centre, b, a in zip(
                        centres, benign_counts, attack_counts, strict=True
                    )
                ],
            }
        )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--models-dir", type=Path, default=MODELS_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument(
        "--rows",
        type=int,
        default=200_000,
        help="test rows to draw the curves from",
    )
    args = parser.parse_args(argv)

    ensure_dirs()
    args.reports_dir.mkdir(parents=True, exist_ok=True)

    bundle = DetectorBundle.load(args.models_dir)
    test = load_split("test", args.processed_dir)
    if args.rows < len(test):
        test = test.sample(n=args.rows, random_state=RANDOM_SEED)

    raw = to_matrix(test, bundle.features)
    truth = test["is_attack"].to_numpy()
    scaled = bundle.prepare(raw)
    print(f"Drawing curves from {len(test):,} flows, {int(truth.sum()):,} attacks")

    models = {}
    for name, detector in bundle.detectors.items():
        print(f"  {MODEL_LABELS[name]}")
        scores = detector.score(scaled)
        chosen = detector.threshold()
        models[name] = {
            "label": MODEL_LABELS[name],
            "kind": MODEL_KINDS[name],
            "roc_auc": float(roc_auc_score(truth, scores)),
            "pr_auc": float(average_precision_score(truth, scores)),
            "roc": roc_points(truth, scores),
            "precision_recall": precision_recall_points(truth, scores),
            "threshold_sweep": threshold_sweep(truth, scores, chosen),
            "score_histogram": score_histogram(scores, truth, chosen),
        }

    forest = bundle.detectors["random_forest"].model
    report = {
        "rows": int(len(test)),
        "attacks": int(truth.sum()),
        "models": models,
        "feature_distributions": feature_distributions(
            raw, truth, bundle.features, forest.feature_importances_
        ),
        "feature_importances": [
            {"feature": feature, "importance": float(value)}
            for feature, value in sorted(
                zip(bundle.features, forest.feature_importances_, strict=True),
                key=lambda pair: pair[1],
                reverse=True,
            )[:20]
        ],
    }

    path = args.reports_dir / "curves.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Written to {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
