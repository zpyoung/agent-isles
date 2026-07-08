// Agent Isles reader SPA. Bundled by Rollup into dist/isles-reader.js and
// served by `isles live`. Renders Markdown (and Agent Isles islands) entirely
// in the browser from raw files fetched over HTTP, so the same bundle runs in a
// plain browser or a Tauri desktop webview with only a static file/watch
// backend behind it.
//
// Backend contract (served by src/live.mjs today, a Rust server in Phase 2):
//   GET  /__agent-isles/tree            -> { tree, docs, newest }
//   GET  /__agent-isles/raw?slug=<slug> -> raw Markdown
//   GET  /events                        -> SSE: live:advance/live:reload/live:screens
//   WS   /__agent-isles/signal          -> island selection/proceed signals
import '../components/index.js';
import { renderReaderMarkdown } from './render-browser.mjs';

const SETTINGS_KEY = 'agent-isles-live-settings';
const THEME_KEY = 'agent-isles-theme';
const DEFAULTS = { themeMode: 'auto', width: '960px', fontSize: '16px', lineHeight: '1.7' };
const WIDTHS = { '760px': 1, '960px': 1, '1200px': 1 };
const TEXT_PAIRS = { '15px': '1.65', '16px': '1.7', '18px': '1.75' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── Settings (theme + reading prefs); mirrors src/live-client.js keys ────────
const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch {} };
const lsRemove = (k) => { try { window.localStorage.removeItem(k); } catch {} };

function loadSettings() {
  let parsed = null;
  try { parsed = JSON.parse(lsGet(SETTINGS_KEY) || 'null'); } catch { parsed = null; }
  const src = parsed || {};
  const fontSize = TEXT_PAIRS[src.fontSize] ? src.fontSize : DEFAULTS.fontSize;
  const themeMode = ['light', 'dark', 'auto'].includes(src.themeMode) ? src.themeMode : DEFAULTS.themeMode;
  return { themeMode, width: WIDTHS[src.width] ? src.width : DEFAULTS.width, fontSize, lineHeight: TEXT_PAIRS[fontSize] };
}

function effectiveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function applySettings(s) {
  const root = document.documentElement;
  root.style.setProperty('--agent-isles-page-max-width', s.width);
  root.style.setProperty('--agent-isles-page-font-size', s.fontSize);
  root.style.setProperty('--agent-isles-page-line-height', s.lineHeight);
  const resolved = effectiveTheme(s.themeMode);
  root.setAttribute('data-bs-theme', resolved);
  root.style.colorScheme = resolved;
  document.querySelectorAll('[data-bs-theme]').forEach((el) => {
    if (el !== root && el.tagName && el.tagName.startsWith('AGENT-')) el.setAttribute('data-bs-theme', resolved);
  });
  if (lsGet(THEME_KEY) !== resolved) lsSet(THEME_KEY, resolved);
}

// ── Layout chrome ───────────────────────────────────────────────────────────
function buildChrome() {
  document.body.innerHTML = `
    <header id="isles-header">
      <span id="isles-title">Agent Isles Reader</span>
      <div id="isles-header-tools">
        <input id="isles-search" type="search" placeholder="Search docs…" aria-label="Search documents" autocomplete="off">
        <button id="isles-settings-btn" type="button" popovertarget="isles-settings" aria-label="Settings" aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
    </header>
    <nav id="isles-sidebar" aria-label="Documents"><div id="isles-tree"></div><p id="isles-tree-empty" hidden>No Markdown files found.</p></nav>
    <main id="isles-main"><div id="isles-doc"></div></main>
    <footer id="isles-bar"><span id="isles-indicator"></span></footer>
    <div id="isles-settings" popover="auto" role="dialog" aria-label="Reader settings">
      <div class="isles-set-row" role="group" aria-label="Theme"><span class="isles-set-label">Theme</span><div class="isles-seg" data-seg="theme">
        <button type="button" data-theme="light">Light</button><button type="button" data-theme="dark">Dark</button><button type="button" data-theme="auto">Auto</button></div></div>
      <div class="isles-set-row" role="group" aria-label="Width"><span class="isles-set-label">Width</span><div class="isles-seg" data-seg="width">
        <button type="button" data-width="760px">Focus</button><button type="button" data-width="960px">Comfort</button><button type="button" data-width="1200px">Wide</button></div></div>
      <div class="isles-set-row" role="group" aria-label="Text"><span class="isles-set-label">Text</span><div class="isles-seg" data-seg="font-size">
        <button type="button" data-font-size="15px" data-line-height="1.65">Small</button><button type="button" data-font-size="16px" data-line-height="1.7">Regular</button><button type="button" data-font-size="18px" data-line-height="1.75">Large</button></div></div>
      <div class="isles-set-foot"><button type="button" id="isles-settings-reset" class="isles-set-reset">Reset to defaults</button>
        <button type="button" class="isles-set-close" popovertarget="isles-settings" popovertargetaction="hide" aria-label="Close settings">✕</button></div>
    </div>`;
}

