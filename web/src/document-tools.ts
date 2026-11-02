import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { Worker as OcrWorker } from 'tesseract.js';
import { canvasToBlob, normalizeImage } from './image';
import { fitWithin } from './pdf';

export type OcrLanguage = 'eng' | 'chi_sim' | 'chi_sim+eng';
export type ProgressCallback = (current: number, total: number) => void;
export type DirectImagePageSize = 'a4' | 'letter' | 'image';

type RenderedPdfPage = {
  canvas: HTMLCanvasElement;
  scale: number;
  width: number;
  height: number;
};

type OcrWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  lineKey: string;
};

const noop = () => undefined;
const assetUrl = (path: string) => new URL(`./${path}`, document.baseURI).href;
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const pdfTasks = new WeakMap<PDFDocumentProxy, PDFDocumentLoadingTask>();

function requireFiles(files: File[], extensions: string[]): void {
  if (!files.length) throw new Error('Choose at least one file.');
  for (const file of files) {
    if (!file.size) throw new Error(`${file.name || 'The selected file'} is empty.`);
    if (!extensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      throw new Error(`Unsupported file: ${file.name}. Expected ${extensions.join(' or ')}.`);
    }
  }
}

async function pdfJs() {
  const library = await import('pdfjs-dist');
  if (!library.GlobalWorkerOptions.workerSrc) {
    library.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  }
  return library;
}

async function openPdf(file: File): Promise<PDFDocumentProxy> {
  requireFiles([file], ['.pdf']);
  const library = await pdfJs();
  const loadingTask = library.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: assetUrl('pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('pdfjs/standard_fonts/'),
    wasmUrl: assetUrl('pdfjs/wasm/'),
  });
  const pdf = await loadingTask.promise;
  pdfTasks.set(pdf, loadingTask);
  return pdf;
}

async function destroyPdf(pdf: PDFDocumentProxy): Promise<void> {
  const loadingTask = pdfTasks.get(pdf);
  if (loadingTask) await loadingTask.destroy();
  else await pdf.cleanup();
}

async function renderPdfPage(page: PDFPageProxy, scale: number): Promise<RenderedPdfPage> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas is unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
  return { canvas, scale, width: viewport.width / scale, height: viewport.height / scale };
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

async function newPdf() {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setCreator('PDF Toolbox Web Edition');
  pdf.setProducer('PDF Toolbox Web Edition — local browser processing');
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());
  return pdf;
}

export function parsePageRanges(input: string, pageCount: number): number[][] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('The PDF has no pages.');
  const entries = input.split(/[,，;；]/).map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) throw new Error('Enter page ranges, for example 1-3,5,8-10.');
  return entries.map((entry) => {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(entry);
    if (!match) throw new Error(`Invalid page range: ${entry}`);
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`Page range ${entry} is outside 1-${pageCount}.`);
    }
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
}

export async function mergePdfFiles(files: File[]): Promise<Uint8Array> {
  requireFiles(files, ['.pdf']);
  if (files.length < 2) throw new Error('Choose at least two PDF files to merge.');
  const { PDFDocument } = await import('pdf-lib');
  const output = await newPdf();
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    await yieldToUi();
  }
  return output.save({ useObjectStreams: true });
}

export async function splitPdfFile(
  file: File,
  ranges: number[][],
  onProgress: ProgressCallback = noop,
): Promise<Uint8Array[]> {
  requireFiles([file], ['.pdf']);
  if (!ranges.length || ranges.some((range) => !range.length)) throw new Error('Enter at least one valid page range.');
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(await file.arrayBuffer());
  const pageCount = source.getPageCount();
  const outputs: Uint8Array[] = [];
  for (let index = 0; index < ranges.length; index += 1) {
    const indices = ranges[index].map((page) => page - 1);
    if (indices.some((page) => page < 0 || page >= pageCount)) throw new Error('A selected page is outside the PDF.');
    const output = await newPdf();
    const pages = await output.copyPages(source, indices);
    pages.forEach((page) => output.addPage(page));
    outputs.push(await output.save({ useObjectStreams: true }));
    onProgress(index + 1, ranges.length);
    await yieldToUi();
  }
  return outputs;
}

