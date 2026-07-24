---
title: Deduction & Carving Engine
description: Provenance carving, logical solvability, and deduction techniques in Undoku.
---

## Logical Carving (`CarveWithTargetDifficulty`)

The carving algorithm transforms a full $9 \times 9$ Sudoku solution board into a playable puzzle with guaranteed logical solvability.

### Carving Workflow

1. Generate a full solution board `fullBoard`.
2. Shuffle all 81 grid cell positions `(0,0)` to `(8,8)`.
3. For each candidate position $p = (r, c)$:
   - Temporarily set `puzzle[p.r][p.c] = 0`.
   - Execute `SolveAndEvaluate(puzzle)` to test whether the puzzle remains 100% logically solvable from the current state.
   - If solvable, accept the carve step and proceed recursively until `targetBlanks` count is reached.
   - If unsolvable by logical singles, revert `puzzle[p.r][p.c] = origVal` and try the next position.

---

## Logical Deduction Techniques

Undoku evaluates puzzles using human-like logical deduction strategies:

### 1. Naked Single
- **Condition**: A single empty cell $(r, c)$ has exactly 1 valid candidate remaining after evaluating row, column, and $3 \times 3$ box constraints.
- **Base Score**: `1.0`

### 2. Hidden Single in $3 \times 3$ Box
- **Condition**: Within a $3 \times 3$ subgrid, a specific digit `num` can only fit in cell $(r, c)$, even if other candidate digits are present.
- **Base Score**: `1.5`

### 3. Hidden Single in Row / Column
- **Condition**: Within row $r$ or column $c$, digit `num` fits in only one cell $(r, c)$.
- **Base Score**: `1.8`
