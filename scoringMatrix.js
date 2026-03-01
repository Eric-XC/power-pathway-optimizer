'use strict';

/* ═══════════════════════════════════════════════════════
   STATIC SCORING MATRIX
   9 technologies × 7 criteria (0–100, higher = better)
   Source: Team scoring document (draft matrix, March 2026)
   Concept-level, relative rubric — not engineering-grade.
═══════════════════════════════════════════════════════ */
const SCORING_MATRIX = {
  fuelCell_SOFC: {
    name: 'Fuel Cells (SOFC)', color: '#3b82f6', colorRgb: '59,130,246', icon: '⚗',
    scores: { timeToDeploy: 90, costToDeploy: 35, costToOperate: 65, reliability: 95, capacityFactor: 90, environmental: 70, spaceConstraints: 95 },
  },
  portable_xfmr: {
    name: 'Portable Xfmr + Utility', color: '#a78bfa', colorRgb: '167,139,250', icon: '🔧',
    scores: { timeToDeploy: 80, costToDeploy: 65, costToOperate: 80, reliability: 65, capacityFactor: 90, environmental: 60, spaceConstraints: 80 },
    displayOnly: true,
  },
  utility_ppa: {
    name: 'Utility Power (TX)', color: '#0ea5e9', colorRgb: '14,165,233', icon: '🔌',
    scores: { timeToDeploy: 30, costToDeploy: 40, costToOperate: 85, reliability: 80, capacityFactor: 95, environmental: 60, spaceConstraints: 90 },
    displayOnly: true,
  },
  geothermal: {
    name: 'Geothermal', color: '#84cc16', colorRgb: '132,204,22', icon: '🌋',
    scores: { timeToDeploy: 25, costToDeploy: 40, costToOperate: 65, reliability: 90, capacityFactor: 85, environmental: 80, spaceConstraints: 70 },
  },
  smr: {
    name: 'Small Modular Reactor', color: '#8b5cf6', colorRgb: '139,92,246', icon: '⚛',
    scores: { timeToDeploy: 10, costToDeploy: 20, costToOperate: 75, reliability: 95, capacityFactor: 95, environmental: 85, spaceConstraints: 60 },
  },
  solar_bess: {
    name: 'Solar + BESS (12h)', color: '#10b981', colorRgb: '16,185,129', icon: '☀',
    scores: { timeToDeploy: 75, costToDeploy: 50, costToOperate: 90, reliability: 45, capacityFactor: 25, environmental: 90, spaceConstraints: 25 },
  },
  diesel_generator: {
    name: 'Diesel Generator', color: '#ef4444', colorRgb: '239,68,68', icon: '⛽',
    scores: { timeToDeploy: 95, costToDeploy: 85, costToOperate: 20, reliability: 75, capacityFactor: 15, environmental: 10, spaceConstraints: 85 },
  },
  gas_turbine: {
    name: 'Gas Turbine (SC)', color: '#f97316', colorRgb: '249,115,22', icon: '🔥',
    scores: { timeToDeploy: 45, costToDeploy: 55, costToOperate: 55, reliability: 85, capacityFactor: 15, environmental: 35, spaceConstraints: 70 },
  },
  wind_bess: {
    name: 'Wind + BESS', color: '#06b6d4', colorRgb: '6,182,212', icon: '💨',
    scores: { timeToDeploy: 50, costToDeploy: 50, costToOperate: 85, reliability: 40, capacityFactor: 40, environmental: 75, spaceConstraints: 10 },
  },
};

/* ═══════════════════════════════════════════════════════
   AXIS MAPPING  (7 criteria → 4 developer axes)

   SpeedToMarket = timeToDeploy
   Cost          = avg(costToDeploy, costToOperate, spaceConstraints)
   Environmental = environmental
   Resilience    = avg(reliability, capacityFactor)
═══════════════════════════════════════════════════════ */
function getAxisScores(techId) {
  const s = SCORING_MATRIX[techId].scores;
  return {
    speedToMarket: s.timeToDeploy,
    cost:          Math.round((s.costToDeploy + s.costToOperate + s.spaceConstraints) / 3),
    environmental: s.environmental,
    resilience:    Math.round((s.reliability  + s.capacityFactor) / 2),
  };
}

/* ═══════════════════════════════════════════════════════
   COMPOSITE SCORING
   weights: { speedToMarket, cost, environmental, resilience }
   Each weight is a fraction (0–1); they must sum to 1.
═══════════════════════════════════════════════════════ */
function computeCompositeScore(techId, weights) {
  const a = getAxisScores(techId);
  return (
    weights.speedToMarket * a.speedToMarket +
    weights.cost          * a.cost          +
    weights.environmental * a.environmental +
    weights.resilience    * a.resilience
  );
}

/* ═══════════════════════════════════════════════════════
   RANK ALL TECHNOLOGIES
   Returns array sorted by composite score (highest first).
═══════════════════════════════════════════════════════ */
function rankTechnologies(weights) {
  return Object.keys(SCORING_MATRIX)
    .map(id => ({
      id,
      meta:       SCORING_MATRIX[id],
      axisScores: getAxisScores(id),
      composite:  Math.round(computeCompositeScore(id, weights)),
    }))
    .sort((a, b) => b.composite - a.composite);
}
