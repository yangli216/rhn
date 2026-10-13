import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi, ServiceCatalogItem } from '../../../shared/rhnApi'
import { DiagnosticTemplateDialog } from './DiagnosticTemplateDialog'

function setup(fail=false) {
  const masterData={ diagnosticTemplates:vi.fn().mockResolvedValue([]), units:vi.fn().mockResolvedValue([]),
    publishDiagnosticTemplate:vi.fn().mockRejectedValue(new Error('发布失败，修改仍保留')) }
  if(fail) masterData.diagnosticTemplates.mockRejectedValue(new Error('读取失败'))
  const client=new QueryClient({ defaultOptions:{ queries:{retry:false}, mutations:{retry:false} } })
  const close=vi.fn()
  render(<QueryClientProvider client={client}><DiagnosticTemplateDialog api={{masterData} as unknown as RhnApi}
    service={{id:'catalog1',name:'检验项目',sdServiceType:'LABORATORY'} as ServiceCatalogItem} organizationId="org1" onClose={close} /></QueryClientProvider>)
  return {masterData,close}
}
describe('institution diagnostic template publication',()=>{
  it('does not populate clinical thresholds and retains edits after failed publication',async()=>{
    const {masterData}=setup()
    await screen.findByText('尚未发布机构模板；不自动载入示例阈值。')
    fireEvent.change(screen.getByLabelText(/生效日期/),{target:{value:'2026-10-13'}})
    fireEvent.change(screen.getByLabelText(/机构确认与发布依据/),{target:{value:'机构负责人确认依据'}})
    fireEvent.click(screen.getByRole('button',{name:'添加模板指标'}))
    fireEvent.change(screen.getByLabelText('指标代码'),{target:{value:'GLU'}})
    fireEvent.change(screen.getByLabelText('指标名称'),{target:{value:'血糖'}})
    fireEvent.click(screen.getByRole('button',{name:'添加参考规则'}))
    expect(screen.getByLabelText('参考下限（含）')).toHaveValue(null)
    expect(screen.getByLabelText('危急低阈值（小于）')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button',{name:'发布新版本'}))
    await screen.findByText('发布失败，修改仍保留')
    expect(screen.getByLabelText('指标代码')).toHaveValue('GLU')
    expect(masterData.publishDiagnosticTemplate).toHaveBeenCalledWith('catalog1',expect.objectContaining({ expectedVersion:0,
      publicationBasis:'机构负责人确认依据',content:expect.objectContaining({indicators:[expect.objectContaining({code:'GLU'})]}) }))
  })
  it('protects unsubmitted changes on close',async()=>{
    const {close}=setup()
    await screen.findByText('尚未发布机构模板；不自动载入示例阈值。')
    fireEvent.change(screen.getByLabelText(/机构确认与发布依据/),{target:{value:'尚未发布'}})
    fireEvent.click(screen.getByRole('button',{name:'关闭'}))
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'继续编辑'}))
    expect(screen.getByLabelText(/机构确认与发布依据/)).toHaveValue('尚未发布')
  })
  it('blocks publication when maintained templates cannot be read',async()=>{
    setup(true)
    await screen.findByText('读取失败')
    await waitFor(()=>expect(screen.getByRole('button',{name:'发布新版本'})).toBeDisabled())
  })
})
