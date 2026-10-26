import { z } from 'zod'
import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import type { ServicePlanDraft } from './orderDraftTypes'
import { resolveServicePricing } from './servicePricing'
import { defaultServiceExecutionDepartment, resolveOrderExecutionDepartment } from './orderExecutionDepartment'

const text = z.string().trim().min(1)
const nullableText = text.nullable()
const identity = z.object({ id: text, code: text, revision: z.number().int().nonnegative(),
  groupType: z.enum(['LIS', 'PACS', 'ORDER_SET', 'PACKAGE']) })
const memberSchema = z.object({ id: text, catalogItemId: text, itemCode: text, itemName: text,
  serviceType: z.enum(['LABORATORY', 'EXAMINATION', 'TREATMENT', 'OTHER']),
  sortOrder: z.number().int().nonnegative(), quantity: z.number().finite().min(0.001),
  unitCode: nullableText, requiredMember: z.boolean(), memberDescription: z.string().nullish() })
const groupSchema = identity.extend({ name: text, organizationId: nullableText,
  executionDepartmentId: nullableText, usageType: z.enum(['COMMON', 'OUTPATIENT']).nullable(),
  status: z.literal('ACTIVE'), validFrom: z.iso.date(), validTo: z.iso.date().nullable(),
  members: z.array(memberSchema).min(1) })
const effective = (from: string, to: string | null, at: string) => from <= at && (to === null || (to >= from && to >= at))
const unique = (values: Array<string | number>) => new Set(values).size === values.length

/** 单个成员自身的校验失败；其余成员可以继续导入（共性失败仍整体抛出）。 */
class OrderSetRowError extends Error {
  readonly reason: string
  constructor(readonly label: string, reason: string) { super(`${label}：${reason}`); this.reason = reason }
}
export interface SkippedOrderSetMember { memberId: string; label: string; reason: string }

/** 组套静态可用性（不发请求）：用于预览提前提示；真正导入仍由 resolveOrderSetRows 重新校验。 */
export function orderSetStaticIssue(group: Pick<ItemGroup, 'status' | 'organizationId' | 'validFrom' | 'validTo' | 'members'>,
  encounter: Pick<Encounter, 'organizationId'>, at = new Date()): string | undefined {
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  if (group.status !== 'ACTIVE') return '组套已停用'
  if (!Array.isArray(group.members) || !group.members.length) return '组套没有成员项目'
  if (!effective(group.validFrom, group.validTo ?? null, day)) return '组套不在有效期内'
  if (group.organizationId && group.organizationId !== encounter.organizationId) return '组套不属于当前机构'
  return undefined
}

/**
 * 展开组套为项目草稿。成员级失败（目录缺失、价格、单位等）记入 skipped 而不中断其余成员；
 * 组套身份、版本、有效期、重复、执行科室等共性问题，以及目录请求失败，仍整体抛出。
 * only 不为空时只导入指定成员（仍对整个组套做共性校验）。
 */
