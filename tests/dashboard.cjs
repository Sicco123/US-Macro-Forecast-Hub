// Run with: node tests/dashboard.cjs (stdlib only; DOM/Plotly doubles, not a browser audit).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const data = name => JSON.parse(read(`docs/data/${name}`));
const tick = () => new Promise(resolve => setImmediate(resolve));

function environment(page, query = '') {
  const elements = {};
  class Element {
    constructor(tag = 'div', attrs = '') {
      this.tagName = tag.toUpperCase(); this.attrs = {}; this.events = {}; this.style = {}; this.dataset = {};
      this.clientWidth = 375; this.options = []; this.children = []; this.textContent = ''; this.value = '';
      this.classList = { toggle() {} };
      for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) { this[m[1]] = m[2]; this.attrs[m[1]] = m[2]; }
      this.checked = /\bchecked\b/.test(attrs); this.hidden = /\bhidden\b/.test(attrs);
    }
    get selectedOptions() { return this.options.filter(o => o.value === String(this.value)); }
    get validity() { return { valid: this.type === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(this.value) && this.value >= this.min && this.value <= this.max : Number.isInteger(+this.value) && +this.value >= +this.min && +this.value <= +this.max }; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k]; }
    addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
    on(k, fn) { this.addEventListener(k, fn); }
    removeAllListeners(k) { this.events[k] = []; }
    replaceChildren() { this.innerHTML = ''; }
    set innerHTML(html) { this.html = html; this.children = [...html.matchAll(/<input\b([^>]*)>/g)].map(m => new Element('input', m[1])); }
    get innerHTML() { return this.html || ''; }
    querySelector(s) { return s[0] === '#' ? elements[s.slice(1)] : (elements[s] ||= new Element()); }
    querySelectorAll(s) { return s === 'input' ? this.children : []; }
    closest() { return ['INPUT','BUTTON','SELECT','SUMMARY'].includes(this.tagName) ? this : null; }
    focus() { this.focused = true; }
    append(el) { this.children.push(el); }
  }
  const md = read(page === 'fc' ? 'docs/forecasts/latest.md' : page === 'history' ? 'docs/evaluation/history.md' : 'docs/index.md');
  for (const m of md.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) elements[m[3]] = new Element(m[1], m[2]);
  for (const m of md.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const el = elements[m[1]];
    el.options = [...m[2].matchAll(/<option value="([^"]+)"([^>]*)>([^<]+)<\/option>/g)].map(o => ({ value:o[1], textContent:o[3], selected:o[2].includes('selected') }));
    el.value = (el.options.find(o => o.selected) || el.options[0]).value;
  }
  const context = { console, URL, URLSearchParams, Blob, setTimeout, clearTimeout, setInterval, clearInterval,
    location: new URL('http://localhost/' + query), MutationObserver: class { observe() {} },
    document: { currentScript:{src:'http://localhost/js/dashboard.js'}, readyState:'loading',
      body:new Element(), getElementById:id=>elements[id], querySelectorAll:()=>[], addEventListener(){},
      createElement:tag=>new Element(tag), head:{append(){}} },
    Plotly: { react(el,traces,layout) { el.traces=traces; el.layout=layout; }, purge(el) { el.traces=[]; el.layout=null; } },
    addEventListener() {},
  };
  context.window = context;
  context.history = { replaceState(_a,_b,url) { context.location = new URL(url); } };
  vm.createContext(context); vm.runInContext(read('docs/js/dashboard.js'), context);
  context.Dashboard.json = async name => data(name);
  const file = page === 'fc' ? 'forecasts' : 'evaluation';
  let code = read(`docs/js/${file}.js`);
  code = code.replace('  if (document.readyState', `  window.testUI = { init, onTargetChange${page === 'fc' ? ', onRangeChange, stepSlider' : ', drawSummary, drawChart'} };\n  if (document.readyState`);
  vm.runInContext(code, context);
  return {context, elements, D:context.Dashboard, ui:context.testUI};
}

