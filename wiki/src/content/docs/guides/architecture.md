---
title: Fast PRNG & Vector Graphics Architecture
description: Technical architecture of Undoku FastRand PRNG, grid generator, and pure Go SVG vector renderer.
---

## Fast PRNG Engine (`FastRand`)

Undoku uses a custom **Xorshift64** pseudo-random number generator designed for maximum throughput and zero mutex lock contention:

```go
type FastRand struct {
	state uint64
}

func NewFastRand() *FastRand {
	seed := uint64(time.Now().UnixNano()) ^ 0x9E3779B97F4A7C15
	if seed == 0 {
		seed = 1
	}
	return &FastRand{state: seed}
}
```

---

## Pure Go SVG Vector Renderer (`render/svg.go`)

Undoku includes a zero-dependency SVG graphics rendering engine for Sudoku boards, elimination heatmaps, and difficulty step curves.

### 1. Board Vector Graphic (`RenderBoardSVG`)
- Renders responsive vector SVG graphics (`image/svg+xml`).
- Supports dark mode palette with customizable cell dimensions and subgrid borders.

### 2. Elimination Heatmap (`RenderHeatmapSVG`)
- Maps candidate elimination intensity per cell across the $9 \times 9$ matrix.
- Color gradient maps values from cool indigo (`#818cf8`) to warm pink (`#f472b6`).

### 3. Trajectory Line Chart (`RenderTrajectorySVG`)
- Generates step-by-step difficulty curves.
- Visually flags step-to-step suddenness spikes along the solution path.
