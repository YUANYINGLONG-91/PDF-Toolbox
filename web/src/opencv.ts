import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import type { Point, RenderedPage, ScanPage } from './types';
import { blobToCanvas, canvasToBlob, closeImage } from './image';
import { clampPoint, isUsableQuad, orderCorners, outputSize, rotatedSize } from './geometry';

// OpenCV's bundled typings trail the browser build. Keep the wrapper isolated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;
type Mat = { delete: () => void };

declare global {
  interface Window {
    cv?: Cv;
  }
}

let enginePromise: Promise<Cv> | undefined;

export function loadOpenCv(): Promise<Cv> {
  if (enginePromise) return enginePromise;
  enginePromise = new Promise<Cv>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv]');
    const script = existing ?? document.createElement('script');
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      enginePromise = undefined;
      reject(error);
    };
    const ready = async () => {
      try {
        const candidate = await Promise.resolve(window.cv);
        if (candidate?.Mat) {
          settled = true;
          resolve(candidate);
        } else if (candidate) {
          candidate.onRuntimeInitialized = () => {
            if (!settled) {
              settled = true;
              resolve(candidate);
            }
          };
        } else {
          fail(new Error('OpenCV did not initialize'));
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error('OpenCV did not initialize'));
      }
    };
    script.addEventListener('load', ready, { once: true });
    script.addEventListener('error', () => fail(new Error('OpenCV could not be loaded')), { once: true });
    if (!existing) {
      script.src = opencvUrl;
      script.async = true;
      script.dataset.opencv = 'true';
      document.head.append(script);
    } else if (window.cv) {
      void ready();
    }
  });
  return enginePromise;
}

export async function detectDocument(blob: Blob): Promise<Point[] | null> {
  const cv = await loadOpenCv();
  const { canvas: original, image } = await blobToCanvas(blob);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1000 / Math.max(original.width, original.height));
  canvas.width = Math.max(1, Math.round(original.width * scale));
  canvas.height = Math.max(1, Math.round(original.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(original, 0, 0, canvas.width, canvas.height);
  original.width = original.height = 1;
  closeImage(image);

  const resources: Mat[] = [];
  const track = <T extends Mat>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  try {
    const rgba = track(cv.imread(canvas));
    const gray = track(new cv.Mat());
    const blurred = track(new cv.Mat());
    const edges = track(new cv.Mat());
    const closed = track(new cv.Mat());
    const kernel = track(cv.Mat.ones(4, 4, cv.CV_8U));
    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 45, 130);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const candidates: { area: number; corners: Point[] }[] = [];
    const imageArea = canvas.width * canvas.height;
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      let approximation: Cv | undefined;
      try {
        const area = cv.contourArea(contour);
        if (area < imageArea * 0.08) continue;
        const perimeter = cv.arcLength(contour, true);
        approximation = new cv.Mat();
        cv.approxPolyDP(contour, approximation, perimeter * 0.025, true);
        if (approximation.rows !== 4 || !cv.isContourConvex(approximation)) continue;
        const data = approximation.data32S;
        const corners = orderCorners(Array.from({ length: 4 }, (_, corner) => ({
          x: data[corner * 2] / canvas.width,
          y: data[corner * 2 + 1] / canvas.height,
        }))).map(clampPoint);
        if (isUsableQuad(corners)) candidates.push({ area, corners });
      } finally {
        approximation?.delete();
        contour.delete();
      }
    }
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0]?.corners ?? null;
  } finally {
    resources.reverse().forEach((resource) => resource.delete());
    canvas.width = canvas.height = 1;
  }
}

export async function renderPage(page: ScanPage, maxDimension = 2200, quality = 0.94): Promise<RenderedPage> {
  const cv = await loadOpenCv();
  const response = await fetch(page.sourceUrl);
  const { canvas: sourceCanvas, image } = await blobToCanvas(await response.blob());
  const resources: Mat[] = [];
  const track = <T extends Mat>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  const release = (resource: Mat): void => {
    resource.delete();
    const index = resources.indexOf(resource);
    if (index >= 0) resources.splice(index, 1);
  };
  const outputCanvas = document.createElement('canvas');
  try {
    const source = track(cv.imread(sourceCanvas));
    const rotated = track(new cv.Mat());
    if (page.rotation === 90) cv.rotate(source, rotated, cv.ROTATE_90_CLOCKWISE);
    else if (page.rotation === 180) cv.rotate(source, rotated, cv.ROTATE_180);
    else if (page.rotation === 270) cv.rotate(source, rotated, cv.ROTATE_90_COUNTERCLOCKWISE);
    else source.copyTo(rotated);
    release(source);
    sourceCanvas.width = sourceCanvas.height = 1;

    const dimensions = rotatedSize(rotated.cols, rotated.rows, 0);
    const size = outputSize(page.corners, dimensions.width, dimensions.height, maxDimension);
    const sourcePoints = page.corners.flatMap((point) => [point.x * dimensions.width, point.y * dimensions.height]);
    const destinationPoints = [0, 0, size.width - 1, 0, size.width - 1, size.height - 1, 0, size.height - 1];
    const sourceMat = track(cv.matFromArray(4, 1, cv.CV_32FC2, sourcePoints));
    const destinationMat = track(cv.matFromArray(4, 1, cv.CV_32FC2, destinationPoints));
    const transform = track(cv.getPerspectiveTransform(sourceMat, destinationMat));
    release(sourceMat);
    release(destinationMat);
    const warped = track(new cv.Mat());
    cv.warpPerspective(
      rotated,
      warped,
      transform,
      new cv.Size(size.width, size.height),
      cv.INTER_LANCZOS4,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    );
    release(rotated);
    release(transform);
    const enhanced = track(enhanceDocument(cv, warped, page.mode, page.strength / 100));
    release(warped);
    outputCanvas.width = size.width;
    outputCanvas.height = size.height;
    cv.imshow(outputCanvas, enhanced);
    const blob = await canvasToBlob(outputCanvas, 'image/jpeg', quality);
    return { blob, width: size.width, height: size.height };
  } finally {
    resources.reverse().forEach((resource) => resource.delete());
    closeImage(image);
    sourceCanvas.width = sourceCanvas.height = 1;
    outputCanvas.width = outputCanvas.height = 1;
  }
}

