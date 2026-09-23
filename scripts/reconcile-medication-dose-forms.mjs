import process from 'node:process'

const baseUrl = process.env.RHN_API_URL ?? 'http://127.0.0.1:8080'
const username = process.env.RHN_DEV_USERNAME ?? 'doctor'
const password = process.env.RHN_DEV_PASSWORD ?? 'rhn-dev-2026'
const tenantId = process.env.RHN_TENANT_ID ?? '362387869790209'
const organizationId = process.env.RHN_ORGANIZATION_ID ?? '362387869790211'
const departmentId = process.env.RHN_DEPARTMENT_ID ?? '362387869790212'
const apply = process.argv.includes('--apply')
const concurrency = Number(process.env.RHN_STANDARD_CONCURRENCY ?? 8)

const headers = {
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  'X-Tenant-Id': tenantId,
  'X-Organization-Id': organizationId,
  'X-Department-Id': departmentId,
  'X-Client-Session-Id': 'b9422c42-11d7-475e-8363-afd7262c8b9f',
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
  let summary
  for (let page = 0; ; page += 1) {
    const result = await api('GET', `/api/platform/master-data/clinical-semantics/readiness?page=${page}&size=100`)
    rows.push(...result.content)
    summary = result.summary
    if (page + 1 >= result.totalPages) return { rows, summary }
  }
}

function differenceCodes(candidate) {
  return new Set((candidate.issues ?? []).filter(value => value !== 'STANDARD_REFERENCE_IDENTITY_MISMATCH'))
}

function isOnlyDoseFormMismatch(candidate) {
  const differences = differenceCodes(candidate)
  return differences.size === 1 && differences.has('STANDARD_REFERENCE_FORM_MISMATCH')
}

function incompatibleRoute(route, doseForm) {
  if (!route) return false
  const nonOral = ['INJECTION', 'INHAL', 'EYE', 'OPHTH', 'OTIC', 'NASAL', 'RECTAL', 'VAGINAL', 'TOPICAL', 'PATCH', 'PLASTER']
  const oral = new Set(['TABLET', 'CAPSULE', 'SOFT_CAPSULE', 'PILL', 'DROPPING_PILL', 'GRANULE', 'ORAL_SOLUTION', 'MIXTURE', 'SYRUP'])
  if (route === 'ORAL') return nonOral.some(value => doseForm.includes(value))
  if (['IV', 'IVGTT', 'IM', 'SC', 'ID'].includes(route)) return oral.has(doseForm)
  return false
}

function updateRequest(medication, specification) {
  const clearAdministration = incompatibleRoute(medication.defaultRoute, specification.doseForm)
  return {
    expectedRevision: medication.revision,
    code: medication.code,
    name: medication.name,
    aliasName: medication.aliasName,
    sdMedicationType: medication.sdMedicationType,
    sdDoseForm: specification.doseForm,
    preparationSpec: medication.preparationSpec,
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
    standardSpecificationId: specification.id,
  }
}

async function medicationByCode(code) {
  const values = await api('GET', `/api/platform/master-data/medications?query=${encodeURIComponent(code)}`)
  return values.find(value => value.code === code)
}

async function inspect(row) {
  const preview = await api('GET', `/api/platform/master-data/medications/${row.medicationId}/standard-binding`)
  const eligible = preview.candidates.filter(isOnlyDoseFormMismatch)
  if (eligible.length !== 1) return { code: row.code, status: 'NOT_UNIQUE', candidateCount: eligible.length }
  const candidate = eligible[0]
  return {
    code: row.code,
    medicationId: row.medicationId,
    status: 'READY',
    fromDoseForm: preview.medication.doseForm,
    toDoseForm: candidate.specification.doseForm,
    specificationId: candidate.specification.id,
    specification: candidate.specification,
  }
}

async function correct(item) {
  if (!apply) return { ...item, status: 'WOULD_CORRECT' }
  const medication = await medicationByCode(item.code)
  if (!medication) return { ...item, status: 'MISSING' }
  const input = updateRequest(medication, item.specification)
  const routeCleared = input.defaultRoute !== medication.defaultRoute
  await api('PUT', `/api/platform/master-data/medications/${medication.id}`, input)
  const preview = await api('GET', `/api/platform/master-data/medications/${medication.id}/standard-binding`)
  const candidate = preview.candidates.find(value => value.canBind && value.specification.id === item.specificationId)
  if (!candidate) return { ...item, status: 'NOT_ELIGIBLE_AFTER_UPDATE', routeCleared }
  await api('POST', `/api/platform/master-data/medications/${medication.id}/standard-binding`, {
    expectedRevision: preview.medication.revision,
    identity: preview.identity,
    specificationId: item.specificationId,
    reason: '依据标准目录原文修正历史导入的宽泛剂型；药品类型、规格和制剂单位已一致核对',
    confirmedIdentity: true,
  })
  return { ...item, status: 'CORRECTED_AND_BOUND', routeCleared }
}

async function pool(values, worker) {
  const results = new Array(values.length)
  let cursor = 0
  async function run() {
    for (;;) {
      const index = cursor++
      if (index >= values.length) return
      try {
        results[index] = await worker(values[index])
      } catch (error) {
        results[index] = { code: values[index].code, status: 'ERROR', error: error.message }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run))
  return results
}

function count(results, field = 'status') {
  const counts = new Map()
  for (const value of results) counts.set(value[field], (counts.get(value[field]) ?? 0) + 1)
  return Object.fromEntries(counts)
}

const before = await readiness()
const mismatches = before.rows.filter(value => value.matching?.status === 'IDENTITY_MISMATCH')
const inspected = await pool(mismatches, inspect)
const ready = inspected.filter(value => value.status === 'READY')
const corrected = await pool(ready, correct)
const after = apply ? await readiness() : before

console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY_RUN',
  before: before.summary,
  inspected: count(inspected),
  corrections: count(corrected),
  routeAndFrequencyCleared: corrected.filter(value => value.routeCleared).length,
  after: after.summary,
  failures: corrected.filter(value => ['ERROR', 'MISSING', 'NOT_ELIGIBLE_AFTER_UPDATE'].includes(value.status)),
}, null, 2))
