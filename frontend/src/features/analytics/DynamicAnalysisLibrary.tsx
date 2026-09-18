import { useEffect, useRef, useState } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { PageMetric, PageResult, PageSeries, PageSpec, PageTemplate, SavedPage, SourceCatalog, AnalysisTurn } from '../../shared/api/analysisPagesApi'
import { Alert, Button, Dialog, Icon, LoadingState } from '../../shared/ui'
import { AnalysisPlanEditor, PlanChanges, dimensionNames, periodNames } from './AnalysisPlanEditor'
import { SemanticWorkbench } from './SemanticWorkbench'
import './dynamic-analysis.css'

export const pageTemplates: {code:PageTemplate;name:string;description:string;icon:'tasks'|'roadmap'}[] = [
  {code:'AUTO',name:'AI 自动识别',description:'根据需求选择形式 · 自由组合展示',icon:'roadmap'},
  {code:'LIST',name:'统计列表',description:'查询条件 · 多指标表格 · 合计',icon:'tasks'},
  {code:'RANKING',name:'排行分析',description:'指标总量 · 降序排行 · 排名表',icon:'roadmap'},
  {code:'TREND',name:'趋势分析',description:'时间筛选 · 指标趋势 · 数据列表',icon:'roadmap'},
  {code:'COMPARISON',name:'分组对比',description:'分组筛选 · 对比图 · 明细表',icon:'roadmap'},
  {code:'DASHBOARD',name:'综合看板',description:'动态指标卡 · 多图表 · 汇总表',icon:'roadmap'},
]
const dimensions=dimensionNames
const periods=periodNames
const number=(v:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v)
const templateName=(code:PageTemplate)=>pageTemplates.find(t=>t.code===code)?.name??(code==='CUSTOM'?'AI 组合页面':code)
const queryKey=(spec:PageSpec)=>JSON.stringify({...spec,title:''})

