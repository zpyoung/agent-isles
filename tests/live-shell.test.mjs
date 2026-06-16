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

test('injectLiveFrame escapes < in the embedded active-slug script', () => {
  const out = injectLiveFrame('<html><head></head><body></body></html>', { activeSlug: '</script><x>' });
  assert.doesNotMatch(out, /<\/script><x>/);          // raw breakout must not appear
  assert.match(out, /__ISLES_ACTIVE_SLUG=/);
  assert.match(out, /\\u003c/);                          // < was escaped
});

test('injectLiveFrame inserts before the last </body> even with length-changing Unicode before it', () => {
  const page = '<!doctype html><html><head></head><body><p>İ</p></body></html>';
  const out = injectLiveFrame(page);
  // client/bar must land before the single real </body>, and the original char survives intact
  assert.ok(out.indexOf('id="isles-bar"') < out.lastIndexOf('</body>'));
  assert.ok(out.includes('<p>İ</p>'), 'original content corrupted by mis-aligned index');
});

test('buildSidebar includes data-mtime for updated-badge tracking', () => {
  const html = buildSidebar(
    [{ slug: 'a', name: 'a.md', title: 'A', mtimeMs: 123 }, { slug: 'b', name: 'b.md', title: 'B', mtimeMs: 456 }],
    'a',
  );
  assert.match(html, /data-mtime="123"/);
  assert.match(html, /data-mtime="456"/);
});