const READER_STYLE = `
  :root{--isles-header-h:2.6rem;--isles-bar-h:2rem;--isles-sidebar-w:260px}
  body{margin:0;padding-top:var(--isles-header-h);padding-bottom:var(--isles-bar-h)}
  body.has-sidebar #isles-main{margin-left:var(--isles-sidebar-w)}
  #isles-header{position:fixed;top:0;left:0;right:0;height:var(--isles-header-h);display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:0 1rem;background:var(--agent-isles-surface,rgba(127,127,127,.06));border-bottom:1px solid rgba(127,127,127,.25);font:600 .9rem system-ui,sans-serif;z-index:99999}
  #isles-header-tools{display:flex;align-items:center;gap:.5rem}
  #isles-search{font:inherit;font-weight:400;padding:.2rem .5rem;border:1px solid rgba(127,127,127,.35);border-radius:6px;background:transparent;color:inherit;width:14rem;max-width:32vw}
  #isles-settings-btn{display:inline-flex;align-items:center;justify-content:center;width:1.8rem;height:1.8rem;padding:0;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
  #isles-settings-btn:hover{background:rgba(127,127,127,.18)}
  #isles-settings-btn svg{stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  #isles-sidebar{position:fixed;top:var(--isles-header-h);left:0;bottom:var(--isles-bar-h);width:var(--isles-sidebar-w);overflow:auto;padding:.6rem;box-sizing:border-box;background:rgba(127,127,127,.04);border-right:1px solid rgba(127,127,127,.25);font:.85rem system-ui,sans-serif;z-index:99998}
  body:not(.has-sidebar) #isles-sidebar{display:none}
  #isles-main{padding:0}
  #isles-tree ul{list-style:none;margin:0;padding:0}
  #isles-tree li{margin:0}
  #isles-tree .isles-folder>button{display:flex;align-items:center;gap:.3rem;width:100%;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;padding:.25rem .35rem;border-radius:5px;cursor:pointer;text-align:left}
  #isles-tree .isles-folder>button:hover{background:rgba(127,127,127,.12)}
  #isles-tree .isles-folder>button::before{content:"▸";display:inline-block;transition:transform .12s;font-size:.7em;opacity:.7}
  #isles-tree .isles-folder.open>button::before{transform:rotate(90deg)}
  #isles-tree .isles-folder:not(.open)>ul{display:none}
  #isles-tree ul ul{margin-left:.6rem;border-left:1px solid rgba(127,127,127,.2);padding-left:.3rem}
  #isles-tree a{display:block;padding:.25rem .4rem;border-radius:5px;color:inherit;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #isles-tree a:hover{background:rgba(127,127,127,.12)}
  #isles-tree a.active{background:rgba(127,127,127,.2);font-weight:600}
  #isles-tree a .isles-updated{color:#e8a33d;margin-left:.3rem}
  #isles-tree-empty{color:#888;padding:.5rem}
  #isles-bar{position:fixed;bottom:0;left:0;right:0;height:var(--isles-bar-h);display:flex;align-items:center;justify-content:center;padding:0 1rem;background:rgba(127,127,127,.06);border-top:1px solid rgba(127,127,127,.25);font:.78rem system-ui,sans-serif;color:#888;z-index:99999}
  #isles-settings{position:fixed;top:2.9rem;right:.5rem;margin:0;min-width:230px;padding:.75rem;border:1px solid rgba(127,127,127,.3);border-radius:8px;background:var(--agent-isles-surface,#fff);color:var(--agent-isles-text,#1e293b);font:.8rem system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18)}
  .isles-set-row{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.55rem}
  .isles-set-label{color:var(--agent-isles-muted,#475569);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}
  .isles-seg{display:inline-flex;border:1px solid rgba(127,127,127,.3);border-radius:6px;overflow:hidden}
  .isles-seg button{appearance:none;border:0;border-left:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;font:inherit;padding:.25rem .55rem;cursor:pointer}
  .isles-seg button:first-child{border-left:0}
  .isles-seg button:hover{background:rgba(127,127,127,.12)}
  .isles-seg button[aria-pressed="true"]{background:var(--agent-isles-primary,#2563eb);color:#fff}
  .isles-set-foot{display:flex;align-items:center;justify-content:space-between;margin-top:.3rem;padding-top:.5rem;border-top:1px solid rgba(127,127,127,.25)}
  .isles-set-reset,.isles-set-close{appearance:none;border:0;background:transparent;color:var(--agent-isles-muted,#475569);font:inherit;cursor:pointer}
  .isles-set-reset{text-decoration:underline;padding:0}
  .isles-set-close{padding:.1rem .35rem;border-radius:4px}
  .isles-reader-empty{padding:2rem;color:#888;font-family:system-ui,sans-serif}
`;

