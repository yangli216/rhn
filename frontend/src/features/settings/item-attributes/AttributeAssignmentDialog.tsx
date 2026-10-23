import { useState, type FormEvent } from 'react'
import type {
  ItemAttributeConfiguration,
  ItemAttributeDefinitionConfiguration,
  ItemTypeAttributeConfiguration,
  ItemTypeAttributeInput,
  RhnApi,
} from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Select } from '../../../shared/ui'
import {
  nextOrder,
  parseConfiguredValue,
  rawValue,
  stripAssignmentIds,
  suggestedWidget,
  widgetOptions,
} from './attributeConfigurationUtils'

export function AttributeAssignmentDialog({
  api,
  configuration,
  definition: initialDefinition,
  targetItemTypeId,
  value,
  onClose,
  onSaved,
  onError,
}: {
  api: RhnApi
  configuration: ItemAttributeConfiguration
  definition?: ItemAttributeDefinitionConfiguration
  targetItemTypeId?: string
  value?: ItemTypeAttributeConfiguration
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (error: unknown) => void
}) {
  const [selectedDefinitionId, setSelectedDefinitionId] = useState(
    value?.definitionId ?? initialDefinition?.id ?? ''
  )
  const currentDefinition =
    configuration.definitions.find((item) => item.id === selectedDefinitionId) ?? initialDefinition

  const [itemTypeId, setItemTypeId] = useState(
    value?.itemTypeId ?? targetItemTypeId ?? ''
  )
  const [widgetType, setWidgetType] = useState(
    value?.widgetType ?? (currentDefinition ? suggestedWidget(currentDefinition) : 'INPUT')
  )
  const [required, setRequired] = useState(value?.required ?? false)
  const [listDisplay, setListDisplay] = useState(value?.listDisplay ?? false)
  const [defaultRaw, setDefaultRaw] = useState(
    rawValue(value?.defaultValue, currentDefinition?.cardinality ?? 'SINGLE')
  )
  const [busy, setBusy] = useState(false)

  // 候选项目类型（排除已装配）
  const eligibleTypes = configuration.itemTypes.filter(
    (type) =>
      !configuration.assignments.some(
        (assignment) =>
          assignment.definitionId === currentDefinition?.id &&
          assignment.itemTypeId === type.id &&
          assignment.id !== value?.id
      )
  )

  // 候选属性定义（排除当前项目类型已装配）
  const eligibleDefinitions = configuration.definitions.filter(
    (def) =>
      def.status === 'ACTIVE' &&
      !configuration.assignments.some(
        (assignment) =>
          assignment.itemTypeId === itemTypeId &&
          assignment.definitionId === def.id &&
          assignment.id !== value?.id
      )
  )

  const handleDefinitionChange = (defId: string) => {
    setSelectedDefinitionId(defId)
    const def = configuration.definitions.find((item) => item.id === defId)
    if (def) {
      setWidgetType(suggestedWidget(def))
      setDefaultRaw(rawValue(def.defaultValue, def.cardinality))
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentDefinition) return
    setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      const input: ItemTypeAttributeInput = {
        itemTypeId,
        definitionId: currentDefinition.id,
        required,
        defaultValue: parseConfiguredValue(defaultRaw, currentDefinition.dataType, currentDefinition.cardinality),
        widgetType,
        groupName: String(form.get('groupName') || '').trim() || undefined,
        groupSortOrder: Number(form.get('groupSortOrder')),
        attributeSortOrder: Number(form.get('attributeSortOrder')),
        searchable: false,
        listDisplay,
        reason: String(form.get('reason') || '').trim(),
        requestCode: crypto.randomUUID(),
      }
      if (value) {
        await api.masterData.updateItemTypeAttribute(value.id, value.revision, stripAssignmentIds(input))
      } else {
        await api.masterData.createItemTypeAttribute(input)
      }
      await onSaved()
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  const targetTypeName = configuration.itemTypes.find((item) => item.id === itemTypeId)?.name

  return (
    <Dialog
      title={value ? '编辑类型装配' : '装配扩展属性'}
      eyebrow="基础数据 · 动态维护表单"
      size="wide"
      description={
        targetTypeName && currentDefinition
          ? `将“${currentDefinition.name}”装配到“${targetTypeName}”；子类型配置优先于父类型。`
          : '为指定业务项目类型装配扩展属性，并设定录入控件与排列顺序。'
      }
      onClose={onClose}
    >
      <form className="attribute-config-form" onSubmit={submit}>
        <Alert tone="info" placement="inline">
          动态扩展属性用于长尾业务字段；如涉及核心医保计费、库存扣减或严重用药禁忌，应在基础数据中晋升为强类型表投影。
        </Alert>

        <div className="attribute-config-form__grid">
          {/* 当指定了项目类型，选择属性；反之选择项目类型 */}
          {targetItemTypeId && !initialDefinition ? (
            <FormField label="选择装配属性" required className="span-2">
              <Select
                className="ui-query-filter--wide"
                value={selectedDefinitionId}
                onChange={handleDefinitionChange}
                disabled={Boolean(value)}
                options={eligibleDefinitions.map((item) => ({
                  value: item.id,
                  label: item.name,
                  secondaryText: `${item.code} (${item.scopeType === 'PLATFORM' ? '平台' : '租户'})`,
                }))}
              />
            </FormField>
          ) : (
            <FormField label="目标项目类型" required className="span-2">
              <Select
                className="ui-query-filter--wide"
                value={itemTypeId}
                onChange={setItemTypeId}
                disabled={Boolean(value || targetItemTypeId)}
                options={eligibleTypes.map((item) => ({
                  value: item.id,
                  label: item.name,
                  secondaryText: item.code,
                }))}
              />
            </FormField>
          )}

          {currentDefinition && (
            <FormField label="维护控件" required>
              <Select
                value={widgetType}
                onChange={setWidgetType}
                options={widgetOptions(currentDefinition)}
              />
            </FormField>
          )}

          <FormField label="字段分组" hint="在录入表单中归类展示的分组标题">
            <input name="groupName" defaultValue={value?.groupName ?? '扩展属性'} />
          </FormField>

          <FormField label="分组排序权重" required hint="数值越小越靠前显示">
            <input
              name="groupSortOrder"
              type="number"
              min="0"
              defaultValue={value?.groupSortOrder ?? 50}
              required
            />
          </FormField>

          <FormField label="组内属性顺序" required hint="组内各个字段的前后次序">
            <input
              name="attributeSortOrder"
              type="number"
              min="0"
              defaultValue={value?.attributeSortOrder ?? nextOrder(configuration, itemTypeId)}
              required
            />
          </FormField>

          <FormField label="类型级默认值覆盖" className="span-2" hint="若留空，则自动沿用属性定义中设定的默认回退值">
            <input
              value={defaultRaw}
              onChange={(event) => setDefaultRaw(event.target.value)}
              placeholder="不覆盖则继承属性默认值"
            />
          </FormField>

          <FormField label="维护规则" className="span-2">
            <div className="attribute-scope-options">
              <label>
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(event) => setRequired(event.target.checked)}
                />
                <span>必填字段</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={listDisplay}
                  onChange={(event) => setListDisplay(event.target.checked)}
                />
                <span>在主数据列表关键列呈现</span>
              </label>
            </div>
          </FormField>
        </div>

        <FormField label="变更原因" required>
          <input
            name="reason"
            defaultValue={value ? '调整项目类型属性装配' : '新增项目类型属性装配'}
            required
          />
        </FormField>

        <div className="ui-form-actions">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" busy={busy} disabled={!itemTypeId || !currentDefinition}>
            {value ? '保存装配' : '完成装配'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