async function checkModelButtons(env, prefix) {
  const {elements, context, ui} = env;
  const boxes = () => elements[`${prefix}-models`].querySelectorAll('input');
  const click = id => elements[`${prefix}-${id}`].events.click[0]();
  const charts = prefix === 'fc' ? ['score-chart', 'cumulative-chart', 'relative-chart'] : ['chart', 'cumulative-chart', 'relative-chart'];
  if (prefix === 'fc') {
    elements['fc-accuracy'].open = true;
    elements['fc-accuracy'].events.toggle[0]();
  }
  assert.equal(elements[`${prefix}-models-show`].disabled, false);
  click('models-hide');
  assert.ok(boxes().every(cb => !cb.checked));
  assert.equal(context.location.searchParams.get('models'), '');
  for (const chart of charts) assert.equal(elements[`${prefix}-${chart}`].traces.length, 0);
  if (prefix === 'fc') assert.deepEqual(Array.from(elements['fc-chart'].traces, t => t.name), ['Observed']);
  await ui.onTargetChange();
  assert.ok(boxes().every(cb => !cb.checked));
  click('models-show');
  assert.ok(boxes().every(cb => cb.checked));
  assert.equal(context.location.searchParams.get('models').split(',').length, boxes().length);
  for (const chart of charts) assert.equal(elements[`${prefix}-${chart}`].traces.filter(t => t.name).length, boxes().length);
  const cb = boxes()[0]; cb.checked = false; cb.events.change[0]();
  assert.ok(!context.location.searchParams.get('models').split(',').includes(cb.value));
  click('models-show');
}

