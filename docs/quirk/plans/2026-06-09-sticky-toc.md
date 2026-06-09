# Sticky "On this page" TOC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use quirk:subagent-driven-development (recommended) or quirk:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the rendered "On this page" TOC from a stacked card into a sticky right-hand sidebar with scroll-spy on wide viewports, degrading to today's stacked card on narrow viewports.

**Architecture:** Two renderer-owned pieces change. `src/renderer/page.mjs` wraps content + the unchanged `<nav class="agent-isles-toc">` in a `.agent-isles-layout` flex/grid container (only when a TOC exists and not in source view) and injects a dependency-free IntersectionObserver scroll-spy `<script>`. `src/theme/agent-theme.css` adds the grid/sticky/responsive rules, an active-link style, and fixes the hardcoded-white TOC background so dark mode works. The TOC markup itself is untouched, so existing assertions stay green.

**Tech Stack:** Node.js ESM (`.mjs`), Bootstrap 5 layout classes, vanilla DOM + IntersectionObserver client script, plain CSS custom properties, `node:test` + `node:assert`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/renderer/page.mjs` | HTML page assembly | Compute `tocHtml`/`hasToc` early; add `--with-toc` to `mainClass`; wrap content + TOC in `.agent-isles-layout`; add `buildTocScript()`; inject script when `hasToc`. |
| `src/theme/agent-theme.css` | Visual theme | Fix TOC background var; add layout/grid/sticky/responsive rules; add active-link styling. |
| `tests/preview.test.mjs` | Renderer HTML output assertions | New tests: layout wrapper present/absent; scroll-spy script present/absent (incl. `showSource`). |
| `tests/render.test.mjs` | Theme CSS assertions | New test: themeable sticky-sidebar CSS, no hardcoded white background. |

**Execution note:** Task 1 and Task 3 touch disjoint files and can run in parallel. Task 2 edits the same files as Task 1 and therefore depends on it. Run `node --test` from the worktree root (`/Users/zpyoung/PycharmProjects/agent-isles-sticky-toc`) for all test commands.

---

### Task 1: Page layout wrapper + `--with-toc` class wiring

```yaml
independent: true
dependencies: []
scope:
  files: [src/renderer/page.mjs, tests/preview.test.mjs]
```

**Files:**
- Modify: `src/renderer/page.mjs:47-66` (mainClass + mainBody computation in `buildHtmlPage`)
- Test: `tests/preview.test.mjs` (append two new tests after the existing TOC test at line ~280)

Background: today `mainClass` is computed at lines 47-49 and `mainBody` at lines 64-66:

```js
const mainClass = options.showSource
  ? 'agent-isles-page agent-isles-page--source-view container-fluid py-4'
  : 'agent-isles-page container py-4';
```
```js
const mainBody = options.showSource ? pageBody : [buildTableOfContents(options.toc), indent(pageBody, 4)]
  .filter(Boolean)
  .join('\n');
```

`buildTableOfContents(toc)` (line 90) already returns `''` when fewer than 2 in-range (level 2–3) headings exist, and otherwise returns the `<nav class="agent-isles-toc" aria-label="Table of contents">…</nav>` markup. We keep that function untouched.

- [ ] **Step 1: Write the failing tests**

In `tests/preview.test.mjs`, append after the existing test `rendered preview pages include heading anchors and a table of contents` (ends ~line 280):

```js
test('multi-heading pages wrap content and TOC in a sticky-TOC layout', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');

  const { html } = await renderMarkdownString('# Guide\n\n## Alpha\n\nBody.\n\n## Beta\n\nMore body.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
  });

  assert.match(html, /class="agent-isles-page container py-4 agent-isles-page--with-toc"/);
  assert.match(html, /<div class="agent-isles-layout">/);
  assert.match(html, /<div class="agent-isles-content">/);
  // Existing TOC markup is preserved unchanged.
  assert.match(html, /<nav class="agent-isles-toc" aria-label="Table of contents">/);
});

