import { useEffect, useState } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { PilotAnalysisSaved } from '../../shared/api/analyticsApi'
import { Alert, Button, Icon, LoadingState } from '../../shared/ui'
import { PilotWorkspace, type AnalysisDefinition } from './PilotWorkspace'
import { dateRange, type PilotQuery } from './pilotModel'
import './analysis-library.css'

export function analysisTemplates(): AnalysisDefinition[] {
  return [
    {id:'preset-trend',title:'近30天门诊挂号趋势',query:{metric:'REGISTERED',dimension:'DAY',scope:'CURRENT',...dateRange('30')},chart:'LINE'},
    {id:'preset-departments',title:'本月各科室诊毕对比',query:{metric:'COMPLETED',dimension:'DEPARTMENT',scope:'AUTHORIZED',...dateRange('本月')},chart:'BAR'},
    {id:'preset-list',title:'本月科室运营统计表',query:{metric:'REGISTERED',dimension:'DEPARTMENT',scope:'AUTHORIZED',...dateRange('本月')},chart:'TABLE'},
    {id:'preset-cancellations',title:'近30天退号率趋势',query:{metric:'CANCELLATION_RATE',dimension:'DAY',scope:'CURRENT',...dateRange('30')},chart:'LINE'},
  ]
}
function definitionOf(item: PilotAnalysisSaved): AnalysisDefinition {
  return {id:String(item.id),title:item.title??'统计分析',query:item.query as PilotQuery,chart:item.chart??'BAR'}
}
export function AnalysisLibrary({api}: {api:RhnApi}) {
  const [saved,setSaved]=useState<PilotAnalysisSaved[]>([])
  const [active,setActive]=useState<AnalysisDefinition>(()=>analysisTemplates()[0])
  const [creating,setCreating]=useState(false)
  const [revision,setRevision]=useState(0)
  const [filter,setFilter]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{let alive=true;setLoading(true);setSaved([])
    api.analytics.saved().then(items=>{if(alive)setSaved(items)}).catch(e=>{if(alive)setError(errorMessage(e))}).finally(()=>{if(alive)setLoading(false)})
    return ()=>{alive=false}
  },[api])
  function open(item:AnalysisDefinition){setActive(item);setCreating(false);setRevision(r=>r+1)}
  function create(){setCreating(true);setRevision(r=>r+1)}
  function onSaved(item:PilotAnalysisSaved){setSaved(items=>[item,...items].slice(0,50));open(definitionOf(item))}
  function node(item:AnalysisDefinition){return <button type="button" key={item.id} className={`al-node ${!creating&&active.id===item.id?'is-active':''}`}
    aria-current={!creating&&active.id===item.id?'page':undefined} onClick={()=>open(item)}>
    <Icon name={item.chart==='TABLE'?'tasks':'roadmap'}/><span><strong>{item.title}</strong><small>{item.chart==='TABLE'?'数据列表':item.chart==='LINE'?'趋势图':'对比图'}</small></span>
  </button>}
  const matches=(item:AnalysisDefinition)=>item.title.includes(filter.trim())
  return <section className="al-library" aria-label="统计分析功能库">
    <header className="al-header"><div><h1>智能统计分析</h1><p>选择已有功能直接使用，或用 AI 创建新的统计分析。</p></div><Button onClick={create}><Icon name="add"/>新建统计分析</Button></header>
    <div className="al-layout">
      <aside className="al-catalog">
        <h2>统计分析功能</h2><input aria-label="查找统计功能" type="search" placeholder="查找统计功能" value={filter} onChange={e=>setFilter(e.target.value)}/>
        <nav aria-label="统计分析功能列表">
          <h3>我的固化功能 <small>{saved.length}</small></h3>
          {loading&&<LoadingState label="正在加载功能库"/>}
          {error&&<Alert>{error}</Alert>}
          {!loading&&!saved.length&&<p className="ap-muted">新建并确认后，功能会保存在这里。</p>}
          {saved.map(definitionOf).filter(matches).map(node)}
          <h3>常用预制功能</h3>{analysisTemplates().filter(matches).map(node)}
          {filter&&!saved.map(definitionOf).some(matches)&&!analysisTemplates().some(matches)&&<p className="ap-muted">没有匹配的统计功能</p>}
        </nav>
        <p className="al-note">预制功能读取真实业务数据。我的功能保存于当前账号；每次打开重新查询。</p>
      </aside>
      <div className="al-content">
        {creating&&<Button variant="text" onClick={()=>open(active)}>返回已固化功能</Button>}
        <PilotWorkspace key={`${revision}:${creating?'new':active.id}`} api={api} creating={creating} definition={creating?undefined:active} onSaved={onSaved}/>
      </div>
    </div>
  </section>
}