export async function organizePdfFile(
  file: File,
  order: number[],
  rotations: Record<number, number> = {},
  onProgress: ProgressCallback = noop,
): Promise<Uint8Array> {
  requireFiles([file], ['.pdf']);
  if (!order.length || new Set(order).size !== order.length) throw new Error('Keep at least one page and do not duplicate pages.');
  const { PDFDocument, degrees } = await import('pdf-lib');
  const source = await PDFDocument.load(await file.arrayBuffer());
  if (order.some((index) => !Number.isInteger(index) || index < 0 || index >= source.getPageCount())) {
    throw new Error('The page order contains an invalid page.');
  }
  const output = await newPdf();
  const pages = await output.copyPages(source, order);
  pages.forEach((page, index) => {
    const originalIndex = order[index];
    const extra = ((rotations[originalIndex] ?? 0) % 360 + 360) % 360;
    page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    output.addPage(page);
    onProgress(index + 1, pages.length);
  });
  return output.save({ useObjectStreams: true });
}

export async function renderPdfFile(
  file: File,
  dpi: number,
  format: 'png' | 'jpeg',
  onProgress: ProgressCallback = noop,
): Promise<Blob[]> {
  if (dpi < 72 || dpi > 300) throw new Error('DPI must be between 72 and 300.');
  const pdf = await openPdf(file);
  const images: Blob[] = [];
  try {
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const rendered = await renderPdfPage(page, dpi / 72);
      images.push(await canvasToBlob(rendered.canvas, format === 'png' ? 'image/png' : 'image/jpeg', 0.9));
      releaseCanvas(rendered.canvas);
      page.cleanup();
      onProgress(index, pdf.numPages);
      await yieldToUi();
    }
  } finally {
    await destroyPdf(pdf);
  }
  return images;
}

export async function previewPdfFile(
  file: File,
  maxWidth = 180,
  onProgress: ProgressCallback = noop,
): Promise<Blob[]> {
  const pdf = await openPdf(file);
  const images: Blob[] = [];
  try {
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const base = page.getViewport({ scale: 1 });
      const rendered = await renderPdfPage(page, Math.max(0.2, maxWidth / base.width));
      images.push(await canvasToBlob(rendered.canvas, 'image/jpeg', 0.76));
      releaseCanvas(rendered.canvas);
      page.cleanup();
      onProgress(index, pdf.numPages);
      await yieldToUi();
    }
  } finally {
    await destroyPdf(pdf);
  }
  return images;
}

async function canvasToPdfPage(
  output: Awaited<ReturnType<typeof newPdf>>,
  rendered: RenderedPdfPage,
  jpegQuality: number,
): Promise<void> {
  const blob = await canvasToBlob(rendered.canvas, 'image/jpeg', jpegQuality);
  const image = await output.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  const page = output.addPage([rendered.width, rendered.height]);
  page.drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
}

export async function compressPdfFile(
  file: File,
  dpi: number,
  jpegQuality: number,
  onProgress: ProgressCallback = noop,
): Promise<Uint8Array> {
  if (dpi < 72 || dpi > 240 || jpegQuality < 0.3 || jpegQuality > 1) throw new Error('Invalid compression settings.');
  const pdf = await openPdf(file);
  const output = await newPdf();
  try {
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const rendered = await renderPdfPage(page, dpi / 72);
      await canvasToPdfPage(output, rendered, jpegQuality);
      releaseCanvas(rendered.canvas);
      page.cleanup();
      onProgress(index, pdf.numPages);
      await yieldToUi();
    }
  } finally {
    await destroyPdf(pdf);
  }
  return output.save({ useObjectStreams: true });
}

export async function imagesToPdfFile(
  files: File[],
  pageSize: DirectImagePageSize,
  onProgress: ProgressCallback = noop,
): Promise<Uint8Array> {
  if (!files.length) throw new Error('Choose at least one image.');
  const output = await newPdf();
  for (let index = 0; index < files.length; index += 1) {
    const normalized = await normalizeImage(files[index], 3000);
    const image = await output.embedJpg(new Uint8Array(await normalized.blob.arrayBuffer()));
    let width: number;
    let height: number;
    let margin = 24;
    if (pageSize === 'image') {
      width = normalized.width * 72 / 150;
      height = normalized.height * 72 / 150;
      margin = 0;
    } else {
      const portrait: [number, number] = pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
      [width, height] = normalized.width > normalized.height ? [portrait[1], portrait[0]] : portrait;
    }
    const page = output.addPage([width, height]);
    const fitted = fitWithin(normalized.width, normalized.height, width - margin * 2, height - margin * 2);
    page.drawImage(image, { x: fitted.x + margin, y: fitted.y + margin, width: fitted.width, height: fitted.height });
    onProgress(index + 1, files.length);
    await yieldToUi();
  }
  return output.save({ useObjectStreams: true });
}