test('single-heading pages stay single-column with no TOC layout', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');

  const { html } = await renderMarkdownString('# Guide\n\n## Only Section\n\nBody.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
  });

  assert.doesNotMatch(html, /agent-isles-page--with-toc/);
  assert.doesNotMatch(html, /agent-isles-layout/);
  assert.doesNotMatch(html, /<nav class="agent-isles-toc"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/preview.test.mjs 2>&1 | tail -20`
Expected: FAIL — the two new tests fail because `agent-isles-page--with-toc` and `agent-isles-layout` are not emitted yet (the doc currently renders TOC stacked, no wrapper).

- [ ] **Step 3: Compute `tocHtml`/`hasToc` and update `mainClass`**

In `src/renderer/page.mjs`, replace the `mainClass` block at lines 47-49:

```js
  const mainClass = options.showSource
    ? 'agent-isles-page agent-isles-page--source-view container-fluid py-4'
    : 'agent-isles-page container py-4';
```

with:

```js
  const tocHtml = options.showSource ? '' : buildTableOfContents(options.toc);
  const hasToc = Boolean(tocHtml);
  const mainClass = options.showSource
    ? 'agent-isles-page agent-isles-page--source-view container-fluid py-4'
    : `agent-isles-page container py-4${hasToc ? ' agent-isles-page--with-toc' : ''}`;
```

- [ ] **Step 4: Rebuild `mainBody` to wrap content + TOC**

In `src/renderer/page.mjs`, replace the `mainBody` block at lines 64-66:

```js
  const mainBody = options.showSource ? pageBody : [buildTableOfContents(options.toc), indent(pageBody, 4)]
    .filter(Boolean)
    .join('\n');
```

with:

```js
  let mainBody;
  if (options.showSource) {
    mainBody = pageBody;
  } else if (hasToc) {
    mainBody = `    <div class="agent-isles-layout">
      <div class="agent-isles-content">
${indent(pageBody, 8)}
      </div>
${tocHtml}
    </div>`;
  } else {
    mainBody = indent(pageBody, 4);
  }
```

Note: content `<div>` is emitted **before** the TOC `<nav>` in the DOM (content-first reading/screen-reader order). CSS `order` flips the visual order on narrow viewports. `tocHtml` keeps its existing 4-space indentation from `buildTableOfContents` — that is fine, the regex assertions match the substring regardless of leading whitespace.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/preview.test.mjs 2>&1 | tail -20`
Expected: PASS — both new tests pass and the pre-existing `…heading anchors and a table of contents` test stays green (its document has 2 in-range headings, so it now renders inside the wrapper but still contains the asserted `<nav>` and anchor substrings).

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `node --test 2>&1 | tail -25`
Expected: PASS — no failures (the `showSource` path is unchanged; short-doc path is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/page.mjs tests/preview.test.mjs
git commit -m "feat(toc): wrap content and TOC in sticky-sidebar layout"
```

---

### Task 2: Scroll-spy client script (`buildTocScript`)

```yaml
dependencies: [T1]
scope:
  files: [src/renderer/page.mjs, tests/preview.test.mjs]
```

**Files:**
- Modify: `src/renderer/page.mjs` (add `buildTocScript()` helper; inject it in `buildHtmlPage` scripts slot)
- Test: `tests/preview.test.mjs` (append two new tests)

Background: the page's scripts are concatenated on the line currently at `page.mjs:81`:

```js
${scripts}${writebackClientScript}${mermaidScripts}${componentScript}${packModuleScripts}
```

The scroll-spy script observes the existing `<span class="agent-isles-heading-anchor" id="…">` elements (created in `src/renderer/rehype-plugins.mjs:175`) that the TOC links point at. It must be injected only when `hasToc` is true.

- [ ] **Step 1: Write the failing tests**

In `tests/preview.test.mjs`, append after the Task 1 tests:

```js
test('scroll-spy script is injected when a TOC is present', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');

  const { html } = await renderMarkdownString('# Guide\n\n## Alpha\n\nBody.\n\n## Beta\n\nMore body.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
  });

  assert.match(html, /Agent Isles table-of-contents scroll-spy/);
  assert.match(html, /new IntersectionObserver/);
});

