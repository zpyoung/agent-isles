import { LitElement, css, html } from 'lit';

const TONE_LABELS = new Map([
  ['active', 'Active'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
  ['green', 'Green'],
  ['neutral', 'Neutral'],
  ['ready', 'Ready'],
  ['risk', 'At risk'],
  ['warning', 'Warning'],
]);

let boardId = 0;
let laneId = 0;

function countCards(root) {
  return root.querySelectorAll('agent-kanban-card').length;
}

function directCards(root) {
  return [...root.children].filter((child) => child.localName === 'agent-kanban-card');
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function titleCaseToken(value) {
  return String(value || '')
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeTone(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token) return 'neutral';
  if (token === 'in-progress' || token === 'doing') return 'active';
  return token;
}

function toneLabel(value) {
  const tone = normalizeTone(value);
  return TONE_LABELS.get(tone) || titleCaseToken(tone) || 'Neutral';
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export class AgentKanbanCard extends LitElement {
  static properties = {
    title: { type: String },
    owner: { type: String },
    meta: { type: String },
    priority: { type: String },
    status: { type: String },
    tone: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      margin: 0.75rem 0;
    }

    .card {
      --kanban-accent: #64748b;
      background: #ffffff;
      border: 1px solid #dbeafe;
      border-left: 0.32rem solid var(--kanban-accent);
      border-radius: 0.9rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      color: #334155;
      display: grid;
      gap: 0.6rem;
      padding: 0.85rem 0.95rem;
    }

    .card[data-tone='active'],
    .card[data-tone='ready'] {
      --kanban-accent: #2563eb;
    }

    .card[data-tone='blocked'],
    .card[data-tone='risk'] {
      --kanban-accent: #dc2626;
    }

    .card[data-tone='done'],
    .card[data-tone='green'] {
      --kanban-accent: #16a34a;
    }

    .card[data-tone='warning'] {
      --kanban-accent: #f59e0b;
    }

    .card-header {
      align-items: start;
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 0.75rem;
      justify-content: space-between;
    }

    .card-title {
      color: #0f172a;
      font-size: 0.98rem;
      font-weight: 850;
      line-height: 1.25;
      margin: 0;
    }

    .tone-label {
      align-items: center;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      color: #334155;
      display: inline-flex;
      flex: 0 0 auto;
      font-size: 0.72rem;
      font-weight: 850;
      letter-spacing: 0.035em;
      padding: 0.18rem 0.55rem;
      text-transform: uppercase;
    }

    .meta {
      color: #64748b;
      display: flex;
      flex-wrap: wrap;
      font-size: 0.8rem;
      font-weight: 750;
      gap: 0.45rem;
      line-height: 1.25;
    }

    .meta span:not(:last-child)::after {
      color: #cbd5e1;
      content: '·';
      margin-left: 0.45rem;
    }

    .body {
      color: #475569;
      font-size: 0.92rem;
      line-height: 1.45;
    }

    .body ::slotted(p) {
      margin: 0;
    }

    :host([data-bs-theme="dark"]) .kanban,
    :host([data-bs-theme="dark"]) .lane,
    :host([data-bs-theme="dark"]) .card {
      background: var(--agent-isles-surface, #0f172a);
      border-color: var(--agent-isles-border, #334155);
      box-shadow: 0 1px 2px rgba(2, 6, 23, 0.45);
      color: var(--agent-isles-text, #cbd5e1);
    }
    :host([data-bs-theme="dark"]) .lane { background: rgba(15, 23, 42, 0.78); }
    :host([data-bs-theme="dark"]) .title,
    :host([data-bs-theme="dark"]) .card-title { color: var(--agent-isles-heading, #f8fafc); }
    :host([data-bs-theme="dark"]) .meta,
    :host([data-bs-theme="dark"]) .empty,
    :host([data-bs-theme="dark"]) .count { color: var(--agent-isles-muted, #94a3b8); }
  `;

  render() {
    const toneSource = hasText(this.status) ? this.status : this.tone;
    const tone = normalizeTone(toneSource);
    const toneText = toneLabel(toneSource);
    const tonePrefix = hasText(this.status) ? 'Status' : 'Tone';
    const meta = [];
    if (hasText(this.owner)) meta.push(['Owner', this.owner.trim()]);
    if (hasText(this.meta)) meta.push(['Meta', this.meta.trim()]);
    if (hasText(this.priority)) meta.push(['Priority', this.priority.trim()]);

    return html`
      <article class="card" data-tone=${tone} aria-label=${this.title || 'Kanban card'}>
        <div class="card-header">
          <h4 class="card-title">${this.title || 'Kanban card'}</h4>
          ${hasText(toneSource) ? html`<span class="tone-label">${tonePrefix}: ${toneText}</span>` : null}
        </div>
        ${meta.length > 0
          ? html`<div class="meta">${meta.map(([label, value]) => html`<span>${label}: ${value}</span>`)}</div>`
          : null}
        <div class="body"><slot></slot></div>
      </article>
    `;
  }
}

customElements.define('agent-kanban-card', AgentKanbanCard);

export class AgentKanbanLane extends LitElement {
  static properties = {
    key: { type: String },
    label: { type: String },
    empty: { type: String },
    cardCount: { state: true },
    headingId: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      min-width: min(18rem, 100%);
    }

    .lane {
      background: rgba(248, 250, 252, 0.92);
      border: 1px solid #dbeafe;
      border-radius: 1rem;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
      display: grid;
      gap: 0.85rem;
      min-height: 100%;
      padding: 0.85rem;
    }

    .lane-header {
      align-items: baseline;
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
    }

    .lane-heading {
      color: #0f172a;
      font-size: 0.95rem;
      font-weight: 850;
      letter-spacing: 0.01em;
      margin: 0;
    }

    .lane-count {
      color: #64748b;
      font-size: 0.78rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .cards {
      display: grid;
      gap: 0.75rem;
    }

    .empty-state {
      background: #ffffff;
      border: 1px dashed #bfdbfe;
      border-radius: 0.85rem;
      color: #64748b;
      font-size: 0.88rem;
      font-weight: 700;
      margin: 0;
      padding: 0.85rem;
      text-align: center;
    }
  `;

  constructor() {
    super();
    this.cardCount = 0;
    this.headingId = `agent-kanban-lane-${++laneId}`;
    this._observer = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._observer = new MutationObserver(() => this.updateCardCount());
    this._observer.observe(this, { childList: true });
    this.updateCardCount();
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._observer = null;
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.updateCardCount();
  }

  updateCardCount() {
    this.cardCount = directCards(this).length;
  }

  render() {
    const label = this.label || this.key || 'Lane';
    const emptyText = this.empty || `No ${String(label).toLowerCase()} cards yet`;

    return html`
      <section class="lane" aria-labelledby=${this.headingId}>
        <header class="lane-header">
          <h3 class="lane-heading" id=${this.headingId}>${label}</h3>
          <span class="lane-count">${pluralize(this.cardCount, 'card')}</span>
        </header>
        <div class="cards">
          <slot @slotchange=${this.updateCardCount}></slot>
          ${this.cardCount === 0 ? html`<p class="empty-state" role="status">${emptyText}</p>` : null}
        </div>
      </section>
    `;
  }
}

customElements.define('agent-kanban-lane', AgentKanbanLane);

export class AgentKanban extends LitElement {
  static properties = {
    label: { type: String },
    lanes: { type: String },
    density: { type: String },
    cardCount: { state: true },
    headingId: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1.25rem 0;
    }

    .board {
      background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
      border: 1px solid #bfdbfe;
      border-radius: 1.1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      display: grid;
      gap: 1rem;
      overflow-x: auto;
      padding: 1rem;
    }

    .board-header {
      align-items: baseline;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      justify-content: space-between;
    }

    .board-title {
      color: #0f172a;
      font-size: 1.08rem;
      font-weight: 900;
      margin: 0;
    }

    .board-count {
      color: #475569;
      font-size: 0.84rem;
      font-weight: 800;
    }

    .lanes {
      align-items: stretch;
      display: grid;
      gap: 0.9rem;
      grid-auto-columns: minmax(min(18rem, 82vw), 1fr);
      grid-auto-flow: column;
      min-width: min-content;
    }

    .board.compact {
      gap: 0.75rem;
      padding: 0.8rem;
    }

    @media (max-width: 720px) {
      .board {
        overflow-x: visible;
      }

      .lanes {
        grid-auto-flow: row;
        grid-auto-columns: auto;
        grid-template-columns: 1fr;
        min-width: 0;
      }
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

  constructor() {
    super();
    this.cardCount = 0;
    this.headingId = `agent-kanban-${++boardId}`;
    this._observer = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._observer = new MutationObserver(() => this.updateCardCount());
    this._observer.observe(this, { childList: true, subtree: true });
    this.updateCardCount();
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._observer = null;
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.updateCardCount();
  }

  updateCardCount() {
    this.cardCount = countCards(this);
  }

  render() {
    const label = this.label || 'Kanban board';
    const density = String(this.density || '').trim().toLowerCase();

    return html`
      <section class=${`board ${density === 'compact' ? 'compact' : ''}`.trim()} aria-labelledby=${this.headingId}>
        <header class="board-header">
          <h2 class="board-title" id=${this.headingId}>${label}</h2>
          <span class="board-count">${pluralize(this.cardCount, 'card')}</span>
        </header>
        <div class="lanes" role="list" aria-label=${`${label} lanes`}>
          <slot @slotchange=${this.updateCardCount}></slot>
        </div>
      </section>

  `;
  }
}

customElements.define('agent-kanban', AgentKanban);
