import { A4, pageGeometry } from './layout';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const normalizeAngle = (angle) => ((angle + 180) % 360 + 360) % 360 - 180;

// Millimetres are the single source of truth for the editor, cache and PDF.
export function constrainFreeRect(rect, orientation = 'portrait') {
  const [pageWidth, pageHeight] = A4[orientation] || A4.portrait;
  const angle = normalizeAngle(Number(rect.angle) || 0);
  let width = Math.max(1, Number(rect.width) || 50);
  let height = Math.max(1, Number(rect.height) || 50);
  const radians = angle * Math.PI / 180;
  const c = Math.abs(Math.cos(radians));
  const s = Math.abs(Math.sin(radians));
  const fit = Math.min(1, pageWidth / (width * c + height * s), pageHeight / (width * s + height * c));
  width *= fit;
  height *= fit;
  const halfWidth = (width * c + height * s) / 2;
  const halfHeight = (width * s + height * c) / 2;
  return {
    ...rect,
    page: clamp(Math.round(Number(rect.page) || 1), 1, 999),
    cx: clamp(Number.isFinite(rect.cx) ? rect.cx : pageWidth / 2, halfWidth, pageWidth - halfWidth),
    cy: clamp(Number.isFinite(rect.cy) ? rect.cy : pageHeight / 2, halfHeight, pageHeight - halfHeight),
    width, height, angle,
    baseWidth: Math.max(1, Number(rect.baseWidth) || width),
  };
}

export function seedFreeRect(image, index, total, settings) {
  const capacity = settings.capacity || 9;
  const offset = index % capacity;
  const count = Math.min(capacity, total - Math.floor(index / capacity) * capacity);
  const geometry = pageGeometry({ ...settings, count });
  const scale = Math.min(geometry.cellWidthMm / image.naturalWidth, geometry.cellHeightMm / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return constrainFreeRect({
    page: Math.floor(index / capacity) + 1,
    cx: settings.marginMm + offset % geometry.columns * (geometry.cellWidthMm + settings.gapMm) + geometry.cellWidthMm / 2,
    cy: settings.marginMm + Math.floor(offset / geometry.columns) * (geometry.cellHeightMm + settings.gapMm) + geometry.cellHeightMm / 2,
    width, height, baseWidth: width, angle: 0,
  }, settings.orientation);
}

export function ensureFreeLayouts(images, settings) {
  return images.map((image, index) => ({
    ...image,
    free: image.free ? constrainFreeRect(image.free, settings.orientation) : seedFreeRect(image, index, images.length, settings),
  }));
}

export function freePages(images) {
  if (!images.length) return [];
  const pages = Array.from({ length: Math.max(...images.map((image) => image.free.page)) }, () => []);
  images.forEach((image) => pages[image.free.page - 1].push(image));
  return pages;
}

export function resizeFreeRect(rect, width, orientation) {
  const nextWidth = Math.max(5, width);
  return constrainFreeRect({ ...rect, width: nextWidth, height: rect.height * nextWidth / rect.width }, orientation);
}

export function freeRectStyle(rect, orientation) {
  const [width, height] = A4[orientation] || A4.portrait;
  return {
    left: `${rect.cx / width * 100}%`, top: `${rect.cy / height * 100}%`,
    width: `${rect.width / width * 100}%`, height: `${rect.height / height * 100}%`,
    transform: `translate(-50%, -50%) rotate(${rect.angle}deg)`,
  };
}

// Canvas uses the same centres, dimensions, angle and array/stacking order as DOM.
export async function paintFreePage(context, items, widthPx, heightPx, orientation, loadImage, onImage = () => {}) {
  const [widthMm, heightMm] = A4[orientation] || A4.portrait;
  context.save();
  context.scale(widthPx / widthMm, heightPx / heightMm);
  for (const item of items) {
    const source = await loadImage(item.src);
    const rect = constrainFreeRect(item.free, orientation);
    context.save();
    context.translate(rect.cx, rect.cy);
    context.rotate(rect.angle * Math.PI / 180);
    context.drawImage(source, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    context.restore();
    onImage();
  }
  context.restore();
}
