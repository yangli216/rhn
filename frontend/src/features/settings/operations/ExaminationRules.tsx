import { useState } from "react";
import type { DictionaryValue, ExaminationVariantConfiguration, ExaminationVariantInput, ExaminationAttachmentConfiguration, ExaminationAttachmentInput, ServiceCatalogItem } from "../../../shared/rhnApi";
import { Button, FormField, Select } from "../../../shared/ui";
import { FormDialog, activeStatus, Check } from './operationalShared'

export const BODY_SITE_QUICK_TAGS = ['头颅', '脑部', '颌面五官', '颈部', '胸部', '肺部', '全腹部', '上腹部', '盆腔', '腰椎', '颈椎', '胸椎', '四肢关节']

export function VariantDialog({ value, dictionaries, onClose, onSave }: {
  value?: ExaminationVariantConfiguration; dictionaries: Record<string, DictionaryValue[]>
  onClose: () => void; onSave: (input: ExaminationVariantInput) => Promise<void>
}) {
  const [form, setForm] = useState({
    code: value?.code ?? '', name: value?.name ?? '', methodType: value?.methodType ?? '',
    bodySiteRequired: value?.bodySiteRequired ?? true, mutualRecognitionCode: value?.mutualRecognitionCode ?? '',
    sortOrder: String(value?.sortOrder ?? 10), status: value?.status ?? 'ACTIVE',
  })

  const pickTag = (tag: string) => {
    if (!form.name) {
      setForm((prev) => ({ ...prev, name: tag, code: prev.code || tag.toUpperCase() }))
    } else if (!form.name.includes(tag)) {
      setForm((prev) => ({ ...prev, name: `${prev.name} · ${tag}` }))
    }
  }

  return <FormDialog title={value ? '编辑允许部位或检查方式' : '新增允许部位或检查方式'}
    description="维护检查项目允许选择的解剖部位与执行方式，编码用于申请与 PACS 执行交互。"
    onClose={onClose} onSubmit={(e) => {
      e.preventDefault()
      return onSave({
        code: form.code, name: form.name, methodType: form.methodType || undefined,
        bodySiteRequired: form.bodySiteRequired, mutualRecognitionCode: form.mutualRecognitionCode || undefined,
        sortOrder: Number(form.sortOrder), status: form.status as 'ACTIVE' | 'INACTIVE',
      })
    }}>
    <div className="span-2 form-section-card" style={{ padding: 'var(--space-3)' }}>
      <div className="form-section-card__title" style={{ paddingBottom: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
        <span>常用解剖部位快捷标签（点击填入）</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {BODY_SITE_QUICK_TAGS.map((tag) => (
          <Button key={tag} size="sm" variant="secondary" onClick={() => pickTag(tag)}>
            + {tag}
          </Button>
        ))}
      </div>
    </div>
    <FormField label="配置编码" required>
      <input value={form.code} disabled={Boolean(value)} placeholder="如 CHEST、ABDOMEN"
        onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
    </FormField>
    <FormField label="部位或选项名称" required>
      <input value={form.name} placeholder="如 胸部、全腹部" onChange={(e) => setForm({ ...form, name: e.target.value })} />
    </FormField>
    <FormField label="检查技术方式">
      <Select value={form.methodType} onChange={(v) => setForm({ ...form, methodType: v })}
        placeholder="未限定方式（平扫/增强通用）"
        options={(dictionaries.BD_SERVICE_VARIANT_METHOD ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} />
    </FormField>
    <FormField label="国家/省市互认编码">
      <input value={form.mutualRecognitionCode} placeholder="填写互认标准编码（选填）"
        onChange={(e) => setForm({ ...form, mutualRecognitionCode: e.target.value })} />
    </FormField>
    <FormField label="排序号">
      <input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
    </FormField>
    <FormField label="状态">
      <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' })} options={activeStatus} />
    </FormField>
    <Check label="选择此选项后仍需明确指定标准解剖部位" checked={form.bodySiteRequired} onChange={(v) => setForm({ ...form, bodySiteRequired: v })} />
  </FormDialog>
}

export const ATTACHMENT_SCENE_TEMPLATES = [
  {
    id: 'film',
    title: '🎞️ 影像胶片耗材',
    desc: '按检查部位数量倍增，每增加一个部位带出 1 张胶片',
    triggerType: 'ALWAYS' as const,
    quantityBasis: 'PER_SITE' as const,
    quantity: '1',
    requiredAttachment: true,
    separatelyChargeable: true,
    keyword: '胶片',
  },
  {
    id: 'contrast',
    title: '💉 增强造影与注射',
    desc: '单次检查固定收取 1 次，不论检查多少个部位',
    triggerType: 'OPTIONAL' as const,
    quantityBasis: 'FIXED' as const,
    quantity: '1',
    requiredAttachment: false,
    separatelyChargeable: true,
    keyword: '造影',
  },
  {
    id: 'anesthesia',
    title: '🩺 麻醉镇静/特殊监护',
    desc: '申请时由临床按需勾选，按固定单次收取',
    triggerType: 'OPTIONAL' as const,
    quantityBasis: 'FIXED' as const,
    quantity: '1',
    requiredAttachment: false,
    separatelyChargeable: true,
    keyword: '麻醉',
  },
]

export function AttachmentDialog({ value, services, currentServiceId, onClose, onSave }: {
  value?: ExaminationAttachmentConfiguration; services: ServiceCatalogItem[]; currentServiceId: string
  onClose: () => void; onSave: (input: ExaminationAttachmentInput) => Promise<void>
}) {
  const [form, setForm] = useState({
    attachmentCatalogItemId: value?.attachmentCatalogItemId ?? '',
    triggerType: value?.triggerType ?? 'ALWAYS', quantityBasis: value?.quantityBasis ?? 'FIXED',
    quantity: String(value?.quantity ?? 1), requiredAttachment: value?.requiredAttachment ?? false,
    separatelyChargeable: value?.separatelyChargeable ?? true, sortOrder: String(value?.sortOrder ?? 10),
    description: value?.description ?? '', status: value?.status ?? 'ACTIVE',
  })

  const options = services.filter((v) => v.id !== currentServiceId && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: `${v.code}${v.chargeable ? ' · 可收费' : ''}` }))

  const applyScene = (scene: typeof ATTACHMENT_SCENE_TEMPLATES[number]) => {
    const matched = options.find((opt) => opt.label.includes(scene.keyword) || opt.secondaryText.includes(scene.keyword))
    setForm((prev) => ({
      ...prev,
      triggerType: scene.triggerType,
      quantityBasis: scene.quantityBasis,
      quantity: scene.quantity,
      requiredAttachment: scene.requiredAttachment,
      separatelyChargeable: scene.separatelyChargeable,
      attachmentCatalogItemId: matched ? matched.value : prev.attachmentCatalogItemId,
      description: prev.description || scene.desc,
    }))
  }

  return <FormDialog title={value ? '编辑附加收费规则' : '新增附加收费规则'}
    description="支持场景化向导，根据触发条件（始终/按需/多部位）和数量依据（固定/每部位）自动计算胶片、造影剂与耗材收费。"
    onClose={onClose} onSubmit={(e) => {
      e.preventDefault()
      return onSave({
        attachmentCatalogItemId: form.attachmentCatalogItemId,
        triggerType: form.triggerType, quantityBasis: form.quantityBasis, quantity: Number(form.quantity),
        requiredAttachment: form.triggerType === 'OPTIONAL' ? false : form.requiredAttachment,
        separatelyChargeable: form.separatelyChargeable, sortOrder: Number(form.sortOrder),
        description: form.description || undefined, status: form.status as 'ACTIVE' | 'INACTIVE',
      })
    }}>
    <div className="span-2">
      <div style={{ marginBottom: 'var(--space-2)' }} className="clinical-content-18">
        <strong>推荐业务场景预设（点击一键套用规则）</strong>
      </div>
      <div className="scene-wizard-grid">
        {ATTACHMENT_SCENE_TEMPLATES.map((scene) => (
          <Button type="button" key={scene.id} className="scene-wizard-btn" onClick={() => applyScene(scene)} variant="text" size="sm">
            <strong>{scene.title}</strong>
            <span>{scene.desc}</span>
          </Button>
        ))}
      </div>
    </div>

    <FormField label="连带收费项目" required className="span-2">
      <Select disabled={Boolean(value)} value={form.attachmentCatalogItemId}
        onChange={(v) => setForm({ ...form, attachmentCatalogItemId: v })} options={options}
        placeholder="选择胶片、造影剂、穿刺包或特殊技术服务项目" />
    </FormField>
    <FormField label="触发条件">
      <Select value={form.triggerType} onChange={(v) => setForm({ ...form, triggerType: v as typeof form.triggerType })} options={[
        { value: 'ALWAYS', label: '始终带出（不论选几个部位均收取）' },
        { value: 'OPTIONAL', label: '申请时按需选择（医生手动勾选才收）' },
        { value: 'MULTI_SITE', label: '多部位时触发（选择 ≥2 个部位才收取）' },
      ]} />
    </FormField>
    <FormField label="数量计算依据">
      <Select value={form.quantityBasis} onChange={(v) => setForm({ ...form, quantityBasis: v as typeof form.quantityBasis })} options={[
        { value: 'FIXED', label: '固定数量（与部位数无关）' },
        { value: 'PER_SITE', label: '每个检查部位（部位数 × 数量）' },
        { value: 'PER_EXTRA_SITE', label: '每个超出部位（超出基础部位数 × 数量）' },
      ]} />
    </FormField>
    <FormField label="基准数量">
      <input type="number" min="0.0001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
    </FormField>
    <FormField label="排序号">
      <input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
    </FormField>
    <FormField label="状态">
      <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as typeof form.status })} options={activeStatus} />
    </FormField>
    <FormField label="规则说明" className="span-2">
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="说明适用条件、人工调整约束或收费依据（如：每增加一个部位加收1张胶片）" />
    </FormField>
    <Check label="命中条件后必须强制带出" checked={form.requiredAttachment} disabled={form.triggerType === 'OPTIONAL'}
      onChange={(v) => setForm({ ...form, requiredAttachment: v })} />
    <Check label="在账单中生成独立收费行" checked={form.separatelyChargeable} onChange={(v) => setForm({ ...form, separatelyChargeable: v })} />
  </FormDialog>
}
