import { useEffect, useRef, useState } from 'react'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiTreatmentMatch, ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import type { MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import { Button, ClinicalResourceSearch, Dialog, FormField, Select, StatusBadge, type ClinicalResourceOption, type ClinicalResource } from '../../../shared/ui'
import { clinicalAiTreatmentMatchPresentation } from '../../../shared/presentation'
import { resolveDispensableOptions } from '../orders/dispensableOptions'

/** Pending identities never become selectable orders before explicit physician confirmation. */
export function ClinicalAiCatalogReview({ matches, api, encounterId, organizationId, disabled, onResolved, layout = 'order-row' }: {
  layout?: 'order-row' | 'compact'
  matches: ClinicalAiTreatmentMatch[]
  api: RhnApi
  encounterId: string
  organizationId?: string
  disabled: boolean
  onResolved: (keys: string[], items: ClinicalAiTreatmentRecommendation[]) => void
}) {
  const [retries, setRetries] = useState<Record<string, ClinicalAiTreatmentMatch[]>>({})
  const [choices, setChoices] = useState<Record<string, ClinicalAiTreatmentRecommendation | undefined>>({})
  const [resource, setResource] = useState<ClinicalResourceOption>()
  const [products, setProducts] = useState<Array<ClinicalAiTreatmentRecommendation & { selectionLabel: string }>>([])
  const [searchType, setSearchType] = useState('LABORATORY')
  const [busy, setBusy] = useState(false)
  const [editingKey, setEditingKey] = useState<string>()
  const [error, setError] = useState('')
  const epoch = useRef(0)
  useEffect(() => {
    epoch.current += 1
    setRetries({}); setChoices({}); setResource(undefined); setProducts([]); setEditingKey(undefined); setError(''); setBusy(false)
    return () => { epoch.current += 1 }
  }, [encounterId, organizationId, api])
  useEffect(() => { epoch.current += 1; setBusy(false); if (disabled) setEditingKey(undefined) }, [disabled])
  const rows = matches.flatMap(match => (retries[match.key] ?? [match]).map(value => ({ ...value, sourceKey: match.key })))
  const active = rows.find(match => match.key === editingKey)
  const close = () => { epoch.current += 1; setEditingKey(undefined); setBusy(false); setError('') }
  const open = (match: typeof rows[number]) => {
    epoch.current += 1
    setEditingKey(match.key); setError(''); setBusy(false); setResource(undefined); setProducts([])
    setSearchType(match.candidates[0]?.type ?? (['MEDICATION', 'LABORATORY', 'EXAMINATION'].includes(match.intent.type) ? match.intent.type : 'LABORATORY'))
  }
  const candidate = active ? choices[active.key] ?? (active.status === 'MATCHED' ? active.candidates[0] : undefined) : undefined
  const selectResource = (option?: ClinicalResourceOption<ClinicalResource>) => {
    if (!active) return
    setResource(option); setProducts([]); setChoices(previous => ({ ...previous, [active.key]: undefined })); setError('')
    if (!option?.raw) return
    if ('sdServiceType' in option.raw) {
      const item = option.raw as ServiceCatalogItem
      const type = item.sdServiceType
      if (type !== 'LABORATORY' && type !== 'EXAMINATION') return
      setChoices(previous => ({ ...previous, [active.key]: { type, catalogItemId: item.id,
        code: item.code, name: item.name, specification: item.specimenType || item.examinationType } }))
    } else if ('products' in option.raw) {
      const item = option.raw as MedicationKnowledge
      const available = [...new Map(resolveDispensableOptions(item, organizationId ?? '').map(value => [value.product.id,
        { type: 'MEDICATION' as const, catalogItemId: value.product.id, medicationId: item.id, code: item.code,
          name: item.name, specification: item.preparationSpec,
          selectionLabel: [value.product.name, value.product.manufacturerName, item.preparationSpec].filter(Boolean).join(' · ') }])).values()]
      setProducts(available)
      if (available.length === 1) setChoices(previous => ({ ...previous, [active.key]: available[0] }))
      if (!available.length) setError('所选药品暂无可发药产品或有效价格，请与普通医嘱目录配置核对。')
    }
  }
  const retry = async () => {
    if (!active || disabled || busy) return
    const requestEpoch = epoch.current, sourceKey = active.sourceKey
    setBusy(true); setError('')
    try {
      const result = await api.clinicalAi.resolveTreatments(encounterId, [matches.find(match => match.key === sourceKey)?.intent ?? active.intent])
      if (epoch.current !== requestEpoch) return
      setRetries(previous => ({ ...previous, [sourceKey]: result })); setChoices({})
      setEditingKey(result[0]?.key)
    } catch (err) { if (epoch.current === requestEpoch) setError(err instanceof Error ? err.message : '目录核查失败，请重试。') }
    finally { if (epoch.current === requestEpoch) setBusy(false) }
  }
  const confirm = async () => {
    if (!active || !candidate || disabled || busy) return
    const requestEpoch = epoch.current
    const group = rows.filter(match => match.sourceKey === active.sourceKey)
    const selected = group.map(match => choices[match.key] ?? (match.status === 'MATCHED' ? match.candidates[0] : undefined))
    if (selected.some(item => !item)) { setError('请为拆分后的每个项目选择院内目录。'); return }
    setBusy(true); setError('')
    try {
      const checked = await api.clinicalAi.resolveTreatments(encounterId, selected.map((item, index) => ({ type: item!.type,
        name: item!.name, specification: item!.specification, catalogItemId: item!.catalogItemId, medicationId: item!.medicationId, rationale: group[index].intent.rationale })))
      if (epoch.current !== requestEpoch) return
      if (checked.length !== selected.length || checked.some(match => match.status !== 'MATCHED' || match.candidates.length !== 1)
        || checked.some((match, index) => match.candidates[0].catalogItemId !== selected[index]?.catalogItemId
          || match.candidates[0].type !== selected[index]?.type)) {
        setError(checked.find(match => match.status !== 'MATCHED')?.reason || '所选项目已变化，请重新选择院内项目。'); return
      }
      onResolved([active.sourceKey], checked.map((match, index) => ({ ...match.candidates[0], aiOriginalName: group[index].intent.name })))
      close()
    } catch (err) { if (epoch.current === requestEpoch) setError(err instanceof Error ? err.message : '所选目录核对失败，请重试。') }
    finally { if (epoch.current === requestEpoch) setBusy(false) }
  }
  if (!matches.length) return null
  return <div className={`doctor-ai-catalog-review${layout === 'compact' ? ' is-compact' : ''}`} aria-label="AI 医嘱目录待核对">
    <div className="doctor-ai-catalog-review__intro"><small>虚线项目尚未完成院内目录核对，暂不可勾选；核对后可带入医嘱。</small></div>
    {rows.map(match => {
      const status = clinicalAiTreatmentMatchPresentation(match.status)
      return <div key={match.key} className="doctor-ai-treatment-item">
        <div className="doctor-unified-order-row is-ai-suggestion is-catalog-pending" role="row" aria-label={`${match.intent.name} · ${status.label}`}>
          <span className="doctor-unified-cell-type"><label className="doctor-ai-order-select">
            <input type="checkbox" aria-label={`选择 ${match.intent.name}`} checked={false} disabled />
            <span className="doctor-ai-pending-badge">{match.intent.type === 'MEDICATION' ? '药品' : match.intent.type === 'LABORATORY' ? '检验' : '检查'}</span>
          </label></span>
          <span className="doctor-unified-cell-name"><span className="doctor-ai-catalog-review__name">
            <strong>{match.intent.name}</strong><Button size="sm" variant="text" disabled={disabled}
              aria-label={`核对目录 ${match.intent.name}`} onClick={() => open(match)}>匹配</Button>
          </span><small>{match.intent.specification ? `建议规格：${match.intent.specification}` : '待核对院内目录'}</small>
            <DecisionReview review={match.decisionReview} />
          </span>
          <span className="doctor-unified-cell-directions" title={match.reason}><span className="doctor-ai-catalog-review__reason">{match.reason}</span></span>
          <span className="doctor-unified-cell-qty">—</span><span className="doctor-unified-cell-dept">—</span>
          <span className="doctor-unified-cell-instruction">—</span><span className="doctor-unified-cell-price">—</span>
          <span className="doctor-unified-cell-status"><StatusBadge tone={status.tone}>{status.shortLabel}</StatusBadge></span>
          <span className="doctor-unified-cell-actions">—</span>
        </div>
      </div>
    })}
    {active && !disabled && <Dialog title={`匹配院内项目 · ${active.intent.name}`} presentation="panel" className="doctor-ai-catalog-panel"
      onClose={close} closeOnBackdrop={false} enterNavigation={false} footer={<>
        <Button size="sm" variant="text" disabled={busy} onClick={() => void retry()}>重新核查</Button>
        <Button size="sm" onClick={close}>取消</Button>
        <Button size="sm" variant="primary" disabled={disabled || busy || !candidate} onClick={() => void confirm()}>{busy ? '核对中…' : '确认匹配'}</Button>
      </>}>
      <div className="doctor-ai-catalog-panel__body">
        <div><strong>AI 原建议：{active.intent.name}</strong><p>{active.reason}</p><DecisionReview review={active.decisionReview} detailed /></div>
        {active.candidates.length > 0 && <FormField label="已有院内候选">
          <Select aria-label={`匹配 ${active.intent.name}`} disabled={busy} placeholder="请选择院内项目"
            value={candidate ? `${candidate.type}:${candidate.catalogItemId}` : ''}
            options={active.candidates.map(item => ({ value: `${item.type}:${item.catalogItemId}`, label: [item.name, item.specification].filter(Boolean).join(' · ') }))}
            onChange={value => { setResource(undefined); setProducts([]); setChoices(previous => ({ ...previous,
              [active.key]: active.candidates.find(item => `${item.type}:${item.catalogItemId}` === value) })) }} />
        </FormField>}
        <FormField label="检索类型"><Select aria-label="匹配检索类型" value={searchType} disabled={busy} clearable={false} searchable={false}
          options={[{ value: 'MEDICATION', label: '药品' }, { value: 'LABORATORY', label: '检验' }, { value: 'EXAMINATION', label: '检查' }]}
          onChange={value => { setSearchType(value); setResource(undefined); setProducts([]); setChoices(previous => ({ ...previous, [active.key]: undefined })) }} /></FormField>
        <FormField label="院内目录检索（与医嘱开立相同）"><ClinicalResourceSearch key={searchType} api={api}
          organizationId={organizationId} encounterId={encounterId} resource={searchType === 'MEDICATION' ? 'medication' : 'service'}
          aria-label={`检索 ${active.intent.name}`} disabled={busy} value={resource} openOnFocus={false}
          filterResult={item => searchType === 'MEDICATION' ? !('sdMedicationType' in item) || item.sdMedicationType !== 'HERBAL'
            : 'sdServiceType' in item && item.sdServiceType === searchType}
          placeholder="搜索名称、编码或拼音" onChange={selectResource} /></FormField>
        {products.length > 1 && <FormField label="院内药品产品"><Select aria-label="选择院内药品产品" value={candidate?.catalogItemId ?? ''} disabled={busy}
          options={products.map(item => ({ value: item.catalogItemId, label: item.selectionLabel }))}
          onChange={id => setChoices(previous => ({ ...previous, [active.key]: products.find(item => item.catalogItemId === id) }))} /></FormField>}
        {candidate && <div><strong>所选院内项目：{candidate.name}</strong><small>{candidate.specification}</small></div>}
        {error && <div role="alert">{error}</div>}
      </div>
    </Dialog>}
  </div>
}

function DecisionReview({ review, detailed = false }: { review?: ClinicalAiTreatmentMatch['decisionReview']; detailed?: boolean }) {
  if (!review) return <small>Jev 待核查</small>
  if (review.status !== 'COMPLETED' || typeof review.confidence !== 'number') return <small>{review.detail}</small>
  return <small title={review.detail}>Jev 置信度 {(review.confidence * 100).toFixed(1)}%
    {!detailed && !review.suggestedItem && <> · 无等价候选</>}
    {detailed && <> · {review.suggestedItem ? `建议匹配：${review.suggestedItem.name}` : '无等价候选'}
      {typeof review.threshold === 'number' && <> · 当前阈值 {(review.threshold * 100).toFixed(0)}%</>}
      <br />{review.detail}</>}</small>
}
