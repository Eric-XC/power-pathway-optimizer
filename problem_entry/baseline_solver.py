"""
baseline_solver.py
==================
Baseline solver for the Data Center Power Pathway Selection problem.

Usage:
    python baseline_solver.py instance_01_baseline.json
    python baseline_solver.py instance_01_baseline.json --top 5
    python baseline_solver.py instance_01_baseline.json --out results.json

Interface:
    solve(instance: dict) -> dict
    - Input:  problem instance (matches instance schema)
    - Output: ranked pathways + metrics + constraint flags

Source: replicates optimizer.js logic from
        https://github.com/Eric-XC/power-pathway-optimizer
"""

import json
import math
import sys
import argparse
from itertools import combinations

# ─── Technology parameters ────────────────────────────────────────────────────
# Source: optimizer.js TECH_PARAMS (March 2026)
# capexPerKw: $/kW  |  opexPerKwYr: $/kW/yr  |  co2PerKwh: kg/kWh
# deployMonths: months to first power  |  capacityFactor / availability: fractions
# minUnitMW: minimum practical unit size (MW)

TECH_PARAMS = {
    "fuelCell_SOFC": {
        "capexPerKw": 3000, "lcoePerMWh": 110, "co2PerKwh": 0.470,
        "deployMonths": 4,  "opexPerKwYr": 19,
        "capacityFactor": 0.925, "availability": 0.99,
        "acresPerMW": 0.01, "minUnitMW": 1,
    },
    "smr": {
        "capexPerKw": 5600, "lcoePerMWh": 95, "co2PerKwh": 0.012,
        "deployMonths": 90, "opexPerKwYr": 75,
        "capacityFactor": 0.935, "availability": 0.95,
        "acresPerMW": 0.02, "minUnitMW": 50,
    },
    "solar_bess": {
        "capexPerKw": 2400, "lcoePerMWh": 60, "co2PerKwh": 0.040,
        "deployMonths": 12, "opexPerKwYr": 15,
        "capacityFactor": 0.20, "availability": 0.45,
        "acresPerMW": 6.5, "minUnitMW": 1,
    },
    "gas_turbine": {
        "capexPerKw": 1600, "lcoePerMWh": 95, "co2PerKwh": 0.600,
        "deployMonths": 18, "opexPerKwYr": 40,
        "capacityFactor": 0.75, "availability": 0.85,
        "acresPerMW": 1.0, "minUnitMW": 50,
    },
    "diesel_generator": {
        "capexPerKw": 900, "lcoePerMWh": 160, "co2PerKwh": 0.790,
        "deployMonths": 3,  "opexPerKwYr": 180,
        "capacityFactor": 0.80, "availability": 0.80,
        "acresPerMW": 0.3, "minUnitMW": 1,
    },
    "wind_bess": {
        "capexPerKw": 1700, "lcoePerMWh": 80, "co2PerKwh": 0.010,
        "deployMonths": 24, "opexPerKwYr": 40,
        "capacityFactor": 0.36, "availability": 0.40,
        "acresPerMW": 55, "minUnitMW": 1,
    },
    "geothermal": {
        "capexPerKw": 2300, "lcoePerMWh": 90, "co2PerKwh": 0.035,
        "deployMonths": 80, "opexPerKwYr": 50,
        "capacityFactor": 0.81, "availability": 0.92,
        "acresPerMW": 4.5, "minUnitMW": 5,
    },
}


