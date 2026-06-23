# Live View Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use quirk:subagent-driven-development (recommended) or quirk:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gear-icon settings popover to the Agent Isles live-view header that lets viewers set theme (light/dark/auto) and reading preferences (content width, text size), persisted across sessions and synced across tabs.

**Architecture:** No new component. The menu is part of the live chrome, so its markup + CSS go in `src/live-shell.mjs` (which already builds the header/sidebar/footer strings) and its behavior goes in `src/live-client.js` (the browser client injected into every live page). The panel uses the native HTML Popover API (Baseline 2025) so dismissal, focus return, and top-layer stacking come for free. Reading prefs drive the existing `--agent-isles-page-*` CSS variables; theme reuses the existing `agent-isles-theme` localStorage key + `agent-isles-theme-change` event.

**Tech Stack:** Vanilla ES modules (no framework for the chrome), native Popover API, CSS custom properties, `node:test` unit tests, Playwright browser tests.

**Spec:** [docs/quirk/specs/2026-06-23-live-view-settings-menu-design.md](../specs/2026-06-23-live-view-settings-menu-design.md)

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/live-shell.mjs` | Structure + style of the live chrome (pure string output) | Add gear button to header, emit settings popover panel, add panel CSS |
| `src/live-client.js` | Browser behavior injected into every live page | Append a self-contained settings module (load → apply → wire → persist → sync) |
| `tests/live-shell.test.mjs` | Unit tests for `injectLiveFrame` output | Add assertions for the gear button + popover markup |
| `tests/browser/live-settings.spec.mjs` | End-to-end behavior of the menu | New file: open/close, reading-pref persistence, theme, reset |

---

## Task 1: Live chrome markup + styles

```yaml
independent: true
dependencies: []
scope:
  files: [src/live-shell.mjs, tests/live-shell.test.mjs]
