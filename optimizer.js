'use strict';

/* ═══════════════════════════════════════════════════════
   ABSOLUTE TECHNOLOGY PARAMETERS
   Source: Team scoring document, March 2026
   CapEx in $/kW (table values × 1000 = $/kW)
   CO2 in kg/kWh (table values in kg/MWh ÷ 1000)
   CF = midpoint of published range
   Deploy = midpoint of published range (months)
   Units: capexPerKw $/kW · co2PerKwh kg/kWh · opexPerKwYr $/kW/yr
═══════════════════════════════════════════════════════ */
const TECH_PARAMS = {
  fuelCell_SOFC: {
    capexPerKw:     3000,   // $3,000/kW (Bloom Energy installed)
    lcoePerMWh:     110,    // $110/MWh
    co2PerKwh:      0.470,  // 470 kg/MWh on natural gas
    deployMonths:   4,      // midpoint 3–6 mo
    opexPerKwYr:    19,     // O&M ~$19/kW/yr
    capacityFactor: 0.925,  // midpoint 90–95%
    availability:   0.99,
    acresPerMW:     0.01,
    minUnitMW:      1,
  },
  smr: {
    capexPerKw:     5600,   // $5,600/kW first-of-a-kind
    lcoePerMWh:     95,     // $95/MWh
    co2PerKwh:      0.012,  // 12 kg/MWh (lifecycle, near-zero operational)
    deployMonths:   90,     // midpoint 60–120 mo
    opexPerKwYr:    75,     // very low fuel cost; high capital amortization
    capacityFactor: 0.935,  // midpoint 90–97%
    availability:   0.95,
    acresPerMW:     0.02,
    minUnitMW:      50,     // minimum commercial unit (NuScale ~77 MW/module)
  },
  solar_bess: {
    capexPerKw:     2400,   // $2,400/kW (solar PV + 12-hr BESS blended)
    lcoePerMWh:     60,     // $60/MWh
    co2PerKwh:      0.040,  // 40 kg/MWh (lifecycle, manufacturing)
    deployMonths:   12,     // midpoint 6–18 mo
    opexPerKwYr:    15,     // near-zero marginal cost; O&M ~$15/kW-yr
    capacityFactor: 0.20,   // midpoint 15–25%; BESS shifts timing, not total
    availability:   0.45,   // weather-dependent; zero output at night
    acresPerMW:     6.5,
    minUnitMW:      1,
  },
  gas_turbine: {
    capexPerKw:     1600,   // $1,600/kW simple cycle
    lcoePerMWh:     95,     // $95/MWh
    co2PerKwh:      0.600,  // 600 kg/MWh simple cycle
    deployMonths:   18,     // midpoint 12–24 mo
    opexPerKwYr:    40,     // significant O&M for fuel + overhauls
    capacityFactor: 0.75,   // midpoint 70–80% (when used as baseload bridge)
    availability:   0.85,
    acresPerMW:     1.0,
    minUnitMW:      50,     // practical minimum for commercial combustion turbine
  },
  diesel_generator: {
    capexPerKw:     900,    // $900/kW installed
    lcoePerMWh:     160,    // $160/MWh (most expensive to operate)
    co2PerKwh:      0.790,  // 790 kg/MWh
    deployMonths:   3,      // midpoint 1–6 mo
    opexPerKwYr:    180,    // $0.20–$0.40/kWh; most expensive to operate
    capacityFactor: 0.80,   // midpoint 75–85% (when used as bridging baseload)
    availability:   0.80,
    acresPerMW:     0.3,
    minUnitMW:      1,
  },
  wind_bess: {
    capexPerKw:     1700,   // $1,700/kW (wind + BESS blended)
    lcoePerMWh:     80,     // $80/MWh
    co2PerKwh:      0.010,  // 10 kg/MWh (lifecycle)
    deployMonths:   24,     // midpoint 12–36 mo
    opexPerKwYr:    40,     // O&M + BESS cycling
    capacityFactor: 0.36,   // midpoint 25–47%
    availability:   0.40,   // weather-dependent
    acresPerMW:     55,
    minUnitMW:      1,
  },
  geothermal: {
    capexPerKw:     2300,   // $2,300/kW installed
    lcoePerMWh:     90,     // $90/MWh
    co2PerKwh:      0.035,  // 35 kg/MWh (very low lifecycle)
    deployMonths:   80,     // midpoint 60–100 mo
    opexPerKwYr:    50,     // stable baseload; O&M ~$50/kW-yr
    capacityFactor: 0.81,   // midpoint 67–95%
    availability:   0.92,
    acresPerMW:     4.5,
    minUnitMW:      5,
  },
};

