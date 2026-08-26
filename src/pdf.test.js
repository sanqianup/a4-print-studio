import { describe, expect, it } from 'vitest';
import { computeObjectFitPlacement } from './pdf.js';

describe('PDF image placement', () => {
  it('matches CSS object-fit cover and centered object-position', () => {
    const placement = computeObjectFitPlacement(1200, 2264, 160, 247, 'cover', 50, 50);
    expect(placement.width).toBeCloseTo(160, 5);
    expect(placement.height).toBeCloseTo(301.86667, 5);
    expect(placement.left).toBeCloseTo(0, 5);
    expect(placement.top).toBeCloseTo(-27.43333, 5);
  });

  it('matches CSS object-fit contain without cropping', () => {
    const placement = computeObjectFitPlacement(1200, 2264, 160, 247, 'contain', 50, 50);
    expect(placement.width).toBeCloseTo(130.91873, 5);
    expect(placement.height).toBeCloseTo(247, 5);
    expect(placement.left).toBeCloseTo(14.54064, 5);
    expect(placement.top).toBeCloseTo(0, 5);
  });

  it('uses object-position percentages before zoom and rotation transforms', () => {
    const placement = computeObjectFitPlacement(2000, 1000, 300, 300, 'cover', 25, 75);
    expect(placement).toEqual({ width: 600, height: 300, left: -75, top: 0 });
  });
});
