# Macro Forecast Hub

A collaborative platform for **probabilistic forecasting** of key U.S.
macroeconomic indicators from the **FRED-MD** monthly dataset.

---

## What is this?

The Macro Forecast Hub brings together forecasters from academia, central banks,
and industry to produce and evaluate probabilistic forecasts of major
macroeconomic time series. Inspired by the collaborative forecasting hub model
pioneered in epidemiology, we apply the same rigorous framework to
macroeconomic forecasting.

### Key Features

| Feature | Description |
|---------|-------------|
| **12 Target Indicators** | Core macro series from FRED-MD including output, employment, prices, and interest rates |
| **Probabilistic Forecasts** | Full predictive distributions via 23 quantile levels |
| **Monthly Frequency** | Forecasts submitted between the 10th and 17th of each month |
| **1-4 Month Horizons** | Plus nowcasts for the current month |
| **Automated Evaluation** | Weighted Interval Score (WIS) scoring against realized values |
| **Hub Ensemble** | Median combination of all submitted models |

---

## Target Indicators

| Category | Indicator | Description |
|----------|-----------|-------------|
| **Real Activity** | INDPRO | Industrial Production Index |
| | PAYEMS | Total Nonfarm Payrolls |
| | DPCERA3M086SBEA | Real Personal Consumption |
| | RETAILx | Retail Sales |
| **Labor Market** | UNRATE | Unemployment Rate |
| **Prices** | CPIAUCSL | Consumer Price Index |
| | PCEPI | PCE Price Index |
| **Interest Rates** | FEDFUNDS | Federal Funds Rate |
| | GS10 | 10-Year Treasury |
| | TB3MS | 3-Month Treasury Bill |
| **Housing** | HOUST | Housing Starts |
| **Money & Credit** | M2SL | M2 Money Stock |

---

## Quick Start

Want to contribute forecasts? See the [How to Submit](participate/how-to-submit.md) guide.

Want to explore the data? Check the [Latest Forecasts](forecasts/latest.md) page.

---

## Data Source

All target data comes from [FRED-MD](https://research.stlouisfed.org/econ/mccracken/fred-databases/),
a monthly macroeconomic database maintained by the Federal Reserve Bank of
St. Louis.

> McCracken, M.W. and Ng, S. (2016), "FRED-MD: A Monthly Database for
> Macroeconomic Research," *Journal of Business & Economic Statistics*, 34:4,
> 574-589.
