// Service subtype (RHN_BD_SVC_ITEM.SD_SVC_SUBTYPE) is a code; screens show its label. Unmapped values are legacy
// price-list categories stored as text and are shown as-is.
export const SERVICE_SUBTYPE_MAP: Record<string, string> = {
  IMMUNOASSAY: '免疫检测',
  BIOCHEMISTRY: '生化检测',
  HEMATOLOGY: '血液体液检测',
  MICROBIOLOGY: '微生物检测',
  MOLECULAR: '分子生物检测',
  PATHOLOGY: '病理检查',
  RADIOGRAPHY: '普通放射 (DR)',
  CT: '计算机断层扫描 (CT)',
  MRI: '磁共振成像 (MRI)',
  ULTRASOUND: '超声检查',
  ENDOSCOPY: '内镜检查',
  ECG: '心电图',
  OUTPATIENT_VISIT: '门诊诊查',
  EMERGENCY_VISIT: '急诊诊查',
  INPATIENT_VISIT: '住院诊查',
  NEBULIZATION: '雾化治疗',
  DRESSING: '创面换药',
  INJECTION: '注射处置',
  PHYSIOTHERAPY: '物理治疗',
  BED_DAY: '按日床位',
  GENERAL: '常规项目',
}

export function serviceSubtypeLabel(subtype?: string | null) {
  if (!subtype) return ''
  return SERVICE_SUBTYPE_MAP[subtype] || subtype
}
