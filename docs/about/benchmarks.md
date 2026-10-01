# Foundation benchmarks

The hub includes a runner for [FoundationForecast](https://github.com/TimeCopilot/foundationforecast)
with these fixed model versions:

| Model | Checkpoint | Submitted outputs |
|---|---|---|
| Chronos | `amazon/chronos-2` | Five quantiles |
| TimesFM | `google/timesfm-2.5-200m-pytorch` | Mean and five quantiles |
| Toto | `Datadog/Toto-Open-Base-1.0` | Five quantiles from 128 samples |

Included data covers 316 origins per model: monthly origins from January 2000
through March 2026, plus April 15, 2026.

The corrected runner forecasts all available FRED-MD variables for 24 months
using up to 512 monthly observations before the origin, then extracts INDPRO,
CPIAUCSL, PCEPI, and UNRATE for submission. Chronos-2 uses one multivariate
task; Toto uses one shared attention group. TimesFM 2.5 forecasts every series
independently and remains a univariate comparator. Models run without fine-tuning.
Auxiliary series use the transformation codes in the official FRED-MD CSV.
The four hub targets retain their existing monthly log-change/first-difference
transformations and scoring rules.
An isolated missing month, including the month immediately before the origin,
is filled with the previous level before differencing; longer gaps stop the run.
Only data before the origin is used for this fill.
Missing auxiliary observations remain masked for Chronos and Toto; TimesFM's
native preprocessing interpolates them within the historical input window.
Series with fewer than 25 available levels are reported and skipped.

**Existing hub forecast files still use the original target-only setup.** Chronos
and TimesFM ran independently on the four targets; Toto jointly forecast those
four, without the other FRED-MD variables. The corrected full-panel runner has
been validated at April 15, 2026, including checks that changing only PAYEMS
changes INDPRO forecasts for Chronos and Toto. Historical hub files, scores,
and dashboards have not been regenerated with the corrected setup.

FoundationForecast 0.1.10 returns median point forecasts for Chronos-2 and Toto;
these are not submitted as means, so their RMSE uses the median fallback. TimesFM's
requested 5th and 95th percentiles are clamped to its outer native quantile knots
by the wrapper. This affects its interval coverage and quantile loss.

Historical runs use revised observations and may overlap the models' pretraining
data. Treat them as retrospective comparisons, not prospective performance.

## Run locally

Use a separate Python 3.11 environment with sufficient space for PyTorch,
FoundationForecast's dependencies, and downloaded model weights. A CUDA GPU
speeds up inference; the wrapper also supports CPU execution.

```bash
python3.11 -m venv .venv-foundation
.venv-foundation/bin/python -m pip install -r requirements-foundation.txt
.venv-foundation/bin/python target-data/fetch_fred_md.py --panel-only
.venv-foundation/bin/python -m src.models.foundation --origin 2026-04-15
```

To backfill monthly origins, or run just one model:

```bash
.venv-foundation/bin/python -m src.models.foundation --models Chronos --start 2000-01-17 --end 2026-03-17
```

Full-panel forecasts are retained in `model-panel-output/BASELINE-{model}/`.
Resume reuses these validated panel files and rebuilds the hub target subset;
old target-only files without panel forecasts are regenerated. Use `--overwrite`
to rerun inference after an input correction. Invalid input,
missing forecast months, non-finite values, and crossing quantiles stop the run
before that file is saved. No substitute model is used on failure.

Outputs go to `model-output/BASELINE-{model}/`. After generating forecasts,
refresh the scores and website data in the usual hub environment:

```bash
python src/scoring/score_forecasts.py
python src/generate_dashboard_data.py
mkdocs build --strict
```

Models appear in the dashboards once their forecast files and dashboard data
have been generated; adding metadata alone does not create benchmark results.

Check grouping and missing-value masks without downloading weights:

```bash
PYTHONPATH=. .venv-foundation/bin/python tests/panel_inference.py
```
