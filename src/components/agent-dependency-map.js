import { LitElement, css, html } from 'lit';
import { analyzeDependencyGraph, parseDependencyIdList } from './dependency-graph.js';

function normalizeDirection(direction) {
  const value = String(direction || '').trim().toLowerCase();
  return value === 'horizontal' ? 'horizontal' : 'vertical';
}

function normalizeLegendMode(value) {
  const legend = String(value || '').trim().toLowerCase();
  if (legend === 'hide' || legend === 'none') return 'hide';
  if (legend === 'show') return 'show';
  return 'auto';
}

function statusLabel(status) {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'active':
      return 'Active';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
    case 'risk':
      return 'Risk';
    default:
      return status ? String(status) : 'Ready';
  }
}

function normalizeGraphId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return '';
  return id.startsWith('user-content-') ? id.slice('user-content-'.length) : id;
}

export class AgentDependencyMap extends LitElement {
  static properties = {
    label: { type: String },
    direction: { type: String },
    legend: { type: String },
    _warnings: { state: true },
    _maxDepth: { state: true },
    _statusSet: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .map {
      position: relative;
    }

    .grid {
      display: grid;
      gap: 1rem 1.25rem;
      grid-auto-flow: row;
      padding: 0.25rem 0;
      position: relative;
    }

    slot {
      display: contents;
    }

    .edges {
      inset: 0;
      overflow: visible;
      pointer-events: none;
      position: absolute;
      z-index: 0;
    }

    .legend {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin: 0.65rem 0 0.25rem;
    }

    .legend-item {
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      color: #0f172a;
      font-size: 0.72rem;
      font-weight: 850;
      letter-spacing: 0.02em;
      padding: 0.18rem 0.55rem;
      text-transform: uppercase;
    }

    .legend-ready { background: #dcfce7; border-color: #86efac; color: #166534; }
    .legend-active { background: #dbeafe; border-color: #93c5fd; color: #1d4ed8; }
    .legend-blocked { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
    .legend-done { background: #dcfce7; border-color: #86efac; color: #166534; }
    .legend-risk { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }

    .warnings {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 0.75rem;
      color: #92400e;
      font-size: 0.85rem;
      font-weight: 750;
      margin: 0.75rem 0;
      padding: 0.65rem 0.75rem;
    }

    .warnings strong {
      font-weight: 900;
    }

    .label {
      color: #0f172a;
      font-size: 1.05rem;
      font-weight: 900;
      margin: 0 0 0.35rem;
    }
  `;

  constructor() {
    super();
    this.label = '';
    this.direction = 'vertical';
    this.legend = 'auto';
    this._warnings = [];
    this._maxDepth = 0;
    this._statusSet = new Set();
    this._resizeObserver = null;
    this._pendingEdgeRender = 0;
    this._edgePairs = [];
    this._elementById = new Map();
  }

  firstUpdated() {
    const grid = this.renderRoot?.querySelector('.grid');
    if (!grid) return;

    this._resizeObserver = new ResizeObserver(() => this.queueEdgeRender());
    this._resizeObserver.observe(grid);
    this.refreshLayout();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._pendingEdgeRender) {
      cancelAnimationFrame(this._pendingEdgeRender);
      this._pendingEdgeRender = 0;
    }
  }

  queueEdgeRender() {
    if (this._pendingEdgeRender) return;
    this._pendingEdgeRender = requestAnimationFrame(() => {
      this._pendingEdgeRender = 0;
      this.renderEdges();
    });
  }

  handleSlotChange() {
    this.refreshLayout();
  }

  refreshLayout() {
    const grid = this.renderRoot?.querySelector('.grid');
    const slot = this.renderRoot?.querySelector('slot');
    if (!grid || !slot) return;

    const nodes = slot
      .assignedElements({ flatten: true })
      .filter((element) => element.localName === 'agent-dependency');

    const elementById = new Map();
    const nodeModels = nodes.map((element, index) => ({
      id: normalizeGraphId(element.getAttribute('id') || ''),
      label: element.getAttribute('label') || '',
      status: element.getAttribute('status') || '',
      blockedBy: parseDependencyIdList(element.getAttribute('blocked-by') || '')
        .map((id) => normalizeGraphId(id))
        .join(','),
      owner: element.getAttribute('owner') || '',
      priority: element.getAttribute('priority') || '',
      href: element.getAttribute('href') || '',
      _index: index,
      _element: element,
    }));

    for (const model of nodeModels) {
      if (!model.id) continue;
      if (!elementById.has(model.id)) {
        elementById.set(model.id, model._element);
      }
    }

    const analysis = analyzeDependencyGraph(nodeModels);
    const orderIndexById = new Map(analysis.order.map((id, index) => [id, index]));
    const statusSet = new Set();

    for (const model of nodeModels) {
      const nodeId = typeof model.id === 'string' ? model.id.trim() : '';
      const element = model._element;

      if (!nodeId || !analysis.nodesById.has(nodeId)) {
        element.style.gridRow = 'auto';
        element.style.gridColumn = '1';
        element.missingId = true;
        element.resolvedBlockers = [];
        element.missingBlockers = [];
        continue;
      }

      const row = (orderIndexById.get(nodeId) ?? model._index) + 1;
      const depth = analysis.depthById.get(nodeId) ?? 0;
      element.style.gridRow = String(row);
      element.style.gridColumn = String(depth + 1);
      element.missingId = false;

      const resolvedBlockers = parseDependencyIdList(model.blockedBy)
        .filter((blockerId) => analysis.nodesById.has(blockerId))
        .map((blockerId) => ({
          id: blockerId,
          label: analysis.nodesById.get(blockerId).label || blockerId,
        }));

      element.resolvedBlockers = resolvedBlockers;
      element.missingBlockers = analysis.missingBlockersById.get(nodeId) || [];

      const status = String(model.status || '').trim().toLowerCase() || 'ready';
      statusSet.add(status);
    }

    this._statusSet = statusSet;
    this._warnings = analysis.warnings;
    this._maxDepth = analysis.maxDepth;
    this._edgePairs = analysis.edges;
    this._elementById = elementById;

    const direction = normalizeDirection(this.direction);
    if (direction === 'horizontal') {
      grid.style.gridAutoFlow = 'column';
    } else {
      grid.style.gridAutoFlow = 'row';
    }
    grid.style.gridTemplateColumns = `repeat(${analysis.maxDepth + 1}, minmax(16rem, 1fr))`;

    this.queueEdgeRender();
  }

  renderEdges() {
    const svg = this.renderRoot?.querySelector('svg.edges');
    const grid = this.renderRoot?.querySelector('.grid');
    if (!svg || !grid) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'agent-dependency-arrow');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('orient', 'auto');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowPath.setAttribute('fill', '#94a3b8');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const containerRect = grid.getBoundingClientRect();

    for (const edge of this._edgePairs) {
      const from = this._elementById.get(edge.from);
      const to = this._elementById.get(edge.to);
      if (!from || !to) continue;

      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();

      const x1 = fromRect.left - containerRect.left + fromRect.width / 2;
      const y1 = fromRect.bottom - containerRect.top;
      const x2 = toRect.left - containerRect.left + toRect.width / 2;
      const y2 = toRect.top - containerRect.top;

      const yMid = y1 + Math.max(12, (y2 - y1) / 2);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} L ${x1} ${yMid} L ${x2} ${yMid} L ${x2} ${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#94a3b8');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('marker-end', 'url(#agent-dependency-arrow)');
      svg.appendChild(path);
    }
  }

  renderLegend() {
    const mode = normalizeLegendMode(this.legend);
    if (mode === 'hide') return null;

    const statuses = [...this._statusSet].filter(Boolean);
    if (mode === 'auto' && statuses.length < 2) return null;

    return html`
      <div class="legend" role="list" aria-label="Dependency status legend">
        ${statuses.map((status) => html`
          <div class=${`legend-item legend-${status}`} role="listitem">${statusLabel(status)}</div>
        `)}
      </div>
    `;
  }

  renderWarnings() {
    if (!this._warnings.length) return null;

    const messages = this._warnings.map((warning) => {
      switch (warning.type) {
        case 'duplicate-id':
          return `Duplicate id "${warning.id}" ignored.`;
        case 'missing-id':
          return `${warning.count} node${warning.count === 1 ? '' : 's'} missing id; they cannot be targeted by blocked-by.`;
        case 'cycle':
          return `Cycle detected: ${Array.isArray(warning.cycle) ? warning.cycle.join(' → ') : String(warning.cycle)}.`;
        default:
          return 'Dependency map warning.';
      }
    });

    return html`
      <div class="warnings" role="alert">
        <strong>Dependency map warning:</strong> ${messages.join(' ')}
      </div>
    `;
  }

  render() {
    const label = this.label || '';
    const direction = normalizeDirection(this.direction);
    const ariaLabel = label || `Dependency map (${direction})`;

    return html`
      ${label ? html`<div class="label">${label}</div>` : null}
      ${this.renderLegend()}
      ${this.renderWarnings()}
      <div class="map" role="region" aria-label=${ariaLabel}>
        <div class="grid" role="list">
          <svg class="edges" aria-hidden="true"></svg>
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `;
  }
}

customElements.define('agent-dependency-map', AgentDependencyMap);
