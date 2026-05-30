import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  applyWritebackRequest,
  createSourceVersion,
  WritebackContractError,
} from '../src/writeback.mjs';

function withTempWorkspace(callback) {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-writeback-'));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function makeContext(root, operations = {}) {
  return {
    rootPath: root,
    editMode: true,
    localhost: true,
    operations,
  };
}

test('applyWritebackRequest validates and applies a registered component operation', () => {
  withTempWorkspace((root) => {
    const sourcePath = join(root, 'plan.md');
    writeFileSync(sourcePath, 'Decision: pending\n', 'utf8');
    const version = createSourceVersion(readFileSync(sourcePath, 'utf8'));

    const result = applyWritebackRequest({
      sourcePath: 'plan.md',
      sourceVersion: version,
      target: {
        componentId: 'decision-1',
        tagName: 'agent-decision',
        range: {
          start: { line: 1, column: 11, offset: 10 },
          end: { line: 1, column: 18, offset: 17 },
        },
        anchor: { text: 'pending' },
      },
      operation: {
        type: 'fixture:set-decision-state',
        payload: { state: 'approved' },
      },
    }, makeContext(root, {
      'fixture:set-decision-state': ({ request, rangeText }) => {
        assert.equal(request.target.tagName, 'agent-decision');
        assert.equal(rangeText, 'pending');
        return { replacement: request.operation.payload.state };
      },
    }));

    assert.equal(result.ok, true);
    assert.equal(result.sourcePath, 'plan.md');
    assert.notEqual(result.nextSourceVersion, version);
    assert.equal(readFileSync(sourcePath, 'utf8'), 'Decision: approved\n');
  });
});

test('applyWritebackRequest rejects unsafe or stale requests before writing', () => {
  withTempWorkspace((root) => {
    const sourcePath = join(root, 'plan.md');
    writeFileSync(sourcePath, 'Decision: pending\n', 'utf8');
    const version = createSourceVersion(readFileSync(sourcePath, 'utf8'));
    const baseRequest = {
      sourcePath: 'plan.md',
      sourceVersion: version,
      target: {
        componentId: 'decision-1',
        tagName: 'agent-decision',
        range: {
          start: { line: 1, column: 11, offset: 10 },
          end: { line: 1, column: 18, offset: 17 },
        },
        anchor: { text: 'pending' },
      },
      operation: { type: 'fixture:set-decision-state', payload: { state: 'approved' } },
    };
    const operations = {
      'fixture:set-decision-state': () => ({ replacement: 'approved' }),
    };

    assert.throws(
      () => applyWritebackRequest(baseRequest, { ...makeContext(root, operations), editMode: false }),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_DISABLED',
    );

    assert.throws(
      () => applyWritebackRequest(baseRequest, { ...makeContext(root, operations), localhost: false }),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_NON_LOCAL',
    );

    assert.throws(
      () => applyWritebackRequest({ ...baseRequest, sourcePath: '../outside.md' }, makeContext(root, operations)),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_PATH_OUTSIDE_ROOT',
    );

    assert.throws(
      () => applyWritebackRequest({ ...baseRequest, sourceVersion: 'sha256-stale' }, makeContext(root, operations)),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_STALE_SOURCE',
    );

    assert.throws(
      () => applyWritebackRequest({ ...baseRequest, operation: { type: 'unsupported' } }, makeContext(root, operations)),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_UNSUPPORTED_OPERATION',
    );

    assert.throws(
      () => applyWritebackRequest({
        ...baseRequest,
        target: { ...baseRequest.target, range: { start: { offset: 20 }, end: { offset: 10 } } },
      }, makeContext(root, operations)),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_MALFORMED_RANGE',
    );

    assert.throws(
      () => applyWritebackRequest({
        ...baseRequest,
        target: { ...baseRequest.target, anchor: { text: 'approved' } },
      }, makeContext(root, operations)),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_ANCHOR_MISMATCH',
    );

    assert.equal(readFileSync(sourcePath, 'utf8'), 'Decision: pending\n');
  });
});
