import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { ClinicalContext } from '../../../app/AppShell'
import type { RhnApi } from '../../../shared/api'
import type { MinedPlanSuggestion, OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
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
} from '../../../shared/ui'
import { MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { errorMessage } from '../../../shared/api/httpClient'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { ManualClinicalTemplateDialog } from './ManualClinicalTemplateDialog'
import { planSourceReferenceLabel, planTaskKindLabel } from './planTaskPresentation'

export interface OutpatientPlanTemplatesWorkspaceProps {
  api: RhnApi
  clinicalContext?: ClinicalContext
}

export function OutpatientPlanTemplatesWorkspace({ api, clinicalContext }: OutpatientPlanTemplatesWorkspaceProps) {
  const queryClient = useQueryClient()
  const [templateType, setTemplateType] = useState<'NOTE' | 'PLAN'>('PLAN')
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'MINED'>('ALL')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [selectedMinedKey, setSelectedMinedKey] = useState('')
  const [aiCompilerOpen, setAiCompilerOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<OutpatientPlanTemplate | null>(null)
  const [manualEditor, setManualEditor] = useState<{
    kind: 'NOTE' | 'PLAN'; note?: OutpatientNoteTemplate; plan?: OutpatientPlanTemplate
  } | null>(null)
  const [notice, setNotice] = useState('')

  const templatesQuery = useQuery({
    queryKey: ['outpatient-plan-templates'],
    queryFn: () => api.outpatientPlanTemplates.list(),
  })

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
        const matchDesc = value.description?.toLowerCase().includes(kw)
        const matchGuideline = value.guidelineReference?.toLowerCase().includes(kw)
        const matchDiag = value.diagnoses.some((d) => d.display.toLowerCase().includes(kw) || d.code.toLowerCase().includes(kw))
        const matchMed = value.medications.some((m) => m.medicationName.toLowerCase().includes(kw))
        if (!matchName && !matchDesc && !matchGuideline && !matchDiag && !matchMed) return false
      }
      return true
    })
  }, [templatesQuery.data, scopeFilter, searchKeyword])

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

  const selectedNoteTemplate = useMemo(() => filteredNoteTemplates.find((value) => value.id === selectedId)
    || filteredNoteTemplates[0] || null, [filteredNoteTemplates, selectedId])

  useEffect(() => {
    if (templateType === 'PLAN' && selectedTemplate && selectedTemplate.id !== selectedId) {
      setSelectedId(selectedTemplate.id)
    }
  }, [selectedTemplate, selectedId, templateType])

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
      await queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
      setNotice(`已成功停用方案“${updated.name}”。`)
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
      setNotice(`已成功将开方习惯固化为个人常用方案“${created.name}”！`)
    },
  })

  const scopeTabs: Array<{ value: 'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'MINED'; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部方案', meta: templatesQuery.data?.length ? `(${templatesQuery.data.length})` : undefined },
    { value: 'PERSONAL', label: '个人高频', meta: templatesQuery.data?.some((t) => t.scopeType === 'PERSONAL') ? `(${templatesQuery.data.filter((t) => t.scopeType === 'PERSONAL').length})` : undefined },
    { value: 'DEPARTMENT', label: '科室路径', meta: templatesQuery.data?.some((t) => t.scopeType === 'DEPARTMENT') ? `(${templatesQuery.data.filter((t) => t.scopeType === 'DEPARTMENT').length})` : undefined },
    { value: 'HOSPITAL', label: '全院/指南', meta: templatesQuery.data?.some((t) => t.scopeType === 'HOSPITAL') ? `(${templatesQuery.data.filter((t) => t.scopeType === 'HOSPITAL').length})` : undefined },
  ]

  const error = templatesQuery.error || noteTemplatesQuery.error || minedQuery.error || disableMutation.error
    || disableNoteMutation.error || solidifyMinedMutation.error

  return (
    <MasterDetailPage
      title="临床模板库"
      eyebrow="病历书写与诊疗方案 · 统一维护"
      description="统一查看病历书写模板与结构化诊疗方案；两类模板分别保存，使用时按临床安全边界带入对应草稿。"
      actions={<div className="doctor-plan-header-actions">
        <Button variant="secondary" onClick={() => setManualEditor({ kind: templateType })}>
          <Icon name="add" />{templateType === 'NOTE' ? '新建病历模板' : '新建诊疗方案'}
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
                  : scopeFilter === 'MINED' ? `${minedQuery.data?.length ?? 0} 项推荐` : `${filteredTemplates.length} 个方案`}
              </StatusBadge>
            }
          />
          <Tabs value={templateType} onChange={(tabId) => {
            setTemplateType(tabId); setScopeFilter('ALL'); setSearchKeyword(''); setSelectedId(''); setNotice('')
          }} label="模板类型" variant="line" items={[
            { value: 'NOTE', label: '病历模板', meta: noteTemplatesQuery.data?.length ? `(${noteTemplatesQuery.data.length})` : undefined },
            { value: 'PLAN', label: '诊疗方案', meta: templatesQuery.data?.length ? `(${templatesQuery.data.length})` : undefined },
          ]} />
          {templateType === 'PLAN' && <Tabs
            value={scopeFilter}
            onChange={(tabId) => { setScopeFilter(tabId); setNotice('') }}
            label="方案作用域分类"
            variant="line"
            items={scopeTabs}
          />}
          {(templateType === 'NOTE' || scopeFilter !== 'MINED') && (
            <SearchField
              label="搜索模板"
              value={searchKeyword}
              onChange={setSearchKeyword}
              placeholder={templateType === 'NOTE' ? '搜索名称或病历内容...' : '搜索方案名称、诊断或药品...'}
            />
          )}
        </>
      }
      navigationResetScrollKey={`${templateType}:${scopeFilter}:${searchKeyword}`}
      detailResetScrollKey={templateType === 'NOTE' ? selectedNoteTemplate?.id : scopeFilter === 'MINED' ? selectedMinedKey : selectedId}
      detailLabel="模板明细"
      detailHeader={
        <PanelHead
          title={
            templateType === 'NOTE' ? (selectedNoteTemplate?.name || '病历模板详情')
              : scopeFilter === 'MINED'
              ? (selectedMined?.suggestedName || 'AI 开方习惯推荐详情')
              : (selectedTemplate?.name || '诊疗方案详情')
          }
          actions={
            templateType === 'NOTE' ? (selectedNoteTemplate ? <div className="doctor-plan-detail-head-actions">
              <div className="doctor-plan-card-badges">
                <StatusBadge tone="info">病历模板</StatusBadge>
                <StatusBadge tone="neutral">{selectedNoteTemplate.scopeType === 'PERSONAL' ? '医生个人' : '科室共享'}</StatusBadge>
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
                    {selectedTemplate.scopeType === 'PERSONAL' ? '医生个人方案' : selectedTemplate.scopeType === 'DEPARTMENT' ? '科室临床路径' : '全院/指南标准方案'}
                  </StatusBadge>
                  {selectedTemplate.sourceType === 'AI_GUIDELINE' && <StatusBadge tone="warning">指南结构化抽取</StatusBadge>}
                  {selectedTemplate.sourceType === 'AI_INPUT' && <StatusBadge tone="info">AI 智能速记</StatusBadge>}
                  {selectedTemplate.sourceType === 'AI_MINED' && <StatusBadge tone="info">开方习惯沉淀</StatusBadge>}
                  <StatusBadge tone={selectedTemplate.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {selectedTemplate.status === 'ACTIVE' ? '启用中' : '已停用'}
                  </StatusBadge>
                </div>
                {selectedTemplate.status === 'ACTIVE' && (
                  <div className="doctor-plan-detail-head-buttons">
                    <Button size="sm" variant="secondary"
                      onClick={() => setManualEditor({ kind: 'PLAN', plan: selectedTemplate })}>
                      人工编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingTemplate(selectedTemplate)
                        setAiCompilerOpen(true)
                      }}
                    >
                      AI 调整
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
        templateType === 'NOTE' && selectedNoteTemplate ? <div className="doctor-plan-pool-detail__footer">
          <span className="doctor-plan-footer-hint">
            累计已使用 {selectedNoteTemplate.useCount} 次{selectedNoteTemplate.updatedAt ? ` · 更新于 ${formatTime(selectedNoteTemplate.updatedAt)}` : ''}
          </span>
        </div> : scopeFilter === 'MINED' && selectedMined ? (
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

          {templateType === 'NOTE' ? (
            noteTemplatesQuery.isPending ? <LoadingState label="正在加载病历模板..." />
              : filteredNoteTemplates.length ? filteredNoteTemplates.map((item) => (
                <button key={item.id} type="button"
                  className={`doctor-plan-item-card ${selectedNoteTemplate?.id === item.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(item.id)}>
                  <div className="doctor-plan-item-card__top">
                    <div className="doctor-plan-card-badges">
                      <StatusBadge tone="info">病历模板</StatusBadge>
                      <StatusBadge tone="neutral">{item.scopeType === 'PERSONAL' ? '个人' : '科室'}</StatusBadge>
                    </div>
                    <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                  </div>
                  <div className="doctor-plan-item-card__title">{item.name}</div>
                  <div className="doctor-plan-item-card__desc">{item.description || '门诊病历段落模板'}</div>
                  <div className="doctor-plan-item-card__meta">
                    <span>病历段落 {noteTemplateFields.filter(({ key }) => item.content[key]?.trim()).length}</span>
                  </div>
                </button>
              )) : <div className="doctor-plan-pool-empty-text">未找到匹配的病历模板</div>
          ) : scopeFilter === 'MINED' ? (
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
                    <StatusBadge tone={item.scopeType === 'PERSONAL' ? 'neutral' : item.scopeType === 'DEPARTMENT' ? 'info' : 'success'}>
                      {item.scopeType === 'PERSONAL' ? '个人' : item.scopeType === 'DEPARTMENT' ? '科室' : '全院指南'}
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
                <div className="doctor-plan-item-card__desc">{item.description || item.name}</div>
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
            <div className="doctor-plan-pool-empty-text">未找到匹配方案</div>
          )}
        </div>
      }
    >
      <div className="doctor-plan-pool-detail__body">
        {templateType === 'NOTE' ? (
          selectedNoteTemplate ? <>
            {(selectedNoteTemplate.description || selectedNoteTemplate.lastUsedAt) && <div className="doctor-plan-detail-hero">
              {selectedNoteTemplate.description && <p className="doctor-plan-detail-desc">{selectedNoteTemplate.description}</p>}
              {selectedNoteTemplate.lastUsedAt && <small>最近使用：{formatTime(selectedNoteTemplate.lastUsedAt)}</small>}
            </div>}
            <div className="doctor-plan-detail-section">
              <div className="doctor-plan-detail-section__title">病历段落</div>
              <div className="doctor-note-template-preview is-workspace">
                {noteTemplateFields.filter(({ key }) => selectedNoteTemplate.content[key]?.trim()).map(({ key, label }) => (
                  <div key={key} className="doctor-clinical-template-note-section">
                    <strong>{label}</strong>
                    <p>{selectedNoteTemplate.content[key]}</p>
                  </div>
                ))}
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
                        <th className={tableCellClass('numeric')}>数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMined.medications.length > 0 ? (
                        selectedMined.medications.map((m, idx) => (
                          <tr key={idx}>
                            <td className={tableCellClass('text')}><strong>药品 #{m.medicationId}</strong></td>
                            <td className={tableCellClass('numeric')}>{m.doseValue} {m.doseUnit}</td>
                            <td className={tableCellClass('text')}>{m.routeCode || '—'}</td>
                            <td className={tableCellClass('text')}>{m.frequencyCode || '—'}</td>
                            <td className={tableCellClass('numeric')}>{m.durationValue} {m.durationUnit}</td>
                            <td className={tableCellClass('numeric')}>{m.quantity} {m.quantityUnit}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="doctor-plan-table-empty">暂无开方药品</td>
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
            {(selectedTemplate.guidelineReference || selectedTemplate.description) && (
              <div className="doctor-plan-detail-hero">
                {selectedTemplate.guidelineReference && (
                  <div className="doctor-plan-detail-guideline">
                    📖 用户录入的条文来源（未核验）：{planSourceReferenceLabel(selectedTemplate.guidelineReference)}
                  </div>
                )}
                {selectedTemplate.description && (
                  <p className="doctor-plan-detail-desc">{selectedTemplate.description}</p>
                )}
              </div>
            )}

            {!!selectedTemplate.tasks?.length && <div className="doctor-plan-detail-section">
              <div className="doctor-plan-detail-section__title">诊疗任务与原文依据 ({selectedTemplate.tasks.length})</div>
              {selectedTemplate.tasks.map((task, index) => <div key={`${task.kind}-${index}`} className="ai-plan-modal-row ai-plan-modal-row-bordered">
                <div><strong>{planTaskKindLabel[task.kind]} · {task.text}</strong><small className="ai-plan-modal-row-sub">{task.sourceQuote ? `原文：“${task.sourceQuote}”` : '模型建议，原文未明确提出'}</small></div>
                <StatusBadge tone={task.status === 'MATCHED' ? 'success' : task.status === 'UNMATCHED' ? 'danger' : 'warning'}>
                  {task.status === 'MATCHED' ? '目录已匹配' : task.status === 'UNMATCHED' ? '未匹配' : '待核对'}
                </StatusBadge>
              </div>)}
            </div>}

            <div className="doctor-plan-detail-section">
              <div className="doctor-plan-detail-section__title">诊断列表 ({selectedTemplate.diagnoses.length})</div>
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
                    {selectedTemplate.diagnoses.length > 0 ? (
                      selectedTemplate.diagnoses.map((d) => (
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
              <div className="doctor-plan-detail-section__title">处方药品列表 ({selectedTemplate.medications.length})</div>
              <TableShell className="doctor-plan-table-shell">
                <DataTable compact className="doctor-plan-items-table">
                  <thead>
                    <tr>
                      <th className={tableCellClass('text')}>药品名称及规格</th>
                      <th className={tableCellClass('numeric')}>单次剂量</th>
                      <th className={tableCellClass('text')}>途径</th>
                      <th className={tableCellClass('text')}>频次</th>
                      <th className={tableCellClass('numeric')}>疗程</th>
                      <th className={tableCellClass('numeric')}>数量</th>
                      <th className={tableCellClass('text')}>用法说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTemplate.medications.length > 0 ? (
                      selectedTemplate.medications.map((m) => (
                        <tr key={m.lineId}>
                          <td className={tableCellClass('text')}>
                            <div><strong>{m.medicationName}</strong></div>
                            {m.preparationSpec && <small className="doctor-plan-item-subtext">{m.preparationSpec}</small>}
                          </td>
                          <td className={tableCellClass('numeric')}>{m.doseValue} {m.doseUnit}</td>
                          <td className={tableCellClass('text')}>{m.routeName || m.routeCode || '—'}</td>
                          <td className={tableCellClass('text')}>{m.frequencyCode || '—'}</td>
                          <td className={tableCellClass('numeric')}>{m.durationValue} {m.durationUnit}</td>
                          <td className={tableCellClass('numeric')}>{m.quantity} {m.quantityUnit}</td>
                          <td className={tableCellClass('text')}><small>{m.medicationInstruction || '—'}</small></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="doctor-plan-table-empty">暂无处方药品</td>
                      </tr>
                    )}
                  </tbody>
                </DataTable>
              </TableShell>
            </div>

            <div className="doctor-plan-detail-section">
              <div className="doctor-plan-detail-section__title">检查 / 检验 / 治疗项目 ({selectedTemplate.services.length})</div>
              <TableShell className="doctor-plan-table-shell">
                <DataTable compact className="doctor-plan-items-table">
                  <thead>
                    <tr>
                      <th className={tableCellClass('text')}>项目名称</th>
                      <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                      <th className={tableCellClass('numeric')} style={{ width: '100px' }}>数量</th>
                      <th className={tableCellClass('text')}>临床要求</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTemplate.services.length > 0 ? (
                      selectedTemplate.services.map((s, idx) => (
                        <tr key={idx}>
                          <td className={tableCellClass('text')}>
                            <strong>{s.itemName}</strong> <small className="doctor-plan-card-meta-text">({s.itemCode})</small>
                          </td>
                          <td className={tableCellClass('status')}>
                            <StatusBadge tone="neutral">
                              {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '治疗'}
                            </StatusBadge>
                          </td>
                          <td className={tableCellClass('numeric')}>{s.quantity} {s.unitCode}</td>
                          <td className={tableCellClass('text')}><small>{s.clinicalDescription || '—'}</small></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="doctor-plan-table-empty">暂无检查检验治疗项目</td>
                      </tr>
                    )}
                  </tbody>
                </DataTable>
              </TableShell>
            </div>
          </>
        ) : (
          <EmptyState icon="clinical" title="请选择方案" copy="从左侧列表中选择诊疗方案查看明细，或点击上方进行 AI 建方。" />
        )}
      </div>

      {templateType === 'PLAN' && aiCompilerOpen && (
        <AiPlanTemplateDraftModal
          api={api}
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
        kind={manualEditor.kind} editingNote={manualEditor.note} editingPlan={manualEditor.plan}
        onClose={() => setManualEditor(null)} onSaved={(saved) => {
          const isNote = manualEditor.kind === 'NOTE'
          void queryClient.invalidateQueries({ queryKey: [isNote ? 'outpatient-note-templates' : 'outpatient-plan-templates'] })
          setSelectedId(saved.id)
          setNotice(`${isNote ? '病历模板' : '诊疗方案'}“${saved.name}”已保存。`)
          setManualEditor(null)
        }} />}
    </MasterDetailPage>
  )
}

export default OutpatientPlanTemplatesWorkspace
