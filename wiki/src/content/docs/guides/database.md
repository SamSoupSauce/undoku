---
title: SQLite Database & Serverless Storage
description: Relational database schema, JSON fields, and SQLite persistence for the Express backend.
---

## Database Architecture

Undoku's Express.js testing and serverless backend uses SQLite (`better-sqlite3`) to provide persistence for Sudoku puzzles, solution matrices, candidate elimination metrics, and step-by-step deduction histories.

---

## Schema Model (`puzzles` table)

```sql
CREATE TABLE IF NOT EXISTS puzzles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solution TEXT NOT NULL,
  board_state TEXT NOT NULL,
  blanks_count INTEGER NOT NULL,
  difficulty_rating TEXT NOT NULL,
  granular_tier TEXT NOT NULL,
  total_score REAL NOT NULL,
  composite_score REAL NOT NULL,
  cross_horizontal_reasons INTEGER NOT NULL,
  cross_vertical_reasons INTEGER NOT NULL,
  box_3x3_reasons INTEGER NOT NULL,
  total_reasons INTEGER NOT NULL,
  technique_counts_json TEXT NOT NULL,
  deductions_json TEXT NOT NULL,
  advanced_metrics_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Storage Layer (`server/src/storage/db.js`)

The `DatabaseStorage` class provides:
- **`savePuzzle(puzzleRecord)`**: Saves evaluated puzzles and serializes step deductions to JSON.
- **`getPuzzle(id)`**: Fetches full puzzle record and reconstructs deductions matrix.
- **`listPuzzles(filters)`**: Supports pagination (`limit`, `offset`) and difficulty filtering (`rating`).
- **In-Memory Testing Support**: Accepts `:memory:` for ephemeral test runs.
