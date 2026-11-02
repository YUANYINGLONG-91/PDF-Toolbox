import { describe, expect, it } from 'vitest';
import { parsePageRanges } from './document-tools';

describe('parsePageRanges', () => {
  it('parses single pages and inclusive ranges', () => {
    expect(parsePageRanges('1-3,5,8-10', 12)).toEqual([
      [1, 2, 3],
      [5],
      [8, 9, 10],
    ]);
  });

  it('accepts whitespace and Chinese separators', () => {
    expect(parsePageRanges(' 1， 2-3； 6 ', 8)).toEqual([[1], [2, 3], [6]]);
  });

  it('preserves separate groups for split outputs', () => {
    expect(parsePageRanges('1,1-2,3', 3)).toEqual([[1], [1, 2], [3]]);
  });

  it.each(['', '0', '4', '3-2', '1-4', 'one', '1,,x'])('rejects invalid range %s for a three-page PDF', (input) => {
      expect(() => parsePageRanges(input, 3)).toThrow();
  });

  it('rejects PDFs without pages', () => {
    expect(() => parsePageRanges('1', 0)).toThrow('no pages');
  });
});
