---
title: Elimination Metrics & Granular Difficulty Analytics
description: Comprehensive mathematical equations, logical assertion complexity metrics, trajectory analytics, and granular difficulty classification tiers.
---

## 1. Logical Complexity & Assertion Metrics

A core breakthrough in Undoku's difficulty engine is **Assertion Counting**—measuring *how many distinct assertions and proofs must be evaluated to arrive at a definite conclusion about a cell's value*.

| Metric Key | Name | Mathematical Definition | Purpose |
|---|---|---|---|
| `complexity_total_assertions` | **Total Logical Assertions** | $A_{total} = \sum_{i=1}^N A_i$ | Total candidate eliminations and constraint checks executed across the puzzle. |
| `complexity_max_step_assertions` | **Peak Step Assertions** | $A_{max} = \max_{1 \le i \le N} A_i$ | Logical bottleneck: the hardest single deduction in the puzzle. |
| `complexity_avg_assertions_per_step` | **Average Assertions / Step** | $\bar{A} = \frac{A_{total}}{N}$ | Mean cognitive proof burden per step. |
| `complexity_assertion_density` | **Assertion Density** | $D_A = \frac{A_{total}}{\text{BlanksCount}}$ | Assertions required per empty cell. |
| `complexity_rating` | **Composite Complexity Index** | $0.4 \cdot A_{total} + 3.5 \cdot \bar{A} + 0.8 \cdot A_{max}$ | Unified cognitive workload index. |

### Assertion Formulas by Technique

- **Naked Single at cell $(r,c)$**:
  To conclude cell $(r, c) = v$, we assert that all 8 other digits $d \neq v$ are disqualified by row, column, or $3 \times 3$ box peer conflicts:
  $$A_{\text{Naked Single}} = 8 + (\text{CrossHorizontal} + \text{CrossVertical} + \text{Box3x3})$$

- **Hidden Single for digit $v$ in Unit $U$ (Box, Row, or Column)**:
  To deduce that $v$ must be placed at $(r, c) \in U$, we inspect all other $K$ unfilled cells in $U$ and prove why $v$ is blocked by orthogonal constraints, plus target validation and uniqueness:
  $$A_{\text{Hidden Single}} = \sum_{c' \in U \setminus \{(r,c)\}} \text{ConflictAssertions}(c', v) + \text{TargetReasons} + 1$$

---

## 2. Step Score & Multi-Factor Scoring

For each deduction step $i$:

$$\text{StepScore}_i = \text{BaseWeight} + 0.04 \times \text{TotalReasons}_i + 0.02 \times A_i$$

Where $\text{BaseWeight}$ is:
- `1.0` for Naked Single
- `1.5` for Hidden Single (3x3 Box)
- `1.8` for Hidden Single (Row / Column)

$$\text{TotalScore} = \sum_{i=1}^{N} \text{StepScore}_i$$

$$\text{CompositeScore} = 0.6 \cdot \text{TotalScore} + 0.08 \cdot A_{total} + 1.5 \cdot \bar{A} + 2.0 \cdot \sigma^2$$

---

## 3. Statistical Trajectory & Pacing Analytics

Undoku analyzes the sequence of step difficulty scores $S_1, S_2, \dots, S_N$:

| Metric Key | Name | Formula / Definition | Purpose |
|---|---|---|---|
| `trajectory_score_spread` | **Score Spread** | $\max(S_i) - \min(S_i)$ | Dynamic range between easiest and hardest steps. |
| `trajectory_score_variance` | **Score Variance** | $\sigma^2 = \frac{1}{N} \sum_{i=1}^N (S_i - \mu)^2$ | Volatility in deduction difficulty. |
| `trajectory_score_std_dev` | **Standard Deviation** | $\sigma = \sqrt{\sigma^2}$ | Dispersion of step scores. |
| `trajectory_score_divergence` | **Mean Abs Deviation** | $\text{MAD} = \frac{1}{N} \sum_{i=1}^N \|S_i - \mu\|$ | Average deviation from mean difficulty. |
| `trajectory_suddenness` | **Suddenness Jump** | $\max_{1 \le i < N} \|S_{i+1} - S_i\|$ | Sharpest adjacent step difficulty spike. |
| `trajectory_bottleneck_step` | **Bottleneck Step** | $\text{argmax}_{i} (S_i)$ | 1-indexed step where the hardest deduction occurs. |
| `trajectory_pacing_slope` | **Pacing Slope** | $\beta = \frac{\sum (i - \bar{i})(S_i - \bar{S})}{\sum (i - \bar{i})^2}$ | Linear trajectory trend (>0: escalating, <0: easing). |
| `trajectory_difficulty_pacing` | **Pacing Classification** | Categorized by $\beta$ and Suddenness | Flow profile (*Balanced*, *Escalating*, *Front-Loaded*, *Volatile*). |

---

## 4. Candidate Search & Board Topology Metrics

| Metric Key | Category | Formula / Definition | Purpose |
|---|---|---|---|
| `search_avg_candidates` | Search Entropy | $\bar{C} = \frac{1}{N} \sum \text{CandidatesPerCell}$ | Average candidate ambiguity during solve. |
| `search_constrainedness` | Search Entropy | $L = 1.0 - \frac{\text{ClueCount}}{81}$ | Proportion of unsolved board degrees of freedom. |
| `topology_clue_symmetry` | Board Geometry | $\max(S_{180}, S_{horiz}, S_{vert}, S_{diag})$ | Geometric symmetry of initial clues ($1.0 = 100\%$). |
| `topology_distribution_variance` | Board Geometry | $\frac{\text{Var}_{rows} + \text{Var}_{cols} + \text{Var}_{boxes}}{3}$ | Measures clue clustering vs uniform dispersion. |
| `topology_box_congestion` | Board Geometry | $\max_{b} \text{CluesInBox}(b)$ | Peak clue density in any single $3 \times 3$ box. |
| `topology_band_congestion` | Board Geometry | $\max \text{CluesInBand}$ | Peak clue density in any 3-row band or stack. |

---

## 5. Granular Difficulty Classification Tiers

Undoku maps aggregate difficulty to canonical ratings and fine-grained tiers:

| Aggregate Score | Canonical Rating | Granular Difficulty Tier | Typical Blanks Range |
|---|---|---|---|
| $\text{TotalScore} < 30$ | **Easy** | **Easy (Tier 1 - Novice)** | $28 - 31$ blanks |
| $30 \le \text{TotalScore} < 45$ | **Easy** | **Easy (Tier 2 - Beginner)** | $32 - 35$ blanks |
| $45 \le \text{TotalScore} < 60$ | **Medium** | **Medium (Tier 1 - Casual)** | $36 - 39$ blanks |
| $60 \le \text{TotalScore} < 75$ | **Medium** | **Medium (Tier 2 - Intermediate)** | $40 - 43$ blanks |
| $75 \le \text{TotalScore} < 95$ | **Hard** | **Hard (Tier 1 - Advanced)** | $44 - 47$ blanks |
| $95 \le \text{TotalScore} < 115$ | **Hard** | **Hard (Tier 2 - Master)** | $48 - 51$ blanks |
| $115 \le \text{TotalScore} < 140$ | **Expert** | **Expert (Tier 1 - Grandmaster)** | $52 - 54$ blanks |
| $\text{TotalScore} \ge 140$ | **Expert** | **Expert (Tier 2 - Extreme)** | $55 - 57$ blanks |

