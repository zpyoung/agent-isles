import { LitElement, css, html } from 'lit';

export class AgentCopyBlock extends LitElement {
  static properties = {
    label: { type: String },
    lang: { type: String },
    copied: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.copied = false;
  }

  static styles = css`
    :host { display: block; }
    .copy-block {
      border: 1px solid #1e293b;
      border-radius: 0.85rem;
      background: #0f172a;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
      color: #e2e8f0;
      overflow: hidden;
    }
    .toolbar {
      align-items: center;
      background: #111827;
      border-bottom: 1px solid #334155;
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
      padding: 0.6rem 0.75rem;
    }
    .meta {
      align-items: center;
      display: flex;
      gap: 0.5rem;
      min-width: 0;
    }
    .label {
      color: #f8fafc;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lang {
      border: 1px solid #475569;
      border-radius: 999px;
      color: #cbd5e1;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.45rem;
      text-transform: uppercase;
    }
    button {
      border: 1px solid #38bdf8;
      border-radius: 999px;
      background: #0c4a6e;
      color: #e0f2fe;
      cursor: pointer;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 800;
      padding: 0.3rem 0.65rem;
    }
    button:focus-visible {
      outline: 3px solid #7dd3fc;
      outline-offset: 2px;
    }
    pre {
      margin: 0;
      overflow-x: auto;
      padding: 1rem;
      white-space: pre-wrap;
    }
    code {
      color: inherit;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
      font-size: 0.9rem;
    }

    :host([data-bs-theme="dark"]) .copy-block {
      border-color: var(--agent-isles-border, #334155);
      background: #020617;
      box-shadow: 0 1px 2px rgba(2, 6, 23, 0.55);
    }
    :host([data-bs-theme="dark"]) .header {
      background: #0f172a;
      border-color: var(--agent-isles-border, #334155);
    }
  `;

  render() {
    return html`
      <section class="copy-block">
        <div class="toolbar">
          <div class="meta">
            <span class="label">${this.label || 'Copy block'}</span>
            ${this.lang ? html`<span class="lang">${this.lang}</span>` : null}
          </div>
          <button type="button" @click=${this.copyContent} aria-live="polite">
            ${this.copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre><code><slot></slot></code></pre>
      </section>

  `;
  }

  async copyContent() {
    const text = this.textContent.trim();

    if (!text) {
      return;
    }

    const copied = await copyText(text);
    if (!copied) {
      return;
    }

    this.copied = true;
    window.setTimeout(() => {
      this.copied = false;
    }, 1600);
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path for file:// and other non-secure contexts.
    }
  }

  return copyTextWithSelectionFallback(text);
}

function copyTextWithSelectionFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.insetInlineStart = '-9999px';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

customElements.define('agent-copy-block', AgentCopyBlock);
