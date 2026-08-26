import { A4, templateForCount } from './layout';

const RENDER_DPI = 240;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('PDF 生成时无法读取图片'));
    image.src = src;
  });
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
  const turnsSideways = rotation === 90 || rotation === 270;
  const rotatedWidth = turnsSideways ? source.naturalHeight : source.naturalWidth;
  const rotatedHeight = turnsSideways ? source.naturalWidth : source.naturalHeight;
  const fitScale = fitMode === 'contain'
    ? Math.min(width / rotatedWidth, height / rotatedHeight)
    : Math.max(width / rotatedWidth, height / rotatedHeight);
  const scale = fitScale * (item.zoom / 100);
  const boundsWidth = rotatedWidth * scale;
  const boundsHeight = rotatedHeight * scale;
  const left = (width - boundsWidth) * (item.x / 100);
  const top = (height - boundsHeight) * (item.y / 100);

  context.save();
  context.translate(left + boundsWidth / 2, top + boundsHeight / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    source,
    -(source.naturalWidth * scale) / 2,
    -(source.naturalHeight * scale) / 2,
    source.naturalWidth * scale,
    source.naturalHeight * scale,
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
