"""
Fetch FRED-MD target indicators and produce target data files for the
Macro Forecast Hub.

Uses the FRED API (via fredapi) to download individual series. This is more
reliable than scraping the FRED-MD CSV, which is behind bot protection.

To obtain a free API key, register at:
    https://fred.stlouisfed.org/docs/api/api_key.html

Set the key via the FRED_API_KEY environment variable or pass --api-key.

Reference:
    McCracken, M.W. and Ng, S. (2016), "FRED-MD: A Monthly Database for
    Macroeconomic Research," Journal of Business & Economic Statistics.
"""

import argparse
import csv
import os
from datetime import datetime
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fredapi import Fred

# Load .env from project root (two levels up from this script)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Target indicators tracked by the Macro Forecast Hub
TARGET_INDICATORS = [
    "INDPRO",
    "UNRATE",
    "PAYEMS",
    "CPIAUCSL",
    "PCEPI",
    "FEDFUNDS",
    "GS10",
    "TB3MS",
    "HOUST",
    "M2SL",
    "DPCERA3M086SBEA",
    "RETAILx",
]

# FRED-MD transformation codes for each series
# 1=level, 2=Δ, 3=Δ², 4=log, 5=Δlog, 6=Δ²log, 7=%Δ
TRANSFORM_CODES = {
    "INDPRO": 5,
    "UNRATE": 2,
    "PAYEMS": 5,
    "CPIAUCSL": 6,
    "PCEPI": 6,
    "FEDFUNDS": 2,
    "GS10": 2,
    "TB3MS": 2,
    "HOUST": 4,
    "M2SL": 6,
    "DPCERA3M086SBEA": 5,
    "RETAILx": 5,
}

SCRIPT_DIR = Path(__file__).resolve().parent


def download_series(fred: Fred, indicators: list[str]) -> pd.DataFrame:
    """Download all target series from FRED and return a combined DataFrame."""
    records = []

    for series_id in indicators:
        # RETAILx is a constructed series in FRED-MD; map to the FRED id
        fred_id = "RSAFS" if series_id == "RETAILx" else series_id

        print(f"  Fetching {series_id} (FRED: {fred_id}) ...")
        try:
            s = fred.get_series(fred_id)
        except Exception as e:
            print(f"  Warning: could not fetch {fred_id}: {e}")
            continue

        for date, value in s.items():
            if pd.isna(value):
                continue
            ts = pd.Timestamp(date)
            target_end_date = ts.to_period("M").to_timestamp("M")
            records.append({
                "target": series_id,
                "location": "US",
                "truth_date": target_end_date.strftime("%Y-%m-%d"),
                "year_month": ts.strftime("%Y-%m"),
                "value": round(float(value), 4),
            })

    return pd.DataFrame(records)


def save_target_data(target_df: pd.DataFrame, output_dir: Path, snapshot: bool = True):
    """Save target data as latest and optionally as a dated snapshot."""
    output_dir.mkdir(parents=True, exist_ok=True)

    latest_path = output_dir / "latest-target_values.csv"
    target_df.to_csv(latest_path, index=False)
    print(f"Saved latest target data to {latest_path} ({len(target_df)} rows)")

    if snapshot:
        snapshot_dir = output_dir / "snapshots"
        snapshot_dir.mkdir(exist_ok=True)
        today = datetime.now().strftime("%Y-%m-%d")
        snapshot_path = snapshot_dir / f"{today}-target_values.csv"
        target_df.to_csv(snapshot_path, index=False)
        print(f"Saved snapshot to {snapshot_path}")


def save_transform_codes(output_dir: Path):
    """Save the FRED-MD transformation codes for reference."""
    codes_path = output_dir / "transform_codes.csv"
    with open(codes_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["series_id", "transform_code"])
        for series_id in TARGET_INDICATORS:
            writer.writerow([series_id, TRANSFORM_CODES.get(series_id, "")])
    print(f"Saved transform codes to {codes_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch FRED-MD indicators and produce hub target data files."
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(SCRIPT_DIR),
        help="Output directory for target data files (default: target-data/)",
    )
    parser.add_argument(
        "--no-snapshot",
        action="store_true",
        help="Skip saving a dated snapshot file",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=None,
        help="FRED API key (or set FRED_API_KEY env var)",
    )
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("FRED_API_KEY")
    if not api_key:
        print(
            "Error: FRED API key required.\n"
            "  Get a free key at: https://fred.stlouisfed.org/docs/api/api_key.html\n"
            "  Then either:\n"
            "    export FRED_API_KEY=your_key_here\n"
            "    python fetch_fred_md.py --api-key your_key_here"
        )
        raise SystemExit(1)

    fred = Fred(api_key=api_key)
    output_dir = Path(args.output_dir)

    print(f"Downloading {len(TARGET_INDICATORS)} series from FRED API ...")
    target_df = download_series(fred, TARGET_INDICATORS)
    print(f"Downloaded {len(target_df)} total observations")

    save_target_data(target_df, output_dir, snapshot=not args.no_snapshot)
    save_transform_codes(output_dir)


if __name__ == "__main__":
    main()