export function DynamicAnalysisLibrary({api}:{api:RhnApi}) {
  const [viewMode, setViewMode] = useState<'library' | 'ontology'>('library')
  const [saved,setSaved]=useState<SavedPage[]>([])
  const [catalog,setCatalog]=useState<PageMetric[]>([])
  const [sources,setSources]=useState<SourceCatalog[]>([])
  const [ai,setAi]=useState<{available:boolean;model:string|null;message:string}|null>(null)
  const [loading,setLoading]=useState(true)
  const [activeId,setActiveId]=useState<string|null>(null)
  const [creating,setCreating]=useState(false)
  const [template,setTemplate]=useState<PageTemplate>('AUTO')
  const [requirement,setRequirement]=useState('')
  const [generatedRequirement,setGeneratedRequirement]=useState('')
  const [spec,setSpec]=useState<PageSpec|null>(null)
  const [result,setResult]=useState<PageResult|null>(null)
  const [reply,setReply]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState<''|'generate'|'query'|'save'>('')
  const [history,setHistory]=useState<AnalysisTurn[]>([])
  const [followup,setFollowup]=useState('')
  const [baseline,setBaseline]=useState<PageSpec|null>(null)
  const [unresolved,setUnresolved]=useState(false)
  const [copying,setCopying]=useState(false)
  const [filter,setFilter]=useState('')
  const [panel,setPanel]=useState<'preview'|'data'|'config'|'changes'>('preview')
  const [leave,setLeave]=useState(false)
  const [showSources,setShowSources]=useState(false)
  const [showAssistant,setShowAssistant]=useState(true)
  const chatScroll=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(chatScroll.current)chatScroll.current.scrollTop=chatScroll.current.scrollHeight},[history,reply,showAssistant])
  const epoch=useRef(0)
  const selection=useRef(0)
  useEffect(()=>{const current=++epoch.current;setLoading(true);setSaved([]);setReply('');setActiveId(null);setCreating(true);setSpec(null);setResult(null);setAi(null);setCatalog([]);setSources([]);setError('');setBusy('');setHistory([]);setFollowup('');setBaseline(null);setUnresolved(false);setCopying(false);setRequirement('');setGeneratedRequirement('')
    const originalSelection=selection.current
    api.analytics.pageSources().then(v=>{if(current===epoch.current)setSources(v)}).catch(e=>{if(current===epoch.current)setError(errorMessage(e))})
    api.analytics.pageCatalog().then(v=>{if(current===epoch.current)setCatalog(v)}).catch(e=>{if(current===epoch.current)setError(errorMessage(e))})
    api.analytics.aiStatus().then(v=>{if(current===epoch.current)setAi(v)}).catch(()=>{if(current===epoch.current)setAi({available:false,model:null,message:'AI 状态暂时不可用，请稍后重试。'})})
    api.analytics.savedPages().then(items=>{if(current!==epoch.current)return;setSaved(items)
      if(selection.current!==originalSelection)return
      if(items.length)void open(items[0]);else setCreating(true)
    }).catch(e=>{if(current===epoch.current)setError(errorMessage(e))}).finally(()=>{if(current===epoch.current)setLoading(false)})
    return ()=>{epoch.current++;selection.current++}
  },[api])
  function resetDiscussion(){setShowAssistant(true);setPanel('preview');setHistory([]);setFollowup('');setBaseline(null);setUnresolved(false);setCopying(false)}
  function fresh(){setTemplate('AUTO');resetDiscussion();selection.current++;setCreating(true);setActiveId(null);setSpec(null);setResult(null);setRequirement('');setReply('');setError('');setBusy('')}
  async function open(item:SavedPage){resetDiscussion();const id=++selection.current,current=epoch.current;setCreating(false);setActiveId(item.id);setSpec(item.spec);setResult(null);setError('');setReply('');setBusy('query')
    try {const r=await api.analytics.queryPage(item.spec);if(current===epoch.current&&id===selection.current)setResult(r)}
    catch(e){if(current===epoch.current&&id===selection.current)setError(errorMessage(e))}
    finally{if(current===epoch.current&&id===selection.current)setBusy('')}
  }
  async function generate(following=false){
    const message=following?followup.trim():requirement.trim()
    if(!message||busy)return
    const id=++selection.current,current=epoch.current,previous=following?spec:null,previousHistory=following?history:[]
    const original=following?baseline??spec:null
    setBusy('generate');setReply('AI 正在分析数据关系、计算方式和筛选条件…');setError('');setUnresolved(true)
    if(!following){setSpec(null);setResult(null);setBaseline(null);setHistory([]);setFollowup('')}
    try{
      const proposal=following?await api.analytics.generatePage(message,template==='AUTO'?'AUTO':previous?.template??template,{currentSpec:previous,history:previousHistory}):await api.analytics.generatePage(message,template)
      if(current!==epoch.current||id!==selection.current)return
      setReply(proposal.message);setHistory([...previousHistory,{role:'USER',content:message},{role:'ASSISTANT',content:proposal.message}].slice(-20) as AnalysisTurn[])
      if(following)setFollowup('')
      if(proposal.status!=='READY'||!proposal.spec){setShowAssistant(true);return}
      setPanel('preview');setBaseline(original??proposal.spec);setSpec(proposal.spec);setGeneratedRequirement(requirement);setUnresolved(false);setResult(null)
      const preview=await api.analytics.queryPage(proposal.spec)
      if(current===epoch.current&&id===selection.current)setResult(preview)
    }catch(e){if(current===epoch.current&&id===selection.current){const message=errorMessage(e);setError(message);setReply(`未能完成页面预览：${message}`)}}
    finally{if(current===epoch.current&&id===selection.current)setBusy('')}
  }
  function adjustSaved(){if(!spec||busy)return;setShowAssistant(true);setPanel('preview');setCreating(true);setCopying(true);setTemplate(spec.template);setBaseline(spec);setSpec({...spec,title:spec.title.slice(0,74)+'（调整）'});setHistory([]);setFollowup('');setRequirement('');setGeneratedRequirement('');setUnresolved(false);setReply('可以继续描述修改要求，或直接调整下方方案，确认后另存为新功能。')}
  function restore(){if(!baseline||busy)return;selection.current++;setSpec(baseline);setResult(null);setHistory([]);setFollowup('');setUnresolved(false);setRequirement(generatedRequirement);setError('');setReply('已恢复初始方案，请更新预览后确认。')}
  async function run(){if(!spec)return;const id=++selection.current,current=epoch.current;setBusy('query');setError('')
    try{const r=await api.analytics.queryPage(spec);if(current===epoch.current&&id===selection.current){setResult(r);setPanel('preview')}}
    catch(e){if(current===epoch.current&&id===selection.current)setError(errorMessage(e))}
    finally{if(current===epoch.current&&id===selection.current)setBusy('')}
  }
  const stale=Boolean(spec&&result&&queryKey(spec)!==queryKey(result.spec))
  const requirementChanged=creating&&Boolean(spec)&&requirement!==generatedRequirement
  async function save(){if(!spec||!result||stale||requirementChanged||unresolved||followup.trim()||busy)return;const current=epoch.current;setBusy('save');setError('')
    try{const item=await api.analytics.savePage(spec);if(current!==epoch.current)return;setSaved(items=>[item,...items].slice(0,50));setActiveId(item.id);setCreating(false);setPanel('preview');setReply('');setSpec(item.spec)}
    catch(e){if(current===epoch.current)setError(errorMessage(e))}
    finally{if(current===epoch.current)setBusy('')}
  }
  function chooseTemplate(value:PageTemplate){resetDiscussion();setTemplate(value);setSpec(null);setResult(null);setReply('')}
  const saveDisabled=!result||Boolean(busy)||stale||requirementChanged||unresolved||Boolean(followup.trim())||!spec?.title.trim()
  function returnToLibrary(){setLeave(false);if(saved.length)void open(saved.find(s=>s.id===activeId)??saved[0]);else fresh()}
  const sourceHelp=<Button variant="text" size="sm" onClick={()=>setShowSources(true)}>可分析数据</Button>
  const discussion=<aside className="da-assistant" aria-label="连续修改分析方案">
    <header><h2>AI 分析助手</h2><small>{ai?.available?'已连接 AI':ai?.message??'正在连接…'}</small></header>
    <div ref={chatScroll} className="da-chat-scroll" aria-label="需求对话记录">
      {history.map((turn,i)=><article className={`da-message da-message--${turn.role.toLowerCase()}`} key={i}><strong>{turn.role==='USER'?'你':'AI'}</strong><p>{turn.content}</p></article>)}
      {reply&&history.at(-1)?.content!==reply&&<p className="da-chat-notice" role="status">{reply}</p>}
      {!history.length&&!reply&&<p>描述需要调整的业务数据，AI 会基于当前方案修改。</p>}
    </div>
    <div className="da-composer"><label htmlFor="da-followup">{unresolved?'补充说明':'继续调整'}</label><textarea id="da-followup" aria-label="补充或修改要求" value={followup} maxLength={2000} disabled={Boolean(busy)||requirementChanged} onChange={e=>setFollowup(e.target.value)} placeholder="例如：改成上个月，只看药品" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();if(ai?.available&&!requirementChanged)void generate(true)}}}/><div><small>Ctrl / ⌘ + Enter 发送</small><Button size="sm" busy={busy==='generate'} disabled={!followup.trim()||Boolean(busy)||requirementChanged||!ai?.available} onClick={()=>void generate(true)}>发送补充并更新预览</Button></div></div>
  </aside>

  if (viewMode === 'ontology') {
    return <SemanticWorkbench api={api} onBack={() => setViewMode('library')} />
  }

  return <section className={`da-root ${creating?'is-editing':''}`} aria-label="动态统计分析功能库">
    <header className="da-header"><div className="da-heading"><h1>{creating?(copying?'调整统计分析':'新建统计分析'):'智能统计分析'}</h1><span>{creating?(spec?'编辑与预览':'选择形式，描述业务需求'):'我的统计功能'}</span></div><div className="da-toolbar">
      <Button variant="secondary" size="sm" onClick={() => setViewMode('ontology')} aria-label="打开业务实体数据关系网工作台">
        <Icon name="roadmap" /> 业务实体数据关系网
      </Button>
      {creating&&<Button variant="text" size="sm" disabled={busy==='save'} onClick={()=>setLeave(true)}>{saved.length?'返回功能库':'重新开始'}</Button>}
      {!creating&&<Button size="sm" onClick={fresh}><Icon name="add"/>新建统计分析</Button>}
      {creating&&spec&&<>{sourceHelp}<Button variant="text" size="sm" aria-pressed={showAssistant} onClick={()=>setShowAssistant(v=>!v)}>{showAssistant?'收起 AI':'AI 助手'}</Button><Button variant="secondary" size="sm" disabled={Boolean(busy)||!baseline} onClick={restore}>撤销所有调整</Button><Button size="sm" onClick={()=>void save()} busy={busy==='save'} disabled={saveDisabled}>{copying?'确认并另存为新功能':'确认并固化'}</Button></>}
    </div></header>
    {error&&<Alert duration={null} onDismiss={()=>setError('')}>{error}</Alert>}
    <div className={`da-layout ${creating?(spec?(showAssistant?'da-layout--editing':'da-layout--new'):'da-layout--new'):''}`}>
      {!creating&&<>      <aside className="da-library"><h2>已固化统计功能</h2><input type="search" aria-label="查找已固化功能" placeholder="按名称查找" value={filter} onChange={e=>setFilter(e.target.value)}/>
        {loading&&<LoadingState label="正在加载功能库"/>}
        <nav aria-label="已固化统计功能列表">{saved.filter(item=>item.spec.title.includes(filter.trim())).map(item=><button type="button" key={item.id} disabled={busy==='save'} onClick={()=>void open(item)} aria-current={!creating&&activeId===item.id?'page':undefined} className={!creating&&activeId===item.id?'is-active':''}><Icon name="roadmap"/><span><strong>{item.spec.title}</strong><small>{templateName(item.spec.template)} · {item.spec.metrics.length} 个指标</small></span></button>)}</nav>
        {!loading&&!saved.length&&<p>确认生成结果后，统计功能会保存在这里。</p>}
        {filter&&!saved.some(s=>s.spec.title.includes(filter.trim()))&&<p>没有匹配的功能</p>}
        <div className="da-library-note">展示模板在新建时选择。已固化功能每次打开查询最新数据，按当前账号权限运行。</div>
      </aside>
</>}
      {creating&&spec&&showAssistant&&discussion}
      <main className="da-main">
        {creating&&!spec&&<div className="da-create-grid">
          <section className="da-template-picker"><h2>展示形式</h2><p>选择适合这次分析的页面形式</p><div className="da-templates">{pageTemplates.map(t=><button type="button" key={t.code} aria-pressed={template===t.code} disabled={Boolean(busy)} onClick={()=>chooseTemplate(t.code)} className={template===t.code?'is-selected':''}><TemplateThumbnail template={t.code}/><span><strong>{t.name}</strong><small>{t.description}</small></span></button>)}</div></section>
          <section className="da-create-request"><div className="da-request-heading"><h2>业务需求</h2>{sourceHelp}</div><p>告诉 AI 想看什么数据，无需描述页面排版。</p>
            {!history.length?<><textarea autoFocus aria-label="业务分析需求" placeholder="例如：统计本月各科室有效药品医嘱条数、患者去重人数和对应费用" value={requirement} disabled={Boolean(busy)} maxLength={2000} onChange={e=>setRequirement(e.target.value)}/><div className="da-prompt-actions"><small>{ai?.available?'AI 已连接':ai?.message??'正在检查 AI 服务…'}</small><Button busy={busy==='generate'} disabled={!ai?.available||!requirement.trim()||Boolean(busy)} onClick={()=>void generate()}>生成页面预览</Button></div>{reply&&<p className="da-chat-notice" role="status">{reply}</p>}</>:discussion}
          </section>
        </div>}
        {spec&&<section className="da-generated" aria-label="生成的业务分析页面"><header className="da-page-title"><div>{creating?<input aria-label="功能名称" value={spec.title} disabled={Boolean(busy)} maxLength={80} onChange={e=>setSpec({...spec,title:e.target.value})}/>:<h2>{spec.title}</h2>}<small>{templateName(spec.template)} · {dimensions[spec.dimension]} · {spec.metrics.length} 个指标{creating?' · 未保存':''}</small></div>{!creating&&<Button size="sm" variant="secondary" disabled={Boolean(busy)||!result} onClick={adjustSaved}>基于此功能调整</Button>}</header>
          <div className="da-workspace-tabs" role="tablist" aria-label="分析工作区">{([['preview','结果预览'],...(spec.template!=='LIST'?[['data','数据明细']]:[]),...(creating?[['config','计算配置'],['changes','变更对照']]:[])] as const).map(([key,label])=><button type="button" role="tab" id={`da-tab-${key}`} aria-selected={panel===key} aria-controls={`da-panel-${key}`} tabIndex={panel===key?0:-1} key={key} onClick={()=>setPanel(key as typeof panel)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const tabs=[...e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];const index=tabs.indexOf(e.currentTarget);const next=tabs[(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];next.focus();next.click()}}}>{label}</button>)}</div>
                    <div className="da-filters"><label>统计日期<select aria-label="统计日期" disabled={Boolean(busy)} value={spec.period.kind} onChange={e=>setSpec({...spec,period:{kind:e.target.value as PageSpec['period']['kind'],startDate:result?.startDate,endDate:result?.endDate}})}>{Object.entries(periods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
            {spec.period.kind==='FIXED'&&<><label>开始日期<input aria-label="开始日期" type="date" disabled={Boolean(busy)} value={spec.period.startDate??''} onChange={e=>setSpec({...spec,period:{...spec.period,startDate:e.target.value}})}/></label><label>结束日期<input aria-label="结束日期" type="date" disabled={Boolean(busy)} value={spec.period.endDate??''} onChange={e=>setSpec({...spec,period:{...spec.period,endDate:e.target.value}})}/></label></>}
            <label>统计范围<select aria-label="统计范围" disabled={Boolean(busy)} value={spec.scope} onChange={e=>setSpec({...spec,scope:e.target.value as PageSpec['scope']})}><option value="CURRENT">当前科室</option><option value="AUTHORIZED">当前机构可访问科室</option></select></label>
            {spec.template==='RANKING'&&<label>显示前几项<input aria-label="排行项数" type="number" min={1} max={100} disabled={Boolean(busy)} value={spec.limit} onChange={e=>setSpec({...spec,limit:Number(e.target.value)})}/></label>}
            <Button onClick={()=>void run()} busy={busy==='query'} disabled={Boolean(busy)||requirementChanged||unresolved}>{creating?'更新预览':'查询'}</Button>
          </div>
          {(stale||requirementChanged)&&<p role="status" className="da-stale">{requirementChanged?'需求已修改，请重新生成页面预览。':'查询条件已修改，下方仍为上次结果，请更新预览后确认。'}</p>}

          {unresolved&&<p role="status" className="da-stale">{busy==='generate'?'AI 正在更新方案，下方保留上次结果。':'本轮要求尚未解决，请先补充说明或撤销调整。'}</p>}
          {followup.trim()&&!unresolved&&<p className="da-stale">补充要求尚未发送，发送或清空后可保存。</p>}
          <div className="da-workspace-body" role="tabpanel" id={`da-panel-${panel}`} aria-labelledby={`da-tab-${panel}`} tabIndex={0}>
            {(panel==='preview'||panel==='data')&&(busy==='query'?<LoadingState label="正在读取业务数据…"/>:result?<DynamicResult result={result} view={panel==='data'?'data':'preview'}/>:<div className="da-empty">{busy==='generate'?'正在生成页面并查询业务数据…':'尚无查询结果，请更新预览。'}</div>)}
            {panel==='config'&&creating&&<AnalysisPlanEditor spec={spec} sources={sources} catalog={catalog} disabled={Boolean(busy)||unresolved||requirementChanged} onChange={setSpec} expanded/>}
            {panel==='changes'&&creating&&baseline&&<PlanChanges before={baseline} after={spec} sources={sources} catalog={catalog}/>}
          </div>
        </section>}
      </main>
    </div>
    {showSources&&<Dialog title="可分析数据" description="AI 可使用以下业务数据与统计口径；自动识别展示形式不会增加数据来源。" onClose={()=>setShowSources(false)} size="wide" footer={<Button variant="secondary" onClick={()=>setShowSources(false)}>关闭</Button>}><div className="da-source-catalog">{sources.map(source=><section key={source.code}><h3>{source.name}</h3><p>{source.definition}</p><dl><dt>可用数据</dt><dd>{source.fields.map(f=>f.name).join('、')}</dd><dt>可用分组</dt><dd>{source.dimensions.map(d=>dimensions[d]).join('、')}</dd></dl></section>)}{!sources.length&&<p>数据目录暂不可用，请关闭后重试或刷新页面。</p>}</div>{catalog.length>0&&<details className="da-source-help"><summary>基础统计口径</summary>{catalog.map(m=><p key={m.code}><strong>{m.name}</strong>：{m.definition}</p>)}</details>}</Dialog>}
    {leave&&<Dialog title="返回功能库？" description="当前未保存的调整将被丢弃。" onClose={()=>setLeave(false)} footer={<><Button variant="secondary" onClick={()=>setLeave(false)}>继续编辑</Button><Button onClick={returnToLibrary}>放弃调整并返回</Button></>}/>}
  </section>
}

