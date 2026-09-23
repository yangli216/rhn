import process from 'node:process'

const baseUrl = process.env.RHN_API_URL ?? 'http://127.0.0.1:8080'
const username = process.env.RHN_DEV_USERNAME ?? 'doctor'
const password = process.env.RHN_DEV_PASSWORD ?? 'rhn-dev-2026'
const tenantId = process.env.RHN_TENANT_ID ?? '362387869790209'
const organizationId = process.env.RHN_ORGANIZATION_ID ?? '362387869790211'
const departmentId = process.env.RHN_DEPARTMENT_ID ?? '362387869790212'
const concurrency = Number(process.env.RHN_STANDARD_CONCURRENCY ?? 8)

const headers = {
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  'X-Tenant-Id': tenantId,
  'X-Organization-Id': organizationId,
  'X-Department-Id': departmentId,
  'X-Client-Session-Id': '5c8a0a68-44c0-4d20-9f42-b6c274d233ae',
}

async function api(endpoint) {
  const response = await fetch(`${baseUrl}${endpoint}`, { headers })
  const text = await response.text()
  const value = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`GET ${endpoint} -> ${response.status} ${value?.message ?? text}`)
  return value
}

async function readiness() {
  const rows = []
  let summary
  for (let page = 0; ; page += 1) {
    const result = await api(`/api/platform/master-data/clinical-semantics/readiness?page=${page}&size=100`)
    rows.push(...result.content)
    summary = result.summary
    if (page + 1 >= result.totalPages) return { rows, summary }
  }
}

async function pool(values, worker) {
  const results = new Array(values.length)
  let cursor = 0
  async function run() {
    for (;;) {
      const index = cursor++
      if (index >= values.length) return
      results[index] = await worker(values[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run))
  return results
}

function specificIssues(candidate) {
  return (candidate.issues ?? []).filter(issue => issue !== 'STANDARD_REFERENCE_IDENTITY_MISMATCH').sort()
}

function classify(row, preview, candidates) {
  if (!candidates.length) return row.matching?.status === 'NO_CANDIDATE' ? 'CATALOG_COVERAGE_GAP' : 'NO_USABLE_CANDIDATE'
  const bestIssueCount = Math.min(...candidates.map(candidate => candidate.issues.length))
  const best = candidates.filter(candidate => candidate.issues.length === bestIssueCount)
  if (best.some(candidate => candidate.issues.some(issue => issue.startsWith('STANDARD_SPECIFICATION_') || issue.startsWith('STANDARD_SOURCE_') || issue.startsWith('STANDARD_COMPOSITION_'))))
    return 'STANDARD_SPECIFICATION_REVIEW'
  if (best.length > 1) return 'AMBIGUOUS_CANDIDATES'
  const issues = new Set(best[0].issues)
  if ([...issues].every(issue => ['STANDARD_REFERENCE_FORM_MISMATCH', 'STANDARD_REFERENCE_SPEC_MISMATCH', 'STANDARD_REFERENCE_UNIT_MISMATCH'].includes(issue)))
    return 'LOCAL_IDENTITY_CORRECTION'
  if (issues.has('STANDARD_REFERENCE_QUALIFIER_MISSING') || issues.has('STANDARD_REFERENCE_QUALIFIER_MISMATCH'))
    return 'NAME_QUALIFIER_REVIEW'
  return 'MANUAL_IDENTITY_REVIEW'
}

const current = await readiness()
const gaps = current.rows.filter(row => row.standardReference.status !== 'LINKED')
const details = await pool(gaps, async row => {
  const preview = await api(`/api/platform/master-data/medications/${row.medicationId}/standard-binding`)
  const candidates = preview.candidates.map(candidate => ({
    specificationId: candidate.specification.id,
    entryId: candidate.specification.entryId,
    name: candidate.specification.name,
    doseForm: candidate.specification.doseForm,
    doseFormName: candidate.specification.doseFormName,
    specification: candidate.specification.specification,
    presentationUnit: candidate.specification.presentationUnit,
    orderable: candidate.specification.orderable,
    canBind: candidate.canBind,
    issues: specificIssues(candidate),
  })).sort((left, right) => left.issues.length - right.issues.length || left.specificationId.localeCompare(right.specificationId))
  return {
    medicationId: row.medicationId,
    code: row.code,
    name: preview.medication.name,
    medicationType: preview.medication.medicationType,
    doseForm: preview.medication.doseForm,
    preparationSpec: preview.medication.preparationSpec,
    presentationUnit: preview.medication.presentationUnit,
    matchingStatus: row.matching?.status,
    classification: classify(row, preview, candidates),
    candidates,
  }
})

const counts = details.reduce((result, row) => {
  result[row.classification] = (result[row.classification] ?? 0) + 1
  return result
}, {})
const issueCombinations = details.flatMap(row => row.candidates.slice(0, 1).map(candidate => candidate.issues.join('+') || 'NONE'))
  .reduce((result, signature) => {
    result[signature] = (result[signature] ?? 0) + 1
    return result
  }, {})

console.log(JSON.stringify({ inspectedAt: new Date().toISOString(), summary: current.summary, counts, issueCombinations, details }, null, 2))
