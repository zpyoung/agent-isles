import { LitElement, css, html } from 'lit';

const VERDICT_STYLES = {
  go: { label: 'Go', tone: 'success', icon: '✅' },
  approved: { label: 'Approved', tone: 'success', icon: '✅' },
  rejected: { label: 'Rejected', tone: 'danger', icon: '⛔' },
  deferred: { label: 'Deferred', tone: 'secondary', icon: '⏸️' },
  'needs-review': { label: 'Needs review', tone: 'warning', icon: '🔎' },
  'ship-with-guardrails': { label: 'Ship with guardrails', tone: 'primary', icon: '🛡️' },
};

export class AgentDecision extends LitElement {
  static properties = {
    verdict: { type: String },
    title: { type: String },
  };

  static styles = css`
    :host { display: block; }
    .decision {
      border: 1px solid #bfdbfe;
      border-left: 0.35rem solid #2563eb;
      border-radius: 0.75rem;
      background: #eff6ff;
      padding: 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
    .header {
      align-items: center;
      display: flex;
      gap: 0.5rem;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    .title {
      color: #0f172a;
      font-weight: 700;
    }
    .badge {
      border-radius: 999px;
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.55rem;
      white-space: nowrap;
    }
    .success { background: #16a34a; }
    .danger { background: #dc2626; }
    .secondary { background: #64748b; }
    .warning { background: #ca8a04; }
    .primary { background: #2563eb; }
    .content { color: #334155; }
  `;

  render() {
    const verdict = this.verdict || 'needs-review';
    const style = VERDICT_STYLES[verdict] || { label: verdict, tone: 'primary', icon: '💠' };

    return html`
      <section class="decision">
        <div class="header">
          <div class="title">${style.icon} ${this.title || 'Decision'}</div>
          <span class="badge ${style.tone}">${style.label}</span>
        </div>
        <div class="content"><slot></slot></div>
      </section>
    `;
  }
}

customElements.define('agent-decision', AgentDecision);
