import type { Point, Rotation } from './types';

export function fullFrameCorners(): Point[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

export function clampPoint(point: Point): Point {
  return {
    x: Math.min(1, Math.max(0, Number.isFinite(point.x) ? point.x : 0)),
    y: Math.min(1, Math.max(0, Number.isFinite(point.y) ? point.y : 0)),
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Returns corners in top-left, top-right, bottom-right, bottom-left order. */
export function orderCorners(points: Point[]): Point[] {
  if (points.length !== 4 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return fullFrameCorners();
  }
  const sums = points.map((point) => point.x + point.y);
  const differences = points.map((point) => point.x - point.y);
  const topLeft = points[sums.indexOf(Math.min(...sums))];
  const bottomRight = points[sums.indexOf(Math.max(...sums))];
  const topRight = points[differences.indexOf(Math.max(...differences))];
  const bottomLeft = points[differences.indexOf(Math.min(...differences))];
  const ordered = [topLeft, topRight, bottomRight, bottomLeft];
  return new Set(ordered).size === 4 ? ordered.map((point) => ({ ...point })) : fullFrameCorners();
}

export function rotateCorners(corners: Point[], amount: Rotation): Point[] {
  const turns = amount / 90;
  let result = corners.map(clampPoint);
  for (let turn = 0; turn < turns; turn += 1) {
    const rotated = result.map((point) => ({ x: 1 - point.y, y: point.x }));
    result = [rotated[3], rotated[0], rotated[1], rotated[2]];
  }
  return result;
}

export function rotatedSize(width: number, height: number, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

export function quadArea(corners: Point[]): number {
  let area = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const next = corners[(index + 1) % corners.length];
    area += corners[index].x * next.y - next.x * corners[index].y;
  }
  return Math.abs(area) / 2;
}

export function isUsableQuad(corners: Point[]): boolean {
  if (corners.length !== 4 || quadArea(corners) < 0.005) return false;
  const sign = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const crosses = corners.map((point, index) => sign(point, corners[(index + 1) % 4], corners[(index + 2) % 4]));
  return crosses.every((value) => value > 0) || crosses.every((value) => value < 0);
}

export function outputSize(corners: Point[], width: number, height: number, maxDimension = 2400): { width: number; height: number } {
  const points = corners.map((point) => ({ x: point.x * width, y: point.y * height }));
  const rawWidth = Math.max(distance(points[0], points[1]), distance(points[3], points[2]));
  const rawHeight = Math.max(distance(points[0], points[3]), distance(points[1], points[2]));
  if (!Number.isFinite(rawWidth + rawHeight) || rawWidth < 2 || rawHeight < 2) {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    return { width: Math.max(16, Math.round(width * scale)), height: Math.max(16, Math.round(height * scale)) };
  }
  const scale = Math.min(1, maxDimension / Math.max(rawWidth, rawHeight));
  return {
    width: Math.max(16, Math.round(rawWidth * scale)),
    height: Math.max(16, Math.round(rawHeight * scale)),
  };
}