async function createOcrWorker(languages: OcrLanguage): Promise<OcrWorker> {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const worker = await createWorker(languages, OEM.LSTM_ONLY, {
    workerPath: assetUrl('tesseract/worker.min.js'),
    corePath: assetUrl('tesseract/tesseract-core.wasm.js'),
    langPath: assetUrl('tesseract/tessdata'),
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: false,
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
    user_defined_dpi: '150',
  });
  return worker;
}

function parseOcrTsv(tsv: string | null): OcrWord[] {
  if (!tsv) return [];
  const words: OcrWord[] = [];
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const columns = row.split('\t');
    if (columns.length < 12 || columns[0] !== '5') continue;
    const text = columns.slice(11).join('\t').replace(/[\u0000-\u001f]/g, '').trim();
    const confidence = Number(columns[10]);
    if (!text || confidence < 15) continue;
    words.push({
      text,
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      lineKey: `${columns[1]}:${columns[2]}:${columns[3]}:${columns[4]}`,
    });
  }
  return words.filter((word) => [word.left, word.top, word.width, word.height].every(Number.isFinite));
}

async function recognizePage(worker: OcrWorker, canvas: HTMLCanvasElement): Promise<OcrWord[]> {
  const result = await worker.recognize(canvas, {}, { text: true, tsv: true });
  return parseOcrTsv(result.data.tsv);
}

async function embedOcrFont(pdf: Awaited<ReturnType<typeof newPdf>>) {
  const response = await fetch(assetUrl('fonts/NotoSansCJKsc-Regular.otf'));
  if (!response.ok) throw new Error('The local OCR font could not be loaded.');
  const [{ default: fontkit }, fontBytes] = await Promise.all([
    import('@pdf-lib/fontkit'),
    response.arrayBuffer(),
  ]);
  pdf.registerFontkit(fontkit);
  return pdf.embedFont(fontBytes, { subset: true });
}

export async function ocrPdfFile(
  file: File,
  languages: OcrLanguage,
  onProgress: ProgressCallback = noop,
): Promise<Uint8Array> {
  const pdf = await openPdf(file);
  let worker: OcrWorker | undefined;
  try {
    worker = await createOcrWorker(languages);
    const output = await newPdf();
    const font = await embedOcrFont(output);
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const rendered = await renderPdfPage(page, 150 / 72);
      await canvasToPdfPage(output, rendered, 0.92);
      const words = await recognizePage(worker, rendered.canvas);
      const outputPage = output.getPage(index - 1);
      for (const word of words) {
        const size = Math.max(4, Math.min(72, word.height / rendered.scale * 0.9));
        outputPage.drawText(word.text, {
          x: word.left / rendered.scale,
          y: rendered.height - (word.top + word.height) / rendered.scale,
          size,
          font,
          opacity: 0,
        });
      }
      releaseCanvas(rendered.canvas);
      page.cleanup();
      onProgress(index, pdf.numPages);
      await yieldToUi();
    }
    return await output.save({ useObjectStreams: true });
  } finally {
    if (worker) await worker.terminate();
    await destroyPdf(pdf);
  }
}

type EditableLine = { text: string; size: number };

