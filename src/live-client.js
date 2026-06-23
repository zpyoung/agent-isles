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
  var baselineMtime = {};
  (function () {
    var links = document.querySelectorAll('#isles-sidebar a[data-slug]');
    for (var i = 0; i < links.length; i++) {
      baselineMtime[links[i].getAttribute('data-slug')] = Number(links[i].getAttribute('data-mtime')) || 0;
    }
  })();

  function refreshSidebar() {
    fetch('/__agent-isles/screens').then(function (r) { return r.json(); }).then(function (data) {
      var screens = (data && data.screens) || [];
      var shouldHave = screens.length >= 2;
      if (shouldHave !== sidebarPresent) {
        // Sidebar appearing (1 -> 2 docs) always accompanies a live:advance that
        // navigates to the pushed screen; don't race it with a reload of the old
        // URL. Only reload when the sidebar disappears (2 -> 1 docs, a removal).
        if (!shouldHave) window.location.reload();
        return;
      }
      if (!shouldHave) return;
      var cur = currentSlug();
      var present = screens.some(function (s) { return s.slug === cur; });
      if (cur && !present) { window.location.assign('/'); return; }
      var ul = document.querySelector('#isles-sidebar ul');
      if (!ul) { window.location.reload(); return; }
      ul.innerHTML = screens.map(function (s) {
        var active = s.slug === cur ? ' class="active"' : '';
        var base = baselineMtime[s.slug];
        var updated = base !== undefined && s.slug !== cur && s.mtimeMs > base;
        var badge = updated ? '<span class="isles-updated">\\u25CF</span>' : '';
        return '<li' + active + '><a href="/' + encodeURIComponent(s.slug) + '"'
          + ' data-slug="' + esc(s.slug) + '" data-mtime="' + esc(s.mtimeMs) + '"'
          + ' title="' + esc(s.title || s.name) + '">'
          + esc(s.name) + badge + '</a></li>';
      }).join('');
    }).catch(function () {});
  }

  // Reconnect-after-drop means the server restarted (e.g. pnpm dev) — reload to
  // pick up new code. Set on first 'open', acted on for subsequent reconnects.
  var wasConnected = false;
  var es = new EventSource('/events');
  es.addEventListener('live:advance', function (e) {
    var slug = parseSlug(e);
    if (slug && slug !== currentSlug()) window.location.assign('/' + encodeURIComponent(slug));
  });
  es.addEventListener('live:reload', function (e) {
    var slug = parseSlug(e);
    var cur = currentSlug();
    if (slug == null || cur == null || slug === cur) window.location.reload();
  });
  es.addEventListener('live:screens', function () { refreshSidebar(); });
  es.addEventListener('open', function () {
    if (wasConnected) { window.location.reload(); }
    wasConnected = true;
  });
  es.addEventListener('error', function () { /* EventSource auto-reconnects; 'open' handles reload */ });

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
    var hasProceed = !!document.querySelector('agent-proceed');
    bar.textContent = n === 0
      ? 'Click an option above, then return to the terminal'
      : hasProceed
        ? n + ' selected — click Proceed, or return to the terminal'
        : n + ' selected — return to the terminal to continue';
  });

  document.addEventListener('agent-isles:proceed', function (e) {
    sendSignal(e.detail || {});
    var bar = document.getElementById('isles-indicator');
    if (bar) bar.textContent = 'Proceeding…';
  });

  // Generic signal channel for custom (pack) components: dispatch a composed
  // 'agent-isles:signal' event with detail {type, choice?, text?, selected?}
  // and it is forwarded like select/proceed. The server validates the type
  // token and clamps the payload.
  document.addEventListener('agent-isles:signal', function (e) {
    sendSignal(e.detail || {});
  });
})();

