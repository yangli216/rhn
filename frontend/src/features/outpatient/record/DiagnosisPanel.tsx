import { useEffect, useRef, useState, type Dispatch, type ReactNode, type Ref, type SetStateAction } from 'react'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { DiseaseConcept } from '../../../shared/api/masterDataApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, ClinicalResourceSearch, Icon, Panel, PanelHead, Popconfirm, Select, type ClinicalResourceOption } from '../../../shared/ui'
import { diagnosisKey, moveDiagnosis, normalizeDiagnosisOrder } from './clinicalRecordDraft'

export function DiagnosisPanel({ encounterId, api, diagnoses, setDiagnoses, editing, signed,
  actions, aiSuggestionSurfaceRef }: {
  encounterId: string
  api: RhnApi
  diagnoses: DiagnosisInput[]
  setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>
  editing: boolean
  signed: boolean
  actions?: ReactNode
  aiSuggestionSurfaceRef?: Ref<HTMLDivElement>
}) {
  const [diagnosisSearch, setDiagnosisSearch] = useState<ClinicalResourceOption<DiseaseConcept>>()
  const [diagnosisDomainFilter, setDiagnosisDomainFilter] = useState('')
  const [diagnosisComposerOpen, setDiagnosisComposerOpen] = useState(false)
  const diagnosisComposerRef = useRef<HTMLDivElement>(null)
  const [draggedDiagnosisKey, setDraggedDiagnosisKey] = useState<string>()
  const [diagnosisError, setDiagnosisError] = useState('')
  const [diagnosisHovered, setDiagnosisHovered] = useState(false)

  useEffect(() => {
    if (!diagnosisComposerOpen && diagnoses.length > 0) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      const isInsideRow = diagnosisComposerRef.current?.contains(target)
      const isInsidePopover = Boolean(
        (target as Element)?.closest?.('.ui-remote-search__popover, .ui-select__popover')
      )
      if (!isInsideRow && !isInsidePopover && !diagnosisSearch) {
        if (diagnoses.length > 0) {
          setDiagnosisComposerOpen(false)
        }
        setDiagnosisSearch(undefined)
        setDiagnosisError('')
      }
    }
    window.document.addEventListener('pointerdown', handlePointerDown)
    return () => window.document.removeEventListener('pointerdown', handlePointerDown)
  }, [diagnosisComposerOpen, diagnosisSearch, diagnoses.length])
  const isDiagnosisEmpty = diagnoses.length === 0
  const showDiagnosisComposer = editing && !signed && (diagnosisComposerOpen || isDiagnosisEmpty)
  const addDiagnosis = (candidate?: ClinicalResourceOption<DiseaseConcept>) => {
    const selected = candidate?.raw ?? diagnosisSearch?.raw
    if (!selected) { setDiagnosisError('请先检索并选择诊断'); return }
    if (diagnoses.some((item) => item.conceptId === selected.id
      || (item.diagnosisDomain === selected.sdDiagnosisDomain && item.code === selected.code))) {
      setDiagnosisError('该诊断已经录入'); return
    }
    const diagnosisGroupId = selected.sdDiagnosisDomain === 'WESTERN_MEDICINE'
      ? undefined : `TCM-${encounterId}`
    setDiagnoses((current) => normalizeDiagnosisOrder([
      ...current,
      { conceptId: selected.id, diagnosisDomain: selected.sdDiagnosisDomain, diagnosisGroupId,
        code: selected.code, display: selected.display, type: 'SECONDARY',
        managementPrograms: (selected.managementPrograms ?? []).map((program) => ({ id: program.id, code: program.code,
          name: program.name, managementType: program.sdManagementType, triggerAction: program.sdTriggerAction,
          reportCardType: program.reportCardType, reportDeadlineHours: program.reportDeadlineHours })) },
    ]))
    setDiagnosisSearch(undefined)
    setDiagnosisError('')
    window.requestAnimationFrame(() => {
      window.document.getElementById('doctor-diagnosis-composer-search')?.focus()
    })
  }
  const moveDiagnosisByOffset = (key: string, offset: number) => setDiagnoses((current) => {
    const sourceIndex = current.findIndex((item) => diagnosisKey(item) === key)
    const target = current[sourceIndex + offset]
    return target ? moveDiagnosis(current, key, diagnosisKey(target)) : normalizeDiagnosisOrder(current)
  })
  const makePrimary = (key: string) => setDiagnoses((current) => {
    const first = current[0]
    return first ? moveDiagnosis(current, key, diagnosisKey(first)) : current
  })
  const removeDiagnosis = (key: string) => setDiagnoses((current) => normalizeDiagnosisOrder(current.filter((item) =>
    diagnosisKey(item) !== key)))
  return <Panel className={`doctor-diagnosis-panel ${diagnoses.length === 0 ? 'is-empty' : ''} ${diagnosisHovered ? 'is-hovered' : ''}`}
    onMouseEnter={() => setDiagnosisHovered(true)}
    onMouseLeave={() => setDiagnosisHovered(false)}>
    <PanelHead title="诊断" meta={`${diagnoses.length} 项`} actions={actions} />
    <div className="doctor-diagnosis-content">
      <div className="doctor-table-wrap">
        <div className={`doctor-diagnosis-list ${diagnoses.length === 0 ? 'is-empty' : ''}`} role="table" aria-label="本次诊断连续录入列表">
          <div className="doctor-diagnosis-head" role="row">
            <span className="doctor-diag-col-type">类型</span>
            <span className="doctor-diag-col-main">诊断名称与ICD编码</span>
            <span className="doctor-diag-col-domain">主次</span>
            <span className="doctor-diag-col-management">公共卫生管理 / 临床提示</span>
            {editing && !signed && <span className="doctor-diag-col-actions">操作</span>}
          </div>

          {editing && !signed && <div ref={aiSuggestionSurfaceRef} />}

          {diagnoses.length === 0 && (!editing || signed) && (
            <div className="doctor-diagnosis-empty" role="row">
              <span>尚未录入诊断</span>
            </div>
          )}

          {diagnoses.map((item, index) => {
            const key = item.conceptId || `${item.diagnosisDomain}|${item.code}`
            const isPrimary = item.type === 'PRIMARY'
            return <div key={key} className={`doctor-diagnosis-row ${isPrimary ? 'is-primary' : ''}${draggedDiagnosisKey === key ? ' is-dragging' : ''}`}
              role="row"
              onDragOver={(event) => { if (editing && !signed) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedDiagnosisKey) setDiagnoses((current) => moveDiagnosis(current, draggedDiagnosisKey, String(key)))
                setDraggedDiagnosisKey(undefined)
              }}
              onDragEnd={() => setDraggedDiagnosisKey(undefined)}>
              <span className="doctor-diag-col-type">
                {editing && !signed && (
                  <span
                    className="doctor-diag-drag-handle"
                    title="拖动调整诊断顺序"
                    role="button"
                    aria-label={`拖动调整诊断顺序 ${item.display}`}
                    draggable
                    onDragStart={(event) => {
                      setDraggedDiagnosisKey(String(key))
                      event.dataTransfer.effectAllowed = 'move'
                      const row = event.currentTarget.closest('.doctor-diagnosis-row') as HTMLElement | null
                      if (row && event.dataTransfer.setDragImage) {
                        const rect = row.getBoundingClientRect()
                        event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top)
                      }
                    }}
                    onDragEnd={() => setDraggedDiagnosisKey(undefined)}
                  >
                    <Icon name="drag" />
                  </span>
                )}
                <span className={`doctor-diag-domain-pill is-${(item.diagnosisDomain ?? 'WESTERN_MEDICINE').toLowerCase()}`}>
                  {item.diagnosisDomain === 'TCM_DISEASE' ? '中医病名'
                    : item.diagnosisDomain === 'TCM_SYNDROME' ? '中医证候' : '西医诊断'}
                </span>
              </span>
              <span className="doctor-diag-col-main">
                <div className="doctor-diag-name-wrap">
                  <strong className="doctor-diag-name">{item.display}</strong>
                  <span className="doctor-diag-code-pill" title={`ICD编码: ${item.code}`}>{item.code}</span>
                </div>
              </span>
              <span className="doctor-diag-col-domain">
                <span className={`doctor-diag-badge ${isPrimary ? 'is-primary' : 'is-secondary'}`}>
                  {isPrimary ? '主要诊断' : `次要 #${index}`}
                </span>
              </span>
              <span className="doctor-diag-col-management">
                {item.managementPrograms?.length ? (
                  <div className="doctor-diag-management-flow">
                    {item.managementPrograms.map((program) => (
                      <span key={program.id} className="doctor-diag-management-chip" title={program.name}>
                        {program.name}
                      </span>
                    ))}
                  </div>
                ) : <span className="doctor-diag-subtle-dash">—</span>}
              </span>
              {editing && !signed && (
                <span className="doctor-diag-col-actions">
                  <Button type="button" size="sm" variant="text" disabled={index === 0}
                    onClick={() => moveDiagnosisByOffset(String(key), -1)} title="上移" aria-label={`上移诊断 ${item.display}`}><Icon name="chevron-up" /></Button>
                  <Button type="button" size="sm" variant="text" disabled={index === diagnoses.length - 1}
                    onClick={() => moveDiagnosisByOffset(String(key), 1)} title="下移" aria-label={`下移诊断 ${item.display}`}><Icon name="chevron-down" /></Button>
                  {!isPrimary && <Button type="button" size="sm" variant="text" disabled={signed}
                    onClick={() => makePrimary(key)}>设为主要</Button>}
                  <Popconfirm
                    title={`确认移除诊断“${item.display}”？`}
                    okText="移除"
                    okVariant="danger"
                    disabled={signed}
                    onConfirm={() => removeDiagnosis(key)}
                  >
                    <Button type="button" size="sm" variant="text" disabled={signed}>移除</Button>
                  </Popconfirm>
                </span>
              )}
            </div>
          })}

          {showDiagnosisComposer && (
            <div ref={diagnosisComposerRef} className="doctor-diagnosis-row is-active-composer" role="row"
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null
                if (!next) return
                const isInsideRow = diagnosisComposerRef.current?.contains(next)
                const isInsidePopover = Boolean(
                  (next as Element)?.closest?.('.ui-remote-search__popover, .ui-select__popover, .ui-popconfirm')
                )
                if (!isInsideRow && !isInsidePopover && !diagnosisSearch) {
                  if (!isDiagnosisEmpty) {
                    setDiagnosisComposerOpen(false)
                  }
                  setDiagnosisSearch(undefined)
                  setDiagnosisError('')
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !diagnosisSearch) {
                  e.preventDefault()
                  setDiagnosisSearch(undefined)
                  if (!isDiagnosisEmpty) {
                    setDiagnosisComposerOpen(false)
                  }
                  setDiagnosisError('')
                } else if (e.key === 'Enter' && diagnosisSearch && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  addDiagnosis()
                }
              }}>
              <span className="doctor-diag-col-type">
                <div className="doctor-diag-composer-domain">
                  <Select aria-label="诊断类型" value={diagnosisDomainFilter} clearable={false} searchable={false}
                    disabled={signed}
                    placeholder="全部类型"
                    options={[
                      { value: '', label: '全部类型' },
                      { value: 'WESTERN_MEDICINE', label: '西医诊断' },
                      { value: 'TCM_DISEASE', label: '中医病名' },
                      { value: 'TCM_SYNDROME', label: '中医证候' },
                    ]}
                    onChange={(val) => { setDiagnosisDomainFilter(val); setDiagnosisSearch(undefined) }} />
                </div>
              </span>
              <span className="doctor-diag-col-composer-main">
                <div className="doctor-diag-composer-search">
                  <ClinicalResourceSearch<DiseaseConcept> id="doctor-diagnosis-composer-search" api={api}
                    resource="diagnosis" value={diagnosisSearch}
                    filterResult={(item) => !diagnosisDomainFilter || item.sdDiagnosisDomain === diagnosisDomainFilter}
                    disabled={signed}
                    placeholder={diagnoses.length === 0 ? "检索并选择主要诊断 (拼音/编码/名称，回车连续录入)" : "检索并选择次要诊断 (支持拼音/编码/名称，回车连续录入)"}
                    onChange={(option) => {
                      if (option) {
                        addDiagnosis(option)
                      } else {
                        setDiagnosisSearch(undefined)
                        setDiagnosisError('')
                      }
                    }} />
                </div>
              </span>
              <span className="doctor-diag-col-composer-hint">
                <span className="doctor-diag-badge is-composer">新增</span>
                {diagnoses.length === 0 ? (
                  <span className="doctor-diag-hint is-required">接诊需至少录入一项主要诊断</span>
                ) : (
                  <span className="doctor-diag-hint">已开立 {diagnoses.length} 项，支持连续盲打</span>
                )}
                {!isDiagnosisEmpty && (
                  <Button type="button" size="sm" variant="text" onClick={() => {
                    setDiagnosisSearch(undefined); setDiagnosisComposerOpen(false); setDiagnosisError('')
                  }} title="退出诊断录入" aria-label="退出诊断录入"><Icon name="close" /></Button>
                )}
              </span>
            </div>
          )}
        </div>

        {editing && !signed && !showDiagnosisComposer && (
          <div className="doctor-diagnosis-row is-launcher" role="row" onClick={() => {
            setDiagnosisComposerOpen(true)
          }}>
            <div className="doctor-diag-launcher-cell">
              <button type="button" className="doctor-table-launcher-btn" aria-label="新增诊断" onClick={(e) => {
                e.stopPropagation()
                setDiagnosisComposerOpen(true)
              }}>
                <Icon name="add" />
                <span><strong>新增诊断</strong></span>
              </button>
            </div>
          </div>
        )}
      </div>
      {editing && diagnosisError && <small className="ui-field__message ui-field__error">{diagnosisError}</small>}
      {diagnoses.some((item) => item.managementPrograms?.length) && <Alert tone="warning"
        className="doctor-diagnosis-management-alert">
        <strong>公共卫生管理提示</strong>
        <span>{Array.from(new Set(diagnoses.flatMap((item) => item.managementPrograms?.map((program) =>
          `${item.display}：${program.name}${program.managementType === 'DISEASE_REPORT' ? '（需生成报卡草稿）' : '（需确认是否纳入管理）'}`) ?? []))).join('；')}</span>
      </Alert>}
    </div>
  </Panel>
}
