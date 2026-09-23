import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, LoadingState, PanelHead, StatusBadge } from '../../shared/ui'
import { medicationStandardBindingStatusPresentation } from '../../shared/presentation'
import { formatTime } from '../../shared/format'
import './medication-standard-binding.css'
import { MedicationStandardRevisionDialog } from './MedicationStandardRevisionDialog'

const differenceLabels: Record<string, string> = {
  STANDARD_SPECIFICATION_INCOMPLETE: '标准规格不完整，须先核对原文',
  STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW: '标准原文包含未分开的剂型段落',
  STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW: '成分片段不能单独作为完整规格',

  STANDARD_REFERENCE_TYPE_MISMATCH: '药品类型不一致', STANDARD_REFERENCE_FORM_MISMATCH: '剂型不一致',
  STANDARD_REFERENCE_SPEC_MISMATCH: '规格文字不一致', STANDARD_REFERENCE_UNIT_MISMATCH: '制剂单位不一致',
  STANDARD_REFERENCE_STRENGTH_MISMATCH: '已有含量与标准不一致',
  STANDARD_REFERENCE_QUALIFIER_MISSING: '缺少盐型信息，请先核对并补全药品名称',
  STANDARD_REFERENCE_QUALIFIER_MISMATCH: '盐型与标准不一致，不能关联为同一规格',
}
const doseFormLabels: Record<string, string> = {
  TABLET: '片剂', CAPSULE: '胶囊', ENTERIC_TABLET: '肠溶片', ENTERIC_CAPSULE: '肠溶胶囊',
  EXTENDED_RELEASE_TABLET: '缓释片', EXTENDED_RELEASE_CAPSULE: '缓释胶囊', DISPERSIBLE_TABLET: '分散片',
  EFFERVESCENT_TABLET: '泡腾片', INJECTION: '注射剂', INJECTABLE_SOLUTION: '注射液', INFUSION: '输液',
  ORAL_SOLUTION: '口服溶液', SYRUP: '糖浆剂', POWDER: '散剂', GRANULE: '颗粒剂',
  PATCH: '贴剂', CREAM: '乳膏剂', OINTMENT: '软膏剂', GEL: '凝胶剂', DROPS: '滴剂',
  OTHER: '其他剂型（未规范）', UNKNOWN: '未定义剂型',
}
const sourceVerificationLabels: Record<string, string> = {
  UNVERIFIED: '来源待核验', SUBMITTED: '来源待复核', VERIFIED: '来源已核验',
  REJECTED: '来源材料已退回', REVOKED: '来源核验已撤销',
}
function doseFormLabel(code?: string, name?: string) {
  return name || (code ? doseFormLabels[code] ?? code : '未记录')
}
function doseFormVariantNote(medication: {name: string; doseForm?: string}, specification: {doseForm?: string; doseFormName?: string}) {
  const standard = specification.doseForm ?? ''
  if (standard === medication.doseForm) return ''
  const base = standard.replace(/^(EXTENDED_RELEASE_|ENTERIC_)/, '')
  if (base !== medication.doseForm) return ''
  const name = medication.name.replace(/\s/g, '')
  if (standard.startsWith('EXTENDED_RELEASE_') && (name.includes('缓释') || name.includes('控释') || name.includes('长效')))
    return `基础剂型为${doseFormLabel(medication.doseForm)}，药品名称已明确${doseFormLabel(standard, specification.doseFormName)}属性，请核对来源原文。`
  if (standard.startsWith('ENTERIC_') && name.includes('肠溶'))
    return `基础剂型为${doseFormLabel(medication.doseForm)}，药品名称已明确${doseFormLabel(standard, specification.doseFormName)}属性，请核对来源原文。`
  return ''
}
function differences(issues: string[], item: {specification: {doseForm?: string; doseFormName?: string; specification?: string; presentationUnit?: string | null}}, medication: {doseForm?: string; preparationSpec?: string; presentationUnit?: string}) {
  const specific = issues.filter(issue => issue !== 'STANDARD_REFERENCE_IDENTITY_MISMATCH')
  return specific.length ? specific.map(issue => {
    if (issue === 'STANDARD_REFERENCE_FORM_MISMATCH') return `剂型不一致（当前：${doseFormLabel(medication.doseForm)}；候选：${doseFormLabel(item.specification.doseForm, item.specification.doseFormName)}）`
    if (issue === 'STANDARD_REFERENCE_SPEC_MISMATCH') return `规格不一致（当前：${medication.preparationSpec || '未记录'}；候选：${item.specification.specification || '未记录'}）`
    if (issue === 'STANDARD_REFERENCE_UNIT_MISMATCH') return `制剂单位不一致（当前：${medication.presentationUnit || '未记录'}；候选：${item.specification.presentationUnit || '未记录'}）`
    return differenceLabels[issue] ?? '需核对身份字段'
  }).join('、') : '类型、剂型、规格或单位不一致'
}
const medicationTypes: Record<string, string> = {WESTERN: '西药', CHINESE_PATENT: '中成药', HERBAL: '中药饮片', VACCINE: '疫苗'}
export function MedicationStandardBindingDialog({api, medicationId, onClose, onOpenCatalog}: {api: RhnApi; medicationId: string; onClose: () => void; onOpenCatalog?: () => void}) {
  const client = useQueryClient()
  const key = ['medication-standard-binding', medicationId]
  const query = useQuery({queryKey: key, queryFn: () => api.masterData.medicationStandardBindingPreview(medicationId)})
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const value = query.data
  const token = value ? JSON.stringify([medicationId, value.medication, value.identity, value.reference.status, value.candidates]) : ''
  useEffect(() => {setSelected(''); setReason(''); setConfirmed(false)}, [token])
  const eligible = value?.candidates.filter(item => item.canBind) ?? []
  const excluded = value?.candidates.filter(item => !item.canBind && item.issues.length > 0) ?? []
  const unavailable = value?.candidates.filter(item => !item.canBind && !item.issues.length) ?? []
  const linked = value?.reference.status === 'LINKED'
  const linkedCandidate = value?.candidates.find(item => item.specification.id === value.reference.specificationId)
  const doseFormCode = value?.medication.doseForm
  const needsMedicationCorrection = !doseFormCode || doseFormCode === 'OTHER' || doseFormCode === 'UNKNOWN'
  const hasDoseFormMismatch = excluded.some(item => item.issues.includes('STANDARD_REFERENCE_FORM_MISMATCH'))
  const needsCatalogReview = excluded.some(item => item.issues.some(issue => ['STANDARD_SPECIFICATION_INCOMPLETE', 'STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW', 'STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW'].includes(issue)))
  const candidate = eligible.find(item => item.specification.id === selected)
  const status = medicationStandardBindingStatusPresentation(value?.reference.status ?? '')
  const doseFormName = value?.candidates.find(item => item.specification.doseForm === value.medication.doseForm)?.specification.doseFormName

  const mutation = useMutation({mutationFn: async () => {
    if (!value || !candidate?.canBind || !reason.trim() || !confirmed || query.isFetching || query.error) throw new Error('请重新核对可关联的标准规格')
    return api.masterData.bindMedicationStandard(medicationId, {expectedRevision: value.medication.revision, identity: value.identity,
      specificationId: selected, reason, confirmedIdentity: confirmed})
  }, onSuccess: async data => {
    client.setQueryData(key, data)
    await Promise.all(['medication-standard-readiness', 'master-data-medications', 'master-data-standard-setup']
      .map(prefix => client.invalidateQueries({queryKey: [prefix]})))
  }})
  if (revisionOpen) return <MedicationStandardRevisionDialog api={api} medicationId={medicationId} onClose={() => { setRevisionOpen(false); void query.refetch() }} />
  const busy = query.isFetching || mutation.isPending
  const cannotBindReason = value?.reference.status !== 'UNMAPPED'
    ? '当前药品已有标准关系；如需变更，请使用“标准关联修订与复核”。'
    : value?.medication.status && value.medication.status !== 'ACTIVE'
      ? '当前药品未启用，请先核对药品启用状态。'
      : '当前状态或权限不允许关联，请核对药品状态及主数据管理权限。'
  return <Dialog title={linked ? '当前药品标准关联' : '核对药品标准关联'} size="xwide" className="standard-binding" onClose={() => {if (!mutation.isPending) onClose()}}
    closeOnBackdrop={false} enterNavigation={false}
    description={linked ? '查看当前生效的标准身份；需要变更时进入标准关联修订与复核。' : '选择身份一致的标准规格，核对来源后建立关联。保留原有药品、产品、包装及用法属性。'}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>{mutation.isSuccess ? '完成' : '取消'}</Button>
      <Button variant="secondary" onClick={() => {void query.refetch()}} disabled={busy}>刷新核对结果</Button>
      {!linked && !!eligible.length && <Button variant="primary" onClick={() => mutation.mutate()}
        disabled={!candidate || !reason.trim() || !confirmed || busy || !!query.error}>
        {mutation.isPending ? '正在建立关联…' : '建立标准关联'}
      </Button>}
    </>}>
    <div className="standard-binding__body">
      {query.isPending ? <LoadingState label="正在查找标准身份线索…" /> : value && <>
        <section aria-label="现有药品档案">
          <PanelHead title={value.medication.name} meta={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>} />
          <p className="standard-binding__secondary">{value.medication.code}</p>
          <dl className="standard-binding__facts">
            {Object.entries({药品类型: medicationTypes[value.medication.medicationType] ?? value.medication.medicationType,
              剂型: doseFormLabel(value.medication.doseForm, doseFormName), 规格: value.medication.preparationSpec,
              制剂单位: value.medication.presentationUnit,
              已有含量: value.medication.strengthValue != null ? `${value.medication.strengthValue} ${value.medication.strengthUnit ?? ''}` : '未记录'}).map(([label, text]) =>
              <div key={label}><dt>{label}</dt><dd>{text || '未记录'}</dd></div>)}
          </dl>
        </section>
        {linked ? <section aria-label="当前标准关联">
          <PanelHead title="当前标准关联" meta="身份一致" />
          <div className="standard-binding__notice">
            <strong>当前药品已关联且身份一致，无需再次建立关联。</strong>
            <dl className="standard-binding__facts">
              {Object.entries({
                标准药品: value.reference.name || linkedCandidate?.specification.name || value.medication.name,
                标准剂型: doseFormLabel(value.reference.doseForm || linkedCandidate?.specification.doseForm, linkedCandidate?.specification.doseFormName),
                标准规格: value.reference.preparationSpec || linkedCandidate?.specification.specification || '未记录',
                制剂单位: value.reference.presentationUnit || linkedCandidate?.specification.presentationUnit || '未记录',
                标准规格编码: value.reference.specificationId || '未记录',
                来源状态: sourceVerificationLabels[value.reference.sourceVerificationStatus ?? ''] || value.reference.sourceVerificationStatus || '待核验',
              }).map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}
            </dl>
          </div>
        </section> : <section aria-label="可关联标准规格">
          <PanelHead title="可关联规格" meta={`${eligible.length} 项`} />
          {!!eligible.length && <>
            <p className="standard-binding__secondary">仅展示通过身份校验且允许关联的规格；即使只有一项，也请核对后主动选择。</p>
            <div className="standard-binding__choices">
              {eligible.map(item => <label className="standard-binding__choice" key={item.specification.id}>
                <input type="radio" name="standard-specification" aria-label={`选择 ${item.specification.name} ${doseFormLabel(item.specification.doseForm, item.specification.doseFormName)} ${item.specification.specification}（${item.specification.id}）`}
                  checked={selected === item.specification.id} disabled={busy || !!query.error}
                  onChange={() => {setSelected(item.specification.id); setReason(''); setConfirmed(false)}} />
                <span><strong>{item.specification.name} · {doseFormLabel(item.specification.doseForm, item.specification.doseFormName)}</strong>
                  <span className="standard-binding__line">{item.specification.specification} · {item.specification.presentationUnit || '单位未定义'}
                    {item.specification.substanceQualifier && ` · ${item.specification.substanceQualifier}`}</span>
                  {doseFormVariantNote(value.medication, item.specification) && <span className="standard-binding__qualification standard-binding__line">{doseFormVariantNote(value.medication, item.specification)}</span>}
                  <span className="standard-binding__secondary standard-binding__line">{item.boundMedicationId
                    ? '已有药品档案使用此规格；身份一致时可共享标准身份，不会合并药品档案。' : '身份字段一致，待核对来源。'}</span>
                </span>
              </label>)}
            </div>
          </>}
          {!value.candidates.length && <p>没有明确匹配的标准身份线索。请先核对名称、历史编码及目录覆盖范围，不能仅凭相同规格关联另一药品。</p>}
          {!eligible.length && !!excluded.length && <p>暂无可关联规格。请展开排除原因，核对药品档案或补全标准目录后刷新。</p>}
          {!eligible.length && !!excluded.length && <div className="standard-binding__resolution" aria-label="无匹配规格的处理建议">
            <PanelHead title="建议处理" meta="当前无法建立关联" />
            {needsMedicationCorrection && <div className="standard-binding__resolution-item">
              <strong>先修正本院药品档案</strong>
              <p>当前剂型为“{doseFormLabel(value.medication.doseForm)}”，属于未规范的内部编码。请在药品档案中选择实际中文剂型，并确认规格、制剂单位后重新核查。</p>
              <Button variant="secondary" onClick={onClose}>返回修正药品档案</Button>
            </div>}
            {!needsMedicationCorrection && hasDoseFormMismatch && <div className="standard-binding__resolution-item">
              <strong>核对候选剂型差异</strong>
              <p>当前药品剂型“{doseFormLabel(value.medication.doseForm)}”已规范，但检索到的候选规格剂型不同。请查看排除项确认是否应补充正确规格，或修正药品档案中的实际剂型。</p>
            </div>}
            {needsCatalogReview && <div className="standard-binding__resolution-item">
              <strong>标准目录需要补充或拆分</strong>
              <p>候选来源包含未拆分的剂型段落或不完整规格，不能直接作为标准身份。请先在标准参考目录补齐标准规格，再重新核查。</p>
              {onOpenCatalog && <Button variant="secondary" onClick={() => {onClose(); onOpenCatalog()}}>前往标准参考目录</Button>}
            </div>}
            {!needsMedicationCorrection && !hasDoseFormMismatch && !needsCatalogReview && <div className="standard-binding__resolution-item">
              <strong>暂缓关联</strong>
              <p>当前候选均未通过身份核对。请根据排除项补充名称、剂型、规格或来源依据，确认后再建立关联。</p>
            </div>}
          </div>}
          {!!unavailable.length && <div className="standard-binding__notice">
            <strong>身份一致但当前不可操作 · {unavailable.length} 项</strong>
            <p>{cannotBindReason}</p>
            <ul>{unavailable.map(item => <li key={item.specification.id}>{item.specification.name} · {doseFormLabel(item.specification.doseForm, item.specification.doseFormName)} · {item.specification.specification}</li>)}</ul>
          </div>}
        </section>}
        {!linked && !!excluded.length && <section aria-label="排除项及原因">
          <Button variant="secondary" aria-expanded={showExcluded} aria-controls="standard-binding-excluded"
            onClick={() => setShowExcluded(current => !current)}>{showExcluded ? '收起' : '查看'}排除项及原因（{excluded.length}）</Button>
          {showExcluded && <div id="standard-binding-excluded" className="standard-binding__details">
            <p className="standard-binding__secondary">这些结果仅因名称、别名或历史编码被检索到，未通过身份校验。保留在此帮助排查差异，不参与本次选择。</p>
            <div className="standard-binding__excluded">{excluded.map(item => <div className="standard-binding__excluded-item" key={item.specification.id}>
              <strong>{item.specification.name}</strong>
              <div className="standard-binding__comparison"><span>标准剂型</span><b>{doseFormLabel(item.specification.doseForm, item.specification.doseFormName)}</b><span>规格 / 单位</span><b>{item.specification.specification || '未记录'} / {item.specification.presentationUnit || '未定义'}</b></div>
              <span className="standard-binding__line">{differences(item.issues, item, value.medication)}</span>
            </div>)}</div>
          </div>}
        </section>}
        {!linked && !!eligible.length && <section aria-label="核对来源并确认关联">
          <PanelHead title="核对来源并确认" meta={candidate ? '已选择 1 项' : '请先选择规格'} />
          {candidate && <div className="standard-binding__notice">
            <strong>{candidate.specification.name} · {doseFormLabel(candidate.specification.doseForm, candidate.specification.doseFormName)} · {candidate.specification.specification}</strong>
            <p className="standard-binding__source">{candidate.specification.sourceBlock || '请在标准参考目录核对来源原文。'}</p>
            <span className="standard-binding__secondary">目录版本：{value.identity.catalogVersion}。身份匹配不代表剂量等用药知识已审核。</span>
          </div>}
          <FormField label="核对依据与关联理由" required>
            <textarea rows={2} maxLength={1000} value={reason} disabled={!candidate || busy || !!query.error}
              placeholder="填写已核对的来源及身份依据" onChange={event => {setReason(event.target.value); setConfirmed(false)}} />
          </FormField>
          <label className="standard-binding__confirm"><input type="checkbox" checked={confirmed}
            disabled={!candidate || !reason.trim() || busy || !!query.error} onChange={event => setConfirmed(event.target.checked)} />
            已核对药品身份及来源，确认所选标准规格对应此药品
          </label>
        </section>}
        {!!value.bindings.length && <section aria-label="已保存的标准关联">
          <p>已有标准关系如需变更，请提交修订并由另一位管理人员复核。</p>
          <Button variant="secondary" disabled={busy} onClick={() => setRevisionOpen(true)}>标准关联修订与复核</Button>
          <details className="standard-binding__details"><summary>查看已保存的关联与操作记录</summary>
            {value.bindings.map((binding, i) => <p key={i}>{binding.specificationId} · {binding.catalogId} · {binding.catalogVersion}</p>)}
            {value.audits.map(audit => <p key={audit.id}>{audit.snapshot.actor} · {formatTime(audit.recordedAt)} · {audit.snapshot.reason}</p>)}
          </details>
        </section>}
      </>}
      {mutation.isSuccess && <p role="status">标准关联已建立，药品原有业务属性已保留，建设清单已刷新。</p>}
      {(query.error || mutation.error) && <Alert duration={null}>{errorMessage(query.error || mutation.error)}</Alert>}
    </div>
  </Dialog>
}
