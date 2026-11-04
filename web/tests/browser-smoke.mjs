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
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  if (remoteRequests.length) throw new Error(`Unexpected remote requests: ${remoteRequests.join(', ')}`);
  console.log(`Browser smoke test passed: import, crop handles, enhancement, rotation, reorder, Chinese UI, mobile layout, and ${pdf.getPageCount()}-page PDF.`);
  console.log('No remote requests or uncaught browser errors observed.');
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
