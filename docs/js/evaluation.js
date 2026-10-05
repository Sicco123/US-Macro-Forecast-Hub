/* Shared controller for the separate Evaluation and Leaderboard pages. */
(function () {
  "use strict";

  const ROOT = document.getElementById("eval-dashboard");
  if (!ROOT) return;

  const D = window.Dashboard;

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
  const activeTab = ROOT.getAttribute("data-view");
  let scoreRequest = 0, summaryRequest = 0;
  let savedModels = null;
  let defaultModels = new Set();
  let summarySort = "Overall";
  let minMonth = "2000-01", maxMonth = "2100-12";
  let selectedModels = new Set();
  let modelColorMap = {};          // stable model → color mapping

  const panelScores = ROOT.querySelector("#eval-panel-scores");
  const panelSummary = ROOT.querySelector("#eval-panel-summary");

  const selTarget = ROOT.querySelector("#eval-target");
  const selMetric = ROOT.querySelector("#eval-metric");
  const selHorizon = ROOT.querySelector("#eval-horizon");
  const monthFrom = ROOT.querySelector("#eval-month-from");
  const monthTo = ROOT.querySelector("#eval-month-to");
  const modelBox = ROOT.querySelector("#eval-models");
  const btnShowModels = ROOT.querySelector("#eval-models-show");
  const btnHideModels = ROOT.querySelector("#eval-models-hide");
  const chartDiv = ROOT.querySelector("#eval-chart");
  const relativeChartDiv = ROOT.querySelector("#eval-relative-chart");
  const relativeTable = ROOT.querySelector("#eval-relative-table");
  const btnResetZoom = ROOT.querySelector("#eval-reset-zoom");

  const selSumMetric = ROOT.querySelector("#eval-sum-metric");
  const selSumView = ROOT.querySelector("#eval-sum-view");
  const selSumHorizon = ROOT.querySelector("#eval-sum-horizon");
  const sumMonthFrom = ROOT.querySelector("#eval-sum-month-from");
  const sumMonthTo = ROOT.querySelector("#eval-sum-month-to");
  const sumCovidCb = ROOT.querySelector("#eval-sum-covid");
  const sumGfcCb = ROOT.querySelector("#eval-sum-gfc");
  const sumTableDiv = ROOT.querySelector("#eval-sum-table");

  const status = ROOT.querySelector("#eval-status");
  const retry = ROOT.querySelector("#eval-retry");
  const controls = Object.fromEntries(Object.entries({ target: selTarget, metric: selMetric, horizon: selHorizon, from: monthFrom, to: monthTo,
    summaryMetric: selSumMetric, summaryView: selSumView, summaryHorizon: selSumHorizon,
    summaryFrom: sumMonthFrom, summaryTo: sumMonthTo, covid: sumCovidCb, gfc: sumGfcCb }).filter(([, input]) => input));
  function saveState() { D.save(controls, { view: activeTab, sort: summarySort, ...(savedModels !== null ? { models: savedModels.join(",") } : currentTarget ? { models: [...selectedModels].join(",") } : {}) }); }
  function readState() {
    const params = new URLSearchParams(location.search);
    D.restore(controls, params);
    savedModels = params.has("models") ? params.get("models").split(",") : null;
    summarySort = ["Model", "Overall", "INDPRO", "CPIAUCSL", "PCEPI", "UNRATE"].includes(params.get("sort")) ? params.get("sort") : "Overall";
  }
  function clearCharts() {
    if (window.Plotly) [chartDiv, relativeChartDiv].forEach((d) => Plotly.purge(d));
    relativeTable.replaceChildren();
    ROOT.querySelector("#eval-data-table").replaceChildren();
    ROOT.querySelector("#eval-description").textContent = "";
  }

  function init() {
    if (activeTab === "scores") {
      [[btnShowModels, true], [btnHideModels, false]].forEach(([button, checked]) => {
        button.addEventListener("click", () => {
          selectedModels.clear();
          modelBox.querySelectorAll("input").forEach((cb) => {
            cb.checked = checked;
            if (checked) selectedModels.add(cb.value);
          });
          drawChart();
        });
      });
      selTarget.addEventListener("change", onTargetChange);
      [selMetric, selHorizon, monthFrom, monthTo].forEach((el) => el.addEventListener("change", drawChart));
      btnResetZoom.addEventListener("click", () => { monthFrom.value = minMonth; monthTo.value = maxMonth; drawChart(); });
    } else {
      [selSumMetric, selSumView, selSumHorizon, sumMonthFrom, sumMonthTo, sumCovidCb, sumGfcCb].forEach((el) => el.addEventListener("change", drawSummary));
    }
    retry.addEventListener("click", () => activeTab === "scores" ? onTargetChange() : drawSummary());
    new MutationObserver(() => { Object.keys(modelColorMap).sort().forEach((m, i) => { modelColorMap[m] = D.color(i); }); if (activeTab === "scores") drawChart(); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
    window.addEventListener("popstate", () => { readState(); activeTab === "scores" ? onTargetChange() : drawSummary(); });
    readState(); activeTab === "scores" ? onTargetChange() : drawSummary();
  }

  async function loadScores(target) {
    scoresCache[target] = await D.json(`scores_${target}.json`);
    return scoresCache[target];
  }

  async function onTargetChange() {
    const id = ++scoreRequest, target = selTarget.value;
    if (currentTarget && savedModels === null && (selectedModels.size !== defaultModels.size || [...selectedModels].some((m) => !defaultModels.has(m)))) savedModels = [...selectedModels];
    currentTarget = null; clearCharts(); modelBox.replaceChildren();
    [btnShowModels, btnHideModels].forEach((el) => { el.disabled = true; });
    status.textContent = "Loading score history…"; retry.hidden = true; panelScores.setAttribute("aria-busy", "true");
    try {
      const [data] = await Promise.all([loadScores(target), D.plotly()]);
      if (id !== scoreRequest || activeTab !== "scores") return;
      currentTarget = target;
      if (data.origin_dates.length) {
        minMonth = data.origin_dates[0].slice(0, 7); maxMonth = data.origin_dates.at(-1).slice(0, 7);
        for (const input of [monthFrom, monthTo]) { input.min = minMonth; input.max = maxMonth; }
        const params = new URLSearchParams(location.search);
        if (!params.has("from")) monthFrom.value = minMonth;
        if (!params.has("to")) monthTo.value = maxMonth;
      }
      buildModelCheckboxes(data); drawChart();
    } catch {
      if (id !== scoreRequest || activeTab !== "scores") return;
      clearCharts(); status.textContent = "Could not load score history. Check your connection and retry."; retry.hidden = false;
    } finally {
      if (id === scoreRequest) {
        panelScores.setAttribute("aria-busy", "false");
        [btnShowModels, btnHideModels].forEach((el) => { el.disabled = !modelBox.querySelectorAll("input").length; });
      }
    }
  }

  function buildModelCheckboxes(data) {
    if (!data) { modelBox.innerHTML = ""; return; }
    const models = Object.keys(data.models).sort();
    selectedModels = new Set(savedModels === null
      ? [D.bestModel(data), "MacroHub-RandomWalk"].filter((m) => models.includes(m))
      : savedModels.filter((m) => models.includes(m)));
    if (savedModels === null) defaultModels = new Set(selectedModels);
    savedModels = null;
    // Stable color map: sorted order determines color, never changes on selection
    modelColorMap = {};
    models.forEach((m, i) => { modelColorMap[m] = D.color(i); });
    modelBox.innerHTML = models
      .map((m) => {
        const c = modelColorMap[m];
        return `<label><input type="checkbox" value="${D.escape(m)}" ${selectedModels.has(m) ? "checked" : ""}
                 style="accent-color:${c}"> <span style="color:${c}; font-weight:600" aria-hidden="true">●</span> ${D.escape(D.modelName(m))}</label>`;
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
  function syncMonthsFromPlotly(eventData) {
    if (eventData["xaxis.range[0]"] && eventData["xaxis.range[1]"]) {
      const newFrom = eventData["xaxis.range[0]"].slice(0, 7);
      const newTo = eventData["xaxis.range[1]"].slice(0, 7);
      if (D.validMonth(newFrom) && D.validMonth(newTo)) {
        monthFrom.value = newFrom < minMonth ? minMonth : newFrom;
        monthTo.value = newTo > maxMonth ? maxMonth : newTo;
        drawChart();
      }
    }
    if (eventData["xaxis.autorange"]) {
      monthFrom.value = minMonth;
      monthTo.value = maxMonth;
      drawChart();
    }
  }

  function drawChart() {
    if (activeTab !== "scores" || !window.Plotly) return;
    if (!D.range(monthFrom, monthTo)) { clearCharts(); status.textContent = "Enter valid months with From no later than To."; return; }
    const data = scoresCache[currentTarget];
    if (!data) { clearCharts(); return; }
    saveState();
    const rows = [];

    const metricKey = selMetric.value;
    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "RMSE" : metricKey === "QuantileLoss" ? "Quantile loss" : metricKey;

    const horizon = selHorizon.value;  // "all" or "0","1",...
    const fromMonth = monthFrom.value;
    const toMonth = monthTo.value;

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
          if (v != null) { const weight = ms[hk][`${metricKey}_count`]?.[i] ?? 1; sum += v * weight; cnt += weight; }
        }
        if (cnt > 0) avgVals[i] = sum / cnt;
      }

      const filtDates = [], filtVals = [];
      data.origin_dates.forEach((d, i) => {
        const month = d.slice(0, 7);
        if (month >= fromMonth && month <= toMonth && avgVals[i] != null) {
          filtDates.push(d); filtVals.push(avgVals[i]);
        }
      });

      filtDates.forEach((date, i) => rows.push([D.modelName(model), date, isRMSE ? Math.sqrt(filtVals[i]) : filtVals[i]]));
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
        x: filtDates, y: rolling, mode: "lines", name: D.modelName(model),
        line: { color: color, width: 2.5, dash: D.dashes[Object.keys(data.models).sort().indexOf(model) % D.dashes.length] },
        hovertemplate: D.escape(D.modelName(model)) + ": %{y:.6g}<extra></extra>",
      });
    });

    status.textContent = rows.length ? "" : "No scores for this selection. Select a model or widen the period.";
    ROOT.querySelector("#eval-description").textContent = `${selTarget.selectedOptions[0].textContent}; ${displayName}, ${hLabel}, origins ${fromMonth}–${toMonth}. Bold lines show rolling averages over up to 12 available origins. The table gives monthly values.`;
    D.table(ROOT.querySelector("#eval-data-table"), ["Model", "Origin", displayName], rows.map((r) => [r[0], r[1], D.format(r[2])]), `${currentTarget} — ${displayName} (${hLabel})`);
    const dark = isDark();
    const layout = {
      font: plotlyFont(),
      title: { text: `Rolling ${displayName}`,
               font: { size: 16, color: dark ? "#ddd" : "#333" }, x: 0.01 },
      xaxis: {
        range: [`${fromMonth}-01`, D.nextMonth(toMonth)],
        ...D.timeAxis(dark, displayName),
        spikecolor: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)", spikethickness: 1,
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...plotlyGrid() },
      shapes: D.crisisShapes(dark),
      legend: { orientation: "h", y: -0.15, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 40, r: 16, b: 70, l: chartDiv.clientWidth < 500 ? 48 : 70 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark ? "#2e2e2e" : "#fff", font: { color: dark ? "#ddd" : "#333" } },
      height: chartDiv.clientWidth < 500 ? 420 : 500,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(chartDiv, traces, layout, PLOTLY_CONFIG);
    chartDiv.removeAllListeners && chartDiv.removeAllListeners("plotly_relayout");
    chartDiv.on("plotly_relayout", syncMonthsFromPlotly);
    drawRelativeChart(data, metricKey, horizon, fromMonth, toMonth);
  }

  function drawRelativeChart(data, metric, horizon, fromMonth, toMonth) {
    relativeTable.replaceChildren();
    const visible = metric === "MAE" || metric === "SqErr";
    ROOT.querySelector("#eval-relative").hidden = !visible;
    ROOT.querySelector("#eval-relative-note").hidden = !visible;
    ROOT.querySelector("#eval-relative-details").hidden = !visible;
    if (!visible) { Plotly.purge(relativeChartDiv); return; }
    const models = Object.keys(data.models).sort().filter((m) => selectedModels.has(m));
    const rows = [];
    const traces = models.map((model) => {
      const series = D.relativeCumulative(data, model, metric, horizon, fromMonth, toMonth);
      series.x.forEach((date, i) => rows.push([D.modelName(model), date, D.format(series.y[i])]));
      return { ...series, mode: "lines", name: D.modelName(model),
        line: { color: modelColorMap[model], width: 2.2, dash: D.dashes[Object.keys(data.models).sort().indexOf(model) % D.dashes.length] },
        hovertemplate: D.escape(D.modelName(model)) + ": %{y:.6g}<extra></extra>" };
    });
    const dark = isDark();
    Plotly.react(relativeChartDiv, traces, {
      font: plotlyFont(),
      title: { text: `Cumulative ${metric === "SqErr" ? "squared" : "absolute"} error / RW`, font: { size: 14 }, x: 0.01 },
      xaxis: { range: [`${fromMonth}-01`, D.nextMonth(toMonth)], ...D.timeAxis(dark, `Cumulative ${metric === "SqErr" ? "SE" : "AE"} / RW`) },
      yaxis: { title: { text: "Model / RW (1 = RW)", standoff: 10 }, ...plotlyGrid() },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 1, y1: 1, line: { color: plotlyFont().color, width: 1.5, dash: "dash" } }, ...D.crisisShapes(dark)],
      annotations: traces.some((t) => t.y.some(Number.isFinite)) ? [] : [{ xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false,
        text: selectedModels.size ? "No paired losses with<br>positive RW total in this range." : "Select a model to compare with RW." }],
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
      margin: { t: 36, r: 16, b: 70, l: relativeChartDiv.clientWidth < 500 ? 48 : 70 },
      hovermode: "x unified", height: relativeChartDiv.clientWidth < 500 ? 420 : 500,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    }, PLOTLY_CONFIG);
    D.table(relativeTable, ["Model", "Origin", "Model / RW"], rows, "Cumulative error / RW");
    relativeChartDiv.removeAllListeners && relativeChartDiv.removeAllListeners("plotly_relayout");
    relativeChartDiv.on("plotly_relayout", syncMonthsFromPlotly);
  }

  const SUMMARY_TARGETS = ["INDPRO", "CPIAUCSL", "PCEPI", "UNRATE"];
  async function drawSummary() {
    const id = ++summaryRequest;
    if (activeTab !== "summary") return;
    if (!D.range(sumMonthFrom, sumMonthTo)) {
      status.textContent = "Enter valid months with From no later than To."; panelSummary.setAttribute("aria-busy", "false"); sumTableDiv.replaceChildren(); return;
    }
    status.textContent = "Loading rankings…"; retry.hidden = true;
    panelSummary.setAttribute("aria-busy", "true"); sumTableDiv.replaceChildren();
    try {
      await Promise.all(SUMMARY_TARGETS.map(loadScores));
      if (id !== summaryRequest || activeTab !== "summary") return;
      const dates = SUMMARY_TARGETS.flatMap((t) => scoresCache[t].origin_dates).sort();
      const params = new URLSearchParams(location.search);
      if (!params.has("summaryFrom") && dates.length) sumMonthFrom.value = dates[0].slice(0, 7);
      if (!params.has("summaryTo") && dates.length) sumMonthTo.value = dates.at(-1).slice(0, 7);
      const metric = selSumMetric.value, view = selSumView.value;
      const result = D.summarize(scoresCache, metric, { horizon: selSumHorizon.value, fromMonth: sumMonthFrom.value, toMonth: sumMonthTo.value, includeCovid: sumCovidCb.checked, includeGfc: sumGfcCb.checked });
      const targets = view !== "score" ? ["Overall", ...SUMMARY_TARGETS] : SUMMARY_TARGETS;
      if (summarySort !== "Model" && !targets.includes(summarySort)) summarySort = targets[0];
      const value = (model, target) => {
        if (target !== "Overall") return result[model][target]?.[view] ?? null;
        const values = SUMMARY_TARGETS.map((t) => result[model][t]?.[view]);
        if (!values.every(Number.isFinite)) return null;
        return view === "geomean"
          ? values.includes(0) ? 0 : Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length)
          : values.reduce((sum, v) => sum + v, 0) / values.length;
      };
      const models = Object.keys(result).sort((a, b) => summarySort === "Model" ? a.localeCompare(b) : (value(a, summarySort) ?? Infinity) - (value(b, summarySort) ?? Infinity) || a.localeCompare(b));
      const count = models.reduce((total, m) => total + SUMMARY_TARGETS.reduce((n, t) => n + (result[m][t]?.count || 0), 0), 0);
      if (!count) { status.textContent = "No scores for this selection. Widen the period or include crisis origins."; saveState(); return; }
      const displayName = metric === "SqErr" ? "RMSE" : metric === "QuantileLoss" ? "Quantile loss" : "MAE";
      const columns = targets.includes("Overall") ? ["Model", "Overall", ...SUMMARY_TARGETS] : ["Model", ...targets];
      let html = `<table class="eval-summary-table"><caption class="visually-hidden">${displayName} — ${view === "geomean" ? "geometric mean relative to RandomWalk" : view}; lower is better.</caption><thead><tr>`;
      for (const t of columns) html += `<th scope="col" aria-sort="${summarySort === t ? "ascending" : "none"}"><button class="dash-sort" data-sort="${t}">${t}${summarySort === t ? " ↑" : ""}</button></th>`;
      html += "</tr></thead><tbody>";
      const best = Object.fromEntries(targets.map((t) => [t, Math.min(...models.map((m) => value(m, t) ?? Infinity))]));
      for (const m of models) {
        html += "<tr>";
        for (const t of columns) {
          if (t === "Model") { html += `<th scope="row"><a href="models/?model=${encodeURIComponent(m)}">${D.escape(D.modelName(m))}</a></th>`; continue; }
          const v = value(m, t), winner = v !== null && v === best[t];
          html += `<td${winner ? ' class="best"' : ""}>${v === null ? "—" : view === "rank" ? v.toFixed(2) : D.format(v)}${winner ? '<span class="visually-hidden"> (best)</span>' : ""}</td>`;
        }
        html += "</tr>";
      }
      sumTableDiv.innerHTML = html + "</tbody></table>";
      sumTableDiv.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", async () => {
        summarySort = button.dataset.sort; await drawSummary();
        sumTableDiv.querySelector(`[data-sort="${summarySort}"]`)?.focus();
      }));
      status.textContent = "";
      saveState();
    } catch {
      if (id !== summaryRequest || activeTab !== "summary") return;
      status.textContent = "Could not load all ranking data. Check your connection and retry."; retry.hidden = false;
    } finally { if (id === summaryRequest) panelSummary.setAttribute("aria-busy", "false"); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
