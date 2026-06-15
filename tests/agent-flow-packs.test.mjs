import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_AGENT_FLOW_KIND,
  getAgentFlowPack,
  listAgentFlowPacks,
  normalizeAgentFlowDocument,
  validateAgentFlowDocument,
} from '../src/agent-flow/index.js';

test('agent-flow exposes agnostic pack registry with c4 as a first-class pack', () => {
  const packs = listAgentFlowPacks();

  assert.deepEqual(packs.map((pack) => pack.kind), ['c4', 'flowchart']);
  assert.equal(DEFAULT_AGENT_FLOW_KIND, 'flowchart');

  const c4 = getAgentFlowPack('C4');
  assert.equal(c4.kind, 'c4');
  assert.equal(c4.label, 'C4 Model');
  assert.deepEqual(Object.keys(c4.nodeTypes), ['person', 'softwareSystem', 'container', 'component', 'boundary']);
  assert.deepEqual(Object.keys(c4.edgeTypes), ['relationship']);
  assert.equal(c4.getPalette()[0].type, 'person');
});

test('agent-flow document normalization keeps JSON-first maps canonical', () => {
  const document = normalizeAgentFlowDocument({
    version: '',
    kind: 'C4',
    nodes: {
      user: { type: 'person', label: 'Developer' },
    },
    edges: {
      authors: { source: 'user', target: 'system', label: 'Authors Markdown' },
    },
    views: {
      context: { title: 'Context', nodeIds: ['user', 'system'] },
    },
  });

  assert.equal(document.version, '0.1');
  assert.equal(document.kind, 'c4');
  assert.equal(document.nodes.user.id, 'user');
  assert.equal(document.edges.authors.id, 'authors');
  assert.equal(document.views.context.id, 'context');
});

test('agent-flow pack validation reports schema and reference problems', () => {
  const document = normalizeAgentFlowDocument({
    kind: 'c4',
    nodes: {
      user: { id: 'user', type: 'person', label: 'Developer' },
      mystery: { id: 'mystery', type: 'queue', label: 'Queue' },
    },
    edges: {
      bad: { id: 'bad', source: 'user', target: 'missing', type: 'async' },
    },
  });

  assert.deepEqual(validateAgentFlowDocument(document), [
    'Node mystery uses unknown c4 node type queue.',
    'Edge bad uses unknown c4 edge type async.',
    'Edge bad has missing target missing.',
  ]);
});
