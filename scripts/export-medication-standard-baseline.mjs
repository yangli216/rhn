import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(root, 'docs/architecture/rational-medication/标准药品关联基线-2026-09-22.json')
const baseUrl = process.env.RHN_API_URL ?? 'http://127.0.0.1:8080'
const username = process.env.RHN_DEV_USERNAME ?? 'doctor'
const password = process.env.RHN_DEV_PASSWORD ?? 'rhn-dev-2026'
const tenantId = process.env.RHN_TENANT_ID ?? '362387869790209'
const organizationId = process.env.RHN_ORGANIZATION_ID ?? '362387869790211'
const departmentId = process.env.RHN_DEPARTMENT_ID ?? '362387869790212'

const headers = {
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  'X-Tenant-Id': tenantId,
  'X-Organization-Id': organizationId,
  'X-Department-Id': departmentId,
  'X-Client-Session-Id': '71c2a87e-b38d-45ac-9d60-c83ce67f2211',
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

const catalog = await api('/api/platform/master-data/medication-standard-catalog/summary')
const current = await readiness()
const invalidStatuses = Object.entries(current.summary.referenceStatuses)
  .filter(([status, count]) => status !== 'LINKED' && status !== 'UNMAPPED' && count > 0)
if (invalidStatuses.length) throw new Error(`存在不可固化的标准关联状态：${JSON.stringify(invalidStatuses)}`)

const bindings = current.rows
  .filter(row => row.standardReference.status === 'LINKED')
  .map(row => {
    const reference = row.standardReference
    return {
      medicationId: row.medicationId,
      code: row.code,
      name: row.name,
      preparationSpec: row.preparationSpec,
      bindingStatus: reference.status,
      catalogId: reference.catalogId,
      catalogVersion: reference.catalogVersion,
      contentHash: reference.contentHash,
      entryId: reference.entryId,
      specificationId: reference.specificationId,
      semanticVersion: reference.semanticVersion,
      standardName: reference.name,
      standardDoseForm: reference.doseForm,
      standardSpec: reference.preparationSpec,
      presentationUnit: reference.presentationUnit,
      sourceVerificationStatus: reference.sourceVerificationStatus,
    }
  })
  .sort((left, right) => left.code.localeCompare(right.code) || left.specificationId.localeCompare(right.specificationId))

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  scope: 'TENANT_ACTIVE_MEDICATIONS',
  catalog: {
    catalogId: catalog.catalogId,
    catalogVersion: catalog.catalogVersion,
    contentHash: catalog.contentHash,
  },
  bindingCount: bindings.length,
  bindings,
}

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ outputPath, bindingCount: bindings.length, readiness: current.summary }, null, 2))
