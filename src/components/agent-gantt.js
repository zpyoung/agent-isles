import { LitElement, css, html } from 'lit';

const TONE_LABELS = {
  components: 'Components',
  testing: 'Testing',
  launch: 'Launch',
  content: 'Content',
  platform: 'Platform',
  default: 'General',
};

function parsePositiveInteger(value, fallback = 1) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clampWeek(value, weeks) {
  return Math.min(Math.max(parsePositiveInteger(value, 1), 1), weeks);
}

function parseMilestones(value) {
  return String(value || '')
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((week) => Number.isFinite(week) && week > 0);
}

export class AgentGantt extends LitElement {
  static properties = {
    title: { type: String },
    weeks: { type: Number },
    milestones: { type: String },
    baselineLabel: { type: String, attribute: 'baseline-label' },
    baselineWeeks: { type: Number, attribute: 'baseline-weeks' },
    revisedLabel: { type: String, attribute: 'revised-label' },
    revisedWeeks: { type: Number, attribute: 'revised-weeks' },
    summary: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .gantt {
      background: #ffffff;
      border: 1px solid #dbeafe;
      border-radius: 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      overflow-x: auto;
      padding: 1rem;
    }
    .header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      justify-content: space-between;
      margin-bottom: 0.85rem;
    }
    h3 { color: #0f172a; font-size: 1.05rem; margin: 0; }
    .summary { color: #1d4ed8; font-weight: 850; }
    .comparison {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.8rem;
      color: #334155;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      margin-bottom: 0.9rem;
      padding: 0.7rem 0.85rem;
    }
    .comparison strong { color: #0f172a; }
    .week-grid {
      border-bottom: 1px solid #e2e8f0;
      display: grid;
      font-size: 0.72rem;
      min-width: 42rem;
      padding-bottom: 0.35rem;
    }
    .week-marker {
      color: #64748b;
      font-weight: 750;
      text-align: center;
    }
    .milestone {
      color: #92400e;
      font-weight: 850;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.9rem;
    }
    .legend-item {
      align-items: center;
      color: #475569;
      display: inline-flex;
      font-size: 0.8rem;
      font-weight: 750;
      gap: 0.35rem;
    }
    .swatch {
      background: var(--tone-color, #64748b);
      border-radius: 999px;
      height: 0.65rem;
      width: 0.65rem;
    }
    .components { --tone-color: #2563eb; }
    .testing { --tone-color: #7c3aed; }
    .launch { --tone-color: #16a34a; }
    .content { --tone-color: #ea580c; }
    .platform { --tone-color: #0891b2; }
    .default { --tone-color: #64748b; }
  `;

  updated() {
    this.setAttribute('aria-label', this.title || 'Gantt schedule');
  }

  render() {
    const weeks = parsePositiveInteger(this.weeks, 1);
    const milestones = parseMilestones(this.milestones).filter((week) => week <= weeks);
    const tones = this.collectTones();

    return html`
      <section class="gantt" role="group" aria-label=${this.title || 'Gantt schedule'} style=${`--agent-gantt-weeks: ${weeks};`}>
        <div class="header">
          <h3>${this.title || 'Schedule'}</h3>
          ${this.summary ? html`<div class="summary">${this.summary}</div>` : null}
        </div>
        ${this.renderComparison()}
        <div class="week-grid" aria-label=${`${weeks} week schedule grid`} style=${`grid-template-columns: repeat(${weeks}, minmax(1.35rem, 1fr));`}>
          ${Array.from({ length: weeks }, (_, index) => {
            const week = index + 1;
            const isMilestone = milestones.includes(week);
            return html`<span class=${`week-marker${isMilestone ? ' milestone' : ''}`} title=${isMilestone ? `Week ${week} milestone` : `Week ${week}`}>${isMilestone || week === 1 || week === weeks || week % 4 === 0 ? week : ''}<span class="sr-only">${isMilestone ? `Week ${week} milestone` : `Week ${week}`}</span></span>`;
          })}
        </div>
        <slot @slotchange=${() => this.requestUpdate()}></slot>
        <div class="legend" aria-label="Gantt legend">
          ${tones.map((tone) => html`<span class=${`legend-item ${tone}`}><span class="swatch" aria-hidden="true"></span>${TONE_LABELS[tone] || tone}</span>`)}
        </div>
      </section>
    `;
  }

  renderComparison() {
    if (!this.baselineWeeks && !this.revisedWeeks) return null;

    return html`
      <div class="comparison" aria-label="Schedule comparison">
        ${this.baselineWeeks ? html`<span><strong>${this.baselineLabel || 'Baseline'}:</strong> ${this.baselineWeeks} weeks</span>` : null}
        ${this.revisedWeeks ? html`<span><strong>${this.revisedLabel || 'Revised'}:</strong> ${this.revisedWeeks} weeks</span>` : null}
      </div>
    `;
  }

  collectTones() {
    const tones = [...this.querySelectorAll('agent-gantt-task')]
      .map((task) => task.getAttribute('tone') || 'default')
      .filter(Boolean);
    return [...new Set(tones.length ? tones : ['default'])];
  }
}

customElements.define('agent-gantt', AgentGantt);

export class AgentGanttPhase extends LitElement {
  static properties = {
    label: { type: String },
  };

  static styles = css`
    :host { display: block; min-width: 42rem; }
    .phase { margin-top: 0.85rem; }
    .label {
      color: #475569;
      font-size: 0.78rem;
      font-weight: 850;
      letter-spacing: 0.05em;
      margin-bottom: 0.35rem;
      text-transform: uppercase;
    }
  `;

  render() {
    return html`
      <section class="phase" aria-label=${this.label || 'Gantt phase'}>
        <div class="label">${this.label || 'Phase'}</div>
        <slot></slot>
      </section>
    `;
  }
}

customElements.define('agent-gantt-phase', AgentGanttPhase);

export class AgentGanttTask extends LitElement {
  static properties = {
    label: { type: String },
    start: { type: Number },
    end: { type: Number },
    tone: { type: String },
    detail: { type: String },
    parallel: { type: Boolean },
  };

  static styles = css`
    :host { display: block; margin: 0.35rem 0; }
    .task-row {
      display: grid;
      grid-template-columns: repeat(var(--agent-gantt-weeks, 28), minmax(1.35rem, 1fr));
    }
    details {
      grid-column: var(--task-start) / var(--task-end);
      min-width: 0;
    }
    summary {
      background: var(--tone-color, #64748b);
      border-radius: 999px;
      color: #ffffff;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 850;
      list-style: none;
      overflow: hidden;
      padding: 0.35rem 0.65rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    summary::-webkit-details-marker { display: none; }
    .parallel summary { background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.22) 0 0.35rem, transparent 0.35rem 0.7rem); }
    .detail {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.7rem;
      color: #475569;
      font-size: 0.85rem;
      margin-top: 0.25rem;
      padding: 0.5rem;
      white-space: pre-line;
    }
    .components { --tone-color: #2563eb; }
    .testing { --tone-color: #7c3aed; }
    .launch { --tone-color: #16a34a; }
    .content { --tone-color: #ea580c; }
    .platform { --tone-color: #0891b2; }
    .default { --tone-color: #64748b; }
  `;

  updated() {
    const weeks = parsePositiveInteger(this.closest('agent-gantt')?.getAttribute('weeks'), 28);
    const start = clampWeek(this.start, weeks);
    const end = Math.max(start, clampWeek(this.end, weeks));
    this.setAttribute('aria-label', `${this.label || 'Task'}, weeks ${start} through ${end}`);
  }

  render() {
    const gantt = this.closest('agent-gantt');
    const weeks = parsePositiveInteger(gantt?.getAttribute('weeks'), 28);
    const start = clampWeek(this.start, weeks);
    const end = Math.max(start, clampWeek(this.end, weeks));
    const tone = this.tone && TONE_LABELS[this.tone] ? this.tone : 'default';

    return html`
      <div class=${`task-row ${tone}${this.parallel ? ' parallel' : ''}`} style=${`--task-start: ${start}; --task-end: ${end + 1}; --agent-gantt-weeks: ${weeks};`}>
        <details>
          <summary>${this.label || 'Task'} <span aria-hidden="true">· W${start}–${end}</span></summary>
          <div class="detail">${this.detail || ''}<slot></slot></div>
        </details>
      </div>
    `;
  }
}

customElements.define('agent-gantt-task', AgentGanttTask);

export class AgentGanttNote extends LitElement {
  static properties = {
    badge: { type: String },
  };

  static styles = css`
    :host { display: block; margin-top: 0.7rem; }
    .note {
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      border-radius: 0.85rem;
      color: #3730a3;
      font-size: 0.9rem;
      padding: 0.65rem 0.8rem;
    }
    .badge {
      background: #4f46e5;
      border-radius: 999px;
      color: #ffffff;
      font-size: 0.72rem;
      font-weight: 850;
      margin-right: 0.45rem;
      padding: 0.18rem 0.45rem;
    }
  `;

  render() {
    return html`<aside class="note">${this.badge ? html`<span class="badge">${this.badge}</span>` : null}<slot></slot></aside>`;
  }
}

customElements.define('agent-gantt-note', AgentGanttNote);
