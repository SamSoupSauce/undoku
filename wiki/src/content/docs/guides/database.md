---
title: PostgreSQL & GORM Database Storage
description: Relational database schema, JSON fields, GORM models, and SQLite fallback.
---

## Database Architecture

Undoku uses **GORM** to provide relational persistence for Sudoku puzzles, solution matrices, candidate elimination metrics, and step-by-step deduction histories.

---

## GORM Schema Model (`PuzzleRecord`)

```go
type PuzzleRecord struct {
	gorm.Model
	Solution               string  `gorm:"type:varchar(81);not null" json:"solution"`
	BoardState             string  `gorm:"type:varchar(81);not null;index" json:"board_state"`
	BlanksCount            int     `gorm:"not null" json:"blanks_count"`
	DifficultyRating       string  `gorm:"type:varchar(32);not null;index" json:"difficulty_rating"`
	TotalScore             float64 `gorm:"type:numeric(10,2);not null" json:"total_score"`
	CrossHorizontalReasons int     `gorm:"not null" json:"cross_horizontal_reasons"`
	CrossVerticalReasons   int     `gorm:"not null" json:"cross_vertical_reasons"`
	Box3x3Reasons          int     `gorm:"not null" json:"box_3x3_reasons"`
	TotalReasons           int     `gorm:"not null" json:"total_reasons"`
	TechniqueCountsJSON    string  `gorm:"type:text" json:"technique_counts_json"`
	DeductionsJSON         string  `gorm:"type:text" json:"deductions_json"`
}
```

---

## Database Drivers & Fallback

### 1. PostgreSQL (Production)
Configured via `POSTGRES_DSN` environment variable:
```bash
POSTGRES_DSN="postgres://user:password@localhost:5432/undoku?sslmode=disable"
```

### 2. SQLite (Development & Testing)
If `POSTGRES_DSN` is empty, GORM automatically initializes a local SQLite file (`undoku.db`) or in-memory database (`:memory:`) with auto-migration.