/* ═══════════════════════════════════════════════════════
   MAIN OPTIMIZER

   params: {
     loadMW, loadRampPhases, gridWaitMin, gridWaitMax,
     enabledTechs,           — array of enabled tech IDs (C4)
     carbonCapKgPerKwh,      — tCO₂/MWh = kg CO₂/kWh (C3)
     budgetM,                — $M, used only for soft cost scoring
   }
   weights: { speedToMarket, cost, environmental, resilience }
     (fractions, sum = 1 — from user sliders)

   returns: { ranked: [...], infeasibleReasons: {...} }

   Constraints applied:
     C1 — load coverage at each ramp phase
     C3 — carbon intensity (no C2 budget hard gate)
     C4 — technology enabled by user
     C5 — at most 2 active technologies
     C6 — total capacity ≥ loadMW
═══════════════════════════════════════════════════════ */
function optimize(params, weights) {
  const {
    loadMW, loadRampPhases, gridWaitMin, gridWaitMax,
    enabledTechs, carbonCapKgPerKwh, budgetM,
  } = params;

  const bridgeMonths  = Math.round((gridWaitMin + gridWaitMax) / 2);
  const allTechIds    = Object.keys(TECH_PARAMS);
  const infeasibleReasons = {};

  /* ── Stage 1: Filter individual technologies (C4 + early C1 check) ── */
  const feasible = [];
  for (const id of allTechIds) {
    const p = TECH_PARAMS[id];
    const reasons = [];

    // C4: user toggle
    if (!enabledTechs.includes(id)) {
      reasons.push('Disabled by user');
    }

    // C1 early check: must be deployable before the latest ramp phase
    const latestPhaseMonth = Math.max(...loadRampPhases.map(ph => ph.month), 0);
    if (p.deployMonths > latestPhaseMonth + 6) {
      reasons.push(`Deploy time (${p.deployMonths} mo) exceeds all phase deadlines`);
    }

    if (reasons.length > 0) {
      infeasibleReasons[id] = reasons;
    } else {
      feasible.push(id);
    }
  }

  /* ── Stage 2: Enumerate portfolios (C5: at most 2 techs) ── */
  const portfolios = [];
  for (const id of feasible) portfolios.push([id]);
  for (let i = 0; i < feasible.length; i++) {
    for (let j = i + 1; j < feasible.length; j++) {
      portfolios.push([feasible[i], feasible[j]]);
    }
  }

  /* ── Stage 3: Size → check C1, C3, C6 → score → collect ── */
  const ranked = [];
  for (const portfolio of portfolios) {
    const sized = sizePortfolio(portfolio, loadMW, loadRampPhases);
    if (!sized) continue;

    const metrics = computeMetrics(sized, bridgeMonths);

    // C6: total capacity ≥ loadMW
    if (metrics.totalCapacityMW < loadMW * 0.99) {
      infeasibleReasons[portfolio.join('+')] =
        [`Capacity ${metrics.totalCapacityMW} MW < required ${loadMW} MW`];
      continue;
    }

    // C3: carbon intensity (no C2 budget hard gate)
    if (carbonCapKgPerKwh > 0 && metrics.co2Intensity > carbonCapKgPerKwh) {
      infeasibleReasons[portfolio.join('+')] = [
        `CO₂ ${metrics.co2Intensity.toFixed(3)} kg/kWh exceeds cap ${carbonCapKgPerKwh.toFixed(3)}`,
      ];
      continue;
    }

    // C1: phase-by-phase coverage check
    const coverage = checkPhaseCoverage(sized, loadMW, loadRampPhases);
    if (!coverage.ok) {
      infeasibleReasons[portfolio.join('+')] = [coverage.reason];
      continue;
    }

    const scores = scorePortfolio(metrics, params, weights);
    ranked.push({
      portfolio: sized,
      metrics,
      scores,
      composite: Math.round(scores.composite),
    });
  }

  ranked.sort((a, b) => b.composite - a.composite);

  /* ── Fallback level 1: relax C1 + C3, keep C6 ──────────────────────────
     Runs when strict constraints exclude everything. Skips carbon cap and
     phase-coverage timing checks so the optimizer always returns a result.
     Still uses only user-enabled techs (C4 respected). */
  if (ranked.length === 0) {
    for (const portfolio of portfolios) {
      const sized = sizePortfolio(portfolio, loadMW, loadRampPhases);
      if (!sized) continue;
      const metrics = computeMetrics(sized, bridgeMonths);
      if (metrics.totalCapacityMW < loadMW * 0.99) continue;
      const scores = scorePortfolio(metrics, params, weights);
      ranked.push({ portfolio: sized, metrics, scores, composite: Math.round(scores.composite) });
    }
    ranked.sort((a, b) => b.composite - a.composite);
  }

  /* ── Fallback level 2: last resort — ignore ALL constraints ─────────────
     Runs only if level 1 is still empty (e.g. all techs disabled by user).
     Uses every tech in TECH_PARAMS regardless of user toggles. This guarantees
     a result is ALWAYS returned — "No Feasible Solutions" can never appear. */
  if (ranked.length === 0) {
    for (const id of Object.keys(TECH_PARAMS)) {
      const sized = sizePortfolio([id], loadMW, loadRampPhases);
      if (!sized) continue;
      const metrics = computeMetrics(sized, bridgeMonths);
      const scores = scorePortfolio(metrics, params, weights);
      ranked.push({ portfolio: sized, metrics, scores, composite: Math.round(scores.composite) });
    }
    ranked.sort((a, b) => b.composite - a.composite);
  }

  return { ranked, infeasibleReasons };
}