function injectStyle() {
  const style = document.createElement('style');
  style.textContent = READER_STYLE;
  document.head.appendChild(style);
}

// ── Reader state ────────────────────────────────────────────────────────────
const state = { docs: [], tree: [], bySlug: new Map(), active: null, baseline: new Map(), settings: loadSettings() };

// Path-based deep links: the server serves the reader shell for /<slug> and
// seeds __ISLES_INITIAL_SLUG, so navigation updates the pathname (not the hash).
// This keeps reload / copy-link-address / "open in new tab" pointing at the
// current document. Nested slugs (a/b) are encoded per segment so the literal
// "/" survives for the server's whole-path decodeURIComponent.
function docHref(slug) {
  return '/' + String(slug).split('/').map(encodeURIComponent).join('/');
}

function slugFromPath() {
  const p = window.location.pathname.replace(/^\/+/, '');
  if (!p) return null;
  try { return decodeURIComponent(p); } catch { return p; }
}

function renderTree() {
  const container = document.getElementById('isles-tree');
  const empty = document.getElementById('isles-tree-empty');
  const filter = (document.getElementById('isles-search')?.value || '').trim().toLowerCase();
  const matches = (node) => {
    if (node.type === 'file') return !filter || node.name.toLowerCase().includes(filter) || (node.title || '').toLowerCase().includes(filter);
    return node.children.some(matches);
  };
  const renderNodes = (nodes) => {
    const items = nodes.filter(matches).map((node) => {
      if (node.type === 'dir') {
        // Folders render expanded; the header button toggles them closed. (Search
        // never collapses, so matches stay visible.)
        return `<li class="isles-folder open"><button type="button">${esc(node.name)}</button><ul>${renderNodes(node.children)}</ul></li>`;
      }
      const active = node.slug === state.active ? ' class="active"' : '';
      const base = state.baseline.get(node.slug);
      const updated = base !== undefined && node.slug !== state.active && node.mtimeMs > base
        ? '<span class="isles-updated">●</span>' : '';
      return `<li><a href="${esc(docHref(node.slug))}"${active} data-slug="${esc(node.slug)}" title="${esc(node.title || node.name)}">${esc(node.name)}${updated}</a></li>`;
    }).join('');
    return items;
  };
  const html = renderNodes(state.tree);
  container.innerHTML = `<ul>${html}</ul>`;
  empty.hidden = state.docs.length > 0;
  container.querySelectorAll('.isles-folder > button').forEach((btn) => {
    btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
  });
}

