import { A4, templateForCount } from './layout';
import { paintFreePage } from './free-layout';

const RENDER_DPI = 240;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('PDF 生成时无法读取图片'));
    image.src = src;
  });
}

export function computeObjectFitPlacement(sourceWidth, sourceHeight, targetWidth, targetHeight, fitMode, positionX = 50, positionY = 50) {
  const fitScale = fitMode === 'contain'
    ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * fitScale;
  const height = sourceHeight * fitScale;
  return {
    width,
    height,
    left: (targetWidth - width) * (positionX / 100),
    top: (targetHeight - height) * (positionY / 100),
  };
}

async function renderCell(item, widthMm, heightMm, fitMode) {
  const width = Math.max(1, Math.round((widthMm / 25.4) * RENDER_DPI));
  const height = Math.max(1, Math.round((heightMm / 25.4) * RENDER_DPI));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  const source = await loadImage(item.src);
  const rotation = ((item.rotation % 360) + 360) % 360;
  const zoom = item.zoom / 100;
  const placement = computeObjectFitPlacement(
    source.naturalWidth,
    source.naturalHeight,
    width,
    height,
    fitMode,
    item.x,
    item.y,
  );

  // Match the preview exactly: object-fit/object-position paint the image first,
  // then CSS transforms the complete image element around the cell center.
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(zoom, zoom);
  context.translate(-width / 2, -height / 2);
  context.drawImage(
    source,
    placement.left,
    placement.top,
    placement.width,
    placement.height,
  );
  context.restore();
  return canvas.toDataURL('image/jpeg', 0.94);
}

export async function createLayoutPdf(pages, settings, onProgress = () => {}) {
  const { jsPDF } = await import('jspdf');
  const orientation = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
  const [pageWidth, pageHeight] = A4[orientation];
  const document = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  let completed = 0;
  const total = pages.reduce((sum, page) => sum + page.length, 0);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    if (pageIndex > 0) document.addPage('a4', orientation);
    const page = pages[pageIndex];
    if (settings.layoutMode === 'free') {
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.round(pageWidth / 25.4 * RENDER_DPI);
      canvas.height = Math.round(pageHeight / 25.4 * RENDER_DPI);
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await paintFreePage(context, page, canvas.width, canvas.height, orientation, loadImage, () => {
        completed += 1;
        onProgress(Math.round(completed / total * 100));
      });
      document.addImage(canvas.toDataURL('image/jpeg', .94), 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      canvas.width = 0;
      canvas.height = 0;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      continue;
    }
    const template = templateForCount(page.length === settings.capacity ? settings.capacity : page.length);
    const innerWidth = pageWidth - settings.marginMm * 2;
    const innerHeight = pageHeight - settings.marginMm * 2;
    const cellWidth = (innerWidth - settings.gapMm * (template.columns - 1)) / template.columns;
    const cellHeight = (innerHeight - settings.gapMm * (template.rows - 1)) / template.rows;

    for (let itemIndex = 0; itemIndex < page.length; itemIndex += 1) {
      const row = Math.floor(itemIndex / template.columns);
      const column = itemIndex % template.columns;
      const x = settings.marginMm + column * (cellWidth + settings.gapMm);
      const y = settings.marginMm + row * (cellHeight + settings.gapMm);
      const raster = await renderCell(page[itemIndex], cellWidth, cellHeight, settings.fitMode);
      document.addImage(raster, 'JPEG', x, y, cellWidth, cellHeight, undefined, 'FAST');
      completed += 1;
      onProgress(Math.round((completed / total) * 100));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  return document.output('blob');
}
