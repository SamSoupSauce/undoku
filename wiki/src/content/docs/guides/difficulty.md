---
title: Elimination Metrics & Difficulty Scoring
description: Detailed mathematical equations, reason tracking, and difficulty classification tiers.
---

## Candidate Elimination Reasons (`EliminationReasons`)

For every empty cell $(r, c)$, Undoku tracks why digits $1..9$ cannot fit:

| Reason Field | Description | Constraint Type |
|---|---|---|
| `CrossHorizontal` | Number already exists in row $r$ | Row constraint |
| `CrossVertical` | Number already exists in column $c$ | Column constraint |
| `Box3x3` | Number already exists in $3 \times 3$ subgrid | Subgrid constraint |

### Reason Metric Total

$$\text{TotalReasons} = \text{CrossHorizontal} + \text{CrossVertical} + \text{Box3x3}$$

---

## Step Score Formula

For each deduction step $i$:

$$\text{StepScore}_i = \text{BaseTechniqueWeight} + 0.05 \times (\text{CrossHorizontal}_i + \text{CrossVertical}_i + \text{Box3x3}_i)$$

Where $\text{BaseTechniqueWeight}$ is:
- `1.0` for Naked Single
- `1.5` for Hidden Single (3x3 Box)
- `1.8` for Hidden Single (Row / Column)

---

## Aggregate Numerical Score

The aggregate difficulty score is the sum of step scores across all required deductions:

$$\text{TotalScore} = \sum_{i=1}^{N} \text{StepScore}_i$$

---

## Difficulty Classification Tiers

| Aggregate Score Range | Assigned Rating | Target Blanks Range |
|---|---|---|
| $\text{TotalScore} < 45$ | **Easy** | $28 - 35$ blanks |
| $45 \le \text{TotalScore} < 75$ | **Medium** | $36 - 43$ blanks |
| $75 \le \text{TotalScore} < 115$ | **Hard** | $44 - 51$ blanks |
| $\text{TotalScore} \ge 115$ | **Expert** | $52 - 57$ blanks |
