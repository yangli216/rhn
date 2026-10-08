import type { ItemAttributeMaintenance, ItemAttributeSchema } from '../../shared/api/masterDataApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { assertAttributeMaintenance, parseAttributeRaw } from './ItemAttributeValueEditor'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

export async function saveMasterDataAttributes({ api, subjectType, targetId, organizationId, maintenance, values,
  date, requests, onConfirmed }: {
  api: RhnApi; subjectType: 'MEDICATION' | 'CATALOG_ITEM'; targetId: string; organizationId?: string
  maintenance: ItemAttributeMaintenance; values: Record<string, string>; date: string
  requests: Map<string, string>
  onConfirmed: (attribute: ItemAttributeSchema, snapshot: ItemAttributeMaintenance) => void
}) {
  // Validate all drafts before the first write. Each confirmed response then advances the local revision.
  const changes = maintenance.schema.attributes.filter((attr) => attr.storageMode !== 'PROJECTED'
    && values[attr.definitionId] !== undefined).map((attr) => ({ attr, value: parseAttributeRaw(values[attr.definitionId], attr) }))
  for (const { attr } of changes) {
    if (attr.variability !== 'BASE_ONLY' && !organizationId) throw new Error('缺少机构上下文，不能保存机构扩展属性')
  }
  let snapshot = maintenance
  for (const { attr, value } of changes) {
    const base = snapshot.baseValues.find((item) => item.definitionId === attr.definitionId)
    const override = snapshot.overrides.find((item) => item.definitionId === attr.definitionId
      && item.scopeType === 'ORGANIZATION' && item.organizationId === organizationId)
    const effective = attr.variability !== 'BASE_ONLY' && override ? (override.valueMode === 'EXPLICIT_NULL' ? null : override.value)
      : base ? base.value : attr.defaultValue
    if (canonical(value) === canonical(effective)) continue
    const common = { subjectType, targetId, definitionId: attr.definitionId, value,
      reason: '主档编辑维护扩展属性' }
    const command = attr.variability === 'BASE_ONLY'
      ? { ...common, valueId: base?.id, expectedRevision: base?.revision,
        validFrom: base?.validFrom ?? date, validTo: base?.validTo }
      : { ...common, overrideId: override?.id, expectedRevision: override?.revision,
        scopeType: 'ORGANIZATION' as const, organizationId: organizationId!, valueMode: 'OVERRIDE' as const,
        validFrom: override?.validFrom ?? date, validTo: override?.validTo }
    const fingerprint = canonical(command)
    const requestCode = requests.get(fingerprint) ?? crypto.randomUUID()
    requests.set(fingerprint, requestCode)
    try {
      const result = 'scopeType' in command
        ? await api.masterData.saveItemAttributeOverride({ ...command, requestCode })
        : await api.masterData.saveItemAttributeValue({ ...command, requestCode })
      assertAttributeMaintenance(result)
      const saved = attr.variability === 'BASE_ONLY'
        ? result.baseValues.find((item) => item.definitionId === attr.definitionId)
        : result.overrides.find((item) => item.definitionId === attr.definitionId
          && item.scopeType === 'ORGANIZATION' && item.organizationId === organizationId && item.valueMode === 'OVERRIDE')
      if (!saved?.id || saved.status !== 'ACTIVE' || !Number.isInteger(saved.revision) || saved.revision < 0
        || canonical(saved.value) !== canonical(value)) {
        throw new Error('服务端未返回已保存的属性值和版本，请重试核实')
      }
      // A save response may be evaluated at the record's validFrom date. Merge only the confirmed record.
      snapshot = attr.variability === 'BASE_ONLY'
        ? { ...snapshot, baseValues: [...snapshot.baseValues.filter((item) => item.definitionId !== attr.definitionId),
          ...result.baseValues.filter((item) => item.id === saved.id)] }
        : { ...snapshot, overrides: [...snapshot.overrides.filter((item) => !(item.definitionId === attr.definitionId
          && item.scopeType === 'ORGANIZATION' && item.organizationId === organizationId)),
          ...result.overrides.filter((item) => item.id === saved.id)] }
      onConfirmed(attr, snapshot)
    } catch (error) {
      throw new Error(`扩展属性“${attr.name}”保存未确认：${errorMessage(error)}。主档尚未保存，请重试。`)
    }
  }
}
