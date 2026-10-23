import { useMemo, useState } from 'react'
import type {
  ItemAttributeConfiguration,
  ItemTypeAttributeConfiguration,
  ItemTypeAttributeInput,
  RhnApi,
} from '../../../shared/rhnApi'
import {
  Alert,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  FormField,
  Icon,
  SearchField,
  Select,
  StatusBadge,
} from '../../../shared/ui'
import { widgetLabel } from './attributeConfigurationUtils'
import { AttributeLivePreview } from './AttributeLivePreview'

export function ItemTypeFormDesigner({
  api,
  configuration,
  selectedTypeId,
  onSelectType,
  onOpenAssignment,
  onChangeStatus,
  onRefresh,
}: {
  api: RhnApi
  configuration?: ItemAttributeConfiguration
  selectedTypeId: string
  onSelectType: (typeId: string) => void
  onOpenAssignment: (assignment?: ItemTypeAttributeConfiguration) => void
  onChangeStatus: (assignment: ItemTypeAttributeConfiguration) => Promise<void>
  onRefresh?: (message: string) => Promise<void>
}) {
  const [typeQuery, setTypeQuery] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [cloneDialogVisible, setCloneDialogVisible] = useState(false)
  const [sourceTypeId, setSourceTypeId] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState('')

  // 过滤项目类型
  const filteredTypes = useMemo(() => {
    const list = configuration?.itemTypes ?? []
    const q = typeQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (item) => item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)
    )
  }, [configuration?.itemTypes, typeQuery])

  // 当前选中的类型对象
  const currentType = useMemo(
    () => configuration?.itemTypes.find((item) => item.id === selectedTypeId),
    [configuration?.itemTypes, selectedTypeId]
  )

  // 当前类型下的装配关系
  const currentAssignments = useMemo(() => {
    if (!configuration || !selectedTypeId) return []
    return configuration.assignments
      .filter((item) => item.itemTypeId === selectedTypeId)
      .sort((a, b) => {
        if (a.groupSortOrder !== b.groupSortOrder) return a.groupSortOrder - b.groupSortOrder
        return a.attributeSortOrder - b.attributeSortOrder
      })
  }, [configuration, selectedTypeId])

  // 按分组聚合
  const groupedAssignments = useMemo(() => {
    const map = new Map<string, ItemTypeAttributeConfiguration[]>()
    for (const a of currentAssignments) {
      const g = a.groupName || '默认分组'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(a)
    }
    return Array.from(map.entries())
  }, [currentAssignments])

  return (
    <div className="item-type-form-designer-layout">
      {/* 左侧：项目类型选择器 */}
      <div className="item-type-selector-pane" role="region" aria-label="项目类型列表">
        <div className="item-type-selector-pane__search">
          <SearchField
            label="搜索项目类型"
            value={typeQuery}
            onChange={setTypeQuery}
            placeholder="搜索项目类型名称或编码"
          />
        </div>
        <div className="item-type-selector-pane__list" role="listbox" aria-label="项目类型列表项">
          {filteredTypes.map((type) => {
            const count = (configuration?.assignments ?? []).filter(
              (item) => item.itemTypeId === type.id
            ).length
            const isSelected = type.id === selectedTypeId
            return (
              <div
                key={type.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                className={`item-type-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelectType(type.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectType(type.id)
                  }
                }}
              >
                <div className="item-type-card__main">
                  <strong>{type.name}</strong>
                  <code>{type.code}</code>
                </div>
                <div className="item-type-card__side">
                  <span className={`count-tag ${count > 0 ? 'count-tag--active' : 'count-tag--zero'}`}>
                    {count > 0 ? `${count} 个字段` : '未配置'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 右侧：表单设计画布与属性装配管理 */}
      <div className="item-type-canvas-pane">
        {!currentType ? (
          <EmptyState
            icon="settings"
            title="请在左侧选择要配置的项目类型"
            copy="选择西药、中药、检查或检验类型，直观设计录入表单上的字段分组与排序。"
          />
        ) : (
          <div className="item-type-canvas-content">
            <header className="item-type-canvas-header">
              <div className="item-type-canvas-header__title">
                <h3>{currentType.name} · 表单扩展字段装配</h3>
                <code>{currentType.code}</code>
                <p>
                  在此为“{currentType.name}”装配租户或平台扩展属性，控制业务人员在新建或编辑该类型时的表单字段排序、录入控件与必填约束。
                </p>
              </div>
              <div className="item-type-canvas-header__actions">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowPreview((prev) => !prev)}
                >
                  <Icon name="clinical" />
                  {showPreview ? '收起表单预览' : '实时表单预览'}
                </Button>
                {configuration && configuration.assignments.some((a) => a.itemTypeId !== selectedTypeId) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSourceTypeId('')
                      setCloneError('')
                      setCloneDialogVisible(true)
                    }}
                  >
                    从其他类型克隆
                  </Button>
                )}
                <Button size="sm" onClick={() => onOpenAssignment()}>
                  <Icon name="add" />
                  装配扩展属性
                </Button>
              </div>
            </header>

            {showPreview && (
              <div className="item-type-preview-section">
                <AttributeLivePreview
                  configuration={configuration}
                  selectedItemTypeId={selectedTypeId}
                />
              </div>
            )}

            {currentAssignments.length === 0 ? (
              <EmptyState
                icon="settings"
                title={`“${currentType.name}”暂未装配任何扩展字段`}
                copy="点击右上角“装配扩展属性”，从平台标准库或租户属性库中选择字段加入表单。"
              />
            ) : (
              <div className="item-type-groups-list">
                {groupedAssignments.map(([groupName, items]) => {
                  const groupWeight = items[0]?.groupSortOrder ?? 50
                  return (
                    <div key={groupName} className="item-type-group-card">
                      <div className="item-type-group-card__header">
                        <div className="group-title-wrap">
                          <span className="group-icon">
                            <Icon name="file-text" />
                          </span>
                          <strong>{groupName}</strong>
                          <span className="order-chip">大组排序权重: {groupWeight}</span>
                        </div>
                        <span className="group-count-text">{items.length} 个字段</span>
                      </div>
                      <div className="table-wrap">
                        <DataTable className="data-table item-type-assignments-table">
                          <thead>
                            <tr>
                              <th>属性名称与编码</th>
                              <th>属性类型</th>
                              <th>录入控件</th>
                              <th>组内序号</th>
                              <th>校验规则</th>
                              <th>状态</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((assignment) => {
                              const def = configuration?.definitions.find(
                                (d) => d.id === assignment.definitionId
                              )
                              return (
                                <tr key={assignment.id}>
                                  <td>
                                    <div className="attribute-type-cell">
                                      <strong>{def?.name || '未知属性'}</strong>
                                      <code>{def?.code}</code>
                                    </div>
                                  </td>
                                  <td>
                                    <StatusBadge tone={def?.scopeType === 'PLATFORM' ? 'neutral' : 'info'}>
                                      {def?.scopeType === 'PLATFORM' ? '平台标准' : '租户专属'}
                                    </StatusBadge>
                                  </td>
                                  <td>
                                    <span className="attribute-widget-pill">
                                      {widgetLabel(assignment.widgetType)}
                                    </span>
                                  </td>
                                  <td>
                                    <span className="order-chip">#{assignment.attributeSortOrder}</span>
                                  </td>
                                  <td>
                                    <div className="assignment-rule-cell">
                                      <StatusBadge tone={assignment.required ? 'danger' : 'neutral'}>
                                        {assignment.required ? '必填' : '选填'}
                                      </StatusBadge>
                                      {assignment.listDisplay && (
                                        <StatusBadge tone="info">列表呈现</StatusBadge>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <StatusBadge
                                      tone={assignment.status === 'ACTIVE' ? 'success' : 'neutral'}
                                    >
                                      {assignment.status === 'ACTIVE' ? '有效' : '已停用'}
                                    </StatusBadge>
                                  </td>
                                  <td>
                                    {assignment.editable ? (
                                      <div className="row-actions">
                                        <Button
                                          size="sm"
                                          variant="text"
                                          onClick={() => onOpenAssignment(assignment)}
                                        >
                                          编辑
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="text"
                                          onClick={() => onChangeStatus(assignment)}
                                        >
                                          {assignment.status === 'ACTIVE' ? '停用' : '启用'}
                                        </Button>
                                      </div>
                                    ) : (
                                      <span className="platform-preset-tag">平台预置</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </DataTable>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {cloneDialogVisible && currentType && (
        <Dialog
          title={`克隆扩展表单配置至“${currentType.name}”`}
          eyebrow="高效批量装配 · 跨类型复用"
          size="wide"
          description={`从现有已配置的项目类型中，复制其全部扩展属性装配、分组、顺序及录入控件设置至“${currentType.name}”。已存在的属性将自动跳过。`}
          onClose={() => setCloneDialogVisible(false)}
        >
          <div className="clone-assignments-dialog-content">
            {cloneError && <Alert placement="inline">{cloneError}</Alert>}
            <FormField label="选择来源项目类型" required hint="选择配置完善的源项目分类进行克隆">
              <Select
                value={sourceTypeId}
                onChange={setSourceTypeId}
                placeholder="请选择来源项目类型"
                options={(configuration?.itemTypes ?? [])
                  .filter((t) => t.id !== selectedTypeId)
                  .map((t) => {
                    const count = (configuration?.assignments ?? []).filter(
                      (a) => a.itemTypeId === t.id
                    ).length
                    return {
                      value: t.id,
                      label: t.name,
                      secondaryText: `${t.code} (${count} 个字段)`,
                    }
                  })}
              />
            </FormField>

            {sourceTypeId && (
              <div className="clone-preview-box">
                <span className="clone-preview-title">将被克隆的扩展字段清单：</span>
                <ul className="clone-fields-list">
                  {(configuration?.assignments ?? [])
                    .filter((a) => a.itemTypeId === sourceTypeId)
                    .map((a) => {
                      const def = configuration?.definitions.find((d) => d.id === a.definitionId)
                      const alreadyExists = currentAssignments.some(
                        (existing) => existing.definitionId === a.definitionId
                      )
                      return (
                        <li key={a.id} className={alreadyExists ? 'is-skipped' : ''}>
                          <strong>{def?.name || a.definitionId}</strong>
                          <small>分组: {a.groupName || '默认'} · #{a.attributeSortOrder}</small>
                          {alreadyExists && <StatusBadge tone="neutral">已存在 (将跳过)</StatusBadge>}
                        </li>
                      )
                    })}
                </ul>
              </div>
            )}

            <div className="ui-form-actions">
              <Button variant="secondary" onClick={() => setCloneDialogVisible(false)}>
                取消
              </Button>
              <Button
                busy={cloning}
                disabled={!sourceTypeId}
                onClick={async () => {
                  setCloning(true)
                  setCloneError('')
                  try {
                    const sourceAssignments = (configuration?.assignments ?? []).filter(
                      (a) => a.itemTypeId === sourceTypeId
                    )
                    const toClone = sourceAssignments.filter(
                      (sa) => !currentAssignments.some((ca) => ca.definitionId === sa.definitionId)
                    )
                    if (toClone.length === 0) {
                      setCloneError('源项目类型中的所有字段均已存在于目标类型中，无需重复克隆。')
                      return
                    }
                    for (const a of toClone) {
                      const input: ItemTypeAttributeInput = {
                        itemTypeId: selectedTypeId,
                        definitionId: a.definitionId,
                        required: a.required,
                        defaultValue: a.defaultValue,
                        widgetType: a.widgetType,
                        groupName: a.groupName,
                        groupSortOrder: a.groupSortOrder,
                        attributeSortOrder: a.attributeSortOrder,
                        searchable: a.searchable,
                        listDisplay: a.listDisplay,
                        reason: `从类型 [${sourceTypeId}] 克隆表单配置`,
                        requestCode: crypto.randomUUID(),
                      }
                      await api.masterData.createItemTypeAttribute(input)
                    }
                    setCloneDialogVisible(false)
                    if (onRefresh) {
                      await onRefresh(`成功从来源类型克隆了 ${toClone.length} 项扩展属性装配`)
                    }
                  } catch (err: any) {
                    setCloneError(err?.message || '克隆装配失败，请重试')
                  } finally {
                    setCloning(false)
                  }
                }}
              >
                开始克隆
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
