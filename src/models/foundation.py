"""FoundationForecast benchmarks in the hub's monthly change space.

Run from the repository root with `python -m src.models.foundation --help`.
Historical runs use revised truth, not historical release vintages.
"""
import argparse
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .baseline import LOG_DIFF_TARGETS, REQUIRED_QUANTILES, monthly_levels
from ..validation.validate_forecast import REQUIRED_COLUMNS

HUB_ROOT = Path(__file__).resolve().parents[2]
TARGETS = ("INDPRO", "CPIAUCSL", "PCEPI", "UNRATE")
CHECKPOINTS = {
    "Chronos": "amazon/chronos-2",
    "TimesFM": "google/timesfm-2.5-200m-pytorch",
    "Toto": "Datadog/Toto-Open-Base-1.0",
}
HORIZONS = 24
CONTEXT = 512
FRED_MD_PATH = HUB_ROOT / "target-data" / "latest-fred-md.csv"


def load_fred_panel(path):
    """Read the official wide CSV, including its transformation-code row."""
    panel = pd.read_csv(path)
    if panel.columns[0] != "sasdate" or panel.iloc[0, 0] != "Transform:":
        raise ValueError("Expected an official FRED-MD CSV with a Transform: row")
    codes = pd.to_numeric(panel.iloc[0, 1:], errors="raise")
    if not codes.isin(range(1, 8)).all():
        raise ValueError("Invalid FRED-MD transformation codes")
    levels = panel.iloc[1:].copy()
    levels["truth_date"] = pd.to_datetime(levels.pop("sasdate"), format="%m/%d/%Y") + pd.offsets.MonthEnd(0)
    truth = levels.melt(id_vars="truth_date", var_name="target", value_name="value")
    return truth, codes.astype(int).to_dict()


def prepare_history(truth, origin, codes=None):
    """Transform every available panel series; keep missing auxiliary values masked."""
    if not set(TARGETS).issubset(truth.target):
        raise ValueError("FRED-MD panel is missing hub targets")
    frames = []
    for target, group in truth.groupby("target", sort=True):
        history = group[["truth_date", "value"]].copy()
        history["truth_date"] = pd.to_datetime(history.truth_date)
        history = history.loc[history.truth_date < pd.Timestamp(origin)].sort_values("truth_date")
        if target in TARGETS:
            history = history.dropna(subset=["value"])
            if len(history) < 25:
                raise ValueError(f"{target}: at least 25 monthly levels required before {origin}")
            levels = monthly_levels(history, origin)
            code = 5 if target in LOG_DIFF_TARGETS else 2
        else:
            if codes is None or target not in codes:
                raise ValueError(f"{target}: missing FRED-MD transformation code")
            code = codes[target]
            dates = pd.DatetimeIndex(history.truth_date)
            if dates.empty or dates.has_duplicates or not dates.is_month_end.all():
                raise ValueError(f"{target}: invalid monthly dates")
            if np.isinf(history.value.to_numpy(dtype=float)).any():
                raise ValueError(f"{target}: infinite input levels")
            if history.value.notna().sum() < 25:
                print(f"Skipping {target}: fewer than 25 levels before {origin}", flush=True)
                continue
            months = pd.date_range(dates.min(), pd.Timestamp(origin) - pd.offsets.MonthEnd(1), freq="ME")
            levels = history.set_index("truth_date").value.reindex(months).ffill(limit=1)
        dates, values = levels.index, levels.to_numpy(dtype=float)
        if code in (4, 5, 6) and (values <= 0).any():
            raise ValueError(f"{target}: invalid levels in input history")
        work = pd.Series(np.log(values) if code in (4, 5, 6) else values, index=dates)
        if code == 7:
            work = work.pct_change(fill_method=None).diff()
        else:
            for _ in range({2: 1, 3: 2, 5: 1, 6: 2}.get(code, 0)):
                work = work.diff()
        work = work.loc[work.first_valid_index():].tail(CONTEXT)
        if work.notna().sum() < 24 or np.isinf(work.to_numpy()).any():
            raise ValueError(f"{target}: insufficient or invalid transformed history")
        frames.append(pd.DataFrame({"unique_id": target, "ds": work.index, "y": work.values}))
    return pd.concat(frames, ignore_index=True)


