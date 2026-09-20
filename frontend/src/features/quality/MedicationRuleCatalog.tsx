import { useEffect, useState } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { CatalogVersion, MedicationCandidate, MedicationKnowledge, RuleCatalog, RuleCatalogCommand, RuleCatalogEntry, RuleDeployment, RuleRuntimeRecord } from '../../shared/api/medicationWorkbenchApi'
import { Alert, Button, Dialog, FormField, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'
import './medication-rule-catalog.css'

const reviews:Record<string,string>={DRAFT:'草稿',IN_REVIEW:'待审核',REJECTED:'已退回',APPROVED:'审核通过',RETIRED:'已废止'}
const actions:Record<string,string>={WARN:'提醒核对',REQUIRE_OVERRIDE:'继续开立需说明',BLOCK:'阻止提交'}
const modes:Record<string,string>={SHADOW:'旁路观察',ENFORCED:'正式生效'}
const operations:Record<string,string>={SUBMIT:'提交审核',APPROVE:'审核通过',REJECT:'退回修改',DEPLOY:'发布版本',PAUSE:'暂停运行',ROLLBACK:'回滚版本',RETIRE:'废止版本'}
const originName:Record<string,string>={BUILTIN:'系统内置',AI:'AI 辅助起草',MANUAL:'人工起草'}
function runtimeStatus(d:RuleDeployment) {
  if(d.status==='PAUSED') return '已暂停'
  if(d.status==='SUPERSEDED') return '已替换'
  if(d.effectiveTo && Date.parse(d.effectiveTo)<=Date.now()) return '已结束'
  if(Date.parse(d.effectiveFrom)>Date.now()) return '待生效'
  return modes[d.mode]??d.mode
}
function hasDefaultShadow(rule:RuleCatalogEntry) {
  return rule.origin==='BUILTIN' && !rule.deployments.length && rule.versions.some(v=>v.builtin?.ruleSetVersion==='qmed-standard-shadow-v2' && v.reviewStatus!=='RETIRED')
}
function summary(rule:RuleCatalogEntry) {
  const live=rule.deployments.filter(d=>['正式生效','旁路观察'].includes(runtimeStatus(d)))
  return live.length?live.map(d=>`${modes[d.mode]} v${d.version}`).join(' · '):hasDefaultShadow(rule)?'内置旁路观察':rule.deployments.length?'暂无运行版本':'尚未发布'
}

export function MedicationRuleCatalog({api,onOpenCandidate,onBuiltinTrial}:{api:RhnApi;onOpenCandidate:(candidate:MedicationCandidate)=>void;onBuiltinTrial:(code:string)=>void}) {
  const [data,setData]=useState<RuleCatalog>()
  const [selected,setSelected]=useState('')
  const [versionId,setVersionId]=useState('')
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState('ALL')
  const [origin,setOrigin]=useState('ALL')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [runs,setRuns]=useState<RuleRuntimeRecord[]>([])
  const [action,setAction]=useState<{operation:string;versionId:string;deployment?:RuleDeployment;mode?:string}>()
  const [draft,setDraft]=useState<{parent?:MedicationCandidate}>()
  const rule=data?.rules.find(r=>r.key===selected)
  const version=rule?.versions.find(v=>v.id===versionId)??rule?.versions[0]
  const loadCatalog = async (): Promise<RuleCatalog> => {
    const service = api.medicationWorkbench as any
    if (typeof service.catalog === 'function') return service.catalog()
    const legacy = await service.activeRules()
    return { organizationId: null, departmentId: null, rules: legacy.map((r:any) => ({ key: `BUILTIN:${r.ruleCode}`, code:r.ruleCode, name:r.ruleName, origin:'BUILTIN', revision:1,
      versions:[{id:r.ruleVersionId,version:r.version,name:r.ruleName,reviewStatus:'APPROVED',testsPassed:true,origin:'BUILTIN',candidate:null,
        builtin:{id:r.ruleVersionId,version:r.version,ruleSetVersion:r.ruleSetVersion,implementationKey:r.implementation,decision:r.decision,severity:r.severity,
          definition:{id:r.ruleId,code:r.ruleCode,category:r.category,title:r.ruleName},evidence:r.evidence},review:{versionId:r.ruleVersionId,status:'APPROVED',action:r.decision,evidence:r.evidence,standardVerified:true,evidenceVerified:true,actorId:'',recordedAt:r.effectiveFrom,reason:''}}],deployments:[],history:[]})) }
  }
  async function reload(prefer?:string) {
    setLoading(true)
    try {const result=await loadCatalog();setData(result);setSelected(old=>prefer??(result.rules.some(r=>r.key===old)?old:result.rules[0]?.key??''))}
    catch(e){setError(errorMessage(e))} finally {setLoading(false)}
  }
  useEffect(()=>{let alive=true;loadCatalog().then(value=>{if(alive){setData(value);setSelected(value.rules[0]?.key??'')}}).catch(e=>{if(alive)setError(errorMessage(e))}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[api])
  useEffect(()=>{setRuns([]);if(!selected)return;let alive=true;(typeof (api.medicationWorkbench as any).catalogRuns === 'function' ? (api.medicationWorkbench as any).catalogRuns(selected) : Promise.resolve([] as RuleRuntimeRecord[])).then((value: RuleRuntimeRecord[])=>{if(alive)setRuns(value)}).catch((e: unknown)=>{if(alive)setError(errorMessage(e))});return()=>{alive=false}},[api,selected,data])
  const visible=(data?.rules??[]).filter(r=>{
    const matchText=`${r.code} ${r.name}`.toLowerCase().includes(query.toLowerCase())
    const matchState=filter==='ALL'||r.versions.some(v=>v.reviewStatus===filter)||r.deployments.some(d=>runtimeStatus(d)===filter)||(filter==='旁路观察'&&hasDefaultShadow(r))
    return matchText&&matchState&&(origin==='ALL'||r.origin===origin)
  })
  async function runSuite(v:CatalogVersion) {
    if(!v.candidate)return
    setBusy(true);setError('')
    try{const run=await api.medicationWorkbench.suite(v.candidate.id);setNotice(run.cases.every(c=>c.passed)?'当前版本回归用例全部通过，可以提交审核。':'存在未通过用例，请先修正规则。');await reload(selected)}catch(e){setError(errorMessage(e))}finally{setBusy(false)}
  }
  return <section className="qmed-governance" aria-label="合理用药规则目录">
    <div className="qmed-governance__toolbar"><div><h3>合理用药规则目录</h3><p>统一管理草稿、审核、旁路和正式版本；编辑新版本不改变已发布版本。</p></div>
      <Button variant="secondary" onClick={()=>void reload()}>刷新目录</Button><Button onClick={()=>setDraft({})}>新建规则草稿</Button></div>
    {error&&<Alert>{error}</Alert>}{notice&&<Alert tone="info">{notice}</Alert>}
    <div className="qmed-governance__filters"><SearchField label="搜索规则名称或编码" value={query} onChange={setQuery} placeholder="搜索规则名称或编码" />
      <Select aria-label="规则状态筛选" value={filter} onChange={setFilter} options={[['ALL','全部状态'],['DRAFT','草稿'],['IN_REVIEW','待审核'],['REJECTED','已退回'],['APPROVED','审核通过'],['旁路观察','旁路观察'],['正式生效','正式生效'],['待生效','待生效'],['已暂停','已暂停'],['已结束','历史发布'],['RETIRED','已废止']].map(([value,label])=>({value,label}))}/>
      <Select aria-label="规则来源筛选" value={origin} onChange={setOrigin} options={[{value:'ALL',label:'全部来源'},...Object.entries(originName).map(([value,label])=>({value,label}))]}/>
      <span>共 {visible.length} 条规则</span></div>
    {loading&&!data?<LoadingState label="正在读取规则目录…"/>:<div className="qmed-governance__panes">
      <div className="qmed-governance__list">{visible.map(r=><button type="button" key={r.key} className={`qmed-governance__rule ${r.key===selected?'is-selected':''}`} onClick={()=>{setSelected(r.key);setVersionId('')}}>
        <strong>{r.name}</strong><small>{r.code} · {originName[r.origin]}</small><span>{summary(r)}</span><small>{r.versions.length} 个版本 · 最新 {reviews[r.versions[0]?.reviewStatus]??'待核对'}</small>
      </button>)}{!visible.length&&<p>当前筛选条件下没有规则。</p>}</div>
      <div className="qmed-governance__detail">{rule&&version?<>
        <div className="qmed-governance__heading"><div><h3>{rule.name}</h3><small>{rule.code} · {originName[rule.origin]}</small></div>
          <Select aria-label="规则版本" value={version.id} onChange={setVersionId} options={rule.versions.map(v=>({value:v.id,label:`v${v.version} · ${reviews[v.reviewStatus]}`}))}/></div>
        <div className="qmed-governance__badges"><StatusBadge tone="info">{reviews[version.reviewStatus]}</StatusBadge><span>{version.testsPassed?(version.builtin?'内置执行器回归基线':'回归测试通过'):'尚未通过回归测试'}</span>
          <span>审核动作：{version.review?.action?actions[version.review.action]:'待审核确定'}</span></div>
        <div className="qmed-governance__actions">
          {version.candidate&&<><Button variant="secondary" disabled={busy} onClick={()=>void runSuite(version)}>运行回归套件</Button><Button variant="secondary" onClick={()=>onOpenCandidate(version.candidate!)}>模拟与处方回放</Button>
            <Button variant="secondary" onClick={()=>setDraft({parent:version.candidate!})}>创建新版本</Button></>}
          {version.builtin&&<Button variant="secondary" onClick={()=>onBuiltinTrial(rule.code)}>验证当前规则</Button>}
          {['DRAFT','REJECTED'].includes(version.reviewStatus)&&<Button disabled={!version.testsPassed} onClick={()=>setAction({operation:'SUBMIT',versionId:version.id})}>提交审核</Button>}
          {version.reviewStatus==='IN_REVIEW'&&<><Button onClick={()=>setAction({operation:'APPROVE',versionId:version.id})}>审核通过</Button><Button variant="secondary" onClick={()=>setAction({operation:'REJECT',versionId:version.id})}>退回修改</Button></>}
          {version.reviewStatus==='APPROVED'&&<><Button onClick={()=>setAction({operation:'DEPLOY',versionId:version.id,mode:'SHADOW'})}>启用旁路观察</Button><Button onClick={()=>setAction({operation:'DEPLOY',versionId:version.id,mode:'ENFORCED'})}>正式发布</Button></>}
          {version.reviewStatus!=='RETIRED'&&<Button variant="secondary" onClick={()=>setAction({operation:'RETIRE',versionId:version.id})}>废止此版本</Button>}
        </div>
        <p className="qmed-runtime-note">当前在行规则由版本化强类型执行器运行，正式版本会在发布范围内参与处方提交校验；旁路版本只记录评价，不改变提交结果。</p><div className="qmed-governance__columns"><section><h4>版本内容</h4><p>{version.candidate?.rule.explanation??version.builtin?.definition.category}</p>
          {version.candidate&&<><p>适用药品：{version.candidate.medications.map(m=>m.medication.name).join('、')}</p><pre>{version.candidate.rule.ruleExpression??version.candidate.rule.explanation}</pre><p>起草依据：{version.candidate.source||'尚未填写'}</p></>}
          {version.builtin&&<p>内置规则的计算逻辑由版本化执行器维护，发布范围和审核策略在此管理。</p>}</section>
          <section><h4>审核依据</h4>{version.review?.evidence?.length?version.review.evidence.map((e,i)=><div key={i}><strong>{e.sourceTitle}</strong><small> · {e.sourceVersion}</small><p>{e.excerpt}</p><small>{e.sourceLocator}</small></div>):<p>尚无已审核证据。AI 起草内容和工程基线不会自动成为正式发布依据。</p>}
          {version.review&&<p>审核人 {version.review.actorId} · {new Date(version.review.recordedAt).toLocaleString()}<br/>{version.review.reason}</p>}</section></div>
        <section><h4>发布与运行范围</h4>
          {hasDefaultShadow(rule)&&<div className="qmed-governance__release"><span>内置默认旁路 · 全部适用机构</span><Button variant="secondary" onClick={()=>setAction({operation:'PAUSE',versionId:rule.versions.find(v=>v.builtin?.ruleSetVersion==='qmed-standard-shadow-v2')!.id})}>暂停本机构默认旁路</Button></div>}
          {!rule.deployments.length&&!hasDefaultShadow(rule)&&<p>尚未发布。旧的旁路批准标签仅作历史记录，须在此完成审核并启用。</p>}
          {[...rule.deployments].reverse().map(d=><div key={d.id} className="qmed-governance__release"><div><strong>v{d.version} · {runtimeStatus(d)} · {actions[d.action]}</strong><small>机构 {d.organizationId} / {d.departmentId?`科室 ${d.departmentId}`:'全机构'} · {new Date(d.effectiveFrom).toLocaleString()} 至 {d.effectiveTo?new Date(d.effectiveTo).toLocaleString():'长期'}</small><small>{d.reason}</small></div>
            <div>{d.status==='ACTIVE'&&runtimeStatus(d)!=='已结束'&&<Button variant="secondary" onClick={()=>setAction({operation:'PAUSE',versionId:d.versionId,deployment:d})}>暂停</Button>}
            {['已结束','已替换','已暂停'].includes(runtimeStatus(d))&&<Button variant="secondary" onClick={()=>setAction({operation:'ROLLBACK',versionId:d.versionId,deployment:d,mode:d.mode})}>回滚至 v{d.version}</Button>}</div></div>)}
        </section>
        <div className="qmed-governance__columns"><section><h4>真实处方观察 · 最近 {runs.length} 次</h4>{!runs.length&&<p>尚无自动运行记录。启用旁路后，适用范围内的处方评价会自动产生记录。</p>}
          {runs.slice(0,12).map(r=><div key={r.id} className="qmed-governance__event"><strong>{modes[r.mode]} · {r.decision==='NOT_APPLICABLE'?'不在适用范围':r.decision}</strong><small>处方 {r.prescriptionId} · {new Date(r.time).toLocaleString()}</small></div>)}</section>
          <section><h4>操作记录</h4>{!rule.history.length&&<p>尚无目录管理操作。</p>}{[...rule.history].reverse().slice(0,20).map(h=><div key={h.id} className="qmed-governance__event"><strong>{operations[h.operation]??h.operation} · 操作人 {h.actorId}</strong><small>{new Date(h.time).toLocaleString()} · 版本 {rule.versions.find(v=>v.id===h.versionId)?.version??h.versionId}</small><p>{h.reason}</p></div>)}</section></div>
      </>:<p>选择一条规则查看全部版本和发布记录。</p>}</div>
    </div>}
    {action&&rule&&data&&<CatalogActionDialog action={action} entry={rule} catalog={data} onClose={()=>setAction(undefined)} onSave={async body=>{
      if(typeof (api.medicationWorkbench as any).catalogCommand !== 'function'){setNotice('规则目录兼容视图仅支持查看，请使用最新接口。');return} const updated=await (api.medicationWorkbench as any).catalogCommand(rule.key,body);setAction(undefined);setNotice('规则目录已更新，操作及发布版本已留痕。');setData(old=>old?{...old,rules:old.rules.map(r=>r.key===updated.key?updated:r)}:old)
    }}/>}
    {draft&&<RuleDraftDialog api={api} parent={draft.parent} onClose={()=>setDraft(undefined)} onSaved={async value=>{setDraft(undefined);setNotice(`已保存 v${value.version} 草稿，请运行回归套件后提交审核。`);await reload();setVersionId(value.id)}}/>}
  </section>
}

function CatalogActionDialog({action,entry,catalog,onClose,onSave}:{action:{operation:string;versionId:string;deployment?:RuleDeployment;mode?:string};entry:RuleCatalogEntry;catalog:RuleCatalog;onClose:()=>void;onSave:(body:RuleCatalogCommand)=>Promise<void>}) {
  const [error,setError]=useState('');const [busy,setBusy]=useState(false)
  const [mode,setMode]=useState(action.mode??'SHADOW');const [scope,setScope]=useState(action.deployment?.departmentId?'DEPARTMENT':'ORGANIZATION')
  const [decision,setDecision]=useState('WARN')
  const release=['DEPLOY','ROLLBACK'].includes(action.operation)
  const field=(form:FormData,key:string)=>String(form.get(key)??'').trim()
  return <Dialog title={operations[action.operation]} onClose={onClose}><form className="qmed-governance__form" onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError('');try{
    const body:RuleCatalogCommand={expectedRevision:entry.revision,operation:action.operation,versionId:action.versionId,deploymentId:action.deployment?.id,reason:field(form,'reason'),
      organizationId:action.deployment?.organizationId??catalog.organizationId??undefined,departmentId:scope==='DEPARTMENT'?(action.deployment?.departmentId??catalog.departmentId):null}
    if(action.operation==='APPROVE')Object.assign(body,{action:decision,standardVerified:form.has('standardVerified'),evidenceVerified:form.has('evidenceVerified'),evidence:[{sourceType:'REVIEWED_CLINICAL_SOURCE',sourceTitle:field(form,'sourceTitle'),sourceVersion:field(form,'sourceVersion'),sourceLocator:field(form,'sourceLocator'),section:field(form,'section'),excerpt:field(form,'excerpt'),usageScope:'CLINICAL_EVIDENCE'}]})
    if(release)Object.assign(body,{mode,effectiveFrom:field(form,'effectiveFrom')?new Date(field(form,'effectiveFrom')).toISOString():null,effectiveTo:field(form,'effectiveTo')?new Date(field(form,'effectiveTo')).toISOString():null})
    await onSave(body)
  }catch(err){setError(errorMessage(err))}finally{setBusy(false)}}}>
    {error&&<Alert>{error}</Alert>}
    {action.operation==='APPROVE'&&<><Alert tone="info">请核对标准身份、回归结果和证据后作出审核结论；审核通过不会自动启用规则。</Alert>
      <FormField label="正式执行动作"><Select value={decision} onChange={setDecision} options={Object.entries(actions).map(([value,label])=>({value,label}))}/></FormField>
      <div className="qmed-governance__columns"><FormField label="证据标题" required><input name="sourceTitle" required maxLength={300}/></FormField><FormField label="证据版本" required><input name="sourceVersion" required maxLength={100}/></FormField></div>
      <FormField label="来源定位" required><input name="sourceLocator" required maxLength={2000} placeholder="说明书、指南或经审核制度的定位信息"/></FormField>
      <FormField label="章节"><input name="section" maxLength={300}/></FormField><FormField label="支持条款" required><textarea name="excerpt" required maxLength={8000}/></FormField>
      <label><input type="checkbox" name="standardVerified" required/>已核对适用药品及标准语义</label><label><input type="checkbox" name="evidenceVerified" required/>已核对证据与执行动作，并审阅验证结果</label></>}
    {release&&<><FormField label="运行模式"><Select value={mode} onChange={setMode} disabled={action.operation==='ROLLBACK'} options={Object.entries(modes).map(([value,label])=>({value,label}))}/></FormField>
      <FormField label="发布范围"><Select value={scope} onChange={setScope} disabled={action.operation==='ROLLBACK'} options={[{value:'ORGANIZATION',label:'当前机构全部科室'},...(catalog.departmentId?[{value:'DEPARTMENT',label:'当前科室'}]:[])]}/></FormField>
      <div className="qmed-governance__columns"><FormField label="生效时间（留空立即生效）"><input type="datetime-local" name="effectiveFrom"/></FormField><FormField label="失效时间（留空长期有效）"><input type="datetime-local" name="effectiveTo"/></FormField></div>
      <Alert tone="info">{mode==='ENFORCED'?'正式发布将参与处方提交校验。请先审阅当前版本在适用范围内的真实旁路观察结果。':'启用后将自动评价适用范围内的真实处方，旁路结果不会阻止提交。'}</Alert></>}
    <FormField label="操作原因" required><textarea name="reason" required maxLength={2000}/></FormField>
    <div className="qmed-governance__actions"><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" disabled={busy}>{busy?'正在保存…':operations[action.operation]}</Button></div>
  </form></Dialog>
}

function RuleDraftDialog({api,parent,onClose,onSaved}:{api:RhnApi;parent?:MedicationCandidate;onClose:()=>void;onSaved:(value:MedicationCandidate)=>Promise<void>}) {
  const [template,setTemplate]=useState(parent?.rule.template??'EXACT_GENERIC_DUPLICATE');const [meds,setMeds]=useState<MedicationKnowledge[]>(parent?.medications??[])
  const [ids,setIds]=useState(parent?.medications.map(m=>m.medication.id)??[]);const [query,setQuery]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
  async function search(){try{setMeds(await api.medicationWorkbench.medications(query))}catch(e){setError(errorMessage(e))}}
  return <Dialog title={parent?'创建规则新版本':'新建规则草稿'} onClose={onClose}><form className="qmed-governance__form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);const text=(key:string)=>String(f.get(key)??'').trim();try{
    const value=await api.medicationWorkbench.createDraft({parentId:parent?.id,requirement:text('requirement'),source:text('source'),medicationIds:ids,rule:{template,name:text('name'),explanation:text('requirement'),duplicateCount:Number(f.get('duplicateCount')??2),message:text('message'),decision:'WARN',minAge:template==='AGE_CONTRAINDICATION'?Number(f.get('minAge')):undefined}})
    await onSaved(value)
  }catch(err){setError(errorMessage(err))}finally{setBusy(false)}}}>
    {error&&<Alert>{error}</Alert>}<FormField label="规则名称" required><input name="name" required maxLength={120} defaultValue={parent?.rule.name}/></FormField>
    <FormField label="规则模板"><Select value={template} onChange={setTemplate} options={[{value:'EXACT_GENERIC_DUPLICATE',label:'同标准规格重复'},{value:'CATEGORY_DUPLICATE',label:'所选标准规格组重复'},{value:'ANTIMICROBIAL_MAX_DAYS',label:'抗菌药疗程核对'},{value:'AGE_CONTRAINDICATION',label:'年龄阈值核对'}]}/></FormField>
    <div className="qmed-governance__columns"><FormField label="重复条目阈值"><input type="number" min={2} max={10} required name="duplicateCount" defaultValue={parent?.rule.duplicateCount??2}/></FormField>
      {template==='AGE_CONTRAINDICATION'&&<FormField label="年龄下限" required><input type="number" min={0} max={150} required name="minAge" defaultValue={parent?.rule.minAge??18}/></FormField>}</div>
    <FormField label="规则需求与适用说明" required><textarea name="requirement" required maxLength={2000} defaultValue={parent?.requirement}/></FormField>
    <FormField label="命中提示" required><input name="message" required maxLength={500} defaultValue={parent?.rule.message}/></FormField>
    <FormField label="起草依据"><textarea name="source" maxLength={8000} defaultValue={parent?.source}/></FormField>
    <div className="qmed-governance__filters"><SearchField label="检索已关联标准药品" value={query} onChange={setQuery} placeholder="检索已关联标准药品"/><Button variant="secondary" onClick={()=>void search()}>检索药品</Button><span>已选 {ids.length} / 10</span></div>
    <div className="qmed-governance__meds">{meds.map(m=><label key={m.medication.id}><input type="checkbox" checked={ids.includes(m.medication.id)} disabled={m.standardReference?.status!=='LINKED'} onChange={e=>setIds(old=>e.target.checked?[...old,m.medication.id]:old.filter(id=>id!==m.medication.id))}/>{m.medication.name} · {m.medication.preparationSpec} {m.standardReference?.status!=='LINKED'?'（待标准关联）':''}</label>)}</div>
    <div className="qmed-governance__actions"><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" disabled={busy||!ids.length||ids.length>10}>保存草稿</Button></div>
  </form></Dialog>
}
