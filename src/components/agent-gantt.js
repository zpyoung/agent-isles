import { LitElement, css, html } from 'lit';

const TONE_STYLES = {
  default: { label: 'Task', color: '#2563eb', background: '#dbeafe', border: '#93c5fd' },
  components: { label: 'Components', color: '#7c3aed', background: '#ede9fe', border: '#c4b5fd' },
  testing: { label: 'Testing', color: '#0f766e', background: '#ccfbf1', border: '#5eead4' },
  validation: { label: 'Validation', color: '#c2410c', background: '#ffedd5', border: '#fdba74' },
  launch: { label: 'Launch', color: '#1d4ed8', background: '#dbeafe', border: '#93c5fd' },
  risk: { label: 'Risk', color: '#b91c1c', background: '#fee2e2', border: '#fecaca' },
};

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.round(number));
}

function normalizeWeekList(value, maxWeeks) {
  return String(value || '')
    .split(',')
    .map((part) => normalizePositiveInteger(part.trim(), 0))
    .filter((week) => week >= 1 && week <= maxWeeks)
    .filter((week, index, weeks) => weeks.indexOf(week) === index)
    .sort((a, b) => a - b);
}

function toneStyle(toneName) {
  return TONE_STYLES[toneName] || TONE_STYLES.default;
}

