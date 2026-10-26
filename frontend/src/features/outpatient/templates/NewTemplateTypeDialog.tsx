import { useState } from 'react'
import './outpatient-plan-templates.css'
import { Button, Dialog } from '../../../shared/ui'
import { templateTypeHint, templateTypeLabel, templateTypeOrder, type ClinicalTemplateType } from './orderSetTemplate'

/** 新建临床模板前先选类型；每个类型给一句话说明，顺序固定为诊疗方案、医嘱组套、病历模板。 */
export function NewTemplateTypeDialog({ initialType, onCancel, onConfirm }: {
  initialType: ClinicalTemplateType
  onCancel: () => void
  onConfirm: (type: ClinicalTemplateType) => void
}) {
  const [type, setType] = useState<ClinicalTemplateType>(initialType)
  return <Dialog title="新建临床模板" eyebrow="选择模板类型" size="default" onClose={onCancel}
    footer={<>
      <Button variant="secondary" onClick={onCancel}>取消</Button>
      <Button onClick={() => onConfirm(type)}>下一步</Button>
    </>}>
    <div className="template-type-choice" role="radiogroup" aria-label="模板类型">
      {templateTypeOrder.map((value) => <label key={value} className={`template-type-choice__option ${type === value ? 'is-selected' : ''}`}>
        <input type="radio" name="template-type" value={value} checked={type === value} onChange={() => setType(value)} />
        <span><strong>{templateTypeLabel(value)}</strong><small>{templateTypeHint(value)}</small></span>
      </label>)}
    </div>
  </Dialog>
}
