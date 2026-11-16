import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, PDFName, PDFStream } from 'pdf-lib';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const artifacts = fileURLToPath(new URL('../test-output/', import.meta.url));
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) {
  throw new Error('Set CHROME_PATH to an installed Chrome, Chromium, or Edge executable, then rerun npm run test:browser.');
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(resolve(dist) + sep) && file !== resolve(dist, 'index.html')) throw new Error('Invalid path');
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage'] });
await mkdir(artifacts, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  const remoteRequests = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) remoteRequests.push(url);
  });
  await page.addInitScript(() => localStorage.setItem('pdf-toolbox-language', 'en'));
  await page.goto(origin, { waitUntil: 'networkidle' });
  if (await page.locator('#fileInput').getAttribute('capture') !== null) throw new Error('Camera capture must not be enabled');
  const scene = page.locator('[data-visual-scene]');
  await page.waitForFunction(() => document.querySelector('[data-visual-scene]')?.dataset.webgl === 'ready');
  if (await scene.locator('canvas').count() !== 1) throw new Error('Expected one WebGL scanner canvas');
  await page.screenshot({ path: resolve(artifacts, 'home-3d-desktop.png'), fullPage: true });
  const sceneBounds = await scene.boundingBox();
  if (!sceneBounds) throw new Error('Desktop scanner scene is not visible');
  await page.mouse.move(sceneBounds.x + sceneBounds.width * 0.55, sceneBounds.y + sceneBounds.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(sceneBounds.x + sceneBounds.width * 0.72, sceneBounds.y + sceneBounds.height * 0.5, { steps: 6 });
  await page.mouse.up();
  if (!await scene.getAttribute('data-rotation')) throw new Error('Desktop scanner drag did not rotate the model');

  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    context.fillStyle = '#b8b1a4';
    context.fillRect(0, 0, 900, 1200);
    context.fillStyle = '#fffef7';
    context.beginPath();
    context.moveTo(120, 100);
    context.lineTo(790, 135);
    context.lineTo(755, 1090);
    context.lineTo(95, 1050);
    context.closePath();
    context.fill();
    context.fillStyle = '#263a35';
    context.font = 'bold 42px sans-serif';
    context.fillText('LOCAL SCAN TEST', 175, 245);
    context.font = '28px sans-serif';
    ['Handwriting stays sharp.', 'No uploads. No telemetry.', 'Perspective correction works.', 'Page 1 / Browser smoke test'].forEach((line, index) => context.fillText(line, 175, 360 + index * 100));
    context.strokeStyle = '#315a81';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(180, 820);
    context.bezierCurveTo(280, 730, 370, 920, 520, 810);
    context.stroke();
    return canvas.toDataURL('image/png');
  });
  const imageBuffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.locator('#fileInput').setInputFiles({ name: 'field-notes.png', mimeType: 'image/png', buffer: imageBuffer });
  await page.waitForFunction(() => document.getElementById('globalProgress').hidden && !document.getElementById('workspace').hidden, undefined, { timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('cropImage').naturalWidth > 0);
  await page.waitForFunction(() => {
    const image = document.getElementById('resultImage');
    return image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0 && document.getElementById('stageLoading').hidden;
  }, undefined, { timeout: 120000 });
  if (await page.locator('#resultTab').getAttribute('aria-selected') !== 'true') throw new Error('Enhanced scan should be shown after import');
  if (await page.locator('[data-mode="bw"]').getAttribute('aria-pressed') !== 'true') throw new Error('First import should default to B&W');
  const firstMime = await page.evaluate(async () => (await (await fetch(document.getElementById('resultImage').src)).blob()).type);
  if (firstMime !== 'image/png') throw new Error(`B&W preview should be PNG, received ${firstMime}`);
  if (await page.locator('#pageCount').textContent() !== '1') throw new Error('First image was not imported');
  if (await page.locator('#toast').isVisible()) await page.locator('#toastClose').click();
  await page.screenshot({ path: resolve(artifacts, 'desktop-enhanced.png'), fullPage: true });
  await page.locator('#cropTab').click();
  await page.screenshot({ path: resolve(artifacts, 'desktop-crop.png'), fullPage: true });

  await page.locator('#resultTab').click();
  await page.waitForFunction(() => {
    const image = document.getElementById('resultImage');
    return image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0 && document.getElementById('stageLoading').hidden;
  }, undefined, { timeout: 120000 });
  const firstResult = await page.locator('#resultImage').getAttribute('src');
  await page.locator('[data-mode="color"]').click();
  await page.waitForFunction((previous) => document.getElementById('resultImage').src !== previous && document.getElementById('stageLoading').hidden, firstResult, { timeout: 120000 });
  const colorMime = await page.evaluate(async () => (await (await fetch(document.getElementById('resultImage').src)).blob()).type);
  if (colorMime !== 'image/jpeg') throw new Error(`Color preview should remain JPEG, received ${colorMime}`);
  const colorResult = await page.locator('#resultImage').getAttribute('src');
  await page.locator('[data-mode="gray"]').click();
  await page.waitForFunction((previous) => document.getElementById('resultImage').src !== previous || !document.getElementById('toast').hidden, colorResult, { timeout: 120000 });
  if (await page.locator('#toast').isVisible()) throw new Error(`Enhancement failed: ${await page.locator('#toastText').textContent()}`);
  await page.waitForFunction(() => document.getElementById('stageLoading').hidden, undefined, { timeout: 120000 });
  const grayMime = await page.evaluate(async () => (await (await fetch(document.getElementById('resultImage').src)).blob()).type);
  if (grayMime !== 'image/jpeg') throw new Error(`Gray preview should remain JPEG, received ${grayMime}`);
  const grayResult = await page.locator('#resultImage').getAttribute('src');
  await page.locator('[data-mode="bw"]').click();
  await page.waitForFunction((previous) => document.getElementById('resultImage').src !== previous && document.getElementById('stageLoading').hidden, grayResult, { timeout: 120000 });
  await page.locator('#rotateRightButton').click();
  await page.waitForFunction(() => document.getElementById('stageLoading').hidden && document.getElementById('cropImage').naturalWidth > 0, undefined, { timeout: 120000 });

  await page.locator('#cropTab').click();
  await page.waitForFunction(() => document.getElementById('stageLoading').hidden);
  const handle = await page.locator('.corner-hit').first().boundingBox();
  if (!handle) throw new Error('Crop handle is not visible');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 12, handle.y + handle.height / 2 + 8, { steps: 4 });
  await page.mouse.up();

  await page.locator('#fileInput').setInputFiles({ name: 'second-page.png', mimeType: 'image/png', buffer: imageBuffer });
  await page.waitForFunction(() => document.getElementById('pageCount').textContent === '2' && document.getElementById('globalProgress').hidden, { timeout: 120000 });
  await page.locator('#pageList .page-item').nth(1).locator('.page-thumb').click();
  await page.waitForFunction(() => document.getElementById('stageLoading').hidden, undefined, { timeout: 120000 });
  if (await page.locator('[data-mode="bw"]').getAttribute('aria-pressed') !== 'true') throw new Error('Every appended page should default to B&W');
  await page.locator('#resultTab').click();
  await page.waitForFunction(() => document.getElementById('stageLoading').hidden && document.getElementById('resultImage').naturalWidth > 0, undefined, { timeout: 120000 });
  const secondResult = await page.locator('#resultImage').getAttribute('src');
  await page.locator('[data-mode="gray"]').click();
  await page.waitForFunction((previous) => document.getElementById('resultImage').src !== previous && document.getElementById('stageLoading').hidden, secondResult, { timeout: 120000 });
  await page.locator('#pageList .page-item').nth(1).locator('.page-controls button').first().click();
  await page.locator('#filenameInput').fill('Browser smoke test');
  const downloadPromise = page.waitForEvent('download', { timeout: 180000 });
  await page.locator('#exportButton').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const pdfBytes = await readFile(downloadPath);
  const pdf = await PDFDocument.load(pdfBytes);
  if (pdf.getPageCount() !== 2) throw new Error(`Expected a 2-page PDF, received ${pdf.getPageCount()}`);
  const imageFilters = pdf.context.enumerateIndirectObjects()
    .filter(([, object]) => object instanceof PDFStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
    .map(([, image]) => String(image.dict.get(PDFName.of('Filter'))));
  if (!imageFilters.includes('/DCTDecode')) throw new Error(`Gray page image should use JPEG: ${imageFilters.join(', ')}`);
  if (!imageFilters.includes('/FlateDecode')) throw new Error(`B&W page image should use lossless PNG data: ${imageFilters.join(', ')}`);
  if (download.suggestedFilename() !== 'Browser smoke test.pdf') throw new Error('PDF filename was not preserved');

  await page.locator('#languageButton').click();
  if (await page.locator('html').getAttribute('lang') !== 'zh-CN') throw new Error('Language switch failed');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(artifacts, 'mobile-workspace.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('Mobile layout has horizontal overflow');

  const observePage = (extraPage) => {
    extraPage.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
    extraPage.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) remoteRequests.push(url);
    });
  };
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.25, isMobile: true, hasTouch: true });
  observePage(mobilePage);
  await mobilePage.addInitScript(() => localStorage.setItem('pdf-toolbox-language', 'en'));
  await mobilePage.goto(origin, { waitUntil: 'networkidle' });
  await mobilePage.waitForFunction(() => document.querySelector('[data-visual-scene]')?.dataset.webgl === 'ready');
  const mobileScene = mobilePage.locator('[data-visual-scene]');
  if (await mobileScene.locator('canvas').evaluate((canvas) => getComputedStyle(canvas).touchAction) !== 'pan-y') throw new Error('Mobile scanner must preserve vertical scrolling');
  await mobilePage.screenshot({ path: resolve(artifacts, 'home-3d-mobile.png'), fullPage: true });
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('Mobile home has horizontal overflow');
  const mobileBounds = await mobileScene.boundingBox();
  if (!mobileBounds) throw new Error('Mobile scanner scene is not visible');
  const cdp = await mobilePage.context().newCDPSession(mobilePage);
  const touchX = mobileBounds.x + mobileBounds.width * 0.5;
  const touchY = Math.min(mobileBounds.y + mobileBounds.height * 0.45, 700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX + 70, y: touchY + 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (!await mobileScene.getAttribute('data-rotation')) throw new Error('Mobile horizontal drag did not rotate the model');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] });
  for (let step = 1; step <= 5; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX, y: touchY - step * 35 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobilePage.waitForFunction(() => window.scrollY > 0);
  await mobilePage.close();

  const reducedPage = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  observePage(reducedPage);
  await reducedPage.goto(origin, { waitUntil: 'networkidle' });
  await reducedPage.waitForFunction(() => document.querySelector('[data-visual-scene]')?.dataset.webgl === 'ready');
  const reducedScene = reducedPage.locator('[data-visual-scene]');
  const reducedFirst = await reducedScene.screenshot();
  await reducedPage.waitForTimeout(350);
  const reducedSecond = await reducedScene.screenshot();
  if (!reducedFirst.equals(reducedSecond)) throw new Error('Reduced-motion scanner should render a static frame');
  await reducedPage.screenshot({ path: resolve(artifacts, 'home-3d-reduced.png'), fullPage: true });
  await reducedPage.close();

  const fallbackBrowser = await chromium.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage', '--disable-webgl'] });
  try {
    const fallbackPage = await fallbackBrowser.newPage({ viewport: { width: 1280, height: 900 } });
    observePage(fallbackPage);
    await fallbackPage.goto(origin, { waitUntil: 'networkidle' });
    await fallbackPage.waitForFunction(() => document.querySelector('[data-visual-scene]')?.dataset.webgl === 'fallback');
    if (await fallbackPage.locator('[data-visual-scene] canvas').count()) throw new Error('WebGL fallback should not leave a canvas behind');
    if (!await fallbackPage.locator('.scanner-fallback').isVisible()) throw new Error('Static scanner fallback is not visible');
    await fallbackPage.screenshot({ path: resolve(artifacts, 'home-3d-fallback.png'), fullPage: true });
  } finally {
    await fallbackBrowser.close();
  }

  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  if (remoteRequests.length) throw new Error(`Unexpected remote requests: ${remoteRequests.join(', ')}`);
  console.log(`Browser smoke test passed: WebGL scanner, desktop/mobile rotation, touch scrolling, reduced motion, WebGL fallback, import, crop handles, enhancement, rotation, reorder, Chinese UI, mobile layout, and ${pdf.getPageCount()}-page PDF.`);
  console.log('No remote requests or uncaught browser errors observed.');
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
