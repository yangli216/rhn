import { useMemo, useState } from 'react'
import type {
  ItemAttributeConfiguration,
  ItemAttributeDefinitionConfiguration,
  ItemTypeAttributeConfiguration,
  RhnApi,
} from '../../../shared/rhnApi'
import {
  Button,
  DataTable,
  EmptyState,
  Icon,
  SearchField,
  StatusBadge,
} from '../../../shared/ui'
import {
  contextHint,
  contextLabel,
  dataTypeLabel,
  displayJson,
  scopeLabel,
  variabilityHint,
  variabilityLabel,
  widgetLabel,
} from './attributeConfigurationUtils'
import { AttributeInheritanceSimulatorDialog } from './AttributeInheritanceSimulatorDialog'

export function AttributeDefinitionLibrary({
  api: _api,
  configuration,
  selectedDefinitionId,
  onSelectDefinition,
  onOpenDefinitionDialog,
  onChangeDefinitionStatus,
  onOpenAssignmentDialog,
  onChangeAssignmentStatus,
}: {
  api: RhnApi
  configuration?: ItemAttributeConfiguration
  selectedDefinitionId: string
  onSelectDefinition: (id: string) => void
  onOpenDefinitionDialog: (def?: ItemAttributeDefinitionConfiguration) => void
  onChangeDefinitionStatus: (def: ItemAttributeDefinitionConfiguration) => Promise<void>
  onOpenAssignmentDialog: (
    def: ItemAttributeDefinitionConfiguration,
    assignment?: ItemTypeAttributeConfiguration
  ) => void
  onChangeAssignmentStatus: (assignment: ItemTypeAttributeConfiguration) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [simulatorOpen, setSimulatorOpen] = useState(false)

  const definitions = useMemo(() => {
    const list = configuration?.definitions ?? []
    const normalized = query.trim().toLowerCase()
    if (!normalized) return list
    return list.filter((item) =>
      [item.name, item.code, item.description].some((text) =>
        text.toLowerCase().includes(normalized)
      )
    )
  }, [configuration?.definitions, query])

  const selected = useMemo(
    () => definitions.find((item) => item.id === selectedDefinitionId),
    [definitions, selectedDefinitionId]
  )

  const assignments = useMemo(
    () =>
      (configuration?.assignments ?? []).filter(
        (item) => item.definitionId === selectedDefinitionId
      ),
    [configuration?.assignments, selectedDefinitionId]
  )

  return (
    <div className="attribute-definition-library-layout">
      {/* 搜索与属性列表 */}
      <div className="attribute-config-definitions" role="listbox" aria-label="属性定义">
        <div className="attribute-definition-search-box">
          <SearchField
            label="搜索属性"
            value={query}
            onChange={setQuery}
            placeholder="搜索属性名称、编码或说明"
          />
        </div>
        {definitions.map((value) => {
          const count = (configuration?.assignments ?? []).filter(
            (item) => item.definitionId === value.id
          ).length
          const isSelected = value.id === selectedDefinitionId
          return (
            <div
              key={value.id}
              role="button"
              tabIndex={0}
              className={`attribute-definition-card ${isSelected ? 'is-active' : ''}`}
              onClick={() => onSelectDefinition(value.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectDefinition(value.id)
                }
              }}
            >
              <div className="attribute-definition-card__main">
                <div className="attribute-definition-card__title">
                  <strong>{value.name}</strong>
                  {value.status !== 'ACTIVE' && <StatusBadge tone="neutral">已停用</StatusBadge>}
                </div>
                <code>{value.code}</code>
                <div className="attribute-definition-card__meta">
                  <span className="attribute-type-chip">
                    {dataTypeLabel(value.dataType)} · {value.cardinality === 'MULTIPLE' ? '多值' : '单值'}
                  </span>
                </div>
              </div>
              <div className="attribute-definition-card__side">
                <StatusBadge tone={value.scopeType === 'PLATFORM' ? 'neutral' : 'info'}>
                  {value.scopeType === 'PLATFORM' ? '平台' : '租户'}
                </StatusBadge>
                <small className={count > 0 ? 'count-active' : 'count-zero'}>
                  {count > 0 ? `${count} 个装配` : '未装配'}
                </small>
              </div>
            </div>
          )
        })}
      </div>

      {/* 详情与已装配项目类型 */}
      {selected ? (
        <section className="attribute-config-detail">
          <header>
            <div>
              <div className="attribute-config-detail__badges">
                <StatusBadge tone={selected.scopeType === 'PLATFORM' ? 'neutral' : 'info'}>
                  {selected.scopeType === 'PLATFORM' ? '平台标准规范 · 定义只读' : '租户自定义扩展'}
                </StatusBadge>
                <StatusBadge>
                  {dataTypeLabel(selected.dataType)} · {selected.cardinality === 'MULTIPLE' ? '多值' : '单值'}
                </StatusBadge>
                <StatusBadge tone={selected.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {selected.status === 'ACTIVE' ? '有效' : '已停用'}
                </StatusBadge>
                {selected.storageMode === 'PROJECTED' && (
                  <StatusBadge tone="warning">强类型表投影</StatusBadge>
                )}
              </div>
              <h3>{selected.name}</h3>
              <code>{selected.code}</code>
              <p>{selected.description}</p>
            </div>
            <div className="attribute-config-detail__actions">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSimulatorOpen(true)}
              >
                <Icon name="clinical" />
                链路穿透模拟
              </Button>
              {selected.editable ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenDefinitionDialog(selected)}
                  >
                    编辑定义
                  </Button>
                  <Button
                    size="sm"
                    variant="text"
                    onClick={() => onChangeDefinitionStatus(selected)}
                  >
                    {selected.status === 'ACTIVE' ? '停用' : '启用'}
                  </Button>
                </>
              ) : (
                <span className="platform-locked-pill" title="平台基线标准属性不可编辑或删除定义，但可装配到业务类型">
                  平台标准锁定
                </span>
              )}
            </div>
          </header>

          <div className="attribute-config-metadata-grid">
            <div className="attribute-metadata-card">
              <span className="attribute-metadata-card__label">多级覆盖与可变性</span>
              <strong className="attribute-metadata-card__value">
                {variabilityLabel(selected.variability)}
              </strong>
              <span className="attribute-metadata-card__hint">
                {variabilityHint(selected.variability)}
              </span>
            </div>
            <div className="attribute-metadata-card">
              <span className="attribute-metadata-card__label">生效解析依据</span>
              <strong className="attribute-metadata-card__value">
                {contextLabel(selected.contextBasis)}
              </strong>
              <span className="attribute-metadata-card__hint">
                {contextHint(selected.contextBasis)}
              </span>
            </div>
            <div className="attribute-metadata-card">
              <span className="attribute-metadata-card__label">允许覆盖作用域</span>
              <div className="attribute-metadata-card__scopes">
                {selected.allowedScopes.length > 0 ? (
                  selected.allowedScopes.map((scope) => (
                    <StatusBadge key={scope} tone="info">
                      {scopeLabel(scope)}
                    </StatusBadge>
                  ))
                ) : (
                  <span className="attribute-metadata-card__empty">仅公共基线，不可覆盖</span>
                )}
              </div>
              <span className="attribute-metadata-card__hint">
                {selected.allowedScopes.length > 0
                  ? '支持机构/科室在此范围自定义覆盖'
                  : '所有机构科室均继承统一默认值'}
              </span>
            </div>
            <div className="attribute-metadata-card">
              <span className="attribute-metadata-card__label">默认回退值</span>
              <strong className="attribute-metadata-card__value attribute-metadata-card__value--code">
                {displayJson(selected.defaultValue)}
              </strong>
              <span className="attribute-metadata-card__hint">未维护具体覆盖值时的自动生效值</span>
            </div>
          </div>

          <div className="attribute-config-assignments__header">
            <div>
              <h4>装配到的项目类型</h4>
              <p>在此查看该属性已装配到了哪些药品或诊疗服务类型，子类型配置优先于父类型生效。</p>
            </div>
            {selected.status === 'ACTIVE' && (
              <Button size="sm" onClick={() => onOpenAssignmentDialog(selected)}>
                <Icon name="add" />
                新增装配
              </Button>
            )}
          </div>

          {assignments.length === 0 ? (
            <EmptyState
              icon="settings"
              title="尚未装配到任何项目类型"
              copy="该属性已就绪。点击上方“新增装配”按钮，将其挂载到药品或诊疗的具体业务分类中。"
            />
          ) : (
            <div className="table-wrap">
              <DataTable className="data-table attribute-assignments-table">
                <thead>
                  <tr>
                    <th>项目类型</th>
                    <th>业务分组与排序</th>
                    <th>录入控件</th>
                    <th>维护规则</th>
                    <th>生效状态</th>
                    <th>装配操作</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => {
                    const type = configuration?.itemTypes.find(
                      (item) => item.id === assignment.itemTypeId
                    )
                    return (
                      <tr key={assignment.id}>
                        <td>
                          <div className="attribute-type-cell">
                            <strong>{type?.name || '未知项目类型'}</strong>
                            <code>{type?.code}</code>
                          </div>
                        </td>
                        <td>
                          <div className="assignment-group-cell">
                            <span className="assignment-group-name">
                              {assignment.groupName || '默认分组'}
                            </span>
                            <div className="assignment-order-chips">
                              <span className="order-chip" title="分类大组的排列权重">
                                大类 #{assignment.groupSortOrder}
                              </span>
                              <span className="order-chip" title="组内属性的排列次序">
                                序号 #{assignment.attributeSortOrder}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="attribute-widget-pill">
                            {widgetLabel(assignment.widgetType)}
                          </span>
                        </td>
                        <td>
                          <div className="assignment-rule-cell">
                            <StatusBadge tone={assignment.required ? 'danger' : 'neutral'}>
                              {assignment.required ? '必填' : '选填'}
                            </StatusBadge>
                            {assignment.listDisplay && <StatusBadge tone="info">列表呈现</StatusBadge>}
                          </div>
                        </td>
                        <td>
                          <StatusBadge tone={assignment.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {assignment.status === 'ACTIVE' ? '有效' : '已停用'}
                          </StatusBadge>
                        </td>
                        <td>
                          {assignment.editable ? (
                            <div className="row-actions">
                              <Button
                                size="sm"
                                variant="text"
                                onClick={() => onOpenAssignmentDialog(selected, assignment)}
                              >
                                编辑装配
                              </Button>
                              <Button
                                size="sm"
                                variant="text"
                                onClick={() => onChangeAssignmentStatus(assignment)}
                              >
                                {assignment.status === 'ACTIVE' ? '停用' : '启用'}
                              </Button>
                            </div>
                          ) : (
                            <span className="platform-preset-tag" title="系统预置装配，定义由平台统一锁定">
                              平台预置
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </DataTable>
            </div>
          )}
        </section>
      ) : (
        <EmptyState
          icon="settings"
          title="请选择左侧属性查看详情"
          copy="点击左侧列表中的属性项，查看其元数据与装配详情。"
        />
      )}
      {selected && simulatorOpen && (
        <AttributeInheritanceSimulatorDialog
          definition={selected}
          onClose={() => setSimulatorOpen(false)}
        />
      )}
    </div>
  )
}
