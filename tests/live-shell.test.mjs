import assert from 'node:assert/strict';
import test from 'node:test';
import { injectLiveFrame, buildSidebar } from '../src/live-shell.mjs';

const PAGE = '<!doctype html><html><head><title>t</title></head><body><h1>Doc</h1></body></html>';

test('injectLiveFrame with one or zero screens emits no sidebar', () => {
  const out = injectLiveFrame(PAGE, { screens: [{ slug: 'a', name: 'a.md', title: 'A' }], activeSlug: 'a' });
  assert.doesNotMatch(out, /id="isles-sidebar"/);
  assert.match(out, /id="isles-header"/);
  assert.match(out, /id="isles-bar"/);
});

test('injectLiveFrame with two+ screens emits a sidebar with active highlight and slug script', () => {
  const screens = [
    { slug: 'a', name: 'a.md', title: 'A' },
    { slug: 'b', name: 'b.md', title: 'B' },
  ];
  const out = injectLiveFrame(PAGE, { screens, activeSlug: 'b' });
  assert.match(out, /id="isles-sidebar"/);
  assert.match(out, /href="\/a"/);
  assert.match(out, /href="\/b"/);
  assert.match(out, /<li class="active"><a href="\/b"/);
  assert.match(out, /window\.__ISLES_ACTIVE_SLUG="b"/);
});

test('buildSidebar escapes names and titles', () => {
  const html = buildSidebar([{ slug: 'x', name: '<x>.md', title: 'A&B' }], 'x');
  assert.match(html, /&lt;x&gt;\.md/);
  assert.match(html, /A&amp;B/);
});

test('injectLiveFrame inserts the client after the real </body>, not a literal inside a script', () => {
  const script = '<script>var s = "</body></html>"; foo();</script>';
  const page = `<!doctype html><html><head></head><body><h1>Doc</h1>${script}</body></html>`;
  const out = injectLiveFrame(page);
  assert.ok(out.includes(script), 'inlined script corrupted');
  assert.ok(out.indexOf('id="isles-bar"') > out.lastIndexOf('foo();</script>'));
});
