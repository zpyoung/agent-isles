# Live Mode Multi-Document Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use quirk:subagent-driven-development (recommended) or quirk:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `isles live <dir>` list and navigate every top-level `.md` in the folder via a sidebar, while preserving the single-newest-screen push/auto-advance flow and the `<dir>/state/events` JSONL contract.

**Architecture:** Two new focused modules — `src/live-docs.mjs` (document discovery + traversal-safe slug↔file mapping) and `src/live-shell.mjs` (live-frame chrome + sidebar HTML). `src/live.mjs` gains slug routing (`GET /<slug>`), a screens JSON endpoint (`GET /__agent-isles/screens`), an add/edit/membership watcher diff that emits typed SSE events (`live:advance` / `live:reload` / `live:screens`), and per-screen signal stamping. `src/live-client.js` handles the typed events, auto-advances on push, reloads only the current doc, and patches the sidebar in place. Server-rendered per request — no SPA.

**Tech Stack:** Node.js (ESM `.mjs`), built-in `node:http` / `node:fs`, `node:test` for unit/integration tests, Playwright for browser tests. No new dependencies.

**Reference spec:** `docs/quirk/specs/2026-06-08-live-multi-document-design.md`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/live-docs.mjs` | Create | `slugForName`, `extractTitle`, `listScreens`, `resolveSlug` — pure, no I/O beyond `fs` reads |
| `src/live-shell.mjs` | Create | `injectLiveFrame(html, opts)`, `buildSidebar(screens, activeSlug)` — moved out of `live.mjs`, extended with sidebar |
| `src/live.mjs` | Modify | Routing, screens endpoint, watcher diff + typed broadcasts, signal stamping; re-export `injectLiveFrame` |
| `src/live-client.js` | Modify | Typed SSE handling, auto-advance, per-doc reload, sidebar patch, slug-stamped signals |
| `tests/live-docs.test.mjs` | Create | Unit tests for the discovery module |
| `tests/live.test.mjs` | Modify | Routing, screens endpoint, watcher broadcasts, signal stamping |
| `tests/browser/live-multidoc.spec.mjs` | Create | Sidebar navigation + auto-advance in a real browser |

**Dependency order:** Task 1 (`live-docs.mjs`) is standalone. Task 2 (`live-shell.mjs`) extracts chrome. Tasks 3–5 all modify `src/live.mjs` and must run sequentially. Tasks 4 and 6 both touch `src/live-client.js` and must run sequentially. Task 7 (browser) runs last.

---

### Task 1: Document discovery module (`live-docs.mjs`)

```yaml
independent: true
dependencies: []
scope:
  files: [src/live-docs.mjs, tests/live-docs.test.mjs]
```

**Files:**
- Create: `src/live-docs.mjs`
- Test: `tests/live-docs.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/live-docs.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { slugForName, extractTitle, listScreens, resolveSlug } from '../src/live-docs.mjs';

test('slugForName sanitizes filenames and strips .md', () => {
  assert.equal(slugForName('Screen 1.md'), 'screen-1');
  assert.equal(slugForName('A_B--c.md'), 'a-b-c');
  assert.equal(slugForName('.md'), 'doc');
});

test('slugForName avoids reserved route names', () => {
  assert.equal(slugForName('events.md'), 'events-doc');
});

test('extractTitle returns the first h1 or null', () => {
  assert.equal(extractTitle('# Hello\n\nbody'), 'Hello');
  assert.equal(extractTitle('no heading here'), null);
});

test('listScreens lists top-level .md files alphabetically with slugs and titles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-list-'));
  writeFileSync(join(dir, 'b.md'), '# Bee');
  writeFileSync(join(dir, 'a.md'), '# Ay');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'deep.md'), '# Deep'); // must be ignored
  writeFileSync(join(dir, 'note.txt'), 'nope');         // must be ignored
  const screens = listScreens(dir);
  assert.deepEqual(screens.map((s) => s.name), ['a.md', 'b.md']);
  assert.deepEqual(screens.map((s) => s.slug), ['a', 'b']);
  assert.equal(screens[0].title, 'Ay');
});

test('listScreens disambiguates colliding slugs deterministically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-collide-'));
  writeFileSync(join(dir, 'a b.md'), '# one');
  writeFileSync(join(dir, 'a-b.md'), '# two');
  const slugs = listScreens(dir).map((s) => s.slug);
  assert.equal(new Set(slugs).size, slugs.length); // all unique
  assert.ok(slugs.includes('a-b'));
  assert.ok(slugs.includes('a-b-2'));
});

test('listScreens returns [] for a missing directory', () => {
  assert.deepEqual(listScreens('/no/such/dir/xyz'), []);
});

test('resolveSlug matches by computed slug and rejects unknown / traversal input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-resolve-'));
  writeFileSync(join(dir, 'screen-1.md'), '# One');
  utimesSync(join(dir, 'screen-1.md'), new Date(1000), new Date(1000));
  assert.equal(resolveSlug(dir, 'screen-1').name, 'screen-1.md');
  assert.equal(resolveSlug(dir, 'nope'), null);
  assert.equal(resolveSlug(dir, '../secret'), null);
  assert.equal(resolveSlug(dir, ''), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live-docs.test.mjs`
Expected: FAIL — `Cannot find module '../src/live-docs.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/live-docs.mjs`:

```javascript
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RESERVED_SLUGS = new Set(['events', '__agent-isles']);

export function slugForName(name) {
  const base = String(name).replace(/\.md$/i, '');
  let slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'doc';
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-doc`;
  return slug;
}