test('scroll-spy script is absent without a TOC and in source view', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');

  const single = await renderMarkdownString('# Guide\n\n## Only Section\n\nBody.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
  });
  assert.doesNotMatch(single.html, /Agent Isles table-of-contents scroll-spy/);

  const sourceView = await renderMarkdownString('# Guide\n\n## Alpha\n\nBody.\n\n## Beta\n\nMore body.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
    showSource: true,
  });
  assert.doesNotMatch(sourceView.html, /Agent Isles table-of-contents scroll-spy/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/preview.test.mjs 2>&1 | tail -20`
Expected: FAIL — `Agent Isles table-of-contents scroll-spy` is not present in any output yet.

- [ ] **Step 3: Add the `buildTocScript()` helper**

In `src/renderer/page.mjs`, add this function immediately after `buildMermaidRendererScript()` (it ends at line 374, just before `function buildComponentScript`):

```js
function buildTocScript() {
  return `
  <script>
/* Agent Isles table-of-contents scroll-spy */
(function () {
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }
  const nav = document.querySelector('.agent-isles-toc');
  if (!nav) {
    return;
  }
  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  const linkByTarget = new Map();
  const targets = [];
  for (const link of links) {
    const id = decodeURIComponent(link.hash.slice(1));
    const target = id && document.getElementById(id);
    if (target) {
      linkByTarget.set(target, link);
      targets.push(target);
    }
  }
  if (targets.length === 0) {
    return;
  }
  let activeLink = null;
  const setActive = (link) => {
    if (link === activeLink) {
      return;
    }
    if (activeLink) {
      activeLink.classList.remove('is-active');
      activeLink.removeAttribute('aria-current');
    }
    activeLink = link;
    if (activeLink) {
      activeLink.classList.add('is-active');
      activeLink.setAttribute('aria-current', 'location');
    }
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const link = linkByTarget.get(entry.target);
        if (link) {
          setActive(link);
        }
      }
    }
  }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
  targets.forEach((target) => observer.observe(target));
}());
  </script>`;
}
```

Note: no `escapeInlineScript` wrapping is needed — the script body contains no literal `</script>` sequence (matches how `buildMermaidRendererScript` is emitted). The `rootMargin: '0px 0px -70% 0px'` shrinks the observer's viewport to the top 30% band so the heading nearest the top wins.

- [ ] **Step 4: Inject the script when `hasToc` is true**

In `buildHtmlPage`, add a `tocScript` constant near the other script constants (e.g. directly after the `mermaidScripts` assignment at line 62):

```js
  const tocScript = hasToc ? buildTocScript() : '';
```

Then append `${tocScript}` to the scripts line (currently line 81):

```js
${scripts}${writebackClientScript}${mermaidScripts}${tocScript}${componentScript}${packModuleScripts}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/preview.test.mjs 2>&1 | tail -20`
Expected: PASS — both new tests pass (script present for the 2-heading doc; absent for the single-heading doc and for `showSource`).

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `node --test 2>&1 | tail -25`
Expected: PASS — no failures.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/page.mjs tests/preview.test.mjs
git commit -m "feat(toc): inject IntersectionObserver scroll-spy script"
```

---

### Task 3: Sticky-sidebar CSS + dark-mode fix + active-link styling

```yaml
independent: true
dependencies: []
scope:
  files: [src/theme/agent-theme.css, tests/render.test.mjs]
```

**Files:**
- Modify: `src/theme/agent-theme.css:54-93` (fix `.agent-isles-toc` background; add layout/active rules after the `.agent-isles-toc-item--h3` block)
- Test: `tests/render.test.mjs` (append one new test)

Background: the existing `.agent-isles-toc` rule (lines 54-61) hardcodes a white background:

```css
.agent-isles-toc {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--agent-isles-border);
  border-radius: 1rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  margin: 0 0 1.5rem;
  padding: 1rem 1.1rem;
}
```

The `--agent-isles-surface` / `--agent-isles-border` / `--agent-isles-primary` custom properties are already defined for both light (`:root`, lines 4-15) and dark (`[data-bs-theme="dark"]`, lines 17-28) themes. The `.agent-isles-toc-item--h3` block ends at line 93, immediately before `.agent-isles-heading-anchor` (line 95).

- [ ] **Step 1: Write the failing test**

In `tests/render.test.mjs`, append after the existing `source view uses a wide equal split…` test (ends ~line 623):

```js
test('theme styles the TOC as a themeable sticky sidebar', async () => {
  const theme = readFileSync(resolve('src/theme/agent-theme.css'), 'utf8');

  // Dark-mode fix: no hardcoded white TOC background.
  assert.doesNotMatch(theme, /\.agent-isles-toc\s*{[^}]*rgba\(255,\s*255,\s*255,\s*0\.88\)/s);
  assert.match(theme, /\.agent-isles-toc\s*{[^}]*background:\s*var\(--agent-isles-surface\)/s);

  // Two-column sticky sidebar at the 1200px breakpoint.
  assert.match(theme, /@media\s*\(min-width:\s*1200px\)/);
  assert.match(theme, /grid-template-columns:\s*minmax\(0,\s*960px\)/);
  assert.match(theme, /position:\s*sticky/);

  // Active-link state exists (not color-only).
  assert.match(theme, /\.agent-isles-toc a\.is-active/);
  assert.match(theme, /\.agent-isles-toc a\[aria-current="location"\]/);
});
```

`readFileSync` and `resolve` are already imported and used in this file (see the existing line ~608). No new imports needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/render.test.mjs 2>&1 | tail -20`
Expected: FAIL — the theme still contains `rgba(255, 255, 255, 0.88)` for `.agent-isles-toc` and has no grid/sticky/active rules.

- [ ] **Step 3: Fix the TOC background to use a theme variable**

In `src/theme/agent-theme.css`, change line 55 inside the `.agent-isles-toc` rule:

```css
  background: rgba(255, 255, 255, 0.88);
```

to:

```css
  background: var(--agent-isles-surface);
```

- [ ] **Step 4: Add layout, responsive, and active-link rules**

In `src/theme/agent-theme.css`, insert the following block immediately after the `.agent-isles-toc-item--h3` rule (which ends at line 93, right before `.agent-isles-heading-anchor {`):

```css
.agent-isles-page.agent-isles-page--with-toc {
  max-width: var(--agent-isles-page-with-toc-max-width, 1240px);
}

.agent-isles-layout {
  display: flex;
  flex-direction: column;
}

.agent-isles-content {
  min-width: 0;
}

.agent-isles-layout .agent-isles-toc {
  order: -1;
}

.agent-isles-toc a.is-active,
.agent-isles-toc a[aria-current="location"] {
  color: var(--agent-isles-primary);
  font-weight: 800;
  border-left: 2px solid var(--agent-isles-primary);
  padding-left: 0.5rem;
  margin-left: -0.5rem;
}

@media (min-width: 1200px) {
  .agent-isles-page--with-toc .agent-isles-layout {
    display: grid;
    grid-template-columns: minmax(0, 960px) var(--agent-isles-toc-width, 240px);
    gap: 2.5rem;
    align-items: start;
  }

  .agent-isles-page--with-toc .agent-isles-layout .agent-isles-toc {
    order: 0;
    position: sticky;
    top: 1.5rem;
    align-self: start;
    max-height: calc(100vh - 3rem);
    overflow-y: auto;
    margin: 0;
  }
}
```

Notes:
- `.agent-isles-page.agent-isles-page--with-toc` uses a two-class selector to outrank the base `.agent-isles-page { max-width: … }` rule.
- Mobile-first: flex column with the TOC `order: -1` reproduces today's stacked-above-content card. At ≥1200px it becomes a grid with the TOC as a sticky right column (`order: 0`, `align-self: start` is required or the grid stretches the sidebar full-height and breaks `position: sticky`).
- `min-width: 0` on the content cell pairs with `minmax(0, 960px)` to stop wide code blocks from blowing out the grid.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/render.test.mjs 2>&1 | tail -20`
Expected: PASS — including the existing `source view…` test, whose `position: sticky` negative assertion is scoped to `.agent-isles-source-pane` and is unaffected by the new `.agent-isles-toc` sticky rule.

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `node --test 2>&1 | tail -25`
Expected: PASS — no failures.

- [ ] **Step 7: Commit**

```bash
git add src/theme/agent-theme.css tests/render.test.mjs
git commit -m "feat(toc): sticky-sidebar grid, dark-mode fix, active-link styling"
```

---

## Manual Verification (after all tasks)

- [ ] Render a long multi-heading example doc and open it in a browser:

```bash
node bin/isles.mjs render docs/examples/<a-long-doc>.md --out /tmp/toc-check.html && open /tmp/toc-check.html
```

Confirm at a wide window (>1200px): TOC pinned on the right, content ~960px on the left, active link updates as you scroll. Resize below 1200px: TOC collapses to a card stacked above the content. Toggle dark mode (the page's theme toggle): TOC background/border/links remain readable. Then check a short (<2 heading) doc and a `--show-source` render: both stay single-column with no sidebar and no scroll-spy script.

---

## Self-Review

**Spec coverage:**
- Sticky right-hand sidebar on wide viewports → Task 1 (wrapper) + Task 3 (grid/sticky CSS). ✓
- Preserve ~960px content width → Task 3 `minmax(0, 960px)`. ✓
- Scroll-spy highlight → Task 2 script + Task 3 active-link CSS. ✓
- Graceful narrow-viewport fallback to stacked card → Task 3 mobile-first flex + `order`. ✓
- Unchanged for <2 headings and `showSource` → Task 1 (`buildTableOfContents` returns `''`; `showSource` short-circuits) + Task 2 (script gated on `hasToc`); covered by negative tests in Tasks 1 & 2. ✓
- Dark-mode background fix → Task 3 Step 3. ✓
- TOC markup unchanged (preserve `tests/preview.test.mjs` assertion) → `buildTableOfContents` untouched; existing test stays green (Task 1 Step 5). ✓
- Long-TOC `max-height`/`overflow-y` → Task 3 sticky rule. ✓
- No-`IntersectionObserver` no-op → Task 2 `typeof IntersectionObserver === 'undefined'` guard. ✓
- All six spec test items map to tests in Tasks 1–3. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" placeholders; every code and command step is concrete.

**Type/name consistency:** `tocHtml`, `hasToc`, `buildTocScript`, `tocScript`, `linkByTarget`, classes `agent-isles-layout` / `agent-isles-content` / `agent-isles-page--with-toc`, and the `is-active` / `aria-current="location"` markers are used identically across page.mjs, the CSS, and the tests.

**Parallelism declarations:** T1 and T3 touch disjoint file sets (`page.mjs`+`preview.test.mjs` vs `agent-theme.css`+`render.test.mjs`) and are both `independent: true` with non-overlapping `scope.files` → eligible for a parallel wave. T2 shares files with T1, so it declares `dependencies: [T1]` and is intentionally **not** marked independent — it runs after T1, never alongside it.