/* ── Size a portfolio ─────────────────────────────────
   Single tech: exactly enough capacity to cover peak load.
   Two techs:   faster deploying = primary (full load),
                slower = supplemental (30% as backup).
──────────────────────────────────────────────────────── */
function sizePortfolio(techIds, loadMW, phases) {
  if (techIds.length === 1) {
    const id  = techIds[0];
    const p   = TECH_PARAMS[id];
    const cap = Math.max(p.minUnitMW, Math.ceil(loadMW / Math.max(p.minUnitMW, 1)) * p.minUnitMW);
    return [{ id, capacityMW: cap }];
  }

  // 2-tech: assign primary = faster deploying
  const [id1, id2] = techIds;
  const [primId, secId] = TECH_PARAMS[id1].deployMonths <= TECH_PARAMS[id2].deployMonths
    ? [id1, id2] : [id2, id1];
  const pp = TECH_PARAMS[primId];
  const sp = TECH_PARAMS[secId];

  const capPrim = Math.max(pp.minUnitMW, Math.ceil(loadMW / Math.max(pp.minUnitMW, 1)) * pp.minUnitMW);
  const capSec  = Math.max(sp.minUnitMW, Math.ceil(loadMW * 0.3 / Math.max(sp.minUnitMW, 1)) * sp.minUnitMW);

  return [
    { id: primId, capacityMW: capPrim },
    { id: secId,  capacityMW: capSec  },
  ];
}

/* ── Check load coverage at each ramp phase (C1) ─────── */
function checkPhaseCoverage(sized, loadMW, phases) {
  for (const phase of phases) {
    const needed    = (phase.pct / 100) * loadMW;
    const available = sized
      .filter(({ id }) => TECH_PARAMS[id].deployMonths <= phase.month + 0.5)
      .reduce((sum, { capacityMW }) => sum + capacityMW, 0);
    if (available < needed * 0.95) {
      return {
        ok: false,
        reason: `Phase month ${phase.month}: needs ${needed.toFixed(0)} MW, only ${available.toFixed(0)} MW ready`,
      };
    }
  }
  return { ok: true };
}