export function extractTitle(markdown) {
  const m = String(markdown).match(/^\s{0,3}#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

export function listScreens(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const md = names.filter((n) => n.endsWith('.md')).sort();
  const used = new Set();
  const screens = [];
  for (const name of md) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // deleted between readdir and stat
    }
    if (!st.isFile()) continue;
    const baseSlug = slugForName(name);
    let slug = baseSlug;
    let n = 1;
    while (used.has(slug)) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }
    used.add(slug);
    let title = null;
    try {
      title = extractTitle(readFileSync(full, 'utf8'));
    } catch {
      /* unreadable mid-scan */
    }
    screens.push({ file: full, name, slug, mtimeMs: st.mtimeMs, size: st.size, title: title || name });
  }
  return screens;
}

export function resolveSlug(dir, slug) {
  if (typeof slug !== 'string' || !slug) return null;
  for (const screen of listScreens(dir)) {
    if (screen.slug === slug) return screen;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live-docs.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/live-docs.mjs tests/live-docs.test.mjs
git commit -m "feat(live): add document discovery + traversal-safe slug mapping"
```

---

### Task 2: Live shell + sidebar module (`live-shell.mjs`)

```yaml
independent: true
dependencies: [T1]
scope:
  files: [src/live-shell.mjs, src/live.mjs, tests/live-shell.test.mjs]
```

> Note: this task moves `injectLiveFrame` out of `src/live.mjs` and re-exports it, so it touches `src/live.mjs`. It must complete before Tasks 3–5 (which also edit `src/live.mjs`).

**Files:**
- Create: `src/live-shell.mjs`
- Create: `tests/live-shell.test.mjs`
- Modify: `src/live.mjs` — remove the inline `injectLiveFrame` (lines 156-177), import + re-export from `live-shell.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/live-shell.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { injectLiveFrame, buildSidebar } from '../src/live-shell.mjs';

const PAGE = '<!doctype html><html><head><title>t</title></head><body><h1>Doc</h1></body></html>';

test('injectLiveFrame with one or zero screens emits no sidebar', () => {
  const out = injectLiveFrame(PAGE, { screens: [{ slug: 'a', name: 'a.md', title: 'A' }], activeSlug: 'a' });
  assert.doesNotMatch(out, /id="isles-sidebar"/);
  assert.match(out, /id="isles-header"/);
  assert.match(out, /id="isles-bar"/);
});

test('injectLiveFrame with two+ screens emits a sidebar with active highlight and slug script', () => {
  const screens = [
    { slug: 'a', name: 'a.md', title: 'A' },
    { slug: 'b', name: 'b.md', title: 'B' },
  ];
  const out = injectLiveFrame(PAGE, { screens, activeSlug: 'b' });
  assert.match(out, /id="isles-sidebar"/);
  assert.match(out, /href="\/a"/);
  assert.match(out, /href="\/b"/);
  assert.match(out, /<li class="active"><a href="\/b"/);
  assert.match(out, /window\.__ISLES_ACTIVE_SLUG="b"/);
});

test('buildSidebar escapes names and titles', () => {
  const html = buildSidebar([{ slug: 'x', name: '<x>.md', title: 'A&B' }], 'x');
  assert.match(html, /&lt;x&gt;\.md/);
  assert.match(html, /A&amp;B/);
});

test('injectLiveFrame inserts the client after the real </body>, not a literal inside a script', () => {
  const script = '<script>var s = "</body></html>"; foo();</script>';
  const page = `<!doctype html><html><head></head><body><h1>Doc</h1>${script}</body></html>`;
  const out = injectLiveFrame(page);
  assert.ok(out.includes(script), 'inlined script corrupted');
  assert.ok(out.indexOf('id="isles-bar"') > out.lastIndexOf('foo();</script>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live-shell.test.mjs`
Expected: FAIL — `Cannot find module '../src/live-shell.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/live-shell.mjs`:

```javascript
// The live-mode frame: fixed header/footer chrome, an optional document sidebar,
// and the injected browser client. Served as part of every live HTML response.
import { LIVE_CLIENT } from './live-client.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function buildSidebar(screens, activeSlug) {
  const items = screens.map((s) => {
    const active = s.slug === activeSlug ? ' class="active"' : '';
    return `<li${active}><a href="/${encodeURIComponent(s.slug)}"`
      + ` data-slug="${escapeHtml(s.slug)}" title="${escapeHtml(s.title || s.name)}">`
      + `${escapeHtml(s.name)}</a></li>`;
  }).join('');
  return `<nav id="isles-sidebar" aria-label="Documents">`
    + `<div id="isles-sidebar-title">Documents</div><ul>${items}</ul></nav>`;
}

export function injectLiveFrame(pageHtml, opts = {}) {
  const screens = Array.isArray(opts.screens) ? opts.screens : [];
  const activeSlug = opts.activeSlug || null;
  const hasSidebar = screens.length >= 2;

  const overlayStyle = `<style>
    body{padding-top:2.2rem;padding-bottom:2.2rem}
    body:has(#isles-sidebar){padding-left:220px}
    #isles-header{position:fixed;top:0;left:0;right:0;height:2.2rem;display:flex;align-items:center;padding:0 1.5rem;font:500 .8rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-bottom:1px solid rgba(127,127,127,.25);z-index:99999}
    #isles-bar{position:fixed;bottom:0;left:0;right:0;padding:.45rem 1.5rem;text-align:center;font:.78rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-top:1px solid rgba(127,127,127,.25);z-index:99999}
    #isles-sidebar{position:fixed;top:2.2rem;left:0;bottom:2.2rem;width:200px;overflow:auto;padding:.5rem;box-sizing:border-box;background:rgba(127,127,127,.04);border-right:1px solid rgba(127,127,127,.25);font:.8rem system-ui,sans-serif;z-index:99998}
    #isles-sidebar-title{font-weight:600;color:#888;padding:.25rem .4rem;text-transform:uppercase;font-size:.7rem;letter-spacing:.04em}
    #isles-sidebar ul{list-style:none;margin:0;padding:0}
    #isles-sidebar li a{display:block;padding:.3rem .4rem;border-radius:4px;color:inherit;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #isles-sidebar li.active a{background:rgba(127,127,127,.18);font-weight:600}
    #isles-sidebar li a:hover{background:rgba(127,127,127,.12)}
    #isles-sidebar li a .isles-updated{color:#e8a33d;margin-left:.3rem}
  </style>`;
  const headerHtml = `<div id="isles-header">Agent Isles Live</div>`;
  const sidebarHtml = hasSidebar ? buildSidebar(screens, activeSlug) : '';
  const barHtml = `<div id="isles-bar"><span id="isles-indicator">Click an option above, then return to the terminal</span></div>`;
  const slugScript = `<script>window.__ISLES_ACTIVE_SLUG=${JSON.stringify(activeSlug)};</script>`;
  const clientHtml = `${slugScript}<script>${LIVE_CLIENT}</script>`;

  let out = pageHtml;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${overlayStyle}</head>`) : `${overlayStyle}${out}`;
  out = /<body[^>]*>/i.test(out)
    ? out.replace(/(<body[^>]*>)/i, `$1${headerHtml}${sidebarHtml}`)
    : `${headerHtml}${sidebarHtml}${out}`;
  // Insert before the *last* </body>: inlined bundles (e.g. mermaid's DOMPurify
  // iframe srcdoc template) contain literal "</body></html>" strings inside a
  // <script>, so a first-match replace would splice the client into that script.
  const bodyClose = out.toLowerCase().lastIndexOf('</body>');
  out = bodyClose >= 0
    ? `${out.slice(0, bodyClose)}${barHtml}${clientHtml}${out.slice(bodyClose)}`
    : `${out}${barHtml}${clientHtml}`;
  return out;
}
```

- [ ] **Step 4: Update `src/live.mjs` to import + re-export from the new module**

In `src/live.mjs`, delete the entire `injectLiveFrame` function (currently lines 156-177) and its now-unused `LIVE_CLIENT` import. Replace the existing import line:

```javascript
import { LIVE_CLIENT } from './live-client.js';
```

with:

```javascript
import { injectLiveFrame, buildSidebar } from './live-shell.mjs';
```

Then add this re-export immediately after the imports (so `tests/live.test.mjs` and any consumer importing `injectLiveFrame` from `live.mjs` keep working):

```javascript
export { injectLiveFrame };
```

(`buildSidebar` is imported for use in later tasks; if a lint run flags it as unused at this point, leave the import — Task 3 uses it indirectly via `injectLiveFrame`, and removing/re-adding churns the diff. If your linter is strict, drop `buildSidebar` from this import and it is not needed in `live.mjs` at all.)

- [ ] **Step 5: Run tests to verify both files pass**

Run: `node --test tests/live-shell.test.mjs tests/live.test.mjs`
Expected: PASS — new shell tests green; existing `injectLiveFrame inserts before the real </body>...` test in `live.test.mjs` still green via the re-export.

- [ ] **Step 6: Commit**

```bash
git add src/live-shell.mjs src/live.mjs tests/live-shell.test.mjs
git commit -m "refactor(live): extract live-shell module with optional sidebar"
```

---

### Task 3: Slug routing + screens endpoint + sidebar rendering (`live.mjs`)

```yaml
dependencies: [T1, T2]
scope:
  files: [src/live.mjs, tests/live.test.mjs]
```

**Files:**
- Modify: `src/live.mjs` — replace `renderNewest` (lines 186-206), add `renderBySlug` + screens helper, add routes to the request handler (lines 214-243)
- Test: `tests/live.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/live.test.mjs` (the file already imports `startLiveServer`, `get`, `writeFileSync`, `mkdtempSync`, `join`, `tmpdir`, `utimesSync`):

```javascript
test('GET /<slug> renders that specific document', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-slug-'));
  writeFileSync(join(dir, 'alpha.md'), '# Alpha Doc');
  writeFileSync(join(dir, 'beta.md'), '# Beta Doc');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/beta');
    assert.equal(res.status, 200);
    assert.match(res.body, /Beta Doc/);
    assert.doesNotMatch(res.body, /Alpha Doc/);
  } finally { await server.close(); }
});

test('GET /<unknown-slug> returns 404', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-404-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/does-not-exist');
    assert.equal(res.status, 404);
  } finally { await server.close(); }
});

test('GET /__agent-isles/screens returns the document list as JSON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-screens-'));
  writeFileSync(join(dir, 'a.md'), '# Ay');
  writeFileSync(join(dir, 'b.md'), '# Bee');
  utimesSync(join(dir, 'a.md'), new Date(1000), new Date(1000));
  utimesSync(join(dir, 'b.md'), new Date(2000), new Date(2000));
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/__agent-isles/screens');
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.deepEqual(data.screens.map((s) => s.slug), ['a', 'b']);
    assert.equal(data.newest, 'b');
  } finally { await server.close(); }
});

