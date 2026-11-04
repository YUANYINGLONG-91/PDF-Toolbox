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
export function orderCorners(points: Point[]): Point[] | null {
  if (points.length !== 4 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }
  if (points.some((point, index) => points.slice(index + 1).some((other) => distance(point, other) < 1e-6))) {
    return null;
  }
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  const ordered = points
    .map((point) => ({ ...point }))
    .sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  if (!isUsableQuad(ordered)) return null;
  let topLeft = 0;
  for (let index = 1; index < 4; index += 1) {
    const point = ordered[index];
    const current = ordered[topLeft];
    const pointSum = point.x + point.y;
    const currentSum = current.x + current.y;
    if (pointSum < currentSum - 1e-6 || (Math.abs(pointSum - currentSum) <= 1e-6 && point.x < current.x)) {
      topLeft = index;
    }
  }
  return [...ordered.slice(topLeft), ...ordered.slice(0, topLeft)];
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
  if (corners.length !== 4 || corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  if (!Number.isFinite(quadArea(corners)) || quadArea(corners) < 0.005) return false;
  const sign = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const crosses = corners.map((point, index) => sign(point, corners[(index + 1) % 4], corners[(index + 2) % 4]));
  if (!(crosses.every((value) => value > 0) || crosses.every((value) => value < 0))) return false;
  for (let index = 0; index < 4; index += 1) {
    const point = corners[index];
    const previous = corners[(index + 3) % 4];
    const following = corners[(index + 1) % 4];
    const before = { x: previous.x - point.x, y: previous.y - point.y };
    const after = { x: following.x - point.x, y: following.y - point.y };
    const side = Math.hypot(after.x, after.y);
    if (side < 0.04) return false;
    const cosine = Math.abs((before.x * after.x + before.y * after.y) / Math.max(1e-9, Math.hypot(before.x, before.y) * side));
    if (cosine > 0.96) return false;
  }
  return true;
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
