import { describe, expect, it } from 'vitest';
import { effectiveDpi, pageGeometry, paginate, templateForCount } from './layout.js';

describe('A4 layout engine', () => {
  it('uses the reference-like 3 by 3 grid for nine images', () => {
    expect(templateForCount(9)).toEqual({ columns: 3, rows: 3, capacity: 9 });
  });

  it('paginates without losing images', () => {
    const pages = paginate(Array.from({ length: 20 }, (_, index) => index), 9);
    expect(pages.map((page) => page.length)).toEqual([9, 9, 2]);
    expect(pages.flat()).toHaveLength(20);
  });

  it('computes exact A4 printable cell dimensions', () => {
    const geometry = pageGeometry({ count: 9, marginMm: 12, gapMm: 3 });
    expect(geometry.widthMm).toBe(210);
    expect(geometry.heightMm).toBe(297);
    expect(geometry.cellWidthMm).toBeCloseTo(60, 5);
    expect(geometry.cellHeightMm).toBeCloseTo(89, 5);
  });

  it('warns from real image pixels rather than invented quality data', () => {
    const geometry = pageGeometry({ count: 9, marginMm: 12, gapMm: 3 });
    const dpi = effectiveDpi({ naturalWidth: 1200, naturalHeight: 1600 }, geometry, 'cover');
    expect(dpi).toBeGreaterThan(150);
  });
});
