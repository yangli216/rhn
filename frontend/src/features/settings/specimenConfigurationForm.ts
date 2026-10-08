import type { ClinicalConfiguration, ServiceCatalogItem, SpecimenConfiguration, SpecimenConfigurationInput } from '../../shared/rhnApi'

export function specimenForm(value: SpecimenConfiguration | undefined, nextSortOrder: number) {
  return {
    specimenItemId: value?.specimenItemId ?? '', containerItemId: value?.containerItemId ?? '',
    minimumQuantity: value?.minimumQuantity?.toString() ?? '', minimumQuantityUnit: value?.minimumQuantityUnit ?? '',
    defaultSpecimen: value?.defaultSpecimen ?? false, requiredSpecimen: value?.requiredSpecimen ?? true,
    sortOrder: String(value?.sortOrder ?? nextSortOrder), collectionDescription: value?.collectionDescription ?? '',
    status: value?.status ?? 'ACTIVE', tubeGroupCode: value?.tubeGroupCode ?? '',
    tubeSharingMode: value?.tubeSharingMode ?? '', baseTubeCount: String(value?.baseTubeCount ?? 1),
    maxTestsPerTube: value?.maxTestsPerTube?.toString() ?? '', tubeChargeMode: value?.tubeChargeMode ?? '',
    tubeChargeItemId: value?.tubeChargeItemId ?? '', includedTubeCount: String(value?.includedTubeCount ?? 0),
    tubeChargeQuantity: String(value?.tubeChargeQuantity ?? 1),
  }
}

function number(raw: string, label: string, minimum: number, integer = false) {
  if (!raw.trim()) throw new Error(`请填写${label}。`)
  const result = Number(raw)
  if (!Number.isFinite(result) || result < minimum || (integer && !Number.isInteger(result))) {
    throw new Error(`${label}必须是大于等于 ${minimum} 的${integer ? '整数' : '有效数值'}。`)
  }
  return result
}

export function specimenConfigurationInput(form: ReturnType<typeof specimenForm>, configuration: ClinicalConfiguration,
  services: ServiceCatalogItem[], original?: SpecimenConfiguration): SpecimenConfigurationInput {
  if (!configuration.specimenOptions.some((option) => option.id === form.specimenItemId)) throw new Error('请选择实际送检标本。')
  if (form.containerItemId && !configuration.containerOptions.some((option) => option.id === form.containerItemId)) {
    throw new Error('所选容器不在当前可用目录中，请重新选择。')
  }
  if (!['SEPARATE', 'SHARE', 'BY_TEST_COUNT'].includes(form.tubeSharingMode)) throw new Error('请选择分管模式。')
  const shared = form.tubeSharingMode !== 'SEPARATE'
  if (shared && !form.containerItemId) throw new Error('合管或按项目数拆管时请选择实际容器。')
  if (shared && !form.tubeGroupCode.trim()) throw new Error('请填写经确认的合管分组编码。')
  if (!['NONE', 'PER_TUBE', 'EXCESS_TUBE'].includes(form.tubeChargeMode)) throw new Error('请选择试管加收模式。')
  const chargeable = form.tubeChargeMode !== 'NONE'
  if (chargeable && !services.some((item) => item.id === form.tubeChargeItemId
    && item.id !== configuration.serviceId && item.chargeable && item.sdStatus === 'ACTIVE')) {
    throw new Error('请选择实际采血管收费项目。')
  }
  // Inactive numeric rules retain the saved value (or the visible creation default).
  const quantity = chargeable ? number(form.tubeChargeQuantity, '每管加收数量', 0) : original?.tubeChargeQuantity ?? 1
  if (quantity <= 0) throw new Error('每管加收数量必须大于 0。')
  const minimumQuantity = form.minimumQuantity.trim() ? number(form.minimumQuantity, '最小送检采集量', 0) : undefined
  if (minimumQuantity != null && (minimumQuantity <= 0 || !form.minimumQuantityUnit)) throw new Error('请填写大于 0 的采集量并选择单位。')
  return {
    specimenItemId: form.specimenItemId, containerItemId: form.containerItemId || undefined,
    minimumQuantity, minimumQuantityUnit: form.minimumQuantityUnit || undefined,
    defaultSpecimen: form.defaultSpecimen, requiredSpecimen: form.requiredSpecimen,
    sortOrder: number(form.sortOrder, '显示排序号', 0, true), collectionDescription: form.collectionDescription || undefined,
    status: form.status, tubeGroupCode: shared ? form.tubeGroupCode.trim() : undefined,
    tubeSharingMode: form.tubeSharingMode as SpecimenConfigurationInput['tubeSharingMode'],
    baseTubeCount: number(form.baseTubeCount, '基础试管数', 1, true),
    maxTestsPerTube: form.tubeSharingMode === 'BY_TEST_COUNT' ? number(form.maxTestsPerTube, '每管最大项目数', 1, true) : undefined,
    tubeChargeMode: form.tubeChargeMode as SpecimenConfigurationInput['tubeChargeMode'],
    tubeChargeItemId: chargeable ? form.tubeChargeItemId : undefined,
    includedTubeCount: form.tubeChargeMode === 'EXCESS_TUBE'
      ? number(form.includedTubeCount, '已包含试管数', 0, true) : original?.includedTubeCount ?? 0,
    tubeChargeQuantity: quantity,
  }
}
