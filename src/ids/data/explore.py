"""Describe what is actually inside the CICIDS2017 capture files.

Run this before reading any of the modelling code. It answers the questions
that decide how the rest of the pipeline is written: how large the dataset is,
how the attacks are spread across the week, which columns are useless, which
features are broken, and how skewed the numbers are.

    python -m ids.data.explore                  print the report
    python -m ids.data.explore --out reports/   also write it to a file

It reads the raw files, so it works before the preprocessing step has ever run.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from ids.config import (
    BENIGN_LABEL,
    CICIDS2017_FILES,
    LABEL_COLUMN,
    NON_FEATURE_COLUMNS,
    PROCESSED_DIR,
    RAW_DIR,
    REPORTS_DIR,
)
from ids.data.preprocess import (
    CONSTANT_COLUMNS,
    normalise_columns,
    normalise_label,
    parse_timestamps,
)


def section(out: io.StringIO, title: str) -> None:
    out.write(f"\n{title}\n{'-' * len(title)}\n")


def describe_sessions(
    out: io.StringIO, raw_dir: Path
) -> tuple[pd.DataFrame, list[dict]]:
    """One row per capture file: size, time span and attack content."""
    section(out, "Capture sessions")
    frames = []
    rows = []
    for name in CICIDS2017_FILES:
        path = raw_dir / name
        if not path.exists():
            raise FileNotFoundError(
                f"{path} is missing, run: python -m ids.data.download"
            )
        frame = normalise_columns(pd.read_parquet(path))
        frame["capture_session"] = name.split(".")[0]

        # Rows where every single column is empty. They are padding, not
        # traffic, and counting them as flows would skew everything below.
        empty = frame.drop(columns=["capture_session"]).isna().all(axis=1)

        frame[LABEL_COLUMN] = frame[LABEL_COLUMN].astype(str).map(normalise_label)
        timestamps = parse_timestamps(frame["Timestamp"])
        real = ~empty
        attacks = real & (frame[LABEL_COLUMN] != BENIGN_LABEL)

        rows.append(
            {
                "session": name.split(".")[0],
                "flows": int(real.sum()),
                "empty": int(empty.sum()),
                "attacks": int(attacks.sum()),
                "attack_share": attacks.sum() / max(int(real.sum()), 1),
                "from": str(timestamps.min()),
                "to": str(timestamps.max()),
                "families": ", ".join(
                    sorted(frame.loc[attacks, LABEL_COLUMN].unique())
                )
                or "none",
            }
        )
        frames.append(frame)

    for row in rows:
        out.write(f"{row['session']}\n")
        out.write(
            f"  {row['flows']:>9,} flows, {row['attacks']:>8,} attacks"
            f" ({row['attack_share']:6.2%})\n"
        )
        out.write(f"  {row['from']} to {row['to']}\n")
        out.write(f"  attacks: {row['families']}\n")
        if row["empty"]:
            out.write(
                f"  plus {row['empty']:,} rows where every column is empty,"
                " which are padding rather than traffic\n"
            )

    total_empty = sum(row["empty"] for row in rows)
    if total_empty:
        out.write(
            f"\n{total_empty:,} empty rows in total. They carry no label, so a"
            " naive reading counts them\nas attacks. Preprocessing drops them"
            " along with every other row that has a missing feature.\n"
        )

    return pd.concat(frames, ignore_index=True), rows


def describe_labels(out: io.StringIO, frame: pd.DataFrame) -> None:
    section(out, "Attack families")
    labelled = frame[frame[LABEL_COLUMN] != "None"]
    counts = labelled[LABEL_COLUMN].value_counts()
    total = len(labelled)
    out.write(f"Counted over {total:,} rows that carry a label.\n\n")
    out.write(f"{'family':<28}{'flows':>11}{'share':>10}\n")
    for label, count in counts.items():
        out.write(f"{label:<28}{count:>11,}{count / total:>10.4%}\n")
    out.write(
        f"\nThe rarest family has {counts.min():,} flows and the largest has"
        f" {counts.max():,}. That gap is the reason accuracy means nothing here\n"
        "and why the benchmark reports recall per family.\n"
    )


def describe_columns(out: io.StringIO, frame: pd.DataFrame) -> None:
    section(out, "Columns")
    feature_columns = [
        column
        for column in frame.columns
        if column not in NON_FEATURE_COLUMNS
        and column not in (LABEL_COLUMN, "capture_session")
    ]
    out.write(f"{len(frame.columns)} columns in the raw files.\n")
    out.write(f"  {len(NON_FEATURE_COLUMNS)} identity columns kept out of the models:\n")
    out.write(f"    {', '.join(NON_FEATURE_COLUMNS)}\n")
    out.write(f"  {len(feature_columns)} numeric columns before pruning.\n")

    numeric = frame[feature_columns].apply(pd.to_numeric, errors="coerce")

    constant = [c for c in feature_columns if numeric[c].nunique(dropna=True) <= 1]
    out.write(f"\nColumns with a single value across the whole dataset ({len(constant)}):\n")
    for column in constant:
        out.write(f"    {column}\n")
    out.write("These are dropped in preprocessing, they carry no signal.\n")

    unexpected = sorted(set(constant) - set(CONSTANT_COLUMNS))
    if unexpected:
        out.write(f"\nNot on the hard coded drop list: {', '.join(unexpected)}\n")


def describe_broken_values(out: io.StringIO, frame: pd.DataFrame) -> None:
    section(out, "Values that need cleaning")
    feature_columns = [
        column
        for column in frame.columns
        if column not in NON_FEATURE_COLUMNS
        and column not in (LABEL_COLUMN, "capture_session")
    ]
    numeric = frame[feature_columns].apply(pd.to_numeric, errors="coerce")

    # The padding rows are empty everywhere, so they would swamp this section.
    # Look at the rows that actually hold traffic.
    padding = numeric.isna().all(axis=1)
    real = numeric[~padding]
    out.write(
        f"{int(padding.sum()):,} rows are empty across every feature and are"
        f" set aside here.\nThe counts below are over the remaining"
        f" {len(real):,} rows.\n\n"
    )

    infinite = np.isinf(real.to_numpy(dtype=np.float64, na_value=np.nan))
    infinite_per_column = pd.Series(infinite.sum(axis=0), index=feature_columns)
    infinite_per_column = infinite_per_column[infinite_per_column > 0]

    out.write("Infinite values, which appear when a flow lasts zero microseconds:\n")
    if infinite_per_column.empty:
        out.write("    none\n")
    for column, count in infinite_per_column.items():
        out.write(f"    {column:<26}{count:>9,}\n")

    missing = real.isna().sum()
    missing = missing[missing > 0]
    out.write("\nMissing or unparseable values:\n")
    if missing.empty:
        out.write("    none\n")
    for column, count in missing.items():
        out.write(f"    {column:<26}{count:>9,}\n")

    negative_duration = int((real["Flow Duration"] < 0).sum())
    out.write(f"\nFlows with a negative duration: {negative_duration:,}\n")

    repeated_headers = int((frame[LABEL_COLUMN] == LABEL_COLUMN).sum())
    out.write(f"Header rows repeated inside the data: {repeated_headers:,}\n")


def describe_skew(out: io.StringIO, frame: pd.DataFrame, top: int = 12) -> None:
    section(out, "How skewed the features are")
    feature_columns = [
        column
        for column in frame.columns
        if column not in NON_FEATURE_COLUMNS
        and column not in (LABEL_COLUMN, "capture_session")
    ]
    numeric = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    numeric = numeric.replace([np.inf, -np.inf], np.nan)

    stats = pd.DataFrame(
        {
            "median": numeric.median(),
            "p99": numeric.quantile(0.99),
            "max": numeric.max(),
        }
    )
    # How far the worst outlier sits above the bulk of the data.
    stats["max_over_p99"] = stats["max"] / stats["p99"].replace(0, np.nan)
    worst = stats.sort_values("max_over_p99", ascending=False).head(top)

    out.write(f"{'feature':<28}{'median':>14}{'p99':>16}{'max':>18}{'max/p99':>12}\n")
    for column, row in worst.iterrows():
        ratio = row["max_over_p99"]
        out.write(
            f"{column:<28}{row['median']:>14,.2f}{row['p99']:>16,.2f}"
            f"{row['max']:>18,.2f}{ratio:>12,.0f}\n"
        )
    out.write(
        "\nA maximum thousands of times above the 99th percentile is why plain\n"
        "standardisation fails here: a handful of flows would set the scale for\n"
        "every feature. The pipeline compresses with a signed logarithm first.\n"
    )


def describe_addresses(out: io.StringIO, frame: pd.DataFrame, top: int = 8) -> None:
    section(out, "Who talks to whom")
    attacks = frame[frame[LABEL_COLUMN] != BENIGN_LABEL]
    out.write("Busiest attack sources:\n")
    for ip, count in attacks["Source IP"].value_counts().head(top).items():
        families = ", ".join(
            sorted(attacks.loc[attacks["Source IP"] == ip, LABEL_COLUMN].unique())[:4]
        )
        out.write(f"    {ip:<18}{count:>9,}  {families}\n")

    out.write("\nBusiest attack targets:\n")
    for ip, count in attacks["Destination IP"].value_counts().head(top).items():
        out.write(f"    {ip:<18}{count:>9,}\n")

    out.write(
        "\nThe capture runs on a private test bed, so nearly every address is in\n"
        "private space. Only the few public ones are worth sending to a threat\n"
        "intelligence service, which is what keeps the free tiers usable.\n"
    )


def build_summary(
    frame: pd.DataFrame, sessions: list[dict], processed_dir: Path
) -> dict:
    """The same picture as the text report, shaped for the dashboard to draw.

    The text version is for reading in a terminal before touching the code.
    This one feeds the charts, so nobody has to take the shape of the data on
    trust from a paragraph.
    """
    labelled = frame[frame[LABEL_COLUMN] != "None"]
    counts = labelled[LABEL_COLUMN].value_counts()

    feature_columns = [
        column
        for column in frame.columns
        if column not in NON_FEATURE_COLUMNS
        and column not in (LABEL_COLUMN, "capture_session")
    ]
    numeric = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    # Count the infinities before they are turned into gaps, otherwise the
    # cleaning summary reports none of the values it exists to describe.
    infinite_values = int(
        np.isinf(numeric.to_numpy(dtype=np.float64, na_value=np.nan)).sum()
    )
    numeric = numeric.replace([np.inf, -np.inf], np.nan)
    real = numeric[~numeric.isna().all(axis=1)]

    median = real.median()
    p99 = real.quantile(0.99)
    maximum = real.max()
    ratio = (maximum / p99.replace(0, np.nan)).sort_values(ascending=False)

    splits = {}
    for name in ("train", "test", "replay"):
        path = processed_dir / f"{name}.parquet"
        if not path.exists():
            continue
        part = pd.read_parquet(path, columns=["is_attack"])
        splits[name] = {
            "rows": int(len(part)),
            "attacks": int(part["is_attack"].sum()),
        }

    attacks = labelled[labelled[LABEL_COLUMN] != BENIGN_LABEL]
    return {
        "total_flows": int(len(frame)),
        "labelled_flows": int(len(labelled)),
        "padding_rows": int(len(frame) - len(labelled)),
        "sessions": [
            {
                "session": row["session"],
                "flows": row["flows"],
                "attacks": row["attacks"],
                "benign": row["flows"] - row["attacks"],
                "attack_share": row["attack_share"],
                "families": row["families"],
            }
            for row in sessions
        ],
        "families": [
            {
                "family": str(label),
                "flows": int(count),
                "share": float(count / len(labelled)),
            }
            for label, count in counts.items()
        ],
        "splits": splits,
        "skew": [
            {
                "feature": str(column),
                "median": float(median[column]),
                "p99": float(p99[column]),
                "max": float(maximum[column]),
                "max_over_p99": float(ratio[column]),
            }
            for column in ratio.head(12).index
            if np.isfinite(ratio[column])
        ],
        "top_attack_sources": [
            {"ip": str(ip), "flows": int(count)}
            for ip, count in attacks["Source IP"].value_counts().head(8).items()
        ],
        "cleaning": {
            "infinite_values": infinite_values,
            "negative_durations": int((real["Flow Duration"] < 0).sum()),
            "constant_columns": [
                c for c in feature_columns if numeric[c].nunique(dropna=True) <= 1
            ],
            "feature_columns_before_pruning": len(feature_columns),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--processed-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="also write the report to this directory as dataset-overview.txt",
    )
    args = parser.parse_args(argv)

    out = io.StringIO()
    out.write("CICIDS2017 dataset overview\n")
    out.write("===========================\n")

    frame, sessions = describe_sessions(out, args.raw_dir)
    out.write(f"\nCombined: {len(frame):,} flows, {len(frame.columns)} columns\n")

    describe_labels(out, frame)
    describe_columns(out, frame)
    describe_broken_values(out, frame)
    describe_skew(out, frame)
    describe_addresses(out, frame)

    report = out.getvalue()
    print(report)

    if args.out is not None:
        args.out.mkdir(parents=True, exist_ok=True)
        path = args.out / "dataset-overview.txt"
        path.write_text(report, encoding="utf-8")

        summary = build_summary(frame, sessions, args.processed_dir)
        json_path = args.out / "dataset.json"
        json_path.write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Written to {path} and {json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
