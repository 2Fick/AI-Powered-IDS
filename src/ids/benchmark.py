"""Evaluate the three detectors on the held out test split.

Accuracy alone is meaningless here: roughly four flows out of five are benign,
so a model that never raises an alert already scores above 80 percent. The
numbers that matter for an intrusion detection system are how many attacks it
catches (recall), how much benign traffic it wrongly flags (false positive
rate) and how long a single decision takes.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    roc_auc_score,
)

from ids.config import MODELS_DIR, PROCESSED_DIR, REPORTS_DIR, ensure_dirs
from ids.dataset import load_split, to_matrix
from ids.detectors import MODEL_KINDS, MODEL_LABELS, DetectorBundle


def single_flow_latency(
    bundle: DetectorBundle, name: str, raw_features: np.ndarray, samples: int
) -> dict[str, float]:
    """Time one flow at a time, the way the streaming endpoint sees traffic."""
    detector = bundle.detectors[name]
    rows = raw_features[:samples]
    timings = []
    for row in rows:
        single = row.reshape(1, -1)
        started = time.perf_counter()
        scaled = bundle.prepare(single)
        detector.score(scaled)
        timings.append((time.perf_counter() - started) * 1000.0)
    values = np.array(timings)
    return {
        "p50_ms": float(np.percentile(values, 50)),
        "p95_ms": float(np.percentile(values, 95)),
        "mean_ms": float(values.mean()),
        "samples": int(len(values)),
    }


def per_attack_recall(
    attack_types: np.ndarray, predictions: np.ndarray
) -> dict[str, dict[str, float]]:
    result = {}
    for label in sorted(set(attack_types.tolist())):
        if label == "BENIGN":
            continue
        mask = attack_types == label
        caught = int(predictions[mask].sum())
        total = int(mask.sum())
        result[label] = {
            "support": total,
            "detected": caught,
            "recall": caught / total if total else 0.0,
        }
    return result


def evaluate(bundle: DetectorBundle, test, latency_samples: int) -> dict:
    raw = to_matrix(test, bundle.features)
    truth = test["is_attack"].to_numpy()
    attack_types = test["attack_type"].to_numpy()

    print(f"Test split: {len(test):,} rows, {int(truth.sum()):,} attacks")

    scaled = bundle.prepare(raw)
    results = {}

    for name, detector in bundle.detectors.items():
        print(f"Scoring with the {MODEL_LABELS[name].lower()}")
        started = time.perf_counter()
        scores = detector.score(scaled)
        batch_seconds = time.perf_counter() - started
        predictions = (scores >= detector.threshold()).astype(np.int8)

        matrix = confusion_matrix(truth, predictions, labels=[0, 1])
        true_negative, false_positive, false_negative, true_positive = matrix.ravel()

        recall = true_positive / max(true_positive + false_negative, 1)
        false_positive_rate = false_positive / max(false_positive + true_negative, 1)
        precision = true_positive / max(true_positive + false_positive, 1)
        f1 = 2 * precision * recall / max(precision + recall, 1e-12)

        results[name] = {
            "label": MODEL_LABELS[name],
            "kind": MODEL_KINDS[name],
            "threshold": float(detector.threshold()),
            "recall": float(recall),
            "false_positive_rate": float(false_positive_rate),
            "precision": float(precision),
            "f1": float(f1),
            "accuracy": float((true_positive + true_negative) / len(truth)),
            "roc_auc": float(roc_auc_score(truth, scores)),
            "pr_auc": float(average_precision_score(truth, scores)),
            "confusion": {
                "true_negative": int(true_negative),
                "false_positive": int(false_positive),
                "false_negative": int(false_negative),
                "true_positive": int(true_positive),
            },
            "batch_latency_ms_per_flow": 1000.0 * batch_seconds / len(truth),
            "batch_seconds": batch_seconds,
            "single_flow_latency": single_flow_latency(
                bundle, name, raw, latency_samples
            ),
            "per_attack_recall": per_attack_recall(attack_types, predictions),
        }

    return results


def to_markdown(results: dict) -> str:
    lines = [
        "| Model | Type | Recall | False positive rate | Precision | F1 | ROC AUC |"
        " Latency per flow |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for name, row in results.items():
        lines.append(
            f"| {row['label']} | {row['kind']} | {row['recall']:.3f} |"
            f" {row['false_positive_rate']:.4f} | {row['precision']:.3f} |"
            f" {row['f1']:.3f} | {row['roc_auc']:.3f} |"
            f" {row['single_flow_latency']['p50_ms']:.2f} ms |"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--models-dir", type=Path, default=MODELS_DIR)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument("--latency-samples", type=int, default=300)
    args = parser.parse_args(argv)

    ensure_dirs()
    args.reports_dir.mkdir(parents=True, exist_ok=True)

    bundle = DetectorBundle.load(args.models_dir)
    test = load_split("test", args.processed_dir)
    results = evaluate(bundle, test, args.latency_samples)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "test_rows": int(len(test)),
        "test_attacks": int(test["is_attack"].sum()),
        "target_fpr": bundle.metadata.get("target_fpr"),
        "machine": {
            "platform": platform.platform(),
            "processor": platform.processor(),
            "python": platform.python_version(),
        },
        "models": results,
    }

    json_path = args.reports_dir / "benchmark.json"
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    table = to_markdown(results)
    markdown_path = args.reports_dir / "benchmark.md"
    markdown_path.write_text(
        "# Model comparison on the CICIDS2017 test split\n\n"
        f"Generated {report['generated_at']} on {report['test_rows']:,} flows,"
        f" {report['test_attacks']:,} of them attacks.\n\n"
        f"{table}\n",
        encoding="utf-8",
    )

    print()
    print(table)
    print()
    print(f"Wrote {json_path} and {markdown_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
