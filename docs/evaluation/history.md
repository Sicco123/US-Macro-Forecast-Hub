---
hide:
  - toc
  - navigation
---

# Evaluation

<div id="eval-dashboard" data-view="scores" markdown="0">
<p id="eval-status" role="status" aria-live="polite">Loading…</p>
<button id="eval-retry" class="dash-btn" hidden>Retry</button>

<div id="eval-panel-scores">

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
      <option value="QuantileLoss">Quantile loss</option>
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
    <input type="month" id="eval-month-from" value="2000-01" min="1900-01" max="2100-12">
  </label>
  <label>To
    <input type="month" id="eval-month-to" value="2026-12" min="1900-01" max="2100-12">
  </label>
  <button id="eval-reset-zoom" class="dash-btn" title="Reset zoom to full range">&#x21ba; Reset Zoom</button>
</div>

<div class="dash-models" id="eval-models">Loading models...</div>

<p id="eval-description" class="visually-hidden"></p>
<div class="dash-chart-grid">
<div class="dash-chart" id="eval-chart" role="region" aria-label="Rolling model errors" aria-describedby="eval-description"></div>
<div class="dash-chart" id="eval-cumulative-chart" role="region" aria-label="Cumulative model errors"></div>
</div>
<details><summary>View monthly scores</summary><div id="eval-data-table" class="dash-table-scroll" role="region" aria-label="Monthly model scores" tabindex="0"></div></details>

</div>


</div>
