import { LitElement, css, html } from 'lit';

const DIRECTIONS = new Set(['lower-better', 'higher-better', 'neutral']);

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function calculateComparisonWidths(baselineValue, revisedValue, direction = 'neutral') {
  const baseline = parseNumber(baselineValue);
  const revised = parseNumber(revisedValue);
  const max = Math.max(baseline, revised, 1);
  const baselineWidth = Math.max(4, Math.round((baseline / max) * 100));
  const revisedWidth = Math.max(4, Math.round((revised / max) * 100));
  const normalizedDirection = DIRECTIONS.has(direction) ? direction : 'neutral';
  let preferred = 'neutral';

  if (normalizedDirection === 'lower-better' && baseline !== revised) {
    preferred = revised < baseline ? 'revised' : 'baseline';
  } else if (normalizedDirection === 'higher-better' && baseline !== revised) {
    preferred = revised > baseline ? 'revised' : 'baseline';
  }

  return { baselineWidth, revisedWidth, preferred };
}

export class AgentComparisonBar extends LitElement {
  static properties = {
    label: { type: String },
    baselineLabel: { type: String, attribute: 'baseline-label' },
    baselineValue: { type: String, attribute: 'baseline-value' },
    revisedLabel: { type: String, attribute: 'revised-label' },
    revisedValue: { type: String, attribute: 'revised-value' },
    unit: { type: String },
    summary: { type: String },
    direction: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .comparison {
      background: #ffffff;
      border: 1px solid #dbeafe;
      border-radius: 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      padding: 1rem;
    }
    .header {
      align-items: baseline;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      justify-content: space-between;
      margin-bottom: 0.9rem;
    }
    .label {
      color: #0f172a;
      font-size: 1rem;
      font-weight: 800;
    }
    .summary {
      color: #1d4ed8;
      font-size: 0.9rem;
      font-weight: 800;
    }
    .row {
      display: grid;
      gap: 0.45rem;
      margin-top: 0.75rem;
    }
    .meta {
      align-items: baseline;
      display: flex;
      gap: 0.5rem;
      justify-content: space-between;
    }
    .row-label { color: #334155; font-weight: 750; }
    .value { color: #0f172a; font-weight: 850; }
    .track {
      background: #e2e8f0;
      border-radius: 999px;
      height: 0.9rem;
      overflow: hidden;
    }
    .bar {
      background: #94a3b8;
      border-radius: inherit;
      height: 100%;
      min-width: 4%;
      width: var(--bar-width);
    }
    .bar.revised { background: #2563eb; }
    .bar.preferred { background: #16a34a; }
    .sr-only {
      clip: rect(0, 0, 0, 0);
      border: 0;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      padding: 0;
      position: absolute;
      white-space: nowrap;
      width: 1px;
    }
  `;

  updated() {
    this.setAttribute('aria-label', this.accessibleSummary());
  }

  accessibleSummary() {
    const label = this.label || 'Comparison';
    const baseline = `${this.baselineLabel || 'Baseline'} ${this.baselineValue || '—'}${this.unit ? ` ${this.unit}` : ''}`;
    const revised = `${this.revisedLabel || 'Revised'} ${this.revisedValue || '—'}${this.unit ? ` ${this.unit}` : ''}`;
    return [label, baseline, revised, this.summary].filter(Boolean).join('. ');
  }

  render() {
    const widths = calculateComparisonWidths(this.baselineValue, this.revisedValue, this.direction);
    const baselinePreferred = widths.preferred === 'baseline' ? ' preferred' : '';
    const revisedPreferred = widths.preferred === 'revised' ? ' preferred' : '';

    return html`
      <section class="comparison" role="group" aria-label=${this.accessibleSummary()}>
        <div class="header">
          <div class="label">${this.label || 'Comparison'}</div>
          ${this.summary ? html`<div class="summary">${this.summary}</div>` : null}
        </div>
        ${this.renderRow(this.baselineLabel || 'Baseline', this.baselineValue, widths.baselineWidth, `bar${baselinePreferred}`, 'baseline-bar')}
        ${this.renderRow(this.revisedLabel || 'Revised', this.revisedValue, widths.revisedWidth, `bar revised${revisedPreferred}`, 'revised-bar')}
        <p class="sr-only">${this.accessibleSummary()}</p>
      </section>
    `;
  }

  renderRow(label, value, width, className, testId) {
    return html`
      <div class="row">
        <div class="meta">
          <span class="row-label">${label}</span>
          <span class="value">${value || '—'}${this.unit ? html` ${this.unit}` : null}</span>
        </div>
        <div class="track" aria-hidden="true">
          <div class=${className} data-testid=${testId} style=${`--bar-width: ${width}%;`}></div>
        </div>
      </div>
    `;
  }
}

customElements.define('agent-comparison-bar', AgentComparisonBar);