# ─── Portfolio sizing ─────────────────────────────────────────────────────────
def size_portfolio(tech_ids, load_mw):
    """
    Size a portfolio of 1 or 2 technologies.
    Single-tech: enough to cover full load.
    Two-tech: faster deploying = primary (full load), slower = supplemental (30%).
    """
    def round_up_to_unit(mw, min_unit):
        if min_unit <= 0:
            return max(1, math.ceil(mw))
        return max(min_unit, math.ceil(mw / min_unit) * min_unit)

    if len(tech_ids) == 1:
        t = tech_ids[0]
        p = TECH_PARAMS[t]
        cap = round_up_to_unit(load_mw, p["minUnitMW"])
        return [{"id": t, "capacityMW": cap}]

    id1, id2 = tech_ids
    prim, sec = (id1, id2) if TECH_PARAMS[id1]["deployMonths"] <= TECH_PARAMS[id2]["deployMonths"] else (id2, id1)
    cap_prim = round_up_to_unit(load_mw,        TECH_PARAMS[prim]["minUnitMW"])
    cap_sec  = round_up_to_unit(load_mw * 0.3,  TECH_PARAMS[sec]["minUnitMW"])
    return [{"id": prim, "capacityMW": cap_prim}, {"id": sec, "capacityMW": cap_sec}]


# ─── Metrics ──────────────────────────────────────────────────────────────────
def compute_metrics(sized, bridge_months):
    """Compute absolute engineering and cost metrics for a sized portfolio."""
    capex_usd = opex_annual = total_mw = 0
    co2_num = co2_den = avail_num = cf_num = 0
    min_deploy = float("inf")

    for t in sized:
        p = TECH_PARAMS[t["id"]]
        kw = t["capacityMW"] * 1000
        capex_usd   += kw * p["capexPerKw"]
        opex_annual += kw * p["opexPerKwYr"]
        total_mw    += t["capacityMW"]
        co2_num     += t["capacityMW"] * p["capacityFactor"] * p["co2PerKwh"]
        co2_den     += t["capacityMW"] * p["capacityFactor"]
        avail_num   += t["capacityMW"] * p["availability"]
        cf_num      += t["capacityMW"] * p["capacityFactor"]
        min_deploy   = min(min_deploy, p["deployMonths"])

    bridge_opex = opex_annual * (bridge_months / 12)
    total_cost  = capex_usd + bridge_opex

    return {
        "totalCapexM":     round(capex_usd   / 1e6, 1),
        "annualOpexM":     round(opex_annual / 1e6, 1),
        "bridgeOpexM":     round(bridge_opex / 1e6, 1),
        "totalCostM":      round(total_cost  / 1e6, 1),
        "totalCapacityMW": round(total_mw, 0),
        "co2Intensity":    round(co2_num / co2_den, 4) if co2_den > 0 else 0,
        "availability":    round(avail_num / total_mw, 4),
        "capacityFactor":  round(cf_num    / total_mw, 4),
        "deployMonths":    min_deploy,
        "bridgeMonths":    bridge_months,
    }


# ─── Constraint checks ────────────────────────────────────────────────────────
def check_phase_coverage(sized, load_mw, phases):
    """C1: each ramp phase must be coverable by techs deployable by that month."""
    for ph in phases:
        needed    = (ph["pct"] / 100) * load_mw
        available = sum(
            t["capacityMW"] for t in sized
            if TECH_PARAMS[t["id"]]["deployMonths"] <= ph["month"] + 0.5
        )
        if available < needed * 0.95:
            return False, f"Phase month {ph['month']}: needs {needed:.0f} MW, only {available:.0f} MW ready"
    return True, None