test('GET / shows a sidebar when 2+ docs exist and none with a single doc', async () => {
  const one = mkdtempSync(join(tmpdir(), 'isles-live-one-'));
  writeFileSync(join(one, 'only.md'), '# Only');
  const many = mkdtempSync(join(tmpdir(), 'isles-live-many-'));
  writeFileSync(join(many, 'a.md'), '# A');
  writeFileSync(join(many, 'b.md'), '# B');
  const s1 = await startLiveServer(one, { port: 0 });
  const s2 = await startLiveServer(many, { port: 0 });
  try {
    const r1 = await get(s1.url + '/');
    assert.doesNotMatch(r1.body, /id="isles-sidebar"/);
    const r2 = await get(s2.url + '/');
    assert.match(r2.body, /id="isles-sidebar"/);
  } finally { await s1.close(); await s2.close(); }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/live.test.mjs`
Expected: FAIL — `/beta` 404s (no slug route), `/__agent-isles/screens` 404s, sidebar absent.

- [ ] **Step 3: Add the discovery import to `live.mjs`**

At the top of `src/live.mjs`, add:

```javascript
import { listScreens, resolveSlug } from './live-docs.mjs';
```

- [ ] **Step 4: Replace `renderNewest` and add render helpers**

In `src/live.mjs`, replace the existing `renderNewest` function (lines 186-206) with:

```javascript
function newestOf(screens) {
  let active = null;
  for (const s of screens) if (!active || s.mtimeMs > active.mtimeMs) active = s;
  return active;
}

async function renderScreenHtml(dir, screen, screens, activeSlug) {
  let markdown;
  try {
    markdown = readFileSync(screen.file, 'utf8');
  } catch {
    return waitingPage(); // file vanished between resolve and read (delete race)
  }
  const { html } = await renderMarkdownString(markdown, {
    assetMode: 'inline',
    includeUserPacks: false,
    projectDir: dir,
  });
  return injectLiveFrame(html, { screens, activeSlug });
}

async function renderNewest(dir) {
  let screens;
  try {
    screens = listScreens(dir);
  } catch {
    return waitingPage();
  }
  const active = newestOf(screens);
  if (!active) return waitingPage();
  return renderScreenHtml(dir, active, screens, active.slug);
}

async function renderBySlug(dir, slug) {
  const screens = listScreens(dir);
  const active = screens.find((s) => s.slug === slug);
  if (!active) return null; // 404
  return renderScreenHtml(dir, active, screens, active.slug);
}
```

- [ ] **Step 5: Add the routes to the request handler**

In `src/live.mjs`, inside `http.createServer(async (req, res) => { ... })`, add the screens endpoint and the slug fallback. Place the screens handler right after the existing `GET /events` block, and the slug fallback just before the final `res.writeHead(404)`:

```javascript
      if (req.method === 'GET' && req.url === '/__agent-isles/screens') {
        const screens = listScreens(dir).map(({ slug, name, title, mtimeMs }) => ({ slug, name, title, mtimeMs }));
        const newest = newestOf(screens);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ screens, newest: newest ? newest.slug : null }));
        return;
      }
