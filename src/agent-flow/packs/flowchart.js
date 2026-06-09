import { buildAgentFlowPalette, validateAgentFlowWithPack } from '../core/validation.js';

export const flowchartPack = {
  kind: 'flowchart',
  label: 'Flowchart',
  nodeTypes: {
    start: 'Start',
    process: 'Process',
    decision: 'Decision',
    end: 'End',
  },
  edgeTypes: {
    flow: 'Flow',
  },
  getPalette() {
    return buildAgentFlowPalette(this.nodeTypes);
  },
  validate(document) {
    return validateAgentFlowWithPack(document, this);
  },
  serialize(document) {
    return JSON.stringify(document, null, 2);
  },
  deserialize(source) {
    return JSON.parse(source);
  },
};

export default flowchartPack;
