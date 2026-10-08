import { z } from 'zod'
import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import type { ServicePlanDraft } from './orderDraftTypes'
import { resolveServicePricing } from './servicePricing'
import { resolveOrderExecutionDepartment } from './orderExecutionDepartment'

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

export async function resolveOrderSetImport(selected: Pick<ItemGroup, 'id' | 'revision' | 'code' | 'groupType'>,
  encounter: Pick<Encounter, 'organizationId' | 'departmentId'>, api: RhnApi): Promise<{ name: string; drafts: ServicePlanDraft[] }> {
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
  const departmentId = group.executionDepartmentId ?? encounter.departmentId
  if (!departmentId) throw new Error('执行科室尚未确认，无法导入组套')
  const members = [...group.members].sort((left, right) => left.sortOrder - right.sortOrder)
  const [services, department] = await Promise.all([
    Promise.all(members.map(async member => {
      const page = await api.masterData.searchServices(member.itemCode, member.serviceType, 'ACTIVE', encounter.organizationId, 0, 100)
      if (!page || !Array.isArray(page.content)) throw new Error(`${member.itemName}：项目目录返回异常`)
      const found = page.content.filter(item => item?.id === member.catalogItemId)
      if (found.length !== 1) throw new Error(`${member.itemName}：当前目录未确认唯一项目`)
      const service = found[0]
      if (service.code !== member.itemCode || service.sdServiceType !== member.serviceType || !text.safeParse(service.name).success
        || (group.groupType === 'LIS' && service.sdServiceType !== 'LABORATORY')
        || (group.groupType === 'PACS' && service.sdServiceType !== 'EXAMINATION')) {
        throw new Error(`${member.itemName}：项目编码或类型已变化，请维护组套后重试`)
      }
      const pricing = resolveServicePricing(service, encounter.organizationId)
      if (!pricing.price) throw new Error(`${member.itemName}：${pricing.error}`)
      if (member.unitCode !== null && member.unitCode !== service.unitCode) throw new Error(`${member.itemName}：组套单位与目录单位不一致，请先确认换算关系`)
      return { service, price: pricing.price }
    })),
    resolveOrderExecutionDepartment(departmentId, encounter.organizationId, api),
  ])
  const sequence = Date.now()
  return { name: group.name, drafts: members.map((member, index) => ({
    id: globalThis.crypto.randomUUID(), sequence: sequence + index,
    serviceType: services[index].service.sdServiceType, catalogItemId: services[index].service.id,
    itemCode: services[index].service.code, itemName: services[index].service.name,
    quantity: member.quantity, unitCode: services[index].service.unitCode,
    clinicalDescription: member.memberDescription ?? undefined,
    unitPrice: services[index].price.price, currencyCode: services[index].price.currencyCode,
    performerOrganizationId: encounter.organizationId, performerDepartmentId: department.id, performerDepartmentName: department.name,
  })) }
}