function TemplateThumbnail({template}:{template:PageTemplate}){if(template==='AUTO')return <div aria-hidden="true" className="da-thumbnail da-thumbnail--auto">✧ AI</div>;return <div aria-hidden="true" className={`da-thumbnail da-thumbnail--${template.toLowerCase()}`}><i/><i/><i/><i/><i/></div>}

export function DynamicResult({result,view='all'}:{result:PageResult;view?:'all'|'preview'|'data'|'widget'}) {
  const template=result.spec.template
  if(template==='CUSTOM'&&view!=='data')return <CustomDisplay result={result}/>
  const rows=new Map<string,{label:string;values:Map<string,number>}>()
  result.series.forEach(series=>series.points.forEach(point=>{if(!rows.has(point.key))rows.set(point.key,{label:point.label,values:new Map()});rows.get(point.key)!.values.set(series.code,point.value)}))
  return <div className="da-result">{view!=='widget'&&<p className="da-result-meta">{result.startDate} — {result.endDate} · {result.scopeName}</p>}
    {view!=='widget'&&<div className="da-metrics">{result.series.map(s=><article key={s.code}><span>{s.name}</span><strong>{number(s.total)} <small>{s.unit}</small></strong></article>)}</div>}
    {view!=='data'&&template!=='LIST'&&<div className={`da-charts ${result.series.length>1?'has-many':''}`}>{result.series.map(s=><section key={s.code}><h3>{s.name}</h3>{template==='RANKING'?<Ranking series={s}/>:<SeriesChart series={s} line={template==='TREND'}/>}</section>)}</div>}
    {template==='RANKING'&&<p>按{result.series[0]?.name}降序显示前 {result.spec.limit} 项；共 {result.series[0]?.groupCount} 个分组，总量包含全部分组。</p>}
    {(view!=='preview'||template==='LIST')&&<div className="da-table-wrap"><table><caption>{template==='RANKING'?'排名明细':'统计数据'}</caption><thead><tr>{template==='RANKING'&&<th>排名</th>}<th>{dimensions[result.spec.dimension]}</th>{result.series.map(s=><th key={s.code}>{s.name}（{s.unit}）</th>)}</tr></thead>
      <tbody>{[...rows].map(([key,row],index)=><tr key={key}>{template==='RANKING'&&<td>{index+1}</td>}<td>{row.label}</td>{result.series.map(s=><td key={s.code}>{number(row.values.get(s.code)??0)}</td>)}</tr>)}{!rows.size&&<tr><td colSpan={result.series.length+(template==='RANKING'?2:1)}>当前范围暂无符合统计口径的数据，可调整日期或统计范围。</td></tr>}</tbody>
      <tfoot><tr>{template==='RANKING'&&<td/>}<th>整体统计</th>{result.series.map(s=><td key={s.code}>{number(s.total)}</td>)}</tr></tfoot></table></div>}
    {view!=='widget'&&<><details className="da-definitions"><summary>本页统计口径</summary>{result.series.map(s=><p key={s.code}><strong>{s.name}：</strong>{s.definition}</p>)}</details>
    <footer>取数时间 {new Date(result.fetchedAt).toLocaleString('zh-CN')} · {result.timezone} · 实际业务数据</footer></>}
  </div>
}
function CustomDisplay({result}:{result:PageResult}) {
  return <div className="da-result"><p className="da-result-meta">{result.startDate} — {result.endDate} · {result.scopeName}</p><div className="da-custom-grid">{result.spec.widgets?.map((widget,i)=>{const series=widget.metrics.map(code=>result.series.find(s=>s.code===code)).filter((s):s is PageSeries=>Boolean(s));return <section key={i} className={`da-custom-widget ${widget.type==='TABLE'?'is-wide':''}`}>{!(widget.type==='KPI'&&series.length===1&&widget.title===series[0].name)&&<h3>{widget.title}</h3>}{widget.type==='KPI'?<div className="da-metrics">{series.map(s=><article key={s.code}><span>{s.name}</span><strong>{number(s.total)} <small>{s.unit}</small></strong></article>)}</div>:widget.type==='TABLE'?<DynamicResult result={{...result,spec:{...result.spec,template:'LIST'},series}} view="widget"/>:<div className="da-custom-series">{series.map(s=><div key={s.code}>{series.length>1&&<h4>{s.name}</h4>}<SeriesChart series={s} line={widget.type==='LINE'}/></div>)}</div>}</section>})}</div><details className="da-definitions"><summary>本页统计口径</summary>{result.series.map(s=><p key={s.code}><strong>{s.name}：</strong>{s.definition}</p>)}</details><footer>取数时间 {new Date(result.fetchedAt).toLocaleString('zh-CN')} · {result.timezone} · 实际业务数据</footer></div>
}