```

And immediately before the final `res.writeHead(404); res.end('Not found');`:

```javascript
      if (req.method === 'GET') {
        let slug;
        try {
          slug = decodeURIComponent((req.url.split('?')[0] || '/').replace(/^\/+/, ''));
        } catch {
          slug = null;
        }
        if (slug) {
          const page = await renderBySlug(dir, slug);
          if (page) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(page);
            return;
          }
        }
      }
```

Note: `newestOf` is referenced by both the route and the JSON handler — it is defined at module scope in Step 4, so it is in scope here.

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/live.test.mjs`
Expected: PASS — all new routing tests green, all pre-existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/live.mjs tests/live.test.mjs
git commit -m "feat(live): route /<slug> and /__agent-isles/screens with sidebar"
```

---

### Task 4: Per-screen signal stamping (`live.mjs` + `live-client.js`)

```yaml
dependencies: [T3]
scope:
  files: [src/live.mjs, src/live-client.js, tests/live.test.mjs]
```

**Files:**
- Modify: `src/live.mjs` — `appendSignalEvent` (lines 55-66)
- Modify: `src/live-client.js` — `sendSignal` / current-slug detection
- Test: `tests/live.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/live.test.mjs`:

```javascript
test('signal records are stamped with the screen slug + filename when provided', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-stamp-'));
  writeFileSync(join(dir, 'screen-2.md'), '# Two');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const r = await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A', screen: 'screen-2' });
    assert.equal(r.status, 200);
    const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n')[0]);
    assert.equal(rec.screen, 'screen-2');
    assert.equal(rec.screen_file, 'screen-2.md');
  } finally { await server.close(); }
});

