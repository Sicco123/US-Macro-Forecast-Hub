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

**Root Mean Squared Error** — evaluates the **mean** forecast, which minimizes
expected squared loss, and penalizes large misses more heavily:

$$
\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (\hat{\mu}_i - y_i)^2}
$$

Squared errors are stored per forecast; the square root is taken when
aggregating, so RMSE can be computed over any subset (target, horizon,
sample period).

---

## Beating the naive benchmark

Following the Meese–Rogoff tradition, every score is also reported **relative
to a naive benchmark** (`MacroHub-RandomWalk`):

$$
\text{Relative score} = \frac{\text{model score}}{\text{benchmark score}}
$$

Values **below 1.0** mean the model beats the naive forecast — the first bar
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

Within each (target, month, horizon) cell, models are ranked 1…N by score
(lower is better). The leaderboard reports **average ranks** across cells,
which is robust to the occasional blow-up month dominating a mean score.

---

## Prediction intervals

Submissions include quantiles (0.05, 0.10, 0.50, 0.90, 0.95), displayed as
80% and 90% bands in the forecast explorer. Density accuracy (quantile /
pinball loss) is not yet part of the published leaderboard; MAE and RMSE are
the headline metrics.

---

## Evaluation schedule

Forecasts are scored once FRED-MD releases the target month (~10th of the
following month). Because FRED-MD data are revised, scoring uses the
**first-release vintage**; scores may be recomputed against revised data.

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
