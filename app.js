/* ═══════════════════════════════════════════════════════
   POWER PATHWAY OPTIMIZER — Main Application
═══════════════════════════════════════════════════════ */

'use strict';

// ─── GLOBAL CHART DEFAULTS ────────────────────────────
Chart.defaults.color          = '#94a3b8';
Chart.defaults.borderColor    = 'rgba(59,130,246,0.1)';
Chart.defaults.font.family    = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size      = 11;

// ─── APP STATE ────────────────────────────────────────
const state = {
  currentView: 'configure',
  charts: {},
  selectedStrategy: 'hybrid-phased',
  optimized: false,
  rankingResults:     null,   // result of rankTechnologies() — legacy relative scores
  lastRankingWeights: null,   // weights used for last ranking run
  optimizerResult:    null,   // result of optimize() — absolute engineering values
  lastParams:         null,   // params snapshot from last optimization run
};

// ─── STRATEGY DATA ────────────────────────────────────
const STRATEGIES = [
  {
    id: 'hybrid-phased',
    name: 'Hybrid Phased',
    subtitle: '50 MW gas + 20 MW BESS → full grid',
    color: '#10b981', colorRgb: '16,185,129',
    icon: '⚙',
    recommended: true,
    score: 92,
    metrics: {
      timeToFullPower: 18,
      capex: 87,
      lcoe: 0.068,
      npv10yr: 118,
      carbonIntensity: 0.38,
      resilienceScore: 88,
      permittingRisk: 'Medium',
    },
    pros: [
      'Balanced cost/speed trade-off',
      'BESS enables grid-services revenue',
      'Manageable permitting complexity',
      'Built-in contingency flexibility',
    ],
    cons: [
      'Two-phase project complexity',
      'Medium air quality permitting risk',
      'Gas lock-in through grid arrival',
    ],
    cashflow: [-87, -12, -10, 18, 32, 45, 58, 72, 88, 105],
    phases: [
      { name: 'Grid Application & Permitting', start: 0, end: 5, color: '#8b5cf6' },
      { name: '50 MW Gas Turbine Procurement', start: 2, end: 9, color: '#f59e0b' },
      { name: 'Gas Turbine Installation', start: 8, end: 15, color: '#f97316' },
      { name: 'BESS Procurement & Install', start: 10, end: 18, color: '#8b5cf6' },
      { name: 'Partial Ops — 50 MW Gas', start: 15, end: 36, color: '#06b6d4' },
      { name: 'Grid Interconnection Queue', start: 9, end: 36, color: '#374151' },
      { name: 'Grid Upgrade Construction', start: 33, end: 36, color: '#f97316' },
      { name: 'Full Ops — Grid + Gas Backup', start: 36, end: 60, color: '#10b981' },
    ],
    gates: [
      { month: 3,  title: 'Submit grid interconnection application + begin air permits', type: 'action' },
      { month: 9,  title: 'Gas turbine LOI — commit to 50 MW configuration', type: 'action' },
      { month: 15, title: '50 MW Gas Online — Phase 1 Revenue Operations Begin', type: 'milestone' },
      { month: 18, title: 'BESS Online — 100 MW capacity via Gas + BESS', type: 'milestone' },
      { month: 24, title: 'Checkpoint: If grid delayed >42 mo, add 10 MW BESS', type: 'contingency' },
      { month: 36, title: 'Grid Energization — Transition gas to backup/peaking role', type: 'decision' },
      { month: 42, title: 'BESS optimization — evaluate demand response revenue', type: 'action' },
    ],
    risks: ['interconnect-delay', 'supply-chain', 'gas-price', 'cost-overrun'],
  },
  {
    id: 'grid-first',
    name: 'Grid-First',
    subtitle: 'Wait for utility interconnection',
    color: '#3b82f6', colorRgb: '59,130,246',
    icon: '⚡',
    score: 71,
    metrics: {
      timeToFullPower: 36,
      capex: 28,
      lcoe: 0.055,
      npv10yr: 142,
      carbonIntensity: 0.35,
      resilienceScore: 55,
      permittingRisk: 'Low',
    },
    pros: [
      'Lowest CAPEX — $28M',
      'Minimal carbon emissions',
      'No complex permitting',
    ],
    cons: [
      '36+ month delay to full power',
      'High interconnection uncertainty',
      'Single point of failure — no resilience',
      'Revenue gap during queue wait',
    ],
    cashflow: [-28, -8, -5, -2, 14, 28, 42, 58, 76, 95],
    phases: [
      { name: 'Grid Application & Study', start: 0, end: 9, color: '#8b5cf6' },
      { name: 'Interconnection Queue Wait', start: 9, end: 32, color: '#374151' },
      { name: 'Grid Upgrade Construction', start: 32, end: 36, color: '#f97316' },
      { name: 'Full Grid Operations', start: 36, end: 60, color: '#3b82f6' },
    ],
    gates: [
      { month: 3,  title: 'Submit interconnection application — begin feasibility study', type: 'action' },
      { month: 9,  title: 'Study results — Decision: Proceed or appeal queue position', type: 'decision' },
      { month: 20, title: 'Checkpoint: Evaluate on-site gen if delays exceed 36 months', type: 'contingency' },
      { month: 36, title: 'Grid Energization — Full campus power achieved', type: 'milestone' },
    ],
    risks: ['interconnect-delay', 'grid-curtailment', 'regulatory-change'],
  },
  {
    id: 'full-onsite-gas',
    name: 'Full On-Site Gas',
    subtitle: '100 MW gas turbines, bridge to grid',
    color: '#f97316', colorRgb: '249,115,22',
    icon: '🔥',
    score: 64,
    metrics: {
      timeToFullPower: 14,
      capex: 125,
      lcoe: 0.082,
      npv10yr: 89,
      carbonIntensity: 0.54,
      resilienceScore: 85,
      permittingRisk: 'High',
    },
    pros: [
      'Fastest time to power — 14 months',
      'Highest operational resilience',
      'Revenue-generating during grid wait',
    ],
    cons: [
      'Highest CAPEX — $125M',
      'High emissions — complex air permits',
      'Stranded asset risk when grid arrives',
      'NOx limits may block permits',
    ],
    cashflow: [-125, -18, 5, 22, 35, 48, 60, 72, 84, 95],
    phases: [
      { name: 'Engineering & Air Permitting', start: 0, end: 4, color: '#8b5cf6' },
      { name: 'Equipment Procurement', start: 2, end: 8, color: '#f59e0b' },
      { name: '100 MW Gas Turbine Installation', start: 7, end: 14, color: '#f97316' },
      { name: 'Primary Gas Operations', start: 14, end: 36, color: '#ef4444' },
      { name: 'Grid Interconnection (Parallel)', start: 9, end: 36, color: '#374151' },
      { name: 'Hybrid Gas + Grid Transition', start: 36, end: 48, color: '#06b6d4' },
      { name: 'Grid Primary + Gas Backup', start: 48, end: 60, color: '#10b981' },
    ],
    gates: [
      { month: 2,  title: 'Begin air quality permit application — NOx analysis', type: 'action' },
      { month: 4,  title: 'Final turbine spec — letter of intent to manufacturer', type: 'action' },
      { month: 8,  title: 'Permit decision — Proceed or redesign for lower NOx', type: 'decision' },
      { month: 14, title: 'First Gas Power — 100 MW campus online', type: 'milestone' },
      { month: 36, title: 'Grid Arrives — Decide turbine role: backup, peaking, or DR', type: 'decision' },
      { month: 48, title: 'Asset optimization — demand response, grid services, or decommission', type: 'decision' },
    ],
    risks: ['air-permit', 'gas-price', 'supply-chain', 'stranded-asset'],
  },
  {
    id: 'gas-bess-bridge',
    name: 'Gas-BESS Bridge',
    subtitle: '30 MW gas + 40 MW BESS, fast bridge',
    color: '#06b6d4', colorRgb: '6,182,212',
    icon: '🔋',
    score: 84,
    metrics: {
      timeToFullPower: 16,
      capex: 98,
      lcoe: 0.071,
      npv10yr: 108,
      carbonIntensity: 0.28,
      resilienceScore: 90,
      permittingRisk: 'Medium',
    },
    pros: [
      'Fast deployment — 16 months',
      'Best resilience score (90%)',
      'Lower emissions than full gas',
      'BESS enables frequency regulation',
    ],
    cons: [
      'Higher CAPEX than grid-first',
      'BESS supply chain lead time risk',
      'Gas infrastructure still required',
    ],
    cashflow: [-98, -14, 8, 24, 38, 52, 66, 79, 93, 107],
    phases: [
      { name: 'Permitting + Engineering', start: 0, end: 4, color: '#8b5cf6' },
      { name: '30 MW Gas Turbine Procurement', start: 2, end: 7, color: '#f59e0b' },
      { name: '40 MW BESS Procurement', start: 3, end: 9, color: '#f59e0b' },
      { name: 'Gas + BESS Installation', start: 7, end: 16, color: '#f97316' },
      { name: 'Full Ops — Gas + BESS (70 MW)', start: 16, end: 36, color: '#06b6d4' },
      { name: 'Grid Application & Wait', start: 4, end: 36, color: '#374151' },
      { name: 'Grid Integration', start: 34, end: 36, color: '#f97316' },
      { name: 'Grid Primary + BESS Peaking', start: 36, end: 60, color: '#10b981' },
    ],
    gates: [
      { month: 2,  title: 'Submit air permit + grid application simultaneously', type: 'action' },
      { month: 7,  title: 'Gas turbine (30 MW) delivery confirmed — begin install', type: 'action' },
      { month: 16, title: 'Full 70 MW capacity online — Gas + BESS', type: 'milestone' },
      { month: 24, title: 'BESS grid services eval — frequency regulation contract', type: 'action' },
      { month: 36, title: 'Grid arrives — transition BESS to optimization/arbitrage', type: 'decision' },
    ],
    risks: ['supply-chain', 'gas-price', 'cost-overrun', 'grid-curtailment'],
  },
  {
    id: 'renewable-bridge',
    name: 'Renewable Bridge',
    subtitle: '40 MW solar + 60 MW BESS + grid',
    color: '#8b5cf6', colorRgb: '139,92,246',
    icon: '☀',
    score: 76,
    metrics: {
      timeToFullPower: 26,
      capex: 148,
      lcoe: 0.074,
      npv10yr: 95,
      carbonIntensity: 0.12,
      resilienceScore: 72,
      permittingRisk: 'Low',
    },
    pros: [
      'Lowest carbon intensity (0.12 tCO₂/MWh)',
      'Strongest ESG/sustainability story',
      'Low regulatory permitting risk',
      'Long-term cost savings trajectory',
    ],
    cons: [
      'Highest CAPEX — $148M',
      'Slowest time to full power (26 mo)',
      'Solar variability — storage sizing challenge',
      'Large land area requirement',
    ],
    cashflow: [-148, -20, -8, 10, 26, 44, 62, 80, 100, 118],
    phases: [
      { name: 'Solar & BESS Permitting', start: 0, end: 4, color: '#8b5cf6' },
      { name: 'Solar Panel Procurement', start: 2, end: 10, color: '#f59e0b' },
      { name: 'BESS Procurement', start: 4, end: 12, color: '#f59e0b' },
      { name: 'Solar Phase 1 Installation', start: 10, end: 18, color: '#f97316' },
      { name: 'BESS Installation', start: 12, end: 20, color: '#8b5cf6' },
      { name: 'Solar Phase 2 Expansion', start: 18, end: 26, color: '#f97316' },
      { name: 'Full Renewable Operations', start: 26, end: 36, color: '#8b5cf6' },
      { name: 'Grid Integration', start: 34, end: 38, color: '#06b6d4' },
      { name: 'Hybrid Renewable + Grid', start: 38, end: 60, color: '#10b981' },
    ],
    gates: [
      { month: 2,  title: 'Site assessment and solar resource study complete', type: 'action' },
      { month: 6,  title: 'Solar + BESS supply contracts finalized', type: 'action' },
      { month: 18, title: 'Partial solar online (20 MW) — begin partial operations', type: 'milestone' },
      { month: 26, title: 'Full renewable capacity online — 100 MW equivalent', type: 'milestone' },
      { month: 36, title: 'Grid arrival — optimize renewable vs. grid dispatch strategy', type: 'decision' },
    ],
    risks: ['supply-chain', 'regulatory-change', 'cost-overrun', 'grid-curtailment'],
  },
];

