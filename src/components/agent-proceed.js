import { LitElement, css, html } from 'lit';

/**
 * <agent-proceed> — a commit/advance button for live brainstorming screens.
 *
 * Selecting options (via <agent-option-set>/<agent-choice>) is exploratory and
 * emits `agent-isles:select`. This button is the deliberate "go" signal: it
 * tracks the latest selection and, on click, dispatches a composed
 * `agent-isles:proceed` event carrying `{ type:'proceed', selected, text }`.
 * In `isles live`, the live client forwards that to the server, which appends a
 * `{"type":"proceed",...}` record to <dir>/state/events — the signal a host
 * (e.g. the Quirk bridge `wait` command) blocks on to advance without a
 * terminal round-trip.
 *
 * Disabled until at least one option is selected, unless `allow-empty` is set
 * (for standalone "continue" screens with no options).
 */
export class AgentProceed extends LitElement {
  static properties = {
    label: { type: String },
    allowEmpty: { type: Boolean, attribute: 'allow-empty' },
    _selected: { state: true },
  };

  static styles = css`
    :host { display: block; margin: 1rem 0; }
    .wrap { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    button {
      appearance: none; border: 0; cursor: pointer;
      font: 600 0.95rem system-ui, sans-serif;
      padding: 0.6rem 1.4rem; border-radius: 10px;
      background: #0071e3; color: #fff;
      transition: all 0.15s ease;
    }
    button:hover:not(:disabled) { background: #0063c6; }
    button:focus-visible { outline: 2px solid #0071e3; outline-offset: 2px; }
    button:disabled { background: #d1d1d6; color: #8a8a8e; cursor: not-allowed; }
    .hint { font: 0.82rem system-ui, sans-serif; color: #8a8a8e; }
    @media (prefers-color-scheme: dark) {
      button { background: #0a84ff; }
      button:hover:not(:disabled) { background: #409cff; }
      button:disabled { background: #3a3a3c; color: #6a6a6e; }
    }
  `;

  constructor() {
    super();
    this.label = 'Proceed →';
    this.allowEmpty = false;
    this._selected = [];
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
    if (!this._ready) return;
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
    return html`
      <div class="wrap">
        <button
          type="button"
          ?disabled=${!this._ready}
          aria-disabled=${this._ready ? 'false' : 'true'}
          @click=${this._onClick}
        >${this.label || 'Proceed →'}</button>
        ${this._ready ? '' : html`<span class="hint">Select an option to continue</span>`}
      </div>
    `;
  }
}

customElements.define('agent-proceed', AgentProceed);
