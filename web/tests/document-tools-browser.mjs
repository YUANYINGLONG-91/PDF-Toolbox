import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { unzipSync } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
if (!executablePath) throw new Error('Set CHROME_PATH to an installed Chrome, Chromium, or Edge executable.');

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.json': 'application/json', '.map': 'application/json',
};
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

async function makeTextPdf(linesPerPage) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of linesPerPage) {
    const page = pdf.addPage([612, 792]);
    page.drawText(lines[0], { x: 62, y: 710, size: 24, font, color: rgb(0.08, 0.16, 0.14) });
    lines.slice(1).forEach((line, index) => page.drawText(line, { x: 62, y: 650 - index * 36, size: 15, font }));
  }
  return Buffer.from(await pdf.save());
}

async function extractText(bytes) {
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || '').join(' '));
    }
    return pages.join('\n');
  } finally {
    await task.destroy();
  }
}

function docxText(bytes) {
  const files = unzipSync(bytes);
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('DOCX document.xml is missing');
  return new TextDecoder().decode(xml).replace(/<[^>]+>/g, '');
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  const remoteRequests = [];
  const documentUploads = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/i.test(url) && !url.startsWith(origin)) remoteRequests.push(url);
    if (/^https?:/i.test(url) && request.method() !== 'GET') documentUploads.push(`${request.method()} ${url}`);
  });
  await page.addInitScript(() => localStorage.setItem('pdf-toolbox-language', 'en'));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.screenshot({ path: resolve(artifacts, 'tools-home-desktop.png'), fullPage: true });

  const imageData = await page.evaluate(() => {
    function makePage(second) {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#111111';
      context.textBaseline = 'alphabetic';
      context.font = 'bold 66px Arial, sans-serif';
      context.fillText(second ? 'SECOND IMAGE PAGE' : 'LOCAL OCR TEST', 100, 180);
      context.font = '48px Arial, sans-serif';
      context.fillText('English handwriting recognition', 100, 300);
      context.fillText('Private browser document tools', 100, 390);
      context.font = '58px "Microsoft YaHei", "SimSun", sans-serif';
      context.fillText('中文识别测试', 100, 540);
      context.fillText('本地文档处理', 100, 650);
      context.font = '42px Arial, sans-serif';
      context.fillText(second ? 'Images combine without enhancement.' : 'Searchable PDF and editable Word', 100, 790);
      return canvas.toDataURL('image/png');
    }
    return [makePage(false), makePage(true)];
  });
  const images = imageData.map((data, index) => ({
    name: `ocr-page-${index + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(data.split(',')[1], 'base64'),
  }));
  const scannedPdfDocument = await PDFDocument.create();
  const scannedImage = await scannedPdfDocument.embedPng(images[0].buffer);
  const scannedPage = scannedPdfDocument.addPage([620, 877]);
  scannedPage.drawImage(scannedImage, { x: 0, y: 0, width: 620, height: 877 });
  const scannedPdf = Buffer.from(await scannedPdfDocument.save());
  const textPdf = await makeTextPdf([
    ['QUARTERLY REPORT', 'Local document processing remains private.', 'This is the first page of editable text.'],
    ['SECOND SECTION', 'Merge split and organize PDF files.', 'The second page contains selectable text.'],
    ['THIRD SECTION', 'Render and compress documents locally.', 'No upload service is required.'],
  ]);
  const extraPdf = await makeTextPdf([['APPENDIX', 'One additional PDF page for merging.']]);
  const sourceDocx = await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun({ text: 'LOCAL WORD CONVERSION', bold: true, size: 36 })] }),
    new Paragraph('This DOCX is rendered into a PDF in the browser.'),
    new Paragraph('中文文档转换测试'),
  ] }] }));

  async function selectTool(tool) {
    await page.locator(`[data-tool="${tool}"]`).click();
    await page.waitForFunction(() => !document.getElementById('utilityView').hidden);
  }
  async function setFiles(files) {
    await page.locator('#utilityFiles').setInputFiles(files);
    await page.waitForFunction((count) => document.querySelectorAll('.utility-file-row').length === count, files.length);
  }
  async function runDownload(expectedName) {
    await page.waitForFunction(() => !document.getElementById('utilityRun').disabled, undefined, { timeout: 180000 });
    const pending = page.waitForEvent('download', { timeout: 300000 });
    await page.locator('#utilityRun').click();
    const download = await pending;
    if (download.suggestedFilename() !== expectedName) throw new Error(`Expected ${expectedName}, received ${download.suggestedFilename()}`);
    const bytes = await readFile(await download.path());
    await page.waitForFunction(() => document.getElementById('utilityStatus').classList.contains('success'), undefined, { timeout: 30000 });
    return bytes;
  }

  await selectTool('images');
  await setFiles(images);
  await page.locator('.utility-file-row').nth(1).locator('button').first().click();
  if (!(await page.locator('.utility-file-row strong').first().textContent()).includes('ocr-page-2')) throw new Error('Image ordering failed');
  await page.locator('#utilityFilename').fill('Direct album');
  const directPdf = await runDownload('Direct album.pdf');
  if ((await PDFDocument.load(directPdf)).getPageCount() !== 2) throw new Error('Direct image PDF does not have two pages');
  console.log('PASS direct multi-image PDF and ordering');

  await selectTool('merge');
  await setFiles([
    { name: 'main.pdf', mimeType: 'application/pdf', buffer: textPdf },
    { name: 'appendix.pdf', mimeType: 'application/pdf', buffer: extraPdf },
  ]);
  const merged = await runDownload('main-merged.pdf');
  if ((await PDFDocument.load(merged)).getPageCount() !== 4) throw new Error('Merged PDF does not have four pages');
  console.log('PASS PDF merge');

  await selectTool('split');
  await setFiles([{ name: 'main.pdf', mimeType: 'application/pdf', buffer: textPdf }]);
  await page.locator('#pageRangesInput').fill('1,3');
  const splitZip = await runDownload('main-pages.zip');
  const splitEntries = Object.entries(unzipSync(splitZip)).filter(([name]) => name.endsWith('.pdf'));
  if (splitEntries.length !== 2) throw new Error('Split ZIP does not contain two PDFs');
  for (const [, bytes] of splitEntries) if ((await PDFDocument.load(bytes)).getPageCount() !== 1) throw new Error('Split output has incorrect pages');
  console.log('PASS custom PDF split and ZIP output');

  await selectTool('organize');
  await setFiles([{ name: 'main.pdf', mimeType: 'application/pdf', buffer: textPdf }]);
  await page.waitForFunction(() => document.querySelectorAll('.organizer-card').length === 3 && !document.getElementById('utilityRun').disabled, undefined, { timeout: 120000 });
  await page.screenshot({ path: resolve(artifacts, 'tools-organizer-desktop.png'), fullPage: true });
  await page.locator('.organizer-card').nth(2).locator('button').nth(0).click();
  await page.locator('.organizer-card').nth(1).locator('button').nth(2).click();
  await page.locator('.organizer-card').nth(2).locator('button').nth(3).click();
  const organized = await runDownload('main-organized.pdf');
  const organizedPdf = await PDFDocument.load(organized);
  if (organizedPdf.getPageCount() !== 2 || organizedPdf.getPage(1).getRotation().angle !== 90) throw new Error('Organizer reorder/delete/rotation was not preserved');
  console.log('PASS visual page organizer');

  await selectTool('compress');
  await setFiles([{ name: 'main.pdf', mimeType: 'application/pdf', buffer: textPdf }]);
  const compressed = await runDownload('main-compressed.pdf');
  if ((await PDFDocument.load(compressed)).getPageCount() !== 3) throw new Error('Compressed PDF page count changed');
  console.log('PASS local PDF compression');

  await selectTool('render');
  await setFiles([{ name: 'main.pdf', mimeType: 'application/pdf', buffer: textPdf }]);
  const renderedZip = await runDownload('main-images.zip');
  const renderedEntries = Object.values(unzipSync(renderedZip));
  if (renderedEntries.length !== 3 || renderedEntries.some((bytes) => bytes[0] !== 0x89 || bytes[1] !== 0x50)) throw new Error('PDF rendering did not create three PNG images');
  console.log('PASS PDF to PNG ZIP');

  await selectTool('pdf-word');
  await setFiles([{ name: 'main.pdf', mimeType: 'application/pdf', buffer: textPdf }]);
  const editableDocx = await runDownload('main.docx');
  const editableText = docxText(editableDocx);
  if (!editableText.includes('QUARTERLY REPORT') || !editableText.includes('THIRD SECTION')) throw new Error('Embedded PDF text is missing from DOCX');
  console.log('PASS text PDF to editable DOCX');

  await selectTool('word-pdf');
  await setFiles([{ name: 'local-document.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: sourceDocx }]);
  const convertedDocx = await runDownload('local-document.pdf');
  if ((await PDFDocument.load(convertedDocx)).getPageCount() < 1) throw new Error('DOCX to PDF produced no pages');
  console.log('PASS DOCX to PDF');

  await selectTool('ocr');
  await setFiles([{ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: scannedPdf }]);
  const ocrPdf = await runDownload('scanned-ocr.pdf');
  const ocrText = await extractText(ocrPdf);
  if (!/LOCAL|OCR/.test(ocrText) || !/中文|识别|测试/.test(ocrText)) throw new Error(`Searchable OCR text is incomplete: ${ocrText}`);
  console.log('PASS Chinese and English searchable OCR PDF');

  await selectTool('pdf-word');
  await setFiles([{ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: scannedPdf }]);
  const scannedDocx = await runDownload('scanned.docx');
  const scannedText = docxText(scannedDocx);
  if (!/LOCAL|OCR/.test(scannedText) || !/中文|识别|测试/.test(scannedText)) throw new Error(`Scanned DOCX OCR text is incomplete: ${scannedText}`);
  console.log('PASS scanned PDF to editable DOCX with Chinese and English OCR');

  await selectTool('images');
  await page.locator('#languageButton').click();
  if (await page.locator('#utilityTitle').textContent() !== '将图片直接合并为 PDF') throw new Error('Utility Chinese localization did not refresh');
  await page.setViewportSize({ width: 390, height: 844 });
  await setFiles(images);
  await page.screenshot({ path: resolve(artifacts, 'tools-mobile-chinese.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('Mobile utility layout has horizontal overflow');
  console.log('PASS Chinese mobile utility layout');

  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  if (remoteRequests.length) throw new Error(`Unexpected remote requests: ${remoteRequests.join(', ')}`);
  if (documentUploads.length) throw new Error(`Unexpected upload requests: ${documentUploads.join(', ')}`);
  console.log('All browser document-tool tests passed. No remote requests, document uploads, or uncaught browser errors observed.');
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
