import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'docs/architecture/rational-medication/标准药品关联基线-2026-09-22.json')
const baseUrl = process.env.RHN_API_URL ?? 'http://127.0.0.1:8080'
const username = process.env.RHN_DEV_USERNAME ?? 'doctor'
const password = process.env.RHN_DEV_PASSWORD ?? 'rhn-dev-2026'
const tenantId = process.env.RHN_TENANT_ID ?? '362387869790209'
const organizationId = process.env.RHN_ORGANIZATION_ID ?? '362387869790211'
const departmentId = process.env.RHN_DEPARTMENT_ID ?? '362387869790212'
const apply = process.argv.includes('--apply')

const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
const headers = {
  Authorization: auth,
  'X-Tenant-Id': tenantId,
  'X-Organization-Id': organizationId,
  'X-Department-Id': departmentId,
  'X-Client-Session-Id': '71c2a87e-b38d-45ac-9d60-c83ce67f2211',
}

async function api(method, endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const value = text ? JSON.parse(text) : null
  if (!response.ok) {
    const detail = value?.code ? `${value.code}: ${value.message}` : text
    throw new Error(`${method} ${endpoint} -> ${response.status} ${detail}`)
  }
  return value
}

async function readiness() {
  const rows = []
  for (let page = 0; ; page += 1) {
    const result = await api('GET', `/api/platform/master-data/clinical-semantics/readiness?page=${page}&size=100`)
    rows.push(...result.content)
    if (page + 1 >= result.totalPages) return { rows, summary: result.summary }
  }
}

const normalizations = new Map([
  ['DEMO-DRUG-CRO', { name: '头孢曲松钠', aliasName: 'MED-2026-W014;头孢曲松', sdDoseForm: 'POWDER_FOR_INJECTION', preparationSpec: '1.0g', standardSpecificationId: 'STD-BDA260D683D39C08072D7FAB' }],
  ['DRUG-VB1-INJ', { name: '维生素B1注射液', aliasName: 'MED-2026-W399;维生素B1', sdDoseForm: 'INJECTION', preparationSpec: '2ml:100mg', standardSpecificationId: 'STD-D8C519AABA4B064BD6A2A592' }],
  ['DEMO-DRUG-SALB', { name: '沙丁胺醇吸入溶液', aliasName: 'MED-2026-W217;沙丁胺醇', sdDoseForm: 'SOLUTION_FOR_INHALATION', preparationSpec: '2.5ml:5mg', standardSpecificationId: 'STD-9A3B7CB1CFA331669E1C5192' }],
  ['DEMO-DRUG-LHQW', { name: '连花清瘟胶囊', aliasName: 'MED-2026-T037;连花清瘟胶囊(颗粒)', sdDoseForm: 'CAPSULE', preparationSpec: '每粒装 0.35g', standardSpecificationId: 'STD-DB94FBD10A73BE90DAB5D69F' }],
  ['MED-2026-W186-01', { name: '左氨氯地平片（苯磺酸盐）', aliasName: 'Levamlodipine;左氨氯地平', sdDoseForm: 'TABLET', preparationSpec: '2.5mg', standardSpecificationId: 'STD-A3832E968BCF6F87EF8919E2' }],
  ['MED-2026-W186-02', { name: '左氨氯地平片（苯磺酸盐）', aliasName: 'Levamlodipine;左氨氯地平', sdDoseForm: 'TABLET', preparationSpec: '5mg', standardSpecificationId: 'STD-B518E78CBBB5D203807B71AE' }],
  ['MED-2026-W186-03', { name: '左氨氯地平片（马来酸盐）', aliasName: 'Levamlodipine;左氨氯地平', sdDoseForm: 'TABLET', preparationSpec: '2.5mg', standardSpecificationId: 'STD-6DD3DFF23EFA1E57E9117903' }],
  ['MED-2026-W343-05', { name: '阿法骨化醇软胶囊', aliasName: 'Alfacalcidol;阿法骨化醇', sdDoseForm: 'SOFT_CAPSULE', preparationSpec: '0.25μg', standardSpecificationId: 'STD-9C3A4572A9F097AFA2AC7467' }],
  ['MED-2026-W343-06', { name: '阿法骨化醇软胶囊', aliasName: 'Alfacalcidol;阿法骨化醇', sdDoseForm: 'SOFT_CAPSULE', preparationSpec: '0.5μg', standardSpecificationId: 'STD-3BC004B97A1FF885B580969A' }],
  ['MED-2026-T179-01', { name: '正清风痛宁缓释片', aliasName: 'ZQFTNHSPPCRP;正清风痛宁;青藤碱', sdDoseForm: 'EXTENDED_RELEASE_TABLET', preparationSpec: '每片含盐酸青藤碱 60mg', standardSpecificationId: 'STD-D07084BAA15BCF822839B425' }],
  ['MED-2026-T179-02', { name: '正清风痛宁片', aliasName: 'ZQFTNHSPPCRP;正清风痛宁;青藤碱', sdDoseForm: 'TABLET', preparationSpec: '每片含盐酸青藤碱20mg', standardSpecificationId: 'STD-96D0D65D38EB98A6657864CE' }],
  ['MED-2026-T179-03', { name: '正清风痛宁肠溶片', aliasName: 'ZQFTNHSPPCRP;正清风痛宁;青藤碱', sdDoseForm: 'ENTERIC_TABLET', preparationSpec: '每片含盐酸青藤碱 20mg', standardSpecificationId: 'STD-69B0A60BBE032B60F9FA7927' }],
])

