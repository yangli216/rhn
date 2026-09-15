import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { AnalysisLibrary } from './AnalysisLibrary'
import { PilotWorkspace } from './PilotWorkspace'

const query={metric:'COMPLETED',dimension:'DEPARTMENT',scope:'AUTHORIZED',startDate:'2026-09-01',endDate:'2026-09-14'}
function setup(saved:unknown[]=[]){
  const execute=vi.fn().mockImplementation(async q=>({query:q,metricName:'诊毕人次',unit:'人次',scopeName:'全科门诊',rows:[{label:'全科门诊',registered:2,cancelled:0,completed:1,value:1}],registered:2,cancelled:0,completed:1,total:1}))
  const save=vi.fn().mockImplementation(async value=>({id:'new-id',...value}))
  const interpret=vi.fn().mockResolvedValue({status:'READY',message:'本月科室运营列表',query,chart:'TABLE'})
  const api={analytics:{saved:vi.fn().mockResolvedValue(saved),aiStatus:vi.fn().mockResolvedValue({available:true,model:'test-model',message:'AI已配置'}),query:execute,save,interpret}} as unknown as RhnApi
  return {api,execute,save,interpret}
}
it('opens saved and preset nodes directly and restores persisted list presentation',async()=>{
  const user=userEvent.setup();const {api,execute}=setup([{id:'saved',title:'固化列表',query,chart:'TABLE'}])
  render(<AnalysisLibrary api={api}/> )
  await user.click(await screen.findByRole('button',{name:/固化列表/}))
  await screen.findByRole('table')
  expect(execute).toHaveBeenLastCalledWith(query)
  expect(screen.queryByLabelText('分析需求')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:/本月各科室诊毕对比/}))
  await screen.findByRole('group',{name:/柱状图/})
  expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({metric:'COMPLETED',dimension:'DEPARTMENT'}))
})
it('generates AI preview, requires confirmation, persists list and opens saved function',async()=>{
  const user=userEvent.setup();const {api,save,interpret}=setup()
  render(<AnalysisLibrary api={api}/> )
  await user.click(screen.getByRole('button',{name:'新建统计分析'}))
  expect(screen.getByRole('button',{name:'确认并固化'})).toBeDisabled()
  await user.type(screen.getByLabelText('分析需求'),'本月各科室诊毕人次列表')
  await user.click(screen.getByRole('button',{name:'生成分析预览'}))
  await screen.findByRole('table')
  expect(interpret).toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  await user.clear(screen.getByLabelText('分析名称'))
  await user.type(screen.getByLabelText('分析名称'),'新功能列表')
  await user.click(screen.getByRole('button',{name:'确认并固化'}))
  await screen.findByRole('button',{name:/新功能列表/})
  expect(save).toHaveBeenCalledWith({title:'新功能列表',query,chart:'TABLE'})
  expect(screen.queryByLabelText('分析需求')).not.toBeInTheDocument()
})
it('unsupported AI output never queries or enables confirmation',async()=>{
  const user=userEvent.setup();const {api,interpret,execute}=setup()
  interpret.mockResolvedValue({status:'UNSUPPORTED',message:'诊断排行未支持',query:null,chart:null})
  render(<PilotWorkspace api={api}/>)
  await user.type(screen.getByLabelText('分析需求'),'诊断排行')
  await user.click(screen.getByRole('button',{name:'生成分析预览'}))
  await screen.findByText('诊断排行未支持')
  expect(execute).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'确认并固化'})).toBeDisabled()
})
it('changing query conditions after preview requires a new preview before confirmation',async()=>{
  const user=userEvent.setup();const {api}=setup()
  render(<PilotWorkspace api={api}/>)
  await user.type(screen.getByLabelText('分析需求'),'本月各科室诊毕列表')
  await user.click(screen.getByRole('button',{name:'生成分析预览'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'确认并固化'})).toBeEnabled())
  await user.selectOptions(screen.getByLabelText('核心指标'),'REGISTERED')
  expect(screen.getByRole('button',{name:'确认并固化'})).toBeDisabled()
})