```

**Files:**
- Modify: `src/live-shell.mjs` (`injectLiveFrame`, the `overlayStyle` block and `headerHtml`)
- Test: `tests/live-shell.test.mjs`

- [ ] **Step 1: Write the failing unit test**

Add this test to the end of `tests/live-shell.test.mjs`:

```js
test('injectLiveFrame emits the settings gear button and popover panel', () => {
  const out = injectLiveFrame(PAGE, { screens: [{ slug: 'a', name: 'a.md', title: 'A' }], activeSlug: 'a' });
  // Gear trigger in the header, wired to the popover, labelled for screen readers.
  assert.match(out, /id="isles-settings-btn"[^>]*popovertarget="isles-settings"/);
  assert.match(out, /aria-label="Settings"/);
  // The popover panel itself.
  assert.match(out, /id="isles-settings"[^>]*popover/);
  // One representative control per group + the footer actions.
  assert.match(out, /data-theme="auto"/);
  assert.match(out, /data-width="960px"/);
  assert.match(out, /data-font-size="18px" data-line-height="1.75"/);
  assert.match(out, /id="isles-settings-reset"/);
  assert.match(out, /id="isles-settings-close"[^>]*popovertargetaction="hide"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/live-shell.test.mjs`
Expected: FAIL — the new test's `assert.match` calls throw (no `isles-settings-btn` / `isles-settings` in the output yet). The pre-existing tests still pass.

- [ ] **Step 3: Replace the header markup and add the settings panel**

In `src/live-shell.mjs`, replace the single `headerHtml` line:

```js
  const headerHtml = `<div id="isles-header">Agent Isles Live</div>`;
```

with the header (now title + gear) plus the settings panel markup:

```js
  const headerHtml = `<div id="isles-header"><span id="isles-title">Agent Isles Live</span>`
    + `<button id="isles-settings-btn" type="button" popovertarget="isles-settings" aria-label="Settings" aria-haspopup="dialog">`
    + `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">`
    + `<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/>`
    + `<circle cx="12" cy="12" r="3"/></svg></button></div>`;
  const settingsHtml = `<div id="isles-settings" popover="auto" role="dialog" aria-label="Live view settings">`
    + `<div class="isles-set-row" role="group" aria-label="Theme"><span class="isles-set-label">Theme</span><div class="isles-seg">`
    + `<button type="button" data-theme="light" aria-pressed="false">Light</button>`
    + `<button type="button" data-theme="dark" aria-pressed="false">Dark</button>`
    + `<button type="button" data-theme="auto" aria-pressed="true">Auto</button></div></div>`
    + `<div class="isles-set-row" role="group" aria-label="Width"><span class="isles-set-label">Width</span><div class="isles-seg">`
    + `<button type="button" data-width="760px" aria-pressed="false">Focus</button>`
    + `<button type="button" data-width="960px" aria-pressed="true">Comfort</button>`
    + `<button type="button" data-width="1200px" aria-pressed="false">Wide</button></div></div>`
    + `<div class="isles-set-row" role="group" aria-label="Text"><span class="isles-set-label">Text</span><div class="isles-seg">`
    + `<button type="button" data-font-size="15px" data-line-height="1.65" aria-pressed="false">Small</button>`
    + `<button type="button" data-font-size="16px" data-line-height="1.7" aria-pressed="true">Regular</button>`
    + `<button type="button" data-font-size="18px" data-line-height="1.75" aria-pressed="false">Large</button></div></div>`
    + `<div class="isles-set-foot">`
    + `<button type="button" id="isles-settings-reset" class="isles-set-reset">Reset to defaults</button>`
    + `<button type="button" id="isles-settings-close" class="isles-set-close" popovertarget="isles-settings" popovertargetaction="hide" aria-label="Close settings">✕</button>`
    + `</div></div>`;
```

- [ ] **Step 4: Insert the panel into the body**

In `src/live-shell.mjs`, find the body-open insertion:

```js
  out = /<body[^>]*>/i.test(out)
    ? out.replace(/(<body[^>]*>)/i, `$1${headerHtml}${sidebarHtml}`)
    : `${headerHtml}${sidebarHtml}${out}`;
```

and add `${settingsHtml}` after the sidebar in both branches:

```js
  out = /<body[^>]*>/i.test(out)
    ? out.replace(/(<body[^>]*>)/i, `$1${headerHtml}${sidebarHtml}${settingsHtml}`)
    : `${headerHtml}${sidebarHtml}${settingsHtml}${out}`;
```

- [ ] **Step 5: Make the header lay out the gear on the right**

In `src/live-shell.mjs`, in the `overlayStyle` template, update the `#isles-header` rule to space the title and gear apart. Change:

```css
    #isles-header{position:fixed;top:0;left:0;right:0;height:2.2rem;display:flex;align-items:center;padding:0 1.5rem;font:500 .8rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-bottom:1px solid rgba(127,127,127,.25);z-index:99999}
```

to:

```css
    #isles-header{position:fixed;top:0;left:0;right:0;height:2.2rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:0 1.5rem;font:500 .8rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-bottom:1px solid rgba(127,127,127,.25);z-index:99999}
```

- [ ] **Step 6: Add the settings panel CSS**

In `src/live-shell.mjs`, in the `overlayStyle` template, add these rules immediately before the closing `</style>` (after the `#isles-sidebar li a .isles-updated{...}` rule). The panel reads the page theme tokens (with safe fallbacks) so it follows light/dark automatically. There is intentionally **no open/close animation**, which trivially satisfies `prefers-reduced-motion`:

```css
    #isles-settings-btn{display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;line-height:0}
    #isles-settings-btn:hover{background:rgba(127,127,127,.18)}
    #isles-settings-btn:focus-visible{outline:2px solid var(--agent-isles-focus,#93c5fd);outline-offset:1px}
    #isles-settings-btn svg{stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #isles-settings{position:fixed;top:2.4rem;right:.5rem;left:auto;bottom:auto;margin:0;min-width:230px;padding:.75rem;border:1px solid var(--agent-isles-border,rgba(127,127,127,.3));border-radius:8px;background:var(--agent-isles-surface,#fff);color:var(--agent-isles-text,#1e293b);font:.8rem system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18)}
    .isles-set-row{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.55rem}
    .isles-set-label{color:var(--agent-isles-muted,#475569);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}
    .isles-seg{display:inline-flex;border:1px solid var(--agent-isles-border,rgba(127,127,127,.3));border-radius:6px;overflow:hidden}
    .isles-seg button{appearance:none;border:0;border-left:1px solid var(--agent-isles-border,rgba(127,127,127,.3));background:transparent;color:inherit;font:inherit;padding:.25rem .55rem;cursor:pointer}
    .isles-seg button:first-child{border-left:0}
    .isles-seg button:hover{background:rgba(127,127,127,.12)}
    .isles-seg button[aria-pressed="true"]{background:var(--agent-isles-primary,#2563eb);color:#fff}
    .isles-seg button:focus-visible{outline:2px solid var(--agent-isles-focus,#93c5fd);outline-offset:-2px}
    .isles-set-foot{display:flex;align-items:center;justify-content:space-between;margin-top:.3rem;padding-top:.5rem;border-top:1px solid var(--agent-isles-border,rgba(127,127,127,.25))}
    .isles-set-reset{appearance:none;border:0;background:transparent;color:var(--agent-isles-muted,#475569);font:inherit;text-decoration:underline;cursor:pointer;padding:0}
    .isles-set-reset:hover{color:var(--agent-isles-text,#1e293b)}
    .isles-set-close{appearance:none;border:0;background:transparent;color:var(--agent-isles-muted,#475569);font:inherit;cursor:pointer;padding:.1rem .35rem;border-radius:4px}
    .isles-set-close:hover{background:rgba(127,127,127,.18)}
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `node --test tests/live-shell.test.mjs`
Expected: PASS — all tests, including the new one.

- [ ] **Step 8: Commit**

```bash
git add src/live-shell.mjs tests/live-shell.test.mjs
git commit -m "feat(live): add settings gear + popover panel to live chrome"
```

---

## Task 2: Settings behavior (apply, persist, theme, sync, reset)

```yaml
dependencies: [Task 1]
scope:
  files: [src/live-client.js, tests/browser/live-settings.spec.mjs]
```

**Files:**
- Modify: `src/live-client.js` (append a settings module inside the `LIVE_CLIENT` template)
- Test: `tests/browser/live-settings.spec.mjs` (new)

- [ ] **Step 1: Write the failing browser spec**

Create `tests/browser/live-settings.spec.mjs`:

```js
import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLiveServer } from '../../src/live.mjs';

function makeDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, 'screen-1.md'), '# Hello\n\nSome content.\n');
  return dir;
}