(async () => {
  // Display deadlines independently of the browser's own timezone, in winter and summer.
  for (const [now, expected] of [['2026-01-17T05:00:00Z','Registration OPEN'], ['2026-07-17T04:00:00Z','Registration OPEN'], ['2026-07-18T04:00:00Z','August 17, 2026']]) {
    const el = { classList: { toggle() {} } };
    const NativeDate = Date;
    class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } }
    vm.runInNewContext(read('docs/js/countdown.js'), { Date:FixedDate, Intl, document:{getElementById:()=>el}, setInterval() {} });
    assert.ok(el.textContent.includes(expected), el.textContent);
  }
  const {D} = environment('fc');
  assert.equal(D.modelName('MacroHub-TVNN-EW'),'TVNN-EW');
  assert.equal(D.modelName('BASELINE-ARMA_BIC'),'ARMA_BIC');
  const ensemble = data('forecasts_CPIAUCSL.json').models['MacroHub-Ensemble']['2000-01-17'];
  assert.equal(D.point(ensemble,0).statistic,'Median'); assert.equal(D.point(ensemble,0).value,ensemble.q050[0]);
  assert.equal(D.point({q050:[0.0000002]},0).value,0.0000002);
  assert.equal(D.point({mean:[0],q050:[4]},0).value,0);
  assert.notEqual(D.format(0.0022),'0.00');
  assert.notEqual(D.format(0.0000002),'0');
  assert.equal(D.nextMonth('2020-02'),'2020-03-01');
  assert.equal(D.nextMonth('2020-12'),'2021-01-01');
  const paired = {origin_dates:['2020-01-17','2020-02-17','2020-03-17','2020-04-17','2020-05-17'], models:{A:{
    h0:{MAE:[999,999,999,999,999], MAE_paired_sum:[2,0,null,4,999], MAE_benchmark_sum:[0,2,4,2,1],
      SqErr_paired_sum:[4,0,null,16,999], SqErr_benchmark_sum:[0,4,16,4,1]},
    h1:{MAE_paired_sum:[0,2,100,0,999], MAE_benchmark_sum:[0,6,null,0,1]},
  }}};
  const ratios = (metric='MAE', horizon='all', from='2020-01', to='2020-04') =>
    D.relativeCumulative(paired, 'A', metric, horizon, from, to);
  assert.deepEqual(Array.from(ratios().y), [null, .5, .5, .8]); // pooled sums, never averages of ratios
  assert.deepEqual(Array.from(ratios('MAE','0').y), [null, 1, 1, 1.5]);
  assert.deepEqual(Array.from(ratios('SqErr','0').y), [null, 1, 1, 2.5]); // no square root
  assert.deepEqual(Array.from(ratios('MAE','all','2020-02','2020-02').y), [.25]); // reset at From
  assert.deepEqual(Array.from(ratios().x), paired.origin_dates.slice(0,4));
  assert.equal(ratios('MAE','all','2021-01','2021-02').y.length, 0);
  assert.ok(ratios('MAE','99').y.every(v => v === null));
  paired.models.A.h0.MAE_paired_sum=[0,0,0,0,0];
  paired.models.A.h1.MAE_paired_sum=[0,0,0,0,0];
  assert.deepEqual(Array.from(ratios().y), [null, 0, 0, 0]);
  delete paired.models.A.h0.MAE_paired_sum;
  delete paired.models.A.h1.MAE_paired_sum;
  assert.ok(ratios().y.every(v => v === null)); // no fallback to unmatched raw losses
  const tiny = {X:{origin_dates:['2020-01-17'],models:{A:{h0:{MAE:[0],SqErr:[0]},h1:{MAE:[100],SqErr:[100]}},B:{h0:{MAE:[1],SqErr:[1]},h1:{MAE:[2],SqErr:[4]}},C:{h0:{MAE:[1],SqErr:[1]},h1:{MAE:[2],SqErr:[4]}}}}};
  const opts = {horizon:'all',fromMonth:'2000-01',toMonth:'2026-12',includeCovid:true};
  let result = D.summarize(tiny,'MAE',opts);
  assert.equal(result.A.X.rank,2); assert.equal(result.B.X.rank,1.5); assert.equal(result.C.X.rank,1.5);
  assert.equal(result.A.X.count,2); assert.equal(D.summarize(tiny,'SqErr',opts).A.X.score,Math.sqrt(50));
  assert.equal(D.summarize(tiny,'MAE',{...opts,fromMonth:'2021-01'}).A.X.score,null);
  const geo = {X:{origin_dates:['2008-01-17','2020-04-17','2022-01-17'],models:{A:{h0:{
    QuantileLoss:[2,8,4], QuantileLoss_paired_sum:[2,8,4], QuantileLoss_benchmark_sum:[1,1,1]
  },h1:{QuantileLoss:[1,1,1], QuantileLoss_paired_sum:[1,1,1], QuantileLoss_benchmark_sum:[2,2,2]}}}}};
  assert.ok(Math.abs(D.summarize(geo,'QuantileLoss',opts).A.X.geomean-Math.sqrt(14/3*.5))<1e-12);
  assert.ok(Math.abs(D.summarize(geo,'QuantileLoss',{...opts,includeCovid:false,includeGfc:false}).A.X.geomean-Math.sqrt(2))<1e-12);
  assert.equal(D.summarize(geo,'QuantileLoss',{...opts,fromMonth:'2022-02'}).A.X.geomean,null);
  geo.X.models.A.h0.QuantileLoss_paired_sum=[0,0,0];
  assert.equal(D.summarize(geo,'QuantileLoss',opts).A.X.geomean,0);
  geo.X.models.A.h0.QuantileLoss_benchmark_sum=[0,0,0];
  geo.X.models.A.h1.QuantileLoss_benchmark_sum=[0,0,0];
  assert.equal(D.summarize(geo,'QuantileLoss',opts).A.X.geomean,null);
  delete geo.X.models.A.h0.QuantileLoss_paired_sum;
  geo.X.models.A.h0.QuantileLoss_benchmark_sum=[1,1,1];
  assert.equal(D.summarize(geo,'QuantileLoss',opts).A.X.geomean,null);
  const all = Object.fromEntries(['INDPRO','CPIAUCSL','PCEPI','UNRATE'].map(t=>[t,data(`scores_${t}.json`)]));
  assert.deepEqual(Object.keys(data('models.json')).sort(), Object.keys(all.INDPRO.models).sort());
  result = D.summarize(all,'MAE',opts);
  const generated = data('summary.json').avg_rank.MAE;
  for (const [m,targets] of Object.entries(result)) for (const [t,v] of Object.entries(targets)) assert.equal(+v.rank.toFixed(2),generated[m][t]);
  assert.equal(result['MacroHub-TVNN'].CPIAUCSL.rank,result['MacroHub-TVNN-EW'].CPIAUCSL.rank);

  const fc = environment('fc'); await fc.ui.init();
  assert.equal(fc.elements['fc-slider-label'].textContent,'2026-04-15');
  assert.equal(fc.elements['fc-next'].disabled,true);
  assert.ok(fc.elements['fc-chart'].traces.some(t=>t.name==='ARMA_BIC'));
  assert.equal(fc.elements['fc-status'].textContent,'');
  await checkModelButtons(fc, 'fc');
  assert.equal(fc.elements['fc-relative-chart'].layout.shapes[0].y0, 1);
  assert.ok(fc.elements['fc-relative-chart'].traces.some(t => t.y.some(Number.isFinite)));
  assert.match(fc.elements['fc-relative-table'].innerHTML, /Model \/ RW/);
  fc.elements['fc-month-from'].value='2026-01'; fc.elements['fc-month-to'].value='2020-12'; fc.ui.onRangeChange();
  assert.match(fc.elements['fc-status'].textContent,/valid months/); assert.equal(fc.elements['fc-play'].disabled,true);
  assert.equal(fc.elements['fc-relative-chart'].traces.length,0);
  fc.elements['fc-month-from'].value='2027-01'; fc.elements['fc-month-to'].value='2028-12'; fc.ui.onRangeChange();
  assert.match(fc.elements['fc-status'].textContent,/No forecast origins/); fc.ui.stepSlider(1);
  const restored = environment('fc','?target=CPIAUCSL&from=2000&to=2001&origin=2000-01-17&models=MacroHub-Ensemble&horizon=2');
  await restored.ui.init();
  const trace=restored.elements['fc-chart'].traces.find(t=>t.name==='Ensemble');
  assert.equal(trace.y[0],ensemble.q050[0]); assert.equal(trace.customdata[0],'Median'); assert.equal(trace.y.length,2);
  assert.equal(restored.context.location.searchParams.get('origin'),'2000-01-17');
  assert.equal(restored.elements['fc-month-from'].value,'2000-01');
  assert.equal(restored.elements['fc-month-to'].value,'2001-12');
  restored.elements['fc-month-from'].value='2000-02';
  restored.elements['fc-month-to'].value='2000-02';
  restored.ui.onRangeChange();
  assert.equal(restored.elements['fc-slider-label'].textContent,'2000-02-17');
  assert.equal(restored.elements['fc-chart'].layout.xaxis.range[0],'2000-02-01');
  assert.equal(restored.elements['fc-chart'].layout.xaxis.range[1],'2000-03-01');
  const keyEvent={target:restored.elements['fc-reset-zoom'],key:' ',preventDefault(){throw Error('Button Space intercepted');}};
  restored.elements['fc-dashboard'].events.keydown[0](keyEvent);
  const original=restored.D.json; let resolveOld;
  restored.D.json=name=>name==='forecasts_INDPRO.json'?new Promise(r=>{resolveOld=r}):original(name);
  restored.elements['fc-target'].value='INDPRO'; const old=restored.ui.onTargetChange();
  restored.elements['fc-target'].value='UNRATE'; await restored.ui.onTargetChange(); resolveOld(data('forecasts_INDPRO.json')); await old;
  assert.equal(restored.elements['fc-chart'].layout.title.text,'UNRATE');
  restored.D.json=async()=>{throw Error('offline')}; await restored.ui.onTargetChange();
  assert.match(restored.elements['fc-status'].textContent,/Could not load/); assert.equal(restored.elements['fc-retry'].hidden,false);
  assert.equal(restored.elements['fc-models-show'].disabled,true);
  assert.equal(restored.elements['fc-models-hide'].disabled,true);
  assert.equal(restored.elements['fc-relative-chart'].traces.length,0);
  assert.equal(restored.elements['fc-relative-table'].innerHTML,'');

  const ev=environment('eval'); ev.ui.init(); await tick();
  assert.equal(ev.elements['eval-sum-view'].value,'geomean');
  assert.ok(!ev.elements['eval-chart']);
  assert.match(ev.elements['eval-sum-table'].innerHTML, /data-sort="Model"[\s\S]*data-sort="Overall"/);
  assert.match(ev.elements['eval-sum-table'].innerHTML, /data-sort="Overall"/);
  assert.ok(!ev.elements['eval-sum-table'].innerHTML.includes('cells'));
  assert.ok(!ev.elements['eval-sum-table'].innerHTML.includes('<th scope="row">MacroHub'));
  assert.match(ev.elements['eval-sum-table'].innerHTML, /href="models\/\?model=BASELINE-ARMA_BIC"/);
  const detail = {textContent:'', innerHTML:''};
  vm.runInNewContext(read('docs/js/model.js'), {
    document:{getElementById:()=>detail}, location:{search:'?model=BASELINE-ARMA_BIC'},
    URLSearchParams, Dashboard:{json:async()=>data('models.json'), escape:D.escape},
  });
  await tick();
  assert.match(detail.innerHTML, /ARMA with BIC Lag Selection/);
  ev.elements['eval-sum-metric'].value='QuantileLoss'; await ev.ui.drawSummary();
  assert.ok(!ev.elements['eval-sum-table'].innerHTML.includes('<td>—</td>'));
  ev.elements['eval-sum-view'].value='rank'; await ev.ui.drawSummary();
  assert.match(ev.elements['eval-sum-table'].innerHTML, /data-sort="Overall"/);
  assert.match(ev.elements['eval-sum-table'].innerHTML,/aria-sort="ascending"/);
  ev.elements['eval-sum-view'].value='score'; await ev.ui.drawSummary();
  assert.equal(ev.elements['eval-sum-table'].innerHTML.includes('data-sort="Overall"'),false);
  const history=environment('history'); history.ui.init(); await tick();
  await checkModelButtons(history, 'eval');
  history.elements['eval-horizon'].value='0';
  history.elements['eval-metric'].value='SqErr';
  history.ui.drawChart();
  const rwRatio = history.elements['eval-relative-chart'].traces.find(t => t.name === 'RandomWalk');
  assert.ok(rwRatio.y.some(v => v === 1));
  assert.ok(rwRatio.y.every(v => v === null || v === 1));
  const ensembleScores = all.INDPRO.models['MacroHub-Ensemble'].h0;
  const expectedRatio = ensembleScores.SqErr_paired_sum.reduce((a,b)=>a+b,0) / ensembleScores.SqErr_benchmark_sum.reduce((a,b)=>a+b,0);
  assert.equal(history.elements['eval-relative-chart'].traces.find(t => t.name === 'Ensemble').y.at(-1), expectedRatio);
  const rwCb = history.elements['eval-models'].querySelectorAll('input').find(cb => cb.value === 'MacroHub-RandomWalk');
  rwCb.checked = false; rwCb.events.change[0]();
  assert.equal(history.elements['eval-relative-chart'].layout.shapes[0].y0,1);
  assert.equal(history.elements['eval-relative-chart'].traces.find(t => t.name === 'Ensemble').y.at(-1),expectedRatio);
  assert.match(history.elements['eval-relative-table'].innerHTML, /Cumulative squared error \/ RW/);
  assert.ok(!history.elements['eval-sum-table']);
  history.elements['eval-metric'].value='QuantileLoss';
  history.elements['eval-month-from'].value='2020-03';
  history.elements['eval-month-to'].value='2020-03';
  for(let i=0;i<3;i++) history.ui.drawChart();
  assert.equal(history.elements['eval-relative'].hidden,true);
  assert.equal(history.elements['eval-relative-chart'].traces.length,0);
  history.elements['eval-metric'].value='MAE'; history.ui.drawChart();
  assert.equal(history.elements['eval-relative'].hidden,false);
  assert.equal(history.elements['eval-relative-chart'].events.plotly_relayout.length,1);
  assert.ok(history.elements['eval-cumulative-chart'].traces.some(t => t.y.length));
  assert.ok(history.elements['eval-cumulative-chart'].traces.every(t => t.x.every(d => d.startsWith('2020-03'))));
  assert.equal(history.elements['eval-chart'].events.plotly_relayout.length,1);
  history.D.json=async()=>{throw Error('offline')}; await history.ui.onTargetChange();
  assert.equal(history.elements['eval-chart'].traces.length,0); assert.equal(history.elements['eval-cumulative-chart'].traces.length,0);
  assert.equal(history.elements['eval-retry'].hidden,false);
  assert.equal(history.elements['eval-models-show'].disabled,true);
  assert.equal(history.elements['eval-models-hide'].disabled,true);
  assert.equal(history.elements['eval-relative-chart'].traces.length,0);
  assert.equal(history.elements['eval-relative-table'].innerHTML,'');
  console.log('Dashboard checks passed: cumulative RW ratios, model toggles, point fallback, ranks/ties, RMSE, coverage, latest defaults, URL restoration, empty/invalid ranges, keyboard, request races, errors, and listener cleanup.');
})();
