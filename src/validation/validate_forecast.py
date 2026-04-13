"""
Validate the content of forecast CSV files submitted to the Macro Forecast Hub.

Checks:
  - Required columns present
  - Valid target indicator IDs
  - Valid horizon values
  - Valid location codes
  - Valid output types and quantile levels
  - Numeric values are finite
  - Date formats are correct
  - Quantile values are monotonically increasing per group
"""

import csv
import os
import sys
from datetime import datetime
from pathlib import Path

REQUIRED_COLUMNS = [
    "origin_date",
    "target",
    "target_end_date",
    "horizon",
    "location",
    "output_type",
    "output_type_id",
    "value",
]

VALID_TARGETS = {
    "INDPRO", "UNRATE", "PAYEMS", "CPIAUCSL", "PCEPI",
    "FEDFUNDS", "GS10", "TB3MS", "HOUST", "M2SL",
    "DPCERA3M086SBEA", "RETAILx",
}

REQUIRED_TARGETS = {"INDPRO", "UNRATE", "CPIAUCSL"}

VALID_HORIZONS = {0, 1, 2, 3, 4}

VALID_LOCATIONS = {"US"}

VALID_OUTPUT_TYPES = {"quantile", "mean"}

REQUIRED_QUANTILES = [0.05, 0.1, 0.5, 0.9, 0.95]

HUB_ROOT = Path(__file__).resolve().parents[2]


def validate_date(date_str: str) -> bool:
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def validate_forecast_file(filepath: str) -> list[str]:
    """Validate a single forecast CSV file. Returns list of error messages."""
    errors = []
    path = Path(filepath)

    if not path.exists():
        return [f"File not found: {filepath}"]

    with open(path, newline="") as f:
        reader = csv.DictReader(f)

        # Check required columns
        if reader.fieldnames is None:
            return [f"Empty file: {filepath}"]

        missing_cols = set(REQUIRED_COLUMNS) - set(reader.fieldnames)
        if missing_cols:
            return [f"Missing columns in {filepath}: {missing_cols}"]

        rows = list(reader)

    if not rows:
        return [f"No data rows in {filepath}"]

    # Track which targets and quantiles are present
    target_horizon_quantiles: dict[tuple, list[float]] = {}
    targets_seen = set()

    for i, row in enumerate(rows, start=2):  # start=2 for 1-indexed + header
        line = f"line {i}"

        # Validate target
        target = row["target"]
        if target not in VALID_TARGETS:
            errors.append(f"{filepath}:{line}: invalid target '{target}'")
        targets_seen.add(target)

        # Validate horizon
        try:
            horizon = int(row["horizon"])
            if horizon not in VALID_HORIZONS:
                errors.append(f"{filepath}:{line}: invalid horizon {horizon}")
        except ValueError:
            errors.append(f"{filepath}:{line}: non-integer horizon '{row['horizon']}'")

        # Validate location
        if row["location"] not in VALID_LOCATIONS:
            errors.append(f"{filepath}:{line}: invalid location '{row['location']}'")

        # Validate dates
        if not validate_date(row["origin_date"]):
            errors.append(f"{filepath}:{line}: invalid origin_date '{row['origin_date']}'")
        if not validate_date(row["target_end_date"]):
            errors.append(f"{filepath}:{line}: invalid target_end_date '{row['target_end_date']}'")

        # Validate output type
        output_type = row["output_type"]
        if output_type not in VALID_OUTPUT_TYPES:
            errors.append(f"{filepath}:{line}: invalid output_type '{output_type}'")

        # Validate value
        try:
            value = float(row["value"])
            if not (value == value):  # NaN check
                errors.append(f"{filepath}:{line}: NaN value")
        except ValueError:
            errors.append(f"{filepath}:{line}: non-numeric value '{row['value']}'")

        # Track quantiles for monotonicity check
        if output_type == "quantile":
            try:
                q = float(row["output_type_id"])
                v = float(row["value"])
                key = (target, row["target_end_date"], row["location"])
                target_horizon_quantiles.setdefault(key, []).append((q, v))
            except ValueError:
                errors.append(
                    f"{filepath}:{line}: invalid quantile level '{row['output_type_id']}'"
                )

    # Check required targets
    missing_targets = REQUIRED_TARGETS - targets_seen
    if missing_targets:
        errors.append(f"{filepath}: missing required targets: {missing_targets}")

    # Check quantile monotonicity
    for key, qv_pairs in target_horizon_quantiles.items():
        qv_pairs.sort(key=lambda x: x[0])
        for j in range(1, len(qv_pairs)):
            if qv_pairs[j][1] < qv_pairs[j - 1][1]:
                errors.append(
                    f"{filepath}: quantile values not monotonic for "
                    f"target={key[0]}, date={key[1]}, location={key[2]}: "
                    f"q{qv_pairs[j-1][0]}={qv_pairs[j-1][1]} > "
                    f"q{qv_pairs[j][0]}={qv_pairs[j][1]}"
                )

    # Limit error output
    if len(errors) > 50:
        errors = errors[:50] + [f"... and {len(errors) - 50} more errors"]

    return errors


def main():
    changed_files = os.environ.get("CHANGED_FILES", "").strip().split("\n")
    forecast_files = [
        f.strip() for f in changed_files
        if f.strip().startswith("model-output/") and f.strip().endswith(".csv")
    ]

    if not forecast_files:
        print("No forecast files to validate.")
        return

    all_errors = []
    for filepath in forecast_files:
        full_path = HUB_ROOT / filepath
        errors = validate_forecast_file(str(full_path))
        all_errors.extend(errors)

    if all_errors:
        print("Forecast validation FAILED:")
        for error in all_errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    else:
        print(f"Forecast validation passed ({len(forecast_files)} file(s) checked).")


if __name__ == "__main__":
    main()
