"""Draw the figures for the written report from the generated JSON reports.

Nothing here computes anything. Every number comes from a report that a command
already produced, so a figure in the PDF and a panel in the dashboard cannot
tell different stories.

    python -m ids.report.figures
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from ids.config import PROJECT_ROOT, REPORTS_DIR

# Keep the font cache next to the project rather than in the home directory on
# the system drive, which is where matplotlib puts it by default.
os.environ.setdefault("MPLCONFIGDIR", str(PROJECT_ROOT / ".cache" / "matplotlib"))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)

import matplotlib  # noqa: E402

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

# A print palette rather than the dashboard one: these end up on white paper
# and often on a black and white printer, so the three series are separated by
# line style as well as by colour.
COLOURS = {
    "random_forest": "#1f4e9c",
    "isolation_forest": "#0f8a6a",
    "autoencoder": "#8b3fa8",
    "benign": "#1f4e9c",
    "attack": "#c1442e",
    "accent": "#c1442e",
}
STYLES = {
    "random_forest": "-",
    "isolation_forest": "--",
    "autoencoder": "-.",
}
LABELS = {
    "random_forest": "Random Forest",
    "isolation_forest": "Isolation Forest",
    "autoencoder": "Autoencoder",
}

FIGURE_SIZE = (3.4, 2.3)
LARGE_FIGURE = (3.4, 3.2)


def style() -> None:
    plt.rcParams.update(
        {
            "figure.dpi": 200,
            "savefig.dpi": 200,
            "font.size": 7,
            "axes.titlesize": 8,
            "axes.labelsize": 7,
            "legend.fontsize": 6.5,
            "xtick.labelsize": 6.5,
            "ytick.labelsize": 6.5,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.alpha": 0.25,
            "grid.linewidth": 0.5,
            "legend.frameon": False,
            "figure.constrained_layout.use": True,
        }
    )


def load(reports_dir: Path, name: str) -> dict | None:
    path = reports_dir / f"{name}.json"
    if not path.exists():
        print(f"  skipping {name}, {path} is missing")
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save(figure, out_dir: Path, name: str) -> None:
    path = out_dir / f"{name}.pdf"
    figure.savefig(path, bbox_inches="tight")
    plt.close(figure)
    print(f"  wrote {path.name}")


def class_balance(dataset: dict, out_dir: Path) -> None:
    families = list(reversed(dataset["families"]))
    names = [row["family"] for row in families]
    counts = [row["flows"] for row in families]
    colours = [
        COLOURS["benign"] if name == "BENIGN" else COLOURS["attack"] for name in names
    ]

    figure, axes = plt.subplots(figsize=LARGE_FIGURE)
    axes.barh(names, counts, color=colours, height=0.7)
    axes.set_xscale("log")
    axes.set_xlabel("flows, logarithmic scale")
    axes.grid(axis="y", visible=False)
    save(figure, out_dir, "class-balance")


def session_mix(dataset: dict, out_dir: Path) -> None:
    sessions = list(reversed(dataset["sessions"]))
    names = [
        row["session"]
        .replace("-WorkingHours", "")
        .replace("-Afternoon", " pm")
        .replace("-Morning", " am")
        for row in sessions
    ]
    benign = np.array([row["benign"] for row in sessions])
    attacks = np.array([row["attacks"] for row in sessions])

    figure, axes = plt.subplots(figsize=FIGURE_SIZE)
    axes.barh(names, benign, color=COLOURS["benign"], height=0.7, label="benign")
    axes.barh(
        names,
        attacks,
        left=benign,
        color=COLOURS["attack"],
        height=0.7,
        label="attack",
    )
    axes.set_xlabel("flows")
    axes.grid(axis="y", visible=False)
    axes.legend(loc="lower right")
    save(figure, out_dir, "session-mix")


def feature_skew(dataset: dict, out_dir: Path) -> None:
    rows = list(reversed(dataset["skew"][:10]))
    figure, axes = plt.subplots(figsize=LARGE_FIGURE)
    axes.barh(
        [row["feature"] for row in rows],
        [row["max_over_p99"] for row in rows],
        color=COLOURS["accent"],
        height=0.7,
    )
    axes.set_xlabel("maximum divided by the 99th percentile")
    axes.grid(axis="y", visible=False)
    save(figure, out_dir, "feature-skew")


def forest_size(sweeps: dict, out_dir: Path) -> None:
    rows = sweeps["random_forest_trees"]
    trees = [row["n_estimators"] for row in rows]

    figure, axes = plt.subplots(figsize=FIGURE_SIZE)
    axes.plot(
        trees,
        [100 * row["recall"] for row in rows],
        color=COLOURS["random_forest"],
        marker="o",
        markersize=3,
        label="recall",
    )
    axes.set_xlabel("trees in the forest")
    axes.set_ylabel("recall (percent)")
    axes.set_ylim(99.0, 100.0)

    twin = axes.twinx()
    twin.plot(
        trees,
        [row["latency_ms"] for row in rows],
        color=COLOURS["accent"],
        linestyle="--",
        marker="s",
        markersize=3,
        label="latency",
    )
    twin.set_ylabel("milliseconds per flow")
    twin.grid(visible=False)

    handles = axes.get_lines() + twin.get_lines()
    axes.legend(
        handles, [line.get_label() for line in handles], loc="center right"
    )
    save(figure, out_dir, "forest-size")


def isolation_samples(sweeps: dict, out_dir: Path) -> None:
    rows = sweeps["isolation_forest_samples"]
    samples = [row["max_samples"] for row in rows]

    figure, axes = plt.subplots(figsize=FIGURE_SIZE)
    axes.plot(
        samples,
        [100 * row["recall"] for row in rows],
        color=COLOURS["isolation_forest"],
        marker="o",
        markersize=3,
        label="recall",
    )
    axes.plot(
        samples,
        [100 * row["roc_auc"] for row in rows],
        color=COLOURS["random_forest"],
        linestyle="--",
        marker="s",
        markersize=3,
        label="area under the ROC curve",
    )
    axes.set_xscale("log", base=2)
    axes.set_xlabel("samples each tree is fitted on")
    axes.set_ylabel("percent")
    axes.axvline(256, color="grey", linewidth=0.8, linestyle=":")
    axes.text(256, 30, " library default", fontsize=6, color="grey")
    axes.set_ylim(-5, 105)
    axes.legend(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=3, fontsize=6)
    save(figure, out_dir, "isolation-samples")


def learning_curve(sweeps: dict, out_dir: Path) -> None:
    rows = sweeps["autoencoder_learning_curve"]
    epochs = [row["epoch"] for row in rows]

    figure, axes = plt.subplots(figsize=FIGURE_SIZE)
    axes.plot(
        epochs,
        [row["loss"] for row in rows],
        color=COLOURS["autoencoder"],
        label="training loss",
    )
    axes.set_xlabel("epoch")
    axes.set_ylabel("reconstruction loss")

    twin = axes.twinx()
    twin.plot(
        epochs,
        [100 * row["roc_auc"] for row in rows],
        color=COLOURS["accent"],
        linestyle="--",
        label="area under the ROC curve",
    )
    twin.plot(
        epochs,
        [100 * row["recall"] for row in rows],
        color=COLOURS["isolation_forest"],
        linestyle="-.",
        label="recall",
    )
    twin.set_ylabel("percent")
    twin.grid(visible=False)

    best = max(rows, key=lambda row: row["roc_auc"])
    axes.axvline(best["epoch"], color="grey", linewidth=0.8, linestyle=":")

    handles = [
        line
        for line in axes.get_lines() + twin.get_lines()
        # Marker lines carry an automatic name and do not belong in a legend.
        if not line.get_label().startswith("_")
    ]
    axes.legend(
        handles,
        [line.get_label() for line in handles],
        loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=3, fontsize=6,
    )
    save(figure, out_dir, "learning-curve")


def roc_curves(curves: dict, out_dir: Path) -> None:
    figure, axes = plt.subplots(figsize=FIGURE_SIZE)
    for name, model in curves["models"].items():
        axes.plot(
            [point["fpr"] for point in model["roc"]],
            [point["tpr"] for point in model["roc"]],
            color=COLOURS[name],
            linestyle=STYLES[name],
            label=f"{LABELS[name]} ({model['roc_auc']:.3f})",
        )
    axes.plot([0, 1], [0, 1], color="grey", linewidth=0.7, linestyle=":")
    axes.set_xlabel("false positive rate")
    axes.set_ylabel("true positive rate")
    axes.legend(loc="lower right")
    save(figure, out_dir, "roc-curves")


def score_separation(curves: dict, out_dir: Path) -> None:
    model = curves["models"]["autoencoder"]
    histogram = model["score_histogram"]
    scores = [bin["score"] for bin in histogram["bins"]]

    figure, axes = plt.subplots(figsize=FIGURE_SIZE)
    axes.fill_between(
        scores,
        [100 * bin["benign"] for bin in histogram["bins"]],
        color=COLOURS["benign"],
        alpha=0.35,
        label="benign",
    )
    axes.fill_between(
        scores,
        [100 * bin["attack"] for bin in histogram["bins"]],
        color=COLOURS["attack"],
        alpha=0.35,
        label="attack",
    )
    axes.axvline(
        histogram["chosen_threshold"], color="black", linewidth=0.9, linestyle="--"
    )
    axes.set_xlabel("reconstruction error")
    axes.set_ylabel("share of flows (percent)")
    axes.legend(loc="upper right")
    save(figure, out_dir, "score-separation")


def per_family_recall(benchmark: dict, out_dir: Path) -> None:
    families = benchmark["models"]["random_forest"]["per_attack_recall"]
    order = sorted(families, key=lambda name: families[name]["support"], reverse=True)
    positions = np.arange(len(order))
    height = 0.26

    figure, axes = plt.subplots(figsize=LARGE_FIGURE)
    for index, name in enumerate(LABELS):
        recalls = [
            100 * benchmark["models"][name]["per_attack_recall"][family]["recall"]
            for family in order
        ]
        axes.barh(
            positions + (1 - index) * height,
            recalls,
            height=height,
            color=COLOURS[name],
            label=LABELS[name],
        )
    axes.set_yticks(positions)
    axes.set_yticklabels(
        [f"{name} ({families[name]['support']:,})" for name in order]
    )
    axes.invert_yaxis()
    axes.set_xlabel("recall (percent)")
    axes.set_xlim(0, 104)
    axes.grid(axis="y", visible=False)
    axes.legend(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=3, fontsize=6)
    save(figure, out_dir, "per-family-recall")


def novelty(report: dict, out_dir: Path) -> None:
    rows = [row for row in report["results"] if "recall_on_unseen" in row]
    order = [row["family"] for row in rows]
    positions = np.arange(len(order))
    height = 0.26

    figure, axes = plt.subplots(figsize=FIGURE_SIZE)
    for index, name in enumerate(LABELS):
        axes.barh(
            positions + (1 - index) * height,
            [100 * row["recall_on_unseen"][name] for row in rows],
            height=height,
            color=COLOURS[name],
            label=LABELS[name],
        )
    axes.set_yticks(positions)
    axes.set_yticklabels(order)
    axes.invert_yaxis()
    axes.set_xlabel("recall on the held out family (percent)")
    axes.set_xlim(0, 104)
    axes.grid(axis="y", visible=False)
    axes.legend(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=3, fontsize=6)
    save(figure, out_dir, "novelty")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    parser.add_argument(
        "--out", type=Path, default=PROJECT_ROOT / "report" / "figures"
    )
    args = parser.parse_args(argv)

    style()
    args.out.mkdir(parents=True, exist_ok=True)
    print(f"Drawing into {args.out}")

    dataset = load(args.reports_dir, "dataset")
    sweeps = load(args.reports_dir, "sweeps")
    curves = load(args.reports_dir, "curves")
    benchmark = load(args.reports_dir, "benchmark")
    unseen = load(args.reports_dir, "novelty")

    if dataset:
        class_balance(dataset, args.out)
        session_mix(dataset, args.out)
        feature_skew(dataset, args.out)
    if sweeps:
        forest_size(sweeps, args.out)
        isolation_samples(sweeps, args.out)
        learning_curve(sweeps, args.out)
    if curves:
        roc_curves(curves, args.out)
        score_separation(curves, args.out)
    if benchmark:
        per_family_recall(benchmark, args.out)
    if unseen:
        novelty(unseen, args.out)

    return 0


if __name__ == "__main__":
    sys.exit(main())
