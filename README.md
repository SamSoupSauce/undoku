# Undoku 🧩⚡

**Undoku** is a high-performance Sudoku puzzle generator, cognitive solver, difficulty evaluator, Web Canvas game, and Express.js REST API engine. It generates uniquely solvable Sudoku boards with step-by-step logical deduction provenance, polar feature spike analytics, and fine-grained difficulty scoring.

[![Documentation Wiki](https://img.shields.io/badge/Wiki-Astro%20Starlight-6366f1?style=for-the-badge&logo=astro)](https://samsoupsauce.github.io/undoku/)
[![GitHub Repository](https://img.shields.io/badge/GitHub-SamSoupSauce%2Fundoku-181717?style=for-the-badge&logo=github)](https://github.com/SamSoupSauce/undoku)

---

## Key Features 🚀

- **HTML5 Web Canvas Gameplay Engine**: High-DPI 60fps Web Canvas engine powering the interactive playable Sudoku board, real-time deduction crosshairs, unsolve reverse-carving animation, particle sparks, and polar feature spike graph.
- **Interactive Web Canvas Homepage**: Full-featured web application served at `/` featuring live gameplay, on-screen keypad, pencil notes mode, solver step playback, and on-demand puzzle generation.
- **Universal Shared Engine (`shared/engine.js`)**: Single source of truth containing PRNG (`FastRand`), grid generator, deterministic logical singles solver, assertion counting, and statistical trajectory calculus.
- **Express.js REST API Server**: Node.js microservice architecture with SQLite persistence and REST API endpoints for serverless testing and backend services.
- **Detailed Difficulty & Statistical Analytics**:
  - Breakdown by candidate elimination reasons (`cross-horizontal`, `cross-vertical`, `3x3 box`).
  - Advanced metrics: step score spread, variance, standard deviation, divergence (MAD), suddenness spikes, and technique streaks.
  - Difficulty classification across 4 canonical ratings and 8 granular challenge tiers.

---

## Directory Structure 📁

```
undoku/
├── shared/            # Universal mathematical & analytical Sudoku engine
│   └── engine.js
├── server/            # Express.js REST API server & database test suite
│   ├── src/
│   │   ├── app.js
│   │   ├── routes/
│   │   ├── storage/
│   │   └── render/
│   └── test/
├── web/               # Web application & canvas interface
│   ├── index.html
│   └── engine.js
├── wiki/              # Astro Starlight documentation wiki
├── scripts/
│   ├── build.js       # Universal static build & bundling pipeline
│   └── deploy.sh      # Static site deployment script for deploy branch
├── package.json
└── README.md
```

---

## Quick Start 🛠️

### Running the Web Server
```bash
npm start
```

### Running Tests
```bash
npm test
```

### Building Static Deployment Bundle
```bash
npm run build
```

### Deploying to GitHub Pages
```bash
npm run deploy
```

---

## REST API Endpoints 🔌

| Method | Endpoint | Content Type | Description |
|---|---|---|---|
| `GET` | `/` | `text/html` | Interactive HTML5 Web Canvas Sudoku engine & visualizer |
| `POST` | `/api/puzzles/generate` | `application/json` | Generate puzzle, calculate difficulty, save to DB |
| `GET` | `/api/puzzles` | `application/json` | List saved puzzles with rating & pagination filters |
| `GET` | `/api/puzzles/:id` | `application/json` | Get single puzzle record & step deductions |
| `GET` | `/api/puzzles/:id/svg` | `image/svg+xml` | Render Sudoku board vector SVG graphic |
| `GET` | `/api/puzzles/:id/heatmap.svg` | `image/svg+xml` | Render elimination density heatmap SVG |
| `GET` | `/api/puzzles/:id/trajectory.svg` | `image/svg+xml` | Render difficulty step trajectory curve SVG |
| `GET` | `/api/puzzles/:id/animated.svg` | `image/svg+xml` | Render step-by-step animated solution SVG |
| `GET` | `/api/puzzles/:id/replay.svg` | `image/svg+xml` | Render full animated SVG replay |
| `GET` | `/api/puzzles/:id/player.svg` | `image/svg+xml` | Render interactive SVG puzzle player |