function normalizeIllumination(cv: Cv, source: Cv, paperLevel: number): Cv {
  const background = new cv.Mat();
  const output = new cv.Mat();
  try {
    const sigma = Math.max(12, Math.min(source.cols, source.rows) / 18);
    cv.GaussianBlur(source, background, new cv.Size(0, 0), sigma, sigma, cv.BORDER_REPLICATE);
    cv.divide(source, background, output, paperLevel);
    return output;
  } finally {
    background.delete();
  }
}

function documentContrast(cv: Cv, source: Cv, sharpness: number): Cv {
  const gamma = Math.max(1, Math.min(1.25, 1.08 + 0.12 * Math.max(0, sharpness - 1)));
  const values = Array.from({ length: 256 }, (_, value) => Math.round((value / 255) ** gamma * 255));
  const lut = cv.matFromArray(256, 1, cv.CV_8U, values);
  const output = new cv.Mat();
  try {
    cv.LUT(source, lut, output);
    return output;
  } finally {
    lut.delete();
  }
}

function unsharp(cv: Cv, source: Cv, amount: number): Cv {
  const blurred = new cv.Mat();
  const output = new cv.Mat();
  try {
    cv.GaussianBlur(source, blurred, new cv.Size(0, 0), 1, 1, cv.BORDER_REPLICATE);
    cv.addWeighted(source, 1 + amount, blurred, -amount, 0, output);
    return output;
  } finally {
    blurred.delete();
  }
}

function localContrast(cv: Cv, source: Cv, clipLimit: number, mix: number): Cv {
  // The browser OpenCV build omits CLAHE; a restrained broad-radius mask gives
  // similar local contrast without global histogram equalization's harsh noise.
  const blurred = new cv.Mat();
  const output = new cv.Mat();
  try {
    const amount = clipLimit * mix * 0.4;
    cv.GaussianBlur(source, blurred, new cv.Size(0, 0), 12, 12, cv.BORDER_REPLICATE);
    cv.addWeighted(source, 1 + amount, blurred, -amount, 0, output);
    return output;
  } finally {
    blurred.delete();
  }
}

function enhanceDocument(cv: Cv, source: Cv, mode: ScanPage['mode'], strength: number): Cv {
  const resources: Mat[] = [];
  const track = <T extends Mat>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  const release = (resource: Mat): void => {
    resource.delete();
    const index = resources.indexOf(resource);
    if (index >= 0) resources.splice(index, 1);
  };
  const sharpness = Math.min(2, Math.max(0, strength * (1.55 / 0.7)));
  try {
    if (mode === 'color') {
      const rgb = track(new cv.Mat());
      cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB);
      const channels = track(new cv.MatVector());
      cv.split(rgb, channels);
      const balancedChannels = track(new cv.MatVector());
      for (let index = 0; index < 3; index += 1) {
        const channel = track(channels.get(index));
        const normalized = track(normalizeIllumination(cv, channel, 250));
        const blended = track(new cv.Mat());
        cv.addWeighted(normalized, 0.96, channel, 0.04, 0, blended);
        balancedChannels.push_back(blended);
      }
      const normalizedRgb = track(new cv.Mat());
      cv.merge(balancedChannels, normalizedRgb);
      const local = track(localContrast(cv, normalizedRgb, 1.35, 0.35));
      const contrasted = track(documentContrast(cv, local, sharpness));
      const sharpened = track(unsharp(cv, contrasted, 0.48 * sharpness));
      const output = new cv.Mat();
      cv.cvtColor(sharpened, output, cv.COLOR_RGB2RGBA);
      return output;
    }

    const gray = track(new cv.Mat());
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    const normalized = track(normalizeIllumination(cv, gray, mode === 'gray' ? 250 : 245));
    release(gray);
    if (mode === 'bw') {
      const denoised = track(new cv.Mat());
      cv.medianBlur(normalized, denoised, 3);
      release(normalized);
      const contrasted = track(documentContrast(cv, denoised, sharpness));
      release(denoised);
      const sharpened = track(unsharp(cv, contrasted, 0.3 * sharpness));
      release(contrasted);
      let block = Math.max(31, Math.round(Math.min(source.cols, source.rows) * 0.045));
      block = Math.min(151, block) | 1;
      const binary = track(new cv.Mat());
      cv.adaptiveThreshold(sharpened, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 12);
      release(sharpened);
      const output = new cv.Mat();
      cv.cvtColor(binary, output, cv.COLOR_GRAY2RGBA);
      release(binary);
      return output;
    }

    const local = track(localContrast(cv, normalized, 1.45, 0.4));
    release(normalized);
    const contrasted = track(documentContrast(cv, local, sharpness));
    release(local);
    const sharpened = track(unsharp(cv, contrasted, 0.42 * sharpness));
    release(contrasted);
    const output = new cv.Mat();
    cv.cvtColor(sharpened, output, cv.COLOR_GRAY2RGBA);
    release(sharpened);
    return output;
  } finally {
    resources.reverse().forEach((resource) => resource.delete());
  }
}
