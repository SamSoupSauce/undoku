# Undoku 🧩⚡

**Undoku** is a high-performance Go-based Sudoku puzzle generator, solver, difficulty evaluator, and persistent storage API engine. It generates uniquely solvable Sudoku boards with step-by-step logical deduction provenance and fine-grained difficulty scoring.

---

## Key Features 🚀

- **Fast PRNG Seeding (`FastRand`)**: Custom non-blocking Xorshift64 pseudo-random number generator for high-throughput grid generation and shuffle operations.
- **Logical Carving & Provenance**: Carves puzzle cells iteratively while guaranteeing full logical solvability without guessing.
- **Detailed Difficulty Evaluation**:
  - Breakdown by candidate elimination reasons:
    - **`cross-horizontal`**: Row-level constraints.
    - **`cross-vertical`**: Column-level constraints.
    - **`impossible 3x3 square`**: Subgrid / 3x3 box constraints.
  - Multi-technique logical deduction (Naked Singles, Hidden Singles in Rows/Cols/Boxes).
  - Aggregate numerical scoring and difficulty classification (`Easy`, `Medium`, `Hard`, `Expert`).
- **GORM PostgreSQL & SQLite Persistence**:
  - Stores full solutions, carved puzzle states, difficulty metrics, reason breakdowns, and step deductions.
  - Production support for PostgreSQL (`POSTGRES_DSN`) with automatic fallback to local SQLite (`undoku.db`).
- **REST API Server**: Built-in HTTP server supporting puzzle generation, listing with difficulty filters, and detail lookup.

---

## Directory & Package Structure 📁

```
undoku/
├── main.go            # Entry point, HTTP server endpoints, core Sudoku generator & solver
├── main_test.go       # Unit test suite for generator, PRNG, solver, and database operations
├── models/
│   └── puzzle.go      # Board matrix types, elimination reasons, difficulty report, & GORM models
├── storage/
│   └── db.go          # GORM repository layer supporting PostgreSQL and SQLite drivers
├── go.mod             # Go module definition
├── go.sum             # Go module checksums
└── README.md          # Documentation
```

---

## Quick Start 🛠️

### Running the CLI / Initializer

```bash
go run main.go
```

### Running the REST API Server

Set `RUN_HTTP_SERVER=true` to keep the HTTP server listening on port `8080` (or `PORT` environment variable):

```bash
RUN_HTTP_SERVER=true go run main.go
```

To connect to a PostgreSQL database:

```bash
POSTGRES_DSN="postgres://user:password@localhost:5432/undoku?sslmode=disable" RUN_HTTP_SERVER=true go run main.go
```

### Running Tests

```bash
go test -v ./...
```

---

## REST API Endpoints 🔌

### 1. Generate & Save Puzzle
**`POST /api/puzzles/generate?difficulty={easy|medium|hard|expert}&blanks={28..57}`**

Generates a new Sudoku puzzle, evaluates its logical difficulty and candidate elimination metrics, saves the record to the database, and returns the JSON record.

**Response Example:**
```json
{
  "ID": 1,
  "CreatedAt": "2026-07-24T00:24:41.123-05:00",
  "solution": "653728149129614375471539268...",
  "board_state": ".53.28.4..2.61...54..539..8...",
  "blanks_count": 38,
  "difficulty_rating": "Medium",
  "total_score": 72.40,
  "cross_horizontal_reasons": 246,
  "cross_vertical_reasons": 242,
  "box_3x3_reasons": 242,
  "total_reasons": 730,
  "technique_counts_json": "{\"Naked Single\":38}",
  "deductions_json": "[...]"
}
```

### 2. List Saved Puzzles
**`GET /api/puzzles?rating={Hard|Medium|Easy}&limit=10&offset=0`**

Returns a list of saved puzzle records ordered by creation date.

### 3. Get Puzzle by ID
**`GET /api/puzzles/:id`**

Fetches a single saved puzzle record by its database primary key.
