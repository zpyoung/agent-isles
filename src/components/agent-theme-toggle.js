import { LitElement, css, html } from 'lit';

const THEME_STORAGE_KEY = 'agent-isles-theme';
const THEMES = new Set(['light', 'dark']);
const AGENT_COMPONENT_TAGS = [
  'agent-decision',
  'agent-risk',
  'agent-metric',
  'agent-delta',
  'agent-copy-block',
  'agent-theme-toggle',
  'agent-dependency-map',
  'agent-dependency',
  'agent-flow',
  'agent-tabs',
  'agent-tab',
  'agent-timeline',
  'agent-step',
  'agent-gantt',
  'agent-gantt-phase',
  'agent-gantt-task',
  'agent-kpi',
  'agent-status-board',
  'agent-status-item',
  'agent-action-list',
  'agent-action',
  'agent-kanban',
  'agent-kanban-lane',
  'agent-kanban-card',
];
const AGENT_COMPONENT_SELECTOR = AGENT_COMPONENT_TAGS.join(', ');
let currentTheme = 'light';
let themeObserver;

export class AgentThemeToggle extends LitElement {
  static properties = {
    label: { type: String },
    storageKey: { type: String, attribute: 'storage-key' },
    theme: { type: String, state: true },
  };

  constructor() {
    super();
    this.label = 'Theme';
    this.storageKey = THEME_STORAGE_KEY;
    this.theme = 'light';
    this.handleThemeChange = this.handleThemeChange.bind(this);
    this.handleStorage = this.handleStorage.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.theme = readInitialTheme(this.storageKey);
    applyDocumentTheme(this.theme);
    document.addEventListener('agent-isles-theme-change', this.handleThemeChange);
    window.addEventListener('storage', this.handleStorage);
  }

  disconnectedCallback() {
    document.removeEventListener('agent-isles-theme-change', this.handleThemeChange);
    window.removeEventListener('storage', this.handleStorage);
    super.disconnectedCallback();
  }

  static styles = css`
    :host {
      display: inline-block;
    }

    button {
      align-items: center;
      background: var(--agent-isles-surface, #ffffff);
      border: 1px solid var(--agent-isles-border, #dbeafe);
      border-radius: 999px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      color: var(--agent-isles-heading, #0f172a);
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 800;
      gap: 0.45rem;
      line-height: 1.2;
      padding: 0.45rem 0.75rem;
      transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
    }

    button:hover {
      background: var(--agent-isles-surface-muted, #eff6ff);
      border-color: var(--agent-isles-primary, #2563eb);
      transform: translateY(-1px);
    }

    :host([data-bs-theme="dark"]) button {
      background: var(--agent-isles-surface, #0f172a);
      border-color: var(--agent-isles-border, #334155);
      color: var(--agent-isles-heading, #f8fafc);
      box-shadow: 0 1px 2px rgba(2, 6, 23, 0.45);
    }

    :host([data-bs-theme="dark"]) button:hover {
      background: var(--agent-isles-surface-muted, #1e293b);
      border-color: var(--agent-isles-primary, #38bdf8);
    }

    button:focus-visible {
      outline: 3px solid var(--agent-isles-focus, #93c5fd);
      outline-offset: 2px;
    }

    .icon {
      font-size: 1rem;
      line-height: 1;
    }

    .mode {
      color: var(--agent-isles-muted, #475569);
      font-weight: 750;
    }
  `;

  render() {
    const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
    const currentLabel = capitalizeTheme(this.theme);
    const nextLabel = capitalizeTheme(nextTheme);

    return html`
      <button
        type="button"
        aria-label=${`Switch to ${nextLabel} theme`}
        aria-pressed=${this.theme === 'dark' ? 'true' : 'false'}
        @click=${this.toggleTheme}
      >
        <span class="icon" aria-hidden="true">${this.theme === 'dark' ? '☾' : '☀'}</span>
        <span>${this.label || 'Theme'}</span>
        <span class="mode">${currentLabel}</span>
      </button>
    `;
  }

  toggleTheme() {
    const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme, { persist: true, broadcast: true });
  }

  setTheme(theme, { persist = false, broadcast = false } = {}) {
    if (!THEMES.has(theme)) {
      return;
    }

    this.theme = theme;
    applyDocumentTheme(theme);

    if (persist) {
      writeStoredTheme(this.storageKey, theme);
    }

    if (broadcast) {
      document.dispatchEvent(new CustomEvent('agent-isles-theme-change', {
        detail: { theme },
      }));
    }
  }

  handleThemeChange(event) {
    this.setTheme(event.detail?.theme);
  }

  handleStorage(event) {
    if (event.key !== this.storageKey || !THEMES.has(event.newValue)) {
      return;
    }

    this.setTheme(event.newValue);
  }
}

function readInitialTheme(storageKey) {
  const storedTheme = readStoredTheme(storageKey);
  if (THEMES.has(storedTheme)) {
    return storedTheme;
  }

  const documentTheme = document.documentElement.getAttribute('data-bs-theme');
  if (THEMES.has(documentTheme)) {
    return documentTheme;
  }

  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function readStoredTheme(storageKey) {
  try {
    return window.localStorage?.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStoredTheme(storageKey, theme) {
  try {
    window.localStorage?.setItem(storageKey, theme);
  } catch {
    // Rendering artifacts should still work in locked-down or file:// contexts.
  }
}

function applyDocumentTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-bs-theme', theme);
  document.documentElement.style.colorScheme = theme;

  applyThemeToAgentComponents(document, theme);
  ensureThemeObserver();
}

function applyThemeToAgentComponents(root, theme) {
  if (!root?.querySelectorAll) {
    return;
  }

  if (root.matches?.(AGENT_COMPONENT_SELECTOR)) {
    root.setAttribute('data-bs-theme', theme);
  }

  for (const element of root.querySelectorAll(AGENT_COMPONENT_SELECTOR)) {
    element.setAttribute('data-bs-theme', theme);
  }
}

function ensureThemeObserver() {
  if (themeObserver || !document.body) {
    return;
  }

  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          applyThemeToAgentComponents(node, currentTheme);
        }
      }
    }
  });
  themeObserver.observe(document.body, { childList: true, subtree: true });
}

function capitalizeTheme(theme) {
  return theme === 'dark' ? 'Dark' : 'Light';
}

customElements.define('agent-theme-toggle', AgentThemeToggle);
