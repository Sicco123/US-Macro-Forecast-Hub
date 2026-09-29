"""
Generate pseudo-real-time historical forecasts from 2000 onwards for:
  - MacroHub-RandomWalk (random walk)
  - BASELINE-ARMA_BIC (ARMA on pre-differenced series, output in Δlog/Δ space)

Targets: INDPRO, CPIAUCSL, PCEPI, UNRATE

Comparison space (forecasts and truth evaluated in same transformed scale):
  INDPRO   → Δlog(x)   monthly log difference
  CPIAUCSL → Δlog(x)   monthly log difference
  PCEPI    → Δlog(x)   monthly log difference
  UNRATE   → Δx        monthly first difference
"""

from pathlib import Path

import numpy as np
import pandas as pd
try:
    from .arma_bic import generate_forecasts
except ImportError:  # Direct script execution.
    from arma_bic import generate_forecasts


HUB_ROOT = Path(__file__).resolve().parents[2]
TARGET_DATA_PATH = HUB_ROOT / "target-data" / "latest-target_values.csv"
BASELINE_DIR = HUB_ROOT / "model-output" / "MacroHub-RandomWalk"
ARMA_DIR = HUB_ROOT / "model-output" / "BASELINE-ARMA_BIC"

# Targets whose forecasts (and truth) are in log-diff or diff space
LOG_DIFF_TARGETS = {"INDPRO", "CPIAUCSL", "PCEPI"}
DIFF_TARGETS = {"UNRATE"}

TARGETS = {
    # target: (apply_log,)  — d always 0; we pre-difference before fitting ARMA
    "INDPRO":   True,
    "CPIAUCSL": True,
    "PCEPI":    True,
    "UNRATE":   False,
}

QUANTILES = [0.05, 0.1, 0.5, 0.9, 0.95]

HORIZONS = list(range(24))  # 0..23
MAX_P = 4
MAX_Q = 2
MIN_HISTORY = 120  # 10 years of monthly data before first forecast


def last_day_of_month(year: int, month: int) -> str:
    if month == 12:
        nxt = pd.Timestamp(year + 1, 1, 1)
    else:
        nxt = pd.Timestamp(year, month + 1, 1)
    return (nxt - pd.Timedelta(days=1)).strftime("%Y-%m-%d")



def rw_forecast_with_errors(
    work: np.ndarray, n_ahead: int, min_err_hist: int = 24, diffed: bool = False
) -> tuple[float, np.ndarray]:
    """
    Naive forecast in the provided series space.
    Levels (diffed=False): point = last observed value (classic random walk).
    Changes (diffed=True): point = mean of last 12 changes (Atkeson–Ohanian);
      carrying one noisy month forward is a terrible inflation forecast.
    Quantile errors from empirical h-step errors of the rule used.
    Returns (point, error_quantiles) for each horizon.
    """
    W = 12
    if diffed:
        roll = np.convolve(work, np.ones(W) / W, "valid")
        last_val = roll[-1]
    else:
        last_val = work[-1]
    err_quantiles = []

    for h in range(1, n_ahead + 1):
        if diffed:
            actual = work[W - 1 + h:]
            errors = actual - roll[:len(actual)]
            errors = errors[np.isfinite(errors)]
        elif len(work) > h:
            errors = work[h:] - work[:-h]
            errors = errors[np.isfinite(errors)]
        else:
            errors = np.array([0.0])

        if len(errors) < min_err_hist:
            if len(work) > 1:
                e1 = work[1:] - work[:-1]
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
            "value": float(q_val),
        })
    rows.append({
        "origin_date": origin_date,
        "target": target,
        "target_end_date": target_end_date,
        "horizon": horizon,
        "location": "US",
        "output_type": "mean",
        "output_type_id": "",
        "value": float(point),
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
    arma_orders = {}

    total = len(origin_dates)
    for idx, origin in enumerate(origin_dates):
        origin_str = origin.strftime("%Y-%m-%d")
        print(f"\r[{idx+1}/{total}] {origin_str}", end="", flush=True)

        baseline_rows = []
        arma_rows = []

        for target, use_log in TARGETS.items():
            sdf = target_df[target_df["target"] == target].copy()
            sdf = sdf.sort_values("truth_date")
            sdf = sdf[sdf["truth_date"] < origin]

            if len(sdf) < MIN_HISTORY:
                continue

            values = sdf["value"].values.astype(float)
            last_date = sdf["truth_date"].iloc[-1]

            # Transform to comparison space (Δlog or Δ)
            if target in LOG_DIFF_TARGETS:
                if np.any(values <= 0):
                    continue
                work = np.diff(np.log(values))
            elif target in DIFF_TARGETS:
                work = np.diff(values)
            else:
                work = values.copy()

            # === BASELINE (naive forecast in comparison space) ===
            last_val, rw_err_q = rw_forecast_with_errors(
                work, max(HORIZONS) + 1,
                diffed=target in LOG_DIFF_TARGETS or target in DIFF_TARGETS)

            for horizon in HORIZONS:
                target_month = last_date + pd.DateOffset(months=horizon + 1)
                ted = last_day_of_month(target_month.year, target_month.month)
                q_vals = last_val + rw_err_q[horizon]
                baseline_rows.extend(make_rows(origin_str, target, horizon, ted, last_val, q_vals))

        arma_rows = generate_forecasts(target_df, origin_str, orders=arma_orders)

        # Save files
        if baseline_rows:
            df = pd.DataFrame(baseline_rows)
            path = BASELINE_DIR / f"{origin_str}-MacroHub-RandomWalk.csv"
            df.to_csv(path, index=False)

        if arma_rows:
            df = pd.DataFrame(arma_rows)
            path = ARMA_DIR / f"{origin_str}-BASELINE-ARMA_BIC.csv"
            df.to_csv(path, index=False)

    print("\nDone!")


if __name__ == "__main__":
    run_backfill()
