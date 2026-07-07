"""
ARMA(p,q) model with BIC-based lag selection for the Macro Forecast Hub.

For each target indicator, this script:
  1. Pre-transforms to the comparison space (log-diff or diff)
  2. Fits ARMA(p,0,q) models on the pre-differenced series, selecting by BIC
  3. Outputs forecasts directly in the comparison space (no back-transform)

Comparison space:
  INDPRO   → Δlog(x)   monthly log difference
  CPIAUCSL → Δlog(x)   monthly log difference
  PCEPI    → Δlog(x)   monthly log difference
  UNRATE   → Δx        monthly first difference

This is meant to be run by a contributor to generate their submission file.
"""

import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.arima.model import ARIMA

warnings.filterwarnings("ignore")

HUB_ROOT = Path(__file__).resolve().parents[2]
TARGET_DATA_PATH = HUB_ROOT / "target-data" / "latest-target_values.csv"
OUTPUT_DIR = HUB_ROOT / "model-output" / "BASELINE-ARMA_BIC"

TARGETS = ["INDPRO", "CPIAUCSL", "PCEPI", "UNRATE"]

REQUIRED_QUANTILES = [0.05, 0.1, 0.5, 0.9, 0.95]

HORIZONS = list(range(24))  # 0..23
MAX_P = 6
MAX_Q = 4
MIN_HISTORY = 60  # minimum months of history required
MAX_HISTORY = 120  # use last 10 years for estimation

# Targets whose forecasts (and truth) are in log-diff or diff space
LOG_DIFF_TARGETS = {"INDPRO", "CPIAUCSL", "PCEPI"}
DIFF_TARGETS = {"UNRATE"}

TCODE = {
    "INDPRO": 5,     # take log, then first difference → Δlog
    "CPIAUCSL": 5,   # take log, then first difference → Δlog
    "PCEPI": 5,      # take log, then first difference → Δlog
    "UNRATE": 2,     # first difference → Δx
}


def _tcode_params(tcode):
    """Return (take_log, d) for a FRED-MD transformation code."""
    return {
        1: (False, 0), 2: (False, 1), 3: (False, 2),
        4: (True, 0),  5: (True, 1),  6: (True, 2),
        7: (False, 1),
    }[tcode]


def last_day_of_month(year: int, month: int) -> str:
    if month == 12:
        next_month = pd.Timestamp(year + 1, 1, 1)
    else:
        next_month = pd.Timestamp(year, month + 1, 1)
    return (next_month - pd.Timedelta(days=1)).strftime("%Y-%m-%d")


def select_arma_order(window: np.ndarray) -> tuple[int, int]:
    """Select (p, q) by minimizing BIC over a grid search using CSS on a
    pre-differenced series (d=0)."""
    best_bic = np.inf
    best_order = (1, 0)

    for p in range(MAX_P + 1):
        for q in range(MAX_Q + 1):
            if p == 0 and q == 0:
                continue
            try:
                result = ARIMA(window, order=(p, 0, q)).fit(
                    method="css", method_kwargs={"maxiter": 100})
                if result.bic < best_bic:
                    best_bic = result.bic
                    best_order = (p, q)
            except Exception:
                continue

    return best_order


def forecast_arma(window: np.ndarray, p: int, q: int,
                  n_ahead: int) -> tuple[np.ndarray, np.ndarray]:
    """Fit ARMA(p,q) and return (point_forecasts, forecast_std)
    in the pre-differenced (Δlog or Δ) space."""
    result = ARIMA(window, order=(p, 0, q)).fit(
        method_kwargs={"maxiter": 200})
    fc = result.get_forecast(steps=n_ahead)
    return np.array(fc.predicted_mean), np.array(fc.se_mean)


def generate_forecasts(target_df: pd.DataFrame, origin_date: str) -> list[dict]:
    """Generate ARMA-BIC forecasts for all targets in log-diff / diff space."""
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

        take_log, _ = _tcode_params(TCODE[target])
        raw = values[-MAX_HISTORY:]

        if take_log:
            if np.any(raw <= 0):
                print(f"  Skipping {target}: non-positive values, log not safe")
                continue
            raw = np.log(raw)

        # Pre-difference: ARMA(p,0,q) on first-differenced (log-)series
        window = np.diff(raw)

        # Select lag order by BIC on pre-differenced series
        print(f"  {target} (log={take_log}, pre-differenced): "
              f"selecting ARMA order by BIC ...", end=" ", flush=True)
        p, q = select_arma_order(window)
        print(f"ARMA({p},{q})")

        # Generate forecasts in Δlog / Δ space
        try:
            n_ahead = max(HORIZONS) + 1
            point_fc, std_fc = forecast_arma(window, p, q, n_ahead)
        except Exception as e:
            print(f"  Warning: forecast failed for {target}: {e}")
            continue

        for horizon in HORIZONS:
            target_month = last_date + pd.DateOffset(months=horizon + 1)
            target_end_date = last_day_of_month(target_month.year, target_month.month)

            mu = point_fc[horizon]      # in Δlog or Δ space
            sigma = std_fc[horizon]

            # Quantile forecasts directly in comparison space — no back-transform
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
                    "value": round(float(q_value), 4),
                })

            records.append({
                "origin_date": origin_date,
                "target": target,
                "target_end_date": target_end_date,
                "horizon": horizon,
                "location": "US",
                "output_type": "mean",
                "output_type_id": "",
                "value": round(float(mu), 4),
            })

    return records


def main():
    if not TARGET_DATA_PATH.exists():
        print(f"Target data not found at {TARGET_DATA_PATH}. Run fetch_fred_md.py first.")
        return

    target_df = pd.read_csv(TARGET_DATA_PATH)
    origin_date = "2026-04-15"

    print(f"Generating ARIMA-BIC forecasts for origin_date={origin_date}")
    records = generate_forecasts(target_df, origin_date)

    if not records:
        print("No forecasts generated.")
        return

    forecast_df = pd.DataFrame(records)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{origin_date}-BASELINE-ARMA_BIC.csv"
    forecast_df.to_csv(output_path, index=False)
    print(f"\nSaved {len(forecast_df)} rows to {output_path}")


if __name__ == "__main__":
    main()
