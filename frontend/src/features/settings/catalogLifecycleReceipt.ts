import { z } from 'zod'
import type { CatalogLifecycle, CatalogPrice, LifecycleAdoptionInput, LifecyclePriceInput, OrganizationAdoption } from '../../shared/rhnApi'
import { requireCatalogLifecycle } from './catalogLifecycleFacts'

type Status = 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
export type CatalogLifecycleCommand =
  | { kind: 'adoption-save'; input: LifecycleAdoptionInput; replaced?: OrganizationAdoption }
  | { kind: 'price-save'; input: LifecyclePriceInput; replaced?: CatalogPrice }
  | { kind: 'adoption-status'; original: OrganizationAdoption; status: Status; validTo?: string }
  | { kind: 'price-status'; original: CatalogPrice; status: Status; validTo?: string }
type Row = OrganizationAdoption | CatalogPrice
const capabilities = ['orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable'] as const
const adoptionFields = ['organizationId', 'catalogItemId', 'defaultDepartmentId', 'localCode', 'localName', ...capabilities,
  'validFrom', 'validTo', 'sdStatus', 'replacesAdoptionId'] as const
const priceFields = ['organizationId', 'packageId', 'sdPriceType', 'price', 'currencyCode', 'priceDocumentCode', 'priceReason',
  'validFrom', 'validTo', 'sdStatus', 'replacesPriceId'] as const
