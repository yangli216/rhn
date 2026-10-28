import { MedicalInsertViewerModal, type MedicalInsertTarget } from '../ai/MedicalInsertViewerModal'
import { ServiceInsertButton } from '../ai/ServiceInsertButton'
import { planNoteContent } from './planNoteContent'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import './outpatient-plan-templates.css'
import '../../../styles/features/outpatient-doctor.css'
import { useEffect, useMemo, useState } from 'react'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { RhnApi } from '../../../shared/api'
import type { MinedPlanSuggestion, OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { OutpatientNoteTemplate } from '../../../shared/api/outpatientNoteTemplatesApi'
import { noteTemplateFields } from '../record/NoteTemplateBar'
import { formatTime } from '../../../shared/format'
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  Icon,
  LoadingState,
  PanelHead,
  Popconfirm,
  SearchField,
  StatusBadge,
  tableCellClass,
  TableShell,
  Tabs,
  Tooltip,
} from '../../../shared/ui'
import { MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { errorMessage } from '../../../shared/api/httpClient'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { ManualClinicalTemplateDialog } from './ManualClinicalTemplateDialog'
import { planSourceReferenceLabel } from './planTaskPresentation'
import { NewTemplateTypeDialog } from './NewTemplateTypeDialog'
import { LegacyOrderSetDetail, OrderSetTemplateDetail } from './OrderSetTemplateDetail'
import { useOrderExecutionDepartments } from '../orders/useOrderExecutionDepartments'
import {
  legacyOrderSetOwnerLabel, templateScopeLabel, templateScopeTone, templateTypeHint, templateTypeLabel,
  type ClinicalTemplateType,
} from './orderSetTemplate'

export interface OutpatientPlanTemplatesWorkspaceProps {
  api: RhnApi
  clinicalContext?: ClinicalContext
}

export function OutpatientPlanTemplatesWorkspace({ api, clinicalContext }: OutpatientPlanTemplatesWorkspaceProps) {
  const queryClient = useQueryClient()
  const [templateType, setTemplateType] = useState<ClinicalTemplateType>('PLAN')
  const [newTypeOpen, setNewTypeOpen] = useState(false)
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'MINED'>('ALL')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [selectedMinedKey, setSelectedMinedKey] = useState('')
  const [aiCompilerOpen, setAiCompilerOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<OutpatientPlanTemplate | null>(null)
  const [manualEditor, setManualEditor] = useState<{
    kind: ClinicalTemplateType; note?: OutpatientNoteTemplate; plan?: OutpatientPlanTemplate; copyFrom?: OutpatientPlanTemplate
  } | null>(null)
  const [notice, setNotice] = useState('')
  const [inspectTarget, setInspectTarget] = useState<MedicalInsertTarget | null>(null)

  // 诊疗方案：接口缺省只返回 PROTOCOL；再按 templateKind 防御性过滤，组套只在“医嘱组套”页签出现。
  const templatesQuery = useQuery({
    queryKey: ['outpatient-plan-templates'],
    queryFn: () => api.outpatientPlanTemplates.list(),
    select: (values) => values.filter((value) => value.templateKind !== 'ORDER_SET'),
  })

  // 医嘱组套：新模板（kind=ORDER_SET）与主数据里尚未迁移的旧组合（只读）；打开“医嘱组套”页签时才读取。
  const orderSetTemplatesQuery = useQuery({
    queryKey: ['outpatient-plan-templates', 'ORDER_SET'],
    queryFn: () => api.outpatientPlanTemplates.list('', 'ORDER_SET'),
    select: (values) => values.filter((value) => value.templateKind === 'ORDER_SET'),
    enabled: templateType === 'ORDER_SET',
  })
  const legacyOrderSetsQuery = useQuery({
    queryKey: ['outpatient-order-set-legacy'],
    queryFn: async () => {
      const rows = await api.masterData.itemGroups('', 'ORDER_SET', 'ACTIVE')
      if (!Array.isArray(rows)) throw new Error('旧组合目录返回异常，请重试')
      return rows
    },
    enabled: templateType === 'ORDER_SET',
    retry: false,
  })
  const executionDepartments = useOrderExecutionDepartments(api, clinicalContext?.organization.id ?? '',
    templateType === 'ORDER_SET' && Boolean(clinicalContext?.organization.id))
  const departmentName = (departmentId: string) => executionDepartments.data?.find((value) => value.id === departmentId)?.name

  const noteTemplatesQuery = useQuery({
    queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE'],
    queryFn: () => api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'),
  })

  const minedQuery = useQuery({
    queryKey: ['outpatient-mined-suggestions'],
    queryFn: () => api.outpatientPlanTemplates.minedSuggestions(),
    enabled: false,
  })

  const filteredTemplates = useMemo(() => {
    if (!templatesQuery.data) return []
    return templatesQuery.data.filter((value) => {
      if (scopeFilter !== 'ALL' && value.scopeType !== scopeFilter) return false
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase()
        const matchName = value.name.toLowerCase().includes(kw)
        const matchDesc = (value.searchProfile?.summary || value.description)?.toLowerCase().includes(kw)
          || value.searchProfile?.keywords.some((word) => word.toLowerCase().includes(kw))
        const matchGuideline = value.guidelineReference?.toLowerCase().includes(kw)
        const matchDiag = value.diagnoses.some((d) => d.display.toLowerCase().includes(kw) || d.code.toLowerCase().includes(kw))
        const matchMed = value.medications.some((m) => m.medicationName.toLowerCase().includes(kw))
        const matchNote = noteTemplatesQuery.data?.some((note) => note.id === value.noteTemplateId
          && note.name.toLowerCase().includes(kw))
        if (!matchName && !matchDesc && !matchGuideline && !matchDiag && !matchMed && !matchNote) return false
      }
      return true
    })
  }, [noteTemplatesQuery.data, templatesQuery.data, scopeFilter, searchKeyword])

  const selectedTemplate = useMemo(() => {
    return filteredTemplates.find((v) => v.id === selectedId) || filteredTemplates[0] || null
  }, [filteredTemplates, selectedId])

  const filteredNoteTemplates = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    return (noteTemplatesQuery.data ?? []).filter((value) => !keyword
      || value.name.toLowerCase().includes(keyword)
      || value.description?.toLowerCase().includes(keyword)
      || noteTemplateFields.some(({ key }) => value.content[key]?.toLowerCase().includes(keyword)))
  }, [noteTemplatesQuery.data, searchKeyword])

  type OrderSetEntry = { id: string; template?: OutpatientPlanTemplate; legacy?: ItemGroup }
  const orderSetEntries = useMemo<OrderSetEntry[]>(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    const templates = (orderSetTemplatesQuery.data ?? []).filter((value) => (scopeFilter === 'ALL' || value.scopeType === scopeFilter)
      && (!keyword || value.name.toLowerCase().includes(keyword) || value.description?.toLowerCase().includes(keyword)
        || value.medications.some((item) => item.medicationName.toLowerCase().includes(keyword))
        || value.services.some((item) => item.itemName.toLowerCase().includes(keyword) || item.itemCode.toLowerCase().includes(keyword))))
    // 旧组合固定为全院范围，只在“全部”和“全院”下出现。
    const legacy = scopeFilter === 'ALL' || scopeFilter === 'HOSPITAL'
      ? (legacyOrderSetsQuery.data ?? []).filter((value) => value.groupType === 'ORDER_SET' && value.status === 'ACTIVE'
        && (!keyword || value.name.toLowerCase().includes(keyword) || value.code.toLowerCase().includes(keyword)
          || value.members.some((member) => member.itemName.toLowerCase().includes(keyword) || member.itemCode.toLowerCase().includes(keyword)))) : []
    return [...templates.map((template) => ({ id: template.id, template })), ...legacy.map((group) => ({ id: group.id, legacy: group }))]
  }, [legacyOrderSetsQuery.data, orderSetTemplatesQuery.data, scopeFilter, searchKeyword])
  const selectedOrderSet = useMemo(() => orderSetEntries.find((value) => value.id === selectedId) || orderSetEntries[0] || null,
    [orderSetEntries, selectedId])

  const selectedNoteTemplate = useMemo(() => filteredNoteTemplates.find((value) => value.id === selectedId)
    || filteredNoteTemplates[0] || null, [filteredNoteTemplates, selectedId])
  const selectedLinkedNoteTemplate = useMemo(() => selectedTemplate?.noteTemplateId
    ? noteTemplatesQuery.data?.find((value) => value.id === selectedTemplate.noteTemplateId) || null
    : null, [noteTemplatesQuery.data, selectedTemplate?.noteTemplateId])
  const selectedWritingContent = planNoteContent(selectedLinkedNoteTemplate?.content, selectedTemplate?.tasks)
  const hasWritingContent = noteTemplateFields.some(({ key }) => selectedWritingContent[key]?.trim())



  useEffect(() => {
    if (templateType === 'PLAN' && selectedTemplate && selectedTemplate.id !== selectedId) {
      setSelectedId(selectedTemplate.id)
    }
  }, [selectedTemplate, selectedId, templateType])

  useEffect(() => {
    if (templateType === 'ORDER_SET' && selectedOrderSet && selectedOrderSet.id !== selectedId) {
      setSelectedId(selectedOrderSet.id)
    }
  }, [selectedId, selectedOrderSet, templateType])

  useEffect(() => {
    if (templateType === 'NOTE' && selectedNoteTemplate && selectedNoteTemplate.id !== selectedId) {
      setSelectedId(selectedNoteTemplate.id)
    }
  }, [selectedId, selectedNoteTemplate, templateType])

  const selectedMined = useMemo(() => {
    if (!minedQuery.data?.length) return null
    return minedQuery.data.find((v) => v.patternKey === selectedMinedKey) || minedQuery.data[0] || null
  }, [minedQuery.data, selectedMinedKey])

  useEffect(() => {
    if (selectedMined && selectedMined.patternKey !== selectedMinedKey) {
      setSelectedMinedKey(selectedMined.patternKey)
    }
  }, [selectedMined, selectedMinedKey])

  const disableMutation = useMutation({
    mutationFn: (template: OutpatientPlanTemplate) =>
      api.outpatientPlanTemplates.disable(template.id, template.revision),
    onSuccess: async (updated) => {
      queryClient.setQueriesData<OutpatientPlanTemplate[]>({ queryKey: ['outpatient-plan-templates'] },
        (current) => current?.filter((template) => template.id !== updated.id))
      await queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
      setNotice(updated.templateKind === 'ORDER_SET' ? `已停用医嘱组套“${updated.name}”。` : `已成功停用方案“${updated.name}”。`)
    },
  })

  const disableNoteMutation = useMutation({
    mutationFn: (template: OutpatientNoteTemplate) =>
      api.outpatientNoteTemplates.disable(template.id, template.revision),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
      setNotice(`已停用病历模板“${updated.name}”。`)
    },
  })

  const solidifyMinedMutation = useMutation({
    mutationFn: async (mined: MinedPlanSuggestion) => {
      return await api.outpatientPlanTemplates.create({
        scopeType: 'PERSONAL',
        name: mined.suggestedName,
        description: mined.description,
        sourceType: 'AI_MINED',
        diagnoses: mined.diagnoses,
        medications: mined.medications,
        services: mined.services,
      })
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
      setSelectedId(created.id)
      setScopeFilter('PERSONAL')
      setNotice(`已成功将开方习惯固化为我的诊疗方案“${created.name}”！`)
    },
  })

  // 范围页签对诊疗方案和医嘱组套通用；旧组合固定算作“全院”。
  const scopeSource: Array<{ scopeType: OutpatientPlanTemplate['scopeType'] }> = templateType === 'ORDER_SET'
    ? [...(orderSetTemplatesQuery.data ?? []), ...(legacyOrderSetsQuery.data ?? []).map(() => ({ scopeType: 'HOSPITAL' as const }))]
    : templatesQuery.data ?? []
  const scopeCount = (scope?: OutpatientPlanTemplate['scopeType']) => {
    const count = scope ? scopeSource.filter((value) => value.scopeType === scope).length : scopeSource.length
    return count ? `(${count})` : undefined
  }
  const scopeTabs: Array<{ value: 'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'MINED'; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部', meta: scopeCount() },
    { value: 'PERSONAL', label: templateScopeLabel('PERSONAL'), meta: scopeCount('PERSONAL') },
    { value: 'DEPARTMENT', label: templateScopeLabel('DEPARTMENT'), meta: scopeCount('DEPARTMENT') },
    { value: 'HOSPITAL', label: templateScopeLabel('HOSPITAL'), meta: scopeCount('HOSPITAL') },
  ]
  const orderSetCount = (orderSetTemplatesQuery.data?.length ?? 0) + (legacyOrderSetsQuery.data?.length ?? 0)

  const error = templatesQuery.error || noteTemplatesQuery.error || minedQuery.error || disableMutation.error
    || orderSetTemplatesQuery.error || legacyOrderSetsQuery.error
    || disableNoteMutation.error || solidifyMinedMutation.error

  return (
    <MasterDetailPage
      title="临床模板库"
      eyebrow="诊疗方案、医嘱组套与病历模板 · 统一维护"
      description="统一维护诊疗方案、医嘱组套和病历模板；三类模板分别保存，使用时按临床安全边界带入对应草稿。"
      actions={<div className="doctor-plan-header-actions">
        <Button variant="secondary" onClick={() => setNewTypeOpen(true)}>
          <Icon name="add" />新建模板
        </Button>
        {templateType === 'PLAN' && <Button variant="primary" onClick={() => { setEditingTemplate(null); setAiCompilerOpen(true) }}>
          <Icon name="sparkles" />AI 智能建方
        </Button>}
      </div>}
      navigationLabel="模板目录"
      navigationHeader={
        <>
          <PanelHead
            title="模板列表"
            actions={
              <StatusBadge tone="neutral">
                {templateType === 'NOTE' ? `${filteredNoteTemplates.length} 个病历模板`
                  : templateType === 'ORDER_SET' ? `${orderSetEntries.length} 个医嘱组套`
                    : scopeFilter === 'MINED' ? `${minedQuery.data?.length ?? 0} 项推荐` : `${filteredTemplates.length} 个方案`}
              </StatusBadge>
            }
          />
          <Tabs value={templateType} onChange={(tabId) => {
            setTemplateType(tabId); setScopeFilter('ALL'); setSearchKeyword(''); setSelectedId(''); setNotice('')
          }} label="模板类型" variant="line" items={[
            { value: 'PLAN', label: templateTypeLabel('PLAN'), meta: templatesQuery.data?.length ? `(${templatesQuery.data.length})` : undefined },
            { value: 'ORDER_SET', label: templateTypeLabel('ORDER_SET'), meta: orderSetCount ? `(${orderSetCount})` : undefined },
            { value: 'NOTE', label: templateTypeLabel('NOTE'), meta: noteTemplatesQuery.data?.length ? `(${noteTemplatesQuery.data.length})` : undefined },
          ]} />
          {templateType !== 'NOTE' && <Tabs
            value={scopeFilter}
            onChange={(tabId) => { setScopeFilter(tabId); setNotice('') }}
            label={templateType === 'ORDER_SET' ? '医嘱组套范围分类' : '方案作用域分类'}
            variant="pills"
            className="doctor-plan-scope-pills"
            items={scopeTabs}
          />}
          {(templateType !== 'PLAN' || scopeFilter !== 'MINED') && (
            <SearchField
              label="搜索模板"
              value={searchKeyword}
              onChange={setSearchKeyword}
              placeholder={templateType === 'NOTE' ? '搜索名称或病历内容...'
                : templateType === 'ORDER_SET' ? '搜索组套名称、药品或项目...' : '搜索方案名称、诊断或药品...'}
            />
          )}
        </>
      }
      navigationResetScrollKey={`${templateType}:${scopeFilter}:${searchKeyword}`}
      detailResetScrollKey={templateType === 'NOTE' ? selectedNoteTemplate?.id
        : templateType === 'PLAN' && scopeFilter === 'MINED' ? selectedMinedKey : selectedId}
      detailLabel="模板明细"
      detailHeader={
        <PanelHead
          title={
            templateType === 'NOTE' ? (selectedNoteTemplate?.name || '病历模板详情')
              : templateType === 'ORDER_SET' ? (selectedOrderSet?.template?.name ?? selectedOrderSet?.legacy?.name ?? '医嘱组套详情')
              : scopeFilter === 'MINED'
              ? (selectedMined?.suggestedName || 'AI 开方习惯推荐详情')
              : (selectedTemplate?.name || '诊疗方案详情')
          }
          actions={
            templateType === 'ORDER_SET' ? (selectedOrderSet?.template ? <div className="doctor-plan-detail-head-actions">
              <div className="doctor-plan-card-badges">
                <StatusBadge tone="warning">{templateTypeLabel('ORDER_SET')}</StatusBadge>
                <StatusBadge tone={templateScopeTone(selectedOrderSet.template.scopeType)}>{templateScopeLabel(selectedOrderSet.template.scopeType)}</StatusBadge>
                <StatusBadge tone={selectedOrderSet.template.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {selectedOrderSet.template.status === 'ACTIVE' ? '启用中' : '已停用'}
                </StatusBadge>
              </div>
              <div className="doctor-plan-detail-head-buttons">
                {selectedOrderSet.template.status === 'ACTIVE' && <Button size="sm" variant="secondary"
                  onClick={() => setManualEditor({ kind: 'ORDER_SET', plan: selectedOrderSet.template })}>编辑组套</Button>}
                <Button size="sm" variant="secondary"
                  onClick={() => setManualEditor({ kind: 'ORDER_SET', copyFrom: selectedOrderSet.template })}>复制为我的</Button>
                {selectedOrderSet.template.status === 'ACTIVE' && <Popconfirm
                  title={`确认停用医嘱组套“${selectedOrderSet.template.name}”？`}
                  description="停用后医生站不再提供该组套，历史使用记录仍会保留。"
                  okText="确认停用" onConfirm={() => disableMutation.mutate(selectedOrderSet.template!)}>
                  <Button size="sm" variant="secondary" busy={disableMutation.isPending}>停用组套</Button>
                </Popconfirm>}
              </div>
            </div> : selectedOrderSet?.legacy ? <div className="doctor-plan-card-badges">
              <StatusBadge tone="warning">{templateTypeLabel('ORDER_SET')}</StatusBadge>
              <StatusBadge tone="success">{legacyOrderSetOwnerLabel}</StatusBadge>
            </div> : undefined)
            : templateType === 'NOTE' ? (selectedNoteTemplate ? <div className="doctor-plan-detail-head-actions">
              <div className="doctor-plan-card-badges">
                <StatusBadge tone="info">{templateTypeLabel('NOTE')}</StatusBadge>
                <StatusBadge tone="neutral">{templateScopeLabel(selectedNoteTemplate.scopeType)}</StatusBadge>
                <StatusBadge tone={selectedNoteTemplate.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {selectedNoteTemplate.status === 'ACTIVE' ? '启用中' : '已停用'}
                </StatusBadge>
              </div>
              {selectedNoteTemplate.status === 'ACTIVE' && <Popconfirm
                title={`确认停用病历模板“${selectedNoteTemplate.name}”？`}
                description="停用后医生站不再提供该模板，历史使用记录仍会保留。"
                okText="确认停用" onConfirm={() => disableNoteMutation.mutate(selectedNoteTemplate)}>
                <Button size="sm" variant="secondary" busy={disableNoteMutation.isPending}>停用模板</Button>
              </Popconfirm>}
              {selectedNoteTemplate.status === 'ACTIVE' && <Button size="sm" variant="secondary"
                onClick={() => setManualEditor({ kind: 'NOTE', note: selectedNoteTemplate })}>人工编辑</Button>}
            </div> : undefined) : scopeFilter === 'MINED' ? (
              selectedMined && <StatusBadge tone="info">近30天开立 {selectedMined.occurrenceCount} 次</StatusBadge>
            ) : selectedTemplate ? (
              <div className="doctor-plan-detail-head-actions">
                <div className="doctor-plan-card-badges">
                  <StatusBadge tone={selectedTemplate.scopeType === 'PERSONAL' ? 'neutral' : selectedTemplate.scopeType === 'DEPARTMENT' ? 'info' : 'success'}>
                    {templateScopeLabel(selectedTemplate.scopeType)}
                  </StatusBadge>
                  {selectedTemplate.sourceType === 'AI_GUIDELINE' && <StatusBadge tone="warning">指南结构化抽取</StatusBadge>}
                  {selectedTemplate.sourceType === 'AI_INPUT' && <StatusBadge tone="info">AI 智能速记</StatusBadge>}
                  {selectedTemplate.sourceType === 'AI_MINED' && <StatusBadge tone="info">开方沉淀</StatusBadge>}
                  <StatusBadge tone={selectedTemplate.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {selectedTemplate.status === 'ACTIVE' ? '启用中' : '已停用'}
                  </StatusBadge>
                </div>
                {selectedTemplate.status === 'ACTIVE' && (
                  <div className="doctor-plan-detail-head-buttons">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingTemplate(selectedTemplate)
                        setAiCompilerOpen(true)
                      }}
                    >
                      编辑方案
                    </Button>
                    <Popconfirm
                      title={`确认停用方案“${selectedTemplate.name}”？`}
                      description="停用后门诊医生站开方时不默认推荐此方案，仍可在此处追溯历史记录。"
                      okText="确认停用"
                      onConfirm={() => disableMutation.mutate(selectedTemplate)}
                    >
                      <Button size="sm" variant="secondary" busy={disableMutation.isPending}>
                        停用方案
                      </Button>
                    </Popconfirm>
                  </div>
                )}
              </div>
            ) : undefined
          }
        />
      }
      detailFooter={
        templateType === 'ORDER_SET' ? (selectedOrderSet ? <div className="doctor-plan-pool-detail__footer">
          <span className="doctor-plan-footer-hint">
            {selectedOrderSet.template
              ? `累计已使用 ${selectedOrderSet.template.useCount} 次${selectedOrderSet.template.updatedAt ? ` · 更新于 ${formatTime(selectedOrderSet.template.updatedAt)}` : ''}`
              : '由医务科在主数据维护；迁入临床模板库后可在此编辑'}
          </span>
        </div> : undefined)
        : templateType === 'NOTE' && selectedNoteTemplate ? <div className="doctor-plan-pool-detail__footer">
          <span className="doctor-plan-footer-hint">
            累计已使用 {selectedNoteTemplate.useCount} 次{selectedNoteTemplate.updatedAt ? ` · 更新于 ${formatTime(selectedNoteTemplate.updatedAt)}` : ''}
          </span>
        </div> : templateType === 'PLAN' && scopeFilter === 'MINED' && selectedMined ? (
          <div className="doctor-plan-pool-detail__footer">
            <span className="doctor-plan-footer-hint">AI 依据近 30 天门诊历史开方行为聚类生成，固化后将收录为医生个人常用方案。</span>
            <Button
              variant="primary"
              busy={solidifyMinedMutation.isPending}
              onClick={() => solidifyMinedMutation.mutate(selectedMined)}
            >
              固化为个人常用方案
            </Button>
          </div>
        ) : selectedTemplate ? (
          <div className="doctor-plan-pool-detail__footer">
            <span className="doctor-plan-footer-hint">
              累计已使用 {selectedTemplate.useCount} 次{selectedTemplate.updatedAt ? ` · 更新于 ${formatTime(selectedTemplate.updatedAt)}` : ''}
            </span>
          </div>
        ) : undefined
      }
      navigation={
        <div className="doctor-plan-pool-list">
          {error && <Alert>{errorMessage(error)}</Alert>}
          {notice && <div className="doctor-plan-pool-notice">{notice}</div>}

          {templateType === 'ORDER_SET' ? (
            (orderSetTemplatesQuery.isPending || legacyOrderSetsQuery.isPending) && !orderSetEntries.length
              ? <LoadingState label="正在加载医嘱组套..." />
              : orderSetEntries.length ? orderSetEntries.map(({ id, template, legacy }) => (
                <Button variant="text" size="sm" key={id} type="button"
                  className={`doctor-plan-item-card ${selectedOrderSet?.id === id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(id)}>
                  <div className="doctor-plan-item-card__top">
                    <div className="doctor-plan-card-badges">
                      <StatusBadge tone="warning">{templateTypeLabel('ORDER_SET')}</StatusBadge>
                      <StatusBadge tone={template ? templateScopeTone(template.scopeType) : 'success'}>
                        {template ? templateScopeLabel(template.scopeType) : templateScopeLabel('HOSPITAL')}
                      </StatusBadge>
                    </div>
                    <small className="doctor-plan-card-meta-text">{template ? `已用 ${template.useCount} 次` : null}</small>
                  </div>
                  <div className="doctor-plan-item-card__title">{template?.name ?? legacy?.name}</div>
                  {template?.description && <div className="doctor-plan-item-card__desc">{template.description}</div>}
                  <div className="doctor-plan-item-card__meta">
                    {template ? <><span>药品 {template.medications.length}</span><span>·</span><span>项目 {template.services.length}</span></>
                      : <><span>项目 {legacy?.members.length ?? 0}</span><span>·</span><span>由医务科维护</span></>}
                  </div>
                </Button>
              )) : <div className="doctor-plan-pool-empty-text">未找到匹配的医嘱组套</div>
          ) : templateType === 'NOTE' ? (
            noteTemplatesQuery.isPending ? <LoadingState label="正在加载病历模板..." />
              : filteredNoteTemplates.length ? filteredNoteTemplates.map((item) => (
                <Button variant="text" size="sm" key={item.id} type="button"
                  className={`doctor-plan-item-card ${selectedNoteTemplate?.id === item.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(item.id)}>
                  <div className="doctor-plan-item-card__top">
                    <div className="doctor-plan-card-badges">
                      <StatusBadge tone="info">病历模板</StatusBadge>
                      <StatusBadge tone="neutral">{templateScopeLabel(item.scopeType)}</StatusBadge>
                    </div>
                    <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                  </div>
                  <div className="doctor-plan-item-card__title">{item.name}</div>
                  <div className="doctor-plan-item-card__desc">{item.description || '门诊病历段落模板'}</div>
                  <div className="doctor-plan-item-card__meta">
                    <span>病历段落 {noteTemplateFields.filter(({ key }) => item.content[key]?.trim()).length}</span>
                  </div>
                </Button>
              )) : <div className="doctor-plan-pool-empty-text">未找到匹配的病历模板</div>
          ) : templateType === 'PLAN' && scopeFilter === 'MINED' ? (
            minedQuery.isPending ? (
              <LoadingState label="正在聚类开方习惯..." />
            ) : minedQuery.data?.length ? (
              minedQuery.data.map((item) => (
                <div
                  key={item.patternKey}
                  className={`doctor-plan-item-card ${selectedMinedKey === item.patternKey ? 'is-selected' : ''}`}
                  onClick={() => setSelectedMinedKey(item.patternKey)}
                >
                  <div className="doctor-plan-item-card__top">
                    <StatusBadge tone="info">近30天开立 {item.occurrenceCount} 次</StatusBadge>
                    <small className="doctor-plan-card-meta-text">AI 习惯挖掘</small>
                  </div>
                  <div className="doctor-plan-item-card__title">{item.suggestedName}</div>
                  <div className="doctor-plan-item-card__desc">{item.description}</div>
                  <div className="doctor-plan-item-card__meta">
                    <span>诊断 {item.diagnoses.length}</span>
                    <span>·</span>
                    <span>药品 {item.medications.length}</span>
                    <span>·</span>
                    <span>诊疗 {item.services.length}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="doctor-plan-pool-empty-text">暂无开方聚类习惯推荐</div>
            )
          ) : templatesQuery.isPending ? (
            <LoadingState label="正在加载方案库..." />
          ) : filteredTemplates.length ? (
            filteredTemplates.map((item) => (
              <div
                key={item.id}
                className={`doctor-plan-item-card ${selectedTemplate?.id === item.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="doctor-plan-item-card__top">
                  <div className="doctor-plan-card-badges">
                    <StatusBadge tone={templateScopeTone(item.scopeType)}>
                      {templateScopeLabel(item.scopeType)}
                    </StatusBadge>
                    {item.sourceType === 'AI_INPUT' && <StatusBadge tone="info">速记</StatusBadge>}
                    {item.sourceType === 'AI_GUIDELINE' && <StatusBadge tone="warning">指南抽取</StatusBadge>}
                    {item.sourceType === 'AI_MINED' && <StatusBadge tone="info">开方沉淀</StatusBadge>}
                  </div>
                  <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                </div>
                <div className="doctor-plan-item-card__title">{item.name}</div>
                {item.guidelineReference && (
                  <div className="doctor-plan-card-guideline">
                    📖 {item.guidelineReference}
                  </div>
                )}
                <div className="doctor-plan-item-card__desc">{item.searchProfile?.summary || item.description || item.name}</div>
                <div className="doctor-plan-item-card__meta">
                  {item.noteTemplateId && <><span>病历 1</span><span>·</span></>}
                  <span>诊断 {item.diagnoses.length}</span>
                  <span>·</span>
                  <span>药品 {item.medications.length}</span>
                  <span>·</span>
                  <span>诊疗 {item.services.length}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="doctor-plan-pool-empty-text">未找到匹配方案</div>
          )}
        </div>
      }
    >
      <div className="doctor-plan-pool-detail__body">
        {templateType === 'ORDER_SET' ? (
          selectedOrderSet?.template ? <OrderSetTemplateDetail template={selectedOrderSet.template}
            departmentName={departmentName} onInspect={setInspectTarget} />
            : selectedOrderSet?.legacy ? <LegacyOrderSetDetail group={selectedOrderSet.legacy} onInspect={setInspectTarget} />
              : <EmptyState icon="clinical" title="请选择医嘱组套"
                copy={`${templateTypeHint('ORDER_SET')}。可点击上方“新建模板”创建，或在医嘱区把当前医嘱存为组套。`} />
        ) : templateType === 'NOTE' ? (
          selectedNoteTemplate ? <>
            {(selectedNoteTemplate.description || selectedNoteTemplate.lastUsedAt) && <div className="doctor-plan-detail-hero">
              {selectedNoteTemplate.description && <p className="doctor-plan-detail-desc">{selectedNoteTemplate.description}</p>}
              {selectedNoteTemplate.lastUsedAt && <small>最近使用：{formatTime(selectedNoteTemplate.lastUsedAt)}</small>}
            </div>}
            <div className="doctor-plan-detail-card">
              <div className="doctor-plan-detail-card__header">
                <div className="doctor-plan-detail-card__title">
                  <Icon name="clinical" className="ui-icon-inline" />
                  <span>病历文书段落</span>
                </div>
              </div>
              <div className="doctor-plan-detail-card__body">
                <div className="doctor-note-sheet-grid">
                  {noteTemplateFields.filter(({ key }) => selectedNoteTemplate.content[key]?.trim()).map(({ key, label }) => (
                    <div key={key} className="doctor-note-sheet-row">
                      <span className="doctor-note-sheet-badge">{label}</span>
                      <div className="doctor-note-sheet-content">
                        {selectedNoteTemplate.content[key]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Alert tone="info">病历模板只保存文书段落，不包含诊断和医嘱；请在医生站基于当前病历创建或调入。</Alert>
          </> : <EmptyState icon="clinical" title="请选择病历模板" copy="从左侧列表中选择模板查看内容。" />
        ) : scopeFilter === 'MINED' ? (
          selectedMined ? (
            <>
              {selectedMined.description && (
                <div className="doctor-plan-detail-hero">
                  <p className="doctor-plan-detail-desc">{selectedMined.description}</p>
                </div>
              )}

              <div className="doctor-plan-detail-section">
                <div className="doctor-plan-detail-section__title">诊断组合 ({selectedMined.diagnoses.length})</div>
                <TableShell className="doctor-plan-table-shell">
                  <DataTable compact className="doctor-plan-items-table">
                    <thead>
                      <tr>
                        <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                        <th className={tableCellClass('text')} style={{ width: '130px' }}>ICD-10 编码</th>
                        <th className={tableCellClass('text')}>诊断名称</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMined.diagnoses.length > 0 ? (
                        selectedMined.diagnoses.map((d) => (
                          <tr key={d.code}>
                            <td className={tableCellClass('status')}>
                              <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                              </StatusBadge>
                            </td>
                            <td className={tableCellClass('text')}><code>{d.code}</code></td>
                            <td className={tableCellClass('text')}><strong>{d.display}</strong></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="doctor-plan-table-empty">暂无诊断记录</td>
                        </tr>
                      )}
                    </tbody>
                  </DataTable>
                </TableShell>
              </div>

              <div className="doctor-plan-detail-section">
                <div className="doctor-plan-detail-section__title">常用开方药品 ({selectedMined.medications.length})</div>
                <TableShell className="doctor-plan-table-shell">
                  <DataTable compact className="doctor-plan-items-table">
                    <thead>
                      <tr>
                        <th className={tableCellClass('text')}>药品编码</th>
                        <th className={tableCellClass('numeric')}>单次剂量</th>
                        <th className={tableCellClass('text')}>途径</th>
                        <th className={tableCellClass('text')}>频次</th>
                        <th className={tableCellClass('numeric')}>疗程</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMined.medications.length > 0 ? (
                        selectedMined.medications.map((m, idx) => (
                          <tr key={idx}>
                            <td className={tableCellClass('text')}><strong>药品 #{m.medicationId}</strong></td>
                            <td className={tableCellClass('numeric')}>{m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}` : '—'}</td>
                            <td className={tableCellClass('text')}>{m.routeCode || '—'}</td>
                            <td className={tableCellClass('text')}>{m.frequencyCode || '—'}</td>
                            <td className={tableCellClass('numeric')}>{m.durationValue ? `${m.durationValue} ${m.durationUnit || '天'}` : '—'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="doctor-plan-table-empty">暂无开方药品</td>
                        </tr>
                      )}
                    </tbody>
                  </DataTable>
                </TableShell>
              </div>
            </>
          ) : (
            <EmptyState icon="clinical" title="暂无高频方案建议" copy="AI 暂未挖掘到可聚类的高频开方组合。" />
          )
        ) : selectedTemplate ? (
          <>
            {selectedTemplate.searchProfile?.summary && <div className="doctor-plan-detail-hero">
              <p className="doctor-plan-detail-desc">{selectedTemplate.searchProfile.summary}
                {selectedTemplate.searchProfile.conditions.length > 0 && <Tooltip content={selectedTemplate.searchProfile.conditions.join('；')}>
                  <Button variant="text" size="sm" aria-label="查看方案适用条件"><Icon name="info" /></Button>
                </Tooltip>}
              </p>
            </div>}
            {selectedTemplate.guidelineReference && (
              <div className="doctor-plan-detail-hero">
                {selectedTemplate.guidelineReference && (
                  <div className="doctor-plan-detail-guideline">
                    📖 用户录入的条文来源（未核验）：{planSourceReferenceLabel(selectedTemplate.guidelineReference)}
                  </div>
                )}
              </div>
            )}

            {(selectedTemplate.noteTemplateId || hasWritingContent) && (
              <div className="doctor-plan-detail-card">
                <div className="doctor-plan-detail-card__header">
                  <div className="doctor-plan-detail-card__title">
                    <Icon name="clinical" className="ui-icon-inline" />
                    <span>配套病历范文</span>
                    {selectedTemplate.noteTemplateId && <StatusBadge tone={selectedLinkedNoteTemplate ? 'info' : 'warning'}>
                      {selectedLinkedNoteTemplate ? '已关联模板' : '模板不可用'}
                    </StatusBadge>}
                  </div>
                  {selectedLinkedNoteTemplate && (
                    <span className="doctor-plan-detail-card__sub">
                      模板：{selectedLinkedNoteTemplate.name}
                    </span>
                  )}
                </div>
                <div className="doctor-plan-detail-card__body">
                  {hasWritingContent ? (
                    <div className="doctor-note-sheet-grid">
                      {noteTemplateFields.filter(({ key }) => selectedWritingContent[key]?.trim()).map(({ key, label }) => (
                        <div key={key} className="doctor-note-sheet-row">
                          <span className="doctor-note-sheet-badge">{label}</span>
                          <div className="doctor-note-sheet-content">
                            {selectedWritingContent[key]}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="doctor-plan-empty-strip">
                      关联的病历模板已停用或不可见，请点击上方“编辑方案”重新选择。
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="doctor-plan-detail-card">
              <div className="doctor-plan-detail-card__header">
                <div className="doctor-plan-detail-card__title">
                  <Icon name="tasks" className="ui-icon-inline" />
                  <span>拟诊记录</span>
                  <span className="doctor-plan-card-count">{selectedTemplate.diagnoses.length} 项</span>
                </div>
              </div>
              <div className="doctor-plan-detail-card__body">
                {selectedTemplate.diagnoses.length > 0 ? (
                  <div className="doctor-plan-diagnosis-grid">
                    {selectedTemplate.diagnoses.map((d) => (
                      <div key={d.code} className={`doctor-plan-diagnosis-strip ${d.type === 'PRIMARY' ? 'is-primary' : ''}`}>
                        <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                          {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                        </StatusBadge>
                        <code className="doctor-plan-diagnosis-code">{d.code}</code>
                        <strong className="doctor-plan-diagnosis-name">{d.display}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="doctor-plan-empty-strip">暂无诊断记录</div>
                )}
              </div>
            </div>

            <div className="doctor-plan-detail-card">
              <div className="doctor-plan-detail-card__header">
                <div className="doctor-plan-detail-card__title">
                  <Icon name="pill" className="ui-icon-inline" />
                  <span>拟开立处方药品</span>
                  <span className="doctor-plan-card-count">{selectedTemplate.medications.length} 项</span>
                </div>
              </div>
              <div className="doctor-plan-detail-card__table-wrapper">
                <DataTable compact className="doctor-plan-items-table">
                  <thead>
                    <tr>
                      <th className={`${tableCellClass('text')} doctor-col--med-name`}>药品名称及规格</th>
                      <th className={`${tableCellClass('numeric')} doctor-col--dose`}>单次剂量</th>
                      <th className={`${tableCellClass('text')} doctor-col--route`}>途径</th>
                      <th className={`${tableCellClass('text')} doctor-col--frequency`}>频次</th>
                      <th className={`${tableCellClass('numeric')} doctor-col--duration`}>疗程</th>
                      <th className={`${tableCellClass('text')} doctor-col--instruction`}>用法说明 / 嘱托</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTemplate.medications.length > 0 ? (
                      selectedTemplate.medications.map((m) => (
                        <tr key={m.lineId}>
                          <td className={`${tableCellClass('text')} doctor-col--med-name`}>
                            <div className="doctor-plan-med-name-cell">
                              <strong>{m.medicationName}</strong>
                              {m.preparationSpec && <span className="doctor-plan-item-spec">{m.preparationSpec}</span>}
                            </div>
                          </td>
                          <td className={`${tableCellClass('numeric')} doctor-col--dose`}>
                            {m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}` : <span className="doctor-plan-item-subtext">待确认</span>}
                          </td>
                          <td className={`${tableCellClass('text')} doctor-col--route`}>{m.routeName || m.routeCode || '—'}</td>
                          <td className={`${tableCellClass('text')} doctor-col--frequency`}>{m.frequencyCode || '—'}</td>
                          <td className={`${tableCellClass('numeric')} doctor-col--duration`}>
                            {m.durationValue ? `${m.durationValue} ${m.durationUnit || '天'}` : <span className="doctor-plan-item-subtext">待确认</span>}
                          </td>
                          <td className={`${tableCellClass('text')} doctor-col--instruction`}>
                            <div className="doctor-plan-instruction-cell" title={m.medicationInstruction || undefined}>
                              {m.medicationInstruction || '—'}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="doctor-plan-table-empty">暂无处方药品</td>
                      </tr>
                    )}
                  </tbody>
                </DataTable>
              </div>
            </div>

            <div className="doctor-plan-detail-card">
              <div className="doctor-plan-detail-card__header">
                <div className="doctor-plan-detail-card__title">
                  <Icon name="flask" className="ui-icon-inline" />
                  <span>检查 / 检验 / 治疗项目</span>
                  <span className="doctor-plan-card-count">{selectedTemplate.services.length} 项</span>
                </div>
              </div>
              <div className="doctor-plan-detail-card__table-wrapper">
                <DataTable compact className="doctor-plan-items-table">
                  <thead>
                    <tr>
                      <th className={`${tableCellClass('text')} doctor-col--service-name`}>项目名称</th>
                      <th className={`${tableCellClass('status')} doctor-col--service-type`}>类型</th>
                      <th className={`${tableCellClass('numeric')} doctor-col--service-qty`}>数量</th>
                      <th className={`${tableCellClass('text')} doctor-col--service-desc`}>临床指征 / 要求</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTemplate.services.length > 0 ? (
                      selectedTemplate.services.map((s, idx) => (
                        <tr key={idx}>
                          <td className={`${tableCellClass('text')} doctor-col--service-name`}>
                            <span className="doctor-order-name-with-action">
                              <strong>{s.itemName}</strong>
                              <ServiceInsertButton name={s.itemName} serviceType={s.serviceType} onView={setInspectTarget} />
                            </span>
                          </td>
                          <td className={`${tableCellClass('status')} doctor-col--service-type`}>
                            <StatusBadge tone="neutral">
                              {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '治疗'}
                            </StatusBadge>
                          </td>
                          <td className={`${tableCellClass('numeric')} doctor-col--service-qty`}>{s.quantity} {s.unitCode}</td>
                          <td className={`${tableCellClass('text')} doctor-col--service-desc`}>
                            <div className="doctor-plan-instruction-cell" title={s.clinicalDescription || undefined}>
                              {s.clinicalDescription || '—'}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="doctor-plan-table-empty">暂无检查检验治疗项目</td>
                      </tr>
                    )}
                  </tbody>
                </DataTable>
              </div>
            </div>


          </>
        ) : (
          <EmptyState icon="clinical" title="请选择方案" copy="从左侧列表中选择诊疗方案查看明细，或点击上方进行 AI 建方。" />
        )}
      </div>

      {newTypeOpen && <NewTemplateTypeDialog initialType={templateType} onCancel={() => setNewTypeOpen(false)}
        onConfirm={(type) => {
          setNewTypeOpen(false)
          if (type !== templateType) { setTemplateType(type); setScopeFilter('ALL'); setSearchKeyword(''); setSelectedId('') }
          setNotice('')
          setManualEditor({ kind: type })
        }} />}
      {templateType === 'PLAN' && aiCompilerOpen && (
        <AiPlanTemplateDraftModal
          api={api}
          organizationId={clinicalContext?.organization.id}
          initialScope={scopeFilter === 'DEPARTMENT' ? 'DEPARTMENT' : scopeFilter === 'HOSPITAL' ? 'HOSPITAL' : 'PERSONAL'}
          editingTemplate={editingTemplate}
          onClose={() => {
            setAiCompilerOpen(false)
            setEditingTemplate(null)
          }}
          onSaved={(saved) => {
            void queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
            setSelectedId(saved.id)
            setAiCompilerOpen(false)
            setNotice(editingTemplate ? `方案“${saved.name}”调整已保存并生效！` : `方案“${saved.name}”已通过 AI 编译并成功存入方案池！`)
            setEditingTemplate(null)
          }}
        />
      )}
      {manualEditor && <ManualClinicalTemplateDialog api={api}
        organizationId={clinicalContext?.organization.id}
        kind={manualEditor.kind} editingNote={manualEditor.note} editingPlan={manualEditor.plan} copyFrom={manualEditor.copyFrom}
        onClose={() => setManualEditor(null)} onSaved={(saved) => {
          const isNote = manualEditor.kind === 'NOTE'
          void queryClient.invalidateQueries({ queryKey: [isNote ? 'outpatient-note-templates' : 'outpatient-plan-templates'] })
          setSelectedId(saved.id)
          setScopeFilter('ALL')
          setNotice(`${templateTypeLabel(manualEditor.kind)}“${saved.name}”已保存。`)
          setManualEditor(null)
        }} />}
      <MedicalInsertViewerModal isOpen={Boolean(inspectTarget)} onClose={() => setInspectTarget(null)}
        target={inspectTarget} api={api} />
    </MasterDetailPage>
  )
}

export default OutpatientPlanTemplatesWorkspace
