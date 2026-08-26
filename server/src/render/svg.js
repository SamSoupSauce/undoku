const fs = require('fs');
const path = require('path');

function defaultOptions() {
  return {
    size: 540,
    darkMode: true,
    showValues: true,
    highlightR: -1,
    highlightC: -1
  };
}

/**
 * Render static board SVG
 */
function renderBoardSVG(board, opts = defaultOptions()) {
  const size = (opts && opts.size > 0) ? opts.size : 540;
  const darkMode = opts ? opts.darkMode !== false : true;
  const highlightR = opts && opts.highlightR !== undefined ? opts.highlightR : -1;
  const highlightC = opts && opts.highlightC !== undefined ? opts.highlightC : -1;

  const cellSize = Math.floor(size / 9);
  const actualSize = cellSize * 9;

  let bgColor = "#090d16";
  let gridLineColor = "#1f293d";
  let boxLineColor = "#6366f1";
  let textColorGiven = "#f9fafb";
  let textColorBlank = "#6b7280";
  let cellBgDark = "#0d1322";
  let cellBgAlt = "#111827";

  if (!darkMode) {
    bgColor = "#ffffff";
    gridLineColor = "#e5e7eb";
    boxLineColor = "#4f46e5";
    textColorGiven = "#111827";
    textColorBlank = "#9ca3af";
    cellBgDark = "#f9fafb";
    cellBgAlt = "#f3f4f6";
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${actualSize} ${actualSize}" width="${actualSize}" height="${actualSize}">\n`;
  svg += `<style>\n`;
  svg += `  .num-given { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ${Math.floor(cellSize * 0.55)}px; text-anchor: middle; dominant-baseline: central; fill: ${textColorGiven}; }\n`;
  svg += `  .num-blank { font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-size: ${Math.floor(cellSize * 0.40)}px; text-anchor: middle; dominant-baseline: central; fill: ${textColorBlank}; }\n`;
  svg += `</style>\n`;

  svg += `<rect width="${actualSize}" height="${actualSize}" fill="${bgColor}"/>\n`;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = c * cellSize;
      const y = r * cellSize;
      let bg = cellBgDark;
      if ((Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1) {
        bg = cellBgAlt;
      }
      if (r === highlightR && c === highlightC) {
        bg = "rgba(99, 102, 241, 0.35)";
      }

      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}"/>\n`;

      const val = board[r][c];
      if (val !== 0) {
        const centerX = x + Math.floor(cellSize / 2);
        const centerY = y + Math.floor(cellSize / 2);
        svg += `<text x="${centerX}" y="${centerY}" class="num-given">${val}</text>\n`;
      }
    }
  }

  for (let i = 1; i < 9; i++) {
    if (i % 3 !== 0) {
      const pos = i * cellSize;
      svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${actualSize}" stroke="${gridLineColor}" stroke-width="1"/>\n`;
      svg += `<line x1="0" y1="${pos}" x2="${actualSize}" y2="${pos}" stroke="${gridLineColor}" stroke-width="1"/>\n`;
    }
  }

  for (let i = 0; i <= 9; i += 3) {
    const pos = i * cellSize;
    const w = (i === 0 || i === 9) ? 4 : 3;
    svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${actualSize}" stroke="${boxLineColor}" stroke-width="${w}"/>\n`;
    svg += `<line x1="0" y1="${pos}" x2="${actualSize}" y2="${pos}" stroke="${boxLineColor}" stroke-width="${w}"/>\n`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Render elimination heatmap SVG
 */
function renderHeatmapSVG(board, report, opts = defaultOptions()) {
  const size = (opts && opts.size > 0) ? opts.size : 540;
  const cellSize = Math.floor(size / 9);
  const actualSize = cellSize * 9;

  const cellElims = {};
  let maxElim = 1;
  const deductions = report.step_deductions || [];
  for (const d of deductions) {
    const key = `${d.row},${d.col}`;
    const tot = d.reasons ? (d.reasons.total || (d.reasons.cross_horizontal + d.reasons.cross_vertical + d.reasons.box_3x3)) : 0;
    cellElims[key] = tot;
    if (tot > maxElim) maxElim = tot;
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${actualSize} ${actualSize}" width="${actualSize}" height="${actualSize}">\n`;
  svg += `<style>\n`;
  svg += `  .cell-text { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ${Math.floor(cellSize * 0.40)}px; text-anchor: middle; dominant-baseline: central; fill: #ffffff; }\n`;
  svg += `</style>\n`;
  svg += `<rect width="${actualSize}" height="${actualSize}" fill="#090d16"/>\n`;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = c * cellSize;
      const y = r * cellSize;
      const key = `${r},${c}`;
      const elims = cellElims[key] || 0;

      let opacity = elims > 0 ? 0.2 + (elims / maxElim) * 0.75 : 0.05;
      let color = `rgba(129, 140, 248, ${opacity.toFixed(2)})`;
      if (elims > Math.floor(maxElim * 0.7)) {
        color = `rgba(244, 114, 182, ${opacity.toFixed(2)})`;
      }

      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}"/>\n`;

      const val = board[r][c];
      if (val !== 0) {
        svg += `<text x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="cell-text">${val}</text>\n`;
      } else if (elims > 0) {
        svg += `<text x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="cell-text" opacity="0.8">${elims}</text>\n`;
      }
    }
  }

  for (let i = 0; i <= 9; i += 3) {
    const pos = i * cellSize;
    svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${actualSize}" stroke="#818cf8" stroke-width="3"/>\n`;
    svg += `<line x1="0" y1="${pos}" x2="${actualSize}" y2="${pos}" stroke="#818cf8" stroke-width="3"/>\n`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Render trajectory chart SVG
 */
function renderTrajectorySVG(report, width = 600, height = 240) {
  if (width <= 0) width = 600;
  if (height <= 0) height = 240;

  const padding = 40;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;
  const deductions = report.step_deductions || [];
  const n = deductions.length;

  if (n === 0) {
    return `<svg viewBox="0 0 ${width} ${height}"><text x="50%" y="50%" fill="#fff">No step data</text></svg>`;
  }

  const m = report.advanced_metrics || {};
  let minScore = m.min_step_score !== undefined ? m.min_step_score : deductions[0].step_score;
  let maxScore = m.max_step_score !== undefined ? m.max_step_score : deductions[0].step_score;
  if (maxScore === minScore) maxScore += 1.0;

  const points = [];
  for (let i = 0; i < n; i++) {
    const x = padding + Math.floor((i / (n - 1 || 1)) * chartWidth);
    const normY = (deductions[i].step_score - minScore) / (maxScore - minScore);
    const y = padding + chartHeight - Math.floor(normY * chartHeight);
    points.push(`${x},${y}`);
  }

  const polyPoints = points.join(' ');
  const suddenness = m.suddenness || 0;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
  svg += `<style>\n`;
  svg += `  .axis { stroke: #374151; stroke-width: 1; }\n`;
  svg += `  .line { fill: none; stroke: #818cf8; stroke-width: 3; stroke-linejoin: round; }\n`;
  svg += `  .title { font-family: sans-serif; font-size: 14px; font-weight: bold; fill: #f3f4f6; }\n`;
  svg += `  .label { font-family: sans-serif; font-size: 10px; fill: #9ca3af; }\n`;
  svg += `</style>\n`;
  svg += `<rect width="${width}" height="${height}" fill="#090d16" rx="8"/>\n`;
  svg += `<text x="${padding}" y="24" class="title">Difficulty Step Trajectory (Rating: ${report.rating || "Hard"}, Score: ${(report.total_score || 0).toFixed(2)})</text>\n`;
  svg += `<line x1="${padding}" y1="${padding + chartHeight}" x2="${width - padding}" y2="${padding + chartHeight}" class="axis"/>\n`;
  svg += `<polyline points="${polyPoints}" class="line"/>\n`;

  for (let i = 0; i < points.length; i++) {
    const [cx, cy] = points[i].split(',');
    let color = "#818cf8";
    if (i > 0) {
      const diff = Math.abs(deductions[i].step_score - deductions[i - 1].step_score);
      if (diff >= suddenness * 0.9 && suddenness > 0.1) {
        color = "#f472b6";
      }
    }
    svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="${color}"/>\n`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Render step-by-step animated SVG
 */
function renderAnimatedSVG(board, report, opts = defaultOptions()) {
  const size = (opts && opts.size > 0) ? opts.size : 540;
  const cellSize = Math.floor(size / 9);
  const boardSize = cellSize * 9;
  const totalHeight = boardSize + 70;

  const deductions = report.step_deductions || [];
  const n = deductions.length;
  if (n === 0) return renderBoardSVG(board, opts);

  const durationSec = n * 0.9;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boardSize} ${totalHeight}" width="${boardSize}" height="${totalHeight}">\n`;
  svg += `<style>\n`;
  svg += `  .text-given { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ${Math.floor(cellSize * 0.55)}px; text-anchor: middle; dominant-baseline: central; fill: #f9fafb; }\n`;
  svg += `  .text-step { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ${Math.floor(cellSize * 0.55)}px; text-anchor: middle; dominant-baseline: central; fill: #818cf8; }\n`;
  svg += `  .status-text { font-family: 'Inter', system-ui, sans-serif; font-weight: 600; font-size: 13px; fill: #f3f4f6; }\n`;
  svg += `  .sub-status { font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-size: 11px; fill: #9ca3af; }\n`;

  for (let i = 0; i < n; i++) {
    const startPct = (i / n) * 100.0;
    const activePct = ((i + 1) / n) * 100.0;

    svg += `@keyframes anim-step-${i} {\n`;
    svg += `  0%, ${startPct.toFixed(2)}% { opacity: 0; }\n`;
    svg += `  ${activePct.toFixed(2)}%, 100% { opacity: 1; }\n`;
    svg += `}\n`;

    svg += `@keyframes anim-bg-${i} {\n`;
    svg += `  0%, ${startPct.toFixed(2)}% { fill: #0d1322; }\n`;
    svg += `  ${(startPct + 0.1).toFixed(2)}% { fill: rgba(245, 158, 11, 0.45); }\n`;
    svg += `  ${activePct.toFixed(2)}%, 100% { fill: rgba(99, 102, 241, 0.2); }\n`;
    svg += `}\n`;

    svg += `@keyframes anim-status-${i} {\n`;
    svg += `  0%, ${startPct.toFixed(2)}% { opacity: 0; }\n`;
    svg += `  ${(startPct + 0.05).toFixed(2)}%, ${activePct.toFixed(2)}% { opacity: 1; }\n`;
    svg += `  ${(activePct + 0.05).toFixed(2)}%, 100% { opacity: 0; }\n`;
    svg += `}\n`;

    svg += `.step-val-${i} { animation: anim-step-${i} ${durationSec.toFixed(1)}s infinite; }\n`;
    svg += `.step-bg-${i} { animation: anim-bg-${i} ${durationSec.toFixed(1)}s infinite; }\n`;
    svg += `.step-status-${i} { animation: anim-status-${i} ${durationSec.toFixed(1)}s infinite; }\n`;
  }

  svg += `</style>\n`;
  svg += `<rect width="${boardSize}" height="${totalHeight}" fill="#090d16"/>\n`;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = c * cellSize;
      const y = r * cellSize;
      const bg = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1 ? "#111827" : "#0d1322";
      if (board[r][c] !== 0) {
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}"/>\n`;
        svg += `<text x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="text-given">${board[r][c]}</text>\n`;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const d = deductions[i];
    const x = d.col * cellSize;
    const y = d.row * cellSize;
    svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" class="step-bg-${i}"/>\n`;
    svg += `<text x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="text-step step-val-${i}">${d.val}</text>\n`;
  }

  for (let i = 1; i < 9; i++) {
    if (i % 3 !== 0) {
      const pos = i * cellSize;
      svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="#1f293d" stroke-width="1"/>\n`;
      svg += `<line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="#1f293d" stroke-width="1"/>\n`;
    }
  }
  for (let i = 0; i <= 9; i += 3) {
    const pos = i * cellSize;
    const w = (i === 0 || i === 9) ? 4 : 3;
    svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="#6366f1" stroke-width="${w}"/>\n`;
    svg += `<line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="#6366f1" stroke-width="${w}"/>\n`;
  }

  svg += `<rect x="0" y="${boardSize}" width="${boardSize}" height="70" fill="#0d1322" stroke="#1f293d" stroke-width="1"/>\n`;

  for (let i = 0; i < n; i++) {
    const d = deductions[i];
    svg += `<g class="step-status-${i}">\n`;
    svg += `  <text x="16" y="${boardSize + 26}" class="status-text">Step ${i + 1} / ${n}: [${d.technique}] at (${d.row},${d.col}) = ${d.val}</text>\n`;
    svg += `  <text x="16" y="${boardSize + 48}" class="sub-status">${d.description} (Step Score: ${d.step_score.toFixed(2)})</text>\n`;
    svg += `</g>\n`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Render unsolve -> playthrough replay SVG
 */
function renderReplaySVG(solution, carved, report, opts = defaultOptions()) {
  const size = (opts && opts.size > 0) ? opts.size : 540;
  const cellSize = Math.floor(size / 9);
  const boardSize = cellSize * 9;
  const totalHeight = boardSize + 75;

  const deductions = report.step_deductions || [];
  const n = deductions.length;
  if (n === 0) return renderBoardSVG(carved, opts);

  const showcaseSec = 0.8;
  const unsolveCarveSec = 2.7;
  const unsolveTotalSec = showcaseSec + unsolveCarveSec;
  const stepSec = 0.32;
  const playthroughSec = n * stepSec;
  const victorySec = 2.2;
  const totalSec = unsolveTotalSec + playthroughSec + victorySec;

  const showcasePct = (showcaseSec / totalSec) * 100.0;
  const unsolvePct = (unsolveTotalSec / totalSec) * 100.0;
  const playthroughPct = ((unsolveTotalSec + playthroughSec) / totalSec) * 100.0;

  const blanks = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (carved[r][c] === 0) {
        blanks.push({ r, c, val: solution[r][c] });
      }
    }
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boardSize} ${totalHeight}" width="${boardSize}" height="${totalHeight}">\n`;
  svg += `<style>\n`;
  svg += `  .text-given { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ${Math.floor(cellSize * 0.55)}px; text-anchor: middle; dominant-baseline: central; fill: #f9fafb; }\n`;
  svg += `  .text-unsolve { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ${Math.floor(cellSize * 0.55)}px; text-anchor: middle; dominant-baseline: central; fill: #38bdf8; }\n`;
  svg += `  .text-step { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ${Math.floor(cellSize * 0.55)}px; text-anchor: middle; dominant-baseline: central; fill: #818cf8; }\n`;
  svg += `  .status-text { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: 13px; fill: #f3f4f6; }\n`;
  svg += `  .sub-status { font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-size: 11px; fill: #9ca3af; }\n`;
  svg += `  .status-unsolve { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: 13px; fill: #38bdf8; }\n`;
  svg += `  .status-victory { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: 13px; fill: #fbbf24; }\n`;

  const numBlanks = blanks.length || 1;
  for (let i = 0; i < blanks.length; i++) {
    const b = blanks[i];
    const dissolveStartPct = showcasePct + (i / numBlanks) * (unsolveCarveSec / totalSec) * 100.0 * 0.88;
    let dissolveEndPct = dissolveStartPct + ((unsolveCarveSec / totalSec) * 100.0 * 0.18);
    if (dissolveEndPct > unsolvePct) dissolveEndPct = unsolvePct;

    svg += `@keyframes anim-unsolve-val-${b.r}-${b.c} {\n`;
    svg += `  0%, ${dissolveStartPct.toFixed(2)}% { opacity: 1; transform: scale(1); }\n`;
    svg += `  ${((dissolveStartPct + dissolveEndPct) / 2).toFixed(2)}% { opacity: 0.9; transform: scale(1.3); fill: #f43f5e; }\n`;
    svg += `  ${dissolveEndPct.toFixed(2)}%, 100% { opacity: 0; transform: scale(0.2); }\n`;
    svg += `}\n`;

    svg += `@keyframes anim-unsolve-bg-${b.r}-${b.c} {\n`;
    svg += `  0%, ${dissolveStartPct.toFixed(2)}% { fill: #0d1322; }\n`;
    svg += `  ${((dissolveStartPct + dissolveEndPct) / 2).toFixed(2)}% { fill: rgba(244, 63, 94, 0.45); }\n`;
    svg += `  ${dissolveEndPct.toFixed(2)}%, 100% { fill: #0d1322; }\n`;
    svg += `}\n`;

    svg += `.unsolve-val-${b.r}-${b.c} { animation: anim-unsolve-val-${b.r}-${b.c} ${totalSec.toFixed(1)}s infinite; transform-origin: ${b.c * cellSize + Math.floor(cellSize / 2)}px ${b.r * cellSize + Math.floor(cellSize / 2)}px; }\n`;
    svg += `.unsolve-bg-${b.r}-${b.c} { animation: anim-unsolve-bg-${b.r}-${b.c} ${totalSec.toFixed(1)}s infinite; }\n`;
  }

  for (let i = 0; i < n; i++) {
    const d = deductions[i];
    const stepStartPct = unsolvePct + (i / n) * (playthroughPct - unsolvePct);
    const stepActivePct = unsolvePct + ((i + 1) / n) * (playthroughPct - unsolvePct);
    const stepPeakPct = stepStartPct + (stepActivePct - stepStartPct) * 0.4;

    svg += `@keyframes anim-replay-step-${i} {\n`;
    svg += `  0%, ${stepStartPct.toFixed(2)}% { opacity: 0; transform: scale(0.2); }\n`;
    svg += `  ${stepPeakPct.toFixed(2)}% { opacity: 1; transform: scale(1.35); fill: #fbbf24; }\n`;
    svg += `  ${stepActivePct.toFixed(2)}%, 100% { opacity: 1; transform: scale(1); fill: #818cf8; }\n`;
    svg += `}\n`;

    svg += `@keyframes anim-replay-bg-${i} {\n`;
    svg += `  0%, ${stepStartPct.toFixed(2)}% { fill: #0d1322; }\n`;
    svg += `  ${stepPeakPct.toFixed(2)}% { fill: rgba(245, 158, 11, 0.6); }\n`;
    svg += `  ${stepActivePct.toFixed(2)}%, 100% { fill: rgba(99, 102, 241, 0.2); }\n`;
    svg += `}\n`;

    svg += `@keyframes anim-beam-${i} {\n`;
    svg += `  0%, ${stepStartPct.toFixed(2)}% { opacity: 0; }\n`;
    svg += `  ${(stepStartPct + 0.01).toFixed(2)}%, ${stepActivePct.toFixed(2)}% { opacity: 1; }\n`;
    svg += `  ${(stepActivePct + 0.01).toFixed(2)}%, 100% { opacity: 0; }\n`;
    svg += `}\n`;

    svg += `@keyframes anim-replay-status-${i} {\n`;
    svg += `  0%, ${stepStartPct.toFixed(2)}% { opacity: 0; }\n`;
    svg += `  ${(stepStartPct + 0.01).toFixed(2)}%, ${stepActivePct.toFixed(2)}% { opacity: 1; }\n`;
    svg += `  ${(stepActivePct + 0.01).toFixed(2)}%, 100% { opacity: 0; }\n`;
    svg += `}\n`;

    svg += `.replay-step-val-${i} { animation: anim-replay-step-${i} ${totalSec.toFixed(1)}s infinite; transform-origin: ${d.col * cellSize + Math.floor(cellSize / 2)}px ${d.row * cellSize + Math.floor(cellSize / 2)}px; }\n`;
    svg += `.replay-step-bg-${i} { animation: anim-replay-bg-${i} ${totalSec.toFixed(1)}s infinite; }\n`;
    svg += `.replay-beam-${i} { animation: anim-beam-${i} ${totalSec.toFixed(1)}s infinite; }\n`;
    svg += `.replay-step-status-${i} { animation: anim-replay-status-${i} ${totalSec.toFixed(1)}s infinite; }\n`;
  }

  svg += `@keyframes anim-status-unsolve-phase {\n`;
  svg += `  0%, ${unsolvePct.toFixed(2)}% { opacity: 1; }\n`;
  svg += `  ${(unsolvePct + 0.05).toFixed(2)}%, 100% { opacity: 0; }\n`;
  svg += `}\n`;
  svg += `.status-phase-unsolve { animation: anim-status-unsolve-phase ${totalSec.toFixed(1)}s infinite; }\n`;

  svg += `@keyframes anim-status-victory-phase {\n`;
  svg += `  0%, ${playthroughPct.toFixed(2)}% { opacity: 0; }\n`;
  svg += `  ${(playthroughPct + 0.05).toFixed(2)}%, 100% { opacity: 1; }\n`;
  svg += `}\n`;
  svg += `.status-phase-victory { animation: anim-status-victory-phase ${totalSec.toFixed(1)}s infinite; }\n`;

  svg += `</style>\n`;
  svg += `<rect width="${boardSize}" height="${totalHeight}" fill="#090d16"/>\n`;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = c * cellSize;
      const y = r * cellSize;
      const bg = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1 ? "#111827" : "#0d1322";
      if (carved[r][c] !== 0) {
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}"/>\n`;
        svg += `<text x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="text-given">${carved[r][c]}</text>\n`;
      } else {
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}" class="unsolve-bg-${r}-${c}"/>\n`;
        svg += `<text x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="text-unsolve unsolve-val-${r}-${c}">${solution[r][c]}</text>\n`;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const d = deductions[i];
    const x = d.col * cellSize;
    const y = d.row * cellSize;
    const boxR = Math.floor(d.row / 3) * 3 * cellSize;
    const boxC = Math.floor(d.col / 3) * 3 * cellSize;

    svg += `<g class="replay-beam-${i}">\n`;
    svg += `  <rect x="0" y="${y}" width="${boardSize}" height="${cellSize}" fill="rgba(99, 102, 241, 0.12)"/>\n`;
    svg += `  <line x1="0" y1="${y + Math.floor(cellSize / 2)}" x2="${boardSize}" y2="${y + Math.floor(cellSize / 2)}" stroke="rgba(99, 102, 241, 0.35)" stroke-width="1.5"/>\n`;
    svg += `  <rect x="${x}" y="0" width="${cellSize}" height="${boardSize}" fill="rgba(99, 102, 241, 0.12)"/>\n`;
    svg += `  <line x1="${x + Math.floor(cellSize / 2)}" y1="0" x2="${x + Math.floor(cellSize / 2)}" y2="${boardSize}" stroke="rgba(99, 102, 241, 0.35)" stroke-width="1.5"/>\n`;
    svg += `  <rect x="${boxC}" y="${boxR}" width="${cellSize * 3}" height="${cellSize * 3}" fill="rgba(168, 85, 247, 0.10)" stroke="rgba(168, 85, 247, 0.4)" stroke-width="1.5"/>\n`;
    svg += `</g>\n`;
  }

  for (let i = 0; i < n; i++) {
    const d = deductions[i];
    const x = d.col * cellSize;
    const y = d.row * cellSize;
    svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" class="replay-step-bg-${i}"/>\n`;
    svg += `<text x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="text-step replay-step-val-${i}">${d.val}</text>\n`;
  }

  for (let i = 1; i < 9; i++) {
    if (i % 3 !== 0) {
      const pos = i * cellSize;
      svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="#1f293d" stroke-width="1"/>\n`;
      svg += `<line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="#1f293d" stroke-width="1"/>\n`;
    }
  }
  for (let i = 0; i <= 9; i += 3) {
    const pos = i * cellSize;
    const w = (i === 0 || i === 9) ? 4 : 3;
    svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="#6366f1" stroke-width="${w}"/>\n`;
    svg += `<line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="#6366f1" stroke-width="${w}"/>\n`;
  }

  svg += `<rect x="0" y="${boardSize}" width="${boardSize}" height="75" fill="#0d1322" stroke="#1f293d" stroke-width="1"/>\n`;

  svg += `<g class="status-phase-unsolve">\n`;
  svg += `  <text x="16" y="${boardSize + 26}" class="status-unsolve">⚡ Phase 1: Rapid Unsolving &amp; Carving</text>\n`;
  svg += `  <text x="16" y="${boardSize + 48}" class="sub-status">Carving solved board into ${81 - numBlanks} unique clues (Difficulty: ${report.rating || "Hard"})...</text>\n`;
  svg += `</g>\n`;

  for (let i = 0; i < n; i++) {
    const d = deductions[i];
    const rH = d.reasons ? d.reasons.cross_horizontal || 0 : 0;
    const rV = d.reasons ? d.reasons.cross_vertical || 0 : 0;
    const rB = d.reasons ? d.reasons.box_3x3 || 0 : 0;
    svg += `<g class="replay-step-status-${i}">\n`;
    svg += `  <text x="16" y="${boardSize + 26}" class="status-text">Step ${i + 1} / ${n}: [${d.technique}] at (${d.row},${d.col}) = ${d.val}</text>\n`;
    svg += `  <text x="16" y="${boardSize + 48}" class="sub-status">${d.description} (Score: ${d.step_score.toFixed(2)} | Reasons: ⬌${rH} ⬍${rV} ▦${rB})</text>\n`;
    svg += `</g>\n`;
  }

  svg += `<g class="status-phase-victory">\n`;
  svg += `  <text x="16" y="${boardSize + 26}" class="status-victory">🏆 Victory: Puzzle 100% Logically Proven</text>\n`;
  svg += `  <text x="16" y="${boardSize + 48}" class="sub-status">Rating: ${report.rating || "Hard"} | Total Score: ${(report.total_score || 0).toFixed(2)} | Solved in ${n} steps</text>\n`;
  svg += `</g>\n`;

  svg += `</svg>`;
  return svg;
}

/**
 * Render Interactive SVG Player
 */
function renderInteractivePlayerSVG(board, solution, report, opts = defaultOptions()) {
  const cellSize = 60;
  const boardSize = cellSize * 9; // 540px
  const leftMargin = 30;
  const topHeight = 50;
  const canvasWidth = 600;
  const canvasHeight = 750;
  const keypadY = topHeight + boardSize + 12; // 602px

  const darkMode = opts ? opts.darkMode !== false : true;

  let bgColor = "#090d16";
  let cellBgDark = "#0d1322";
  let cellBgAlt = "#111827";
  let gridLineColor = "#1f293d";
  let boxLineColor = "#6366f1";
  let textColorGiven = "#f9fafb";
  let textColorUser = "#818cf8";
  let textColorMatch = "#c084fc";
  let ghostColor = "#818cf8";
  let btnBg = "#1f293d";
  let btnHover = "#374151";
  let btnText = "#f3f4f6";
  let colorScheme = "dark";

  if (!darkMode) {
    bgColor = "#f8fafc";
    cellBgDark = "#ffffff";
    cellBgAlt = "#f1f5f9";
    gridLineColor = "#e2e8f0";
    boxLineColor = "#4f46e5";
    textColorGiven = "#0f172a";
    textColorUser = "#4f46e5";
    textColorMatch = "#7c3aed";
    ghostColor = "#6366f1";
    btnBg = "#e2e8f0";
    btnHover = "#cbd5e1";
    btnText = "#0f172a";
    colorScheme = "light";
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="100%" height="100%" tabIndex="0" id="undoku-svg-player">\n`;
  svg += `<style>\n`;
  svg += `  :root, #undoku-svg-player { color-scheme: ${colorScheme}; forced-color-adjust: none; outline: none; font-family: 'Inter', system-ui, -apple-system, sans-serif; user-select: none; -webkit-user-select: none; max-width: 600px; max-height: 750px; width: 100%; height: auto; display: block; margin-left: auto; margin-right: 0; }\n`;
  svg += `  .header-title { font-size: 16px; font-weight: 700; fill: ${textColorGiven}; }\n`;
  svg += `  .header-badge { font-size: 12px; font-weight: 600; fill: ${boxLineColor}; }\n`;
  svg += `  .timer-text { font-size: 14px; font-weight: 600; fill: #9ca3af; text-anchor: end; }\n`;
  svg += `  .cell-rect { cursor: pointer; transition: fill 0.15s ease; }\n`;
  svg += `  .cell-rect:hover { fill: ${ghostColor} !important; opacity: 0.85; }\n`;
  svg += `  .text-given { font-size: 33px; font-weight: 700; text-anchor: middle; dominant-baseline: central; fill: ${textColorGiven}; pointer-events: none; }\n`;
  svg += `  .text-user { font-size: 33px; font-weight: 700; text-anchor: middle; dominant-baseline: central; fill: ${textColorUser}; pointer-events: none; }\n`;
  svg += `  .text-match { fill: ${textColorMatch} !important; font-weight: 800 !important; }\n`;
  svg += `  .text-error { fill: #f87171 !important; }\n`;
  svg += `  .btn-bg { fill: ${btnBg}; rx: 8px; cursor: pointer; transition: fill 0.15s ease; }\n`;
  svg += `  .btn-bg:hover { fill: ${btnHover}; }\n`;
  svg += `  .btn-digit-text { font-size: 20px; font-weight: 700; fill: ${btnText}; text-anchor: middle; dominant-baseline: central; pointer-events: none; }\n`;
  svg += `  .btn-action-text { font-size: 14px; font-weight: 700; fill: ${btnText}; text-anchor: middle; dominant-baseline: central; pointer-events: none; }\n`;
  svg += `  .btn-action { fill: ${btnHover}; }\n`;
  svg += `  #svg-keypad { transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); opacity: 1; transform: translateY(${keypadY}px); }\n`;
  svg += `  .keypad-vanish { opacity: 0 !important; transform: translateY(${keypadY + 25}px) scale(0.95) !important; pointer-events: none !important; }\n`;
  svg += `  .status-banner { font-size: 20px; font-weight: 800; fill: #10b981; text-anchor: middle; dominant-baseline: central; transition: opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); opacity: 0; transform: translateY(15px) scale(0.85); pointer-events: none; }\n`;
  svg += `  .status-banner-appear { opacity: 1 !important; transform: translateY(0px) scale(1) !important; }\n`;
  svg += `</style>\n`;

  svg += `<rect width="${canvasWidth}" height="${canvasHeight}" fill="${bgColor}" rx="12"/>\n`;
  svg += `<text x="${leftMargin}" y="30" class="header-title">Undoku 🧩 <tspan class="header-badge">[${report.rating || "Hard"} - Score: ${(report.total_score || 0).toFixed(1)}]</tspan></text>\n`;
  svg += `<text x="${leftMargin + boardSize}" y="30" id="svg-timer" class="timer-text">00:00</text>\n`;

  svg += `<g id="svg-board-cells" transform="translate(${leftMargin}, ${topHeight})">\n`;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = c * cellSize;
      const y = r * cellSize;
      const bg = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1 ? cellBgAlt : cellBgDark;
      const givenVal = board[r][c];
      const solVal = solution[r][c];
      const isGiven = givenVal !== 0;
      const valStr = isGiven ? givenVal.toString() : '';
      const textClass = isGiven ? "text-given" : "text-user";

      svg += `  <g id="cell-${r}-${c}" data-r="${r}" data-c="${c}" data-given="${isGiven}" data-val="${givenVal}" data-sol="${solVal}" onclick="window.undokuSelectCell(${r},${c})">\n`;
      svg += `    <rect id="rect-${r}-${c}" class="cell-rect" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}" stroke="${gridLineColor}" stroke-width="1"/>\n`;
      svg += `    <rect id="match-${r}-${c}" x="${x + 6}" y="${y + 6}" width="${cellSize - 12}" height="${cellSize - 12}" fill="none" stroke="${textColorMatch}" stroke-width="1.5" stroke-dasharray="3,3" rx="6" opacity="0" pointer-events="none"/>\n`;
      svg += `    <text id="text-${r}-${c}" x="${x + Math.floor(cellSize / 2)}" y="${y + Math.floor(cellSize / 2)}" class="${textClass}">${valStr}</text>\n`;
      svg += `  </g>\n`;
    }
  }

  for (let i = 1; i < 9; i++) {
    if (i % 3 !== 0) {
      const pos = i * cellSize;
      svg += `  <line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="${gridLineColor}" stroke-width="1"/>\n`;
      svg += `  <line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="${gridLineColor}" stroke-width="1"/>\n`;
    }
  }
  for (let i = 0; i <= 9; i += 3) {
    const pos = i * cellSize;
    const w = (i === 0 || i === 9) ? 4 : 3;
    svg += `  <line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="${boxLineColor}" stroke-width="${w}"/>\n`;
    svg += `  <line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="${boxLineColor}" stroke-width="${w}"/>\n`;
  }

  svg += `  <line id="vh-ghost-h" x1="0" y1="-100" x2="${boardSize}" y2="-100" stroke="${ghostColor}" stroke-width="2" stroke-dasharray="5,4" opacity="0" pointer-events="none"/>\n`;
  svg += `  <line id="vh-ghost-v" x1="-100" y1="0" x2="-100" y2="${boardSize}" stroke="${ghostColor}" stroke-width="2" stroke-dasharray="5,4" opacity="0" pointer-events="none"/>\n`;
  svg += `  <rect id="active-cell-focus" x="-100" y="-100" width="${cellSize}" height="${cellSize}" fill="none" stroke="${ghostColor}" stroke-width="3" rx="4" opacity="0" pointer-events="none"/>\n`;
  svg += `  <rect id="active-box-focus" x="-100" y="-100" width="${cellSize * 3}" height="${cellSize * 3}" fill="none" stroke="${boxLineColor}" stroke-width="2" stroke-dasharray="6,6" rx="6" opacity="0" pointer-events="none"/>\n`;
  svg += `</g>\n`;

  svg += `<g id="svg-keypad" transform="translate(0, ${keypadY})">\n`;
  const digitBtnW = 54;
  const digitBtnH = 48;
  const digitGap = 6;
  const digitStartX = leftMargin + 3;

  for (let i = 1; i <= 9; i++) {
    const kx = digitStartX + (i - 1) * (digitBtnW + digitGap);
    svg += `  <rect class="btn-bg" x="${kx}" y="0" width="${digitBtnW}" height="${digitBtnH}" onclick="window.undokuInputDigit(${i})"/>\n`;
    svg += `  <text class="btn-digit-text" x="${kx + Math.floor(digitBtnW / 2)}" y="${Math.floor(digitBtnH / 2)}">${i}</text>\n`;
  }

  const actionY = 56;
  const actionBtnW = 168;
  const actionBtnH = 44;
  const actionGap = 15;
  let actX = digitStartX;

  svg += `  <rect class="btn-bg btn-action" x="${actX}" y="${actionY}" width="${actionBtnW}" height="${actionBtnH}" onclick="window.undokuErase()"/>\n`;
  svg += `  <text class="btn-action-text" x="${actX + Math.floor(actionBtnW / 2)}" y="${actionY + Math.floor(actionBtnH / 2)}">⌫ ERASE</text>\n`;

  actX += actionBtnW + actionGap;
  svg += `  <rect class="btn-bg btn-action" x="${actX}" y="${actionY}" width="${actionBtnW}" height="${actionBtnH}" onclick="window.undokuHint()"/>\n`;
  svg += `  <text class="btn-action-text" x="${actX + Math.floor(actionBtnW / 2)}" y="${actionY + Math.floor(actionBtnH / 2)}">💡 HINT</text>\n`;

  actX += actionBtnW + actionGap;
  svg += `  <rect class="btn-bg btn-action" x="${actX}" y="${actionY}" width="${actionBtnW}" height="${actionBtnH}" onclick="window.undokuReset()"/>\n`;
  svg += `  <text class="btn-action-text" x="${actX + Math.floor(actionBtnW / 2)}" y="${actionY + Math.floor(actionBtnH / 2)}">↺ RESET</text>\n`;
  svg += `</g>\n`;

  svg += `<text id="svg-status-banner" x="${Math.floor(canvasWidth / 2)}" y="${keypadY + 45}" class="status-banner">🎉 PUZZLE SOLVED!</text>\n`;

  svg += `<script><![CDATA[\n`;
  svg += `(function() {
    var selR = -1, selC = -1;
    var seconds = 0;
    var timerInterval = null;
    var bgDark = "${cellBgDark}";
    var bgAlt = "${cellBgAlt}";
    var gridStroke = "${gridLineColor}";

    function formatTime(s) {
      var m = Math.floor(s / 60);
      var sec = s % 60;
      return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
    }

    function startTimer() {
      if (!timerInterval) {
        timerInterval = setInterval(function() {
          seconds++;
          var timerEl = document.getElementById('svg-timer');
          if (timerEl) timerEl.textContent = formatTime(seconds);
        }, 1000);
      }
    }

    function highlightBoard() {
      var ghostH = document.getElementById('vh-ghost-h');
      var ghostV = document.getElementById('vh-ghost-v');
      var focusCell = document.getElementById('active-cell-focus');
      var focusBox = document.getElementById('active-box-focus');

      var targetVal = (selR >= 0 && selC >= 0) ? document.getElementById('cell-' + selR + '-' + selC).getAttribute('data-val') : '0';

      if (selR >= 0 && selC >= 0) {
        var cy = selR * 60 + 30;
        var cx = selC * 60 + 30;

        if (ghostH) {
          ghostH.setAttribute('y1', cy);
          ghostH.setAttribute('y2', cy);
          ghostH.setAttribute('opacity', '0.75');
        }
        if (ghostV) {
          ghostV.setAttribute('x1', cx);
          ghostV.setAttribute('x2', cx);
          ghostV.setAttribute('opacity', '0.75');
        }
        if (focusCell) {
          focusCell.setAttribute('x', selC * 60);
          focusCell.setAttribute('y', selR * 60);
          focusCell.setAttribute('opacity', '1');
        }
        if (focusBox) {
          focusBox.setAttribute('x', Math.floor(selC / 3) * 180);
          focusBox.setAttribute('y', Math.floor(selR / 3) * 180);
          focusBox.setAttribute('opacity', '1');
        }
      } else {
        if (ghostH) ghostH.setAttribute('opacity', '0');
        if (ghostV) ghostV.setAttribute('opacity', '0');
        if (focusCell) focusCell.setAttribute('opacity', '0');
        if (focusBox) focusBox.setAttribute('opacity', '0');
      }

      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          var cell = document.getElementById('cell-' + r + '-' + c);
          var rect = document.getElementById('rect-' + r + '-' + c);
          var text = document.getElementById('text-' + r + '-' + c);
          var matchRing = document.getElementById('match-' + r + '-' + c);
          var defaultBg = ((Math.floor(r/3) + Math.floor(c/3)) % 2 === 1) ? bgAlt : bgDark;

          rect.setAttribute('fill', defaultBg);
          rect.setAttribute('stroke', gridStroke);
          rect.setAttribute('stroke-width', '1');

          var val = cell.getAttribute('data-val');

          if (targetVal !== '0' && val === targetVal) {
            text.classList.add('text-match');
            if (matchRing) matchRing.setAttribute('opacity', '1');
          } else {
            text.classList.remove('text-match');
            if (matchRing) matchRing.setAttribute('opacity', '0');
          }
        }
      }
    }

    window.undokuSelectCell = function(r, c) {
      selR = r;
      selC = c;
      highlightBoard();
    };

    window.undokuInputDigit = function(num) {
      if (selR < 0 || selC < 0) return;
      var cell = document.getElementById('cell-' + selR + '-' + selC);
      if (cell.getAttribute('data-given') === 'true') return;

      cell.setAttribute('data-val', num.toString());
      var text = document.getElementById('text-' + selR + '-' + selC);
      text.textContent = num.toString();
      text.classList.remove('text-error');

      highlightBoard();
      checkWinCondition();
    };

    window.undokuErase = function() {
      if (selR < 0 || selC < 0) return;
      var cell = document.getElementById('cell-' + selR + '-' + selC);
      if (cell.getAttribute('data-given') === 'true') return;

      cell.setAttribute('data-val', '0');
      var text = document.getElementById('text-' + selR + '-' + selC);
      text.textContent = '';
      text.classList.remove('text-error');

      highlightBoard();
    };

    window.undokuHint = function() {
      if (selR < 0 || selC < 0) return;
      var cell = document.getElementById('cell-' + selR + '-' + selC);
      if (cell.getAttribute('data-given') === 'true') return;

      var sol = cell.getAttribute('data-sol');
      window.undokuInputDigit(parseInt(sol, 10));
    };

    window.undokuReset = function() {
      var keypad = document.getElementById('svg-keypad');
      if (keypad) keypad.classList.remove('keypad-vanish');

      var banner = document.getElementById('svg-status-banner');
      if (banner) banner.classList.remove('status-banner-appear');

      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          var cell = document.getElementById('cell-' + r + '-' + c);
          if (cell.getAttribute('data-given') !== 'true') {
            cell.setAttribute('data-val', '0');
            var text = document.getElementById('text-' + r + '-' + c);
            text.textContent = '';
            text.classList.remove('text-error');
          }
        }
      }
      selR = -1;
      selC = -1;
      highlightBoard();
    };

    function checkWinCondition() {
      var filled = 0;
      var correct = 0;
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          var cell = document.getElementById('cell-' + r + '-' + c);
          var val = cell.getAttribute('data-val');
          var sol = cell.getAttribute('data-sol');
          if (val !== '0') filled++;
          if (val === sol) correct++;
        }
      }
      if (filled === 81 && correct === 81) {
        var keypad = document.getElementById('svg-keypad');
        if (keypad) keypad.classList.add('keypad-vanish');

        var banner = document.getElementById('svg-status-banner');
        if (banner) banner.classList.add('status-banner-appear');

        if (timerInterval) clearInterval(timerInterval);
        selR = -1;
        selC = -1;
        highlightBoard();
      }
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        selR = -1;
        selC = -1;
        highlightBoard();
        return;
      }
      if (selR < 0 || selC < 0) return;
      if (e.key >= '1' && e.key <= '9') {
        window.undokuInputDigit(parseInt(e.key, 10));
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        window.undokuErase();
      } else if (e.key === 'ArrowUp') {
        selR = (selR + 8) % 9;
        highlightBoard();
      } else if (e.key === 'ArrowDown') {
        selR = (selR + 1) % 9;
        highlightBoard();
      } else if (e.key === 'ArrowLeft') {
        selC = (selC + 8) % 9;
        highlightBoard();
      } else if (e.key === 'ArrowRight') {
        selC = (selC + 1) % 9;
        highlightBoard();
      }
    });

    startTimer();
    highlightBoard();
  })();
  ]]></script>\n`;

  svg += `</svg>`;
  return svg;
}