async function embeddedTextLines(page: PDFPageProxy): Promise<EditableLine[]> {
  const content = await page.getTextContent();
  const items = content.items.filter((item): item is TextItem => 'str' in item && item.str.trim().length > 0);
  const groups: { y: number; items: typeof items }[] = [];
  for (const item of items) {
    const y = item.transform[5];
    let group = groups.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (!group) {
      group = { y, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.sort((a, b) => b.y - a.y).map((group) => {
    const sorted = [...group.items].sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let previousEnd = 0;
    let size = 11;
    sorted.forEach((item, index) => {
      size = Math.max(size, item.height || Math.abs(item.transform[3]) || 11);
      const gap = item.transform[4] - previousEnd;
      if (index && gap > Math.max(1.5, size * 0.15) && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
      text += item.str;
      previousEnd = item.transform[4] + item.width;
    });
    return { text: text.trim(), size: Math.max(7, Math.min(28, size)) };
  }).filter((line) => line.text);
}

function ocrLines(words: OcrWord[], languages: OcrLanguage): EditableLine[] {
  const groups = new Map<string, OcrWord[]>();
  words.forEach((word) => {
    const group = groups.get(word.lineKey) ?? [];
    group.push(word);
    groups.set(word.lineKey, group);
  });
  return [...groups.values()].map((group) => {
    group.sort((a, b) => a.left - b.left);
    const separator = languages === 'chi_sim' ? '' : ' ';
    return {
      text: group.map((word) => word.text).join(separator),
      size: Math.max(7, Math.min(24, Math.max(...group.map((word) => word.height)) * 72 / 150)),
    };
  }).filter((line) => line.text);
}

export async function pdfToDocxFile(
  file: File,
  languages: OcrLanguage,
  onProgress: ProgressCallback = noop,
): Promise<Uint8Array> {
  const pdf = await openPdf(file);
  let worker: OcrWorker | undefined;
  try {
    const sections = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      let lines = await embeddedTextLines(page);
      if (lines.reduce((total, line) => total + line.text.length, 0) < 20) {
        if (!worker) worker = await createOcrWorker(languages);
        const rendered = await renderPdfPage(page, 150 / 72);
        lines = ocrLines(await recognizePage(worker, rendered.canvas), languages);
        releaseCanvas(rendered.canvas);
      }
      const viewport = page.getViewport({ scale: 1 });
      const { Paragraph, TextRun } = await import('docx');
      const children = lines.length ? lines.map((line) => new Paragraph({
        children: [new TextRun({ text: line.text, size: Math.round(line.size * 2) })],
        spacing: { after: 80 },
      })) : [new Paragraph('')];
      sections.push({
        properties: {
          page: {
            size: { width: Math.round(viewport.width * 20), height: Math.round(viewport.height * 20) },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      });
      page.cleanup();
      onProgress(index, pdf.numPages);
      await yieldToUi();
    }
    const { Document, Packer } = await import('docx');
    const document = new Document({
      creator: 'PDF Toolbox Web Edition',
      title: file.name.replace(/\.pdf$/i, ''),
      description: 'Editable text generated locally. Layout is approximate.',
      sections,
    });
    const blob = await Packer.toBlob(document);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    if (worker) await worker.terminate();
    await destroyPdf(pdf);
  }
}

export async function docxToPdfFile(
  file: File,
  onProgress: ProgressCallback = noop,
): Promise<Uint8Array> {
  requireFiles([file], ['.docx']);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:900px;pointer-events:none;background:white;';
  document.body.append(host);
  try {
    const [{ renderAsync }, { default: html2canvas }] = await Promise.all([
      import('docx-preview'),
      import('html2canvas'),
    ]);
    await renderAsync(await file.arrayBuffer(), host, undefined, {
      breakPages: true,
      inWrapper: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
    });
    await document.fonts.ready;
    const pages = [...host.querySelectorAll<HTMLElement>('section')];
    if (!pages.length) throw new Error('No pages were found in the DOCX document.');
    const output = await newPdf();
    for (let index = 0; index < pages.length; index += 1) {
      const section = pages[index];
      const bounds = section.getBoundingClientRect();
      const scale = Math.min(2, 5000 / Math.max(bounds.width, bounds.height));
      const canvas = await html2canvas(section, {
        scale,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: false,
      });
      const rendered = {
        canvas,
        scale,
        width: bounds.width * 72 / 96,
        height: bounds.height * 72 / 96,
      };
      await canvasToPdfPage(output, rendered, 0.93);
      releaseCanvas(canvas);
      onProgress(index + 1, pages.length);
      await yieldToUi();
    }
    return await output.save({ useObjectStreams: true });
  } finally {
    host.remove();
  }
}