function Ranking({series}:{series:PageSeries}){const max=Math.max(1,...series.points.map(p=>Math.abs(p.value)));return <div className="da-ranking">{series.points.map((p,i)=><div key={p.key}><span>{i+1}</span><strong title={p.label}>{p.label}</strong><div className="da-rank-track"><i className={p.value<0?'is-negative':undefined} style={{width:`${Math.abs(p.value)/max*100}%`}}/></div><span>{number(p.value)} {series.unit}</span></div>)}{!series.points.length&&<p>暂无排行数据</p>}</div>}
function SeriesChart({series,line}:{series:PageSeries;line:boolean}) {
  const chartRef=useRef<SVGSVGElement>(null)
  const [chartWidth,setChartWidth]=useState(480)
  useEffect(()=>{if(typeof ResizeObserver==='undefined'||!chartRef.current)return;const observer=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(width)setChartWidth(Math.max(260,Math.round(width)))});observer.observe(chartRef.current);return ()=>observer.disconnect()},[])
  const w=chartWidth,h=240,left=52,bottom=34,top=15
  const max=Math.max(0,...series.points.map(p=>p.value)),min=Math.min(0,...series.points.map(p=>p.value))
  const upper=max===min?4:max,range=upper-min,n=Math.max(1,series.points.length),step=(w-left-15)/n
  const x=(i:number)=>left+(i+.5)*step,y=(v:number)=>h-bottom-(v-min)/range*(h-bottom-top)
  return <svg ref={chartRef} viewBox={`0 0 ${w} ${h}`} className="da-series-chart" role="img" aria-label={`${series.name}${line?'趋势图':'对比图'}`}>
    {[0,1,2,3,4].map(i=>{const value=min+range*i/4;return <g key={i}><line x1={left} x2={w-10} y1={y(value)} y2={y(value)} className="da-grid"/><text x={left-6} y={y(value)+4} textAnchor="end">{number(value)}</text></g>})}
    <line x1={left} x2={w-10} y1={y(0)} y2={y(0)} className="da-zero"/>
    {line&&<polyline points={series.points.map((p,i)=>`${x(i)},${y(p.value)}`).join(' ')} className="da-trend"/>}
    {series.points.map((p,i)=><g key={p.key}><title>{`${p.label}：${number(p.value)} ${series.unit}`}</title>{line?<circle cx={x(i)} cy={y(p.value)} r={3}/>:<rect className={p.value<0?'is-negative':undefined} x={x(i)-Math.min(36,step*.6)/2} y={Math.min(y(p.value),y(0))} width={Math.min(36,step*.6)} height={Math.abs(y(p.value)-y(0))} rx={3}/>} {(i%Math.max(1,Math.ceil(n/4))===0)&&<text x={x(i)} y={h-12} textAnchor="middle">{p.label.length>10?p.label.slice(0,9)+'…':p.label}</text>}</g>)}
  </svg>
}
