"""
Generate pseudo-real-time historical forecasts from 2000 onwards for:
  - MacroHub-Baseline (random walk)
  - BASELINE-ARMA_BIC (ARMA on FRED-MD transformed data, inverted back to levels)

Targets: INDPRO, CPIAUCSL, PCEPI, UNRATE

FRED-MD transformation codes:
  INDPRO   = 5 (Δlog)  → fit ARIMA(p,1,q) on log(x), forecast log(x), exp()
  CPIAUCSL = 6 (Δ²log) → fit ARIMA(p,2,q) on log(x), forecast log(x), exp()
  PCEPI    = 6 (Δ²log) → fit ARIMA(p,2,q) on log(x), forecast log(x), exp()
  UNRATE   = 2 (Δ)     → fit ARIMA(p,1,q) on x, forecast x directly
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
BASELINE_DIR = HUB_ROOT / "model-output" / "MacroHub-Baseline"
ARMA_DIR = HUB_ROOT / "model-output" / "BASELINE-ARMA_BIC"

TARGETS = {
    # target: (transform_code, d for ARIMA, apply_log)
    "INDPRO":   (5, 1, True),
    "CPIAUCSL": (6, 2, True),
    "PCEPI":    (6, 2, True),
    "UNRATE":   (2, 1, False),
}

QUANTILES = [
    0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3,
    0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7,
    0.75, 0.8, 0.85, 0.9, 0.95, 0.975, 0.99,
]

HORIZONS = [0, 1, 2, 3, 4]
MAX_P = 4
MAX_Q = 2
MIN_HISTORY = 120  # 10 years of monthly data before first forecast


def last_day_of_month(year: int, month: int) -> str:
    if month == 12:
        nxt = pd.Timestamp(year + 1, 1, 1)
    else:
        nxt = pd.Timestamp(year, month + 1, 1)
    return (nxt - pd.Timedelta(days=1)).strftime("%Y-%m-%d")


def select_arima_order(series: np.ndarray, d: int) -> tuple[int, int]:
    """Select (p, q) by BIC with fixed integration order d."""
    best_bic = np.inf
    best_order = (1, 0)

    for p in range(MAX_P + 1):
        for q in range(MAX_Q + 1):
            if p == 0 and q == 0:
                continue
            try:
                model = ARIMA(series, order=(p, d, q))
                result = model.fit(method_kwargs={"maxiter": 200})
                if result.bic < best_bic:
                    best_bic = result.bic
                    best_order = (p, q)
            except Exception:
                continue

    return best_order


def forecast_arima(
    series: np.ndarray, p: int, d: int, q: int, n_ahead: int
) -> tuple[np.ndarray, np.ndarray]:
    """Fit ARIMA(p,d,q) and return (point, std) for 1..n_ahead in working space."""
    model = ARIMA(series, order=(p, d, q))
    result = model.fit(method_kwargs={"maxiter": 200})
    fc = result.get_forecast(steps=n_ahead)
    return np.array(fc.predicted_mean), np.array(fc.se_mean)


def rw_forecast_with_errors(
    values: np.ndarray, n_ahead: int, min_err_hist: int = 24
) -> tuple[float, np.ndarray]:
    """
    Random walk: point = last value.
    Quantile errors from empirical h-step RW errors.
    Returns (point, error_quantiles) for each horizon.
    """
    last_val = values[-1]
    err_quantiles = []

    for h in range(1, n_ahead + 1):
        # Historical h-step RW errors
        if len(values) > h:
            errors = values[h:] - values[:-h]
            errors = errors[np.isfinite(errors)]
        else:
            errors = np.array([0.0])

        if len(errors) < min_err_hist:
            # Scale 1-step errors by sqrt(h)
            if len(values) > 1:
                e1 = values[1:] - values[:-1]
                e1 = e1[np.isfinite(e1)]
                errors = e1 * np.sqrt(h)
            else:
                errors = np.array([0.0])

        q_errors = np.quantile(errors, QUANTILES) if len(errors) > 0 else np.zeros(len(QUANTILES))
        err_quantiles.append(q_errors)

    return last_val, np.array(err_quantiles)


def make_rows(
    origin_date: str,
    target: str,
    horizon: int,
    target_end_date: str,
    point: float,
    quantile_values: np.ndarray,
) -> list[dict]:
    """Build hub-format rows for one target/horizon."""
    rows = []
    for q_level, q_val in zip(QUANTILES, quantile_values):
        rows.append({
            "origin_date": origin_date,
            "target": target,
            "target_end_date": target_end_date,
            "horizon": horizon,
            "location": "US",
            "output_type": "quantile",
            "output_type_id": q_level,
            "value": round(float(q_val), 4),
        })
    rows.append({
        "origin_date": origin_date,
        "target": target,
        "target_end_date": target_end_date,
        "horizon": horizon,
        "location": "US",
        "output_type": "median",
        "output_type_id": "",
        "value": round(float(point), 4),
    })
    return rows


def run_backfill():
    target_df = pd.read_csv(TARGET_DATA_PATH)
    target_df["truth_date"] = pd.to_datetime(target_df["truth_date"])

    # Generate origin dates: 17th of each month from 2000-01 to 2026-03
    origin_dates = [
        pd.Timestamp(year, month, 17)
        for year in range(2000, 2027)
        for month in range(1, 13)
        if pd.Timestamp(year, month, 17) <= pd.Timestamp("2026-03-17")
    ]

    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    ARMA_DIR.mkdir(parents=True, exist_ok=True)

    # Cache ARMA orders — re-select every 12 months
    arma_orders: dict[str, tuple[int, int]] = {}
    last_selection_year: dict[str, int] = {}

    total = len(origin_dates)
    for idx, origin in enumerate(origin_dates):
        origin_str = origin.strftime("%Y-%m-%d")
        print(f"\r[{idx+1}/{total}] {origin_str}", end="", flush=True)

        baseline_rows = []
        arma_rows = []

        for target, (tcode, d, use_log) in TARGETS.items():
            sdf = target_df[target_df["target"] == target].copy()
            sdf = sdf.sort_values("truth_date")
            sdf = sdf[sdf["truth_date"] < origin]

            if len(sdf) < MIN_HISTORY:
                continue

            values = sdf["value"].values.astype(float)
            last_date = sdf["truth_date"].iloc[-1]

            # === BASELINE (random walk) ===
            last_val, rw_err_q = rw_forecast_with_errors(values, max(HORIZONS) + 1)

            for horizon in HORIZONS:
                target_month = last_date + pd.DateOffset(months=horizon + 1)
                ted = last_day_of_month(target_month.year, target_month.month)
                q_vals = last_val + rw_err_q[horizon]
                baseline_rows.extend(make_rows(origin_str, target, horizon, ted, last_val, q_vals))

            # === ARMA on transformed data ===
            working = np.log(values) if use_log else values.copy()

            # Select order every 12 months or if not yet selected
            cache_key = target
            need_select = (
                cache_key not in arma_orders
                or origin.year != last_selection_year.get(cache_key)
            )

            if need_select:
                p, q = select_arima_order(working, d)
                arma_orders[cache_key] = (p, q)
                last_selection_year[cache_key] = origin.year

            p, q = arma_orders[cache_key]

            try:
                n_ahead = max(HORIZONS) + 1
                fc_point, fc_std = forecast_arima(working, p, d, q, n_ahead)
            except Exception:
                # Fallback: use baseline if ARIMA fails
                for horizon in HORIZONS:
                    target_month = last_date + pd.DateOffset(months=horizon + 1)
                    ted = last_day_of_month(target_month.year, target_month.month)
                    q_vals = last_val + rw_err_q[horizon]
                    arma_rows.extend(make_rows(origin_str, target, horizon, ted, last_val, q_vals))
                continue

            for horizon in HORIZONS:
                target_month = last_date + pd.DateOffset(months=horizon + 1)
                ted = last_day_of_month(target_month.year, target_month.month)

                mu_w = fc_point[horizon]
                sigma_w = max(fc_std[horizon], 1e-10)

                # Quantiles in working space
                q_working = stats.norm.ppf(QUANTILES, loc=mu_w, scale=sigma_w)

                # Transform back to levels
                if use_log:
                    q_levels = np.exp(q_working)
                    point_level = float(np.exp(mu_w))
                else:
                    q_levels = q_working
                    point_level = float(mu_w)

                arma_rows.extend(make_rows(origin_str, target, horizon, ted, point_level, q_levels))

        # Save files
        if baseline_rows:
            df = pd.DataFrame(baseline_rows)
            path = BASELINE_DIR / f"{origin_str}-MacroHub-Baseline.csv"
            df.to_csv(path, index=False)

        if arma_rows:
            df = pd.DataFrame(arma_rows)
            path = ARMA_DIR / f"{origin_str}-BASELINE-ARMA_BIC.csv"
            df.to_csv(path, index=False)

    print("\nDone!")


if __name__ == "__main__":
    run_backfill()
