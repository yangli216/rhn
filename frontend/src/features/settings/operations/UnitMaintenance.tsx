import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { RhnApi, ServiceCatalogItem, SupplyItem, UnitConversion, UnitConversionInput, UnitDefinition } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button, FormField, LoadingState, Select } from "../../../shared/ui";
import { unitOption, today, DataTable, dimensions, State, FormDialog, activeStatus } from './operationalShared'

export function UnitWorkspace({ api, organizationId, units, conversions, catalogItems, loading, onDialog, onDone }: { api: RhnApi; organizationId: string; units: UnitDefinition[]; conversions: UnitConversion[]; catalogItems: Array<ServiceCatalogItem | SupplyItem>; loading: boolean; onDialog: (v?: ReactNode) => void; onDone: (m: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState('1'); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [catalogItemId, setCatalogItemId] = useState('')
  const opts = units.filter((v) => v.status === 'ACTIVE').map(unitOption)
  const catalogOptions = catalogItems.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  const catalogName = (id?: string) => catalogItems.find((v) => v.id === id)?.name ?? '项目专属'
  const unitName = (code: string) => units.find((unit) => unit.code === code)?.name ?? code
  const date = today()
  const preview = useQuery({
    queryKey: ['master-data-operational-unit-preview', organizationId, quantity, from, to, catalogItemId, date, conversions, units],
    queryFn: async () => {
      const input = quantity.trim() ? Number(quantity) : NaN
      if (!Number.isFinite(input)) throw new Error('请填写有效的换算数量。')
      const value = await api.masterData.convertUnit(input, from, to, catalogItemId || undefined, date)
      if (!value || value.input !== input || value.fromUnitCode !== from || value.toUnitCode !== to
        || (value.catalogItemId ?? '') !== catalogItemId || value.effectiveDate !== date
        || !Number.isFinite(value.result) || !Array.isArray(value.path) || !value.path.length
        || value.path.some((code) => typeof code !== 'string' || !code)) {
        throw new Error('单位换算结果不完整或与当前输入不一致，请重新试算。')
      }
      return `${value.input} ${unitName(value.fromUnitCode)} = ${value.result} ${unitName(value.toUnitCode)} · ${value.path.map(unitName).join(' → ')}`
    },
    enabled: false, retry: false,
  })
  const result = preview.isSuccess && !preview.isFetching ? preview.data : undefined
  const run = () => { void preview.refetch() }

  const saveUnit = (value?: UnitDefinition) => (input: Omit<UnitDefinition, 'id' | 'revision'>) =>
    (value ? api.masterData.updateUnit(value, input) : api.masterData.createUnit(input))
      .then(() => { onDialog(undefined); return onDone(value ? '计量单位已更新' : '计量单位已新增') })
  const saveConversion = (value?: UnitConversion) => (input: UnitConversionInput) =>
    (value ? api.masterData.updateUnitConversion(value, input) : api.masterData.createUnitConversion(input))
      .then(() => { onDialog(undefined); return onDone(value ? '换算规则已更新' : '换算规则已新增') })
  return <section className="operational-master-data__body"><div className="operational-master-data__toolbar"><div><h3>统一计量单位与换算</h3><p>单位按计量维度管理，项目专属规则优先于全局规则。</p></div><div className="row-actions"><Button variant="secondary" onClick={() => onDialog(<UnitDialog onClose={() => onDialog(undefined)} onSave={saveUnit()} />)}>新增单位</Button><Button onClick={() => onDialog(<ConversionDialog units={units} catalogItems={catalogItems} onClose={() => onDialog(undefined)} onSave={saveConversion()} />)}>新增换算</Button></div></div>
    {loading ? <LoadingState label="正在加载计量体系…" /> : <div className="unit-workspace"><div><h4>单位定义</h4><DataTable headers={['单位', '维度', '精度', '状态', '操作']} rows={units.map((v) => [<b title={`单位编码：${v.code}`}>{v.name}{v.symbol && <small>{v.symbol}</small>}</b>, dimensions.find((d) => d.value === v.dimension)?.label, v.decimalScale, <State value={v.status} />, <Button size="sm" variant="text" onClick={() => onDialog(<UnitDialog value={v} onClose={() => onDialog(undefined)} onSave={saveUnit(v)} />)}>编辑</Button>])} /></div>
      <div><h4>换算规则</h4><DataTable headers={['范围', '换算', '有效期', '状态', '操作']} rows={conversions.map((v) => [v.catalogItemId ? catalogName(v.catalogItemId) : '全局', `1 ${unitName(v.fromUnitCode)} = ${v.factor} ${unitName(v.toUnitCode)}${v.offset ? ` + ${v.offset}` : ''}`, `${v.validFrom} 至 ${v.validTo || '长期'}`, <State value={v.status} />, <Button size="sm" variant="text" onClick={() => onDialog(<ConversionDialog value={v} units={units} catalogItems={catalogItems} onClose={() => onDialog(undefined)} onSave={saveConversion(v)} />)}>编辑</Button>])} /></div></div>}
    <div className="unit-converter"><strong>换算试算</strong><Select value={catalogItemId} onChange={setCatalogItemId} placeholder="全局规则（可选项目）" options={catalogOptions} /><input aria-label="换算数量" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><Select aria-label="来源单位" value={from} onChange={setFrom} placeholder="来源单位" options={opts} /><span>→</span><Select aria-label="目标单位" value={to} onChange={setTo} placeholder="目标单位" options={opts} /><Button variant="secondary" disabled={!from || !to || !quantity.trim() || preview.isFetching} onClick={run}>试算</Button>{preview.isFetching && <LoadingState label="正在换算…" />}{preview.isError && <Alert duration={null}>{errorMessage(preview.error)}</Alert>}{result && <output>{result}</output>}</div>
  </section>
}

export function UnitDialog({ value, onClose, onSave }: { value?: UnitDefinition; onClose: () => void; onSave: (v: Omit<UnitDefinition, 'id' | 'revision'>) => Promise<void> }) {
  const [form, setForm] = useState({ code: value?.code ?? '', name: value?.name ?? '', symbol: value?.symbol ?? '', dimension: value?.dimension ?? 'COUNT', decimalScale: String(value?.decimalScale ?? 0), status: value?.status ?? 'ACTIVE' })
  return <FormDialog title={value ? '编辑计量单位' : '新增计量单位'} description="单位编码作为跨业务交换键，创建后不可修改。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); return onSave({ code: form.code, name: form.name, symbol: form.symbol || undefined, dimension: form.dimension as UnitDefinition['dimension'], decimalScale: Number(form.decimalScale), status: form.status as 'ACTIVE' | 'INACTIVE' }) }}><FormField label="单位编码" required><input value={form.code} disabled={Boolean(value)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField><FormField label="单位名称" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField><FormField label="显示符号"><input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} /></FormField><FormField label="计量维度"><Select value={form.dimension} onChange={(v) => setForm({ ...form, dimension: v as UnitDefinition['dimension'] })} options={dimensions} /></FormField><FormField label="小数精度"><input type="number" min="0" max="12" value={form.decimalScale} onChange={(e) => setForm({ ...form, decimalScale: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField></FormDialog>
}

export function ConversionDialog({ value, units, catalogItems, onClose, onSave }: { value?: UnitConversion; units: UnitDefinition[]; catalogItems: Array<ServiceCatalogItem | SupplyItem>; onClose: () => void; onSave: (v: UnitConversionInput) => Promise<void> }) {
  const [form, setForm] = useState({ catalogItemId: value?.catalogItemId ?? '', fromUnitCode: value?.fromUnitCode ?? '', toUnitCode: value?.toUnitCode ?? '', factor: String(value?.factor ?? ''), offset: String(value?.offset ?? 0), validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '', status: value?.status ?? 'ACTIVE' }); const opts = units.filter((v) => v.status === 'ACTIVE' || v.code === value?.fromUnitCode || v.code === value?.toUnitCode).map(unitOption)
  const catalogOptions = catalogItems.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  return <FormDialog title={value ? '编辑单位换算' : '新增单位换算'} description="全局规则适用于通用物理换算；包装规格等应使用项目专属换算。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); return onSave({ catalogItemId: form.catalogItemId || undefined, fromUnitCode: form.fromUnitCode, toUnitCode: form.toUnitCode, factor: Number(form.factor), offset: Number(form.offset), validFrom: form.validFrom, validTo: form.validTo || undefined, status: form.status as 'ACTIVE' | 'INACTIVE' }) }}><FormField label="规则范围"><Select disabled={Boolean(value)} value={form.catalogItemId} onChange={(v) => setForm({ ...form, catalogItemId: v })} placeholder="全局通用" options={catalogOptions} /></FormField><FormField label="来源单位" required><Select disabled={Boolean(value)} value={form.fromUnitCode} onChange={(v) => setForm({ ...form, fromUnitCode: v })} options={opts} /></FormField><FormField label="目标单位" required><Select disabled={Boolean(value)} value={form.toUnitCode} onChange={(v) => setForm({ ...form, toUnitCode: v })} options={opts} /></FormField><FormField label="乘数" required><input type="number" min="0.000000001" step="any" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} /></FormField><FormField label="偏移量"><input type="number" step="any" value={form.offset} onChange={(e) => setForm({ ...form, offset: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField><FormField label="生效日期"><input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></FormField><FormField label="失效日期"><input type="date" min={form.validFrom} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></FormField></FormDialog>
}
