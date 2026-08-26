import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, DownloadSimple, FilePdf, Minus, Plus, Printer } from '@phosphor-icons/react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

function PdfCanvas({ document, pageNumber, scale, thumbnail = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    let renderTask;
    const render = async () => {
      const page = await document.getPage(pageNumber);
      if (!active || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, thumbnail ? 1.5 : 2);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
    };
    render().catch(() => {});
    return () => { active = false; renderTask?.cancel(); };
  }, [document, pageNumber, scale, thumbnail]);

  return <canvas ref={canvasRef} aria-label={`PDF 第 ${pageNumber} 页`} />;
}

export function PdfPreview({ url, filename, onClose, onError }) {
  const [document, setDocument] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const pageRefs = useRef([]);

  useEffect(() => {
    let active = true;
    const task = getDocument({ url });
    task.promise.then((pdf) => { if (active) setDocument(pdf); }).catch((error) => { if (active) onError(`PDF 预览加载失败：${error.message}`); });
    return () => { active = false; task.destroy(); };
  }, [url]);

  useEffect(() => {
    if (!document) return undefined;
    const root = window.document.querySelector('.pdf-pages');
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setCurrentPage(Number(visible.target.dataset.page));
    }, { root, threshold: [0.2, 0.5, 0.8] });
    pageRefs.current.forEach((page) => page && observer.observe(page));
    return () => observer.disconnect();
  }, [document, zoom]);

  const goToPage = (page) => {
    pageRefs.current[page - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  };

  const print = () => {
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      onError('浏览器拦截了打印窗口，请允许此网站打开弹窗，或先下载 PDF 后打印。');
      return;
    }
    window.setTimeout(() => {
      try { printWindow.print(); } catch { /* PDF toolbar still provides print. */ }
    }, 700);
  };

  const pages = document ? Array.from({ length: document.numPages }, (_, index) => index + 1) : [];

  return (
    <div className="pdf-preview-shell">
      <header className="pdf-appbar">
        <button type="button" className="pdf-back" onClick={onClose}><ArrowLeft />返回排版</button>
        <span className="pdf-file"><FilePdf weight="fill" /><b>{filename}</b><small>{document ? `${document.numPages} 页` : '正在加载'}</small></span>
        <div className="pdf-actions"><a className="button secondary" href={url} download={filename}><DownloadSimple />下载</a><button className="button primary" type="button" onClick={print}><Printer weight="fill" />打印</button></div>
      </header>
      <div className="pdf-toolbar">
        <span className="pdf-page-control"><input aria-label="当前页" value={currentPage} onChange={(event) => goToPage(Math.max(1, Math.min(document?.numPages || 1, Number(event.target.value) || 1)))} /> / {document?.numPages || 0}</span>
        <span className="pdf-zoom-control"><button type="button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(.6, value - .1))}><Minus /></button><output>{Math.round(zoom * 100)}%</output><button type="button" aria-label="放大" onClick={() => setZoom((value) => Math.min(2, value + .1))}><Plus /></button></span>
      </div>
      <div className="pdf-viewer">
        <aside className="pdf-thumbnails" aria-label="PDF 页面缩略图">
          {pages.map((page) => <button className={currentPage === page ? 'active' : ''} type="button" key={page} onClick={() => goToPage(page)}><PdfCanvas document={document} pageNumber={page} scale={0.22} thumbnail /><span>{page}</span></button>)}
        </aside>
        <main className="pdf-pages">
          {!document && <div className="pdf-loading"><FilePdf size={34} /><b>正在渲染 PDF</b></div>}
          {pages.map((page) => <section className="pdf-page" data-page={page} key={page} ref={(element) => { pageRefs.current[page - 1] = element; }}><PdfCanvas document={document} pageNumber={page} scale={1.15 * zoom} /></section>)}
        </main>
      </div>
    </div>
  );
}
