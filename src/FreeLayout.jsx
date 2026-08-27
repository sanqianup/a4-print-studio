import { useEffect, useRef } from 'react';
import { A4 } from './layout';
import { freeRectStyle, normalizeAngle, resizeFreeRect } from './free-layout';
import './free-layout.css';

export function FreeImage({ image, selected, orientation, onSelect, onChange }) {
  const gesture = useRef(null);
  const rect = image.free;
  const begin = (event, action = 'move') => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(event);
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    const paper = event.currentTarget.closest('.paper').getBoundingClientRect();
    const [pageWidth, pageHeight] = A4[orientation];
    const px = (event.clientX - paper.left) / paper.width * pageWidth;
    const py = (event.clientY - paper.top) / paper.height * pageHeight;
    gesture.current = { action, id: event.pointerId, target: event.currentTarget, rect: { ...rect }, paper, px, py, distance: Math.hypot(px - rect.cx, py - rect.cy), angle: Math.atan2(py - rect.cy, px - rect.cx) };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event) => {
    const g = gesture.current;
    if (!g || event.pointerId !== undefined && g.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const [pageWidth, pageHeight] = A4[orientation];
    const px = (event.clientX - g.paper.left) / g.paper.width * pageWidth;
    const py = (event.clientY - g.paper.top) / g.paper.height * pageHeight;
    if (g.action === 'move') onChange({ ...g.rect, cx: g.rect.cx + px - g.px, cy: g.rect.cy + py - g.py });
    if (g.action === 'resize') onChange(resizeFreeRect(g.rect, g.rect.width * Math.hypot(px - g.rect.cx, py - g.rect.cy) / Math.max(g.distance, .01), orientation));
    if (g.action === 'rotate') {
      let angle = normalizeAngle(g.rect.angle + (Math.atan2(py - g.rect.cy, px - g.rect.cx) - g.angle) * 180 / Math.PI);
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      onChange({ ...g.rect, angle });
    }
  };
  const end = (event) => {
    const g = gesture.current;
    if (!g || event.pointerId !== undefined && g.id !== event.pointerId) return;
    event.stopPropagation();
    gesture.current = null;
    if (g.target.hasPointerCapture(g.id)) g.target.releasePointerCapture(g.id);
  };
  const handlers = useRef({ move, end });
  handlers.current = { move, end };
  useEffect(() => {
    // Keep gestures alive beyond a small resize handle, including browsers that
    // lose pointer capture after focus/selection changes. Mouse is a fallback.
    const onMove = (event) => handlers.current.move(event);
    const onEnd = (event) => handlers.current.end(event);
    const moveEvents = ['pointermove', 'mousemove'];
    const endEvents = ['pointerup', 'pointercancel', 'mouseup'];
    moveEvents.forEach((name) => document.addEventListener(name, onMove, true));
    endEvents.forEach((name) => document.addEventListener(name, onEnd, true));
    window.addEventListener('blur', onEnd);
    return () => {
      moveEvents.forEach((name) => document.removeEventListener(name, onMove, true));
      endEvents.forEach((name) => document.removeEventListener(name, onEnd, true));
      window.removeEventListener('blur', onEnd);
      gesture.current = null;
    };
  }, []);
  return <div className={`free-image ${selected ? 'is-selected' : ''}`} data-layout-image-id={image.id}
    style={freeRectStyle(rect, orientation)} onDragStart={(event) => event.preventDefault()}>
    <button className="free-image-body" type="button" aria-label={`移动 ${image.name}`} onPointerDown={begin}
      onClick={(event) => { if (event.detail === 0) onSelect(event); }}>
      <img src={image.src} draggable="false" alt="" />
    </button>
    {selected && <>
      <button type="button" className="free-rotate" aria-label={`拖动旋转 ${image.name}`} title="拖动旋转；按住 Shift 按 15° 吸附" onPointerDown={(event) => begin(event, 'rotate')}>↻</button>
      {['nw', 'ne', 'sw', 'se'].map((corner) => <button key={corner} type="button" className={`free-resize ${corner}`} aria-label={`等比缩放 ${corner} ${image.name}`} onPointerDown={(event) => begin(event, 'resize')} />)}
    </>}
  </div>;
}

function NumericField({ label, value, min, max, onChange, step = .1 }) {
  return <label className="free-number"><span>{label}</span><input aria-label={label} type="number" step={step} min={min} max={max} value={Number(value.toFixed(1))}
    onChange={(event) => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber); }} /></label>;
}

export function FreeControls({ image, orientation, pageCount, onChange, onLayer, onDelete, selectionCount }) {
  const rect = image.free;
  const [pageWidth, pageHeight] = A4[orientation];
  const scale = Math.round(rect.width / rect.baseWidth * 100);
  return <>
    <p className="free-help">拖动图片移动；拖动四角等比缩放；拖动上方圆钮旋转。以下数值调整当前图片，删除操作作用于全部选中图片。</p>
    <div className="free-numbers">
      <NumericField label="中心 X（mm）" value={rect.cx} min={0} max={pageWidth} onChange={(cx) => onChange({ ...rect, cx })} />
      <NumericField label="中心 Y（mm）" value={rect.cy} min={0} max={pageHeight} onChange={(cy) => onChange({ ...rect, cy })} />
      <NumericField label="宽度（mm）" value={rect.width} min={5} max={pageWidth} onChange={(width) => onChange(resizeFreeRect(rect, width, orientation))} />
      <NumericField label="旋转角度（°）" value={rect.angle} min={-180} max={180} step={1} onChange={(angle) => onChange({ ...rect, angle })} />
    </div>
    <label className="range-field"><span><b>等比缩放</b><output>{scale}%</output></span><input aria-label="自由缩放" type="range" min={5} max={Math.max(300, scale)} value={scale} onChange={(event) => onChange(resizeFreeRect(rect, rect.baseWidth * Number(event.target.value) / 100, orientation))} /></label>
    <label className="range-field"><span><b>任意旋转</b><output>{Math.round(rect.angle)}°</output></span><input aria-label="自由旋转" type="range" min={-180} max={180} value={rect.angle} onChange={(event) => onChange({ ...rect, angle: Number(event.target.value) })} /></label>
    <label className="field"><span>所在页面</span><select aria-label="自由图片所在页面" value={rect.page} onChange={(event) => onChange({ ...rect, page: Number(event.target.value) })}>
      {Array.from({ length: Math.min(999, pageCount + 1) }, (_, index) => <option key={index} value={index + 1}>第 {index + 1} 页{index === pageCount ? '（新增页）' : ''}</option>)}
    </select></label>
    <div className="inline-actions"><button type="button" onClick={() => onChange({ ...rect, cx: pageWidth / 2, cy: pageHeight / 2 })}>纸张居中</button><button type="button" onClick={() => onChange({ ...rect, angle: rect.angle + 90 })}>顺时针 90°</button></div>
    <div className="inline-actions free-actions"><button type="button" onClick={() => onLayer('front')}>置于顶层</button><button type="button" onClick={() => onLayer('back')}>置于底层</button></div>
    <div className="inline-actions free-actions"><button type="button" className="danger" onClick={onDelete}>删除选中 {selectionCount} 张</button></div>
    <p className="free-help">整张图完整显示、可叠放，不使用网格裁切。图片越出 A4 边界时会自动限制位置或等比缩小；虚线是打印白边参考线。</p>
  </>;
}
