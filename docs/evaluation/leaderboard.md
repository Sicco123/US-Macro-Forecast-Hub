# Leaderboard

Compare model accuracy over the selected sample. Lower ranks and scores are better.
MAE evaluates the median; RMSE evaluates the mean. Historical backfills are included.
[How scoring works](methodology.md).

<div id="eval-dashboard" markdown="0">
<p class="dash-freshness" data-dashboard-freshness></p>
<p>Scores use monthly log-change units for INDPRO/CPIAUCSL/PCEPI and percentage-point changes for UNRATE. Cumulative squared errors use squared units.</p>
<p id="eval-status" role="status" aria-live="polite">Loading evaluation…</p>
<button id="eval-retry" class="dash-btn" hidden>Retry loading evaluation</button>

<div class="eval-tabs" role="tablist" aria-label="Evaluation view">
  <button class="eval-tab eval-tab-active" id="eval-tab-summary" role="tab" aria-selected="true" aria-controls="eval-panel-summary">Rankings</button>
  <button class="eval-tab" id="eval-tab-scores" role="tab" aria-selected="false" aria-controls="eval-panel-scores" tabindex="-1">Score history</button>
</div>

<!-- SCORES PANEL -->
<div id="eval-panel-scores" role="tabpanel" aria-labelledby="eval-tab-scores" hidden>

<div class="dash-controls">
  <label>Target
    <select id="eval-target">
      <option value="INDPRO">Industrial production (INDPRO)</option>
      <option value="CPIAUCSL">Consumer prices (CPIAUCSL)</option>
      <option value="PCEPI">PCE prices (PCEPI)</option>
      <option value="UNRATE">Unemployment (UNRATE)</option>
    </select>
  </label>
  <label>Metric
    <select id="eval-metric">
      <option value="MAE">MAE</option>
      <option value="SqErr">RMSE</option>
    </select>
  </label>
  <label>Horizon
    <select id="eval-horizon">
      <option value="all">All</option>
      <option value="0">1 month</option>
      <option value="1">2 months</option>
      <option value="2">3 months</option>
      <option value="3">4 months</option>
      <option value="4">5 months</option>
      <option value="5">6 months</option>
      <option value="6">7 months</option>
      <option value="7">8 months</option>
      <option value="8">9 months</option>
      <option value="9">10 months</option>
      <option value="10">11 months</option>
      <option value="11">12 months</option>
      <option value="12">13 months</option>
      <option value="13">14 months</option>
      <option value="14">15 months</option>
      <option value="15">16 months</option>
      <option value="16">17 months</option>
      <option value="17">18 months</option>
      <option value="18">19 months</option>
      <option value="19">20 months</option>
      <option value="20">21 months</option>
      <option value="21">22 months</option>
      <option value="22">23 months</option>
      <option value="23">24 months</option>
    </select>
  </label>
  <label>From
    <input type="number" id="eval-year-from" value="2000" min="1900" max="2100">
  </label>
  <label>To
    <input type="number" id="eval-year-to" value="2026" min="1900" max="2100">
  </label>
  <button id="eval-reset-zoom" class="dash-btn" title="Reset zoom to full range">&#x21ba; Reset Zoom</button>
</div>

<div class="dash-models" id="eval-models">Loading models...</div>

<p id="eval-description"></p>
<div class="dash-chart" id="eval-chart" role="region" aria-label="Rolling model errors" aria-describedby="eval-description"></div>
<div class="dash-chart" id="eval-cumulative-chart" role="region" aria-label="Cumulative model errors"></div>
<details><summary>View monthly scores</summary><div id="eval-data-table" class="dash-table-scroll" role="region" aria-label="Monthly model scores" tabindex="0"></div></details>

</div>

<!-- SUMMARY PANEL -->
<div id="eval-panel-summary" role="tabpanel" aria-labelledby="eval-tab-summary">

<div class="dash-controls">
  <label>Metric
    <select id="eval-sum-metric">
      <option value="MAE">MAE (Absolute Error)</option>
      <option value="SqErr">RMSE (Root Mean Squared Error)</option>
    </select>
  </label>
  <label>Show
    <select id="eval-sum-view">
      <option value="rank">Average Rank</option>
      <option value="score">Average Score</option>
    </select>
  </label>
  <label>Horizon
    <select id="eval-sum-horizon">
      <option value="all" selected>All horizons</option>
      <option value="0">1 month</option>
      <option value="1">2 months</option>
      <option value="2">3 months</option>
      <option value="3">4 months</option>
      <option value="4">5 months</option>
      <option value="5">6 months</option>
      <option value="6">7 months</option>
      <option value="7">8 months</option>
      <option value="8">9 months</option>
      <option value="9">10 months</option>
      <option value="10">11 months</option>
      <option value="11">12 months</option>
      <option value="12">13 months</option>
      <option value="13">14 months</option>
      <option value="14">15 months</option>
      <option value="15">16 months</option>
      <option value="16">17 months</option>
      <option value="17">18 months</option>
      <option value="18">19 months</option>
      <option value="19">20 months</option>
      <option value="20">21 months</option>
      <option value="21">22 months</option>
      <option value="22">23 months</option>
      <option value="23">24 months</option>
    </select>
  </label>
  <label>From
    <input type="number" id="eval-sum-year-from" value="2000" min="1900" max="2100">
  </label>
  <label>To
    <input type="number" id="eval-sum-year-to" value="2026" min="1900" max="2100">
  </label>
  <label class="dash-toggle">
    <input type="checkbox" id="eval-sum-covid" checked>
    Include COVID (2020-03 – 2021-06)
  </label>
</div>

<div id="eval-sum-table" class="dash-table-scroll" role="region" aria-label="Model rankings and score coverage" tabindex="0"></div>

</div>

</div>

---

## How to Read These Results

**Score history tab** shows how each model's accuracy evolves over time for a chosen
metric, target indicator, and forecast horizon. The bold line is a rolling average over up to 12 available origins; the faint line is the raw monthly score. Drag to zoom; the
From/To inputs will update to match your selection.

**Rankings tab** shows average rank or average score per model across all
forecast origins and horizons, broken down by target indicator. Select a
metric and toggle between rank and score views. The best value per column is
marked “Best.” Counts show scored cells per target; models with different coverage
are not directly comparable. Overall is available for ranks only because absolute
scores have different units across indicators.

### Metric definitions

All metrics are computed in the **transformed space** (Δlog for INDPRO /
CPIAUCSL / PCEPI; first difference for UNRATE), matching the scale in which
forecasts are submitted and visualized.

- **MAE** — Mean Absolute Error of the **median** (Q0.5) forecast.
  Lower is better.
- **RMSE** — Root Mean Squared Error of the **mean** forecast.
  Penalizes large errors more heavily than MAE. Lower is better.

The dashboard displays absolute scores. Relative errors are available in the
downloadable evaluation files. See [Methodology](methodology.md) for units
and the definition of the benchmark.
