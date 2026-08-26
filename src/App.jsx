import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { effectiveDpi, pageGeometry, paginate, templateForCount } from './layout';
import { createLayoutPdf } from './pdf';

const PdfPreview = lazy(() => import('./PdfPreview').then((module) => ({ default: module.PdfPreview })));

const DEFAULT_SETTINGS = {
  orientation: 'portrait',
  capacity: 9,
  marginMm: 12,
  gapMm: 3,
  fitMode: 'cover',
  copies: 1,
};

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

function ImageTile({ image, selected, fitMode, onSelect, onPositionChange }) {
  const pointer = useRef(null);
  const start = useRef(null);

  const beginDrag = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    start.current = { clientX: event.clientX, clientY: event.clientY, x: image.x, y: image.y };
    onSelect();
  };

  const moveImage = (event) => {
    if (pointer.current !== event.pointerId || !start.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, start.current.x + ((event.clientX - start.current.clientX) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, start.current.y + ((event.clientY - start.current.clientY) / rect.height) * 100));
    onPositionChange({ x, y });
  };

  const endDrag = () => {
    pointer.current = null;
    start.current = null;
  };

  return (
    <button
      className={`image-tile ${selected ? 'is-selected' : ''}`}
      type="button"
      aria-label={`调整 ${image.name}`}
      onPointerDown={beginDrag}
      onPointerMove={moveImage}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
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
  );
}

