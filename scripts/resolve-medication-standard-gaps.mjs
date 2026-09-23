import process from 'node:process'

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
  'X-Client-Session-Id': '8c9e1b6f-4426-42c3-8ccb-27bb7eb46e8c',
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

const before = await readiness()
const targets = before.rows.filter(row => row.matching?.status === 'UNIQUE_MATCH')
const results = []
for (const row of targets) {
  try {
    const preview = await api('GET', `/api/platform/master-data/medications/${row.medicationId}/standard-binding`)
    const eligible = preview.candidates.filter(candidate => candidate.canBind && candidate.issues.length === 0)
    if (eligible.length !== 1) {
      results.push({ code: row.code, status: 'SKIPPED_NOT_UNIQUE_AT_BIND', eligible: eligible.length })
      continue
    }
    const specificationId = eligible[0].specification.id
    if (apply) {
      await api('POST', `/api/platform/master-data/medications/${row.medicationId}/standard-binding`, {
        expectedRevision: preview.medication.revision,
        identity: preview.identity,
        specificationId,
        reason: '依据标准目录核对药品名称、剂型、规格及单位；仅存在符号规范差异或名称已明确缓释/肠溶属性',
        confirmedIdentity: true,
      })
    }
    results.push({ code: row.code, medicationId: row.medicationId, specificationId, status: apply ? 'BOUND' : 'WOULD_BIND' })
  } catch (error) {
    results.push({ code: row.code, medicationId: row.medicationId, status: 'ERROR', error: error.message })
  }
}

const after = apply ? await readiness() : before
const counts = results.reduce((value, item) => {
  value[item.status] = (value[item.status] ?? 0) + 1
  return value
}, {})
console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', before: before.summary, actions: counts, errors: results.filter(item => item.status === 'ERROR'), after: after.summary }, null, 2))
