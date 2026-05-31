import { LitElement, css, html } from 'lit';

const LEVELS = {
  low: { label: 'Low', color: 'var(--agent-risk-low-text, #047857)', bg: 'var(--agent-risk-low-bg, #ecfdf5)', border: 'var(--agent-risk-low-border, #34d399)', icon: '✅' },
  medium: { label: 'Medium', color: 'var(--agent-risk-medium-text, #92400e)', bg: 'var(--agent-risk-medium-bg, #fffbeb)', border: 'var(--agent-risk-medium-border, #f59e0b)', icon: '⚠️' },
  high: { label: 'High', color: 'var(--agent-risk-high-text, #991b1b)', bg: 'var(--agent-risk-high-bg, #fef2f2)', border: 'var(--agent-risk-high-border, #f87171)', icon: '🔴' },
  critical: { label: 'Critical', color: 'var(--agent-risk-critical-text, #9d174d)', bg: 'var(--agent-risk-critical-bg, #fdf2f8)', border: 'var(--agent-risk-critical-border, #f472b6)', icon: '🚨' },
};

export class AgentRisk extends LitElement {
  static properties = {
    level: { type: String },
    title: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .risk {
      border: 1px solid var(--risk-border, #cbd5e1);
      border-left: 0.35rem solid var(--risk-border, #cbd5e1);
      border-radius: 0.75rem;
      background: var(--risk-bg, #f8fafc);
      color: var(--risk-color, #334155);
      padding: 1rem;
    }
    .header {
      align-items: center;
      display: flex;
      gap: 0.5rem;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    .title { font-weight: 700; }
    .level { font-size: 0.8rem; font-weight: 700; }

    :host([data-bs-theme="dark"]) {
      --agent-risk-low-bg: rgba(34, 197, 94, 0.16);
      --agent-risk-low-border: rgba(34, 197, 94, 0.55);
      --agent-risk-low-text: #bbf7d0;
      --agent-risk-medium-bg: rgba(245, 158, 11, 0.16);
      --agent-risk-medium-border: rgba(245, 158, 11, 0.55);
      --agent-risk-medium-text: #fde68a;
      --agent-risk-high-bg: rgba(239, 68, 68, 0.16);
      --agent-risk-high-border: rgba(239, 68, 68, 0.55);
      --agent-risk-high-text: #fecaca;
      --agent-risk-critical-bg: rgba(244, 114, 182, 0.16);
      --agent-risk-critical-border: rgba(244, 114, 182, 0.55);
      --agent-risk-critical-text: #fbcfe8;
    }
  `;

  render() {
    const level = LEVELS[this.level || 'medium'] || LEVELS.medium;
    const style = `--risk-bg:${level.bg};--risk-border:${level.border};--risk-color:${level.color};`;

    return html`
      <section class="risk" style=${style}>
        <div class="header">
          <div class="title">${level.icon} ${this.title || 'Risk'}</div>
          <span class="level">${level.label}</span>
        </div>
        <div><slot></slot></div>
      </section>
    `;
  }
}

customElements.define('agent-risk', AgentRisk);
