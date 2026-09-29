const { describe, it } = require('node:test');
const assert = require('assert');
const { FastRand, SudokuEngine } = require('../src/engine/sudoku');

describe('Difficulty Tuning & Solvable Square Analysis (Diablo Sauce / Ghost Peppers)', () => {
  it('should accurately detect immediate solvable cells (naked and hidden singles)', () => {
    // Construct a simple 4x4 test grid with known singles
    // Row 0: [1, 2, 3, 0] -> (0, 3) must be 4 (naked single)
    // Row 1: [3, 4, 1, 2] -> full
    // Row 2: [2, 0, 4, 1] -> (2, 1) must be 3 (naked single)
    // Row 3: [4, 1, 2, 3] -> full
    const grid4x4 = [
      [1, 2, 3, 0],
      [3, 4, 1, 2],
      [2, 0, 4, 1],
      [4, 1, 2, 3]
    ];

    const solvable = SudokuEngine.getImmediateSolvableCells(grid4x4, 2, 2);
    const count = SudokuEngine.countImmediateSolvable(grid4x4, 2, 2);

    assert.strictEqual(count, 2, 'Should detect exactly 2 solvable cells');
    assert.strictEqual(solvable.length, 2);
    assert.ok(solvable.some(c => c.r === 0 && c.c === 3), 'Cell (0, 3) should be solvable');
    assert.ok(solvable.some(c => c.r === 2 && c.c === 1), 'Cell (2, 1) should be solvable');
  });

  it('should strictly produce 1 to 2 solvable squares on hardest (impossible) 9x9 difficulty across multiple seeds', () => {
    const seeds = [42, 101, 777, 2024, 9999, 12345, 54321, 88888, 31415, 65536];

    for (const seedVal of seeds) {
      const prng = new FastRand(seedVal);
      const res = SudokuEngine.generateAndAssessPuzzle('impossible', 0, 'classic_9x9', prng);

      assert.ok(res.puzzle, `Puzzle must be generated for seed ${seedVal}`);
      assert.ok(res.solution, `Solution must be generated for seed ${seedVal}`);
      assert.ok(res.report.solved, `Puzzle must be solvable by logical engine for seed ${seedVal}`);

      const solvableCount = SudokuEngine.countImmediateSolvable(res.puzzle, 3, 3);

      assert.ok(
        solvableCount === 1 || solvableCount === 2,
        `Seed ${seedVal} on impossible must have strictly 1 or 2 solvable squares, but found ${solvableCount}`
      );

      // Verify unique solution
      const solutions = SudokuEngine.countSolutions(res.puzzle, 2, 3, 3);
      assert.strictEqual(solutions, 1, `Puzzle for seed ${seedVal} must have a unique solution`);

      // Verify immediate_solvable_count metric is populated
      assert.strictEqual(
        res.report.advanced_metrics.immediate_solvable_count,
        solvableCount,
        'Report advanced_metrics.immediate_solvable_count must match calculated count'
      );
    }
  });

  it('should preserve deterministic seed reproducibility on impossible difficulty', () => {
    const seed = 0xDEADBEEF >>> 0;
    const run1 = SudokuEngine.generateAndCarve('impossible', 'classic_9x9', new FastRand(seed));
    const run2 = SudokuEngine.generateAndCarve('impossible', 'classic_9x9', new FastRand(seed));

    assert.deepStrictEqual(run1.puzzle, run2.puzzle, 'Puzzles generated with the same seed must be 100% identical');
    assert.deepStrictEqual(run1.solution, run2.solution, 'Solutions generated with the same seed must be 100% identical');
    assert.strictEqual(run1.deductions.length, run2.deductions.length, 'Deduction step counts must match');

    const solvable1 = SudokuEngine.countImmediateSolvable(run1.puzzle, 3, 3);
    const solvable2 = SudokuEngine.countImmediateSolvable(run2.puzzle, 3, 3);
    assert.strictEqual(solvable1, solvable2);
    assert.ok(solvable1 >= 1 && solvable1 <= 2, `Solvable count must be 1 or 2, got ${solvable1}`);
  });

  it('should maintain clean difficulty progression from easy down to ghost pepper impossible', () => {
    const seed = 42n;

    const easy = SudokuEngine.generateAndAssessPuzzle('easy', 0, 'classic_9x9', new FastRand(seed));
    const medium = SudokuEngine.generateAndAssessPuzzle('medium', 0, 'classic_9x9', new FastRand(seed));
    const hard = SudokuEngine.generateAndAssessPuzzle('hard', 0, 'classic_9x9', new FastRand(seed));
    const extreme = SudokuEngine.generateAndAssessPuzzle('extreme', 0, 'classic_9x9', new FastRand(seed));
    const impossible = SudokuEngine.generateAndAssessPuzzle('impossible', 0, 'classic_9x9', new FastRand(seed));

    const sEasy = SudokuEngine.countImmediateSolvable(easy.puzzle, 3, 3);
    const sMedium = SudokuEngine.countImmediateSolvable(medium.puzzle, 3, 3);
    const sHard = SudokuEngine.countImmediateSolvable(hard.puzzle, 3, 3);
    const sExtreme = SudokuEngine.countImmediateSolvable(extreme.puzzle, 3, 3);
    const sImpossible = SudokuEngine.countImmediateSolvable(impossible.puzzle, 3, 3);

    // Verify impossible has strictly 1-2 solvable squares
    assert.ok(sImpossible === 1 || sImpossible === 2, `Impossible must have 1-2 solvable squares, got ${sImpossible}`);

    // Verify extreme is tight (2-5 solvable squares)
    assert.ok(sExtreme >= 2 && sExtreme <= 5, `Extreme should have 2-5 solvable squares, got ${sExtreme}`);

    // Verify progression: easy has the most starting moves
    assert.ok(sEasy >= 12, `Easy should have plentiful starting moves (>= 12), got ${sEasy}`);
    assert.ok(sEasy > sHard, `Easy (${sEasy}) should have more starting moves than Hard (${sHard})`);
    assert.ok(sHard >= sImpossible, `Hard (${sHard}) should have at least as many starting moves as Impossible (${sImpossible})`);
  });

  it('should detect X-Wing patterns correctly', () => {
    const b = Array.from({ length: 9 }, () => Array(9).fill(0));
    const cands = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [1, 2, 3]));

    // Row 1 and Row 4 have candidate 7 only in Column 1 and Column 5
    cands[1][1] = [7, 2];
    cands[1][5] = [7, 3];
    cands[4][1] = [7, 4];
    cands[4][5] = [7, 5];

    // Other rows have candidate 7 in Column 1 and Column 5
    cands[7][1] = [7, 8];
    cands[8][5] = [7, 9];

    const xwing = SudokuEngine.findXWing(b, cands, 3, 3);
    assert.ok(xwing, 'Should detect X-Wing pattern');
    assert.strictEqual(xwing.type, 'reduction');
    assert.strictEqual(xwing.technique, 'X-Wing');
    assert.ok(xwing.eliminations.length >= 2);
    assert.ok(xwing.eliminations.some(e => e.r === 7 && e.c === 1 && e.val === 7));
    assert.ok(xwing.eliminations.some(e => e.r === 8 && e.c === 5 && e.val === 7));
  });

  it('should purposively require a greater variety of techniques as difficulty increases', () => {
    const easyRes = SudokuEngine.generateAndAssessPuzzle('easy', 0, 'classic_9x9', new FastRand(1234n));
    const medRes = SudokuEngine.generateAndAssessPuzzle('medium', 0, 'classic_9x9', new FastRand(1234n));
    const hardRes = SudokuEngine.generateAndAssessPuzzle('hard', 0, 'classic_9x9', new FastRand(1234n));
    const extRes = SudokuEngine.generateAndAssessPuzzle('extreme', 0, 'classic_9x9', new FastRand(1234n));
    const impRes = SudokuEngine.generateAndAssessPuzzle('impossible', 0, 'classic_9x9', new FastRand(1234n));

    const easyTechs = Object.keys(easyRes.report.technique_counts);
    const medTechs = Object.keys(medRes.report.technique_counts);
    const hardTechs = Object.keys(hardRes.report.technique_counts);
    const extTechs = Object.keys(extRes.report.technique_counts);
    const impTechs = Object.keys(impRes.report.technique_counts);

    // Medium should have at least 2 distinct techniques (e.g. Naked Single + Hidden Single Box)
    assert.ok(medTechs.length >= 2, `Medium should use at least 2 techniques, got ${medTechs.length} (${medTechs.join(', ')})`);

    // Hard should incorporate intermediate techniques (locked candidates or pairs)
    assert.ok(hardTechs.length >= 3, `Hard should use at least 3 techniques, got ${hardTechs.length} (${hardTechs.join(', ')})`);
    assert.ok(hardRes.report.advanced_metrics.technique_diversity > easyRes.report.advanced_metrics.technique_diversity);

    // Extreme and Impossible should exhibit high technique variety (>= 4 distinct techniques)
    assert.ok(extTechs.length >= 4, `Extreme should use at least 4 techniques, got ${extTechs.length} (${extTechs.join(', ')})`);
    assert.ok(impTechs.length >= 4, `Impossible should use at least 4 techniques, got ${impTechs.length} (${impTechs.join(', ')})`);

    // Extreme and Impossible should achieve substantial Shannon entropy diversity
    assert.ok(extRes.report.advanced_metrics.technique_diversity >= 0.45);
    assert.ok(impRes.report.advanced_metrics.technique_diversity >= 0.45);
  });
});
