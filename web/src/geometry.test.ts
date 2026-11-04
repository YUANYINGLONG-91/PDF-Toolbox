import { describe, expect, it } from 'vitest';
import { clampPoint, fullFrameCorners, isUsableQuad, orderCorners, outputSize, quadArea, rotateCorners, rotatedSize } from './geometry';

describe('document geometry', () => {
  it('orders arbitrary contour corners clockwise from the top left', () => {
    const ordered = orderCorners([{ x: 0.9, y: 0.8 }, { x: 0.1, y: 0.1 }, { x: 0.15, y: 0.85 }, { x: 0.85, y: 0.12 }])!;
    expect(ordered[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(ordered[1]).toEqual({ x: 0.85, y: 0.12 });
    expect(ordered[2]).toEqual({ x: 0.9, y: 0.8 });
    expect(ordered[3]).toEqual({ x: 0.15, y: 0.85 });
  });

  it('keeps corners aligned with a clockwise rotation', () => {
    const corners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    expect(rotateCorners(corners, 90)[0].x).toBeCloseTo(0.1);
    expect(rotateCorners(corners, 90)[0].y).toBeCloseTo(0.1);
    expect(rotateCorners(corners, 90)[1]).toEqual({ x: 0.9, y: 0.1 });
    expect(rotateCorners(corners, 90)[2]).toEqual({ x: 0.9, y: 0.9 });
    expect(rotateCorners(corners, 90)[3].x).toBeCloseTo(0.1);
    expect(rotateCorners(corners, 90)[3].y).toBeCloseTo(0.9);
    expect(rotateCorners([{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.1 }, { x: 0.9, y: 0.8 }, { x: 0.2, y: 0.9 }], 90)[0])
      .toEqual({ x: 0.09999999999999998, y: 0.2 });
  });

  it('swaps dimensions for quarter turns', () => {
    expect(rotatedSize(1200, 800, 90)).toEqual({ width: 800, height: 1200 });
    expect(rotatedSize(1200, 800, 270)).toEqual({ width: 800, height: 1200 });
    expect(rotatedSize(1200, 800, 180)).toEqual({ width: 1200, height: 800 });
  });

  it('calculates bounded perspective output dimensions', () => {
    expect(outputSize(fullFrameCorners(), 3000, 2000, 1500)).toEqual({ width: 1500, height: 1000 });
    const cropped = outputSize([{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.9 }, { x: 0.1, y: 0.9 }], 1000, 1000, 2000);
    expect(cropped).toEqual({ width: 500, height: 800 });
  });

  it('rejects self-crossed and tiny quadrilaterals', () => {
    expect(isUsableQuad([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe(false);
    expect(isUsableQuad(fullFrameCorners())).toBe(true);
    expect(quadArea(fullFrameCorners())).toBe(1);
  });

  it('rejects invalid corner ordering instead of pretending the full frame was detected', () => {
    expect(orderCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeNull();
    expect(orderCorners([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeNull();
    expect(orderCorners([])).toBeNull();
    expect(orderCorners(fullFrameCorners())).toEqual(fullFrameCorners());
  });

  it('rejects short sides and nearly collapsed corners', () => {
    expect(isUsableQuad([{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.01, y: 1 }, { x: 0, y: 1 }])).toBe(false);
    expect(isUsableQuad([{ x: 0, y: 0 }, { x: 0.5, y: 0.49 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(false);
  });

  it('clamps dragged points to the image', () => {
    expect(clampPoint({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
  });
});
