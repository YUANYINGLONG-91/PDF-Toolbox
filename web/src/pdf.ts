import type { PageSize, ScanPage } from './types';
import { renderPage } from './opencv';

export function sanitizePdfFilename(value: string, fallback = 'Scanned document'): string {
  const cleaned = value
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|%\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 100)
    .trim();
  if (!cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) return fallback;
  return cleaned;
}

export function fitWithin(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { width, height, x: (boxWidth - width) / 2, y: (boxHeight - height) / 2 };
}

export async function createPdf(
  pages: ScanPage[],
  pageSize: PageSize,
  onProgress: (index: number, total: number) => void,
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setCreator('PDF Toolbox Web Edition');
  pdf.setProducer('PDF Toolbox Web Edition — local browser processing');
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  for (let index = 0; index < pages.length; index += 1) {
    onProgress(index + 1, pages.length);
    // Yield before expensive work so progress and accessibility updates paint.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const rendered = await renderPage(pages[index], 3000, 0.95);
    const image = await pdf.embedJpg(new Uint8Array(await rendered.blob.arrayBuffer()));
    let width: number;
    let height: number;
    let margin = 12;
    if (pageSize === 'image') {
      width = image.width * 72 / 150;
      height = image.height * 72 / 150;
      margin = 0;
    } else {
      const portrait: [number, number] = pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
      [width, height] = image.width > image.height ? [portrait[1], portrait[0]] : portrait;
    }
    const pdfPage = pdf.addPage([width, height]);
    const fitted = fitWithin(image.width, image.height, width - margin * 2, height - margin * 2);
    pdfPage.drawImage(image, {
      x: fitted.x + margin,
      y: fitted.y + margin,
      width: fitted.width,
      height: fitted.height,
    });
  }
  return pdf.save({ useObjectStreams: true });
}
