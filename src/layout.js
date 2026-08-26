export const A4 = Object.freeze({ portrait: [210, 297], landscape: [297, 210] });

export function templateForCount(count) {
  if (count <= 1) return { columns: 1, rows: 1, capacity: 1 };
  if (count === 2) return { columns: 2, rows: 1, capacity: 2 };
  if (count === 3) return { columns: 3, rows: 1, capacity: 3 };
  if (count === 4) return { columns: 2, rows: 2, capacity: 4 };
  if (count <= 6) return { columns: 3, rows: 2, capacity: 6 };
  if (count <= 9) return { columns: 3, rows: 3, capacity: 9 };
  return { columns: 3, rows: 4, capacity: 12 };
}

export function paginate(items, requestedCapacity = 9) {
  const capacity = [1, 2, 3, 4, 6, 9, 12].includes(requestedCapacity) ? requestedCapacity : 9;
  const pages = [];
  for (let index = 0; index < items.length; index += capacity) {
    pages.push(items.slice(index, index + capacity));
  }
  return pages;
}

export function pageGeometry({ orientation = 'portrait', marginMm = 12, gapMm = 3, count = 9 }) {
  const [widthMm, heightMm] = A4[orientation] || A4.portrait;
  const template = templateForCount(count);
  const printableWidth = widthMm - marginMm * 2;
  const printableHeight = heightMm - marginMm * 2;
  return {
    widthMm,
    heightMm,
    ...template,
    cellWidthMm: (printableWidth - gapMm * (template.columns - 1)) / template.columns,
    cellHeightMm: (printableHeight - gapMm * (template.rows - 1)) / template.rows,
  };
}

export function effectiveDpi(image, geometry, fitMode = 'cover') {
  if (!image?.naturalWidth || !image?.naturalHeight) return 0;
  const targetWidthInches = geometry.cellWidthMm / 25.4;
  const targetHeightInches = geometry.cellHeightMm / 25.4;
  const widthDpi = image.naturalWidth / targetWidthInches;
  const heightDpi = image.naturalHeight / targetHeightInches;
  return Math.round(fitMode === 'contain' ? Math.max(widthDpi, heightDpi) : Math.min(widthDpi, heightDpi));
}
