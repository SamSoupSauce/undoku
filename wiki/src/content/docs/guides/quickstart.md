---
title: Overview & Quick Start
description: Get started with Undoku engine, Web Canvas app, and Express.js REST API.
---

**Undoku** is a high-performance Sudoku puzzle generator, cognitive solver, difficulty evaluator, Web Canvas game, and Express.js REST API engine. It generates uniquely solvable Sudoku boards with step-by-step logical deduction provenance and fine-grained difficulty scoring.

## Prerequisites

- **Node.js**: Version `18.0+` (LTS recommended)
- **npm**: Version `9.0+`

## Running the Application

### 1. Launch the Web Application & Express.js Server
Launch the unified Express.js server with integrated generator, evaluators, and SVG rendering on port `8080`:

```bash
npm start
# or from server directory:
cd server && npm start
```

Once running, visit `http://localhost:8080` in your browser to play the game!

### 2. Running the Interactive Documentation Wiki Locally
```bash
npm run dev
# or from wiki directory:
cd wiki && npm run dev
```

### 3. Building the Static Deployment Bundle
```bash
npm run build
```

## Running Unit Tests

Run the complete test suite covering the Express.js REST API, SQLite storage layer, SudokuEngine mathematical solver, and SVG vector rendering:

```bash
npm test
```
