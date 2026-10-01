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

import argparse
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.arima.model import ARIMA

try:
    from .baseline import monthly_levels
except ImportError:  # Direct script execution.
    from baseline import monthly_levels


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


def fit_arma(window, p, q):
    """Fit on standardized changes and reject failed or unstable estimates."""
    window = np.asarray(window, dtype=float)
    if window.ndim != 1 or len(window) < 24 or not np.isfinite(window).all():
        raise ValueError("ARMA requires at least 24 finite monthly changes")
    # A single crisis month must not drive years of monthly-change forecasts.
    median = np.median(window)
    mad = np.median(np.abs(window - median))
    if mad:
        window = np.clip(window, median - 5 * 1.4826 * mad, median + 5 * 1.4826 * mad)
    center, scale = window.mean(), window.std() or 1.0
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        result = ARIMA((window - center) / scale, order=(p, 0, q),
                       enforce_stationarity=True, enforce_invertibility=True).fit(
                           method="statespace", method_kwargs={"maxiter": 200})
    if (not result.mle_retvals.get("converged", False)
            or not np.isfinite(result.bic)
            or not np.isfinite(result.params).all()
            or np.any(np.abs(result.arroots) <= 1)
            or np.any(np.abs(result.maroots) <= 1)):
        raise ValueError(f"ARMA({p},{q}) did not produce a converged stable fit")
    return result, center, scale


def select_arma_order(window, max_p=MAX_P, max_q=MAX_Q):
    """BIC over supported, converged stationary ARMA fits, including white noise."""
    best_bic, best_order = np.inf, None
    for p in range(max_p + 1):
        for q in range(max_q + 1):
            try:
                result, _, _ = fit_arma(window, p, q)
            except (ValueError, np.linalg.LinAlgError):
                continue
            if result.bic < best_bic:
                best_bic, best_order = result.bic, (p, q)
    if best_order is None:
        raise ValueError("No converged ARMA candidate; no substitute forecast was saved")
    return best_order


def forecast_arma(window, p, q, n_ahead):
    result, center, scale = fit_arma(window, p, q)
    fc = result.get_forecast(steps=n_ahead)
    point = np.asarray(fc.predicted_mean) * scale + center
    std = np.asarray(fc.se_mean) * scale
    if not np.isfinite(point).all() or not np.isfinite(std).all() or (std < 0).any():
        raise ValueError("ARMA produced invalid forecast moments")
    return point, std


def generate_forecasts(target_df: pd.DataFrame, origin_date: str, orders=None) -> list[dict]:
    """Generate ARMA-BIC forecasts for all targets in log-diff / diff space."""
    records = []
    origin = pd.Timestamp(origin_date)

    for target in TARGETS:
        series_df = target_df[target_df["target"] == target].copy()
        series_df["truth_date"] = pd.to_datetime(series_df["truth_date"])
        series_df = series_df.sort_values("truth_date")
        series_df = series_df[series_df["truth_date"] < origin]
        if len(series_df) < MIN_HISTORY:
            raise ValueError(f"{target}: only {len(series_df)} observations (need {MIN_HISTORY})")

        levels = monthly_levels(series_df, origin)
        values = levels.to_numpy(dtype=float)
        last_date = levels.index[-1]

        take_log, _ = _tcode_params(TCODE[target])
        raw = values[-MAX_HISTORY:]

        if take_log:
            if np.any(raw <= 0):
                raise ValueError(f"{target}: non-positive levels cannot be logged")
            raw = np.log(raw)

        # Pre-difference: ARMA(p,0,q) on first-differenced (log-)series
        window = np.diff(raw)

        # ponytail: annual BIC selection for backfills; reselect monthly if needed.
        key = (target, origin.year)
        if orders is None or key not in orders:
            order = select_arma_order(window)
            if orders is not None:
                orders[key] = order
        else:
            order = orders[key]
        try:
            point_fc, std_fc = forecast_arma(window, *order, max(HORIZONS) + 1)
        except ValueError:
            order = select_arma_order(window)
            point_fc, std_fc = forecast_arma(window, *order, max(HORIZONS) + 1)
            if orders is not None:
                orders[key] = order

        for horizon in HORIZONS:
            target_month = last_date + pd.DateOffset(months=horizon + 1)
            target_end_date = last_day_of_month(target_month.year, target_month.month)

            mu = point_fc[horizon]      # in Δlog or Δ space
            sigma = std_fc[horizon]

            # Quantile forecasts directly in comparison space — no back-transform
            for q_level in REQUIRED_QUANTILES:
                q_value = mu + stats.norm.ppf(q_level) * sigma
                records.append({
                    "origin_date": origin_date,
                    "target": target,
                    "target_end_date": target_end_date,
                    "horizon": horizon,
                    "location": "US",
                    "output_type": "quantile",
                    "output_type_id": q_level,
                    "value": float(q_value),
                })

            records.append({
                "origin_date": origin_date,
                "target": target,
                "target_end_date": target_end_date,
                "horizon": horizon,
                "location": "US",
                "output_type": "mean",
                "output_type_id": "",
                "value": float(mu),
            })

    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="2026-04-15")
    parser.add_argument("--rebuild", action="store_true", help="Repair all existing ARMA files")
    args = parser.parse_args()
    target_df = pd.read_csv(TARGET_DATA_PATH)
    origins = sorted(p.name[:10] for p in OUTPUT_DIR.glob("*.csv")) if args.rebuild else [args.origin]
    orders = {}  # Select annually during historical runs; refit at every origin.
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for i, origin in enumerate(origins, 1):
        path = OUTPUT_DIR / f"{origin}-BASELINE-ARMA_BIC.csv"
        forecasts = pd.DataFrame(generate_forecasts(target_df, origin, orders=orders))
        if path.exists():
            existing = pd.read_csv(path)
            forecasts = pd.concat([existing.loc[~existing.target.isin(TARGETS)], forecasts], ignore_index=True)
        temporary = path.with_suffix(".csv.tmp")
        forecasts.to_csv(temporary, index=False)
        temporary.replace(path)
        print(f"[{i}/{len(origins)}] Rebuilt {origin}", flush=True)


if __name__ == "__main__":
    main()
