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
  const slugJson = JSON.stringify(activeSlug).replace(/</g, '\\u003c');
  const slugScript = `<script>window.__ISLES_ACTIVE_SLUG=${slugJson};</script>`;
  const clientHtml = `${slugScript}<script>${LIVE_CLIENT}</script>`;

  let out = pageHtml;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${overlayStyle}</head>`) : `${overlayStyle}${out}`;
  out = /<body[^>]*>/i.test(out)
    ? out.replace(/(<body[^>]*>)/i, `$1${headerHtml}${sidebarHtml}`)
    : `${headerHtml}${sidebarHtml}${out}`;
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
