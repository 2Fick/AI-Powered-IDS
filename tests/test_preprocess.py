import numpy as np
import pandas as pd

from ids.data.preprocess import (
    add_labels,
    clean,
    normalise_columns,
    normalise_label,
    parse_timestamps,
)


def test_normalise_label_strips_the_code_page_dash():
    assert normalise_label("Web Attack \x96 Brute Force") == "Web Attack Brute Force"
    assert normalise_label("  DoS Hulk  ") == "DoS Hulk"


def test_normalise_columns_drops_the_duplicated_header():
    frame = pd.DataFrame(
        {" Fwd Header Length": [1], "Fwd Header Length.1": [1], " Label": ["BENIGN"]}
    )
    result = normalise_columns(frame)
    assert list(result.columns) == ["Fwd Header Length", "Label"]


def test_timestamps_without_a_meridiem_marker_land_in_the_afternoon():
    values = pd.Series(["5/7/2017 09:15", "5/7/2017 02:30"])
    parsed = parse_timestamps(values)
    assert parsed.iloc[0].hour == 9
    # 02:30 cannot be the middle of the night in a nine to five capture.
    assert parsed.iloc[1].hour == 14


def _sample_frame():
    return pd.DataFrame(
        {
            "Flow ID": ["a", "b", "c", "d"],
            "Source IP": ["192.168.10.5", "205.174.165.73", "192.168.10.9", "x"],
            "Source Port": [1234, 4444, 80, 1],
            "Destination IP": ["192.168.10.50"] * 4,
            "Destination Port": [80, 22, 443, 80],
            "Protocol": [6, 6, 6, 6],
            "Timestamp": ["5/7/2017 09:15"] * 4,
            "Flow Duration": [100, 0, -5, 200],
            "Flow Bytes/s": [10.0, np.inf, 5.0, 7.0],
            "Bwd PSH Flags": [0, 0, 0, 0],
            "Label": ["BENIGN", "DoS Hulk", "BENIGN", "Label"],
        }
    )


def test_clean_removes_infinities_negative_durations_and_repeated_headers():
    result = clean(_sample_frame())
    assert len(result) == 1
    assert result["Flow Duration"].iloc[0] == 100


def test_clean_drops_constant_columns_but_keeps_flow_identity():
    result = clean(_sample_frame())
    assert "Bwd PSH Flags" not in result.columns
    assert "Source IP" in result.columns
    assert "Destination Port" in result.columns


def test_add_labels_splits_benign_from_attacks():
    frame = pd.DataFrame({"Label": ["BENIGN", "DoS Hulk", "PortScan"]})
    result = add_labels(frame)
    assert list(result["is_attack"]) == [0, 1, 1]
    assert list(result["attack_type"]) == ["BENIGN", "DoS Hulk", "PortScan"]
    assert "Label" not in result.columns