/* ── Compute absolute engineering metrics ────────────── */
function computeMetrics(sized, bridgeMonths) {
  let capexUsd = 0, opexAnnual = 0, totalMW = 0;
  let co2Num = 0, co2Den = 0;
  let availNum = 0, cfNum = 0;
  let minDeploy = Infinity;

  for (const { id, capacityMW } of sized) {
    const p = TECH_PARAMS[id];
    capexUsd   += capacityMW * 1000 * p.capexPerKw;
    opexAnnual += capacityMW * 1000 * p.opexPerKwYr;
    totalMW    += capacityMW;
    co2Num     += capacityMW * p.capacityFactor * p.co2PerKwh;
    co2Den     += capacityMW * p.capacityFactor;
    availNum   += capacityMW * p.availability;
    cfNum      += capacityMW * p.capacityFactor;
    minDeploy   = Math.min(minDeploy, p.deployMonths);
  }

  const bridgeOpex = opexAnnual * (bridgeMonths / 12);
  return {
    totalCapexM:     +(capexUsd / 1e6).toFixed(1),
    annualOpexM:     +(opexAnnual / 1e6).toFixed(1),
    bridgeOpexM:     +(bridgeOpex / 1e6).toFixed(1),
    totalCostM:      +((capexUsd + bridgeOpex) / 1e6).toFixed(1),
    totalCapacityMW: +totalMW.toFixed(0),
    co2Intensity:    co2Den > 0 ? +(co2Num / co2Den).toFixed(4) : 0,
    availability:    +(availNum / totalMW).toFixed(4),
    capacityFactor:  +(cfNum    / totalMW).toFixed(4),
    deployMonths:    minDeploy,
    bridgeMonths,
  };
}

/* ── Score a portfolio — sub-scores on [0, 100] ─────── */
function scorePortfolio(metrics, params, weights) {
  const { gridWaitMax, budgetM, carbonCapKgPerKwh } = params;
  const { speedToMarket, cost, environmental, resilience } = weights;

  // Speed: first power vs worst-case grid wait
  const S_speed = Math.max(0, (1 - metrics.deployMonths / Math.max(gridWaitMax, 1)) * 100);

  // Cost: soft penalty — no hard gate (no C2)
  const ref    = budgetM > 0 ? budgetM * 1.5 : metrics.totalCostM * 2;
  const S_cost = Math.max(0, (1 - metrics.totalCostM / ref) * 100);

  // Environmental: sqrt curve against carbon cap
  const capRef = carbonCapKgPerKwh > 0 ? carbonCapKgPerKwh : 0.80;
  const S_env  = Math.max(0, Math.sqrt(Math.max(0, 1 - metrics.co2Intensity / capRef)) * 100);

  // Resilience: weighted avg availability + capacity factor
  const S_res  = ((metrics.availability + metrics.capacityFactor) / 2) * 100;

  const composite = speedToMarket * S_speed
                  + cost          * S_cost
                  + environmental * S_env
                  + resilience    * S_res;

  return {
    speed: Math.round(S_speed),
    cost:  Math.round(S_cost),
    env:   Math.round(S_env),
    res:   Math.round(S_res),
    composite,
  };
}

/* ── Identify Pareto-optimal portfolios ──────────────────
   Minimise deployMonths (speed) AND totalCostM (cost).
   Returns a Set of indices into `ranked` that are non-dominated.
──────────────────────────────────────────────────────────── */
function computePareto(ranked) {
  const paretoSet = new Set();
  for (let i = 0; i < ranked.length; i++) {
    const a = ranked[i].metrics;
    let dominated = false;
    for (let j = 0; j < ranked.length; j++) {
      if (i === j) continue;
      const b = ranked[j].metrics;
      const bBetterOrEqualOnBoth =
        b.deployMonths <= a.deployMonths && b.totalCostM <= a.totalCostM;
      const bStrictlyBetterOnOne =
        b.deployMonths < a.deployMonths || b.totalCostM < a.totalCostM;
      if (bBetterOrEqualOnBoth && bStrictlyBetterOnOne) {
        dominated = true;
        break;
      }
    }
    if (!dominated) paretoSet.add(i);
  }
  return paretoSet;
}

