import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const WRITEBACK_CONTRACT_VERSION = 1;

export class WritebackContractError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'WritebackContractError';
    this.code = code;
    this.details = details;
    this.ok = false;
  }

  toJSON() {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function createSourceVersion(source) {
  return `sha256-${createHash('sha256').update(String(source)).digest('hex')}`;
}

export function sourcePathForWriteback(sourcePath, rootPath) {
  if (!sourcePath) {
    return null;
  }

  if (!rootPath) {
    return normalizePathForContract(sourcePath);
  }

  const root = resolve(rootPath);
  const resolvedSourcePath = resolve(sourcePath);
  const relativePath = relative(root, resolvedSourcePath);

  if (isOutsideRoot(relativePath)) {
    return null;
  }

  return normalizePathForContract(relativePath || '.');
}

export function applyWritebackRequest(request, context = {}) {
  const normalized = validateWritebackRequest(request, context);
  const source = readFileSync(normalized.absoluteSourcePath, 'utf8');
  const rangeText = source.slice(normalized.range.start.offset, normalized.range.end.offset);

  if (typeof normalized.target.anchor?.text === 'string' && normalized.target.anchor.text !== rangeText) {
    throw new WritebackContractError('Writeback anchor text does not match the current source range.', 'ERR_WRITEBACK_ANCHOR_MISMATCH', {
      sourcePath: normalized.sourcePath,
    });
  }

  const replacementResult = normalized.operationHandler({
    request: normalized.request,
    context,
    source,
    rangeText,
  });
  const replacement = replacementResult?.replacement;
  if (typeof replacement !== 'string') {
    throw new WritebackContractError('Writeback operation did not return a string replacement.', 'ERR_WRITEBACK_INVALID_OPERATION_RESULT', {
      operationType: normalized.request.operation.type,
    });
  }

  const nextSource = `${source.slice(0, normalized.range.start.offset)}${replacement}${source.slice(normalized.range.end.offset)}`;
  writeFileSync(normalized.absoluteSourcePath, nextSource, 'utf8');

  return {
    ok: true,
    sourcePath: normalized.sourcePath,
    sourceVersion: normalized.request.sourceVersion,
    nextSourceVersion: createSourceVersion(nextSource),
    range: normalized.range,
    operation: { type: normalized.request.operation.type },
  };
}

export function markdownTaskCheckboxWritebackOperation({ request, rangeText }) {
  if (!/^\[[ xX]\]$/.test(rangeText)) {
    throw new WritebackContractError(
      'Markdown checkbox writeback target no longer points at a task marker.',
      'ERR_WRITEBACK_MARKDOWN_CHECKBOX_CONFLICT',
    );
  }

  const checked = request.operation?.payload?.checked;
  if (typeof checked !== 'boolean') {
    throw new WritebackContractError(
      'Markdown checkbox writeback requires a boolean checked payload.',
      'ERR_WRITEBACK_MARKDOWN_CHECKBOX_PAYLOAD',
    );
  }

  return { replacement: checked ? '[x]' : '[ ]' };
}

export function validateWritebackRequest(request, context = {}) {
  if (context.editMode !== true) {
    throw new WritebackContractError('Writeback is available only in explicit edit/preview mode.', 'ERR_WRITEBACK_DISABLED');
  }

  if (context.localhost !== true) {
    throw new WritebackContractError('Writeback requests must originate from a localhost edit context.', 'ERR_WRITEBACK_NON_LOCAL');
  }

  if (!request || typeof request !== 'object') {
    throw new WritebackContractError('Writeback request must be an object.', 'ERR_WRITEBACK_MALFORMED_REQUEST');
  }

  const absoluteSourcePath = resolveWritebackSourcePath(request.sourcePath, context.rootPath);
  const sourcePath = sourcePathForWriteback(absoluteSourcePath, context.rootPath);
  if (!existsSync(absoluteSourcePath)) {
    throw new WritebackContractError('Writeback source file was not found.', 'ERR_WRITEBACK_SOURCE_NOT_FOUND', { sourcePath });
  }

  const source = readFileSync(absoluteSourcePath, 'utf8');
  const currentVersion = createSourceVersion(source);
  if (request.sourceVersion !== currentVersion) {
    throw new WritebackContractError('Writeback source version is stale.', 'ERR_WRITEBACK_STALE_SOURCE', {
      sourcePath,
      currentVersion,
      requestVersion: request.sourceVersion,
    });
  }

  const operationType = request.operation?.type;
  const operationHandler = context.operations?.[operationType];
  if (typeof operationType !== 'string' || typeof operationHandler !== 'function') {
    throw new WritebackContractError('Writeback operation type is not supported in this edit context.', 'ERR_WRITEBACK_UNSUPPORTED_OPERATION', {
      operationType,
    });
  }

  const range = normalizeSourceRange(request.target?.range, source.length);
  const target = request.target || {};
  if (!isSupportedWritebackTarget(target)) {
    throw new WritebackContractError('Writeback target must be a component-scoped agent-* element or a mapped Markdown task checkbox.', 'ERR_WRITEBACK_MALFORMED_TARGET');
  }

  return {
    request,
    absoluteSourcePath,
    sourcePath,
    range,
    target,
    operationHandler,
  };
}

function isSupportedWritebackTarget(target = {}) {
  if (typeof target.tagName !== 'string') {
    return false;
  }

  if (target.tagName.startsWith('agent-')) {
    return true;
  }

  return target.kind === 'markdown-task-checkbox' && target.tagName === 'input';
}

function resolveWritebackSourcePath(sourcePath, rootPath) {
  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    throw new WritebackContractError('Writeback context requires an active root path.', 'ERR_WRITEBACK_MISSING_ROOT');
  }

  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    throw new WritebackContractError('Writeback source path is required.', 'ERR_WRITEBACK_MALFORMED_REQUEST');
  }

  const root = resolve(rootPath);
  const absoluteSourcePath = isAbsolute(sourcePath) ? resolve(sourcePath) : resolve(root, sourcePath);
  const relativePath = relative(root, absoluteSourcePath);

  if (isOutsideRoot(relativePath)) {
    throw new WritebackContractError('Writeback source path must stay inside the active root.', 'ERR_WRITEBACK_PATH_OUTSIDE_ROOT', {
      sourcePath,
      rootPath: root,
    });
  }

  return absoluteSourcePath;
}

function normalizeSourceRange(range, sourceLength) {
  const start = normalizePoint(range?.start);
  const end = normalizePoint(range?.end);

  if (
    !Number.isInteger(start.offset) ||
    !Number.isInteger(end.offset) ||
    start.offset < 0 ||
    end.offset <= start.offset ||
    end.offset > sourceLength
  ) {
    throw new WritebackContractError('Writeback range must contain valid start/end offsets inside the source file.', 'ERR_WRITEBACK_MALFORMED_RANGE');
  }

  return { start, end };
}

function normalizePoint(point = {}) {
  const normalized = { offset: point.offset };

  if (Number.isInteger(point.line)) {
    normalized.line = point.line;
  }
  if (Number.isInteger(point.column)) {
    normalized.column = point.column;
  }

  return normalized;
}

function normalizePathForContract(pathValue) {
  return String(pathValue).split(sep).join('/');
}

function isOutsideRoot(relativePath) {
  return relativePath.startsWith('..') || isAbsolute(relativePath);
}
