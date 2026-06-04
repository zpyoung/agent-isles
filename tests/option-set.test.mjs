import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const bundle = resolve('dist/agent-components.js');

test('interactive island components are defined in the built bundle', () => {
  execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
  const code = readFileSync(bundle, 'utf8');
  assert.match(code, /customElements\.define\(["']agent-choice["']/);
  assert.match(code, /customElements\.define\(["']agent-option-set["']/);
  assert.match(code, /agent-isles:select/);
});
