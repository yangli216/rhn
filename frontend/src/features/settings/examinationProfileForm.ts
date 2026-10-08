import type { ClinicalConfiguration, ExaminationProfileInput } from '../../shared/rhnApi'

type ExaminationProfile = NonNullable<ClinicalConfiguration['examination']>

export function examinationProfileForm(value: ExaminationProfile) {
  return {
    examinationType: value.examinationType ?? '', bodySiteRequired: value.bodySiteRequired,
    multiBodySite: value.multiBodySite, maxBodySiteCount: value.maxBodySiteCount?.toString() ?? '',
    preparationDescription: value.preparationDescription ?? '', sitePricingMode: value.sitePricingMode,
    includedSiteCount: value.includedSiteCount.toString(), additionalSitePrice: value.additionalSitePrice?.toString() ?? '',
    additionalSiteItemId: value.additionalSiteItemId ?? '', additionalSiteQuantity: value.additionalSiteQuantity.toString(),
    maxChargeableSiteCount: value.maxChargeableSiteCount?.toString() ?? '',
  }
}

function numberInput(raw: string, label: string, minimum: number, integer = false): number {
  if (!raw.trim()) throw new Error(`请填写${label}。`)
  const value = Number(raw)
  if (!Number.isFinite(value) || value < minimum || (integer && !Number.isInteger(value))) {
    throw new Error(`${label}必须是大于等于 ${minimum} 的${integer ? '整数' : '有效数值'}。`)
  }
  return value
}

function optionalCount(raw: string, label: string): number | undefined {
  return raw.trim() ? numberInput(raw, label, 1, true) : undefined
}

export function examinationProfileInput(form: ReturnType<typeof examinationProfileForm>): ExaminationProfileInput {
  const multiBodySite = form.bodySiteRequired && form.multiBodySite
  const mode = multiBodySite ? form.sitePricingMode : 'SINGLE'
  const includedSiteCount = numberInput(form.includedSiteCount, '主项价格包含部位数', 1, true)
  const maxBodySiteCount = form.bodySiteRequired ? optionalCount(form.maxBodySiteCount, '最多可选部位数') : undefined
  const maxChargeableSiteCount = multiBodySite ? optionalCount(form.maxChargeableSiteCount, '最大计费部位数') : undefined
  if (maxBodySiteCount != null && includedSiteCount > maxBodySiteCount) throw new Error('包含部位数不能超过最多可选部位数。')
  if (maxChargeableSiteCount != null && (maxChargeableSiteCount < includedSiteCount
    || (maxBodySiteCount != null && maxChargeableSiteCount > maxBodySiteCount))) {
    throw new Error('最大计费部位数必须在包含部位数与最多可选部位数之间。')
  }
  const additionalSiteQuantity = numberInput(form.additionalSiteQuantity, '每超出部位加收数量', 0)
  if (additionalSiteQuantity === 0) throw new Error('每超出部位加收数量必须大于 0。')
  const additionalSitePrice = mode === 'BASE_PLUS_FIXED' ? numberInput(form.additionalSitePrice, '每超出部位加收金额', 0) : undefined
  if (mode === 'BASE_PLUS_ITEM' && !form.additionalSiteItemId) throw new Error('请选择多部位加收项目。')
  return {
    examinationType: form.examinationType || undefined, bodySiteRequired: form.bodySiteRequired, multiBodySite,
    maxBodySiteCount, preparationDescription: form.preparationDescription || undefined,
    sitePricingMode: mode, includedSiteCount, additionalSitePrice,
    additionalSiteItemId: mode === 'BASE_PLUS_ITEM' ? form.additionalSiteItemId : undefined,
    additionalSiteQuantity, maxChargeableSiteCount,
  }
}