function medicationUpdate(medication, correction) {
  const clearAdministration = incompatibleRoute(medication.defaultRoute, correction.sdDoseForm)
  return {
    expectedRevision: medication.revision,
    code: medication.code,
    name: correction.name,
    aliasName: correction.aliasName,
    sdMedicationType: medication.sdMedicationType,
    sdDoseForm: correction.sdDoseForm,
    preparationSpec: correction.preparationSpec,
    preparationUnit: medication.preparationUnit,
    strengthValue: medication.strengthValue,
    strengthUnit: medication.strengthUnit,
    sdStorageType: medication.sdStorageType === 'NORMAL' ? null : medication.sdStorageType,
    prescriptionDrug: medication.prescriptionDrug,
    essentialDrug: medication.essentialDrug,
    antimicrobial: medication.antimicrobial,
    sdAntimicrobialLevel: medication.sdAntimicrobialLevel,
    antimicrobialOutpatientAllowed: medication.antimicrobialOutpatientAllowed,
    antimicrobialConsultationRequired: medication.antimicrobialConsultationRequired,
    antimicrobialEmergencyAllowed: medication.antimicrobialEmergencyAllowed,
    antimicrobialMaxDays: medication.antimicrobialMaxDays,
    skinTestRequired: medication.skinTestRequired,
    skinTestMethod: medication.skinTestMethod,
    skinTestSolutionMode: medication.skinTestSolutionMode,
    skinTestObservationMinutes: medication.skinTestObservationMinutes,
    skinTestResultValidityHours: medication.skinTestResultValidityHours,
    skinTestInstructions: medication.skinTestInstructions,
    defaultDose: medication.defaultDose,
    defaultDoseUnit: medication.defaultDoseUnit,
    defaultRoute: clearAdministration ? null : medication.defaultRoute,
    defaultFrequency: clearAdministration ? null : medication.defaultFrequency,
    chronicDiseaseDrug: medication.chronicDiseaseDrug,
    singleOrder: medication.singleOrder,
    sdStatus: medication.sdStatus,
    standardSpecificationId: correction.standardSpecificationId,
  }
}

function incompatibleRoute(route, doseForm) {
  if (!route) return false
  const nonOral = ['INJECTION', 'INHAL', 'EYE', 'OPHTH', 'OTIC', 'NASAL', 'RECTAL', 'VAGINAL', 'TOPICAL', 'PATCH', 'PLASTER']
  const oral = new Set(['TABLET', 'CAPSULE', 'SOFT_CAPSULE', 'PILL', 'DROPPING_PILL', 'GRANULE', 'ORAL_SOLUTION', 'MIXTURE', 'SYRUP'])
  if (route === 'ORAL') return nonOral.some(value => doseForm.includes(value))
  if (['IV', 'IVGTT', 'IM', 'SC', 'ID'].includes(route)) return oral.has(doseForm)
  return false
}

function isOnlyDoseFormMismatch(candidate) {
  const differences = new Set((candidate.issues ?? []).filter(value => value !== 'STANDARD_REFERENCE_IDENTITY_MISMATCH'))
  return differences.size === 1 && differences.has('STANDARD_REFERENCE_FORM_MISMATCH')
}

