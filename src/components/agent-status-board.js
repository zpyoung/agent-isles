import { LitElement, css, html } from 'lit';

const STATUS_ORDER = ['red', 'amber', 'green', 'grey'];
const STATUS_ALIASES = new Map([
  ['r', 'red'],
  ['red', 'red'],
  ['danger', 'red'],
  ['blocked', 'red'],
  ['a', 'amber'],
  ['amber', 'amber'],
  ['yellow', 'amber'],
  ['warning', 'amber'],
  ['g', 'green'],
  ['green', 'green'],
  ['good', 'green'],
  ['ok', 'green'],
  ['gray', 'grey'],
  ['grey', 'grey'],
  ['unknown', 'grey'],
  ['none', 'grey'],
]);

const STATUS_DETAILS = {
  red: {
    label: 'Red',
    text: '#991b1b',
    background: '#fee2e2',
    border: '#fecaca',
    accent: '#dc2626',
    description: 'Blocked or needs urgent attention',
  },
  amber: {
    label: 'Amber',
    text: '#92400e',
    background: '#fef3c7',
    border: '#fde68a',
    accent: '#f59e0b',
    description: 'At risk or needs follow-up',
  },
  green: {
    label: 'Green',
    text: '#166534',
    background: '#dcfce7',
    border: '#bbf7d0',
    accent: '#22c55e',
    description: 'Healthy or on track',
  },
  grey: {
    label: 'Grey',
    text: '#475569',
    background: '#f1f5f9',
    border: '#cbd5e1',
    accent: '#94a3b8',
    description: 'No data or not started',
  },
};

function normalizeStatus(status) {
  return STATUS_ALIASES.get(String(status || '').trim().toLowerCase()) || 'grey';
}

function parseHistory(history) {
  return String(history || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => normalizeStatus(part));
}

function statusDetail(status) {
  return STATUS_DETAILS[normalizeStatus(status)];
}

function itemText(element) {
  return String(element.textContent || '').replace(/\s+/g, ' ').trim();
}

