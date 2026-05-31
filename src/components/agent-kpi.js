import { LitElement, css, html } from 'lit';

const TONES = new Set(['primary', 'success', 'warning', 'danger', 'neutral']);

function normalizeTone(tone) {
  return TONES.has(tone) ? tone : 'neutral';
}

export class AgentKpi extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    unit: { type: String },
    delta: { type: String },
    tone: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .kpi {
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid var(--tone-border, #dbeafe);
      border-radius: 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      height: 100%;
      padding: 1rem;
    }
    .label {
      color: #475569;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .value-row {
      align-items: baseline;
      display: flex;
      gap: 0.35rem;
      margin-top: 0.35rem;
    }
    .value {
      color: #0f172a;
      font-size: clamp(1.7rem, 3vw, 2.35rem);
      font-weight: 850;
      line-height: 1;
    }
    .unit {
      color: #64748b;
      font-size: 0.95rem;
      font-weight: 750;
    }
    .delta {
      background: var(--tone-bg, #e2e8f0);
      border-radius: 999px;
      color: var(--tone-text, #334155);
      display: inline-flex;
      font-size: 0.78rem;
      font-weight: 800;
      margin-top: 0.75rem;
      padding: 0.22rem 0.6rem;
    }
    .detail {
      color: #475569;
      font-size: 0.9rem;
      margin-top: 0.65rem;
    }
    .primary { --tone-bg: #dbeafe; --tone-border: #bfdbfe; --tone-text: #1d4ed8; }
    .success { --tone-bg: #dcfce7; --tone-border: #bbf7d0; --tone-text: #166534; }
    .warning { --tone-bg: #fef3c7; --tone-border: #fde68a; --tone-text: #92400e; }
    .danger { --tone-bg: #fee2e2; --tone-border: #fecaca; --tone-text: #991b1b; }
    .neutral { --tone-bg: #e2e8f0; --tone-border: #cbd5e1; --tone-text: #334155; }

    :host([data-bs-theme="dark"]) .kpi {
      background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
      border-color: var(--tone-border, #334155);
      box-shadow: 0 1px 2px rgba(2, 6, 23, 0.45);
      color: var(--agent-isles-text, #cbd5e1);
    }
    :host([data-bs-theme="dark"]) .label,
    :host([data-bs-theme="dark"]) .meta,
    :host([data-bs-theme="dark"]) .delta {
      color: var(--agent-isles-muted, #94a3b8);
    }
    :host([data-bs-theme="dark"]) .value {
      color: var(--agent-isles-heading, #f8fafc);
    }
    :host([data-bs-theme="dark"]) .primary { --tone-bg: rgba(56, 189, 248, 0.16); --tone-border: rgba(56, 189, 248, 0.45); --tone-text: #bae6fd; }
    :host([data-bs-theme="dark"]) .success { --tone-bg: rgba(34, 197, 94, 0.16); --tone-border: rgba(34, 197, 94, 0.45); --tone-text: #bbf7d0; }
    :host([data-bs-theme="dark"]) .warning { --tone-bg: rgba(245, 158, 11, 0.16); --tone-border: rgba(245, 158, 11, 0.5); --tone-text: #fde68a; }
    :host([data-bs-theme="dark"]) .danger { --tone-bg: rgba(239, 68, 68, 0.16); --tone-border: rgba(239, 68, 68, 0.5); --tone-text: #fecaca; }
    :host([data-bs-theme="dark"]) .neutral { --tone-bg: rgba(148, 163, 184, 0.16); --tone-border: rgba(148, 163, 184, 0.42); --tone-text: #cbd5e1; }
  `;

  updated() {
    const pieces = [this.label || 'KPI', this.value, this.unit, this.delta].filter(Boolean);
    this.setAttribute('aria-label', pieces.join(' '));
  }

  render() {
    const tone = normalizeTone(this.tone);

    return html`
      <article class=${`kpi ${tone}`}>
        <div class="label">${this.label || 'KPI'}</div>
        <div class="value-row">
          <span class="value">${this.value || '—'}</span>
          ${this.unit ? html`<span class="unit">${this.unit}</span>` : null}
        </div>
        ${this.delta ? html`<div class="delta">${this.delta}</div>` : null}
        <div class="detail"><slot></slot></div>
      </article>

  `;
  }
}

customElements.define('agent-kpi', AgentKpi);
