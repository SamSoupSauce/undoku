# Task 2: Mobile Win Screen Visibility & Viewport Layering

## Metadata
- **Target Component / File**: `web/index.html` (lines ~3740–3815, ~6060–6075)
- **Assigned Sub-Agent**: Sub-Agent Beta (Responsive UI & Viewport Layering)
- **Status**: VERIFIED

---

## 1. Identified Root Cause
1. **Dynamic Viewport Height & Cutoff on Mobile (`100vh` vs `100dvh`)**:
   - `.modal-backdrop` was styled with `height: 100vh;` and fixed positioning. On iOS Safari and Android Chrome, the mobile browser's top URL bar and bottom navigation toolbar reduce the visible viewport height.
   - When the victory modal was centered using `display: flex; align-items: center; justify-content: center;`, the modal content and action buttons (`btnNextPuzzle`, `btnWatchReplay`) extended past the visible screen edge beneath the browser toolbar.
2. **Fixed Bottom Navigation Bar Stacking & Safe Area Insets**:
   - The mobile navigation bar (`.app-nav-tabs`) uses `position: fixed; bottom: 0; z-index: 990;`.
   - `.modal-backdrop` used `z-index: 1000`. On devices with home indicator bars (e.g. modern iPhones), lack of safe area padding (`env(safe-area-inset-bottom)`) caused the bottom action buttons to collide with the home bar.
3. **Radial Ring Overlay Leaks on Winning Input**:
   - When a user committed the final winning digit via the radial dial menu (`openRadialRing`), `inputDigit()` evaluated `checkWin() === true` and invoked `triggerVictory()`.
   - However, `triggerVictory()` did not invoke `closeRadialRing()`. As a result, the radial ring element remained rendered in the DOM behind the victory celebration modal.
4. **Modal Oversizing on Small Screens**:
   - `.victory-modal` had heavy padding (`2.25rem`) and large icon dimensions (`3.5rem`), causing it to exceed small mobile viewports (e.g., iPhone SE 375x667) and require awkward vertical scrolling.

---

## 2. Minimal-Diff Fix Applied
1. **Dynamic Viewport & Safe-Area Layering**:
   - Updated `.modal-backdrop` to use `height: 100vh; height: 100dvh; min-height: -webkit-fill-available;`, `z-index: 10000;`, and safe-area padding:
     ```css
     padding: calc(1rem + env(safe-area-inset-top, 0px)) 1rem calc(1rem + env(safe-area-inset-bottom, 0px)) 1rem;
     box-sizing: border-box;
     overflow-y: auto;
     -webkit-overflow-scrolling: touch;
     ```
2. **Responsive Victory Modal Sizing**:
   - Constrained `.victory-modal` with `max-height: calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));`.
   - On screens `<= 600px`, scaled padding to `1.5rem 1.15rem`, trophy icon to `2.75rem`, and stats row to `0.65rem 0.4rem` to guarantee full visibility of action buttons on all mobile viewports.
3. **Trigger Cleanup in `triggerVictory`**:
   - Added explicit `closeRadialRing()` call inside `triggerVictory()` before activating `#victoryModal`.

---

## 3. Verification & Emulation Results
- **Viewport Containment (iPhone SE 375x667 & iPhone 14 Pro Max 430x932)**:
  - Victory celebration modal renders with clean top and bottom margins respecting safe-area insets.
  - "▶ Next Puzzle" and "🎬 Watch Replay" action buttons are completely visible without vertical cutoffs or scrolling issues.
- **Winning Input Trigger (Radial Dial & Numpad)**:
  - Committing the 81st digit via radial dial automatically dismisses the radial overlay and displays the victory celebration modal cleanly.
  - Confetti and badge animations execute without clipping.
- **Test Suite Result**: Automated test suite (`scratch/verify_all.js`) passed 100%.

---

## 4. Final Status
`[VERIFIED]`
