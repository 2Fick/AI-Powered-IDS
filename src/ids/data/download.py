"""Download the CICIDS2017 CSV files into the project data directory.

The dataset home page at the University of New Brunswick is behind a
registration form, so the files are pulled from a public mirror that hosts the
exact same eight CSV files. Downloads resume if they are interrupted.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

from ids.config import (
    CICIDS2017_FILES,
    DATASET_HOMEPAGE,
    DATASET_MIRROR,
    RAW_DIR,
    ensure_dirs,
)

CHUNK_SIZE = 1024 * 1024


def remote_size(client: httpx.Client, url: str) -> int:
    """Return the size the server reports for a file, or 0 if it does not say."""
    response = client.head(url, follow_redirects=True)
    response.raise_for_status()
    return int(response.headers.get("content-length", 0))


def download_file(client: httpx.Client, name: str, target_dir: Path) -> Path:
    url = f"{DATASET_MIRROR}/{name}"
    destination = target_dir / name
    expected = remote_size(client, url)
    already = destination.stat().st_size if destination.exists() else 0

    if expected and already == expected:
        print(f"  {name}: already complete ({already / 1e6:.0f} MB)")
        return destination

    headers = {}
    mode = "wb"
    if already and expected and already < expected:
        headers["Range"] = f"bytes={already}-"
        mode = "ab"
        print(f"  {name}: resuming at {already / 1e6:.0f} MB")

    downloaded = already if mode == "ab" else 0
    with client.stream("GET", url, headers=headers, follow_redirects=True) as response:
        response.raise_for_status()
        with open(destination, mode) as handle:
            for chunk in response.iter_bytes(CHUNK_SIZE):
                handle.write(chunk)
                downloaded += len(chunk)
                if expected:
                    percent = 100 * downloaded / expected
                    print(
                        f"\r  {name}: {downloaded / 1e6:7.0f} / {expected / 1e6:.0f} MB"
                        f" ({percent:5.1f}%)",
                        end="",
                        flush=True,
                    )
    print()

    final = destination.stat().st_size
    if expected and final != expected:
        raise RuntimeError(
            f"{name} is {final} bytes but the server announced {expected}"
        )
    return destination


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=RAW_DIR,
        help="directory the CSV files are written to (default: data/raw)",
    )
    args = parser.parse_args(argv)

    ensure_dirs()
    args.out.mkdir(parents=True, exist_ok=True)

    print(f"Dataset home page: {DATASET_HOMEPAGE}")
    print(f"Downloading {len(CICIDS2017_FILES)} files into {args.out}")

    timeout = httpx.Timeout(30.0, read=300.0)
    with httpx.Client(timeout=timeout) as client:
        for name in CICIDS2017_FILES:
            download_file(client, name, args.out)

    total = sum(path.stat().st_size for path in args.out.glob("*.csv"))
    print(f"Done. {total / 1e9:.2f} GB in {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
