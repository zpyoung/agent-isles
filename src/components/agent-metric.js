import { LitElement, css, html } from 'lit';

const TREND_STYLES = {
  up: { label: 'Up', icon: '↗', tone: 'positive' },
  down: { label: 'Down', icon: '↘', tone: 'negative' },
  flat: { label: 'Flat', icon: '→', tone: 'neutral' },
};

const METRIC_TONES = new Set(['neutral', 'good', 'warning', 'danger']);

function normalizeTone(tone) {
  return METRIC_TONES.has(tone) ? tone : 'neutral';
}

export class AgentMetric extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    unit: { type: String },
    trend: { type: String },
    tone: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .metric {
      border: 1px solid var(--metric-border, #dbeafe);
      border-radius: 0.9rem;
      background: var(--metric-bg, linear-gradient(180deg, #ffffff 0%, #f8fafc 100%));
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      color: var(--metric-color, #0f172a);
      padding: 1rem;
    }
    .metric.tone-good {
      --metric-bg: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
      --metric-border: #86efac;
      --metric-color: #14532d;
    }
    .metric.tone-warning {
      --metric-bg: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%);
      --metric-border: #facc15;
      --metric-color: #713f12;
    }
    .metric.tone-danger {
      --metric-bg: linear-gradient(180deg, #fef2f2 0%, #ffffff 100%);
      --metric-border: #fca5a5;
      --metric-color: #7f1d1d;
    }
    .label {
      color: #475569;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .value-row {
      align-items: baseline;
      display: flex;
      gap: 0.35rem;
      margin-top: 0.25rem;
    }
    .value {
      color: var(--metric-color, #0f172a);
      font-size: clamp(1.8rem, 4vw, 2.5rem);
      font-weight: 800;
      line-height: 1;
    }
    .unit {
      color: #64748b;
      font-size: 1rem;
      font-weight: 700;
    }
    .trend {
      align-items: center;
      border-radius: 999px;
      display: inline-flex;
      font-size: 0.78rem;
      font-weight: 800;
      gap: 0.25rem;
      margin-top: 0.8rem;
      padding: 0.22rem 0.55rem;
    }
    .trend.positive { background: #dcfce7; color: #166534; }
    .trend.negative { background: #fee2e2; color: #991b1b; }
    .trend.neutral { background: #e2e8f0; color: #334155; }
    .note {
      color: #475569;
      margin-top: 0.65rem;
    }

    :host([data-bs-theme="dark"]) .metric {
      --metric-bg: linear-gradient(180deg, #0f172a 0%, #111827 100%);
      --metric-border: var(--agent-isles-border, #334155);
      --metric-color: var(--agent-isles-heading, #f8fafc);
      box-shadow: 0 1px 2px rgba(2, 6, 23, 0.45);
    }
    :host([data-bs-theme="dark"]) .metric.success { --metric-bg: linear-gradient(180deg, rgba(34, 197, 94, 0.16), #0f172a); --metric-border: rgba(34, 197, 94, 0.45); --metric-color: #bbf7d0; }
    :host([data-bs-theme="dark"]) .metric.warning { --metric-bg: linear-gradient(180deg, rgba(245, 158, 11, 0.16), #0f172a); --metric-border: rgba(245, 158, 11, 0.5); --metric-color: #fde68a; }
    :host([data-bs-theme="dark"]) .metric.danger { --metric-bg: linear-gradient(180deg, rgba(239, 68, 68, 0.16), #0f172a); --metric-border: rgba(239, 68, 68, 0.5); --metric-color: #fecaca; }
    :host([data-bs-theme="dark"]) .label,
    :host([data-bs-theme="dark"]) .unit,
    :host([data-bs-theme="dark"]) .caption { color: var(--agent-isles-muted, #94a3b8); }
    :host([data-bs-theme="dark"]) .trend.positive { background: rgba(34, 197, 94, 0.18); color: #bbf7d0; }
    :host([data-bs-theme="dark"]) .trend.negative { background: rgba(239, 68, 68, 0.18); color: #fecaca; }
    :host([data-bs-theme="dark"]) .trend.neutral { background: rgba(148, 163, 184, 0.18); color: #cbd5e1; }
  `;

  accessibleLabel(trend) {
    const parts = [this.label || 'Metric', this.value || '—'];
    if (this.unit) parts.push(this.unit);
    if (this.trend) parts.push(`Trend: ${trend.label}`);
    const tone = normalizeTone(this.tone);
    if (tone !== 'neutral') parts.push(`Tone: ${tone}`);
    return parts.join(' ');
  }

  render() {
    const trend = TREND_STYLES[this.trend || 'flat'] || TREND_STYLES.flat;
    const tone = normalizeTone(this.tone);

    return html`
      <section class=${`metric tone-${tone}`} aria-label=${this.accessibleLabel(trend)}>
        <div class="label">${this.label || 'Metric'}</div>
        <div class="value-row">
          <span class="value">${this.value || '—'}</span>
          ${this.unit ? html`<span class="unit">${this.unit}</span>` : null}
        </div>
        ${this.trend ? html`
          <div class="trend ${trend.tone}" title=${`Trend: ${trend.label}`}>
            <span aria-hidden="true">${trend.icon}</span>
            <span>${trend.label}</span>
          </div>
        ` : null}
        <div class="note"><slot></slot></div>
      </section>

  `;
  }
}

customElements.define('agent-metric', AgentMetric);