/* ═══════════════════════════════════════════════════════
   PATHWAY OVER TIME
   Generates a staged bridging plan aligned with the
   whiteboard concept: DC Load (red step) vs Utility (black
   line), with on-site assets filling the gap each phase.

   Rules:
   - Time buckets derived from load ramp phases + firm power month
   - Each bucket: gap = loadMW − utilityMW − cumulative non-diesel capacity
   - Per bucket: score enabled, not-yet-deployed techs
   - Pick top 1–2 to cover remaining gap
   - Non-diesel assets persist across buckets (sunk cost)
   - Diesel is temporary: selected only in first bucket,
     not carried forward
   - Cross-phase look-ahead: 25% bonus for performing well
     in next bucket (avoids greedy local-optimum lock-in)
═══════════════════════════════════════════════════════ */
function generatePathway(params, weights) {
  const { loadMW, loadRampPhases, gridWaitMin, gridWaitMax, enabledTechs } = params;
  const firmPowerMonth = Math.round((gridWaitMin + gridWaitMax) / 2);
  const utilCapMW      = params.utilityCapMW ?? loadMW;  // partial utility support

  const phases = [...loadRampPhases].sort((a, b) => a.month - b.month);

  /* Load pct active at a given month (step function) */
  function getLoadPct(month) {
    let pct = 0;
    for (const p of phases) { if (month >= p.month) pct = p.pct; }
    return pct;
  }

  /* Build bucket boundaries: union of phase months + firmPowerMonth */
  const bSet = new Set(phases.map(p => p.month));
  bSet.add(firmPowerMonth);
  const boundaries = [...bSet].sort((a, b) => a - b);
  boundaries.push(boundaries[boundaries.length - 1] + 18); // trailing utility bucket

  /* Create buckets, skip zero-load pre-start period */
  const buckets = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start      = boundaries[i];
    const end        = boundaries[i + 1];
    const loadPct    = getLoadPct(start);
    if (loadPct === 0) continue;
    const bucketLoad = +(loadPct / 100 * loadMW).toFixed(0);
    // Utility delivers min(bucketLoad, utilCapMW) once firm power arrives
    const utilityMW  = start >= firmPowerMonth ? Math.min(bucketLoad, utilCapMW) : 0;
    buckets.push({ start, end, loadMW: bucketLoad, utilityMW,
                   isUtility: start >= firmPowerMonth });
  }

  /* Track cumulative deployed non-diesel assets */
  const deployedND = []; // { id, capacityMW }
  let dieselUsed   = false;
  const result     = [];

  for (let i = 0; i < buckets.length; i++) {
    const bucket      = buckets[i];
    const isFirstBucket = i === 0;
    const existingCap = deployedND.reduce((s, d) => s + d.capacityMW, 0);
    const gap         = Math.max(0, bucket.loadMW - bucket.utilityMW - existingCap);

    /* Gap closed: either utility covers all, or existing on-site assets cover remainder */
    if (gap <= 0) {
      result.push({
        ...bucket,
        gap: 0,
        newDeploy:     [],
        totalOnsite:   [...deployedND],
        rationale:     bucket.isUtility ? ['Utility primary'] : ['Existing assets cover gap'],
        isUtilityPhase: bucket.isUtility && gap <= 0,
        residualGap:   0,
      });
      continue;
    }

    /* Utility phase with residual gap (partial utility cap): fall through to on-site gen */

    /* Score candidates: enabled techs not yet deployed (non-diesel) or diesel if first bucket */
    const deployedIds = new Set(deployedND.map(d => d.id));
    const candidates = enabledTechs
      .filter(id => SCORING_MATRIX[id])
      .filter(id => !deployedIds.has(id))
      .filter(id => id !== 'diesel_generator' || (isFirstBucket && !dieselUsed))
      // Hard timing constraint: tech must be deployable by bucket start (from project month 0)
      .filter(id => { const tp = TECH_PARAMS[id]; return !tp || tp.deployMonths <= bucket.start; })
      .map(id => {
        const score = _scoreForBucket(id, bucket, i, buckets, weights, isFirstBucket);
        const cap   = _sizeForGap(id, gap);
        return { id, score, capacityMW: cap };
      })
      .filter(c => isFinite(c.score))
      .sort((a, b) => b.score - a.score);

    /* Pick top 1–2 to cover gap */
    let covered  = 0;
    const selected = [];
    for (const c of candidates) {
      if (covered >= gap || selected.length >= 2) break;
      selected.push(c);
      covered += c.capacityMW;
    }

    /* Commit non-diesel to persistent pool */
    for (const s of selected) {
      if (s.id === 'diesel_generator') { dieselUsed = true; }
      else                             { deployedND.push({ id: s.id, capacityMW: s.capacityMW }); }
    }

    /* Rationale: top 2 axes of highest-scoring selected tech */
    const rationale = selected.length > 0 ? _topAxes(selected[0].id, weights) : [];

    result.push({
      ...bucket,
      gap:           Math.round(gap),
      newDeploy:     selected,
      totalOnsite:   [
        ...deployedND,
        ...selected.filter(s => s.id === 'diesel_generator').map(s => ({ ...s, temp: true })),
      ],
      rationale,
      isUtilityPhase: false,
      residualGap:   Math.round(Math.max(0, gap - covered)),
    });
  }

  return result;
}

