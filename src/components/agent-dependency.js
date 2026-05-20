import { LitElement, css, html } from 'lit';

const STATUSES = new Set(['ready', 'active', 'blocked', 'done', 'risk']);

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return STATUSES.has(value) ? value : 'ready';
}

function normalizePriority(priority) {
  const value = String(priority || '').trim();
  return value || '';
}

function safeHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return '';

  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
    return href;
  }

  try {
    const parsed = new URL(href);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      return href;
    }
  } catch {
    return '';
  }

  return '';
}

export class AgentDependency extends LitElement {
  static properties = {
    label: { type: String },
    status: { type: String },
    owner: { type: String },
    priority: { type: String },
    href: { type: String },
    resolvedBlockers: { state: true },
    missingBlockers: { state: true },
    missingId: { state: true },
  };

  constructor() {
    super();
    this.label = '';
    this.status = 'ready';
    this.owner = '';
    this.priority = '';
    this.href = '';
    this.resolvedBlockers = [];
    this.missingBlockers = [];
    this.missingId = false;
    this.setAttribute('role', 'listitem');
  }

  static styles = css`
    :host {
      display: block;
      min-width: 16rem;
    }

    .card {
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid var(--agent-dependency-border, #cbd5e1);
      border-left: 0.45rem solid var(--agent-dependency-accent, #10b981);
      border-radius: 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      padding: 0.9rem 1rem;
    }

    header {
      align-items: flex-start;
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
    }

    h3 {
      font-size: 1rem;
      font-weight: 900;
      line-height: 1.2;
      margin: 0;
    }

    h3 a {
      color: inherit;
      text-decoration: none;
    }

    h3 a:hover {
      text-decoration: underline;
    }

    .badge {
      background: var(--agent-dependency-badge-bg, #dcfce7);
      border: 1px solid var(--agent-dependency-badge-border, #86efac);
      border-radius: 999px;
      color: var(--agent-dependency-badge-text, #166534);
      flex: 0 0 auto;
      font-size: 0.7rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      padding: 0.2rem 0.6rem;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .meta {
      color: #475569;
      display: flex;
      flex-wrap: wrap;
      font-size: 0.78rem;
      font-weight: 800;
      gap: 0.65rem;
      margin-top: 0.35rem;
    }

    .body {
      color: #334155;
      font-size: 0.9rem;
      line-height: 1.4;
      margin-top: 0.55rem;
    }

    .blockers {
      color: #0f172a;
      font-size: 0.78rem;
      font-weight: 850;
      margin-top: 0.65rem;
    }

    .blockers span {
      color: #475569;
      font-weight: 800;
    }

    .warnings {
      color: #b91c1c;
      font-size: 0.78rem;
      font-weight: 850;
      margin-top: 0.45rem;
    }

    :host([data-status="ready"]) {
      --agent-dependency-accent: #10b981;
      --agent-dependency-border: #bbf7d0;
      --agent-dependency-badge-bg: #dcfce7;
      --agent-dependency-badge-border: #86efac;
      --agent-dependency-badge-text: #166534;
    }

    :host([data-status="active"]) {
      --agent-dependency-accent: #2563eb;
      --agent-dependency-border: #bfdbfe;
      --agent-dependency-badge-bg: #dbeafe;
      --agent-dependency-badge-border: #93c5fd;
      --agent-dependency-badge-text: #1d4ed8;
    }

    :host([data-status="blocked"]) {
      --agent-dependency-accent: #f59e0b;
      --agent-dependency-border: #fde68a;
      --agent-dependency-badge-bg: #fef3c7;
      --agent-dependency-badge-border: #fcd34d;
      --agent-dependency-badge-text: #92400e;
    }

    :host([data-status="done"]) {
      --agent-dependency-accent: #059669;
      --agent-dependency-border: #bbf7d0;
      --agent-dependency-badge-bg: #dcfce7;
      --agent-dependency-badge-border: #86efac;
      --agent-dependency-badge-text: #166534;
    }

    :host([data-status="risk"]) {
      --agent-dependency-accent: #dc2626;
      --agent-dependency-border: #fecaca;
      --agent-dependency-badge-bg: #fee2e2;
      --agent-dependency-badge-border: #fca5a5;
      --agent-dependency-badge-text: #991b1b;
    }
  `;

  updated() {
    const status = normalizeStatus(this.status);
    this.dataset.status = status;

    const blockers = [
      ...this.resolvedBlockers.map((blocker) => blocker.label || blocker.id).filter(Boolean),
      ...this.missingBlockers,
    ].filter(Boolean);
    const pieces = [
      this.label || 'Dependency',
      `Status: ${status}`,
      blockers.length ? `Blocked by: ${blockers.join(', ')}` : '',
      this.owner ? `Owner: ${this.owner}` : '',
      this.priority ? `Priority: ${normalizePriority(this.priority)}` : '',
    ].filter(Boolean);

    this.setAttribute('aria-label', pieces.join('. '));
  }

  render() {
    const status = normalizeStatus(this.status);
    const href = safeHref(this.href);
    const statusText = status === 'done' ? 'done' : status;
    const title = this.label || 'Dependency';

    const blockers = this.resolvedBlockers
      .map((blocker) => blocker.label || blocker.id)
      .filter(Boolean);
    const missing = this.missingBlockers.filter(Boolean);

    const blockersLine = blockers.length || missing.length
      ? html`
        <div class="blockers">
          Blocked by:
          <span>
            ${[...blockers, ...missing].join(', ')}
          </span>
        </div>
      `
      : null;

    const warnings = [
      this.missingId ? 'Missing dependency id; cannot be referenced by blocked-by.' : '',
      !href && this.href ? 'Unsafe href removed.' : '',
      missing.length ? `Missing blocker id${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}` : '',
    ].filter(Boolean);

    return html`
      <article class="card" data-status=${status}>
        <header>
          <h3>
            ${href ? html`<a href=${href}>${title}</a>` : title}
          </h3>
          <div class="badge">${statusText}</div>
        </header>
        <div class="meta">
          ${this.owner ? html`<div>Owner: ${this.owner}</div>` : null}
          ${this.priority ? html`<div>Priority: ${normalizePriority(this.priority)}</div>` : null}
        </div>
        <div class="body"><slot></slot></div>
        ${status === 'blocked' ? blockersLine : null}
        ${warnings.length
          ? html`<div class="warnings" role="note">${warnings.join(' ')}</div>`
          : null}
      </article>
    `;
  }
}

customElements.define('agent-dependency', AgentDependency);
