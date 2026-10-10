import { useState } from "react";
import type { Manufacturer, SupplyInput, SupplyItem, UnitDefinition } from "../../../shared/rhnApi";
import { FormField, Select } from "../../../shared/ui";
import { today, FormDialog, unitOption, activeStatus, Check } from './operationalShared'

export function SupplyDialog({ value, units, manufacturers, onClose, onSave }: {
  value?: SupplyItem; units: UnitDefinition[]; manufacturers: Manufacturer[]
  onClose: () => void; onSave: (input: SupplyInput) => Promise<void>
}) {
  const [form, setForm] = useState({
    supplyType: value?.supplyType ?? 'CONSUMABLE', code: value?.code ?? '', name: value?.name ?? '',
    unitCode: value?.unitCode ?? 'EA', udiDi: value?.udiDi ?? '', genericCode: value?.genericCode ?? '',
    genericName: value?.genericName ?? '', modelName: value?.modelName ?? '', specification: value?.specification ?? '',
    materialType: value?.materialType ?? '', deviceClass: value?.deviceClass ?? '',
    registrationCode: value?.registrationCode ?? '', registrationName: value?.registrationName ?? '',
    registrantName: value?.registrantName ?? '', registrationFrom: value?.registrationFrom ?? '',
    registrationTo: value?.registrationTo ?? '', manufacturerId: value?.manufacturerId ?? '',
    structureDescription: value?.structureDescription ?? '', scopeDescription: value?.scopeDescription ?? '',
    instruction: value?.instruction ?? '', validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '',
    orderable: value?.orderable ?? true, chargeable: value?.chargeable ?? true, stocked: value?.stocked ?? true,
    highValue: value?.highValue ?? false, implant: value?.implant ?? false,
    intervention: value?.intervention ?? false, sterile: value?.sterile ?? false,
    singleUse: value?.singleUse ?? true, status: value?.status ?? 'ACTIVE',
  })
  const optional = (text: string) => text.trim() || undefined
  return <FormDialog title={value ? '编辑耗材/器械' : '新增耗材/器械'}
    description="统一维护经营属性、UDI、注册证和生产企业信息；适配宽屏工作台，分层管理基础身份、资质认证与管控规则。"
    size="xwide"
    className="supply-dialog-modal"
    customLayout
    onClose={onClose}
    onSubmit={(e) => { e.preventDefault(); return onSave({
      supplyType: form.supplyType as 'CONSUMABLE' | 'DEVICE', code: form.code, name: form.name,
      unitCode: form.unitCode, orderable: form.orderable, chargeable: form.chargeable, stocked: form.stocked,
      status: form.status as 'ACTIVE' | 'INACTIVE', validFrom: form.validFrom, validTo: form.validTo || undefined,
      udiDi: optional(form.udiDi), genericCode: optional(form.genericCode), genericName: optional(form.genericName),
      modelName: optional(form.modelName), specification: optional(form.specification), materialType: optional(form.materialType),
      deviceClass: form.deviceClass as 'I' | 'II' | 'III' || undefined, highValue: form.highValue,
      implant: form.implant, intervention: form.intervention, sterile: form.sterile, singleUse: form.singleUse,
      registrationCode: optional(form.registrationCode), registrationName: optional(form.registrationName),
      registrantName: optional(form.registrantName), registrationFrom: form.registrationFrom || undefined,
      registrationTo: form.registrationTo || undefined, manufacturerId: form.manufacturerId || undefined,
      structureDescription: optional(form.structureDescription), scopeDescription: optional(form.scopeDescription),
      instruction: optional(form.instruction),
    }) }}>
    <div className="supply-dialog-layout">
      {/* 区块 1：基础身份与规格 */}
      <section className="supply-dialog-section">
        <header className="supply-dialog-section__header">
          <strong>1. 基础身份与规格型号</strong>
          <small>耗材编码、名称、通用名及规格型号等核心临床标识</small>
        </header>
        <div className="master-data-form-grid master-data-form-grid--4">
          <FormField label="主数据类型" required>
            <Select value={form.supplyType} onChange={(v) => setForm({ ...form, supplyType: v as 'CONSUMABLE' | 'DEVICE' })} options={[{ value: 'CONSUMABLE', label: '医用耗材' }, { value: 'DEVICE', label: '医疗器械' }]} />
          </FormField>
          <FormField label="编码" required>
            <input value={form.code} disabled={Boolean(value)} placeholder="如 MAT_EDTA_2ML" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </FormField>
          <FormField label="基础单位" required>
            <Select value={form.unitCode} onChange={(v) => setForm({ ...form, unitCode: v })} options={units.filter((v) => v.status === 'ACTIVE' || v.code === value?.unitCode).map(unitOption)} />
          </FormField>
          <FormField label="状态">
            <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} />
          </FormField>
          <FormField label="名称" required className="span-2">
            <input value={form.name} placeholder="如 一次性使用采血管 EDTA-K2 2ml" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="通用名" className="span-2">
            <input value={form.genericName} placeholder="如 采血管" onChange={(e) => setForm({ ...form, genericName: e.target.value })} />
          </FormField>
          <FormField label="通用编码">
            <input value={form.genericCode} placeholder="如 YB_HC_001" onChange={(e) => setForm({ ...form, genericCode: e.target.value })} />
          </FormField>
          <FormField label="生产企业">
            <Select value={form.manufacturerId} onChange={(v) => setForm({ ...form, manufacturerId: v })} placeholder="未指定" options={manufacturers.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))} />
          </FormField>
          <FormField label="型号">
            <input value={form.modelName} placeholder="如 EDTA-K2-2ML" onChange={(e) => setForm({ ...form, modelName: e.target.value })} />
          </FormField>
          <FormField label="规格">
            <input value={form.specification} placeholder="如 2ml" onChange={(e) => setForm({ ...form, specification: e.target.value })} />
          </FormField>
          <FormField label="材质类型">
            <input value={form.materialType} placeholder="如 医用级 PET / 玻璃" onChange={(e) => setForm({ ...form, materialType: e.target.value })} />
          </FormField>
          <FormField label="器械分类">
            <Select value={form.deviceClass} onChange={(v) => setForm({ ...form, deviceClass: v })} placeholder="非器械/未设置" options={['I', 'II', 'III'].map((v) => ({ value: v, label: `${v} 类` }))} />
          </FormField>
        </div>
      </section>

      {/* 区块 2：资质认证与注册信息 */}
      <section className="supply-dialog-section">
        <header className="supply-dialog-section__header">
          <strong>2. 资质认证与注册信息</strong>
          <small>国家医保 UDI-DI 唯一标识及医疗器械注册/备案证</small>
        </header>
        <div className="master-data-form-grid master-data-form-grid--4">
          <FormField label="UDI-DI">
            <input value={form.udiDi} placeholder="06900000000000" onChange={(e) => setForm({ ...form, udiDi: e.target.value })} />
          </FormField>
          <FormField label="注册证号">
            <input value={form.registrationCode} placeholder="国械注准 / 粤械注准..." onChange={(e) => setForm({ ...form, registrationCode: e.target.value })} />
          </FormField>
          <FormField label="注册证名称">
            <input value={form.registrationName} onChange={(e) => setForm({ ...form, registrationName: e.target.value })} />
          </FormField>
          <FormField label="注册人">
            <input value={form.registrantName} onChange={(e) => setForm({ ...form, registrantName: e.target.value })} />
          </FormField>
          <FormField label="注册有效期起">
            <input type="date" value={form.registrationFrom} onChange={(e) => setForm({ ...form, registrationFrom: e.target.value })} />
          </FormField>
          <FormField label="注册有效期止">
            <input type="date" min={form.registrationFrom} value={form.registrationTo} onChange={(e) => setForm({ ...form, registrationTo: e.target.value })} />
          </FormField>
          <FormField label="主档生效日期" required>
            <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          </FormField>
          <FormField label="主档失效日期">
            <input type="date" min={form.validFrom} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          </FormField>
        </div>
      </section>

      {/* 区块 3：经营与管控属性 */}
      <section className="supply-dialog-section">
        <header className="supply-dialog-section__header">
          <strong>3. 经营与管控属性</strong>
          <small>控制临床医嘱开立、库房出入库管理、高值耗材监管及收费规则</small>
        </header>
        <div className="supply-attributes-grid">
          <Check label="可开立（临床医嘱）" checked={form.orderable} onChange={(v) => setForm({ ...form, orderable: v })} />
          <Check label="可收费（费用清单）" checked={form.chargeable} onChange={(v) => setForm({ ...form, chargeable: v })} />
          <Check label="可库存（进销存管理）" checked={form.stocked} onChange={(v) => setForm({ ...form, stocked: v })} />
          <Check label="高值耗材" checked={form.highValue} onChange={(v) => setForm({ ...form, highValue: v })} />
          <Check label="植入类" checked={form.implant} onChange={(v) => setForm({ ...form, implant: v, highValue: v || form.highValue })} />
          <Check label="介入类" checked={form.intervention} onChange={(v) => setForm({ ...form, intervention: v })} />
          <Check label="无菌产品" checked={form.sterile} onChange={(v) => setForm({ ...form, sterile: v })} />
          <Check label="一次性使用" checked={form.singleUse} onChange={(v) => setForm({ ...form, singleUse: v })} />
        </div>
      </section>

      {/* 区块 4：临床说明与结构 */}
      <section className="supply-dialog-section">
        <header className="supply-dialog-section__header">
          <strong>4. 临床应用与说明</strong>
          <small>产品结构组成、适应证范围及临床使用指导说明（PC 宽屏横向三列并排）</small>
        </header>
        <div className="supply-descriptions-grid">
          <FormField label="结构组成"><textarea value={form.structureDescription} placeholder="简述耗材物理构造、材质组合及配件" onChange={(e) => setForm({ ...form, structureDescription: e.target.value })} /></FormField>
          <FormField label="适用范围"><textarea value={form.scopeDescription} placeholder="简述适用临床科室、适应证及配合设备" onChange={(e) => setForm({ ...form, scopeDescription: e.target.value })} /></FormField>
          <FormField label="使用说明"><textarea value={form.instruction} placeholder="简述操作规范、禁忌及储存注意事项" onChange={(e) => setForm({ ...form, instruction: e.target.value })} /></FormField>
        </div>
      </section>
    </div>
  </FormDialog>
}
