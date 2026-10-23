import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  errorMessage,
  type ItemAttributeDefinitionConfiguration,
  type ItemTypeAttributeConfiguration,
  type RhnApi,
} from '../../shared/rhnApi'
import {
  Alert,
  Button,
  Icon,
  LoadingState,
  Select,
  Tabs,
} from '../../shared/ui'
import { AttributeAssignmentDialog } from './item-attributes/AttributeAssignmentDialog'
import { AttributeDefinitionDialog } from './item-attributes/AttributeDefinitionDialog'
import { AttributeDefinitionLibrary } from './item-attributes/AttributeDefinitionLibrary'
import { ItemTypeFormDesigner } from './item-attributes/ItemTypeFormDesigner'

type SubjectType = '' | 'MEDICATION' | 'CATALOG_ITEM'
type ViewMode = 'DEFINITION_LIB' | 'TYPE_DESIGN'

export function ItemAttributeConfigurationPanel({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const [subjectType, setSubjectType] = useState<SubjectType>('MEDICATION')
  const [viewMode, setViewMode] = useState<ViewMode>('DEFINITION_LIB')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('')
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')

  const queryKey = ['item-attribute-configurations', subjectType, '']
  const configuration = useQuery({
    queryKey,
    queryFn: () => api.masterData.itemAttributeConfigurations(subjectType, ''),
  })
  const dictionaries = useQuery({
    queryKey: ['item-attribute-configuration-dictionaries'],
    queryFn: () => api.dictionaries.list('', '', '', 'ACTIVE'),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    setSelectedTypeId('')
    setSelectedDefinitionId('')
  }, [subjectType])

  const values = configuration.data

  // 默认选中第一个属性定义
  useEffect(() => {
    if (!values?.definitions.length) {
      setSelectedDefinitionId('')
      return
    }
    if (!values.definitions.some((value) => value.id === selectedDefinitionId)) {
      setSelectedDefinitionId(values.definitions[0].id)
    }
  }, [values?.definitions, selectedDefinitionId])

  // 默认选中第一个项目类型
  useEffect(() => {
    if (!values?.itemTypes.length) {
      setSelectedTypeId('')
      return
    }
    if (!values.itemTypes.some((value) => value.id === selectedTypeId)) {
      setSelectedTypeId(values.itemTypes[0].id)
    }
  }, [values?.itemTypes, selectedTypeId])

  const refresh = async (message: string) => {
    setDialog(undefined)
    setOperationError('')
    setFeedback(message)
    await queryClient.invalidateQueries({ queryKey: ['item-attribute-configurations'] })
    await queryClient.invalidateQueries({ queryKey: ['master-data-item-attributes'] })
  }

  const fail = (error: unknown) => setOperationError(errorMessage(error))

  // 打开属性定义弹窗
  const openDefinitionDialog = (value?: ItemAttributeDefinitionConfiguration) => {
    setDialog(
      <AttributeDefinitionDialog
        api={api}
        configuration={values}
        dictionaries={dictionaries.data ?? []}
        value={value}
        onClose={() => setDialog(undefined)}
        onSaved={() => refresh(value ? '属性定义已更新' : '属性定义已创建')}
        onError={fail}
      />
    )
  }

  // 打开装配弹窗
  const openAssignmentDialog = (
    definition?: ItemAttributeDefinitionConfiguration,
    assignment?: ItemTypeAttributeConfiguration,
    targetTypeId?: string
  ) => {
    if (!values) return
    setDialog(
      <AttributeAssignmentDialog
        api={api}
        configuration={values}
        definition={definition}
        targetItemTypeId={targetTypeId}
        value={assignment}
        onClose={() => setDialog(undefined)}
        onSaved={() => refresh(assignment ? '类型装配已更新' : '属性已装配到项目类型')}
        onError={fail}
      />
    )
  }

  // 切换定义状态
  const changeDefinitionStatus = async (value: ItemAttributeDefinitionConfiguration) => {
    try {
      await api.masterData.changeItemAttributeDefinitionStatus(
        value,
        value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        '属性定义生命周期调整'
      )
      await refresh(value.status === 'ACTIVE' ? '属性定义已停用' : '属性定义已启用')
    } catch (error) {
      fail(error)
    }
  }

  // 切换装配状态
  const changeAssignmentStatus = async (value: ItemTypeAttributeConfiguration) => {
    try {
      await api.masterData.changeItemTypeAttributeStatus(
        value,
        value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        '项目类型属性装配状态调整'
      )
      await refresh(value.status === 'ACTIVE' ? '属性装配已停用' : '属性装配已启用')
    } catch (error) {
      fail(error)
    }
  }

  // 统计指标
  const stats = useMemo(() => {
    const totalDefs = values?.definitions.length ?? 0
    const platformDefs = values?.definitions.filter((d) => d.scopeType === 'PLATFORM').length ?? 0
    const tenantDefs = totalDefs - platformDefs
    const totalAssignments = values?.assignments.length ?? 0
    const configuredTypes = new Set(values?.assignments.map((a) => a.itemTypeId)).size
    return { totalDefs, platformDefs, tenantDefs, totalAssignments, configuredTypes }
  }, [values])

  return (
    <div className="attribute-config-center">
      {/* 顶部工具栏与统计看板 */}
      <div className="attribute-config-center__toolbar">
        <div>
          <h3>项目类型与扩展属性</h3>
          <p>
            统一治理主数据长尾属性与录入表单装配；平台标准规范只读，租户可自由定义专属属性并按项目分类配置表单排版。
          </p>
        </div>
        <div className="attribute-config-center__actions">
          <Button disabled={!values} onClick={() => openDefinitionDialog()}>
            <Icon name="add" />
            新增租户属性
          </Button>
        </div>
      </div>

      {/* 统计指标小条 */}
      {values && (
        <div className="attribute-config-summary-bar">
          <div className="summary-metric">
            <span className="metric-label">扩展属性总数</span>
            <strong className="metric-value">{stats.totalDefs}</strong>
            <small>({stats.platformDefs} 平台 / {stats.tenantDefs} 租户)</small>
          </div>
          <div className="summary-divider" />
          <div className="summary-metric">
            <span className="metric-label">已装配业务类型</span>
            <strong className="metric-value">{stats.configuredTypes}</strong>
            <small>个项目分类已生效</small>
          </div>
          <div className="summary-divider" />
          <div className="summary-metric">
            <span className="metric-label">生效表单字段总计</span>
            <strong className="metric-value">{stats.totalAssignments}</strong>
            <small>次装配引用</small>
          </div>
        </div>
      )}

      {feedback && <Alert tone="success">{feedback}</Alert>}
      {(operationError || configuration.error || dictionaries.error) && (
        <Alert>{operationError || errorMessage(configuration.error || dictionaries.error)}</Alert>
      )}

      {/* 视图模式切换与大类筛选 */}
      <div className="attribute-config-filters ui-query-filters">
        <Tabs
          value={viewMode}
          onChange={(val) => setViewMode(val as ViewMode)}
          label="视图模式"
          items={[
            { value: 'DEFINITION_LIB', label: '扩展属性元数据库' },
            { value: 'TYPE_DESIGN', label: '按项目类型设计表单' },
          ]}
        />

        <div className="filter-group">
          <Select
            value={subjectType}
            onChange={(value) => setSubjectType(value as SubjectType)}
            options={[
              { value: 'MEDICATION', label: '药品知识主档' },
              { value: 'CATALOG_ITEM', label: '诊疗服务主档' },
            ]}
          />
        </div>
      </div>

      {/* 主视图内容 */}
      {configuration.isPending ? (
        <LoadingState label="正在加载项目类型与属性配置…" />
      ) : viewMode === 'DEFINITION_LIB' ? (
        <AttributeDefinitionLibrary
          api={api}
          configuration={values}
          selectedDefinitionId={selectedDefinitionId}
          onSelectDefinition={setSelectedDefinitionId}
          onOpenDefinitionDialog={openDefinitionDialog}
          onChangeDefinitionStatus={changeDefinitionStatus}
          onOpenAssignmentDialog={(def, assignment) => openAssignmentDialog(def, assignment)}
          onChangeAssignmentStatus={changeAssignmentStatus}
        />
      ) : (
        <ItemTypeFormDesigner
          api={api}
          configuration={values}
          selectedTypeId={selectedTypeId}
          onSelectType={setSelectedTypeId}
          onOpenAssignment={(assignment) =>
            openAssignmentDialog(undefined, assignment, selectedTypeId)
          }
          onChangeStatus={changeAssignmentStatus}
          onRefresh={refresh}
        />
      )}

      {dialog}
    </div>
  )
}
