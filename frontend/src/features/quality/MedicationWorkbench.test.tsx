import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationWorkbench } from './MedicationWorkbench'

const med={medication:{id:'123456789012345678',code:'HIS-AMOX',name:'阿莫西林',preparationSpec:'0.25g',strengthValue:250,strengthUnit:'mg',antimicrobial:true,antimicrobialMaxDays:7},revision:3,semanticStatus:'LEGACY',capturedAt:'2026-09-16T00:00:00Z',classifications:[{display:'青霉素类',systemCode:'ATC',systemVersion:'2026'}],allergens:[{id:'17',display:'青霉素'}],standardMappings:[{id:'18',systemName:'标准药品目录',termCode:'AMOX',termDisplay:'阿莫西林'}]}
const candidate={id:'900001',parentId:null,version:1,requirement:'重复核对',source:'机构制度',model:'real-configured-model',createdAt:'2026-09-16T00:00:00Z',status:'CANDIDATE',rule:{template:'EXACT_GENERIC_DUPLICATE',name:'重复核对',explanation:'按通用药 ID 核对',duplicateCount:2,message:'请核对',decision:'WARN'},medications:[med]}
function setup(available:boolean,saved:unknown[]=[]){
  const medicationWorkbench={status:vi.fn().mockResolvedValue({available,model:available?'real-configured-model':null,message:'请配置真实模型'}),medications:vi.fn().mockResolvedValue([med]),candidates:vi.fn().mockResolvedValue(saved),generate:vi.fn().mockResolvedValue({status:'CLARIFY',message:'请说明重复次数',candidate:null}),suite:vi.fn().mockResolvedValue({id:'r1',candidateId:'900001',mode:'SYNTHETIC',createdAt:'2026-09-16T00:00:00Z',cases:[{name:'缺失输入',expected:'UNAVAILABLE',actual:'UNAVAILABLE',passed:true,reasons:['缺少通用药 ID'],matchedRows:[],input:[]}]}),runs:vi.fn().mockResolvedValue([])}
  render(<MemoryRouter><MedicationWorkbench api={{medicationWorkbench} as unknown as RhnApi}/></MemoryRouter>)
  return medicationWorkbench
}
describe('MedicationWorkbench',()=>{
  it('disables generation when actual AI is unavailable and shows HIS terminology',async()=>{
    const api=setup(false);const user=userEvent.setup()
    await user.click(await screen.findByRole('checkbox',{name:/阿莫西林/}))
    expect(screen.getByRole('button',{name:'AI 生成候选规则'})).toBeDisabled()
    await user.click(screen.getByText('阿莫西林',{selector:'summary'}))
    expect(screen.getByText(/标准药品目录 AMOX/)).toBeInTheDocument()
    expect(api.generate).not.toHaveBeenCalled()
  })
  it('sends exact HIS IDs and displays clarification without manufacturing a candidate',async()=>{
    const api=setup(true);const user=userEvent.setup()
    await user.click(await screen.findByRole('checkbox',{name:/阿莫西林/}))
    await user.click(screen.getByRole('button',{name:'AI 生成候选规则'}))
    await screen.findByText('请说明重复次数')
    expect(api.generate).toHaveBeenCalledWith(expect.any(String),'',['123456789012345678'],null)
    expect(screen.queryByRole('button',{name:'一键运行标准案例'})).not.toBeInTheDocument()
  })
  it('executes persisted candidate cases and displays missing-input outcomes explicitly',async()=>{
    const api=setup(true,[candidate]);const user=userEvent.setup()
    await user.click(await screen.findByRole('button',{name:/重复核对 v1/}))
    await user.click(screen.getByRole('button',{name:'一键运行标准案例'}))
    await waitFor(()=>expect(api.suite).toHaveBeenCalledWith('900001'))
    expect(await screen.findByText('缺少通用药 ID')).toBeInTheDocument()
    expect(screen.getByText('数据不足 / 无法评价')).toBeInTheDocument()
  })
})
