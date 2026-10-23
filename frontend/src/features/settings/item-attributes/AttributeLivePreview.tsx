import { useMemo, useState } from 'react'
import type {
  ItemAttributeConfiguration,
  ItemTypeAttributeConfiguration,
} from '../../../shared/rhnApi'
import { EmptyState, FormField, Select, StatusBadge } from '../../../shared/ui'
import { extractDefinitionOptions, widgetLabel } from './attributeConfigurationUtils'

export function AttributeLivePreview({
  configuration,
  selectedItemTypeId,
}: {
  configuration?: ItemAttributeConfiguration
  selectedItemTypeId: string
}) {
  const [dummyValues, setDummyValues] = useState<Record<string, any>>({})

  const selectedType = configuration?.itemTypes.find((item) => item.id === selectedItemTypeId)

  const activeAssignments = useMemo(() => {
    if (!configuration || !selectedItemTypeId) return []
    return configuration.assignments
      .filter((item) => item.itemTypeId === selectedItemTypeId && item.status === 'ACTIVE')
      .sort((a, b) => {
        if (a.groupSortOrder !== b.groupSortOrder) return a.groupSortOrder - b.groupSortOrder
        return a.attributeSortOrder - b.attributeSortOrder
      })
  }, [configuration, selectedItemTypeId])

  // 按分组聚合
  const groups = useMemo(() => {
    const map = new Map<string, ItemTypeAttributeConfiguration[]>()
    for (const assignment of activeAssignments) {
      const group = assignment.groupName || '扩展属性'
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(assignment)
    }
    return Array.from(map.entries())
  }, [activeAssignments])

  if (!selectedItemTypeId || !selectedType) {
    return (
      <EmptyState
        icon="settings"
        title="选择左侧项目类型进行预览"
        copy="选中具体药品或诊疗服务类型后，此处将实时展示最终录入界面的渲染形态。"
      />
    )
  }

  if (activeAssignments.length === 0) {
    return (
      <EmptyState
        icon="settings"
        title="当前类型暂无有效扩展字段"
        copy={`“${selectedType.name}”暂未装配任何有效属性。点击“装配扩展属性”添加字段后，预览将自动生成。`}
      />
    )
  }

  const handleDummyChange = (defId: string, val: any) => {
    setDummyValues((prev) => ({ ...prev, [defId]: val }))
  }

  return (
    <div className="attribute-live-preview-panel" aria-label="表单录入效果预览">
      <div className="attribute-live-preview-panel__header">
        <div>
          <h4>
            {selectedType.name} · 扩展表单预览
          </h4>
          <p>模拟临床与主数据维护人员在新建或编辑该类型时的真实录入界面形态。</p>
        </div>
        <StatusBadge tone="success">
          {activeAssignments.length} 个字段生效
        </StatusBadge>
      </div>

      <div className="attribute-preview-form-canvas">
        {groups.map(([groupName, items]) => (
          <div key={groupName} className="attribute-preview-group-section">
            <div className="attribute-preview-group-section__head">
              <span className="group-title">{groupName}</span>
              <small>{items.length} 个字段</small>
            </div>
            <div className="attribute-preview-fields-grid">
              {items.map((item) => {
                const def = configuration?.definitions.find((d) => d.id === item.definitionId)
                if (!def) return null
                const currentValue = dummyValues[def.id] ?? item.defaultValue ?? def.defaultValue ?? ''
                const options = extractDefinitionOptions(def)

                return (
                  <div key={item.id} className="attribute-preview-field-cell">
                    <FormField
                      label={
                        <span className="preview-field-label">
                          {def.name}
                          {item.required && <span className="preview-required-star">*</span>}
                          <small className="preview-widget-chip">{widgetLabel(item.widgetType)}</small>
                        </span>
                      }
                      hint={def.description || undefined}
                    >
                      {item.widgetType === 'SWITCH' ? (
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={Boolean(currentValue === true || currentValue === 'true')}
                            onChange={(e) => handleDummyChange(def.id, e.target.checked)}
                          />
                          <span>{currentValue ? '已启用 / 是' : '未开启 / 否'}</span>
                        </label>
                      ) : item.widgetType === 'RADIO' ? (
                        <div className="preview-radio-group" role="radiogroup" aria-label={def.name}>
                          {options.length > 0 ? (
                            options.map((opt) => (
                              <label key={opt.value} className="preview-radio-option">
                                <input
                                  type="radio"
                                  name={`preview-radio-${item.id}`}
                                  value={opt.value}
                                  checked={String(currentValue) === opt.value}
                                  onChange={() => handleDummyChange(def.id, opt.value)}
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))
                          ) : (
                            <div className="preview-radio-options-fallback">
                              <label className="preview-radio-option">
                                <input
                                  type="radio"
                                  name={`preview-radio-${item.id}`}
                                  checked={true}
                                  readOnly
                                />
                                <span>{currentValue ? String(currentValue) : '选项 1'}</span>
                              </label>
                              <label className="preview-radio-option">
                                <input
                                  type="radio"
                                  name={`preview-radio-${item.id}`}
                                  checked={false}
                                  readOnly
                                />
                                <span>选项 2</span>
                              </label>
                            </div>
                          )}
                        </div>
                      ) : ['SELECT', 'DICT_SELECT'].includes(item.widgetType) ? (
                        <Select
                          value={String(currentValue)}
                          options={
                            options.length > 0
                              ? options
                              : currentValue
                                ? [{ value: String(currentValue), label: String(currentValue) }]
                                : []
                          }
                          placeholder={`请选择${def.name}…`}
                          onChange={(val) => handleDummyChange(def.id, val)}
                        />
                      ) : item.widgetType === 'MULTI_SELECT' ? (
                        <Select
                          multiple
                          value={
                            Array.isArray(currentValue)
                              ? currentValue.map(String)
                              : currentValue
                                ? [String(currentValue)]
                                : []
                          }
                          options={options}
                          placeholder={`请选择${def.name}（可多选）…`}
                          onChange={(vals) => handleDummyChange(def.id, vals)}
                        />
                      ) : item.widgetType === 'TEXTAREA' ? (
                        <textarea
                          rows={2}
                          value={typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue)}
                          placeholder={`请输入${def.name}…`}
                          onChange={(e) => handleDummyChange(def.id, e.target.value)}
                        />
                      ) : item.widgetType === 'NUMBER' ? (
                        <input
                          type="number"
                          value={currentValue}
                          placeholder={`请输入${def.name}数值…`}
                          onChange={(e) => handleDummyChange(def.id, e.target.value)}
                        />
                      ) : ['DATE', 'DATETIME'].includes(item.widgetType) ? (
                        <input
                          type={item.widgetType === 'DATE' ? 'date' : 'datetime-local'}
                          value={currentValue}
                          onChange={(e) => handleDummyChange(def.id, e.target.value)}
                        />
                      ) : (
                        <input
                          type="text"
                          value={typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue)}
                          placeholder={`请输入${def.name}…`}
                          onChange={(e) => handleDummyChange(def.id, e.target.value)}
                        />
                      )}
                    </FormField>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

