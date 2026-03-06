# Optimization Variant

## Formal Formulation

**Problem:** Data Center Power Pathway Selection with Budget Constraint

### Sets

- `T` — set of available technologies, |T| = 7
- `S ⊆ T` — selected technology subset (decision), |S| ≤ 2
- `P` — set of load ramp phases, each with `(month_p, pct_p)`

### Decision Variables

| Variable | Domain | Description |
|---|---|---|
| `x_t ∈ {0,1}` | binary | 1 if technology t is selected |
| `c_t ≥ 0` | continuous (MW) | installed capacity of technology t |

### Parameters (given per instance)

| Symbol | Description |
|---|---|
| `L` | peak load (MW) |
| `B` | budget cap ($M) |
| `K_CO2` | carbon intensity cap (kg CO₂/kWh) |
| `G_min, G_max` | grid wait window (months) |
| `T_p, L_p` | phase p: deadline (months), required load fraction |
| `w_s, w_c, w_e, w_r` | priority weights (sum = 1) |

Per technology t:
| Symbol | Description |
|---|---|
| `δ_t` | deploy time (months) |
| `κ_t` | CapEx ($/kW) |
| `π_t` | annual OpEx ($/kW/yr) |
| `σ_t` | CO₂ intensity (kg/kWh) |
| `f_t` | capacity factor |
| `a_t` | availability |
| `m_t` | minimum unit size (MW) |

### Objective — Maximise composite utility score

```
max  U = w_s · S_speed + w_c · S_cost + w_e · S_env + w_r · S_res
```

where:

```
S_speed = max(0,  1 - δ_min / G_max ) × 100
          δ_min = min_{t: x_t=1} δ_t

S_cost  = max(0,  1 - TotalCost / (1.5 B) ) × 100

S_env   = max(0, sqrt(1 - CO2_blend / K_CO2) ) × 100
          CO2_blend = Σ_t x_t c_t f_t σ_t / Σ_t x_t c_t f_t

S_res   = (Avail_blend + CF_blend) / 2 × 100
          Avail_blend = Σ_t x_t c_t a_t / Σ_t x_t c_t
          CF_blend    = Σ_t x_t c_t f_t / Σ_t x_t c_t
```

### Constraints

**C1 — Phase coverage (timing feasibility)**
```
∀p ∈ P:   Σ_{t: δ_t ≤ T_p + 0.5}  x_t · c_t  ≥  0.95 · L_p · L
```

**C2 — Budget cap (hard constraint)**
```
TotalCost = Σ_t x_t c_t · κ_t / 1000  +  bridgeMonths/12 · Σ_t x_t c_t · π_t / 1000  ≤  B
bridgeMonths = round((G_min + G_max) / 2)
```

**C3 — Carbon intensity cap**
```
CO2_blend ≤ K_CO2      (if K_CO2 > 0)
```

**C4 — User-enabled technologies only**
```
x_t = 0   for all t ∉ enabledTechs
```

**C5 — Maximum portfolio size**
```
Σ_t x_t ≤ 2
```

**C6 — Capacity adequacy**
```
Σ_t x_t · c_t ≥ 0.99 · L
```

**Integrality and bounds**
```
x_t ∈ {0, 1}         ∀t ∈ T
c_t ≥ m_t · x_t      ∀t ∈ T    (minimum unit size)
c_t = 0               if x_t = 0
```

### Problem Classification

- **Type:** Mixed-Integer Nonlinear Program (MINLP)
  - Binary selection variables `x_t`
  - Continuous capacity variables `c_t`
  - Nonlinear objective (sqrt in S_env, ratio in CO2_blend)
- **Complexity:** With |T| = 7 and |S| ≤ 2, the combinatorial search space is small (≤ 28 portfolios). Full enumeration is tractable. The problem scales as a knapsack variant if |T| grows.
- **Multi-attribute:** The objective is a weighted sum of 4 normalised utility scores — classical MAUT (Multi-Attribute Utility Theory) structure.

### Extensions for Future Work

1. **Relax C5:** Allow |S| > 2 → exponential growth, suitable for branch-and-bound or MILP solvers
2. **Robust formulation:** Treat `G_min, G_max` as uncertain → min-max regret or chance constraints
3. **Pareto front:** Replace scalar weights with multi-objective optimisation (speed vs cost vs carbon)
4. **Dynamic sizing:** Allow capacity to vary by phase (staged deployment) → introduces time-indexed variables
5. **MILP relaxation:** Linearise S_env using piecewise approximation → solvable with standard MILP solvers
