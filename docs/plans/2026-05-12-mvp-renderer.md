# Agent Isles MVP Renderer Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build the first usable Agent Isles vertical slice: `isles render examples/demo.md --out dist/demo.html` turns Markdown with `<agent-*>` islands into browser-ready HTML.

**Architecture:** Keep the renderer as a small library in `src/render.mjs`, with the CLI in `bin/isles.mjs` parsing commands and delegating. Bundle the component vocabulary into `dist/agent-components.js` with Rollup; inject Bootstrap CDN CSS/JS, a local Agent Isles theme, and the bundled component module into generated HTML.

**Tech Stack:** Node.js ESM, unified/remark/rehype, rehype-highlight, Lit, Rollup, Node's built-in test runner.

---

## Milestone 1 — Render once

### Task 1: Add renderer tests before implementation

**Objective:** Lock the desired render API and CLI behavior before writing production renderer code.

**Files:**
- Create: `tests/render.test.mjs`
- Create: `tests/fixtures/simple.md`

**Steps:**
1. Create a fixture containing Markdown plus `<agent-decision>`.
2. Write a test that imports `renderMarkdownFile` from `src/render.mjs` and asserts the output contains:
   - rendered heading HTML,
   - preserved `<agent-decision>` island,
   - Bootstrap CSS reference,
   - `agent-components.js` module reference,
   - Agent Isles theme marker.
3. Write a CLI smoke test for `node bin/isles.mjs render tests/fixtures/simple.md --out <tmpfile>`.
4. Run `npm test` and verify failure because `src/render.mjs` is missing.

### Task 2: Install runtime/build dependencies

**Objective:** Add the exact packages needed for the MVP render pipeline.

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`

**Command:**

```bash
npm install unified remark-parse remark-gfm remark-rehype rehype-raw rehype-highlight rehype-stringify lit
npm install -D rollup @rollup/plugin-node-resolve @rollup/plugin-terser
```

**Verify:** `npm test` should still fail for missing implementation, not dependency resolution.

### Task 3: Implement `src/render.mjs`

**Objective:** Render a Markdown file into a complete HTML page.

**Files:**
- Create: `src/render.mjs`
- Create: `src/theme/agent-theme.css`

**Implementation notes:**
- Export `async function renderMarkdownFile(inputPath, options = {})`.
- Resolve input and output paths explicitly.
- Use `unified()` with `remarkParse`, `remarkGfm`, `remarkRehype({ allowDangerousHtml: true })`, `rehypeRaw`, `rehypeHighlight`, and `rehypeStringify({ allowDangerousHtml: true })`.
- Generate a full HTML document with Bootstrap CSS/JS CDN links, inline `agent-theme.css`, and `<script type="module" src="./agent-components.js"></script>`.
- If `options.outFile` is present, write the HTML there and return `{ html, outFile }`.
- If writing output, copy `dist/agent-components.js` next to the generated HTML when it exists.
- If the component bundle is missing, include a clear HTML comment instead of crashing; build enforcement comes from tests/build scripts.

**Verify:** `npm test` should now fail only where component bundle expectations are not satisfied.

### Task 4: Implement initial component bundle

**Objective:** Provide enough component behavior for the demo document to render meaningfully in a browser.

**Files:**
- Create: `src/components/agent-decision.js`
- Create: `src/components/agent-risk.js`
- Create: `src/components/index.js`
- Create: `rollup.config.js`
- Modify: `package.json`

**Implementation notes:**
- Use Lit for `<agent-decision>` and `<agent-risk>`.
- Keep styles minimal and scoped.
- Export both components from `src/components/index.js`.
- Configure Rollup to output `dist/agent-components.js` as ESM.
- Add `pretest` or make tests call build explicitly if necessary.

**Verify:**

```bash
npm run build
npm test
```

Expected: all tests pass.

### Task 5: Replace CLI placeholder with real render command

**Objective:** Make `isles render` useful from the terminal.

**Files:**
- Modify: `bin/isles.mjs`

**Implementation notes:**
- Support `isles render <file.md> --out <file.html>`.
- Support default output path: same basename with `.html` in `dist/`.
- Keep `isles watch` reserved with a helpful not-yet-implemented message.
- Preserve `--help` and `--version`.

**Verify:**

```bash
npm run render -- --out dist/demo.html
```

Expected: `dist/demo.html` exists and contains rendered Markdown plus component script reference.

---

## Milestone 2 — Demo quality

### Task 6: Expand example document

**Objective:** Make `examples/demo.md` showcase the first supported islands.

**Files:**
- Modify: `examples/demo.md`
- Modify: `README.md`

**Verify:** Render the demo and inspect `dist/demo.html` for expected content.

### Task 7: Add security note for raw HTML

**Objective:** Be honest about `rehype-raw` and untrusted input.

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` if needed

**Verify:** README clearly states MVP renderer is for trusted Markdown only until a sanitization mode exists.

---

## Done Criteria for MVP

- `npm install` succeeds.
- `npm run build` creates `dist/agent-components.js`.
- `npm test` passes.
- `npm run render -- --out dist/demo.html` creates a usable HTML page.
- README shows the correct CLI usage.
- Changes are committed and pushed to `main`.
