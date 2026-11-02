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

export async function renderPage(page: ScanPage, maxDimension = 2200, quality = 0.88): Promise<RenderedPage> {
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
      cv.INTER_CUBIC,
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
  try {
    const gray = track(new cv.Mat());
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    const sigma = Math.max(8, Math.max(source.cols, source.rows) / 42);
    const background = track(new cv.Mat());
    cv.GaussianBlur(gray, background, new cv.Size(0, 0), sigma, sigma, cv.BORDER_REPLICATE);

    if (mode === 'color') {
      const rgb = track(new cv.Mat());
      const backgroundRgb = track(new cv.Mat());
      const normalized = track(new cv.Mat());
      const blended = track(new cv.Mat());
      const blurred = track(new cv.Mat());
      const sharpened = track(new cv.Mat());
      const contrasted = track(new cv.Mat());
      const output = new cv.Mat();
      cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(background, backgroundRgb, cv.COLOR_GRAY2RGB);
      release(gray);
      release(background);
      cv.divide(rgb, backgroundRgb, normalized, 255);
      release(backgroundRgb);
      cv.addWeighted(rgb, 0.38, normalized, 0.62, 0, blended);
      release(normalized);
      cv.GaussianBlur(blended, blurred, new cv.Size(0, 0), 1.05, 1.05, cv.BORDER_REPLICATE);
      const amount = 0.18 + strength * 1.18;
      cv.addWeighted(blended, 1 + amount, blurred, -amount, 0, sharpened);
      release(rgb);
      release(blended);
      release(blurred);
      cv.convertScaleAbs(sharpened, contrasted, 1.025 + strength * 0.045, -1.5 - strength * 2.5);
      release(sharpened);
      cv.cvtColor(contrasted, output, cv.COLOR_RGB2RGBA);
      release(contrasted);
      return output;
    }

    const normalized = track(new cv.Mat());
    cv.divide(gray, background, normalized, 255);
    release(gray);
    release(background);
    if (mode === 'bw') {
      const binary = track(new cv.Mat());
      const output = new cv.Mat();
      const rawBlock = Math.round(Math.min(source.cols, source.rows) / 24);
      let block = Math.max(25, Math.min(81, rawBlock));
      if (block % 2 === 0) block += 1;
      cv.adaptiveThreshold(normalized, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 8 + strength * 6);
      release(normalized);
      cv.cvtColor(binary, output, cv.COLOR_GRAY2RGBA);
      release(binary);
      return output;
    }

    const equalized = track(new cv.Mat());
    const contrasted = track(new cv.Mat());
    cv.equalizeHist(normalized, equalized);
    cv.addWeighted(normalized, 0.68, equalized, 0.32, 0, contrasted);
    release(normalized);
    release(equalized);
    const blurred = track(new cv.Mat());
    const sharpened = track(new cv.Mat());
    const output = new cv.Mat();
    cv.GaussianBlur(contrasted, blurred, new cv.Size(0, 0), 0.9, 0.9, cv.BORDER_REPLICATE);
    const amount = 0.25 + strength * 1.35;
    cv.addWeighted(contrasted, 1 + amount, blurred, -amount, 0, sharpened);
    release(contrasted);
    release(blurred);
    cv.cvtColor(sharpened, output, cv.COLOR_GRAY2RGBA);
    release(sharpened);
    return output;
  } finally {
    resources.reverse().forEach((resource) => resource.delete());
  }
}
