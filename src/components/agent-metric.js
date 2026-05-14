import { LitElement, css, html } from 'lit';

const TREND_STYLES = {
  up: { label: 'Up', icon: '↗', tone: 'positive' },
  down: { label: 'Down', icon: '↘', tone: 'negative' },
  flat: { label: 'Flat', icon: '→', tone: 'neutral' },
};

export class AgentMetric extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    unit: { type: String },
    trend: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .metric {
      border: 1px solid #dbeafe;
      border-radius: 0.9rem;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      padding: 1rem;
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
      color: #0f172a;
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
    .positive { background: #dcfce7; color: #166534; }
    .negative { background: #fee2e2; color: #991b1b; }
    .neutral { background: #e2e8f0; color: #334155; }
  `;

  render() {
    const trend = TREND_STYLES[this.trend || 'flat'] || TREND_STYLES.flat;

    return html`
      <section class="metric" aria-label=${this.label || 'Metric'}>
        <div class="label">${this.label || 'Metric'}</div>
        <div class="value-row">
          <span class="value">${this.value || '—'}</span>
          ${this.unit ? html`<span class="unit">${this.unit}</span>` : null}
        </div>
        <div class="trend ${trend.tone}" title=${`Trend: ${trend.label}`}>
          <span aria-hidden="true">${trend.icon}</span>
          <span>${trend.label}</span>
        </div>
      </section>
    `;
  }
}

customElements.define('agent-metric', AgentMetric);
