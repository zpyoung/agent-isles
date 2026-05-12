import { LitElement, css, html } from 'lit';

const LEVELS = {
  low: { label: 'Low', color: '#047857', bg: '#ecfdf5', border: '#34d399', icon: '✅' },
  medium: { label: 'Medium', color: '#92400e', bg: '#fffbeb', border: '#f59e0b', icon: '⚠️' },
  high: { label: 'High', color: '#991b1b', bg: '#fef2f2', border: '#f87171', icon: '🔴' },
  critical: { label: 'Critical', color: '#9d174d', bg: '#fdf2f8', border: '#f472b6', icon: '🚨' },
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
