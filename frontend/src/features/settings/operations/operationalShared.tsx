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
  LIS: '检验组合', PACS: '检查组合', ORDER_SET: '常用组合项目（将迁至临床模板库）', PACKAGE: '项目包',
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

export function ClinicalDataTable({ headers, rows, colWidths, fixed = false }: { headers: string[]; rows: ReactNode[][]; colWidths?: string[]; fixed?: boolean }) {
  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <UiDataTable className={fixed ? 'clinical-table clinical-table--fixed' : 'clinical-table'}>
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
  const included = `前 ${ex.includedSiteCount} 个部位含在主收费内`
  if (ex.sitePricingMode === 'SINGLE') return '不论选几个部位，主收费只收 1 次'
  if (ex.sitePricingMode === 'PER_SITE') return '主收费按计费部位数收取，每个部位收 1 次'
  if (ex.sitePricingMode === 'BASE_PLUS_FIXED') return `${included}，之后每多 1 个部位加收 ¥${ex.additionalSitePrice ?? '未配置'}`
  if (ex.sitePricingMode === 'BASE_PLUS_ITEM') return `${included}，之后每多 1 个部位加收【${ex.additionalSiteItemName || `项目 ${ex.additionalSiteItemId ?? '未配置'}`}】× ${ex.additionalSiteQuantity ?? '未配置'}`
  if (ex.sitePricingMode === 'TIERED_ITEM') return ex.priceTiers.length
    ? ex.priceTiers.map((tier) => `${priceTierRange(tier)} → ${tier.chargeItemName} × ${tier.chargeQuantity}`).join('；')
    : '尚未维护计价档位'
  return '未设定多部位计价策略'
}

/** 开单时的部位约束，例如“必选，最多 6 个”。 */
export const siteConstraintLabel = (ex: NonNullable<ClinicalConfiguration['examination']>) =>
  !ex.bodySiteRequired ? '不需选择' : !ex.multiBodySite ? '必选 1 个'
    : `必选，最多 ${ex.maxBodySiteCount ? `${ex.maxBodySiteCount} 个` : '不限'}`

/** 收费明细：固定金额直接显示；按物价项收费的行有单价时显示单价与金额，任一收费行缺金额则不出合计。 */
export function ChargeLines({ lines, unitPrices }: { lines: DiagnosticChargeLine[]; unitPrices?: Record<string, number | undefined> }) {
  if (!lines.length) return <p className="rule-simulator__empty">本次试算未返回收费明细。</p>
  const amountOf = (line: DiagnosticChargeLine) => line.fixedAmount ?? (unitPrices?.[line.catalogItemId] == null
    ? undefined : unitPrices[line.catalogItemId]! * line.quantity)
  const billable = lines.filter((line) => line.separatelyChargeable)
  const totalAmount = unitPrices ? (billable.some((line) => amountOf(line) == null) ? undefined
    : billable.reduce((sum, line) => sum + amountOf(line)!, 0)) : knownChargeTotal(lines)
  return (
    <div className="sandbox-charge-wrap">
      <div className="sandbox-charge-list">
        {lines.map((line, idx) => {
          const amount = amountOf(line)
          const unitPrice = line.fixedAmount == null ? unitPrices?.[line.catalogItemId] : undefined
          return <div key={idx} className="sandbox-charge-item">
            <div className="sandbox-charge-item__main">
              <strong title={line.itemName}>{line.itemName}</strong>
              <code>{line.itemCode} · {chargeSourceLabel(line.sourceType)}</code>
            </div>
            <div className="sandbox-charge-item__price">
              <span>{line.quantity} {line.unitCode || '次'}{unitPrice != null ? ` × ¥${unitPrice.toFixed(2)}` : ''}</span>
              {!line.separatelyChargeable ? <span>不单独收费</span> : amount != null ? (
                <strong>¥ {amount.toFixed(2)}</strong>
              ) : <span className="clinical-content-25">{unitPrices ? '未取到本院价格' : '按项目价格计费，金额待计价'}</span>}
            </div>
          </div>
        })}
      </div>
      {totalAmount !== undefined ? (
        <div className="charge-total-bar">
          <span>合计</span>
          <strong>¥ {totalAmount.toFixed(2)}</strong>
        </div>
      ) : <p className="rule-simulator__empty">{unitPrices ? '有收费项目未取到本院价格，无法确认合计。' : '部分项目尚未计价，当前无法确认费用合计。'}</p>}
    </div>
  )
}

export const sitePricingLabel = (value: NonNullable<ClinicalConfiguration['examination']>) => ({
  SINGLE: '只收一次', PER_SITE: '按部位计费', BASE_PLUS_FIXED: `含 ${value.includedSiteCount} 个部位，超出固定加收`,
  BASE_PLUS_ITEM: `含 ${value.includedSiteCount} 个部位，超出加收项目`,
  TIERED_ITEM: `阶梯计价 ${value.priceTiers.length} 档`,
}[value.sitePricingMode])

/** 档位的计费部位数区间文字，例如“1 个部位”“2–3 个部位”“≥4 个部位”。 */
export const priceTierRange = (tier: { siteFrom: number; siteTo?: number | null }) =>
  tier.siteTo == null ? `≥${tier.siteFrom} 个部位`
    : tier.siteTo === tier.siteFrom ? `${tier.siteFrom} 个部位` : `${tier.siteFrom}–${tier.siteTo} 个部位`

export const tubeRuleLabel = (value: SpecimenConfiguration) => {
  const sharing = { SEPARATE: '独立分管', SHARE: '同组共管', BY_TEST_COUNT: `每管最多 ${value.maxTestsPerTube} 项` }[value.tubeSharingMode]
  const charge = value.tubeChargeMode === 'NONE' ? '' : ` · ${value.tubeChargeItemName || '试管加收'}`
  return `${sharing}${value.tubeGroupCode ? ` · ${value.tubeGroupCode}` : ''}${charge}`
}

export const attachmentTriggerLabel = (value: ExaminationAttachmentConfiguration['triggerType']) => ({ ALWAYS: '始终带出', OPTIONAL: '按需选择', MULTI_SITE: '多部位时' }[value])

export const attachmentQuantityLabel = (value: ExaminationAttachmentConfiguration['quantityBasis']) => ({ FIXED: '固定', PER_SITE: '每部位', PER_EXTRA_SITE: '每超出部位' }[value])

export const tubeSharingModeLabel = (value: SpecimenConfiguration['tubeSharingMode']) => ({ SEPARATE: '独立分管', SHARE: '同组共管', BY_TEST_COUNT: '按项目数拆管' }[value])

export const chargeSourceLabel = (value: string) => ({ BASE_SERVICE: '主项目', TIER: '阶梯档位', MULTI_SITE_FIXED: '多部位固定加收', MULTI_SITE_ITEM: '多部位加收项目', ATTACHMENT: '附加收费规则', TUBE_SURCHARGE: '试管加收' }[value] ?? value)

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