async function fetchTree() {
  const res = await fetch('/__agent-isles/tree');
  const data = await res.json();
  state.docs = data.docs || [];
  state.tree = data.tree || [];
  state.bySlug = new Map(state.docs.map((d) => [d.slug, d]));
  if (state.baseline.size === 0) for (const d of state.docs) state.baseline.set(d.slug, d.mtimeMs);
  document.body.classList.toggle('has-sidebar', state.docs.length >= 2);
  return data;
}

let mermaidReady = false;
async function runMermaid(scope) {
  const figures = scope.querySelectorAll('[data-agent-mermaid]');
  if (figures.length === 0) return;
  const mermaid = globalThis.mermaid;
  if (!mermaid) return;
  if (!mermaidReady) { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false }); mermaidReady = true; }
  let i = 0;
  for (const figure of figures) {
    const sourceEl = figure.querySelector('[data-agent-mermaid-source]');
    if (!sourceEl || figure.dataset.agentMermaidRendered === 'true') continue;
    const source = sourceEl.textContent || '';
    try {
      const out = document.createElement('div');
      out.className = 'agent-mermaid-rendered';
      sourceEl.insertAdjacentElement('afterend', out);
      const { svg } = await mermaid.render('agent-mermaid-' + (i += 1) + '-' + Math.random().toString(36).slice(2), source);
      out.innerHTML = svg;
      sourceEl.hidden = true;
      figure.dataset.agentMermaidRendered = 'true';
    } catch (err) {
      console.warn('Agent Isles Mermaid render failed:', err);
    }
  }
}

