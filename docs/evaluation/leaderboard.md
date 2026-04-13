# Evaluation

Model performance rankings based on forecast accuracy against realized values.
Evaluation period: **January 2000 -- March 2026**.

<div id="eval-dashboard" markdown="0">

<div class="eval-tabs">
  <div class="eval-tab eval-tab-active" id="eval-tab-scores">Scores</div>
  <div class="eval-tab" id="eval-tab-summary">Summary</div>
</div>

<!-- SCORES PANEL -->
<div id="eval-panel-scores">

<div class="dash-controls">
  <label>Target
    <select id="eval-target">
      <option value="INDPRO">INDPRO</option>
      <option value="CPIAUCSL">CPIAUCSL</option>
      <option value="PCEPI">PCEPI</option>
      <option value="UNRATE">UNRATE</option>
    </select>
  </label>
  <label>Metric
    <select id="eval-metric">
      <option value="MAE">MAE</option>
      <option value="WIS">WIS</option>
      <option value="SqErr">RMSE</option>
      <option value="MeanQS">MeanQS</option>
      <option value="Coverage_80">Coverage 80%</option>
      <option value="Coverage_90">Coverage 90%</option>
      <option value="IntervalWidth_80">Interval Width 80%</option>
      <option value="IntervalWidth_90">Interval Width 90%</option>
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
    <input type="number" id="eval-year-from" value="2000" min="2000" max="2026">
  </label>
  <label>To
    <input type="number" id="eval-year-to" value="2026" min="2000" max="2026">
  </label>
</div>

<div class="dash-models" id="eval-models">Loading models...</div>

<div class="dash-chart" id="eval-chart"></div>

</div>

<!-- SUMMARY PANEL -->
<div id="eval-panel-summary" style="display:none">

<div class="dash-controls">
  <label>Metric
    <select id="eval-sum-metric">
      <option value="MAE">MAE (Absolute Error)</option>
      <option value="SqErr">RMSE (Root Mean Squared Error)</option>
      <option value="WIS">WIS</option>
    </select>
  </label>
  <label>Show
    <select id="eval-sum-view">
      <option value="rank">Average Rank</option>
      <option value="score">Average Score</option>
    </select>
  </label>
</div>

<div id="eval-sum-table"></div>

</div>

</div>

---

## How to Read These Results

**Scores tab** shows how each model's accuracy evolves over time for a chosen
metric, target indicator, and forecast horizon. The bold line is a 12-month
rolling average; the faint line is the raw monthly score. Drag to zoom; the
From/To inputs will update to match your selection.

**Summary tab** shows average rank or average score per model across all
forecast origins and horizons, broken down by target indicator. Select a
metric and toggle between rank and score views. The best value per column is
highlighted in green.

### Metric definitions

- **MAE** — Mean Absolute Error of the **median** (Q0.5) forecast.
  Lower is better.
- **RMSE** — Root Mean Squared Error of the **mean** forecast.
  Penalizes large errors more heavily than MAE. Lower is better.
- **WIS** — Weighted Interval Score. A proper scoring rule that uses all
  submitted quantiles to assess the full predictive distribution. Lower is
  better. See [Methodology](methodology.md) for the formula.

See [Methodology](methodology.md) for full details on all metrics, including
coverage, interval width, and mean quantile score.
