import { LitElement, css, html } from 'lit';

function findChoiceFromEvent(event) {
  return event.composedPath().find((node) => node?.localName === 'agent-choice') ?? null;
}

function choiceText(choice) {
  return choice.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function choiceValue(choice) {
  return choice.getAttribute('data-choice') || choice.id || choice.getAttribute('title') || choiceText(choice);
}

export class AgentChoice extends LitElement {
  static properties = {
    title: { type: String },
    selected: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    button {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid var(--agent-isles-border, #dbeafe);
      border-radius: 0.85rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      color: var(--agent-isles-text, #1e293b);
      cursor: pointer;
      display: grid;
      gap: 0.25rem;
      font: inherit;
      padding: 0.8rem 0.9rem;
      text-align: left;
      transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
      width: 100%;
    }

    button:hover {
      border-color: var(--agent-isles-primary, #2563eb);
      box-shadow: 0 3px 10px rgba(37, 99, 235, 0.16);
      transform: translateY(-1px);
    }

    button:focus-visible {
      outline: 3px solid var(--agent-isles-focus, #93c5fd);
      outline-offset: 2px;
    }

    button.selected {
      background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
      border-color: var(--agent-isles-primary, #2563eb);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
    }

    .title {
      align-items: center;
      color: var(--agent-isles-heading, #0f172a);
      display: flex;
      font-weight: 850;
      gap: 0.45rem;
    }

    .mark {
      align-items: center;
      background: #ffffff;
      border: 1px solid var(--agent-isles-border, #bfdbfe);
      border-radius: 999px;
      color: transparent;
      display: inline-flex;
      font-size: 0.75rem;
      height: 1.15rem;
      justify-content: center;
      line-height: 1;
      width: 1.15rem;
    }

    button.selected .mark {
      background: var(--agent-isles-primary, #2563eb);
      border-color: var(--agent-isles-primary, #2563eb);
      color: #ffffff;
    }

    .body {
      color: var(--agent-isles-muted, #475569);
    }

    :host([data-bs-theme="dark"]) button {
      background: var(--agent-isles-surface, #0f172a);
      border-color: var(--agent-isles-border, #334155);
      color: var(--agent-isles-text, #cbd5e1);
      box-shadow: 0 1px 2px rgba(2, 6, 23, 0.45);
    }

    :host([data-bs-theme="dark"]) button.selected {
      background: rgba(14, 165, 233, 0.16);
      border-color: var(--agent-isles-primary, #38bdf8);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.18);
    }

    :host([data-bs-theme="dark"]) .title {
      color: var(--agent-isles-heading, #f8fafc);
    }

    :host([data-bs-theme="dark"]) .body {
      color: var(--agent-isles-muted, #94a3b8);
    }

    :host([data-bs-theme="dark"]) .mark {
      background: var(--agent-isles-surface-muted, #1e293b);
      border-color: var(--agent-isles-border, #334155);
    }

    :host([data-bs-theme="dark"]) button.selected .mark {
      background: var(--agent-isles-primary, #38bdf8);
      border-color: var(--agent-isles-primary, #38bdf8);
      color: #020617;
    }
  `;

  constructor() {
    super();
    this.title = '';
    this.selected = false;
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.syncSelectionAttributes();
    this.syncChoiceAttribute();
  }

  updated(changedProperties) {
    if (changedProperties.has('selected')) {
      this.syncSelectionAttributes();
    }
    this.syncChoiceAttribute();
  }

  render() {
    const title = this.title || choiceText(this) || 'Choice';

    return html`
      <button
        type="button"
        class=${this.selected ? 'selected' : ''}
        aria-pressed=${this.selected ? 'true' : 'false'}
        @click=${this.handleClick}
      >
        <span class="title"><span class="mark" aria-hidden="true">✓</span>${title}</span>
        <span class="body"><slot></slot></span>
      </button>
    `;
  }

  handleClick() {
    this.dispatchEvent(new CustomEvent('agent-choice-toggle', {
      bubbles: true,
      composed: true,
      detail: {
        choice: choiceValue(this),
        text: choiceText(this),
        selected: this.selected,
      },
    }));
  }

  syncSelectionAttributes() {
    this.dataset.selected = this.selected ? 'true' : 'false';
  }

  syncChoiceAttribute() {
    if (!this.hasAttribute('data-choice')) {
      const id = this.getAttribute('id');
      if (id) this.setAttribute('data-choice', id);
    }
  }
}

customElements.define('agent-choice', AgentChoice);

export class AgentOptionSet extends LitElement {
  static properties = {
    title: { type: String },
    multiselect: { type: Boolean, attribute: 'data-multiselect' },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1.25rem 0;
    }

    .surface {
      background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
      border: 1px solid #bfdbfe;
      border-radius: 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      display: grid;
      gap: 0.85rem;
      padding: 1rem;
    }

    .header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
      justify-content: space-between;
      align-items: baseline;
    }

    .title {
      color: var(--agent-isles-heading, #0f172a);
      font-size: 1.02rem;
      font-weight: 900;
      margin: 0;
    }

    .mode {
      color: var(--agent-isles-muted, #475569);
      font-size: 0.8rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .choices {
      display: grid;
      gap: 0.7rem;
    }

    :host([data-bs-theme="dark"]) .surface {
      background: var(--agent-isles-surface, #0f172a);
      border-color: var(--agent-isles-border, #334155);
      box-shadow: 0 1px 2px rgba(2, 6, 23, 0.45);
      color: var(--agent-isles-text, #cbd5e1);
    }

    :host([data-bs-theme="dark"]) .title {
      color: var(--agent-isles-heading, #f8fafc);
    }

    :host([data-bs-theme="dark"]) .mode {
      color: var(--agent-isles-muted, #94a3b8);
    }
  `;

  constructor() {
    super();
    this.title = '';
    this.multiselect = false;
    this.handleChoiceToggle = this.handleChoiceToggle.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('agent-choice-toggle', this.handleChoiceToggle);
  }

  disconnectedCallback() {
    this.removeEventListener('agent-choice-toggle', this.handleChoiceToggle);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <section class="surface" aria-label=${this.title || 'Option set'}>
        <header class="header">
          ${this.title ? html`<h2 class="title">${this.title}</h2>` : null}
          <span class="mode">${this.multiselect ? 'Multi-select' : 'Single-select'}</span>
        </header>
        <div class="choices">
          <slot></slot>
        </div>
      </section>
    `;
  }

  handleChoiceToggle(event) {
    const choice = findChoiceFromEvent(event);
    if (!choice) return;

    const nextSelected = !choice.selected;
    if (!this.multiselect && nextSelected) {
      for (const sibling of this.querySelectorAll('agent-choice[selected]')) {
        if (sibling !== choice) sibling.selected = false;
      }
    }

    choice.selected = nextSelected;
    this.dispatchEvent(new CustomEvent('agent-option-set-change', {
      bubbles: true,
      composed: true,
      detail: {
        multiselect: this.multiselect,
        choice: choiceValue(choice),
        text: choiceText(choice),
        selected: choice.selected,
        selectedChoices: this.selectedChoices(),
      },
    }));
  }

  selectedChoices() {
    return [...this.querySelectorAll('agent-choice[selected]')].map((choice) => ({
      choice: choiceValue(choice),
      text: choiceText(choice),
    }));
  }
}

customElements.define('agent-option-set', AgentOptionSet);
