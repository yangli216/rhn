import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'
const massFactors: Record<string, number> = { g: 1, mg: 0.001, ug: 0.000001, 'μg': 0.000001 }

const ROUTE_LABELS: Record<string, string> = {
  ORAL: '口服',
  PO: '口服',
  IV: '静脉注射',
  IVGTT: '静脉滴注',
  IM: '肌内注射',
  IH: '皮下注射',
  SC: '皮下注射',
  TOPICAL: '外用',
  INHALATION: '吸入',
  EXT: '外用',
  NASAL: '滴鼻',
  OPHTH: '滴眼',
  RECTAL: '直肠给药',
}

export function formatRouteName(route?: string | null): string {
  if (!route) return ''
  const upper = route.trim().toUpperCase()
  return ROUTE_LABELS[upper] || route
}

/** Preview simple solid preparations only; ambiguous strength must be reviewed. */
export function medicationSingleDoseLabel(item: CompiledPlanMedicationItem): string {
  if (!item.doseValue || !item.doseUnit) return '单次剂量待确认'
  const label = `每次 ${item.doseValue}${item.doseUnit}`
  const strength = /^\s*(\d+(?:\.\d+)?)\s*(mg|μg|ug|g)\s*(?:[/／]\s*(粒|片))?\s*$/i.exec(item.preparationSpec || '')
  const preparationUnit = strength?.[3] || (/胶囊/.test(item.medicationName || '') ? '粒' : /片$/.test(item.medicationName || '') ? '片' : null)
  const doseFactor = massFactors[item.doseUnit.toLowerCase()]
  const strengthFactor = strength && massFactors[strength[2].toLowerCase()]
  if (!strength || !preparationUnit || !doseFactor || !strengthFactor || Number(strength[1]) <= 0) return label
  const count = Number(item.doseValue) * doseFactor / (Number(strength[1]) * strengthFactor)
  const rounded = Math.round(count)
  if (rounded <= 0 || Math.abs(count - rounded) > 1e-8) return `${label}（制剂数量需核对）`
  return `${label}（${rounded}${preparationUnit}）`
}