(function () {
  if (!document.documentElement || !document.documentElement.style) return;

  var SETTINGS_KEY = 'agent-isles-live-settings';
  var THEME_KEY = 'agent-isles-theme';
  var THEME_EVENT = 'agent-isles-theme-change';
  var DEFAULTS = { themeMode: 'auto', width: '960px', fontSize: '16px', lineHeight: '1.7' };
  var WIDTHS = { '760px': 1, '960px': 1, '1200px': 1 };
  // Font-size -> canonical line-height pairs (mirrors the reading controls in preview.mjs).
  var TEXT_PAIRS = { '15px': '1.65', '16px': '1.7', '18px': '1.75' };
  // Mirrors AGENT_COMPONENT_TAGS in src/components/agent-theme-toggle.js — keep in sync.
  var THEME_TAGS = 'agent-decision, agent-risk, agent-metric, agent-delta, agent-copy-block, agent-theme-toggle, agent-dependency-map, agent-dependency, agent-flow, agent-tabs, agent-tab, agent-timeline, agent-step, agent-gantt, agent-gantt-phase, agent-gantt-task, agent-kpi, agent-status-board, agent-status-item, agent-action-list, agent-action, agent-kanban, agent-kanban-lane, agent-kanban-card';
  var suppressThemeEvent = false;

  var lsOk = true;
  function lsGet(key) { try { return window.localStorage.getItem(key); } catch (_) { lsOk = false; return null; } }
  function lsSet(key, value) { try { window.localStorage.setItem(key, value); } catch (_) { lsOk = false; } }
  function lsRemove(key) { try { window.localStorage.removeItem(key); } catch (_) { lsOk = false; } }

  // In-memory fallback used ONLY when localStorage is unavailable (file://, private mode).
  var memory = null;

  function normalizeMode(m) {
    return (m === 'light' || m === 'dark' || m === 'auto') ? m : DEFAULTS.themeMode;
  }

  function load() {
    var parsed = null;
    var raw = lsGet(SETTINGS_KEY);
    try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = null; }
    // Use memory only when localStorage actually failed — never to resurrect a key
    // that another tab legitimately removed (Reset).
    var src = parsed || (lsOk ? null : memory) || {};
    // Snap persisted values to known presets so a corrupt or hand-edited entry can't
    // break layout or leave the segmented controls with no pressed state. line-height
    // is derived from font-size so the pair can never drift apart.
    var fontSize = TEXT_PAIRS[src.fontSize] ? src.fontSize : DEFAULTS.fontSize;
    return {
      themeMode: normalizeMode(src.themeMode),
      width: WIDTHS[src.width] ? src.width : DEFAULTS.width,
      fontSize: fontSize,
      lineHeight: TEXT_PAIRS[fontSize],
    };
  }

  function save(s) {
    memory = s;
    lsSet(SETTINGS_KEY, JSON.stringify(s));
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
      // Suppress our own listener so broadcasting a resolved theme (e.g. Auto -> light)
      // does not flip themeMode away from its real value. try/finally so a throwing
      // listener can't leave the flag stuck (which would ignore all later theme events).
      suppressThemeEvent = true;
      try {
        document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: resolved } }));
      } finally {
        suppressThemeEvent = false;
      }
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

  function adoptTheme(mode) {
    state.themeMode = mode;
    save(state);
    applyTheme(state, false);
    syncControls(state);
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
        lsRemove(SETTINGS_KEY);
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

  // In-tab interop: adopt theme changes from a legacy <agent-theme-toggle>.
  // suppressThemeEvent skips our own broadcasts (see applyTheme).
  document.addEventListener(THEME_EVENT, function (e) {
    if (suppressThemeEvent) return;
    var t = e && e.detail && e.detail.theme;
    if ((t === 'light' || t === 'dark') && state.themeMode !== t) adoptTheme(t);
  });

  // Cross-tab/window sync. Only the settings key drives gear state across tabs.
  // THEME_KEY is a one-way mirror for a legacy <agent-theme-toggle> and must NOT be
  // adopted here: doing so would convert another tab's 'auto' into its resolved
  // literal. Same-tab legacy-toggle changes are handled by the THEME_EVENT listener.
  window.addEventListener('storage', function (e) {
    if (e.key !== SETTINGS_KEY) return;
    if (e.newValue === null) memory = null; // another tab reset — drop any stale fallback
    state = load();
    applyReading(state);
    applyTheme(state, false);
    syncControls(state);
  });

  // Track live system-theme changes while in Auto.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function () { if (state.themeMode === 'auto') applyTheme(state, true); };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }
})();
`;
