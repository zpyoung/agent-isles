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

test('interactive islands survive sanitized rendering', async () => {
  const { renderMarkdownString, RENDER_MODES } = await import('../src/render.mjs');
  const md = '# Pick\n\n<agent-option-set data-multiselect>\n<agent-choice id="a" title="A">x</agent-choice>\n</agent-option-set>\n';
  const { html } = await renderMarkdownString(md, {
    renderMode: RENDER_MODES.SANITIZED,
    includeUserPacks: false,
  });

  assert.match(html, /<agent-option-set/);
  assert.match(html, /<agent-choice/);
  assert.match(html, /data-multiselect/);
  assert.match(html, /id="(?:user-content-)?a"/);
});
