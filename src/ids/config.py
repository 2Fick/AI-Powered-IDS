"""Central paths and constants.

Every path is derived from the repository root so the whole project, including
the dataset and the trained models, stays on the drive where the repo lives.
"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = Path(os.getenv("IDS_DATA_DIR", PROJECT_ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODELS_DIR = Path(os.getenv("IDS_MODELS_DIR", PROJECT_ROOT / "models"))
REPORTS_DIR = Path(os.getenv("IDS_REPORTS_DIR", PROJECT_ROOT / "reports"))

# The eight capture sessions of CICIDS2017, one file each. Monday holds benign
# traffic only, the other four days mix in attacks.
CICIDS2017_SESSIONS = (
    "Monday-WorkingHours",
    "Tuesday-WorkingHours",
    "Wednesday-workingHours",
    "Thursday-WorkingHours-Morning-WebAttacks",
    "Thursday-WorkingHours-Afternoon-Infilteration",
    "Friday-WorkingHours-Morning",
    "Friday-WorkingHours-Afternoon-PortScan",
    "Friday-WorkingHours-Afternoon-DDos",
)

CICIDS2017_FILES = tuple(
    f"{session}.pcap_ISCX.csv.parquet" for session in CICIDS2017_SESSIONS
)

# The University of New Brunswick serves the dataset behind a registration form
# that cannot be scripted, so the files come from a public mirror instead.
#
# Two releases exist. The widely used "machine learning" CSVs keep the 78 flow
# features and the label but strip the addresses. The labelled flow release
# used here keeps the same features and adds the flow identity: source and
# destination IP, ports, protocol and timestamp. The addresses are what make
# the threat intelligence lookups real rather than decorative, and the
# timestamps are what let the dashboard replay a capture in the order it
# actually happened.
DATASET_MIRROR = "https://huggingface.co/datasets/bvsam/cic-ids-2017/resolve/main/traffic_labels"
DATASET_HOMEPAGE = "https://www.unb.ca/cic/datasets/ids-2017.html"

# Flow identity columns, carried through the pipeline so alerts can name who
# talked to whom and when.
IDENTITY_COLUMNS = (
    "Flow ID",
    "Source IP",
    "Source Port",
    "Destination IP",
    "Destination Port",
    "Protocol",
    "Timestamp",
)

# Identity columns that are kept out of the model input. Destination Port is
# the one exception: it is part of the standard feature set of the machine
# learning release and it genuinely carries signal, so it stays a feature.
NON_FEATURE_COLUMNS = (
    "Flow ID",
    "Source IP",
    "Source Port",
    "Destination IP",
    "Protocol",
    "Timestamp",
)

LABEL_COLUMN = "Label"
BENIGN_LABEL = "BENIGN"

RANDOM_SEED = 42


def ensure_dirs() -> None:
    """Create the working directories if they do not exist yet."""
    for path in (RAW_DIR, PROCESSED_DIR, MODELS_DIR, REPORTS_DIR):
        path.mkdir(parents=True, exist_ok=True)
