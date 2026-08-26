const { describe, it, before } = require('node:test');
const assert = require('assert');
const { SudokuEngine, FastRand } = require('../src/engine/sudoku');
const {
  renderBoardSVG,
  renderHeatmapSVG,
  renderTrajectorySVG,
  renderAnimatedSVG,
  renderReplaySVG,
  renderInteractivePlayerSVG,
  defaultOptions
} = require('../src/render/svg');

describe('SVG Vector Rendering Suite', () => {
  let solution, puzzle, report;

  before(() => {
    const res = SudokuEngine.generateAndAssessPuzzle('medium', 36, new FastRand(456n));
    solution = res.solution;
    puzzle = res.puzzle;
    report = res.report;
  });

  it('should render valid static board SVG', () => {
    const svg = renderBoardSVG(puzzle, defaultOptions());
    assert.ok(svg.startsWith('<svg'), 'Should start with <svg');
    assert.ok(svg.includes('class="num-given"'), 'Should contain num-given class');
    assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
  });

  it('should render valid elimination heatmap SVG', () => {
    const svg = renderHeatmapSVG(puzzle, report, defaultOptions());
    assert.ok(svg.includes('class="cell-text"'), 'Should contain cell-text class');
    assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
  });

  it('should render valid difficulty trajectory SVG', () => {
    const svg = renderTrajectorySVG(report, 600, 240);
    assert.ok(svg.includes('class="line"'), 'Should contain polyline');
    assert.ok(svg.includes('Difficulty Step Trajectory'), 'Should contain title');
    assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
  });

  it('should render valid animated step SVG', () => {
    const svg = renderAnimatedSVG(puzzle, report, defaultOptions());
    assert.ok(svg.includes('@keyframes anim-step-0'), 'Should contain keyframes');
    assert.ok(svg.includes('class="status-text"'), 'Should contain status-text');
    assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
  });

  it('should render valid unsolve and playthrough replay SVG', () => {
    const svg = renderReplaySVG(solution, puzzle, report, defaultOptions());
    assert.ok(svg.includes('anim-unsolve-val'), 'Should contain unsolve animation');
    assert.ok(svg.includes('replay-beam'), 'Should contain replay scanning beams');
    assert.ok(svg.includes('status-victory'), 'Should contain victory celebration');
    assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
  });

  it('should render valid interactive SVG player with embedded JS', () => {
    const svg = renderInteractivePlayerSVG(puzzle, solution, report, defaultOptions());
    assert.ok(svg.includes('id="undoku-svg-player"'), 'Should contain player root ID');
    assert.ok(svg.includes('window.undokuInputDigit'), 'Should contain embedded JS input handler');
    assert.ok(svg.includes('id="svg-keypad"'), 'Should contain keypad group');
    assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
  });
});
