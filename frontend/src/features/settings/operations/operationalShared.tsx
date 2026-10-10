import { knownChargeTotal } from "../diagnosticPreview";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ClinicalConfiguration, DiagnosticChargeLine, ExaminationAttachmentConfiguration, ItemGroup, SpecimenConfiguration, UnitDefinition } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button, DataTable as UiDataTable, Dialog, StatusBadge, TableShell } from "../../../shared/ui";

export type Area = 'group' | 'supply' | 'unit' | 'frequency'

export const today = () => new Date().toISOString().slice(0, 10)

export const activeStatus = [{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }]

export const dimensions = [
  ['COUNT', '计数'], ['MASS', '质量'], ['VOLUME', '体积'], ['TIME', '时间'], ['LENGTH', '长度'],
  ['AREA', '面积'], ['ACTIVITY', '活度'], ['TEMPERATURE', '温度'], ['OTHER', '其它'],
].map(([value, label]) => ({ value, label }))

export const groupTypeLabels: Record<ItemGroup['groupType'], string> = {
  LIS: '检验组套', PACS: '检查组套', ORDER_SET: '常用组合项目', PACKAGE: '项目包',
}

export function requireOperationalRows<T>(rows: T[], name: string): T[] {
  if (!Array.isArray(rows)) throw new Error(`${name}返回的数据格式不正确，请重新加载。`)
  return rows
}

export function ListSection({ title, copy, action, children }: { title: string; copy: string; action: ReactNode; children: ReactNode }) {
  return <section className="operational-master-data__body"><div className="operational-master-data__toolbar">
    <div><h3>{title}</h3><p>{copy}</p></div>{action}</div>{children}</section>
}

export function State({ value }: { value: string }) { return <StatusBadge tone={value === 'ACTIVE' ? 'success' : 'neutral'}>{value === 'ACTIVE' ? '启用' : '停用'}</StatusBadge> }

export function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <TableShell scrollClassName="master-data-table-wrap"><UiDataTable className="master-data-table">
    <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
  </UiDataTable></TableShell>
}

export function ClinicalDataTable({ headers, rows, colWidths }: { headers: string[]; rows: ReactNode[][]; colWidths?: string[] }) {
  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <UiDataTable className="clinical-table">
        {colWidths && (
          <colgroup>
            {colWidths.map((w, idx) => <col key={idx} style={{ width: w }} />)}
          </colgroup>
        )}
        <thead>
          <tr>
            {headers.map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, i) => <td key={i}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </UiDataTable>
    </div>
  )
}

export function tubeDotColor(containerName: string, groupCode: string) {
  const text = `${containerName} ${groupCode}`.toUpperCase()
  if (text.includes('促凝') || text.includes('BIOCHEM') || text.includes('黄')) return 'var(--color-specimen-cap-yellow)'
  if (text.includes('EDTA') || text.includes('HEMATOLOGY') || text.includes('紫')) return 'var(--color-specimen-cap-purple)'
  if (text.includes('枸橼酸') || text.includes('COAGULATION') || text.includes('蓝')) return 'var(--color-specimen-cap-blue)'
  if (text.includes('氟化钠') || text.includes('GLUCOSE') || text.includes('灰')) return 'var(--color-specimen-cap-gray)'
  if (text.includes('干燥') || text.includes('IMMUNO') || text.includes('红')) return 'var(--color-specimen-cap-red)'
  return 'var(--color-specimen-cap-default)'
}

export function sitePricingDetail(ex: NonNullable<ClinicalConfiguration['examination']>) {
  if (ex.sitePricingMode === 'SINGLE') return '不论选择多少个部位，主项目仅收 1 次基准费用'
  if (ex.sitePricingMode === 'PER_SITE') return '按选择的部位总数量，每个部位全额（100%）收取主项费用'
  if (ex.sitePricingMode === 'BASE_PLUS_FIXED') return `超出基础部位后，每增加 1 个部位固定加收 ¥${ex.additionalSitePrice ?? '未配置'}`
  if (ex.sitePricingMode === 'BASE_PLUS_ITEM') return `超出基础部位后，每增加 1 个部位加收项目【${ex.additionalSiteItemName || `项目 ${ex.additionalSiteItemId ?? '未配置'}`}】 × ${ex.additionalSiteQuantity ?? '未配置'}`
  return '未设定多部位计价策略'
}