export function App() {
  const [images, setImages] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedId, setSelectedId] = useState(null);
  const [isDropActive, setDropActive] = useState(false);
  const [notice, setNotice] = useState({ type: 'idle', message: '' });
  const [isPrinting, setPrinting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfProgress, setPdfProgress] = useState(0);
  const fileInput = useRef(null);

  const selected = images.find((image) => image.id === selectedId) || null;
  const pages = useMemo(() => paginate(images, settings.capacity), [images, settings.capacity]);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const addFiles = async (fileList) => {
    const files = [...fileList].filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setNotice({ type: 'error', message: '请拖入 JPG、PNG、WebP 或其他常见图片文件。' });
      return;
    }
    setNotice({ type: 'loading', message: `正在读取 ${files.length} 张图片...` });
    try {
      const loaded = await Promise.all(files.map(readImage));
      setImages((current) => [...current, ...loaded]);
      setSelectedId(loaded[0]?.id || null);
      setNotice({ type: 'success', message: `已加入 ${loaded.length} 张图片，版面已自动更新。` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  };

  const updateSelected = (patch) => {
    setImages((current) => current.map((image) => image.id === selectedId ? { ...image, ...patch } : image));
  };

  const resetSelected = () => updateSelected({ zoom: 100, x: 50, y: 50, rotation: 0 });

  const removeImage = (imageId) => {
    setImages((current) => current.filter((image) => image.id !== imageId));
    if (selectedId === imageId) setSelectedId(null);
  };

  const removeSelected = () => selectedId && removeImage(selectedId);

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
      onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }}
      onDrop={(event) => { event.preventDefault(); setDropActive(false); addFiles(event.dataTransfer.files); }}
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
          <div className="panel-heading"><span><b>图片</b><small>{images.length} 张，{pages.length || 0} 页</small></span><button className="icon-button" type="button" onClick={() => fileInput.current?.click()} aria-label="添加图片"><UploadSimple /></button></div>
          <input ref={fileInput} hidden multiple type="file" accept="image/*" onChange={(event) => addFiles(event.target.files)} />
          {!images.length ? (
            <button className="empty-upload" type="button" onClick={() => fileInput.current?.click()}><UploadSimple size={30} /><b>拖入商品图片</b><span>或点击选择多个文件</span><small>支持 JPG、PNG、WebP</small></button>
          ) : (
            <div className="thumb-list">
              {images.map((image, index) => (
                <div key={image.id} className={`thumb ${selectedId === image.id ? 'is-selected' : ''}`}>
                  <button className="thumb-select" type="button" onClick={() => setSelectedId(image.id)}>
                    <img src={image.src} alt="" /><span><b>{index + 1}. {image.name}</b><small>{image.naturalWidth} × {image.naturalHeight}px</small></span>{selectedId === image.id && <Check weight="bold" />}
                  </button>
                  <button className="thumb-delete" type="button" onClick={() => removeImage(image.id)} aria-label={`删除 ${image.name}`} title="删除这张图片"><X /></button>
                </div>
              ))}
            </div>
          )}
          {!!images.length && <button className="add-more" type="button" onClick={() => fileInput.current?.click()}><UploadSimple />继续添加图片</button>}
        </aside>

        <section className="canvas-area" aria-label="A4 打印预览">
          <div className="canvas-toolbar">
            <span>A4 {settings.orientation === 'portrait' ? '纵向' : '横向'}</span>
            <span>{settings.capacity === 9 ? '参考图版式：3 × 3' : `每页最多 ${settings.capacity} 张`}</span>
            <span>白边 {settings.marginMm}mm</span>
          </div>
          {!images.length ? (
            <div className="canvas-empty"><div className="paper-skeleton"><ImageSquare /></div><b>这里会显示准确比例的 A4 版面</b><span>拖入图片后自动生成三列联系表</span></div>
          ) : (
            <div className={`print-document ${settings.orientation}`}>
              {pages.map((page, pageIndex) => {
                const template = templateForCount(page.length === settings.capacity ? settings.capacity : page.length);
                return (
                  <section
                    className="paper"
                    key={pageIndex}
                    style={{
                      '--page-margin': `${settings.marginMm}mm`,
                      '--page-gap': `${settings.gapMm}mm`,
                      '--page-columns': template.columns,
                      '--page-rows': template.rows,
                    }}
                  >
                    <div className="photo-grid">
                      {page.map((image) => (
                        <ImageTile
                          key={image.id}
                          image={image}
                          selected={selectedId === image.id}
                          fitMode={settings.fitMode}
                          onSelect={() => setSelectedId(image.id)}
                          onPositionChange={updateSelected}
                        />
                      ))}
                    </div>
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
            <label className="field"><span>纸张方向</span><div className="segmented"><button type="button" className={settings.orientation === 'portrait' ? 'active' : ''} onClick={() => setSettings({ ...settings, orientation: 'portrait' })}>纵向</button><button type="button" className={settings.orientation === 'landscape' ? 'active' : ''} onClick={() => setSettings({ ...settings, orientation: 'landscape' })}>横向</button></div></label>
            <label className="field"><span>每页图片</span><select value={settings.capacity} onChange={(event) => setSettings({ ...settings, capacity: Number(event.target.value) })}><option value="4">4 张（2 × 2）</option><option value="6">6 张（3 × 2）</option><option value="9">9 张（3 × 3，参考图）</option><option value="12">12 张（3 × 4）</option></select></label>
            <label className="field"><span>图片适配</span><div className="segmented"><button type="button" className={settings.fitMode === 'cover' ? 'active' : ''} onClick={() => setSettings({ ...settings, fitMode: 'cover' })}>铺满</button><button type="button" className={settings.fitMode === 'contain' ? 'active' : ''} onClick={() => setSettings({ ...settings, fitMode: 'contain' })}>完整显示</button></div></label>
            <RangeField label="纸张白边" value={settings.marginMm} min={5} max={25} unit="mm" onChange={(marginMm) => setSettings({ ...settings, marginMm })} />
            <RangeField label="图片间距" value={settings.gapMm} min={0} max={10} step={0.5} unit="mm" onChange={(gapMm) => setSettings({ ...settings, gapMm })} />
          </div>

          <div className="control-section selected-controls">
            <div className="section-title"><span><b>单图微调</b><small>{selected ? selected.name : '先点击版面中的图片'}</small></span>{selected && <button type="button" className="icon-button" onClick={resetSelected} aria-label="重置图片调整"><ArrowClockwise /></button>}</div>
            {selected ? <>
              <RangeField label="缩放" value={selected.zoom} min={80} max={200} unit="%" onChange={(zoom) => updateSelected({ zoom })} />
              <RangeField label="水平位置" value={Math.round(selected.x)} min={0} max={100} unit="%" onChange={(x) => updateSelected({ x })} />
              <RangeField label="垂直位置" value={Math.round(selected.y)} min={0} max={100} unit="%" onChange={(y) => updateSelected({ y })} />
              <div className="inline-actions"><button type="button" onClick={() => updateSelected({ rotation: (selected.rotation + 90) % 360 })}><ArrowsClockwise />旋转 90°</button><button type="button" className="danger" onClick={removeSelected}><Trash />移除</button></div>
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