def forecast_panel(model, history, name):
    """Keep the whole panel in one multivariate task for Chronos-2 and Toto."""
    if name == "TimesFM":
        return model.forecast(history, h=HORIZONS, freq="ME", quantiles=REQUIRED_QUANTILES)
    import torch

    panel = history.pivot(index="ds", columns="unique_id", values="y").tail(CONTEXT)
    values = torch.tensor(panel.to_numpy(dtype=np.float32).T)
    with model._get_model() as native:
        if name == "Chronos":
            quantiles, _ = native.predict_quantiles(
                [values], prediction_length=HORIZONS, quantile_levels=REQUIRED_QUANTILES,
                batch_size=len(panel.columns), context_length=CONTEXT)
            predictions = quantiles[0].cpu().numpy()
        else:
            from toto.data.util.dataset import MaskedTimeseries, pad_array, replace_extreme_values
            values = values.to(model.device)
            inputs = MaskedTimeseries(
                series=values.nan_to_num(), padding_mask=torch.isfinite(values),
                id_mask=torch.zeros_like(values, dtype=torch.long),
                timestamp_seconds=torch.zeros_like(values),
                time_interval_seconds=torch.ones(len(values), device=model.device))
            qs = torch.tensor(REQUIRED_QUANTILES, device=model.device)
            stride = native.model.patch_embed.stride
            if HORIZONS <= stride:
                # All samples share the same context within the first output patch.
                # Reuse its distribution instead of repeating the backbone 128 times.
                with torch.no_grad():
                    series = pad_array(inputs.series.unsqueeze(0), stride)
                    mask = pad_array(inputs.padding_mask.unsqueeze(0), stride)
                    ids = torch.zeros_like(series, dtype=torch.long)
                    embeddings, loc, scale = native.model.backbone(
                        series, mask, ids, scaling_prefix_length=series.shape[-1])
                    future = slice(-stride, -stride + HORIZONS if HORIZONS < stride else None)
                    base = native.model.output_distribution(embeddings[:, :, future, :])
                    distribution = native.create_affine_transformed(base, loc[:, :, future], scale[:, :, future])
                    samples = replace_extreme_values(distribution.sample((model.num_samples,)))
                    quantiles = torch.quantile(samples, qs, dim=0)
            else:
                result = native.forecast(inputs, prediction_length=HORIZONS,
                                         num_samples=model.num_samples,
                                         samples_per_batch=model.samples_per_batch, use_kv_cache=True)
                quantiles = result.quantile(qs)
            predictions = quantiles[:, 0].permute(1, 2, 0).cpu().numpy()
    months = pd.date_range(panel.index[-1] + pd.offsets.MonthEnd(1), periods=HORIZONS, freq="ME")
    return pd.DataFrame({
        "unique_id": np.repeat(panel.columns, HORIZONS), "ds": np.tile(months, len(panel.columns)),
        **{f"{name}-q-{100 * q:g}": predictions[:, :, i].ravel()
           for i, q in enumerate(REQUIRED_QUANTILES)}})