const fontSize = (page) => page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--agent-isles-page-font-size').trim());
const maxWidth = (page) => page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--agent-isles-page-max-width').trim());
const theme = (page) => page.evaluate(() =>
  document.documentElement.getAttribute('data-bs-theme'));

test('gear opens the popover and Escape closes it', async ({ page }) => {
  const dir = makeDir('isles-set-open-');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    const panel = page.locator('#isles-settings');
    await expect(panel).toBeHidden();
    await page.locator('#isles-settings-btn').click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  } finally {
    await server.close();
  }
});

test('changing Text drives the font-size variable and persists across reload', async ({ page }) => {
  const dir = makeDir('isles-set-text-');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    await page.locator('#isles-settings-btn').click();
    await page.locator('#isles-settings button[data-font-size="18px"]').click();
    await expect.poll(() => fontSize(page)).toBe('18px');
    await page.reload();
    await expect.poll(() => fontSize(page)).toBe('18px');
  } finally {
    await server.close();
  }
});

test('theme control sets data-bs-theme; reset returns reading prefs to defaults', async ({ page }) => {
  const dir = makeDir('isles-set-theme-');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    await page.locator('#isles-settings-btn').click();
    await page.locator('#isles-settings button[data-theme="dark"]').click();
    await expect.poll(() => theme(page)).toBe('dark');
    await page.locator('#isles-settings button[data-width="1200px"]').click();
    await page.locator('#isles-settings button[data-font-size="18px"]').click();
    await expect.poll(() => maxWidth(page)).toBe('1200px');
    await page.locator('#isles-settings-reset').click();
    await expect.poll(() => maxWidth(page)).toBe('960px');
    await expect.poll(() => fontSize(page)).toBe('16px');
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Build, then run the spec to verify it fails**

Run: `pnpm build && pnpm exec playwright test tests/browser/live-settings.spec.mjs`
Expected: FAIL — the gear opens the popover (markup from Task 1 exists), but clicking the controls changes nothing: the `--agent-isles-page-*` variables stay unset and `data-bs-theme` never becomes `dark`, so the `expect.poll` assertions time out. (The first test, open/close, may already pass since dismissal is native; the reading/theme/reset tests fail.)

- [ ] **Step 3: Append the settings module to the live client**

In `src/live-client.js`, find the end of the existing client IIFE and the closing backtick of the template:

```js
  document.addEventListener('agent-isles:signal', function (e) {
    sendSignal(e.detail || {});
  });
})();
`;
```

Insert a second, self-contained IIFE between `})();` and the closing `` ` `` so it reads:

