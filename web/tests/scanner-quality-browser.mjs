import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
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

const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === 'string') throw new Error('Vite test server did not start');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage'] });
await mkdir(artifacts, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  const remoteRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:') && !url.startsWith('ws:')) remoteRequests.push(url);
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  const results = await page.evaluate(async () => {
    const { detectDocument, renderPage } = await import('/src/opencv.ts');
    const { fullFrameCorners } = await import('/src/geometry.ts');
    const toBlob = (canvas) => new Promise((resolveBlob, reject) => canvas.toBlob((value) => value ? resolveBlob(value) : reject(new Error('PNG encoding failed')), 'image/png'));
    const canvasSource = (width = 900, height = 1200) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return [canvas, canvas.getContext('2d', { alpha: false })];
    };
    const analyze = async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { alpha: false });
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let intermediate = 0;
      let samples = 0;
      let white = 0;
      let channelSpread = 0;
      let paperDark = 0;
      let paperSamples = 0;
      let faintMinimum = 255;
      let faintTone = 0;
      let faintSamples = 0;
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const offset = (y * canvas.width + x) * 4;
          const r = pixels[offset];
          const g = pixels[offset + 1];
          const b = pixels[offset + 2];
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          intermediate += Number(luminance > 15 && luminance < 245);
          white += Number(luminance > 245);
          channelSpread += Math.max(r, g, b) - Math.min(r, g, b);
          samples += 1;
          if (x > canvas.width * 0.1 && x < canvas.width * 0.9 && y > canvas.height * 0.025 && y < canvas.height * 0.075) {
            paperDark += Number(luminance < 225);
            paperSamples += 1;
          }
          if (x > canvas.width * 0.12 && x < canvas.width * 0.88 && y > canvas.height * 0.385 && y < canvas.height * 0.415) {
            faintMinimum = Math.min(faintMinimum, luminance);
            if (luminance < 250) {
              faintTone += luminance;
              faintSamples += 1;
            }
          }
        }
      }
      return {
        mime: blob.type,
        width: canvas.width,
        height: canvas.height,
        intermediateRatio: intermediate / samples,
        whiteRatio: white / samples,
        channelSpread: channelSpread / samples,
        paperDarkRatio: paperDark / Math.max(1, paperSamples),
        faintMinimum,
        faintMean: faintSamples ? faintTone / faintSamples : 255,
        dataUrl: canvas.toDataURL('image/png'),
      };
    };
    const estimateResidualSkew = async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const source = document.createElement('canvas');
      source.width = 240;
      source.height = 320;
      const sourceContext = source.getContext('2d', { alpha: false });
      sourceContext.fillStyle = 'white';
      sourceContext.fillRect(0, 0, 240, 320);
      sourceContext.drawImage(bitmap, 0, 0, 240, 320);
      bitmap.close();
      const rotated = document.createElement('canvas');
      rotated.width = 240;
      rotated.height = 320;
      const context = rotated.getContext('2d', { alpha: false, willReadFrequently: true });
      const score = (angle) => {
        context.fillStyle = 'white';
        context.fillRect(0, 0, 240, 320);
        context.save();
        context.translate(120, 160);
        context.rotate(angle * Math.PI / 180);
        context.translate(-120, -160);
        context.drawImage(source, 0, 0);
        context.restore();
        const pixels = context.getImageData(0, 0, 240, 320).data;
        const projection = Array.from({ length: 320 }, () => 0);
        for (let y = 10; y < 310; y += 1) {
          for (let x = 10; x < 230; x += 1) {
            const offset = (y * 240 + x) * 4;
            const luminance = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
            if (luminance < 190) projection[y] += 1;
          }
        }
        const mean = Math.max(1, projection.reduce((sum, value) => sum + value, 0) / projection.length);
        return projection.reduce((sum, value) => sum + (value - mean) ** 2, 0) / projection.length / (mean * mean);
      };
      let bestAngle = 0;
      let bestScore = -1;
      for (let angle = -5; angle <= 5; angle += 0.5) {
        const value = score(angle);
        if (value > bestScore) { bestAngle = angle; bestScore = value; }
      }
      return bestAngle;
    };
    const render = async (source, corners, mode = 'bw') => {
      const sourceUrl = URL.createObjectURL(source);
      try {
        const rendered = await renderPage({
          id: crypto.randomUUID(), name: 'Synthetic', sourceUrl,
          width: 900, height: 1200, rotation: 0, corners,
          mode, strength: 70, detected: Boolean(corners),
        }, 1200, 0.95);
        return analyze(rendered.blob);
      } finally {
        URL.revokeObjectURL(sourceUrl);
      }
    };

    const [lowCanvas, low] = canvasSource();
    const background = low.createLinearGradient(0, 0, 900, 1200);
    background.addColorStop(0, '#c2c0b9');
    background.addColorStop(1, '#aaa79f');
    low.fillStyle = background;
    low.fillRect(0, 0, 900, 1200);
    low.beginPath();
    low.moveTo(120, 100);
    low.lineTo(790, 135);
    low.lineTo(755, 1090);
    low.lineTo(95, 1050);
    low.closePath();
    low.save();
    low.clip();
    const paper = low.createLinearGradient(100, 100, 750, 1100);
    paper.addColorStop(0, '#f0efe9');
    paper.addColorStop(0.55, '#e3e2dc');
    paper.addColorStop(1, '#cfcec7');
    low.fillStyle = paper;
    low.fillRect(70, 70, 760, 1060);
    low.restore();
    low.fillStyle = '#b5b2aa';
    for (let y = 190; y < 1000; y += 95) {
      low.beginPath();
      low.arc(116 - y * 0.015, y, 12, 0, Math.PI * 2);
      low.fill();
    }
    low.strokeStyle = '#777a76';
    low.lineWidth = 3;
    low.strokeRect(205, 310, 470, 500);
    low.fillStyle = '#35423d';
    low.font = '32px sans-serif';
    low.fillText('Low contrast outer page', 190, 220);
    const lowSource = await toBlob(lowCanvas);
    const lowCorners = await detectDocument(lowSource);
    const expected = [[120 / 900, 100 / 1200], [790 / 900, 135 / 1200], [755 / 900, 1090 / 1200], [95 / 900, 1050 / 1200]];
    const cornerError = lowCorners ? Math.max(...lowCorners.flatMap((point, index) => [Math.abs(point.x - expected[index][0]), Math.abs(point.y - expected[index][1])])) : null;

    const [borderCanvas, border] = canvasSource();
    border.fillStyle = '#eeeDE8';
    border.fillRect(0, 0, 900, 1200);
    border.strokeStyle = '#555b57';
    border.lineWidth = 4;
    border.strokeRect(70, 150, 760, 900);
    border.fillStyle = '#3d4541';
    border.font = '30px sans-serif';
    border.fillText('Paper touches every image edge', 170, 90);
    const borderCorners = await detectDocument(await toBlob(borderCanvas));
    const borderArea = borderCorners ? Math.abs(borderCorners.reduce((area, point, index) => {
      const next = borderCorners[(index + 1) % 4];
      return area + point.x * next.y - next.x * point.y;
    }, 0)) / 2 : 1;

    const [safetyCanvas, safety] = canvasSource();
    safety.fillStyle = '#e9e6de';
    safety.fillRect(0, 0, 900, 1200);
    safety.fillStyle = 'rgba(67, 61, 52, 0.28)';
    safety.strokeStyle = 'rgba(55, 50, 44, 0.55)';
    safety.lineWidth = 5;
    safety.beginPath();
    safety.moveTo(0, 0);
    safety.lineTo(900, 0);
    safety.lineTo(900, 1200);
    safety.lineTo(180, 1165);
    safety.closePath();
    safety.fill();
    safety.stroke();
    safety.fillStyle = '#35423d';
    safety.font = '30px sans-serif';
    safety.fillText('Do not cut off this corner', 25, 1110);
    const safetyCorners = await detectDocument(await toBlob(safetyCanvas));
    const safetyArea = safetyCorners ? Math.abs(safetyCorners.reduce((area, point, index) => {
      const next = safetyCorners[(index + 1) % 4];
      return area + point.x * next.y - next.x * point.y;
    }, 0)) / 2 : 1;

    const [qualityCanvas, quality] = canvasSource();
    const illumination = quality.createLinearGradient(0, 0, 900, 1200);
    illumination.addColorStop(0, '#f4f3ef');
    illumination.addColorStop(0.5, '#deddd7');
    illumination.addColorStop(1, '#aeadA7');
    quality.fillStyle = illumination;
    quality.fillRect(0, 0, 900, 1200);
    quality.fillStyle = '#26332e';
    quality.font = '34px sans-serif';
    quality.fillText('Fine handwriting and thin lines', 110, 180);
    quality.strokeStyle = 'rgba(45, 50, 48, 0.28)';
    quality.lineWidth = 1.4;
    quality.beginPath();
    quality.moveTo(110, 480);
    quality.bezierCurveTo(280, 462, 480, 498, 790, 476);
    quality.stroke();
    quality.strokeStyle = 'rgba(50, 55, 52, 0.52)';
    quality.lineWidth = 1;
    for (let x = 160; x <= 760; x += 100) {
      quality.beginPath(); quality.moveTo(x, 650); quality.lineTo(x, 850); quality.stroke();
    }
    for (let y = 650; y <= 850; y += 50) {
      quality.beginPath(); quality.moveTo(160, y); quality.lineTo(760, y); quality.stroke();
    }
    const qualityResult = await render(await toBlob(qualityCanvas), fullFrameCorners());

    const [skewCanvas, skew] = canvasSource();
    skew.fillStyle = '#f2f1ec';
    skew.fillRect(0, 0, 900, 1200);
    skew.save();
    skew.translate(450, 600);
    skew.rotate(3 * Math.PI / 180);
    skew.translate(-450, -600);
    skew.strokeStyle = '#26332e';
    skew.lineWidth = 4;
    for (let y = 220; y <= 940; y += 45) {
      skew.beginPath(); skew.moveTo(140, y); skew.lineTo(760, y); skew.stroke();
    }
    skew.restore();
    const skewResult = await render(await toBlob(skewCanvas), fullFrameCorners());
    const residualSkew = await estimateResidualSkew(await (await fetch(skewResult.dataUrl)).blob());

    const [blankCanvas, blank] = canvasSource(240, 320);
    blank.fillStyle = '#92918c';
    blank.fillRect(0, 0, 240, 320);
    const blankSource = await toBlob(blankCanvas);
    const blankCorners = await detectDocument(blankSource);
    const blankUrl = URL.createObjectURL(blankSource);
    let blankMime;
    try {
      const blankResult = await renderPage({
        id: crypto.randomUUID(), name: 'Blank', sourceUrl: blankUrl,
        width: 240, height: 320, rotation: 0, corners: blankCorners ?? fullFrameCorners(),
        mode: 'bw', strength: 70, detected: Boolean(blankCorners),
      }, 600, 0.9);
      blankMime = blankResult.blob.type;
    } finally {
      URL.revokeObjectURL(blankUrl);
    }
    return { lowCorners, cornerError, borderCorners, borderArea, safetyCorners, safetyArea, qualityResult, skewResult, residualSkew, blankCorners, blankMime };
  });

  if (results.cornerError === null || results.cornerError > 0.09) throw new Error(`Low-contrast outer paper detection failed: ${JSON.stringify(results.lowCorners)}`);
  if (results.borderArea < 0.90) throw new Error(`Border-touching paper was cropped to an interior object: ${results.borderArea}`);
  if (results.safetyArea < 0.94) throw new Error(`A border-clamped diagonal could cut off writing: ${JSON.stringify(results.safetyCorners)}`);
  const quality = results.qualityResult;
  if (quality.mime !== 'image/png') throw new Error(`B&W engine output should be PNG, received ${quality.mime}`);
  if (quality.paperDarkRatio > 0.01 || quality.whiteRatio < 0.70) throw new Error(`Paper cleanup left excessive noise: ${JSON.stringify(quality)}`);
  if (quality.faintMinimum > 225) throw new Error(`Faint stroke was lost: minimum ${quality.faintMinimum}`);
  if (quality.faintMean < 25) throw new Error(`Faint stroke was crushed to black: mean ${quality.faintMean}`);
  if (quality.intermediateRatio < 0.0001 || quality.channelSpread > 0.01) throw new Error('B&W output lost antialiasing or gained a color cast');
  await writeFile(resolve(artifacts, 'synthetic-quality.png'), Buffer.from(quality.dataUrl.split(',')[1], 'base64'));
  await writeFile(resolve(artifacts, 'synthetic-deskew.png'), Buffer.from(results.skewResult.dataUrl.split(',')[1], 'base64'));
  delete quality.dataUrl;
  delete results.skewResult.dataUrl;
  if (Math.abs(results.residualSkew) > 0.75) throw new Error(`A 3-degree skew was not corrected: residual ${results.residualSkew}`);
  if (results.blankMime !== 'image/png') throw new Error('Blank/full-page fallback did not render as B&W PNG');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  if (remoteRequests.length) throw new Error(`Unexpected remote requests: ${remoteRequests.join(', ')}`);
  console.log('Scanner quality checks passed:', JSON.stringify(results));
  console.log('Covered low-contrast outer detection, holes/interior rectangles, border paper, diagonal crop safety, faint strokes, clean paper, antialiasing, skew rendering, and blank fallback.');
} finally {
  await browser.close();
  await server.close();
}
