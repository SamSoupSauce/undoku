const Database = require('better-sqlite3');
const { SudokuEngine } = require('../engine/sudoku');

class Storage {
  constructor(dbPath = 'undoku.db') {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS puzzles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        solution VARCHAR(81) NOT NULL,
        board_state VARCHAR(81) NOT NULL,
        blanks_count INTEGER NOT NULL,
        difficulty_rating VARCHAR(32) NOT NULL,
        granular_tier VARCHAR(64),
        total_score NUMERIC(10,2) NOT NULL,
        composite_score NUMERIC(10,2),
        total_assertions INTEGER NOT NULL DEFAULT 0,
        max_step_assertions INTEGER NOT NULL DEFAULT 0,
        score_spread NUMERIC(10,2) NOT NULL,
        score_variance NUMERIC(10,2) NOT NULL,
        suddenness NUMERIC(10,2) NOT NULL,
        max_streak INTEGER NOT NULL,
        cross_horizontal_reasons INTEGER NOT NULL,
        cross_vertical_reasons INTEGER NOT NULL,
        box_3x3_reasons INTEGER NOT NULL,
        total_reasons INTEGER NOT NULL,
        metrics_json TEXT,
        metrics_list_json TEXT,
        technique_counts_json TEXT,
        deductions_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_puzzles_board_state ON puzzles(board_state);
      CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles(difficulty_rating);
    `);
  }

  savePuzzle(record) {
    const stmt = this.db.prepare(`
      INSERT INTO puzzles (
        solution, board_state, blanks_count, difficulty_rating, granular_tier,
        total_score, composite_score, total_assertions, max_step_assertions,
        score_spread, score_variance, suddenness, max_streak,
        cross_horizontal_reasons, cross_vertical_reasons, box_3x3_reasons, total_reasons,
        metrics_json, metrics_list_json, technique_counts_json, deductions_json,
        created_at, updated_at
      ) VALUES (
        @solution, @board_state, @blanks_count, @difficulty_rating, @granular_tier,
        @total_score, @composite_score, @total_assertions, @max_step_assertions,
        @score_spread, @score_variance, @suddenness, @max_streak,
        @cross_horizontal_reasons, @cross_vertical_reasons, @box_3x3_reasons, @total_reasons,
        @metrics_json, @metrics_list_json, @technique_counts_json, @deductions_json,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run({
      solution: record.solution,
      board_state: record.board_state,
      blanks_count: record.blanks_count,
      difficulty_rating: record.difficulty_rating,
      granular_tier: record.granular_tier || '',
      total_score: record.total_score,
      composite_score: record.composite_score || 0,
      total_assertions: record.total_assertions || 0,
      max_step_assertions: record.max_step_assertions || 0,
      score_spread: record.score_spread || 0,
      score_variance: record.score_variance || 0,
      suddenness: record.suddenness || 0,
      max_streak: record.max_streak || 0,
      cross_horizontal_reasons: record.cross_horizontal_reasons || 0,
      cross_vertical_reasons: record.cross_vertical_reasons || 0,
      box_3x3_reasons: record.box_3x3_reasons || 0,
      total_reasons: record.total_reasons || 0,
      metrics_json: typeof record.metrics_json === 'string' ? record.metrics_json : JSON.stringify(record.advanced_metrics || {}),
      metrics_list_json: typeof record.metrics_list_json === 'string' ? record.metrics_list_json : JSON.stringify(record.metrics_list || []),
      technique_counts_json: typeof record.technique_counts_json === 'string' ? record.technique_counts_json : JSON.stringify(record.technique_counts || {}),
      deductions_json: typeof record.deductions_json === 'string' ? record.deductions_json : JSON.stringify(record.step_deductions || [])
    });

    record.id = Number(result.lastInsertRowid);
    record.ID = record.id;
    return record;
  }

  getPuzzleById(id) {
    const stmt = this.db.prepare('SELECT * FROM puzzles WHERE id = ?');
    const row = stmt.get(Number(id));
    if (!row) return null;
    return this._formatRow(row);
  }

  listPuzzles(limit = 10, offset = 0, ratingFilter = '') {
    let sql = 'SELECT * FROM puzzles';
    const params = [];
    if (ratingFilter) {
      sql += ' WHERE difficulty_rating = ?';
      params.push(ratingFilter);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(r => this._formatRow(r));
  }

  deletePuzzleById(id) {
    const stmt = this.db.prepare('DELETE FROM puzzles WHERE id = ?');
    return stmt.run(Number(id));
  }

  _formatRow(row) {
    const record = { ...row };
    record.ID = row.id;
    record.advanced_metrics = row.metrics_json ? JSON.parse(row.metrics_json) : {};
    record.metrics_list = row.metrics_list_json ? JSON.parse(row.metrics_list_json) : [];
    record.technique_counts = row.technique_counts_json ? JSON.parse(row.technique_counts_json) : {};
    record.step_deductions = row.deductions_json ? JSON.parse(row.deductions_json) : [];
    record.metrics = record.advanced_metrics;
    return record;
  }

  static createRecord(full, puzzle, report) {
    SudokuEngine.calculateMetricsWithBoard(report, puzzle);
    const blanks = puzzle.reduce((acc, row) => acc + row.filter(c => c === 0).length, 0);
    const m = report.advanced_metrics || {};

    return {
      solution: SudokuEngine.boardToString(full),
      board_state: SudokuEngine.boardToString(puzzle),
      blanks_count: blanks,
      difficulty_rating: report.rating,
      granular_tier: report.granular_tier || m.granular_tier,
      total_score: report.total_score,
      composite_score: report.composite_score || m.composite_score || 0,
      total_assertions: m.total_assertions || 0,
      max_step_assertions: m.max_step_assertions || 0,
      score_spread: m.score_spread || 0,
      score_variance: m.score_variance || 0,
      suddenness: m.suddenness || 0,
      max_streak: m.max_streak || 0,
      cross_horizontal_reasons: report.reason_counts.cross_horizontal || 0,
      cross_vertical_reasons: report.reason_counts.cross_vertical || 0,
      box_3x3_reasons: report.reason_counts.box_3x3 || 0,
      total_reasons: (report.reason_counts.cross_horizontal || 0) + (report.reason_counts.cross_vertical || 0) + (report.reason_counts.box_3x3 || 0),
      metrics_json: JSON.stringify(m),
      metrics_list_json: JSON.stringify(report.metrics_list || []),
      technique_counts_json: JSON.stringify(report.technique_counts || {}),
      deductions_json: JSON.stringify(report.step_deductions || []),
      advanced_metrics: m,
      metrics_list: report.metrics_list,
      technique_counts: report.technique_counts,
      step_deductions: report.step_deductions
    };
  }
}

module.exports = {
  Storage
};
