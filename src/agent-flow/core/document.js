export const AGENT_FLOW_SCHEMA_VERSION = '0.1';
export const DEFAULT_AGENT_FLOW_KIND = 'flowchart';

export const EMPTY_AGENT_FLOW_DOCUMENT = Object.freeze({
  version: AGENT_FLOW_SCHEMA_VERSION,
  kind: DEFAULT_AGENT_FLOW_KIND,
  nodes: {},
  edges: {},
  views: {},
});

export function hasAgentFlowText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asAgentFlowRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeAgentFlowId(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

export function normalizeAgentFlowEnum(value, fallback = '') {
  return normalizeAgentFlowId(value, fallback).toLowerCase();
}

function normalizeRecordItems(record, prefix) {
  return Object.fromEntries(
    Object.entries(asAgentFlowRecord(record)).map(([key, rawValue], index) => {
      const value = asAgentFlowRecord(rawValue);
      const id = normalizeAgentFlowId(value.id, key || `${prefix}-${index + 1}`);
      return [id, { ...value, id }];
    }),
  );
}

export function normalizeAgentFlowDocument(source = {}, options = {}) {
  const parsed = asAgentFlowRecord(source);
  const fallbackKind = options.fallbackKind || DEFAULT_AGENT_FLOW_KIND;
  const kind = normalizeAgentFlowEnum(parsed.kind, fallbackKind);

  return {
    ...parsed,
    version: normalizeAgentFlowId(parsed.version, AGENT_FLOW_SCHEMA_VERSION),
    kind,
    nodes: normalizeRecordItems(parsed.nodes, 'node'),
    edges: normalizeRecordItems(parsed.edges, 'edge'),
    views: normalizeRecordItems(parsed.views, 'view'),
  };
}

export function parseAgentFlowDocumentSource(source, options = {}) {
  const text = String(source || '').trim();
  if (!text) {
    return normalizeAgentFlowDocument({}, options);
  }

  try {
    return normalizeAgentFlowDocument(JSON.parse(text), options);
  } catch (error) {
    return {
      ...EMPTY_AGENT_FLOW_DOCUMENT,
      kind: options.fallbackKind || DEFAULT_AGENT_FLOW_KIND,
      error: error?.message || String(error),
      source: text,
    };
  }
}

export function orderedAgentFlowValues(record) {
  return Object.values(asAgentFlowRecord(record)).map((value, index) => ({
    ...asAgentFlowRecord(value),
    id: normalizeAgentFlowId(value?.id, `item-${index + 1}`),
  }));
}

export function selectedAgentFlowView(document, requestedView) {
  const views = orderedAgentFlowValues(document?.views);
  if (hasAgentFlowText(requestedView)) {
    const found = views.find((view) => view.id === requestedView);
    if (found) return found;
  }
  return views[0] || null;
}

export function visibleAgentFlowNodes(document, view) {
  const nodes = orderedAgentFlowValues(document?.nodes);
  if (!view || !Array.isArray(view.nodeIds) || view.nodeIds.length === 0) {
    return nodes;
  }
  const allowed = new Set(view.nodeIds.map(String));
  return nodes.filter((node) => allowed.has(node.id));
}

export function visibleAgentFlowEdges(document, nodes) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return orderedAgentFlowValues(document?.edges).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
}
