import { describe, it, expect, vi } from 'vitest';
import { constrainFreeRect, ensureFreeLayouts, freePages, freeRectStyle, normalizeAngle, paintFreePage, resizeFreeRect } from './free-layout';

const settings = { orientation: 'portrait', capacity: 9, marginMm: 12, gapMm: 3 };
const rect = { page: 1, cx: 105, cy: 148.5, width: 80, height: 40, baseWidth: 80, angle: 30 };
const photo = (id) => ({ id, src: id, naturalWidth: 1200, naturalHeight: 800, zoom: 100, rotation: 0 });

describe('free A4 layout', () => {
  it('normalizes positive and negative rotation', () => {
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-450)).toBe(-90);
  });
  it('keeps all rotated corners inside both A4 orientations', () => {
    for (const orientation of ['portrait', 'landscape']) for (const angle of [0, 30, 45, 90, 135, -173]) {
      const r = constrainFreeRect({ ...rect, cx: -500, cy: 900, width: 500, height: 600, angle }, orientation);
      const [w, h] = orientation === 'portrait' ? [210, 297] : [297, 210];
      const rad = r.angle * Math.PI / 180;
      for (const x of [-r.width / 2, r.width / 2]) for (const y of [-r.height / 2, r.height / 2]) {
        const px = r.cx + x * Math.cos(rad) - y * Math.sin(rad);
        const py = r.cy + x * Math.sin(rad) + y * Math.cos(rad);
        expect(px).toBeGreaterThanOrEqual(-1e-9); expect(px).toBeLessThanOrEqual(w + 1e-9);
        expect(py).toBeGreaterThanOrEqual(-1e-9); expect(py).toBeLessThanOrEqual(h + 1e-9);
      }
    }
  });
  it('resizes proportionally without changing angle or baseline', () => {
    const r = resizeFreeRect(rect, 120, 'portrait');
    expect(r.width).toBe(120); expect(r.height).toBe(60);
    expect(r.angle).toBe(30); expect(r.baseWidth).toBe(80);
  });
  it('seeds older records, preserves existing layout after add/delete and roundtrip', () => {
    const seeded = ensureFreeLayouts([photo('a'), photo('b')], settings);
    expect(seeded[0].free.width / seeded[0].free.height).toBeCloseTo(1.5);
    const saved = JSON.parse(JSON.stringify(seeded));
    expect(ensureFreeLayouts(saved, settings)).toEqual(seeded);
    expect(ensureFreeLayouts([saved[1], photo('c')], settings)[0].free).toEqual(seeded[1].free);
    expect(seeded[0].zoom).toBe(100);
  });
  it('preserves blank pages and stacking order', () => {
    const a = { ...photo('a'), free: { ...rect, page: 3 } };
    const b = { ...photo('b'), free: { ...rect, page: 3 } };
    expect(freePages([b, a])).toEqual([[], [], [b, a]]);
    expect(freePages([])).toEqual([]);
  });
  it('uses exact same centres, size and rotation in CSS and PDF canvas', async () => {
    const style = freeRectStyle(rect, 'portrait');
    expect(style.left).toBe('50%'); expect(style.top).toBe('50%');
    expect(style.transform).toBe('translate(-50%, -50%) rotate(30deg)');
    const ctx = Object.fromEntries(['save', 'restore', 'scale', 'translate', 'rotate', 'drawImage'].map((key) => [key, vi.fn()]));
    const progress = vi.fn();
    await paintFreePage(ctx, [{ ...photo('a'), free: rect }, { ...photo('b'), free: { ...rect, cx: 100, angle: -45 } }], 2100, 2970, 'portrait', async (src) => src, progress);
    expect(ctx.scale).toHaveBeenCalledWith(10, 10);
    expect(ctx.translate).toHaveBeenNthCalledWith(1, 105, 148.5);
    expect(ctx.translate).toHaveBeenNthCalledWith(2, 100, 148.5);
    expect(ctx.rotate).toHaveBeenNthCalledWith(1, Math.PI / 6);
    expect(ctx.rotate).toHaveBeenNthCalledWith(2, -Math.PI / 4);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, 'a', -40, -20, 80, 40);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, 'b', -40, -20, 80, 40);
    expect(progress).toHaveBeenCalledTimes(2);
  });
});
