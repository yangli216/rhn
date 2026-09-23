import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'docs/architecture/rational-medication/退役历史药品清单-2026-09-23.json')
const baseUrl = process.env.RHN_API_URL ?? 'http://127.0.0.1:8080'
const username = process.env.RHN_DEV_USERNAME ?? 'doctor'
const password = process.env.RHN_DEV_PASSWORD ?? 'rhn-dev-2026'
const tenantId = process.env.RHN_TENANT_ID ?? '362387869790209'
const organizationId = process.env.RHN_ORGANIZATION_ID ?? '362387869790211'
const departmentId = process.env.RHN_DEPARTMENT_ID ?? '362387869790212'
const apply = process.argv.includes('--apply')

const headers = {
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  'X-Tenant-Id': tenantId,
  'X-Organization-Id': organizationId,
  'X-Department-Id': departmentId,
  'X-Client-Session-Id': '48ca06f7-37bc-4860-9d5a-65b42066bd43',
}

async function api(method, endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const value = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${method} ${endpoint} -> ${response.status} ${value?.code ?? ''} ${value?.message ?? text}`)
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

async function medication(code) {
  const result = await api('GET', `/api/platform/master-data/medications?query=${encodeURIComponent(code)}`)
  return result.find(item => item.code === code)
}

const before = await readiness()
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
if (manifest.recordCount !== manifest.records.length || new Set(manifest.records.map(row => row.code)).size !== manifest.records.length) {
  throw new Error('退役清单数量或药品编码唯一性校验失败')
}
const results = []
for (const row of manifest.records) {
  try {
    const current = await medication(row.code)
    if (!current || current.sdStatus !== 'ACTIVE') {
      results.push({ code: row.code, status: current ? 'ALREADY_NOT_ACTIVE' : 'MISSING' })
      continue
    }
    if (apply) {
      await api('POST', `/api/platform/master-data/medications/${current.id}/status`, {
        expectedRevision: current.revision,
        sdStatus: 'RETIRED',
      })
    }
    results.push({ code: row.code, medicationId: current.id, classification: row.classification, status: apply ? 'QUARANTINED' : 'WOULD_QUARANTINE' })
  } catch (error) {
    results.push({ code: row.code, status: 'ERROR', error: error.message })
  }
}

const after = apply ? await readiness() : before
const counts = results.reduce((value, item) => {
  value[item.status] = (value[item.status] ?? 0) + 1
  return value
}, {})
console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', before: before.summary, actions: counts,
  errors: results.filter(item => item.status === 'ERROR'), after: after.summary }, null, 2))
