import { useState } from 'react'
import type { PageMetric, PageSpec, PlanMeasure, SourceCatalog } from '../../shared/api/analysisPagesApi'
import { Button } from '../../shared/ui'

export const dimensionNames={DAY:'按日',MONTH:'按月',DEPARTMENT:'按科室',DIAGNOSIS:'按诊断',ITEM:'按项目',ORDER_TYPE:'按医嘱类别',STATUS:'按状态'}
export const periodNames={MONTH_TO_DATE:'本月截至今天',LAST_MONTH:'上个月',LAST_30_DAYS:'最近30天',YEAR_TO_DATE:'今年截至今天',FIXED:'指定日期'}
const aggregateNames={COUNT:'计数',COUNT_DISTINCT:'去重计数',SUM:'求和',AVG:'逐行平均'}
const operatorNames={EQ:'等于',IN:'属于',CONTAINS:'包含',GTE:'大于等于',LTE:'小于等于'}
type Props={expanded?:boolean;spec:PageSpec;sources:SourceCatalog[];catalog:PageMetric[];disabled:boolean;onChange:(spec:PageSpec)=>void}
function allowedAggregates(source:string,field:SourceCatalog['fields'][number]) {
  return field.aggregates.filter(a=>!(a==='COUNT'&&(field.code==='patientId'||field.code==='encounterId'&&source!=='ENCOUNTER'||field.code==='orderId'&&source==='CHARGE')))
}
export function AnalysisPlanEditor({spec,sources,catalog,disabled,onChange,expanded=false}:Props) {
  const [selected,setSelected]=useState(0)
  const active=Math.min(selected,(spec.measures?.length??1)-1)
  const definitions=spec.measures?.length?spec.measures.map(m=>sources.find(s=>s.code===m.source)?.dimensions??[]):spec.metrics.map(code=>catalog.find(m=>m.code===code)?.dimensions??[])
  const dimensions=Object.keys(dimensionNames).filter(d=>definitions.every(ds=>ds.includes(d as PageSpec['dimension']))).filter(d=>(spec.template!=='TREND'&&!spec.widgets?.some(w=>w.type==='LINE'))||d==='DAY'||d==='MONTH').filter(d=>d!=='STATUS'||new Set(spec.measures?.map(m=>m.source)).size<=1)
  function update(measures:PlanMeasure[]) {
    const next=measures.map((m,i)=>({...m,code:`M${i+1}`}))
    const common=Object.keys(dimensionNames).filter(d=>next.every(m=>sources.find(s=>s.code===m.source)?.dimensions.includes(d as PageSpec['dimension'])))
    const dimension=common.includes(spec.dimension)&&!(spec.dimension==='STATUS'&&new Set(next.map(m=>m.source)).size>1)?spec.dimension:'DAY'
    const renamed=new Map(measures.map((m,i)=>[m.code,next[i].code]))
    const widgets=spec.widgets?.map(w=>({...w,metrics:w.metrics.flatMap(code=>renamed.has(code)?[renamed.get(code)!]:[])})).filter(w=>w.metrics.length)
    if(spec.template==='CUSTOM'&&widgets){
      const missing=next.filter(m=>!widgets.some(w=>w.metrics.includes(m.code)))
      if(missing.length){if(widgets.length<8)widgets.push({title:'补充指标',type:'KPI',metrics:missing.map(m=>m.code)});else widgets[0]={...widgets[0],metrics:[...widgets[0].metrics,...missing.map(m=>m.code)]}}
    }
    onChange({...spec,measures:next,metrics:next.map(m=>m.code),dimension,...(widgets?{widgets}:{})})
  }
  function change(index:number,value:PlanMeasure){update(spec.measures!.map((m,i)=>i===index?value:m))}
  function newMeasure(source:SourceCatalog):PlanMeasure {const f=source.fields.find(f=>allowedAggregates(source.code,f).length)!;return {code:'NEW',name:f.name,source:source.code,sourceVersion:source.version,aggregate:allowedAggregates(source.code,f)[0] as PlanMeasure['aggregate'],field:f.code,filters:[]}}
  return <details className={`da-editor ${expanded?'is-expanded':''}`} open={expanded||undefined}><summary>直接调整方案</summary><p>修改计算对象或筛选条件后，请更新预览并核对口径。</p>
    <div className="da-editor-common"><label>分组方式<select aria-label="分组方式" value={spec.dimension} disabled={disabled} onChange={e=>onChange({...spec,dimension:e.target.value as PageSpec['dimension']})}>{dimensions.map(d=><option key={d} value={d}>{dimensionNames[d as keyof typeof dimensionNames]}</option>)}</select></label></div>
    {expanded&&spec.measures&&<div className="da-metric-selector" aria-label="选择配置指标">{spec.measures.map((m,i)=><Button key={m.code} variant={active===i?'primary':'secondary'} size="sm" aria-pressed={active===i} onClick={()=>setSelected(i)}>{i+1}. {m.name}</Button>)}</div>}
    {spec.measures?.length?<div className="da-editor-grid">{spec.measures.map((m,index)=>{if(expanded&&index!==active)return null;const source=sources.find(s=>s.code===m.source),field=source?.fields.find(f=>f.code===m.field);return <fieldset key={m.code} disabled={disabled}><legend>指标 {index+1}</legend>
      <label>指标名称<input aria-label={`指标${index+1}名称`} maxLength={60} value={m.name} onChange={e=>change(index,{...m,name:e.target.value})}/></label>
      <label>数据来源<select aria-label={`指标${index+1}数据来源`} value={m.source} onChange={e=>{const source=sources.find(s=>s.code===e.target.value)!;change(index,{...newMeasure(source),code:m.code})}}>{sources.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
      <label>计算对象<select aria-label={`指标${index+1}计算对象`} value={m.field} onChange={e=>{const f=source!.fields.find(f=>f.code===e.target.value)!;change(index,{...m,field:f.code,name:f.name,aggregate:allowedAggregates(m.source,f)[0] as PlanMeasure['aggregate']})}}>{source?.fields.filter(f=>allowedAggregates(m.source,f).length).map(f=><option key={f.code} value={f.code}>{f.name}</option>)}</select></label>
      <label>计算方式<select aria-label={`指标${index+1}计算方式`} value={m.aggregate} onChange={e=>change(index,{...m,aggregate:e.target.value as PlanMeasure['aggregate']})}>{field&&allowedAggregates(m.source,field).map(a=><option key={a} value={a}>{aggregateNames[a as keyof typeof aggregateNames]}</option>)}</select></label>
      <div className="da-editor-filters">{m.filters.map((filter,fi)=>{const ff=source?.fields.find(f=>f.code===filter.field);const changeFilter=(value:PlanMeasure['filters'][number])=>change(index,{...m,filters:m.filters.map((f,i)=>i===fi?value:f)});return <div className="da-editor-filter" key={fi}>
        <label>筛选字段<select aria-label={`指标${index+1}筛选${fi+1}字段`} value={filter.field} onChange={e=>{const f=source!.fields.find(f=>f.code===e.target.value)!;changeFilter({field:f.code,operator:f.operators[0] as PlanMeasure['filters'][number]['operator'],values:[Object.keys(f.values)[0]??'']})}}>{source?.fields.filter(f=>f.operators.length).map(f=><option key={f.code} value={f.code}>{f.name}</option>)}</select></label>
        <label>匹配方式<select aria-label={`指标${index+1}筛选${fi+1}方式`} value={filter.operator} onChange={e=>changeFilter({...filter,operator:e.target.value as PlanMeasure['filters'][number]['operator'],values:filter.values.slice(0,1)})}>{ff?.operators.map(o=><option key={o} value={o}>{operatorNames[o as keyof typeof operatorNames]}</option>)}</select></label>
        <label>筛选值{ff&&Object.keys(ff.values).length?<select aria-label={`指标${index+1}筛选${fi+1}值`} multiple={filter.operator==='IN'} value={filter.operator==='IN'?filter.values:filter.values[0]??''} onChange={e=>changeFilter({...filter,values:[...e.target.selectedOptions].map(o=>o.value)})}>{Object.entries(ff.values).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>:<input aria-label={`指标${index+1}筛选${fi+1}值`} maxLength={filter.operator==='IN'?1000:100} placeholder={filter.operator==='IN'?'多个值用逗号分隔':'输入筛选值'} value={filter.values.join(',')} onChange={e=>changeFilter({...filter,values:filter.operator==='IN'?e.target.value.split(/[,，]/):[e.target.value]})}/>}</label>
        <Button variant="secondary" size="sm" onClick={()=>change(index,{...m,filters:m.filters.filter((_,i)=>i!==fi)})} aria-label={`删除指标${index+1}筛选${fi+1}`}>删除条件</Button>
      </div>})}</div>
      <div className="da-editor-actions"><Button variant="secondary" size="sm" disabled={m.filters.length>=8||!source?.fields.some(f=>f.operators.length)} onClick={()=>{const f=source!.fields.find(f=>f.operators.length)!;change(index,{...m,filters:[...m.filters,{field:f.code,operator:f.operators[0] as PlanMeasure['filters'][number]['operator'],values:[Object.keys(f.values)[0]??'']}]})}}>添加筛选条件</Button><Button variant="secondary" size="sm" disabled={spec.measures!.length===1} onClick={()=>update(spec.measures!.filter((_,i)=>i!==index))}>移除指标 {index+1}</Button></div>
    </fieldset>})}</div>:<div className="da-editor-grid">{spec.metrics.map((code,i)=><label key={i}>指标 {i+1}<select aria-label={`基础指标${i+1}`} disabled={disabled} value={code} onChange={e=>onChange({...spec,metrics:spec.metrics.map((m,j)=>i===j?e.target.value:m),dimension:'DAY',...(spec.widgets?{widgets:spec.widgets.map(w=>({...w,metrics:w.metrics.map(m=>m===code?e.target.value:m)}))}:{})})}>{catalog.filter(m=>m.code===code||!spec.metrics.includes(m.code)).map(m=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label>)}</div>}
    {Boolean(spec.measures?.length)&&<Button variant="secondary" size="sm" disabled={disabled||spec.metrics.length>=4||spec.template==='RANKING'||!sources.length} onClick={()=>{setSelected(spec.measures!.length);update([...spec.measures!,newMeasure(sources[0])])}}>添加指标</Button>}
  </details>
}
function periodText(s:PageSpec){return s.period.kind==='FIXED'?`${s.period.startDate??'未设置'} — ${s.period.endDate??'未设置'}`:periodNames[s.period.kind]}
function measuresText(s:PageSpec,sources:SourceCatalog[],catalog:PageMetric[]) {
  if(!s.measures?.length)return s.metrics.map(code=>catalog.find(m=>m.code===code)?.name??code).join('；')
  return s.measures.map(m=>{const source=sources.find(s=>s.code===m.source);return `${m.name}：${source?.name??m.source} / ${source?.fields.find(f=>f.code===m.field)?.name??m.field} / ${aggregateNames[m.aggregate]}${m.filters.length?'；'+m.filters.map(filter=>{const f=source?.fields.find(f=>f.code===filter.field);return `${f?.name??filter.field}${operatorNames[filter.operator]}${filter.values.map(v=>f?.values[v]??v).join('、')}`}).join('，'):'；无追加筛选'}`}).join('\n')
}
function templateLabel(t:PageSpec['template']){return {AUTO:'AI 自动识别',LIST:'统计列表',RANKING:'排行分析',TREND:'趋势分析',COMPARISON:'分组对比',DASHBOARD:'综合看板',CUSTOM:'AI 组合页面'}[t]}
function widgetsText(s:PageSpec){return s.widgets?.map(w=>`${w.title} · ${{KPI:'指标卡',BAR:'柱状图',LINE:'趋势图',TABLE:'表格'}[w.type]} · ${w.metrics.map(code=>s.measures?.find(m=>m.code===code)?.name??code).join('、')}`).join('；')??'预设模板'}
export function PlanChanges({before,after,sources,catalog}:{before:PageSpec;after:PageSpec;sources:SourceCatalog[];catalog:PageMetric[]}) {
  const rows=[['展示形式',templateLabel(before.template),templateLabel(after.template)],['展示组合',widgetsText(before),widgetsText(after)],['名称',before.title,after.title],['日期',periodText(before),periodText(after)],['范围',before.scope==='CURRENT'?'当前科室':'当前机构可访问科室',after.scope==='CURRENT'?'当前科室':'当前机构可访问科室'],['分组',dimensionNames[before.dimension],dimensionNames[after.dimension]],['指标与口径',measuresText(before,sources,catalog),measuresText(after,sources,catalog)],...(after.template==='RANKING'?[['显示条数',String(before.limit),String(after.limit)]]:[])].filter(([,a,b])=>a!==b)
  return <section className="da-changes" aria-label="方案变更对照"><h3>与初始方案比较</h3>{rows.length?<table><thead><tr><th>调整项</th><th>原方案</th><th>当前方案</th></tr></thead><tbody>{rows.map(([name,before,after])=><tr key={name}><th>{name}</th><td>{before}</td><td>{after}</td></tr>)}</tbody></table>:<p>当前方案与初始方案一致。</p>}</section>
}
