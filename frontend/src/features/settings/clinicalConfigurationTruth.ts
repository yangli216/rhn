import type { ClinicalConfiguration, ServiceCatalogItem } from '../../shared/rhnApi'

export function requireClinicalConfiguration(value: ClinicalConfiguration, service: ServiceCatalogItem): ClinicalConfiguration {
  if (!value || value.serviceId !== service.id || value.serviceType !== service.sdServiceType) {
    throw new Error('项目与执行配置不一致，已停止展示和编辑，请联系管理员修复主数据。')
  }
  const laboratory = service.sdServiceType === 'LABORATORY'
  const profile = laboratory ? value.laboratory : value.examination
  if (!profile) {
    throw new Error(`${laboratory ? '检验' : '检查'}执行与收费配置缺失，请先维护项目主档；当前无法编辑或试算。`)
  }
  if ((laboratory && value.examination) || (!laboratory && value.laboratory)) {
    throw new Error('项目类型与执行配置不一致，已停止展示和编辑，请联系管理员修复主数据。')
  }
  if (profile.serviceId !== service.id || !Number.isInteger(profile.revision) || profile.revision < 0
    || !Array.isArray(value.specimenOptions) || !Array.isArray(value.containerOptions)
    || (laboratory && (!Array.isArray(value.laboratory!.specimens)
      || typeof value.laboratory!.fastingRequired !== 'boolean' || typeof value.laboratory!.pointOfCare !== 'boolean'))
    || (!laboratory && (!Array.isArray(value.examination!.variants) || !Array.isArray(value.examination!.attachments)
      || typeof value.examination!.bodySiteRequired !== 'boolean' || typeof value.examination!.multiBodySite !== 'boolean'
      || !['SINGLE', 'PER_SITE', 'BASE_PLUS_FIXED', 'BASE_PLUS_ITEM'].includes(value.examination!.sitePricingMode)))) {
    throw new Error('执行与收费配置返回不完整，无法确认当前配置，请刷新后重试。')
  }
  const ex = value.examination
  if (ex && (!Number.isInteger(ex.includedSiteCount) || ex.includedSiteCount < 1
    || !Number.isFinite(ex.additionalSiteQuantity) || ex.additionalSiteQuantity <= 0
    || (ex.maxBodySiteCount != null && (!Number.isInteger(ex.maxBodySiteCount) || ex.maxBodySiteCount < ex.includedSiteCount))
    || (ex.maxChargeableSiteCount != null && (!Number.isInteger(ex.maxChargeableSiteCount)
      || ex.maxChargeableSiteCount < ex.includedSiteCount
      || (ex.maxBodySiteCount != null && ex.maxChargeableSiteCount > ex.maxBodySiteCount)))
    || (ex.sitePricingMode === 'BASE_PLUS_FIXED' && (ex.additionalSitePrice == null
      || !Number.isFinite(ex.additionalSitePrice) || ex.additionalSitePrice < 0))
    || (ex.sitePricingMode === 'BASE_PLUS_ITEM' && !ex.additionalSiteItemId))) {
    throw new Error('检查收费规则缺失或数值无效，无法确认费用，请联系管理员修复配置。')
  }
  return value
}
