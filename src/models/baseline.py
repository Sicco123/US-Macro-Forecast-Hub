"""
Generate baseline (random walk) forecasts for the Macro Forecast Hub.

The baseline model produces:
  - Point forecast: last observed value (no-change forecast)
  - Quantile forecasts: derived from the empirical distribution of historical
    forecast errors at each horizon

This serves as the standard benchmark for evaluating all other models.
"""

from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

HUB_ROOT = Path(__file__).resolve().parents[2]
TARGET_DATA_PATH = HUB_ROOT / "target-data" / "latest-target_values.csv"
OUTPUT_DIR = HUB_ROOT / "model-output" / "MacroHub-RandomWalk"

REQUIRED_QUANTILES = [0.05, 0.1, 0.5, 0.9, 0.95]

TARGETS = [
    "INDPRO", "UNRATE", "PAYEMS", "CPIAUCSL", "PCEPI",
    "FEDFUNDS", "GS10", "TB3MS", "HOUST", "M2SL",
    "DPCERA3M086SBEA", "RETAILx",
]

HORIZONS = [0, 1, 2, 3, 4]

# Minimum number of historical observations needed to estimate error distribution
MIN_HISTORY = 24


def load_target_data() -> pd.DataFrame:
    """Load target data sorted by date."""
    df = pd.read_csv(TARGET_DATA_PATH)
    df["truth_date"] = pd.to_datetime(df["truth_date"])
    return df.sort_values(["target", "truth_date"])


def compute_historical_errors(series: pd.Series, horizon: int) -> np.ndarray:
    """
    Compute historical random walk forecast errors at a given horizon.
    Error = actual[t+h] - actual[t] for horizon h.
    """
    values = np.asarray(series)
    if len(values) <= horizon:
        return np.array([])
    errors = values[horizon:] - values[:-horizon]
    return errors[np.isfinite(errors)]


def last_day_of_month(year: int, month: int) -> str:
    """Return the last day of the given month as YYYY-MM-DD."""
    if month == 12:
        next_month = pd.Timestamp(year + 1, 1, 1)
    else:
        next_month = pd.Timestamp(year, month + 1, 1)
    last_day = next_month - pd.Timedelta(days=1)
    return last_day.strftime("%Y-%m-%d")


def generate_baseline_forecast(target_df: pd.DataFrame, origin_date: str) -> list[dict]:
    """Generate baseline forecasts for all targets and horizons."""
    records = []
    origin = pd.Timestamp(origin_date)

    for target in TARGETS:
        series_df = target_df[target_df["target"] == target].copy()
        series_df = series_df.sort_values("truth_date")

        # Only use data available before origin_date
        series_df = series_df[series_df["truth_date"] < origin]

        if len(series_df) < MIN_HISTORY:
            continue

        last_value = series_df["value"].iloc[-1]
        last_date = series_df["truth_date"].iloc[-1]
        values = series_df["value"].values

        for horizon in HORIZONS:
            # Target end date: h months after the last observed month
            target_month = last_date + pd.DateOffset(months=horizon + 1)
            target_end_date = last_day_of_month(target_month.year, target_month.month)

            # Point forecast = last value (random walk)
            point_forecast = last_value

            # Compute error distribution for this horizon
            h = max(horizon, 1)  # use at least 1-step errors for h=0
            errors = compute_historical_errors(values, h)

            if len(errors) < MIN_HISTORY:
                # Fall back to wider distribution if not enough history
                errors = compute_historical_errors(values, 1)
                if horizon > 1:
                    # Scale errors by sqrt(horizon) as approximation
                    errors = errors * np.sqrt(horizon)

            # Generate quantile forecasts
            for q in REQUIRED_QUANTILES:
                if len(errors) > 0:
                    q_error = np.quantile(errors, q)
                    q_value = point_forecast + q_error
                else:
                    q_value = point_forecast

                records.append({
                    "origin_date": origin_date,
                    "target": target,
                    "target_end_date": target_end_date,
                    "horizon": horizon,
                    "location": "US",
                    "output_type": "quantile",
                    "output_type_id": q,
                    "value": round(q_value, 4),
                })

            # Add mean
            records.append({
                "origin_date": origin_date,
                "target": target,
                "target_end_date": target_end_date,
                "horizon": horizon,
                "location": "US",
                "output_type": "mean",
                "output_type_id": "",
                "value": round(point_forecast, 4),
            })

    return records


def main():
    if not TARGET_DATA_PATH.exists():
        print(f"Target data not found at {TARGET_DATA_PATH}. Run fetch_fred_md.py first.")
        return

    target_df = load_target_data()
    today = datetime.now().strftime("%Y-%m-%d")

    print(f"Generating baseline forecast for origin_date={today}")
    records = generate_baseline_forecast(target_df, today)

    if not records:
        print("No forecasts generated (insufficient target data).")
        return

    forecast_df = pd.DataFrame(records)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{today}-MacroHub-RandomWalk.csv"
    forecast_df.to_csv(output_path, index=False)
    print(f"Saved {len(forecast_df)} rows to {output_path}")


if __name__ == "__main__":
    main()
