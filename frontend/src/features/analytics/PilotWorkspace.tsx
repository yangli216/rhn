import { useEffect, useRef, useState } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { PilotAnalysisResult, PilotAnalysisSaved } from '../../shared/api/analyticsApi'
import { Alert, Button, LoadingState } from '../../shared/ui'
import { initialQuery, dateRange, metricNames, dimensionNames, scopeNames, type PilotQuery, type Chart } from './pilotModel'
import './pilot-workspace.css'

type Snapshot = { query: PilotQuery; chart: Chart; title: string }
const format = (n: number | undefined, rate=false) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: rate ? 2 : 0 }).format(n ?? 0)

export type AnalysisDefinition = { id: string; title: string; query: PilotQuery; chart: Chart }
export function PilotWorkspace({ api, definition, creating = true, onSaved }: { api: RhnApi; definition?: AnalysisDefinition; creating?: boolean; onSaved?: (item: PilotAnalysisSaved) => void }) {
  const [query, setQuery] = useState<PilotQuery>(() => definition?.query ?? initialQuery())
  const [chart, setChart] = useState<Chart>(definition?.chart ?? 'BAR')
  const [title, setTitle] = useState(definition?.title ?? '未命名统计分析')
  const [text, setText] = useState('')
  const [result, setResult] = useState<PilotAnalysisResult | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [view, setView] = useState<'chart'|'table'>(definition?.chart === 'TABLE' ? 'table' : 'chart')
  const [selected, setSelected] = useState<number | null>(null)
  const [interpreting, setInterpreting] = useState(false)
  const [aiStatus, setAiStatus] = useState<{available: boolean; model: string | null; message: string} | null>(null)
  const [aiReply, setAiReply] = useState('')
  const inputs = useRef('')
  inputs.current = JSON.stringify({query, chart, text})
  const requestId = useRef(0)
  const epoch = useRef(0)
  useEffect(() => {
    const current = ++epoch.current
    setAiStatus(null); setAiReply(''); setInterpreting(false)
    api.analytics.aiStatus().then(status => { if(current === epoch.current) setAiStatus(status) })
      .catch(() => { if(current === epoch.current) setAiStatus({available:false,model:null,message:'无法确认 AI 服务状态，可手动配置条件，稍后重新进入重试。'}) })
    setResult(null); setError(''); setBusy(false); setSaving(false)
    if(definition) {
      setBusy(true)
      const id=++requestId.current
      api.analytics.query(definition.query).then(value => {if(current===epoch.current && id===requestId.current) setResult(value)})
        .catch(e=>{if(current===epoch.current) setError(errorMessage(e))})
        .finally(()=>{if(current===epoch.current && id===requestId.current) setBusy(false)})
    }
    return () => { epoch.current++ }
  }, [api])
  useEffect(() => { if(!notice) return; const timer=window.setTimeout(()=>setNotice(''),6000); return ()=>window.clearTimeout(timer) },[notice])
  function remember() { setHistory(h => [...h.slice(-19), { query, chart, title }]) }
  function change(patch: Partial<PilotQuery>) { remember(); setQuery(q => ({...q, ...patch})); setNotice('') }
  async function interpret(value = text) {
    if(!value.trim() || interpreting) return
    const current=epoch.current, snapshot=inputs.current
    setInterpreting(true); setError(''); setNotice(''); setAiReply('AI 正在理解你的需求…')
    try {
      const next=await api.analytics.interpret(value,query,chart)
      if(current!==epoch.current) return
      if(snapshot!==inputs.current) {setAiReply('你已修改输入或条件，本次 AI 建议未应用，请重新解析。');return}
      setAiReply(next.message)
      if(next.status==='READY' && next.query && next.chart) {
        remember();setQuery(next.query as PilotQuery);setChart(next.chart);setView(next.chart==='TABLE'?'table':'chart');setText(value)
        setTitle(value.slice(0,80))
        setBusy(true)
        const preview = await api.analytics.query(next.query)
        if(current===epoch.current) {setResult(preview);setSelected(null);setNotice('预览已生成。请检查结果，满意后点击“确认并固化”。')}
      }
    } catch(e) {if(current===epoch.current) setAiReply(`预览生成未完成：${errorMessage(e)}。请检查条件后重试，尚未保存任何功能。`)}
    finally {if(current===epoch.current) {setInterpreting(false);setBusy(false)}}
  }
  async function run() {
    setBusy(true);setError('');setNotice('');const current=epoch.current, id=++requestId.current
    try { const response=await api.analytics.query(query);if(current===epoch.current && id===requestId.current){setResult(response);setSelected(null)} }
    catch(e) { if(current===epoch.current) setError(errorMessage(e)) }
    finally { if(current===epoch.current && id===requestId.current) setBusy(false) }
  }
  async function save() {
    if(!title.trim()){setError('请填写分析名称');return}
    if(!result || stale || busy || interpreting) {setError('请先生成当前条件的预览，再确认固化。');return}
    setSaving(true);setError('');const current=epoch.current
    try { const item=await api.analytics.save({title:title.trim(),query,chart});if(current===epoch.current){onSaved?.(item);setNotice('已固化到统计分析功能库。')} }
    catch(e) { if(current===epoch.current) setError(errorMessage(e)) }
    finally { if(current===epoch.current) setSaving(false) }
  }
  const stale = result && JSON.stringify(result.query)!==JSON.stringify(query)
  const message = `${metricNames[query.metric]} · ${dimensionNames[query.dimension]} · ${scopeNames[query.scope]}。${result && !stale ? '已按这些条件生成结果。' : '请确认右侧条件后查询。'}`
  const rows = result?.rows ?? []
  const rate = result?.query?.metric==='CANCELLATION_RATE'
  const currentRow = selected === null ? null : rows[selected]
  const peak = rows.reduce<(typeof rows)[number] | undefined>((best,row)=>!best || (row.value??0)>(best.value??0)?row:best, undefined)
  const total = format(result?.total,rate)
  return <section className={`analytics-pilot al-workspace ${creating?'is-creating':'is-running'}`} aria-label="智能统计分析工作台">
    <header className="ap-header">
      <div><h2>{creating?'新建统计分析功能':title}</h2><p className="ap-muted">{creating?'描述需求 → AI 生成预览 → 确认并固化':'调整日期与统计范围后查询，使用当前业务数据。'}</p></div>
      {creating && <div className="ap-header-actions"><Button variant="secondary" disabled={!history.length || interpreting} onClick={()=>{const last=history[history.length-1];setQuery(last.query);setChart(last.chart);setView(last.chart==='TABLE'?'table':'chart');setTitle(last.title);setHistory(h=>h.slice(0,-1))}}>撤销</Button><Button onClick={save} busy={saving} disabled={!result || Boolean(stale) || busy || interpreting}>确认并固化</Button></div>}
    </header>
    {error && <Alert onDismiss={()=>setError('')} duration={null}>{error}</Alert>}
    {notice && <div className="ap-notice" role="status">{notice}</div>}
    <div className="ap-layout">
      {creating && <aside className="ap-left">
        <section className="ap-panel ap-assistant"><div className="ap-section-label">01 / 描述需求</div><h2>从一个问题开始</h2><p className="ap-muted">{aiStatus?.available ? `AI 需求解析 · ${aiStatus.model}` : 'AI 需求解析'}</p>
          <label className="ap-sr" htmlFor="ap-prompt">分析需求</label><textarea id="ap-prompt" value={text} onChange={e=>setText(e.target.value)} placeholder="例如：本月各科室挂号人次，按柱状图展示" maxLength={2000}/>
          <p className="ap-muted">{aiStatus?.message ?? '正在检查 AI 配置…'}</p>
          <Button onClick={()=>void interpret()} busy={interpreting} disabled={!text.trim() || !aiStatus?.available}>生成分析预览</Button>
          <div className="ap-understanding" role="status"><span>AI 生成说明</span><p>{aiReply || '描述要统计的指标、日期和展示形式，AI 会生成可操作的预览。'}</p></div>
          <div className="ap-understanding"><span>当前分析条件</span><p>{message}</p></div>
        </section>
      </aside>}
      <main className="ap-center">
        <div className="ap-title-line"><input readOnly={!creating} aria-label="分析名称" value={title} maxLength={80} onChange={e=>setTitle(e.target.value)}/><span className="ap-muted">{stale?'条件已修改 · 下方仍为上次结果':result?'本次查询结果':'待生成'}</span></div>
        <div className="ap-kpis">{(['REGISTERED','CANCELLED','COMPLETED','CANCELLATION_RATE'] as const).map((m,i)=>{
          const values=[result?.registered,result?.cancelled,result?.completed,result?.registered?((result.cancelled??0)/result.registered*100):0]
          return <Button key={m} variant="text" className={`ap-kpi ${query.metric===m?'is-selected':''}`} disabled={!creating || interpreting} onClick={()=>change({metric:m})}><span>{metricNames[m]}</span><strong>{result?format(values[i],i===3):'—'}<small>{i===3?'%':'人次'}</small></strong></Button>
        })}</div>
        <section className="ap-panel ap-result">
          <div className="ap-result-head"><div><h2>{result?.metricName??metricNames[query.metric]}</h2><p className="ap-muted">{result?`${result.query?.startDate} — ${result.query?.endDate} · ${result.scopeName}`:'配置就绪后，生成你的第一份分析'}</p></div><div className="ap-switch"><Button variant={view==='chart'?'secondary':'text'} onClick={()=>{setView('chart');if(chart==='TABLE')setChart('BAR')}}>图表</Button><Button variant={view==='table'?'secondary':'text'} onClick={()=>{setView('table');setChart('TABLE')}}>数据表</Button></div></div>
          {busy ? <div className="ap-empty"><LoadingState label="正在读取本地门诊数据…"/></div> : !result ? <div className="ap-empty"><div className="ap-placeholder-bars"><i/><i/><i/><i/><i/><i/></div><h3>让业务数据变成清晰的答案</h3><p>描述需求生成预览，或调整右侧条件后更新预览。</p><Button onClick={run}>生成首份分析</Button></div> : <>
            <div className="ap-result-summary"><strong>{total}<small>{result.unit}</small></strong><span>{result.changePercent==null?'比较期基数为零，不计算增幅':`较比较期 ${result.changePercent>=0?'+':''}${format(result.changePercent,true)}%`}</span><span className="ap-muted">比较期 {result.comparisonStart} — {result.comparisonEnd}</span></div>
            {view==='chart' ? <div className="ap-chart-wrap"><div className="ap-chart-actions"><span className="ap-muted">{dimensionNames[result.query?.dimension??'DAY']} · 点击数据点查看</span><div className="ap-switch"><Button variant={chart==='BAR'?'secondary':'text'} onClick={()=>{remember();setChart('BAR')}}>柱状图</Button><Button variant={chart==='LINE'?'secondary':'text'} onClick={()=>{remember();setChart('LINE')}}>折线图</Button></div></div><Plot rows={rows} chart={chart} selected={selected} select={setSelected} unit={result.unit??''}/></div> : <div className="ap-table-scroll"><table><thead><tr><th>分组</th><th>挂号</th><th>退号</th><th>诊毕</th><th>{result.metricName}</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.label}</td><td>{format(r.registered)}</td><td>{format(r.cancelled)}</td><td>{format(r.completed)}</td><td>{format(r.value,rate)} {result.unit}</td></tr>)}</tbody></table></div>}
            <div className="ap-insight"><span>数据观察</span><p>{result.registered===0 && result.completed===0?'这个范围内暂无挂号或诊毕记录。可扩大时间，或切换到可访问科室；系统不会补入演示数据。':`${result.metricName}${rate?'总体':'合计'} ${total}${result.unit}。${peak && (peak.value??0)>0?`${peak.label} 最高，为 ${format(peak.value,rate)}${result.unit}。`:''}这里只描述实际数据，不推断变化原因。`}</p></div>
            <footer className="ap-result-footer">取数时间 {result.fetchedAt?new Date(result.fetchedAt).toLocaleString('zh-CN'):''} · {result.timezone} · 本地门诊业务库</footer>
          </>}
        </section>
      </main>
      <aside className="ap-panel ap-config"><div className="ap-section-label">{creating?'02 / 确认与调整':'运行统计功能'}</div><h2>{creating?'分析配置':'查询条件'}</h2>
        <label className="ap-field">核心指标<select disabled={!creating || interpreting} value={query.metric} onChange={e=>change({metric:e.target.value as PilotQuery['metric']})}>{Object.entries(metricNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="ap-field">分组方式<select disabled={!creating || interpreting} value={query.dimension} onChange={e=>change({dimension:e.target.value as PilotQuery['dimension']})}>{Object.entries(dimensionNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="ap-field">统计范围<select value={query.scope} onChange={e=>change({scope:e.target.value as PilotQuery['scope']})}>{Object.entries(scopeNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <div className="ap-date-presets">{['7','30','90','本月','上个月','今年'].map(p=><Button variant="text" key={p} onClick={()=>change(dateRange(p))}>{/\d/.test(p)?`近${p}天`:p}</Button>)}</div>
        <label className="ap-field">开始日期<input type="date" value={query.startDate} onChange={e=>change({startDate:e.target.value})}/></label>
        <label className="ap-field">结束日期（含当天）<input type="date" value={query.endDate} onChange={e=>change({endDate:e.target.value})}/></label>
        <Button className="ap-run" onClick={run} busy={busy} disabled={interpreting}>{creating?'更新预览':'查询'}</Button>
        <div className="ap-definition"><h3>{stale?'上次结果口径':'统计口径'}</h3><p>{result?.definition??'挂号包含转科新建记录；诊毕按实际完成日期。退号属于挂号队列口径，不是当天退号事件量。'}</p><p className="ap-muted">现有工作科室权限 · 最长 366 天 · 固化定义保留所选日期，可在运行时调整</p></div>
        {currentRow && <div className="ap-selection"><h3>{currentRow.label}</h3><p>{result?.metricName} <strong>{format(currentRow.value,rate)} {result?.unit}</strong></p><p className="ap-muted">挂号 {format(currentRow.registered)} / 退号 {format(currentRow.cancelled)} / 诊毕 {format(currentRow.completed)}</p></div>}
      </aside>
    </div>
  </section>
}

function Plot({rows,chart,selected,select,unit}: {rows: NonNullable<PilotAnalysisResult['rows']>;chart:Chart;selected:number|null;select:(n:number)=>void;unit:string}) {
  const width=760, height=280, left=48, right=16, top=18, bottom=42
  const peak=Math.max(0,...rows.map(r=>r.value??0))
  const max=unit==='%'?Math.max(.04,Math.ceil(peak*1.1*25)/25):Math.max(4,Math.ceil(peak*1.1/4)*4)
  const space=(width-left-right)/Math.max(rows.length,1)
  const x=(i:number)=>left+space*(i+.5)
  const y=(v:number)=>height-bottom-v/max*(height-bottom-top)
  const step=Math.max(1,Math.ceil(rows.length/7))
  return <svg className="ap-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${chart==='BAR'?'柱状图':'折线图'}，${rows.length}个数据点`}>
    {[0,1,2,3,4].map(i=>{const val=max*i/4;return <g key={i}><line className="ap-gridline" x1={left} x2={width-right} y1={y(val)} y2={y(val)}/><text className="ap-axis" x={left-8} y={y(val)+4} textAnchor="end">{format(val,unit==='%')}</text></g>})}
    {chart==='LINE' && <polyline className="ap-line" points={rows.map((r,i)=>`${x(i)},${y(r.value??0)}`).join(' ')}/>}
    {rows.map((r,i)=><g key={i} role="button" tabIndex={0} aria-label={`${r.label}：${format(r.value,unit==='%')}${unit}`} onClick={()=>select(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(i)}}} className={`ap-point ${selected===i?'is-active':''}`}><title>{r.label}：{format(r.value,unit==='%')}{unit}</title>{chart==='BAR'?<rect x={x(i)-Math.min(44,space*.64)/2} y={y(r.value??0)} width={Math.min(44,space*.64)} height={Math.max(0,height-bottom-y(r.value??0))} rx={3}/>:<circle cx={x(i)} cy={y(r.value??0)} r={selected===i?6:4}/>}<rect className="ap-hit" x={x(i)-space/2} y={top} width={space} height={height-top-bottom}/>{(i%step===0||i===rows.length-1)&&<text className="ap-axis" x={x(i)} y={height-18} textAnchor="middle">{(r.label??'').replace(/^\d{4}-/,'')}</text>}</g>)}
  </svg>
}