// ─── RISK DATA ────────────────────────────────────────
const ALL_RISKS = {
  'interconnect-delay':  { title: 'Interconnection Queue Delay',    prob: 4, impact: 5, color: '#ef4444', desc: 'Utility queue extends 12–24 months beyond estimate, delaying full grid power and forcing interim generation decisions.', mitigations: ['Secure queue position early', 'Build contingency power plan', 'Lobby for expedited study'] },
  'air-permit':          { title: 'Air Quality Permit Denial',       prob: 3, impact: 5, color: '#ef4444', desc: 'State/local regulators deny gas turbine permits due to NOx emissions, forcing technology re-selection.', mitigations: ['Pre-application agency meetings', 'Low-NOx combustor selection', 'Carbon offset packages'] },
  'supply-chain':        { title: 'Equipment Supply Chain Delays',   prob: 3, impact: 4, color: '#f97316', desc: 'Gas turbine or BESS lead times extend 6–12 months due to global demand, impacting project schedule.', mitigations: ['Early equipment LOI', 'Dual sourcing strategy', 'Buffer schedule in Phase 1'] },
  'gas-price':           { title: 'Natural Gas Price Volatility',    prob: 4, impact: 3, color: '#f59e0b', desc: 'Henry Hub prices spike 40–80%, materially increasing OPEX for gas-heavy strategies.', mitigations: ['Long-term gas supply contracts', 'Fixed-price hedges', 'BESS dispatch optimization'] },
  'cost-overrun':        { title: 'Construction Cost Overrun',       prob: 3, impact: 3, color: '#f59e0b', desc: 'Labor and material inflation adds 15–25% to CAPEX beyond base estimate.', mitigations: ['Fixed-price EPC contract', '10% contingency reserve', 'Early material procurement'] },
  'regulatory-change':   { title: 'Carbon/NOx Policy Escalation',   prob: 2, impact: 4, color: '#f97316', desc: 'New state or federal carbon pricing or NOx cap regulations add cost to gas-fired generation.', mitigations: ['Monitor legislative calendar', 'Design for fuel-switch readiness', 'Engage policy advocacy'] },
  'grid-curtailment':    { title: 'Grid Reliability / Curtailment',  prob: 2, impact: 3, color: '#f59e0b', desc: 'Grid-delivered power is curtailed during high-demand events, forcing reliance on backup generation.', mitigations: ['On-site BESS for backup', 'Demand flexibility programs', 'Grid reliability tariff review'] },
  'stranded-asset':      { title: 'Stranded Gas Turbine Asset',      prob: 3, impact: 4, color: '#f97316', desc: 'Full on-site gas strategy creates large asset at risk of under-utilization when grid arrives.', mitigations: ['Plan peaking/DR role from day 1', 'Contractual repurposing options', 'Power sales agreements'] },
};

// ─── LOAD RAMP STATE ──────────────────────────────────
state.loadRampPhases = [
  { name: 'Phase 1 — Initial',   month: 6,  pct: 30  },
  { name: 'Phase 2 — Expansion', month: 18, pct: 70  },
  { name: 'Phase 3 — Full Load', month: 36, pct: 100 },
];

function renderPhaseTable() {
  const tbody = document.getElementById('phase-tbody');
  if (!tbody) return;
  const loadMW = +document.getElementById('cfg-load')?.value || 100;
  const phases  = state.loadRampPhases;

  tbody.innerHTML = phases.map((p, i) => `
    <tr>
      <td><input class="fi phase-fi" type="text" value="${p.name}"
           oninput="state.loadRampPhases[${i}].name=this.value"></td>
      <td><input class="fi phase-fi" type="number" min="0" max="360" value="${p.month}" style="width:72px"
           oninput="state.loadRampPhases[${i}].month=+this.value;validatePhases()"></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <input class="fi phase-fi" type="number" min="1" max="100" value="${p.pct}" style="width:60px"
               oninput="state.loadRampPhases[${i}].pct=+this.value;validatePhases()">
          <span style="font-size:11px;color:var(--text-s)">%</span>
          <span style="font-size:11px;color:var(--text-m)">(${Math.round(p.pct/100*loadMW)} MW)</span>
        </div>
      </td>
      <td>${phases.length > 1
        ? `<button class="btn-icon-rm" onclick="removePhaseRow(${i})">✕</button>`
        : ''}</td>
    </tr>
  `).join('');

  const addBtn = document.getElementById('btn-add-phase');
  if (addBtn) addBtn.disabled = phases.length >= 6;
  validatePhases();
}

function addPhaseRow() {
  if (state.loadRampPhases.length >= 6) return;
  const last = state.loadRampPhases[state.loadRampPhases.length - 1];
  state.loadRampPhases.push({ name: `Phase ${state.loadRampPhases.length + 1}`, month: last.month + 6, pct: 100 });
  renderPhaseTable();
}

function removePhaseRow(idx) {
  if (state.loadRampPhases.length <= 1) return;
  state.loadRampPhases.splice(idx, 1);
  renderPhaseTable();
}

function validatePhases() {
  const phases = state.loadRampPhases;
  const errEl  = document.getElementById('phase-error');
  if (!errEl) return true;
  let err = '';

  for (let i = 1; i < phases.length; i++) {
    if (phases[i].month < phases[i - 1].month) {
      err = `Month in row ${i + 1} must be ≥ row ${i} (${phases[i-1].month} mo).`;
      break;
    }
  }
  if (!err && phases[phases.length - 1].pct !== 100) {
    err = 'Last phase must reach 100% of load target.';
  }

  errEl.textContent  = err;
  errEl.style.display = err ? 'block' : 'none';
  return !err;
}

// ─── QUEUE POSITION → WAIT RANGE ─────────────────────
function queueToWaitRange(pos) {
  // Piecewise-linear: [queue position, min months, max months]
  const anchors = [[1,12,18],[20,18,24],[50,24,36],[80,36,48],[100,48,72]];
  for (let i = 1; i < anchors.length; i++) {
    const [p0,mn0,mx0] = anchors[i-1];
    const [p1,mn1,mx1] = anchors[i];
    if (pos <= p1) {
      const t = (pos - p0) / (p1 - p0);
      return { min: Math.round(mn0 + t*(mn1-mn0)), max: Math.round(mx0 + t*(mx1-mx0)) };
    }
  }
  return { min: 48, max: 72 };
}

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function updateQueueDisplay(pos) {
  const fill   = document.getElementById('queue-bar-fill');
  const marker = document.getElementById('queue-marker');
  const badge  = document.getElementById('queue-badge');
  if (fill)   fill.style.width  = pos + '%';
  if (marker) { marker.style.left = pos + '%'; marker.textContent = pos; }
  if (badge)  badge.textContent = ordinal(pos) + ' in Queue';

  const range = queueToWaitRange(pos);

  // Feed derived values into hidden inputs so scoring engine can read them
  const wminEl = document.getElementById('cfg-wmin');
  const wmaxEl = document.getElementById('cfg-wmax');
  if (wminEl) wminEl.value = range.min;
  if (wmaxEl) wmaxEl.value = range.max;

  // Update display
  const rangeEl = document.getElementById('wrd-range');
  if (rangeEl) rangeEl.textContent = `${range.min} – ${range.max} months`;

  const now     = new Date();
  const minDate = new Date(now); minDate.setMonth(now.getMonth() + range.min);
  const maxDate = new Date(now); maxDate.setMonth(now.getMonth() + range.max);
  const fmt     = d => d.toLocaleDateString('en-US', { year:'numeric', month:'short' });
  const readyEl = document.getElementById('wrd-ready');
  if (readyEl) readyEl.textContent = `${fmt(minDate)} – ${fmt(maxDate)}`;
}

// ─── COLLAPSIBLE TOGGLE ───────────────────────────────
function toggleAdv(id) {
  const body = document.getElementById(id);
  const icon = document.getElementById(id + '-icon');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (icon) icon.textContent = open ? '▼' : '▲';
}

// ─── DEVELOPER PROFILE PRESETS ───────────────────────
const PRESETS = {
  fast:   { time: 50, cost: 25, carbon: 10, res: 15 },
  cost:   { time: 20, cost: 50, carbon: 10, res: 20 },
  green:  { time: 15, cost: 20, carbon: 50, res: 15 },
  uptime: { time: 15, cost: 20, carbon: 10, res: 55 },
};

