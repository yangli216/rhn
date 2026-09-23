import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StandardCatalogPdfPage } from './StandardCatalogPdfPage'

const pdf = vi.hoisted(() => ({getPage: vi.fn(), destroy: vi.fn().mockResolvedValue(undefined)}))
vi.mock('pdfjs-dist', () => ({GlobalWorkerOptions: {}, getDocument: () => ({promise: Promise.resolve(pdf), destroy: pdf.destroy})}))
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals(); pdf.getPage.mockReset(); pdf.destroy.mockClear()})

it('renders at the pane width, follows the selected page and cleans up on close', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}})
  const cancel = vi.fn(), draw = vi.fn().mockReturnValue({promise: Promise.resolve(), cancel})
  pdf.getPage.mockResolvedValue({getViewport: ({scale}: {scale: number}) => ({width: 400 * scale, height: 600 * scale}), render: draw})
  const ready = vi.fn(), blob = {arrayBuffer: async () => new ArrayBuffer(0)} as Blob
  const {rerender, unmount} = render(<StandardCatalogPdfPage blob={blob} page={15} onReady={ready} />)
  await waitFor(() => expect(ready).toHaveBeenCalledWith(15))
  expect(screen.getByRole('img', {name: '来源原稿 PDF · 第 15 页'})).toHaveAttribute('width', String(640 * window.devicePixelRatio))
  rerender(<StandardCatalogPdfPage blob={blob} page={16} onReady={ready} />)
  await waitFor(() => expect(ready).toHaveBeenCalledWith(16))
  expect(pdf.getPage).toHaveBeenLastCalledWith(16)
  expect(cancel).toHaveBeenCalled()
  unmount(); expect(pdf.destroy).toHaveBeenCalled()
})

it('reports rendering failure without enabling verification', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}})
  pdf.getPage.mockRejectedValue(new Error('原稿页码无效'))
  const ready = vi.fn()
  render(<StandardCatalogPdfPage blob={{arrayBuffer: async () => new ArrayBuffer(0)} as Blob} page={999} onReady={ready} />)
  await screen.findByText(/原稿显示失败：原稿页码无效/)
  expect(ready).not.toHaveBeenCalledWith(999)
})
