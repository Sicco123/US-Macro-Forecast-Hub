# Evaluation Methodology

How forecast accuracy is measured in the Macro Forecast Hub — in the language
of the macroeconomic forecasting literature.

---

## What is being forecast

Forecasts are evaluated in the **stationary transformed space** standard in
empirical macro (FRED-MD conventions), not in levels:

| Target | Space | Interpretation of a forecast value |
|--------|-------|-----------------------------------|
| INDPRO, CPIAUCSL, PCEPI | $\Delta \log x_t$ | Monthly growth rate (log change). E.g. 0.0025 ≈ 0.25% monthly inflation ≈ 3% annualized. |
| UNRATE | $\Delta x_t$ | Monthly change in percentage points. |

Errors are therefore in **monthly growth-rate units**: a CPI MAE of 0.002
means the model misses monthly inflation by about 0.2 percentage points
(≈ 2.4pp annualized) on average.

---

## Point forecast accuracy

Two standard loss functions, each paired with its optimal point forecast:

**Mean Absolute Error** — evaluates the **median** forecast (Q0.5), which
minimizes expected absolute loss:

$$
\text{MAE} = \frac{1}{N} \sum_{i=1}^{N} |q_{0.5,i} - y_i|
$$

**Root Mean Squared Error** — evaluates the **mean** forecast when submitted,
otherwise the median (0.5 quantile). A mean forecast minimizes expected squared
loss, and RMSE penalizes large misses more heavily:

$$
\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (\hat{p}_i - y_i)^2}
$$

Here $\hat{p}_i$ is the submitted mean, or Q0.5 when no mean was submitted.

Squared errors are stored per forecast; the square root is taken when
aggregating, so RMSE can be computed over any subset (target, horizon,
sample period).

---

## Beating the naive benchmark

The downloadable score files include per-cell errors **relative to a naive
benchmark** (`MacroHub-RandomWalk`):

$$
\text{Relative score} = \frac{\text{model score}}{\text{benchmark score}}
$$

For stored `SqErr` rows, this is a squared-error ratio, not an aggregate RMSE
ratio. Values **below 1.0** mean the model beats the naive forecast — the first bar
any macro forecasting model has to clear.

The benchmark is the appropriate naive rule for each space:

- **Growth/inflation targets** ($\Delta \log$, $\Delta$): the
  **Atkeson–Ohanian naive** — forecast every future month as the average of
  the last 12 observed monthly changes. This is the famously hard-to-beat
  benchmark for U.S. inflation.
- **Level targets**: the classic random walk — last observed value carried
  forward.

---

## Rankings

Within each (target, target month, horizon, location, metric) cell, models are
ranked by score (lower is better). Ties share the minimum rank: 1, 1, 3. The
leaderboard averages these cell ranks over the selected origins and horizons.
Overall rank averages the four target-level ranks. A missing target leaves
Overall unavailable. Models can have different coverage; the downloadable score
files retain the scored records for checking comparable samples.
Absolute scores are available separately by target because the units differ.
RMSE is the square root of mean squared error across the selected scored cells.

---

## Prediction intervals

Submissions include quantiles (0.05, 0.10, 0.50, 0.90, 0.95), displayed as
80% and 90% bands in the forecast explorer. **Quantile loss** averages pinball loss equally across all five quantiles:

$$
L = \frac{1}{5} \sum_{\tau \in \{.05,.10,.50,.90,.95\}}
\max(\tau(y-q_\tau), (\tau-1)(y-q_\tau)).
$$

All five quantiles must be present. Lower loss is better; rankings use the same
cell and tie rules as MAE. This uses the standard
[pinball loss definition](https://github.com/scikit-learn/scikit-learn/blob/main/doc/modules/model_evaluation.rst).

## Geometric means

The default leaderboard view is the **geometric mean of benchmark-relative
losses across horizons**. For each target and horizon, losses are first averaged
over the selected origins, pairing each model record with its RandomWalk
benchmark. Their ratio is unit-free; a value below 1 beats the benchmark.
RMSE uses the square root of the mean squared-error ratio.

Missing benchmark records are omitted from both means. A horizon whose mean
benchmark loss is zero is unavailable. A zero mean model loss with a positive
benchmark gives a zero geometric mean. Averaging origins first prevents a single
exact forecast from reducing an entire target's geometric mean to zero.

Overall is the geometric mean of the four target-level geometric means, giving
each indicator equal weight. It is unavailable if any target is missing.

The period buttons exclude forecast **origins** during Covid (March 2020–June
2021) or the GFC (December 2007–June 2009). Both periods are included by default.
From and To include every origin in the selected boundary months. Losses retain
full precision; only their display is formatted.
When either month's observed level is missing, the one-month change is unavailable
for scoring. Training-time gap fills are never treated as observed truth.

## Score history

Evaluation shows monthly losses, a rolling average over up to 12 available
origins, and cumulative losses. With all horizons selected, each origin averages
its scored horizon records. RMSE takes the square root after averaging squared
errors; its cumulative plot totals squared errors. Gaps and unequal model
coverage affect rolling windows and cumulative totals. Drag a chart to zoom or
use the From/To controls. Monthly values are available below the charts.

The additional RW-relative plot divides cumulative model loss by cumulative
RandomWalk loss, using only paired forecast cases. It shows absolute loss for
MAE and squared loss for RMSE, without taking a square root. With all horizons
selected, it pools paired loss sums across horizons. Totals restart at the
selected From month: 1 equals RW and 0.8 means 20% less cumulative loss.
The ratio is unavailable until cumulative RW loss is positive. Origins with
no new paired losses leave the running totals unchanged. Each model uses its
own matching cases, so differing coverage still matters. The reference at 1
remains available when RW is deselected. Ratios are also available in a table.

---

## Evaluation schedule

Forecasts are scored once FRED-MD releases the target month (~10th of the
following month). The current scoring script uses `latest-target_values.csv`, so it evaluates
against the latest downloaded vintage. Historical backfills and revised truth
are included; these results do not establish first-release, real-time performance.

---

## References

- Atkeson, A. and Ohanian, L.E. (2001), "Are Phillips Curves Useful for
  Forecasting Inflation?" *FRB Minneapolis Quarterly Review*, 25(1): 2–11.
- Meese, R.A. and Rogoff, K. (1983), "Empirical exchange rate models of the
  seventies: Do they fit out of sample?" *Journal of International
  Economics*, 14(1–2): 3–24.
- McCracken, M.W. and Ng, S. (2016), "FRED-MD: A Monthly Database for
  Macroeconomic Research," *Journal of Business & Economic Statistics*,
  34(4): 574–589.
