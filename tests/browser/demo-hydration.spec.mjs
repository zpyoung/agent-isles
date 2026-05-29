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
  'agent-metric',
  'agent-delta',
  'agent-kpi',
  'agent-copy-block',
  'agent-tabs',
  'agent-tab',
  'agent-timeline',
  'agent-step',
  'agent-gantt',
  'agent-gantt-phase',
  'agent-gantt-task',
  'agent-status-board',
  'agent-status-item',
  'agent-dependency-map',
  'agent-dependency',
  'agent-action-list',
  'agent-action',
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

    const galleryExamples = page.locator('.agent-component-example');
    await expect(galleryExamples).toHaveCount(11);
    const firstGallery = galleryExamples.first();
    const renderedPane = firstGallery.locator('.agent-component-rendered');
    const sourcePane = firstGallery.locator('.agent-component-source-card');
    await expect(renderedPane).toBeVisible();
    await expect(sourcePane).toBeVisible();
    const desktopRenderedBox = await renderedPane.boundingBox();
    const desktopSourceBox = await sourcePane.boundingBox();
    expect(desktopRenderedBox).not.toBeNull();
    expect(desktopSourceBox).not.toBeNull();
    expect(desktopSourceBox.x).toBeGreaterThan(desktopRenderedBox.x);
    expect(Math.abs(desktopSourceBox.y - desktopRenderedBox.y)).toBeLessThan(4);
    await page.setViewportSize({ width: 390, height: 900 });
    const mobileRenderedBox = await renderedPane.boundingBox();
    const mobileSourceBox = await sourcePane.boundingBox();
    expect(mobileRenderedBox).not.toBeNull();
    expect(mobileSourceBox).not.toBeNull();
    expect(mobileSourceBox.y).toBeGreaterThan(mobileRenderedBox.y);
    await page.setViewportSize({ width: 1280, height: 720 });

    const renderedAgentTags = await page
      .locator(expectedCustomElements.join(', '))
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
    await expect(decision).toContainText('Ship the report format');

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

    const statusBoard = page.locator('agent-status-board').first();
    await expect
      .poll(() => statusBoard.evaluate((element) => Boolean(element.shadowRoot?.querySelector('.agent-status-summary'))))
      .toBe(true);
    await expect(statusBoard).toContainText('Project health');
    await expect(statusBoard).toContainText('Overall Amber');

    const writebackItem = page.locator('agent-status-item[label="Writeback"]');
    await expect
      .poll(() => writebackItem.evaluate((element) => Boolean(element.shadowRoot?.querySelector('.status-item'))))
      .toBe(true);
    await expect(writebackItem).toContainText('Blocked on API boundary decision');
    await writebackItem.evaluate((element) => element.setAttribute('history', 'g,g,a,'));
    await expect
      .poll(() => writebackItem.evaluate((element) => element.shadowRoot?.querySelectorAll('.trend-chip').length || 0))
      .toBe(3);

    await statusBoard.evaluate((element) => element.setAttribute('group-by', 'none'));
    await expect
      .poll(() => statusBoard.evaluate((element) => [...element.querySelectorAll('agent-status-item')].every((item) => item.slot === '')))
      .toBe(true);
    await statusBoard.evaluate((element) => element.setAttribute('group-by', 'status'));
    await expect
      .poll(() => statusBoard.evaluate((element) => [...element.querySelectorAll('agent-status-item')].every((item) => item.slot === `status-${item.getAttribute('status')}`)))
      .toBe(true);

    const dependencyMap = page.locator('agent-dependency-map').first();
    await expect(dependencyMap).toBeVisible();
    await expect
      .poll(() => dependencyMap.evaluate((element) => Boolean(element.shadowRoot?.querySelector('svg.edges'))))
      .toBe(true);
    await expect
      .poll(() => dependencyMap.evaluate((element) => element.shadowRoot?.querySelectorAll('svg.edges > path[marker-end]').length || 0))
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
