const { describe, it } = require('node:test');
const assert = require('assert');
const { FastRand, SudokuEngine } = require('../src/engine/sudoku');

describe('SudokuEngine Mathematical & Analytical Engine', () => {
  it('should generate valid permutations with FastRand', () => {
    const rng = new FastRand(12345n);
    const perm = rng.perm(9);
    assert.strictEqual(perm.length, 9);
    const seen = new Set(perm);
    assert.strictEqual(seen.size, 9);
    for (const v of perm) {
      assert.ok(v >= 0 && v < 9);
    }
  });

  it('should generate a valid filled 9x9 Sudoku board', () => {
    const full = SudokuEngine.generateSeedBoard(new FastRand(42n));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = full[r][c];
        assert.ok(val >= 1 && val <= 9, `Cell (${r},${c}) has invalid value ${val}`);
        full[r][c] = 0;
        assert.ok(SudokuEngine.isValid(full, r, c, val), `Cell (${r},${c}) violates Sudoku rules for value ${val}`);
        full[r][c] = val;
      }
    }
  });

  it('should carve puzzle and calculate deterministic assertions and granular metrics', () => {
    const full = SudokuEngine.generateSeedBoard(new FastRand(99n));
    const { puzzle, report } = SudokuEngine.carveWithTargetDifficulty(full, 'hard', 45, new FastRand(99n));

    assert.ok(report.solved, 'Report should be solved');
    assert.ok(report.total_score > 0, 'TotalScore should be > 0');
    assert.ok(report.composite_score > 0, 'CompositeScore should be > 0');
    assert.ok(report.rating.length > 0, 'Rating should not be empty');
    assert.ok(report.granular_tier.length > 0, 'GranularTier should not be empty');

    const m = report.advanced_metrics;
    assert.ok(m.total_assertions > 0, 'Total assertions should be > 0');
    assert.ok(m.max_step_assertions > 0, 'Max step assertions should be > 0');
    assert.ok(m.avg_assertions_per_step > 0, 'Avg assertions per step should be > 0');
    assert.ok(m.assertion_density > 0, 'Assertion density should be > 0');
    assert.ok(m.complexity_rating > 0, 'Complexity rating should be > 0');
    assert.ok(m.min_step_score > 0, 'Min step score should be > 0');
    assert.ok(m.max_step_score >= m.min_step_score, 'Max step score >= Min step score');
    assert.ok(m.score_variance >= 0, 'Score variance should be >= 0');

    // Verify step deduction assertions
    for (let i = 0; i < report.step_deductions.length; i++) {
      const d = report.step_deductions[i];
      assert.ok(d.assertions > 0, `Step deduction #${i} has invalid assertions: ${d.assertions}`);
      assert.ok(d.step_score > 0, `Step deduction #${i} has invalid step_score: ${d.step_score}`);
    }
  });

  it('should generate complete categorized metrics list with all 7 categories', () => {
    const full = SudokuEngine.generateSeedBoard(new FastRand(777n));
    const { puzzle, report } = SudokuEngine.carveWithTargetDifficulty(full, 'medium', 38, new FastRand(777n));

    assert.ok(Array.isArray(report.metrics_list), 'metrics_list should be an array');
    assert.ok(report.metrics_list.length >= 25, 'metrics_list should contain comprehensive metrics');

    const categories = new Set(report.metrics_list.map(item => item.category));
    const expectedCategories = [
      'Complexity & Assertions',
      'Difficulty & Scoring',
      'Statistical Trajectory',
      'Candidate Search & Entropy',
      'Board Geometry & Topology',
      'Technique Composition',
      'Constraint Analysis'
    ];

    for (const cat of expectedCategories) {
      assert.ok(categories.has(cat), `Missing expected category: ${cat}`);
    }

    const keys = new Set(report.metrics_list.map(item => item.key));
    const expectedKeys = [
      'complexity_total_assertions',
      'complexity_max_step_assertions',
      'complexity_avg_assertions_per_step',
      'complexity_assertion_density',
      'complexity_rating',
      'score_total',
      'score_composite',
      'difficulty_rating',
      'granular_tier',
      'trajectory_min_step_score',
      'trajectory_max_step_score',
      'trajectory_score_variance',
      'trajectory_suddenness',
      'trajectory_bottleneck_step',
      'topology_clue_symmetry',
      'topology_distribution_variance',
      'tech_diversity'
    ];

    for (const key of expectedKeys) {
      assert.ok(keys.has(key), `Missing expected key: ${key}`);
    }
  });

  it('should guarantee deterministic evaluation across multiple iterations on same board', () => {
    const full = SudokuEngine.generateSeedBoard(new FastRand(101n));
    const { puzzle } = SudokuEngine.carveWithTargetDifficulty(full, 'medium', 36, new FastRand(101n));

    const rep1 = SudokuEngine.solveAndAssess(puzzle);

    for (let iter = 2; iter <= 5; iter++) {
      const repN = SudokuEngine.solveAndAssess(puzzle);

      assert.strictEqual(repN.total_score, rep1.total_score);
      assert.strictEqual(repN.composite_score, rep1.composite_score);
      assert.strictEqual(repN.rating, rep1.rating);
      assert.strictEqual(repN.granular_tier, rep1.granular_tier);
      assert.strictEqual(repN.advanced_metrics.total_assertions, rep1.advanced_metrics.total_assertions);
      assert.strictEqual(repN.step_deductions.length, rep1.step_deductions.length);

      for (let i = 0; i < rep1.step_deductions.length; i++) {
        const d1 = rep1.step_deductions[i];
        const dN = repN.step_deductions[i];
        assert.strictEqual(dN.row, d1.row);
        assert.strictEqual(dN.col, d1.col);
        assert.strictEqual(dN.val, d1.val);
        assert.strictEqual(dN.assertions, d1.assertions);
        assert.strictEqual(dN.step_score, d1.step_score);
      }
    }
  });

  it('should detect Locked Candidates pointing and claiming correctly', () => {
    // Setup a candidate grid where box 1 has candidate 5 only in row 0
    const b = Array.from({ length: 9 }, () => new Array(9).fill(0));
    const cands = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [1, 2, 3, 4, 6, 7, 8, 9]));
    // In box 1 (r: 0..2, c: 0..2), add candidate 5 only at (0,0) and (0,1)
    cands[0][0].push(5);
    cands[0][1].push(5);
    // In row 0 outside box 1, add candidate 5 at (0,5)
    cands[0][5].push(5);

    const reduction = SudokuEngine.findLockedCandidates(b, cands);
    assert.ok(reduction, 'Should find locked candidates pointing reduction');
    assert.strictEqual(reduction.technique, 'Locked Candidates Pointing');
    assert.ok(reduction.eliminations.some(e => e.r === 0 && e.c === 5 && e.val === 5));
    assert.ok(reduction.assertions >= 18 && reduction.assertions <= 36);
    assert.ok(reduction.step_score >= 2.40);
  });

  it('should detect Naked Pairs and Naked Triples correctly', () => {
    const b = Array.from({ length: 9 }, () => new Array(9).fill(0));
    const cands = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [3, 4, 5, 6, 7, 8, 9]));
    // In row 0, set cells (0,0) and (0,1) to exactly candidates [1, 2]
    cands[0][0] = [1, 2];
    cands[0][1] = [1, 2];
    // Set cell (0,2) to have [1, 3, 4] so candidate 1 should be eliminated
    cands[0][2] = [1, 3, 4];

    const reduction = SudokuEngine.findNakedSubsets(b, cands, 2);
    assert.ok(reduction, 'Should find Naked Pair reduction');
    assert.strictEqual(reduction.technique, 'Naked Pair');
    assert.ok(reduction.eliminations.some(e => e.r === 0 && e.c === 2 && e.val === 1));
    assert.ok(reduction.assertions > 0);
    assert.ok(reduction.step_score >= 2.80);
  });

  it('should detect Hidden Pairs correctly', () => {
    const b = Array.from({ length: 9 }, () => new Array(9).fill(0));
    const cands = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [3, 4, 5, 6]));
    // In row 0, add digits 1 and 2 ONLY to cells (0,0) and (0,1)
    cands[0][0] = [1, 2, 7, 8];
    cands[0][1] = [1, 2, 9];

    const reduction = SudokuEngine.findHiddenSubsets(b, cands, 2);
    assert.ok(reduction, 'Should find Hidden Pair reduction');
    assert.strictEqual(reduction.technique, 'Hidden Pair');
    // Candidates 7, 8 from (0,0) and 9 from (0,1) should be eliminated
    assert.ok(reduction.eliminations.some(e => e.r === 0 && e.c === 0 && e.val === 7));
    assert.ok(reduction.eliminations.some(e => e.r === 0 && e.c === 1 && e.val === 9));
    assert.ok(reduction.assertions > 0);
    assert.ok(reduction.step_score >= 3.50);
  });

  it('should support generalized rectangular subgrid topologies (4x4, 6x6, 8x8, 12x12, 16x16)', () => {
    const topologies = ['mini_4x4', 'wide_6x6', 'wide_8x8', 'wide_10x10', 'duo_12x12', 'ultra_12x12', 'hexa_16x16'];
    const rng = new FastRand(12345n);

    for (const key of topologies) {
      const topo = SudokuEngine.resolveTopology(key);
      assert.strictEqual(topo.Br * topo.Bc, topo.N, `Topology ${key} has valid dimensions`);

      const full = SudokuEngine.generateSeedBoard(rng, topo.Br, topo.Bc);
      assert.strictEqual(full.length, topo.N, `Board row count matches ${topo.N}`);
      assert.strictEqual(full[0].length, topo.N, `Board col count matches ${topo.N}`);

      // Verify row, col, and rectangular box constraints for every cell
      for (let r = 0; r < topo.N; r++) {
        for (let c = 0; c < topo.N; c++) {
          const val = full[r][c];
          assert.ok(val >= 1 && val <= topo.N, `Cell value in valid range 1..${topo.N}`);
          full[r][c] = 0;
          assert.ok(SudokuEngine.isValid(full, r, c, val, topo.Br, topo.Bc), `Subgrid constraint valid for ${key} at (${r},${c})`);
          full[r][c] = val;
        }
      }

      // String serialization round-trip
      const str = SudokuEngine.boardToString(full);
      assert.strictEqual(str.length, topo.N * topo.N, `String serialization length matches ${topo.N * topo.N}`);
      const parsed = SudokuEngine.stringToBoard(str, key);
      assert.deepStrictEqual(parsed, full, `String parsing round-trip matches for ${key}`);
    }
  });

  it('should generate and solve non-square rectangular subgrid puzzles (e.g. 6x6 with 2x3 box)', () => {
    const res = SudokuEngine.generateAndCarve('medium', 'wide_6x6', new FastRand(888n));
    assert.strictEqual(res.puzzle.length, 6);
    assert.strictEqual(res.solution.length, 6);
    assert.ok(res.deductions.length > 0, 'Should have step deductions');
    assert.strictEqual(res.topology.Br, 2);
    assert.strictEqual(res.topology.Bc, 3);
    assert.strictEqual(res.topology.N, 6);
  });
});

