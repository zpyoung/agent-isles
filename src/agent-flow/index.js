import {
  DEFAULT_AGENT_FLOW_KIND,
  normalizeAgentFlowEnum,
} from './core/document.js';
import c4Pack from './packs/c4.js';
import flowchartPack from './packs/flowchart.js';

export const AGENT_FLOW_PACKS = Object.freeze({
  c4: c4Pack,
  flowchart: flowchartPack,
});

export function getAgentFlowPack(kind = DEFAULT_AGENT_FLOW_KIND) {
  return AGENT_FLOW_PACKS[normalizeAgentFlowEnum(kind, DEFAULT_AGENT_FLOW_KIND)] || AGENT_FLOW_PACKS[DEFAULT_AGENT_FLOW_KIND];
}

export function listAgentFlowPacks() {
  return [AGENT_FLOW_PACKS.c4, AGENT_FLOW_PACKS.flowchart];
}

export function validateAgentFlowDocument(document, kind = document?.kind) {
  return getAgentFlowPack(kind).validate(document);
}

export * from './core/document.js';
export * from './core/validation.js';
export { c4Pack, flowchartPack };
