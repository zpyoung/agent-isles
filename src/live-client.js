// Served as a string, injected into the live shell. Reloads on SSE 'live:reload';
// forwards selection signals over WebSocket.
export const LIVE_CLIENT = `
(function () {
  var wasConnected = false;
  var es = new EventSource('/events');
  es.addEventListener('live:reload', function () { window.location.reload(); });
  es.addEventListener('open', function () {
    // A reconnect after a drop means the server restarted (e.g. pnpm dev) — reload to pick up new code.
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
    pendingSignals.push(JSON.stringify(detail));
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
