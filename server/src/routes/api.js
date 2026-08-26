const express = require('express');
const { SudokuEngine } = require('../engine/sudoku');
const { Storage } = require('../storage/db');
const {
  renderBoardSVG,
  renderHeatmapSVG,
  renderTrajectorySVG,
  renderAnimatedSVG,
  renderReplaySVG,
  renderInteractivePlayerSVG,
  defaultOptions
} = require('../render/svg');

function createApiRouter(storage) {
  const router = express.Router();

  // POST /api/puzzles/generate
  router.post('/puzzles/generate', (req, res) => {
    try {
      const diffTarget = req.query.difficulty || 'hard';
      let blanksVal = 0;
      if (req.query.blanks) {
        const val = parseInt(req.query.blanks, 10);
        if (!isNaN(val) && val >= 10 && val <= 60) {
          blanksVal = val;
        }
      }

      const { solution, puzzle, report } = SudokuEngine.generateAndAssessPuzzle(diffTarget, blanksVal);
      const recordData = Storage.createRecord(solution, puzzle, report);
      const saved = storage.savePuzzle(recordData);

      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ error: `Failed to generate and assess puzzle: ${err.message}` });
    }
  });

  // GET /api/puzzles
  router.get('/puzzles', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = parseInt(req.query.offset, 10) || 0;
      const rating = req.query.rating || '';

      const puzzles = storage.listPuzzles(limit, offset, rating);
      res.json(puzzles);
    } catch (err) {
      res.status(500).json({ error: `Failed to list puzzles: ${err.message}` });
    }
  });

  // GET /api/puzzles/:id and sub-resources
  router.get('/puzzles/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid puzzle ID' });
      }

      const record = storage.getPuzzleById(id);
      if (!rowMatches(record)) {
        return res.status(404).json({ error: `Puzzle with ID ${id} not found` });
      }

      res.json(record);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper for checking record existence
  function rowMatches(rec) {
    return rec !== null && rec !== undefined;
  }

  // SVG route handlers
  router.get('/puzzles/:id/:svgType', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid puzzle ID' });
      }

      const record = storage.getPuzzleById(id);
      if (!record) {
        return res.status(404).json({ error: `Puzzle with ID ${id} not found` });
      }

      const board = SudokuEngine.stringToBoard(record.board_state);
      const solution = SudokuEngine.stringToBoard(record.solution);
      const report = {
        total_score: record.total_score,
        rating: record.difficulty_rating,
        granular_tier: record.granular_tier,
        reason_counts: {
          cross_horizontal: record.cross_horizontal_reasons,
          cross_vertical: record.cross_vertical_reasons,
          box_3x3: record.box_3x3_reasons,
          total: record.total_reasons
        },
        technique_counts: record.technique_counts || {},
        advanced_metrics: record.advanced_metrics || {},
        metrics_list: record.metrics_list || [],
        step_deductions: record.step_deductions || []
      };

      const svgType = req.params.svgType.toLowerCase();
      res.setHeader('Content-Type', 'image/svg+xml');

      switch (svgType) {
        case 'heatmap.svg':
          return res.send(renderHeatmapSVG(board, report, defaultOptions()));
        case 'trajectory.svg':
          return res.send(renderTrajectorySVG(report, 600, 240));
        case 'animated.svg':
          return res.send(renderAnimatedSVG(board, report, defaultOptions()));
        case 'replay.svg':
          return res.send(renderReplaySVG(solution, board, report, defaultOptions()));
        case 'player.svg':
          return res.send(renderInteractivePlayerSVG(board, solution, report, defaultOptions()));
        case 'svg':
          return res.send(renderBoardSVG(board, defaultOptions()));
        default:
          return res.status(404).send('<svg><text>Unknown SVG endpoint</text></svg>');
      }
    } catch (err) {
      res.status(500).send(`<svg><text>Error: ${err.message}</text></svg>`);
    }
  });

  return router;
}

module.exports = {
  createApiRouter
};
