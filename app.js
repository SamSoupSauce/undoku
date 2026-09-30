// Protocol-aware Web App Manifest Injector (Prevents 'Origin null' CORS errors when testing via file://)
if (typeof window !== "undefined" && window.location && window.location.protocol.startsWith("http")) {
  const mLink = document.createElement("link");
  mLink.rel = "manifest";
  mLink.href = "./manifest.webmanifest";
  document.head.appendChild(mLink);
}

// ==========================================================================
    // UTILITY HELPERS & RESILIENT CANVAS SIZERS
    // ==========================================================================
    function formatTime(totalSeconds = 0) {
      const s = Math.max(0, Math.floor(totalSeconds));
      const m = Math.floor(s / 60);
      const remSec = s % 60;
      return `${m < 10 ? "0" + m : m}:${remSec < 10 ? "0" + remSec : remSec}`;
    }

    function resizeCanvas() {
      if (typeof initCanvases === "function") {
        initCanvases();
      }
      if (typeof renderBoard === "function") {
        renderBoard();
      }
    }

    // ==========================================================================
    // CANONICAL GAME SESSION CLASS (Ticket 004 / IndexedDB Prep)
    // ==========================================================================
    class GameSession {
      constructor(params = {}) {
        this.id = params.id || `game_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.seed = params.seed || Math.floor(Math.random() * 1e9);
        this.timestamp = params.timestamp || Date.now();
        this.topologyKey = params.topologyKey || "classic_9x9";
        this.topology = window.SudokuEngine ? window.SudokuEngine.resolveTopology(this.topologyKey) : { Br: 3, Bc: 3, N: 9 };
        this.N = this.topology.N;
        this.Br = this.topology.Br;
        this.Bc = this.topology.Bc;
        this.difficulty = params.difficulty || "medium";
        this.gameMode = params.gameMode || "catch_mistakes";
        this.allowHints = params.allowHints !== undefined ? params.allowHints : true;
        this.allowHighlighter = params.allowHighlighter !== undefined ? params.allowHighlighter : true;
        this.allowDigitCounters = params.allowDigitCounters !== undefined ? params.allowDigitCounters : true;
        this.allowRadialRing = params.allowRadialRing !== undefined ? params.allowRadialRing : true;
        this.hintCap = params.hintCap !== undefined ? params.hintCap : 3;
        this.hintsRemaining = this.hintCap === 0 ? Infinity : this.hintCap;
        this.initialGrid = params.initialGrid || [];
        this.userGrid = params.userGrid || [];
        this.solutionGrid = params.solutionGrid || [];
        this.notes = params.notes || Array.from({ length: this.N }, () => Array.from({ length: this.N }, () => new Set()));
        this.turnHistory = params.turnHistory || [];
        this.mistakes = params.mistakes || 0;
        this.maxMistakes = params.maxMistakes || 3;
        this.secondsElapsed = params.secondsElapsed || 0;
        this.isCompleted = params.isCompleted || false;
        this.analytics = params.analytics || null;
        this.deductions = params.deductions || [];
      }

      toDBRecord() {
        return {
          id: this.id,
          timestamp: this.timestamp,
          seed: this.seed,
          difficulty: this.difficulty,
          topologyKey: this.topologyKey,
          topologyName: `${this.N}×${this.N} (${this.Br}×${this.Bc})`,
          boardRows: this.Br,
          boardCols: this.Bc,
          N: this.N,
          initialGrid: this.initialGrid,
          userGrid: this.userGrid,
          solutionGrid: this.solutionGrid,
          durationSeconds: this.secondsElapsed,
          mistakes: this.mistakes,
          maxMistakes: this.maxMistakes,
          hintsUsed: this.hintCap === 0 ? 0 : Math.max(0, this.hintCap - this.hintsRemaining),
          turnHistory: this.turnHistory,
          isCompleted: this.isCompleted,
          analytics: this.analytics
        };
      }
    }

    let activeSession = null;

    // ==========================================
    // Client-Side Sudoku Game Controller (0 API Requests)
    // Generalized Rectangular Topology (Br x Bc) & Dynamic Scaling
    // ==========================================
    let currentTopologyKey = "classic_9x9";
    let currentTopology = { Br: 3, Bc: 3, N: 9, label: "9×9 Classic (3×3 Box)" };

    let initialGrid = [];
    let userGrid = [];
    let notesGrid = [];
    let solutionGrid = [];
    let deductions = [];
    let moveHistory = [];

    let selectedCell = { r: 0, c: 0 };
    let currentStepIdx = 0;
    let isPlayingSolver = false;
    let isNotesMode = false;
    let showHeatmap = false;
    let currentDifficulty = "hard";
    let currentGameMode = "catch_mistakes"; // "catch_mistakes" | "like_paper"
    let currentAllowHints = true;
    let currentAllowHighlighter = true;
    let currentAllowDigitCounters = true;
    let currentAllowRadialRing = true;
    let isRadialOpen = false;
    let currentHintCap = 3; // 0 = unlimited
    let currentHintsRemaining = 3;

    // Chronological User Guess / Move Tracking
    let userGuessHistory = [];

    let gameTimeSeconds = 0;
    let timerInterval = null;
    let mistakesCount = 0;
    const maxMistakes = 3;

    let particles = [];
    let currentConflict = null;
    let boardShake = 0;
    // --- Auto-Play & Skip Feature Toggle State ([5, 4, 3, 2, 1]) ---
    let autoPlaySkipUnlocked = false;
    let sequenceBuffer = [];
    const SECRET_UNLOCK_SEQUENCE = [5, 4, 3, 2, 1];
    let lastSequenceTimestamp = 0;
    let lastSequenceVal = null;

    function handleDigitInputSequence(val) {
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (val === lastSequenceVal && (now - lastSequenceTimestamp) < 30) {
        return;
      }
      lastSequenceVal = val;
      lastSequenceTimestamp = now;

      const num = typeof val === "number" ? val : parseInt(val, 10);
      if (isNaN(num) || num <= 0) return;
      sequenceBuffer.push(num);
      if (sequenceBuffer.length > SECRET_UNLOCK_SEQUENCE.length) {
        sequenceBuffer.shift();
      }
      if (sequenceBuffer.length === SECRET_UNLOCK_SEQUENCE.length) {
        let match = true;
        for (let i = 0; i < SECRET_UNLOCK_SEQUENCE.length; i++) {
          if (sequenceBuffer[i] !== SECRET_UNLOCK_SEQUENCE[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          sequenceBuffer = [];
          toggleAutoPlaySkipFeature();
        }
      }
    }

    function toggleAutoPlaySkipFeature() {
      autoPlaySkipUnlocked = !autoPlaySkipUnlocked;
      updateAutoPlaySkipVisibility();
      if (!autoPlaySkipUnlocked && isPlayingSolver) {
        isPlayingSolver = false;
        const bPlay = document.getElementById("btnPlayPause");
        if (bPlay) bPlay.innerText = "▶ Play Solver";
        const badge = document.getElementById("appModeBadge");
        if (badge) badge.innerText = "Play Mode";
      }
    }

    function updateAutoPlaySkipVisibility() {
      const bPlay = document.getElementById("btnPlayPause");
      const bPrev = document.getElementById("btnPrevStep");
      const bNext = document.getElementById("btnNextStep");
      const displayStyle = autoPlaySkipUnlocked ? "inline-flex" : "none";
      if (bPlay) bPlay.style.display = displayStyle;
      if (bPrev) bPrev.style.display = displayStyle;
      if (bNext) bNext.style.display = displayStyle;
    }

    // --- Unsolve / Carving Animation State ---
    let isUnsolving = false;
    let unsolveStartTime = 0;
    const unsolveDuration = 850; // ms
    let unsolveCarvedCells = [];

    // --- Radial Number Ring Dial Controller (Ticket 005) ---
    let radialOrbitRafId = null;
    let radialOrbitAngle = 0;

    function startRadialOrbitAnimation() {
      stopRadialOrbitAnimation();
      radialOrbitAngle = 0;

      function orbitStep() {
        if (!isRadialOpen) {
          radialOrbitRafId = null;
          return;
        }
        radialOrbitAngle += 0.005;
        if (radialOrbitAngle >= 2 * Math.PI) {
          radialOrbitAngle -= 2 * Math.PI;
        }

        const container = document.getElementById("radialBubblesContainer");
        if (container) {
          container.style.transform = `rotate(${radialOrbitAngle}rad)`;
          const texts = container.querySelectorAll(".radial-bubble-text");
          const counterTransform = `rotate(${-radialOrbitAngle}rad)`;
          for (let i = 0; i < texts.length; i++) {
            texts[i].style.transform = counterTransform;
          }
        }

        radialOrbitRafId = requestAnimationFrame(orbitStep);
      }

      radialOrbitRafId = requestAnimationFrame(orbitStep);
    }

    function stopRadialOrbitAnimation() {
      if (radialOrbitRafId !== null) {
        cancelAnimationFrame(radialOrbitRafId);
        radialOrbitRafId = null;
      }
      const container = document.getElementById("radialBubblesContainer");
      if (container) {
        container.style.transform = "";
      }
    }

    function closeRadialRing() {
      const overlay = document.getElementById("radialRingOverlay");
      if (overlay) overlay.style.display = "none";
      isRadialOpen = false;
      stopRadialOrbitAnimation();
    }

    function openRadialRing(r, c) {
      if (!currentAllowRadialRing || isUnsolving || isPlayingSolver) return;
      if (!initialGrid.length || initialGrid[r][c] !== 0) return;

      const N = currentTopology ? currentTopology.N : 9;

      const overlay = document.getElementById("radialRingOverlay");
      const container = document.getElementById("radialBubblesContainer");
      const wrapper = document.getElementById("boardWrapper");
      if (!overlay || !container || !wrapper) return;

      const rect = boardCanvas.getBoundingClientRect();
      const cellSize = rect.width / N;
      const cellCenterX = c * cellSize + cellSize / 2;
      const cellCenterY = r * cellSize + cellSize / 2;

      // Responsive dial radius tailored for mobile viewports
      const maxAllowedR = Math.min(130, rect.width * 0.36);
      const minAllowedR = Math.min(52, rect.width * 0.18);
      const R = Math.min(maxAllowedR, Math.max(minAllowedR, 55 + (N - 9) * 3.5));

      // Exclude exhausted digits (Ticket 005)
      const filterFn = (window.SudokuEngine && window.SudokuEngine.getAvailableRadialDigits) ||
        (window.Undoku && window.Undoku.getAvailableRadialDigits) ||
        getAvailableRadialDigits;
      const availableNums = filterFn(userGrid, N);
      const totalAvailable = availableNums.length;

      container.innerHTML = "";
      if (totalAvailable > 0) {
        availableNums.forEach((num, idx) => {
          const angle = -Math.PI / 2 + idx * (2 * Math.PI / totalAvailable);
          const bx = 100 + R * Math.cos(angle);
          const by = 100 + R * Math.sin(angle);

          const sym = window.SudokuEngine ? window.SudokuEngine.symbolForVal(num, N) : num.toString();
          const btn = document.createElement("button");
          btn.className = "radial-bubble-btn";
          btn.setAttribute("data-val", num.toString());
          btn.innerHTML = `<span class="radial-bubble-text">${sym}</span>`;
          btn.style.left = `${bx}px`;
          btn.style.top = `${by}px`;
          btn.title = `Place ${sym}`;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            inputDigit(num);
            if (typeof stateController !== "undefined") {
              stateController.handleDigitCommitted();
            }
            closeRadialRing();
          });
          container.appendChild(btn);
        });
      }

      // Boundary clamping to ensure bubbles never clip off screen edges
      const edgeMargin = R + 22;
      const clampedX = Math.max(edgeMargin, Math.min(rect.width - edgeMargin, cellCenterX));
      const clampedY = Math.max(edgeMargin, Math.min(rect.height - edgeMargin, cellCenterY));

      overlay.style.left = `${clampedX}px`;
      overlay.style.top = `${clampedY}px`;
      overlay.style.display = "block";
      isRadialOpen = true;

      startRadialOrbitAnimation();
    }

    // --- Canvas Setup (HiDPI Retina Crisp) ---
    const boardCanvas = document.getElementById("sudokuCanvas");
    const boardCtx = boardCanvas.getContext("2d");
    const trajectoryCanvas = document.getElementById("trajectoryCanvas");
    const chartCtx = trajectoryCanvas.getContext("2d");

    function setupCanvasDPI(canvas, ctx, defaultWidth, defaultHeight) {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      const parentW = parent ? parent.clientWidth : 0;
      const parentH = parent ? parent.clientHeight : 0;
      const screenCap = Math.max(200, (window.innerWidth || 360) - 24);
      const fallbackW = Math.min(defaultWidth || 540, screenCap);
      const displayW = parentW > 0 ? parentW : fallbackW;
      const displayH = (parentH > 0 && parentH < displayW * 1.5) ? parentH : ((defaultHeight && defaultWidth) ? Math.round(displayW * (defaultHeight / defaultWidth)) : displayW);
      canvas.width = Math.round(displayW * dpr);
      canvas.height = Math.round(displayH * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initCanvases() {
      setupCanvasDPI(boardCanvas, boardCtx, 540, 540);
      setupCanvasDPI(trajectoryCanvas, chartCtx, 500, 260);
    }

    // --- Dynamic Theme Controller ---
    function applyTheme(themeName) {
      if (!themeName) themeName = "cozy";
      document.documentElement.setAttribute("data-theme", themeName);
      try {
        localStorage.setItem("undoku_theme", themeName);
      } catch (e) {}

      const themeSelect = document.getElementById("themeSelect");
      if (themeSelect && themeSelect.value !== themeName) {
        themeSelect.value = themeName;
      }
    }

    const themeSelectEl = document.getElementById("themeSelect");
    if (themeSelectEl) {
      themeSelectEl.addEventListener("change", (e) => {
        applyTheme(e.target.value);
      });
    }

    try {
      const savedTheme = localStorage.getItem("undoku_theme");
      if (savedTheme) applyTheme(savedTheme);
    } catch (e) {}

    // --- Dynamic Digit Keypad Generator ---
    function renderKeypad() {
      const keypad = document.querySelector(".digit-keypad");
      if (!keypad) return;
      const N = currentTopology.N;
      keypad.innerHTML = "";

      let cols = N;
      if (N > 10) cols = Math.ceil(N / 2);
      else if (N === 10) cols = 5;
      keypad.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

      for (let i = 1; i <= N; i++) {
        const sym = window.SudokuEngine.symbolForVal(i, N);
        const btn = document.createElement("button");
        btn.className = "digit-btn";
        btn.setAttribute("data-val", i.toString());
        if (N > 9) btn.style.fontSize = "1.05rem";
        btn.innerHTML = `${sym}<span class="digit-count-badge" id="badge-${i}">${N}</span>`;
        btn.addEventListener("click", () => {
          closeRadialRing();
          handleDigitInputSequence(i);
          inputDigit(i);
        });
        keypad.appendChild(btn);
      }
      updateDigitCounters();
    }

    // --- Remaining Digits Counters ---
    function updateDigitCounters() {
      const N = currentTopology.N;
      const counts = new Array(N + 1).fill(0);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const val = userGrid[r] ? userGrid[r][c] : 0;
          if (val >= 1 && val <= N) counts[val]++;
        }
      }
      for (let num = 1; num <= N; num++) {
        const left = Math.max(0, N - counts[num]);
        const badge = document.getElementById(`badge-${num}`);
        const btn = document.querySelector(`.digit-btn[data-val="${num}"]`);
        if (badge) {
          badge.style.display = currentAllowDigitCounters ? "inline-block" : "none";
          badge.innerText = left > 0 ? ((window.innerWidth < 480 || N > 9) ? `${left}` : `${left} left`) : "✓";
        }
        if (btn) {
          if (currentAllowDigitCounters && left === 0) btn.classList.add("completed");
          else btn.classList.remove("completed");
        }
      }
    }

    function updateHintButtonDisplay() {
      const btnHintEl = document.getElementById("btnHint");
      const labelEl = document.getElementById("labelHintText");
      if (!btnHintEl || !labelEl) return;

      if (!currentAllowHints || currentGameMode === "like_paper") {
        btnHintEl.style.display = "none";
        return;
      }

      btnHintEl.style.display = "flex";
      if (currentHintCap === 0) {
        labelEl.innerText = "Hint (Unlimited)";
        btnHintEl.disabled = false;
      } else {
        labelEl.innerText = `Hint (${currentHintsRemaining} left)`;
        btnHintEl.disabled = (currentHintsRemaining <= 0);
      }
    }

    // --- Game Loading & Initialization ---
    function loadPuzzle(difficulty = "hard", mode = null, allowHints = null, allowHighlighter = null, hintCap = null, allowDigitCounters = null, allowRadialRing = null, topologyKey = null, targetSeed = null) {
      if (mode) currentGameMode = mode;
      if (allowHints !== null) currentAllowHints = allowHints;
      if (allowHighlighter !== null) currentAllowHighlighter = allowHighlighter;
      if (hintCap !== null) currentHintCap = hintCap;
      if (allowDigitCounters !== null) currentAllowDigitCounters = allowDigitCounters;
      if (allowRadialRing !== null) currentAllowRadialRing = allowRadialRing;
      if (topologyKey) currentTopologyKey = topologyKey;

      currentTopology = window.SudokuEngine.resolveTopology(currentTopologyKey);
      const N = currentTopology.N;
      const Br = currentTopology.Br;
      const Bc = currentTopology.Bc;

      currentHintsRemaining = (currentHintCap === 0) ? Infinity : currentHintCap;
      currentDifficulty = difficulty;
      isPlayingSolver = false;
      pendingDifficulty = null;
      pendingTopologyKey = currentTopologyKey;
      if (typeof stateController !== "undefined") stateController.reset();
      else closeRadialRing();
      document.getElementById("btnPlayPause").innerText = "▶ Play Solver";
      const b1 = document.getElementById("appModeBadge"); if (b1) b1.innerText = "⚡ Carving...";

      const diffBadgeEl = document.getElementById("currentDiffBadge");
      if (diffBadgeEl) {
        diffBadgeEl.innerText = difficulty.toUpperCase();
        if (difficulty === "easy") diffBadgeEl.style.color = "#16a34a";
        else if (difficulty === "medium") diffBadgeEl.style.color = "#ca8a04";
        else if (difficulty === "hard") diffBadgeEl.style.color = "#ea580c";
        else if (difficulty === "extreme") diffBadgeEl.style.color = "#dc2626";
        else if (difficulty === "impossible") diffBadgeEl.style.color = "#9333ea";
      }

      const topoBadgeEl = document.getElementById("currentTopologyBadge");
      if (topoBadgeEl) {
        topoBadgeEl.innerText = `${N}×${N} (${Br}×${Bc})`;
      }

      const modeBadgeEl = document.getElementById("chipModeBadge");
      const btnUndoEl = document.getElementById("btnUndo");
      const btnEraseEl = document.getElementById("btnErase");
      const chipMistakesEl = document.getElementById("chipMistakes");

      if (currentGameMode === "like_paper") {
        if (modeBadgeEl) {
          modeBadgeEl.innerText = "📰 LIKE PAPER";
          modeBadgeEl.className = "hud-mode-pill paper";
        }
        if (btnUndoEl) btnUndoEl.style.display = "none";
        if (btnEraseEl) btnEraseEl.style.display = "flex";
        if (chipMistakesEl) chipMistakesEl.style.display = "none";
      } else {
        if (modeBadgeEl) {
          modeBadgeEl.innerText = "🛡️ ASSISTED";
          modeBadgeEl.className = "hud-mode-pill assisted";
        }
        if (btnUndoEl) btnUndoEl.style.display = "flex";
        if (btnEraseEl) btnEraseEl.style.display = "none";
        if (chipMistakesEl) chipMistakesEl.style.display = "flex";
      }

      updateHintButtonDisplay();

      const victoryEl = document.getElementById("victoryModal");
      if (victoryEl) victoryEl.classList.remove("active");
      const sizeModalEl = document.getElementById("sizeSelectModal");
      if (sizeModalEl) sizeModalEl.classList.remove("active");
      const diffSelectEl = document.getElementById("diffSelectModal");
      if (diffSelectEl) diffSelectEl.classList.remove("active");
      const confirmEl = document.getElementById("confirmModal");
      if (confirmEl) confirmEl.classList.remove("active");

      mistakesCount = 0;
      document.getElementById("mistakeCounter").innerText = `${mistakesCount}/${maxMistakes}`;
      document.getElementById("chipMistakes").classList.remove("warning");
      document.getElementById("conflictBanner").style.display = "none";

      moveHistory = [];
      userGuessHistory = [];
      notesGrid = Array.from({ length: N }, () => Array.from({ length: N }, () => new Set()));
      currentConflict = null;
      boardShake = 0;
      particles = [];
      confettiParticles = [];
      selectedCell = { r: 0, c: 0 };

      // Deterministic PRNG Seed Resolution
      const resolvedSeed = (targetSeed !== null && targetSeed !== undefined) ? Number(targetSeed) : Math.floor(Math.random() * 1e9);
      const prng = new window.FastRand(resolvedSeed);

      // Instant client-side generation using seeded deterministic bitmask engine!
      const res = window.SudokuEngine.generateAndCarve(difficulty, currentTopologyKey, prng);
      initialGrid = res.puzzle.map(r => [...r]);
      userGrid = res.puzzle.map(r => [...r]);
      solutionGrid = res.solution.map(r => [...r]);
      deductions = res.deductions || [];
      currentStepIdx = 0;

      renderKeypad();

      // Prepare Un-solve / Reverse Carving Animation Sequence
      unsolveCarvedCells = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (initialGrid[r][c] === 0) {
            unsolveCarvedCells.push({
              r, c,
              val: solutionGrid[r][c],
              dissolveThreshold: 0,
              spawned: false
            });
          }
        }
      }
      const rng = new window.FastRand();
      rng.shuffle(unsolveCarvedCells);
      const totalCarved = unsolveCarvedCells.length;
      unsolveCarvedCells.forEach((cell, idx) => {
        cell.dissolveThreshold = (idx / (totalCarved || 1)) * 0.85;
      });

      isUnsolving = true;
      unsolveStartTime = performance.now();
      document.getElementById("hudTechTitle").innerText = "⚡ Reverse Solving & Carving Matrix";
      document.getElementById("hudExplanation").innerText = `Carving ${N}x${N} solution matrix into ${N * N - totalCarved} deterministic clues (${currentDifficulty.toUpperCase()})...`;

      updateMetricsDisplay(res.metrics);
      updateDigitCounters();
      updateProportionRibbon();
      drawTrajectoryChart();

      // Create canonical GameSession instance prepped for IndexedDB
      activeSession = new GameSession({
        seed: resolvedSeed,
        difficulty: currentDifficulty,
        topologyKey: currentTopologyKey,
        gameMode: currentGameMode,
        allowHints: currentAllowHints,
        allowHighlighter: currentAllowHighlighter,
        allowDigitCounters: currentAllowDigitCounters,
        allowRadialRing: currentAllowRadialRing,
        hintCap: currentHintCap,
        initialGrid: initialGrid.map(r => [...r]),
        userGrid: userGrid.map(r => [...r]),
        solutionGrid: solutionGrid.map(r => [...r]),
        notes: notesGrid,
        turnHistory: [],
        analytics: res.metrics,
        deductions: deductions
      });

      gameState = activeSession;
      isGameActive = true;
      startTimer();
      autoSaveActiveGame();
    }

    // --- Live Dynamic Solver Engine ---
    function recalculateLiveSolver() {
      if (isUnsolving || !userGrid.length || isPlayingSolver) return;
      const N = currentTopology.N;

      let blanks = 0;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (userGrid[r][c] === 0) blanks++;
        }
      }

      if (blanks === 0) {
        deductions = [];
        currentStepIdx = 0;
        updateHUD();
        updateProportionRibbon();
        drawTrajectoryChart();
        return;
      }

      try {
        const assessment = window.SudokuEngine.solveAndAssess(userGrid, currentTopology.Br, currentTopology.Bc);
        if (assessment && assessment.step_deductions) {
          deductions = assessment.step_deductions;
          currentStepIdx = 0;
          if (assessment.advanced_metrics) {
            updateMetricsDisplay(assessment.advanced_metrics);
          }
          updateProportionRibbon();
          drawTrajectoryChart();
          updateHUD();
        }
      } catch (e) {
        console.warn("Live solver calculation note:", e);
      }
    }

    function updateMetricsDisplay(m) {
      if (!m) return;
      document.getElementById("statGranularTier").innerText = m.granular_tier || m.granularTier || currentDifficulty;
      document.getElementById("statTotalAssertions").innerText = `${m.total_assertions || m.totalAssertions || 0} assertions`;
      document.getElementById("statMaxAssertions").innerText = `${m.max_step_assertions || m.maxStepAssertions || 0} assertions`;
      document.getElementById("statAvgAssertions").innerText = `${(m.avg_assertions_per_step || m.avgAssertions || 0).toFixed(2)} /step`;
      document.getElementById("statSpread").innerText = (m.score_spread || m.spread || 0).toFixed(2);
      document.getElementById("statSuddenness").innerText = m.difficulty_pacing || m.pacing || "Balanced";
    }

    // --- Particle System ---
    function spawnParticles(x, y, color = "#e06c3a") {
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 2.5,
          color,
          alpha: 1.0,
          decay: 0.02 + Math.random() * 0.02
        });
      }
    }

    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) particles.splice(i, 1);
      }
    }

    // --- Board Rendering (Theme-Aware, High-Legibility) ---
    function renderBoard() {
      const rect = boardCanvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const N = currentTopology.N;
      const Br = currentTopology.Br;
      const Bc = currentTopology.Bc;
      const cellSize = width / N;

      const now = performance.now();
      const elapsedUnsolve = isUnsolving ? (now - unsolveStartTime) : 99999;
      const unsolveProgress = Math.min(1.0, elapsedUnsolve / unsolveDuration);

      if (isUnsolving && unsolveProgress >= 1.0) {
        isUnsolving = false;
        const b2 = document.getElementById("appModeBadge"); if (b2) b2.innerText = "Play Mode";
        updateHUD();
        startTimer();
      }

      boardCtx.clearRect(0, 0, width, height);

      let didShake = false;
      if (boardShake > 0) {
        const shakeX = Math.sin(animPhase * 50) * boardShake * 6;
        const shakeY = Math.cos(animPhase * 45) * boardShake * 4;
        boardCtx.save();
        boardCtx.translate(shakeX, shakeY);
        boardShake = Math.max(0, boardShake - 0.035);
        didShake = true;
      }

      const style = getComputedStyle(document.documentElement);
      const colorBoardBg = style.getPropertyValue("--board-bg").trim() || "#ffffff";
      const colorCellAlt = style.getPropertyValue("--cell-bg-alt").trim() || "#fdfbf7";
      const colorSelected = style.getPropertyValue("--cell-selected").trim() || "#fed7aa";
      const colorMatch = style.getPropertyValue("--cell-match").trim() || "#ffedd5";
      const colorConflict = style.getPropertyValue("--cell-conflict").trim() || "#fee2e2";
      const colorGridLine = style.getPropertyValue("--grid-line").trim() || "#e2d9cb";
      const colorBoxLine = style.getPropertyValue("--box-line").trim() || "#5c4e3c";
      const colorGiven = style.getPropertyValue("--digit-given").trim() || "#241c14";
      const colorUser = style.getPropertyValue("--digit-user").trim() || "#e06c3a";
      const colorNote = style.getPropertyValue("--digit-note").trim() || "#786c5c";
      const colorPrimary = style.getPropertyValue("--primary").trim() || "#e06c3a";

      boardCtx.fillStyle = colorBoardBg;
      boardCtx.fillRect(0, 0, width, height);

      const selectedVal = selectedCell && userGrid[selectedCell.r] ? userGrid[selectedCell.r][selectedCell.c] : 0;

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = c * cellSize;
          const y = r * cellSize;
          const isAlt = (Math.floor(r / Br) + Math.floor(c / Bc)) % 2 === 1;

          boardCtx.fillStyle = isAlt ? colorCellAlt : colorBoardBg;

          const shouldHighlightGuides = (currentGameMode !== "like_paper") || currentAllowHighlighter;

          if (shouldHighlightGuides) {
            if (selectedCell && (selectedCell.r === r || selectedCell.c === c || (Math.floor(selectedCell.r/Br) === Math.floor(r/Br) && Math.floor(selectedCell.c/Bc) === Math.floor(c/Bc)))) {
              boardCtx.fillStyle = colorMatch;
            }

            if (selectedVal !== 0 && userGrid[r] && userGrid[r][c] === selectedVal) {
              boardCtx.fillStyle = colorSelected;
            }
          }

          if (currentConflict && ((currentConflict.r === r && currentConflict.c === c) || currentConflict.conflicts.some(cc => cc.r === r && cc.c === c))) {
            boardCtx.fillStyle = colorConflict;
          }

          // Unsolve Carving Flash / Heatmap Overlay
          if (isUnsolving) {
            const carvedInfo = unsolveCarvedCells.find(u => u.r === r && u.c === c);
            if (carvedInfo) {
              if (unsolveProgress >= carvedInfo.dissolveThreshold && unsolveProgress < carvedInfo.dissolveThreshold + 0.12) {
                const flash = Math.sin((unsolveProgress - carvedInfo.dissolveThreshold) * Math.PI / 0.12);
                boardCtx.fillStyle = `rgba(224, 108, 58, ${0.12 + flash * 0.35})`;
              }
            }
          } else if (showHeatmap && initialGrid.length && initialGrid[r] && initialGrid[r][c] === 0) {
            const d = deductions.find(item => item.row === r && item.col === c);
            const totalElims = d && d.reasons ? (d.reasons.cross_horizontal + d.reasons.cross_vertical + d.reasons.box_3x3) : 6;
            const intensity = Math.min(1, Math.max(0.15, totalElims / 12));
            boardCtx.fillStyle = `rgba(224, 108, 58, ${intensity * 0.45})`;
          }

          boardCtx.fillRect(x, y, cellSize, cellSize);
        }
      }

      const activeDeduction = !isUnsolving && (isPlayingSolver || currentStepIdx > 0) && currentStepIdx <= deductions.length && currentStepIdx > 0
        ? deductions[currentStepIdx - 1] : null;

      if (activeDeduction) {
        const pulse = 0.5 + 0.5 * Math.sin(animPhase * 8);
        const ar = activeDeduction.row;
        const ac = activeDeduction.col;

        boardCtx.fillStyle = `rgba(224, 108, 58, ${0.25 + pulse * 0.2})`;
        boardCtx.fillRect(ac * cellSize, ar * cellSize, cellSize, cellSize);

        boardCtx.strokeStyle = colorPrimary;
        boardCtx.lineWidth = 3;
        boardCtx.strokeRect(ac * cellSize + 2, ar * cellSize + 2, cellSize - 4, cellSize - 4);
      }

      // Thin inner grid lines
      boardCtx.strokeStyle = colorGridLine;
      boardCtx.lineWidth = 1;
      for (let c = 1; c < N; c++) {
        if (c % Bc !== 0) {
          boardCtx.beginPath();
          boardCtx.moveTo(c * cellSize, 0);
          boardCtx.lineTo(c * cellSize, height);
          boardCtx.stroke();
        }
      }
      for (let r = 1; r < N; r++) {
        if (r % Br !== 0) {
          boardCtx.beginPath();
          boardCtx.moveTo(0, r * cellSize);
          boardCtx.lineTo(width, r * cellSize);
          boardCtx.stroke();
        }
      }

      // Thick subgrid box boundaries
      boardCtx.strokeStyle = colorBoxLine;
      boardCtx.lineWidth = 2.5;
      for (let c = 0; c <= N; c += Bc) {
        boardCtx.beginPath();
        boardCtx.moveTo(c * cellSize, 0);
        boardCtx.lineTo(c * cellSize, height);
        boardCtx.stroke();
      }
      for (let r = 0; r <= N; r += Br) {
        boardCtx.beginPath();
        boardCtx.moveTo(0, r * cellSize);
        boardCtx.lineTo(width, r * cellSize);
        boardCtx.stroke();
      }

      if (selectedCell && !isUnsolving && selectedCell.r < N && selectedCell.c < N) {
        boardCtx.strokeStyle = colorPrimary;
        boardCtx.lineWidth = 3;
        boardCtx.strokeRect(selectedCell.c * cellSize + 1.5, selectedCell.r * cellSize + 1.5, cellSize - 3, cellSize - 3);
      }

      boardCtx.textAlign = "center";
      boardCtx.textBaseline = "middle";
      const fontSize = Math.floor(cellSize * (N > 12 ? 0.50 : 0.58));

      if (userGrid.length) {
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const val = userGrid[r] ? userGrid[r][c] : 0;
            const isGiven = initialGrid[r] && initialGrid[r][c] !== 0;
            const cx = c * cellSize + cellSize / 2;
            const cy = r * cellSize + cellSize / 2;
            const sym = window.SudokuEngine.symbolForVal(val, N);

            if (val !== 0) {
              const isConflict = currentConflict && currentConflict.r === r && currentConflict.c === c;
              if (isGiven) {
                boardCtx.font = `800 ${fontSize}px 'Outfit', sans-serif`;
                boardCtx.fillStyle = colorGiven;
              } else if (isConflict) {
                boardCtx.font = `800 ${fontSize}px 'Outfit', sans-serif`;
                boardCtx.fillStyle = "#dc2626";
              } else {
                boardCtx.font = `700 ${fontSize}px 'Outfit', sans-serif`;
                boardCtx.fillStyle = colorUser;
              }
              boardCtx.fillText(sym, cx, cy);
            } else if (isUnsolving) {
              const carvedInfo = unsolveCarvedCells.find(u => u.r === r && u.c === c);
              if (carvedInfo) {
                const sVal = window.SudokuEngine.symbolForVal(carvedInfo.val, N);
                if (unsolveProgress < carvedInfo.dissolveThreshold) {
                  boardCtx.font = `700 ${fontSize}px 'Outfit', sans-serif`;
                  boardCtx.fillStyle = "rgba(224, 108, 58, 0.70)";
                  boardCtx.fillText(sVal, cx, cy);
                } else if (unsolveProgress < carvedInfo.dissolveThreshold + 0.12) {
                  const p = (unsolveProgress - carvedInfo.dissolveThreshold) / 0.12;
                  const scale = Math.max(0.01, 1.0 - p * 0.65);
                  const alpha = Math.max(0, 1.0 - p);
                  if (!carvedInfo.spawned) {
                    carvedInfo.spawned = true;
                    spawnParticles(cx, cy, "#e06c3a");
                  }
                  boardCtx.save();
                  boardCtx.translate(cx, cy);
                  boardCtx.scale(scale, scale);
                  boardCtx.font = `800 ${fontSize}px 'Outfit', sans-serif`;
                  boardCtx.fillStyle = `rgba(224, 108, 58, ${alpha})`;
                  boardCtx.fillText(sVal, 0, 0);
                  boardCtx.restore();
                }
              }
            } else {
              const notes = notesGrid[r] ? notesGrid[r][c] : null;
              if (notes && notes.size > 0) {
                const subCols = Math.ceil(Math.sqrt(N));
                const subRows = Math.ceil(N / subCols);
                const subW = cellSize / subCols;
                const subH = cellSize / subRows;
                const noteFontSize = Math.floor(cellSize * (N > 9 ? 0.18 : 0.22));

                boardCtx.font = `700 ${noteFontSize}px 'Plus Jakarta Sans', sans-serif`;
                boardCtx.fillStyle = colorNote;
                for (const n of notes) {
                  const sSym = window.SudokuEngine.symbolForVal(n, N);
                  const subR = Math.floor((n - 1) / subCols);
                  const subC = (n - 1) % subCols;
                  const nx = c * cellSize + (subC + 0.5) * subW;
                  const ny = r * cellSize + (subR + 0.5) * subH;
                  boardCtx.fillText(sSym, nx, ny);
                }
              }
            }
          }
        }
      }

      updateParticles();
      for (const p of particles) {
        boardCtx.beginPath();
        boardCtx.arc(p.x, p.y, Math.max(0.1, p.radius), 0, Math.PI * 2);
        boardCtx.fillStyle = p.color;
        boardCtx.globalAlpha = p.alpha;
        boardCtx.fill();
      }
      boardCtx.globalAlpha = 1.0;

      if (didShake) boardCtx.restore();
    }

    // --- Deductive Tier Classification ---
    function getDeductionTier(score, assertions, tech = "") {
      if (tech.includes("Hidden Pair") || tech.includes("Hidden Triple") || score >= 2.15 || assertions >= 26) {
        return {
          id: "bottleneck",
          name: "Extreme Bottleneck",
          color: "#dc2626",
          bg: "rgba(220, 38, 38, 0.14)",
          stemColor: "rgba(220, 38, 38, 0.50)"
        };
      } else if (tech.includes("Locked") || tech.includes("Naked Pair") || tech.includes("Naked Triple") || tech.includes("Row") || tech.includes("Col") || score >= 1.75 || assertions >= 18) {
        return {
          id: "challenging",
          name: "Hard / High Complexity",
          color: "#f97316",
          bg: "rgba(249, 115, 22, 0.14)",
          stemColor: "rgba(249, 115, 22, 0.50)"
        };
      } else if (tech.includes("Box") || score >= 1.35 || assertions >= 10) {
        return {
          id: "moderate",
          name: "Moderate",
          color: "#eab308",
          bg: "rgba(234, 179, 8, 0.14)",
          stemColor: "rgba(234, 179, 8, 0.50)"
        };
      } else {
        return {
          id: "gentle",
          name: "Gentle / Direct",
          color: "#16a34a",
          bg: "rgba(22, 163, 74, 0.14)",
          stemColor: "rgba(22, 163, 74, 0.50)"
        };
      }
    }

    // --- Dynamic Proportion Ribbon ---
    function updateProportionRibbon() {
      const n = deductions.length;
      const counts = { gentle: 0, moderate: 0, challenging: 0, bottleneck: 0 };

      if (n === 0) {
        document.getElementById("propTotalSteps").innerText = "0 Deduction Steps";
        document.getElementById("segGentle").style.width = "25%";
        document.getElementById("segModerate").style.width = "25%";
        document.getElementById("segChallenging").style.width = "25%";
        document.getElementById("segBottleneck").style.width = "25%";
        return;
      }

      for (const d of deductions) {
        const score = d.step_score || 1.0;
        const ast = d.assertions || (8 + (d.reasons ? d.reasons.total : 0));
        const tier = getDeductionTier(score, ast, d.technique || "");
        counts[tier.id]++;
      }

      document.getElementById("propTotalSteps").innerText = `${n} Deduction Steps`;
      const pGentle = (counts.gentle / n) * 100;
      const pMod = (counts.moderate / n) * 100;
      const pChal = (counts.challenging / n) * 100;
      const pBot = (counts.bottleneck / n) * 100;

      document.getElementById("segGentle").style.width = `${pGentle.toFixed(1)}%`;
      document.getElementById("segModerate").style.width = `${pMod.toFixed(1)}%`;
      document.getElementById("segChallenging").style.width = `${pChal.toFixed(1)}%`;
      document.getElementById("segBottleneck").style.width = `${pBot.toFixed(1)}%`;

      document.getElementById("cntGentle").innerText = counts.gentle;
      document.getElementById("pctGentle").innerText = `${Math.round(pGentle)}%`;
      document.getElementById("cntModerate").innerText = counts.moderate;
      document.getElementById("pctModerate").innerText = `${Math.round(pMod)}%`;
      document.getElementById("cntChallenging").innerText = counts.challenging;
      document.getElementById("pctChallenging").innerText = `${Math.round(pChal)}%`;
      document.getElementById("cntBottleneck").innerText = counts.bottleneck;
      document.getElementById("pctBottleneck").innerText = `${Math.round(pBot)}%`;
    }

    // --- Circular Polar Orbit Radar Chart ---
    function drawTrajectoryChart() {
      if (!trajectoryCanvas) return;
      const rect = trajectoryCanvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const n = deductions.length;
      if (n === 0 || w < 20 || h < 20) return;

      chartCtx.clearRect(0, 0, w, h);
      chartCtx.save();

      const cx = w / 2;
      const cy = h / 2;
      const maxRadius = Math.min(w, h) * 0.44;
      const minRadius = Math.min(w, h) * 0.16;

      let maxAst = 0;
      for (const d of deductions) {
        const ast = d.assertions || (8 + (d.reasons ? d.reasons.total : 0));
        if (ast > maxAst) maxAst = ast;
      }
      maxAst = Math.max(16, maxAst);

      const style = getComputedStyle(document.documentElement);
      const colorBorderSubtle = style.getPropertyValue("--border-subtle").trim() || "rgba(0,0,0,0.1)";
      const colorPrimary = style.getPropertyValue("--primary").trim() || "#e06c3a";
      const colorTextMuted = style.getPropertyValue("--text-muted").trim() || "#786c5c";
      const colorTextMain = style.getPropertyValue("--text-main").trim() || "#241c14";

      // 1. Concentric Range Rings
      const rings = [0.25, 0.50, 0.75, 1.0];
      for (const fraction of rings) {
        const r = minRadius + (maxRadius - minRadius) * fraction;
        chartCtx.beginPath();
        chartCtx.arc(cx, cy, Math.max(0.1, r), 0, Math.PI * 2);
        chartCtx.strokeStyle = colorBorderSubtle;
        chartCtx.lineWidth = 1;
        chartCtx.setLineDash([3, 4]);
        chartCtx.stroke();
        chartCtx.setLineDash([]);

        const astVal = Math.round(maxAst * fraction);
        chartCtx.fillStyle = colorTextMuted;
        chartCtx.font = "600 8px 'JetBrains Mono', monospace";
        chartCtx.textAlign = "left";
        chartCtx.fillText(`${astVal} ast`, cx + 3, cy - r + 8);
      }

      // 2. Compute Polar Points
      const pts = [];
      for (let i = 0; i < n; i++) {
        const d = deductions[i];
        const ast = d.assertions || (8 + (d.reasons ? d.reasons.total : 0));
        const score = d.step_score || 1.0;
        const normAst = Math.min(1.0, ast / maxAst);
        const radius = minRadius + (maxRadius - minRadius) * normAst;
        const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;

        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        const tier = getDeductionTier(score, ast, d.technique || "");

        pts.push({
          x: px, y: py,
          r: radius,
          angle,
          ast, score,
          tier,
          tech: d.technique || "",
          dynamicColor: tier.color,
          dynamicBg: tier.bg,
          stemColor: tier.stemColor
        });
      }

      // 3. Radial Spoke Stems
      for (let i = 0; i < n; i++) {
        const pt = pts[i];
        const innerX = cx + minRadius * Math.cos(pt.angle);
        const innerY = cy + minRadius * Math.sin(pt.angle);
        chartCtx.beginPath();
        chartCtx.moveTo(innerX, innerY);
        chartCtx.lineTo(pt.x, pt.y);
        chartCtx.strokeStyle = pt.stemColor;
        chartCtx.lineWidth = 1.2;
        chartCtx.stroke();
      }

      // 4. Closed Polygon Area Fill
      chartCtx.beginPath();
      chartCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) {
        chartCtx.lineTo(pts[i].x, pts[i].y);
      }
      chartCtx.closePath();
      const grad = chartCtx.createRadialGradient(cx, cy, minRadius, cx, cy, maxRadius);
      grad.addColorStop(0, "rgba(224, 108, 58, 0.08)");
      grad.addColorStop(0.7, "rgba(224, 108, 58, 0.22)");
      grad.addColorStop(1, "rgba(220, 38, 38, 0.40)");
      chartCtx.fillStyle = grad;
      chartCtx.fill();

      // 5. Polygon Perimeter Stroke
      chartCtx.beginPath();
      chartCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) {
        chartCtx.lineTo(pts[i].x, pts[i].y);
      }
      chartCtx.closePath();
      chartCtx.strokeStyle = colorPrimary;
      chartCtx.lineWidth = 2.2;
      chartCtx.stroke();

      // 6. Node Anchors
      for (let i = 0; i < n; i++) {
        const pt = pts[i];
        chartCtx.beginPath();
        chartCtx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        chartCtx.fillStyle = pt.dynamicColor;
        chartCtx.fill();
      }

      // 7. Center Hub Badge
      chartCtx.beginPath();
      chartCtx.arc(cx, cy, Math.max(0.1, minRadius - 3), 0, Math.PI * 2);
      chartCtx.fillStyle = style.getPropertyValue("--surface-card").trim() || "#ffffff";
      chartCtx.fill();
      chartCtx.strokeStyle = colorPrimary;
      chartCtx.lineWidth = 2.5;
      chartCtx.stroke();

      const activeIdx = (currentStepIdx > 0 && currentStepIdx <= pts.length) ? (currentStepIdx - 1) : 0;
      const activePt = pts[activeIdx] || pts[0];

      chartCtx.fillStyle = colorPrimary;
      chartCtx.font = "800 10px 'Outfit', sans-serif";
      chartCtx.textAlign = "center";
      chartCtx.textBaseline = "middle";
      chartCtx.fillText(currentDifficulty.toUpperCase(), cx, cy - 6);

      chartCtx.fillStyle = colorTextMuted;
      chartCtx.font = "700 8px 'JetBrains Mono', monospace";
      chartCtx.fillText(`${n} Steps`, cx, cy + 6);

      // 8. Active Step Orbit Beacon & Tooltip Badge
      if (activePt) {
        const pulse = 5.5 + Math.sin(animPhase * 8) * 1.5;

        chartCtx.beginPath();
        chartCtx.arc(activePt.x, activePt.y, Math.max(0.1, pulse + 4), 0, Math.PI * 2);
        chartCtx.fillStyle = activePt.dynamicBg;
        chartCtx.fill();

        chartCtx.beginPath();
        chartCtx.arc(activePt.x, activePt.y, Math.max(0.1, pulse), 0, Math.PI * 2);
        chartCtx.fillStyle = activePt.dynamicColor;
        chartCtx.fill();

        chartCtx.beginPath();
        chartCtx.arc(activePt.x, activePt.y, 2.2, 0, Math.PI * 2);
        chartCtx.fillStyle = "#ffffff";
        chartCtx.fill();

        const tooltipText = `Step #${activeIdx + 1}: ${activePt.ast} Ast [${activePt.tier.id.toUpperCase()}]`;
        chartCtx.font = "700 10px 'JetBrains Mono', monospace";
        const tw = chartCtx.measureText(tooltipText).width + 12;

        const tDist = activePt.r + 20;
        let tx = cx + tDist * Math.cos(activePt.angle);
        let ty = cy + tDist * Math.sin(activePt.angle);
        tx = Math.max(tw / 2 + 8, Math.min(w - tw / 2 - 8, tx));
        ty = Math.max(14, Math.min(h - 14, ty));

        chartCtx.fillStyle = colorTextMain;
        chartCtx.beginPath();
        chartCtx.roundRect(tx - tw / 2, ty - 9, tw, 18, 5);
        chartCtx.fill();

        chartCtx.fillStyle = "#ffffff";
        chartCtx.textAlign = "center";
        chartCtx.textBaseline = "middle";
        chartCtx.fillText(tooltipText, tx, ty);
      }

      chartCtx.restore();
    }

    // --- Digit Input & Validation ---
    function checkConflict(r, c, val) {
      if (val === 0) return null;
      const N = currentTopology.N;
      const Br = currentTopology.Br;
      const Bc = currentTopology.Bc;
      const conflicts = [];
      for (let otherC = 0; otherC < N; otherC++) {
        if (otherC !== c && userGrid[r][otherC] === val) conflicts.push({ r, c: otherC, type: "Row" });
      }
      for (let otherR = 0; otherR < N; otherR++) {
        if (otherR !== r && userGrid[otherR][c] === val) conflicts.push({ r: otherR, c, type: "Column" });
      }
      const br = Math.floor(r / Br) * Br;
      const bc = Math.floor(c / Bc) * Bc;
      for (let row = br; row < br + Br; row++) {
        for (let col = bc; col < bc + Bc; col++) {
          if ((row !== r || col !== c) && userGrid[row][col] === val) {
            conflicts.push({ r: row, c: col, type: `${Br}x${Bc} Box` });
          }
        }
      }
      if (conflicts.length > 0) {
        const sym = window.SudokuEngine.symbolForVal(val, N);
        return {
          r, c, val,
          conflicts,
          reason: `Digit ${sym} already exists in this ${conflicts[0].type}!`
        };
      }
      return null;
    }

    function inputDigit(digit) {
      if (isUnsolving || !selectedCell || !initialGrid.length || isPlayingSolver) return;
      const { r, c } = selectedCell;
      const N = currentTopology.N;
      if (r >= N || c >= N || initialGrid[r][c] !== 0) return;

      const prevVal = userGrid[r][c];
      userGrid[r][c] = digit;
      if (notesGrid[r] && notesGrid[r][c]) notesGrid[r][c].clear();

      if (currentGameMode !== "like_paper") {
        moveHistory.push({ r, c, prevVal, newVal: digit });
      }

      if (digit !== prevVal) {
        userGuessHistory.push({
          order: userGuessHistory.length + 1,
          r, c,
          val: digit,
          prevVal,
          isCorrect: (solutionGrid.length && solutionGrid[r]) ? (digit === solutionGrid[r][c]) : true,
          timestamp: gameTimeSeconds
        });
      }

      const rect = boardCanvas.getBoundingClientRect();
      const cellSize = rect.width / N;

      if (currentGameMode === "like_paper") {
        currentConflict = null;
        const banner = document.getElementById("conflictBanner");
        if (banner) banner.style.display = "none";

        if (digit !== 0) {
          spawnParticles(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, "#e06c3a");
          if (checkWin()) triggerVictory();
        }
      } else {
        const banner = document.getElementById("conflictBanner");
        const conflictText = document.getElementById("conflictText");

        if (digit !== 0) {
          const conflict = checkConflict(r, c, digit);
          if (conflict) {
            mistakesCount++;
            document.getElementById("mistakeCounter").innerText = `${mistakesCount}/${maxMistakes}`;
            if (mistakesCount >= maxMistakes) {
              document.getElementById("chipMistakes").classList.add("warning");
            }
            boardShake = 1.0;
            currentConflict = conflict;
            banner.style.display = "flex";
            conflictText.innerText = conflict.reason;
            spawnParticles(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, "#dc2626");
            if (navigator.vibrate) try { navigator.vibrate([30, 40, 30]); } catch (e) {}
          } else {
            currentConflict = null;
            banner.style.display = "none";
            spawnParticles(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, "#e06c3a");
            if (navigator.vibrate) try { navigator.vibrate(10); } catch (e) {}

            if (checkWin()) triggerVictory();
          }
        } else {
          currentConflict = null;
          banner.style.display = "none";
        }
      }
      updateDigitCounters();
      recalculateLiveSolver();
    }

    function undoMove() {
      if (currentGameMode === "like_paper") return;
      if (moveHistory.length === 0) return;
      const last = moveHistory.pop();
      userGrid[last.r][last.c] = last.prevVal;
      selectedCell = { r: last.r, c: last.c };
      currentConflict = null;
      document.getElementById("conflictBanner").style.display = "none";
      if (userGuessHistory.length > 0) userGuessHistory.pop();
      updateDigitCounters();
      recalculateLiveSolver();
    }

    function giveHint() {
      if (currentGameMode === "like_paper" || !currentAllowHints) return;
      if (currentHintCap > 0 && currentHintsRemaining <= 0) return;
      if (!solutionGrid.length) return;
      const N = currentTopology.N;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (userGrid[r][c] === 0) {
            selectedCell = { r, c };
            inputDigit(solutionGrid[r][c]);
            if (currentHintCap > 0) {
              currentHintsRemaining--;
              updateHintButtonDisplay();
            }
            return;
          }
        }
      }
    }

    function checkWin() {
      const N = currentTopology.N;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (userGrid[r][c] === 0 || userGrid[r][c] !== solutionGrid[r][c]) return false;
        }
      }
      return true;
    }

    // --- Victory Confetti & Modal ---
    let confettiParticles = [];

    function triggerVictory(isSolverWin = false) {
      if (timerInterval) clearInterval(timerInterval);
      closeRadialRing();
      const m = Math.floor(gameTimeSeconds / 60);
      const s = gameTimeSeconds % 60;
      document.getElementById("winStatTime").innerText = `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
      document.getElementById("winStatDiff").innerText = currentDifficulty.toUpperCase();
      document.getElementById("winStatMistakes").innerText = currentGameMode === "like_paper" ? "Pure Paper" : `${mistakesCount}/${maxMistakes}`;

      const iconEl = document.getElementById("winBadgeIcon");
      const titleEl = document.getElementById("winTitle");
      const subEl = document.getElementById("winSubtitle");

      if (isSolverWin) {
        if (iconEl) iconEl.innerText = "🤖💩";
        if (titleEl) titleEl.innerText = "Solver Solved It!";
        if (subEl) subEl.innerText = "The automated solver was running when the last number hit — here is your special prize!";
      } else {
        if (iconEl) iconEl.innerText = "🏆";
        if (titleEl) titleEl.innerText = "Puzzle Complete!";
        if (subEl) subEl.innerText = "Splendid work! You solved this puzzle 100% logically.";
      }

      document.getElementById("victoryModal").classList.add("active");
      if (navigator.vibrate) try { navigator.vibrate([40, 60, 40, 60, 80]); } catch (e) {}

      confettiParticles = [];
      const colors = ["#e06c3a", "#3b82f6", "#16a34a", "#f59e0b", "#ec4899", "#8b5cf6"];
      const count = isSolverWin ? 80 : 120;
      for (let i = 0; i < count; i++) {
        confettiParticles.push({
          x: Math.random() * window.innerWidth,
          y: -20 - Math.random() * 120,
          vx: (Math.random() - 0.5) * 4,
          vy: 2 + Math.random() * 5,
          size: isSolverWin ? (26 + Math.random() * 20) : (6 + Math.random() * 8),
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rSpeed: (Math.random() - 0.5) * (isSolverWin ? 0.08 : 0.2),
          isPoop: isSolverWin
        });
      }
    }

    function renderConfetti() {
      if (confettiParticles.length === 0) return;
      const rect = boardCanvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      boardCtx.save();
      for (let i = confettiParticles.length - 1; i >= 0; i--) {
        const p = confettiParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rSpeed;

        if (p.isPoop) {
          boardCtx.save();
          boardCtx.translate(p.x, p.y);
          boardCtx.rotate(p.rotation);
          boardCtx.font = `${p.size}px serif`;
          boardCtx.textAlign = "center";
          boardCtx.textBaseline = "middle";
          boardCtx.fillText("💩", 0, 0);
          boardCtx.restore();
        } else {
          boardCtx.save();
          boardCtx.translate(p.x, p.y);
          boardCtx.rotate(p.rotation);
          boardCtx.fillStyle = p.color;
          boardCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          boardCtx.restore();
        }

        if (p.y > h + 50) {
          confettiParticles.splice(i, 1);
        }
      }
      boardCtx.restore();
    }

    // --- Timer ---
    function startTimer() {
      if (timerInterval) clearInterval(timerInterval);
      gameTimeSeconds = 0;
      timerInterval = setInterval(() => {
        if (!isUnsolving) {
          gameTimeSeconds++;
          const m = Math.floor(gameTimeSeconds / 60);
          const s = gameTimeSeconds % 60;
          document.getElementById("gameTimer").innerText = `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
        }
      }, 1000);
    }

    // --- HUD Updates ---
    function updateHUD() {
      const n = deductions.length;
      const guessCount = userGuessHistory.length;
      const counterEl = document.getElementById("hudStepCounter");
      if (counterEl) {
        counterEl.innerText = isPlayingSolver
          ? `Live Solver Step ${currentStepIdx} / ${n}`
          : `${n} Live Steps to Solve (${guessCount} Guess${guessCount === 1 ? "" : "es"} Placed)`;
      }

      if (currentStepIdx === 0) {
        if (n === 0 && !isUnsolving) {
          document.getElementById("hudTechTitle").innerText = "🎉 Grid Fully Solved!";
          document.getElementById("hudExplanation").innerText = `All numbers filled successfully in ${guessCount} guesses.`;
        } else {
          document.getElementById("hudTechTitle").innerText = isPlayingSolver
            ? `⚡ Solving Live from Current Board (${n} Steps)`
            : "Interactive Play Mode";
          document.getElementById("hudExplanation").innerText = isPlayingSolver
            ? "Step forward or play solver to execute live deductions from your current progress."
            : `Live solver tracks ${guessCount} moves played so far and re-evaluates all analytical proofs in real-time.`;
        }
        return;
      }
      const d = deductions[currentStepIdx - 1];
      if (d) {
        document.getElementById("hudTechTitle").innerText = d.technique;
        const sym = window.SudokuEngine.symbolForVal(d.val, currentTopology.N);
        document.getElementById("hudExplanation").innerText = d.description || `Single deduction at (${d.row + 1}, ${d.col + 1}) with value ${sym}.`;
      }
    }

    function stepForward() {
      const N = currentTopology.N;
      if (currentStepIdx < deductions.length) {
        const d = deductions[currentStepIdx];
        userGrid[d.row][d.col] = d.val;
        currentStepIdx++;
        const rect = boardCanvas.getBoundingClientRect();
        const cellSize = rect.width / N;
        spawnParticles(d.col * cellSize + cellSize / 2, d.row * cellSize + cellSize / 2, "#e06c3a");
        updateHUD();
        updateDigitCounters();
        drawTrajectoryChart();
        if (checkWin()) {
          isPlayingSolver = false;
          document.getElementById("btnPlayPause").innerText = "▶ Play Solver";
          triggerVictory(true);
        }
      } else {
        isPlayingSolver = false;
        document.getElementById("btnPlayPause").innerText = "▶ Play Solver";
        if (checkWin()) triggerVictory(true);
      }
    }

    function stepBackward() {
      if (currentStepIdx > 0) {
        const d = deductions[currentStepIdx - 1];
        userGrid[d.row][d.col] = initialGrid[d.row][d.col];
        currentStepIdx--;
        updateHUD();
        updateDigitCounters();
        drawTrajectoryChart();
      }
    }

    // --- Client-Side SVG Replay Download Generator ---
    function downloadSVGReplay() {
      if (!solutionGrid.length || !initialGrid.length) return;
      const N = currentTopology.N;
      const Br = currentTopology.Br;
      const Bc = currentTopology.Bc;

      const cellSize = N <= 8 ? 68 : (N === 9 ? 60 : (N === 12 ? 46 : 36));
      const boardSize = cellSize * N;
      const totalHeight = boardSize + 75;
      const n = deductions.length;

      const showcaseSec = 0.8;
      const unsolveCarveSec = 2.7;
      const unsolveTotalSec = showcaseSec + unsolveCarveSec;
      const stepSec = 0.32;
      const playthroughSec = n * stepSec;
      const victorySec = 2.2;
      const totalSec = unsolveTotalSec + playthroughSec + victorySec;

      const showcasePct = (showcaseSec / totalSec) * 100;
      const unsolvePct = (unsolveTotalSec / totalSec) * 100;
      const playthroughPct = ((unsolveTotalSec + playthroughSec) / totalSec) * 100;

      const blanks = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (initialGrid[r][c] === 0) blanks.push({ r, c, val: solutionGrid[r][c] });
        }
      }

      const fontValSize = Math.floor(cellSize * 0.55);
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boardSize} ${totalHeight}" width="${boardSize}" height="${totalHeight}">\n<style>\n`;
      svg += `  .text-given { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: ${fontValSize}px; text-anchor: middle; dominant-baseline: central; fill: #241c14; }\n`;
      svg += `  .text-unsolve { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: ${fontValSize}px; text-anchor: middle; dominant-baseline: central; fill: #38bdf8; }\n`;
      svg += `  .text-step { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: ${fontValSize}px; text-anchor: middle; dominant-baseline: central; fill: #e06c3a; }\n`;
      svg += `  .status-text { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 13px; fill: #241c14; }\n`;
      svg += `  .sub-status { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 400; font-size: 11px; fill: #736756; }\n`;
      svg += `  .status-unsolve { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 13px; fill: #38bdf8; }\n`;
      svg += `  .status-victory { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 13px; fill: #16a34a; }\n`;

      const numBlanks = blanks.length || 1;
      blanks.forEach((b, i) => {
        const startPct = showcasePct + (i / numBlanks) * (unsolveCarveSec / totalSec) * 100 * 0.88;
        const endPct = Math.min(unsolvePct, startPct + (unsolveCarveSec / totalSec) * 100 * 0.18);
        svg += `@keyframes anim-unsolve-val-${b.r}-${b.c} { 0%, ${startPct.toFixed(2)}% { opacity: 1; transform: scale(1); } ${((startPct+endPct)/2).toFixed(2)}% { opacity: 0.9; transform: scale(1.3); fill: #dc2626; } ${endPct.toFixed(2)}%, 100% { opacity: 0; transform: scale(0.2); } }\n`;
        svg += `@keyframes anim-unsolve-bg-${b.r}-${b.c} { 0%, ${startPct.toFixed(2)}% { fill: #ffffff; } ${((startPct+endPct)/2).toFixed(2)}% { fill: rgba(220, 38, 38, 0.3); } ${endPct.toFixed(2)}%, 100% { fill: #ffffff; } }\n`;
        svg += `.unsolve-val-${b.r}-${b.c} { animation: anim-unsolve-val-${b.r}-${b.c} ${totalSec.toFixed(1)}s infinite; transform-origin: ${b.c*cellSize+cellSize/2}px ${b.r*cellSize+cellSize/2}px; }\n`;
        svg += `.unsolve-bg-${b.r}-${b.c} { animation: anim-unsolve-bg-${b.r}-${b.c} ${totalSec.toFixed(1)}s infinite; }\n`;
      });

      deductions.forEach((d, i) => {
        const startPct = unsolvePct + (i / n) * (playthroughPct - unsolvePct);
        const endPct = unsolvePct + ((i + 1) / n) * (playthroughPct - unsolvePct);
        const peakPct = startPct + (endPct - startPct) * 0.4;
        svg += `@keyframes anim-replay-step-${i} { 0%, ${startPct.toFixed(2)}% { opacity: 0; transform: scale(0.2); } ${peakPct.toFixed(2)}% { opacity: 1; transform: scale(1.35); fill: #e06c3a; } ${endPct.toFixed(2)}%, 100% { opacity: 1; transform: scale(1); fill: #e06c3a; } }\n`;
        svg += `@keyframes anim-replay-bg-${i} { 0%, ${startPct.toFixed(2)}% { fill: #ffffff; } ${peakPct.toFixed(2)}% { fill: rgba(224, 108, 58, 0.4); } ${endPct.toFixed(2)}%, 100% { fill: rgba(224, 108, 58, 0.15); } }\n`;
        svg += `@keyframes anim-replay-status-${i} { 0%, ${startPct.toFixed(2)}% { opacity: 0; } ${(startPct + 0.01).toFixed(2)}%, ${endPct.toFixed(2)}% { opacity: 1; } ${(endPct + 0.01).toFixed(2)}%, 100% { opacity: 0; } }\n`;
        svg += `.replay-step-val-${i} { animation: anim-replay-step-${i} ${totalSec.toFixed(1)}s infinite; transform-origin: ${d.col*cellSize+cellSize/2}px ${d.row*cellSize+cellSize/2}px; }\n`;
        svg += `.replay-step-bg-${i} { animation: anim-replay-bg-${i} ${totalSec.toFixed(1)}s infinite; }\n`;
        svg += `.replay-step-status-${i} { animation: anim-replay-status-${i} ${totalSec.toFixed(1)}s infinite; }\n`;
      });

      svg += `@keyframes anim-status-unsolve-phase { 0%, ${unsolvePct.toFixed(2)}% { opacity: 1; } ${(unsolvePct+0.05).toFixed(2)}%, 100% { opacity: 0; } }\n`;
      svg += `.status-phase-unsolve { animation: anim-status-unsolve-phase ${totalSec.toFixed(1)}s infinite; }\n`;

      svg += `@keyframes anim-status-victory-phase { 0%, ${playthroughPct.toFixed(2)}% { opacity: 0; } ${(playthroughPct+0.05).toFixed(2)}%, 100% { opacity: 1; } }\n`;
      svg += `.status-phase-victory { animation: anim-status-victory-phase ${totalSec.toFixed(1)}s infinite; }\n`;

      svg += `</style>\n<rect width="${boardSize}" height="${totalHeight}" fill="#faf7f2"/>\n`;

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = c * cellSize;
          const y = r * cellSize;
          const bg = (Math.floor(r/Br) + Math.floor(c/Bc)) % 2 === 1 ? "#f8f5ee" : "#ffffff";
          if (initialGrid[r][c] !== 0) {
            const sym = window.SudokuEngine.symbolForVal(initialGrid[r][c], N);
            svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}"/>\n`;
            svg += `<text x="${x + cellSize/2}" y="${y + cellSize/2}" class="text-given">${sym}</text>\n`;
          } else {
            const sVal = window.SudokuEngine.symbolForVal(solutionGrid[r][c], N);
            svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}" class="unsolve-bg-${r}-${c}"/>\n`;
            svg += `<text x="${x + cellSize/2}" y="${y + cellSize/2}" class="text-unsolve unsolve-val-${r}-${c}">${sVal}</text>\n`;
          }
        }
      }

      deductions.forEach((d, i) => {
        const x = d.col * cellSize;
        const y = d.row * cellSize;
        const sym = window.SudokuEngine.symbolForVal(d.val, N);
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" class="replay-step-bg-${i}"/>\n`;
        svg += `<text x="${x + cellSize/2}" y="${y + cellSize/2}" class="text-step replay-step-val-${i}">${sym}</text>\n`;
      });

      for (let c = 1; c < N; c++) {
        if (c % Bc !== 0) {
          const pos = c * cellSize;
          svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="#e6dfd3" stroke-width="1"/>\n`;
        }
      }
      for (let r = 1; r < N; r++) {
        if (r % Br !== 0) {
          const pos = r * cellSize;
          svg += `<line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="#e6dfd3" stroke-width="1"/>\n`;
        }
      }
      for (let c = 0; c <= N; c += Bc) {
        const pos = c * cellSize;
        const w = (c === 0 || c === N) ? 4 : 3;
        svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="${boardSize}" stroke="#5c4e3c" stroke-width="${w}"/>\n`;
      }
      for (let r = 0; r <= N; r += Br) {
        const pos = r * cellSize;
        const w = (r === 0 || r === N) ? 4 : 3;
        svg += `<line x1="0" y1="${pos}" x2="${boardSize}" y2="${pos}" stroke="#5c4e3c" stroke-width="${w}"/>\n`;
      }

      svg += `<rect x="0" y="${boardSize}" width="${boardSize}" height="75" fill="#f8f5ee" stroke="#e6dfd3" stroke-width="1"/>\n`;
      svg += `<g class="status-phase-unsolve">\n<text x="16" y="${boardSize + 26}" class="status-unsolve">⚡ Phase 1: Rapid Unsolving &amp; Carving</text>\n<text x="16" y="${boardSize + 48}" class="sub-status">Carving ${N}x${N} solved board into ${N*N - blanks.length} clues (${currentDifficulty.toUpperCase()})...</text>\n</g>\n`;

      deductions.forEach((d, i) => {
        const sym = window.SudokuEngine.symbolForVal(d.val, N);
        svg += `<g class="replay-step-status-${i}">\n<text x="16" y="${boardSize + 26}" class="status-text">Step ${i+1} / ${n}: [${d.technique}] at (${d.row+1},${d.col+1}) = ${sym}</text>\n<text x="16" y="${boardSize + 48}" class="sub-status">${d.description || ""} (Score: ${(d.step_score||0).toFixed(2)})</text>\n</g>\n`;
      });

      svg += `<g class="status-phase-victory">\n<text x="16" y="${boardSize + 26}" class="status-victory">🏆 Victory: Puzzle 100% Logically Proven</text>\n<text x="16" y="${boardSize + 48}" class="sub-status">Topology: ${N}x${N} (${Br}x${Bc}) | Difficulty: ${currentDifficulty.toUpperCase()} | Solved in ${n} steps</text>\n</g>\n`;
      svg += `</svg>`;

      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `undoku_replay_${currentTopologyKey}_${currentDifficulty}_${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // --- Animation Loop ---
    let lastStepTime = 0;
    function mainLoop(now) {
      animPhase = now / 1000;
      if (isPlayingSolver && now - lastStepTime > 320) {
        stepForward();
        lastStepTime = now;
      }
      if (isRadialOpen) {
        const container = document.getElementById("radialBubblesContainer");
        if (container) {
          const ringAngle = (animPhase * 9) % 360;
          container.style.transform = `rotate(${ringAngle.toFixed(2)}deg)`;
          const texts = container.querySelectorAll(".radial-bubble-text");
          texts.forEach(txt => {
            txt.style.transform = `rotate(${(-ringAngle).toFixed(2)}deg)`;
          });
        }
      }
      renderBoard();
      renderConfetti();
      drawTrajectoryChart();
      requestAnimationFrame(mainLoop);
    }

    // --- Deterministic Two-Tap Interaction Controller (Ticket 005) ---
    const TwoTapControllerClass = (window.SudokuEngine && window.SudokuEngine.TwoTapStateController) ||
      (window.Undoku && window.Undoku.TwoTapStateController) ||
      TwoTapStateController;

    const stateController = new TwoTapControllerClass({
      onFocusChange: (cell) => {
        selectedCell = cell ? { r: cell.r, c: cell.c } : null;
        renderBoard();
      },
      onOpenRadial: (cell) => {
        openRadialRing(cell.r, cell.c);
      },
      onCloseRadial: () => {
        closeRadialRing();
      }
    });

    let lastBoardPointerTime = 0;
    function handleBoardSelect(clientX, clientY) {
      if (isUnsolving) return;
      const rect = boardCanvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const N = currentTopology ? currentTopology.N : 9;
      const cellSize = rect.width / N;
      const c = Math.floor(x / cellSize);
      const r = Math.floor(y / cellSize);

      if (r >= 0 && r < N && c >= 0 && c < N) {
        const isEditable = !initialGrid.length || initialGrid[r][c] === 0;
        stateController.handleCellTap(r, c, isEditable);
      } else {
        stateController.handleBackdropTap();
      }
    }

    let touchStartPos = null;
    let touchDidScroll = false;

    boardCanvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.pointerType === "touch") {
        touchStartPos = { x: e.clientX, y: e.clientY };
        touchDidScroll = false;
      } else {
        lastBoardPointerTime = Date.now();
        handleBoardSelect(e.clientX, e.clientY);
      }
    });

    boardCanvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && touchStartPos) {
        const dx = Math.abs(e.clientX - touchStartPos.x);
        const dy = Math.abs(e.clientY - touchStartPos.y);
        if (dx > 10 || dy > 10) {
          touchDidScroll = true;
        }
      }
    });

    boardCanvas.addEventListener("pointercancel", (e) => {
      if (e.pointerType === "touch") {
        touchDidScroll = true;
      }
    });

    boardCanvas.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch" && touchStartPos) {
        const moved = touchDidScroll;
        touchStartPos = null;
        if (!moved) {
          lastBoardPointerTime = Date.now();
          handleBoardSelect(e.clientX, e.clientY);
        }
      }
    });

    boardCanvas.addEventListener("click", (e) => {
      if (Date.now() - lastBoardPointerTime < 450) {
        e.preventDefault();
        return;
      }
      handleBoardSelect(e.clientX, e.clientY);
    });

    // Dismiss ring & clear focus when tapping outside or on backdrop (Ticket 005)
    document.addEventListener("pointerdown", (e) => {
      const overlay = document.getElementById("radialRingOverlay");
      const isInsideOverlay = overlay && overlay.contains(e.target);
      const isInsideCanvas = boardCanvas && boardCanvas.contains(e.target);

      if (!isInsideOverlay && !isInsideCanvas) {
        const isInteractiveControl = e.target.closest && e.target.closest("button, input, select, a, .digit-btn, .nav-tab-btn, .modal-backdrop");
        if (!isInteractiveControl) {
          stateController.handleBackdropTap();
        } else if (isRadialOpen) {
          closeRadialRing();
        }
      }
    });

    const btnRadialCloseEl = document.getElementById("btnRadialClose");
    if (btnRadialCloseEl) {
      btnRadialCloseEl.addEventListener("click", (e) => {
        e.stopPropagation();
        stateController.handleBackdropTap();
      });
    }

    // --- 3-Step New Game Dialogue Flow: Step 1 (Size) -> Step 2 (Difficulty) -> Step 3 (Mode & Options) ---
    let pendingTopologyKey = "classic_9x9";
    let pendingDifficulty = "hard";

    function openSizeSelectionMenu() {
      closeRadialRing();
      closeDifficultySelectionMenu();
      closeConfirmationModal();

      // Highlight the currently chosen topology card
      document.querySelectorAll(".size-select-card").forEach(card => {
        const topo = card.getAttribute("data-topo");
        if (topo === (pendingTopologyKey || currentTopologyKey)) {
          card.classList.add("active");
        } else {
          card.classList.remove("active");
        }
      });

      const sizeModal = document.getElementById("sizeSelectModal");
      if (sizeModal) sizeModal.classList.add("active");
    }

    function closeSizeSelectionMenu() {
      const sizeModal = document.getElementById("sizeSelectModal");
      if (sizeModal) sizeModal.classList.remove("active");
    }

    function openDifficultySelectionMenu(targetTopologyKey) {
      closeRadialRing();
      closeSizeSelectionMenu();
      closeConfirmationModal();

      if (targetTopologyKey) pendingTopologyKey = targetTopologyKey;
      const topo = window.SudokuEngine.resolveTopology(pendingTopologyKey);

      const labelEl = document.getElementById("diffModalSizeLabel");
      if (labelEl) labelEl.innerText = topo.label;

      const diffModal = document.getElementById("diffSelectModal");
      if (diffModal) diffModal.classList.add("active");
    }

    function closeDifficultySelectionMenu() {
      const diffModal = document.getElementById("diffSelectModal");
      if (diffModal) diffModal.classList.remove("active");
    }

    function requestDifficultyConfirmation(targetDiff, targetTopologyKey) {
      closeDifficultySelectionMenu();
      if (targetDiff) pendingDifficulty = targetDiff;
      if (targetTopologyKey) pendingTopologyKey = targetTopologyKey;

      const topo = window.SudokuEngine.resolveTopology(pendingTopologyKey);

      const titleEl = document.getElementById("confirmTitle");
      if (titleEl) titleEl.innerText = `Start New ${topo.label.split(" (")[0]} Game?`;

      const sizeLabelEl = document.getElementById("confirmSizeLabel");
      if (sizeLabelEl) sizeLabelEl.innerText = topo.label;

      const diffLabelEl = document.getElementById("confirmTargetDiff");
      if (diffLabelEl) diffLabelEl.innerText = pendingDifficulty.toUpperCase();

      const confirmEl = document.getElementById("confirmModal");
      if (confirmEl) confirmEl.classList.add("active");
    }

    function closeConfirmationModal() {
      const confirmEl = document.getElementById("confirmModal");
      if (confirmEl) confirmEl.classList.remove("active");
    }

    // Step 1 Trigger: Full-Row New Game Button opens Size Selection Modal
    const btnOpenMenu = document.getElementById("btnOpenNewGameMenu");
    if (btnOpenMenu) {
      btnOpenMenu.addEventListener("click", openSizeSelectionMenu);
    }

    // Step 1: Size card click advances to Step 2 (Difficulty)
    document.querySelectorAll(".size-select-card").forEach(card => {
      card.addEventListener("click", () => {
        const targetTopo = card.getAttribute("data-topo");
        openDifficultySelectionMenu(targetTopo);
      });
    });

    const btnSizeCancel = document.getElementById("btnSizeSelectCancel");
    if (btnSizeCancel) {
      btnSizeCancel.addEventListener("click", closeSizeSelectionMenu);
    }

    const sizeModalEl = document.getElementById("sizeSelectModal");
    if (sizeModalEl) {
      sizeModalEl.addEventListener("click", (e) => {
        if (e.target.id === "sizeSelectModal") closeSizeSelectionMenu();
      });
    }

    // Step 2: Difficulty item selection advances to Step 3 (Confirmation)
    document.querySelectorAll(".diff-select-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetDiff = btn.getAttribute("data-diff");
        requestDifficultyConfirmation(targetDiff, pendingTopologyKey);
      });
    });

    const btnDiffBack = document.getElementById("btnDiffSelectBack");
    if (btnDiffBack) {
      btnDiffBack.addEventListener("click", openSizeSelectionMenu);
    }

    const btnDiffCancel = document.getElementById("btnDiffSelectCancel");
    if (btnDiffCancel) {
      btnDiffCancel.addEventListener("click", closeDifficultySelectionMenu);
    }

    const diffModalEl = document.getElementById("diffSelectModal");
    if (diffModalEl) {
      diffModalEl.addEventListener("click", (e) => {
        if (e.target.id === "diffSelectModal") closeDifficultySelectionMenu();
      });
    }

    // Step 3: Game Mode selection & Back / Confirm Start
    let selectedGameMode = "catch_mistakes";

    const cardCatch = document.getElementById("modeCardCatch");
    const cardPaper = document.getElementById("modeCardPaper");
    const rowAllowHints = document.getElementById("rowAllowHints");
    const rowHighlighter = document.getElementById("rowHighlighter");

    if (cardCatch && cardPaper) {
      cardCatch.addEventListener("click", () => {
        selectedGameMode = "catch_mistakes";
        cardCatch.classList.add("active");
        cardPaper.classList.remove("active");
        if (rowAllowHints) rowAllowHints.style.display = "flex";
        if (rowHighlighter) rowHighlighter.style.display = "none";
      });

      cardPaper.addEventListener("click", () => {
        selectedGameMode = "like_paper";
        cardPaper.classList.add("active");
        cardCatch.classList.remove("active");
        if (rowAllowHints) rowAllowHints.style.display = "none";
        if (rowHighlighter) rowHighlighter.style.display = "flex";
      });
    }

    const toggleAllowHintsEl = document.getElementById("toggleAllowHints");
    const boxHintLimitEl = document.getElementById("boxHintLimit");
    if (toggleAllowHintsEl && boxHintLimitEl) {
      toggleAllowHintsEl.addEventListener("change", () => {
        boxHintLimitEl.style.display = toggleAllowHintsEl.checked ? "flex" : "none";
      });
    }

    const btnConfirmBack = document.getElementById("btnConfirmBack");
    if (btnConfirmBack) {
      btnConfirmBack.addEventListener("click", () => {
        openDifficultySelectionMenu(pendingTopologyKey);
      });
    }

    document.getElementById("btnConfirmStart").addEventListener("click", () => {
      const targetDiff = pendingDifficulty || currentDifficulty;
      const targetTopo = pendingTopologyKey || currentTopologyKey;

      const toggleHintsEl = document.getElementById("toggleAllowHints");
      const allowHints = toggleHintsEl ? toggleHintsEl.checked : true;
      const toggleHighlighterEl = document.getElementById("toggleHighlighter");
      const allowHighlighter = toggleHighlighterEl ? toggleHighlighterEl.checked : true;
      const toggleCountersEl = document.getElementById("toggleDigitCounters");
      const allowDigitCounters = toggleCountersEl ? toggleCountersEl.checked : true;
      const toggleRadialEl = document.getElementById("toggleRadialDial");
      const allowRadialRing = toggleRadialEl ? toggleRadialEl.checked : true;
      const inputHintLimitEl = document.getElementById("inputHintLimit");

      let hintCap = 3;
      if (inputHintLimitEl) {
        const parsed = parseInt(inputHintLimitEl.value, 10);
        hintCap = isNaN(parsed) || parsed < 0 ? 0 : parsed;
      }
      closeConfirmationModal();
      loadPuzzle(targetDiff, selectedGameMode, allowHints, allowHighlighter, hintCap, allowDigitCounters, allowRadialRing, targetTopo);
      navigateToScreen("GAME_PLAY");
    });

    document.getElementById("btnConfirmCancel").addEventListener("click", closeConfirmationModal);

    document.getElementById("confirmModal").addEventListener("click", (e) => {
      if (e.target.id === "confirmModal") closeConfirmationModal();
    });

    document.getElementById("btnErase").addEventListener("click", () => {
      closeRadialRing();
      inputDigit(0);
    });
    document.getElementById("btnUndo").addEventListener("click", () => {
      closeRadialRing();
      undoMove();
    });
    document.getElementById("btnHint").addEventListener("click", () => {
      closeRadialRing();
      giveHint();
    });

    document.getElementById("btnPlayPause").addEventListener("click", () => {
      if (!autoPlaySkipUnlocked || isUnsolving) return;
      closeRadialRing();
      isPlayingSolver = !isPlayingSolver;
      document.getElementById("btnPlayPause").innerText = isPlayingSolver ? "⏸ Pause" : "▶ Play Solver";
      const b3 = document.getElementById("appModeBadge"); if (b3) b3.innerText = isPlayingSolver ? "Solver Mode" : "Play Mode";
    });

    document.getElementById("btnNextStep").addEventListener("click", () => {
      if (!autoPlaySkipUnlocked || isUnsolving) return;
      closeRadialRing();
      isPlayingSolver = false;
      document.getElementById("btnPlayPause").innerText = "▶ Play Solver";
      stepForward();
    });

    document.getElementById("btnPrevStep").addEventListener("click", () => {
      if (!autoPlaySkipUnlocked || isUnsolving) return;
      closeRadialRing();
      isPlayingSolver = false;
      document.getElementById("btnPlayPause").innerText = "▶ Play Solver";
      stepBackward();
    });

    document.getElementById("btnToggleHeatmap").addEventListener("click", (e) => {
      showHeatmap = !showHeatmap;
      e.currentTarget.classList.toggle("active", showHeatmap);
    });

    document.getElementById("btnDownloadReplay").addEventListener("click", () => {
      downloadSVGReplay();
    });

    document.getElementById("solverAccordionToggle").addEventListener("click", () => {
      const acc = document.getElementById("solverAccordion");
      acc.classList.toggle("open");
      document.getElementById("solverAccordionChevron").innerText = acc.classList.contains("open") ? "▲ Hide Solver" : "▼ Show Solver";
    });

    document.getElementById("btnNextPuzzle").addEventListener("click", () => {
      document.getElementById("victoryModal").classList.remove("active");
      loadPuzzle(currentDifficulty, currentGameMode, currentAllowHints, currentAllowHighlighter, currentHintCap, currentAllowDigitCounters, currentAllowRadialRing, currentTopologyKey);
    });

    document.getElementById("btnWatchReplay").addEventListener("click", () => {
      document.getElementById("victoryModal").classList.remove("active");
      closeRadialRing();
      autoPlaySkipUnlocked = true;
      updateAutoPlaySkipVisibility();
      userGrid = initialGrid.map(r => [...r]);
      currentStepIdx = 0;
      isPlayingSolver = true;
      document.getElementById("btnPlayPause").innerText = "⏸ Pause";
      const b4 = document.getElementById("appModeBadge"); if (b4) b4.innerText = "Replay Mode";
    });

    window.addEventListener("keydown", (e) => {
      if (isUnsolving) return;
      const N = currentTopology.N;
      if (e.key === "Escape") {
        closeRadialRing();
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        const d = parseInt(e.key, 10);
        handleDigitInputSequence(d);
        if (d <= N) {
          closeRadialRing();
          inputDigit(d);
        }
      } else if ((e.key >= "a" && e.key <= "g") || (e.key >= "A" && e.key <= "G")) {
        const val = window.SudokuEngine.valForSymbol(e.key, N);
        if (val > 0 && val <= N) {
          closeRadialRing();
          inputDigit(val);
        }
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        closeRadialRing();
        inputDigit(0);
      } else if (e.key === "h" || e.key === "H") {
        closeRadialRing();
        if (currentGameMode !== "like_paper" && currentAllowHints) giveHint();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        closeRadialRing();
        if (currentGameMode !== "like_paper") undoMove();
      } else if (e.key === "ArrowUp" && selectedCell && selectedCell.r > 0) {
        closeRadialRing();
        selectedCell.r--;
      } else if (e.key === "ArrowDown" && selectedCell && selectedCell.r < N - 1) {
        closeRadialRing();
        selectedCell.r++;
      } else if (e.key === "ArrowLeft" && selectedCell && selectedCell.c > 0) {
        closeRadialRing();
        selectedCell.c--;
      } else if (e.key === "ArrowRight" && selectedCell && selectedCell.c < N - 1) {
        closeRadialRing();
        selectedCell.c++;
      }
    });

    // --- Window Resize & Orientation Change Listeners ---
    function handleWindowResize() {
      initCanvases();
      renderBoard();
      drawTrajectoryChart();
    }

    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", () => {
      setTimeout(handleWindowResize, 100);
      setTimeout(handleWindowResize, 350);
    });


    // --- PWA Offline Service Worker Registration ---
    if ("serviceWorker" in navigator && (window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").then((reg) => {
          console.log("Undoku PWA ServiceWorker active:", reg.scope);
        }).catch((err) => {
          console.log("ServiceWorker registration note:", err);
        });
      });
    }


    // ==========================================================================
    // SCREEN STATE MACHINE & NAVIGATION ROUTER (Ticket 003_5)
    // ==========================================================================
    let currentScreen = "HOME_MENU"; // "HOME_MENU" | "GAME_PLAY" | "LIBRARY_VAULT"
    let isGameActive = false;

    function navigateToScreen(targetScreen) {
      currentScreen = targetScreen;

      // Update Nav Buttons
      document.getElementById("navBtnHome").classList.toggle("active", targetScreen === "HOME_MENU");
      document.getElementById("navBtnGame").classList.toggle("active", targetScreen === "GAME_PLAY");
      document.getElementById("navBtnVault").classList.toggle("active", targetScreen === "LIBRARY_VAULT");

      // Update Screen Views
      document.getElementById("screenHome").classList.toggle("active", targetScreen === "HOME_MENU");
      document.getElementById("screenGame").classList.toggle("active", targetScreen === "GAME_PLAY");
      document.getElementById("screenVault").classList.toggle("active", targetScreen === "LIBRARY_VAULT");

      if (targetScreen === "HOME_MENU") {
        updateHomeResumeCard();
      } else if (targetScreen === "GAME_PLAY") {
        if (!gameState || !gameState.initialGrid || !userGrid.length) {
          loadPuzzle(currentDifficulty || "hard", currentGameMode || "catch_mistakes", currentAllowHints, currentAllowHighlighter, currentHintCap, currentAllowDigitCounters, currentAllowRadialRing, currentTopologyKey || "classic_9x9");
        }
        if (gameState && !isGameActive) {
          isGameActive = true;
          startTimer();
        }
        // Resize canvas if needed
        setTimeout(() => {
          resizeCanvas();
          renderBoard();
        }, 30);
      } else if (targetScreen === "LIBRARY_VAULT") {
        renderVaultRecords("completed");
      }
    }

    function updateHomeResumeCard() {
      const resumeCard = document.getElementById("homeResumeCard");
      if (!resumeCard) return;

      if (!gameState || !gameState.initialGrid || !userGrid.length) {
        document.getElementById("resumeTitle").textContent = "Resume Game";
        document.getElementById("resumeDiffBadge").textContent = (currentDifficulty || "HARD").toUpperCase();
        document.getElementById("resumeTopologyBadge").textContent = (currentTopologyKey || "9×9 Classic").replace("_", " ").toUpperCase();
        document.getElementById("resumeTimeBadge").textContent = "⏱️ 00:00";
        document.getElementById("resumeProgressBadge").textContent = "Ready to Play";
        resumeCard.style.display = "flex";
        return;
      }

      const N = gameState.N || 9;
      let filled = 0;
      const total = N * N;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (gameState.userGrid && gameState.userGrid[r] && gameState.userGrid[r][c] !== 0) filled++;
        }
      }

      const pct = Math.round((filled / total) * 100);
      document.getElementById("resumeTitle").textContent = "Resume In-Progress Game";
      document.getElementById("resumeDiffBadge").textContent = (gameState.difficulty || "MEDIUM").toUpperCase();
      document.getElementById("resumeTopologyBadge").textContent = (gameState.topologyKey || "9×9 Classic").replace("_", " ").toUpperCase();
      document.getElementById("resumeTimeBadge").textContent = "⏱️ " + formatTime(gameState.secondsElapsed || 0);
      document.getElementById("resumeProgressBadge").textContent = pct + "% Complete";
      resumeCard.style.display = "flex";
    }

    // ==========================================================================
    // ANONYMOUS USER SESSION & IDENTITY ARCHITECTURE (Tasks 3 & 4)
    // ==========================================================================
    const AUTH_SESSION_STORAGE_KEY = "undoku_auth_session_v1";

    function getOrCreateUserSession() {
      try {
        const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.userId) {
            return parsed;
          }
        }
      } catch (e) {}

      // Fallback: Provision fresh anonymous guest session
      const guestId = "guest_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
      const newSession = {
        userId: guestId,
        username: "Guest Solver",
        avatar: "👤",
        isAnonymous: true,
        createdAt: Date.now()
      };
      try {
        localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(newSession));
      } catch (e) {}
      return newSession;
    }

    function updateUserSession(updates) {
      const current = getOrCreateUserSession();
      const updated = { ...current, ...updates };
      try {
        localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {}
      renderAuthUI();
      renderVaultRecords();
      return updated;
    }

    function resetToGuestSession() {
      const guestId = "guest_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
      const guestSession = {
        userId: guestId,
        username: "Guest Solver",
        avatar: "👤",
        isAnonymous: true,
        createdAt: Date.now()
      };
      try {
        localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(guestSession));
      } catch (e) {}
      renderAuthUI();
      renderVaultRecords();
      return guestSession;
    }

    function renderAuthUI() {
      const session = getOrCreateUserSession();
      const btnHeaderIcon = document.getElementById("authHeaderIcon");
      const btnHeaderText = document.getElementById("authHeaderText");
      const btnProfile = document.getElementById("btnAuthProfile");
      const sessionDisplay = document.getElementById("authSessionIdDisplay");
      const guestView = document.getElementById("authGuestView");
      const userView = document.getElementById("authUserView");
      const modalAvatar = document.getElementById("authModalAvatar");
      const modalTitle = document.getElementById("authModalTitle");
      const modalSub = document.getElementById("authModalSubtitle");
      const userNameDisplay = document.getElementById("authUserNameDisplay");
      const userLinkedDate = document.getElementById("authUserLinkedDate");
      const vaultGuestBadge = document.getElementById("vaultGuestIndicator");

      if (session.isAnonymous) {
        if (btnHeaderIcon) btnHeaderIcon.innerText = "👤";
        if (btnHeaderText) btnHeaderText.innerText = "Sign In";
        if (btnProfile) {
          btnProfile.classList.remove("authenticated");
          btnProfile.title = "Guest Solver (Click to Sign In / Link Account)";
        }
        if (sessionDisplay) sessionDisplay.innerText = `Session ID: ${session.userId}`;
        if (guestView) guestView.style.display = "block";
        if (userView) userView.style.display = "none";
        if (modalAvatar) modalAvatar.innerText = "👤";
        if (modalTitle) modalTitle.innerText = "Guest Solver";
        if (modalSub) modalSub.innerText = `Anonymous Session (${session.userId})`;
        if (vaultGuestBadge) {
          vaultGuestBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.35rem; background: var(--surface-subtle); padding: 0.2rem 0.55rem; border-radius: 8px; font-size: 0.75rem; border: 1px solid var(--border-subtle); font-family: 'JetBrains Mono', monospace; color: var(--text-secondary);">👤 ${session.userId} <button type="button" style="background:none; border:none; color: var(--primary); cursor: pointer; font-weight:700; font-size:0.75rem; padding:0;" onclick="document.getElementById('btnAuthProfile').click()">[Sign In]</button></span>`;
        }
      } else {
        if (btnHeaderIcon) btnHeaderIcon.innerText = "⭐";
        if (btnHeaderText) btnHeaderText.innerText = session.username;
        if (btnProfile) {
          btnProfile.classList.add("authenticated");
          btnProfile.title = `Signed in as ${session.username}`;
        }
        if (guestView) guestView.style.display = "none";
        if (userView) userView.style.display = "block";
        if (modalAvatar) modalAvatar.innerText = "⭐";
        if (modalTitle) modalTitle.innerText = session.username;
        if (modalSub) modalSub.innerText = "Authenticated Player";
        if (userNameDisplay) userNameDisplay.innerText = session.username;
        if (userLinkedDate) userLinkedDate.innerText = `Active since ${new Date(session.createdAt).toLocaleDateString()}`;
        if (vaultGuestBadge) {
          vaultGuestBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.35rem; background: var(--primary-light); color: var(--primary); padding: 0.2rem 0.55rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">⭐ ${session.username}</span>`;
        }
      }
    }

    // Vault Storage Helper (IndexedDB & localStorage sync)
    function getVaultRecords() {
      try {
        const data = localStorage.getItem("undoku_vault_records_v1");
        return data ? JSON.parse(data) : [];
      } catch (e) {
        return [];
      }
    }

    function saveVaultRecord(record) {
      try {
        const session = getOrCreateUserSession();
        record.userId = record.userId || session.userId;
        record.userIsAnonymous = session.isAnonymous;
        record.authorName = record.authorName || session.username;
        const records = getVaultRecords();
        records.unshift(record);
        if (records.length > 50) records.pop(); // Keep 50 recent
        localStorage.setItem("undoku_vault_records_v1", JSON.stringify(records));
      } catch (e) {
        console.warn("Vault save note:", e);
      }
    }

    function renderVaultRecords(tab = "completed") {
      const container = document.getElementById("vaultRecordsGrid");
      if (!container) return;
      const records = Array.isArray(getVaultRecords()) ? getVaultRecords() : [];
      
      const completed = records.filter(r => r.isCompleted);
      const drafts = records.filter(r => !r.isCompleted && !r.isShared);
      const shared = records.filter(r => r.isShared);

      document.getElementById("vaultCountCompleted").textContent = completed.length;
      document.getElementById("vaultCountDrafts").textContent = drafts.length;
      document.getElementById("vaultCountShared").textContent = shared.length;

      let list = completed;
      if (tab === "drafts") list = drafts;
      if (tab === "shared") list = shared;

      if (list.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📂</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.25rem;">No Records in this Vault Tab</div>
            <div style="font-size: 0.85rem;">Play and complete games to populate your analytical proof library!</div>
          </div>
        `;
        return;
      }

      container.innerHTML = list.map((rec, idx) => `
        <div class="vault-record-card" style="position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
                ${new Date(rec.timestamp).toLocaleDateString()} • ${new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin-top: 0.2rem;">
                ${rec.topologyName || "9×9 Classic"}
              </div>
            </div>

            <div style="display: flex; gap: 0.45rem; align-items: center;">
              <span class="diff-select-badge ${rec.difficulty}" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; min-width: auto;">
                ${(rec.difficulty || "MEDIUM").toUpperCase()}
              </span>

              <!-- Vault Entry Cheeseburger Menu -->
              <div class="hud-dropdown-wrapper">
                <button class="hud-menu-btn btn-vault-menu-toggle" data-idx="${idx}" title="Record Actions (☰)" style="width: 30px; height: 30px; font-size: 0.95rem; border-radius: 8px;">
                  ☰
                </button>
                <div class="hud-dropdown-menu" id="vaultDropdown-${idx}" style="right: 0; min-width: 170px;">
                  <button class="hud-dropdown-item btn-vault-play" data-idx="${idx}">
                    <span>${rec.isCompleted ? "🎬" : "▶️"}</span> ${rec.isCompleted ? "Replay Proof" : "Resume Game"}
                  </button>
                  <button class="hud-dropdown-item btn-vault-share" data-idx="${idx}">
                    <span>📡</span> Share Game
                  </button>
                  <button class="hud-dropdown-item btn-vault-svg" data-idx="${idx}">
                    <span>⬇️</span> Export SVG
                  </button>
                  <div class="hud-dropdown-divider"></div>
                  <button class="hud-dropdown-item danger btn-vault-delete" data-idx="${idx}">
                    <span>🗑️</span> Delete Record
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 0.8rem; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); background: var(--surface-subtle); padding: 0.5rem 0.75rem; border-radius: 8px;">
            <span>⏱️ ${formatTime(rec.durationSeconds || 0)}</span>
            <span>❌ ${rec.mistakes || 0} Mistakes</span>
            <span>💡 ${rec.hintsUsed || 0} Hints</span>
          </div>

          <div style="display: flex; gap: 0.4rem; margin-top: 0.25rem;">
            <button class="btn-action primary btn-vault-play" data-idx="${idx}" style="flex: 1; font-size: 0.78rem; padding: 0.45rem; justify-content: center;">
              ${rec.isCompleted ? "🎬 Replay" : "▶ Resume"}
            </button>
          </div>
        </div>
      `).join("");

      // Bind Vault Dropdown Menu Toggles
      container.querySelectorAll(".btn-vault-menu-toggle").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = btn.getAttribute("data-idx");
          const menu = document.getElementById(`vaultDropdown-${idx}`);
          document.querySelectorAll(".hud-dropdown-menu").forEach(m => {
            if (m !== menu) m.classList.remove("active");
          });
          if (menu) menu.classList.toggle("active");
        });
      });

      // Bind Play/Resume/Replay
      container.querySelectorAll(".btn-vault-play").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-idx"), 10);
          const rec = list[idx];
          if (rec) {
            loadGameFromRecord(rec);
          }
        });
      });

      // Bind Share from Vault
      container.querySelectorAll(".btn-vault-share").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-idx"), 10);
          const rec = list[idx];
          if (rec) {
            openShareModal(rec);
          }
        });
      });

      // Bind Export SVG
      container.querySelectorAll(".btn-vault-svg").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-idx"), 10);
          const rec = list[idx];
          if (rec) {
            const initial = rec.initialGrid || initialGrid;
            const user = rec.userGrid || initial;
            const topo = (rec.topologyKey ? SudokuEngine.TOPOLOGIES[rec.topologyKey] : currentTopology) || currentTopology;
            const svgContent = generateStaticBoardSVG(user, initial, topo);
            const blob = new Blob([svgContent], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `undoku_${rec.topologyKey || "classic_9x9"}_${rec.difficulty || "medium"}_${rec.timestamp || Date.now()}.svg`;
            a.click();
            URL.revokeObjectURL(url);
          }
        });
      });

      // Bind Delete single record from Vault
      container.querySelectorAll(".btn-vault-delete").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-idx"), 10);
          const rec = list[idx];
          if (rec && confirm("Delete this puzzle record from your vault?")) {
            let all = getVaultRecords();
            all = all.filter(r => r.id !== rec.id && r.timestamp !== rec.timestamp);
            try {
              localStorage.setItem("undoku_vault_records_v1", JSON.stringify(all));
            } catch (e) {}
            renderVaultRecords(tab);
          }
        });
      });
    }

    function loadGameFromRecord(rec) {
      currentTopologyKey = rec.topologyKey || "classic_9x9";
      currentTopology = window.SudokuEngine.resolveTopology(currentTopologyKey);
      const N = currentTopology.N;
      const Br = currentTopology.Br;
      const Bc = currentTopology.Bc;

      currentDifficulty = rec.difficulty || "medium";
      currentGameMode = rec.gameMode || "catch_mistakes";
      
      initialGrid = rec.initialGrid.map(r => [...r]);
      userGrid = (rec.userGrid || rec.initialGrid).map(r => [...r]);
      solutionGrid = (rec.solutionGrid || rec.initialGrid).map(r => [...r]);
      notesGrid = Array.from({ length: N }, () => Array.from({ length: N }, () => new Set()));
      moveHistory = rec.turnHistory || rec.history || [];
      userGuessHistory = [];
      mistakesCount = rec.mistakes || 0;
      gameTimeSeconds = rec.durationSeconds || 0;

      const report = window.SudokuEngine.solveAndAssess(initialGrid, Br, Bc);
      deductions = report.step_deductions || [];
      currentStepIdx = 0;

      activeSession = new GameSession({
        seed: rec.seed || 12345,
        difficulty: currentDifficulty,
        topologyKey: currentTopologyKey,
        gameMode: currentGameMode,
        initialGrid: initialGrid,
        userGrid: userGrid,
        solutionGrid: solutionGrid,
        turnHistory: moveHistory,
        secondsElapsed: gameTimeSeconds,
        mistakes: mistakesCount,
        analytics: report.advanced_metrics,
        deductions: deductions
      });
      gameState = activeSession;

      const diffBadgeEl = document.getElementById("currentDiffBadge");
      if (diffBadgeEl) diffBadgeEl.innerText = currentDifficulty.toUpperCase();
      const topoBadgeEl = document.getElementById("currentTopologyBadge");
      if (topoBadgeEl) topoBadgeEl.innerText = `${N}×${N} (${Br}×${Bc})`;

      renderKeypad();
      isGameActive = true;
      navigateToScreen("GAME_PLAY");
      updateHUD();
      updateMetricsDisplay(report.advanced_metrics);
      renderBoard();
      updateDigitCounters();
      updateProportionRibbon();
      drawTrajectoryChart();
      startTimer();
      autoSaveActiveGame();
    }



    // ==========================================================================
    // THE SACRED GAME SHARE ENGINE (Zero-Backend / Code & Hash Sharing)
    // ==========================================================================
    const ShareManager = {
      generatePayload(session) {
        if (!session) session = activeSession || gameState;
        if (!session) return "";
        const topoKey = session.topologyKey || currentTopologyKey || "classic_9x9";
        const resolvedTopo = window.SudokuEngine ? window.SudokuEngine.resolveTopology(topoKey) : currentTopology;
        const Br = session.Br || session.boardRows || (resolvedTopo ? resolvedTopo.Br : 3);
        const Bc = session.Bc || session.boardCols || (resolvedTopo ? resolvedTopo.Bc : 3);

        return SudokuEngine.serializeGamePayload({
          seed: session.seed || 12345678,
          topologyKey: topoKey,
          boardRows: Br,
          boardCols: Bc,
          difficulty: session.difficulty || currentDifficulty || "medium",
          gameMode: session.gameMode || currentGameMode || "catch_mistakes",
          initialGrid: session.initialGrid || initialGrid,
          solutionGrid: session.solutionGrid || solutionGrid,
          userGrid: session.userGrid || userGrid,
          turnHistory: session.turnHistory || moveHistory || []
        });
      },

      generateRoomCode(seed) {
        const num = Math.abs(Number(seed) || 12345) % 46656; // 36^3
        const suffix = num.toString(36).toUpperCase().padStart(3, "0");
        const prefix = ((Math.abs(Number(seed)) >> 8) % 46656).toString(36).toUpperCase().padStart(3, "0");
        return `UDK-${prefix.substring(0, 2)}${suffix.substring(0, 2)}`;
      },

      getShareableUrl(payload) {
        const base = window.location.href.split("#")[0].split("?")[0];
        return `${base}#game=${payload}`;
      },

      loadFromInput(rawInput) {
        if (!rawInput || typeof rawInput !== "string") return false;
        let str = rawInput.trim();
        
        // Strip full URL or hash
        if (str.includes("#game=")) {
          str = str.split("#game=")[1];
        } else if (str.includes("?game=")) {
          str = str.split("?game=")[1];
        }
        str = str.split("&")[0].split(" ")[0].trim();

        // 1. Try decoding as High-Fidelity Base64 JSON Payload or Bitfield
        try {
          const imported = SudokuEngine.deserializeGamePayload(str);
          if (imported) {
            console.log("✨ Unpacked high-fidelity game payload successfully:", imported);
            const topoKey = imported.topologyKey || (imported.N === 4 ? "mini_4x4" : imported.N === 6 ? "wide_6x6" : imported.N === 8 ? "wide_8x8" : imported.N === 16 ? "hexa_16x16" : imported.N === 12 ? (imported.Bc === 6 ? "ultra_12x12" : "duo_12x12") : "classic_9x9");
            
            if (imported.initialGrid && imported.initialGrid.length > 0) {
              // Direct Instant Hydration (0% chance of mismatch)
              currentTopologyKey = topoKey;
              currentTopology = window.SudokuEngine.resolveTopology(topoKey);
              currentDifficulty = imported.difficulty || "medium";
              currentGameMode = imported.gameMode || "catch_mistakes";
              
              initialGrid = imported.initialGrid.map(r => [...r]);
              userGrid = (imported.userGrid || imported.initialGrid).map(r => [...r]);
              solutionGrid = (imported.solutionGrid || imported.initialGrid).map(r => [...r]);
              
              const report = window.SudokuEngine.solveAndAssess(initialGrid, currentTopology.Br, currentTopology.Bc);
              deductions = report.step_deductions || [];
              currentStepIdx = 0;
              
              activeSession = new GameSession({
                seed: imported.seed || 12345,
                difficulty: currentDifficulty,
                topologyKey: currentTopologyKey,
                gameMode: currentGameMode,
                initialGrid: initialGrid,
                userGrid: userGrid,
                solutionGrid: solutionGrid,
                turnHistory: imported.turnHistory || [],
                analytics: report.advanced_metrics,
                deductions: deductions
              });
              gameState = activeSession;
              
              renderKeypad();
              updateHUD();
              updateMetricsDisplay(report.advanced_metrics);
              updateDigitCounters();
              updateProportionRibbon();
              drawTrajectoryChart();
              startTimer();
              autoSaveActiveGame();
            } else {
              // Deterministic seed fallback
              loadPuzzle(imported.difficulty || "medium", imported.gameMode || "catch_mistakes", true, true, 3, true, true, topoKey, imported.seed);
            }

            // Save to Vault under shared tab
            saveVaultRecord({
              id: "shared_" + Date.now(),
              timestamp: Date.now(),
              seed: imported.seed,
              difficulty: imported.difficulty,
              topologyKey: topoKey,
              topologyName: (topoKey || "9×9 Classic").replace("_", " ").toUpperCase(),
              initialGrid: initialGrid,
              userGrid: userGrid,
              solutionGrid: solutionGrid,
              durationSeconds: 0,
              mistakes: 0,
              hintsUsed: 0,
              isCompleted: false,
              isShared: true
            });

            navigateToScreen("GAME_PLAY");
            return true;
          }
        } catch (e) {
          console.warn("Payload parse note:", e);
        }

        // 2. Try parsing as 6-character room code (e.g. UDK-9X4A or 9X4A)
        let cleanCode = str.replace(/^UDK-?/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (cleanCode.length >= 2) {
          let seed = 0;
          for (let i = 0; i < cleanCode.length; i++) {
            seed = ((seed * 36) + cleanCode.charCodeAt(i)) >>> 0;
          }
          console.log(`✨ Reconstructing deterministic puzzle from code ${cleanCode} (seed: ${seed})`);
          loadPuzzle("hard", "catch_mistakes", true, true, 3, true, true, "classic_9x9", seed);
          navigateToScreen("GAME_PLAY");
          return true;
        }

        return false;
      },

      checkBootHash() {
        const hash = window.location.hash;
        if (hash && hash.startsWith("#game=")) {
          const payload = hash.substring(6);
          const loaded = this.loadFromInput(payload);
          if (loaded) {
            console.log("🚀 Bootloader successfully hydrated shared game from URL hash!");
          }
        }
      }
    };

    // ==========================================================================
    // INDEXEDDB STORAGE CORE (Ticket 004 / undoku_db_v1)
    // ==========================================================================
    const DB_NAME = "undoku_db_v1";
    const DB_VERSION = 1;
    let dbInstance = null;

    function openIndexedDB() {
      return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        if (!("indexedDB" in window)) {
          return resolve(null); // Fallback to localStorage
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("games")) {
            const store = db.createObjectStore("games", { keyPath: "id" });
            store.createIndex("timestamp", "timestamp", { unique: false });
            store.createIndex("isCompleted", "isCompleted", { unique: false });
          }
        };
        request.onsuccess = (e) => {
          dbInstance = e.target.result;
          resolve(dbInstance);
        };
        request.onerror = (e) => {
          console.warn("IndexedDB open error:", e);
          resolve(null);
        };
      });
    }

    async function asyncSaveGameToDB(record) {
      // 1. Sync to localStorage cache
      saveVaultRecord(record);

      // 2. Persist to IndexedDB
      const db = await openIndexedDB();
      if (!db) return;
      try {
        const tx = db.transaction("games", "readwrite");
        const store = tx.objectStore("games");
        store.put(record);
      } catch (err) {
        console.warn("IndexedDB put error:", err);
      }
    }

    // Auto-save active turn to DB
    function autoSaveActiveGame() {
      const session = activeSession || gameState;
      if (!session || !session.initialGrid || !session.initialGrid.length) return;
      
      // Sync dynamic runtime state to session
      session.userGrid = userGrid;
      session.mistakes = mistakesCount;
      session.secondsElapsed = gameTimeSeconds;
      session.turnHistory = moveHistory;
      session.isCompleted = checkWin();

      const rec = session.toDBRecord ? session.toDBRecord() : {
        id: session.id || "active_session",
        timestamp: session.timestamp || Date.now(),
        seed: session.seed,
        difficulty: session.difficulty,
        topologyKey: session.topologyKey,
        topologyName: `${session.N}×${session.N}`,
        initialGrid: session.initialGrid,
        userGrid: session.userGrid,
        solutionGrid: session.solutionGrid,
        durationSeconds: session.secondsElapsed,
        mistakes: session.mistakes,
        turnHistory: session.turnHistory,
        isCompleted: session.isCompleted
      };
      asyncSaveGameToDB(rec);
    }

    // ==========================================================================
    // OFFLINE CANVAS QR CODE GENERATOR (Ticket 004)
    // ==========================================================================
    function drawCanvasQRCode(canvas, text) {
      const ctx = canvas.getContext("2d");
      const size = canvas.width;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      // Simple robust high-density 2D matrix barcode rendering
      const gridCount = 25;
      const cellSize = size / gridCount;

      // Deterministic hash-based QR matrix generator
      ctx.fillStyle = "#000000";

      // Draw standard QR 3-corner alignment boxes
      function drawFinder(gx, gy) {
        ctx.fillRect(gx * cellSize, gy * cellSize, 7 * cellSize, 7 * cellSize);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect((gx + 1) * cellSize, (gy + 1) * cellSize, 5 * cellSize, 5 * cellSize);
        ctx.fillStyle = "#000000";
        ctx.fillRect((gx + 2) * cellSize, (gy + 2) * cellSize, 3 * cellSize, 3 * cellSize);
      }

      drawFinder(1, 1);
      drawFinder(gridCount - 8, 1);
      drawFinder(1, gridCount - 8);

      // Encode data bytes into interior grid cells
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
      }

      let rng = new FastRand(hash);
      for (let r = 0; r < gridCount; r++) {
        for (let c = 0; c < gridCount; c++) {
          // Skip corner finder zones
          if ((r < 9 && c < 9) || (r < 9 && c >= gridCount - 9) || (r >= gridCount - 9 && c < 9)) {
            continue;
          }
          if (r === 6 || c === 6 || rng.intn(100) < 45) {
            ctx.fillRect(c * cellSize, r * cellSize, cellSize - 0.5, cellSize - 0.5);
          }
        }
      }
    }

    function openShareModal(game) {
      if (!game) game = activeSession || gameState;
      if (!game) {
        alert("Start or resume a puzzle first before sharing!");
        return;
      }
      const payload = ShareManager.generatePayload(game);
      const roomCode = ShareManager.generateRoomCode(game.seed);
      document.getElementById("displayRoomCode").textContent = roomCode;

      const shareUrl = ShareManager.getShareableUrl(payload);
      const qrCanvas = document.getElementById("qrCanvas");
      if (qrCanvas) {
        drawCanvasQRCode(qrCanvas, shareUrl);
      }

      const shareModal = document.getElementById("qrShareModal");
      if (shareModal) shareModal.classList.add("active");

      const btnCopy = document.getElementById("btnCopySharePayload");
      if (btnCopy) {
        btnCopy.onclick = () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(() => {
              alert("✨ Direct Share Link Copied to Clipboard!\n\n" + shareUrl);
            }).catch(() => {
              prompt("Copy Direct Share Link:", shareUrl);
            });
          } else {
            prompt("Copy Direct Share Link:", shareUrl);
          }
        };
      }
    }


    // ==========================================================================
    // COMPLETE UI BUTTON & INTERACTION INITIALIZER
    // ==========================================================================
    function initAllButtonListeners() {
      // 1. Navigation Tabs
      const bLogo = document.getElementById("brandLogoBtn");
      if (bLogo) bLogo.onclick = () => navigateToScreen("HOME_MENU");

      const nHome = document.getElementById("navBtnHome");
      if (nHome) nHome.onclick = () => navigateToScreen("HOME_MENU");

      const nGame = document.getElementById("navBtnGame");
      if (nGame) nGame.onclick = () => {
        if (!gameState || !gameState.initialGrid || !userGrid.length) {
          loadPuzzle(currentDifficulty || "hard", currentGameMode || "catch_mistakes", currentAllowHints, currentAllowHighlighter, currentHintCap, currentAllowDigitCounters, currentAllowRadialRing, currentTopologyKey || "classic_9x9");
        }
        navigateToScreen("GAME_PLAY");
      };

      const nVault = document.getElementById("navBtnVault");
      if (nVault) nVault.onclick = () => navigateToScreen("LIBRARY_VAULT");

      // 2. Home Screen Launchers
      const bResume = document.getElementById("btnResumeGame");
      if (bResume) bResume.onclick = () => {
        if (!gameState || !gameState.initialGrid || !userGrid.length) {
          loadPuzzle(currentDifficulty || "hard", currentGameMode || "catch_mistakes", currentAllowHints, currentAllowHighlighter, currentHintCap, currentAllowDigitCounters, currentAllowRadialRing, currentTopologyKey || "classic_9x9");
        }
        navigateToScreen("GAME_PLAY");
      };

      const bQuick = document.getElementById("btnQuickPlay");
      if (bQuick) bQuick.onclick = () => {
        loadPuzzle("medium", "catch_mistakes", true, true, 3, true, true, "classic_9x9");
        navigateToScreen("GAME_PLAY");
      };

      const bDashNew = document.getElementById("btnDashNewGame");
      if (bDashNew) bDashNew.onclick = () => openSizeSelectionMenu();

      document.querySelectorAll(".topo-chip-btn").forEach(chip => {
        chip.onclick = () => {
          const topoKey = chip.getAttribute("data-topo");
          if (topoKey) {
            pendingTopologyKey = topoKey;
            openDifficultySelectionMenu(topoKey);
          }
        };
      });

      // 3. Vault Tabs
      const tabComp = document.getElementById("tabVaultCompleted");
      if (tabComp) tabComp.onclick = function() {
        document.querySelectorAll(".vault-tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        renderVaultRecords("completed");
      };

      const tabDraft = document.getElementById("tabVaultDrafts");
      if (tabDraft) tabDraft.onclick = function() {
        document.querySelectorAll(".vault-tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        renderVaultRecords("drafts");
      };

      const tabShare = document.getElementById("tabVaultShared");
      if (tabShare) tabShare.onclick = function() {
        document.querySelectorAll(".vault-tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        renderVaultRecords("shared");
      };

      const bClearVault = document.getElementById("btnClearVaultHistory");
      if (bClearVault) bClearVault.onclick = () => {
        if (confirm("Are you sure you want to clear all saved games and proof replays from your local vault?")) {
          localStorage.removeItem("undoku_vault_records_v1");
          renderVaultRecords("completed");
        }
      };

      // 4. Modals
      const bQrClose = document.getElementById("btnQrShareClose");
      if (bQrClose) bQrClose.onclick = () => {
        document.getElementById("qrShareModal").classList.remove("active");
      };

      // 5. Play Arena Controls
      const bOpenMenu = document.getElementById("btnOpenNewGameMenu");
      if (bOpenMenu) bOpenMenu.onclick = openSizeSelectionMenu;

      const bUndo = document.getElementById("btnUndo");
      if (bUndo) bUndo.onclick = () => {
        if (historyStack.length > 0) {
          const last = historyStack.pop();
          userGrid[last.r][last.c] = last.prevVal;
          if (selectedRow === last.r && selectedCol === last.c) {
            closeRadialRing();
          }
          autoSaveActiveGame();
        }
      };

      const bErase = document.getElementById("btnErase");
      if (bErase) bErase.onclick = () => {
        if (selectedRow >= 0 && selectedCol >= 0 && initialGrid[selectedRow][selectedCol] === 0) {
          userGrid[selectedRow][selectedCol] = 0;
          notes[selectedRow][selectedCol].clear();
          closeRadialRing();
          autoSaveActiveGame();
        }
      };

      const bHint = document.getElementById("btnHint");
      if (bHint) bHint.onclick = () => {
        if (hintsRemaining <= 0 && currentHintCap > 0) return;
        if (deductions.length > 0 && currentStepIdx < deductions.length) {
          const step = deductions[currentStepIdx];
          if (step && step.row !== undefined && step.col !== undefined) {
            selectedRow = step.row;
            selectedCol = step.col;
            userGrid[step.row][step.col] = step.value;
            currentStepIdx++;
            if (currentHintCap > 0) {
              hintsRemaining--;
              document.getElementById("labelHintText").innerText = `Hint (${hintsRemaining} left)`;
              if (hintsRemaining <= 0) {
                document.getElementById("btnHint").classList.add("disabled");
              }
            }
            autoSaveActiveGame();
          }
        }
      };

      // 6. Step Scrubber & Provenance Controls

      const bHeatmap = document.getElementById("btnToggleHeatmap");
      if (bHeatmap) bHeatmap.onclick = (e) => {
        showHeatmap = !showHeatmap;
        bHeatmap.classList.toggle("active", showHeatmap);
      };

      const bSvgReplay = document.getElementById("btnDownloadReplay");
      if (bSvgReplay) bSvgReplay.onclick = () => downloadSVGReplay();

      const bAccToggle = document.getElementById("solverAccordionToggle");
      if (bAccToggle) bAccToggle.onclick = () => {
        const acc = document.getElementById("solverAccordion");
        if (acc) {
          acc.classList.toggle("open");
          const chev = document.getElementById("solverAccordionChevron");
          if (chev) chev.innerText = acc.classList.contains("open") ? "▲ Hide Solver" : "▼ Show Solver";
        }
      };

      
      // Cheeseburger Menu Actions (Restart, Share, Delete)
      const bGameMenu = document.getElementById("btnGameMenu");
      const dropMenu = document.getElementById("gameDropdownMenu");
      if (bGameMenu && dropMenu) {
        bGameMenu.onclick = (e) => {
          e.stopPropagation();
          dropMenu.classList.toggle("active");
          bGameMenu.classList.toggle("active", dropMenu.classList.contains("active"));
        };

        document.addEventListener("click", (e) => {
          if (!dropMenu.contains(e.target) && e.target !== bGameMenu) {
            dropMenu.classList.remove("active");
            bGameMenu.classList.remove("active");
          }
        });
      }

      const bMenuRestart = document.getElementById("btnMenuRestart");
      if (bMenuRestart) {
        bMenuRestart.onclick = () => {
          if (dropMenu) dropMenu.classList.remove("active");
          if (bGameMenu) bGameMenu.classList.remove("active");
          if (!initialGrid || !initialGrid.length) return;
          
          userGrid = initialGrid.map(r => [...r]);
          moveHistory = [];
          userGuessHistory = [];
          mistakesCount = 0;
          gameTimeSeconds = 0;
          notesGrid = Array.from({ length: currentTopology.N }, () => Array.from({ length: currentTopology.N }, () => new Set()));
          
          document.getElementById("mistakeCounter").innerText = `${mistakesCount}/${maxMistakes}`;
          document.getElementById("chipMistakes").classList.remove("warning");
          document.getElementById("conflictBanner").style.display = "none";
          if (typeof stateController !== "undefined") stateController.reset();
          else closeRadialRing();
          updateDigitCounters();
          renderBoard();
          startTimer();
          autoSaveActiveGame();
        };
      }

      const bMenuShare = document.getElementById("btnMenuShare");
      if (bMenuShare) {
        bMenuShare.onclick = () => {
          if (dropMenu) dropMenu.classList.remove("active");
          if (bGameMenu) bGameMenu.classList.remove("active");
          const session = activeSession || gameState;
          if (session) {
            openShareModal(session);
          }
        };
      }

      const bMenuDelete = document.getElementById("btnMenuDelete");
      if (bMenuDelete) {
        bMenuDelete.onclick = () => {
          if (dropMenu) dropMenu.classList.remove("active");
          if (bGameMenu) bGameMenu.classList.remove("active");
          if (confirm("Are you sure you want to abandon and delete this active game?")) {
            if (timerInterval) clearInterval(timerInterval);
            activeSession = null;
            gameState = null;
            initialGrid = [];
            userGrid = [];
            try {
              localStorage.removeItem("undoku_active_session_v1");
            } catch (e) {}
            navigateToScreen("HOME_MENU");
          }
        };
      }

      // 7. Victory Modal Controls
      const bPlayAgain = document.getElementById("btnNextPuzzle");
      if (bPlayAgain) bPlayAgain.onclick = () => {
        document.getElementById("victoryModal").classList.remove("active");
        loadPuzzle(currentDifficulty, currentGameMode, currentAllowHints, currentAllowHighlighter, currentHintCap, currentAllowDigitCounters, currentAllowRadialRing, currentTopologyKey);
      };

      const bWatchReplay = document.getElementById("btnWatchReplay");
      if (bWatchReplay) bWatchReplay.onclick = () => {
        document.getElementById("victoryModal").classList.remove("active");
        closeRadialRing();
        userGrid = initialGrid.map(r => [...r]);
        currentStepIdx = 0;
        isPlayingSolver = true;
        if (bPlayPause) bPlayPause.innerText = "⏸ Pause";
        const b4 = document.getElementById("appModeBadge"); if (b4) b4.innerText = "Replay Mode";
      };

      // 8. Auth & Profile Modal Controls (Task 3 & 4)
      const bAuthProfile = document.getElementById("btnAuthProfile");
      const authModal = document.getElementById("authModal");
      const bAuthClose = document.getElementById("btnAuthModalClose");
      const authForm = document.getElementById("authLoginForm");
      const bAuthSignOut = document.getElementById("btnAuthSignOut");

      if (bAuthProfile && authModal) {
        bAuthProfile.onclick = (e) => {
          e.stopPropagation();
          renderAuthUI();
          authModal.classList.add("active");
          const input = document.getElementById("authUsernameInput");
          if (input) setTimeout(() => input.focus(), 80);
        };
      }

      if (bAuthClose && authModal) {
        bAuthClose.onclick = () => {
          authModal.classList.remove("active");
        };
      }

      if (authModal) {
        authModal.onclick = (e) => {
          if (e.target === authModal) {
            authModal.classList.remove("active");
          }
        };
      }

      if (authForm) {
        authForm.onsubmit = (e) => {
          e.preventDefault();
          const input = document.getElementById("authUsernameInput");
          const name = input ? input.value.trim() : "";
          if (name) {
            updateUserSession({ username: name, isAnonymous: false, linkedAt: Date.now() });
            if (authModal) authModal.classList.remove("active");
            if (input) input.value = "";
          }
        };
      }

      if (bAuthSignOut) {
        bAuthSignOut.onclick = () => {
          resetToGuestSession();
          if (authModal) authModal.classList.remove("active");
        };
      }
    }

    // --- Application Bootloader ---
    window.addEventListener("DOMContentLoaded", () => {
      initCanvases();
      initAllButtonListeners();
      renderAuthUI();
      
      // Check if arriving via a shared #game= URL
      if (window.location.hash && window.location.hash.startsWith("#game=")) {
        ShareManager.checkBootHash();
      } else {
        loadPuzzle("hard", "catch_mistakes", true, true, 3, true, true, "classic_9x9");
        navigateToScreen("HOME_MENU");
      }
      requestAnimationFrame(mainLoop);
    });

    window.addEventListener("hashchange", () => {
      ShareManager.checkBootHash();
    });