def check_constraints(sized, metrics, inst):
    """
    Evaluate all 6 hard constraints. Returns (feasible: bool, flags: dict, reasons: list).
    C2 budget constraint is enforced here as a hard gate.
    """
    flags   = {}
    reasons = []
    budget  = inst.get("budgetM", 0)
    carbon  = inst.get("carbonCapKgPerKwh", 0)
    load_mw = inst["loadMW"]

    # C1 – phase coverage
    ok, reason = check_phase_coverage(sized, load_mw, inst["loadRampPhases"])
    flags["C1_phaseCoverage"] = ok
    if not ok:
        reasons.append(f"C1: {reason}")

    # C2 – budget cap (HARD CONSTRAINT)
    if budget > 0:
        c2_ok = metrics["totalCostM"] <= budget
        flags["C2_budget"] = c2_ok
        if not c2_ok:
            flags["C2_budgetUtilizationPct"] = round(metrics["totalCostM"] / budget * 100, 1)
            reasons.append(f"C2: totalCost ${metrics['totalCostM']}M exceeds budget ${budget}M")
    else:
        flags["C2_budget"] = True  # no budget set → not constrained

    # C3 – carbon cap
    if carbon > 0:
        c3_ok = metrics["co2Intensity"] <= carbon
        flags["C3_carbon"] = c3_ok
        if not c3_ok:
            reasons.append(f"C3: CO₂ {metrics['co2Intensity']} kg/kWh exceeds cap {carbon}")
    else:
        flags["C3_carbon"] = True

    # C4 – user toggle (checked before this function)
    flags["C4_enabled"] = True

    # C5 – max 2 techs (enforced by enumeration)
    flags["C5_maxTechs"] = len(sized) <= 2

    # C6 – capacity adequacy
    c6_ok = metrics["totalCapacityMW"] >= load_mw * 0.99
    flags["C6_capacity"] = c6_ok
    if not c6_ok:
        reasons.append(f"C6: capacity {metrics['totalCapacityMW']} MW < required {load_mw} MW")

    feasible = all(v is True for v in flags.values())
    return feasible, flags, reasons


# ─── Scoring ──────────────────────────────────────────────────────────────────
def score_portfolio(metrics, inst, weights):
    """Compute normalised sub-scores and composite score."""
    grid_wait_max = inst.get("gridWaitMax", 48)
    budget        = inst.get("budgetM", 0)
    carbon_cap    = inst.get("carbonCapKgPerKwh", 0)

    s_speed = max(0, (1 - metrics["deployMonths"] / max(grid_wait_max, 1)) * 100)

    ref_cost = budget * 1.5 if budget > 0 else metrics["totalCostM"] * 2
    s_cost   = max(0, (1 - metrics["totalCostM"] / ref_cost) * 100)

    cap_ref = carbon_cap if carbon_cap > 0 else 0.80
    s_env   = max(0, math.sqrt(max(0, 1 - metrics["co2Intensity"] / cap_ref)) * 100)

    s_res   = ((metrics["availability"] + metrics["capacityFactor"]) / 2) * 100

    composite = (weights["speedToMarket"] * s_speed
               + weights["cost"]          * s_cost
               + weights["environmental"] * s_env
               + weights["resilience"]    * s_res)

    return {
        "speed": round(s_speed),
        "cost":  round(s_cost),
        "env":   round(s_env),
        "res":   round(s_res),
        "composite": round(composite, 2),
    }


