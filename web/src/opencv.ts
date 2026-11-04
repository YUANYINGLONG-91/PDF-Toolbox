import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import type { Point, RenderedPage, ScanPage } from './types';
import { blobToCanvas, canvasToBlob, closeImage } from './image';
import { clampPoint, isUsableQuad, orderCorners, outputSize, quadArea, rotatedSize } from './geometry';

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

function extractQuadrilateral(cv: Cv, contour: Cv): { points: Point[]; inferred: boolean } | null {
  const perimeter = cv.arcLength(contour, true);
  for (const epsilon of [0.015, 0.022, 0.03, 0.04]) {
    const approximation = new cv.Mat();
    try {
      cv.approxPolyDP(contour, approximation, perimeter * epsilon, true);
      if (approximation.rows === 4 && cv.isContourConvex(approximation)) {
        const data = approximation.data32S;
        return {
          points: Array.from({ length: 4 }, (_, index) => ({ x: data[index * 2], y: data[index * 2 + 1] })),
          inferred: false,
        };
      }
    } finally {
      approximation.delete();
    }
  }
  const approximation = new cv.Mat();
  try {
    cv.approxPolyDP(contour, approximation, perimeter * 0.02, true);
    if (approximation.rows < 3) return null;
    const rectangle = cv.minAreaRect(contour);
    const rectangleArea = Math.max(1, rectangle.size.width * rectangle.size.height);
    if (cv.contourArea(contour) / rectangleArea <= 0.78) return null;
    return { points: cv.boxPoints(rectangle).map((point: Point) => ({ x: point.x, y: point.y })), inferred: true };
  } finally {
    approximation.delete();
  }
}

function boundaryContrast(cv: Cv, gray: Cv, corners: Point[]): number {
  const mask = new cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1);
  const eroded = new cv.Mat();
  const erodedFar = new cv.Mat();
  const dilated = new cv.Mat();
  const dilatedFar = new cv.Mat();
  const innerBand = new cv.Mat();
  const outerBand = new cv.Mat();
  const polygon = cv.matFromArray(4, 1, cv.CV_32SC2, corners.flatMap((point) => [Math.round(point.x), Math.round(point.y)]));
  const bandSize = Math.max(7, Math.round(Math.min(gray.cols, gray.rows) * 0.015) | 1);
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(bandSize, bandSize));
  const farSize = bandSize * 2 + 1;
  const farKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(farSize, farSize));
  try {
    cv.fillConvexPoly(mask, polygon, new cv.Scalar(255));
    cv.erode(mask, eroded, kernel);
    cv.erode(mask, erodedFar, farKernel);
    cv.dilate(mask, dilated, kernel);
    cv.dilate(mask, dilatedFar, farKernel);
    cv.subtract(eroded, erodedFar, innerBand);
    cv.subtract(dilatedFar, dilated, outerBand);
    if (cv.countNonZero(innerBand) < 20 || cv.countNonZero(outerBand) < 20) return 0;
    const inside = cv.mean(gray, innerBand)[0];
    const outside = cv.mean(gray, outerBand)[0];
    return Math.abs(inside - outside);
  } finally {
    farKernel.delete();
    kernel.delete();
    polygon.delete();
    outerBand.delete();
    innerBand.delete();
    dilatedFar.delete();
    dilated.delete();
    erodedFar.delete();
    eroded.delete();
    mask.delete();
  }
}