test('signal records omit screen fields when no screen is provided (back-compat)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-nostamp-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A' });
    const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n')[0]);
    assert.ok(!('screen' in rec));
    assert.ok(!('screen_file' in rec));
  } finally { await server.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live.test.mjs`
Expected: FAIL — `rec.screen` is `undefined`.

- [ ] **Step 3: Stamp the screen in `appendSignalEvent`**

In `src/live.mjs`, replace `appendSignalEvent` (lines 55-66) with:

```javascript
function appendSignalEvent(dir, detail) {
  const record = {
    type: 'click',
    choice: typeof detail.choice === 'string' ? detail.choice : null,
    text: typeof detail.text === 'string' ? detail.text : '',
    timestamp: Math.floor(Date.now() / 1000),
  };
  if (Array.isArray(detail.selected)) record.selected = detail.selected;
  if (typeof detail.screen === 'string' && detail.screen) {
    record.screen = detail.screen;
    const match = resolveSlug(dir, detail.screen);
    if (match) record.screen_file = match.name;
  }
  mkdirSync(stateDir(dir), { recursive: true });
  appendFileSync(eventsFile(dir), JSON.stringify(record) + '\n');
  return record;
}
```

- [ ] **Step 4: Include the current slug in client signals**

In `src/live-client.js`, inside the IIFE, add a slug helper near the top (after `var es = ...`):

```javascript
  function currentSlug() {
    if (typeof window.__ISLES_ACTIVE_SLUG === 'string') return window.__ISLES_ACTIVE_SLUG;
    var p = window.location.pathname.replace(/^\/+/, '');
    return p ? decodeURIComponent(p) : null;
  }
```

Then change `sendSignal` to enrich the detail with the slug:

```javascript
  function sendSignal(detail) {
    var enriched = {};
    for (var k in detail) if (Object.prototype.hasOwnProperty.call(detail, k)) enriched[k] = detail[k];
    var slug = currentSlug();
    if (slug) enriched.screen = slug;
    pendingSignals.push(JSON.stringify(enriched));
    if (pendingSignals.length > 50) pendingSignals.shift();
    flushSignals();
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/live.test.mjs`
Expected: PASS — stamping test green; the existing `signal record honors the JSONL contract edges` test still green (those posts omit `screen`).

- [ ] **Step 6: Commit**

```bash
git add src/live.mjs src/live-client.js tests/live.test.mjs
git commit -m "feat(live): stamp signal events with the active screen slug"
```

---

### Task 5: Watcher add/edit/membership diff + typed broadcasts (`live.mjs`)

```yaml
dependencies: [T4]
scope:
  files: [src/live.mjs, tests/live.test.mjs]
```

**Files:**
- Modify: `src/live.mjs` — `broadcast` (lines 299-301), watcher block (lines 307-332)
- Test: `tests/live.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/live.test.mjs` (uses an SSE helper — add it near the top of the file if not present):

```javascript
function openSse(url) {
  const req = http.get(url);
  const state = { text: '' };
  req.on('response', (res) => { res.setEncoding('utf8'); res.on('data', (c) => { state.text += c; }); });
  req.on('error', () => {});
  state.req = req;
  return state;
}

test('adding a new screen broadcasts live:advance and clears prior events', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-advance-'));
  writeFileSync(join(dir, 'screen-1.md'), '# One');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A' });
    assert.ok(existsSync(eventsFile(dir)));
    writeFileSync(join(dir, 'screen-2.md'), '# Two');
    assert.ok(await waitFor(() => sse.text.includes('event: live:advance')), 'advance broadcast');
    assert.match(sse.text, /event: live:advance\ndata: {"slug":"screen-2"}/);
    assert.ok(await waitFor(() => !existsSync(eventsFile(dir))), 'events cleared on push');
  } finally { sse.req.destroy(); await server.close(); }
});

test('editing an existing screen broadcasts live:reload with its slug, not advance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-edit-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  writeFileSync(join(dir, 'b.md'), '# B');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    writeFileSync(join(dir, 'a.md'), '# A edited and longer');
    utimesSync(join(dir, 'a.md'), new Date(Date.now()), new Date(Date.now() + 5000));
    assert.ok(await waitFor(() => sse.text.includes('event: live:reload')), 'reload broadcast');
    assert.match(sse.text, /event: live:reload\ndata: {"slug":"a"}/);
    assert.doesNotMatch(sse.text, /event: live:advance/);
  } finally { sse.req.destroy(); await server.close(); }
});

