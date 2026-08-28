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

# The eight CSV files of the CICIDS2017 "machine learning" release, one per
# capture session. Monday holds benign traffic only, the rest mix in attacks.
CICIDS2017_FILES = (
    "Monday-WorkingHours.pcap_ISCX.csv",
    "Tuesday-WorkingHours.pcap_ISCX.csv",
    "Wednesday-workingHours.pcap_ISCX.csv",
    "Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv",
    "Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv",
    "Friday-WorkingHours-Morning.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
)

# The original dataset is served by the University of New Brunswick behind a
# registration form, which cannot be scripted. This public mirror carries the
# same eight files, byte for byte, so the pipeline stays reproducible.
DATASET_MIRROR = "https://huggingface.co/datasets/c01dsnap/CIC-IDS2017/resolve/main"
DATASET_HOMEPAGE = "https://www.unb.ca/cic/datasets/ids-2017.html"

LABEL_COLUMN = "Label"
BENIGN_LABEL = "BENIGN"

RANDOM_SEED = 42


def ensure_dirs() -> None:
    """Create the working directories if they do not exist yet."""
    for path in (RAW_DIR, PROCESSED_DIR, MODELS_DIR, REPORTS_DIR):
        path.mkdir(parents=True, exist_ok=True)