export async function detectDocument(blob: Blob): Promise<Point[] | null> {
  const cv = await loadOpenCv();
  const { canvas: original, image } = await blobToCanvas(blob);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1100 / Math.max(original.width, original.height));
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
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    const kernelSize = Math.max(5, Math.round(Math.min(canvas.width, canvas.height) * 0.012) | 1);
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize)));
    const imageArea = canvas.width * canvas.height;
    const candidates: { score: number; corners: Point[]; fullFrame: boolean }[] = [];
    const seen = new Set<string>();

    const processMask = (rawMask: Cv, sourceWeight: number): void => {
      const closed = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      try {
        cv.morphologyEx(rawMask, closed, cv.MORPH_CLOSE, kernel);
        cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        const areas: { index: number; area: number }[] = [];
        for (let index = 0; index < contours.size(); index += 1) {
          const contour = contours.get(index);
          try {
            const area = cv.contourArea(contour);
            if (area >= imageArea * 0.10) areas.push({ index, area });
          } finally {
            contour.delete();
          }
        }
        areas.sort((a, b) => b.area - a.area);
        for (const { index, area: contourArea } of areas.slice(0, 16)) {
          const contour = contours.get(index);
          try {
            const extracted = extractQuadrilateral(cv, contour);
            const ordered = extracted ? orderCorners(extracted.points) : null;
            if (!ordered || !extracted) continue;
            const minimumSide = Math.min(...ordered.map((point, corner) => distanceBetween(point, ordered[(corner + 1) % 4])));
            if (minimumSide < Math.min(canvas.width, canvas.height) * 0.06) continue;
            const corners = ordered.map((point) => clampPoint({ x: point.x / canvas.width, y: point.y / canvas.height }));
            if (!isUsableQuad(corners)) continue;
            const key = ordered.flatMap((point) => [Math.round(point.x / 8), Math.round(point.y / 8)]).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            const areaRatio = Math.min(1, Math.max(0, quadArea(ordered) / imageArea));
            const rectangularity = Math.min(1, Math.max(0, contourArea / Math.max(1, quadArea(ordered))));
            const center = ordered.reduce(
              (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
              { x: 0, y: 0 },
            );
            const centeredness = 1 - Math.min(1, distanceBetween(center, { x: canvas.width / 2, y: canvas.height / 2 }) / Math.max(canvas.width, canvas.height));
            const borderContacts = ordered.reduce((count, point) => count
              + Number(point.x <= 3 || point.x >= canvas.width - 4)
              + Number(point.y <= 3 || point.y >= canvas.height - 4), 0);
            // When most corners are clamped to the photo but the quad is much
            // smaller than the frame, its remaining edge often cuts diagonally
            // through the paper. Prefer the complete photo over losing writing.
            if (borderContacts >= 4 && areaRatio <= 0.96) continue;
            let borderPenalty = 1;
            if (areaRatio > 0.96 && borderContacts >= 4) borderPenalty = 0.45;
            else if (borderContacts >= 3) borderPenalty = 0.55;
            const inferencePenalty = extracted.inferred ? 0.90 : 1;
            const score = (areaRatio * 0.80 + rectangularity * 0.12 + centeredness * 0.08)
              * sourceWeight * borderPenalty * inferencePenalty;
            candidates.push({ score, corners, fullFrame: areaRatio > 0.96 && borderContacts >= 4 });
          } finally {
            contour.delete();
          }
        }
      } finally {
        hierarchy.delete();
        contours.delete();
        closed.delete();
      }
    };

    for (const [low, high, weight] of [[35, 110, 1], [75, 190, 0.98]]) {
      const edges = new cv.Mat();
      try {
        cv.Canny(blurred, edges, low, high);
        processMask(edges, weight);
      } finally {
        edges.delete();
      }
    }
    const otsuMask = new cv.Mat();
    let otsuThreshold: number;
    try {
      otsuThreshold = cv.threshold(blurred, otsuMask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    } finally {
      otsuMask.delete();
    }
    const thresholds = new Set([
      Math.round(otsuThreshold),
      Math.round(Math.min(235, Math.max(20, otsuThreshold - 30))),
      Math.round(Math.min(235, Math.max(20, otsuThreshold + 30))),
    ]);
    for (const threshold of thresholds) {
      for (const inverse of [false, true]) {
        const mask = new cv.Mat();
        try {
          cv.threshold(blurred, mask, threshold, 255, inverse ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY);
          processMask(mask, inverse ? 0.90 : 0.94);
        } finally {
          mask.delete();
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const finalists = candidates.slice(0, 20);
    const fullFrame = candidates.find((candidate) => candidate.fullFrame);
    if (fullFrame && !finalists.includes(fullFrame)) finalists.push(fullFrame);
    for (const candidate of finalists) {
      if (candidate.fullFrame) continue;
      const rawCorners = candidate.corners.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }));
      const contrast = boundaryContrast(cv, gray, rawCorners);
      candidate.score *= 0.45 + 0.55 * Math.min(1, contrast / 30);
    }
    finalists.sort((a, b) => b.score - a.score);
    return finalists[0]?.corners ?? null;
  } finally {
    resources.reverse().forEach((resource) => resource.delete());
    canvas.width = canvas.height = 1;
  }
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildTextMask(cv: Cv, source: Cv, output: Cv): boolean {
  const resources: Mat[] = [];
  const track = <T extends Mat>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  try {
    const scale = Math.min(1, 900 / Math.max(source.cols, source.rows));
    const small = track(new cv.Mat());
    cv.resize(source, small, new cv.Size(
      Math.max(1, Math.round(source.cols * scale)),
      Math.max(1, Math.round(source.rows * scale)),
    ), 0, 0, cv.INTER_AREA);
    const gray = track(new cv.Mat());
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    const mean = track(new cv.Mat());
    const standardDeviation = track(new cv.Mat());
    cv.meanStdDev(gray, mean, standardDeviation);
    if (standardDeviation.data64F[0] < 4) return false;
    const normalized = track(normalizeIllumination(cv, gray, 245));
    let blockSize = Math.max(25, Math.round(Math.min(gray.cols, gray.rows) * 0.04) | 1);
    blockSize = Math.min(101, blockSize) | 1;
    cv.adaptiveThreshold(normalized, output, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, blockSize, 11);
    const marginX = Math.round(output.cols * 0.025);
    const marginY = Math.round(output.rows * 0.025);
    const black = new cv.Scalar(0);
    cv.rectangle(output, new cv.Point(0, 0), new cv.Point(output.cols, marginY), black, cv.FILLED);
    cv.rectangle(output, new cv.Point(0, output.rows - marginY), new cv.Point(output.cols, output.rows), black, cv.FILLED);
    cv.rectangle(output, new cv.Point(0, 0), new cv.Point(marginX, output.rows), black, cv.FILLED);
    cv.rectangle(output, new cv.Point(output.cols - marginX, 0), new cv.Point(output.cols, output.rows), black, cv.FILLED);
    const ratio = cv.countNonZero(output) / (output.cols * output.rows);
    return ratio >= 0.001 && ratio <= 0.38;
  } finally {
    resources.reverse().forEach((resource) => resource.delete());
  }
}

function projectionScore(cv: Cv, mask: Cv, angle: number, rotated: Cv, projection: Cv): number {
  const transform = cv.getRotationMatrix2D(new cv.Point(mask.cols / 2, mask.rows / 2), angle, 1);
  try {
    cv.warpAffine(
      mask,
      rotated,
      transform,
      new cv.Size(mask.cols, mask.rows),
      cv.INTER_NEAREST,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0),
    );
    cv.reduce(rotated, projection, 1, cv.REDUCE_SUM, cv.CV_32F);
    const values = projection.data32F;
    let total = 0;
    for (let index = 0; index < mask.rows; index += 1) total += values[index];
    const mean = Math.max(1, total / mask.rows);
    let variance = 0;
    for (let index = 0; index < mask.rows; index += 1) {
      const difference = values[index] / 255 - mean / 255;
      variance += difference * difference;
    }
    variance /= mask.rows;
    return variance / ((mean / 255) ** 2);
  } finally {
    transform.delete();
  }
}