function buildToc(toc) {
  if (!toc || toc.length === 0) return '';
  const items = toc.map((h) => `<li class="agent-isles-toc-item agent-isles-toc-item--h${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('');
  return `<nav class="agent-isles-toc" aria-label="Table of contents"><p class="agent-isles-toc-title">On this page</p><ul class="agent-isles-toc-list">${items}</ul></nav>`;
}

async function renderActive() {
  const doc = state.bySlug.get(state.active);
  const main = document.getElementById('isles-doc');
  const indicator = document.getElementById('isles-indicator');
  if (!doc) {
    main.innerHTML = '<p class="isles-reader-empty">Select a document to read, or waiting for the agent to push a screen…</p>';
    if (indicator) indicator.textContent = '';
    return;
  }
  let markdown;
  try {
    const res = await fetch('/__agent-isles/raw?slug=' + encodeURIComponent(state.active));
    if (!res.ok) throw new Error('not found');
    markdown = await res.text();
  } catch {
    main.innerHTML = '<p class="isles-reader-empty">Could not load this document.</p>';
    return;
  }
  const { html, toc } = await renderReaderMarkdown(markdown);
  const withToc = toc.length > 0 ? ' agent-isles-page--with-toc' : '';
  main.innerHTML = `<article class="agent-isles-page container py-4${withToc}">`
    + `<div class="agent-isles-layout"><div class="agent-isles-content">${html}</div>${buildToc(toc)}</div></article>`;
  document.title = (doc.title || doc.name) + ' — Agent Isles Reader';
  applySettings(state.settings); // propagate theme to freshly-mounted islands
  await runMermaid(main);
  window.scrollTo(0, 0);
  state.baseline.set(state.active, doc.mtimeMs);
  if (indicator) indicator.textContent = doc.relPath || doc.name;
}

async function navigate(slug, { push = false } = {}) {
  if (!slug || !state.bySlug.has(slug)) return;
  state.active = slug;
  if (push && slugFromPath() !== slug) window.history.pushState({ slug }, '', docHref(slug));
  renderTree();
  await renderActive();
}

function pickInitial(data) {
  const fromPath = slugFromPath();
  if (fromPath && state.bySlug.has(fromPath)) return fromPath;
  const seeded = window.__ISLES_INITIAL_SLUG;
  if (typeof seeded === 'string' && state.bySlug.has(seeded)) return seeded;
  if (data && data.newest && state.bySlug.has(data.newest)) return data.newest;
  return state.docs[0] ? state.docs[0].slug : null;
}

// ── Live reload (SSE) + island signals (WS) ─────────────────────────────────
function wireSse() {
  let wasConnected = false;
  const es = new EventSource('/events');
  es.addEventListener('live:advance', async (e) => {
    const slug = parseSlug(e);
    await fetchTree();
    if (slug && state.bySlug.has(slug)) navigate(slug, { push: true });
    else renderTree();
  });
  es.addEventListener('live:reload', async (e) => {
    const slug = parseSlug(e);
    await fetchTree();
    if (slug == null || slug === state.active) renderActive();
    else renderTree();
  });
  es.addEventListener('live:screens', async () => { await fetchTree(); renderTree(); });
  es.addEventListener('open', () => { if (wasConnected) window.location.reload(); wasConnected = true; });
}

function parseSlug(e) {
  try { const d = JSON.parse((e && e.data) || '{}'); return typeof d.slug === 'string' ? d.slug : null; }
  catch { return null; }
}

function wireSignals() {
  let socket = null;
  const pending = [];
  const url = () => (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/__agent-isles/signal';
  const flush = () => { if (socket && socket.readyState === WebSocket.OPEN) while (pending.length) socket.send(pending.shift()); };
  const open = () => {
    if (!('WebSocket' in window)) return;
    socket = new WebSocket(url());
    socket.addEventListener('open', flush);
    socket.addEventListener('close', () => { socket = null; window.setTimeout(open, 500); });
    socket.addEventListener('error', () => {});
  };
  const send = (detail) => {
    const enriched = { ...(detail || {}) };
    if (state.active) enriched.screen = state.active;
    pending.push(JSON.stringify(enriched));
    if (pending.length > 50) pending.shift();
    flush();
  };
  open();
  document.addEventListener('agent-isles:select', (e) => send(e.detail || {}));
  document.addEventListener('agent-isles:proceed', (e) => send(e.detail || {}));
  document.addEventListener('agent-isles:signal', (e) => send(e.detail || {}));
}

// ── Settings wiring ─────────────────────────────────────────────────────────
function syncSettingControls() {
  const panel = document.getElementById('isles-settings');
  if (!panel) return;
  const set = (attr, value) => panel.querySelectorAll('[data-' + attr + ']').forEach((b) => {
    b.setAttribute('aria-pressed', b.getAttribute('data-' + attr) === value ? 'true' : 'false');
  });
  set('theme', state.settings.themeMode);
  set('width', state.settings.width);
  set('font-size', state.settings.fontSize);
}

function wireSettings() {
  const panel = document.getElementById('isles-settings');
  if (!panel) return;
  const persist = () => lsSet(SETTINGS_KEY, JSON.stringify(state.settings));
  panel.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn || !panel.contains(btn)) return;
    if (btn.hasAttribute('data-theme')) state.settings.themeMode = btn.getAttribute('data-theme');
    else if (btn.hasAttribute('data-width')) state.settings.width = btn.getAttribute('data-width');
    else if (btn.hasAttribute('data-font-size')) {
      state.settings.fontSize = btn.getAttribute('data-font-size');
      state.settings.lineHeight = btn.getAttribute('data-line-height') || state.settings.lineHeight;
    } else if (btn.id === 'isles-settings-reset') { lsRemove(SETTINGS_KEY); state.settings = { ...DEFAULTS }; }
    else return;
    if (btn.id !== 'isles-settings-reset') persist();
    applySettings(state.settings);
    syncSettingControls();
  });
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
async function start() {
  injectStyle();
  buildChrome();
  applySettings(state.settings);
  syncSettingControls();
  wireSettings();
  const search = document.getElementById('isles-search');
  if (search) search.addEventListener('input', renderTree);
  let data;
  try { data = await fetchTree(); } catch { data = null; }
  renderTree();
  state.active = pickInitial(data);
  await renderActive();
  window.addEventListener('popstate', () => { const s = slugFromPath(); if (s && s !== state.active) navigate(s); });
  document.getElementById('isles-sidebar')?.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[data-slug]') : null;
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute('data-slug'), { push: true });
  });
  wireSse();
  wireSignals();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (state.settings.themeMode === 'auto') applySettings(state.settings); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
