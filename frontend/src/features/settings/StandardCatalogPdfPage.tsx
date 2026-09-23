import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Button, LoadingState } from '../../shared/ui'
import { errorMessage } from '../../shared/rhnApi'

GlobalWorkerOptions.workerSrc = workerUrl

/** Render the selected source page in-app, including browsers without a native PDF viewer. */
export function StandardCatalogPdfPage({blob, page, onReady}: {blob: Blob; page: number; onReady: (page: number) => void}) {
  const container = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const renderedPdf = useRef<PDFDocumentProxy | undefined>(undefined), renderedPage = useRef<number | undefined>(undefined)
  const [retry, setRetry] = useState(0)
  const [pdf, setPdf] = useState<PDFDocumentProxy>(), [width, setWidth] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true, task: ReturnType<typeof getDocument> | undefined
    setPdf(undefined); setError('')
    void blob.arrayBuffer().then(bytes => {
      if (!active) return
      task = getDocument({data: new Uint8Array(bytes)})
      return task.promise.then(document => {if (active) setPdf(document)})
    }).catch(e => {if (active) setError(errorMessage(e))})
    return () => {active = false; if (task) void task.destroy()}
  }, [blob, retry])
  useEffect(() => {
    const element = container.current
    if (!element) return
    // Measure the content box rather than clientWidth. Once the canvas is
    // shown, the vertical scrollbar can reduce clientWidth by a few pixels;
    // measuring that value made the render effect hide/show the canvas in a
    // loop and produced the visible flicker in the source pane.
    const measure = (entry?: ResizeObserverEntry) => {
      const next = Math.floor(entry?.contentRect.width ?? element.clientWidth)
      setWidth(previous => previous === next ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(entries => measure(entries[0])); observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let active = true, task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    const needsInitialPaint = renderedPdf.current !== pdf || renderedPage.current !== page
    if (needsInitialPaint) { setReady(false); onReady(0) }
    if (!pdf || !width || !canvas.current) return
    setError('')
    const target = canvas.current
    void pdf.getPage(page).then(source => {
      if (!active) return
      const viewport = source.getViewport({scale: 1})
      const scaled = source.getViewport({scale: width / viewport.width * (window.devicePixelRatio || 1)})
      target.width = Math.ceil(scaled.width); target.height = Math.ceil(scaled.height)
      task = source.render({canvas: target, viewport: scaled})
      return task.promise.then(() => {if (active) {
        renderedPdf.current = pdf; renderedPage.current = page
        setReady(true); onReady(page)
      }})
    }).catch(e => {if (active) setError(errorMessage(e))})
    if (container.current) container.current.scrollTop = 0
    return () => {active = false; task?.cancel()}
  }, [pdf, page, width, onReady])
  return <div className="catalog-review__pdf-page" ref={container} role="region" aria-label="原稿阅读区" tabIndex={0}>
    {!ready && !error && <LoadingState label={`正在显示原稿第 ${page} 页…`} />}
    {error && <p role="alert">原稿显示失败：{error} <Button variant="secondary" onClick={() => setRetry(value => value + 1)}>重试显示</Button></p>}
    <canvas ref={canvas} hidden={!ready} role="img" aria-label={`来源原稿 PDF · 第 ${page} 页`} />
  </div>
}
