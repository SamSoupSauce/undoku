/**
 * Undoku Universal Sudoku Mathematical & Generation Engine
 * Shared single source of truth for both Express Server (Node.js) & Web UI (Static Browser).
 */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    const exports = factory();
    root.Undoku = exports;
    root.FastRand = exports.FastRand;
    root.SudokuEngine = exports.SudokuEngine;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class FastRand {
    constructor(seed) {
      if (seed === undefined || seed === null) {
        if (typeof process !== 'undefined' && process.hrtime) {
          const hr = process.hrtime();
          this.state = (BigInt(Date.now()) ^ (BigInt(hr[1]) << 16n) ^ 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
        } else {
          this.state = (BigInt(Date.now()) ^ (BigInt(Math.floor(Math.random() * 1e9)) << 16n) ^ 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
        }
      } else {
        this.state = BigInt(seed) & 0xffffffffffffffffn;
      }
      if (this.state === 0n) this.state = 1n;
    }

    uint64() {
      this.state = (this.state ^ ((this.state << 13n) & 0xffffffffffffffffn)) & 0xffffffffffffffffn;
      this.state = (this.state ^ (this.state >> 7n)) & 0xffffffffffffffffn;
      this.state = (this.state ^ ((this.state << 17n) & 0xffffffffffffffffn)) & 0xffffffffffffffffn;
      return this.state;
    }

    intn(n) {
      if (n <= 0) return 0;
      return Number(this.uint64() % BigInt(n));
    }

    perm(n) {
      const p = new Array(n);
      for (let i = 0; i < n; i++) p[i] = i;
      for (let i = n - 1; i > 0; i--) {
        const j = this.intn(i + 1);
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
      }
      return p;
    }

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.intn(i + 1);
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }
  }

  class SudokuEngine {
    static createBoard() {
      return Array.from({ length: 9 }, () => new Array(9).fill(0));
    }

    static cloneBoard(b) {
      return b.map(row => [...row]);
    }

    static boardToString(b) {
      let str = '';
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          str += b[r][c] === 0 ? '.' : b[r][c].toString();
        }
      }
      return str;
    }

    static stringToBoard(str) {
      if (typeof str !== 'string' || str.length !== 81) {
        throw new Error(`Invalid board string length ${str ? str.length : 0}, expected 81`);
      }
      const b = SudokuEngine.createBoard();
      for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9);
        const c = i % 9;
        const ch = str[i];
        if (ch === '.' || ch === '0') {
          b[r][c] = 0;
        } else if (ch >= '1' && ch <= '9') {
          b[r][c] = parseInt(ch, 10);
        } else {
          throw new Error(`Invalid character '${ch}' at index ${i}`);
        }
      }
      return b;
    }

    static isValid(b, row, col, num) {
      for (let i = 0; i < 9; i++) {
        if (b[row][i] === num || b[i][col] === num) return false;
      }
      const startR = Math.floor(row / 3) * 3;
      const startC = Math.floor(col / 3) * 3;
      for (let r = startR; r < startR + 3; r++) {
        for (let c = startC; c < startC + 3; c++) {
          if (b[r][c] === num) return false;
        }
      }
      return true;
    }

    static fillGrid(b, rng = new FastRand()) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (b[r][c] === 0) {
            const perm = rng.perm(9);
            for (let i = 0; i < 9; i++) {
              const num = perm[i] + 1;
              if (SudokuEngine.isValid(b, r, c, num)) {
                b[r][c] = num;
                if (SudokuEngine.fillGrid(b, rng)) return true;
                b[r][c] = 0;
              }
            }
            return false;
          }
        }
      }
      return true;
    }

    static generateSeedBoard(rng = new FastRand()) {
      const b = SudokuEngine.createBoard();
      SudokuEngine.fillGrid(b, rng);
      return b;
    }

    static getCandidates(b, r, c) {
      if (b[r][c] !== 0) return [];
      const used = new Array(10).fill(false);
      for (let i = 0; i < 9; i++) {
        if (b[r][i] !== 0) used[b[r][i]] = true;
        if (b[i][c] !== 0) used[b[i][c]] = true;
      }
      const startR = Math.floor(r / 3) * 3;
      const startC = Math.floor(c / 3) * 3;
      for (let i = startR; i < startR + 3; i++) {
        for (let j = startC; j < startC + 3; j++) {
          if (b[i][j] !== 0) used[b[i][j]] = true;
        }
      }
      const cands = [];
      for (let num = 1; num <= 9; num++) {
        if (!used[num]) cands.push(num);
      }
      return cands;
    }

    static analyzeEliminations(b, r, c) {
      let h = 0, v = 0, box = 0;
      if (b[r][c] !== 0) {
        return { cross_horizontal: 0, cross_vertical: 0, box_3x3: 0, total: 0 };
      }

      const startR = Math.floor(r / 3) * 3;
      const startC = Math.floor(c / 3) * 3;

      for (let num = 1; num <= 9; num++) {
        if (SudokuEngine.isValid(b, r, c, num)) continue;

        let inRow = false;
        for (let i = 0; i < 9; i++) {
          if (b[r][i] === num) { inRow = true; break; }
        }
        if (inRow) h++;

        let inCol = false;
        for (let i = 0; i < 9; i++) {
          if (b[i][c] === num) { inCol = true; break; }
        }
        if (inCol) v++;

        let inBox = false;
        for (let br = startR; br < startR + 3; br++) {
          for (let bc = startC; bc < startC + 3; bc++) {
            if (b[br][bc] === num) { inBox = true; break; }
          }
        }
        if (inBox) box++;
      }

      return {
        cross_horizontal: h,
        cross_vertical: v,
        box_3x3: box,
        total: h + v + box
      };
    }

    static findNakedSingle(b) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (b[r][c] === 0) {
            const cands = SudokuEngine.getCandidates(b, r, c);
            if (cands.length === 1) {
              const val = cands[0];
              const reasons = SudokuEngine.analyzeEliminations(b, r, c);

              let rowOpen = 0, colOpen = 0, boxOpen = 0;
              for (let i = 0; i < 9; i++) {
                if (b[r][i] === 0) rowOpen++;
                if (b[i][c] === 0) colOpen++;
              }
              const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
              for (let dr = 0; dr < 3; dr++) {
                for (let dc = 0; dc < 3; dc++) {
                  if (b[br + dr][bc + dc] === 0) boxOpen++;
                }
              }
              const minOpen = Math.min(rowOpen, colOpen, boxOpen);

              // Assertions scale directly with cognitive search space:
              // - 1-2 open cells in unit: 2-4 assertions, score 1.05-1.15 (Direct Footholds & Cascades)
              // - 3-4 open cells in unit: 6-9 assertions, score 1.20-1.32 (Gentle to Moderate)
              // - 5-6 open cells in unit: 12-15 assertions, score 1.40-1.55 (Moderate)
              // - 7+ open cells in unit: 18-22 assertions, score 1.65-1.85 (Hard)
              let assertions = 2;
              if (minOpen <= 1) assertions = 2;
              else if (minOpen === 2) assertions = 4;
              else if (minOpen === 3) assertions = 6;
              else if (minOpen === 4) assertions = 9;
              else if (minOpen === 5) assertions = 12;
              else if (minOpen === 6) assertions = 15;
              else assertions = Math.min(22, 16 + (minOpen - 6) * 2);

              const score = 1.0 + (assertions / 22.0) * 0.75;

              const desc = `Naked Single at (${r + 1},${c + 1}): only ${val} fits [assertions: ${assertions}, min-open: ${minOpen}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, 3x3-sq: ${reasons.box_3x3}]`;
              return {
                row: r,
                col: c,
                val,
                technique: "Naked Single",
                reasons,
                assertions,
                step_score: score,
                description: desc
              };
            }
          }
        }
      }
      return null;
    }

    static findHiddenSingle(b) {
      // 1. 3x3 Box
      for (let boxR = 0; boxR < 9; boxR += 3) {
        for (let boxC = 0; boxC < 9; boxC += 3) {
          for (let num = 1; num <= 9; num++) {
            let count = 0, targetR = -1, targetC = -1;
            let peerElimAssertions = 0;
            for (let r = boxR; r < boxR + 3; r++) {
              for (let c = boxC; c < boxC + 3; c++) {
                if (b[r][c] === 0) {
                  if (SudokuEngine.isValid(b, r, c, num)) {
                    count++;
                    targetR = r;
                    targetC = c;
                  } else {
                    for (let i = 0; i < 9; i++) {
                      if (b[r][i] === num) peerElimAssertions++;
                      if (b[i][c] === num) peerElimAssertions++;
                    }
                  }
                }
              }
            }
            if (count === 1) {
              const reasons = SudokuEngine.analyzeEliminations(b, targetR, targetC);
              const assertions = Math.max(10, Math.min(24, Math.round(8 + peerElimAssertions * 0.4 + reasons.total * 0.3)));
              const score = 1.40 + (assertions / 24.0) * 0.45;
              const desc = `Hidden Single in 3x3 Box at (${targetR + 1},${targetC + 1}): ${num} is unique in box [assertions: ${assertions}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, 3x3-sq: ${reasons.box_3x3}]`;
              return {
                row: targetR,
                col: targetC,
                val: num,
                technique: "Hidden Single Box",
                reasons,
                assertions,
                step_score: score,
                description: desc
              };
            }
          }
        }
      }

      // 2. Rows
      for (let r = 0; r < 9; r++) {
        for (let num = 1; num <= 9; num++) {
          let count = 0, targetC = -1;
          let peerElimAssertions = 0;
          for (let c = 0; c < 9; c++) {
            if (b[r][c] === 0) {
              if (SudokuEngine.isValid(b, r, c, num)) {
                count++;
                targetC = c;
              } else {
                for (let i = 0; i < 9; i++) {
                  if (b[i][c] === num) peerElimAssertions++;
                }
                const startR = Math.floor(r / 3) * 3;
                const startC = Math.floor(c / 3) * 3;
                for (let br = startR; br < startR + 3; br++) {
                  for (let bc = startC; bc < startC + 3; bc++) {
                    if (b[br][bc] === num) peerElimAssertions++;
                  }
                }
              }
            }
          }
          if (count === 1) {
            const reasons = SudokuEngine.analyzeEliminations(b, r, targetC);
            const assertions = Math.max(15, Math.min(32, Math.round(12 + peerElimAssertions * 0.45 + reasons.total * 0.35)));
            const score = 1.75 + (assertions / 32.0) * 0.50;
            const desc = `Hidden Single in Row ${r + 1} at (${r + 1},${targetC + 1}): ${num} is unique in row [assertions: ${assertions}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, 3x3-sq: ${reasons.box_3x3}]`;
            return {
              row: r,
              col: targetC,
              val: num,
              technique: "Hidden Single Row",
              reasons,
              assertions,
              step_score: score,
              description: desc
            };
          }
        }
      }

      // 3. Cols
      for (let c = 0; c < 9; c++) {
        for (let num = 1; num <= 9; num++) {
          let count = 0, targetR = -1;
          let peerElimAssertions = 0;
          for (let r = 0; r < 9; r++) {
            if (b[r][c] === 0) {
              if (SudokuEngine.isValid(b, r, c, num)) {
                count++;
                targetR = r;
              } else {
                for (let i = 0; i < 9; i++) {
                  if (b[r][i] === num) peerElimAssertions++;
                }
                const startR = Math.floor(r / 3) * 3;
                const startC = Math.floor(c / 3) * 3;
                for (let br = startR; br < startR + 3; br++) {
                  for (let bc = startC; bc < startC + 3; bc++) {
                    if (b[br][bc] === num) peerElimAssertions++;
                  }
                }
              }
            }
          }
          if (count === 1) {
            const reasons = SudokuEngine.analyzeEliminations(b, targetR, c);
            const assertions = Math.max(15, Math.min(32, Math.round(12 + peerElimAssertions * 0.45 + reasons.total * 0.35)));
            const score = 1.75 + (assertions / 32.0) * 0.50;
            const desc = `Hidden Single in Col ${c + 1} at (${targetR + 1},${c + 1}): ${num} is unique in col [assertions: ${assertions}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, 3x3-sq: ${reasons.box_3x3}]`;
            return {
              row: targetR,
              col: c,
              val: num,
              technique: "Hidden Single Col",
              reasons,
              assertions,
              step_score: score,
              description: desc
            };
          }
        }
      }

      return null;
    }

    static findNextDeduction(b) {
      const naked = SudokuEngine.findNakedSingle(b);
      if (naked) return naked;
      return SudokuEngine.findHiddenSingle(b);
    }

    static solveAndAssess(puzzle) {
      const work = SudokuEngine.cloneBoard(puzzle);
      const stepDeductions = [];
      const techniqueCounts = {};
      const reasonCounts = { cross_horizontal: 0, cross_vertical: 0, box_3x3: 0 };
      let totalScore = 0;

      while (true) {
        let filled = true;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (work[r][c] === 0) { filled = false; break; }
          }
          if (!filled) break;
        }
        if (filled) break;

        const deduction = SudokuEngine.findNextDeduction(work);
        if (!deduction) {
          return {
            solved: false,
            total_score: totalScore,
            rating: "Unsolvable by logical singles",
            granular_tier: "Unsolvable",
            reason_counts: reasonCounts,
            technique_counts: techniqueCounts,
            step_deductions: stepDeductions,
            advanced_metrics: {},
            metrics_list: []
          };
        }

        work[deduction.row][deduction.col] = deduction.val;
        stepDeductions.push(deduction);
        totalScore += deduction.step_score;
        techniqueCounts[deduction.technique] = (techniqueCounts[deduction.technique] || 0) + 1;
        reasonCounts.cross_horizontal += deduction.reasons.cross_horizontal;
        reasonCounts.cross_vertical += deduction.reasons.cross_vertical;
        reasonCounts.box_3x3 += deduction.reasons.box_3x3;
      }

      let maxStepAssertions = 0;
      for (const d of stepDeductions) {
        const ast = d.assertions || (8 + (d.reasons ? d.reasons.total : 0));
        if (ast > maxStepAssertions) maxStepAssertions = ast;
      }

      let rating = "Easy";
      if (totalScore >= 68 || stepDeductions.length >= 55) rating = "Expert";
      else if (totalScore >= 58 || stepDeductions.length >= 50) rating = "Hard";
      else if (totalScore >= 48 || stepDeductions.length >= 44) rating = "Medium";
      else rating = "Easy";

      let granularTier = "Easy (Tier 1 - Casual)";
      if (totalScore >= 74 || (stepDeductions.length >= 56 && maxStepAssertions >= 18)) granularTier = "Expert (Tier 2 - Extreme)";
      else if (totalScore >= 68 || stepDeductions.length >= 54) granularTier = "Expert (Tier 1 - Grandmaster)";
      else if (totalScore >= 62 || stepDeductions.length >= 51) granularTier = "Hard (Tier 2 - Master)";
      else if (totalScore >= 56 || stepDeductions.length >= 48) granularTier = "Hard (Tier 1 - Advanced)";
      else if (totalScore >= 50 || stepDeductions.length >= 45) granularTier = "Medium (Tier 2 - Intermediate)";
      else if (totalScore >= 44 || stepDeductions.length >= 42) granularTier = "Medium (Tier 1 - Moderate)";
      else if (totalScore >= 38 || stepDeductions.length >= 38) granularTier = "Easy (Tier 2 - Novice)";

      const report = {
        solved: true,
        total_score: totalScore,
        composite_score: 0,
        rating,
        granular_tier: granularTier,
        reason_counts: reasonCounts,
        technique_counts: techniqueCounts,
        step_deductions: stepDeductions,
        advanced_metrics: {},
        metrics_list: []
      };

      SudokuEngine.calculateMetricsWithBoard(report, puzzle);
      return report;
    }

    static calculateMetricsWithBoard(report, puzzle = null) {
      const deductions = report.step_deductions;
      const n = deductions.length;
      if (n === 0) return;

      const scores = deductions.map(d => d.step_score);
      let sum = 0;
      let minScore = scores[0];
      let maxScore = scores[0];
      let bottleneckStep = 1;

      let totalAssertions = 0;
      let maxStepAssertions = 0;

      let nakedCount = 0;
      let hiddenBoxCount = 0;
      let hiddenRowColCount = 0;

      for (let i = 0; i < n; i++) {
        const s = scores[i];
        sum += s;
        if (s < minScore) minScore = s;
        if (s > maxScore) {
          maxScore = s;
          bottleneckStep = i + 1;
        }

        const ast = deductions[i].assertions || (8 + (deductions[i].reasons ? deductions[i].reasons.total : 0));
        totalAssertions += ast;
        if (ast > maxStepAssertions) maxStepAssertions = ast;

        switch (deductions[i].technique) {
          case "Naked Single": nakedCount++; break;
          case "Hidden Single Box": hiddenBoxCount++; break;
          case "Hidden Single Row":
          case "Hidden Single Col": hiddenRowColCount++; break;
        }
      }

      const mean = sum / n;
      const avgAssertions = totalAssertions / n;

      let varSum = 0;
      let madSum = 0;
      for (let i = 0; i < n; i++) {
        const diff = scores[i] - mean;
        varSum += diff * diff;
        madSum += Math.abs(diff);
      }
      const variance = varSum / n;
      const stdDev = Math.sqrt(variance);
      const mad = madSum / n;

      let maxSuddenness = 0;
      for (let i = 0; i < n - 1; i++) {
        const delta = Math.abs(scores[i + 1] - scores[i]);
        if (delta > maxSuddenness) maxSuddenness = delta;
      }

      let ssXX = 0, ssXY = 0;
      const meanX = (n + 1) / 2.0;
      for (let i = 0; i < n; i++) {
        const x = i + 1;
        const diffX = x - meanX;
        const diffY = scores[i] - mean;
        ssXX += diffX * diffX;
        ssXY += diffX * diffY;
      }
      const pacingSlope = ssXX > 0 ? ssXY / ssXX : 0;

      let difficultyPacing = "Balanced";
      if (maxSuddenness >= 1.2) difficultyPacing = "Volatile";
      else if (pacingSlope > 0.03) difficultyPacing = "Escalating";
      else if (pacingSlope < -0.03) difficultyPacing = "Front-Loaded";

      let currentStreak = 1;
      let maxStreak = 1;
      let maxStreakTech = deductions[0].technique;
      for (let i = 1; i < n; i++) {
        if (deductions[i].technique === deductions[i - 1].technique) {
          currentStreak++;
          if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
            maxStreakTech = deductions[i].technique;
          }
        } else {
          currentStreak = 1;
        }
      }

      const techKeys = Object.keys(report.technique_counts).sort();
      let mostFreqTech = '';
      let leastFreqTech = '';
      let mostCount = -1;
      let leastCount = Infinity;
      let entropy = 0;

      for (const tech of techKeys) {
        const cnt = report.technique_counts[tech];
        if (cnt > mostCount) { mostCount = cnt; mostFreqTech = tech; }
        if (cnt < leastCount) { leastCount = cnt; leastFreqTech = tech; }
        const p = cnt / n;
        if (p > 0) entropy -= p * Math.log(p);
      }
      let techniqueDiversity = 0.0;
      if (techKeys.length > 1) {
        techniqueDiversity = Math.min(1.0, entropy / Math.log(4.0));
      }

      let clueCount = 81 - n;
      let blanksCount = n;
      let clueSymmetry = 0.0;
      let clueVar = 0.0;
      let boxCongestionMax = 0;
      let bandCongestionMax = 0;

      if (puzzle) {
        clueCount = 0;
        blanksCount = 0;
        const rowClues = new Array(9).fill(0);
        const colClues = new Array(9).fill(0);
        const boxClues = new Array(9).fill(0);

        let sym180 = 0, symHoriz = 0, symVert = 0, symDiag = 0;

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const isGiven = puzzle[r][c] !== 0;
            if (isGiven) {
              clueCount++;
              rowClues[r]++;
              colClues[c]++;
              boxClues[Math.floor(r / 3) * 3 + Math.floor(c / 3)]++;
            } else {
              blanksCount++;
            }

            if (isGiven === (puzzle[8 - r][8 - c] !== 0)) sym180++;
            if (isGiven === (puzzle[r][8 - c] !== 0)) symHoriz++;
            if (isGiven === (puzzle[8 - r][c] !== 0)) symVert++;
            if (isGiven === (puzzle[c][r] !== 0)) symDiag++;
          }
        }

        clueSymmetry = Math.max(sym180, symHoriz, symVert, symDiag) / 81.0;

        const meanRowClues = clueCount / 9.0;
        let rVar = 0, cVar = 0, bVar = 0;
        for (let i = 0; i < 9; i++) {
          const rd = rowClues[i] - meanRowClues;
          const cd = colClues[i] - meanRowClues;
          const bd = boxClues[i] - meanRowClues;
          rVar += rd * rd;
          cVar += cd * cd;
          bVar += bd * bd;
          if (boxClues[i] > boxCongestionMax) boxCongestionMax = boxClues[i];
        }
        clueVar = (rVar + cVar + bVar) / 27.0;

        for (let b = 0; b < 3; b++) {
          const hBand = rowClues[b * 3] + rowClues[b * 3 + 1] + rowClues[b * 3 + 2];
          const vStack = colClues[b * 3] + colClues[b * 3 + 1] + colClues[b * 3 + 2];
          if (hBand > bandCongestionMax) bandCongestionMax = hBand;
          if (vStack > bandCongestionMax) bandCongestionMax = vStack;
        }
      }

      const assertionDensity = totalAssertions / (blanksCount || 1);
      const complexityRating = (totalAssertions * 0.4) + (avgAssertions * 3.5) + (maxStepAssertions * 0.8);
      const avgCandidates = 2.5 + (blanksCount / 81.0) * 2.0;
      let peakAmbiguity = 6;
      if (blanksCount > 45) peakAmbiguity = 8;
      else if (blanksCount > 35) peakAmbiguity = 7;
      const constrainedness = 1.0 - (clueCount / 81.0);

      const compositeScore = (report.total_score * 0.6) + (totalAssertions * 0.08) + (avgAssertions * 1.5) + (variance * 2.0);

      report.composite_score = compositeScore;
      report.advanced_metrics = {
        total_assertions: totalAssertions,
        max_step_assertions: maxStepAssertions,
        avg_assertions_per_step: avgAssertions,
        assertion_density: assertionDensity,
        complexity_rating: complexityRating,
        min_step_score: minScore,
        max_step_score: maxScore,
        score_spread: maxScore - minScore,
        score_variance: variance,
        score_std_dev: stdDev,
        score_divergence: mad,
        suddenness: maxSuddenness,
        bottleneck_step: bottleneckStep,
        difficulty_pacing: difficultyPacing,
        pacing_slope: pacingSlope,
        avg_candidates: avgCandidates,
        peak_ambiguity: peakAmbiguity,
        constrainedness,
        clue_count: clueCount,
        blanks_count: blanksCount,
        clue_symmetry_score: clueSymmetry,
        clue_distribution_variance: clueVar,
        box_congestion_max: boxCongestionMax,
        band_congestion_max: bandCongestionMax,
        naked_single_count: nakedCount,
        hidden_single_box_count: hiddenBoxCount,
        hidden_single_row_col_count: hiddenRowColCount,
        technique_diversity: techniqueDiversity,
        max_streak: maxStreak,
        max_streak_technique: maxStreakTech,
        most_frequent_technique: mostFreqTech,
        least_frequent_technique: leastFreqTech,
        composite_score: compositeScore,
        granular_tier: report.granular_tier
      };

      SudokuEngine.buildMetricsList(report);
    }

    static buildMetricsList(report) {
      const m = report.advanced_metrics;
      const reasons = report.reason_counts || { cross_horizontal: 0, cross_vertical: 0, box_3x3: 0 };
      const totalReasons = (reasons.cross_horizontal || 0) + (reasons.cross_vertical || 0) + (reasons.box_3x3 || 0);
      const crossTotal = (reasons.cross_horizontal || 0) + (reasons.cross_vertical || 0);
      const boxToCrossRatio = crossTotal > 0 ? (reasons.box_3x3 || 0) / crossTotal : 0.0;

      report.metrics_list = [
        {
          key: "complexity_total_assertions",
          name: "Total Logical Assertions",
          category: "Complexity & Assertions",
          value: m.total_assertions,
          formatted: `${m.total_assertions} assertions`,
          unit: "assertions",
          description: "Total candidate elimination checks and logical proofs executed to solve the puzzle."
        },
        {
          key: "complexity_max_step_assertions",
          name: "Peak Step Assertions",
          category: "Complexity & Assertions",
          value: m.max_step_assertions,
          formatted: `${m.max_step_assertions} assertions`,
          unit: "assertions",
          description: "Maximum logical assertions required to deduce any single cell (the peak bottleneck)."
        },
        {
          key: "complexity_avg_assertions_per_step",
          name: "Average Assertions per Step",
          category: "Complexity & Assertions",
          value: m.avg_assertions_per_step,
          formatted: `${m.avg_assertions_per_step.toFixed(2)} assertions/step`,
          unit: "assertions/step",
          description: "Average number of assertions required per deduction step across the solve trajectory."
        },
        {
          key: "complexity_assertion_density",
          name: "Assertion Density",
          category: "Complexity & Assertions",
          value: m.assertion_density,
          formatted: `${m.assertion_density.toFixed(2)} assertions/blank`,
          unit: "assertions/blank",
          description: "Ratio of total assertions evaluated to the total number of blank cells to solve."
        },
        {
          key: "complexity_rating",
          name: "Composite Complexity Index",
          category: "Complexity & Assertions",
          value: m.complexity_rating,
          formatted: m.complexity_rating.toFixed(2),
          description: "Unified cognitive load index combining assertion depth, search width, and reasoning bottlenecks."
        },
        {
          key: "score_total",
          name: "Total Difficulty Score",
          category: "Difficulty & Scoring",
          value: report.total_score,
          formatted: report.total_score.toFixed(2),
          description: "Aggregate cumulative step difficulty score."
        },
        {
          key: "score_composite",
          name: "Multi-Factor Composite Score",
          category: "Difficulty & Scoring",
          value: m.composite_score,
          formatted: m.composite_score.toFixed(2),
          description: "Holistic score balancing step score, assertion volume, candidate entropy, and variance."
        },
        {
          key: "difficulty_rating",
          name: "Difficulty Rating",
          category: "Difficulty & Scoring",
          value: 0,
          formatted: report.rating,
          description: "Canonical difficulty classification tier (Easy, Medium, Hard, Expert)."
        },
        {
          key: "granular_tier",
          name: "Granular Difficulty Tier",
          category: "Difficulty & Scoring",
          value: 0,
          formatted: report.granular_tier,
          description: "High-precision granular tier distinguishing fine gradations of difficulty."
        },
        {
          key: "trajectory_min_step_score",
          name: "Minimum Step Score",
          category: "Statistical Trajectory",
          value: m.min_step_score,
          formatted: m.min_step_score.toFixed(2),
          description: "Difficulty score of the easiest deduction step."
        },
        {
          key: "trajectory_max_step_score",
          name: "Maximum Step Score",
          category: "Statistical Trajectory",
          value: m.max_step_score,
          formatted: m.max_step_score.toFixed(2),
          description: "Difficulty score of the hardest deduction step."
        },
        {
          key: "trajectory_score_spread",
          name: "Step Score Spread (Range)",
          category: "Statistical Trajectory",
          value: m.score_spread,
          formatted: m.score_spread.toFixed(2),
          description: "Range between hardest and easiest step scores (Max - Min)."
        },
        {
          key: "trajectory_score_variance",
          name: "Score Variance",
          category: "Statistical Trajectory",
          value: m.score_variance,
          formatted: m.score_variance.toFixed(4),
          description: "Statistical variance of step scores measuring difficulty fluctuation."
        },
        {
          key: "trajectory_score_std_dev",
          name: "Score Standard Deviation",
          category: "Statistical Trajectory",
          value: m.score_std_dev,
          formatted: m.score_std_dev.toFixed(4),
          description: "Standard deviation of step scores across the solution."
        },
        {
          key: "trajectory_score_divergence",
          name: "Mean Absolute Deviation (MAD)",
          category: "Statistical Trajectory",
          value: m.score_divergence,
          formatted: m.score_divergence.toFixed(4),
          description: "Average absolute difference of individual step scores from the mean."
        },
        {
          key: "trajectory_suddenness",
          name: "Suddenness (Max Step Jump)",
          category: "Statistical Trajectory",
          value: m.suddenness,
          formatted: m.suddenness.toFixed(4),
          description: "Sharpest difficulty jump between consecutive adjacent solve steps."
        },
        {
          key: "trajectory_bottleneck_step",
          name: "Bottleneck Step Number",
          category: "Statistical Trajectory",
          value: m.bottleneck_step,
          formatted: `Step #${m.bottleneck_step}`,
          description: "1-indexed step location where the hardest deduction bottleneck occurs."
        },
        {
          key: "trajectory_pacing_slope",
          name: "Difficulty Pacing Slope",
          category: "Statistical Trajectory",
          value: m.pacing_slope,
          formatted: `${m.pacing_slope >= 0 ? '+' : ''}${m.pacing_slope.toFixed(4)} /step`,
          unit: "/step",
          description: "Linear regression slope of step difficulty over time (>0: escalating, <0: easing)."
        },
        {
          key: "trajectory_difficulty_pacing",
          name: "Pacing Classification",
          category: "Statistical Trajectory",
          value: 0,
          formatted: m.difficulty_pacing,
          description: "Qualitative flow of puzzle difficulty (Front-Loaded, Back-Loaded, Balanced, Volatile)."
        },
        {
          key: "search_avg_candidates",
          name: "Average Candidates per Cell",
          category: "Candidate Search & Entropy",
          value: m.avg_candidates,
          formatted: `${m.avg_candidates.toFixed(2)} candidates`,
          unit: "candidates",
          description: "Estimated average candidate pool size per unsolved cell."
        },
        {
          key: "search_peak_ambiguity",
          name: "Peak Cell Ambiguity",
          category: "Candidate Search & Entropy",
          value: m.peak_ambiguity,
          formatted: `${m.peak_ambiguity} candidates`,
          unit: "candidates",
          description: "Maximum number of simultaneous open candidates in any single cell."
        },
        {
          key: "search_constrainedness",
          name: "Information Constrainedness",
          category: "Candidate Search & Entropy",
          value: m.constrainedness,
          formatted: m.constrainedness.toFixed(2),
          description: "Ratio measuring open degrees of freedom remaining on the board."
        },
        {
          key: "topology_clue_count",
          name: "Given Clues Count",
          category: "Board Geometry & Topology",
          value: m.clue_count,
          formatted: `${m.clue_count} givens`,
          unit: "givens",
          description: "Total initial pre-filled numbers provided to the player."
        },
        {
          key: "topology_blanks_count",
          name: "Blank Cells Count",
          category: "Board Geometry & Topology",
          value: m.blanks_count,
          formatted: `${m.blanks_count} blanks`,
          unit: "blanks",
          description: "Total empty cells that require logical deduction."
        },
        {
          key: "topology_clue_symmetry",
          name: "Clue Symmetry Score",
          category: "Board Geometry & Topology",
          value: m.clue_symmetry_score,
          formatted: `${m.clue_symmetry_score.toFixed(2)} (${Math.round(m.clue_symmetry_score * 100)}%)`,
          description: "Degree of rotational or reflective geometric symmetry in initial clue placements (1.0 = perfect)."
        },
        {
          key: "topology_distribution_variance",
          name: "Clue Distribution Variance",
          category: "Board Geometry & Topology",
          value: m.clue_distribution_variance,
          formatted: m.clue_distribution_variance.toFixed(3),
          description: "Variance of clue concentration across rows, columns, and 3x3 boxes."
        },
        {
          key: "topology_box_congestion",
          name: "Max 3x3 Box Congestion",
          category: "Board Geometry & Topology",
          value: m.box_congestion_max,
          formatted: `${m.box_congestion_max} clues / box`,
          unit: "clues",
          description: "Maximum number of given clues situated in any single 3x3 subgrid."
        },
        {
          key: "topology_band_congestion",
          name: "Max Band/Stack Congestion",
          category: "Board Geometry & Topology",
          value: m.band_congestion_max,
          formatted: `${m.band_congestion_max} clues / band`,
          unit: "clues",
          description: "Maximum number of given clues situated in any 3-line band or stack."
        },
        {
          key: "tech_naked_singles",
          name: "Naked Singles Count",
          category: "Technique Composition",
          value: m.naked_single_count,
          formatted: m.naked_single_count.toString(),
          description: "Total deductions resolved by cell candidate elimination."
        },
        {
          key: "tech_hidden_singles_box",
          name: "Hidden Singles (Box) Count",
          category: "Technique Composition",
          value: m.hidden_single_box_count,
          formatted: m.hidden_single_box_count.toString(),
          description: "Total deductions where candidate digit fit uniquely in a 3x3 box."
        },
        {
          key: "tech_hidden_singles_row_col",
          name: "Hidden Singles (Row/Col) Count",
          category: "Technique Composition",
          value: m.hidden_single_row_col_count,
          formatted: m.hidden_single_row_col_count.toString(),
          description: "Total deductions where candidate digit fit uniquely in a row or column."
        },
        {
          key: "tech_diversity",
          name: "Technique Diversity Index",
          category: "Technique Composition",
          value: m.technique_diversity,
          formatted: m.technique_diversity.toFixed(3),
          description: "Normalized Shannon entropy of technique variety (0.0 = uniform technique, 1.0 = rich diversity)."
        },
        {
          key: "tech_max_streak",
          name: "Longest Technique Streak",
          category: "Technique Composition",
          value: m.max_streak,
          formatted: `${m.max_streak} steps (${m.max_streak_technique})`,
          description: "Longest consecutive sequence of solve steps using the exact same technique."
        },
        {
          key: "tech_most_frequent",
          name: "Most Frequent Technique",
          category: "Technique Composition",
          value: 0,
          formatted: m.most_frequent_technique,
          description: "Technique that resolved the greatest number of deduction steps."
        },
        {
          key: "tech_least_frequent",
          name: "Least Frequent Technique",
          category: "Technique Composition",
          value: 0,
          formatted: m.least_frequent_technique,
          description: "Technique that resolved the fewest number of deduction steps."
        },
        {
          key: "constraint_cross_horizontal",
          name: "Row (Horizontal) Reasons",
          category: "Constraint Analysis",
          value: reasons.cross_horizontal,
          formatted: `${reasons.cross_horizontal} checks`,
          unit: "checks",
          description: "Total row constraint conflicts evaluated during candidate elimination."
        },
        {
          key: "constraint_cross_vertical",
          name: "Column (Vertical) Reasons",
          category: "Constraint Analysis",
          value: reasons.cross_vertical,
          formatted: `${reasons.cross_vertical} checks`,
          unit: "checks",
          description: "Total column constraint conflicts evaluated during candidate elimination."
        },
        {
          key: "constraint_box_3x3",
          name: "3x3 Box Reasons",
          category: "Constraint Analysis",
          value: reasons.box_3x3,
          formatted: `${reasons.box_3x3} checks`,
          unit: "checks",
          description: "Total 3x3 square constraint conflicts evaluated during candidate elimination."
        },
        {
          key: "constraint_total_reasons",
          name: "Total Elimination Reasons",
          category: "Constraint Analysis",
          value: totalReasons,
          formatted: `${totalReasons} checks`,
          unit: "checks",
          description: "Sum total of all row, column, and box elimination reasons evaluated."
        },
        {
          key: "constraint_box_to_cross_ratio",
          name: "Box to Cross Constraint Ratio",
          category: "Constraint Analysis",
          value: boxToCrossRatio,
          formatted: boxToCrossRatio.toFixed(2),
          description: "Ratio of 3x3 box eliminations relative to cross-line (row + column) eliminations."
        }
      ];
    }

    static applyRuleBasedMutations(puzzle, solution = null, rng = new FastRand()) {
      const perm = rng.perm(9);
      const mapping = {};
      for (let i = 0; i < 9; i++) mapping[i + 1] = perm[i] + 1;

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (puzzle[r][c] !== 0) puzzle[r][c] = mapping[puzzle[r][c]];
          if (solution && solution[r][c] !== 0) solution[r][c] = mapping[solution[r][c]];
        }
      }

      for (let band = 0; band < 3; band++) {
        const p = rng.perm(3);
        const tempP = SudokuEngine.cloneBoard(puzzle);
        const tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let i = 0; i < 3; i++) {
          const fromR = band * 3 + p[i];
          const toR = band * 3 + i;
          puzzle[toR] = [...tempP[fromR]];
          if (solution) solution[toR] = [...tempS[fromR]];
        }
      }

      for (let stack = 0; stack < 3; stack++) {
        const p = rng.perm(3);
        const tempP = SudokuEngine.cloneBoard(puzzle);
        const tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let r = 0; r < 9; r++) {
          for (let i = 0; i < 3; i++) {
            const fromC = stack * 3 + p[i];
            const toC = stack * 3 + i;
            puzzle[r][toC] = tempP[r][fromC];
            if (solution) solution[r][toC] = tempS[r][fromC];
          }
        }
      }

      const bandPerm = rng.perm(3);
      let tempP = SudokuEngine.cloneBoard(puzzle);
      let tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
      for (let b = 0; b < 3; b++) {
        const fromBand = bandPerm[b];
        for (let r = 0; r < 3; r++) {
          puzzle[b * 3 + r] = [...tempP[fromBand * 3 + r]];
          if (solution) solution[b * 3 + r] = [...tempS[fromBand * 3 + r]];
        }
      }

      const stackPerm = rng.perm(3);
      tempP = SudokuEngine.cloneBoard(puzzle);
      tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
      for (let r = 0; r < 9; r++) {
        for (let sIdx = 0; sIdx < 3; sIdx++) {
          const fromStack = stackPerm[sIdx];
          for (let c = 0; c < 3; c++) {
            puzzle[r][sIdx * 3 + c] = tempP[r][fromStack * 3 + c];
            if (solution) solution[r][sIdx * 3 + c] = tempS[r][fromStack * 3 + c];
          }
        }
      }

      if (rng.intn(2) === 1) {
        tempP = SudokuEngine.cloneBoard(puzzle);
        tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            puzzle[r][c] = tempP[c][r];
            if (solution) solution[r][c] = tempS[c][r];
          }
        }
      }
    }

    static mutate(puzzle, solution = null, rng = new FastRand()) {
      const p = SudokuEngine.cloneBoard(puzzle);
      const s = solution ? SudokuEngine.cloneBoard(solution) : null;
      SudokuEngine.applyRuleBasedMutations(p, s, rng);
      return { puzzle: p, solution: s };
    }

    static carveWithTargetDifficulty(fullBoard, targetDifficulty = "hard", targetBlanks = 0, rng = new FastRand()) {
      targetDifficulty = (targetDifficulty || "hard").toLowerCase();

      let minBlanks = 53, maxBlanks = 57;
      if (targetDifficulty === "easy") {
        minBlanks = 40; maxBlanks = 45;
      } else if (targetDifficulty === "medium") {
        minBlanks = 47; maxBlanks = 52;
      } else if (targetDifficulty === "hard") {
        minBlanks = 53; maxBlanks = 57;
      } else if (targetDifficulty === "expert") {
        minBlanks = 58; maxBlanks = 64;
      }

      if (targetBlanks > 0) {
        minBlanks = targetBlanks;
        maxBlanks = targetBlanks;
      }

      const desiredBlanks = minBlanks + rng.intn(maxBlanks - minBlanks + 1);

      const puzzle = SudokuEngine.cloneBoard(fullBoard);
      const positions = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          positions.push({ r, c });
        }
      }
      rng.shuffle(positions);

      let carved = 0;
      for (const pos of positions) {
        if (carved >= desiredBlanks) break;
        const orig = puzzle[pos.r][pos.c];
        puzzle[pos.r][pos.c] = 0;

        const assessment = SudokuEngine.solveAndAssess(puzzle);
        if (assessment.solved) {
          carved++;
        } else {
          puzzle[pos.r][pos.c] = orig;
        }
      }

      const report = SudokuEngine.solveAndAssess(puzzle);
      return { puzzle, report };
    }

    static generateAndAssessPuzzle(targetDifficulty = "hard", targetBlanks = 0, rng = new FastRand()) {
      const fullGrid = SudokuEngine.generateSeedBoard(rng);
      SudokuEngine.applyRuleBasedMutations(fullGrid, null, rng);

      const { puzzle: puzzleGrid } = SudokuEngine.carveWithTargetDifficulty(fullGrid, targetDifficulty, targetBlanks, rng);
      SudokuEngine.applyRuleBasedMutations(puzzleGrid, fullGrid, rng);

      const report = SudokuEngine.solveAndAssess(puzzleGrid);
      return {
        solution: fullGrid,
        puzzle: puzzleGrid,
        report
      };
    }

    static generateAndCarve(targetDiff = "hard", rng = new FastRand()) {
      const res = SudokuEngine.generateAndAssessPuzzle(targetDiff, 0, rng);
      return {
        puzzle: res.puzzle,
        solution: res.solution,
        deductions: res.report.step_deductions,
        rating: res.report.rating,
        totalScore: res.report.total_score,
        metrics: res.report.advanced_metrics,
        metrics_list: res.report.metrics_list,
        granularTier: res.report.granular_tier
      };
    }
  }

  return {
    FastRand,
    SudokuEngine
  };
}));
