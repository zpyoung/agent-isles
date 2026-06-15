import { LitElement, css, html, svg } from 'lit';
import {
  DEFAULT_AGENT_FLOW_KIND,
  EMPTY_AGENT_FLOW_DOCUMENT,
  getAgentFlowPack,
  parseAgentFlowDocumentSource,
  validateAgentFlowDocument,
} from '../agent-flow/index.js';

const EMPTY_DOCUMENT = EMPTY_AGENT_FLOW_DOCUMENT;

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeId(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeEnum(value, fallback = '') {
  return normalizeId(value, fallback).toLowerCase();
}

function titleCase(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function packFor(kind) {
  return getAgentFlowPack(kind);
}

function parseDocument(source, fallbackKind) {
  return parseAgentFlowDocumentSource(source, { fallbackKind: fallbackKind || DEFAULT_AGENT_FLOW_KIND });
}

function orderedValues(record) {
  return Object.entries(asRecord(record)).map(([key, value], index) => ({
    ...asRecord(value),
    id: normalizeId(value?.id, key || `item-${index + 1}`),
  }));
}

function selectedView(document, requestedView) {
  const views = orderedValues(document.views);
  if (hasText(requestedView)) {
    const found = views.find((view) => view.id === requestedView);
    if (found) return found;
  }
  return views[0] || null;
}

function visibleNodes(document, view) {
  const nodes = orderedValues(document.nodes);
  if (!view || !Array.isArray(view.nodeIds) || view.nodeIds.length === 0) {
    return nodes;
  }
  const allowed = new Set(view.nodeIds.map(String));
  return nodes.filter((node) => allowed.has(node.id));
}

function visibleEdges(document, nodes) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return orderedValues(document.edges).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
}

function layoutNodes(nodes) {
  const width = 720;
  const height = Math.max(260, Math.ceil(nodes.length / 3) * 150 + 70);
  const columns = Math.min(3, Math.max(1, nodes.length));
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  const xGap = width / (columns + 1);
  const yGap = height / (rows + 1);

  const positions = new Map();
  nodes.forEach((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(node.id, {
      x: Math.round(xGap * (column + 1)),
      y: Math.round(yGap * (row + 1)),
    });
  });
  return { width, height, positions };
}

function nodeTypeLabel(pack, type) {
  return pack.nodeTypes?.[type] || titleCase(type || 'node') || 'Node';
}

function shortJson(document) {
  return JSON.stringify(document, null, 2);
}

let nextFlowId = 0;

export class AgentFlow extends LitElement {
  static properties = {
    kind: { type: String },
    title: { type: String },
    mode: { type: String },
    view: { type: String },
    document: { state: true },
    selectedNodeId: { state: true },
    flowId: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      margin: 1rem 0;
    }

    .flow {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid #dbeafe;
      border-radius: 1.15rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      color: #1e293b;
      overflow: hidden;
    }

    .header {
      align-items: start;
      border-bottom: 1px solid #dbeafe;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      justify-content: space-between;
      padding: 0.95rem 1rem;
    }

    .eyebrow {
      color: #2563eb;
      font-size: 0.72rem;
      font-weight: 850;
      letter-spacing: 0.08em;
      margin: 0 0 0.15rem;
      text-transform: uppercase;
    }

    .title {
      color: #0f172a;
      font-size: 1.05rem;
      font-weight: 850;
      line-height: 1.25;
      margin: 0;
    }

    .meta {
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .mode-pill {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 999px;
      color: #1d4ed8;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.2rem 0.6rem;
      text-transform: uppercase;
    }

    .workspace {
      display: grid;
      gap: 0;
      grid-template-columns: minmax(0, 1fr);
    }

    :host([mode="editor"]) .workspace {
      grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem);
    }

    .canvas-wrap {
      overflow: auto;
      padding: 1rem;
    }

    svg {
      background:
        linear-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px),
        #f8fafc;
      background-size: 28px 28px;
      border: 1px solid #e2e8f0;
      border-radius: 0.9rem;
      display: block;
      max-width: 100%;
      min-width: min(42rem, 100%);
    }

    .edge {
      stroke: #64748b;
      stroke-width: 2.2;
    }

    .edge-label {
      fill: #475569;
      font-size: 0.75rem;
      font-weight: 700;
      paint-order: stroke;
      stroke: #f8fafc;
      stroke-width: 4px;
    }

    .node rect {
      fill: #ffffff;
      stroke: #2563eb;
      stroke-width: 2;
    }

    .node[data-type="person"] rect,
    .node[data-type="start"] rect {
      stroke: #16a34a;
    }

    .node[data-type="softwareSystem"] rect,
    .node[data-type="process"] rect {
      stroke: #2563eb;
    }

    .node[data-type="container"] rect,
    .node[data-type="component"] rect,
    .node[data-type="decision"] rect {
      stroke: #9333ea;
    }

    .node.selected rect {
      filter: drop-shadow(0 0 0.35rem rgba(37, 99, 235, 0.48));
      stroke-width: 3;
    }

    .node-label {
      fill: #0f172a;
      font-size: 0.86rem;
      font-weight: 850;
      text-anchor: middle;
    }

    .node-type {
      fill: #64748b;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-anchor: middle;
      text-transform: uppercase;
    }

    button.node-hit {
      all: unset;
    }

    .editor {
      background: #f8fafc;
      border-left: 1px solid #dbeafe;
      display: grid;
      gap: 1rem;
      padding: 1rem;
    }

    .panel h4 {
      color: #0f172a;
      font-size: 0.82rem;
      font-weight: 850;
      letter-spacing: 0.06em;
      margin: 0 0 0.55rem;
      text-transform: uppercase;
    }

    .palette {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .palette span {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      color: #334155;
      font-size: 0.72rem;
      font-weight: 750;
      padding: 0.18rem 0.55rem;
    }

    .inspector {
      background: #ffffff;
      border: 1px solid #dbeafe;
      border-radius: 0.85rem;
      padding: 0.8rem;
    }

    label {
      color: #475569;
      display: grid;
      font-size: 0.75rem;
      font-weight: 800;
      gap: 0.25rem;
      margin: 0 0 0.65rem;
      text-transform: uppercase;
    }

    input, textarea {
      border: 1px solid #cbd5e1;
      border-radius: 0.55rem;
      color: #0f172a;
      font: inherit;
      padding: 0.45rem 0.55rem;
      text-transform: none;
    }

    textarea {
      min-height: 5rem;
      resize: vertical;
    }

    .warning {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 0.75rem;
      color: #92400e;
      font-size: 0.82rem;
      font-weight: 650;
      margin: 1rem;
      padding: 0.75rem;
    }

    .empty {
      color: #64748b;
      font-weight: 650;
      padding: 2rem;
      text-align: center;
    }

    :host([data-bs-theme="dark"]) .flow,
    :host([data-bs-theme="dark"]) .inspector,
    :host([data-bs-theme="dark"]) .palette span {
      background: var(--agent-isles-surface, #0f172a);
      border-color: var(--agent-isles-border, #334155);
      color: var(--agent-isles-text, #cbd5e1);
    }

    :host([data-bs-theme="dark"]) .header,
    :host([data-bs-theme="dark"]) .editor {
      background: rgba(15, 23, 42, 0.82);
      border-color: var(--agent-isles-border, #334155);
    }

    :host([data-bs-theme="dark"]) .title,
    :host([data-bs-theme="dark"]) .panel h4 {
      color: var(--agent-isles-heading, #f8fafc);
    }

    :host([data-bs-theme="dark"]) .meta,
    :host([data-bs-theme="dark"]) label {
      color: var(--agent-isles-muted, #94a3b8);
    }

    @media (max-width: 820px) {
      :host([mode="editor"]) .workspace {
        grid-template-columns: 1fr;
      }
      .editor {
        border-left: 0;
        border-top: 1px solid #dbeafe;
      }
    }
  `;

  constructor() {
    super();
    this.kind = 'flowchart';
    this.mode = 'viewer';
    this.title = '';
    this.view = '';
    this.document = { ...EMPTY_DOCUMENT };
    this.selectedNodeId = '';
    nextFlowId += 1;
    this.flowId = `agent-flow-${nextFlowId}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.refreshDocument();
  }

  refreshDocument() {
    this.kind = normalizeEnum(this.kind, EMPTY_DOCUMENT.kind);
    this.mode = normalizeEnum(this.mode, 'viewer');
    this.document = parseDocument(this.textContent, this.kind);
    if (!this.kind || this.kind === 'flowchart') {
      this.kind = this.document.kind || this.kind;
    }
    const firstNode = orderedValues(this.document.nodes)[0];
    this.selectedNodeId = firstNode?.id || '';
  }

  render() {
    const document = this.document || EMPTY_DOCUMENT;
    const pack = packFor(this.kind || document.kind);
    const activeView = selectedView(document, this.view);
    const nodes = visibleNodes(document, activeView);
    const edges = visibleEdges(document, nodes);
    const warnings = [
      ...(document.error ? [`Invalid agent-flow JSON: ${document.error}`] : []),
      ...validateAgentFlowDocument(document, pack.kind),
    ];

    return html`
      <section class="flow" aria-labelledby=${`${this.flowId}-title`}>
        <header class="header">
          <div>
            <p class="eyebrow">${pack.label} · ${activeView?.title || activeView?.id || 'All nodes'}</p>
            <h3 class="title" id=${`${this.flowId}-title`}>${this.title || document.title || 'Agent flow'}</h3>
            <div class="meta">${nodes.length} nodes · ${edges.length} edges · schema ${document.version || '0.1'}</div>
          </div>
          <span class="mode-pill">${this.mode === 'editor' ? 'Editor' : 'Viewer'}</span>
        </header>
        ${warnings.map((message) => html`<div class="warning" role="status">${message}</div>`)}
        <div class="workspace">
          <div class="canvas-wrap">${this.renderCanvas(pack, nodes, edges)}</div>
          ${this.mode === 'editor' ? this.renderEditor(pack, document, nodes) : null}
        </div>
      </section>
    `;
  }

  renderCanvas(pack, nodes, edges) {
    if (nodes.length === 0) {
      return html`<div class="empty">No nodes in this flow document yet.</div>`;
    }

    const layout = layoutNodes(nodes);
    return svg`
      <svg viewBox="0 0 ${layout.width} ${layout.height}" aria-labelledby=${`${this.flowId}-title`}>
        <defs>
          <marker id=${`${this.flowId}-arrow`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#64748b"></path>
          </marker>
        </defs>
        ${edges.map((edge) => this.renderEdge(edge, layout.positions))}
        ${nodes.map((node) => this.renderNode(pack, node, layout.positions.get(node.id)))}
      </svg>
    `;
  }

  renderEdge(edge, positions) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return null;
    const midX = Math.round((source.x + target.x) / 2);
    const midY = Math.round((source.y + target.y) / 2) - 8;
    return svg`
      <g>
        <line class="edge" x1=${source.x} y1=${source.y + 32} x2=${target.x} y2=${target.y - 32} marker-end=${`url(#${this.flowId}-arrow)`}></line>
        ${hasText(edge.label) ? svg`<text class="edge-label" x=${midX} y=${midY}>${edge.label}</text>` : null}
      </g>
    `;
  }

  renderNode(pack, node, position) {
    if (!position) return null;
    const selected = this.selectedNodeId === node.id;
    return svg`
      <g class=${selected ? 'node selected' : 'node'} data-type=${node.type || 'node'} role="button" tabindex="0" aria-label=${node.label || node.id} @click=${() => this.selectNode(node.id)} @keydown=${(event) => this.selectNodeFromKeyboard(event, node.id)}>
        <rect x=${position.x - 78} y=${position.y - 36} width="156" height="72" rx="14"></rect>
        <text class="node-label" x=${position.x} y=${position.y - 3}>${node.label || node.id}</text>
        <text class="node-type" x=${position.x} y=${position.y + 19}>${nodeTypeLabel(pack, node.type)}</text>
      </g>
    `;
  }

  renderEditor(pack, document, nodes) {
    const selected = nodes.find((node) => node.id === this.selectedNodeId) || nodes[0];
    return html`
      <aside class="editor" aria-label="Agent flow editor controls">
        <section class="panel">
          <h4>Palette</h4>
          <div class="palette">
            ${pack.getPalette(document).map(({ label }) => html`<span>${label}</span>`)}
          </div>
        </section>
        <section class="panel inspector">
          <h4>Inspector</h4>
          ${selected ? html`
            <label>Node id <input .value=${selected.id} readonly /></label>
            <label>Label <input .value=${selected.label || ''} @input=${(event) => this.updateSelectedNode('label', event.target.value)} /></label>
            <label>Type <input .value=${nodeTypeLabel(pack, selected.type)} readonly /></label>
          ` : html`<p class="meta">Select a node to edit its properties.</p>`}
        </section>
        <section class="panel">
          <h4>Canonical JSON</h4>
          <textarea readonly>${shortJson(document)}</textarea>
        </section>
      </aside>
    `;
  }

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
  }

  selectNodeFromKeyboard(event, nodeId) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return;
    }
    event.preventDefault();
    this.selectNode(nodeId);
  }

  updateSelectedNode(field, value) {
    const nodes = { ...asRecord(this.document.nodes) };
    const current = asRecord(nodes[this.selectedNodeId]);
    nodes[this.selectedNodeId] = { ...current, id: this.selectedNodeId, [field]: value };
    this.document = { ...this.document, nodes };
    this.dispatchEvent(new CustomEvent('agent-flow-change', {
      bubbles: true,
      composed: true,
      detail: { document: this.document },
    }));
  }
}

customElements.define('agent-flow', AgentFlow);
