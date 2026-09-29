---
hide:
  - toc
  - navigation
---

# Leaderboard

<div id="eval-dashboard" data-view="summary" markdown="0">
<p id="eval-status" role="status" aria-live="polite">Loading…</p>
<button id="eval-retry" class="dash-btn" hidden>Retry</button>

<div id="eval-panel-summary">

<div class="dash-controls">
  <label>Metric
    <select id="eval-sum-metric">
      <option value="MAE">MAE</option>
      <option value="SqErr">RMSE</option>
      <option value="QuantileLoss">Quantile loss</option>
    </select>
  </label>
  <label>Show
    <select id="eval-sum-view">
      <option value="geomean" selected>Geometric mean</option>
      <option value="rank">Average rank</option>
      <option value="score">Average score</option>
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
  <label class="dash-toggle dash-period">
    <input type="checkbox" id="eval-sum-covid" checked>
    <span>Covid <span class="period-included">Included</span><span class="period-excluded">Excluded</span></span>
  </label>
  <label class="dash-toggle dash-period">
    <input type="checkbox" id="eval-sum-gfc" checked>
    <span>GFC <span class="period-included">Included</span><span class="period-excluded">Excluded</span></span>
  </label>
</div>

<div id="eval-sum-table" class="dash-table-scroll" role="region" aria-label="Model leaderboard" tabindex="0"></div>

</div>

</div>
