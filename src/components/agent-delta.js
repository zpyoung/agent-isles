import { LitElement, css, html } from 'lit';

const DIRECTIONS = {
  'lower-better': 'lower is better',
  'higher-better': 'higher is better',
  neutral: 'neutral comparison',
};

const TONES = new Set(['neutral', 'good', 'warning', 'danger']);

function parseNumericValue(value) {
  const normalizedValue = String(value ?? '').trim().replaceAll('−', '-');
  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeDirection(direction) {
  return Object.hasOwn(DIRECTIONS, direction) ? direction : 'neutral';
}

function toneForDelta(numericValue, direction) {
  if (numericValue === 0 || direction === 'neutral') return 'neutral';
  if (direction === 'lower-better') return numericValue < 0 ? 'good' : 'danger';
  if (direction === 'higher-better') return numericValue > 0 ? 'good' : 'danger';
  return 'neutral';
}

export function normalizeDelta(value, direction = 'neutral') {
  const normalizedDirection = normalizeDirection(direction);
  const numericValue = parseNumericValue(value);

  return {
    numericValue,
    tone: toneForDelta(numericValue, normalizedDirection),
    directionLabel: DIRECTIONS[normalizedDirection],
  };
}

function normalizeTone(tone, fallback) {
  return TONES.has(tone) ? tone : fallback;
}

function formatSignedValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  const text = String(value).trim();
  if (text.startsWith('-') || text.startsWith('+') || text.startsWith('−')) return text;
  const numericValue = Number(text);
  return Number.isFinite(numericValue) && numericValue > 0 ? `+${text}` : text;
}

export class AgentDelta extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    unit: { type: String },
    percent: { type: String },
    direction: { type: String },
    tone: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .delta {
      align-items: start;
      background: var(--delta-bg, #f8fafc);
      border: 1px solid var(--delta-border, #cbd5e1);
      border-left: 0.35rem solid var(--delta-accent, #64748b);
      border-radius: 0.9rem;
      color: #0f172a;
      display: grid;
      gap: 0.5rem;
      margin-top: 1rem;
      padding: 0.9rem 1rem;
    }
    .delta.good {
      --delta-bg: #f0fdf4;
      --delta-border: #bbf7d0;
      --delta-accent: #16a34a;
    }
    .delta.warning {
      --delta-bg: #fffbeb;
      --delta-border: #fde68a;
      --delta-accent: #ca8a04;
    }
    .delta.danger {
      --delta-bg: #fef2f2;
      --delta-border: #fecaca;
      --delta-accent: #dc2626;
    }
    .label {
      color: #475569;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .body {
      align-items: baseline;
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem 0.75rem;
    }
    .value {
      color: var(--delta-accent, #334155);
      font-size: clamp(1.35rem, 3vw, 2rem);
      font-weight: 850;
      line-height: 1;
    }
    .unit,
    .percent,
    .direction {
      color: #475569;
      font-weight: 750;
    }
    .summary {
      color: #334155;
    }

    :host([data-bs-theme="dark"]) .delta {
      --delta-bg: #0f172a;
      --delta-border: var(--agent-isles-border, #334155);
      --delta-accent: var(--agent-isles-primary, #38bdf8);
      color: var(--agent-isles-heading, #f8fafc);
    }
    :host([data-bs-theme="dark"]) .positive { --delta-bg: rgba(34, 197, 94, 0.14); --delta-border: rgba(34, 197, 94, 0.45); --delta-accent: #22c55e; }
    :host([data-bs-theme="dark"]) .neutral { --delta-bg: rgba(245, 158, 11, 0.14); --delta-border: rgba(245, 158, 11, 0.5); --delta-accent: #fbbf24; }
    :host([data-bs-theme="dark"]) .negative { --delta-bg: rgba(239, 68, 68, 0.14); --delta-border: rgba(239, 68, 68, 0.5); --delta-accent: #f87171; }
    :host([data-bs-theme="dark"]) .label,
    :host([data-bs-theme="dark"]) .unit,
    :host([data-bs-theme="dark"]) .caption { color: var(--agent-isles-muted, #94a3b8); }
  `;

  hostAccessibleLabel() {
    const delta = normalizeDelta(this.value, this.direction);
    const tone = normalizeTone(this.tone, delta.tone);
    return this.accessibleLabel(delta, tone, formatSignedValue(this.value));
  }

  updated() {
    this.setAttribute('aria-label', this.hostAccessibleLabel());
  }

  accessibleLabel(delta, tone, valueText) {
    const parts = [this.label || 'Delta', valueText];
    if (this.unit) parts.push(this.unit);
    if (this.percent) parts.push(`${formatSignedValue(this.percent)} percent`);
    parts.push(delta.directionLabel);
    if (tone !== 'neutral') parts.push(`Tone: ${tone}`);
    return parts.join(' ');
  }

  render() {
    const delta = normalizeDelta(this.value, this.direction);
    const tone = normalizeTone(this.tone, delta.tone);
    const valueText = formatSignedValue(this.value);
    const percentText = this.percent ? `${formatSignedValue(this.percent)}%` : '';

    return html`
      <section class=${`delta ${tone}`} aria-label=${this.accessibleLabel(delta, tone, valueText)}>
        <div class="label">${this.label || 'Delta'}</div>
        <div class="body">
          <span class="value">${valueText}</span>
          ${this.unit ? html`<span class="unit">${this.unit}</span>` : null}
          ${percentText ? html`<span class="percent">${percentText}</span>` : null}
          <span class="direction">${delta.directionLabel}</span>
        </div>
        <div class="summary"><slot></slot></div>
      </section>

  `;
  }
}

customElements.define('agent-delta', AgentDelta);
