"""
Fetch FRED-MD target indicators and produce target data files for the
Macro Forecast Hub.

Incremental: reads existing local data and only queries the FRED API for
observations newer than what we already have. On first run, downloads the
full history.

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
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import urlopen

import pandas as pd
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
FRED_MD_PAGE = "https://www.stlouisfed.org/research/economists/mccracken/fred-databases"


def fetch_fred_panel(output_dir: Path):
    """Download the full current vintage, with the original transformation row."""
    # The old static current.csv URL can serve a stale vintage; follow the published link.
    with urlopen(FRED_MD_PAGE, timeout=60) as response:
        page = response.read().decode("utf-8")
    match = re.search(r'<a\s+href="([^"]*/fred-md/monthly/[^"]+\.csv)"[^>]*>current\.csv</a>', page)
    if match is None:
        raise ValueError("Could not find the current monthly FRED-MD download")
    url = urljoin(FRED_MD_PAGE, match[1])
    with urlopen(url, timeout=60) as response:
        data = response.read()
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "latest-fred-md.csv"
    temporary = path.with_suffix(".csv.tmp")
    temporary.write_bytes(data)
    from src.models.foundation import load_fred_panel
    truth, codes = load_fred_panel(temporary)
    temporary.replace(path)
    print(f"Saved full FRED-MD panel: {len(codes)} variables through {truth.truth_date.max():%Y-%m} ({url})")


def load_existing(output_dir: Path) -> pd.DataFrame:
    """Load existing target data if available."""
    latest_path = output_dir / "latest-target_values.csv"
    if latest_path.exists():
        df = pd.read_csv(latest_path)
        if not df.empty:
            return df
    return pd.DataFrame(columns=["target", "location", "truth_date", "year_month", "value"])


def get_latest_dates(existing_df: pd.DataFrame) -> dict[str, str]:
    """Return the latest truth_date per target series from existing data."""
    if existing_df.empty:
        return {}
    return (
        existing_df.groupby("target")["truth_date"]
        .max()
        .to_dict()
    )


def fetch_new_observations(
    fred, indicators: list[str], latest_dates: dict[str, str]
) -> pd.DataFrame:
    """Query FRED API only for observations after what we already have."""
    records = []
    skipped = 0

    for series_id in indicators:
        fred_id = "RSAFS" if series_id == "RETAILx" else series_id
        last_date = latest_dates.get(series_id)

        if last_date is not None:
            # Start one day after the last date we have
            obs_start = (pd.Timestamp(last_date) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
            print(f"  {series_id}: fetching after {last_date} ...", end=" ")
        else:
            obs_start = None
            print(f"  {series_id}: fetching full history ...", end=" ")

        try:
            s = fred.get_series(fred_id, observation_start=obs_start)
        except Exception as e:
            print(f"error: {e}")
            continue

        if s is None or s.empty:
            print("no new data")
            skipped += 1
            continue

        count = 0
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
            count += 1

        print(f"{count} new obs")

    if skipped == len(indicators):
        print("All series up to date — no API calls needed.")

    return pd.DataFrame(records)


def merge_data(existing_df: pd.DataFrame, new_df: pd.DataFrame) -> pd.DataFrame:
    """Merge new observations into existing data, updating any revised values."""
    if new_df.empty:
        return existing_df
    if existing_df.empty:
        return new_df

    combined = pd.concat([existing_df, new_df], ignore_index=True)
    # Keep the latest value for each (target, truth_date) — handles revisions
    combined = combined.drop_duplicates(
        subset=["target", "truth_date"], keep="last"
    )
    combined = combined.sort_values(["target", "truth_date"]).reset_index(drop=True)
    return combined


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
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force full re-download (ignore existing data)",
    )
    parser.add_argument("--panel-only", action="store_true", help="Download the full FRED-MD panel without the FRED API")
    args = parser.parse_args()

    # Make imports from the hub available when this file is executed directly.
    import sys
    sys.path.insert(0, str(SCRIPT_DIR.parent))
    output_dir = Path(args.output_dir)
    fetch_fred_panel(output_dir)
    if args.panel_only:
        return

    from dotenv import load_dotenv
    from fredapi import Fred
    load_dotenv(SCRIPT_DIR.parent / ".env")

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

    # Load existing data
    if args.full:
        existing_df = pd.DataFrame()
        latest_dates = {}
        print("Full download requested.")
    else:
        existing_df = load_existing(output_dir)
        latest_dates = get_latest_dates(existing_df)
        if latest_dates:
            print(f"Found existing data for {len(latest_dates)} series.")
        else:
            print("No existing data found — downloading full history.")

    # Fetch only new observations
    new_df = fetch_new_observations(fred, TARGET_INDICATORS, latest_dates)

    # Merge and save
    target_df = merge_data(existing_df, new_df)
    save_target_data(target_df, output_dir, snapshot=not args.no_snapshot)
    save_transform_codes(output_dir)


if __name__ == "__main__":
    main()
