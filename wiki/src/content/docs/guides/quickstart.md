---
title: Overview & Quick Start
description: Get started with Undoku Go Sudoku engine and REST API.
---

**Undoku** is a high-performance Go-based Sudoku puzzle generator, solver, difficulty evaluator, and persistent storage API engine. It generates uniquely solvable Sudoku boards with step-by-step logical deduction provenance and fine-grained difficulty scoring.

## Prerequisites

- **Go**: Version `1.22+` or `1.26+`
- **PostgreSQL** (optional for cloud/production DB)

## Running the Application

### 1. Express.js REST API Server (Node.js)
Launch the unified Express.js server with integrated generator, evaluators, and SVG rendering on port `8080`:

```bash
npm start
# or from server directory:
cd server && npm start
```

### 2. Golang Engine & REST API
Runs sample puzzle generation, prints difficulty evaluations, and starts the Go HTTP server on port `8080`:

```bash
RUN_HTTP_SERVER=true go run main.go
```

### 3. PostgreSQL Database Connection
Pass `POSTGRES_DSN` to connect storage directly to PostgreSQL:

```bash
POSTGRES_DSN="postgres://user:password@localhost:5432/undoku?sslmode=disable" RUN_HTTP_SERVER=true go run main.go
```

## Running Unit Tests

Run the complete test suite covering the Express.js server, browser generation engine consistency, Go engine, and SVG vector rendering:

```bash
npm test
```
