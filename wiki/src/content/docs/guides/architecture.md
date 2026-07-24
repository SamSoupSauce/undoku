---
title: Fast PRNG & Core Generator Architecture
description: Technical architecture of Undoku FastRand PRNG and grid generation engine.
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

### Advantages over Standard PRNG:
- **Lock-Free Execution**: Standard `rand.Source` calls involve atomic synchronization or mutex locks. `FastRand` operates strictly in local memory.
- **Fast Seed Mixing**: Combines current Unix nanoseconds with golden-ratio constant `0x9E3779B97F4A7C15` to ensure high entropy on seed startup.
- **High-Throughput Permutations**: Used by `Perm(n)` and `Shuffle(n, swap)` during grid filling and position selection.

---

## Full Grid Generation (`FillGrid`)

Grid generation uses randomized depth-first search (DFS) with recursive backtracking:

1. Identify the first empty cell $(r, c)$ with value `0`.
2. Generate a random permutation of numbers `[1..9]` using `s.rng.Perm(9)`.
3. For each candidate number `num`:
   - Validate using `s.IsValid(b, r, c, num)` across row `r`, column `c`, and the $3 \times 3$ box.
   - Assign `b[r][c] = num` and recursively call `s.FillGrid(b)`.
   - If recursive branch fails, revert `b[r][c] = 0` and attempt the next candidate.
4. Return `true` when all 81 cells are validly filled.
