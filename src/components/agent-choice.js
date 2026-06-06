import { LitElement, css, html } from 'lit';

export class AgentChoice extends LitElement {
  static properties = {
    title: { type: String },
    selected: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host { display: block; }
    .choice {
      border: 2px solid #d1d1d6; border-radius: 12px;
      padding: 0.85rem 1rem; cursor: pointer; transition: all 0.15s ease;
      display: flex; gap: 0.85rem; align-items: flex-start;
    }
    .choice:hover { border-color: #0071e3; }
    :host([selected]) .choice { background: #e8f4fd; border-color: #0071e3; }
    .key {
      background: #e5e5e7; color: #555; min-width: 1.6rem; height: 1.6rem;
      border-radius: 6px; display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.8rem;
    }
    :host([selected]) .key { background: #0071e3; color: #fff; }
    .title { font-weight: 600; }
    .desc { color: #666; font-size: 0.9rem; }
    @media (prefers-color-scheme: dark) {
      .choice { border-color: #424245; background: #2d2d2f; color: #f5f5f7; }
      .key { background: #3a3a3c; color: #e5e5e7; }
      .desc { color: #aaa; }
      :host([selected]) .choice { background: #0f3554; border-color: #66b7ff; }
      :host([selected]) .key { background: #66b7ff; color: #001526; }
    }
  `;

  constructor() {
    super();
    this.selected = false;
  }

  get choiceId() {
    const raw = (this.id || '').replace(/^user-content-/, '');
    return raw === '' ? null : raw;
  }

  _onClick() {
    this.dispatchEvent(new CustomEvent('agent-isles:choice-click', {
      detail: { choice: this.choiceId, text: (this.title || this.textContent || '').trim() },
      bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <div class="choice" @click=${this._onClick}>
        <div class="key">${(this.choiceId || '?').toUpperCase()}</div>
        <div>
          <div class="title">${this.title || ''}</div>
          <div class="desc"><slot></slot></div>
        </div>
      </div>
    `;
  }
}

customElements.define('agent-choice', AgentChoice);
