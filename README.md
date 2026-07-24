# Undoku 🧩⚡

**Undoku** is a high-performance Go-based Sudoku puzzle generator, solver, difficulty evaluator, vector SVG renderer, and persistent storage API engine. It generates uniquely solvable Sudoku boards with step-by-step logical deduction provenance and fine-grained difficulty scoring.

[![Documentation Wiki](https://img.shields.io/badge/Wiki-Astro%20Starlight-6366f1?style=for-the-badge&logo=astro)](https://samsoupsauce.github.io/undoku/)
[![GitHub Repository](https://img.shields.io/badge/GitHub-SamSoupSauce%2Fundoku-181717?style=for-the-badge&logo=github)](https://github.com/SamSoupSauce/undoku)

---

## Documentation Wiki 📚

For detailed guides, mathematical formulas, and REST API specifications, explore the [**Undoku Documentation Wiki**](https://samsoupsauce.github.io/undoku/):

- [📖 **Overview & Quick Start**](wiki/src/content/docs/guides/quickstart.md)
- [⚡ **Fast PRNG & Vector Graphics Architecture**](wiki/src/content/docs/guides/architecture.md)
- [🧩 **Deduction & Carving Engine**](wiki/src/content/docs/guides/solver.md)
- [📊 **Elimination Metrics & Advanced Difficulty Analytics**](wiki/src/content/docs/guides/difficulty.md)
- [🗄️ **PostgreSQL & GORM Database Storage**](wiki/src/content/docs/guides/database.md)
- [🔌 **REST API & SVG Graphics Specification**](wiki/src/content/docs/reference/api.md)

---

## Key Features 🚀

- **Fast PRNG Seeding (`FastRand`)**: Custom non-blocking Xorshift64 pseudo-random number generator for high-throughput grid generation.
- **Step-by-Step Animated SVG Export (`SaveAnimatedSVG`)**: Renders and writes keyframed step-by-step solution SVG animations directly to `exports/` on the filesystem.
- **Pure Go Vector SVG Renderer**: Renders resolution-independent SVG vector graphics of board grids, elimination heatmaps, difficulty trajectory curves, and animated step provenance.
- **Detailed Difficulty & Statistical Analytics**:
  - Breakdown by candidate elimination reasons (`cross-horizontal`, `cross-vertical`, `impossible 3x3 square`).
  - Advanced metrics: step score spread, variance, standard deviation, divergence (MAD), suddenness spikes, and technique streaks.
  - Difficulty classification (`Easy`, `Medium`, `Hard`, `Expert`).
- **GORM PostgreSQL & SQLite Persistence**:
  - Production support for PostgreSQL (`POSTGRES_DSN`) with automatic fallback to local SQLite (`undoku.db`).
- **REST API Server**: HTTP endpoints for puzzle generation, listing, detail lookup, and direct SVG vector graphics output.

---

## Directory & Package Structure 📁

```
undoku/
├── exports/           # Step-by-step animated SVG files written to filesystem (e.g. puzzle_1_animated.svg)
├── main.go            # Entry point, HTTP server endpoints, core Sudoku generator & solver
├── main_test.go       # Unit test suite for generator, PRNG, solver, and database operations
├── models/
│   └── puzzle.go      # Board matrix types, elimination reasons, difficulty report, & GORM models
├── render/
│   ├── svg.go         # Pure Go vector SVG renderer & animated filesystem exporter (SaveAnimatedSVG)
│   └── svg_test.go    # Unit tests for SVG renderer and animated SVG exporter
├── storage/
│   └── db.go          # GORM repository layer supporting PostgreSQL and SQLite drivers
├── wiki/              # Astro Starlight documentation wiki site
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

Set `RUN_HTTP_SERVER=true` to launch the HTTP server listening on port `8080`:

```bash
RUN_HTTP_SERVER=true go run main.go
```

### Running the Wiki Locally

```bash
cd wiki
npm run dev
```

---

## REST API & SVG Endpoints 🔌

| Method | Endpoint | Content Type | Description |
|---|---|---|---|
| `POST` | `/api/puzzles/generate` | `application/json` | Generate puzzle, calculate difficulty, save to DB |
| `GET` | `/api/puzzles` | `application/json` | List saved puzzles with rating & pagination filters |
| `GET` | `/api/puzzles/:id` | `application/json` | Get single puzzle record & step deductions |
| `GET` | `/api/puzzles/:id/svg` | `image/svg+xml` | Render Sudoku board vector SVG graphic |
| `GET` | `/api/puzzles/:id/heatmap.svg` | `image/svg+xml` | Render elimination density heatmap SVG |
| `GET` | `/api/puzzles/:id/trajectory.svg` | `image/svg+xml` | Render difficulty step trajectory curve SVG |
| `GET` | `/api/puzzles/:id/animated.svg` | `image/svg+xml` | Render step-by-step animated solution SVG |
