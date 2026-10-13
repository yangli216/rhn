import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiagnosticPrintAction } from './DiagnosticPrintAction'
import type { RhnApi } from '../rhnApi'

function setup(overrides = {}, label = false) {
  const printing = { recordsBySource: vi.fn().mockResolvedValue([]), submitTask: vi.fn().mockResolvedValue({ jobId: 'job1', downloadUrl: '/pdf' }),
    reprint: vi.fn().mockResolvedValue({ jobId: 'job2', downloadUrl: '/pdf' }), download: vi.fn().mockResolvedValue(undefined), ...overrides }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <DiagnosticPrintAction api={{ printing } as unknown as RhnApi} encounterId="enc1" sourceId="source1" label={label}
      taskCode={label ? 'DIAGNOSTICS.SPECIMEN.LABEL.PRINT' : 'DIAGNOSTICS.LABORATORY.REPORT.PRINT'} />
  </QueryClientProvider>)
  return printing
}
describe('diagnostic platform printing', () => {
  it('retries a failed download using the same frozen output and makes no claim that paper was printed', async () => {
    const api = setup({ download: vi.fn().mockRejectedValueOnce(new Error('下载失败')).mockResolvedValue(undefined) })
    fireEvent.click(screen.getByText('下载正式报告 PDF'))
    await screen.findByText('下载失败')
    fireEvent.click(screen.getByText('下载正式报告 PDF'))
    await screen.findByText('PDF 已生成并下载；请按实际打印设备完成打印。')
    expect(api.submitTask).toHaveBeenCalledTimes(1)
    expect(api.download).toHaveBeenCalledTimes(2)
    expect(api.reprint).not.toHaveBeenCalled()
  })
  it('requires a reason for an existing label and uses the platform reprint receipt', async () => {
    const api = setup({ recordsBySource: vi.fn().mockResolvedValue([{ sourceId: 'source1', sourceType: 'DiagnosticSpecimen',
      encounterId: 'enc1', taskCode: 'DIAGNOSTICS.SPECIMEN.LABEL.PRINT', jobs: [{ jobId: 'original' }] }]) }, true)
    fireEvent.click(screen.getByText('下载标本标签 PDF'))
    await screen.findByText('此标本已生成标签，请填写补打原因')
    expect(api.reprint).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('标签补打原因'), { target: { value: '标签污损' } })
    fireEvent.click(screen.getByText('下载标本标签 PDF'))
    await waitFor(() => expect(api.reprint).toHaveBeenCalledWith('original', 1, '标签污损', expect.any(String)))
    expect(api.submitTask).not.toHaveBeenCalled()
  })
  it('refuses a print history associated with another source', async () => {
    const api = setup({ recordsBySource: vi.fn().mockResolvedValue([{ sourceId: 'wrong-source', sourceType: 'DiagnosticReport', encounterId: 'enc1' }]) })
    fireEvent.click(screen.getByText('下载正式报告 PDF'))
    await screen.findByText('打印记录与当前业务来源不一致，请重新读取')
    expect(api.submitTask).not.toHaveBeenCalled(); expect(api.download).not.toHaveBeenCalled()
  })
})
