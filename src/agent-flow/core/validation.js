import { orderedAgentFlowValues } from './document.js';

export function buildAgentFlowPalette(nodeTypes) {
  return Object.entries(nodeTypes).map(([type, label]) => ({ type, label }));
}

export function validateAgentFlowReferences(document) {
  const messages = [];
  const nodeIds = new Set(orderedAgentFlowValues(document?.nodes).map((node) => node.id));

  for (const edge of orderedAgentFlowValues(document?.edges)) {
    if (!nodeIds.has(edge.source)) messages.push(`Edge ${edge.id} has missing source ${edge.source}.`);
    if (!nodeIds.has(edge.target)) messages.push(`Edge ${edge.id} has missing target ${edge.target}.`);
  }

  return messages;
}

export function validateAgentFlowSchema(document, pack) {
  const messages = [];
  const knownNodeTypes = new Set(Object.keys(pack.nodeTypes || {}));
  const knownEdgeTypes = new Set(Object.keys(pack.edgeTypes || {}));

  for (const node of orderedAgentFlowValues(document?.nodes)) {
    if (node.type && knownNodeTypes.size > 0 && !knownNodeTypes.has(node.type)) {
      messages.push(`Node ${node.id} uses unknown ${pack.kind} node type ${node.type}.`);
    }
  }

  for (const edge of orderedAgentFlowValues(document?.edges)) {
    const edgeType = edge.type || Object.keys(pack.edgeTypes || {})[0] || '';
    if (edgeType && knownEdgeTypes.size > 0 && !knownEdgeTypes.has(edgeType)) {
      messages.push(`Edge ${edge.id} uses unknown ${pack.kind} edge type ${edgeType}.`);
    }
  }

  return messages;
}

export function validateAgentFlowWithPack(document, pack) {
  return [
    ...validateAgentFlowSchema(document, pack),
    ...validateAgentFlowReferences(document),
  ];
}