# ─── Main solver ──────────────────────────────────────────────────────────────
def solve(instance, top_k=None):
    """
    Solve a power pathway selection instance.

    Parameters
    ----------
    instance : dict   Problem instance (see instance schema)
    top_k    : int    Return only top-k ranked portfolios (None = all)

    Returns
    -------
    dict with keys:
        ranked           : list of feasible portfolios, sorted by composite score
        infeasibleReasons: dict mapping portfolio key → list of violated constraints
    """
    load_mw       = instance["loadMW"]
    phases        = instance["loadRampPhases"]
    grid_wait_min = instance.get("gridWaitMin", 36)
    grid_wait_max = instance.get("gridWaitMax", 54)
    enabled_techs = instance.get("enabledTechs", list(TECH_PARAMS.keys()))
    weights       = instance["weights"]

    bridge_months = round((grid_wait_min + grid_wait_max) / 2)
    infeasible    = {}

    # ── Stage 1: filter by C4 (user toggle) + early C1 (deploy deadline) ──
    latest_phase = max((ph["month"] for ph in phases), default=0)
    feasible_ids = []
    for tid in TECH_PARAMS:
        if tid not in enabled_techs:
            infeasible[tid] = ["Disabled by user (C4)"]
            continue
        if TECH_PARAMS[tid]["deployMonths"] > latest_phase + 6:
            infeasible[tid] = [f"Deploy time ({TECH_PARAMS[tid]['deployMonths']} mo) exceeds all phase deadlines (C1)"]
            continue
        feasible_ids.append(tid)

    # ── Stage 2: enumerate portfolios (C5: ≤ 2 techs) ──
    portfolios = [[t] for t in feasible_ids]
    portfolios += [list(c) for c in combinations(feasible_ids, 2)]

    # ── Stage 3: size → check constraints → score ──
    ranked = []
    for port in portfolios:
        sized   = size_portfolio(port, load_mw)
        metrics = compute_metrics(sized, bridge_months)

        feasible, flags, reasons = check_constraints(sized, metrics, instance)

        budget = instance.get("budgetM", 0)
        budget_util = round(metrics["totalCostM"] / budget * 100, 1) if budget > 0 else None

        if not feasible:
            key = "+".join(t["id"] for t in sized)
            infeasible[key] = reasons
            continue

        scores = score_portfolio(metrics, instance, weights)
        ranked.append({
            "portfolio": sized,
            "composite": round(scores["composite"]),
            "scores":    scores,
            "metrics":   {
                **metrics,
                "budgetUtilizationPct": budget_util,
            },
            "constraintFlags": flags,
        })

    ranked.sort(key=lambda x: x["composite"], reverse=True)

    # Add rank field
    for i, r in enumerate(ranked):
        r["rank"] = i + 1

    if top_k is not None:
        ranked = ranked[:top_k]

    # Only surface single-tech infeasible reasons in the summary (pairs are noisy)
    single_infeasible = {k: v for k, v in infeasible.items() if "+" not in k}

    return {
        "feasible": len(ranked) > 0,
        "ranked": ranked,
        "infeasibleReasons": single_infeasible,
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Power Pathway Optimizer — baseline solver")
    parser.add_argument("instance", help="Path to instance JSON file")
    parser.add_argument("--top", type=int, default=None, help="Return only top-k results")
    parser.add_argument("--out", default=None, help="Write results to JSON file")
    args = parser.parse_args()

    with open(args.instance) as f:
        instance = json.load(f)

    print(f"Solving: {args.instance}")
    print(f"  Load: {instance['loadMW']} MW | Bridge: {instance.get('gridWaitMin')}-{instance.get('gridWaitMax')} months")
    print(f"  Budget: ${instance.get('budgetM', 'unlimited')}M | Carbon cap: {instance.get('carbonCapKgPerKwh', 'none')} kg/kWh\n")

    results = solve(instance, top_k=args.top)

    ranked = results["ranked"]
    if not results["feasible"]:
        print("No feasible solution.")
        print("Per-technology reasons:")
        for k, v in results["infeasibleReasons"].items():
            print(f"  {k}: {'; '.join(v)}")
    else:
        print(f"Found {len(ranked)} feasible portfolio(s):\n")
        for r in ranked:
            techs = " + ".join(f"{t['id']} ({t['capacityMW']} MW)" for t in r["portfolio"])
            m = r["metrics"]
            print(f"  #{r['rank']}  Score: {r['composite']}/100  |  {techs}")
            print(f"      Cost: ${m['totalCostM']}M (CapEx ${m['totalCapexM']}M + OpEx ${m['bridgeOpexM']}M)")
            print(f"      CO₂: {m['co2Intensity']} kg/kWh | Deploy: {m['deployMonths']} mo | CF: {m['capacityFactor']}")
            if m.get("budgetUtilizationPct") is not None:
                print(f"      Budget utilization: {m['budgetUtilizationPct']}%")
            print()

    if args.out:
        with open(args.out, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Results written to {args.out}")


if __name__ == "__main__":
    main()