function applyDeskew(cv: Cv, source: Cv, output: Cv): boolean {
  const mask = new cv.Mat();
  const rotated = new cv.Mat();
  const projection = new cv.Mat();
  try {
    if (!buildTextMask(cv, source, mask)) return false;
    const baseline = projectionScore(cv, mask, 0, rotated, projection);
    if (baseline <= 0) return false;
    let bestAngle = 0;
    let bestScore = baseline;
    for (let angle = -8; angle <= 8; angle += 1) {
      const score = projectionScore(cv, mask, angle, rotated, projection);
      if (score > bestScore) {
        bestAngle = angle;
        bestScore = score;
      }
    }
    const coarseAngle = bestAngle;
    for (let step = -3; step <= 3; step += 1) {
      const angle = Math.max(-8, Math.min(8, coarseAngle + step * 0.2));
      const score = projectionScore(cv, mask, angle, rotated, projection);
      if (score > bestScore) {
        bestAngle = angle;
        bestScore = score;
      }
    }
    if (Math.abs(bestAngle) < 0.25 || bestScore < baseline * 1.015) return false;
    const transform = cv.getRotationMatrix2D(new cv.Point(source.cols / 2, source.rows / 2), bestAngle, 1);
    try {
      cv.warpAffine(
        source,
        output,
        transform,
        new cv.Size(source.cols, source.rows),
        cv.INTER_LANCZOS4,
        cv.BORDER_CONSTANT,
        new cv.Scalar(255, 255, 255, 255),
      );
      return true;
    } finally {
      transform.delete();
    }
  } finally {
    projection.delete();
    rotated.delete();
    mask.delete();
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
    const sourcePoints = page.corners.flatMap((point) => [
      point.x * Math.max(0, dimensions.width - 1),
      point.y * Math.max(0, dimensions.height - 1),
    ]);
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
    const deskewed = track(new cv.Mat());
    const corrected = applyDeskew(cv, warped, deskewed) ? deskewed : warped;
    const enhanced = track(enhanceDocument(cv, corrected, page.mode, page.strength / 100));
    release(warped);
    release(deskewed);
    outputCanvas.width = size.width;
    outputCanvas.height = size.height;
    cv.imshow(outputCanvas, enhanced);
    const blob = await canvasToBlob(outputCanvas, page.mode === 'bw' ? 'image/png' : 'image/jpeg', quality);
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

function softAdaptiveThreshold(cv: Cv, source: Cv, sharpness: number): Cv {
  const blackPoint = 50 - 4 * sharpness;
  const values = Array.from({ length: 256 }, (_, value) => {
    const darkness = Math.min(1, Math.max(0, (value - 4) / Math.max(1, blackPoint - 4)));
    return Math.round((1 - darkness ** 0.85) * 255);
  });
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
    const normalized = track(normalizeIllumination(cv, gray, mode === 'gray' ? 250 : 248));
    release(gray);
    if (mode === 'bw') {
      const denoised = track(new cv.Mat());
      cv.bilateralFilter(normalized, denoised, 5, 18, 18, cv.BORDER_REPLICATE);
      release(normalized);
      let block = Math.max(31, Math.round(Math.min(source.cols, source.rows) * 0.04));
      block = Math.min(151, block) | 1;
      const background = track(new cv.Mat());
      cv.GaussianBlur(denoised, background, new cv.Size(block, block), 0, 0, cv.BORDER_REPLICATE);
      const difference = track(new cv.Mat());
      cv.subtract(background, denoised, difference);
      release(background);
      const soft = track(softAdaptiveThreshold(cv, difference, sharpness));
      release(difference);
      release(denoised);
      // A continuous local-contrast curve keeps strong ink dark without turning
      // every ruled line black or reintroducing broad shadows from the photo.
      const sharpened = track(unsharp(cv, soft, 0.05 * sharpness));
      release(soft);
      const output = new cv.Mat();
      cv.cvtColor(sharpened, output, cv.COLOR_GRAY2RGBA);
      release(sharpened);
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
