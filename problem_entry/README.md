# Data Center Power Pathway Selection

A constrained portfolio selection problem for on-site power generation during grid interconnection delays.

## Problem

A data center developer must power a facility (e.g. 100 MW) before utility grid connection is available (typically 2–5 years). They select at most 2 on-site generation technologies, size their capacity, and rank options by a weighted utility score subject to hard constraints.

**Decision variables**
- Which technologies to deploy (subset of up to 2 from a catalogue)
- How much capacity to install (MW) for each

**Constraints**
- C1: Each load ramp phase must be covered by techs deployable by that deadline
- C2: Total cost (CapEx + bridge-period OpEx) ≤ budget
- C3: Blended CO₂ intensity ≤ carbon cap
- C4: Only user-enabled technologies considered
- C5: At most 2 technologies per portfolio
- C6: Total installed capacity ≥ 99% of peak load

**Objective**

```
Score = w1·Speed + w2·Cost + w3·Environmental + w4·Resilience
```

Sub-scores are normalised to [0, 100]. Weights sum to 1.

## Usage

```bash
python baseline_solver.py example_instances/baseline.json
python baseline_solver.py example_instances/baseline.json --top 3 --out results.json
```

```python
from baseline_solver import solve
import json

instance = json.load(open("example_instances/baseline.json"))
results  = solve(instance, top_k=3)

results["feasible"]           # bool — False if no portfolio satisfies all constraints
results["ranked"]             # list sorted by composite score (highest first)
results["infeasibleReasons"]  # per-technology constraint violations
```

## Example instances

| File | Scenario |
|---|---|
| `baseline.json` | 100 MW, balanced weights, $500M budget |
| `tight_budget.json` | 100 MW, cost-priority, $200M budget |
| `green_priority.json` | 50 MW, environmental priority, strict carbon cap |

## Requirements

Python 3.6+, no external dependencies.

## Source

https://github.com/Eric-XC/power-pathway-optimizer
