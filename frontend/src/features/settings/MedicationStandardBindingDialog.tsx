import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, LoadingState, TableShell } from '../../shared/ui'
import './medication-standard-binding.css'
import { MedicationStandardRevisionDialog } from './MedicationStandardRevisionDialog'

const statuses: Record<string, string> = {LINKED: '关联一致', UNMAPPED: '未关联', AMBIGUOUS: '关联冲突', STALE: '关联版本不可用', MISMATCH: '信息不一致'}
const differenceLabels: Record<string, string> = {
  STANDARD_SPECIFICATION_INCOMPLETE: '标准规格不完整，须先核对原文',
  STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW: '标准原文包含未分开的剂型段落',
  STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW: '成分片段不能单独作为完整规格',

  STANDARD_REFERENCE_TYPE_MISMATCH: '药品类型不一致', STANDARD_REFERENCE_FORM_MISMATCH: '剂型不一致',
  STANDARD_REFERENCE_SPEC_MISMATCH: '规格文字不一致', STANDARD_REFERENCE_UNIT_MISMATCH: '制剂单位不一致',
  STANDARD_REFERENCE_STRENGTH_MISMATCH: '已有含量与标准不一致',
}
function differences(issues: string[]) {
  const specific = issues.filter(issue => issue !== 'STANDARD_REFERENCE_IDENTITY_MISMATCH')
  return specific.length ? specific.map(issue => differenceLabels[issue] ?? '需核对身份字段').join('、') : '类型、剂型、规格或单位不一致'
}
const medicationTypes: Record<string, string> = {WESTERN: '西药', CHINESE_PATENT: '中成药', HERBAL: '中药饮片', VACCINE: '疫苗'}
export function MedicationStandardBindingDialog({api, medicationId, onClose}: {api: RhnApi; medicationId: string; onClose: () => void}) {
  const client = useQueryClient()
  const key = ['medication-standard-binding', medicationId]
  const query = useQuery({queryKey: key, queryFn: () => api.masterData.medicationStandardBindingPreview(medicationId)})
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const value = query.data
  const token = value ? JSON.stringify([value.medication.revision, value.identity, value.reference.status]) : ''
  useEffect(() => {setSelected(''); setReason(''); setConfirmed(false)}, [token])
  const candidate = value?.candidates.find(item => item.specification.id === selected)
  const mutation = useMutation({mutationFn: async () => {
    if (!value || !candidate?.canBind) throw new Error('请重新核对可关联的标准规格')
    return api.masterData.bindMedicationStandard(medicationId, {expectedRevision: value.medication.revision, identity: value.identity,
      specificationId: selected, reason, confirmedIdentity: confirmed})
  }, onSuccess: async data => {
    client.setQueryData(key, data)
    await Promise.all(['medication-standard-readiness', 'master-data-medications', 'master-data-standard-setup']
      .map(prefix => client.invalidateQueries({queryKey: [prefix]})))
  }})
  if (revisionOpen) return <MedicationStandardRevisionDialog api={api} medicationId={medicationId} onClose={() => { setRevisionOpen(false); void query.refetch() }} />
  return <Dialog title="核对药品标准关联" size="xwide" onClose={onClose} enterNavigation={false}
    description="按药品档案逐一核对候选规格。关联操作保留已有药品、产品、包装及用法属性。">
    {query.isPending ? <LoadingState label="正在查找标准身份线索…" /> : value && <>
      <Alert tone="info">候选来自名称、别名或历史编码的明确匹配。请结合原文确认药品身份；剂型、规格、制剂单位及已有含量必须与标准一致。</Alert>
      <div className="standard-binding__workspace">
        <section aria-label="现有药品档案"><h3>{value.medication.name}</h3><p>{value.medication.code} · {statuses[value.reference.status]}</p>
          <dl>{Object.entries({药品类型: medicationTypes[value.medication.medicationType] ?? value.medication.medicationType, 剂型编码: value.medication.doseForm, 规格: value.medication.preparationSpec, 制剂单位: value.medication.presentationUnit,
            已有含量: value.medication.strengthValue != null ? `${value.medication.strengthValue} ${value.medication.strengthUnit}` : '未记录'}).map(([label, text]) =>
            <div key={label}><dt>{label}</dt><dd>{text || '未记录'}</dd></div>)}</dl>
          {value.bindings.map((binding, i) => <article key={i}><strong>已保存的标准关联</strong><p>{binding.specificationId}</p>
            <small>{binding.catalogId} · {binding.catalogVersion}</small></article>)}
          {value.reference.status !== 'UNMAPPED' && <Alert tone="info">已有关系通过修订流程处理：提交新目标与依据，由另一位管理人员复核后应用。</Alert>}
          {!!value.bindings.length && <Button variant="secondary" onClick={() => setRevisionOpen(true)}>标准关联修订与复核</Button>}
          {value.audits.length > 0 && <section aria-label="关联操作记录"><h4>关联操作记录</h4>{value.audits.map(audit => <article key={audit.id}>
            <strong>{audit.snapshot.actor} · {new Date(audit.recordedAt).toLocaleString()}</strong><p>{audit.snapshot.reason}</p>
            <small>{audit.snapshot.after.specificationId}</small></article>)}</section>}
        </section>
        <section aria-label="候选标准规格"><h3>候选标准规格 · {value.candidates.length}</h3>
          <TableShell><table><thead><tr><th>选择</th><th>药品 / 剂型</th><th>规格 / 单位</th><th>核对结果</th></tr></thead>
            <tbody>{value.candidates.map(item => <tr key={item.specification.id}>
              <td><input type="radio" name="standard-specification" aria-label={`选择 ${item.specification.id}`} checked={selected === item.specification.id}
                disabled={!item.canBind || mutation.isPending} onChange={() => {setSelected(item.specification.id); setConfirmed(false)}} /></td>
              <td>{item.specification.name}<small>{medicationTypes[item.specification.medicationType] ?? item.specification.medicationType} · {item.specification.doseFormName ?? item.specification.doseForm}</small></td>
              <td>{item.specification.specification}<small>{item.specification.presentationUnit || '单位未定义'}</small>{item.specification.substanceQualifier && <small>物质限定：{item.specification.substanceQualifier}</small>}</td>
              <td>{item.issues.length ? differences(item.issues)
                : item.boundMedicationId ? `已关联药品 ${item.boundMedicationId}` : item.canBind ? '身份字段一致，可核对关联' : '当前状态或权限不允许关联'}
                <small>{item.specification.id}</small></td>
            </tr>)}</tbody></table></TableShell>
          {!value.candidates.length && <Alert tone="info">没有明确匹配的标准身份线索。请先核对名称、历史编码及目录覆盖范围，不能仅凭相同规格关联另一药品。</Alert>}
          {candidate && <article><h4>候选依据</h4><p>{candidate.specification.sourceBlock || '请在标准参考目录核对来源原文。'}</p>
            <small>目录版本：{value.identity.catalogVersion}。身份匹配不代表已有审核通过的剂量上限。</small></article>}
          {value.candidates.some(item => item.canBind) && <>
            <FormField label="核对依据与关联理由" required><textarea rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></FormField>
            <label className="standard-binding__confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />已核对药品身份及来源，确认所选标准规格对应此药品</label>
            <Button variant="primary" onClick={() => mutation.mutate()} disabled={!candidate?.canBind || !reason.trim() || !confirmed || mutation.isPending || query.isFetching || !!query.error}>建立标准关联</Button>
          </>}
          <Button variant="secondary" onClick={() => {void query.refetch()}} disabled={query.isFetching || mutation.isPending}>刷新核对结果</Button>
        </section>
      </div>
    </>}
    {mutation.isSuccess && <Alert tone="success">标准关联已建立，药品原有业务属性已保留，建设清单已刷新。</Alert>}
    {(query.error || mutation.error) && <Alert>{errorMessage(query.error || mutation.error)}</Alert>}
  </Dialog>
}
