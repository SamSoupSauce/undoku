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
});
