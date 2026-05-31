import { LitElement, css, html } from 'lit';

const STATUS_STYLES = {
  done: { label: 'Done', icon: '✓', tone: 'done' },
  active: { label: 'Active', icon: '●', tone: 'active' },
  pending: { label: 'Pending', icon: '○', tone: 'pending' },
  failed: { label: 'Failed', icon: '✕', tone: 'failed' },
};

export class AgentStep extends LitElement {
  static properties = {
    status: { type: String },
    label: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      margin: 0;
    }

    .step {
      display: grid;
      grid-template-columns: 2rem minmax(0, 1fr);
      gap: 0.75rem;
      padding: 0.35rem 0 0.85rem;
    }

    .marker {
      align-items: center;
      border-radius: 999px;
      display: inline-flex;
      font-size: 0.78rem;
      font-weight: 800;
      height: 1.65rem;
      justify-content: center;
      margin-top: 0.1rem;
      width: 1.65rem;
    }

    .done {
      background: #dcfce7;
      color: #166534;
    }

    .active {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .pending {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #64748b;
    }

    .failed {
      background: #fee2e2;
      color: #991b1b;
    }

    .content {
      min-width: 0;
    }

    .label {
      color: #0f172a;
      font-weight: 750;
      line-height: 1.3;
    }

    .status {
      color: #64748b;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin-left: 0.35rem;
      text-transform: uppercase;
    }

    .body {
      color: #475569;
      font-size: 0.92rem;
      margin-top: 0.2rem;
    }

    :host([data-bs-theme="dark"]) .timeline { border-color: var(--agent-isles-border, #334155); }
    :host([data-bs-theme="dark"]) .title { color: var(--agent-isles-heading, #f8fafc); }
    :host([data-bs-theme="dark"]) .meta,
    :host([data-bs-theme="dark"]) .content { color: var(--agent-isles-muted, #94a3b8); }
    :host([data-bs-theme="dark"]) .done { background: rgba(34, 197, 94, 0.18); color: #bbf7d0; }
    :host([data-bs-theme="dark"]) .active { background: rgba(56, 189, 248, 0.18); color: #bae6fd; }
    :host([data-bs-theme="dark"]) .pending { background: rgba(148, 163, 184, 0.18); border-color: rgba(148, 163, 184, 0.42); color: #cbd5e1; }
    :host([data-bs-theme="dark"]) .blocked { background: rgba(239, 68, 68, 0.18); color: #fecaca; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute('role', 'listitem');
  }

  updated() {
    this.updateAccessibleLabel();
  }

  updateAccessibleLabel() {
    const status = STATUS_STYLES[this.status || 'pending'] || STATUS_STYLES.pending;
    const label = this.label || 'Timeline step';
    this.setAttribute('aria-label', `${label} — ${status.label}`);
  }

  render() {
    const status = STATUS_STYLES[this.status || 'pending'] || STATUS_STYLES.pending;
    const label = this.label || 'Timeline step';

    return html`
      <article class="step">
        <span class="marker ${status.tone}" aria-hidden="true">${status.icon}</span>
        <div class="content">
          <div class="label">
            ${label}<span class="status">${status.label}</span>
          </div>
          <div class="body"><slot></slot></div>
        </div>
      </article>
    `;
  }
}

customElements.define('agent-step', AgentStep);

export class AgentTimeline extends LitElement {
  static properties = {
    label: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1.25rem 0;
    }

    .timeline {
      border-left: 2px solid #dbeafe;
      margin-left: 0.8rem;
      padding-left: 0.95rem;
    }

    ::slotted(agent-step) {
      margin-left: -1.82rem;
    }

    :host([data-bs-theme="dark"]) section,
    :host([data-bs-theme="dark"]) article,
    :host([data-bs-theme="dark"]) .tabs,
    :host([data-bs-theme="dark"]) .timeline,
    :host([data-bs-theme="dark"]) .gantt,
    :host([data-bs-theme="dark"]) .board,
    :host([data-bs-theme="dark"]) .action-list,
    :host([data-bs-theme="dark"]) .kanban {
      background: var(--agent-isles-surface, #0f172a);
      border-color: var(--agent-isles-border, #334155);
      color: var(--agent-isles-text, #cbd5e1);
    }
    :host([data-bs-theme="dark"]) h2,
    :host([data-bs-theme="dark"]) h3,
    :host([data-bs-theme="dark"]) .title,
    :host([data-bs-theme="dark"]) .label {
      color: var(--agent-isles-heading, #f8fafc);
    }
    :host([data-bs-theme="dark"]) .meta,
    :host([data-bs-theme="dark"]) .content,
    :host([data-bs-theme="dark"]) .empty,
    :host([data-bs-theme="dark"]) .summary {
      color: var(--agent-isles-muted, #94a3b8);
    }
  `;

  render() {
    return html`
      <section class="timeline" role="list" aria-label=${this.label || 'Timeline'}>
        <slot></slot>
      </section>

  `;
  }
}

customElements.define('agent-timeline', AgentTimeline);
