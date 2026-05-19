import { LitElement, css, html } from 'lit';

let nextTabsId = 0;

export class AgentTab extends LitElement {
  static properties = {
    title: { type: String },
    active: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host {
      display: block;
      padding: 1rem 0;
    }

    :host([hidden]) {
      display: none !important;
    }

    .panel {
      color: #334155;
    }
  `;

  render() {
    return html`<div class="panel"><slot></slot></div>`;
  }
}

customElements.define('agent-tab', AgentTab);

export class AgentTabs extends LitElement {
  static properties = {
    label: { type: String },
    selectedIndex: { type: Number, state: true },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1.25rem 0;
    }

    .tabs {
      border: 1px solid #dbeafe;
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.82);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }

    .tablist {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
      border-bottom: 1px solid #dbeafe;
      background: #eff6ff;
      padding: 0.5rem 0.5rem 0;
    }

    button[role='tab'] {
      appearance: none;
      border: 1px solid transparent;
      border-bottom: 0;
      border-radius: 0.65rem 0.65rem 0 0;
      background: transparent;
      color: #475569;
      cursor: pointer;
      font: inherit;
      font-size: 0.92rem;
      font-weight: 700;
      padding: 0.55rem 0.8rem;
    }

    button[role='tab']:hover,
    button[role='tab']:focus-visible {
      background: rgba(255, 255, 255, 0.78);
      color: #1d4ed8;
      outline: none;
    }

    button[role='tab'][aria-selected='true'] {
      background: #ffffff;
      border-color: #bfdbfe;
      color: #1e40af;
      margin-bottom: -1px;
    }

    .panels {
      padding: 0 1rem 0.25rem;
    }
  `;

  constructor() {
    super();
    this.label = 'Tabbed content';
    this.selectedIndex = 0;
    this.baseId = `agent-tabs-${nextTabsId++}`;
    this.observer = new MutationObserver(() => this.refreshTabs());
  }

  connectedCallback() {
    super.connectedCallback();
    this.observer.observe(this, { childList: true, subtree: false });
  }

  disconnectedCallback() {
    this.observer.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.refreshTabs();
  }

  get tabs() {
    return [...this.querySelectorAll(':scope > agent-tab')];
  }

  refreshTabs() {
    const tabs = this.tabs;
    const requestedActiveIndex = tabs.findIndex((tab) => tab.hasAttribute('active'));

    if (requestedActiveIndex >= 0) {
      this.selectedIndex = requestedActiveIndex;
    } else if (this.selectedIndex >= tabs.length) {
      this.selectedIndex = Math.max(0, tabs.length - 1);
    }

    this.configureTabs();
    this.requestUpdate();
  }

  updated() {
    this.configureTabs();
  }

  configureTabs() {
    this.tabs.forEach((tab, index) => {
      const panelId = `${this.baseId}-panel-${index}`;
      const tabId = `${this.baseId}-tab-${index}`;
      const active = index === this.selectedIndex;

      tab.id = panelId;
      tab.active = active;
      tab.hidden = !active;
      tab.setAttribute('role', 'tabpanel');
      tab.setAttribute('aria-labelledby', tabId);
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
  }

  selectTab(index) {
    const tabs = this.tabs;
    if (!tabs.length) return;

    this.selectedIndex = (index + tabs.length) % tabs.length;
    this.configureTabs();
    this.updateComplete.then(() => {
      this.renderRoot.querySelector(`#${this.baseId}-tab-${this.selectedIndex}`)?.focus();
    });
  }

  handleKeydown(event, index) {
    const keyActions = {
      ArrowLeft: () => this.selectTab(index - 1),
      ArrowUp: () => this.selectTab(index - 1),
      ArrowRight: () => this.selectTab(index + 1),
      ArrowDown: () => this.selectTab(index + 1),
      Home: () => this.selectTab(0),
      End: () => this.selectTab(this.tabs.length - 1),
    };

    const action = keyActions[event.key];
    if (!action) return;

    event.preventDefault();
    action();
  }

  render() {
    const tabs = this.tabs;

    return html`
      <section class="tabs">
        <div class="tablist" role="tablist" aria-label=${this.label || 'Tabbed content'}>
          ${tabs.map((tab, index) => {
            const active = index === this.selectedIndex;
            const title = tab.title || tab.getAttribute('title') || `Tab ${index + 1}`;

            return html`
              <button
                id=${`${this.baseId}-tab-${index}`}
                role="tab"
                type="button"
                aria-controls=${`${this.baseId}-panel-${index}`}
                aria-selected=${active ? 'true' : 'false'}
                tabindex=${active ? '0' : '-1'}
                @click=${() => this.selectTab(index)}
                @keydown=${(event) => this.handleKeydown(event, index)}
              >
                ${title}
              </button>
            `;
          })}
        </div>
        <div class="panels">
          <slot @slotchange=${() => this.refreshTabs()}></slot>
        </div>
      </section>
    `;
  }
}

customElements.define('agent-tabs', AgentTabs);
