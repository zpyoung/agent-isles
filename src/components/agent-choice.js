import { LitElement, css, html } from 'lit';

export class AgentChoice extends LitElement {
  static properties = {
    title: { type: String },
    selected: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host { display: block; }
    .choice {
      position: relative;
      border: 2px solid #d1d1d6; border-radius: 12px;
      padding: 0.85rem 1rem; cursor: pointer; transition: all 0.15s ease;
      display: flex; gap: 0.85rem; align-items: flex-start;
    }
    .choice:hover { border-color: #0071e3; }
    .choice:focus-visible {
      outline: 2px solid #0071e3; outline-offset: 2px;
    }
    :host([selected]) .choice {
      background: #e8f4fd; border-color: #0071e3;
      box-shadow: 0 0 0 1px #0071e3 inset;
    }
    .key {
      flex: 0 0 auto; align-self: flex-start; box-sizing: border-box;
      background: #e5e5e7; color: #555;
      min-width: 1.6rem; max-width: 11rem; min-height: 1.6rem;
      padding: 0.2rem 0.5rem; border-radius: 6px;
      display: inline-flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.72rem; letter-spacing: 0.04em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    :host([selected]) .key { background: #0071e3; color: #fff; }
    .body { flex: 1 1 auto; min-width: 0; }
    .title { font-weight: 600; }
    .desc { color: #666; font-size: 0.9rem; }
    .indicator {
      flex: 0 0 auto; align-self: center; margin-left: auto;
      width: 1.4rem; height: 1.4rem; border-radius: 50%;
      border: 2px solid #c7c7cc; background: transparent;
      display: flex; align-items: center; justify-content: center;
      color: transparent; transition: all 0.15s ease;
    }
    .indicator svg { width: 0.85rem; height: 0.85rem; display: block; }
    :host([selected]) .indicator {
      background: #0071e3; border-color: #0071e3; color: #fff;
    }
    @media (prefers-color-scheme: dark) {
      .choice { border-color: #424245; background: #2d2d2f; color: #f5f5f7; }
      .key { background: #3a3a3c; color: #e5e5e7; }
      .desc { color: #aaa; }
      .indicator { border-color: #5a5a5e; }
      :host([selected]) .choice {
        background: #0f3554; border-color: #66b7ff;
        box-shadow: 0 0 0 1px #66b7ff inset;
      }
      :host([selected]) .key { background: #66b7ff; color: #001526; }
      :host([selected]) .indicator {
        background: #66b7ff; border-color: #66b7ff; color: #001526;
      }
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

  _eventStartedFromInteractiveDescendant(event) {
    if (!event) return false;
    for (const node of event.composedPath()) {
      if (node === event.currentTarget) return false;
      if (typeof node.matches === 'function'
        && node.matches('a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])')) {
        return true;
      }
    }
    return false;
  }

  _onClick(event) {
    if (this._eventStartedFromInteractiveDescendant(event)) return;
    this.dispatchEvent(new CustomEvent('agent-isles:choice-click', {
      detail: { choice: this.choiceId, text: (this.title || this.textContent || '').trim() },
      bubbles: true, composed: true,
    }));
  }

  _onKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    // Only activate from the card itself — not from focusable slotted content
    // (e.g. a link in the description) whose key events bubble up to this handler.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this._onClick();
  }

  render() {
    const key = (this.choiceId || '?').toUpperCase();
    return html`
      <div
        class="choice"
        role="button"
        tabindex="0"
        aria-pressed=${this.selected ? 'true' : 'false'}
        @click=${this._onClick}
        @keydown=${this._onKeydown}
      >
        <div class="key" title=${key}>${key}</div>
        <div class="body">
          <div class="title">${this.title || ''}</div>
          <div class="desc"><slot></slot></div>
        </div>
        <div class="indicator" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
      </div>
    `;
  }
}

customElements.define('agent-choice', AgentChoice);
