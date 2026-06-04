import { LitElement, html } from 'lit';

export class AgentOptionSet extends LitElement {
  static properties = {
    multiselect: { type: Boolean },
  };

  constructor() {
    super();
    this.multiselect = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.hasAttribute('data-multiselect')) this.multiselect = true;
    this.addEventListener('agent-isles:choice-click', this._onChoiceClick);
  }

  disconnectedCallback() {
    this.removeEventListener('agent-isles:choice-click', this._onChoiceClick);
    super.disconnectedCallback();
  }

  _choices() {
    return Array.from(this.querySelectorAll('agent-choice'));
  }

  _onChoiceClick = (event) => {
    const target = event.target.closest('agent-choice');
    if (!target) return;
    if (this.multiselect) {
      target.selected = !target.selected;
    } else {
      for (const choice of this._choices()) choice.selected = choice === target;
    }
    const selected = this._choices().filter((c) => c.selected);
    this.dispatchEvent(new CustomEvent('agent-isles:select', {
      detail: {
        choice: event.detail.choice,
        text: event.detail.text,
        selected: selected.map((c) => c.id),
        multiselect: this.multiselect,
      },
      bubbles: true, composed: true,
    }));
  };

  render() {
    return html`<slot></slot>`;
  }
}

customElements.define('agent-option-set', AgentOptionSet);
