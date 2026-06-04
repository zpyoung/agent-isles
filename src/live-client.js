// Served as a string, injected into the live shell. Reloads on SSE 'live:reload';
// forwards selection signals to the POST endpoint (endpoint handled in a later task).
export const LIVE_CLIENT = `
(function () {
  var es = new EventSource('/events');
  es.addEventListener('live:reload', function () { window.location.reload(); });
  function post(detail) {
    fetch('/__agent-isles/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detail),
    }).catch(function () {});
  }
  document.addEventListener('agent-isles:select', function (e) {
    post(e.detail || {});
    var bar = document.getElementById('isles-indicator');
    if (!bar) return;
    var n = (e.detail && e.detail.selected && e.detail.selected.length) || 0;
    bar.textContent = n === 0
      ? 'Click an option above, then return to the terminal'
      : n + ' selected — return to the terminal to continue';
  });
})();
`;