async function medicationByCode(code) {
  const values = await api('GET', `/api/platform/master-data/medications?query=${encodeURIComponent(code)}`)
  return values.find(value => value.code === code)
}

async function normalizeCuratedMedication(code, correction) {
  const matches = await api('GET', `/api/platform/master-data/medications?query=${encodeURIComponent(code)}`)
  const medication = matches.find(value => value.code === code)
  if (!medication) return { code, status: 'MISSING' }
  const unchanged = medication.name === correction.name
    && medication.sdDoseForm === correction.sdDoseForm
    && medication.preparationSpec === correction.preparationSpec
  if (unchanged) return { code, status: 'UNCHANGED' }
  if (!apply) return { code, status: 'WOULD_NORMALIZE' }
  await api('PUT', `/api/platform/master-data/medications/${medication.id}`, medicationUpdate(medication, correction))
  return { code, status: 'NORMALIZED' }
}

async function bind(row, current) {
  if (!current) return { code: row.code, status: 'MISSING' }
  const reference = current.standardReference ?? {}
  if (reference.status === 'LINKED') {
    return { code: row.code, status: reference.specificationId === row.specificationId ? 'UNCHANGED' : 'CONFLICT' }
  }
  if (!apply) return { code: row.code, status: 'WOULD_BIND' }
  let preview = await api('GET', `/api/platform/master-data/medications/${current.medicationId}/standard-binding`)
  let candidate = preview.candidates.find(value => value.specification.id === row.specificationId)
  let doseFormNormalized = false
  if (candidate && !candidate.canBind && isOnlyDoseFormMismatch(candidate)) {
    const medication = await medicationByCode(row.code)
    if (!medication) return { code: row.code, status: 'MISSING' }
    await api('PUT', `/api/platform/master-data/medications/${medication.id}`, medicationUpdate(medication, {
      name: medication.name,
      aliasName: medication.aliasName,
      sdDoseForm: candidate.specification.doseForm,
      preparationSpec: medication.preparationSpec,
      standardSpecificationId: row.specificationId,
    }))
    doseFormNormalized = true
    preview = await api('GET', `/api/platform/master-data/medications/${current.medicationId}/standard-binding`)
    candidate = preview.candidates.find(value => value.specification.id === row.specificationId)
  }
  if (!candidate?.canBind) return { code: row.code, status: 'NOT_ELIGIBLE' }
  await api('POST', `/api/platform/master-data/medications/${current.medicationId}/standard-binding`, {
    expectedRevision: preview.medication.revision,
    identity: preview.identity,
    specificationId: row.specificationId,
    reason: '按受控基础数据清单恢复标准药品关联；已核对药品类型、剂型、规格、制剂单位和目录身份',
    confirmedIdentity: true,
  })
  return { code: row.code, status: doseFormNormalized ? 'DOSE_FORM_NORMALIZED_AND_BOUND' : 'BOUND' }
}

function count(results) {
  return Object.fromEntries([...results.reduce((map, value) => map.set(value.status, (map.get(value.status) ?? 0) + 1), new Map())])
}

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const desiredBindings = [...manifest.bindings]
for (const [code, correction] of normalizations) {
  if (!desiredBindings.some(value => value.code === code)) {
    desiredBindings.push({ code, specificationId: correction.standardSpecificationId })
  }
}
const catalog = await api('GET', '/api/platform/master-data/medication-standard-catalog/summary')
if (catalog.catalogId !== manifest.catalog.catalogId
    || catalog.catalogVersion !== manifest.catalog.catalogVersion
    || catalog.contentHash !== manifest.catalog.contentHash) {
  throw new Error('标准目录身份与基础清单不一致，停止恢复；请先重新核对并生成新清单')
}

const normalizationResults = []
for (const [code, correction] of normalizations) {
  normalizationResults.push(await normalizeCuratedMedication(code, correction))
}

const before = await readiness()
const currentByCode = new Map(before.rows.map(value => [value.code, value]))
const bindingResults = []
for (const row of desiredBindings) {
  bindingResults.push(await bind(row, currentByCode.get(row.code)))
}

const after = apply ? await readiness() : before
console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY_RUN',
  catalog: manifest.catalog,
  manifestBindings: desiredBindings.length,
  normalizations: count(normalizationResults),
  bindings: count(bindingResults),
  readiness: after.summary,
}, null, 2))
