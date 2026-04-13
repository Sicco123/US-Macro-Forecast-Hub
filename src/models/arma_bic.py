"""
ARMA(p,q) model with BIC-based lag selection for the Macro Forecast Hub.

For each target indicator, this script:
  1. Fits ARMA(p,q) models over a grid of (p,q) values
  2. Selects the model minimizing BIC
  3. Produces point and quantile forecasts from the Gaussian predictive
     distribution

This is meant to be run by a contributor to generate their submission file.
"""

import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.arima.model import ARIMA

warnings.filterwarnings("ignore")

HUB_ROOT = Path(__file__).resolve().parents[2]
TARGET_DATA_PATH = HUB_ROOT / "target-data" / "latest-target_values.csv"
OUTPUT_DIR = HUB_ROOT / "model-output" / "SBE_EDS-ARMA_BIC"

TARGETS = [
    "INDPRO", "UNRATE", "PAYEMS", "CPIAUCSL", "PCEPI",
    "FEDFUNDS", "GS10", "TB3MS", "HOUST", "M2SL",
    "DPCERA3M086SBEA", "RETAILx",
]

REQUIRED_QUANTILES = [
    0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3,
    0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7,
    0.75, 0.8, 0.85, 0.9, 0.95, 0.975, 0.99,
]

HORIZONS = [0, 1, 2, 3, 4]
MAX_P = 6
MAX_Q = 4
MIN_HISTORY = 60  # minimum months of history required


def last_day_of_month(year: int, month: int) -> str:
    if month == 12:
        next_month = pd.Timestamp(year + 1, 1, 1)
    else:
        next_month = pd.Timestamp(year, month + 1, 1)
    return (next_month - pd.Timedelta(days=1)).strftime("%Y-%m-%d")


def _standardize(series: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Standardize series to zero mean, unit variance for numerical stability."""
    mu, sigma = series.mean(), series.std()
    if sigma == 0:
        sigma = 1.0
    return (series - mu) / sigma, mu, sigma


def select_arma_order(series: np.ndarray) -> tuple[int, int]:
    """Select (p, q) by minimizing BIC over a grid search."""
    z, _, _ = _standardize(series)
    best_bic = np.inf
    best_order = (1, 0)

    for p in range(MAX_P + 1):
        for q in range(MAX_Q + 1):
            if p == 0 and q == 0:
                continue
            try:
                model = ARIMA(z, order=(p, 0, q))
                result = model.fit(method_kwargs={"maxiter": 200})
                if result.bic < best_bic:
                    best_bic = result.bic
                    best_order = (p, q)
            except Exception:
                continue

    return best_order


def forecast_arma(series: np.ndarray, p: int, q: int, n_ahead: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Fit ARMA(p,q) on standardized data and return (point_forecasts, forecast_std)
    in the original scale for 1..n_ahead steps.
    """
    z, mu, sigma = _standardize(series)
    model = ARIMA(z, order=(p, 0, q))
    result = model.fit(method_kwargs={"maxiter": 200})

    forecast_result = result.get_forecast(steps=n_ahead)
    point_z = np.array(forecast_result.predicted_mean)
    std_z = np.array(forecast_result.se_mean)

    # Transform back to original scale
    point = point_z * sigma + mu
    std = std_z * sigma

    return point, std


def generate_forecasts(target_df: pd.DataFrame, origin_date: str) -> list[dict]:
    """Generate ARMA-BIC forecasts for all targets."""
    records = []
    origin = pd.Timestamp(origin_date)

    for target in TARGETS:
        series_df = target_df[target_df["target"] == target].copy()
        series_df = series_df.sort_values("truth_date")
        series_df = series_df[series_df["truth_date"] < origin.strftime("%Y-%m-%d")]

        if len(series_df) < MIN_HISTORY:
            print(f"  Skipping {target}: only {len(series_df)} obs (need {MIN_HISTORY})")
            continue

        values = series_df["value"].values.astype(float)
        last_date = pd.Timestamp(series_df["truth_date"].iloc[-1])

        # Select lag order by BIC
        print(f"  {target}: selecting ARMA order by BIC ...", end=" ", flush=True)
        p, q = select_arma_order(values)
        print(f"ARMA({p},{q})")

        # Generate forecasts
        try:
            n_ahead = max(HORIZONS) + 1
            point_fc, std_fc = forecast_arma(values, p, q, n_ahead)
        except Exception as e:
            print(f"  Warning: forecast failed for {target}: {e}")
            continue

        for horizon in HORIZONS:
            target_month = last_date + pd.DateOffset(months=horizon + 1)
            target_end_date = last_day_of_month(target_month.year, target_month.month)

            mu = point_fc[horizon]
            sigma = std_fc[horizon]

            # Quantile forecasts from Gaussian predictive distribution
            for q_level in REQUIRED_QUANTILES:
                q_value = stats.norm.ppf(q_level, loc=mu, scale=sigma)
                records.append({
                    "origin_date": origin_date,
                    "target": target,
                    "target_end_date": target_end_date,
                    "horizon": horizon,
                    "location": "US",
                    "output_type": "quantile",
                    "output_type_id": q_level,
                    "value": round(q_value, 4),
                })

            # Median
            records.append({
                "origin_date": origin_date,
                "target": target,
                "target_end_date": target_end_date,
                "horizon": horizon,
                "location": "US",
                "output_type": "median",
                "output_type_id": "",
                "value": round(mu, 4),
            })

    return records


def main():
    if not TARGET_DATA_PATH.exists():
        print(f"Target data not found at {TARGET_DATA_PATH}. Run fetch_fred_md.py first.")
        return

    target_df = pd.read_csv(TARGET_DATA_PATH)
    origin_date = "2026-04-15"

    print(f"Generating ARMA-BIC forecasts for origin_date={origin_date}")
    records = generate_forecasts(target_df, origin_date)

    if not records:
        print("No forecasts generated.")
        return

    forecast_df = pd.DataFrame(records)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{origin_date}-SBE_EDS-ARMA_BIC.csv"
    forecast_df.to_csv(output_path, index=False)
    print(f"\nSaved {len(forecast_df)} rows to {output_path}")


if __name__ == "__main__":
    main()