```js
  document.addEventListener('agent-isles:signal', function (e) {
    sendSignal(e.detail || {});
  });
})();

(function () {
  var READING_KEY = 'agent-isles-live-settings';
  var THEME_KEY = 'agent-isles-theme';
  var THEME_EVENT = 'agent-isles-theme-change';
  var DEFAULTS = { themeMode: 'auto', width: '960px', fontSize: '16px', lineHeight: '1.7' };
  // Kept in sync with AGENT_COMPONENT_SELECTOR in src/components/agent-theme-toggle.js.
  var THEME_TAGS = 'agent-decision,agent-risk,agent-metric,agent-status-board,agent-tabs,agent-tab,agent-choice,agent-option-set,agent-proceed,agent-kanban,agent-table,agent-theme-toggle';

  function lsGet(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } }
  function lsSet(key, value) { try { window.localStorage.setItem(key, value); } catch (_) {} }
  function lsRemove(key) { try { window.localStorage.removeItem(key); } catch (_) {} }

  // In-memory fallback used when localStorage throws (file://, private mode).
  var memory = null;

  function load() {
    var parsed = null;
    var raw = lsGet(READING_KEY);
    try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = null; }
    var src = parsed || memory || {};
    return {
      themeMode: src.themeMode || DEFAULTS.themeMode,
      width: src.width || DEFAULTS.width,
      fontSize: src.fontSize || DEFAULTS.fontSize,
      lineHeight: src.lineHeight || DEFAULTS.lineHeight,
    };
  }

  function save(s) {
    memory = s;
    lsSet(READING_KEY, JSON.stringify(s));
  }

  function effectiveTheme(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function applyReading(s) {
    var root = document.documentElement;
    root.style.setProperty('--agent-isles-page-max-width', s.width);
    root.style.setProperty('--agent-isles-page-font-size', s.fontSize);
    root.style.setProperty('--agent-isles-page-line-height', s.lineHeight);
  }

  function applyTheme(s, broadcast) {
    var resolved = effectiveTheme(s.themeMode);
    var root = document.documentElement;
    root.setAttribute('data-bs-theme', resolved);
    root.style.colorScheme = resolved;
    var nodes = document.querySelectorAll(THEME_TAGS);
    for (var i = 0; i < nodes.length; i++) nodes[i].setAttribute('data-bs-theme', resolved);
    // Mirror the resolved value to the legacy key so a present <agent-theme-toggle> reflects state.
    if (lsGet(THEME_KEY) !== resolved) lsSet(THEME_KEY, resolved);
    if (broadcast) {
      document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: resolved } }));
    }
  }

  function setPressed(panel, attr, value) {
    var btns = panel.querySelectorAll('[data-' + attr + ']');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-' + attr) === value ? 'true' : 'false');
    }
  }

  function syncControls(s) {
    var panel = document.getElementById('isles-settings');
    if (!panel) return;
    setPressed(panel, 'theme', s.themeMode);
    setPressed(panel, 'width', s.width);
    setPressed(panel, 'font-size', s.fontSize);
  }

  var state = load();
  applyReading(state);
  applyTheme(state, false);

  function init() {
    var panel = document.getElementById('isles-settings');
    if (!panel) return;
    syncControls(state);

    panel.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!btn || !panel.contains(btn)) return;
      if (btn.hasAttribute('data-theme')) {
        state.themeMode = btn.getAttribute('data-theme');
        save(state); applyTheme(state, true); syncControls(state);
      } else if (btn.hasAttribute('data-width')) {
        state.width = btn.getAttribute('data-width');
        save(state); applyReading(state); syncControls(state);
      } else if (btn.hasAttribute('data-font-size')) {
        state.fontSize = btn.getAttribute('data-font-size');
        state.lineHeight = btn.getAttribute('data-line-height') || state.lineHeight;
        save(state); applyReading(state); syncControls(state);
      } else if (btn.id === 'isles-settings-reset') {
        lsRemove(READING_KEY);
        memory = null;
        state = { themeMode: DEFAULTS.themeMode, width: DEFAULTS.width, fontSize: DEFAULTS.fontSize, lineHeight: DEFAULTS.lineHeight };
        applyReading(state); applyTheme(state, true); syncControls(state);
      }
    });

    // Arrow-key navigation within a segmented group.
    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var group = e.target && e.target.closest ? e.target.closest('.isles-seg') : null;
      if (!group) return;
      var btns = Array.prototype.slice.call(group.querySelectorAll('button'));
      var idx = btns.indexOf(e.target);
      if (idx === -1) return;
      e.preventDefault();
      var next = e.key === 'ArrowRight' ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
      btns[next].focus();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cross-tab/window sync: re-apply when either key changes elsewhere.
  window.addEventListener('storage', function (e) {
    if (e.key !== READING_KEY && e.key !== THEME_KEY) return;
    state = load();
    applyReading(state);
    applyTheme(state, false);
    syncControls(state);
  });

  // Track live system-theme changes while in Auto.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function () { if (state.themeMode === 'auto') applyTheme(state, false); };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }
})();
`;
```

- [ ] **Step 4: Build, then run the spec to verify it passes**

Run: `pnpm build && pnpm exec playwright test tests/browser/live-settings.spec.mjs`
Expected: PASS — all three tests.

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `pnpm test:unit`
Expected: PASS — including the live-shell and existing live tests.

- [ ] **Step 6: Commit**

```bash
git add src/live-client.js tests/browser/live-settings.spec.mjs
git commit -m "feat(live): wire settings popover behavior (theme, reading prefs, persist, sync, reset)"
```

---

## Task 3: Full verification

```yaml
dependencies: [Task 2]
```

**Files:** none (verification only).

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test`
Expected: PASS — `test:unit` (build + all `tests/*.test.mjs`) then `test:browser` (build + render demo + all Playwright specs, including `live-settings.spec.mjs` and the existing `live-choice` / `live-multidoc` specs).