export function ChargeLines({ lines }: { lines: DiagnosticChargeLine[] }) {
  if (!lines.length) return <p className="rule-simulator__empty">本次试算未返回收费明细。</p>
  const totalAmount = knownChargeTotal(lines)
  return (
    <div className="sandbox-charge-wrap">
      <div className="sandbox-charge-list">
        {lines.map((line, idx) => (
          <div key={idx} className="sandbox-charge-item">
            <div className="sandbox-charge-item__main">
              <strong>{line.itemName}</strong>
              <code>{line.itemCode} · {chargeSourceLabel(line.sourceType)}</code>
            </div>
            <div className="sandbox-charge-item__price">
              <span>{line.quantity}{line.unitCode ? ` ${line.unitCode}` : ' 次'}</span>
              {!line.separatelyChargeable ? <span>不单独计费</span> : line.fixedAmount != null ? (
                <strong>¥ {line.fixedAmount.toFixed(2)}</strong>
              ) : (
                <span  className="clinical-content-25">按项目价格计费，金额待计价</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {totalAmount !== undefined ? (
        <div className="charge-total-bar">
          <span>当前收费明细合计：</span>
          <strong>¥ {totalAmount.toFixed(2)}</strong>
        </div>
      ) : <p className="rule-simulator__empty">部分项目尚未计价，当前无法确认费用合计。</p>}
    </div>
  )
}

export const sitePricingLabel = (value: NonNullable<ClinicalConfiguration['examination']>) => ({
  SINGLE: '主项计费一次', PER_SITE: '按部位计主项', BASE_PLUS_FIXED: `含 ${value.includedSiteCount} 个 · 超出固定加收`,
  BASE_PLUS_ITEM: `含 ${value.includedSiteCount} 个 · 超出加收项目`,
}[value.sitePricingMode])

export const tubeRuleLabel = (value: SpecimenConfiguration) => {
  const sharing = { SEPARATE: '独立分管', SHARE: '同组共管', BY_TEST_COUNT: `每管最多 ${value.maxTestsPerTube} 项` }[value.tubeSharingMode]
  const charge = value.tubeChargeMode === 'NONE' ? '' : ` · ${value.tubeChargeItemName || '试管加收'}`
  return `${sharing}${value.tubeGroupCode ? ` · ${value.tubeGroupCode}` : ''}${charge}`
}

export const attachmentTriggerLabel = (value: ExaminationAttachmentConfiguration['triggerType']) => ({ ALWAYS: '始终带出', OPTIONAL: '按需选择', MULTI_SITE: '多部位时' }[value])

export const attachmentQuantityLabel = (value: ExaminationAttachmentConfiguration['quantityBasis']) => ({ FIXED: '固定', PER_SITE: '每部位', PER_EXTRA_SITE: '每超出部位' }[value])

export const tubeSharingModeLabel = (value: SpecimenConfiguration['tubeSharingMode']) => ({ SEPARATE: '独立分管', SHARE: '同组共管', BY_TEST_COUNT: '按项目数拆管' }[value])

export const chargeSourceLabel = (value: string) => ({ BASE_SERVICE: '主项目', MULTI_SITE_FIXED: '多部位固定加收', MULTI_SITE_ITEM: '多部位加收项目', ATTACHMENT: '附加收费规则', TUBE_SURCHARGE: '试管加收' }[value] ?? value)

export function FormDialog({
  title, description, onClose, onSubmit, size = 'wide', className = '',
  gridClassName = 'master-data-form-grid--2', customLayout = false, submitLabel = '保存', children,
}: {
  title: string; description: string; onClose: () => void; onSubmit: (e: FormEvent) => void | Promise<void>
  size?: 'default' | 'wide' | 'xwide'; className?: string; gridClassName?: string; customLayout?: boolean; submitLabel?: string; children: ReactNode
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const pending = useRef(false)
  const close = () => { if (!pending.current) onClose() }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    pending.current = true; setSaving(true); setSaveError('')
    try { await onSubmit(event) }
    catch (error) { setSaveError(errorMessage(error)) }
    finally { pending.current = false; setSaving(false) }
  }
  return <Dialog title={title} eyebrow="基础数据 · 运营配置" description={description} size={size} className={className} onClose={close} closeOnBackdrop={false}>
    {saveError && <Alert duration={null}>{saveError}</Alert>}
    <form className="master-data-dialog-form" onSubmit={(event) => { void submit(event) }}>
      <fieldset className="master-data-dialog-fields" disabled={saving}>
        {customLayout ? children : <div className={`master-data-form-grid ${gridClassName}`}>{children}</div>}
      </fieldset>
      <div className="ui-form-actions"><Button variant="secondary" onClick={close} type="button" disabled={saving}>取消</Button><Button type="submit" disabled={saving} busy={saving} busyLabel="保存中">{submitLabel}</Button></div>
    </form>
  </Dialog>
}

export function Check({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return <label className={`operational-check${disabled ? ' is-disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
}

export const unitOption = (v: UnitDefinition) => ({ value: v.code, label: v.name, secondaryText: v.symbol || v.code })