/* ── Score a technology for a specific bucket ───────── */
function _scoreForBucket(id, bucket, bucketIdx, allBuckets, weights, isFirstBucket) {
  const axes = getAxisScores(id);  // from scoringMatrix.js
  if (!axes) return -Infinity;

  /* Base weighted score */
  let score = weights.speedToMarket * axes.speedToMarket
            + weights.cost          * axes.cost
            + weights.environmental * axes.environmental
            + weights.resilience    * axes.resilience;

  /* Deployment speed bonus:
     Rewards techs that deploy well ahead of the bucket deadline.
     Scales with speedToMarket² so Fast-to-Market presets strongly prefer
     the fastest deployer (e.g. Diesel over SOFC in bucket 1), while
     Green/Uptime presets are largely unaffected.

     deployRatio: 0 = instant, 1 = just barely makes deadline
     bonus = (1 - deployRatio) × 100 × speedWeight² × 4
     Example (bucket.start=6, speedToMarket=0.50):
       Diesel (3mo): (1−0.5)×100×0.25×4 = 50 pts
       SOFC   (4mo): (1−0.67)×100×0.25×4 = 33 pts  → Diesel wins with Fast preset ✓
     Example (green, speedToMarket=0.15):
       Diesel: 4.5 pts   SOFC: 3 pts   → tiny diff, SOFC still wins on other axes ✓
  */
  const tp = TECH_PARAMS[id];
  if (tp && bucket.start > 0) {
    const deployRatio = tp.deployMonths / bucket.start;
    const deployBonus = Math.max(0, 1 - deployRatio) * 100
                      * weights.speedToMarket * weights.speedToMarket * 4;
    score += deployBonus;
  }

  /* Diesel penalty in later buckets */
  if (id === 'diesel_generator' && !isFirstBucket) score -= 60;

  /* Cross-phase look-ahead: 25% bonus for techs eligible in the next bucket.
     Disabled in bucket 0: when power is urgently needed NOW, future utility
     should not override the speed imperative of the current bucket. */
  const next = allBuckets[bucketIdx + 1];
  if (!isFirstBucket && next && !next.isUtility) {
    const nextTp = TECH_PARAMS[id];
    const eligibleNext = !nextTp || nextTp.deployMonths <= next.start;
    if (eligibleNext) {
      const nextScore = weights.speedToMarket * axes.speedToMarket
                      + weights.cost          * axes.cost
                      + weights.environmental * axes.environmental
                      + weights.resilience    * axes.resilience;
      score += 0.25 * nextScore;
    }
  }

  return score;
}

/* ── Size a technology to cover a gap ───────────────── */
function _sizeForGap(id, gapMW) {
  const p = TECH_PARAMS[id];
  if (!p) return Math.ceil(gapMW);
  return Math.max(p.minUnitMW, Math.ceil(gapMW / Math.max(p.minUnitMW, 1)) * p.minUnitMW);
}

/* ── Top 2 contributing axes for rationale ──────────── */
function _topAxes(id, weights) {
  const axes = getAxisScores(id);
  if (!axes) return [];
  return [
    { name: 'Speed',         val: weights.speedToMarket * axes.speedToMarket },
    { name: 'Cost',          val: weights.cost          * axes.cost          },
    { name: 'Environmental', val: weights.environmental * axes.environmental },
    { name: 'Resilience',    val: weights.resilience    * axes.resilience    },
  ].sort((a, b) => b.val - a.val).slice(0, 2).map(a => a.name);
}
