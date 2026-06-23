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
      + ` data-slug="${escapeHtml(s.slug)}" data-mtime="${escapeHtml(s.mtimeMs)}"`
      + ` title="${escapeHtml(s.title || s.name)}">`
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
    #isles-header{position:fixed;top:0;left:0;right:0;height:2.2rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:0 1.5rem;font:500 .8rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-bottom:1px solid rgba(127,127,127,.25);z-index:99999}
    #isles-bar{position:fixed;bottom:0;left:0;right:0;padding:.45rem 1.5rem;text-align:center;font:.78rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-top:1px solid rgba(127,127,127,.25);z-index:99999}
    #isles-sidebar{position:fixed;top:2.2rem;left:0;bottom:2.2rem;width:200px;overflow:auto;padding:.5rem;box-sizing:border-box;background:rgba(127,127,127,.04);border-right:1px solid rgba(127,127,127,.25);font:.8rem system-ui,sans-serif;z-index:99998}
    #isles-sidebar-title{font-weight:600;color:#888;padding:.25rem .4rem;text-transform:uppercase;font-size:.7rem;letter-spacing:.04em}
    #isles-sidebar ul{list-style:none;margin:0;padding:0}
    #isles-sidebar li a{display:block;padding:.3rem .4rem;border-radius:4px;color:inherit;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #isles-sidebar li.active a{background:rgba(127,127,127,.18);font-weight:600}
    #isles-sidebar li a:hover{background:rgba(127,127,127,.12)}
    #isles-sidebar li a .isles-updated{color:#e8a33d;margin-left:.3rem}
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
  </style>`;
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
  const sidebarHtml = hasSidebar ? buildSidebar(screens, activeSlug) : '';
  const barHtml = `<div id="isles-bar"><span id="isles-indicator">Click an option above, then return to the terminal</span></div>`;
  const slugJson = JSON.stringify(activeSlug).replace(/</g, '\\u003c');
  const slugScript = `<script>window.__ISLES_ACTIVE_SLUG=${slugJson};</script>`;
  const clientHtml = `${slugScript}<script>${LIVE_CLIENT}</script>`;

  let out = pageHtml;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${overlayStyle}</head>`) : `${overlayStyle}${out}`;
  out = /<body[^>]*>/i.test(out)
    ? out.replace(/(<body[^>]*>)/i, `$1${headerHtml}${sidebarHtml}${settingsHtml}`)
    : `${headerHtml}${sidebarHtml}${settingsHtml}${out}`;
  // Insert before the *last* </body>: inlined bundles (e.g. mermaid's DOMPurify
  // iframe srcdoc template) contain literal "</body></html>" strings inside a
  // <script>, so a first-match replace would splice the client into that script.
  let bodyClose = -1;
  const bodyCloseRe = /<\/body>/gi;
  for (let m = bodyCloseRe.exec(out); m !== null; m = bodyCloseRe.exec(out)) bodyClose = m.index;
  out = bodyClose >= 0
    ? `${out.slice(0, bodyClose)}${barHtml}${clientHtml}${out.slice(bodyClose)}`
    : `${out}${barHtml}${clientHtml}`;
  return out;
}
