import { useState } from 'react'
import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import type { LocalDiagnosticObservationInput } from '../../../shared/api/diagnosticsApi'
import { Alert, Button, Dialog, EditableCell, EditableRow, EditableTable, FormField, Select, StatusBadge, tableCellClass } from '../../../shared/ui'
import {
  NATIONAL_STANDARD_LAB_TEMPLATES,
  evaluateIndicatorValue,
  extractPatientConditions,
  findNationalIndicatorDefinition,
  findReferenceGuidance,
  referenceConditionLabel,
  matchApplicableReferenceRule,
  type NationalStandardLabTemplate,
} from '../../../shared/clinical/nationalStandardLabCatalog'

type Row = LocalDiagnosticObservationInput
const flags = [
  { value: 'N', label: '正常' },
  { value: 'H', label: '偏高 ↑' },
  { value: 'L', label: '偏低 ↓' },
  { value: 'HH', label: '极高危急 ↑↑' },
  { value: 'LL', label: '极低危急 ↓↓' },
  { value: 'A', label: '异常' },
  { value: 'CRITICAL', label: '★危急值' },
  { value: 'PANIC', label: '★危急值 (PANIC)' },
]
export function LaboratoryResultEditor({
  rows,
  onChange,
  disabled,
  template,
  patient,
  onApplyTemplate,
  presetTemplates = NATIONAL_STANDARD_LAB_TEMPLATES,
  title,
  dirty,
  draftAuthor,
}: {
  rows: Row[]
  onChange: (rows: Row[]) => void
  disabled: boolean
  template?: DiagnosticTemplateVersion
  patient?: { gender?: string; birthDate?: string; ageDays?: number }
  presetTemplates?: readonly NationalStandardLabTemplate[]
  onApplyTemplate?: (template: NationalStandardLabTemplate) => void
  title?: string
  dirty?: boolean
  draftAuthor?: string
}) {
  const patientConditions = extractPatientConditions(patient)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<NationalStandardLabTemplate | null>(null)

  const update = (index: number, patch: Partial<Row>, isBlur = false) => {
    const targetRow = rows[index]
    const updatedValue = patch.observationValue !== undefined ? patch.observationValue : targetRow.observationValue

    let dynamicRulePatch: Partial<Row> = {}
    if (patch.observationValue !== undefined || 'instrumentCode' in patch || 'populationCode' in patch) {
      const def =
        template?.content.indicators.find((item) => item.code === targetRow.observationCode) ??
        findNationalIndicatorDefinition(targetRow.observationCode)
      if (def) {
        const conditions = { ...patientConditions, instrumentCode: targetRow.instrumentCode, populationCode: targetRow.populationCode, ...patch }
        const evalResult = evaluateIndicatorValue(def, updatedValue, conditions)
        const rule = evalResult.rule ?? matchApplicableReferenceRule(def.rules, conditions)
        const isCriticalCode = ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(evalResult.interpretationCode || '')

        // 录入过程中若命中危急值生命线，暂不标记为危急值（降级为常规偏高偏低），避免输入中间值频繁误触；在失去焦点时才正式生效
        let finalInterpretation = evalResult.interpretationCode as Row['interpretationCode']
        if (isCriticalCode && !isBlur) {
          finalInterpretation = evalResult.interpretationCode === 'LL' ? 'L'
            : evalResult.interpretationCode === 'HH' ? 'H'
            : undefined
        }

        dynamicRulePatch = {
          referenceRangeLow: rule?.referenceLow,
          referenceRangeHigh: rule?.referenceHigh,
          interpretationCode: finalInterpretation,
          ruleStatus: rule ? rule.referenceLow == null && rule.referenceHigh == null ? 'NO_RANGE' : 'MATCHED' : 'NO_RULE',
        }
      }
    }

    onChange(
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              ...patch,
              ...dynamicRulePatch,
            }
          : row
      )
    )
  }

  const append = () =>
    onChange([...rows, { observationCode: '', observationName: '', valueType: 'NUMBER', observationValue: '' }])

  const abnormal = rows.filter((row) => row.interpretationCode && row.interpretationCode !== 'N').length
  const criticalRows = rows.filter(
    (row, idx) => idx !== focusedIndex && ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(row.interpretationCode || '')
  )
  const critical = criticalRows.length

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const nextInput = document.querySelector<HTMLInputElement>(`input[data-indicator-index="${currentIndex + 1}"]`)
      if (nextInput) {
        nextInput.focus()
        nextInput.select?.()
      } else {
        e.currentTarget.blur()
      }
    }
  }

  const applyNationalTemplate = (tpl: NationalStandardLabTemplate) => {
    if (onApplyTemplate) {
      onApplyTemplate(tpl)
      return
    }
    const newRows: Row[] = tpl.content.indicators.map((ind) => {
      const rule = matchApplicableReferenceRule(ind.rules, patientConditions)
      return {
        observationCode: ind.code,
        observationName: ind.name,
        valueType: ind.valueType,
        observationValue: '',
        unitCode: ind.unitCode,
        referenceRangeLow: rule?.referenceLow,
        referenceRangeHigh: rule?.referenceHigh,
      }
    })
    onChange(newRows)
  }

  return (
    <section aria-label="检验指标录入" className="diagnostic-result-editor-section">
      {pendingTemplate && <Dialog title="载入项目模板并清空现有指标结果？" onClose={() => setPendingTemplate(null)}
        footer={<><Button variant="secondary" onClick={() => setPendingTemplate(null)}>保留当前内容</Button>
          <Button disabled={disabled} onClick={() => { applyNationalTemplate(pendingTemplate); setPendingTemplate(null) }}>载入并清空指标结果</Button></>}>
        <p>当前已填写的指标结果将被替换，请核对当前申请项目后再载入。</p>
      </Dialog>}
      <div className="diagnostic-editor-head diagnostic-toolbar-unified">
        <div className="diagnostic-toolbar-left">
          <h3>{title || '检验结果'}</h3>
          {template && (
            <span className="diagnostic-template-badge" title={template.publicationBasis || template.id}>
              {template.id.startsWith('TPL_LAB_') ? '项目预置' : `机构 V${template.version}`} · {template.publicationBasis || template.id}
            </span>
          )}
          <span className="diagnostic-draft-status">
            {dirty ? '未保存' : draftAuthor ? '草稿已存' : '未存草稿'}
          </span>
        </div>
        <div className="diagnostic-toolbar-right">
          <span className="diagnostic-progress-text">
            {rows.filter((row) => row.observationValue.trim()).length} / {rows.length} 项已录入
            {abnormal > 0 && <span className="diagnostic-abnormal-text"> · 异常 {abnormal} 项</span>}
          </span>
          {(!template || template.id.startsWith('TPL_LAB_')) && onApplyTemplate && presetTemplates.length > 0 && (
            <div className="diagnostic-toolbar-select-wrap">
              <Select
                id="quick-national-template-select"
                aria-label="套用项目结果模板"
                value=""
                placeholder={template?.id.startsWith('TPL_LAB_') ? '重新载入项目模板' : '载入项目结果模板'}
                disabled={disabled}
                options={presetTemplates.map((t) => ({ value: t.templateCode, label: t.templateName }))}
                onChange={(code) => {
                  const found = presetTemplates.find((t) => t.templateCode === code)
                  if (!found) return
                  if (rows.some((row) => row.observationValue.trim())) setPendingTemplate(found)
                  else applyNationalTemplate(found)
                }}
              />
            </div>
          )}
          {!template && (
            <Button size="sm" variant="secondary" disabled={disabled} onClick={append}>
              添加指标
            </Button>
          )}
        </div>
      </div>

      {critical > 0 && (
        <Alert tone="error" placement="inline">
          <StatusBadge tone="danger">危急值预警 {critical} 项</StatusBadge>{' '}
          命中危急值生命线（{criticalRows.map((r) => `${r.observationName} ${r.observationValue}`).join('、')}），请按规程复检并登记危急值通报卡！
        </Alert>
      )}

      <div className="diagnostic-indicator-table">
        <EditableTable aria-label="检验指标" onAppendRow={disabled || template ? undefined : append}>
          <thead>
            <tr>
              <th className={tableCellClass('text')}>指标 / 代码</th>
              <th className={tableCellClass('numeric')}>结果</th>
              <th className={tableCellClass('text')}>单位</th>
              <th className={tableCellClass('numeric')}>参考区间</th>
              <th className={tableCellClass('status')}>标志 / 判定</th>
              {!template && <th className={tableCellClass('actions')}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const def =
                template?.content.indicators.find((item) => item.code === row.observationCode) ??
                findNationalIndicatorDefinition(row.observationCode)
              const matchedRule = def ? matchApplicableReferenceRule(def.rules, { ...patientConditions, instrumentCode: row.instrumentCode, populationCode: row.populationCode }) : undefined
              const displayRefLow = row.referenceRangeLow ?? matchedRule?.referenceLow
              const displayRefHigh = row.referenceRangeHigh ?? matchedRule?.referenceHigh
              const guidance = findReferenceGuidance(matchedRule?.code)
              const isAbnormal = row.interpretationCode && row.interpretationCode !== 'N'
              const isCriticalRow = ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(row.interpretationCode || '')

              return (
                <EditableRow key={index} className={isAbnormal ? 'is-abnormal' : undefined}>
                  {template ? (
                    <td className={tableCellClass('text')}>
                      <div className="diagnostic-indicator-display">
                        <span className="diagnostic-indicator-name-wrapper">
                          {def?.required && <span className="diagnostic-required-mark" title="必填" aria-label="必填">*</span>}
                          <strong>{row.observationName}</strong>
                        </span>
                      </div>
                    </td>
                  ) : (
                    <EditableCell
                      className={tableCellClass('text')}
                      display={
                        <span className="diagnostic-indicator-display">
                          <strong>{row.observationName || '—'}</strong>
                        </span>
                      }
                    >
                      <div className="diagnostic-cell-composite">
                        <input
                          aria-label={`指标${index + 1}代码`}
                          disabled={disabled}
                          placeholder="代码"
                          value={row.observationCode}
                          onChange={(e) => update(index, { observationCode: e.target.value })}
                        />
                        <input
                          aria-label={`指标${index + 1}名称`}
                          disabled={disabled}
                          placeholder="指标名称"
                          value={row.observationName}
                          onChange={(e) => update(index, { observationName: e.target.value })}
                        />
                        <Select
                          aria-label={`指标${index + 1}类型`}
                          disabled={disabled}
                          value={row.valueType}
                          clearable={false}
                          searchable={false}
                          options={[
                            { value: 'NUMBER', label: '数值' },
                            { value: 'STRING', label: '文本' },
                            { value: 'CODE', label: '定性' },
                          ]}
                          onChange={(value) => update(index, { valueType: value as Row['valueType'] })}
                        />
                      </div>
                    </EditableCell>
                  )}
                  <td className={tableCellClass('numeric')}>
                    {template && row.valueType === 'CODE' ? (
                      <Select
                        aria-label={`指标${index + 1}结果`}
                        disabled={disabled}
                        value={row.observationValue || ''}
                        options={(def?.allowedCodes || []).map((value) => ({ value, label: value }))}
                        onChange={(value) => update(index, { observationValue: value }, true)}
                      />
                    ) : (
                      <input
                        className="diagnostic-result-input"
                        aria-label={`指标${index + 1}结果`}
                        disabled={disabled}
                        data-indicator-index={index}
                        inputMode={row.valueType === 'NUMBER' ? 'decimal' : 'text'}
                        placeholder="—"
                        value={row.observationValue || ''}
                        onFocus={() => setFocusedIndex(index)}
                        onBlur={(e) => {
                          setFocusedIndex(null)
                          update(index, { observationValue: e.target.value }, true)
                        }}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        onChange={(e) => update(index, { observationValue: e.target.value }, false)}
                      />
                    )}
                  </td>
                  {template ? (
                    <td className={tableCellClass('text')}>{row.unitCode || def?.unitCode || '—'}</td>
                  ) : (
                    <EditableCell className={tableCellClass('text')} display={row.unitCode}>
                      <input
                        aria-label={`指标${index + 1}单位`}
                        disabled={disabled}
                        placeholder="单位"
                        value={row.unitCode || ''}
                        onChange={(e) => update(index, { unitCode: e.target.value || undefined })}
                      />
                    </EditableCell>
                  )}
                  {template ? (
                    <td className={tableCellClass('numeric')}>
                      {displayRefLow == null && displayRefHigh == null
                        ? guidance || <span title="请按患者条件和本机构检测方法维护参考规则">{def?.rules.length ? '无适用区间' : '待机构确认'}</span>
                        : displayRefLow == null ? `≤ ${displayRefHigh}` : displayRefHigh == null ? `≥ ${displayRefLow}` : `${displayRefLow} ～ ${displayRefHigh}`}
                    </td>
                  ) : (
                    <EditableCell
                      className={tableCellClass('numeric')}
                      display={`${row.referenceRangeLow ?? '—'} ～ ${row.referenceRangeHigh ?? '—'}`}
                    >
                      <div className="diagnostic-reference-range">
                        <input
                          aria-label={`指标${index + 1}参考下限`}
                          disabled={disabled}
                          type="number"
                          placeholder="下限"
                          value={row.referenceRangeLow ?? ''}
                          onChange={(e) =>
                            update(index, {
                              referenceRangeLow: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <span className="diagnostic-range-separator">～</span>
                        <input
                          aria-label={`指标${index + 1}参考上限`}
                          disabled={disabled}
                          type="number"
                          placeholder="上限"
                          value={row.referenceRangeHigh ?? ''}
                          onChange={(e) =>
                            update(index, {
                              referenceRangeHigh: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </EditableCell>
                  )}
                  {template ? (
                    <td className={tableCellClass('status')}>
                      {row.observationValue?.trim() ? (
                        <StatusBadge tone={isCriticalRow ? 'danger' : isAbnormal ? 'warning' : 'success'}>
                          {flags.find((flag) => flag.value === row.interpretationCode)?.label || '正常'}
                        </StatusBadge>
                      ) : (
                        <span className="diagnostic-empty-dash">—</span>
                      )}
                    </td>
                  ) : (
                    <EditableCell
                      className={tableCellClass('status')}
                      display={flags.find((flag) => flag.value === row.interpretationCode)?.label || '未判定'}
                    >
                      <Select
                        aria-label={`指标${index + 1}标志`}
                        disabled={disabled}
                        placeholder="未判定"
                        value={row.interpretationCode || ''}
                        searchable={false}
                        options={flags}
                        onChange={(value) =>
                          update(index, { interpretationCode: (value || undefined) as Row['interpretationCode'] })
                        }
                      />
                    </EditableCell>
                  )}
                  {!template && (
                    <td className={tableCellClass('actions')}>
                      <Button
                        size="sm"
                        variant="text"
                        disabled={disabled || rows.length === 1}
                        onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      >
                        移除指标{index + 1}
                      </Button>
                    </td>
                  )}
                </EditableRow>
              )
            })}
          </tbody>
        </EditableTable>
      </div>
      {template &&
        rows.map((row, index) => {
          const definition = template.content.indicators.find((value) => value.code === row.observationCode)
          const instruments = [
            ...new Set(
              definition?.rules.map((value) => value.instrumentCode).filter((value): value is string => Boolean(value))
            ),
          ]
          const populations = [
            ...new Set(
              definition?.rules.map((value) => value.populationCode).filter((value): value is string => Boolean(value))
            ),
          ]
          return instruments.length || populations.length ? (
            <div key={row.observationCode} className="diagnostic-form-row">
              {instruments.length > 0 && (
                <FormField label={`${row.observationName} · 分析系统/方法`}>
                  <Select
                    disabled={disabled}
                    value={row.instrumentCode || ''}
                    options={instruments.map((value) => ({ value, label: referenceConditionLabel(value) }))}
                    onChange={(value) => update(index, { instrumentCode: value || undefined }, true)}
                  />
                </FormField>
              )}
              {populations.length > 0 && (
                <FormField label={`${row.observationName} · 适用条件`}>
                  <Select
                    disabled={disabled}
                    value={row.populationCode || ''}
                    options={populations.map((value) => ({ value, label: referenceConditionLabel(value) }))}
                    onChange={(value) => update(index, { populationCode: value || undefined }, true)}
                  />
                </FormField>
              )}
            </div>
          ) : null
        })}
    </section>
  )
}

