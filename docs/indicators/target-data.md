# Target Data

Ground truth values are sourced from the FRED-MD monthly macroeconomic database,
maintained by the Federal Reserve Bank of St. Louis.

---

## Data Source

[FRED-MD](https://research.stlouisfed.org/econ/mccracken/fred-databases/) is
updated monthly, typically in the first week of each month. The dataset contains
100+ monthly time series spanning real activity, prices, interest rates, money
aggregates, and more.

---

## Data Revisions

Macroeconomic data is subject to revisions. The value first reported for a given
month may be revised in subsequent releases. The Macro Forecast Hub handles this
by:

1. **Snapshots**: Each FRED-MD download is saved as a dated snapshot in
   `target-data/snapshots/`
2. **First-release scoring**: Initial forecast evaluation uses the first
   available vintage
3. **Revised scoring**: Scores may be updated against later vintages

This approach mirrors real-time forecasting conditions and ensures fair
evaluation.

---

## Transformation Codes

FRED-MD provides transformation codes that indicate how each series should be
transformed to achieve stationarity:

| Code | Transformation |
|------|---------------|
| 1 | No transformation (levels) |
| 2 | First difference: $\Delta x_t$ |
| 3 | Second difference: $\Delta^2 x_t$ |
| 4 | Log: $\log(x_t)$ |
| 5 | Log first difference: $\Delta \log(x_t)$ |
| 6 | Log second difference: $\Delta^2 \log(x_t)$ |
| 7 | Percent change: $\Delta(x_t/x_{t-1} - 1)$ |

!!! info "Forecasts are in levels"
    The hub collects forecasts in the **original units** (levels) of each
    series, not in transformed form. Participants may use any transformation
    internally but must convert back to levels for submission.

---

## Updating Target Data

The automated GitHub Actions workflow fetches new data on the 10th of
each month. To update manually:

```bash
python target-data/fetch_fred_md.py
```
