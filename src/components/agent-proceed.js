import { LitElement, css, html } from 'lit';

/**
 * <agent-proceed> — a commit/advance button for live brainstorming screens.
 *
 * Selecting options (via <agent-option-set>/<agent-choice>) is exploratory and
 * emits `agent-isles:select`. This button is the deliberate "go" signal: it
 * tracks the latest selection and, on click, dispatches a composed
 * `agent-isles:proceed` event carrying `{ type:'proceed', selected, text }`.
 *
 * On click it flips to a visible **processing** state (spinner + "Proceeding…",
 * disabled) so the user sees the click registered while the agent works; the
 * page is typically replaced by the next screen moments later. Disabled until a
 * choice is selected unless `allow-empty` is set.
 */
export class AgentProceed extends LitElement {
  static properties = {
    label: { type: String },
    allowEmpty: { type: Boolean, attribute: 'allow-empty' },
    _selected: { state: true },
    _sent: { state: true },
  };

  static styles = css`
    :host { display: block; margin: 1rem 0; }
    .wrap { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    button {
      appearance: none; border: 0; cursor: pointer;
      font: 600 0.95rem system-ui, sans-serif;
      padding: 0.6rem 1.4rem; border-radius: 10px;
      background: #0071e3; color: #fff;
      display: inline-flex; align-items: center; gap: 0.5rem;
      transition: all 0.15s ease;
    }
    button:hover:not(:disabled) { background: #0063c6; }
    button:focus-visible { outline: 2px solid #0071e3; outline-offset: 2px; }
    button:disabled { background: #d1d1d6; color: #8a8a8e; cursor: not-allowed; }
    /* Processing state wins over the plain disabled grey. */
    button.is-sent, button.is-sent:disabled {
      background: #34c759; color: #fff; cursor: default; opacity: 1;
    }
    .spinner {
      width: 0.85em; height: 0.85em; border-radius: 50%;
      border: 2px solid currentColor; border-right-color: transparent;
      animation: agent-proceed-spin 0.6s linear infinite;
    }
    @keyframes agent-proceed-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .spinner { animation-duration: 1.6s; }
    }
    .hint { font: 0.82rem system-ui, sans-serif; color: #8a8a8e; }
    @media (prefers-color-scheme: dark) {
      button { background: #0a84ff; }
      button:hover:not(:disabled) { background: #409cff; }
      button:disabled { background: #3a3a3c; color: #6a6a6e; }
      button.is-sent, button.is-sent:disabled { background: #30d158; color: #06210f; }
    }
  `;

  constructor() {
    super();
    this.label = 'Proceed →';
    this.allowEmpty = false;
    this._selected = [];
    this._sent = false;
    this._onSelect = this._onSelect.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    // Selection state lives in sibling option-sets; track it via the composed,
    // document-level select event rather than reaching into their DOM.
    document.addEventListener('agent-isles:select', this._onSelect);
  }

  disconnectedCallback() {
    document.removeEventListener('agent-isles:select', this._onSelect);
    super.disconnectedCallback();
  }

  _onSelect(event) {
    const sel = event.detail && event.detail.selected;
    this._selected = Array.isArray(sel) ? sel.slice() : [];
  }

  get _ready() {
    return this.allowEmpty || this._selected.length > 0;
  }

  _onClick() {
    if (!this._ready || this._sent) return;  // guard against double-clicks
    this._sent = true;                       // reflect the click immediately
    this.dispatchEvent(new CustomEvent('agent-isles:proceed', {
      detail: {
        type: 'proceed',
        selected: this._selected.slice(),
        text: (this.label || 'Proceed').trim(),
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const disabled = !this._ready || this._sent;
    return html`
      <div class="wrap">
        <button
          type="button"
          class=${this._sent ? 'is-sent' : ''}
          ?disabled=${disabled}
          aria-disabled=${disabled ? 'true' : 'false'}
          aria-busy=${this._sent ? 'true' : 'false'}
          @click=${this._onClick}
        >
          ${this._sent ? html`<span class="spinner" aria-hidden="true"></span>Proceeding…` : (this.label || 'Proceed →')}
        </button>
        ${this._ready || this._sent ? '' : html`<span class="hint">Select an option to continue</span>`}
      </div>
    `;
  }
}

customElements.define('agent-proceed', AgentProceed);
