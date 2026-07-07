"""
Generate pseudo-real-time forecasts from 2000-01 to 2026-03 for all models.
Each origin date produces 24-month-ahead forecasts (horizons 0--23).

Models:
  - MacroHub-RandomWalk   (all 12 targets)
  - BASELINE-ARMA_BIC     (INDPRO, CPIAUCSL, PCEPI, UNRATE)
  - MacroHub-Ensemble     (median across models per target)

Comparison space (forecasts and truth evaluated in same transformed scale):
  INDPRO   → Δlog(x)   monthly log difference
  CPIAUCSL → Δlog(x)   monthly log difference
  PCEPI    → Δlog(x)   monthly log difference
  UNRATE   → Δx        monthly first difference
  all others → level (unchanged)

Speed:
  - ARMA on rolling 10-year (120 obs) window, re-selected every month
  - CSS estimation for grid search (fast); MLE only for final forecast
  - Vectorised quantile generation via scipy broadcasting
  - Single process (no multiprocessing, safe on 16 GB machines)
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
N_Q = len(QUANTILES)
N_AHEAD = 24

MAX_P = 6
MAX_Q = 4
MIN_HISTORY = 60
MAX_HISTORY = 120  # 10-year rolling window

ORIGIN_DATES = [
    pd.Timestamp(y, m, 17)
    for y in range(2000, 2027)
    for m in range(1, 13)
    if pd.Timestamp(y, m, 17) <= pd.Timestamp("2026-03-17")
]

# Pre-build grid once
GRID = [(p, q) for p in range(MAX_P + 1) for q in range(MAX_Q + 1)
        if not (p == 0 and q == 0)]

COLUMNS = ["origin_date", "target", "target_end_date", "horizon",
           "location", "output_type", "output_type_id", "value"]


def last_day_of_month(year: int, month: int) -> str:
    if month == 12:
        nxt = pd.Timestamp(year + 1, 1, 1)
    else:
        nxt = pd.Timestamp(year, month + 1, 1)
    return (nxt - pd.Timedelta(days=1)).strftime("%Y-%m-%d")


# ── Pre-process ─────────────────────────────────────────────────────────────

def prepare_target_series(target_df):
    out = {}
    for target in ALL_TARGETS:
        sdf = target_df[target_df["target"] == target].sort_values("truth_date")
        out[target] = (sdf["truth_date"].values, sdf["value"].values.astype(float))
    return out


def slice_before(dates, values, origin_ts):
    idx = np.searchsorted(dates, origin_ts, side="left")
    return values[:idx], dates[:idx]


def _target_end_dates(last_date):
    out = []
    for h in range(N_AHEAD):
        tm = last_date + pd.DateOffset(months=h + 1)
        out.append(last_day_of_month(tm.year, tm.month))
    return out


# ── Row builder (tuple-based, fast) ────────────────────────────────────────

def _build_rows(origin_str, target, teds, qval_matrix, mean_arr):
    rows = []
    for h in range(N_AHEAD):
        ted = teds[h]
        mv = round(float(mean_arr[h]), 6)
        for qi in range(N_Q):
            rows.append((origin_str, target, ted, h, "US", "quantile",
                         float(QUANTILES[qi]), round(float(qval_matrix[h, qi]), 6)))
        rows.append((origin_str, target, ted, h, "US", "mean", "", mv))
    return rows


# ── Random Walk ─────────────────────────────────────────────────────────────

def generate_rw(series_dict, origin_str, targets):
    origin_ts = np.datetime64(origin_str)
    all_rows = []

    for target in targets:
        dates, values = series_dict[target]
        vals, dts = slice_before(dates, values, origin_ts)
        if len(vals) < 24:
            continue

        last_date = pd.Timestamp(dts[-1])
        teds = _target_end_dates(last_date)

        # Transform to comparison space for the four key targets
        if target in LOG_DIFF_TARGETS:
            if np.any(vals <= 0):
                continue
            work = np.diff(np.log(vals))   # monthly log differences
        elif target in DIFF_TARGETS:
            work = np.diff(vals)           # monthly first differences
        else:
            work = vals                    # levels (all other targets)

        last_val = work[-1]

        qval_matrix = np.empty((N_AHEAD, N_Q))
        for h in range(N_AHEAD):
            hh = max(h, 1)
            if len(work) > hh:
                errors = work[hh:] - work[:-hh]
                errors = errors[np.isfinite(errors)]
            else:
                errors = np.array([0.0])
            if len(errors) < 24:
                e1 = work[1:] - work[:-1]
                e1 = e1[np.isfinite(e1)]
                errors = e1 * np.sqrt(hh) if len(e1) > 0 else np.array([0.0])
            qval_matrix[h] = last_val + np.quantile(errors, QUANTILES)

        all_rows.extend(_build_rows(
            origin_str, target, teds, qval_matrix, np.full(N_AHEAD, last_val)))

    return all_rows


# ── ARIMA(p,d,q)-BIC with FRED-MD transformations ─────────────────────────
#
# Each target uses its standard FRED-MD transformation code (tcode):
#   1 = levels          4 = log            7 = Δ(x/x_{-1})
#   2 = Δx              5 = Δlog(x)
#   3 = Δ²x             6 = Δ²log(x)
#
# We map tcode → (take_log, d) and fit ARIMA(p, d, q) on the (possibly
# log-transformed) levels.  statsmodels handles differencing internally,
# so get_forecast() returns predictions in the (log-)level scale.  We then
# exp() back if needed.  Quantiles transform correctly since exp is monotone.

# Targets whose forecasts (and truth) are in log-diff or diff space
LOG_DIFF_TARGETS = {"INDPRO", "CPIAUCSL", "PCEPI"}
DIFF_TARGETS = {"UNRATE"}

# TCODE used only to determine whether to take log before differencing
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


def select_arima_order(window, d):
    """BIC grid search over ARIMA(p, d, q) using CSS estimation (fast)."""
    best_bic, best_order = np.inf, (1, 0)
    for p, q in GRID:
        try:
            res = ARIMA(window, order=(p, d, q)).fit(
                method="css", method_kwargs={"maxiter": 100})
            if res.bic < best_bic:
                best_bic = res.bic
                best_order = (p, q)
        except Exception:
            continue
    return best_order


def generate_arma(series_dict, origin_str, targets):
    origin_ts = np.datetime64(origin_str)
    all_rows = []

    for target in targets:
        dates, values = series_dict[target]
        vals, dts = slice_before(dates, values, origin_ts)
        if len(vals) < MIN_HISTORY:
            continue

        last_date = pd.Timestamp(dts[-1])
        teds = _target_end_dates(last_date)

        take_log, _ = _tcode_params(TCODE[target])
        raw = vals[-MAX_HISTORY:]

        if take_log:
            if np.any(raw <= 0):
                continue  # log not safe
            raw = np.log(raw)

        # Pre-difference: ARMA(p,0,q) on the first-differenced (log-)series
        # Forecasts are directly in Δlog or Δ space — no back-transform needed
        window = np.diff(raw)

        # Fast CSS grid search over ARMA(p, 0, q)
        p, q = select_arima_order(window, 0)

        # Final forecast with MLE for proper uncertainty
        try:
            res = ARIMA(window, order=(p, 0, q)).fit(
                method_kwargs={"maxiter": 200})
            fc = res.get_forecast(steps=N_AHEAD)
            pt = np.array(fc.predicted_mean)   # in Δlog or Δ space
            st = np.array(fc.se_mean)
        except Exception:
            continue

        # Quantiles in Δlog / Δ space — output directly, no back-transform
        qval_matrix = stats.norm.ppf(
            QUANTILES[np.newaxis, :],
            loc=pt[:, np.newaxis],
            scale=st[:, np.newaxis],
        )
        mean_arr = pt

        all_rows.extend(_build_rows(origin_str, target, teds, qval_matrix, mean_arr))

    return all_rows


# ── Process one origin date ────────────────────────────────────────────────

def process_origin(series_dict, origin, rw_dir, bl_dir):
    """Process a single origin date: RW + ARMA, save CSVs."""
    ds = origin.strftime("%Y-%m-%d")

    # Random Walk (all 12 targets)
    rw_rows = generate_rw(series_dict, ds, ALL_TARGETS)
    if rw_rows:
        pd.DataFrame(rw_rows, columns=COLUMNS).to_csv(
            rw_dir / f"{ds}-MacroHub-RandomWalk.csv", index=False)

    # ARMA (4 targets)
    arma_rows = generate_arma(series_dict, ds, ARMA_TARGETS)
    if arma_rows:
        df = pd.DataFrame(arma_rows, columns=COLUMNS)
        df.to_csv(bl_dir / f"{ds}-BASELINE-ARMA_BIC.csv", index=False)

    return ds


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
        return None

    combined = pd.concat(dfs, ignore_index=True)
    gcols = ["origin_date", "target", "target_end_date", "horizon",
             "location", "output_type", "output_type_id"]

    agg = combined.groupby(gcols).agg(
        value=("value", lambda x: round(float(x.astype(float).median()), 2)),
        n=("_model", "nunique"),
    ).reset_index()
    agg = agg[agg["n"] >= 2].drop(columns="n")
    return agg if len(agg) > 0 else None


def save_df(df, out_dir, origin_str, model_name):
    if df is not None:
        df.to_csv(out_dir / f"{origin_str}-{model_name}.csv", index=False)


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    target_df = pd.read_csv(TARGET_DATA_PATH)
    target_df["truth_date"] = pd.to_datetime(target_df["truth_date"])
    series_dict = prepare_target_series(target_df)

    rw_dir = MODEL_OUTPUT_DIR / "MacroHub-RandomWalk"
    bl_dir = MODEL_OUTPUT_DIR / "BASELINE-ARMA_BIC"
    ens_dir = MODEL_OUTPUT_DIR / "MacroHub-Ensemble"

    # Create output directories upfront
    for d in [rw_dir, bl_dir, ens_dir]:
        d.mkdir(parents=True, exist_ok=True)

    total = len(ORIGIN_DATES)
    print(f"Phase 1: Generating {total} origin dates × 24-month horizons (single process)...")

    # Phase 1: RW + ARMA sequentially
    for idx, origin in enumerate(ORIGIN_DATES):
        ds = process_origin(series_dict, origin, rw_dir, bl_dir)
        print(f"\r  [{idx+1}/{total}] {ds}", end="", flush=True)

    # Phase 2: Ensemble (reads files written in phase 1)
    print(f"\nPhase 2: Generating ensembles for {total} origin dates...")
    for idx, origin in enumerate(ORIGIN_DATES):
        ds = origin.strftime("%Y-%m-%d")
        print(f"\r  Ensemble [{idx+1}/{total}] {ds}", end="", flush=True)
        save_df(generate_ensemble(ds), ens_dir, ds, "MacroHub-Ensemble")

    print("\nDone!")


if __name__ == "__main__":
    main()
