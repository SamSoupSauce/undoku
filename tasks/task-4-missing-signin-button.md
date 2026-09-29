# Task 4: Restoring Sign-In Button & Anonymous-to-Account Promotion Flow

## Metadata
- **Target Component / File**: `web/index.html` (lines ~4040–4050, ~4485–4540, ~7805–7860)
- **Assigned Sub-Agent**: Sub-Agent Gamma (Identity, Auth & Fallback Client State)
- **Status**: VERIFIED

---

## 1. Identified Root Cause
1. **Missing Sign-In DOM Element**:
   - The top navigation bar (`.app-header > .header-actions`) contained only the theme picker dropdown, the Docs link (`./wiki/`), and the GitHub link.
   - There was no Sign-In button, profile avatar, or user authentication modal trigger anywhere in the DOM.
2. **Missing Promotion Flow from Guest to Authenticated Account**:
   - Because guest sessions exist anonymously, users had no mechanism to link their guest game history to a persistent named account or sign in with their existing credentials.
3. **Responsive Header Real Estate Constraint**:
   - On mobile viewports (<= 600px), header space is limited. The Sign-In element must be responsive: displaying full label `👤 Sign In` on desktop and collapsing to an elegant icon button `👤` on mobile next to the theme picker.

---

## 2. Minimal-Diff Fix Applied
1. **Header Sign-In / Profile Button**:
   - Inserted `#btnAuthProfile` into `.header-actions`:
     ```html
     <button class="btn-header btn-auth-profile" id="btnAuthProfile" title="User Profile / Sign In" aria-label="User Profile">
       <span id="authHeaderIcon">👤</span><span class="btn-header-text" id="authHeaderText">Sign In</span>
     </button>
     ```
2. **Interactive Auth & Account Linking Modal (`#authModal`)**:
   - Added `#authModal` dialog with guest session ID display, promotion form (`#authLoginForm`), and authenticated profile view (`#authUserView`).
3. **Session Promotion & Sign Out Logic**:
   - Implemented `updateUserSession(updates)` to upgrade guest sessions into named player accounts while preserving all previously recorded solve records and metrics.
   - Implemented `resetToGuestSession()` on sign-out to smoothly transition back to a clean guest UUID without losing app state.
4. **Responsive Styling**:
   - Styled `.btn-auth-profile` to conform to `.btn-header-text { display: none; }` on screens `<= 600px`, collapsing to a sleek `👤` icon without overflowing the mobile navigation bar.

---

## 3. Verification & Emulation Results
- **Header Appearance**:
  - Desktop (> 600px): Renders `👤 Sign In` alongside Docs and GitHub links.
  - Mobile (<= 600px): Renders `👤` icon button alongside theme picker without horizontal header overflow.
- **Account Linking Flow**:
  - Clicking `#btnAuthProfile` opens `#authModal`.
  - Entering player name (e.g. "GrandmasterSudoku") upgrades session to authenticated (`⭐ GrandmasterSudoku`).
  - Header updates dynamically; vault header displays authenticated player badge.
- **Sign Out Flow**:
  - Clicking "Sign Out" cleanly restores an anonymous guest session.
- **Test Suite Result**: Automated test suite (`scratch/verify_all.js`) passed 100%.

---

## 4. Final Status
`[VERIFIED]`