const normalized = (value: unknown) => value == null || value === '' ? null : value
const text = (value?: string | null) => value?.trim() || null
function fieldsEqual(a: object, b: object, fields: readonly string[]) {
  return fields.every(key => normalized((a as Record<string, unknown>)[key]) === normalized((b as Record<string, unknown>)[key]))
}
const rowFields = (adoption: boolean) => adoption ? adoptionFields : priceFields
function sameRow(a: Row, b: Row, adoption: boolean, ignored: string[] = []) {
  return fieldsEqual(a, b, ['id', 'revision', 'sdStatusText', ...rowFields(adoption)].filter(key => !ignored.includes(key)))
}
function previousDate(value: string) {
  const result = new Date(`${value}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() - 1)
  return result.toISOString().slice(0, 10)
}
function savedFields(command: Extract<CatalogLifecycleCommand, { input: unknown }>, catalogItemId: string) {
  if (command.kind === 'adoption-save') {
    const input = command.input
    return { ...input, catalogItemId, sdStatus: input.status, localCode: text(input.localCode), localName: text(input.localName),
      defaultDepartmentId: input.defaultDepartmentId ?? null, replacesAdoptionId: command.replaced?.id ?? null }
  }
  const input = command.input
  return { ...input, sdPriceType: input.priceType, sdStatus: input.status, currencyCode: input.currencyCode.trim(),
    priceDocumentCode: text(input.priceDocumentCode), priceReason: text(input.priceReason), replacesPriceId: command.replaced?.id ?? null }
}
function existing(before: CatalogLifecycle, command: CatalogLifecycleCommand): Row[] {
  return command.kind.startsWith('adoption') ? before.adoptionHistory : before.priceHistory
}
export function assertCatalogLifecycleCommand(before: CatalogLifecycle, command: CatalogLifecycleCommand) {
  const history = existing(before, command), adoption = command.kind.startsWith('adoption')
  const original = 'original' in command ? command.original : command.replaced
  if (original && (original.organizationId !== before.organizationId
    || !history.some(row => row.id === original.id && sameRow(row, original, adoption)))) {
    throw new Error('原版本已变化或不属于本机构，请重新核实后操作')
  }
  if ('input' in command) {
    const input = command.input
    if (input.organizationId !== before.organizationId || !z.iso.date().safeParse(input.validFrom).success
      || (input.validTo != null && (!z.iso.date().safeParse(input.validTo).success || input.validTo < input.validFrom))) {
      throw new Error('机构或生效日期不正确，请核实本次输入')
    }
    if (command.kind === 'adoption-save' && capabilities.some(key => typeof command.input[key] !== 'boolean')) {
      throw new Error('机构业务能力不完整，请核实本次输入')
    }
    if (command.kind === 'price-save') {
      if (!Number.isFinite(command.input.price) || command.input.price < 0 || !command.input.currencyCode.trim() || !command.input.priceType.trim()) {
        throw new Error('金额、币种或价格类型不正确，请核实本次输入')
      }
      if (command.replaced && (normalized(command.input.packageId) !== normalized(command.replaced.packageId)
        || command.input.priceType !== command.replaced.sdPriceType)) throw new Error('调价必须保持原包装和价格类型')
    }
    if (original && (input.validFrom <= original.validFrom || (original.validTo && previousDate(input.validFrom) > original.validTo))) {
      throw new Error('替代生效日期必须晚于原版本且有效期连续')
    }
    if (!original && history.some(row => fieldsEqual(row, savedFields(command, before.catalogItemId), rowFields(adoption)))) {
      throw new Error('历史中已有与本次输入一致的记录，请核实已有结果，不要重复新增')
    }
  } else {
    if (command.status === command.original.sdStatus) throw new Error('记录已是目标状态，请核实当前版本')
    if (command.status === 'RETIRED' && (!command.validTo || !z.iso.date().safeParse(command.validTo).success
      || command.validTo < command.original.validFrom)) throw new Error('停用日期不能早于原版本生效日期')
  }
}
export function requireCatalogLifecycleReceipt(source: unknown, before: CatalogLifecycle, command: CatalogLifecycleCommand,
  responseDate: string, sourceOrganizationId?: string | null): CatalogLifecycle {
  assertCatalogLifecycleCommand(before, command)
  const value = requireCatalogLifecycle(source, { catalogItemId: before.catalogItemId, organizationId: before.organizationId!,
    businessDate: responseDate, sourceOrganizationId })
  const fail = (): never => { throw new Error('保存回执未确认本次字段、版本或完整历史，请重新核实目录与价格') }
  const oldRows = existing(before, command), newRows = existing(value, command), adoption = command.kind.startsWith('adoption')
  const untouchedBefore = command.kind.startsWith('adoption') ? before.priceHistory : before.adoptionHistory
  const untouchedAfter = command.kind.startsWith('adoption') ? value.priceHistory : value.adoptionHistory
  if (untouchedBefore.length !== untouchedAfter.length || untouchedBefore.some(old =>
    !untouchedAfter.some(row => row.id === old.id && sameRow(row, old, !adoption)))) return fail()
  const original = 'original' in command ? command.original : command.replaced
  if (newRows.length !== oldRows.length + ('input' in command ? 1 : 0)) return fail()
  for (const old of oldRows) {
    const current = newRows.find(row => row.id === old.id)
    if (!current) return fail()
    if (old.id !== original?.id) {
      if (!sameRow(current, old, adoption)) return fail()
    } else {
      const expectedStatus = 'input' in command ? 'REPLACED' : command.status
      const expectedEnd = 'input' in command ? previousDate(command.input.validFrom)
        : command.status === 'RETIRED' ? command.validTo : old.validTo
      if (current.revision <= old.revision || current.sdStatus !== expectedStatus || normalized(current.validTo) !== normalized(expectedEnd)
        || !sameRow(current, old, adoption, ['revision', 'sdStatus', 'sdStatusText', 'validTo'])) return fail()
    }
  }
  if ('input' in command) {
    const added = newRows.filter(row => !oldRows.some(old => old.id === row.id))
    if (added.length !== 1 || !fieldsEqual(added[0], savedFields(command, before.catalogItemId), rowFields(adoption))) return fail()
  }
  return value
}

export function requirePersistedCatalogReceipt(receipt: CatalogLifecycle, persisted: CatalogLifecycle) {
  for (const key of ['adoptionHistory', 'priceHistory'] as const) {
    if (receipt[key].length !== persisted[key].length || receipt[key].some(row =>
      !persisted[key].some(actual => actual.id === row.id && sameRow(actual, row, key === 'adoptionHistory')))) {
      throw new Error('重新读取的实际记录与保存回执不一致，请核实本次变更')
    }
  }
}
