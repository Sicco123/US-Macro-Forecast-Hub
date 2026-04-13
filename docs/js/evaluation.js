/**
 * Interactive evaluation dashboard.
 *
 * Two tabs:
 *   1. "Scores" — time-series of a chosen metric
 *   2. "Summary" — table of avg rank/score per model x target
 */
(function () {
  "use strict";

  const ROOT = document.getElementById("eval-dashboard");
  if (!ROOT) return;

  const COLORS = [
    "#3f51b5", "#ff7043", "#26a69a", "#ab47bc",
    "#5c6bc0", "#ffa726", "#ef5350", "#66bb6a",
    "#8d6e63", "#78909c",
  ];

  const PLOTLY_FONT = { family: "Inter, system-ui, sans-serif", size: 13, color: "#444" };
  const PLOTLY_GRID = { gridcolor: "rgba(0,0,0,0.06)", zerolinecolor: "rgba(0,0,0,0.1)" };
  const PLOTLY_CONFIG = { responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] };

  let scoresCache = {};
  let summaryData = null;
  let currentTarget = null;
  let selectedModels = new Set();

  const tabScores = ROOT.querySelector("#eval-tab-scores");
  const tabSummary = ROOT.querySelector("#eval-tab-summary");
  const panelScores = ROOT.querySelector("#eval-panel-scores");
  const panelSummary = ROOT.querySelector("#eval-panel-summary");

  const selTarget = ROOT.querySelector("#eval-target");
  const selMetric = ROOT.querySelector("#eval-metric");
  const selHorizon = ROOT.querySelector("#eval-horizon");
  const yearFrom = ROOT.querySelector("#eval-year-from");
  const yearTo = ROOT.querySelector("#eval-year-to");
  const modelBox = ROOT.querySelector("#eval-models");
  const chartDiv = ROOT.querySelector("#eval-chart");

  const selSumMetric = ROOT.querySelector("#eval-sum-metric");
  const selSumView = ROOT.querySelector("#eval-sum-view");
  const sumTableDiv = ROOT.querySelector("#eval-sum-table");

  function basePath() {
    const scripts = document.querySelectorAll("script[src]");
    for (const s of scripts) {
      if (s.src.includes("/js/evaluation.js"))
        return s.src.replace("/js/evaluation.js", "/data/");
    }
    return "data/";
  }
  const DATA_BASE = basePath();

  async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  function switchTab(tab) {
    const isScores = tab === "scores";
    tabScores.classList.toggle("eval-tab-active", isScores);
    tabSummary.classList.toggle("eval-tab-active", !isScores);
    panelScores.style.display = isScores ? "block" : "none";
    panelSummary.style.display = isScores ? "none" : "block";
  }

  async function init() {
    tabScores.addEventListener("click", () => switchTab("scores"));
    tabSummary.addEventListener("click", () => switchTab("summary"));

    selTarget.addEventListener("change", onTargetChange);
    selMetric.addEventListener("change", drawChart);
    selHorizon.addEventListener("change", drawChart);
    yearFrom.addEventListener("change", drawChart);
    yearTo.addEventListener("change", drawChart);

    selSumMetric.addEventListener("change", drawSummary);
    selSumView.addEventListener("change", drawSummary);

    try { summaryData = await fetchJSON(DATA_BASE + "summary.json"); } catch { summaryData = null; }

    switchTab("scores");
    await onTargetChange();
    drawSummary();
  }

  async function loadScores(target) {
    if (!scoresCache[target]) {
      try { scoresCache[target] = await fetchJSON(DATA_BASE + `scores_${target}.json`); }
      catch { scoresCache[target] = null; }
    }
    return scoresCache[target];
  }

  async function onTargetChange() {
    currentTarget = selTarget.value;
    const data = await loadScores(currentTarget);
    buildModelCheckboxes(data);
    drawChart();
  }

  function buildModelCheckboxes(data) {
    if (!data) { modelBox.innerHTML = ""; return; }
    const models = Object.keys(data.models);
    selectedModels = new Set(models);
    modelBox.innerHTML = models
      .map((m, i) => {
        const c = COLORS[i % COLORS.length];
        return `<label><input type="checkbox" value="${m}" checked
                 style="accent-color:${c}"> ${m}</label>`;
      })
      .join("");
    modelBox.querySelectorAll("input").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) selectedModels.add(cb.value);
        else selectedModels.delete(cb.value);
        drawChart();
      });
    });
  }

  // Sync From/To inputs on Plotly zoom
  function syncYearsFromPlotly(eventData) {
    if (eventData["xaxis.range[0]"] && eventData["xaxis.range[1]"]) {
      const newFrom = parseInt(eventData["xaxis.range[0]"].slice(0, 4));
      const newTo = parseInt(eventData["xaxis.range[1]"].slice(0, 4));
      if (!isNaN(newFrom) && !isNaN(newTo)) {
        yearFrom.value = Math.max(2000, newFrom);
        yearTo.value = Math.min(2026, newTo);
        drawChart();
      }
    }
    if (eventData["xaxis.autorange"]) {
      yearFrom.value = 2000;
      yearTo.value = 2026;
      drawChart();
    }
  }

  function drawChart() {
    const data = scoresCache[currentTarget];
    if (!data) { Plotly.purge(chartDiv); return; }

    const metricKey = selMetric.value;
    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "RMSE" : metricKey;

    const horizon = selHorizon.value;  // "all" or "0","1",...
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;

    // Horizon display: data key "0" = display "1 month", etc.
    const hLabel = horizon === "all" ? "all horizons"
      : `horizon ${parseInt(horizon) + 1}`;

    const models = Object.keys(data.models).filter((m) => selectedModels.has(m));
    const traces = [];

    models.forEach((model, mi) => {
      const color = COLORS[mi % COLORS.length];
      const ms = data.models[model];
      const hKeys = horizon === "all" ? Object.keys(ms) : [`h${horizon}`];

      const nDates = data.origin_dates.length;
      const avgVals = new Array(nDates).fill(null);

      for (let i = 0; i < nDates; i++) {
        let sum = 0, cnt = 0;
        for (const hk of hKeys) {
          if (!ms[hk] || !ms[hk][metricKey]) continue;
          const v = ms[hk][metricKey][i];
          if (v != null) { sum += v; cnt++; }
        }
        if (cnt > 0) avgVals[i] = sum / cnt;
      }

      const filtDates = [], filtVals = [];
      data.origin_dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        if (y >= yFrom && y <= yTo && avgVals[i] != null) {
          filtDates.push(d); filtVals.push(avgVals[i]);
        }
      });

      // 12-month rolling avg, then sqrt for RMSE
      const rolling = [];
      for (let i = 0; i < filtVals.length; i++) {
        const start = Math.max(0, i - 11);
        const win = filtVals.slice(start, i + 1);
        let avg = win.reduce((a, b) => a + b, 0) / win.length;
        if (isRMSE) avg = Math.sqrt(avg);
        rolling.push(avg);
      }

      // raw as faint line
      traces.push({
        x: filtDates, y: isRMSE ? filtVals.map(Math.sqrt) : filtVals,
        mode: "lines", line: { color: color, width: 0.6 },
        opacity: 0.25, showlegend: false, hoverinfo: "skip",
      });

      traces.push({
        x: filtDates, y: rolling, mode: "lines", name: model,
        line: { color: color, width: 2.5 },
        hovertemplate: "%{x|%b %Y}<br>" + displayName + ": %{y:.4f}<extra>" + model + "</extra>",
      });
    });

    const layout = {
      font: PLOTLY_FONT,
      title: { text: `${currentTarget} \u2014 ${displayName} (${hLabel})`,
               font: { size: 16, color: "#333" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...PLOTLY_GRID, tickformat: "%Y", dtick: "M24",
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...PLOTLY_GRID },
      legend: { orientation: "h", y: -0.15, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(255,255,255,0)" },
      margin: { t: 40, r: 16, b: 70, l: 70 },
      hovermode: "x unified", height: 500,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(chartDiv, traces, layout, PLOTLY_CONFIG);
    chartDiv.on("plotly_relayout", syncYearsFromPlotly);
  }

  // --- summary table ---
  function drawSummary() {
    if (!summaryData) {
      sumTableDiv.innerHTML = "<p>No summary data available.</p>";
      return;
    }

    const metricKey = selSumMetric.value;
    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "RMSE" : metricKey;

    const view = selSumView.value;
    const source = view === "rank" ? summaryData.avg_rank : summaryData.avg_score;
    const metricData = source[metricKey];

    if (!metricData) {
      sumTableDiv.innerHTML = `<p>No data for <b>${displayName}</b>.</p>`;
      return;
    }

    const models = summaryData.models;
    const targets = [...summaryData.targets, "Overall"];

    let html = '<table class="eval-summary-table"><thead><tr><th>Model</th>';
    for (const t of targets) html += `<th>${t}</th>`;
    html += "</tr></thead><tbody>";

    // Transform values if RMSE and score view
    const vals = {};
    for (const m of models) {
      vals[m] = {};
      for (const t of targets) {
        let v = metricData[m]?.[t];
        if (v != null && isRMSE && view === "score") v = Math.sqrt(v);
        vals[m][t] = v;
      }
    }

    // Best per target
    const bestPerTarget = {};
    for (const t of targets) {
      let best = Infinity;
      for (const m of models) {
        const v = vals[m][t];
        if (v != null && v < best) best = v;
      }
      bestPerTarget[t] = best;
    }

    for (const m of models) {
      html += `<tr><td><b>${m}</b></td>`;
      for (const t of targets) {
        const v = vals[m][t];
        if (v == null) { html += "<td>\u2014</td>"; continue; }
        const isBest = Math.abs(v - bestPerTarget[t]) < 0.001;
        const cls = isBest ? ' class="best"' : "";
        html += `<td${cls}>${v.toFixed(view === "rank" ? 2 : 4)}</td>`;
      }
      html += "</tr>";
    }

    html += "</tbody></table>";
    sumTableDiv.innerHTML = html;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
