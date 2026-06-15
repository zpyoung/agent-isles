// tests/dev-open-browser.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { openerCommand, openBrowser } from '../scripts/dev/open-browser.mjs';

test('maps platform to opener command', () => {
  assert.equal(openerCommand('darwin'), 'open');
  assert.equal(openerCommand('linux'), 'xdg-open');
  assert.equal(openerCommand('win32'), 'cmd');
});

test('openBrowser spawns the opener with the url', () => {
  const calls = [];
  const spawnFn = (cmd, args) => { calls.push({ cmd, args }); return { on() {}, unref() {} }; };
  openBrowser('http://localhost:9/', { platform: 'darwin', spawnFn });
  assert.equal(calls[0].cmd, 'open');
  assert.deepEqual(calls[0].args, ['http://localhost:9/']);
});

test('win32 uses cmd /c start', () => {
  const calls = [];
  const spawnFn = (cmd, args) => { calls.push({ cmd, args }); return { on() {}, unref() {} }; };
  openBrowser('http://localhost:9/', { platform: 'win32', spawnFn });
  assert.deepEqual(calls[0].args, ['/c', 'start', '', 'http://localhost:9/']);
});
