/**
 * Express Server Sudoku Engine Adapter
 * Imports directly from the universal single-source-of-truth shared engine.
 */
const path = require('path');
const sharedEngine = require(path.resolve(__dirname, '../../../shared/engine.js'));

module.exports = {
  FastRand: sharedEngine.FastRand,
  SudokuEngine: sharedEngine.SudokuEngine
};