def hub_rows(forecasts, history, origin, model):
    """Convert and validate the pinned package's percentile column convention."""
    qcols = [f"{model}-q-{100 * q:g}" for q in REQUIRED_QUANTILES]
    # In FoundationForecast 0.1.10, Chronos-2 and Toto return medians as their
    # point column. Do not mislabel those as means for RMSE evaluation.
    value_cols = qcols + ([model] if model == "TimesFM" else [])
    required = {"unique_id", "ds", *value_cols}
    if not required.issubset(forecasts.columns):
        raise ValueError(f"{model}: missing forecast columns {required - set(forecasts.columns)}")
    if set(forecasts.unique_id) != set(history.unique_id):
        raise ValueError(f"{model}: output must contain every input panel series")
    rows = []
    for target in sorted(history.unique_id.unique()):
        block = forecasts.loc[forecasts.unique_id == target].sort_values("ds")
        last = history.loc[history.unique_id == target, "ds"].max()
        expected = pd.date_range(last + pd.offsets.MonthEnd(1), periods=HORIZONS, freq="ME")
        if not pd.DatetimeIndex(pd.to_datetime(block.ds)).equals(expected):
            raise ValueError(f"{model}/{target}: expected 24 consecutive forecast months")
        values = block[value_cols].to_numpy(dtype=float)
        if not np.isfinite(values).all() or (np.diff(values[:, :5], axis=1) < 0).any():
            raise ValueError(f"{model}/{target}: non-finite or crossing quantiles")
        if target not in TARGETS:
            continue
        for horizon, (month, predictions) in enumerate(zip(expected, values)):
            base = dict(origin_date=str(origin), target=target,
                        target_end_date=month.strftime("%Y-%m-%d"), horizon=horizon, location="US")
            for q, value in zip(REQUIRED_QUANTILES, predictions[:5]):
                rows.append({**base, "output_type": "quantile", "output_type_id": q, "value": float(value)})
            if model == "TimesFM":
                rows.append({**base, "output_type": "mean", "output_type_id": "", "value": float(predictions[-1])})
    return pd.DataFrame(rows, columns=REQUIRED_COLUMNS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+", choices=CHECKPOINTS, default=list(CHECKPOINTS))
    parser.add_argument("--origin", type=date.fromisoformat, help="One forecast origin (YYYY-MM-DD)")
    parser.add_argument("--start", type=date.fromisoformat, help="First monthly backfill origin")
    parser.add_argument("--end", type=date.fromisoformat, help="Last monthly backfill origin")
    parser.add_argument("--fred-md", type=Path, default=FRED_MD_PATH, help="Official full-panel FRED-MD CSV")
    parser.add_argument("--output-dir", type=Path, default=HUB_ROOT / "model-output")
    parser.add_argument("--panel-output-dir", type=Path, default=HUB_ROOT / "model-panel-output")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--overwrite", action="store_true", help="Regenerate existing origins")
    args = parser.parse_args()
    if bool(args.start) != bool(args.end) or bool(args.origin) == bool(args.start):
        parser.error("choose --origin OR both --start and --end")
    if args.start and (args.start > args.end or args.start.day != 17 or args.end.day != 17):
        parser.error("backfill endpoints must be ordered dates on the 17th")
    origins = [args.origin] if args.origin else [d.date().replace(day=17) for d in pd.date_range(
        args.start.replace(day=1), args.end.replace(day=1), freq="MS")]
    truth, codes = load_fred_panel(args.fred_md)
    # Validate all requested inputs before downloading any model weights.
    histories = {origin: prepare_history(truth, origin, codes) for origin in origins}
    try:
        import torch
        from foundationforecast.models import Chronos, TimesFM, Toto
    except ImportError as exc:
        raise SystemExit("Install requirements-foundation.txt in a separate Python 3.11 environment.") from exc
    classes = {"Chronos": Chronos, "TimesFM": TimesFM, "Toto": Toto}
    for name in args.models:
        kwargs = {"repo_id": CHECKPOINTS[name], "alias": name, "batch_size": 4}
        if name != "Chronos":
            kwargs["context_length"] = CONTEXT
        if name == "TimesFM":
            kwargs.update(batch_size=16, per_core_batch_size=16)
        model = classes[name](**kwargs)
        try:
            for origin, history in histories.items():
                path = args.output_dir / f"BASELINE-{name}" / f"{origin}-BASELINE-{name}.csv"
                panel_path = args.panel_output_dir / f"BASELINE-{name}" / path.name
                if panel_path.exists() and not args.overwrite:
                    print(f"Using existing panel forecasts {panel_path}", flush=True)
                    forecasts = pd.read_csv(panel_path, parse_dates=["ds"])
                else:
                    np.random.seed(args.seed)
                    torch.manual_seed(args.seed)
                    print(f"Forecasting {name} at {origin}: {history.unique_id.nunique()} panel variables ({CHECKPOINTS[name]})", flush=True)
                    forecasts = forecast_panel(model, history, name)
                output = hub_rows(forecasts, history, origin, name)
                panel_path.parent.mkdir(parents=True, exist_ok=True)
                temporary = panel_path.with_suffix(".csv.tmp")
                forecasts.to_csv(temporary, index=False, float_format="%.17g")
                temporary.replace(panel_path)
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix(".csv.tmp")
                output.to_csv(temporary, index=False)
                temporary.replace(path)
                print(f"Saved {len(output)} rows to {path}", flush=True)
        finally:
            model.clear_model_cache()


if __name__ == "__main__":
    main()
