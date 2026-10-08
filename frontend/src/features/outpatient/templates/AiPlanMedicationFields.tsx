import type { ClinicalMedicationStandards } from '../../../shared/api/masterDataApi'
import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import { FormField, Select, UnitNumberInput } from '../../../shared/ui'
import { planDurationUnits } from './aiPlanMedicationFacts'
import './ai-plan-medication-fields.css'

export function AiPlanMedicationFields({ item, standards, disabled, requireDirections, onChange }: {
  item: CompiledPlanMedicationItem
  standards?: ClinicalMedicationStandards
  disabled?: boolean
  requireDirections?: boolean
  onChange: (patch: Partial<CompiledPlanMedicationItem>) => void
}) {
  const unavailable = disabled || !standards
  return <div className="ai-plan-medication-fields">
    <FormField label="单次剂量" required={requireDirections}>
      <UnitNumberInput aria-label="单次剂量" value={item.doseValue ?? ''} unit={item.doseUnit ?? ''} min="0" step="any"
        disabled={unavailable || !standards?.doseUnits.length} units={standards?.doseUnits.map(unit => ({ value: unit.code, label: unit.display }))}
        onValueChange={value => onChange({ doseValue: value === '' ? undefined : Number(value) })}
        onUnitChange={doseUnit => onChange({ doseUnit })} />
    </FormField>
    <FormField label="给药途径" required={requireDirections}>
      <Select aria-label="给药途径" value={item.routeCode ?? ''} disabled={unavailable} placeholder="请选择途径"
        options={standards?.routes.map(route => ({ value: route.code, label: route.name })) ?? []}
        onChange={routeCode => onChange({ routeCode })} />
    </FormField>
    <FormField label="用药频次" required={requireDirections}>
      <Select aria-label="用药频次" value={item.frequencyCode ?? ''} disabled={unavailable} placeholder="请选择频次"
        options={standards?.frequencies.map(frequency => ({ value: frequency.code, label: frequency.name })) ?? []}
        onChange={frequencyCode => onChange({ frequencyCode })} />
    </FormField>
    <FormField label="数量" required>
      <UnitNumberInput aria-label="药品数量" value={Number.isFinite(item.quantity) ? item.quantity : ''} unit={item.quantityUnit ?? ''}
        unitReadOnly disabled={disabled} min="0" step="any"
        onValueChange={value => onChange({ quantity: value === '' ? Number.NaN : Number(value) })} />
    </FormField>
    <FormField label="疗程" hint="未填写时保留为空，开立时确认。">
      <UnitNumberInput aria-label="疗程" value={item.durationValue ?? ''} unit={item.durationUnit ?? ''} units={planDurationUnits.filter(unit => ['d', 'w', 'm'].includes(unit.value) || unit.value === item.durationUnit)}
        disabled={disabled} min="0" step="any" onValueChange={value => onChange({ durationValue: value === '' ? undefined : Number(value) })}
        onUnitChange={durationUnit => onChange({ durationUnit })} />
    </FormField>
    <FormField label="用药说明">
      <textarea aria-label="用药说明" className="ui-field__control" rows={2} value={item.medicationInstruction ?? ''}
        disabled={disabled} onChange={event => onChange({ medicationInstruction: event.target.value })} />
    </FormField>
  </div>
}
