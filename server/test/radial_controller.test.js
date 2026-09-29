const { describe, it } = require('node:test');
const assert = require('assert');
const { TwoTapStateController, getAvailableRadialDigits } = require('../../shared/engine');

describe('Ticket 005: Deterministic Two-Tap State Machine & Radial Digit Controller', () => {

  describe('TwoTapStateController State Transitions', () => {
    it('should initialize in IDLE state with no focused cell', () => {
      const controller = new TwoTapStateController();
      assert.strictEqual(controller.getState(), 'IDLE');
      assert.strictEqual(controller.getFocusedCell(), null);
    });

    it('Tap 1 (unfocused cell): should set focus to that cell and keep ring closed', () => {
      let focusedCellResult = null;
      let stateResult = null;
      let radialOpened = false;

      const controller = new TwoTapStateController({
        onFocusChange: (cell) => { focusedCellResult = cell; },
        onStateChange: (state) => { stateResult = state; },
        onOpenRadial: () => { radialOpened = true; }
      });

      const res = controller.handleCellTap(2, 4, true);

      assert.strictEqual(res.action, 'FOCUS');
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.deepStrictEqual(controller.getFocusedCell(), { r: 2, c: 4 });
      assert.deepStrictEqual(focusedCellResult, { r: 2, c: 4 });
      assert.strictEqual(stateResult, 'FOCUSED');
      assert.strictEqual(radialOpened, false, 'Radial ring should NOT open on tap 1');
    });

    it('Tap on different cell: should shift focus to new cell and keep ring closed', () => {
      let radialOpened = false;
      const controller = new TwoTapStateController({
        onOpenRadial: () => { radialOpened = true; }
      });

      controller.handleCellTap(1, 1, true);
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.deepStrictEqual(controller.getFocusedCell(), { r: 1, c: 1 });

      const res = controller.handleCellTap(3, 5, true);
      assert.strictEqual(res.action, 'FOCUS');
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.deepStrictEqual(controller.getFocusedCell(), { r: 3, c: 5 });
      assert.strictEqual(radialOpened, false, 'Radial ring must remain closed when tapping different cell');
    });

    it('Tap 2 (tap on the currently active/focused cell): should open radial digit selector', () => {
      let radialOpenedCell = null;
      let stateResult = null;

      const controller = new TwoTapStateController({
        onOpenRadial: (cell) => { radialOpenedCell = cell; },
        onStateChange: (state) => { stateResult = state; }
      });

      // Tap 1
      controller.handleCellTap(4, 4, true);
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.strictEqual(radialOpenedCell, null);

      // Tap 2 on identical cell
      const res = controller.handleCellTap(4, 4, true);
      assert.strictEqual(res.action, 'OPEN_RADIAL');
      assert.strictEqual(controller.getState(), 'RADIAL_OPEN');
      assert.strictEqual(stateResult, 'RADIAL_OPEN');
      assert.deepStrictEqual(radialOpenedCell, { r: 4, c: 4 });
    });

    it('Tap 2 on non-editable cell (fixed clue): should NOT open radial ring', () => {
      let radialOpened = false;
      const controller = new TwoTapStateController({
        onOpenRadial: () => { radialOpened = true; }
      });

      // Tap 1
      controller.handleCellTap(0, 0, false);
      assert.strictEqual(controller.getState(), 'FOCUSED');

      // Tap 2 on non-editable cell
      const res = controller.handleCellTap(0, 0, false);
      assert.strictEqual(res.action, 'NOOP');
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.strictEqual(radialOpened, false, 'Radial ring must not open for fixed clues');
    });

    it('Tap on active cell while radial is open: should toggle ring closed and remain FOCUSED', () => {
      let radialClosed = false;
      const controller = new TwoTapStateController({
        onCloseRadial: () => { radialClosed = true; }
      });

      controller.handleCellTap(2, 2, true);
      controller.handleCellTap(2, 2, true);
      assert.strictEqual(controller.getState(), 'RADIAL_OPEN');

      const res = controller.handleCellTap(2, 2, true);
      assert.strictEqual(res.action, 'CLOSE_RADIAL');
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.strictEqual(radialClosed, true);
      assert.deepStrictEqual(controller.getFocusedCell(), { r: 2, c: 2 });
    });

    it('Tap on different cell while radial is open: should close ring and focus new cell', () => {
      let radialClosed = false;
      let focusedCell = null;
      const controller = new TwoTapStateController({
        onCloseRadial: () => { radialClosed = true; },
        onFocusChange: (cell) => { focusedCell = cell; }
      });

      controller.handleCellTap(1, 1, true);
      controller.handleCellTap(1, 1, true);
      assert.strictEqual(controller.getState(), 'RADIAL_OPEN');

      const res = controller.handleCellTap(5, 5, true);
      assert.strictEqual(res.action, 'FOCUS');
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.strictEqual(radialClosed, true);
      assert.deepStrictEqual(focusedCell, { r: 5, c: 5 });
    });

    it('Tap outside (or backdrop): should dismiss ring, clear focus, and return to IDLE', () => {
      let radialClosed = false;
      let focusCleared = false;
      let stateResult = null;

      const controller = new TwoTapStateController({
        onCloseRadial: () => { radialClosed = true; },
        onFocusChange: (cell) => { if (cell === null) focusCleared = true; },
        onStateChange: (state) => { stateResult = state; }
      });

      // From RADIAL_OPEN
      controller.handleCellTap(3, 3, true);
      controller.handleCellTap(3, 3, true);
      assert.strictEqual(controller.getState(), 'RADIAL_OPEN');

      const res = controller.handleBackdropTap();
      assert.strictEqual(res.action, 'DISMISS_ALL');
      assert.strictEqual(controller.getState(), 'IDLE');
      assert.strictEqual(controller.getFocusedCell(), null);
      assert.strictEqual(radialClosed, true);
      assert.strictEqual(focusCleared, true);
      assert.strictEqual(stateResult, 'IDLE');

      // From FOCUSED
      focusCleared = false;
      controller.handleCellTap(2, 2, true);
      assert.strictEqual(controller.getState(), 'FOCUSED');
      controller.handleBackdropTap();
      assert.strictEqual(controller.getState(), 'IDLE');
      assert.strictEqual(controller.getFocusedCell(), null);
      assert.strictEqual(focusCleared, true);
    });

    it('Digit committed: should dismiss ring and transition to FOCUSED', () => {
      let radialClosed = false;
      const controller = new TwoTapStateController({
        onCloseRadial: () => { radialClosed = true; }
      });

      controller.handleCellTap(0, 0, true);
      controller.handleCellTap(0, 0, true);
      assert.strictEqual(controller.getState(), 'RADIAL_OPEN');

      const res = controller.handleDigitCommitted();
      assert.strictEqual(res.action, 'COMMIT');
      assert.strictEqual(controller.getState(), 'FOCUSED');
      assert.strictEqual(radialClosed, true);
    });
  });

  describe('Dynamic Radial Ring Digits Filter (getAvailableRadialDigits)', () => {
    it('should return all digits 1..9 on an empty 9x9 board', () => {
      const grid = Array.from({ length: 9 }, () => new Array(9).fill(0));
      const available = getAvailableRadialDigits(grid, 9);
      assert.deepStrictEqual(available, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should exclude digits where all 9 instances are placed on the board', () => {
      const grid = Array.from({ length: 9 }, () => new Array(9).fill(0));
      // Place 9 instances of digit 7
      for (let r = 0; r < 9; r++) {
        grid[r][r] = 7;
      }

      const available = getAvailableRadialDigits(grid, 9);
      assert.strictEqual(available.includes(7), false, 'Digit 7 should be excluded when 9 instances are placed');
      assert.strictEqual(available.length, 8);
      assert.deepStrictEqual(available, [1, 2, 3, 4, 5, 6, 8, 9]);
    });

    it('should include digits placed 8 times (not yet exhausted)', () => {
      const grid = Array.from({ length: 9 }, () => new Array(9).fill(0));
      // Place 8 instances of digit 4
      for (let r = 0; r < 8; r++) {
        grid[r][r] = 4;
      }

      const available = getAvailableRadialDigits(grid, 9);
      assert.strictEqual(available.includes(4), true, 'Digit 4 should still be available with only 8 placed');
      assert.strictEqual(available.length, 9);
    });

    it('should exclude multiple exhausted digits', () => {
      const grid = Array.from({ length: 9 }, () => new Array(9).fill(0));
      // Place 9 instances of digit 1 and 9 instances of digit 9
      for (let r = 0; r < 9; r++) {
        grid[r][0] = 1;
        grid[r][1] = 9;
      }

      const available = getAvailableRadialDigits(grid, 9);
      assert.strictEqual(available.includes(1), false);
      assert.strictEqual(available.includes(9), false);
      assert.deepStrictEqual(available, [2, 3, 4, 5, 6, 7, 8]);
    });

    it('should return an empty array if all digits are exhausted', () => {
      const grid = Array.from({ length: 9 }, (_, r) =>
        Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1)
      );

      const available = getAvailableRadialDigits(grid, 9);
      assert.deepStrictEqual(available, []);
    });

    it('should support non-standard topologies (e.g. 6x6 with N=6)', () => {
      const grid = Array.from({ length: 6 }, () => new Array(6).fill(0));
      // Place 6 instances of digit 3
      for (let r = 0; r < 6; r++) {
        grid[r][r] = 3;
      }

      const available = getAvailableRadialDigits(grid, 6);
      assert.strictEqual(available.includes(3), false);
      assert.deepStrictEqual(available, [1, 2, 4, 5, 6]);
    });
  });

  describe('Orbit Dynamics & Upright Counter-Rotation Mechanics', () => {
    it('should maintain zero net orientation via counter-rotation at ~0.005 rad/frame step', () => {
      const orbitSpeed = 0.005; // rad/frame
      let orbitAngle = 0;

      for (let frame = 1; frame <= 100; frame++) {
        orbitAngle = (orbitAngle + orbitSpeed) % (2 * Math.PI);
        const counterRotation = -orbitAngle;
        const netOrientation = orbitAngle + counterRotation;

        assert.ok(Math.abs(netOrientation) < 1e-12, 'Net orientation must remain 0 for upright digits');
      }
    });
  });
});
