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
