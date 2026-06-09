import { buildAgentFlowPalette, validateAgentFlowWithPack } from '../core/validation.js';

export const c4Pack = {
  kind: 'c4',
  label: 'C4 Model',
  nodeTypes: {
    person: 'Person',
    softwareSystem: 'Software System',
    container: 'Container',
    component: 'Component',
    boundary: 'Boundary',
  },
  edgeTypes: {
    relationship: 'Relationship',
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

export default c4Pack;
