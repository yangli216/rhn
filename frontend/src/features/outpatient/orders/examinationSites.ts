import type { ExaminationSiteOptions } from '../../../shared/api/encountersApi'

/** 项目要求部位或已选部位时，数量按部位计价方式换算，不由医生手填。 */
export function usesSiteQuantity(rule: ExaminationSiteOptions | undefined, siteCount: number) {
  return Boolean(rule?.configured && (rule.bodySiteRequired || siteCount > 0))
}

/** 与服务端 ExaminationSiteRule.baseQuantity 一致：按部位计价时为计费部位数，其余方式为 1。 */
export function examinationSiteQuantity(rule: ExaminationSiteOptions, siteCount: number) {
  if (rule.sitePricingMode !== 'PER_SITE') return 1
  const effective = Math.max(1, siteCount)
  return rule.maxChargeableSiteCount == null ? effective : Math.min(effective, rule.maxChargeableSiteCount)
}

export function maxSelectableSites(rule: ExaminationSiteOptions) {
  return rule.maxBodySiteCount ?? (rule.multiBodySite ? rule.sites.length : 1)
}

/** 开立前校验部位选择；返回给医生的提示，通过时为空。 */
export function examinationSiteError(rule: ExaminationSiteOptions | undefined, itemName: string, siteCount: number) {
  if (!rule?.configured) return ''
  if (rule.bodySiteRequired && siteCount === 0) {
    return rule.sites.length ? `“${itemName}”必须选择检查部位` : `“${itemName}”要求检查部位，但尚未维护可选部位，请联系基础数据维护`
  }
  if (siteCount > maxSelectableSites(rule)) return `“${itemName}”最多选择 ${maxSelectableSites(rule)} 个部位`
  return ''
}

export function formatBodySites(sites: { name: string }[] | undefined) {
  return sites?.length ? sites.map(site => site.name).join('、') : ''
}
