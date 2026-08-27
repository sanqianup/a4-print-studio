import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowsClockwise,
  Check,
  ImageSquare,
  FilePdf,
  Printer,
  SlidersHorizontal,
  Trash,
  UploadSimple,
  Warning,
  X,
} from '@phosphor-icons/react';
import { A4, effectiveDpi, pageGeometry, paginate, templateForCount } from './layout';
import { createLayoutPdf } from './pdf';
import { loadWorkspace, saveWorkspace } from './storage';
import { constrainFreeRect, ensureFreeLayouts, freePages } from './free-layout';
import { FreeImage, FreeControls } from './FreeLayout';

const PdfPreview = lazy(() => import('./PdfPreview').then((module) => ({ default: module.PdfPreview })));

const DEFAULT_SETTINGS = {
  layoutMode: 'grid',
  orientation: 'portrait',
  capacity: 9,
  marginMm: 12,
  gapMm: 3,
  fitMode: 'cover',
  copies: 1,
};

function containsFiles(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes('Files');
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.onload = () => {
      const preview = new Image();
      preview.onload = () => resolve({
        id: crypto.randomUUID(),
        name: file.name,
        src: reader.result,
        naturalWidth: preview.naturalWidth,
        naturalHeight: preview.naturalHeight,
        zoom: 100,
        x: 50,
        y: 50,
        rotation: 0,
      });
      preview.onerror = () => reject(new Error(`${file.name} 不是可用图片`));
      preview.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function RangeField({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <label className="range-field">
      <span><b>{label}</b><output>{value}{unit}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ImageTile({ image, selected, primary, fitMode, onSelect, onPositionChange, onDelete }) {
  const pointer = useRef(null);
  const start = useRef(null);

  const beginDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    start.current = { clientX: event.clientX, clientY: event.clientY, x: image.x, y: image.y };
    onSelect(event);
  };

  const moveImage = (event) => {
    if (pointer.current !== event.pointerId || !start.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, start.current.x + ((event.clientX - start.current.clientX) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, start.current.y + ((event.clientY - start.current.clientY) / rect.height) * 100));
    onPositionChange({ x, y });
  };

  const endDrag = (event) => {
    if (pointer.current !== event?.pointerId) return;
    event?.preventDefault();
    event?.stopPropagation();
    pointer.current = null;
    start.current = null;
  };

  return (
    <div className={`image-tile-wrap ${selected ? 'is-selected' : ''}`} data-layout-image-id={image.id} onDragStart={(event) => event.preventDefault()}>
      <button
        className="image-tile"
        type="button"
        aria-label={`调整 ${image.name}`}
        onPointerDown={beginDrag}
        onPointerMove={moveImage}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(event) => event.preventDefault()}
      >
        <img
          src={image.src}
          alt=""
          draggable="false"
          style={{
            objectFit: fitMode,
            objectPosition: `${image.x}% ${image.y}%`,
            transform: `scale(${image.zoom / 100}) rotate(${image.rotation}deg)`,
          }}
        />
      </button>
      {primary && <button className="tile-delete" type="button" onClick={onDelete} aria-label="删除所有选中的图片" title="删除所有选中的图片"><Trash weight="fill" /></button>}
    </div>
  );
}

export function App() {
  const [images, setImages] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDropActive, setDropActive] = useState(false);
  const [notice, setNotice] = useState({ type: 'idle', message: '' });
  const [isPrinting, setPrinting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfProgress, setPdfProgress] = useState(0);
  const [isMarqueeMode, setMarqueeMode] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const fileInput = useRef(null);
  const selectedIdsRef = useRef([]);
  const selectionAnchorRef = useRef(null);
  const sweepSelectionRef = useRef(null);
  const hasRestoredRef = useRef(false);
  const saveTimerRef = useRef(null);
  const pdfUrlRef = useRef('');
  const marqueeRef = useRef(null);
  const fileDragDepthRef = useRef(0);

  const selectedId = selectedIds.at(-1) || null;
  const isFree = settings.layoutMode === 'free';
  const freeImages = useMemo(() => isFree ? ensureFreeLayouts(images, settings) : [], [images, settings, isFree]);
  const selected = (isFree ? freeImages : images).find((image) => image.id === selectedId) || null;
  const pages = useMemo(() => isFree ? freePages(freeImages) : paginate(images, settings.capacity), [images, settings.capacity, isFree, freeImages]);

  const removeImages = useCallback((imageIds) => {
    const removing = new Set(imageIds);
    setImages((current) => current.filter((image) => !removing.has(image.id)));
    setSelectedIds((current) => current.filter((imageId) => !removing.has(imageId)));
  }, []);

  const removeImage = useCallback((imageId) => removeImages([imageId]), [removeImages]);

  const selectImage = useCallback((imageId, event = {}) => {
    const additive = event.ctrlKey || event.metaKey;
    setSelectedIds((current) => {
      if (event.shiftKey && selectionAnchorRef.current) {
        const anchorIndex = images.findIndex((image) => image.id === selectionAnchorRef.current);
        const nextIndex = images.findIndex((image) => image.id === imageId);
        if (anchorIndex >= 0 && nextIndex >= 0) {
          const [start, end] = anchorIndex < nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex];
          const rangeIds = images.slice(start, end + 1).map((image) => image.id);
          return additive ? [...new Set([...current, ...rangeIds])] : rangeIds;
        }
      }
      selectionAnchorRef.current = imageId;
      if (additive) return current.includes(imageId) ? current.filter((id) => id !== imageId) : [...current, imageId];
      return [imageId];
    });
  }, [images]);

  const beginSweepSelection = (imageId, event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const willSelect = !selectedIdsRef.current.includes(imageId);
    sweepSelectionRef.current = { willSelect };
    setSelectedIds((current) => willSelect
      ? [...new Set([...(event.ctrlKey || event.metaKey ? current : []), imageId])]
      : current.filter((id) => id !== imageId));
    selectionAnchorRef.current = imageId;
  };

  const continueSweepSelection = (imageId, event) => {
    if (!sweepSelectionRef.current || event.pointerType === 'touch' && !event.isPrimary) return;
    const { willSelect } = sweepSelectionRef.current;
    setSelectedIds((current) => willSelect
      ? current.includes(imageId) ? current : [...current, imageId]
      : current.filter((id) => id !== imageId));
  };

  selectedIdsRef.current = selectedIds;
  pdfUrlRef.current = pdfUrl;

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  useEffect(() => {
    let cancelled = false;
    loadWorkspace().then((saved) => {
      if (cancelled) return;
      if (saved?.images?.length) {
        setImages(saved.settings?.layoutMode === 'free' ? ensureFreeLayouts(saved.images, { ...DEFAULT_SETTINGS, ...saved.settings }) : saved.images);
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        setSelectedIds(saved.images[0]?.id ? [saved.images[0].id] : []);
        setNotice({ type: 'success', message: `已从本机恢复 ${saved.images.length} 张图片和上次版面。` });
      }
    }).catch(() => {
      if (!cancelled) setNotice({ type: 'error', message: '无法读取本机缓存，本次仍可正常排版，但刷新后可能无法恢复。' });
    }).finally(() => { hasRestoredRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hasRestoredRef.current) return undefined;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveWorkspace({ images, settings }).catch(() => {
        setNotice({ type: 'error', message: '本机缓存写入失败，可能是浏览器存储空间不足。' });
      });
    }, 250);
    return () => clearTimeout(saveTimerRef.current);
  }, [images, settings]);

  useEffect(() => {
    const handleDeleteKey = (event) => {
      const isDeleteKey = event.key === 'Delete'
        || event.key === 'Backspace'
        || event.key === 'Del'
        || event.code === 'Delete'
        || event.code === 'Backspace'
        || event.keyCode === 46
        || event.keyCode === 8;
      const imageIds = selectedIdsRef.current;
      if (!isDeleteKey || !imageIds.length || pdfUrlRef.current) return;
      const target = event.target;
      const isTextInput = target instanceof HTMLInputElement && !['range', 'button', 'checkbox', 'radio', 'color', 'file'].includes(target.type);
      const isTextEditing = target instanceof HTMLElement && (
        target.isContentEditable
        || target instanceof HTMLTextAreaElement
        || isTextInput
        || Boolean(target.closest('[contenteditable="true"]'))
      );
      if (isTextEditing) return;
      event.preventDefault();
      event.stopPropagation();
      removeImages(imageIds);
      setNotice({ type: 'success', message: `已删除 ${imageIds.length} 张选中图片，版面已更新。` });
    };
    document.addEventListener('keydown', handleDeleteKey, true);
    return () => document.removeEventListener('keydown', handleDeleteKey, true);
  }, [removeImages]);

  useEffect(() => {
    const stopSweepSelection = () => { sweepSelectionRef.current = null; };
    const trackSweepSelection = (event) => {
      if (!sweepSelectionRef.current) return;
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-image-id]');
      const imageId = row?.dataset.imageId;
      if (!imageId) return;
      const { willSelect } = sweepSelectionRef.current;
      setSelectedIds((current) => willSelect
        ? current.includes(imageId) ? current : [...current, imageId]
        : current.filter((id) => id !== imageId));
    };
    document.addEventListener('pointermove', trackSweepSelection, true);
    document.addEventListener('mousemove', trackSweepSelection, true);
    document.addEventListener('pointerup', stopSweepSelection, true);
    document.addEventListener('pointercancel', stopSweepSelection, true);
    document.addEventListener('mouseup', stopSweepSelection, true);
    return () => {
      document.removeEventListener('pointermove', trackSweepSelection, true);
      document.removeEventListener('mousemove', trackSweepSelection, true);
      document.removeEventListener('pointerup', stopSweepSelection, true);
      document.removeEventListener('pointercancel', stopSweepSelection, true);
      document.removeEventListener('mouseup', stopSweepSelection, true);
    };
  }, []);

  const addFiles = async (fileList) => {
    const files = [...fileList].filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setNotice({ type: 'error', message: '请拖入 JPG、PNG、WebP 或其他常见图片文件。' });
      return;
    }
    setNotice({ type: 'loading', message: `正在读取 ${files.length} 张图片...` });
    try {
      const loaded = await Promise.all(files.map(readImage));
      setImages((current) => isFree ? ensureFreeLayouts([...current, ...loaded], settings) : [...current, ...loaded]);
      setSelectedIds(loaded[0]?.id ? [loaded[0].id] : []);
      setNotice({ type: 'success', message: `已加入 ${loaded.length} 张图片，版面已自动更新。` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  };

  const updateSelected = (patch) => {
    setImages((current) => current.map((image) => image.id === selectedId ? { ...image, ...patch } : image));
  };

  const resetSelected = () => updateSelected({ zoom: 100, x: 50, y: 50, rotation: 0 });

  const updateFreeImage = (imageId, rect) => {
    setImages((current) => ensureFreeLayouts(current, settings).map((image) => image.id === imageId
      ? { ...image, free: constrainFreeRect(rect, settings.orientation) } : image));
  };

  const switchLayoutMode = (layoutMode) => {
    if (layoutMode === 'free') setImages((current) => ensureFreeLayouts(current, settings));
    setSettings((current) => ({ ...current, layoutMode }));
    setMarqueeMode(false);
    setMarquee(null);
    marqueeRef.current = null;
  };

  const changeOrientation = (orientation) => {
    if (isFree) setImages((current) => ensureFreeLayouts(current, { ...settings, orientation }));
    setSettings((current) => ({ ...current, orientation }));
  };

  const changeLayer = (direction) => {
    setImages((current) => {
      const item = current.find((image) => image.id === selectedId);
      const rest = current.filter((image) => image.id !== selectedId);
      return !item ? current : direction === 'front' ? [...rest, item] : [item, ...rest];
    });
  };

  const removeSelected = () => selectedIds.length && removeImages(selectedIds);

  const beginMarquee = (event, pageIndex) => {
    if (event.button !== 0) return;
    if (event.target.closest('.free-resize, .free-rotate, .tile-delete')) return;
    const startedOnImage = Boolean(event.target.closest('[data-layout-image-id]'));
    if (startedOnImage && !isMarqueeMode && (isFree || !event.shiftKey)) return;
    event.preventDefault();
    event.stopPropagation();
    const paper = event.currentTarget;
    const rect = paper.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    marqueeRef.current = {
      pointerId: event.pointerId,
      pageIndex,
      paper,
      rect,
      startX: x,
      startY: y,
      baseIds: additive ? selectedIdsRef.current : [],
    };
    paper.setPointerCapture(event.pointerId);
    if (!additive) setSelectedIds([]);
    setMarquee({ pageIndex, left: x, top: y, width: 0, height: 0 });
  };

  const moveMarquee = (event) => {
    const active = marqueeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const x = Math.max(0, Math.min(active.rect.width, event.clientX - active.rect.left));
    const y = Math.max(0, Math.min(active.rect.height, event.clientY - active.rect.top));
    const left = Math.min(active.startX, x);
    const top = Math.min(active.startY, y);
    const right = Math.max(active.startX, x);
    const bottom = Math.max(active.startY, y);
    const hitIds = Array.from(active.paper.querySelectorAll('[data-layout-image-id]'))
      .filter((element) => {
        const target = element.getBoundingClientRect();
        return target.right >= active.rect.left + left
          && target.left <= active.rect.left + right
          && target.bottom >= active.rect.top + top
          && target.top <= active.rect.top + bottom;
      })
      .map((element) => element.dataset.layoutImageId);
    const wanted = new Set([...active.baseIds, ...hitIds]);
    setSelectedIds(images.filter((image) => wanted.has(image.id)).map((image) => image.id));
    setMarquee({ pageIndex: active.pageIndex, left, top, width: right - left, height: bottom - top });
  };

  const endMarquee = (event) => {
    const active = marqueeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (active.paper.hasPointerCapture(event.pointerId)) active.paper.releasePointerCapture(event.pointerId);
    marqueeRef.current = null;
    setMarquee(null);
  };

  const handleFileDragEnter = (event) => {
    if (!containsFiles(event.dataTransfer)) return;
    event.preventDefault();
    fileDragDepthRef.current += 1;
    setDropActive(true);
  };

  const handleFileDragLeave = (event) => {
    if (!containsFiles(event.dataTransfer)) return;
    event.preventDefault();
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
    if (!fileDragDepthRef.current) setDropActive(false);
  };

  const handleFileDrop = (event) => {
    if (!containsFiles(event.dataTransfer)) return;
    event.preventDefault();
    fileDragDepthRef.current = 0;
    setDropActive(false);
    addFiles(event.dataTransfer.files);
  };

  const generatePdf = async () => {
    if (!images.length) return;
    setPrinting(true);
    setPdfProgress(0);
    setNotice({ type: 'loading', message: '正在生成内嵌 A4 PDF...' });
    try {
      const blob = await createLayoutPdf(pages, settings, setPdfProgress);
      const nextUrl = URL.createObjectURL(blob);
      setPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
      setNotice({ type: 'idle', message: '' });
    } catch (error) {
      setNotice({ type: 'error', message: `PDF 生成失败：${error.message}` });
    } finally {
      setPrinting(false);
    }
  };

  if (pdfUrl) {
    return <Suspense fallback={<div className="pdf-module-loading"><FilePdf size={38} /><b>正在打开 PDF 查看器</b></div>}><PdfPreview url={pdfUrl} filename="A4商品图拼版.pdf" onClose={() => setPdfUrl('')} onError={(message) => { setPdfUrl(''); setNotice({ type: 'error', message }); }} /></Suspense>;
  }

  const geometry = pageGeometry({
    orientation: settings.orientation,
    marginMm: settings.marginMm,
    gapMm: settings.gapMm,
    count: Math.min(settings.capacity, Math.max(1, images.length)),
  });
  const selectedDpi = selected ? effectiveDpi(selected, geometry, settings.fitMode) : 0;

  return (
    <div
      className={`app-shell ${isDropActive ? 'is-drop-active' : ''}`}
      onDragEnter={handleFileDragEnter}
      onDragOver={(event) => { if (containsFiles(event.dataTransfer)) event.preventDefault(); }}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <style>{`@page { size: A4 ${settings.orientation}; margin: 0; }`}</style>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><ImageSquare weight="fill" /></span><span><strong>A4 拼图打印台</strong><small>拖入图片，自动排版，直接打印</small></span></div>
        <div className="top-actions">
          <button className="button primary" type="button" disabled={!images.length || isPrinting} onClick={generatePdf}><FilePdf weight="fill" />{isPrinting ? `生成中 ${pdfProgress}%` : '生成 PDF 并预览'}</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-panel panel">
          <div className="panel-heading"><span><b>图片</b><small>{images.length} 张 · 已选 {selectedIds.length} 张</small></span><div className="panel-heading-actions">{!!images.length && <button className="text-button" type="button" onClick={() => setSelectedIds(selectedIds.length === images.length ? [] : images.map((image) => image.id))}>{selectedIds.length === images.length ? '取消全选' : '全选'}</button>}<button className="icon-button" type="button" onClick={() => fileInput.current?.click()} aria-label="添加图片"><UploadSimple /></button></div></div>
          <input ref={fileInput} hidden multiple type="file" accept="image/*" onChange={(event) => addFiles(event.target.files)} />
          {!images.length ? (
            <button className="empty-upload" type="button" onClick={() => fileInput.current?.click()}><UploadSimple size={30} /><b>拖入商品图片</b><span>或点击选择多个文件</span><small>支持 JPG、PNG、WebP</small></button>
          ) : (
            <div className="thumb-list">
              {images.map((image, index) => (
                <div key={image.id} data-image-id={image.id} className={`thumb ${selectedIds.includes(image.id) ? 'is-selected' : ''}`} onPointerEnter={(event) => continueSweepSelection(image.id, event)} onMouseEnter={(event) => continueSweepSelection(image.id, event)}>
                  <button className="thumb-select" type="button" onPointerDown={(event) => beginSweepSelection(image.id, event)}>
                    <img src={image.src} alt="" draggable="false" /><span><b>{index + 1}. {image.name}</b><small>{image.naturalWidth} × {image.naturalHeight}px</small></span>{selectedIds.includes(image.id) && <Check weight="bold" />}
                  </button>
                  <button className="thumb-delete" type="button" onClick={() => removeImage(image.id)} aria-label={`删除 ${image.name}`} title="删除这张图片"><X /></button>
                </div>
              ))}
            </div>
          )}
          {!!images.length && <div className="left-panel-footer"><span>按住鼠标扫过缩略图可多选；Ctrl/⌘ 或 Shift 点击也可多选；Delete / Backspace 批量删除</span><button className="add-more" type="button" onClick={() => fileInput.current?.click()}><UploadSimple />继续添加图片</button></div>}
        </aside>

        <section className="canvas-area" aria-label="A4 打印预览">
          <div className="canvas-toolbar">
            <span>A4 {settings.orientation === 'portrait' ? '纵向' : '横向'}</span>
            <span>{isFree ? '自由排版 · 移动 / 缩放 / 旋转' : settings.capacity === 9 ? '参考图版式：3 × 3' : `每页最多 ${settings.capacity} 张`}</span>
            <span>白边 {settings.marginMm}mm</span>
            <button className={`marquee-mode-button ${isMarqueeMode ? 'active' : ''}`} type="button" onClick={() => setMarqueeMode((current) => !current)}>{isMarqueeMode ? '框选模式：开启' : '框选图片'}</button>
          </div>
          {!images.length ? (
            <div className="canvas-empty"><div className="paper-skeleton"><ImageSquare /></div><b>这里会显示准确比例的 A4 版面</b><span>拖入图片后自动生成三列联系表</span></div>
          ) : (
            <div className={`print-document ${settings.orientation}`}>
              {pages.map((page, pageIndex) => {
                const template = templateForCount(page.length === settings.capacity ? settings.capacity : page.length);
                return (
                  <section
                    className={`paper ${isFree ? 'free-paper' : ''} ${isMarqueeMode ? 'is-marquee-mode' : ''}`}
                    key={pageIndex}
                    onPointerDownCapture={(event) => beginMarquee(event, pageIndex)}
                    onPointerMove={moveMarquee}
                    onPointerUp={endMarquee}
                    onPointerCancel={endMarquee}
                    style={{
                      '--page-margin': `${settings.marginMm}mm`,
                      '--page-gap': `${settings.gapMm}mm`,
                      '--page-columns': template.columns,
                      '--page-rows': template.rows,
                    }}
                  >
                    {isFree ? <div className="free-canvas">
                      <div className="free-margin-guide" style={{ inset: `${settings.marginMm / A4[settings.orientation][1] * 100}% ${settings.marginMm / A4[settings.orientation][0] * 100}%` }} />
                      {page.map((image) => <FreeImage key={image.id} image={image} orientation={settings.orientation}
                        selected={selectedIds.includes(image.id)} onSelect={(event) => selectImage(image.id, event)}
                        onChange={(rect) => updateFreeImage(image.id, rect)} />)}
                    </div> : <div className="photo-grid">
                      {page.map((image) => (
                        <ImageTile
                          key={image.id}
                          image={image}
                          selected={selectedIds.includes(image.id)}
                          primary={selectedId === image.id}
                          fitMode={settings.fitMode}
                          onSelect={(event) => selectImage(image.id, event)}
                          onPositionChange={updateSelected}
                          onDelete={removeSelected}
                        />
                      ))}
                    </div>}
                    {marquee?.pageIndex === pageIndex && <div className="selection-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }} />}
                    <span className="page-number">{pageIndex + 1} / {pages.length}</span>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <aside className="right-panel panel">
          <div className="panel-heading"><span><b>版面设置</b><small>所有尺寸按毫米输出</small></span><SlidersHorizontal /></div>
          <div className="control-section">
            <div className="field"><span>排版模式</span><div className="segmented"><button type="button" className={!isFree ? 'active' : ''} onClick={() => switchLayoutMode('grid')}>自动拼版</button><button type="button" className={isFree ? 'active' : ''} onClick={() => switchLayoutMode('free')}>自由排版</button></div></div>
            <label className="field"><span>纸张方向</span><div className="segmented"><button type="button" className={settings.orientation === 'portrait' ? 'active' : ''} onClick={() => changeOrientation('portrait')}>纵向</button><button type="button" className={settings.orientation === 'landscape' ? 'active' : ''} onClick={() => changeOrientation('landscape')}>横向</button></div></label>
            {!isFree && <>
            <label className="field"><span>每页图片</span><select value={settings.capacity} onChange={(event) => setSettings({ ...settings, capacity: Number(event.target.value) })}><option value="4">4 张（2 × 2）</option><option value="6">6 张（3 × 2）</option><option value="9">9 张（3 × 3，参考图）</option><option value="12">12 张（3 × 4）</option></select></label>
            <label className="field"><span>图片适配</span><div className="segmented"><button type="button" className={settings.fitMode === 'cover' ? 'active' : ''} onClick={() => setSettings({ ...settings, fitMode: 'cover' })}>铺满</button><button type="button" className={settings.fitMode === 'contain' ? 'active' : ''} onClick={() => setSettings({ ...settings, fitMode: 'contain' })}>完整显示</button></div></label>
            </>}
            <RangeField label="纸张白边" value={settings.marginMm} min={5} max={25} unit="mm" onChange={(marginMm) => setSettings({ ...settings, marginMm })} />
            {!isFree && <RangeField label="图片间距" value={settings.gapMm} min={0} max={10} step={0.5} unit="mm" onChange={(gapMm) => setSettings({ ...settings, gapMm })} />}
          </div>

          <div className="control-section selected-controls">
            <div className="section-title"><span><b>{isFree ? '自由调整' : '单图微调'}</b><small>{selected ? `${selected.name}${selectedIds.length > 1 ? `（共选 ${selectedIds.length} 张）` : ''}` : '先点击版面中的图片'}</small></span>{selected && !isFree && <button type="button" className="icon-button" onClick={resetSelected} aria-label="重置图片调整"><ArrowClockwise /></button>}</div>
            {selected && isFree ? <FreeControls image={selected} orientation={settings.orientation} pageCount={pages.length}
              selectionCount={selectedIds.length} onChange={(rect) => updateFreeImage(selected.id, rect)} onLayer={changeLayer} onDelete={removeSelected} /> : selected ? <>
              <RangeField label="缩放" value={selected.zoom} min={80} max={200} unit="%" onChange={(zoom) => updateSelected({ zoom })} />
              <RangeField label="水平位置" value={Math.round(selected.x)} min={0} max={100} unit="%" onChange={(x) => updateSelected({ x })} />
              <RangeField label="垂直位置" value={Math.round(selected.y)} min={0} max={100} unit="%" onChange={(y) => updateSelected({ y })} />
              <div className="inline-actions"><button type="button" onClick={() => updateSelected({ rotation: (selected.rotation + 90) % 360 })}><ArrowsClockwise />旋转 90°</button><button type="button" className="danger" onClick={removeSelected}><Trash />删除选中{selectedIds.length > 1 ? ` ${selectedIds.length} 张` : ''}</button></div>
              <div className="keyboard-hint"><kbd>Delete</kbd><span>或</span><kbd>Backspace</kbd><span>批量删除全部选中图片</span></div>
              <div className={`quality-note ${selectedDpi < 150 ? 'warning' : ''}`}>{selectedDpi < 150 ? <Warning weight="fill" /> : <Check weight="bold" />}<span><b>预计有效分辨率 {selectedDpi} DPI</b><small>{selectedDpi < 150 ? '图片可能偏糊，建议缩小或换高清原图。' : '适合普通 A4 彩色打印。'}</small></span></div>
            </> : <div className="selection-empty">点击纸张上的任意图片，可拖动主体位置并调整缩放。</div>}
          </div>

          <div className="control-section print-settings">
            <div className="section-title"><span><b>固定版式 PDF</b><small>先生成 PDF，再在应用内打印</small></span><FilePdf /></div>
            <div className="print-help"><b>生成后可执行</b><span>左侧查看每页缩略图</span><span>放大核对图片清晰度</span><span>下载固定版式 PDF</span><span>从 PDF 查看器调用本地打印机</span></div>
            <button className="button primary full-width" type="button" disabled={!images.length || isPrinting} onClick={generatePdf}><FilePdf weight="fill" />{isPrinting ? `正在生成 ${pdfProgress}%` : '生成 PDF 并预览'}</button>
          </div>
        </aside>
      </main>

      {notice.message && <div className={`notice ${notice.type}`} role="status"><span>{notice.type === 'success' ? <Check weight="bold" /> : notice.type === 'error' ? <Warning weight="fill" /> : <ArrowClockwise className="spin" />}{notice.message}</span><button type="button" onClick={() => setNotice({ type: 'idle', message: '' })} aria-label="关闭提示"><X /></button></div>}
      {isDropActive && <div className="drop-overlay"><UploadSimple size={46} /><b>松开即可自动排版</b><span>可以一次拖入多张图片</span></div>}
    </div>
  );
}
