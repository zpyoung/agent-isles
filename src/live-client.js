// Served as a string, injected into the live shell. Reloads on SSE 'live:reload';
// forwards selection signals over WebSocket.
export const LIVE_CLIENT = `
(function () {
  var es = new EventSource('/events');
  es.addEventListener('live:reload', function () { window.location.reload(); });

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
    var payload = detail || {};
    var screen = typeof window !== 'undefined' && typeof window.__islesScreen === 'string'
      ? window.__islesScreen
      : '';
    if (screen.length > 0 && payload.screen == null) {
      payload = Object.assign({}, payload, { screen: screen });
    }
    pendingSignals.push(JSON.stringify(payload));
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
`;
