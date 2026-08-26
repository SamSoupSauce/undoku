---
title: Fast PRNG & Vector Graphics Architecture
description: Technical architecture of Undoku FastRand PRNG, grid generator, and SVG vector renderer.
---

## Fast PRNG Engine (`FastRand`)

Undoku uses a custom **Xorshift64** pseudo-random number generator designed for maximum throughput, reproducibility, and deterministic seeding:

```javascript
class FastRand {
  constructor(seed = null) {
    if (seed === null || seed === undefined) {
      this.state = (BigInt(Date.now()) ^ 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
    } else {
      this.state = BigInt(seed) & 0xFFFFFFFFFFFFFFFFn;
    }
    if (this.state === 0n) this.state = 1n;
  }

  nextUint64() {
    let x = this.state;
    x ^= (x << 13n) & 0xFFFFFFFFFFFFFFFFn;
    x ^= (x >> 7n) & 0xFFFFFFFFFFFFFFFFn;
    x ^= (x << 17n) & 0xFFFFFFFFFFFFFFFFn;
    this.state = x & 0xFFFFFFFFFFFFFFFFn;
    return this.state;
  }
}
```

---

## SVG Vector Renderer (`server/src/render/svg.js`)

Undoku includes a zero-dependency SVG graphics rendering engine for Sudoku boards, elimination heatmaps, and difficulty step curves.

### 1. Board Vector Graphic (`renderBoardSVG`)
- Renders responsive vector SVG graphics (`image/svg+xml`).
- Supports dark mode palette with customizable cell dimensions and subgrid borders.

### 2. Elimination Heatmap (`renderHeatmapSVG`)
- Maps candidate elimination intensity per cell across the $9 \times 9$ matrix.
- Color gradient maps values from cool indigo (`#818cf8`) to warm pink (`#f472b6`).

### 3. Trajectory Line Chart (`renderTrajectorySVG`)
- Generates step-by-step difficulty curves.
- Visually flags step-to-step suddenness spikes along the solution path.

### 4. Interactive SVG Puzzle Player (`renderInteractivePlayerSVG`)
- Renders a fully self-contained, playable Sudoku app inside a single SVG vector graphic.
- Embedded JavaScript and CSS handle cell focus, peer row/col/box highlighting, digit matching, keyboard navigation (`1-9`, `Backspace`, Arrow keys), SVG keypad input, hints (`💡`), reset (`↺`), and victory detection (`🎉 PUZZLE SOLVED!`).
- Generated on the fly via `GET /api/puzzles/:id/player.svg`.