test('adding/removing a screen broadcasts live:screens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-membership-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    writeFileSync(join(dir, 'b.md'), '# B');
    assert.ok(await waitFor(() => sse.text.includes('event: live:screens')), 'screens broadcast on add');
  } finally { sse.req.destroy(); await server.close(); }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/live.test.mjs`
Expected: FAIL — only the generic `live:reload` (no `data` slug) is emitted today; `live:advance` / `live:screens` never appear.

- [ ] **Step 3: Make `broadcast` carry a JSON payload**

In `src/live.mjs`, replace `broadcast` (lines 299-301) with:

```javascript
  function broadcast(event, data) {
    const payload = JSON.stringify(data || {});
    for (const c of clients) c.write(`event: ${event}\ndata: ${payload}\n\n`);
  }
```

- [ ] **Step 4: Replace the watcher block with an add/edit/membership diff**

In `src/live.mjs`, replace the watcher block (lines 307-332, from `let lastScreen = ...` through the watcher `catch`) with:

```javascript
  function indexByName(screens) {
    const map = new Map();
    for (const s of screens) map.set(s.name, s);
    return map;
  }

  let lastScreens = listScreens(dir);
  let lastSnapshot = screenSnapshot(dir);
  let watcher = null;
  let debounceTimer = null;
  if (options.watch) {
    try {
      watcher = fsWatch(dir, (_evt, filename) => {
        if (filename && !String(filename).endsWith('.md')) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const snap = screenSnapshot(dir);
          if (snap === lastSnapshot) return; // ignore state/ churn + non-.md + no-op events
          lastSnapshot = snap;
          const next = listScreens(dir);
          const prevByName = indexByName(lastScreens);
          const nextByName = indexByName(next);
          const added = next.filter((s) => !prevByName.has(s.name));
          const removed = lastScreens.filter((s) => !nextByName.has(s.name));
          const changed = next.filter((s) => {
            const prev = prevByName.get(s.name);
            return prev && (prev.mtimeMs !== s.mtimeMs || prev.size !== s.size);
          });
          lastScreens = next;

          if (added.length || removed.length) broadcast('live:screens', { count: next.length });
          for (const s of changed) broadcast('live:reload', { slug: s.slug });
          if (added.length) {
            let push = added[0];
            for (const s of added) if (s.mtimeMs > push.mtimeMs) push = s;
            clearEvents(); // a new screen pushed → reset the single-flow interaction state
            broadcast('live:advance', { slug: push.slug });
          }
        }, 120);
      });
      watcher.on('error', () => {});
    } catch {
      watcher = null; // degrade: serve without live reload rather than leak/throw
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/live.test.mjs`
Expected: PASS — advance/reload/screens tests green. The pre-existing `writing a new screen clears prior events and broadcasts` test still passes (a new file is an `added` push → `clearEvents()` fires).

- [ ] **Step 6: Run the full Node test suite for regressions**

Run: `node --test tests/*.test.mjs`
Expected: PASS — no regressions in `live`, `preview`, or render tests.

- [ ] **Step 7: Commit**

```bash
git add src/live.mjs tests/live.test.mjs
git commit -m "feat(live): typed watcher broadcasts (advance/reload/screens)"
```

---

### Task 6: Client typed-event handling + auto-advance + sidebar patch (`live-client.js`)

```yaml
dependencies: [T5]
scope:
  files: [src/live-client.js, tests/live.test.mjs]
```

**Files:**
- Modify: `src/live-client.js` — replace the `live:reload` listener with typed handlers; add `refreshSidebar`
- Test: `tests/live.test.mjs` (string-contract assertions on the served client)

- [ ] **Step 1: Write the failing test**

Append to `tests/live.test.mjs`:

```javascript
test('served client wires typed SSE handlers and slug-aware reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-client-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  writeFileSync(join(dir, 'b.md'), '# B');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const body = (await get(server.url + '/a')).body;
    assert.match(body, /addEventListener\('live:advance'/);
    assert.match(body, /addEventListener\('live:reload'/);
    assert.match(body, /addEventListener\('live:screens'/);
    assert.match(body, /__agent-isles\/screens/);          // sidebar refresh fetch
    assert.match(body, /window\.__ISLES_ACTIVE_SLUG="a"/); // active slug embedded
  } finally { await server.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live.test.mjs`
Expected: FAIL — client only has `addEventListener('live:reload', ...)` today; no `live:advance` / `live:screens` / screens fetch.

- [ ] **Step 3: Rewrite the client to handle typed events**

Replace the entire contents of `src/live-client.js` with:

```javascript
// Served as a string, injected into the live shell. Handles typed SSE events:
//   live:advance  -> navigate to a newly pushed screen
//   live:reload   -> reload only if the changed slug is the current document
//   live:screens  -> re-fetch the document list and patch the sidebar in place
// Selection signals are forwarded over WebSocket, stamped with the current slug.
export const LIVE_CLIENT = `
(function () {
  function currentSlug() {
    if (typeof window.__ISLES_ACTIVE_SLUG === 'string') return window.__ISLES_ACTIVE_SLUG;
    var p = window.location.pathname.replace(/^\\/+/, '');
    return p ? decodeURIComponent(p) : null;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parseSlug(e) {
    try { var d = JSON.parse((e && e.data) || '{}'); return typeof d.slug === 'string' ? d.slug : null; }
    catch (_) { return null; }
  }

  var sidebarPresent = !!document.getElementById('isles-sidebar');

  function refreshSidebar() {
    fetch('/__agent-isles/screens').then(function (r) { return r.json(); }).then(function (data) {
      var screens = (data && data.screens) || [];
      var shouldHave = screens.length >= 2;
      if (shouldHave !== sidebarPresent) { window.location.reload(); return; }
      if (!shouldHave) return;
      var cur = currentSlug();
      var present = screens.some(function (s) { return s.slug === cur; });
      if (cur && !present) { window.location.assign('/'); return; }
      var ul = document.querySelector('#isles-sidebar ul');
      if (!ul) { window.location.reload(); return; }
      ul.innerHTML = screens.map(function (s) {
        var active = s.slug === cur ? ' class="active"' : '';
        return '<li' + active + '><a href="/' + encodeURIComponent(s.slug) + '"'
          + ' data-slug="' + esc(s.slug) + '" title="' + esc(s.title || s.name) + '">'
          + esc(s.name) + '</a></li>';
      }).join('');
    }).catch(function () {});
  }

  var es = new EventSource('/events');
  es.addEventListener('live:advance', function (e) {
    var slug = parseSlug(e);
    if (slug) window.location.assign('/' + encodeURIComponent(slug));
  });
  es.addEventListener('live:reload', function (e) {
    var slug = parseSlug(e);
    var cur = currentSlug();
    if (slug == null || cur == null || slug === cur) window.location.reload();
  });
  es.addEventListener('live:screens', function () { refreshSidebar(); });

  var signalSocket = null;
  var pendingSignals = [];

  function socketUrl() {
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + window.location.host + '/__agent-isles/signal';
  }

  function flushSignals() {
    if (!signalSocket || signalSocket.readyState !== WebSocket.OPEN) return;
    while (pendingSignals.length > 0) signalSocket.send(pendingSignals.shift());
  }

  function openSignalSocket() {
    if (!('WebSocket' in window)) return;
    signalSocket = new WebSocket(socketUrl());
    signalSocket.addEventListener('open', flushSignals);
    signalSocket.addEventListener('close', function () {
      signalSocket = null;
      window.setTimeout(openSignalSocket, 500);
    });
    signalSocket.addEventListener('error', function () {});
  }

  function sendSignal(detail) {
    var enriched = {};
    for (var k in detail) if (Object.prototype.hasOwnProperty.call(detail, k)) enriched[k] = detail[k];
    var slug = currentSlug();
    if (slug) enriched.screen = slug;
    pendingSignals.push(JSON.stringify(enriched));
    if (pendingSignals.length > 50) pendingSignals.shift();
    flushSignals();
  }

  openSignalSocket();

  document.addEventListener('agent-isles:select', function (e) {
    sendSignal(e.detail || {});
    var bar = document.getElementById('isles-indicator');
    if (!bar) return;
    var n = (e.detail && e.detail.selected && e.detail.selected.length) || 0;
    bar.textContent = n === 0
      ? 'Click an option above, then return to the terminal'
      : n + ' selected — return to the terminal to continue';
  });
})();
`;
```

> This supersedes the `sendSignal`/`currentSlug` edits from Task 4 by including them in the canonical client. Net behavior is identical; the file is rewritten whole here for clarity.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/live.test.mjs`
Expected: PASS — client-contract test green; the earlier stamping tests (Task 4) still green.

- [ ] **Step 5: Run the full Node suite**

Run: `node --test tests/*.test.mjs`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/live-client.js tests/live.test.mjs
git commit -m "feat(live): client auto-advance, per-doc reload, sidebar patch"
```

---

### Task 7: Browser test — sidebar navigation + auto-advance

```yaml
dependencies: [T6]
scope:
  files: [tests/browser/live-multidoc.spec.mjs]
```

**Files:**
- Create: `tests/browser/live-multidoc.spec.mjs`

- [ ] **Step 1: Write the browser test**

Create `tests/browser/live-multidoc.spec.mjs`:

```javascript
import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLiveServer } from '../../src/live.mjs';

test('sidebar lists docs and clicking one navigates to it', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-multi-nav-'));
  writeFileSync(join(dir, 'alpha.md'), '# Alpha Doc');
  writeFileSync(join(dir, 'beta.md'), '# Beta Doc');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    await page.goto(server.url + '/alpha');
    await expect(page.locator('#isles-sidebar')).toBeVisible();
    await page.locator('#isles-sidebar a[data-slug="beta"]').click();
    await expect(page).toHaveURL(server.url + '/beta');
    await expect(page.locator('h1')).toHaveText('Beta Doc');
  } finally {
    await server.close();
  }
});

test('writing a brand-new screen auto-advances the viewer to it', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-advance-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Screen One');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    await page.goto(server.url + '/');
    await expect(page.locator('h1')).toHaveText('Screen One');
    writeFileSync(join(dir, 'screen-2.md'), '# Screen Two');
    await expect(page.locator('h1')).toHaveText('Screen Two');
    await expect(page).toHaveURL(server.url + '/screen-2');
  } finally {
    await server.close();
  }
});

test('editing a non-viewed doc does not reload the current view', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-isolate-'));
  writeFileSync(join(dir, 'a.md'), '# Doc A');
  writeFileSync(join(dir, 'b.md'), '# Doc B');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    await page.goto(server.url + '/a');
    await page.evaluate(() => { window.__stayMarker = 'present'; });
    writeFileSync(join(dir, 'b.md'), '# Doc B edited and clearly longer now');
    // Give the watcher + SSE a beat; the current page must NOT have reloaded.
    await page.waitForTimeout(600);
    await expect.poll(() => page.evaluate(() => window.__stayMarker)).toBe('present');
    await expect(page.locator('h1')).toHaveText('Doc A');
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run the browser tests**

Run: `pnpm exec playwright test tests/browser/live-multidoc.spec.mjs`
(If the project script differs, check `package.json` — the existing browser suite runs via the same Playwright config used by `tests/browser/live-choice.spec.mjs`.)
Expected: PASS — 3 tests: navigation, auto-advance, reload isolation.

- [ ] **Step 3: Commit**

```bash
git add tests/browser/live-multidoc.spec.mjs
git commit -m "test(live): browser coverage for sidebar nav and auto-advance"
```

---

### Task 8: Documentation — update the live-mode contract notes

```yaml
dependencies: [T6]
independent: true
scope:
  files: [docs/component-vocabulary.md, docs/wiki/Component-Vocabulary.md]
```

**Files:**
- Modify: `docs/component-vocabulary.md:110`
- Modify: `docs/wiki/Component-Vocabulary.md:110`

- [ ] **Step 1: Update the events-contract sentence in both files**

Both files contain (at line 110):

```
- In `isles live` mode, the live client captures selection events and appends JSONL records such as `{"type":"click","choice":"a","text":"...","timestamp":...[,"selected":[...]]}` to `<dir>/state/events`.
```

Replace it in **both** files with:

```
- In `isles live` mode, the live client captures selection events and appends JSONL records such as `{"type":"click","choice":"a","text":"...","timestamp":...[,"selected":[...]][,"screen":"<slug>","screen_file":"<name.md>"]}` to `<dir>/state/events`. When multiple documents are present, each record is stamped with the `screen` slug (and `screen_file`) it originated from; filter by `screen` for per-document interaction state. The file remains a single append-only JSONL stream.
```

- [ ] **Step 2: Commit**

```bash
git add docs/component-vocabulary.md docs/wiki/Component-Vocabulary.md
git commit -m "docs: note per-screen stamping in the live events contract"
```

---

## Self-Review

**Spec coverage** (each spec decision → task):

| Spec decision | Task(s) |
|---------------|---------|
| Sidebar/index of all top-level docs | T2 (chrome), T3 (render) |
| Default newest + auto-advance on new file | T5 (`live:advance` on add), T6 (client navigate) |
| Manual selection holds until next push | T6 (only `live:advance` navigates; clicks are normal links) |
| Per-document reload scoping | T5 (`live:reload {slug}`), T6 (reload iff current) |
| Alphabetical filename sidebar, H1 as tooltip | T1 (`listScreens` sort + title), T2 (`buildSidebar` label/title) |
| Path-slug routing, traversal-safe | T1 (`resolveSlug` listing-match), T3 (`GET /<slug>`) |
| Top-level only | T1 (`readdirSync` non-recursive, ignores subdirs) |
| Event state via additive `screen` field | T4 (`appendSignalEvent` stamp), T6 (client sends slug) |
| Single-doc = no sidebar chrome | T2 (`hasSidebar = screens.length >= 2`), T3 (regression test) |
| `state/events` contract preserved | T4 (same file, additive fields), T8 (docs) |
| Reserved-route collision (`events.md`) | T1 (`RESERVED_SLUGS`) |
| Add-vs-edit distinction (no focus steal on edit) | T5 (membership `added` vs `changed`) |
| Degrade when `fs.watch` fails | T5 (watcher `catch` preserved) |

No gaps found.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step has complete code and exact commands.

**Type consistency:** `listScreens` returns `{ file, name, slug, mtimeMs, size, title }` everywhere; `resolveSlug` returns one such object or `null`; `newestOf` returns one such object or `null`; `broadcast(event, data)` and the `{ slug }` / `{ count }` payloads are consistent between T5 (emit) and T6 (parse via `parseSlug` / `data.screens`). `currentSlug()` and `__ISLES_ACTIVE_SLUG` are defined in T2 (shell embeds it) and read in T4/T6 (client). `eventsFile`, `stateDir`, `screenSnapshot`, `waitingPage`, `renderMarkdownString` are pre-existing and used with their existing signatures.

**Parallelism declarations:** T1 is `independent`. T2 depends on T1 and touches `src/live.mjs`, so it gates T3–T5. T3→T4→T5 are a strict chain on `src/live.mjs` (no overlapping-scope parallelism — correctly serialized via `dependencies`). T4 and T6 both touch `src/live-client.js`; T6 depends on T5 (which depends on T4), so they never run concurrently. T7 depends on T6. T8 is `independent` of the browser test but depends on T6 for accuracy; it touches only docs, so it may run alongside T7.

---

## Execution Handoff

Plan complete and saved to `docs/quirk/plans/2026-06-08-live-multi-document.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. The chain is mostly sequential on `src/live.mjs` (T3→T4→T5) and `src/live-client.js` (T4→T6), with T1 and T8 available to parallelize.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
