"""
Generate two years of monthly forecasts (April 2024 -- March 2026) for:
  - MacroHub-RandomWalk   (all 12 targets)
  - BASELINE-ARMA_BIC     (INDPRO, CPIAUCSL, PCEPI, UNRATE)
  - SBE_EDS-ARMA_BIC      (INDPRO, CPIAUCSL, PCEPI, UNRATE)
  - MacroHub-Ensemble     (median across available models per target)

Speed optimisations:
  - ARMA models estimated on last 10 years (120 obs) only
  - Vectorised row generation (numpy broadcasting, no per-quantile loops)
  - DataFrames pre-sliced per target; origin-date filtering via searchsorted
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
MODEL_OUTPUT_DIR = HUB_ROOT / "model-output"

ALL_TARGETS = [
    "INDPRO", "UNRATE", "PAYEMS", "CPIAUCSL", "PCEPI",
    "FEDFUNDS", "GS10", "TB3MS", "HOUST", "M2SL",
    "DPCERA3M086SBEA", "RETAILx",
]
ARMA_TARGETS = ["INDPRO", "CPIAUCSL", "PCEPI", "UNRATE"]

QUANTILES = np.array([0.05, 0.1, 0.5, 0.9, 0.95])
HORIZONS = [0, 1, 2, 3, 4]
N_AHEAD = max(HORIZONS) + 1

MAX_P = 6
MAX_Q = 4
MIN_HISTORY = 60
MAX_HISTORY = 120  # 10 years of monthly data

ORIGIN_DATES = [
    pd.Timestamp(y, m, 17)
    for y in range(2024, 2027)
    for m in range(1, 13)
    if pd.Timestamp(2024, 4, 17) <= pd.Timestamp(y, m, 17) <= pd.Timestamp(2026, 3, 17)
]


def last_day_of_month(year: int, month: int) -> str:
    if month == 12:
        nxt = pd.Timestamp(year + 1, 1, 1)
    else:
        nxt = pd.Timestamp(year, month + 1, 1)
    return (nxt - pd.Timedelta(days=1)).strftime("%Y-%m-%d")


def _make_rows(origin_str, target, ted, horizon, qvalues, mean_val):
    """Build 6 rows (5 quantile + 1 mean) as a list of dicts, vectorised."""
    base = {
        "origin_date": origin_str, "target": target,
        "target_end_date": ted, "horizon": horizon,
        "location": "US",
    }
    rows = [
        {**base, "output_type": "quantile", "output_type_id": float(q),
         "value": round(float(v), 4)}
        for q, v in zip(QUANTILES, qvalues)
    ]
    rows.append({**base, "output_type": "mean", "output_type_id": "",
                 "value": round(float(mean_val), 4)})
    return rows


# ── Pre-process target data ────────────────────────────────────────────────

def prepare_target_series(target_df):
    """Return dict: target -> (sorted dates array, sorted values array)."""
    out = {}
    for target in ALL_TARGETS:
        sdf = target_df[target_df["target"] == target].sort_values("truth_date")
        out[target] = (sdf["truth_date"].values, sdf["value"].values.astype(float))
    return out


def slice_before(dates, values, origin_ts):
    """Fast slice of observations before origin using searchsorted."""
    idx = np.searchsorted(dates, origin_ts, side="left")
    return values[:idx], dates[:idx]


# ── Random Walk ─────────────────────────────────────────────────────────────

def generate_rw(series_dict, origin_str, targets):
    origin_ts = np.datetime64(origin_str)
    all_rows = []

    for target in targets:
        dates, values = series_dict[target]
        vals, dts = slice_before(dates, values, origin_ts)
        if len(vals) < 24:
            continue

        last_val = vals[-1]
        last_date = pd.Timestamp(dts[-1])

        for horizon in HORIZONS:
            tm = last_date + pd.DateOffset(months=horizon + 1)
            ted = last_day_of_month(tm.year, tm.month)

            h = max(horizon, 1)
            if len(vals) > h:
                errors = vals[h:] - vals[:-h]
                errors = errors[np.isfinite(errors)]
            else:
                errors = np.array([0.0])

            if len(errors) < 24:
                e1 = vals[1:] - vals[:-1]
                e1 = e1[np.isfinite(e1)]
                errors = e1 * np.sqrt(h) if len(e1) > 0 else np.array([0.0])

            # Vectorised quantile computation
            q_errors = np.quantile(errors, QUANTILES) if len(errors) > 0 else np.zeros(len(QUANTILES))
            qvalues = last_val + q_errors
            all_rows.extend(_make_rows(origin_str, target, ted, horizon, qvalues, last_val))

    return all_rows


# ── ARMA-BIC ───────────────────────────────────────────────────────────────

def _standardize(s):
    mu, sigma = s.mean(), s.std()
    if sigma == 0:
        sigma = 1.0
    return (s - mu) / sigma, mu, sigma


def select_arma_order(series):
    """BIC grid search on last MAX_HISTORY observations."""
    series = series[-MAX_HISTORY:]
    z, _, _ = _standardize(series)
    best_bic, best_order = np.inf, (1, 0)
    for p in range(MAX_P + 1):
        for q in range(MAX_Q + 1):
            if p == 0 and q == 0:
                continue
            try:
                res = ARIMA(z, order=(p, 0, q)).fit(method_kwargs={"maxiter": 200})
                if res.bic < best_bic:
                    best_bic = res.bic
                    best_order = (p, q)
            except Exception:
                continue
    return best_order


def forecast_arma(series, p, q):
    """Fit on last MAX_HISTORY obs, return (point[N_AHEAD], std[N_AHEAD])."""
    series = series[-MAX_HISTORY:]
    z, mu, sigma = _standardize(series)
    res = ARIMA(z, order=(p, 0, q)).fit(method_kwargs={"maxiter": 200})
    fc = res.get_forecast(steps=N_AHEAD)
    point = np.array(fc.predicted_mean) * sigma + mu
    std = np.array(fc.se_mean) * sigma
    return point, std


def generate_arma(series_dict, origin_str, targets, cache, last_yr):
    origin_ts = np.datetime64(origin_str)
    origin_pd = pd.Timestamp(origin_str)
    all_rows = []

    for target in targets:
        dates, values = series_dict[target]
        vals, dts = slice_before(dates, values, origin_ts)
        if len(vals) < MIN_HISTORY:
            continue

        last_date = pd.Timestamp(dts[-1])

        # Re-select order once per year
        if target not in cache or origin_pd.year != last_yr.get(target):
            cache[target] = select_arma_order(vals)
            last_yr[target] = origin_pd.year

        p, q = cache[target]
        try:
            pt, st = forecast_arma(vals, p, q)
        except Exception:
            continue

        # Vectorised: compute all quantiles for all horizons at once
        # pt[h], st[h] -> quantiles via ppf
        for horizon in HORIZONS:
            tm = last_date + pd.DateOffset(months=horizon + 1)
            ted = last_day_of_month(tm.year, tm.month)
            mu_h, sigma_h = pt[horizon], st[horizon]
            qvalues = stats.norm.ppf(QUANTILES, loc=mu_h, scale=sigma_h)
            all_rows.extend(_make_rows(origin_str, target, ted, horizon, qvalues, mu_h))

    return all_rows


# ── Ensemble ────────────────────────────────────────────────────────────────

def generate_ensemble(origin_str):
    dfs = []
    for d in MODEL_OUTPUT_DIR.iterdir():
        if not d.is_dir() or d.name.startswith(".") or d.name == "MacroHub-Ensemble":
            continue
        for f in d.glob(f"{origin_str}-*.csv"):
            try:
                df = pd.read_csv(f)
                df["_model"] = d.name
                dfs.append(df)
            except Exception:
                pass
    if not dfs:
        return []

    combined = pd.concat(dfs, ignore_index=True)
    gcols = ["origin_date", "target", "target_end_date", "horizon",
             "location", "output_type", "output_type_id"]
    rows = []
    for key, g in combined.groupby(gcols):
        if g["_model"].nunique() < 2:
            continue
        rec = dict(zip(gcols, key))
        rec["value"] = round(float(g["value"].astype(float).median()), 4)
        rows.append(rec)
    return rows


# ── Main ────────────────────────────────────────────────────────────────────

def save(rows, out_dir, origin_str, model_name):
    if rows:
        out_dir.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(rows).to_csv(
            out_dir / f"{origin_str}-{model_name}.csv", index=False
        )


def main():
    target_df = pd.read_csv(TARGET_DATA_PATH)
    target_df["truth_date"] = pd.to_datetime(target_df["truth_date"])

    # Pre-process once
    series_dict = prepare_target_series(target_df)

    rw_dir = MODEL_OUTPUT_DIR / "MacroHub-RandomWalk"
    baseline_arma_dir = MODEL_OUTPUT_DIR / "BASELINE-ARMA_BIC"
    sbe_dir = MODEL_OUTPUT_DIR / "SBE_EDS-ARMA_BIC"
    ens_dir = MODEL_OUTPUT_DIR / "MacroHub-Ensemble"

    total = len(ORIGIN_DATES)
    bl_cache, bl_yr = {}, {}
    sbe_cache, sbe_yr = {}, {}

    print(f"Generating {total} monthly origin dates for all models...")

    for idx, origin in enumerate(ORIGIN_DATES):
        ds = origin.strftime("%Y-%m-%d")
        print(f"[{idx+1}/{total}] {ds}", flush=True)

        save(generate_rw(series_dict, ds, ALL_TARGETS),
             rw_dir, ds, "MacroHub-RandomWalk")

        save(generate_arma(series_dict, ds, ARMA_TARGETS, bl_cache, bl_yr),
             baseline_arma_dir, ds, "BASELINE-ARMA_BIC")

        save(generate_arma(series_dict, ds, ARMA_TARGETS, sbe_cache, sbe_yr),
             sbe_dir, ds, "SBE_EDS-ARMA_BIC")

        save(generate_ensemble(ds), ens_dir, ds, "MacroHub-Ensemble")

    print("Done!")


if __name__ == "__main__":
    main()
