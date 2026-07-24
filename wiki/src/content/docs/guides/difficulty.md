---
title: Elimination Metrics & Advanced Difficulty Analytics
description: Mathematical equations, statistical metrics (variance, spread, divergence, suddenness), and difficulty classification tiers.
---

## Candidate Elimination Reasons (`EliminationReasons`)

For every empty cell $(r, c)$, Undoku tracks why digits $1..9$ cannot fit:

| Reason Field | Description | Constraint Type |
|---|---|---|
| `CrossHorizontal` | Number already exists in row $r$ | Row constraint |
| `CrossVertical` | Number already exists in column $c$ | Column constraint |
| `Box3x3` | Number already exists in $3 \times 3$ subgrid | Subgrid constraint |

$$\text{TotalReasons} = \text{CrossHorizontal} + \text{CrossVertical} + \text{Box3x3}$$

---

## Step Score & Aggregate Difficulty Formula

For each deduction step $i$:

$$\text{StepScore}_i = \text{BaseTechniqueWeight} + 0.05 \times (\text{CrossHorizontal}_i + \text{CrossVertical}_i + \text{Box3x3}_i)$$

Where $\text{BaseTechniqueWeight}$ is:
- `1.0` for Naked Single
- `1.5` for Hidden Single (3x3 Box)
- `1.8` for Hidden Single (Row / Column)

Aggregate Score:
$$\text{TotalScore} = \sum_{i=1}^{N} \text{StepScore}_i$$

---

## Advanced Statistical Metrics (`AdvancedMetrics`)

Undoku computes trajectory statistics across all step scores $S_1, S_2, \dots, S_N$:

| Metric | Formula / Definition | Purpose |
|---|---|---|
| **`ScoreSpread`** | $\max(S_i) - \min(S_i)$ | Range of difficulty between easiest and hardest steps |
| **`ScoreVariance`** | $\sigma^2 = \frac{1}{N} \sum_{i=1}^N (S_i - \mu)^2$ | Measure of step difficulty volatility |
| **`ScoreStdDev`** | $\sigma = \sqrt{\sigma^2}$ | Standard deviation of step scores |
| **`ScoreDivergence`** | $\text{MAD} = \frac{1}{N} \sum_{i=1}^N \|S_i - \mu\|$ | Mean Absolute Deviation from average difficulty |
| **`Suddenness`** | $\max_{1 \le i < N} \|S_{i+1} - S_i\|$ | Sharpest step-to-step difficulty jump |
| **`MaxStreak`** | $\max(\text{Consecutive identical techniques})$ | Longest sequence of single-technique deductions |
| **`MostFrequentTechnique`** | $\text{Mode}(\text{Techniques})$ | Technique used most often |
| **`LeastFrequentTechnique`** | $\text{MinFreq}(\text{Techniques})$ | Technique used least often |

---

## Difficulty Classification Tiers

| Aggregate Score Range | Assigned Rating | Target Blanks Range |
|---|---|---|
| $\text{TotalScore} < 45$ | **Easy** | $28 - 35$ blanks |
| $45 \le \text{TotalScore} < 75$ | **Medium** | $36 - 43$ blanks |
| $75 \le \text{TotalScore} < 115$ | **Hard** | $44 - 51$ blanks |
| $\text{TotalScore} \ge 115$ | **Expert** | $52 - 57$ blanks |