function saveReplaySVG(solution, carved, report, outputDir = 'exports', filename = 'puzzle_replay.svg') {
  if (!filename.endsWith('.svg')) filename += '.svg';
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const svg = renderReplaySVG(solution, carved, report, defaultOptions());
  fs.writeFileSync(filePath, svg, 'utf8');

  if (fs.existsSync('wiki')) {
    const wikiDir = 'wiki/public';
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, filename), svg, 'utf8');
  }
  return filePath;
}

function saveAnimatedSVG(board, report, outputDir = 'exports', filename = 'puzzle_animated.svg') {
  if (!filename.endsWith('.svg')) filename += '.svg';
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const svg = renderAnimatedSVG(board, report, defaultOptions());
  fs.writeFileSync(filePath, svg, 'utf8');

  if (fs.existsSync('wiki')) {
    const wikiDir = 'wiki/public';
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, filename), svg, 'utf8');
  }
  return filePath;
}

function saveInteractivePlayerSVG(board, solution, report, outputDir = 'exports', filename = 'puzzle_player.svg') {
  if (!filename.endsWith('.svg')) filename += '.svg';
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const svg = renderInteractivePlayerSVG(board, solution, report, defaultOptions());
  fs.writeFileSync(filePath, svg, 'utf8');

  if (fs.existsSync('wiki')) {
    const wikiDir = 'wiki/public';
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, filename), svg, 'utf8');
  }
  return filePath;
}

module.exports = {
  defaultOptions,
  renderBoardSVG,
  renderHeatmapSVG,
  renderTrajectorySVG,
  renderAnimatedSVG,
  renderReplaySVG,
  renderInteractivePlayerSVG,
  saveReplaySVG,
  saveAnimatedSVG,
  saveInteractivePlayerSVG
};
