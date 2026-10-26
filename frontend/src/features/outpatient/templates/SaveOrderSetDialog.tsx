import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import './outpatient-plan-templates.css'
import type { OutpatientPlanTemplate, OutpatientPlanTemplateScope } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Select, StatusBadge } from '../../../shared/ui'
import { orderSetCandidateSources, orderSetSourceLabel, selectableCandidates, type OrderSetCandidate } from './orderSetCandidates'
import { saveMaintainedPlan } from './maintainedTemplateSave'
import { draftsToOrderSetInput, rethrowTemplateSaveError, templateScopeLabel } from './orderSetTemplate'
import { errorMessage } from '../../../shared/api/httpClient'

const serviceTypeLabel = (value?: string) => value === 'LABORATORY' ? '检验' : value === 'EXAMINATION' ? '检查'
  : value === 'TREATMENT' ? '治疗' : '诊疗'

/**
 * 医嘱区“存为组套”：按来源分组列出待确认草稿、已保存的医嘱草稿、本次已开立医嘱（默认全选，可取消），保存为 ORDER_SET。
 * 候选汇总与去重在 orderSetCandidates.ts，草稿到入参的转换在 orderSetTemplate.ts，校验与回执核对复用 saveMaintainedPlan。
 */
export function SaveOrderSetDialog({ api, candidates, onClose, onSaved }: {
  api: RhnApi
  candidates: OrderSetCandidate[]
  onClose: () => void
  onSaved: (template: OutpatientPlanTemplate) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<OutpatientPlanTemplateScope>('PERSONAL')
  const selectable = selectableCandidates(candidates)
  const [checked, setChecked] = useState(() => new Set(selectable.map(item => item.key)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const total = selectable.length
  const selected = selectable.filter(item => checked.has(item.key)).length
  const hasGrouped = selectable.some(item => item.grouped)
  const toggle = (key: string) => setChecked(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleAll = () => setChecked(new Set(selected === total ? [] : selectable.map(item => item.key)))

  async function save() {
    if (saving || !name.trim() || !selected) return
    setSaving(true); setError('')
    try {
      const picked = selectable.filter(item => checked.has(item.key))
      const input = draftsToOrderSetInput(
        picked.flatMap(item => item.kind === 'medication' ? [item.medication] : []),
        picked.flatMap(item => item.kind === 'service' ? [item.service] : []), { name, scopeType: scope })
      const saved = await saveMaintainedPlan(api, input).catch(rethrowTemplateSaveError)
      // 抽屉与检索都读取模板列表；保存后立即作废，使新组套马上可见。
      await queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
      if (mounted.current) onSaved(saved)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : errorMessage(cause))
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  return <Dialog title="存为医嘱组套" eyebrow="本次就诊医嘱" size="wide" closeOnBackdrop={false}
    description="勾选需要保存的药品和项目；组套只保存医嘱内容，不含诊断和病历，患者信息不会写入。"
    onClose={() => !saving && onClose()}
    footer={<>
      <Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
      <Button busy={saving} disabled={!name.trim() || !selected} onClick={() => void save()}>保存组套</Button>
    </>}>
    {error && <Alert>{error}</Alert>}
    <div inert={saving} className="save-order-set">
      <div className="ui-form-grid">
        <FormField label="组套名称" required><input value={name} maxLength={100} autoFocus
          onChange={(event) => setName(event.target.value)} placeholder="例如：血常规复查组套" /></FormField>
        <FormField label="使用范围" hint={scope === 'PERSONAL' ? undefined : '科室、全院范围保存后对相应范围内的医生可见'}>
          <Select value={scope} clearable={false} searchable={false}
            options={(['PERSONAL', 'DEPARTMENT', 'HOSPITAL'] as const).map(value => ({ value, label: templateScopeLabel(value) }))}
            onChange={(value) => setScope(value as OutpatientPlanTemplateScope)} />
        </FormField>
      </div>
      {hasGrouped && <Alert tone="warning">输液成组关系本期不保存，成组药品将按单行存入组套。</Alert>}
      <div className="save-order-set__rows" role="group" aria-label="待保存的医嘱">
        <label className="save-order-set__row">
          <input type="checkbox" aria-label="全选医嘱" checked={total > 0 && selected === total} disabled={saving || total === 0}
            ref={(element) => { if (element) element.indeterminate = selected > 0 && selected < total }}
            onChange={toggleAll} />
          <span />
          <strong>已选 {selected} / 共 {total} 项</strong>
          <span />
        </label>
        {orderSetCandidateSources.map(source => {
          const rows = candidates.filter(item => item.source === source)
          if (!rows.length) return null
          return <div key={source} role="group" aria-label={orderSetSourceLabel(source)} className="save-order-set__group">
            <strong className="save-order-set__group-title">{orderSetSourceLabel(source)}</strong>
            {rows.map(item => {
              const isMed = item.kind === 'medication'
              const label = isMed ? item.medication.medicationName : item.service.itemName
              const disabled = Boolean(item.disabledReason)
              return <label key={item.key} title={item.disabledReason}
                className={`save-order-set__row ${checked.has(item.key) && !disabled ? '' : 'is-unchecked'}`}>
                <input type="checkbox" aria-label={`选择${isMed ? '药品' : '项目'} ${label}`}
                  checked={!disabled && checked.has(item.key)} disabled={saving || disabled} onChange={() => toggle(item.key)} />
                {isMed ? <StatusBadge tone="info">药品</StatusBadge>
                  : <StatusBadge tone="neutral">{serviceTypeLabel(item.service.serviceType)}</StatusBadge>}
                <span><strong>{label}</strong>{isMed && item.medication.preparationSpec ? ` ${item.medication.preparationSpec}` : ''}
                  {disabled && <em className="save-order-set__meta">（{item.disabledReason}）</em>}</span>
                <span className="save-order-set__meta">{isMed ? `${item.medication.request.quantity} ${item.medication.request.quantityUnit ?? ''}`
                  : `${item.service.quantity} ${item.service.unitCode ?? ''}`}</span>
              </label>
            })}
          </div>
        })}
      </div>
    </div>
  </Dialog>
}
