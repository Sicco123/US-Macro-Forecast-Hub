# Evaluation Methodology

This page describes how forecast accuracy is measured in the Macro Forecast Hub.

---

## Overview

Each submission provides **quantile forecasts** at levels 0.05, 0.10, 0.50,
0.90, and 0.95, plus a **mean** point forecast. Different metrics use different
components of the submission:

| Metric | Uses | Measures |
|--------|------|----------|
| WIS | All quantiles | Overall distributional accuracy |
| MAE | Median forecast (Q0.5) | Point forecast accuracy (absolute) |
| RMSE | Mean forecast | Point forecast accuracy (squared) |
| Coverage | Quantile pairs | Calibration of prediction intervals |
| Interval Width | Quantile pairs | Sharpness of prediction intervals |
| MeanQS | All quantiles | Average quantile loss |

---

## Weighted Interval Score (WIS)

The primary evaluation metric is the **Weighted Interval Score**, a proper
scoring rule for quantile forecasts that generalizes the absolute error and
rewards both calibration and sharpness.

For a set of quantile levels $\tau_1, \ldots, \tau_K$ and their corresponding
forecast values $q_1, \ldots, q_K$, the WIS is the average quantile score:

$$
\text{WIS} = \frac{1}{K} \sum_{k=1}^{K} \text{QS}_{\tau_k}
$$

where the **quantile score** (pinball loss) at level $\tau$ is:

$$
\text{QS}_{\tau}(q, y) =
\begin{cases}
\tau \cdot (y - q) & \text{if } y \geq q \\
(1 - \tau) \cdot (q - y) & \text{if } y < q
\end{cases}
$$

and $y$ denotes the observed value.

### Properties

- **Proper scoring rule**: The WIS is minimized when the reported quantiles
  match the true predictive distribution.
- **Decomposition**: WIS can be decomposed into dispersion, underprediction,
  and overprediction components.
- **Reduces to MAE**: When only the median ($\tau = 0.5$) is provided, the
  quantile score equals the absolute error.

---

## Mean Absolute Error (MAE)

The MAE evaluates the accuracy of the **median forecast** (Q0.5):

$$
\text{MAE} = \frac{1}{N} \sum_{i=1}^{N} |q_{0.5,i} - y_i|
$$

The median is the natural point forecast to pair with absolute error, since it
minimizes expected absolute loss. Lower values indicate better point forecast
accuracy.

---

## Root Mean Squared Error (RMSE)

The RMSE evaluates the accuracy of the **mean forecast**:

$$
\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (\hat{\mu}_i - y_i)^2}
$$

where $\hat{\mu}_i$ is the mean forecast. The mean is the natural point
forecast to pair with squared error, since it minimizes expected squared loss.
The RMSE penalizes large errors more heavily than the MAE.

Internally, we store the **squared error** $({\hat{\mu}_i - y_i})^2$ for each
individual forecast, then compute the RMSE as $\sqrt{\text{mean}(\text{squared errors})}$
when aggregating across forecasts.

---

## Coverage

Coverage measures how often the observed value falls within a prediction
interval. For a $(1-\alpha)\times 100\%$ prediction interval
$[q_{\alpha/2},\; q_{1-\alpha/2}]$:

$$
\text{Coverage}_{1-\alpha} = \frac{1}{N} \sum_{i=1}^{N}
\mathbf{1}\!\left(q_{\alpha/2,i} \leq y_i \leq q_{1-\alpha/2,i}\right)
$$

We evaluate two intervals:

| Interval | Quantiles | Nominal Coverage |
|----------|-----------|-----------------|
| 80% PI | Q0.10 -- Q0.90 | 80% |
| 90% PI | Q0.05 -- Q0.95 | 90% |

A well-calibrated model has empirical coverage close to the nominal level.
Coverage above the nominal level indicates the model is conservative (too wide);
below indicates overconfidence.

---

## Interval Width (Sharpness)

The width of a prediction interval measures sharpness --- how informative the
forecasts are. Among models with the same calibration, narrower intervals are
preferred:

$$
\text{IntervalWidth}_{1-\alpha} = q_{1-\alpha/2} - q_{\alpha/2}
$$

---

## Mean Quantile Score (MeanQS)

The average pinball loss across all submitted quantile levels. Closely related
to the WIS and provides a complementary view of quantile forecast accuracy:

$$
\text{MeanQS} = \frac{1}{K} \sum_{k=1}^{K} \text{QS}_{\tau_k}(q_{\tau_k}, y)
$$

Lower is better.

---

## Relative Scores and Rankings

- **Relative WIS / MAE / RMSE**: The model's score divided by the Random Walk
  baseline's score. Values below 1.0 indicate the model outperforms the
  baseline.
- **Rankings**: Within each (target, date, horizon) group, models are ranked.
  For most metrics, lower is better. For Coverage metrics, models are ranked
  by their absolute deviation from the nominal level (closest to nominal is
  rank 1).

---

## Evaluation Schedule

Forecasts are scored once the target data becomes available (around the 10th of
each month). Due to data revisions in FRED-MD, we use the **first-release**
vintage for initial scoring and may re-score against revised data.

---

## References

- Bracher, J., Ray, E.L., Gneiting, T. and Reich, N.G. (2021), "Evaluating
  epidemic forecasts in an interval format," *PLOS Computational Biology*,
  17(1): e1008618.
- Gneiting, T. and Raftery, A.E. (2007), "Strictly Proper Scoring Rules,
  Prediction, and Estimation," *Journal of the American Statistical
  Association*, 102(477): 359-378.