export class AgentStatusItem extends LitElement {
  static properties = {
    label: { type: String },
    status: { type: String },
    statusColor: { type: String, attribute: 'status-color' },
    statusLabel: { type: String, attribute: 'status-label' },
    owner: { type: String },
    updatedText: { type: String, attribute: 'updated' },
    history: { type: String },
    dataIndex: { type: String, attribute: 'data-index', reflect: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .status-item {
      --status-accent: #94a3b8;
      --status-background: #f1f5f9;
      --status-border: #cbd5e1;
      --status-text: #475569;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid var(--status-border);
      border-left: 0.35rem solid var(--status-accent);
      border-radius: 0.95rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      color: #334155;
      display: grid;
      gap: 0.55rem;
      padding: 0.85rem 0.95rem;
    }

    .status-item[data-status='red'] {
      --status-accent: #dc2626;
      --status-background: #fee2e2;
      --status-border: #fecaca;
      --status-text: #991b1b;
    }

    .status-item[data-status='amber'] {
      --status-accent: #f59e0b;
      --status-background: #fef3c7;
      --status-border: #fde68a;
      --status-text: #92400e;
    }

    .status-item[data-status='green'] {
      --status-accent: #22c55e;
      --status-background: #dcfce7;
      --status-border: #bbf7d0;
      --status-text: #166534;
    }

    .status-item[data-status='grey'] {
      --status-accent: #94a3b8;
      --status-background: #f1f5f9;
      --status-border: #cbd5e1;
      --status-text: #475569;
    }

    .status-header {
      align-items: start;
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
    }

    .status-title {
      color: #0f172a;
      font-size: 1rem;
      font-weight: 850;
      line-height: 1.2;
      margin: 0;
    }

    .status-reference {
      align-items: center;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 0.35rem;
      color: #64748b;
      display: inline-flex;
      font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin-left: 0.5rem;
      padding: 0.15rem 0.4rem;
    }

    .status-pill-wrapper {
      display: flex;
      flex: 0 0 auto;
      gap: 0.5rem;
      align-items: center;
    }

    .status-pill {
      align-items: center;
      background: var(--status-background);
      border: 1px solid var(--status-border);
      border-radius: 999px;
      color: var(--status-text);
      display: inline-flex;
      flex: 0 0 auto;
      font-size: 0.72rem;
      font-weight: 850;
      gap: 0.32rem;
      letter-spacing: 0.04em;
      padding: 0.2rem 0.55rem;
      text-transform: uppercase;
    }

    .status-dot {
      background: var(--status-accent);
      border-radius: 999px;
      display: inline-block;
      height: 0.55rem;
      width: 0.55rem;
    }

    .status-meta {
      color: #64748b;
      display: flex;
      flex-wrap: wrap;
      font-size: 0.78rem;
      font-weight: 750;
      gap: 0.45rem;
      line-height: 1.25;
    }

    .status-meta span:not(:last-child)::after {
      color: #cbd5e1;
      content: '·';
      margin-left: 0.45rem;
    }

    .status-body {
      color: #475569;
      font-size: 0.92rem;
      line-height: 1.45;
    }

    .status-body ::slotted(p) {
      margin: 0;
    }

    .trend {
      align-items: center;
      display: flex;
      gap: 0.24rem;
    }

    .trend-label {
      color: #64748b;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .trend-chip {
      background: var(--chip-background, #f1f5f9);
      border: 1px solid var(--chip-border, #cbd5e1);
      border-radius: 999px;
      color: var(--chip-text, #475569);
      font-size: 0.68rem;
      font-weight: 850;
      height: 1.25rem;
      line-height: 1.1;
      min-width: 1.25rem;
      padding: 0 0.28rem;
      text-transform: uppercase;
    }
  `;

  updated() {
    // Determine status color: prefer status-color, fall back to status
    const rawStatusColor = this.statusColor || this.status;
    const statusColor = normalizeStatus(rawStatusColor);

    // Determine display label: use status-label if provided, otherwise use default
    const displayLabel = this.statusLabel || statusDetail(statusColor).label;

    const detail = statusDetail(statusColor);
    const pieces = [
      this.label || 'Status item',
      displayLabel,
      detail.description,
      this.owner ? `Owner ${this.owner}` : null,
      this.updatedText ? `Updated ${this.updatedText}` : null,
      itemText(this),
    ].filter(Boolean);

    // Store normalized status color for grouping
    this.status = statusColor;
    this.setAttribute('role', 'listitem');
    this.setAttribute('aria-label', pieces.join(' — '));

    // Set DOM ID if data-index is available
    if (this.dataIndex !== undefined && this.dataIndex !== null) {
      this.id = `status-item-${parseInt(this.dataIndex, 10) + 1}`;
    }
  }

  renderTrend(statuses) {
    if (!statuses.length) return null;

    return html`
      <div class="trend" aria-label=${`Trend history: ${statuses.map((status) => statusDetail(status).label).join(', ')}`}>
        <span class="trend-label">Trend</span>
        ${statuses.map((status) => {
          const detail = statusDetail(status);
          return html`
            <span
              class="trend-chip"
              style=${`--chip-background:${detail.background};--chip-border:${detail.border};--chip-text:${detail.text};`}
              title=${detail.label}
              aria-label=${detail.label}
            >${detail.label[0]}</span>
          `;
        })}
      </div>
    `;
  }

  render() {
    // Determine status color: prefer status-color, fall back to status
    const rawStatusColor = this.statusColor || this.status;
    const statusColor = normalizeStatus(rawStatusColor);

    // Determine display label: use status-label if provided, otherwise use default
    const displayLabel = this.statusLabel || statusDetail(statusColor).label;

    const detail = statusDetail(statusColor);
    const history = parseHistory(this.history);

    // Get reference badge from data-index property
    const refBadge = this.dataIndex !== undefined && this.dataIndex !== null ? `#${parseInt(this.dataIndex, 10) + 1}` : null;

    return html`
      <article class="status-item" data-status=${statusColor}>
        <header class="status-header">
          <h3 class="status-title">
            ${this.label || 'Status item'}
            ${refBadge ? html`<span class="status-reference">${refBadge}</span>` : null}
          </h3>
          <div class="status-pill-wrapper">
            <span class="status-pill" aria-label=${`${displayLabel}: ${detail.description}`}>
              <span class="status-dot" aria-hidden="true"></span>
              ${displayLabel}
            </span>
          </div>
        </header>
        ${(this.owner || this.updatedText) ? html`
          <div class="status-meta">
            ${this.owner ? html`<span>Owner ${this.owner}</span>` : null}
            ${this.updatedText ? html`<span>Updated ${this.updatedText}</span>` : null}
          </div>
        ` : null}
        <div class="status-body"><slot></slot></div>
        ${this.renderTrend(history)}
      </article>
    `;
  }
}

customElements.define('agent-status-item', AgentStatusItem);

export class AgentStatusBoard extends LitElement {
  static properties = {
    label: { type: String },
    meta: { type: String },
    summary: { type: String },
    groupBy: { type: String, attribute: 'group-by' },
    hideEmptyGroups: { type: Boolean, attribute: 'hide-empty-groups' },
    itemsVersion: { type: Number, state: true },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1.25rem 0;
    }

    .status-board {
      background: rgba(255, 255, 255, 0.88);
      border: 1px solid #dbeafe;
      border-radius: 1.1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }

    .board-header {
      align-items: start;
      background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
      border-bottom: 1px solid #dbeafe;
      display: flex;
      gap: 1rem;
      justify-content: space-between;
      padding: 1rem 1.1rem;
    }

    .board-title {
      color: #0f172a;
      font-size: 1.1rem;
      font-weight: 850;
      line-height: 1.2;
      margin: 0;
    }

    .board-meta {
      color: #64748b;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .agent-status-summary {
      border-bottom: 1px solid #e2e8f0;
      display: grid;
      gap: 0.75rem;
      padding: 0.9rem 1.1rem;
    }

    .summary-line {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      justify-content: space-between;
    }

    .overall {
      color: #0f172a;
      font-size: 0.95rem;
      font-weight: 850;
    }

    .counts {
      color: #64748b;
      display: flex;
      flex-wrap: wrap;
      font-size: 0.75rem;
      font-weight: 800;
      gap: 0.4rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .count-chip {
      align-items: center;
      background: var(--chip-background, #f1f5f9);
      border: 1px solid var(--chip-border, #cbd5e1);
      border-radius: 999px;
      color: var(--chip-text, #475569);
      display: inline-flex;
      gap: 0.25rem;
      padding: 0.18rem 0.5rem;
    }

    .distribution {
      background: #e2e8f0;
      border-radius: 999px;
      display: flex;
      height: 0.55rem;
      overflow: hidden;
    }

    .distribution-segment {
      background: var(--segment-color, #94a3b8);
      min-width: var(--segment-min-width, 0);
      width: var(--segment-width, 0%);
    }

    .groups,
    .items {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    details.status-group {
      border: 1px solid #e2e8f0;
      border-radius: 0.95rem;
      overflow: hidden;
    }

    details.status-group summary {
      align-items: center;
      background: #f8fafc;
      color: #0f172a;
      cursor: pointer;
      display: flex;
      font-size: 0.85rem;
      font-weight: 850;
      gap: 0.5rem;
      justify-content: space-between;
      list-style: none;
      padding: 0.65rem 0.85rem;
    }

    details.status-group summary::-webkit-details-marker {
      display: none;
    }

    details.status-group summary::after {
      color: #64748b;
      content: '▾';
      transition: transform 0.15s ease;
    }

    details.status-group[open] summary::after {
      transform: rotate(180deg);
    }

    details.status-group summary:focus-visible {
      outline: 3px solid rgba(59, 130, 246, 0.45);
      outline-offset: -3px;
    }

    .group-label {
      align-items: center;
      display: inline-flex;
      gap: 0.4rem;
    }

    .group-dot {
      background: var(--group-accent, #94a3b8);
      border-radius: 999px;
      height: 0.55rem;
      width: 0.55rem;
    }

    .group-count {
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .group-items {
      display: grid;
      gap: 0.65rem;
      padding: 0.75rem;
    }

    .empty {
      color: #64748b;
      font-size: 0.9rem;
      padding: 1rem;
    }
  `;

  constructor() {
    super();
    this.label = 'Status';
    this.summary = 'off';
    this.groupBy = 'none';
    this.hideEmptyGroups = false;
    this.itemsVersion = 0;
    this.observer = new MutationObserver(() => this.refreshItems());
  }

  connectedCallback() {
    super.connectedCallback();
    this.observer.observe(this, {
      attributes: true,
      attributeFilter: ['status', 'status-color', 'status-label', 'label', 'owner', 'updated', 'history'],
      childList: true,
      subtree: true,
    });
  }

  disconnectedCallback() {
    this.observer.disconnect();
    super.disconnectedCallback();
  }

  updated(changedProperties) {
    if (changedProperties.has('groupBy')) {
      this.refreshItems();
    }
  }

  firstUpdated() {
    this.refreshItems();
  }

  get statusItems() {
    this.itemsVersion;
    return [...this.querySelectorAll(':scope > agent-status-item')];
  }

  refreshItems() {
    const grouped = this.isGrouped();

    this.statusItems.forEach((item, index) => {
      // Get status color from status-color attribute, or fall back to status
      const rawStatusColor = item.getAttribute('status-color') || item.getAttribute('status');
      const statusColor = normalizeStatus(rawStatusColor);

      // Normalize the status attribute if needed
      const currentStatus = item.getAttribute('status');
      if (currentStatus !== statusColor && !item.hasAttribute('status-color')) {
        item.setAttribute('status', statusColor);
      }

      item.slot = grouped ? `status-${statusColor}` : '';
      item.setAttribute('data-status', statusColor);
      item.setAttribute('data-index', String(index));
    });

    this.itemsVersion += 1;
    this.requestUpdate();
  }

  isGrouped() {
    return String(this.groupBy || '').toLowerCase() === 'status';
  }

  showSummary() {
    return String(this.summary || '').toLowerCase() === 'bar';
  }

  counts() {
    const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
    for (const item of this.statusItems) {
      // Get status color from status-color attribute, or fall back to status
      const rawStatusColor = item.getAttribute('status-color') || item.getAttribute('status');
      counts[normalizeStatus(rawStatusColor)] += 1;
    }
    return counts;
  }

  worstStatus(counts) {
    return STATUS_ORDER.find((status) => counts[status] > 0) || 'grey';
  }

  boardMeta(total) {
    if (this.meta) return this.meta;
    return total === 1 ? '1 workstream' : `${total} workstreams`;
  }

  renderSummary(counts, total) {
    if (!this.showSummary()) return null;

    const worst = this.worstStatus(counts);
    const worstDetail = statusDetail(worst);

    return html`
      <section class="agent-status-summary" aria-label="Status summary">
        <div class="summary-line">
          <div class="overall">Overall ${worstDetail.label}</div>
          <div class="counts" aria-label=${`Status counts: ${STATUS_ORDER.map((status) => `${counts[status]} ${statusDetail(status).label}`).join(', ')}`}>
            ${STATUS_ORDER.map((status) => {
              const detail = statusDetail(status);
              return html`
                <span
                  class="count-chip"
                  style=${`--chip-background:${detail.background};--chip-border:${detail.border};--chip-text:${detail.text};`}
                >${counts[status]} ${detail.label}</span>
              `;
            })}
          </div>
        </div>
        <div class="distribution" role="img" aria-label=${`Distribution bar: ${STATUS_ORDER.map((status) => `${counts[status]} ${statusDetail(status).label}`).join(', ')}`}>
          ${STATUS_ORDER.map((status) => {
            const detail = statusDetail(status);
            const width = total > 0 ? (counts[status] / total) * 100 : 0;
            return html`
              <span
                class="distribution-segment"
                style=${`--segment-color:${detail.accent};--segment-width:${width}%;--segment-min-width:${counts[status] ? '0.4rem' : '0'};`}
                title=${`${counts[status]} ${detail.label}`}
              ></span>
            `;
          })}
        </div>
      </section>
    `;
  }

  renderGrouped(counts) {
    return html`
      <div class="groups" role="list" aria-label=${`${this.label || 'Status'} grouped by status`}>
        ${STATUS_ORDER.map((status) => {
          const detail = statusDetail(status);
          const count = counts[status];

          // Skip rendering if hide-empty-groups is true and count is 0
          if (this.hideEmptyGroups && count === 0) {
            return null;
          }

          return html`
            <details class="status-group" open style=${`--group-accent:${detail.accent};`}>
              <summary>
                <span class="group-label">
                  <span class="group-dot" aria-hidden="true"></span>
                  ${detail.label}
                </span>
                <span class="group-count">${count} ${count === 1 ? 'item' : 'items'}</span>
              </summary>
              <div class="group-items">
                <slot name=${`status-${status}`}></slot>
              </div>
            </details>
          `;
        })}
      </div>
    `;
  }

  renderUngrouped() {
    return html`
      <div class="items" role="list" aria-label=${this.label || 'Status'}>
        <slot @slotchange=${() => this.refreshItems()}></slot>
      </div>
    `;
  }

  render() {
    const counts = this.counts();
    const total = this.statusItems.length;

    return html`
      <section class="status-board" aria-label=${this.label || 'Status'}>
        <header class="board-header">
          <h2 class="board-title">${this.label || 'Status'}</h2>
          <div class="board-meta">${this.boardMeta(total)}</div>
        </header>
        ${this.renderSummary(counts, total)}
        ${total ? (this.isGrouped() ? this.renderGrouped(counts) : this.renderUngrouped()) : html`<div class="empty">No status items yet.</div>`}
      </section>
    `;
  }
}

customElements.define('agent-status-board', AgentStatusBoard);
