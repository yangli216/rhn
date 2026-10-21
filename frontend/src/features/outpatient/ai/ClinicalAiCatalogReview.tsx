import { useEffect, useRef, useState } from 'react'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiTreatmentMatch, ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import type { MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import { Button, ClinicalResourceSearch, Dialog, FormField, IconButton, Select, StatusBadge, type ClinicalResourceOption, type ClinicalResource } from '../../../shared/ui'
import { clinicalAiTreatmentMatchPresentation } from '../../../shared/presentation'
import { resolveDispensableOptions } from '../orders/dispensableOptions'
import { formatSpecimenType, formatExaminationType } from '../orders/orderPresentation'

/** Pending identities never become selectable orders before explicit physician confirmation. */
export function ClinicalAiCatalogReview({ matches, api, encounterId, organizationId, disabled, onResolved, orderOf, layout = 'order-row', showIntro = true }: {
  layout?: 'order-row' | 'compact'
  /** Flex order of each row by source match key, shared with the confirmed rows so a resolved row keeps its slot. */
  orderOf?: (key: string) => number
  /** False when the host already explains the dashed pending rows (e.g. in its recommendation header). */
  showIntro?: boolean
  matches: ClinicalAiTreatmentMatch[]
  api: RhnApi
  encounterId: string
  organizationId?: string
  disabled: boolean
  onResolved: (keys: string[], items: ClinicalAiTreatmentRecommendation[]) => void
}) {
  const [retries, setRetries] = useState<Record<string, ClinicalAiTreatmentMatch[]>>({})
  const [choices, setChoices] = useState<Record<string, ClinicalAiTreatmentRecommendation | null>>({})
  const [resource, setResource] = useState<ClinicalResourceOption>()
  const [products, setProducts] = useState<Array<ClinicalAiTreatmentRecommendation & { selectionLabel: string }>>([])
  const [searchType, setSearchType] = useState('LABORATORY')
  const [busy, setBusy] = useState(false)
  const [editingKey, setEditingKey] = useState<string>()
  const [error, setError] = useState('')
  const [checkingKey, setCheckingKey] = useState<string>()
  const [rowError, setRowError] = useState<{ key: string; message: string }>()
  const epoch = useRef(0)
  useEffect(() => {
    epoch.current += 1
    setRetries({}); setChoices({}); setResource(undefined); setProducts([]); setEditingKey(undefined); setError(''); setRowError(undefined); setCheckingKey(undefined); setBusy(false)
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
  const chosenCandidate = (match: ClinicalAiTreatmentMatch) => choices[match.key] !== undefined
    ? choices[match.key] ?? undefined : defaultCandidate(match)
  const candidate = active ? chosenCandidate(active) : undefined
  const selectResource = (option?: ClinicalResourceOption<ClinicalResource>) => {
    if (!active) return
    setResource(option); setProducts([]); setChoices(previous => ({ ...previous, [active.key]: null })); setError('')
    if (!option?.raw) return
    if ('sdServiceType' in option.raw) {
      const item = option.raw as ServiceCatalogItem
      const type = item.sdServiceType
      if (type !== 'LABORATORY' && type !== 'EXAMINATION') return
      const spec = formatSpecimenType(item.specimenType) || formatExaminationType(item.examinationType)
      setChoices(previous => ({ ...previous, [active.key]: { type, catalogItemId: item.id,
        code: item.code, name: item.name, specification: spec || undefined } }))
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
  /** Shared by the dialog's "确认匹配" and the row checkbox: validates the chosen identities, resolves only on success. */
  const submit = async (sourceKey: string): Promise<string | undefined> => {
    if (disabled || busy) return undefined
    const requestEpoch = epoch.current
    const group = rows.filter(match => match.sourceKey === sourceKey)
    const selected = group.map(chosenCandidate)
    if (selected.some(item => !item)) return '请为拆分后的每个项目选择院内目录。'
    setBusy(true)
    try {
      const checked = await api.clinicalAi.resolveTreatments(encounterId, selected.map((item, index) => ({ type: item!.type,
        name: item!.name, specification: item!.specification, catalogItemId: item!.catalogItemId, medicationId: item!.medicationId, rationale: group[index].intent.rationale })))
      if (epoch.current !== requestEpoch) return undefined
      if (checked.length !== selected.length || checked.some(match => match.status !== 'MATCHED' || match.candidates.length !== 1)
        || checked.some((match, index) => match.candidates[0].catalogItemId !== selected[index]?.catalogItemId
          || match.candidates[0].type !== selected[index]?.type)) {
        return checked.find(match => match.status !== 'MATCHED')?.reason || '所选项目已变化，请重新选择院内项目。'
      }
      onResolved([sourceKey], checked.map((match, index) => ({ ...match.candidates[0], aiOriginalName: group[index].intent.name,
        // Re-checking sends no AI usage, so carry over the usage mapped onto the chosen candidate (same catalog item).
        usageSuggestion: match.candidates[0].usageSuggestion ?? selected[index]?.usageSuggestion,
        purpose: match.candidates[0].purpose ?? selected[index]?.purpose })))
      return undefined
    } catch (err) { return epoch.current === requestEpoch ? (err instanceof Error ? err.message : '所选目录核对失败，请重试。') : undefined }
    finally { if (epoch.current === requestEpoch) setBusy(false) }
  }
  const confirm = async () => {
    if (!active || !candidate || disabled || busy) return
    setError('')
    const failure = await submit(active.sourceKey)
    if (failure) setError(failure)
    else if (!disabled) close()
  }
  /** Ticking a row with a recommended match is the physician's confirmation of that match. */
  const confirmByCheckbox = async (match: typeof rows[number]) => {
    setRowError(undefined); setCheckingKey(match.key)
    const failure = await submit(match.sourceKey)
    setCheckingKey(undefined)
    if (failure) setRowError({ key: match.key, message: failure })
  }
  if (!matches.length) return null
  return <div className={`doctor-ai-catalog-review${layout === 'compact' ? ' is-compact' : ''}`} aria-label="AI 医嘱目录待核对">
    {showIntro && <div className="doctor-ai-catalog-review__intro"><small>{CATALOG_PENDING_HINT}</small></div>}
    {rows.map(match => {
      const status = clinicalAiTreatmentMatchPresentation(match.status)
      const preview = chosenCandidate(match)
      const selectable = rows.filter(value => value.sourceKey === match.sourceKey).every(value => chosenCandidate(value))
      return <div key={match.key} className="doctor-ai-treatment-item" style={orderOf ? { order: orderOf(match.sourceKey) } : undefined}>
        <div className="doctor-unified-order-row is-ai-suggestion is-catalog-pending" role="row" aria-label={`${match.intent.name} · ${status.label}`}>
          <span className="doctor-unified-cell-type"><label className="doctor-ai-order-select">
            <input type="checkbox" aria-label={`选择 ${match.intent.name}`} checked={checkingKey === match.key}
              disabled={disabled || busy || !selectable} title={selectable ? '勾选即确认推荐匹配' : '请点击绑定图标核对院内目录'}
              onChange={() => void confirmByCheckbox(match)} />
            <span className="doctor-ai-pending-badge">{match.intent.type === 'MEDICATION' ? '药品' : match.intent.type === 'LABORATORY' ? '检验' : '检查'}</span>
          </label></span>
          <span className="doctor-unified-cell-name"><span className="doctor-ai-catalog-review__name">
            <strong>{preview?.name ?? match.intent.name}</strong><IconButton icon="link" className="doctor-ai-catalog-review__match"
              disabled={disabled} label={`绑定院内目录 ${match.intent.name}`} onClick={() => open(match)} />
          </span><CatalogRowMeta match={match} preview={preview} />
          </span>
          <span className="doctor-unified-cell-directions" title={match.reason}><span className="doctor-ai-catalog-review__reason">{match.reason}</span></span>
          <span className="doctor-unified-cell-qty">—</span><span className="doctor-unified-cell-dept">—</span>
          <span className="doctor-unified-cell-instruction">—</span><span className="doctor-unified-cell-price">—</span>
          <span className="doctor-unified-cell-status"><StatusBadge tone={status.tone}>{status.shortLabel}</StatusBadge></span>
          <span className="doctor-unified-cell-actions">—</span>
        </div>
        {rowError?.key === match.key && <small role="alert" className="doctor-ai-catalog-review__meta">{rowError.message}</small>}
      </div>
    })}
    {active && !disabled && <Dialog title={`匹配院内项目 · ${active.intent.name}`} presentation="panel" className="doctor-ai-catalog-panel"
      onClose={close} closeOnBackdrop={false} enterNavigation={false} footer={<>
        <Button size="sm" variant="text" disabled={busy} onClick={() => void retry()}>重新核查</Button>
        <Button size="sm" onClick={close}>取消</Button>
        <Button size="sm" variant="primary" disabled={disabled || busy || !candidate} onClick={() => void confirm()}>{busy ? '核对中…' : '确认匹配'}</Button>
      </>}>
      <div className="doctor-ai-catalog-panel__body">
        <div><strong>AI 原建议：{active.intent.name}</strong>{active.intent.rationale && <p>推荐依据：{active.intent.rationale}</p>}<p>{active.reason}</p><DecisionReview review={active.decisionReview} detailed /></div>
        {active.candidates.length > 0 && <FormField label="已有院内候选">
          <Select aria-label={`匹配 ${active.intent.name}`} disabled={busy} placeholder="请选择院内项目"
            value={candidate ? `${candidate.type}:${candidate.catalogItemId}` : ''}
            options={active.candidates.map(item => ({ value: `${item.type}:${item.catalogItemId}`, label: [item.name, item.specification].filter(Boolean).join(' · ') }))}
            onChange={value => { setResource(undefined); setProducts([]); setChoices(previous => ({ ...previous,
              [active.key]: active.candidates.find(item => `${item.type}:${item.catalogItemId}` === value) ?? null })) }} />
        </FormField>}
        <FormField label="检索类型"><Select aria-label="匹配检索类型" value={searchType} disabled={busy} clearable={false} searchable={false}
          options={[{ value: 'MEDICATION', label: '药品' }, { value: 'LABORATORY', label: '检验' }, { value: 'EXAMINATION', label: '检查' }]}
          onChange={value => { setSearchType(value); setResource(undefined); setProducts([]); setChoices(previous => ({ ...previous, [active.key]: null })) }} /></FormField>
        <FormField label="院内目录检索（与医嘱开立相同）"><ClinicalResourceSearch key={searchType} api={api}
          organizationId={organizationId} encounterId={encounterId} resource={searchType === 'MEDICATION' ? 'medication' : 'service'}
          aria-label={`检索 ${active.intent.name}`} disabled={busy} value={resource} openOnFocus={false}
          filterResult={item => searchType === 'MEDICATION' ? !('sdMedicationType' in item) || item.sdMedicationType !== 'HERBAL'
            : 'sdServiceType' in item && item.sdServiceType === searchType}
          placeholder="搜索名称、编码或拼音" onChange={selectResource} /></FormField>
        {products.length > 1 && <FormField label="院内药品产品"><Select aria-label="选择院内药品产品" value={candidate?.catalogItemId ?? ''} disabled={busy}
          options={products.map(item => ({ value: item.catalogItemId, label: item.selectionLabel }))}
          onChange={id => setChoices(previous => ({ ...previous, [active.key]: products.find(item => item.catalogItemId === id) ?? null }))} /></FormField>}
        {candidate && <div><strong>所选院内项目：{candidate.name}</strong><small>{candidate.specification}</small></div>}
        {error && <div role="alert">{error}</div>}
      </div>
    </Dialog>}
  </div>
}

/** Preselect only a Jev candidate that still belongs to this current catalog result. */
function defaultCandidate(match: ClinicalAiTreatmentMatch) {
  if (match.status === 'MATCHED') return match.candidates[0]
  const review = match.decisionReview
  if (review?.status !== 'COMPLETED' || typeof review.confidence !== 'number' || !Number.isFinite(review.confidence)
    || review.confidence < 0 || review.confidence > 1 || !review.suggestedItem) return undefined
  return match.candidates.find(item => item.type === review.suggestedItem?.type
    && item.catalogItemId === review.suggestedItem.catalogItemId)
}

/** Shown in place of the intro when the host header carries it, so the wording stays in one place. */
export const CATALOG_PENDING_HINT = '有推荐匹配的项目可直接勾选确认；其余请点击绑定图标核对院内目录'

/**
 * One summary line under the name. It omits what the row already shows: the AI name when it equals the
 * preselected item, and "pending catalog" (the dashed row and status column say so).
 */
function CatalogRowMeta({ match, preview }: { match: ClinicalAiTreatmentMatch; preview?: ClinicalAiTreatmentRecommendation }) {
  const review = match.decisionReview
  const percent = (value: number) => `${Math.round(value * 100)}%`
  const completed = review?.status === 'COMPLETED' && typeof review.confidence === 'number'
  // Without a completed Jev judgment the reason column and status already explain the row; don't repeat it here.
  const decision = !completed ? ''
      : review.choice === 'NONE' ? '未确认等价项，需人工核对'
        // Provider confidence is the concentration of Jev's whole answer (incl. NONE), not the preselected item's probability.
        : preview && review.suggestedItem ? `Jev 判断集中度 ${percent(review.confidence!)}${typeof review.threshold === 'number'
          && review.confidence! < review.threshold ? '，低于阈值需核对' : ''}`
          : '无唯一可预选候选'
  const parts = [
    preview && preview.name !== match.intent.name ? `AI 建议：${match.intent.name}` : '',
    match.intent.specification ? `建议规格：${match.intent.specification}` : '',
    decision,
  ].filter(Boolean)
  const title = completed ? ['集中度表示 Jev 在各候选及“无等价项”之间判断的集中程度，不是名称相似度或临床正确率',
    typeof review!.threshold === 'number' ? `自动采用阈值 ${percent(review!.threshold)}` : '', review!.detail]
    .filter(Boolean).join('；') : undefined
  if (!parts.length) return null
  return <small className="doctor-ai-catalog-review__meta" title={title}>{parts.join(' · ')}</small>
}

function DecisionReview({ review, detailed = false }: { review?: ClinicalAiTreatmentMatch['decisionReview']; detailed?: boolean }) {
  if (!review) return <small>Jev 待核查</small>
  if (review.status !== 'COMPLETED' || typeof review.confidence !== 'number') return <small>{review.detail}</small>
  const noEquivalent = review.choice === 'NONE'
  return <small title={review.detail}>Jev 目录判断置信度 {(review.confidence * 100).toFixed(1)}%
    {noEquivalent && <> · 未确认等价项</>}
    {detailed && <> · {review.suggestedItem ? `最高概率院内候选：${review.suggestedItem.name}` : '无唯一可预选候选'}
      {typeof review.threshold === 'number' && <> · 当前阈值 {(review.threshold * 100).toFixed(0)}%</>}
      {typeof review.threshold === 'number' && review.confidence < review.threshold && <> · 低于阈值，需人工核对</>}
      <br />{review.detail}</>}</small>
}
