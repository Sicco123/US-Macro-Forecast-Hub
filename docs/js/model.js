(function () {
  "use strict";
  const details = document.getElementById("model-details");
  if (!details) return;
  const model = new URLSearchParams(location.search).get("model");
  Dashboard.json("models.json").then((models) => {
    const info = models[model];
    if (!info) { details.textContent = "Model details are unavailable."; return; }
    const escape = Dashboard.escape;
    details.innerHTML = `<h2>${escape(info.name)}</h2>
      <p><strong>Team:</strong> ${escape(info.team)}</p>
      ${info.version ? `<p><strong>Version:</strong> ${escape(info.version)}</p>` : ""}
      <p><strong>Method:</strong> ${escape(info.method)}</p>
      ${info.inputs ? `<p><strong>Inputs:</strong> ${escape(info.inputs)}</p>` : ""}`;
  }).catch(() => { details.textContent = "Could not load model details. Please reload the page."; });
})();
