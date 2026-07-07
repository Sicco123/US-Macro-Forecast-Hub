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
    "#e65100", "#ffa726", "#ef5350", "#66bb6a",
    "#8d6e63", "#78909c",
  ];

  function isDark() {
    return document.body.getAttribute("data-md-color-scheme") === "slate";
  }
  function plotlyFont() {
    const c = isDark() ? "#ccc" : "#444";
    return { family: "Inter, system-ui, sans-serif", size: 13, color: c };
  }
  function plotlyGrid() {
    return isDark()
      ? { gridcolor: "rgba(255,255,255,0.1)", zerolinecolor: "rgba(255,255,255,0.18)" }
      : { gridcolor: "rgba(0,0,0,0.06)", zerolinecolor: "rgba(0,0,0,0.1)" };
  }
  const PLOTLY_CONFIG = { responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"] };

  let scoresCache = {};
  let currentTarget = null;
  let selectedModels = new Set();
  let modelColorMap = {};          // stable model → color mapping

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
  const btnResetZoom = ROOT.querySelector("#eval-reset-zoom");
  const cumChartDiv = ROOT.querySelector("#eval-cumulative-chart");

  const selSumMetric = ROOT.querySelector("#eval-sum-metric");
  const selSumView = ROOT.querySelector("#eval-sum-view");
  const selSumHorizon = ROOT.querySelector("#eval-sum-horizon");
  const sumYearFrom = ROOT.querySelector("#eval-sum-year-from");
  const sumYearTo = ROOT.querySelector("#eval-sum-year-to");
  const sumCovidCb = ROOT.querySelector("#eval-sum-covid");
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

  function hexToRgba(hex, a) {
    return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
  }

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
    if (btnResetZoom) btnResetZoom.addEventListener("click", () => {
      yearFrom.value = 2000;
      yearTo.value = 2026;
      drawChart();
    });

    selSumMetric.addEventListener("change", drawSummary);
    selSumView.addEventListener("change", drawSummary);
    selSumHorizon.addEventListener("change", drawSummary);
    sumYearFrom.addEventListener("change", drawSummary);
    sumYearTo.addEventListener("change", drawSummary);
    sumCovidCb.addEventListener("change", drawSummary);

    // summary is now computed dynamically from score files

    // Redraw charts when dark/light mode toggles
    new MutationObserver(() => { drawChart(); drawCumulativeChart(); drawSummary(); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });

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
    const models = Object.keys(data.models).sort();
    selectedModels = new Set(models);
    // Stable color map: sorted order determines color, never changes on selection
    modelColorMap = {};
    models.forEach((m, i) => { modelColorMap[m] = COLORS[i % COLORS.length]; });
    modelBox.innerHTML = models
      .map((m) => {
        const c = modelColorMap[m];
        return `<label><input type="checkbox" value="${m}" checked
                 style="accent-color:${c}"> <span style="color:${c}; font-weight:600">●</span> ${m}</label>`;
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

    const models = Object.keys(data.models).sort().filter((m) => selectedModels.has(m));
    const traces = [];

    models.forEach((model) => {
      const color = modelColorMap[model];
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

    const dark = isDark();
    const layout = {
      font: plotlyFont(),
      title: { text: `${currentTarget} \u2014 ${displayName} (${hLabel})`,
               font: { size: 16, color: dark ? "#ddd" : "#333" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...plotlyGrid(), tickformat: "%Y",
        spikecolor: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)", spikethickness: 1,
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...plotlyGrid() },
      legend: { orientation: "h", y: -0.15, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 40, r: 16, b: 70, l: 70 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark ? "#2e2e2e" : "#fff", font: { color: dark ? "#ddd" : "#333" } },
      height: 500,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(chartDiv, traces, layout, PLOTLY_CONFIG);
    chartDiv.on("plotly_relayout", syncYearsFromPlotly);

    drawCumulativeChart();
  }

  // --- cumulative error chart (only for MAE and RMSE) ---
  function drawCumulativeChart() {
    const metricKey = selMetric.value;
    if (metricKey !== "MAE" && metricKey !== "SqErr") {
      Plotly.purge(cumChartDiv);
      cumChartDiv.style.display = "none";
      return;
    }
    cumChartDiv.style.display = "block";

    const data = scoresCache[currentTarget];
    if (!data) { Plotly.purge(cumChartDiv); return; }

    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "Cumulative Squared Error" : "Cumulative Absolute Error";

    const horizon = selHorizon.value;
    const hLabel = horizon === "all" ? "all horizons"
      : `horizon ${parseInt(horizon) + 1}`;
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;

    const models = Object.keys(data.models).sort().filter((m) => selectedModels.has(m));
    const traces = [];

    models.forEach((model) => {
      const color = modelColorMap[model];
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

      const filtDates = [], cumVals = [];
      let cumSum = 0;
      data.origin_dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        if (y >= yFrom && y <= yTo && avgVals[i] != null) {
          cumSum += avgVals[i];
          filtDates.push(d);
          cumVals.push(cumSum);
        }
      });

      traces.push({
        x: filtDates, y: cumVals, mode: "lines", name: model,
        line: { color: color, width: 2.2 },
        fill: "tozeroy", fillcolor: hexToRgba(color, 0.08),
        hovertemplate: "%{x|%b %Y}<br>" + displayName + ": %{y:.2f}<extra>" + model + "</extra>",
      });
    });

    const dark = isDark();
    const layout = {
      font: plotlyFont(),
      title: { text: `${displayName} — ${hLabel}`, font: { size: 14, color: dark ? "#ccc" : "#555" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...plotlyGrid(), tickformat: "%Y",
        spikecolor: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)", spikethickness: 1,
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...plotlyGrid() },
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 36, r: 16, b: 70, l: 75 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark ? "#2e2e2e" : "#fff", font: { color: dark ? "#ddd" : "#333" } },
      height: 340,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(cumChartDiv, traces, layout, PLOTLY_CONFIG);
    cumChartDiv.removeAllListeners && cumChartDiv.removeAllListeners("plotly_relayout");
    cumChartDiv.on("plotly_relayout", syncYearsFromPlotly);
  }

  // --- summary table: recomputed dynamically from score files ---
  const SUMMARY_TARGETS = ["INDPRO", "CPIAUCSL", "PCEPI", "UNRATE"];
  const SUMMARY_METRICS = ["MAE", "SqErr", "WIS"];

  // COVID period: origin dates in 2020-03 through 2021-06
  const COVID_START = "2020-03";
  const COVID_END   = "2021-06";

  function isCovidDate(dateStr) {
    const ym = dateStr.slice(0, 7); // "YYYY-MM"
    return ym >= COVID_START && ym <= COVID_END;
  }

  /**
   * Compute summary table from raw score files.
   * @param {Object} opts
   * @param {string} opts.horizon  - "all" or "0".."23"
   * @param {number} opts.yFrom    - start year
   * @param {number} opts.yTo      - end year
   * @param {boolean} opts.includeCovid
   */
  async function computeSummary({ horizon, yFrom, yTo, includeCovid }) {
    // Ensure all target score files are loaded
    for (const t of SUMMARY_TARGETS) await loadScores(t);

    const modelSet = new Set();
    for (const t of SUMMARY_TARGETS) {
      if (scoresCache[t]) Object.keys(scoresCache[t].models).forEach((m) => modelSet.add(m));
    }
    const models = [...modelSet];

    const avg_score = {}, avg_rank = {};
    for (const metric of SUMMARY_METRICS) {
      avg_score[metric] = {};
      avg_rank[metric] = {};
      for (const m of models) { avg_score[metric][m] = {}; avg_rank[metric][m] = {}; }
    }

    for (const target of SUMMARY_TARGETS) {
      const sd = scoresCache[target];
      if (!sd) continue;
      const nDates = sd.origin_dates.length;

      // Build index mask: which origin dates pass the year + COVID filters
      const dateMask = sd.origin_dates.map((d) => {
        const y = parseInt(d.slice(0, 4));
        if (y < yFrom || y > yTo) return false;
        if (!includeCovid && isCovidDate(d)) return false;
        return true;
      });

      // Horizon keys
      const firstModel = Object.keys(sd.models)[0];
      const allHKeys = firstModel ? Object.keys(sd.models[firstModel]) : [];
      const hKeys = horizon === "all"
        ? allHKeys
        : allHKeys.filter((hk) => hk === `h${horizon}`);

      for (const metric of SUMMARY_METRICS) {
        // Per model: avg score per origin date over selected horizons
        const modelVals = {};
        for (const m of models) {
          if (!sd.models[m]) continue;
          modelVals[m] = new Array(nDates).fill(null);
          for (let i = 0; i < nDates; i++) {
            if (!dateMask[i]) continue;
            let sum = 0, cnt = 0;
            for (const hk of hKeys) {
              const v = sd.models[m][hk]?.[metric]?.[i];
              if (v != null) { sum += v; cnt++; }
            }
            if (cnt > 0) modelVals[m][i] = sum / cnt;
          }
        }

        // avg_score per target
        for (const m of models) {
          if (!modelVals[m]) continue;
          const vals = modelVals[m].filter((v) => v != null);
          avg_score[metric][m][target] = vals.length > 0
            ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }

        // avg_rank per target: rank models at each origin, then average
        const rankSums = {}, rankCnts = {};
        for (const m of models) { rankSums[m] = 0; rankCnts[m] = 0; }
        for (let i = 0; i < nDates; i++) {
          if (!dateMask[i]) continue;
          const ranked = models
            .map((m) => ({ m, v: modelVals[m]?.[i] }))
            .filter((x) => x.v != null)
            .sort((a, b) => a.v - b.v);
          ranked.forEach((x, ri) => { rankSums[x.m] += ri + 1; rankCnts[x.m]++; });
        }
        for (const m of models) {
          avg_rank[metric][m][target] = rankCnts[m] > 0
            ? rankSums[m] / rankCnts[m] : null;
        }
      }
    }

    // Overall column
    for (const metric of SUMMARY_METRICS) {
      for (const m of models) {
        const scores = SUMMARY_TARGETS.map((t) => avg_score[metric][m][t]).filter((v) => v != null);
        avg_score[metric][m]["Overall"] = scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        const ranks = SUMMARY_TARGETS.map((t) => avg_rank[metric][m][t]).filter((v) => v != null);
        avg_rank[metric][m]["Overall"] = ranks.length > 0
          ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
      }
    }

    return { models, targets: SUMMARY_TARGETS, avg_score, avg_rank };
  }

  async function drawSummary() {
    sumTableDiv.innerHTML = "<p>Loading\u2026</p>";

    const metricKey = selSumMetric.value;
    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "RMSE" : metricKey;
    const view = selSumView.value;
    const horizon = selSumHorizon.value;
    const yFrom = parseInt(sumYearFrom.value) || 2000;
    const yTo = parseInt(sumYearTo.value) || 2026;
    const includeCovid = sumCovidCb.checked;

    let computed;
    try { computed = await computeSummary({ horizon, yFrom, yTo, includeCovid }); }
    catch (e) { sumTableDiv.innerHTML = `<p>Error loading data: ${e.message}</p>`; return; }

    const source = view === "rank" ? computed.avg_rank : computed.avg_score;
    const metricData = source[metricKey];

    if (!metricData) {
      sumTableDiv.innerHTML = `<p>No data for <b>${displayName}</b>.</p>`;
      return;
    }

    const { models: rawModels } = computed;
    // Sort models consistently so colors match the Scores tab
    const models = rawModels.slice().sort();
    // Build color map for summary (same sorted order as Scores tab checkboxes)
    const sumColorMap = {};
    models.forEach((m, i) => { sumColorMap[m] = COLORS[i % COLORS.length]; });
    const targets = [...computed.targets, "Overall"];

    // Build descriptive caption
    const hLabel = horizon === "all" ? "all horizons (1\u201324)"
      : `horizon ${parseInt(horizon) + 1} month${parseInt(horizon) > 0 ? "s" : ""}`;
    const covidNote = includeCovid ? "" : ", excl. COVID";

    let html = `<p class="eval-sum-caption">${displayName} \u2014 ${view === "rank" ? "average rank" : "average score"} \u2014 <b>${hLabel}</b>, origins ${yFrom}\u2013${yTo}${covidNote}</p>`;
    html += '<table class="eval-summary-table"><thead><tr><th>Model</th>';
    for (const t of targets) html += `<th>${t}</th>`;
    html += "</tr></thead><tbody>";

    // Optionally transform RMSE
    const vals = {};
    for (const m of models) {
      vals[m] = {};
      for (const t of targets) {
        let v = metricData[m]?.[t];
        if (v != null && isRMSE && view === "score") v = Math.sqrt(v);
        vals[m][t] = v;
      }
    }

    const bestPerTarget = {};
    for (const t of targets) {
      let best = Infinity;
      for (const m of models) { const v = vals[m][t]; if (v != null && v < best) best = v; }
      bestPerTarget[t] = best;
    }

    for (const m of models) {
      const dot = `<span style="color:${sumColorMap[m]}; font-weight:700">●</span>`;
      html += `<tr><td>${dot} <b>${m}</b></td>`;
      for (const t of targets) {
        const v = vals[m][t];
        if (v == null) { html += "<td>\u2014</td>"; continue; }
        const isBest = Math.abs(v - bestPerTarget[t]) < 0.001;
        html += `<td${isBest ? ' class="best"' : ""}>${v.toFixed(view === "rank" ? 2 : 4)}</td>`;
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
