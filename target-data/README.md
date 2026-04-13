# Target Data

This directory contains the ground truth (observed) values for all target
indicators tracked by the Macro Forecast Hub. The data is sourced from the
**FRED-MD** monthly macroeconomic database.

## Data Source

FRED-MD is maintained by Michael McCracken at the Federal Reserve Bank of
St. Louis. It contains 100+ monthly U.S. macroeconomic time series.

- **Download:** https://research.stlouisfed.org/econ/mccracken/fred-databases/
- **Reference:** McCracken, M.W. and Ng, S. (2016), "FRED-MD: A Monthly
  Database for Macroeconomic Research," *Journal of Business & Economic
  Statistics*, 34:4, 574-589.

## File Structure

| File | Description |
|------|-------------|
| `latest-target_values.csv` | Most recent complete dataset |
| `snapshots/YYYY-MM-DD-target_values.csv` | Historical snapshots (captures data revisions) |
| `transform_codes.csv` | FRED-MD transformation codes for each series |
| `fetch_fred_md.py` | Script to download and process FRED-MD data |

## Column Descriptions

| Column | Description |
|--------|-------------|
| `target` | FRED series identifier (e.g., INDPRO, UNRATE) |
| `location` | Location code (US) |
| `truth_date` | Last day of the reference month (YYYY-MM-DD) |
| `year_month` | Reference month (YYYY-MM) |
| `value` | Observed value in the original units of the series |

## Updating Target Data

```bash
cd target-data
python fetch_fred_md.py
```

This will download the latest FRED-MD vintage and save both a `latest-*` file
and a dated snapshot. Snapshots are important because FRED-MD data undergoes
revisions — earlier vintages may differ from current values.
