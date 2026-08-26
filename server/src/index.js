const path = require('path');
const { Storage } = require('./storage/db');
const { SudokuEngine } = require('./engine/sudoku');
const { saveReplaySVG, saveAnimatedSVG, saveInteractivePlayerSVG } = require('./render/svg');
const { createApp } = require('./app');

function main() {
  const dbPath = process.env.SQLITE_DB || 'undoku.db';
  console.log(`[Storage] Initializing SQLite storage at ${dbPath}...`);
  const storage = new Storage(dbPath);

  // Pre-populate sample puzzles if DB is fresh
  const existing = storage.listPuzzles(1, 0);
  if (existing.length === 0) {
    console.log(`[Init] Generating initial sample puzzles across difficulty tiers...`);
    const diffs = ['easy', 'medium', 'hard'];
    for (const diff of diffs) {
      const { solution, puzzle, report } = SudokuEngine.generateAndAssessPuzzle(diff, 0);
      const recordData = Storage.createRecord(solution, puzzle, report);
      const saved = storage.savePuzzle(recordData);

      console.log(`[Init] Saved ${diff} puzzle (ID: ${saved.id}, Blanks: ${saved.blanks_count}, Rating: ${saved.difficulty_rating}, Tier: ${saved.granular_tier}, Score: ${saved.total_score.toFixed(2)}, Assertions: ${saved.total_assertions})`);

      try {
        const replayPath = saveReplaySVG(solution, puzzle, report, 'exports', `puzzle_${saved.id}_replay.svg`);
        console.log(`[Export] Saved animated replay SVG: ${replayPath}`);

        const animPath = saveAnimatedSVG(puzzle, report, 'exports', `puzzle_${saved.id}_animated.svg`);
        console.log(`[Export] Saved step-by-step animated SVG: ${animPath}`);

        const playerPath = saveInteractivePlayerSVG(puzzle, solution, report, 'exports', `puzzle_${saved.id}_player.svg`);
        console.log(`[Export] Saved interactive player SVG: ${playerPath}`);
      } catch (err) {
        console.warn(`[Export] Warning: Failed to save SVG export: ${err.message}`);
      }
    }
  }

  const app = createApp(storage);
  const port = process.env.PORT || 8080;

  const server = app.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`Undoku Express.js Server running on port ${port}...`);
    console.log(`Endpoints:`);
    console.log(`  GET  http://localhost:${port}/ (Interactive Web Canvas Engine)`);
    console.log(`  POST http://localhost:${port}/api/puzzles/generate?difficulty=hard`);
    console.log(`  POST http://localhost:${port}/api/puzzles/generate?difficulty=easy`);
    console.log(`  GET  http://localhost:${port}/api/puzzles`);
    console.log(`  GET  http://localhost:${port}/api/puzzles/:id`);
    console.log(`  GET  http://localhost:${port}/api/puzzles/:id/replay.svg`);
    console.log(`  GET  http://localhost:${port}/api/puzzles/:id/player.svg`);
    console.log(`======================================================\n`);
  });

  return { app, server, storage };
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
