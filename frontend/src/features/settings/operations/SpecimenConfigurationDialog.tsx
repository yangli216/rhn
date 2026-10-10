import { specimenForm, specimenConfigurationInput } from "../specimenConfigurationForm";
import { useState } from "react";
import type { ClinicalConfiguration, ServiceCatalogItem, SpecimenConfiguration, SpecimenConfigurationInput, UnitDefinition } from "../../../shared/rhnApi";
import { FormField, Select } from "../../../shared/ui";
import { FormDialog, unitOption, Check, activeStatus } from './operationalShared'

export function SpecimenDialog({ value, configuration, units, services, onClose, onSave }: {
  value?: SpecimenConfiguration; configuration: ClinicalConfiguration
  units: UnitDefinition[]; services: ServiceCatalogItem[]; onClose: () => void
  onSave: (input: SpecimenConfigurationInput) => Promise<void>
}) {
  const [form, setForm] = useState(() => specimenForm(value,
    Math.max(0, ...(configuration.laboratory?.specimens ?? []).map((item) => item.sortOrder)) + 10))

  const chargeOptions = services.filter((v) => v.id !== configuration.serviceId && v.chargeable && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))

  const sharingRuleDescription = form.tubeSharingMode === 'SHARE'
    ? '同组共管：按已确认的分组和基础管数计算合管结果。'
    : form.tubeSharingMode === 'BY_TEST_COUNT'
      ? '按项目数拆管：按基础管数与每管最大项目数计算，最终管数以试算结果为准。'
      : form.tubeSharingMode === 'SEPARATE' ? '独立专管：按当前项目配置的基础管数单独计算。' : '请选择分管模式。'

  return (
    <FormDialog title={value ? '编辑标本与分管规则' : '新增标本与分管规则'}
      description="按本机构确认的标本、容器、分管和收费规则维护。"
      size="xwide" className="specimen-config-dialog" customLayout onClose={onClose}
      submitLabel="保存标本与分管规则"
      onSubmit={(event) => { event.preventDefault(); return onSave(specimenConfigurationInput(form, configuration, services, value)) }}>
        <div className="specimen-config-workbench">
          <aside className="specimen-configuration-summary" aria-label="当前标本规则选择">
            <div className="specimen-configuration-summary__header"><strong>当前选择摘要</strong></div>
            <p>请核对实际目录项，并明确指定可共管的分组与收费方式。</p>
            <dl>
              <dt>送检标本</dt><dd>{configuration.specimenOptions.find((item) => item.id === form.specimenItemId)?.name ?? '未选择'}</dd>
              <dt>采集容器</dt><dd>{configuration.containerOptions.find((item) => item.id === form.containerItemId)?.name ?? '未指定'}</dd>
              <dt>合管分组编码</dt><dd>{form.tubeSharingMode === 'SEPARATE' ? '独立分管，无需分组' : form.tubeGroupCode || '未填写'}</dd>
              <dt>收费项目</dt><dd>{form.tubeChargeMode === 'NONE' ? '已选择不加收' : chargeOptions.find((item) => item.value === form.tubeChargeItemId)?.label ?? '未选择'}</dd>
            </dl>
          </aside>

          {/* 右栏：三大业务卡片表单 */}
          <div className="specimen-config-main">
            {/* 卡片 1：标本与采集容器 */}
            <div className="form-section-card">
              <div className="form-section-card__title">
                <span>01 标本类型与标准采血管容器</span>
                <small>明确标本材质与标准真空采血管要求</small>
              </div>
              <div className="master-data-form-grid master-data-form-grid--2">
                <FormField label="送检标本类型" required>
                  <Select
                    value={form.specimenItemId}
                    onChange={(v) => {
                      setForm({ ...form, specimenItemId: v })
                    }}
                    placeholder="选择标本类型"
                    options={configuration.specimenOptions.map((v) => ({
                      value: v.id,
                      label: v.name,
                      secondaryText: v.code,
                    }))}
                  />
                </FormField>
                <FormField label="标准采血管容器">
                  <Select
                    value={form.containerItemId}
                    onChange={(v) => {
                      setForm({ ...form, containerItemId: v })
                    }}
                    placeholder="未指定容器"
                    options={configuration.containerOptions.map((v) => ({
                      value: v.id,
                      label: v.name,
                      secondaryText: v.code,
                    }))}
                  />
                </FormField>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                  <FormField label="最小送检采集量">
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={form.minimumQuantity}
                      onChange={(e) => setForm({ ...form, minimumQuantity: e.target.value })}
                      placeholder="如：2"
                    />
                  </FormField>
                  <FormField label="采集量单位">
                    <Select
                      value={form.minimumQuantityUnit}
                      onChange={(v) => setForm({ ...form, minimumQuantityUnit: v })}
                      placeholder="单位"
                      options={units.filter((v) => v.status === 'ACTIVE').map(unitOption)}
                    />
                  </FormField>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', alignSelf: 'center', paddingTop: 'var(--space-2)' }}>
                  <Check
                    label="设为默认标本"
                    checked={form.defaultSpecimen}
                    onChange={(v) => setForm({ ...form, defaultSpecimen: v })}
                  />
                  <Check
                    label="开立必需标本"
                    checked={form.requiredSpecimen}
                    onChange={(v) => setForm({ ...form, requiredSpecimen: v })}
                  />
                </div>
              </div>
            </div>

            {/* 卡片 2：本机构确认的分管规则 */}
            <div className="form-section-card">
              <div className="form-section-card__title">
                <span>02 同次开立分管与合管策略</span>
                <small>同一医嘱下多检验项目的合管、拆管及并管规则</small>
              </div>

              {form.tubeSharingMode && form.tubeSharingMode !== 'SEPARATE' && <FormField label="合管分组编码" required
                hint="仅同一分组且规则一致的项目可共管，请填写本机构确认的编码。">
                <input value={form.tubeGroupCode} onChange={(event) => setForm({ ...form, tubeGroupCode: event.target.value })} />
              </FormField>}
              {form.tubeSharingMode === 'BY_TEST_COUNT' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 'var(--space-3)' }}>
                  <FormField label="分管模式" required>
                    <Select
                      value={form.tubeSharingMode}
                      onChange={(v) => setForm({ ...form, tubeSharingMode: v as typeof form.tubeSharingMode })}
                      options={[
                        { value: 'SHARE', label: '同组共管（按确认的分组与基础管数）' },
                        { value: 'SEPARATE', label: '独立专管（按基础管数单独计算）' },
                        { value: 'BY_TEST_COUNT', label: '按项目数拆管（超出试管容纳上限后另起1管）' },
                      ]}
                    />
                  </FormField>
                  <FormField label="基础试管数" required>
                    <input
                      type="number"
                      min="1"
                      value={form.baseTubeCount}
                      onChange={(e) => setForm({ ...form, baseTubeCount: e.target.value })}
                    />
                  </FormField>
                  <FormField label="每管最大项目数" required>
                    <input
                      type="number"
                      min="1"
                      value={form.maxTestsPerTube}
                      onChange={(e) => setForm({ ...form, maxTestsPerTube: e.target.value })}
                      placeholder="例如：10"
                    />
                  </FormField>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 'var(--space-3)' }}>
                  <FormField label="分管模式" required>
                    <Select
                      value={form.tubeSharingMode}
                      onChange={(v) => setForm({ ...form, tubeSharingMode: v as typeof form.tubeSharingMode })}
                      options={[
                        { value: 'SHARE', label: '同组共管（按确认的分组与基础管数）' },
                        { value: 'SEPARATE', label: '独立专管（按基础管数单独计算）' },
                        { value: 'BY_TEST_COUNT', label: '按项目数拆管（超出试管容纳上限后另起1管）' },
                      ]}
                    />
                  </FormField>
                  <FormField label="基础试管数" required>
                    <input
                      type="number"
                      min="1"
                      value={form.baseTubeCount}
                      onChange={(e) => setForm({ ...form, baseTubeCount: e.target.value })}
                    />
                  </FormField>
                </div>
              )}

              <div className="tube-rule-callout" style={{ marginTop: 'var(--space-2)' }}>
                <span>{sharingRuleDescription}</span>
              </div>
            </div>

            {/* 卡片 3：采血管耗材加收与执行说明 */}
            <div className="form-section-card">
              <div className="form-section-card__title">
                <span>03 采血管耗材加收与送检指引</span>
                <small>关联采血管收费耗材项目及采样注意事项</small>
              </div>
              <div className="master-data-form-grid master-data-form-grid--2" style={{ marginBottom: 'var(--space-3)' }}>
                <FormField label="试管耗材加收模式">
                  <Select
                    value={form.tubeChargeMode}
                    onChange={(v) => setForm({ ...form, tubeChargeMode: v as typeof form.tubeChargeMode })}
                    options={[
                      { value: 'NONE', label: '不加收' },
                      { value: 'PER_TUBE', label: '按管加收（管数 × 每管加收数量）' },
                      { value: 'EXCESS_TUBE', label: '超管加收（超出免收数量后加收）' },
                    ]}
                  />
                </FormField>

                <FormField label="关联采血管收费项目" required={form.tubeChargeMode !== 'NONE'}>
                  <Select
                    disabled={form.tubeChargeMode === 'NONE'}
                    value={form.tubeChargeMode === 'NONE' ? '' : form.tubeChargeItemId}
                    onChange={(v) => setForm({ ...form, tubeChargeItemId: v })}
                    options={chargeOptions}
                    placeholder={form.tubeChargeMode === 'NONE' ? '当前模式无需关联试管耗材' : '选择真空采血管收费项目'}
                  />
                </FormField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                {form.tubeChargeMode === 'EXCESS_TUBE' && (
                  <FormField label="已包含试管数 (免加收数)">
                    <input
                      type="number"
                      min="0"
                      value={form.includedTubeCount}
                      onChange={(e) => setForm({ ...form, includedTubeCount: e.target.value })}
                    />
                  </FormField>
                )}
                  <FormField label="每管加收数量">
                    <input
                      disabled={form.tubeChargeMode === 'NONE'}
                      type="number"
                      min="0.0001"
                      step="any"
                      value={form.tubeChargeMode === 'NONE' ? '' : form.tubeChargeQuantity}
                      placeholder={form.tubeChargeMode === 'NONE' ? '不适用' : undefined}
                      onChange={(e) => setForm({ ...form, tubeChargeQuantity: e.target.value })}
                    />
                  </FormField>

                <FormField label="显示排序号" required>
                  <input
                    type="number"
                    min="0"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  />
                </FormField>

                <FormField label="规则状态">
                  <Select
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' })}
                    options={activeStatus}
                  />
                </FormField>
              </div>

              <FormField label="采样与送检说明">
                <textarea
                  rows={2}
                  value={form.collectionDescription}
                  onChange={(e) => setForm({ ...form, collectionDescription: e.target.value })}
                  placeholder="如：禁食8-12小时、轻柔颠倒混匀5-8次、避免溶血及冷藏运送要求…"
                />
              </FormField>
            </div>
          </div>
        </div>

    </FormDialog>
  )
}
