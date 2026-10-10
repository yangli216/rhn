import { ClinicalSemanticImpactDialog } from "../ClinicalSemanticImpactDialog";
import { useMemo, useState, type ReactNode } from "react";
import type { Department, RhnApi, OrderFrequency, OrderFrequencyConfiguration, OrderFrequencyConfigurationInput, OrderFrequencyInput, OrderFrequencyRuleType } from "../../../shared/rhnApi";
import { FrequencySchedulePreview } from "../FrequencySchedulePreview";
import type { Organization } from "../../../shared/model";
import { Alert, Button, DataTable as UiDataTable, Dialog, EmptyState, FormField, Icon, LoadingState, Select, TableShell } from "../../../shared/ui";
import { today, Check, activeStatus, State, FormDialog } from './operationalShared'
import { frequencyExecutionTimes, FrequencyTimeEditor, frequencyRuleLabel, frequencyApplicabilityLabel, type FrequencyDraft, frequencyDraftInput, frequencyDraftScopeLabel, frequencyTemplates, frequencyRuleOptions, periodUnitOptions, FrequencyDraftPreview } from './frequencyShared'

export const FIRST_DAY_POLICIES: Array<{
  value: OrderFrequencyConfiguration['firstDayPolicy']
  title: string
  desc: string
}> = [
  {
    value: 'REMAINING_SLOTS',
    title: '仅执行剩余时点',
    desc: '自动跳过医嘱开立前的时点，仅生成当天尚未到达的执行任务（推荐）。',
  },
  {
    value: 'FULL_SCHEDULE',
    title: '执行完整日计划',
    desc: '开立当天的全部频次时点均需补齐执行（补开医嘱或当天必须足量）。',
  },
  {
    value: 'FROM_ORDER_TIME',
    title: '从开立时间起算',
    desc: '以开立时间为基准顺延生成下一个执行时点。',
  },
]