export class AgentGanttTask extends LitElement {
  static properties = {
    label: { type: String },
    start: { type: Number },
    end: { type: Number },
    tone: { type: String },
    detail: { type: String },
    parallel: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host {
      display: block;
      grid-column: var(--agent-gantt-start, 1) / span var(--agent-gantt-span, 1);
      min-width: 0;
      position: relative;
      z-index: 1;
    }

    details {
      color: #0f172a;
      font-size: 0.82rem;
      line-height: 1.35;
    }

    summary {
      align-items: center;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.5), transparent),
        var(--agent-gantt-task-background, #dbeafe);
      border: 1px solid var(--agent-gantt-task-border, #93c5fd);
      border-left: 0.35rem solid var(--agent-gantt-task-color, #2563eb);
      border-radius: 999px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
      color: #0f172a;
      cursor: pointer;
      display: flex;
      gap: 0.45rem;
      justify-content: space-between;
      list-style: none;
      min-height: 2.25rem;
      overflow: hidden;
      padding: 0.4rem 0.75rem;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary::after {
      color: var(--agent-gantt-task-color, #2563eb);
      content: '▾';
      font-size: 0.8rem;
      transition: transform 0.15s ease;
    }

    details[open] summary::after {
      transform: rotate(180deg);
    }

    :host([parallel]) summary {
      background:
        repeating-linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.4),
          rgba(255, 255, 255, 0.4) 0.45rem,
          transparent 0.45rem,
          transparent 0.9rem
        ),
        var(--agent-gantt-task-background, #dbeafe);
      border-style: dashed;
    }

    summary:focus-visible {
      outline: 3px solid rgba(59, 130, 246, 0.45);
      outline-offset: 2px;
    }

    .task-label {
      font-weight: 800;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .task-duration {
      color: #475569;
      flex: 0 0 auto;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .task-detail {
      background: #ffffff;
      border: 1px solid #dbeafe;
      border-radius: 0.75rem;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      color: #334155;
      margin-top: 0.45rem;
      padding: 0.65rem 0.75rem;
      position: relative;
    }

    .task-detail p {
      margin: 0 0 0.4rem;
    }

    .task-detail p:last-child {
      margin-bottom: 0;
    }

    .task-meta {
      color: #64748b;
      font-size: 0.74rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
  `;

  updated() {
    this.applyPosition();
    this.updateAccessibleLabel();
  }

  applyPosition() {
    const start = normalizePositiveInteger(this.start, 1);
    const end = normalizePositiveInteger(this.end, start);
    const safeEnd = Math.max(start, end);
    const span = safeEnd - start + 1;
    const tone = toneStyle(this.tone);

    this.style.setProperty('--agent-gantt-start', String(start));
    this.style.setProperty('--agent-gantt-span', String(span));
    this.style.setProperty('--agent-gantt-task-color', tone.color);
    this.style.setProperty('--agent-gantt-task-background', tone.background);
    this.style.setProperty('--agent-gantt-task-border', tone.border);
  }

  updateAccessibleLabel() {
    const label = this.label || 'Gantt task';
    const tone = toneStyle(this.tone);
    const weekText = this.weekText();
    const detailText = this.detail ? ` — ${this.detail}` : '';
    const parallelText = this.parallel ? ' — parallel work track' : '';

    this.setAttribute('role', 'listitem');
    this.setAttribute('aria-label', `${label} — ${weekText} — ${tone.label}${parallelText}${detailText}`);
  }

  weekText() {
    const start = normalizePositiveInteger(this.start, 1);
    const end = Math.max(start, normalizePositiveInteger(this.end, start));
    return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
  }

  render() {
    const label = this.label || 'Gantt task';
    const detail = this.detail;

    return html`
      <details>
        <summary>
          <span class="task-label">${label}</span>
          <span class="task-duration">${this.weekText()}</span>
        </summary>
        <div class="task-detail">
          <p class="task-meta">${this.weekText()}${this.parallel ? ' · Parallel track' : ''}</p>
          ${detail ? html`<p>${detail}</p>` : null}
          <slot></slot>
        </div>
      </details>
    `;
  }
}

customElements.define('agent-gantt-task', AgentGanttTask);

export class AgentGanttPhase extends LitElement {
  static properties = {
    label: { type: String },
    weeks: { type: Number },
    milestones: { type: String },
  };

  static styles = css`
    :host {
      display: block;
    }

    .phase {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(9rem, 13rem) minmax(22rem, 1fr);
      padding: 0.85rem 0;
    }

    .phase + .phase {
      border-top: 1px solid #e2e8f0;
    }

    .phase-label {
      align-self: start;
      color: #0f172a;
      font-size: 0.9rem;
      font-weight: 850;
      line-height: 1.25;
      padding-top: 0.35rem;
    }

    .lane {
      background:
        linear-gradient(90deg, rgba(148, 163, 184, 0.24) 1px, transparent 1px),
        linear-gradient(180deg, rgba(248, 250, 252, 0.88), rgba(241, 245, 249, 0.72));
      background-size: calc(100% / var(--agent-gantt-weeks, 12)) 100%, 100% 100%;
      border: 1px solid #dbeafe;
      border-radius: 0.9rem;
      display: grid;
      gap: 0.55rem 0;
      grid-auto-rows: minmax(2.25rem, auto);
      grid-template-columns: repeat(var(--agent-gantt-weeks, 12), minmax(2.2rem, 1fr));
      min-height: 3.25rem;
      overflow: visible;
      padding: 0.65rem 0.5rem;
      position: relative;
    }

    .milestone-line {
      align-self: stretch;
      background: rgba(14, 165, 233, 0.48);
      grid-row: 1 / -1;
      justify-self: center;
      min-height: 2.3rem;
      pointer-events: none;
      width: 2px;
      z-index: 0;
    }

    @media (max-width: 720px) {
      .phase {
        grid-template-columns: 1fr;
      }

      .lane {
        overflow-x: auto;
      }
    }
  `;

  constructor() {
    super();
    this.weeks = 12;
    this.milestones = '';
    this.observer = new MutationObserver(() => this.requestUpdate());
  }

  connectedCallback() {
    super.connectedCallback();
    this.observer.observe(this, { attributes: true, childList: true, subtree: false });
  }

  disconnectedCallback() {
    this.observer.disconnect();
    super.disconnectedCallback();
  }

  render() {
    const weeks = normalizePositiveInteger(this.weeks, 12);
    const milestones = normalizeWeekList(this.milestones, weeks);

    return html`
      <section class="phase" role="rowgroup" aria-label=${this.label || 'Gantt phase'}>
        <div class="phase-label" role="rowheader">${this.label || 'Phase'}</div>
        <div
          class="lane"
          role="list"
          style=${`--agent-gantt-weeks: ${weeks}`}
          aria-label=${`${this.label || 'Phase'} tasks`}
        >
          ${milestones.map((week) => html`
            <span
              class="milestone-line"
              style=${`grid-column: ${week}`}
              title=${`Milestone week ${week}`}
              aria-hidden="true"
            ></span>
          `)}
          <slot></slot>
        </div>
      </section>
    `;
  }
}

customElements.define('agent-gantt-phase', AgentGanttPhase);

export class AgentGantt extends LitElement {
  static properties = {
    weeks: { type: Number },
    milestones: { type: String },
    label: { type: String },
    revision: { type: Number, state: true },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1.5rem 0;
    }

    .gantt {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #bfdbfe;
      border-radius: 1rem;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      overflow-x: auto;
      padding: 1rem;
    }

    .axis-wrap {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(9rem, 13rem) minmax(22rem, 1fr);
      min-width: max-content;
    }

    .axis-label {
      color: #64748b;
      font-size: 0.72rem;
      font-weight: 850;
      letter-spacing: 0.07em;
      padding-left: 0.15rem;
      text-transform: uppercase;
    }

    .axis {
      display: grid;
      grid-template-columns: repeat(var(--agent-gantt-weeks, 12), minmax(2.2rem, 1fr));
    }

    .week {
      border-left: 1px solid #cbd5e1;
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 800;
      padding-bottom: 0.35rem;
      text-align: center;
    }

    .week.milestone {
      color: #0369a1;
      position: relative;
    }

    .week.milestone::before {
      background: #0284c7;
      border-radius: 999px;
      content: '';
      display: block;
      height: 0.42rem;
      margin: 0 auto 0.2rem;
      width: 0.42rem;
    }

    .phases {
      min-width: max-content;
    }

    .agent-gantt-legend {
      align-items: center;
      border-top: 1px solid #e2e8f0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 0.9rem;
      margin-top: 1rem;
      padding-top: 0.85rem;
    }

    .legend-title {
      color: #475569;
      font-size: 0.72rem;
      font-weight: 850;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .legend-item {
      align-items: center;
      color: #334155;
      display: inline-flex;
      font-size: 0.78rem;
      font-weight: 750;
      gap: 0.35rem;
    }

    .swatch {
      background: var(--agent-gantt-legend-background, #dbeafe);
      border: 1px solid var(--agent-gantt-legend-border, #93c5fd);
      border-left: 0.35rem solid var(--agent-gantt-legend-color, #2563eb);
      border-radius: 999px;
      height: 0.9rem;
      width: 1.85rem;
    }

    .milestone-key .swatch {
      background: #e0f2fe;
      border-color: #7dd3fc;
      border-left-color: #0284c7;
      width: 0.9rem;
    }

    @media (max-width: 720px) {
      .axis-wrap {
        grid-template-columns: 1fr;
      }
    }
  `;

  constructor() {
    super();
    this.weeks = 12;
    this.milestones = '';
    this.label = 'Gantt chart';
    this.revision = 0;
    this.observer = new MutationObserver(() => this.refreshChart());
  }

  connectedCallback() {
    super.connectedCallback();
    this.observer.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['tone'],
    });
    this.refreshChart();
  }

  disconnectedCallback() {
    this.observer.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.refreshChart();
  }

  updated() {
    this.passScheduleContext();
  }

  get phases() {
    return [...this.querySelectorAll(':scope > agent-gantt-phase')];
  }

  get tasks() {
    return [...this.querySelectorAll('agent-gantt-task')];
  }

  refreshChart() {
    this.passScheduleContext();
    this.revision += 1;
  }

  passScheduleContext() {
    const weeks = String(normalizePositiveInteger(this.weeks, 12));
    const milestones = this.milestones || '';

    for (const phase of this.phases) {
      if (phase.getAttribute('weeks') !== weeks) phase.setAttribute('weeks', weeks);
      if (phase.getAttribute('milestones') !== milestones) phase.setAttribute('milestones', milestones);
    }
  }

  legendItems() {
    const toneNames = this.tasks.map((task) => task.getAttribute('tone') || 'default');
    return [...new Set(toneNames)].map((toneName) => ({ name: toneName, ...toneStyle(toneName) }));
  }

  render() {
    const weeks = normalizePositiveInteger(this.weeks, 12);
    const milestones = normalizeWeekList(this.milestones, weeks);
    const milestoneSet = new Set(milestones);
    const legend = this.legendItems();

    return html`
      <section class="gantt" role="grid" aria-label=${this.label || 'Gantt chart'}>
        <div class="axis-wrap" style=${`--agent-gantt-weeks: ${weeks}`}>
          <div class="axis-label">Phase</div>
          <div class="axis" role="row" aria-label="Week axis">
            ${Array.from({ length: weeks }, (_, index) => {
              const week = index + 1;
              return html`
                <span class="week ${milestoneSet.has(week) ? 'milestone' : ''}" role="columnheader">
                  W${week}
                </span>
              `;
            })}
          </div>
        </div>
        <div class="phases">
          <slot @slotchange=${() => this.refreshChart()}></slot>
        </div>
        <div class="agent-gantt-legend" aria-label="Gantt chart legend">
          <span class="legend-title">Legend</span>
          ${legend.map((item) => html`
            <span class="legend-item">
              <span
                class="swatch"
                style=${`--agent-gantt-legend-color: ${item.color}; --agent-gantt-legend-background: ${item.background}; --agent-gantt-legend-border: ${item.border}`}
                aria-hidden="true"
              ></span>
              ${item.label}
            </span>
          `)}
          ${milestones.length ? html`
            <span class="legend-item milestone-key">
              <span class="swatch" aria-hidden="true"></span>
              Milestone weeks ${milestones.join(', ')}
            </span>
          ` : null}
        </div>
      </section>
    `;
  }
}

customElements.define('agent-gantt', AgentGantt);
