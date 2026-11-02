import { describe, expect, it } from 'vitest';
import { fitWithin, sanitizePdfFilename } from './pdf';

describe('PDF output helpers', () => {
  it('sanitizes file names and removes duplicate PDF extensions', () => {
    expect(sanitizePdfFilename('  Notes: final?.pdf  ')).toBe('Notes final');
    expect(sanitizePdfFilename('...')).toBe('Scanned document');
    expect(sanitizePdfFilename('CON')).toBe('Scanned document');
  });

  it('fits images without distorting their aspect ratio', () => {
    expect(fitWithin(2000, 1000, 500, 500)).toEqual({ width: 500, height: 250, x: 0, y: 125 });
    expect(fitWithin(1000, 2000, 500, 500)).toEqual({ width: 250, height: 500, x: 125, y: 0 });
  });
});