- [ ] **Step 2: Manual smoke check (optional but recommended)**

Run: `pnpm local live examples` then open the printed URL.
Verify by eye: the gear appears at the right of the header; clicking it opens the panel; Theme → Dark recolors the page and the panel; Width/Text change the rendered content; Reset restores defaults; reloading the page keeps your last choices; pressing Escape or clicking outside closes the panel.
Stop the server: `pnpm local live examples --stop`.

- [ ] **Step 3: Confirm the working tree is clean**

Run: `git status`
Expected: clean (all changes committed in Tasks 1–2).

---

## Self-Review

**Spec coverage:**
- Gear popover, gear-icon-only trigger, right of header — Task 1 (markup + CSS).
- Esc + click-outside + close button dismissal — Task 1 (native popover + `popovertargetaction="hide"` close button).
- Theme light/dark/auto with existing-system interop + auto via `prefers-color-scheme` — Task 2 (`applyTheme`, `effectiveTheme`, `THEME_KEY` mirror, `THEME_EVENT` broadcast, matchMedia listener).
- Font size / line height / content width driving `--agent-isles-page-*` — Task 2 (`applyReading`, `data-font-size`/`data-line-height`/`data-width` handlers).
- Persist across sessions in `agent-isles-live-settings` with in-memory fallback — Task 2 (`load`/`save`/`memory`, `try/catch` ls helpers).
- Cross-tab sync — Task 2 (`storage` listener).
- One-click reset to defaults — Task 2 (`isles-settings-reset` branch).
- `role="group"` + `aria-pressed`, focus-visible, arrow-key nav — Task 1 (markup/CSS) + Task 2 (keydown handler, `syncControls`).
- `prefers-reduced-motion` — satisfied by using no open/close animation (Task 1 Step 6 note).
- Unit + browser tests — Tasks 1 and 2.

**Placeholder scan:** none — every code/command step contains concrete content.

**Type/name consistency:** `READING_KEY` (`agent-isles-live-settings`), `THEME_KEY` (`agent-isles-theme`), `THEME_EVENT` (`agent-isles-theme-change`), and the `data-theme` / `data-width` / `data-font-size` / `data-line-height` attributes match between the markup (Task 1) and the behavior (Task 2). Element ids `isles-settings`, `isles-settings-btn`, `isles-settings-reset`, `isles-settings-close` are consistent across markup, CSS, behavior, and tests.

**Parallelism declarations:** Task 1 is `independent` (no deps). Task 2 depends on Task 1 (its browser tests need the injected markup) and edits different files, so no overlapping scope. Task 3 depends on Task 2. No two tasks share a `scope.files` entry, so the ordering is expressed purely through `dependencies`.