export function FrequencyConfigurationWorkbenchDialog({
  frequency, organization, departments, api, onClose, onSaveConfiguration, onError,
}: {
  frequency: OrderFrequency; organization: Organization; departments: Department[]; api: RhnApi
  onClose: () => void; onSaveConfiguration: (config?: OrderFrequencyConfiguration) => (input: OrderFrequencyConfigurationInput) => Promise<void>
  onError: (error: unknown) => void
}) {
  const currentOrgConfigurations = frequency.configurations.filter(c => c.organizationId === organization.id)
  const orgConfig = currentOrgConfigurations.find((c) => !c.departmentId)
  const [selectedScope, setSelectedScope] = useState<string>('ORGANIZATION')
  const [saving, setSaving] = useState(false)
  const [previewStart, setPreviewStart] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))

  const [scopeDrafts, setScopeDrafts] = useState<Record<string, {
    departmentId?: string
    localCode: string
    localName: string
    executionTimes: string
    firstDayPolicy: OrderFrequencyConfiguration['firstDayPolicy']
    enabled: boolean
    status: 'ACTIVE' | 'INACTIVE'
    validFrom: string
    validTo: string
  }>>(() => {
    const initial: Record<string, any> = {
      ORGANIZATION: {
        departmentId: undefined,
        localCode: orgConfig?.localCode ?? '',
        localName: orgConfig?.localName ?? '',
        executionTimes: orgConfig?.executionTimes.join(',') ?? frequency.defaultExecutionTimes.join(','),
        firstDayPolicy: orgConfig?.firstDayPolicy ?? 'REMAINING_SLOTS',
        enabled: orgConfig?.enabled ?? true,
        status: orgConfig?.status ?? 'ACTIVE',
        validFrom: orgConfig?.validFrom ?? today(),
        validTo: orgConfig?.validTo ?? '',
      },
    }
    currentOrgConfigurations.filter((c) => Boolean(c.departmentId)).forEach((c) => {
      if (initial[c.departmentId!]) return
      initial[c.departmentId!] = {
        departmentId: c.departmentId,
        localCode: c.localCode ?? '',
        localName: c.localName ?? '',
        executionTimes: c.executionTimes.join(','),
        firstDayPolicy: c.firstDayPolicy,
        enabled: c.enabled,
        status: c.status,
        validFrom: c.validFrom,
        validTo: c.validTo ?? '',
      }
    })
    return initial
  })

  const configuredDeptIds = Object.keys(scopeDrafts).filter((k) => k !== 'ORGANIZATION')
  const isOrg = selectedScope === 'ORGANIZATION'
  const currentDept = !isOrg ? departments.find((d) => d.id === selectedScope) : null
  const currentDraft = scopeDrafts[selectedScope] ?? {
    departmentId: isOrg ? undefined : selectedScope,
    localCode: '',
    localName: '',
    executionTimes: frequency.defaultExecutionTimes.join(','),
    firstDayPolicy: 'REMAINING_SLOTS' as const,
    enabled: true,
    status: 'ACTIVE' as const,
    validFrom: today(),
    validTo: '',
  }

  const updateCurrentDraft = (patch: Partial<typeof currentDraft>) => {
    setScopeDrafts((prev) => ({
      ...prev,
      [selectedScope]: { ...currentDraft, ...patch },
    }))
  }

  const addDepartmentScope = (deptId: string) => {
    if (!deptId) return
    const dept = departments.find((d) => d.id === deptId)
    setScopeDrafts((prev) => ({
      ...prev,
      [deptId]: {
        departmentId: deptId,
        localCode: '',
        localName: dept ? `${frequency.name} (${dept.name})` : '',
        executionTimes: scopeDrafts.ORGANIZATION?.executionTimes || frequency.defaultExecutionTimes.join(','),
        firstDayPolicy: scopeDrafts.ORGANIZATION?.firstDayPolicy ?? 'REMAINING_SLOTS',
        enabled: true,
        status: 'ACTIVE',
        validFrom: today(),
        validTo: '',
      },
    }))
    setSelectedScope(deptId)
  }

  const removeDepartmentScope = (deptId: string) => {
    setScopeDrafts((prev) => {
      const next = { ...prev }
      delete next[deptId]
      return next
    })
    if (selectedScope === deptId) {
      setSelectedScope('ORGANIZATION')
    }
  }

  const presetTimeOptions = useMemo(() => {
    const code = frequency.code.toUpperCase()
    if (code === 'BID' || frequency.frequencyCount === 2) {
      return [
        { label: '早晚12H', times: ['08:00', '20:00'] },
        { label: '日间8H', times: ['08:00', '16:00'] },
        { label: '门诊班', times: ['09:00', '17:00'] },
      ]
    }
    if (code === 'TID' || frequency.frequencyCount === 3) {
      return [
        { label: '均匀6H', times: ['08:00', '14:00', '20:00'] },
        { label: '三餐制', times: ['07:30', '11:30', '17:30'] },
      ]
    }
    if (code === 'QID' || frequency.frequencyCount === 4) {
      return [
        { label: '日间4H', times: ['08:00', '12:00', '16:00', '20:00'] },
        { label: '全天6H', times: ['06:00', '12:00', '18:00', '00:00'] },
      ]
    }
    if (code === 'QD' || frequency.frequencyCount === 1) {
      return [
        { label: '早晨', times: ['08:00'] },
        { label: '上午', times: ['09:00'] },
        { label: '睡前', times: ['20:00'] },
      ]
    }
    if (code === 'Q8H') {
      return [
        { label: '标准', times: ['06:00', '14:00', '22:00'] },
        { label: '顺延', times: ['08:00', '16:00', '00:00'] },
      ]
    }
    if (code === 'Q6H') {
      return [
        { label: '标准', times: ['06:00', '12:00', '18:00', '00:00'] },
      ]
    }
    return [
      { label: '早晚', times: ['08:00', '20:00'] },
      { label: '三次', times: ['08:00', '14:00', '20:00'] },
    ]
  }, [frequency])

  const handleSave = async () => {
    setSaving(true)
    try {
      const existing = isOrg
        ? orgConfig
        : currentOrgConfigurations.find((c) => c.departmentId === selectedScope)

      const payload: OrderFrequencyConfigurationInput = {
        organizationId: organization.id,
        departmentId: currentDraft.departmentId,
        localCode: currentDraft.localCode || undefined,
        localName: currentDraft.localName || undefined,
        executionTimes: currentDraft.executionTimes || undefined,
        firstDayPolicy: currentDraft.firstDayPolicy,
        enabled: currentDraft.enabled,
        status: currentDraft.status,
        validFrom: currentDraft.validFrom,
        validTo: currentDraft.validTo || undefined,
      }
      await onSaveConfiguration(existing)(payload)
    } catch (e) {
      onError(e)
    } finally {
      setSaving(false)
    }
  }

  const currentConfiguredTimes = frequencyExecutionTimes(currentDraft.executionTimes)
  const availableDepts = departments.filter(
    (d) => d.sdOrgStatus === 'ACTIVE' && !configuredDeptIds.includes(d.id),
  )

  return <Dialog
    title={`${frequency.name} · 执行配置工作台`}
    eyebrow={`医嘱频次 · ${frequency.code}${frequency.shortName ? ` · ${frequency.shortName}` : ''}`}
    size="xwide"
    className="frequency-workbench-dialog"
    onClose={onClose}
    description="统一维护全院标准执行时点与各科室差异化例外；左侧切换范围，中间配置时点与策略，右侧沙盘即时推演。">
    <div className="frequency-workbench">
      {/* 栏 1：作用范围管理 */}
      <aside className="frequency-workbench__sidebar">
        <div className="frequency-workbench__scope-header">
          <strong>作用范围管理</strong>
          <small>全院默认 / 科室差异化例外</small>
        </div>
        <div className="frequency-workbench__scope-list">
          <Button
            type="button"
            className={`frequency-scope-item ${selectedScope === 'ORGANIZATION' ? 'is-active' : ''}`}
            onClick={() => setSelectedScope('ORGANIZATION')} variant="text" size="sm">
            <div className="frequency-scope-item__icon">🏢</div>
            <div className="frequency-scope-item__info">
              <strong>全院统一配置</strong>
              <span>{orgConfig ? `已自定义: ${orgConfig.executionTimes.join('、')}` : `继承主档: ${frequency.defaultExecutionTimes.join('、') || '随医嘱'}`}</span>
            </div>
            <span className="frequency-scope-item__tag">全院</span>
          </Button>

          <div className="frequency-workbench__scope-divider">
            科室例外 ({configuredDeptIds.length})
          </div>
          {configuredDeptIds.map((deptId) => {
            const dept = departments.find((d) => d.id === deptId)
            const draft = scopeDrafts[deptId]
            const deptTimes = draft?.executionTimes ? draft.executionTimes.split(',') : []
            return (
              <Button
                key={deptId}
                type="button"
                className={`frequency-scope-item ${selectedScope === deptId ? 'is-active' : ''}`}
                onClick={() => setSelectedScope(deptId)} variant="text" size="sm">
                <div className="frequency-scope-item__icon">🏥</div>
                <div className="frequency-scope-item__info">
                  <strong>{dept?.name ?? deptId}</strong>
                  <span>{deptTimes.join('、') || '已自定义'}</span>
                </div>
                <span className="frequency-scope-item__tag">例外</span>
              </Button>
            )
          })}
        </div>

        <div className="frequency-workbench__add-dept">
          <Select
            placeholder="+ 添加科室例外…"
            value=""
            onChange={(deptId) => addDepartmentScope(deptId)}
            options={availableDepts.map((d) => ({
              value: d.id,
              label: d.name,
              secondaryText: d.code,
            }))}
          />
        </div>
      </aside>

      {/* 栏 2：时点与策略配置 */}
      <section className="frequency-workbench__form-pane">
        <header className="frequency-workbench__pane-header">
          <div>
            <h4>{isOrg ? `${organization.name} · 全院统一标准时点` : `${currentDept?.name ?? selectedScope} · 科室例外时点`}</h4>
            <p>{isOrg ? '全院所有科室默认继承此配置，如需特殊时点可在左侧添加科室例外。' : '当前科室优先级高于全院配置；仅对本科室开立的医嘱生效。'}</p>
          </div>
          {!isOrg && (
            <Button size="sm" variant="text" onClick={() => removeDepartmentScope(selectedScope)}>
              移除本科室例外
            </Button>
          )}
        </header>

        <div className="frequency-workbench__form-body">
          {(frequency.ruleType === 'TIMES_PER_PERIOD' || frequency.ruleType === 'CALENDAR') && (
            <div className="frequency-workbench__field-group">
              <FormField label="标准执行时点" required>
                <FrequencyTimeEditor
                  value={currentConfiguredTimes}
                  inheritLabel={isOrg
                    ? `留空继承主档默认：${frequency.defaultExecutionTimes.join('、') || '无固定时点'}`
                    : `留空继承全院时点：${scopeDrafts.ORGANIZATION?.executionTimes || frequency.defaultExecutionTimes.join('、') || '无固定时点'}`}
                  inheritTimes={isOrg ? frequency.defaultExecutionTimes : frequencyExecutionTimes(scopeDrafts.ORGANIZATION?.executionTimes || '')}
                  onChange={(times) => updateCurrentDraft({ executionTimes: times.join(',') })}
                />
              </FormField>

              {presetTimeOptions.length > 0 && (
                <div className="frequency-quick-presets">
                  <span>快捷时点：</span>
                  {presetTimeOptions.map((opt) => (
                    <Button
                      key={opt.label}
                      type="button"
                      className="frequency-preset-btn"
                      onClick={() => updateCurrentDraft({ executionTimes: opt.times.join(',') })} variant="text" size="sm"
                    >
                      {opt.label} ({opt.times.join('、')})
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="frequency-workbench__field-group">
            <label className="ui-field__label" style={{ marginBottom: '0.25rem', display: 'block' }}>
              首日执行策略
            </label>
            <div className="frequency-policy-cards">
              {FIRST_DAY_POLICIES.map((p) => {
                const active = currentDraft.firstDayPolicy === p.value
                return (
                  <label
                    key={p.value}
                    className={`frequency-policy-card ${active ? 'is-active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="firstDayPolicy"
                      value={p.value}
                      checked={active}
                      onChange={() => updateCurrentDraft({ firstDayPolicy: p.value })}
                    />
                    <div className="frequency-policy-card__content">
                      <strong>{p.title}</strong>
                      <span>{p.desc}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="frequency-workbench-check-field">
            <Check
              label="在当前范围启用"
              checked={currentDraft.enabled}
              onChange={(enabled) => updateCurrentDraft({ enabled })}
            />
          </div>

          <details className="frequency-advanced">
            <summary><span>高级设置</span><small>本地显示名称、编码与状态</small></summary>
            <div className="frequency-advanced__grid">
              <FormField label="本地编码">
                <input
                  value={currentDraft.localCode}
                  onChange={(e) => updateCurrentDraft({ localCode: e.target.value.toUpperCase() })}
                  placeholder={frequency.code}
                />
              </FormField>
              <FormField label="本地名称">
                <input
                  value={currentDraft.localName}
                  onChange={(e) => updateCurrentDraft({ localName: e.target.value })}
                  placeholder={frequency.name}
                />
              </FormField>
              <FormField label="状态">
                <Select
                  value={currentDraft.status}
                  onChange={(s) => updateCurrentDraft({ status: s as 'ACTIVE' | 'INACTIVE' })}
                  options={activeStatus}
                />
              </FormField>
              <FormField label="生效日期">
                <input
                  type="date"
                  value={currentDraft.validFrom}
                  onChange={(e) => updateCurrentDraft({ validFrom: e.target.value })}
                />
              </FormField>
              <FormField label="失效日期">
                <input
                  type="date"
                  min={currentDraft.validFrom}
                  value={currentDraft.validTo}
                  onChange={(e) => updateCurrentDraft({ validTo: e.target.value })}
                />
              </FormField>
            </div>
          </details>
        </div>
      </section>

      {/* 栏 3：实时排程推演沙盘 */}
      <section className="frequency-workbench__preview-pane">
        <header className="frequency-workbench__pane-header">
          <div>
            <h4>⚡ 执行排程实时推演</h4>
            <p>使用当前未保存配置模拟时点；缺少日期规则时明确提示，不创建执行任务</p>
          </div>
        </header>

        <div className="frequency-workbench__preview-body">
          <div className="frequency-workbench__preview-ctrl">
            <label style={{ whiteSpace: 'nowrap' }} className="clinical-content-19">
              开立时刻：
            </label>
            <input
              type="datetime-local"
              value={previewStart}
              onChange={(e) => setPreviewStart(e.target.value)}
            />

          </div>

          <FrequencySchedulePreview inputKey={JSON.stringify({ id: frequency.id, revision: frequency.revision, organizationId: organization.id, selectedScope, currentDraft, previewStart })}
            load={() => api.masterData.previewOrderFrequencyConfiguration(frequency, {
              organizationId: organization.id, departmentId: currentDraft.departmentId,
              localCode: currentDraft.localCode || undefined, localName: currentDraft.localName || undefined,
              executionTimes: currentDraft.executionTimes || undefined, firstDayPolicy: currentDraft.firstDayPolicy,
              enabled: currentDraft.enabled, status: currentDraft.status, validFrom: currentDraft.validFrom, validTo: currentDraft.validTo || undefined,
            }, previewStart ? `${previewStart}:00` : undefined, 8)} />
        </div>
      </section>

      {/* 底部全宽状态与操作条 */}
      <footer className="frequency-workbench__footer-bar">
        <div className="frequency-workbench__footer-status">
          <span>当前编辑：</span>
          <strong>{isOrg ? `${organization.name} · 全院统一配置` : `${currentDept?.name ?? selectedScope} · 科室例外`}</strong>
          <span>· 时点数: {currentConfiguredTimes.length > 0 ? `${currentConfiguredTimes.length} 个` : '继承主档'}</span>
        </div>
        <div className="frequency-workbench__footer-actions">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" busy={saving} onClick={handleSave}>
            保存当前范围配置
          </Button>
        </div>
      </footer>
    </div>
  </Dialog>
}

export function FrequencyWorkspace({ api, organization, departments, values, loading, onDialog, onDone, onError }: {
  api: RhnApi; organization: Organization; departments: Department[]; values: OrderFrequency[]; loading: boolean
  onDialog: (value?: ReactNode) => void; onDone: (message: string) => Promise<void>; onError: (error: unknown) => void
}) {
  const saveFrequency = (value?: OrderFrequency) => (input: OrderFrequencyInput) =>
    (value ? api.masterData.updateOrderFrequency(value, input) : api.masterData.createOrderFrequency(input))
      .then(() => onDone(value ? '医嘱频次已更新' : '医嘱频次已新增'))
  const saveConfiguration = (frequency: OrderFrequency, value?: OrderFrequencyConfiguration) =>
    (input: OrderFrequencyConfigurationInput) => (value
      ? api.masterData.updateOrderFrequencyConfiguration(frequency.id, value, input)
      : api.masterData.createOrderFrequencyConfiguration(frequency.id, input))
      .then(() => onDone(value ? '执行时间配置已更新' : '执行时间配置已新增')).catch(onError)

  const openConfigurations = (frequency: OrderFrequency) => {
    onDialog(<FrequencyConfigurationWorkbenchDialog
      frequency={frequency}
      organization={organization}
      departments={departments}
      api={api}
      onClose={() => onDialog(undefined)}
      onSaveConfiguration={(config) => saveConfiguration(frequency, config)}
      onError={onError}
    />)
  }

  return <section className="operational-master-data__body frequency-workspace">
    <div className="operational-master-data__toolbar">
      <div>
        <h3>医嘱频次主档</h3>
        <p>稳定编码承载医嘱语义，机构和科室只维护本地名称、启停与标准执行时间。</p>
      </div>
      <Button onClick={() => onDialog(<FrequencyDialog api={api} onClose={() => onDialog(undefined)} onSave={saveFrequency()} />)}>
        <Icon name="add" />新增频次
      </Button>
    </div>
    {loading ? <LoadingState label="正在加载医嘱频次…" /> : !values.length
      ? <EmptyState icon="clinical" title="暂无医嘱频次" copy="请先建立频次规则，再配置机构执行时点。" />
      : <TableShell scrollClassName="master-data-table-wrap">
          <UiDataTable className="master-data-table">
            <thead>
              <tr>
                <th>频次</th>
                <th>规则语义</th>
                <th>适用范围</th>
                <th>默认执行时点</th>
                <th>机构配置</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {values.map((value) => (
                <tr key={value.id}>
                  <td><b title={`频次编码：${value.code}`}>{value.name}{value.shortName && <small>{value.shortName}</small>}</b></td>
                  <td><span>{frequencyRuleLabel(value)}<small>{value.scheduleCapability?.explanation ?? (value.automaticTaskGeneration ? '已开启生成意图，需预演核对能力' : '不预生成固定任务')}</small></span></td>
                  <td>{frequencyApplicabilityLabel(value)}</td>
                  <td>{value.defaultExecutionTimes.join('、') || '随医嘱/事件'}</td>
                  <td>
                    <Button size="sm" variant="text" onClick={() => openConfigurations(value)}>
                      {value.configurations.length} 条配置
                    </Button>
                  </td>
                  <td><State value={value.status} /></td>
                  <td>
                    <div className="master-data-row-actions">
                      <Button size="sm" variant="text" onClick={() => openConfigurations(value)}>执行配置</Button>
                      <Button size="sm" variant="text" onClick={() => onDialog(<ClinicalSemanticImpactDialog api={api} scope={{ kind: 'FREQUENCY', conceptId: value.id, name: value.name }} onClose={() => onDialog(undefined)} />)}>变更影响</Button>
                      <Button size="sm" variant="text" onClick={() => onDialog(<FrequencyDialog api={api} value={value}
                        onClose={() => onDialog(undefined)} onSave={saveFrequency(value)} />)}>编辑</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </UiDataTable>
        </TableShell>
    }
  </section>
}

export function FrequencyDialog({ api, value, onClose, onSave }: {
  api: RhnApi; value?: OrderFrequency; onClose: () => void; onSave: (input: OrderFrequencyInput) => Promise<void>
}) {
  const [form, setForm] = useState<FrequencyDraft>({
    code: value?.code ?? '', name: value?.name ?? '', shortName: value?.shortName ?? '',
    description: value?.description ?? '', ruleType: value?.ruleType ?? 'TIMES_PER_PERIOD',
    frequencyCount: String(value?.frequencyCount ?? 2), periodValue: String(value?.periodValue ?? 1),
    periodUnit: value?.periodUnit ?? 'D', anchorType: value?.anchorType ?? 'STANDARD_TIME',
    defaultExecutionTimes: value?.defaultExecutionTimes.join(',') ?? '08:00,20:00',
    outpatientApplicable: value?.outpatientApplicable ?? true, inpatientApplicable: value?.inpatientApplicable ?? true,
    emergencyApplicable: value?.emergencyApplicable ?? true, medicationApplicable: value?.medicationApplicable ?? true,
    treatmentApplicable: value?.treatmentApplicable ?? true, nursingApplicable: value?.nursingApplicable ?? false,
    automaticTaskGeneration: value?.automaticTaskGeneration ?? true, sortOrder: String(value?.sortOrder ?? 100),
    status: value?.status ?? 'ACTIVE', validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '',
  })
  const [templateId, setTemplateId] = useState(value ? '' : 'DAILY')
  const [formError, setFormError] = useState('')
  const ruleType = form.ruleType as OrderFrequencyRuleType
  const usesPeriod = ruleType === 'TIMES_PER_PERIOD' || ruleType === 'FIXED_INTERVAL'
  const usesTimes = ruleType === 'TIMES_PER_PERIOD' || ruleType === 'CALENDAR'
  const executionTimes = frequencyExecutionTimes(form.defaultExecutionTimes)
  const input = frequencyDraftInput(form)
  const scopeLabel = frequencyDraftScopeLabel(form)
  const changeRule = (next: string) => setForm((current) => ({ ...current, ruleType: next as OrderFrequencyRuleType,
    anchorType: next === 'TIMES_PER_PERIOD' ? 'STANDARD_TIME' : next === 'CALENDAR' ? 'CALENDAR'
      : next === 'PRN' ? 'EVENT' : 'ORDER_START',
    automaticTaskGeneration: !['PRN', 'CONTINUOUS'].includes(next),
    defaultExecutionTimes: next === 'TIMES_PER_PERIOD' ? current.defaultExecutionTimes || '08:00' : current.defaultExecutionTimes,
  }))
  const applyTemplate = (id: string) => {
    const template = frequencyTemplates.find((item) => item.id === id)
    if (!template) return
    setTemplateId(id); setFormError('')
    setForm((current) => ({ ...current, ...template.values, code: current.code, name: current.name,
      shortName: current.shortName, description: current.description, sortOrder: current.sortOrder,
      status: current.status, validFrom: current.validFrom, validTo: current.validTo }))
  }
  const setExecutionTimes = (times: string[]) => setForm((current) => ({ ...current,
    defaultExecutionTimes: times.join(','),
    frequencyCount: current.ruleType === 'TIMES_PER_PERIOD' ? String(Math.max(1, times.length)) : current.frequencyCount,
  }))
  return <FormDialog title={value ? '编辑医嘱频次' : '新增医嘱频次'}
    description={value ? '修改只影响后续新医嘱，历史医嘱继续使用已保存的规则快照。' : '先选择业务模板，再补充编码和名称；右侧提供实时规则语义解读与执行沙盘即时预演。'}
    size="xwide"
    className="frequency-dialog-modal"
    customLayout
    onClose={onClose}
    onSubmit={(event) => { event.preventDefault()
      if (usesTimes && !executionTimes.length) { setFormError('请至少添加一个执行时点'); return }
      if (!form.outpatientApplicable && !form.inpatientApplicable && !form.emergencyApplicable) { setFormError('请至少选择一个适用场景'); return }
      if (!form.medicationApplicable && !form.treatmentApplicable && !form.nursingApplicable) { setFormError('请至少选择一种医嘱类型'); return }
      setFormError(''); return onSave(input)
    }} >
    <div className="frequency-dialog-split">
      <div className="frequency-dialog-split__main">
        {!value && <section className="frequency-template-picker" aria-label="频次业务模板">
          <header><strong>1. 选择业务模板</strong><small>系统自动填充规则，仍可在下方调整</small></header>
          <div className="frequency-template-grid">{frequencyTemplates.map((template) => <Button type="button" key={template.id}
            className={template.id === templateId ? 'is-active' : ''} onClick={() => applyTemplate(template.id)} variant="text" size="sm">
            <strong>{template.title}</strong><small>{template.copy}</small></Button>)}</div>
        </section>}
        {formError && <Alert>{formError}</Alert>}

        <section className="frequency-section-card">
          <header className="frequency-section-card__header">
            <strong>{value ? '频次身份与规则' : '2. 频次身份与规则定义'}</strong>
            <small>编码创建后不可修改，建议使用院内稳定编码或通用缩写</small>
          </header>
          <div className="master-data-form-grid master-data-form-grid--3">
            <FormField label="频次编码" required hint="常用标准编码示例：QD、BID、Q6H。">
              <input value={form.code} disabled={Boolean(value)} required
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="如 BID、Q6H" />
            </FormField>
            <FormField label="频次名称" required>
              <input value={form.name} required
                onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="如 每日两次" />
            </FormField>
            <FormField label="简称">
              <input value={form.shortName} placeholder="如 2/日" onChange={(event) => setForm({ ...form, shortName: event.target.value })} />
            </FormField>
          </div>

          <div className="master-data-form-grid master-data-form-grid--3" style={{ marginTop: 'var(--space-3)' }}>
            <FormField label="规则类型" required>
              <Select value={form.ruleType} onChange={changeRule} options={frequencyRuleOptions} />
            </FormField>
            {usesPeriod && <>
              <FormField label={ruleType === 'FIXED_INTERVAL' ? '间隔值' : '周期内次数'} required>
                <input type="number" min="1" step="1" readOnly={ruleType === 'TIMES_PER_PERIOD'}
                  value={ruleType === 'FIXED_INTERVAL' ? form.periodValue : Math.max(1, executionTimes.length)}
                  onChange={(event) => ruleType === 'FIXED_INTERVAL' && setForm({ ...form, periodValue: event.target.value })} />
              </FormField>
              <FormField label={ruleType === 'FIXED_INTERVAL' ? '间隔单位' : '统计周期'} required>
                <Select value={form.periodUnit}
                  onChange={(next) => setForm({ ...form, periodUnit: next, periodValue: ruleType === 'TIMES_PER_PERIOD' ? '1' : form.periodValue })}
                  options={periodUnitOptions} />
              </FormField>
            </>}
          </div>

          {usesTimes && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <FormField label="默认执行时点" required>
                <FrequencyTimeEditor value={executionTimes} onChange={setExecutionTimes} />
              </FormField>
            </div>
          )}
        </section>

        <section className="frequency-section-card frequency-scope-section">
          <header className="frequency-section-card__header">
            <strong>适用范围</strong>
            <small>明确该频次可以在哪些业务场景与医嘱类型中被选择</small>
          </header>
          <div className="frequency-scope-groups">
            <div className="frequency-scope-subgroup">
              <span className="frequency-scope-subgroup__title">适用业务场景</span>
              <div className="frequency-scope-subgroup__checks">
                <Check label="门诊适用" checked={form.outpatientApplicable} onChange={(next) => setForm({ ...form, outpatientApplicable: next })} />
                <Check label="住院适用" checked={form.inpatientApplicable} onChange={(next) => setForm({ ...form, inpatientApplicable: next })} />
                <Check label="急诊适用" checked={form.emergencyApplicable} onChange={(next) => setForm({ ...form, emergencyApplicable: next })} />
              </div>
            </div>
            <div className="frequency-scope-subgroup">
              <span className="frequency-scope-subgroup__title">适用医嘱类型</span>
              <div className="frequency-scope-subgroup__checks">
                <Check label="药品医嘱" checked={form.medicationApplicable} onChange={(next) => setForm({ ...form, medicationApplicable: next })} />
                <Check label="治疗医嘱" checked={form.treatmentApplicable} onChange={(next) => setForm({ ...form, treatmentApplicable: next })} />
                <Check label="护理医嘱" checked={form.nursingApplicable} onChange={(next) => setForm({ ...form, nursingApplicable: next })} />
              </div>
            </div>
          </div>
          <p className="frequency-scope-summary"><strong>当前生效范围：</strong>{scopeLabel}</p>
        </section>

        <details className="frequency-advanced" open={Boolean(value)}>
          <summary><span>高级设置</span><small>状态、生效期、排序和任务生成策略</small></summary>
          <div className="frequency-advanced__grid master-data-form-grid--4">
            <FormField label="状态">
              <Select value={form.status} onChange={(next) => setForm({ ...form, status: next as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} />
            </FormField>
            <FormField label="排序号">
              <input type="number" min="0" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
            </FormField>
            <FormField label="生效日期" required>
              <input type="date" value={form.validFrom} required onChange={(event) => setForm({ ...form, validFrom: event.target.value })} />
            </FormField>
            <FormField label="失效日期">
              <input type="date" min={form.validFrom} value={form.validTo} onChange={(event) => setForm({ ...form, validTo: event.target.value })} />
            </FormField>
            <FormField label="业务说明" className="span-3">
              <textarea value={form.description} placeholder="可选业务背景、给药间隔或特殊操作说明" onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </FormField>
            <div className="frequency-task-check span-1">
              <Check label="自动生成执行任务" checked={form.automaticTaskGeneration}
                disabled={ruleType === 'PRN' || ruleType === 'CONTINUOUS'}
                onChange={(next) => setForm({ ...form, automaticTaskGeneration: next })} />
            </div>
          </div>
        </details>
      </div>

      <aside className="frequency-dialog-split__sidecar">
        <div className="frequency-sidecar-card">
          <div className="frequency-sidecar-card__header">
            <strong>规则实时语义解读</strong>
            <span className="frequency-sidecar-badge">即时计算</span>
          </div>
          <FrequencyDraftPreview form={form} compact />
        </div>

        <div className="frequency-sidecar-card">
          <div className="frequency-sidecar-card__header">
            <strong>频次结构与时点沙盘预演</strong>
            <span className="frequency-sidecar-badge">规则沙盒</span>
          </div>
          <div className="frequency-sidecar-card__body">
            <FrequencySchedulePreview inputKey={JSON.stringify(input)} load={() => api.masterData.previewOrderFrequencyDefinition(input)} />
          </div>
        </div>

        <div className="frequency-sidecar-card frequency-sidecar-card--hint">
          <div className="frequency-sidecar-card__header">
            <div className="frequency-sidecar-card__hint-title">
              <Icon name="info" />
              <strong>临床用药规则联动指引</strong>
            </div>
          </div>
          <div className="frequency-sidecar-card__hint-body">
            <p>勾选<strong>【门诊适用】</strong>与<strong>【药品医嘱】</strong>后，本频次将自动纳入<strong>【药品知识与目录 - 用药规则 - 频次标准】</strong>。</p>
            <p>系统会在门诊开立时以此规则推算日给药剂量，并在合理用药审核中执行用药频次与极量合规监测。</p>
          </div>
        </div>
      </aside>
    </div>
  </FormDialog>
}
