---
title: Overview & Quick Start
description: Get started with Undoku Go Sudoku engine and REST API.
---

**Undoku** is a high-performance Go-based Sudoku puzzle generator, solver, difficulty evaluator, and persistent storage API engine. It generates uniquely solvable Sudoku boards with step-by-step logical deduction provenance and fine-grained difficulty scoring.

## Prerequisites

- **Go**: Version `1.22+` or `1.26+`
- **PostgreSQL** (optional for cloud/production DB)

## Running the Application

### 1. CLI Execution / Initializer
Runs sample puzzle generation, prints difficulty evaluations, and initializes the local SQLite database (`undoku.db`):

```bash
go run main.go
```

### 2. REST API Server Mode
Set `RUN_HTTP_SERVER=true` to launch the HTTP web server listening on port `8080`:

```bash
RUN_HTTP_SERVER=true go run main.go
```

### 3. PostgreSQL Database Connection
Pass `POSTGRES_DSN` to connect GORM directly to a PostgreSQL database:

```bash
POSTGRES_DSN="postgres://user:password@localhost:5432/undoku?sslmode=disable" RUN_HTTP_SERVER=true go run main.go
```

## Running Unit Tests

Run the complete test suite covering `FastRand`, `SolveAndEvaluate`, `CarveWithTargetDifficulty`, and GORM storage CRUD operations:

```bash
go test -v ./...
```
