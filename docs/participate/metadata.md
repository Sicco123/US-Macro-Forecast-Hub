# Model Metadata

Each participating model must have a metadata file describing the team, model,
and methodology. This file is submitted once and updated as needed.

---

## File Format

```
model-metadata/{team_abbr}-{model_abbr}.yml
```

The file must be valid YAML and conform to the schema in
`hub-config/model-metadata-schema.json`.

---

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `team_name` | string (max 50) | Full team name |
| `team_abbr` | string (max 16) | Team abbreviation (alphanumeric + underscore) |
| `model_name` | string (max 50) | Full model name |
| `model_abbr` | string (max 16) | Model abbreviation (alphanumeric + underscore) |
| `model_contributors` | list | People contributing to the model |
| `team_model_designation` | enum | `primary`, `secondary`, `proposed`, or `other` |
| `methods` | string (max 200) | Brief description of the methodology |
| `data_inputs` | string | Data sources used |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `model_version` | string | Version identifier |
| `methods_long` | string | Detailed methodology description |
| `license` | enum | Output license (e.g., `CC-BY-4.0`) |
| `website_url` | URI | Team or model website |
| `team_funding` | string | Funding sources |
| `citation` | string | Relevant publications |

---

## Example

```yaml
team_name: Example University Econ
team_abbr: ExUni
model_name: Bayesian VAR
model_abbr: BVAR
model_version: "2.1"
model_contributors:
  - name: Jane Doe
    affiliation: Example University
    email: jane.doe@example.edu
    orcid: 0000-0001-2345-6789
team_model_designation: primary
methods: >-
  Bayesian VAR with Minnesota prior, estimated on FRED-MD variables.
  Forecasts generated from the posterior predictive distribution.
methods_long: >-
  We estimate a Bayesian Vector Autoregression (BVAR) using a Minnesota
  prior with hyperparameters selected via marginal likelihood optimization.
  The model includes all 12 hub target variables plus 20 additional FRED-MD
  series selected by elastic net. Quantile forecasts are drawn from the
  posterior predictive distribution using 10,000 MCMC samples.
data_inputs: FRED-MD monthly dataset (all 128 series)
license: CC-BY-4.0
website_url: https://example.edu/econ/forecasting
team_funding: Example University Research Grant #12345
citation: >-
  Doe, J. and Smith, A. (2025), "Bayesian VARs for Macroeconomic
  Forecasting," Working Paper.
```
