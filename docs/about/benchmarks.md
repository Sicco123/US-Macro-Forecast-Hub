# Foundation benchmarks

The hub's BASELINE team runs [FoundationForecast](https://github.com/TimeCopilot/foundationforecast)
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

All 316 origins per model have been regenerated with the full 126-variable panel,
replacing the original target-only results. The ensemble, scores, and dashboard
data have been rebuilt from these forecasts. Full-panel files retain every
variable; the hub submissions contain only the four evaluated targets.
Changing only PAYEMS changes INDPRO forecasts for Chronos and Toto, confirming
that the joint models use cross-variable information.

Toto's 24-month horizon fits within its first output patch. Its predictive
distribution is computed once, then 128 samples are drawn from it. This avoids
repeating the same context computation while preserving the native distribution;
a regression check compares the result with native inference, including masks.

FoundationForecast 0.1.10 returns median point forecasts for Chronos-2 and Toto;
these are not submitted as means, so their RMSE uses the median fallback. TimesFM's
requested 5th and 95th percentiles are clamped to its outer native quantile knots
by the wrapper. This affects its interval coverage and quantile loss.

Historical runs use revised observations and may overlap the models' pretraining
data. Treat them as retrospective comparisons, not prospective performance.

## How they are run

The runner lives in the separate `MacroHub_models` repository, together with
BASELINE-ARMA_BIC. Each month on the 17th it reads this hub's target data,
forecasts the new origin, and submits the files by pull request through the same
validation as any other team. Full-panel forecasts are retained in
`model-panel-output/BASELINE-{model}/`. Invalid input, missing forecast months,
non-finite values, and crossing quantiles stop the run before a file is saved.
No substitute model is used on failure.

Outputs go to `model-output/BASELINE-{model}/`. After generating forecasts,
refresh the scores and website data in the usual hub environment:

```bash
python src/scoring/score_forecasts.py
python src/generate_dashboard_data.py
mkdocs build --strict
```

Models appear in the dashboards once their forecast files and dashboard data
have been generated; adding metadata alone does not create benchmark results.
