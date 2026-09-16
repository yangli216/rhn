import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { MedicationCandidate, MedicationKnowledge, MedicationTrialItem, MedicationTrialRun } from '../../shared/api/medicationWorkbenchApi'
import { Alert, Button, PageHeader } from '../../shared/ui'
import './medication-workbench.css'

const templateName=(code:string)=>code==='EXACT_GENERIC_DUPLICATE'?'通用药重复核对':'HIS 抗菌药疗程上限'
const decisions:Record<string,string>={PASS:'未命中本规则',WARN:'需核对',UNAVAILABLE:'数据不足 / 无法评价'}
export function MedicationWorkbench({api}:{api:RhnApi}) {
  const [meds,setMeds]=useState<MedicationKnowledge[]>([])
  const [selected,setSelected]=useState<MedicationKnowledge[]>([])
  const [query,setQuery]=useState('')
  const [candidates,setCandidates]=useState<MedicationCandidate[]>([])
  const [candidate,setCandidate]=useState<MedicationCandidate|null>(null)
  const [ai,setAi]=useState<{available:boolean;model:string|null;message:string}|null>(null)
  const [requirement,setRequirement]=useState('同一张处方中，相同通用药出现两次以上时提示核对，已撤销项目不参与。')
  const [source,setSource]=useState('')
  const [items,setItems]=useState<MedicationTrialItem[]>([])
  const [run,setRun]=useState<MedicationTrialRun|null>(null)
  const [history,setHistory]=useState<MedicationTrialRun[]>([])
  const [encounter,setEncounter]=useState('')
  const [prescription,setPrescription]=useState('')
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const epoch=useRef(0)
  useEffect(()=>{const current=++epoch.current;setBusy('加载');setCandidate(null);setRun(null);setHistory([]);setSelected([]);setMeds([]);setCandidates([]);setAi(null);setError('')
    Promise.all([api.medicationWorkbench.status(),api.medicationWorkbench.medications(),api.medicationWorkbench.candidates()])
      .then(([status,medications,saved])=>{if(current===epoch.current){setAi(status);setMeds(medications);setCandidates(saved)}})
      .catch(e=>{if(current===epoch.current)setError(errorMessage(e))})
      .finally(()=>{if(current===epoch.current)setBusy('')})
    return ()=>{epoch.current++}
  },[api])
  async function action(label:string,work:()=>Promise<void>){setBusy(label);setError('');try{await work()}catch(e){setError(errorMessage(e))}finally{setBusy('')}}
  function choose(c:MedicationCandidate){setCandidate(c);setSelected(c.medications);setRequirement(c.requirement);setSource(c.source);setRun(null);setHistory([]);setNotice('');setItems([{medicationId:c.medications[0].medication.id,status:'DRAFT',durationDays:1,routeCode:c.medications[0].medication.defaultRoute}])}
  async function generate(){const current=epoch.current;const reply=await api.medicationWorkbench.generate(requirement,source,selected.map(m=>m.medication.id),candidate?.id??null);if(current!==epoch.current)return
    setNotice(reply.message);if(reply.candidate){choose(reply.candidate);setNotice(reply.message);setCandidates(c=>[reply.candidate!,...c])}}
  async function execute(kind:'suite'|'trial'|'shadow'){if(!candidate)return;const id=candidate.id;const current=epoch.current
    const result=kind==='suite'?await api.medicationWorkbench.suite(id):kind==='trial'?await api.medicationWorkbench.trial(id,items):await api.medicationWorkbench.shadow(id,encounter,prescription)
    if(current===epoch.current){setRun(result);if(result.mode==='SYNTHETIC')setHistory(h=>[result,...h])}}
  function updateItem(index:number,patch:Partial<MedicationTrialItem>){setItems(values=>values.map((v,i)=>i===index?{...v,...patch}:v));setRun(null)}
  return <div className="qmed-workbench">
    <PageHeader eyebrow="临床质量 · 候选规则" title="合理用药规则工作台" />
    <div className="qmed-status"><span>{ai?.available?`真实 AI · ${ai.model}`:'AI 尚未就绪'}</span><span>HIS 主数据直连</span><span>仅试跑 / SHADOW · 不改变处方门禁</span><Link to="/settings/ai-assistant">AI助理配置</Link><Button disabled={!!busy} onClick={()=>action('刷新模型',async()=>setAi(await api.medicationWorkbench.status()))}>刷新模型状态</Button></div>
    {error&&<Alert tone="error">{error}</Alert>}{notice&&<Alert>{notice}</Alert>}
    <div className="qmed-columns">
      <aside className="qmed-pane"><h2>HIS 药品与规则</h2><p>读取本租户已启用的标准药品，最多选择 10 项。规则仅适用于所选范围。</p>
        <form className="qmed-search" onSubmit={e=>{e.preventDefault();void action('搜索',async()=>setMeds(await api.medicationWorkbench.medications(query)))}}><input aria-label="搜索 HIS 药品" placeholder="药品名 / 编码 / 别名" value={query} onChange={e=>setQuery(e.target.value)}/><Button disabled={!!busy} type="submit">搜索</Button></form>
        <div className="qmed-medications">{meds.map(m=><label className="qmed-medication" key={m.medication.id}><input type="checkbox" checked={selected.some(v=>v.medication.id===m.medication.id)} disabled={!!busy||(!selected.some(v=>v.medication.id===m.medication.id)&&selected.length>=10)} onChange={e=>{setSelected(s=>e.target.checked?[...s,m]:s.filter(v=>v.medication.id!==m.medication.id))}}/><span><strong>{m.medication.name}</strong><small>{m.medication.code} · {m.medication.preparationSpec||m.medication.doseForm||'规格待维护'}</small></span></label>)}</div>
        <h3>候选版本 <small>{candidates.length}</small></h3><Button disabled={!!busy} onClick={()=>{setCandidate(null);setRun(null);setHistory([]);setItems([]);setNotice('创建新候选规则，保留当前药品选择')}}>新建规则</Button>
        <div className="qmed-saved">{candidates.map(c=><button disabled={!!busy} className={candidate?.id===c.id?'is-active':''} key={c.id} onClick={()=>choose(c)}><strong>{c.rule.name}</strong>{' '}<small>v{c.version} · {templateName(c.rule.template)} · {new Date(c.createdAt).toLocaleString()}</small></button>)}{!candidates.length&&<p>尚无候选规则。选择药品后输入需求，由真实 AI 生成。</p>}</div>
      </aside>
      <main className="qmed-pane"><h2>自然语言编写规则</h2><label>规则需求<textarea rows={4} value={requirement} maxLength={4000} onChange={e=>setRequirement(e.target.value)}/></label><label>依据 / 机构制度原文（可选）<textarea rows={2} value={source} maxLength={8000} placeholder="未填写时标记为缺少依据，不自动补造药学证据" onChange={e=>setSource(e.target.value)}/></label>
        <div className="qmed-actions"><Button disabled={!!busy||!ai?.available||!selected.length||!requirement.trim()} onClick={()=>action('AI 生成',generate)}>{busy==='AI 生成'?'真实模型分析中…':candidate?'AI 生成新版本':'AI 生成候选规则'}</Button><small>支持：通用药重复、按 HIS 抗菌药最大天数检查疗程</small></div>
        {!ai?.available&&<p className="qmed-muted">{ai?.message||'正在读取 AI 配置'}。配置后刷新模型状态即可。</p>}
        <h3>已选药品 · {selected.length}</h3><div className="qmed-facts">{selected.map(k=><details key={k.medication.id}><summary>{k.medication.name} <small>{k.medication.code}</small></summary><dl><dt>通用药 ID</dt><dd>{k.medication.id}</dd><dt>规格 / 含量</dt><dd>{k.medication.preparationSpec||'未维护'} / {k.medication.strengthValue??'未维护'} {k.medication.strengthUnit}</dd><dt>默认用法</dt><dd>{k.medication.defaultDose??'—'} {k.medication.defaultDoseUnit} · {k.medication.defaultRoute||'途径未维护'} · {k.medication.defaultFrequency||'频次未维护'}</dd><dt>抗菌药疗程上限</dt><dd>{k.medication.antimicrobial?`${k.medication.antimicrobialMaxDays??'未维护'} 天`:'非抗菌药'}</dd><dt>分类</dt><dd>{k.classifications.map(c=>`${c.display} (${c.systemCode} / ${c.systemVersion})`).join('；')||'未映射'}</dd><dt>过敏原</dt><dd>{k.allergens.map(a=>a.display).join('、')||'未映射'}</dd><dt>标准编码</dt><dd>{k.standardMappings.map(m=>`${m.systemName} ${m.termCode} ${m.termDisplay}`).join('；')||'未映射'}</dd><dt>数据快照</dt><dd>修订 {k.revision} · {new Date(k.capturedAt).toLocaleString()}（临床语义版本尚未发布）</dd></dl></details>)}</div>
        {candidate&&<section className="qmed-definition"><h3>{candidate.rule.name} · v{candidate.version}</h3><p>{candidate.rule.explanation}</p><dl><dt>执行模板</dt><dd>{templateName(candidate.rule.template)}</dd><dt>执行参数</dt><dd>{candidate.rule.template==='EXACT_GENERIC_DUPLICATE'?`相同通用药数量 ≥ ${candidate.rule.duplicateCount}`:'使用药品主数据或处方历史快照中的抗菌药最大天数'}</dd><dt>命中动作</dt><dd>WARN · {candidate.rule.message}</dd><dt>输入缺失</dt><dd>UNAVAILABLE，不作为通过</dd><dt>依据状态</dt><dd>{candidate.source?'用户提供，待专业审核':'未提供，不具备生产发布资格'}</dd><dt>绑定范围</dt><dd>{candidate.medications.map(m=>m.medication.name).join('、')}</dd></dl><p className="qmed-muted">试跑使用此版本绑定的药品快照；上方修改需求或药品后，需生成新版本才会生效。</p></section>}
      </main>
      <section className="qmed-pane"><h2>验证与执行结果</h2>{!candidate?<p>先生成或选择一条候选规则，再运行案例。</p>:<>
        <div className="qmed-actions"><Button disabled={!!busy} onClick={()=>action('批量试跑',()=>execute('suite'))}>一键运行标准案例</Button><Button disabled={!!busy} onClick={()=>action('历史记录',async()=>setHistory(await api.medicationWorkbench.runs(candidate.id)))}>历史模拟记录</Button></div>
        <h3>模拟处方</h3><p>仅模拟输入，执行真实模板引擎；不会写入 HIS 处方或库存。</p>
        {items.map((item,i)=><div className="qmed-trial-row" key={i}><span>{i+1}</span><select aria-label={`第${i+1}行药品`} value={item.medicationId??''} onChange={e=>updateItem(i,{medicationId:e.target.value||null})}><option value="">缺失药品标识</option>{candidate.medications.map(m=><option key={m.medication.id} value={m.medication.id}>{m.medication.name}</option>)}</select><select aria-label={`第${i+1}行状态`} value={item.status} onChange={e=>updateItem(i,{status:e.target.value})}><option value="DRAFT">有效</option><option value="CANCELLED">已撤销</option></select><input type="number" min="0" step="0.5" aria-label={`第${i+1}行疗程天数`} title="疗程天数" placeholder="天" value={item.durationDays??''} onChange={e=>updateItem(i,{durationDays:e.target.value===''?null:Number(e.target.value)})}/><button aria-label={`删除第${i+1}行`} onClick={()=>{setItems(s=>s.filter((_,n)=>n!==i));setRun(null)}}>×</button></div>)}
        <div className="qmed-actions"><Button disabled={!!busy||items.length>=100} onClick={()=>setItems(s=>[...s,{medicationId:candidate.medications[0].medication.id,status:'DRAFT',durationDays:1,routeCode:null}])}>添加药品</Button><Button disabled={!!busy} onClick={()=>action('自定义试跑',()=>execute('trial'))}>运行此处方</Button></div>
        <details className="qmed-shadow"><summary>从 HIS 真实处方进行旁路验证</summary><p>后端校验就诊权限并读取整张处方；疗程规则使用处方保存的药品快照，不用当前主数据重写历史。</p><label>就诊 ID<input value={encounter} onChange={e=>setEncounter(e.target.value)}/></label><label>处方 ID<input value={prescription} onChange={e=>setPrescription(e.target.value)}/></label><Button disabled={!!busy||!/^\d+$/.test(encounter)||!/^\d+$/.test(prescription)} onClick={()=>action('HIS 旁路验证',()=>execute('shadow'))}>读取并评价</Button></details>
        {busy&&<p role="status">{busy}中…</p>}
        {run&&<div className="qmed-results"><h3>{run.mode==='HIS_SHADOW'?'HIS 旁路结果':'模拟执行结果'}</h3><small>规则版本 v{candidate.version} · {new Date(run.createdAt).toLocaleString()}</small>{run.cases.map((c,i)=><article key={i} className={'qmed-case result-'+c.actual.toLowerCase()}><strong>{c.name}</strong><span>{decisions[c.actual]||c.actual}</span>{c.expected&&<small>预期 {decisions[c.expected]} · {c.passed?'符合预期':'不符合预期'}</small>}<p>{c.reasons.join('；')||'本规则未发现命中条件，不代表完整用药安全结论。'}</p>{c.matchedRows.length>0&&<small>命中处方第 {c.matchedRows.join('、')} 行</small>}<details><summary>查看完整模拟输入</summary><pre>{JSON.stringify(c.input,null,2)}</pre></details></article>)}</div>}
        {history.length>0&&<details><summary>历史模拟记录（{history.length}）</summary>{history.map(h=><button className="qmed-history" key={h.id} onClick={()=>setRun(h)}>{new Date(h.createdAt).toLocaleString()} · {h.cases.length} 个案例</button>)}</details>}
      </>}</section>
    </div>
  </div>
}
