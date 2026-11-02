import type { Rotation, ScanPage } from './types';
import { rotatedSize } from './geometry';

export type DrawableImage = ImageBitmap | HTMLImageElement;

export function imageSize(image: DrawableImage): { width: number; height: number } {
  return image instanceof HTMLImageElement
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height };
}

export function closeImage(image: DrawableImage): void {
  if ('close' in image) image.close();
}

export async function decodeImage(blob: Blob): Promise<DrawableImage> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Older Safari versions can reject otherwise valid images; use an image element.
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // The decoded image remains usable after its object URL is released.
    URL.revokeObjectURL(url);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image encoding failed')), type, quality);
  });
}

export async function normalizeImage(file: Blob, maxDimension = 2400): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await decodeImage(file);
  try {
    const source = imageSize(image);
    if (!source.width || !source.height) throw new Error('Invalid image dimensions');
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas is unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas);
    canvas.width = canvas.height = 1;
    return { blob, width, height };
  } finally {
    closeImage(image);
  }
}

export async function drawRotated(page: ScanPage, maxDimension = 1600): Promise<{ url: string; width: number; height: number }> {
  const image = await decodeImage(await (await fetch(page.sourceUrl)).blob());
  try {
    const original = imageSize(image);
    const scale = Math.min(1, maxDimension / Math.max(original.width, original.height));
    const width = Math.max(1, Math.round(original.width * scale));
    const height = Math.max(1, Math.round(original.height * scale));
    const output = rotatedSize(width, height, page.rotation);
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas is unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    applyRotation(context, page.rotation, output.width, output.height);
    context.drawImage(image, 0, 0, width, height);
    const url = URL.createObjectURL(await canvasToBlob(canvas, 'image/jpeg', 0.88));
    canvas.width = canvas.height = 1;
    return { url, ...output };
  } finally {
    closeImage(image);
  }
}

function applyRotation(context: CanvasRenderingContext2D, rotation: Rotation, width: number, height: number): void {
  if (rotation === 90) {
    context.translate(width, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(width, height);
    context.rotate(Math.PI);
  } else if (rotation === 270) {
    context.translate(0, height);
    context.rotate(-Math.PI / 2);
  }
}

export async function makeThumbnail(blob: Blob, maxDimension = 180): Promise<string> {
  const image = await decodeImage(blob);
  try {
    const size = imageSize(image);
    const scale = Math.min(1, maxDimension / Math.max(size.width, size.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas is unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const url = URL.createObjectURL(await canvasToBlob(canvas, 'image/jpeg', 0.78));
    canvas.width = canvas.height = 1;
    return url;
  } finally {
    closeImage(image);
  }
}

export async function blobToCanvas(blob: Blob): Promise<{ canvas: HTMLCanvasElement; image: DrawableImage }> {
  const image = await decodeImage(blob);
  const size = imageSize(image);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) {
    closeImage(image);
    throw new Error('Canvas is unavailable');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0);
  return { canvas, image };
}