export async function resolveOrderSetRows(selected: Pick<ItemGroup, 'id' | 'revision' | 'code' | 'groupType'>,
  encounter: Pick<Encounter, 'organizationId' | 'departmentId'>, api: RhnApi, only?: ReadonlySet<string>):
  Promise<{ name: string; drafts: ServicePlanDraft[]; skipped: SkippedOrderSetMember[] }> {
  const key = identity.safeParse(selected)
  if (!key.success) throw new Error('所选组套身份或版本不完整，请重新检索')
  const groups = await api.masterData.itemGroups(key.data.code, key.data.groupType, '')
  if (!Array.isArray(groups)) throw new Error('组套目录返回异常，请重试')
  const matches = groups.filter(group => group?.id === key.data.id)
  if (matches.length !== 1) throw new Error('组套已不可用或目录存在重复记录，请重新检索')
  const result = groupSchema.safeParse(matches[0])
  if (!result.success) throw new Error('组套状态、作用域或成员信息不完整，无法导入，请维护目录后重试')
  const group = result.data
  if (group.code !== key.data.code || group.groupType !== key.data.groupType || group.revision !== key.data.revision) {
    throw new Error('组套已更新，请重新检索并核对后导入')
  }
  const now = new Date()
  const at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (!effective(group.validFrom, group.validTo, at)
    || (group.organizationId !== null && group.organizationId !== encounter.organizationId)) {
    throw new Error('组套在当前机构或业务日期不可用，请重新选择')
  }
  if (!unique(group.members.map(member => member.id)) || !unique(group.members.map(member => member.catalogItemId))
    || !unique(group.members.map(member => member.sortOrder))) throw new Error('组套成员或排序重复，请维护目录后重试')
  // 组套自身显式指定的执行科室优先（整组共性，失效则整体抛出）；否则逐成员按项目默认执行科室解析，最后才回退就诊科室，
  // 与医嘱录入框手工开立同一规则（defaultServiceExecutionDepartment）。
  const groupDepartmentId = group.executionDepartmentId ?? undefined
  const departments = new Map<string, ReturnType<typeof resolveOrderExecutionDepartment>>()
  const loadDepartment = (id: string) => {
    if (!departments.has(id)) departments.set(id, resolveOrderExecutionDepartment(id, encounter.organizationId, api))
    return departments.get(id)!
  }
  const members = [...group.members].sort((left, right) => left.sortOrder - right.sortOrder)
    .filter(member => !only || only.has(member.id))
  const [resolved] = await Promise.all([
    Promise.all(members.map(async member => {
      try {
        const page = await api.masterData.searchServices(member.itemCode, member.serviceType, 'ACTIVE', encounter.organizationId, 0, 100)
        if (!page || !Array.isArray(page.content)) throw new OrderSetRowError(member.itemName, '项目目录返回异常')
        const found = page.content.filter(item => item?.id === member.catalogItemId)
        if (found.length !== 1) throw new OrderSetRowError(member.itemName, '当前目录未确认唯一项目')
        const service = found[0]
        if (service.code !== member.itemCode || service.sdServiceType !== member.serviceType || !text.safeParse(service.name).success
          || (group.groupType === 'LIS' && service.sdServiceType !== 'LABORATORY')
          || (group.groupType === 'PACS' && service.sdServiceType !== 'EXAMINATION')) {
          throw new OrderSetRowError(member.itemName, '项目编码或类型已变化，请维护组套后重试')
        }
        const pricing = resolveServicePricing(service, encounter.organizationId)
        if (!pricing.price) throw new OrderSetRowError(member.itemName, pricing.error)
        if (member.unitCode !== null && member.unitCode !== service.unitCode) {
          throw new OrderSetRowError(member.itemName, '组套单位与目录单位不一致，请先确认换算关系')
        }
        const departmentId = groupDepartmentId ?? defaultServiceExecutionDepartment(service, encounter.departmentId)
        if (!departmentId) throw new OrderSetRowError(member.itemName, '执行科室未配置或存在多个候选，请维护机构项目')
        // 组套显式科室失效属整组问题，向外抛出；项目默认科室失效只影响本行。
        const department = await loadDepartment(departmentId).catch(error => {
          if (!groupDepartmentId && error instanceof Error && /^执行(机构或)?科室/.test(error.message)) {
            throw new OrderSetRowError(member.itemName, error.message)
          }
          throw error
        })
        return { member, service, price: pricing.price, department, failure: undefined }
      } catch (error) {
        if (error instanceof OrderSetRowError) return { member, service: undefined, price: undefined, department: undefined, failure: error }
        throw error
      }
    })),
    groupDepartmentId ? loadDepartment(groupDepartmentId) : Promise.resolve(undefined),
  ])
  const sequence = Date.now()
  const ready = resolved.flatMap(value => value.failure
    ? [] : [{ member: value.member, service: value.service!, price: value.price!, department: value.department! }])
  return { name: group.name,
    skipped: resolved.flatMap(value => value.failure
      ? [{ memberId: value.member.id, label: value.failure.label, reason: value.failure.reason }] : []),
    drafts: ready.map(({ member, service, price, department }, index) => ({
      id: globalThis.crypto.randomUUID(), sequence: sequence + index,
      serviceType: service.sdServiceType, catalogItemId: service.id,
      itemCode: service.code, itemName: service.name,
      quantity: member.quantity, unitCode: service.unitCode,
      clinicalDescription: member.memberDescription ?? undefined,
      unitPrice: price.price, currencyCode: price.currencyCode,
      performerOrganizationId: encounter.organizationId, performerDepartmentId: department.id, performerDepartmentName: department.name,
    })) }
}

/** 严格导入：任一成员不可用即整体拒绝（医嘱录入框的组套快捷导入使用）。 */
export async function resolveOrderSetImport(selected: Pick<ItemGroup, 'id' | 'revision' | 'code' | 'groupType'>,
  encounter: Pick<Encounter, 'organizationId' | 'departmentId'>, api: RhnApi): Promise<{ name: string; drafts: ServicePlanDraft[] }> {
  const { name, drafts, skipped } = await resolveOrderSetRows(selected, encounter, api)
  if (skipped.length) throw new Error(`${skipped[0].label}：${skipped[0].reason}`)
  return { name, drafts }
}
