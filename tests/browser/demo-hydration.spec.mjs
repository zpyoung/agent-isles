import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const distDir = resolve('dist');
const artifactDir = resolve(distDir, 'browser-smoke-artifacts');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);
const expectedCustomElements = [
  'agent-decision',
  'agent-risk',
  'agent-gantt',
  'agent-gantt-phase',
  'agent-gantt-task',
  'agent-dependency-map',
  'agent-dependency',
];

test('rendered demo loads without console errors and hydrates agent components', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  try {
    await page.goto(`${server.origin}/demo.html`);

    await expect(page.locator('h1')).toContainText('Agent Isles Demo');

    const renderedAgentTags = await page
      .locator('agent-decision, agent-risk, agent-gantt, agent-gantt-phase, agent-gantt-task, agent-dependency-map, agent-dependency')
      .evaluateAll((elements) => [
        ...new Set(elements.map((element) => element.localName)),
      ]);
    expect(renderedAgentTags).toEqual(expect.arrayContaining(expectedCustomElements));

    for (const tag of expectedCustomElements) {
      await expect
        .poll(() => page.evaluate((customElementTag) => Boolean(customElements.get(customElementTag)), tag))
        .toBe(true);
    }

    const decision = page.locator('agent-decision').first();
    await expect
      .poll(() => decision.evaluate((element) => Boolean(element.shadowRoot?.querySelector('.decision'))))
      .toBe(true);
    await expect(decision).toContainText('Use Markdown islands');

    const risk = page.locator('agent-risk').first();
    await expect
      .poll(() => risk.evaluate((element) => Boolean(element.shadowRoot?.querySelector('.risk'))))
      .toBe(true);
    await expect(risk).toContainText('Raw HTML is a trust boundary');

    const gantt = page.locator('agent-gantt').first();
    await expect
      .poll(() => gantt.evaluate((element) => Boolean(element.shadowRoot?.querySelector('[role="grid"]'))))
      .toBe(true);
    await expect(gantt).toContainText('Components + Storybook');

    const firstTask = page.locator('agent-gantt-task').first();
    await expect
      .poll(() => firstTask.evaluate((element) => Boolean(element.shadowRoot?.querySelector('details summary'))))
      .toBe(true);
    await firstTask.locator('summary').click();
    await expect(firstTask.locator('details')).toContainText('2 wks — was 8 wks');

    const dependencyMap = page.locator('agent-dependency-map').first();
    await expect(dependencyMap).toBeVisible();
    await expect
      .poll(() => dependencyMap.evaluate((element) => Boolean(element.shadowRoot?.querySelector('svg.edges'))))
      .toBe(true);
    await expect
      .poll(() => dependencyMap.evaluate((element) => element.shadowRoot?.querySelectorAll('path').length || 0))
      .toBeGreaterThan(0);

    const editServer = page.locator('agent-dependency#edit-server').first();
    const sourceMetadata = page.locator('agent-dependency#source-metadata').first();
    await expect(editServer).toBeVisible();
    await expect(sourceMetadata).toBeVisible();
    await expect(sourceMetadata).toHaveAttribute('aria-label', /Blocked by: Edit server/i);

    const editBox = await editServer.boundingBox();
    const blockedBox = await sourceMetadata.boundingBox();
    expect(editBox).not.toBeNull();
    expect(blockedBox).not.toBeNull();
    expect(blockedBox.y).toBeGreaterThan(editBox.y);

    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: resolve(artifactDir, 'demo-hydrated.png'), fullPage: true });

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});

async function serveDist() {
  const server = createServer((request, response) => {
    void handleStaticRequest(request, response).catch((error) => {
      response.writeHead(500);
      response.end(error.message);
    });
  });

  await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });

  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    }),
  };
}

async function handleStaticRequest(request, response) {
  let pathname;
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://agent-isles.local');
    pathname = requestUrl.pathname === '/' ? '/demo.html' : decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  const filePath = resolve(distDir, `.${pathname}`);
  const relativePath = relative(distDir, filePath);

  if (relativePath.startsWith('..') || relativePath === '' || resolve(filePath) === distDir) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(500);
    response.end(error.message);
  }
}
