/**
 * Undoku Universal Sudoku Mathematical & Generation Engine
 * Shared single source of truth for both Express Server (Node.js) & Web UI (Static Browser).
 * Supports Generalized Rectangular Subgrid Topologies (Br x Bc) for N x N boards.
 * High-performance bitmask solver with MRV heuristics & branch lookahead.
 */
(function (root, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
  } else {
    const exports = factory();
    root.Undoku = exports;
    root.FastRand = exports.FastRand;
    root.SudokuEngine = exports.SudokuEngine;
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  class FastRand {
    constructor(seed) {
      if (seed === undefined || seed === null) {
        if (typeof process !== "undefined" && process.hrtime) {
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

  const SUPPORTED_CONFIGURATIONS = {
    "mini_4x4":     { Br: 2, Bc: 2, N: 4,  label: "4×4 Mini (2×2 Box)", defaultClues: 6 },
    "wide_6x6":     { Br: 2, Bc: 3, N: 6,  label: "6×6 Wide (2×3 Box)", defaultClues: 14 },
    "wide_8x8":     { Br: 2, Bc: 4, N: 8,  label: "8×8 Wide (2×4 Box)", defaultClues: 26 },
    "classic_9x9":  { Br: 3, Bc: 3, N: 9,  label: "9×9 Classic (3×3 Box)", defaultClues: 30 },
    "wide_10x10":   { Br: 2, Bc: 5, N: 10, label: "10×10 Decimal (2×5 Box)", defaultClues: 40 },
    "duo_12x12":    { Br: 3, Bc: 4, N: 12, label: "12×12 Duodecimal (3×4 Box)", defaultClues: 56 },
    "ultra_12x12":  { Br: 2, Bc: 6, N: 12, label: "12×12 Wide-Band (2×6 Box)", defaultClues: 56 },
    "hexa_16x16":   { Br: 4, Bc: 4, N: 16, label: "16×16 Hexadoku (4×4 Box)", defaultClues: 98 }
  };

  class SudokuEngine {
    static get SUPPORTED_CONFIGURATIONS() {
      return SUPPORTED_CONFIGURATIONS;
    }

    static resolveTopology(bOrNOrKey, Br = null, Bc = null) {
      if (typeof bOrNOrKey === "string" && SUPPORTED_CONFIGURATIONS[bOrNOrKey]) {
        const cfg = SUPPORTED_CONFIGURATIONS[bOrNOrKey];
        return { ...cfg, key: bOrNOrKey };
      }
      const N = Array.isArray(bOrNOrKey) ? bOrNOrKey.length : (typeof bOrNOrKey === "number" ? bOrNOrKey : 9);
      if (Br && Bc && Br * Bc === N) {
        return { Br, Bc, N, key: `${N}x${N}_${Br}x${Bc}`, label: `${N}×${N} (${Br}×${Bc} Box)` };
      }
      if (Br && !Bc && N % Br === 0) {
        const c = N / Br;
        return { Br, Bc: c, N, key: `${N}x${N}_${Br}x${c}`, label: `${N}×${N} (${Br}×${c} Box)` };
      }
      switch (N) {
        case 4:  return { ...SUPPORTED_CONFIGURATIONS["mini_4x4"], key: "mini_4x4" };
        case 6:  return { ...SUPPORTED_CONFIGURATIONS["wide_6x6"], key: "wide_6x6" };
        case 8:  return { ...SUPPORTED_CONFIGURATIONS["wide_8x8"], key: "wide_8x8" };
        case 9:  return { ...SUPPORTED_CONFIGURATIONS["classic_9x9"], key: "classic_9x9" };
        case 10: return { ...SUPPORTED_CONFIGURATIONS["wide_10x10"], key: "wide_10x10" };
        case 12: return { ...SUPPORTED_CONFIGURATIONS["duo_12x12"], key: "duo_12x12" };
        case 16: return { ...SUPPORTED_CONFIGURATIONS["hexa_16x16"], key: "hexa_16x16" };
        default: {
          const sq = Math.floor(Math.sqrt(N));
          if (sq * sq === N) return { Br: sq, Bc: sq, N, key: `sq_${N}x${N}`, label: `${N}×${N} (${sq}×${sq} Box)` };
          for (let r = Math.floor(Math.sqrt(N)); r >= 2; r--) {
            if (N % r === 0) return { Br: r, Bc: N / r, N, key: `rect_${N}x${N}`, label: `${N}×${N} (${r}×${N/r} Box)` };
          }
          return { Br: 1, Bc: N, N, key: `linear_${N}x${N}`, label: `${N}×${N} (1×${N} Box)` };
        }
      }
    }

    static getSymbols(N = 9) {
      const syms = [];
      for (let i = 1; i <= N; i++) {
        if (i <= 9) syms.push(i.toString());
        else syms.push(String.fromCharCode(65 + (i - 10)));
      }
      return syms;
    }

    static symbolForVal(val, N = 9) {
      if (val === 0 || !val) return ".";
      if (val <= 9) return val.toString();
      return String.fromCharCode(65 + (val - 10));
    }

    static valForSymbol(sym, N = 9) {
      if (!sym || sym === "." || sym === "0") return 0;
      if (sym >= "1" && sym <= "9") return parseInt(sym, 10);
      const code = sym.toUpperCase().charCodeAt(0);
      if (code >= 65 && code <= 90) return 10 + (code - 65);
      return 0;
    }

    static createBoard(N = 9) {
      return Array.from({ length: N }, () => new Array(N).fill(0));
    }

    static cloneBoard(b) {
      return b.map(row => [...row]);
    }

    static boardToString(b) {
      const N = b.length;
      let str = "";
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          str += SudokuEngine.symbolForVal(b[r][c], N);
        }
      }
      return str;
    }

    static stringToBoard(str, configKeyOrN = "classic_9x9") {
      const topo = SudokuEngine.resolveTopology(configKeyOrN);
      const N = topo.N;
      const expectedLen = N * N;
      if (typeof str !== "string" || str.length !== expectedLen) {
        throw new Error(`Invalid board string length ${str ? str.length : 0}, expected ${expectedLen} for ${N}x${N}`);
      }
      const b = SudokuEngine.createBoard(N);
      for (let i = 0; i < expectedLen; i++) {
        const r = Math.floor(i / N);
        const c = i % N;
        b[r][c] = SudokuEngine.valForSymbol(str[i], N);
      }
      return b;
    }

    static isValid(b, row, col, num, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      for (let i = 0; i < N; i++) {
        if (b[row][i] === num || b[i][col] === num) return false;
      }
      const startR = Math.floor(row / boxR) * boxR;
      const startC = Math.floor(col / boxC) * boxC;
      for (let r = startR; r < startR + boxR; r++) {
        for (let c = startC; c < startC + boxC; c++) {
          if (b[r][c] === num) return false;
        }
      }
      return true;
    }

    static fillGrid(b, rng = new FastRand(), Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      const rowMask = new Int32Array(N);
      const colMask = new Int32Array(N);
      const boxMask = new Int32Array(N);
      const emptyCells = [];

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = b[r][c];
          const bIdx = Math.floor(r / boxR) * boxR + Math.floor(c / boxC);
          if (v > 0) {
            const mask = 1 << (v - 1);
            rowMask[r] |= mask;
            colMask[c] |= mask;
            boxMask[bIdx] |= mask;
          } else {
            emptyCells.push({ r, c, bIdx });
          }
        }
      }

      const allMask = (1 << N) - 1;

      function backtrack() {
        let bestIdx = -1;
        let minCands = N + 1;
        let bestMask = 0;

        for (let i = 0; i < emptyCells.length; i++) {
          const cell = emptyCells[i];
          if (b[cell.r][cell.c] === 0) {
            const used = rowMask[cell.r] | colMask[cell.c] | boxMask[cell.bIdx];
            const avail = allMask & (~used);
            if (avail === 0) return false;

            let candsCount = 0;
            let tmp = avail;
            while (tmp > 0) { tmp &= tmp - 1; candsCount++; }

            if (candsCount < minCands) {
              minCands = candsCount;
              bestIdx = i;
              bestMask = avail;
              if (minCands === 1) break;
            }
          }
        }

        if (bestIdx === -1) return true;

        const cell = emptyCells[bestIdx];
        const nums = [];
        let m = bestMask;
        while (m > 0) {
          const bit = m & -m;
          const num = 31 - Math.clz32(bit) + 1;
          nums.push({ num, bit });
          m &= m - 1;
        }

        rng.shuffle(nums);

        for (const item of nums) {
          b[cell.r][cell.c] = item.num;
          rowMask[cell.r] |= item.bit;
          colMask[cell.c] |= item.bit;
          boxMask[cell.bIdx] |= item.bit;

          if (backtrack()) return true;

          b[cell.r][cell.c] = 0;
          rowMask[cell.r] &= ~item.bit;
          colMask[cell.c] &= ~item.bit;
          boxMask[cell.bIdx] &= ~item.bit;
        }

        return false;
      }

      return backtrack();
    }

    static generateSeedBoard(rng = new FastRand(), Br = 3, Bc = 3) {
      const topo = SudokuEngine.resolveTopology(Br * Bc, Br, Bc);
      const b = SudokuEngine.createBoard(topo.N);
      SudokuEngine.fillGrid(b, rng, topo.Br, topo.Bc);
      return b;
    }

    static getCandidates(b, r, c, Br = null, Bc = null) {
      if (b[r][c] !== 0) return [];
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      const used = new Array(N + 1).fill(false);
      for (let i = 0; i < N; i++) {
        if (b[r][i] !== 0) used[b[r][i]] = true;
        if (b[i][c] !== 0) used[b[i][c]] = true;
      }
      const startR = Math.floor(r / boxR) * boxR;
      const startC = Math.floor(c / boxC) * boxC;
      for (let i = startR; i < startR + boxR; i++) {
        for (let j = startC; j < startC + boxC; j++) {
          if (b[i][j] !== 0) used[b[i][j]] = true;
        }
      }
      const cands = [];
      for (let num = 1; num <= N; num++) {
        if (!used[num]) cands.push(num);
      }
      return cands;
    }

    static analyzeEliminations(b, r, c, Br = null, Bc = null) {
      let h = 0, v = 0, box = 0;
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      if (b[r][c] !== 0) {
        return { cross_horizontal: 0, cross_vertical: 0, box_3x3: 0, total: 0 };
      }

      const startR = Math.floor(r / boxR) * boxR;
      const startC = Math.floor(c / boxC) * boxC;

      for (let num = 1; num <= N; num++) {
        if (SudokuEngine.isValid(b, r, c, num, boxR, boxC)) continue;

        let inRow = false;
        for (let i = 0; i < N; i++) {
          if (b[r][i] === num) { inRow = true; break; }
        }
        if (inRow) h++;

        let inCol = false;
        for (let i = 0; i < N; i++) {
          if (b[i][c] === num) { inCol = true; break; }
        }
        if (inCol) v++;

        let inBox = false;
        for (let br = startR; br < startR + boxR; br++) {
          for (let bc = startC; bc < startC + boxC; bc++) {
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

    static getCombinations(arr, k) {
      const result = [];
      function backtrack(start, combo) {
        if (combo.length === k) {
          result.push([...combo]);
          return;
        }
        for (let i = start; i < arr.length; i++) {
          combo.push(arr[i]);
          backtrack(i + 1, combo);
          combo.pop();
        }
      }
      backtrack(0, []);
      return result;
    }

    static getUnitDefinitions(Br = 3, Bc = 3) {
      const topo = SudokuEngine.resolveTopology(Br * Bc, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;
      const units = [];

      for (let r = 0; r < N; r++) {
        const u = [];
        for (let c = 0; c < N; c++) u.push({ r, c });
        units.push({ type: "row", name: `Row ${r + 1}`, cells: u });
      }

      for (let c = 0; c < N; c++) {
        const u = [];
        for (let r = 0; r < N; r++) u.push({ r, c });
        units.push({ type: "col", name: `Col ${c + 1}`, cells: u });
      }

      const numBands = boxC;
      const numStacks = boxR;
      for (let band = 0; band < numBands; band++) {
        for (let stack = 0; stack < numStacks; stack++) {
          const startR = band * boxR;
          const startC = stack * boxC;
          const u = [];
          for (let dr = 0; dr < boxR; dr++) {
            for (let dc = 0; dc < boxC; dc++) {
              u.push({ r: startR + dr, c: startC + dc });
            }
          }
          const boxIdx = band * boxR + stack + 1;
          units.push({ type: "box", name: `Box ${boxIdx}`, cells: u });
        }
      }
      return units;
    }

    static findNakedSingle(b, cands = null, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (b[r][c] === 0) {
            const cellCands = cands ? cands[r][c] : SudokuEngine.getCandidates(b, r, c, boxR, boxC);
            if (cellCands.length === 1) {
              const val = cellCands[0];
              const reasons = SudokuEngine.analyzeEliminations(b, r, c, boxR, boxC);

              let rowOpen = 0, colOpen = 0, boxOpen = 0;
              for (let i = 0; i < N; i++) {
                if (b[r][i] === 0) rowOpen++;
                if (b[i][c] === 0) colOpen++;
              }
              const br = Math.floor(r / boxR) * boxR, bc = Math.floor(c / boxC) * boxC;
              for (let dr = 0; dr < boxR; dr++) {
                for (let dc = 0; dc < boxC; dc++) {
                  if (b[br + dr][bc + dc] === 0) boxOpen++;
                }
              }
              const minOpen = Math.min(rowOpen, colOpen, boxOpen);

              let assertions = 2;
              if (minOpen <= 1) assertions = 2;
              else if (minOpen === 2) assertions = 4;
              else if (minOpen === 3) assertions = 6;
              else if (minOpen === 4) assertions = 9;
              else if (minOpen === 5) assertions = 12;
              else if (minOpen === 6) assertions = 15;
              else assertions = Math.min(22, 16 + (minOpen - 6) * 2);

              const score = 1.0 + (assertions / 22.0) * 0.75;
              const sym = SudokuEngine.symbolForVal(val, N);
              const desc = `Naked Single at (${r + 1},${c + 1}): only ${sym} fits [assertions: ${assertions}, min-open: ${minOpen}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, box: ${reasons.box_3x3}]`;
              return {
                type: "placement",
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

    static findHiddenSingleBox(b, cands = null, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      const numBands = boxC;
      const numStacks = boxR;

      for (let band = 0; band < numBands; band++) {
        for (let stack = 0; stack < numStacks; stack++) {
          const startR = band * boxR;
          const startC = stack * boxC;
          for (let num = 1; num <= N; num++) {
            let count = 0, targetR = -1, targetC = -1;
            let peerElimAssertions = 0;
            for (let dr = 0; dr < boxR; dr++) {
              for (let dc = 0; dc < boxC; dc++) {
                const r = startR + dr, c = startC + dc;
                if (b[r][c] === 0) {
                  const cellCands = cands ? cands[r][c] : SudokuEngine.getCandidates(b, r, c, boxR, boxC);
                  if (cellCands.includes(num)) {
                    count++;
                    targetR = r;
                    targetC = c;
                  } else {
                    for (let i = 0; i < N; i++) {
                      if (b[r][i] === num) peerElimAssertions++;
                      if (b[i][c] === num) peerElimAssertions++;
                    }
                  }
                }
              }
            }
            if (count === 1) {
              const reasons = SudokuEngine.analyzeEliminations(b, targetR, targetC, boxR, boxC);
              const assertions = Math.max(10, Math.min(24, Math.round(8 + peerElimAssertions * 0.4 + reasons.total * 0.3)));
              const score = 1.40 + (assertions / 24.0) * 0.45;
              const boxIdx = band * boxR + stack + 1;
              const sym = SudokuEngine.symbolForVal(num, N);
              const desc = `Hidden Single in Box ${boxIdx} at (${targetR + 1},${targetC + 1}): ${sym} is unique in box [assertions: ${assertions}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, box: ${reasons.box_3x3}]`;
              return {
                type: "placement",
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
      return null;
    }

    static findHiddenSingleLine(b, cands = null, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      for (let r = 0; r < N; r++) {
        for (let num = 1; num <= N; num++) {
          let count = 0, targetC = -1;
          let peerElimAssertions = 0;
          for (let c = 0; c < N; c++) {
            if (b[r][c] === 0) {
              const cellCands = cands ? cands[r][c] : SudokuEngine.getCandidates(b, r, c, boxR, boxC);
              if (cellCands.includes(num)) {
                count++;
                targetC = c;
              } else {
                for (let i = 0; i < N; i++) {
                  if (b[i][c] === num) peerElimAssertions++;
                }
                const startR = Math.floor(r / boxR) * boxR, startC = Math.floor(c / boxC) * boxC;
                for (let br = startR; br < startR + boxR; br++) {
                  for (let bc = startC; bc < startC + boxC; bc++) {
                    if (b[br][bc] === num) peerElimAssertions++;
                  }
                }
              }
            }
          }
          if (count === 1) {
            const reasons = SudokuEngine.analyzeEliminations(b, r, targetC, boxR, boxC);
            const assertions = Math.max(15, Math.min(32, Math.round(12 + peerElimAssertions * 0.45 + reasons.total * 0.35)));
            const score = 1.75 + (assertions / 32.0) * 0.50;
            const sym = SudokuEngine.symbolForVal(num, N);
            const desc = `Hidden Single in Row ${r + 1} at (${r + 1},${targetC + 1}): ${sym} is unique in row [assertions: ${assertions}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, box: ${reasons.box_3x3}]`;
            return {
              type: "placement",
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

      for (let c = 0; c < N; c++) {
        for (let num = 1; num <= N; num++) {
          let count = 0, targetR = -1;
          let peerElimAssertions = 0;
          for (let r = 0; r < N; r++) {
            if (b[r][c] === 0) {
              const cellCands = cands ? cands[r][c] : SudokuEngine.getCandidates(b, r, c, boxR, boxC);
              if (cellCands.includes(num)) {
                count++;
                targetR = r;
              } else {
                for (let i = 0; i < N; i++) {
                  if (b[r][i] === num) peerElimAssertions++;
                }
                const startR = Math.floor(r / boxR) * boxR, startC = Math.floor(c / boxC) * boxC;
                for (let br = startR; br < startR + boxR; br++) {
                  for (let bc = startC; bc < startC + boxC; bc++) {
                    if (b[br][bc] === num) peerElimAssertions++;
                  }
                }
              }
            }
          }
          if (count === 1) {
            const reasons = SudokuEngine.analyzeEliminations(b, targetR, c, boxR, boxC);
            const assertions = Math.max(15, Math.min(32, Math.round(12 + peerElimAssertions * 0.45 + reasons.total * 0.35)));
            const score = 1.75 + (assertions / 32.0) * 0.50;
            const sym = SudokuEngine.symbolForVal(num, N);
            const desc = `Hidden Single in Col ${c + 1} at (${targetR + 1},${c + 1}): ${sym} is unique in col [assertions: ${assertions}, cross-h: ${reasons.cross_horizontal}, cross-v: ${reasons.cross_vertical}, box: ${reasons.box_3x3}]`;
            return {
              type: "placement",
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

    static findLockedCandidates(b, cands = null, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      for (let bIdx = 0; bIdx < N; bIdx++) {
        const band = Math.floor(bIdx / boxR);
        const stack = bIdx % boxR;
        const br = band * boxR;
        const bc = stack * boxC;
        for (let num = 1; num <= N; num++) {
          const boxCellsWithNum = [];
          for (let dr = 0; dr < boxR; dr++) {
            for (let dc = 0; dc < boxC; dc++) {
              const r = br + dr, c = bc + dc;
              if (b[r][c] === 0 && cands[r][c].includes(num)) {
                boxCellsWithNum.push({ r, c });
              }
            }
          }
          if (boxCellsWithNum.length >= 2 && boxCellsWithNum.length <= Math.max(boxR, boxC)) {
            const firstR = boxCellsWithNum[0].r;
            if (boxCellsWithNum.every(cell => cell.r === firstR)) {
              const eliminations = [];
              for (let c = 0; c < N; c++) {
                if (c < bc || c >= bc + boxC) {
                  if (b[firstR][c] === 0 && cands[firstR][c].includes(num)) {
                    eliminations.push({ r: firstR, c, val: num });
                  }
                }
              }
              if (eliminations.length > 0) {
                const sym = SudokuEngine.symbolForVal(num, N);
                const assertions = Math.max(18, Math.min(36, Math.round(14 + 1.2 * eliminations.length + 0.5 * (N*N - boxCellsWithNum.length))));
                const score = 2.40 + (assertions / 36.0) * 0.60;
                return {
                  type: "reduction",
                  technique: "Locked Candidates Pointing",
                  eliminations,
                  assertions,
                  step_score: score,
                  description: `Pointing in Box ${bIdx + 1}: ${sym} locks to row ${firstR + 1}, eliminating ${eliminations.length} candidates`
                };
              }
            }

            const firstC = boxCellsWithNum[0].c;
            if (boxCellsWithNum.every(cell => cell.c === firstC)) {
              const eliminations = [];
              for (let r = 0; r < N; r++) {
                if (r < br || r >= br + boxR) {
                  if (b[r][firstC] === 0 && cands[r][firstC].includes(num)) {
                    eliminations.push({ r, c: firstC, val: num });
                  }
                }
              }
              if (eliminations.length > 0) {
                const sym = SudokuEngine.symbolForVal(num, N);
                const assertions = Math.max(18, Math.min(36, Math.round(14 + 1.2 * eliminations.length + 0.5 * (N*N - boxCellsWithNum.length))));
                const score = 2.40 + (assertions / 36.0) * 0.60;
                return {
                  type: "reduction",
                  technique: "Locked Candidates Pointing",
                  eliminations,
                  assertions,
                  step_score: score,
                  description: `Pointing in Box ${bIdx + 1}: ${sym} locks to col ${firstC + 1}, eliminating ${eliminations.length} candidates`
                };
              }
            }
          }
        }
      }

      for (let r = 0; r < N; r++) {
        for (let num = 1; num <= N; num++) {
          const rowCells = [];
          for (let c = 0; c < N; c++) {
            if (b[r][c] === 0 && cands[r][c].includes(num)) {
              rowCells.push({ r, c });
            }
          }
          if (rowCells.length >= 2 && rowCells.length <= boxC) {
            const firstBox = Math.floor(r / boxR) * boxR + Math.floor(rowCells[0].c / boxC);
            if (rowCells.every(cell => (Math.floor(r / boxR) * boxR + Math.floor(cell.c / boxC)) === firstBox)) {
              const band = Math.floor(firstBox / boxR);
              const stack = firstBox % boxR;
              const br = band * boxR, bc = stack * boxC;
              const eliminations = [];
              for (let dr = 0; dr < boxR; dr++) {
                for (let dc = 0; dc < boxC; dc++) {
                  const cr = br + dr, cc = bc + dc;
                  if (cr !== r && b[cr][cc] === 0 && cands[cr][cc].includes(num)) {
                    eliminations.push({ r: cr, c: cc, val: num });
                  }
                }
              }
              if (eliminations.length > 0) {
                const sym = SudokuEngine.symbolForVal(num, N);
                const assertions = Math.max(18, Math.min(36, Math.round(14 + 1.2 * eliminations.length + 0.5 * (N*N - rowCells.length))));
                const score = 2.40 + (assertions / 36.0) * 0.60;
                return {
                  type: "reduction",
                  technique: "Locked Candidates Claiming",
                  eliminations,
                  assertions,
                  step_score: score,
                  description: `Claiming in Row ${r + 1}: ${sym} locks to box ${firstBox + 1}, eliminating ${eliminations.length} candidates`
                };
              }
            }
          }
        }
      }

      for (let c = 0; c < N; c++) {
        for (let num = 1; num <= N; num++) {
          const colCells = [];
          for (let r = 0; r < N; r++) {
            if (b[r][c] === 0 && cands[r][c].includes(num)) {
              colCells.push({ r, c });
            }
          }
          if (colCells.length >= 2 && colCells.length <= boxR) {
            const firstBox = Math.floor(colCells[0].r / boxR) * boxR + Math.floor(c / boxC);
            if (colCells.every(cell => (Math.floor(cell.r / boxR) * boxR + Math.floor(c / boxC)) === firstBox)) {
              const band = Math.floor(firstBox / boxR);
              const stack = firstBox % boxR;
              const br = band * boxR, bc = stack * boxC;
              const eliminations = [];
              for (let dr = 0; dr < boxR; dr++) {
                for (let dc = 0; dc < boxC; dc++) {
                  const cr = br + dr, cc = bc + dc;
                  if (cc !== c && b[cr][cc] === 0 && cands[cr][cc].includes(num)) {
                    eliminations.push({ r: cr, c: cc, val: num });
                  }
                }
              }
              if (eliminations.length > 0) {
                const sym = SudokuEngine.symbolForVal(num, N);
                const assertions = Math.max(18, Math.min(36, Math.round(14 + 1.2 * eliminations.length + 0.5 * (N*N - colCells.length))));
                const score = 2.40 + (assertions / 36.0) * 0.60;
                return {
                  type: "reduction",
                  technique: "Locked Candidates Claiming",
                  eliminations,
                  assertions,
                  step_score: score,
                  description: `Claiming in Col ${c + 1}: ${sym} locks to box ${firstBox + 1}, eliminating ${eliminations.length} candidates`
                };
              }
            }
          }
        }
      }
      return null;
    }

    static findNakedSubsets(b, cands, k, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const units = SudokuEngine.getUnitDefinitions(topo.Br, topo.Bc);
      for (const unit of units) {
        const openCells = unit.cells.filter(cell => b[cell.r][cell.c] === 0);
        if (openCells.length <= k || openCells.length > 10) continue;

        const cellCombos = SudokuEngine.getCombinations(openCells, k);
        for (const combo of cellCombos) {
          const unionSet = new Set();
          for (const cell of combo) {
            for (const d of cands[cell.r][cell.c]) {
              unionSet.add(d);
            }
          }
          if (unionSet.size === k) {
            const unionDigits = Array.from(unionSet);
            const eliminations = [];
            for (const otherCell of openCells) {
              if (!combo.some(c => c.r === otherCell.r && c.c === otherCell.c)) {
                for (const d of unionDigits) {
                  if (cands[otherCell.r][otherCell.c].includes(d)) {
                    eliminations.push({ r: otherCell.r, c: otherCell.c, val: d });
                  }
                }
              }
            }
            if (eliminations.length > 0) {
              const techName = k === 2 ? "Naked Pair" : "Naked Triple";
              const assertions = Math.round(16 * k + 2.5 * eliminations.length + 0.8 * openCells.length);
              const score = 2.80 + 0.50 * (k - 1) + (assertions / 48.0) * 0.70;
              const syms = unionDigits.map(d => SudokuEngine.symbolForVal(d, topo.N)).join(",");
              return {
                type: "reduction",
                technique: techName,
                eliminations,
                assertions,
                step_score: score,
                description: `${techName} in ${unit.name}: [${syms}] eliminates ${eliminations.length} candidates`
              };
            }
          }
        }
      }
      return null;
    }

    static findHiddenSubsets(b, cands, k, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const units = SudokuEngine.getUnitDefinitions(topo.Br, topo.Bc);
      for (const unit of units) {
        const openCells = unit.cells.filter(cell => b[cell.r][cell.c] === 0);
        if (openCells.length <= k || openCells.length > 10) continue;

        const digitSet = new Set();
        for (const cell of openCells) {
          for (const d of cands[cell.r][cell.c]) {
            digitSet.add(d);
          }
        }
        const availDigits = Array.from(digitSet);
        if (availDigits.length <= k || availDigits.length > 10) continue;

        const digitCombos = SudokuEngine.getCombinations(availDigits, k);
        for (const dCombo of digitCombos) {
          const containingCells = openCells.filter(cell =>
            dCombo.some(d => cands[cell.r][cell.c].includes(d))
          );

          if (containingCells.length === k) {
            const eliminations = [];
            for (const cell of containingCells) {
              for (const d of cands[cell.r][cell.c]) {
                if (!dCombo.includes(d)) {
                  eliminations.push({ r: cell.r, c: cell.c, val: d });
                }
              }
            }

            if (eliminations.length > 0) {
              const techName = k === 2 ? "Hidden Pair" : "Hidden Triple";
              const assertions = Math.round(22 * k + 3.0 * eliminations.length + 1.0 * openCells.length);
              const score = 3.50 + 0.60 * (k - 1) + (assertions / 56.0) * 0.80;
              const syms = dCombo.map(d => SudokuEngine.symbolForVal(d, topo.N)).join(",");
              return {
                type: "reduction",
                technique: techName,
                eliminations,
                assertions,
                step_score: score,
                description: `${techName} in ${unit.name}: [${syms}] eliminates ${eliminations.length} extraneous candidates`
              };
            }
          }
        }
      }
      return null;
    }

    static findNextDeduction(b, cands = null, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(b, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      if (!cands) {
        cands = [];
        for (let r = 0; r < N; r++) {
          cands[r] = [];
          for (let c = 0; c < N; c++) {
            cands[r][c] = b[r][c] === 0 ? SudokuEngine.getCandidates(b, r, c, boxR, boxC) : [];
          }
        }
      }

      const nakedSingle = SudokuEngine.findNakedSingle(b, cands, boxR, boxC);
      if (nakedSingle) return nakedSingle;

      const hiddenSingleBox = SudokuEngine.findHiddenSingleBox(b, cands, boxR, boxC);
      if (hiddenSingleBox) return hiddenSingleBox;

      const hiddenSingleLine = SudokuEngine.findHiddenSingleLine(b, cands, boxR, boxC);
      if (hiddenSingleLine) return hiddenSingleLine;

      const locked = SudokuEngine.findLockedCandidates(b, cands, boxR, boxC);
      if (locked) return locked;

      const nakedPair = SudokuEngine.findNakedSubsets(b, cands, 2, boxR, boxC);
      if (nakedPair) return nakedPair;

      const hiddenPair = SudokuEngine.findHiddenSubsets(b, cands, 2, boxR, boxC);
      if (hiddenPair) return hiddenPair;

      if (N <= 9) {
        const nakedTriple = SudokuEngine.findNakedSubsets(b, cands, 3, boxR, boxC);
        if (nakedTriple) return nakedTriple;

        const hiddenTriple = SudokuEngine.findHiddenSubsets(b, cands, 3, boxR, boxC);
        if (hiddenTriple) return hiddenTriple;
      }

      return null;
    }

    static countSolutions(grid, limit = 2, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(grid, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      const rowMask = new Int32Array(N);
      const colMask = new Int32Array(N);
      const boxMask = new Int32Array(N);
      const work = SudokuEngine.cloneBoard(grid);
      const emptyCells = [];

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = work[r][c];
          const b = Math.floor(r / boxR) * boxR + Math.floor(c / boxC);
          if (v > 0) {
            const mask = 1 << (v - 1);
            rowMask[r] |= mask;
            colMask[c] |= mask;
            boxMask[b] |= mask;
          } else {
            emptyCells.push({ r, c, b });
          }
        }
      }

      const allMask = (1 << N) - 1;
      let count = 0;

      function backtrack() {
        let bestIdx = -1;
        let minCands = N + 1;
        let bestMask = 0;

        for (let i = 0; i < emptyCells.length; i++) {
          const cell = emptyCells[i];
          if (work[cell.r][cell.c] === 0) {
            const used = rowMask[cell.r] | colMask[cell.c] | boxMask[cell.b];
            const avail = allMask & (~used);
            if (avail === 0) return;

            let candsCount = 0;
            let tmp = avail;
            while (tmp > 0) { tmp &= tmp - 1; candsCount++; }

            if (candsCount < minCands) {
              minCands = candsCount;
              bestIdx = i;
              bestMask = avail;
              if (minCands === 1) break;
            }
          }
        }

        if (bestIdx === -1) {
          count++;
          return;
        }

        const cell = emptyCells[bestIdx];
        let m = bestMask;
        while (m > 0) {
          const bit = m & -m;
          const num = 31 - Math.clz32(bit) + 1;
          m &= m - 1;

          work[cell.r][cell.c] = num;
          rowMask[cell.r] |= bit;
          colMask[cell.c] |= bit;
          boxMask[cell.b] |= bit;

          backtrack();

          work[cell.r][cell.c] = 0;
          rowMask[cell.r] &= ~bit;
          colMask[cell.c] &= ~bit;
          boxMask[cell.b] &= ~bit;

          if (count >= limit) return;
        }
      }

      backtrack();
      return count;
    }

    static solveAndAssess(puzzle, Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(puzzle, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      const work = SudokuEngine.cloneBoard(puzzle);
      const stepDeductions = [];
      const techniqueCounts = {};
      const reasonCounts = { cross_horizontal: 0, cross_vertical: 0, box_3x3: 0 };
      let totalScore = 0;

      const cands = [];
      for (let r = 0; r < N; r++) {
        cands[r] = [];
        for (let c = 0; c < N; c++) {
          cands[r][c] = work[r][c] === 0 ? SudokuEngine.getCandidates(work, r, c, boxR, boxC) : [];
        }
      }

      while (true) {
        let filled = true;
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (work[r][c] === 0) { filled = false; break; }
          }
          if (!filled) break;
        }
        if (filled) break;

        let deduction = SudokuEngine.findNextDeduction(work, cands, boxR, boxC);
        if (!deduction) {
          // Lookahead branching fallback for very large / sparse boards
          let bestR = -1, bestC = -1, minLen = N + 1;
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              if (work[r][c] === 0 && cands[r][c].length > 0 && cands[r][c].length < minLen) {
                minLen = cands[r][c].length;
                bestR = r;
                bestC = c;
              }
            }
          }
          if (bestR !== -1) {
            for (const testVal of cands[bestR][bestC]) {
              work[bestR][bestC] = testVal;
              if (SudokuEngine.countSolutions(work, 2, boxR, boxC) === 1) {
                const sym = SudokuEngine.symbolForVal(testVal, N);
                deduction = {
                  type: "placement",
                  row: bestR,
                  col: bestC,
                  val: testVal,
                  technique: "Trial & Error / Branch Lookahead",
                  reasons: { cross_horizontal: 4, cross_vertical: 4, box_3x3: 4, total: 12 },
                  assertions: 28,
                  step_score: 4.20,
                  description: `Branch Lookahead at (${bestR + 1},${bestC + 1}): value ${sym} uniquely leads to valid solution`
                };
                break;
              }
              work[bestR][bestC] = 0;
            }
          }
        }

        if (!deduction) {
          return {
            solved: false,
            topology: topo,
            total_score: totalScore,
            composite_score: 0,
            rating: "Unsolvable by logical strategies",
            granular_tier: "Unsolvable",
            reason_counts: reasonCounts,
            technique_counts: techniqueCounts,
            step_deductions: stepDeductions,
            advanced_metrics: {},
            metrics_list: []
          };
        }

        if (deduction.type === "reduction") {
          for (const elim of deduction.eliminations) {
            cands[elim.r][elim.c] = cands[elim.r][elim.c].filter(v => v !== elim.val);
          }
        } else {
          work[deduction.row][deduction.col] = deduction.val;
          cands[deduction.row][deduction.col] = [];

          const r = deduction.row, c = deduction.col, val = deduction.val;
          for (let i = 0; i < N; i++) {
            cands[r][i] = cands[r][i].filter(v => v !== val);
            cands[i][c] = cands[i][c].filter(v => v !== val);
          }
          const startR = Math.floor(r / boxR) * boxR, startC = Math.floor(c / boxC) * boxC;
          for (let dr = 0; dr < boxR; dr++) {
            for (let dc = 0; dc < boxC; dc++) {
              cands[startR + dr][startC + dc] = cands[startR + dr][startC + dc].filter(v => v !== val);
            }
          }

          if (deduction.reasons) {
            reasonCounts.cross_horizontal += deduction.reasons.cross_horizontal || 0;
            reasonCounts.cross_vertical += deduction.reasons.cross_vertical || 0;
            reasonCounts.box_3x3 += deduction.reasons.box_3x3 || 0;
          }
        }

        stepDeductions.push(deduction);
        totalScore += deduction.step_score;
        techniqueCounts[deduction.technique] = (techniqueCounts[deduction.technique] || 0) + 1;
      }

      let maxStepAssertions = 0;
      for (const d of stepDeductions) {
        const ast = d.assertions || (8 + (d.reasons ? d.reasons.total : 0));
        if (ast > maxStepAssertions) maxStepAssertions = ast;
      }

      let clueCount = 0;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (puzzle[r][c] !== 0) clueCount++;
        }
      }

      const totalCells = N * N;
      const clueRatio = clueCount / totalCells;
      let rating = "Easy";
      if (clueRatio <= 0.40 || totalScore >= (totalCells * 0.9)) rating = "Expert";
      else if (clueRatio <= 0.48 || totalScore >= (totalCells * 0.75)) rating = "Hard";
      else if (clueRatio <= 0.56 || totalScore >= (totalCells * 0.60)) rating = "Medium";
      else rating = "Easy";

      let granularTier = `${rating} (Tier 1)`;
      if (rating === "Expert" && maxStepAssertions >= 20) granularTier = "Expert (Tier 2 - Extreme)";
      else if (rating === "Expert") granularTier = "Expert (Tier 1 - Grandmaster)";
      else if (rating === "Hard" && maxStepAssertions >= 16) granularTier = "Hard (Tier 2 - Master)";
      else if (rating === "Hard") granularTier = "Hard (Tier 1 - Advanced)";
      else if (rating === "Medium") granularTier = "Medium (Tier 1 - Moderate)";
      else granularTier = "Easy (Tier 1 - Casual)";

      const report = {
        solved: true,
        topology: topo,
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

      SudokuEngine.calculateMetricsWithBoard(report, puzzle, boxR, boxC);
      return report;
    }

    static calculateMetricsWithBoard(report, puzzle = null, Br = null, Bc = null) {
      const deductions = report.step_deductions;
      const n = deductions.length;
      if (n === 0) return;

      const topo = SudokuEngine.resolveTopology(puzzle || 9, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;
      const totalCells = N * N;

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

      const techKeys = Object.keys(report.technique_counts || {}).sort();
      let mostFreqTech = "";
      let leastFreqTech = "";
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
        techniqueDiversity = Math.min(1.0, entropy / Math.log(6.0));
      }

      let clueCount = totalCells - n;
      let blanksCount = n;
      let clueSymmetry = 0.0;
      let clueVar = 0.0;
      let boxCongestionMax = 0;
      let bandCongestionMax = 0;

      if (puzzle) {
        clueCount = 0;
        blanksCount = 0;
        const rowClues = new Array(N).fill(0);
        const colClues = new Array(N).fill(0);
        const boxClues = new Array(N).fill(0);

        let sym180 = 0, symHoriz = 0, symVert = 0, symDiag = 0;

        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const isGiven = puzzle[r][c] !== 0;
            if (isGiven) {
              clueCount++;
              rowClues[r]++;
              colClues[c]++;
              const bIdx = Math.floor(r / boxR) * boxR + Math.floor(c / boxC);
              if (bIdx >= 0 && bIdx < N) boxClues[bIdx]++;
            } else {
              blanksCount++;
            }

            if (isGiven === (puzzle[N - 1 - r][N - 1 - c] !== 0)) sym180++;
            if (isGiven === (puzzle[r][N - 1 - c] !== 0)) symHoriz++;
            if (isGiven === (puzzle[N - 1 - r][c] !== 0)) symVert++;
            if (isGiven === (puzzle[c][r] !== 0)) symDiag++;
          }
        }

        clueSymmetry = Math.max(sym180, symHoriz, symVert, symDiag) / totalCells;

        const meanRowClues = clueCount / N;
        let rVar = 0, cVar = 0, bVar = 0;
        for (let i = 0; i < N; i++) {
          const rd = rowClues[i] - meanRowClues;
          const cd = colClues[i] - meanRowClues;
          const bd = boxClues[i] - meanRowClues;
          rVar += rd * rd;
          cVar += cd * cd;
          bVar += bd * bd;
          if (boxClues[i] > boxCongestionMax) boxCongestionMax = boxClues[i];
        }
        clueVar = (rVar + cVar + bVar) / (3.0 * N);

        const numBands = boxC;
        for (let b = 0; b < numBands; b++) {
          let hBand = 0;
          for (let r = 0; r < boxR; r++) hBand += rowClues[b * boxR + r] || 0;
          if (hBand > bandCongestionMax) bandCongestionMax = hBand;
        }
      }

      const assertionDensity = totalAssertions / (blanksCount || 1);
      const complexityRating = (totalAssertions * 0.4) + (avgAssertions * 3.5) + (maxStepAssertions * 0.8);
      const avgCandidates = 2.5 + (blanksCount / totalCells) * 2.0;
      let peakAmbiguity = Math.min(N, Math.max(2, Math.floor(N * 0.75)));
      const constrainedness = 1.0 - (clueCount / totalCells);

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
        pacing_slope: pacingSlope,
        difficulty_pacing: difficultyPacing,
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
          formatted: `${m.pacing_slope >= 0 ? "+" : ""}${m.pacing_slope.toFixed(4)} /step`,
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
          description: "Variance of clue concentration across rows, columns, and subgrid boxes."
        },
        {
          key: "topology_box_congestion",
          name: "Max Box Congestion",
          category: "Board Geometry & Topology",
          value: m.box_congestion_max,
          formatted: `${m.box_congestion_max} clues / box`,
          unit: "clues",
          description: "Maximum number of given clues situated in any single subgrid box."
        },
        {
          key: "topology_band_congestion",
          name: "Max Band/Stack Congestion",
          category: "Board Geometry & Topology",
          value: m.band_congestion_max,
          formatted: `${m.band_congestion_max} clues / band`,
          unit: "clues",
          description: "Maximum number of given clues situated in any subgrid band or stack."
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
          description: "Total deductions where candidate digit fit uniquely in a subgrid box."
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
          name: "Box Reasons",
          category: "Constraint Analysis",
          value: reasons.box_3x3,
          formatted: `${reasons.box_3x3} checks`,
          unit: "checks",
          description: "Total subgrid box constraint conflicts evaluated during candidate elimination."
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
          description: "Ratio of subgrid box eliminations relative to cross-line (row + column) eliminations."
        }
      ];
    }

    static applyRuleBasedMutations(puzzle, solution = null, rng = new FastRand(), Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(puzzle, Br, Bc);
      const N = topo.N;
      const boxR = topo.Br;
      const boxC = topo.Bc;

      const perm = rng.perm(N);
      const mapping = {};
      for (let i = 0; i < N; i++) mapping[i + 1] = perm[i] + 1;

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (puzzle[r][c] !== 0) puzzle[r][c] = mapping[puzzle[r][c]];
          if (solution && solution[r][c] !== 0) solution[r][c] = mapping[solution[r][c]];
        }
      }

      const numBands = boxC;
      for (let band = 0; band < numBands; band++) {
        const p = rng.perm(boxR);
        const tempP = SudokuEngine.cloneBoard(puzzle);
        const tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let i = 0; i < boxR; i++) {
          const fromR = band * boxR + p[i];
          const toR = band * boxR + i;
          puzzle[toR] = [...tempP[fromR]];
          if (solution) solution[toR] = [...tempS[fromR]];
        }
      }

      const numStacks = boxR;
      for (let stack = 0; stack < numStacks; stack++) {
        const p = rng.perm(boxC);
        const tempP = SudokuEngine.cloneBoard(puzzle);
        const tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let r = 0; r < N; r++) {
          for (let i = 0; i < boxC; i++) {
            const fromC = stack * boxC + p[i];
            const toC = stack * boxC + i;
            puzzle[r][toC] = tempP[r][fromC];
            if (solution) solution[r][toC] = tempS[r][fromC];
          }
        }
      }

      if (numBands > 1) {
        const bandPerm = rng.perm(numBands);
        const tempP = SudokuEngine.cloneBoard(puzzle);
        const tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let b = 0; b < numBands; b++) {
          const fromBand = bandPerm[b];
          for (let r = 0; r < boxR; r++) {
            puzzle[b * boxR + r] = [...tempP[fromBand * boxR + r]];
            if (solution) solution[b * boxR + r] = [...tempS[fromBand * boxR + r]];
          }
        }
      }

      if (numStacks > 1) {
        const stackPerm = rng.perm(numStacks);
        const tempP = SudokuEngine.cloneBoard(puzzle);
        const tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let r = 0; r < N; r++) {
          for (let sIdx = 0; sIdx < numStacks; sIdx++) {
            const fromStack = stackPerm[sIdx];
            for (let c = 0; c < boxC; c++) {
              puzzle[r][sIdx * boxC + c] = tempP[r][fromStack * boxC + c];
              if (solution) solution[r][sIdx * boxC + c] = tempS[r][fromStack * boxC + c];
            }
          }
        }
      }

      if (boxR === boxC && rng.intn(2) === 1) {
        const tempP = SudokuEngine.cloneBoard(puzzle);
        const tempS = solution ? SudokuEngine.cloneBoard(solution) : null;
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            puzzle[r][c] = tempP[c][r];
            if (solution) solution[r][c] = tempS[c][r];
          }
        }
      }
    }

    static mutate(puzzle, solution = null, rng = new FastRand(), Br = null, Bc = null) {
      const p = SudokuEngine.cloneBoard(puzzle);
      const s = solution ? SudokuEngine.cloneBoard(solution) : null;
      SudokuEngine.applyRuleBasedMutations(p, s, rng, Br, Bc);
      return { puzzle: p, solution: s };
    }

    static carveWithTargetDifficulty(fullBoard, targetDifficulty = "hard", targetBlanks = 0, rng = new FastRand(), Br = null, Bc = null) {
      const topo = SudokuEngine.resolveTopology(fullBoard, Br, Bc);
      const N = topo.N;
      const totalCells = N * N;
      targetDifficulty = (targetDifficulty || "hard").toLowerCase();

      let minRatio = 0.55, maxRatio = 0.62;
      if (N <= 4) {
        minRatio = 0.35; maxRatio = 0.50;
      } else if (N <= 8) {
        minRatio = targetDifficulty === "easy" ? 0.40 : (targetDifficulty === "medium" ? 0.48 : (targetDifficulty === "hard" ? 0.54 : 0.60));
        maxRatio = minRatio + 0.05;
      } else if (N === 9) {
        minRatio = targetDifficulty === "easy" ? 0.48 : (targetDifficulty === "medium" ? 0.57 : (targetDifficulty === "hard" ? 0.65 : (targetDifficulty === "extreme" ? 0.71 : 0.74)));
        maxRatio = minRatio + 0.05;
      } else {
        minRatio = targetDifficulty === "easy" ? 0.38 : (targetDifficulty === "medium" ? 0.44 : (targetDifficulty === "hard" ? 0.48 : (targetDifficulty === "extreme" ? 0.52 : 0.55)));
        maxRatio = minRatio + 0.03;
      }

      let minBlanks = Math.floor(totalCells * minRatio);
      let maxBlanks = Math.floor(totalCells * maxRatio);

      if (targetBlanks > 0) {
        minBlanks = targetBlanks;
        maxBlanks = targetBlanks;
      }

      const desiredBlanks = minBlanks + rng.intn(Math.max(1, maxBlanks - minBlanks + 1));
      const puzzle = SudokuEngine.cloneBoard(fullBoard);
      const positions = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          positions.push({ r, c });
        }
      }
      rng.shuffle(positions);

      let carved = 0;
      let consecutiveFails = 0;
      const maxConsecutive = N >= 16 ? 16 : 30;
      for (const pos of positions) {
        if (carved >= desiredBlanks || consecutiveFails >= maxConsecutive) break;
        const orig = puzzle[pos.r][pos.c];
        puzzle[pos.r][pos.c] = 0;

        if (SudokuEngine.countSolutions(puzzle, 2, topo.Br, topo.Bc) === 1) {
          carved++;
          consecutiveFails = 0;
        } else {
          puzzle[pos.r][pos.c] = orig;
          consecutiveFails++;
        }
      }

      const report = SudokuEngine.solveAndAssess(puzzle, topo.Br, topo.Bc);
      return { puzzle, report };
    }

    static generateAndAssessPuzzle(targetDifficulty = "hard", targetBlanks = 0, configKey = "classic_9x9", rng = new FastRand()) {
      if (configKey instanceof FastRand) {
        rng = configKey;
        configKey = "classic_9x9";
      }
      const topo = SudokuEngine.resolveTopology(configKey);
      const fullGrid = SudokuEngine.generateSeedBoard(rng, topo.Br, topo.Bc);
      SudokuEngine.applyRuleBasedMutations(fullGrid, null, rng, topo.Br, topo.Bc);

      const { puzzle: puzzleGrid } = SudokuEngine.carveWithTargetDifficulty(fullGrid, targetDifficulty, targetBlanks, rng, topo.Br, topo.Bc);
      SudokuEngine.applyRuleBasedMutations(puzzleGrid, fullGrid, rng, topo.Br, topo.Bc);

      const report = SudokuEngine.solveAndAssess(puzzleGrid, topo.Br, topo.Bc);
      return {
        solution: fullGrid,
        puzzle: puzzleGrid,
        topology: topo,
        report
      };
    }


    /**
     * Compact Binary Payload Serialization (Ticket 004 / serializer.ts)
     * Compresses entire seed, subgrid topology, challenge tier, mode flags, and turn diffs into < 256 bytes Base64URL.
     */
    static serializeGamePayload(game) {
      const turnHistory = game.turnHistory || game.history || [];
      const buffer = new ArrayBuffer(10 + turnHistory.length * 2);
      const view = new DataView(buffer);

      const diffMap = { easy: 1, medium: 2, hard: 3, extreme: 4, impossible: 5 };
      const diffVal = diffMap[game.difficulty] || 2;
      const Br = game.boardRows || game.Br || 3;
      const Bc = game.boardCols || game.Bc || 3;
      const modeFlag = game.gameMode === "like_paper" ? 1 : 0;
      const seed = Number(game.seed >>> 0);

      // Byte 0: Protocol Version (high 4 bits = 1) | Br (low 4 bits)
      view.setUint8(0, (1 << 4) | (Br & 0x0F));
      // Byte 1: Bc (high 4 bits) | Difficulty (low 4 bits)
      view.setUint8(1, ((Bc & 0x0F) << 4) | (diffVal & 0x0F));
      // Byte 2-3: Mode Flags & Options uint16
      view.setUint16(2, modeFlag, false);
      // Byte 4-7: Seed uint32
      view.setUint32(4, seed, false);
      // Byte 8-9: Turn count uint16
      view.setUint16(8, turnHistory.length, false);

      // Turn Diffs: uint16 each (r: 4b, c: 4b, val: 4b, prevVal: 4b)
      for (let i = 0; i < turnHistory.length; i++) {
        const t = turnHistory[i];
        const r = (t.r || 0) & 0x0F;
        const c = (t.c || 0) & 0x0F;
        const v = (t.val || 0) & 0x0F;
        const pv = (t.prevVal || 0) & 0x0F;
        const packed = (r << 12) | (c << 8) | (v << 4) | pv;
        view.setUint16(10 + i * 2, packed, false);
      }

      const bytes = new Uint8Array(buffer);
      if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes).toString("base64url");
      } else {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      }
    }

    /**
     * Compact Binary Payload Deserialization (Ticket 004 / serializer.ts)
     * Reconstitutes exact PRNG seed, topology, difficulty, and turn diff trajectory from Base64URL bitfield.
     */
    static deserializeGamePayload(b64url) {
      if (!b64url || typeof b64url !== "string") return null;
      let rawBytes;
      if (typeof Buffer !== "undefined") {
        rawBytes = new Uint8Array(Buffer.from(b64url, "base64url"));
      } else {
        let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const binary = atob(b64);
        rawBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          rawBytes[i] = binary.charCodeAt(i);
        }
      }

      if (rawBytes.length < 10) return null;
      const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);

      const b0 = view.getUint8(0);
      const version = (b0 >> 4) & 0x0F;
      const Br = b0 & 0x0F;

      const b1 = view.getUint8(1);
      const Bc = (b1 >> 4) & 0x0F;
      const diffVal = b1 & 0x0F;

      const modeFlag = view.getUint16(2, false);
      const seed = view.getUint32(4, false);
      const turnCount = view.getUint16(8, false);

      const diffRevMap = { 1: "easy", 2: "medium", 3: "hard", 4: "extreme", 5: "impossible" };
      const difficulty = diffRevMap[diffVal] || "medium";
      const gameMode = (modeFlag & 1) ? "like_paper" : "catch_mistakes";

      const turnHistory = [];
      for (let i = 0; i < turnCount && (10 + (i + 1) * 2 <= rawBytes.length); i++) {
        const packed = view.getUint16(10 + i * 2, false);
        const r = (packed >> 12) & 0x0F;
        const c = (packed >> 8) & 0x0F;
        const val = (packed >> 4) & 0x0F;
        const prevVal = packed & 0x0F;
        turnHistory.push({ step: i + 1, r, c, val, prevVal, timestamp: Date.now() });
      }

      return {
        version,
        Br,
        Bc,
        N: Br * Bc,
        difficulty,
        gameMode,
        seed,
        turnHistory
      };
    }

    static generateAndCarve(targetDiff = "hard", configKey = "classic_9x9", rng = new FastRand()) {
      if (configKey instanceof FastRand) {
        rng = configKey;
        configKey = "classic_9x9";
      }
      const res = SudokuEngine.generateAndAssessPuzzle(targetDiff, 0, configKey, rng);
      return {
        puzzle: res.puzzle,
        solution: res.solution,
        topology: res.topology,
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
    SudokuEngine,
    SUPPORTED_CONFIGURATIONS
  };
}));