function applyPreset(name, btn) {
  const p = PRESETS[name];
  if (!p) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('w-time', p.time); set('w-cost', p.cost);
  set('w-carbon', p.carbon); set('w-res', p.res);
  updateWeights();
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ─── STRATEGY REQUIREMENTS & REAL SCORING ENGINE ─────

// Which generation types each strategy needs, and its fixed deployment time (months)
const STRATEGY_REQ = {
  'grid-first':       { needsGas: false, needsBESS: false, needsSolar: false, timeBase: null },
  'full-onsite-gas':  { needsGas: true,  needsBESS: false, needsSolar: false, timeBase: 14   },
  'hybrid-phased':    { needsGas: true,  needsBESS: true,  needsSolar: false, timeBase: 18   },
  'gas-bess-bridge':  { needsGas: true,  needsBESS: true,  needsSolar: false, timeBase: 16   },
  'renewable-bridge': { needsGas: false, needsBESS: true,  needsSolar: true,  timeBase: 26   },
};

// Snapshot original metrics at 100 MW baseline so we can always rescale from them
STRATEGIES.forEach(s => {
  s._base    = { ...s.metrics, cashflow: [...s.cashflow] };
  s.feasible = true;
});

// Read all Configure-page slider/checkbox values into one plain object
function readParams() {
  const g = id => parseFloat(document.getElementById(id)?.value ?? 0);
  const b = id => document.getElementById(id)?.checked ?? false;

  // Build enabled tech list for the optimizer (C4 constraint)
  const techToggleMap = [
    ['opt-sofc',   'fuelCell_SOFC'],
    ['opt-solar',  'solar_bess'],
    ['opt-gas',    'gas_turbine'],
    ['opt-diesel', 'diesel_generator'],
    ['opt-smr',    'smr'],
    ['opt-wind',   'wind_bess'],
    ['opt-geo',    'geothermal'],
  ];
  const enabledTechs = techToggleMap.filter(([id]) => b(id)).map(([, techId]) => techId);

  const rawUtilCap = g('cfg-utcap');
  const loadMW     = g('cfg-load');

  return {
    // Optimizer params
    loadMW,
    gridWaitMin:       g('cfg-wmin'),
    gridWaitMax:       g('cfg-wmax'),
    budgetM:           0,   // Financial Parameters removed; 0 = no budget cap
    carbonCapKgPerKwh: g('cfg-em') / 100,  // tCO₂/MWh = kg CO₂/kWh numerically
    utilityCapMW:      rawUtilCap > 0 ? rawUtilCap : loadMW,  // partial utility cap
    enabledTechs,
    loadRampPhases:    state.loadRampPhases,
    // Legacy fields (recalculateAllStrategies compatibility)
    wMinMo:       g('cfg-wmin'),
    wMaxMo:       g('cfg-wmax'),
    gridCostM:    g('cfg-gcost'),
    gasEnabled:   b('opt-gas'),
    bessEnabled:  b('opt-sofc') || b('opt-solar'),
    solarEnabled: b('opt-solar'),
    termYr:       20,   // default; no longer user-configurable
    carbonCapT:   g('cfg-em') / 100,
    carbonPriceT: g('cfg-cp'),
  };
}

// Read weight sliders mapped to the 4 ranking-engine axes (fractions, sum = 1)
function readRankingWeights() {
  const g = id => parseFloat(document.getElementById(id)?.value ?? 0);
  const wTime = g('w-time'), wCost = g('w-cost'), wCarbon = g('w-carbon'), wRes = g('w-res');
  const total = wTime + wCost + wCarbon + wRes || 1;
  return {
    speedToMarket: wTime   / total,
    cost:          wCost   / total,
    environmental: wCarbon / total,
    resilience:    wRes    / total,
  };
}

// Read weight sliders and return normalized fractions (sum = 1)
function readWeights() {
  const g = id => parseFloat(document.getElementById(id)?.value ?? 0);
  const wTime = g('w-time'), wCost = g('w-cost'), wCarbon = g('w-carbon'), wRes = g('w-res');
  const total = wTime + wCost + wCarbon + wRes || 1;
  return { wTime: wTime/total, wCost: wCost/total, wCarbon: wCarbon/total, wRes: wRes/total };
}

// Core scoring engine — updates every strategy's .score, .metrics, .feasible in place
function recalculateAllStrategies(params, weights) {
  const { loadMW, wMinMo, wMaxMo, gridCostM,
          gasEnabled, bessEnabled, solarEnabled,
          budgetM, carbonCapT } = params;
  const { wTime, wCost, wCarbon, wRes } = weights;
  const loadFactor = loadMW / 100;

  STRATEGIES.forEach(s => {
    const req  = STRATEGY_REQ[s.id];
    const base = s._base;

    // ── 1. Time to full power ──────────────────────────
    // Grid-first time is driven by the queue wait sliders; others are fixed by technology
    const time = (s.id === 'grid-first')
      ? Math.round((wMinMo + wMaxMo) / 2)
      : req.timeBase;

    // ── 2. CAPEX scaled by load (grid-first also pays utility upgrade cost) ──
    let capex = Math.round(base.capex * loadFactor);
    if (s.id === 'grid-first') capex += gridCostM;

    // ── 3. Feasibility checks ─────────────────────────
    const genOk    = (!req.needsGas   || gasEnabled)
                  && (!req.needsBESS  || bessEnabled)
                  && (!req.needsSolar || solarEnabled);
    const budgetOk = budgetM <= 0 || capex <= budgetM;
    const carbonOk = base.carbonIntensity <= carbonCapT;
    const feasible = genOk && budgetOk && carbonOk;

    // ── 4. Component scores (0–100, higher = better) ──
    // Speed:  compared to worst-case grid wait (wMaxMo)
    // Cost:   relative to 2× the cheapest option when no budget set
    // Carbon: square-root curve so near-cap strategies still differentiate
    // Res:    direct from data
    const speedScore  = Math.max(0, (1 - time / wMaxMo) * 100);
    const costRef     = budgetM > 0 ? budgetM : capex * 2;
    const costScore   = Math.max(0, (1 - capex / costRef) * 100);
    const carbonScore = Math.max(0, Math.sqrt(Math.max(0, 1 - base.carbonIntensity / carbonCapT)) * 100);
    const resScore    = base.resilienceScore;

    // ── 5. Weighted aggregate ──────────────────────────
    const raw   = wTime * speedScore + wCost * costScore + wCarbon * carbonScore + wRes * resScore;
    const score = feasible ? Math.round(Math.min(100, Math.max(1, raw))) : 0;

    // ── 6. Write back ──────────────────────────────────
    s.feasible                = feasible;
    s.score                   = score;
    s.metrics.timeToFullPower = time;
    s.metrics.capex           = capex;
    s.cashflow                = base.cashflow.map(v => Math.round(v * loadFactor));
  });

  // Move the "recommended" badge to the highest-scoring feasible strategy
  const best = [...STRATEGIES].filter(s => s.feasible).sort((a, b) => b.score - a.score)[0];
  STRATEGIES.forEach(s => { s.recommended = (s.id === best?.id); });
}

// Update the four KPI counter targets on the Overview page after recalculation
function updateKPITargets() {
  const best = [...STRATEGIES].filter(s => s.feasible).sort((a, b) => b.score - a.score)[0];
  if (!best) return;
  const setT = (id, v) => { const el = document.getElementById(id); if (el) el.dataset.target = v; };
  setT('kpi-time',       best.metrics.timeToFullPower);
  setT('kpi-capex',      best.metrics.capex);
  setT('kpi-carbon',     best.metrics.carbonIntensity.toFixed(2));
  setT('kpi-resilience', best.metrics.resilienceScore);
}

// ─── NAVIGATION ───────────────────────────────────────
function navigate(viewId) {
  // Hide all
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  // Show target
  const view = document.getElementById('view-' + viewId);
  if (view) view.classList.add('active');

  const link = document.querySelector(`.nav-link[data-view="${viewId}"]`);
  if (link) link.classList.add('active');

  state.currentView = viewId;

  // Lazy-init views
  if (viewId === 'overview')   initOverview();
  if (viewId === 'pathways')   initPathways();
  if (viewId === 'timeline')   renderTimeline(document.getElementById('tl-select')?.value || 'hybrid-phased');
  if (viewId === 'risk')       renderRisk(document.getElementById('risk-select')?.value || 'hybrid-phased');
  if (viewId === 'report')     renderReport();
}

// ─── HELPER: display value ─────────────────────────────
function dv(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── COUNTER ANIMATIONS ───────────────────────────────
function animateCounter(el, target, decimals = 0, duration = 1200) {
  const start = 0;
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (target - start) * eased;
    el.textContent = decimals > 0 ? current.toFixed(decimals) : Math.round(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function runCounters() {
  document.querySelectorAll('.counter').forEach(el => {
    const target = parseFloat(el.dataset.target || el.textContent);
    animateCounter(el, target, 0);
  });
  document.querySelectorAll('.counter-dec').forEach(el => {
    const target = parseFloat(el.dataset.target || el.textContent);
    animateCounter(el, target, 2);
  });
}

/* Render colour-chip legend for the strategy comparison bar chart */
function renderBarLegend(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const axes = [
    { label: 'Speed',         color: '#3b82f6' },
    { label: 'Cost',          color: '#10b981' },
    { label: 'Environmental', color: '#22d3ee' },
    { label: 'Resilience',    color: '#f59e0b' },
  ];
  el.innerHTML = axes.map(a =>
    `<div class="pl-item">
      <div class="pl-dot" style="background:${a.color}"></div>
      <span>${a.label}</span>
    </div>`
  ).join('');
}

// ─── OVERVIEW ─────────────────────────────────────────
function initOverview() {
  runCounters();
  renderStrategyTable();

  // Pareto (overview)
  if (state.charts['pareto-ov']) {
    state.charts['pareto-ov'].destroy();
    delete state.charts['pareto-ov'];
  }
  const ctx1 = document.getElementById('chart-pareto-ov');
  if (ctx1) {
    state.charts['pareto-ov'] = new Chart(ctx1, buildParetoConfig(false));
  }
  renderBarLegend('pareto-legend-ov');

  // Cash flow
  if (state.charts['cashflow']) {
    state.charts['cashflow'].destroy();
    delete state.charts['cashflow'];
  }
  const ctx2 = document.getElementById('chart-cashflow');
  if (ctx2) {
    state.charts['cashflow'] = new Chart(ctx2, buildCashFlowConfig());
  }
}

function renderStrategyTable() {
  const el = document.getElementById('strategy-table');
  if (!el) return;

  // Feasible strategies ranked by score first; infeasible ones go to the bottom
  const feasible   = STRATEGIES.filter(s => s.feasible !== false).sort((a, b) => b.score - a.score);
  const infeasible = STRATEGIES.filter(s => s.feasible === false);
  const sorted     = [...feasible, ...infeasible];

  el.innerHTML = `
    <div class="strategy-table-wrap">
      <table class="strat-tbl">
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Time to Power</th>
            <th>CAPEX</th>
            <th>LCOE</th>
            <th>Carbon</th>
            <th>Resilience</th>
            <th>Permit Risk</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(s => `
            <tr onclick="navigate('pathways')" style="cursor:pointer;${s.feasible === false ? 'opacity:0.4;pointer-events:none;' : ''}">
              <td>
                <div class="strat-name-cell">
                  <div class="strat-dot" style="background:${s.color}"></div>
                  <div>
                    <div class="strat-name">${s.name}
                      ${s.recommended ? '<span style="margin-left:6px;font-size:9px;background:rgba(16,185,129,0.15);color:#10b981;padding:1px 6px;border-radius:99px;font-weight:700">REC</span>' : ''}
                      ${s.feasible === false ? '<span style="margin-left:6px;font-size:9px;background:rgba(239,68,68,0.15);color:#ef4444;padding:1px 6px;border-radius:99px;font-weight:700">INFEASIBLE</span>' : ''}
                    </div>
                    <div class="strat-sub">${s.subtitle}</div>
                  </div>
                </div>
              </td>
              <td style="color:var(--text)">${s.metrics.timeToFullPower} <span style="color:var(--text-s);font-size:11px">mo</span></td>
              <td style="color:var(--text)">$${s.metrics.capex}M</td>
              <td>$${s.metrics.lcoe}/kWh</td>
              <td>${s.metrics.carbonIntensity} tCO₂</td>
              <td>${s.metrics.resilienceScore}%</td>
              <td><span class="badge ${s.metrics.permittingRisk === 'Low' ? 'badge-success' : s.metrics.permittingRisk === 'High' ? 'badge-danger' : 'badge-warning'}">${s.metrics.permittingRisk}</span></td>
              <td>
                <div class="score-bar">
                  <div class="score-track">
                    <div class="score-fill" style="width:${s.score}%;background:${s.color}"></div>
                  </div>
                  <span class="score-val">${s.feasible === false ? '—' : s.score}</span>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── STRATEGY COMPARISON BAR CHART ───────────────────
/* Short display names and colors for each technology */
const TECH_META = {
  fuelCell_SOFC:    { label: 'Fuel Cell (SOFC)', color: '#f97316', rgb: '249,115,22'  },
  smr:              { label: 'SMR',               color: '#8b5cf6', rgb: '139,92,246'  },
  solar_bess:       { label: 'Solar + BESS',      color: '#10b981', rgb: '16,185,129'  },
  gas_turbine:      { label: 'Gas Turbine',        color: '#f59e0b', rgb: '245,158,11'  },
  diesel_generator: { label: 'Diesel Genset',      color: '#ef4444', rgb: '239,68,68'   },
};

function portfolioLabel(portfolio) {
  return portfolio.map(t => TECH_META[t.id]?.label ?? t.id).join(' + ');
}


function buildParetoConfig(large = false) {
  // Score axis definitions — colours match the weight slider UI
  const AXES = [
    { key: 'speed', label: 'Speed to Market', color: '#3b82f6' },
    { key: 'cost',  label: 'Cost',             color: '#10b981' },
    { key: 'env',   label: 'Environmental',    color: '#22d3ee' },
    { key: 'res',   label: 'Resilience',       color: '#f59e0b' },
  ];

  const ranked  = state.optimizerResult?.ranked ?? [];
  const weights = state.lastRankingWeights ?? { speedToMarket: 0.25, cost: 0.25, environmental: 0.25, resilience: 0.25 };
  const wMap    = { speed: weights.speedToMarket, cost: weights.cost, env: weights.environmental, res: weights.resilience };

  /* ── Data source: optimizer results or STRATEGIES fallback ── */
  let labels, scoresByAxis;

  if (ranked.length > 0) {
    const top = ranked.slice(0, large ? 8 : 5);
    labels       = top.map(e => portfolioLabel(e.portfolio));
    scoresByAxis = AXES.map(ax =>
      top.map(e => +(e.scores[ax.key] * (wMap[ax.key] ?? 0.25)).toFixed(1))
    );
  } else {
    // Fallback: STRATEGIES before optimizer runs
    labels       = STRATEGIES.map(s => s.name);
    const w      = 0.25;
    scoresByAxis = [
      STRATEGIES.map(s => +(s.metrics.resilienceScore * w).toFixed(1)),
      STRATEGIES.map(s => +(Math.max(0, (1 - s.metrics.capex / 200) * 100 * w)).toFixed(1)),
      STRATEGIES.map(s => +(Math.max(0, (1 - s.metrics.carbonIntensity / 0.8) * 100 * w)).toFixed(1)),
      STRATEGIES.map(s => +(s.metrics.resilienceScore * w).toFixed(1)),
    ];
  }

  const datasets = AXES.map((ax, i) => ({
    label:           ax.label,
    data:            scoresByAxis[i],
    backgroundColor: ax.color + 'cc',
    borderColor:     ax.color,
    borderWidth:     0,
    borderSkipped:   false,
  }));

  const tooltipWeightLabel = ax =>
    `${ax.label}: ${Math.round((wMap[ax.key] ?? 0.25) * 100)}% weight`;

  return {
    type: 'bar',
    data: { labels, datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,   // colour chips shown in card header instead
        },
        tooltip: {
          callbacks: {
            title: items => items[0].label,
            label: item => {
              const ax = AXES[item.datasetIndex];
              return ` ${ax.label}: ${item.raw} pts  (${Math.round((wMap[ax.key] ?? 0.25) * 100)}% weight)`;
            },
            footer: items => {
              const total = items.reduce((s, i) => s + i.raw, 0);
              return `Composite score: ${total.toFixed(0)} / 100`;
            },
          },
          backgroundColor: 'rgba(6,20,44,0.95)',
          borderColor: 'rgba(59,130,246,0.3)',
          borderWidth: 1,
          padding: 12,
        },
      },
      scales: {
        x: {
          stacked: true,
          max: 100,
          title: { display: large, text: 'Composite Score (0 – 100)', color: '#64748b' },
          grid:  { color: 'rgba(59,130,246,0.06)' },
          ticks: { callback: v => v },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: large ? 11 : 10 } },
        },
      },
    },
  };
}

// ─── CASH FLOW CHART ─────────────────────────────────
function buildCashFlowConfig() {
  const years = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10'];
  const top3 = STRATEGIES.slice(0, 3);

  return {
    type: 'line',
    data: {
      labels: years,
      datasets: top3.map(s => ({
        label: s.name,
        data: s.cashflow,
        borderColor: s.color,
        backgroundColor: `rgba(${s.colorRgb},0.06)`,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        tension: 0.4,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.dataset.label}: $${item.raw}M cumulative`,
          },
          backgroundColor: 'rgba(6,20,44,0.95)',
          borderColor: 'rgba(59,130,246,0.3)',
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: {
        x: { grid: { color: 'rgba(59,130,246,0.06)' } },
        y: {
          title: { display: true, text: 'Cumulative Position ($M)', color: '#64748b' },
          grid: { color: 'rgba(59,130,246,0.06)' },
          ticks: {
            callback: v => `$${v}M`,
          },
        },
      },
    },
  };
}

// ─── PATHWAYS VIEW ────────────────────────────────────
// ─── RANKING RESULTS PANEL ────────────────────────────
const AXIS_LABELS = { speedToMarket: 'Speed to Market', cost: 'Cost', environmental: 'Environmental', resilience: 'Resilience' };
const AXIS_COLORS = { speedToMarket: '#3b82f6', cost: '#10b981', environmental: '#8b5cf6', resilience: '#f97316' };

function renderRankingResults() {
  const el = document.getElementById('ranking-results');
  if (!el) return;

  // Pre-run state
  if (!state.optimizerResult) {
    el.innerHTML = `
      <div class="card rr-empty">
        <span style="font-size:22px">⚡</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">Optimizer Ready</div>
          <div style="font-size:11.5px;color:var(--text-s)">Enable technologies, set priority weights, then click <strong>Run Optimization</strong>.</div>
        </div>
      </div>`;
    return;
  }

  const { ranked, infeasibleReasons } = state.optimizerResult;
  const w = state.lastRankingWeights;

  if (ranked.length === 0) {
    el.innerHTML = `
      <div class="card rr-empty">
        <span style="font-size:22px">⚠</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">No Feasible Solutions</div>
          <div style="font-size:11.5px;color:var(--text-s)">All technologies were excluded by constraints. Try enabling more technologies or relaxing the carbon cap.</div>
        </div>
      </div>`;
    return;
  }

  const top      = ranked[0];
  const topMeta  = top.portfolio.map(t => SCORING_MATRIX[t.id] || { name: t.id, icon: '', color: '#3b82f6', colorRgb: '59,130,246' });
  const topColor = topMeta[0].color;
  const topName  = top.portfolio.map(t => (SCORING_MATRIX[t.id]?.name || t.id) + ' ' + t.capacityMW + ' MW').join(' + ');

  const axisRows = [
    { key: 'speedToMarket', label: 'Speed to Market', color: '#3b82f6', score: top.scores.speed,
      abs: `${top.metrics.deployMonths} mo to first power` },
    { key: 'cost',          label: 'Cost',            color: '#10b981', score: top.scores.cost,
      abs: `$${top.metrics.totalCapexM}M CAPEX + $${top.metrics.bridgeOpexM}M OPEX` },
    { key: 'environmental', label: 'Environmental',   color: '#22d3ee', score: top.scores.env,
      abs: `${top.metrics.co2Intensity.toFixed(3)} kg CO₂/kWh` },
    { key: 'resilience',    label: 'Resilience',      color: '#f59e0b', score: top.scores.res,
      abs: `${Math.round(top.metrics.availability * 100)}% avail · ${Math.round(top.metrics.capacityFactor * 100)}% CF` },
  ];

  const infeasSingle = Object.entries(infeasibleReasons).filter(([k]) => !k.includes('+'));

  el.innerHTML = `
    <div class="card rr-card">

      <!-- Header -->
      <div class="card-header">
        <div>
          <div class="card-title">🏆 Optimizer Results</div>
          <div class="card-sub">${ranked.length} feasible portfolio${ranked.length !== 1 ? 's' : ''} · ${top.metrics.bridgeMonths}-month bridge period</div>
        </div>
        <span class="badge badge-success pulse">★ ${top.portfolio.map(t => SCORING_MATRIX[t.id]?.name || t.id).join(' + ')}</span>
      </div>

      <!-- Two-column body: chart left · detail right -->
      <div class="rr-split">

        <!-- LEFT: Strategy comparison bar chart -->
        <div class="rr-split-chart">
          <div class="rr-col-title">
            Strategy Comparison
            <div class="pareto-legend" id="pareto-legend" style="margin-top:6px"></div>
          </div>
          <div class="chart-wrap" style="height:300px"><canvas id="chart-pareto-main"></canvas></div>
        </div>

        <!-- RIGHT: #1 detail breakdown -->
        <div class="rr-split-detail">
          <div class="rr-col-title">
            <span style="color:${topColor}">${topMeta.map(m => m.icon).join('')} ${topName}</span>
            <span style="color:var(--text-s);font-weight:400"> — score breakdown</span>
          </div>
          <table class="rr-bd-table">
            <thead>
              <tr><th>Priority Axis</th><th>Weight</th><th>Score</th><th>Contribution</th><th>Key Metric</th></tr>
            </thead>
            <tbody>
              ${axisRows.map(ax => {
                const wt     = Math.round((w[ax.key] || 0) * 100);
                const contrib = Math.round((w[ax.key] || 0) * ax.score);
                return `<tr>
                  <td><span class="rr-axis-dot" style="background:${ax.color}"></span>${ax.label}</td>
                  <td>${wt}%</td>
                  <td>
                    <div class="rr-mini-bar-wrap">
                      <div class="rr-mini-bar" style="width:${ax.score}%;background:${ax.color}88"></div>
                      <span>${ax.score}</span>
                    </div>
                  </td>
                  <td><strong>${contrib}</strong></td>
                  <td style="color:var(--text-s);font-size:11px">${ax.abs}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="font-weight:600;color:var(--text)">Composite Score</td>
                <td>
                  <span style="color:${topColor};font-size:17px;font-weight:700">${top.composite}</span>
                  <span style="color:var(--text-m);font-size:11px"> / 100</span>
                </td>
                <td style="color:var(--text-s);font-size:11px">$${top.metrics.totalCostM}M total</td>
              </tr>
            </tfoot>
          </table>

          <!-- Compact ranked list below the table -->
          <div style="margin-top:16px">
            <div style="font-size:11px;font-weight:700;color:var(--text-s);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">All Ranked Portfolios</div>
            ${ranked.map((r, i) => {
              const meta  = SCORING_MATRIX[r.portfolio[0].id] || { name: r.portfolio[0].id, color: '#3b82f6' };
              const name  = r.portfolio.map(t => SCORING_MATRIX[t.id]?.name || t.id).join(' + ');
              return `<div class="rr-item ${i === 0 ? 'rr-highlighted' : ''}" style="padding:5px 0">
                <div class="rr-rank-num" style="color:${i < 3 ? meta.color : 'var(--text-m)'}">${i === 0 ? '①' : i === 1 ? '②' : i === 2 ? '③' : i + 1}</div>
                <div class="rr-tech-name" style="font-size:11.5px;color:${i === 0 ? 'var(--text)' : 'var(--text-s)'}">
                  ${name}
                  <span style="font-size:10px;color:var(--text-s);margin-left:6px">$${r.metrics.totalCapexM}M · ${r.metrics.deployMonths} mo</span>
                </div>
                <div class="rr-bar-track" style="flex:1;max-width:80px">
                  <div class="rr-bar-fill" style="width:${r.composite}%;background:${meta.color}${i === 0 ? 'cc' : '44'}"></div>
                </div>
                <div class="rr-composite" style="font-size:12px;color:${i === 0 ? meta.color : 'var(--text-m)'}">${r.composite}</div>
              </div>`;
            }).join('')}
          </div>

          ${infeasSingle.length > 0 ? `
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(59,130,246,0.08)">
            <div style="font-size:11px;font-weight:700;color:var(--text-s);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Excluded</div>
            ${infeasSingle.map(([id, reasons]) => {
              const meta = SCORING_MATRIX[id] || { icon: '', name: id, color: '#64748b' };
              return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px">
                <span style="color:${meta.color}">${meta.icon}</span>
                <span style="color:var(--text-s)">${meta.name}</span>
                <span style="color:#ef4444">— ${reasons[0]}</span>
              </div>`;
            }).join('')}
          </div>` : ''}
        </div>
      </div>

      <div class="rr-disclaimer">
        📊 Absolute parameters: $/kW, kg CO₂/kWh, deploy months. Source: "On-Site Power Generation Scoring". Budget is a soft penalty only.
      </div>
    </div>`;
}

// ─── PATHWAY CHART (Capacity vs Time) ────────────────
function buildPathwayChartConfig(pathway, params) {
  const firmMo    = Math.round((params.gridWaitMin + params.gridWaitMax) / 2);
  const utilCapMW = params.utilityCapMW ?? params.loadMW;
  const phases    = [...params.loadRampPhases].sort((a, b) => a.month - b.month);

  /* Step-function load at month t */
  function getLoad(t) {
    let pct = 0;
    for (const p of phases) { if (t >= p.month) pct = p.pct; }
    return +(pct / 100 * params.loadMW).toFixed(0);
  }

  /* Find pathway row covering month t */
  function rowAt(t) {
    return pathway.find(r => t >= r.start && t < r.end)
        || (t >= (pathway[pathway.length - 1]?.end ?? 0) ? pathway[pathway.length - 1] : null);
  }

  /* Build X-axis time points: all boundaries */
  const pts = new Set([0]);
  pathway.forEach(r => { pts.add(r.start); pts.add(r.end); });
  pts.add(firmMo);
  const times = [...pts].sort((a, b) => a - b);

  /* Collect unique tech IDs in first-appearance order */
  const techOrder = [];
  const seenIds   = new Set();
  pathway.forEach(r => {
    (r.totalOnsite || []).forEach(d => {
      if (!seenIds.has(d.id)) { seenIds.add(d.id); techOrder.push(d.id); }
    });
  });

  /* Dataset 0: Utility baseline (fills from 0) */
  const utilData = times.map(t => ({
    x: t,
    y: t >= firmMo ? Math.min(getLoad(t), utilCapMW) : 0,
  }));

  /* Build per-tech cumulative layers using fill:'-1' between consecutive datasets */
  const cumulativeLayers = [utilData]; // layer 0 = utility
  const techDatasets = techOrder.map(id => {
    const meta = (typeof SCORING_MATRIX !== 'undefined' && SCORING_MATRIX[id])
      || { name: id, color: '#94a3b8', colorRgb: '148,163,184' };
    const prevLayer = cumulativeLayers[cumulativeLayers.length - 1];
    const layerData = times.map((t, ti) => {
      const row   = rowAt(t);
      const prevY = prevLayer[ti].y;
      if (!row) return { x: t, y: prevY };
      if (row.isUtilityPhase) {
        // Fill gap between utility and DC Load proportionally using deployed on-site techs
        const gap = Math.max(0, getLoad(t) - (row.utilityMW || 0));
        const onsiteTotal = (row.totalOnsite || []).reduce((s, d) => s + d.capacityMW, 0);
        if (gap > 0 && onsiteTotal > 0) {
          const entry = (row.totalOnsite || []).find(d => d.id === id);
          const share = entry ? (entry.capacityMW / onsiteTotal) * gap : 0;
          return { x: t, y: prevY + share };
        }
        return { x: t, y: prevY };
      }
      const entry = (row.totalOnsite || []).find(d => d.id === id);
      return { x: t, y: prevY + (entry ? entry.capacityMW : 0) };
    });
    cumulativeLayers.push(layerData);
    return {
      label:           meta.name,
      data:            layerData,
      backgroundColor: `rgba(${meta.colorRgb},0.30)`,
      borderColor:     meta.color,
      borderWidth:     1.5,
      fill:            '-1',   // fills between this dataset and the one below it
      stepped:         'before',
      pointRadius:     2,
      order:           1,
    };
  });

  const loadData = times.map(t => ({ x: t, y: getLoad(t) }));
  const maxY = Math.ceil(params.loadMW * 1.15 / 50) * 50;

  return {
    type: 'line',
    data: {
      datasets: [
        /* Dataset 0: Utility area (fills from origin) */
        {
          label:           'Utility (firm power)',
          data:            utilData,
          backgroundColor: 'rgba(59,130,246,0.18)',
          borderColor:     '#3b82f6',
          borderWidth:     2,
          borderDash:      [6, 3],
          fill:            'origin',
          stepped:         'before',
          pointRadius:     3,
          pointBackgroundColor: '#3b82f6',
          order:           2,
        },
        /* Datasets 1..N: per-tech stacked colored bands */
        ...techDatasets,
        /* Last dataset: DC Load reference line (no fill) */
        {
          label:           'DC Load Target',
          data:            loadData,
          backgroundColor: 'transparent',
          borderColor:     '#ef4444',
          borderWidth:     2.5,
          fill:            false,
          stepped:         'before',
          pointRadius:     4,
          pointBackgroundColor: '#ef4444',
          order:           0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(6,20,44,0.95)',
          borderColor:     'rgba(59,130,246,0.3)',
          borderWidth:     1,
          padding:         10,
          callbacks: {
            title: items => `Month ${items[0].raw.x}`,
            label: item => {
              const idx = item.datasetIndex;
              const y   = item.raw.y;
              if (idx === 0) return ` Utility: ${y} MW`;
              if (!item.dataset.fill || item.dataset.fill === false) {
                return ` ${item.dataset.label}: ${y} MW`;
              }
              // Per-tech: show individual contribution (delta from layer below)
              const prevDataset = item.chart.data.datasets[idx - 1];
              const prevY = prevDataset?.data[item.dataIndex]?.y ?? 0;
              const delta = Math.round(y - prevY);
              return delta > 0 ? ` ${item.dataset.label}: ${delta} MW` : null;
            },
          },
        },
      },
      scales: {
        x: {
          type:  'linear',
          title: { display: true, text: 'Time (months)', color: '#64748b' },
          grid:  { color: 'rgba(59,130,246,0.06)' },
          min:   0,
          ticks: { stepSize: 6 },
        },
        y: {
          title: { display: true, text: 'Capacity (MW)', color: '#64748b' },
          grid:  { color: 'rgba(59,130,246,0.06)' },
          min: 0, max: maxY,
          ticks: { callback: v => v + ' MW' },
        },
      },
    },
  };
}

// ─── PATHWAY OVER TIME TABLE ──────────────────────────
function renderPathwayTable() {
  const el = document.getElementById('pathway-table-container');
  if (!el) return;

  if (!state.lastParams || !state.lastRankingWeights) { el.innerHTML = ''; return; }

  const pathway = generatePathway(state.lastParams, state.lastRankingWeights);
  if (!pathway || pathway.length === 0) { el.innerHTML = ''; return; }

  const firmMo = Math.round(
    (state.lastParams.gridWaitMin + state.lastParams.gridWaitMax) / 2
  );

  el.innerHTML = `
    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <div>
          <div class="card-title">⚡ Recommended Pathway Over Time</div>
          <div class="card-sub">
            Staged bridging strategy · Utility firm power expected at month ${firmMo}
            · Non-diesel assets persist across phases (sunk cost) · Diesel is temporary bridge only
          </div>
        </div>
      </div>

      <!-- Capacity vs Time chart -->
      <div style="padding:16px 20px 0">
        <div style="font-size:11px;font-weight:700;color:var(--text-m);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          Capacity vs Time &nbsp;·&nbsp;
          <span style="color:#ef4444;font-weight:400">── DC Load</span>
          <span style="color:#3b82f6;font-weight:400">── Utility</span>
          ${(function() {
            const techSet = new Set();
            pathway.forEach(r => (r.totalOnsite||[]).forEach(d => techSet.add(d.id)));
            return [...techSet].map(id => {
              const m = SCORING_MATRIX[id];
              return m ? `<span style="color:${m.color};font-weight:400">▓ ${m.name}</span>` : '';
            }).join(' ');
          })()}
        </div>
        <div class="chart-wrap" style="height:240px"><canvas id="chart-pathway"></canvas></div>
      </div>

      <div style="overflow-x:auto;margin-top:16px">
        <table class="pathway-table">
          <thead>
            <tr>
              <th>Time Window</th>
              <th>DC Load</th>
              <th>Utility</th>
              <th>Gap to Bridge</th>
              <th>New Deployment</th>
              <th>Total On-site</th>
              <th>Top Drivers</th>
            </tr>
          </thead>
          <tbody>
            ${pathway.map((row, i) => _renderPathwayRow(row, i, state.lastParams.loadMW)).join('')}
          </tbody>
        </table>
      </div>
      <div class="rr-disclaimer" style="margin:8px 16px 16px">
        ⚠ Pathway is computed from your weight sliders × scoring matrix. Changing priorities,
        enabled technologies, or queue wait will change which technology is chosen per phase.
        Cross-phase look-ahead (25% weight) discourages choices that lock in suboptimal later phases.
      </div>
    </div>`;
}

function _renderPathwayRow(row, idx, maxLoadMW) {
  const timeLabel = `${row.start}–${row.end} mo`;

  const pctOf = mw => Math.min(100, Math.round(mw / maxLoadMW * 100));

  const loadBar = `<div class="pw-bar-wrap">
    <div class="pw-bar pw-bar-load" style="width:${pctOf(row.loadMW)}%"></div>
    <span>${row.loadMW} MW</span></div>`;

  const utilBar = row.utilityMW > 0
    ? `<div class="pw-bar-wrap">
        <div class="pw-bar pw-bar-util" style="width:${pctOf(row.utilityMW)}%"></div>
        <span>${row.utilityMW} MW</span></div>`
    : `<span class="pw-zero">—</span>`;

  /* Utility / already-covered row */
  if (row.isUtilityPhase || (row.gap === 0 && row.newDeploy.length === 0)) {
    const onsiteHtml = row.totalOnsite.length > 0
      ? row.totalOnsite.map(t => {
          const m = SCORING_MATRIX[t.id];
          return `<div class="pw-tech" style="color:${m?.color}">
            ${m?.icon} ${m?.name}<span class="pw-role"> backup</span></div>`;
        }).join('')
      : `<span class="pw-zero">—</span>`;

    return `<tr class="pw-row pw-utility-row">
      <td class="pw-time">${timeLabel}</td>
      <td>${loadBar}</td>
      <td>${utilBar}</td>
      <td><span class="pw-gap-closed">✓ Gap closed</span></td>
      <td><span class="pw-zero">—</span></td>
      <td>${onsiteHtml}</td>
      <td><span class="pw-zero" style="font-size:11px">Utility primary · On-site → backup / peaking</span></td>
    </tr>`;
  }

  /* Active bridging row */
  const gapHtml = row.residualGap > 0
    ? `<div class="pw-gap-partial">⚠ ${row.gap} MW<br>
        <span style="font-size:10px;color:#f59e0b">${row.residualGap} MW uncovered</span></div>`
    : `<div class="pw-bar-wrap">
        <div class="pw-bar pw-bar-gap" style="width:${pctOf(row.gap)}%"></div>
        <span>${row.gap} MW</span></div>`;

  const newDeployHtml = row.newDeploy.length > 0
    ? row.newDeploy.map(t => {
        const m = SCORING_MATRIX[t.id];
        const isTemp = t.id === 'diesel_generator';
        return `<div class="pw-tech" style="color:${m?.color}">
          ${m?.icon} ${m?.name}
          <span class="pw-cap">${t.capacityMW} MW${isTemp ? ' ⟳' : ''}</span>
          ${isTemp ? '<span class="pw-role"> temporary</span>' : ''}
        </div>`;
      }).join('')
    : `<span class="pw-zero">—</span>`;

  const totalHtml = row.totalOnsite.length > 0
    ? row.totalOnsite.map(t => {
        const m = SCORING_MATRIX[t.id];
        const isTemp = t.temp || t.id === 'diesel_generator';
        return `<div class="pw-tech" style="color:${m?.color};opacity:${isTemp ? 0.7 : 1}">
          ${m?.icon} ${m?.name} <span class="pw-cap">${t.capacityMW} MW</span></div>`;
      }).join('')
    : `<span class="pw-zero">—</span>`;

  const rationaleHtml = row.rationale.map(r => `<span class="pw-tag">${r}</span>`).join('');

  return `<tr class="pw-row ${idx === 0 ? 'pw-first-row' : ''}">
    <td class="pw-time">${timeLabel}</td>
    <td>${loadBar}</td>
    <td>${utilBar}</td>
    <td>${gapHtml}</td>
    <td>${newDeployHtml}</td>
    <td>${totalHtml}</td>
    <td>${rationaleHtml}</td>
  </tr>`;
}

function initPathways() {
  // Render results first — creates canvas#chart-pareto-main in DOM
  renderRankingResults();

  // Build bar chart into the canvas now that it exists
  if (state.charts['pareto-main']) {
    state.charts['pareto-main'].destroy();
    delete state.charts['pareto-main'];
  }
  const ctx = document.getElementById('chart-pareto-main');
  if (ctx) {
    state.charts['pareto-main'] = new Chart(ctx, buildParetoConfig(true));
  }
  renderBarLegend('pareto-legend');
  renderPathwayTable();

  // Build pathway capacity-vs-time chart (canvas is injected by renderPathwayTable)
  if (state.charts['pathway']) {
    state.charts['pathway'].destroy();
    delete state.charts['pathway'];
  }
  const ctxPw = document.getElementById('chart-pathway');
  if (ctxPw && state.lastParams && state.lastRankingWeights) {
    const pw = generatePathway(state.lastParams, state.lastRankingWeights);
    state.charts['pathway'] = new Chart(ctxPw, buildPathwayChartConfig(pw, state.lastParams));
  }

  renderStrategyCards();
}

function renderStrategyCards() {
  const el = document.getElementById('strategy-cards');
  if (!el) return;

  el.innerHTML = STRATEGIES.map(s => `
    <div class="strat-card ${s.recommended ? 'recommended' : ''} ${s.id === state.selectedStrategy ? 'selected' : ''}"
         style="--strat-color:${s.color};--strat-rgb:${s.colorRgb}"
         onclick="selectStrategy('${s.id}')">

      <div class="sc-hdr">
        <div>
          ${s.recommended ? `<div class="rec-badge" style="margin-bottom:8px">★ Recommended</div>` : ''}
          <div class="sc-title">${s.name}</div>
          <div class="sc-sub">${s.subtitle}</div>
        </div>
        <div class="sc-icon">${s.icon}</div>
      </div>

      <div class="sc-metrics">
        <div class="sc-metric">
          <div class="sc-metric-label">Time to Power</div>
          <div class="sc-metric-val" style="color:${s.color}">${s.metrics.timeToFullPower}<span class="sc-metric-unit"> mo</span></div>
        </div>
        <div class="sc-metric">
          <div class="sc-metric-label">CAPEX</div>
          <div class="sc-metric-val">$${s.metrics.capex}<span class="sc-metric-unit">M</span></div>
        </div>
        <div class="sc-metric">
          <div class="sc-metric-label">Carbon</div>
          <div class="sc-metric-val" style="color:${s.metrics.carbonIntensity < 0.2 ? '#10b981' : s.metrics.carbonIntensity > 0.45 ? '#ef4444' : '#f59e0b'}">${s.metrics.carbonIntensity}<span class="sc-metric-unit"> tCO₂</span></div>
        </div>
        <div class="sc-metric">
          <div class="sc-metric-label">Resilience</div>
          <div class="sc-metric-val" style="color:${s.metrics.resilienceScore >= 85 ? '#10b981' : '#94a3b8'}">${s.metrics.resilienceScore}<span class="sc-metric-unit">%</span></div>
        </div>
      </div>

      <div class="sc-tags">
        <span class="sc-tag">Score: ${s.score}/100</span>
        <span class="sc-tag">$${s.metrics.lcoe}/kWh LCOE</span>
        <span class="sc-tag" style="${s.metrics.permittingRisk === 'Low' ? 'color:#10b981' : s.metrics.permittingRisk === 'High' ? 'color:#ef4444' : 'color:#f59e0b'}">
          ${s.metrics.permittingRisk} Permit Risk
        </span>
      </div>
    </div>
  `).join('');
}

function selectStrategy(id) {
  state.selectedStrategy = id;
  renderStrategyCards();
  // Highlight in chart
  const chart = state.charts['pareto-main'];
  if (chart) {
    const idx = STRATEGIES.findIndex(s => s.id === id);
    chart.data.datasets.forEach((ds, i) => {
      ds.borderWidth = i === idx ? 3.5 : 1.5;
      ds.backgroundColor = i === idx
        ? `rgba(${STRATEGIES[i].colorRgb},0.8)`
        : `rgba(${STRATEGIES[i].colorRgb},0.35)`;
    });
    chart.update();
  }
}

// ─── TIMELINE (GANTT) ────────────────────────────────
function renderTimeline(strategyId) {
  const s = STRATEGIES.find(s => s.id === strategyId);
  if (!s) return;

  const totalMonths = 60;
  const ticks = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60];

  const container = document.getElementById('timeline-container');
  if (!container) return;

  container.innerHTML = `
    <div class="gantt-wrap">
      <!-- Header: month ticks -->
      <div class="gantt-header">
        ${ticks.map(t => `<div class="gantt-tick ${t % 12 === 0 ? 'year-start' : ''}">
          ${t === 0 ? 'Now' : t % 12 === 0 ? `Yr ${t/12}` : `${t}mo`}
        </div>`).join('')}
      </div>

      <!-- Phase bars -->
      <div class="gantt-body">
        <div class="gantt-section-hdr">PROJECT PHASES</div>
        ${s.phases.map(p => {
          const left  = (p.start / totalMonths * 100).toFixed(1);
          const width = ((p.end - p.start) / totalMonths * 100).toFixed(1);
          return `
            <div class="gantt-row">
              <div class="gantt-label">${p.name}</div>
              <div class="gantt-track">
                <div class="gantt-bar" style="left:${left}%;width:${width}%;background:${p.color}bb;border-left:3px solid ${p.color}">
                  ${width > 8 ? p.name : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Decision gates -->
      <div style="border-top:1px solid var(--border);padding-top:4px">
        <div class="gantt-section-hdr">DECISION GATES &amp; MILESTONES</div>
        <div class="gantt-gates">
          ${s.gates.map(g => {
            const icons = { action: '▶', decision: '◆', milestone: '★', contingency: '⚡' };
            const colors = { action: 'var(--blue)', decision: 'var(--yellow)', milestone: 'var(--green)', contingency: 'var(--orange)' };
            return `
              <div class="gantt-gate-row">
                <div class="gate-time">Mo ${g.month}</div>
                <div class="gate-icon" style="color:${colors[g.type]};font-size:12px">${icons[g.type]}</div>
                <div class="gate-content">
                  <div class="gate-title">${g.title}</div>
                  <div class="gate-type gate-type-${g.type}">${g.type.charAt(0).toUpperCase() + g.type.slice(1)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Strategy summary card -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title" style="color:${s.color}">${s.name}</div>
          <div class="card-sub">${s.subtitle}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${s.recommended ? '<span class="badge badge-success">★ Recommended</span>' : ''}
          <span class="badge">Score: ${s.score}/100</span>
        </div>
      </div>
      <div class="pros-cons">
        <div class="pros-list">
          <div class="section-sub-title" style="color:var(--green)">✓ Strengths</div>
          ${s.pros.map(p => `<div class="pro-item"><span class="pro-icon">✓</span><span>${p}</span></div>`).join('')}
        </div>
        <div class="cons-list">
          <div class="section-sub-title" style="color:var(--red)">✗ Considerations</div>
          ${s.cons.map(c => `<div class="con-item"><span class="con-icon">✗</span><span>${c}</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// ─── RISK MATRIX ─────────────────────────────────────
function renderRisk(strategyId) {
  const s = STRATEGIES.find(s => s.id === strategyId);
  if (!s) return;

  const stratRisks = s.risks.map(id => ({ id, ...ALL_RISKS[id] }));

  // Build 5x5 matrix
  const matrixEl = document.getElementById('risk-matrix');
  if (!matrixEl) return;

  const probLabels    = ['Very Low', 'Low', 'Med', 'High', 'V.High'];
  const impactLabels  = ['Very Low', 'Low', 'Med', 'High', 'V.High'];

  // Color by risk level (prob * impact)
  function cellColor(prob, impact) {
    const score = prob * impact;
    if (score <= 4)  return 'rgba(16,185,129,0.15)';   // green
    if (score <= 9)  return 'rgba(245,158,11,0.2)';    // yellow
    if (score <= 15) return 'rgba(249,115,22,0.25)';   // orange
    return 'rgba(239,68,68,0.3)';                       // red
  }

  function riskDotColor(prob, impact) {
    const score = prob * impact;
    if (score <= 4)  return '#10b981';
    if (score <= 9)  return '#f59e0b';
    if (score <= 15) return '#f97316';
    return '#ef4444';
  }

  // Find which cells have risks
  const riskCells = {};
  stratRisks.forEach(r => {
    riskCells[`${r.prob},${r.impact}`] = r;
  });

  const rows = [];
  for (let p = 5; p >= 1; p--) {
    const cells = [];
    for (let i = 1; i <= 5; i++) {
      const risk = riskCells[`${p},${i}`];
      cells.push(`
        <div class="rm-cell ${risk ? 'has-risk' : ''}"
             style="background:${cellColor(p,i)}"
             title="${risk ? risk.title : ''}">
          ${risk ? `<div class="rm-cell-dot" style="background:${riskDotColor(p,i)}"></div>` : ''}
        </div>
      `);
    }
    rows.push(`<div class="rm-row" style="display:flex;gap:2px;margin-bottom:2px">
      <div style="width:38px;flex-shrink:0;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:9px;color:var(--text-m)">${probLabels[p-1]}</div>
      ${cells.join('')}
    </div>`);
  }

  matrixEl.innerHTML = `
    <div style="padding:16px 20px 8px">
      <div style="display:flex;align-items:flex-start">
        <div style="writing-mode:vertical-lr;transform:rotate(180deg);font-size:9px;color:var(--text-m);text-transform:uppercase;letter-spacing:0.1em;margin-right:4px;padding:8px 0">Probability</div>
        <div style="flex:1">
          ${rows.join('')}
          <div style="display:flex;gap:2px;margin-left:44px;margin-top:6px">
            ${impactLabels.map(l => `<div style="flex:1;text-align:center;font-size:9px;color:var(--text-m)">${l}</div>`).join('')}
          </div>
          <div style="text-align:center;font-size:9px;color:var(--text-m);text-transform:uppercase;letter-spacing:0.1em;margin-top:4px;margin-left:44px">Impact</div>
        </div>
      </div>
    </div>
  `;

  // Risk list
  const listEl = document.getElementById('risk-list');
  if (!listEl) return;

  const SEV_COLOR = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };
  const SEV_BG    = { Low: 'rgba(16,185,129,0.15)', Medium: 'rgba(245,158,11,0.15)', High: 'rgba(249,115,22,0.15)', Critical: 'rgba(239,68,68,0.15)' };

  listEl.innerHTML = stratRisks.map(r => {
    const score    = r.prob * r.impact;
    const severity = score <= 4 ? 'Low' : score <= 9 ? 'Medium' : score <= 15 ? 'High' : 'Critical';
    const sevColor = SEV_COLOR[severity];
    const sevBg    = SEV_BG[severity];
    return `
      <div class="risk-item">
        <div class="risk-dot-lg" style="background:${sevColor}"></div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="risk-item-title">${r.title}</div>
            <span class="badge" style="background:${sevBg};color:${sevColor};margin-left:8px">${severity}</span>
          </div>
          <div class="risk-item-desc">${r.desc}</div>
          <div class="risk-item-tags">
            ${r.mitigations.map(m => `<span class="risk-tag">→ ${m}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── REPORT ───────────────────────────────────────────
function renderReport() {
  const el = document.getElementById('report-content');
  if (!el) return;

  // Pre-run state — no ranking results yet
  if (!state.rankingResults) {
    el.innerHTML = `
      <div class="rr-empty">
        <div style="font-size:40px;margin-bottom:12px">📊</div>
        <div style="color:var(--text);font-weight:600;font-size:16px;margin-bottom:8px">Report Not Ready</div>
        <div style="color:var(--text-s);font-size:13px">Go to Configure → adjust priorities → Run Optimization</div>
      </div>
    `;
    return;
  }

  const top = state.rankingResults[0];
  const w   = state.lastRankingWeights;
  const ax  = top.axisScores;
  const AX  = { speedToMarket: 'Speed to Market', cost: 'Cost', environmental: 'Environmental', resilience: 'Resilience' };

  // Dynamic pros/cons derived from axis scores
  const pros = [], cons = [];
  if (ax.speedToMarket >= 75) pros.push('Fast deployment path — operational quickly');
  else if (ax.speedToMarket < 40) cons.push('Long lead time to first power');
  if (ax.cost >= 65) pros.push('Favorable CAPEX and OPEX profile');
  else if (ax.cost < 40) cons.push('High capital or operating cost burden');
  if (ax.environmental >= 75) pros.push('Low-carbon / clean emissions profile');
  else if (ax.environmental < 40) cons.push('Higher emissions intensity vs. alternatives');
  if (ax.resilience >= 75) pros.push('High reliability and strong capacity factor');
  else if (ax.resilience < 45) cons.push('Intermittent or variable availability');
  if (pros.length === 0) pros.push('Balanced performance across all axes');
  if (cons.length === 0) cons.push('Higher relative cost vs. some alternatives');

  el.innerHTML = `
    <!-- Hero -->
    <div class="report-hero">
      <div class="rh-tag" style="background:rgba(${top.meta.colorRgb},0.15);color:${top.meta.color}">
        ${top.meta.icon} #1 Recommended Technology
      </div>
      <div class="rh-title">${top.meta.name}</div>
      <div class="rh-sub">Ranked #1 of ${state.rankingResults.length} · Composite Score ${top.composite}/100 · Weighted by your priority settings</div>
      <div class="rh-metrics">
        ${Object.entries(AX).map(([key, label]) => {
          const val = ax[key];
          const col = val >= 70 ? 'var(--green)' : val >= 45 ? 'var(--text)' : 'var(--red)';
          return `<div>
            <div class="rh-metric-label">${label}</div>
            <div class="rh-metric-val" style="color:${col}">${val}<span class="rh-metric-unit">/100</span></div>
          </div>`;
        }).join('')}
        <div>
          <div class="rh-metric-label">Weighted Score</div>
          <div class="rh-metric-val" style="color:var(--green)">${top.composite}<span class="rh-metric-unit">/100</span></div>
        </div>
      </div>
    </div>

    <!-- Score breakdown -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header-s"><h3>Score Breakdown — How ${top.meta.name} Was Ranked #1</h3></div>
      <table class="gates-table" style="width:100%">
        <thead>
          <tr><th>Axis</th><th>Weight</th><th>Score</th><th>Contribution</th><th style="width:120px">Bar</th></tr>
        </thead>
        <tbody>
          ${Object.entries(AX).map(([key, label]) => {
            const wt      = Math.round((w[key] || 0) * 100);
            const sc      = ax[key];
            const contrib = Math.round((w[key] || 0) * sc);
            return `
              <tr>
                <td style="color:var(--text);font-weight:600">${label}</td>
                <td style="color:var(--text-s)">${wt}%</td>
                <td style="color:var(--text)">${sc}</td>
                <td style="color:var(--green);font-weight:600">${contrib}</td>
                <td>
                  <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:8px;overflow:hidden">
                    <div style="background:${top.meta.color};height:100%;width:${sc}%;border-radius:4px"></div>
                  </div>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Grid -->
    <div class="report-grid">
      <!-- Pros/Cons -->
      <div class="card">
        <div class="card-header-s"><h3>Strengths &amp; Considerations</h3></div>
        <div class="pros-cons">
          <div class="pros-list">
            <div class="section-sub-title" style="color:var(--green)">Strengths</div>
            ${pros.map(p => `<div class="pro-item"><span class="pro-icon">✓</span><span>${p}</span></div>`).join('')}
          </div>
          <div class="cons-list">
            <div class="section-sub-title" style="color:var(--red)">Watch Points</div>
            ${cons.map(c => `<div class="con-item"><span class="con-icon">✗</span><span>${c}</span></div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Full ranking -->
      <div class="card">
        <div class="card-header-s"><h3>Full Technology Ranking</h3></div>
        <div style="padding:8px 20px 16px">
          ${state.rankingResults.map((t, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.06)">
              <span style="color:var(--text-s);font-weight:700;width:20px;text-align:center">${i + 1}</span>
              <span style="font-size:16px">${t.meta.icon}</span>
              <span style="color:var(--text);flex:1;font-size:13px">${t.meta.name}</span>
              <div style="width:80px;background:rgba(255,255,255,0.06);border-radius:4px;height:6px;overflow:hidden">
                <div style="background:${t.meta.color};height:100%;width:${t.composite}%;border-radius:4px"></div>
              </div>
              <span style="color:${t.meta.color};font-weight:700;font-size:13px;width:35px;text-align:right">${t.composite}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- vs alternatives -->
      <div class="card">
        <div class="card-header-s"><h3>vs. Key Alternatives</h3></div>
        <div style="padding:16px 20px">
          ${state.rankingResults.slice(1, 4).map((alt, i) => {
            const diffs = Object.keys(AX).map(key => {
              const d = ax[key] - alt.axisScores[key];
              if (Math.abs(d) < 5) return null;
              return (d > 0 ? '+' : '') + d + ' ' + AX[key];
            }).filter(Boolean);
            return `
              <div style="padding:8px 0;border-bottom:1px solid rgba(59,130,246,0.06);font-size:12px">
                <div style="color:var(--blue);font-weight:600;margin-bottom:4px">${alt.meta.icon} vs. ${alt.meta.name} (#${i + 2})</div>
                <div style="color:var(--text-s)">${diffs.length ? diffs.join(' · ') : 'Similar profile'}</div>
                <div style="color:var(--text-s);margin-top:2px">Score gap: +${top.composite - alt.composite} pts</div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Radar chart -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Multi-Axis Comparison — Top 3 Technologies</div>
          <div class="card-sub">Axis scores used in weighted ranking (higher = better on all axes)</div>
        </div>
      </div>
      <div class="chart-wrap" style="height:320px;max-width:500px;margin:0 auto">
        <canvas id="chart-radar"></canvas>
      </div>
    </div>
  `;

  // Radar chart — top 3 from ranking results
  setTimeout(() => {
    if (state.charts['radar']) {
      state.charts['radar'].destroy();
      delete state.charts['radar'];
    }
    const ctx = document.getElementById('chart-radar');
    if (!ctx) return;

    const top3 = state.rankingResults.slice(0, 3);
    state.charts['radar'] = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Speed to Market', 'Cost', 'Environmental', 'Resilience'],
        datasets: top3.map(t => ({
          label: t.meta.name,
          data: [t.axisScores.speedToMarket, t.axisScores.cost, t.axisScores.environmental, t.axisScores.resilience],
          borderColor: t.meta.color,
          backgroundColor: `rgba(${t.meta.colorRgb},0.1)`,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14 } },
        },
        scales: {
          r: {
            min: 0, max: 100,
            grid: { color: 'rgba(59,130,246,0.1)' },
            angleLines: { color: 'rgba(59,130,246,0.1)' },
            pointLabels: { color: '#94a3b8', font: { size: 11 } },
            ticks: { display: false },
          },
        },
      },
    });
  }, 50);
}

// ─── CONFIGURE: WEIGHTS ───────────────────────────────
function updateWeights() {
  const wTime    = +document.getElementById('w-time').value;
  const wCost    = +document.getElementById('w-cost').value;
  const wCarbon  = +document.getElementById('w-carbon').value;
  const wRes     = +document.getElementById('w-res').value;
  const total    = wTime + wCost + wCarbon + wRes || 1;

  const pTime   = Math.round(wTime   / total * 100);
  const pCost   = Math.round(wCost   / total * 100);
  const pCarbon = Math.round(wCarbon / total * 100);
  const pRes    = 100 - pTime - pCost - pCarbon;

  dv('wv-time',   pTime   + '%');
  dv('wv-cost',   pCost   + '%');
  dv('wv-carbon', pCarbon + '%');
  dv('wv-res',    pRes    + '%');

  const bar = document.getElementById('weights-bar');
  if (bar) {
    const divs = bar.querySelectorAll('div');
    if (divs[0]) divs[0].style.width = pTime   + '%';
    if (divs[1]) divs[1].style.width = pCost   + '%';
    if (divs[2]) divs[2].style.width = pCarbon + '%';
    if (divs[3]) divs[3].style.width = pRes    + '%';
  }

  // If optimization has already run, recalculate scores live as weights change
  if (state.optimized) {
    recalculateAllStrategies(readParams(), readWeights());
    updateKPITargets();
    const v = state.currentView;
    if (v === 'overview') initOverview();
    if (v === 'pathways') initPathways();
    if (v === 'report')   renderReport();
  }
}

function resetDefaults() {
  const defaults = {
    'cfg-load': 300, 'cfg-wmin': 24, 'cfg-wmax': 48, 'cfg-conf': 65,
    'cfg-gcost': 12, 'cfg-em': 40, 'cfg-cp': 35, 'cfg-nox': 25,
    'cfg-red': 30,   'cfg-gas': 80, 'cfg-bess': 60, 'cfg-solar': 40,
    'w-time': 35, 'w-cost': 30, 'w-carbon': 20, 'w-res': 15,
    'cfg-queue': 47,
  };
  for (const [id, val] of Object.entries(defaults)) {
    const el = document.getElementById(id);
    if (el) { el.value = val; el.dispatchEvent(new Event('input')); }
  }
  state.loadRampPhases = [
    { name: 'Phase 1 — Initial',   month: 6,  pct: 30  },
    { name: 'Phase 2 — Expansion', month: 18, pct: 70  },
    { name: 'Phase 3 — Full Load', month: 36, pct: 100 },
  ];
  renderPhaseTable();
  updateQueueDisplay(47);
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  updateWeights();
  showToast('Parameters reset to defaults');
}

// ─── OPTIMIZATION SIMULATION ─────────────────────────
function runOptimization() {
  const modal   = document.getElementById('opt-modal');
  const bar     = document.getElementById('opt-bar');
  const stepsEl = document.getElementById('opt-steps');
  const btn     = document.getElementById('btn-optimize');
  if (!modal || !bar) return;

  const steps = [
    'Generating scenario permutations...',
    'Running Monte Carlo interconnection analysis...',
    'Evaluating phased asset lifecycle costs...',
    'Computing Pareto-optimal frontier...',
    'Applying regulatory risk adjustments...',
    'Ranking strategies by weighted score...',
    'Optimization complete!',
  ];

  modal.style.display = 'flex';
  if (btn) { btn.disabled = true; document.getElementById('optimize-text').textContent = 'Running...'; }

  let step = 0;
  const interval = setInterval(() => {
    const pct = Math.round((step + 1) / steps.length * 100);
    bar.style.width = pct + '%';

    stepsEl.innerHTML = steps.map((s, i) => `
      <div class="opt-step ${i === step ? 'active' : i < step ? 'done' : ''}">
        ${i < step ? '✓ ' : i === step ? '▸ ' : '  '}${s}
      </div>
    `).join('');

    step++;
    if (step >= steps.length) {
      clearInterval(interval);
      setTimeout(() => {
        modal.style.display = 'none';
        if (btn) { btn.disabled = false; document.getElementById('optimize-text').textContent = 'Run Optimization'; }
        try {
          // Legacy strategy scoring (Overview, Timeline, Risk Matrix)
          recalculateAllStrategies(readParams(), readWeights());
          state.optimized = true;
          updateKPITargets();
          // Relative ranking (Technology Comparison view)
          const rw = readRankingWeights();
          state.lastRankingWeights = rw;
          state.rankingResults     = rankTechnologies(rw);
          // Real optimizer: absolute values, C1/C3/C4/C5/C6 constraints
          const params = readParams();
          state.lastParams      = params;
          state.optimizerResult = optimize(params, rw);
          showToast('Optimization complete — ' + (state.optimizerResult.ranked.length) + ' feasible portfolios ranked.');
          navigate('pathways');
        } catch (err) {
          alert('Optimizer error: ' + err.message + '\n\nCheck browser console (F12) for details.');
          console.error('Optimizer error:', err);
        }
      }, 700);
    }
  }, 500);
}

// ─── TOAST ────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard nav
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const m = document.getElementById('opt-modal');
      if (m) m.style.display = 'none';
    }
  });

  // Initialize configure page dynamic elements
  renderPhaseTable();
  updateQueueDisplay(47);

  // Initialize default view
  initOverview();
  renderTimeline('hybrid-phased');
  renderRisk('hybrid-phased');
  renderReport();

  // Small welcome toast
  setTimeout(() => showToast('Power Pathway Optimizer loaded — 5 strategies ready'), 800);
});
