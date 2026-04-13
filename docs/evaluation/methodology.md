# Evaluation Methodology

This page describes how forecast accuracy is measured in the Macro Forecast Hub.

---

## Weighted Interval Score (WIS)

The primary evaluation metric is the **Weighted Interval Score**, a proper
scoring rule for quantile forecasts.

For a set of central prediction intervals at levels
$\alpha_1, \alpha_2, \ldots, \alpha_K$ and a point forecast (median), the WIS
is defined as:

$$
\text{WIS} = \frac{1}{K + 0.5} \left( w_0 \cdot |y - m| + \sum_{k=1}^{K} w_k \cdot IS_{\alpha_k}(y) \right)
$$

where:

- $y$ is the observed value
- $m$ is the median forecast
- $IS_{\alpha}$ is the interval score at level $\alpha$
- $w_k$ are the weights (equal to $\alpha_k / 2$)

The interval score for a $(1-\alpha)$ prediction interval $[l, u]$ is:

$$
IS_{\alpha}(y) = (u - l) + \frac{2}{\alpha}(l - y) \cdot \mathbf{1}(y < l) + \frac{2}{\alpha}(y - u) \cdot \mathbf{1}(y > u)
$$

### Properties

- **Proper**: The WIS is minimized when the reported quantiles match the true
  predictive distribution
- **Decomposition**: WIS = dispersion + underprediction + overprediction
- **Generalizes MAE**: When only the median is provided, WIS reduces to the
  mean absolute error

---

## Additional Metrics

| Metric | Description |
|--------|-------------|
| **MAE** | Mean Absolute Error of the median forecast |
| **Coverage** | Empirical coverage of the 50% and 95% prediction intervals |
| **Relative WIS** | WIS divided by the baseline model's WIS (< 1.0 is better) |

---

## Evaluation Schedule

Forecasts are scored once the target data becomes available. Due to data
revisions in FRED-MD, we use the **first-release** vintage for initial scoring
and may re-score against revised data.

---

## References

- Bracher, J., Ray, E.L., Gneiting, T. and Reich, N.G. (2021), "Evaluating
  epidemic forecasts in an interval format," *PLOS Computational Biology*,
  17(1): e1008618.
- Gneiting, T. and Raftery, A.E. (2007), "Strictly Proper Scoring Rules,
  Prediction, and Estimation," *Journal of the American Statistical
  Association*, 102(477): 359-378.
