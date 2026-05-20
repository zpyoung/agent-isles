import { LitElement, css, html } from 'lit';

const STATUSES = /** @type {const} */ (['open', 'in-progress', 'blocked', 'done']);
const PRIORITIES = /** @type {const} */ (['high', 'normal', 'low']);

const STATUS_LABELS = {
  open: 'Open',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const STATUS_GLYPHS = {
  open: '☐',
  'in-progress': '◐',
  blocked: '⛔',
  done: '☑',
};

const PRIORITY_LABELS = {
  high: 'P0',
  normal: 'P1',
  low: 'P2',
};

function normalizeList(value) {
  if (typeof value !== 'string') return new Set();
  return new Set(
    value
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizeStatus(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return STATUSES.includes(normalized) ? normalized : 'open';
}

function normalizePriority(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PRIORITIES.includes(normalized) ? normalized : 'normal';
}

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDue(dueText) {
  const dueDate = parseIsoDate(dueText);
  if (!dueDate) return { kind: 'text', text: dueText, title: dueText, overdue: false };

  const today = startOfUtcDay(new Date());
  const dueDay = startOfUtcDay(dueDate);
  const dayDelta = Math.round((dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  const sameYear = dueDay.getUTCFullYear() === today.getUTCFullYear();
  const absolute = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? null : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(dueDay);

  let relative = '';
  if (dayDelta === 0) relative = 'today';
  else if (dayDelta === 1) relative = 'tomorrow';
  else if (dayDelta === -1) relative = 'yesterday';
  else if (dayDelta > 1) relative = `in ${dayDelta}d`;
  else relative = `${Math.abs(dayDelta)}d ago`;

  return {
    kind: 'date',
    text: absolute,
    title: `${dueText} (${relative})`,
    overdue: dayDelta < 0,
  };
}

function compareActions(left, right) {
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  const statusOrder = { blocked: 0, 'in-progress': 1, open: 2, done: 3 };

  const priorityCompare =
    (priorityOrder[left.priority] ?? 99) - (priorityOrder[right.priority] ?? 99);
  if (priorityCompare !== 0) return priorityCompare;

  const dueCompare = (left.dueSort ?? Infinity) - (right.dueSort ?? Infinity);
  if (dueCompare !== 0) return dueCompare;

  const statusCompare = (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99);
  if (statusCompare !== 0) return statusCompare;

  return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
}

export class AgentAction extends LitElement {
  static properties = {
    owner: { type: String },
    due: { type: String },
    priority: { type: String },
    status: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      margin: 0.75rem 0;
    }

    .surface {
      border: 1px solid #dbeafe;
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.82);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      padding: 0.75rem 0.85rem;
    }

    .row {
      display: grid;
      grid-template-columns: 1.25rem 1fr;
      align-items: start;
      gap: 0.6rem;
    }

    .glyph {
      font-size: 1rem;
      line-height: 1.2;
      margin-top: 0.05rem;
    }

    .label {
      color: #0f172a;
      font-weight: 700;
    }

    .meta {
      color: #64748b;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.86rem;
      margin-top: 0.3rem;
    }
  `;

  render() {
    const status = normalizeStatus(this.status);
    const priority = normalizePriority(this.priority);

    const bits = [];
    if (this.owner) bits.push(`Owner: ${this.owner}`);
    if (this.due) bits.push(`Due: ${this.due}`);
    if (this.priority) bits.push(`Priority: ${PRIORITY_LABELS[priority]}`);
    if (this.status) bits.push(`Status: ${STATUS_LABELS[status]}`);

    return html`
      <article class="surface" aria-label=${bits.join(' · ') || 'Action'}>
        <div class="row">
          <span class="glyph" aria-hidden="true">${STATUS_GLYPHS[status]}</span>
          <div>
            <div class="label"><slot></slot></div>
            <div class="meta">
              ${this.owner ? html`<span>Owner: ${this.owner}</span>` : null}
              ${this.due ? html`<span>Due: ${this.due}</span>` : null}
              ${this.priority ? html`<span>Priority: ${PRIORITY_LABELS[priority]}</span>` : null}
              ${this.status ? html`<span>Status: ${STATUS_LABELS[status]}</span>` : null}
            </div>
          </div>
        </div>
      </article>
    `;
  }
}

customElements.define('agent-action', AgentAction);

export class AgentActionList extends LitElement {
  static properties = {
    label: { type: String },
    layout: { type: String },
    groupBy: { type: String, attribute: 'group-by' },
    filterStatus: { type: String, attribute: 'filter-status' },
    filterPriority: { type: String, attribute: 'filter-priority' },
    showDone: {
      type: Boolean,
      attribute: 'show-done',
      converter: (value) => value == null ? true : (typeof value === 'string' ? value.trim().toLowerCase() !== 'false' : Boolean(value)),
    },
    actions: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1.25rem 0;
    }

    .surface {
      position: relative;
      border: 1px solid #bfdbfe;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }

    .surface::before {
      content: '';
      position: absolute;
      inset: 0.45rem;
      border: 1px solid rgba(148, 163, 184, 0.8);
      border-radius: 0.75rem;
      pointer-events: none;
    }

    header {
      position: relative;
      padding: 1rem 1.1rem 0.75rem;
    }

    .title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .title {
      color: #0f172a;
      font-size: 1.05rem;
      font-weight: 850;
      margin: 0;
    }

    .meta {
      color: #64748b;
      font-size: 0.85rem;
      font-weight: 700;
      display: inline-flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .rule {
      border-bottom: 1px dashed rgba(148, 163, 184, 0.85);
      margin-top: 0.65rem;
    }

    .content {
      position: relative;
      padding: 0 1.1rem 1.1rem;
    }

    .empty {
      color: #475569;
      background: rgba(241, 245, 249, 0.65);
      border: 1px dashed rgba(148, 163, 184, 0.7);
      border-radius: 0.75rem;
      padding: 0.85rem 0.95rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }

    thead th {
      text-align: left;
      color: #475569;
      font-weight: 850;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.6rem 0.5rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.35);
    }

    tbody td {
      padding: 0.7rem 0.5rem;
      border-bottom: 1px solid rgba(226, 232, 240, 0.85);
      vertical-align: top;
    }

    tbody tr:last-child td {
      border-bottom: 0;
    }

    .col-glyph {
      width: 2.25rem;
    }

    .glyph {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 0.45rem;
      background: rgba(241, 245, 249, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.55);
      font-size: 1rem;
      line-height: 1;
      color: #0f172a;
      user-select: none;
    }

    .label {
      color: #0f172a;
      font-weight: 750;
      line-height: 1.35;
    }

    .subtle {
      color: #64748b;
      font-size: 0.86rem;
      margin-top: 0.25rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.55);
      background: rgba(241, 245, 249, 0.78);
      color: #334155;
      font-size: 0.78rem;
      font-weight: 850;
      padding: 0.18rem 0.6rem;
      white-space: nowrap;
    }

    .chip--status-open {
      border-color: rgba(59, 130, 246, 0.4);
      background: rgba(219, 234, 254, 0.65);
      color: #1e40af;
    }

    .chip--status-in-progress {
      border-color: rgba(2, 132, 199, 0.5);
      background: rgba(224, 242, 254, 0.75);
      color: #075985;
    }

    .chip--status-blocked {
      border-color: rgba(251, 146, 60, 0.55);
      background: rgba(254, 243, 199, 0.85);
      color: #92400e;
    }

    .chip--status-done {
      border-color: rgba(34, 197, 94, 0.45);
      background: rgba(220, 252, 231, 0.72);
      color: #166534;
    }

    .chip--priority-high {
      border-color: rgba(239, 68, 68, 0.55);
      background: rgba(254, 226, 226, 0.85);
      color: #991b1b;
    }

    .chip--priority-normal {
      border-color: rgba(59, 130, 246, 0.4);
      background: rgba(219, 234, 254, 0.65);
      color: #1e40af;
    }

    .chip--priority-low {
      border-color: rgba(100, 116, 139, 0.55);
      background: rgba(226, 232, 240, 0.85);
      color: #334155;
    }

    .owner {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      white-space: nowrap;
    }

    .avatar {
      width: 1.55rem;
      height: 1.55rem;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 0.8rem;
      background: rgba(219, 234, 254, 0.9);
      border: 1px solid rgba(191, 219, 254, 0.95);
      color: #1e40af;
      flex: 0 0 auto;
    }

    .done {
      opacity: 0.62;
    }

    .done .label {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
      text-decoration-color: rgba(100, 116, 139, 0.75);
    }

    .overdue {
      color: #b45309;
      font-weight: 850;
    }

    details.group {
      border: 1px solid rgba(226, 232, 240, 0.9);
      border-radius: 0.85rem;
      background: rgba(248, 250, 252, 0.8);
      overflow: hidden;
      margin: 0.85rem 0;
    }

    details.group:first-child {
      margin-top: 0;
    }

    summary.group-summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0.85rem;
      color: #0f172a;
      font-weight: 850;
      border-bottom: 1px dashed rgba(148, 163, 184, 0.75);
      background: rgba(255, 255, 255, 0.78);
    }

    summary.group-summary::-webkit-details-marker {
      display: none;
    }

    summary.group-summary:focus-visible {
      outline: 2px solid rgba(37, 99, 235, 0.5);
      outline-offset: 3px;
    }

    .group-count {
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 850;
      white-space: nowrap;
    }

    .kanban {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.85rem;
    }

    .lane {
      border: 1px solid rgba(226, 232, 240, 0.95);
      border-radius: 0.9rem;
      background: rgba(248, 250, 252, 0.65);
      padding: 0.75rem 0.75rem 0.85rem;
      min-height: 6rem;
    }

    .lane-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.6rem;
    }

    .lane-title {
      font-size: 0.85rem;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .lane-title .hint {
      color: #64748b;
      font-weight: 850;
      margin-left: 0.25rem;
    }

    .cards {
      display: grid;
      gap: 0.65rem;
    }

    .card {
      border: 1px solid rgba(191, 219, 254, 0.95);
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.85);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
      padding: 0.7rem 0.75rem;
    }

    .card.blocked {
      border-color: rgba(251, 146, 60, 0.65);
      background: rgba(255, 251, 235, 0.9);
    }

    .card-row {
      display: grid;
      grid-template-columns: 1.45rem 1fr;
      align-items: start;
      gap: 0.55rem;
    }

    .card-meta {
      margin-top: 0.45rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      color: #64748b;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .slot {
      display: none;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;

  constructor() {
    super();
    this.label = 'Next actions';
    this.layout = 'table';
    this.groupBy = 'none';
    this.filterStatus = '';
    this.filterPriority = '';
    this.showDone = true;
    this.actions = [];
    this.observer = new MutationObserver(() => this.refreshActions());
  }

  connectedCallback() {
    super.connectedCallback();
    this.observer.observe(this, { childList: true, subtree: false });
  }

  disconnectedCallback() {
    this.observer.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.refreshActions();
  }

  refreshActions() {
    const nodes = [...this.querySelectorAll(':scope > agent-action')];
    this.actions = nodes.map((element, index) => {
      const owner = element.getAttribute('owner')?.trim() ?? '';
      const due = element.getAttribute('due')?.trim() ?? '';
      const dueProvided = element.hasAttribute('due');
      const status = normalizeStatus(element.getAttribute('status'));
      const priority = normalizePriority(element.getAttribute('priority'));
      const priorityProvided = element.hasAttribute('priority');
      const label = (element.textContent || '').trim().replace(/\s+/g, ' ');
      const dueDate = parseIsoDate(due);

      return {
        index,
        owner,
        due,
        dueProvided,
        dueDate,
        dueSort: dueDate ? startOfUtcDay(dueDate).getTime() : null,
        status,
        priority,
        priorityProvided,
        label,
      };
    });
  }

  get visibleActions() {
    const layout = (this.layout || 'table').trim().toLowerCase();
    const isTableLayout = layout !== 'kanban' && layout !== 'priority';
    const statusFilter = isTableLayout ? normalizeList(this.filterStatus) : new Set();
    const priorityFilter = isTableLayout ? normalizeList(this.filterPriority) : new Set();

    return this.actions
      .filter((action) => action.label.length > 0)
      .filter((action) => (this.showDone ? true : action.status !== 'done'))
      .filter((action) => (statusFilter.size ? statusFilter.has(action.status) : true))
      .filter((action) => (priorityFilter.size ? priorityFilter.has(action.priority) : true))
      .slice()
      .sort(compareActions);
  }

  renderMeta(actions) {
    const total = this.actions.length;
    const visible = actions.length;
    const done = actions.filter((action) => action.status === 'done').length;
    const blocked = actions.filter((action) => action.status === 'blocked').length;

    const bits = [];
    bits.push(`${visible}${visible === 1 ? ' action' : ' actions'}`);
    if (total !== visible) bits.push(`of ${total}`);
    if (done) bits.push(`${done} done`);
    if (blocked) bits.push(`${blocked} blocked`);

    return bits.join(' · ');
  }

  renderOwner(owner) {
    if (!owner) return html`<span class="subtle">Unassigned</span>`;
    const initial = owner.trim().slice(0, 1).toUpperCase() || '?';
    return html`<span class="owner"><span class="avatar" aria-hidden="true">${initial}</span>${owner}</span>`;
  }

  renderDue(action) {
    if (!action.due) return html`<span class="subtle">—</span>`;
    const formatted = formatDue(action.due);
    const overdue = formatted.kind === 'date' && formatted.overdue && action.status !== 'done';
    const content = html`<span class=${overdue ? 'overdue' : ''} title=${formatted.title}>${formatted.text}</span>`;
    return content;
  }

  renderTable(actions) {
    const showDue = actions.some((action) => action.dueProvided);
    const showPriority = actions.some((action) => action.priorityProvided);

    const headers = [
      html`<th class="col-glyph" scope="col"><span class="visually-hidden">Status</span></th>`,
      html`<th scope="col">Action</th>`,
      html`<th scope="col">Owner</th>`,
      showDue ? html`<th scope="col">Due</th>` : null,
      showPriority ? html`<th scope="col">Priority</th>` : null,
      html`<th scope="col">State</th>`,
    ].filter(Boolean);

    return html`
      <table class="action-table" aria-label=${this.label || 'Next actions'}>
        <thead>
          <tr>${headers}</tr>
        </thead>
        <tbody>
          ${actions.map((action) => {
            const statusLabel = STATUS_LABELS[action.status] ?? action.status;
            const statusGlyph = STATUS_GLYPHS[action.status] ?? '☐';
            const priorityLabel = PRIORITY_LABELS[action.priority] ?? PRIORITY_LABELS.normal;
            const done = action.status === 'done';

            return html`
              <tr class=${`action-row ${done ? 'done' : ''}`}>
                <td class="col-glyph">
                  <span class="glyph" aria-hidden="true">${statusGlyph}</span>
                  <span class="visually-hidden">Status: ${statusLabel}</span>
                </td>
                <td>
                  <div class="label">${action.label}</div>
                  <div class="subtle">
                    ${action.status === 'blocked'
                      ? html`<span class="chip chip--status-blocked" aria-label="Blocked item">Needs unblock</span>`
                      : null}
                  </div>
                </td>
                <td>${this.renderOwner(action.owner)}</td>
                ${showDue ? html`<td>${this.renderDue(action)}</td>` : null}
                ${showPriority
                  ? html`<td>
                      <span class=${`chip chip--priority-${action.priority}`}>${priorityLabel}</span>
                    </td>`
                  : null}
                <td>
                  <span class=${`chip chip--status-${action.status}`}>${statusLabel}</span>
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    `;
  }

  groupKey(action) {
    const groupBy = (this.groupBy || 'none').trim().toLowerCase();
    if (groupBy === 'status') return STATUS_LABELS[action.status] ?? action.status;
    if (groupBy === 'priority') return PRIORITY_LABELS[action.priority] ?? PRIORITY_LABELS.normal;
    if (groupBy === 'owner') return action.owner || 'Unassigned';
    if (groupBy === 'due') return action.due || 'No due date';
    return '';
  }

  renderGroupedTable(actions) {
    const groups = new Map();
    for (const action of actions) {
      const key = this.groupKey(action);
      if (!key) continue;
      const existing = groups.get(key);
      if (existing) existing.push(action);
      else groups.set(key, [action]);
    }

    if (!groups.size) return this.renderTable(actions);

    return html`
      ${[...groups.entries()].map(([key, groupActions]) => html`
        <details class="group" open>
          <summary class="group-summary">
            <span>${key}</span>
            <span class="group-count">${groupActions.length}</span>
          </summary>
          <div class="content">${this.renderTable(groupActions)}</div>
        </details>
      `)}
    `;
  }

  renderCard(action, { showStatusChip = true } = {}) {
    const statusLabel = STATUS_LABELS[action.status] ?? action.status;
    const statusGlyph = STATUS_GLYPHS[action.status] ?? '☐';
    const priorityLabel = PRIORITY_LABELS[action.priority] ?? PRIORITY_LABELS.normal;
    const due = action.due ? formatDue(action.due) : null;
    const overdue = Boolean(due?.kind === 'date' && due.overdue && action.status !== 'done');

    const metaBits = [];
    if (action.owner) metaBits.push(action.owner);
    if (action.due) metaBits.push(action.due);
    metaBits.push(priorityLabel);
    if (showStatusChip) metaBits.push(statusLabel);

    return html`
      <article class=${`card ${action.status === 'blocked' ? 'blocked' : ''} ${action.status === 'done' ? 'done' : ''}`} aria-label=${metaBits.join(' · ')}>
        <div class="card-row">
          <span class="glyph" aria-hidden="true">${statusGlyph}</span>
          <div>
            <div class="label">${action.label}</div>
            <div class="card-meta">
              ${action.owner ? html`<span class="owner"><span class="avatar" aria-hidden="true">${action.owner.slice(0, 1).toUpperCase()}</span>${action.owner}</span>` : null}
              ${action.due
                ? html`<span class=${overdue ? 'overdue' : ''} title=${due?.title ?? action.due}>Due: ${due?.text ?? action.due}</span>`
                : null}
              <span class=${`chip chip--priority-${action.priority}`}>${priorityLabel}</span>
              ${showStatusChip ? html`<span class=${`chip chip--status-${action.status}`}>${statusLabel}</span>` : null}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  renderKanban(actions) {
    const lanes = [
      { key: 'open', label: STATUS_LABELS.open },
      { key: 'in-progress', label: STATUS_LABELS['in-progress'] },
      { key: 'blocked', label: STATUS_LABELS.blocked },
      ...(this.showDone ? [{ key: 'done', label: STATUS_LABELS.done }] : []),
    ];

    const laneItems = new Map(lanes.map((lane) => [lane.key, []]));
    for (const action of actions) {
      const list = laneItems.get(action.status);
      if (list) list.push(action);
    }

    return html`
      <div class="kanban" role="list" aria-label=${this.label || 'Next actions'}>
        ${lanes.map((lane) => {
          const items = (laneItems.get(lane.key) || []).slice().sort(compareActions);
          return html`
            <section class="lane" role="listitem" aria-label=${lane.label}>
              <div class="lane-header">
                <div class="lane-title">${lane.label}<span class="hint">· ${items.length}</span></div>
              </div>
              <div class="cards">
                ${items.length ? items.map((action) => this.renderCard(action)) : html`<div class="subtle">—</div>`}
              </div>
            </section>
          `;
        })}
      </div>
    `;
  }

  renderPriority(actions) {
    const lanes = [
      { key: 'high', label: 'P0', subtitle: 'High' },
      { key: 'normal', label: 'P1', subtitle: 'Normal' },
      { key: 'low', label: 'P2', subtitle: 'Low' },
    ];

    const laneItems = new Map(lanes.map((lane) => [lane.key, []]));
    for (const action of actions) {
      laneItems.get(action.priority)?.push(action);
    }

    return html`
      <div class="kanban" role="list" aria-label=${this.label || 'Next actions'}>
        ${lanes.map((lane) => {
          const items = (laneItems.get(lane.key) || []).slice().sort(compareActions);
          return html`
            <section class="lane" role="listitem" aria-label=${`Priority ${lane.label}`}>
              <div class="lane-header">
                <div class="lane-title">${lane.label}<span class="hint">· ${lane.subtitle}</span></div>
                <span class="group-count">${items.length}</span>
              </div>
              <div class="cards">
                ${items.length ? items.map((action) => this.renderCard(action, { showStatusChip: true })) : html`<div class="subtle">—</div>`}
              </div>
            </section>
          `;
        })}
      </div>
    `;
  }

  renderLayout(actions) {
    const layout = (this.layout || 'table').trim().toLowerCase();
    const groupBy = (this.groupBy || 'none').trim().toLowerCase();

    if (layout === 'kanban') return this.renderKanban(actions);
    if (layout === 'priority') return this.renderPriority(actions);

    if (groupBy !== 'none') return this.renderGroupedTable(actions);
    return this.renderTable(actions);
  }

  render() {
    const actions = this.visibleActions;

    return html`
      <section class="surface">
        <header>
          <div class="title-row">
            <h3 class="title">${this.label || 'Next actions'}</h3>
            <div class="meta">${this.renderMeta(actions)}</div>
          </div>
          <div class="rule" aria-hidden="true"></div>
        </header>
        <div class="content">
          ${actions.length ? this.renderLayout(actions) : html`<div class="empty">No actions match the current filters.</div>`}
        </div>
        <slot class="slot" @slotchange=${() => this.refreshActions()}></slot>
      </section>
    `;
  }
}

customElements.define('agent-action-list', AgentActionList);
