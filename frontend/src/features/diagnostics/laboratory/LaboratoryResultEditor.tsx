import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import { diagnosticRuleStatus } from '../../../shared/clinical/diagnosticResults'
import type { LocalDiagnosticObservationInput } from '../../../shared/api/diagnosticsApi'
import { Alert, Button, EditableCell, EditableRow, EditableTable, FormField, Select, StatusBadge, tableCellClass } from '../../../shared/ui'
import {
  NATIONAL_STANDARD_LAB_TEMPLATES,
  evaluateIndicatorValue,
  extractPatientConditions,
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
const comparators = [
  { value: 'EQ', label: '=' },
  { value: 'LT', label: '<' },
  { value: 'LE', label: '≤' },
  { value: 'GT', label: '>' },
  { value: 'GE', label: '≥' },
]

export function LaboratoryResultEditor({
  rows,
  onChange,
  disabled,
  template,
  patient,
  onApplyTemplate,
}: {
  rows: Row[]
  onChange: (rows: Row[]) => void
  disabled: boolean
  template?: DiagnosticTemplateVersion
  patient?: { gender?: string; birthDate?: string; ageDays?: number }
  onApplyTemplate?: (template: NationalStandardLabTemplate) => void
}) {
  const patientConditions = extractPatientConditions(patient)

  const update = (index: number, patch: Partial<Row>) => {
    const targetRow = rows[index]
    const updatedValue = patch.observationValue !== undefined ? patch.observationValue : targetRow.observationValue

    let dynamicRulePatch: Partial<Row> = {}
    if (template && patch.observationValue !== undefined) {
      const def = template.content.indicators.find((item) => item.code === targetRow.observationCode)
      if (def) {
        const evalResult = evaluateIndicatorValue(def, updatedValue, patientConditions)
        const rule = evalResult.rule ?? matchApplicableReferenceRule(def.rules, patientConditions)
        dynamicRulePatch = {
          referenceRangeLow: rule?.referenceLow,
          referenceRangeHigh: rule?.referenceHigh,
          interpretationCode: evalResult.interpretationCode as Row['interpretationCode'],
          ruleStatus: rule ? 'MATCHED' : undefined,
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
  const criticalRows = rows.filter((row) => ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(row.interpretationCode || ''))
  const critical = criticalRows.length

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const nextInput = document.querySelector<HTMLInputElement>(`input[data-indicator-index="${currentIndex + 1}"]`)
      if (nextInput) {
        nextInput.focus()
        nextInput.select?.()
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
    <section aria-label="检验指标录入">
      <div className="diagnostic-editor-head">
        <h3>检验结果</h3>
        <span>
          {rows.filter((row) => row.observationValue.trim()).length} / {rows.length} 项已录入 · 异常 {abnormal} 项
        </span>
        <div className="ui-form-actions">
          {!template && onApplyTemplate && (
            <Select
              id="quick-national-template-select"
              aria-label="套用国家标准模板"
              value=""
              placeholder="套用国家标准模板 (WS/T 404/405)"
              disabled={disabled}
              options={NATIONAL_STANDARD_LAB_TEMPLATES.map((t) => ({ value: t.templateCode, label: t.templateName }))}
              onChange={(code) => {
                const found = NATIONAL_STANDARD_LAB_TEMPLATES.find((t) => t.templateCode === code)
                if (found) applyNationalTemplate(found)
              }}
            />
          )}
          <Button size="sm" variant="secondary" disabled={disabled || Boolean(template)} onClick={append}>
            添加指标
          </Button>
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
              const def = template?.content.indicators.find((item) => item.code === row.observationCode)
              const matchedRule = def ? matchApplicableReferenceRule(def.rules, patientConditions) : undefined
              const displayRefLow = row.referenceRangeLow ?? matchedRule?.referenceLow
              const displayRefHigh = row.referenceRangeHigh ?? matchedRule?.referenceHigh
              const isAbnormal = row.interpretationCode && row.interpretationCode !== 'N'
              const isCriticalRow = ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(row.interpretationCode || '')

              return (
                <EditableRow key={index} className={isAbnormal ? 'is-abnormal' : undefined}>
                  {template ? (
                    <td className={tableCellClass('text')}>
                      <strong>{row.observationName}</strong>
                      <small>
                        {row.observationCode}
                        {def?.required ? ' · 必填' : ''}
                      </small>
                    </td>
                  ) : (
                    <EditableCell
                      className={tableCellClass('text')}
                      display={
                        <span>
                          {row.observationName}
                          <small>{row.observationCode}</small>
                        </span>
                      }
                    >
                      <FormField label={`指标${index + 1}代码`}>
                        <input
                          disabled={disabled}
                          value={row.observationCode}
                          onChange={(e) => update(index, { observationCode: e.target.value })}
                        />
                      </FormField>
                      <FormField label={`指标${index + 1}名称`}>
                        <input
                          disabled={disabled}
                          value={row.observationName}
                          onChange={(e) => update(index, { observationName: e.target.value })}
                        />
                      </FormField>
                      <Select
                        aria-label={`指标${index + 1}类型`}
                        disabled={disabled}
                        value={row.valueType}
                        clearable={false}
                        searchable={false}
                        options={[
                          { value: 'NUMBER', label: '数值' },
                          { value: 'STRING', label: '文本' },
                          { value: 'CODE', label: '定性编码' },
                        ]}
                        onChange={(value) => update(index, { valueType: value as Row['valueType'] })}
                      />
                    </EditableCell>
                  )}
                  <EditableCell
                    className={tableCellClass('numeric')}
                    display={
                      row.observationValue
                        ? `${row.valueType === 'NUMBER' ? comparators.find((value) => value.value === (row.valueComparator || 'EQ'))?.label || '' : ''}${row.observationValue}`
                        : ''
                    }
                  >
                    <div className={row.valueType === 'NUMBER' ? 'diagnostic-result-value' : undefined}>
                      {row.valueType === 'NUMBER' && (
                        <Select
                          aria-label={`指标${index + 1}比较符`}
                          disabled={disabled}
                          value={row.valueComparator || 'EQ'}
                          clearable={false}
                          searchable={false}
                          options={comparators}
                          onChange={(value) => update(index, { valueComparator: value as Row['valueComparator'] })}
                        />
                      )}
                      <FormField label={`指标${index + 1}结果`}>
                        {template && row.valueType === 'CODE' ? (
                          <Select
                            aria-label={`指标${index + 1}结果`}
                            disabled={disabled}
                            value={row.observationValue || ''}
                            options={(def?.allowedCodes || []).map((value) => ({ value, label: value }))}
                            onChange={(value) => update(index, { observationValue: value })}
                          />
                        ) : (
                          <input
                            disabled={disabled}
                            data-indicator-index={index}
                            inputMode={row.valueType === 'NUMBER' ? 'decimal' : 'text'}
                            value={row.observationValue || ''}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            onChange={(e) => update(index, { observationValue: e.target.value })}
                          />
                        )}
                      </FormField>
                    </div>
                  </EditableCell>
                  {template ? (
                    <td className={tableCellClass('text')}>{row.unitCode || def?.unitCode || '—'}</td>
                  ) : (
                    <EditableCell className={tableCellClass('text')} display={row.unitCode}>
                      <FormField label={`指标${index + 1}单位`}>
                        <input
                          disabled={disabled}
                          value={row.unitCode || ''}
                          onChange={(e) => update(index, { unitCode: e.target.value || undefined })}
                        />
                      </FormField>
                    </EditableCell>
                  )}
                  {template ? (
                    <td className={tableCellClass('numeric')}>
                      {displayRefLow == null && displayRefHigh == null
                        ? '待规则匹配'
                        : `${displayRefLow ?? '—'} ～ ${displayRefHigh ?? '—'}`}
                    </td>
                  ) : (
                    <EditableCell
                      className={tableCellClass('numeric')}
                      display={`${row.referenceRangeLow ?? '—'} ～ ${row.referenceRangeHigh ?? '—'}`}
                    >
                      <div className="diagnostic-reference-range">
                        <FormField label={`指标${index + 1}参考下限`}>
                          <input
                            disabled={disabled}
                            type="number"
                            value={row.referenceRangeLow ?? ''}
                            onChange={(e) =>
                              update(index, {
                                referenceRangeLow: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                          />
                        </FormField>
                        <FormField label={`指标${index + 1}参考上限`}>
                          <input
                            disabled={disabled}
                            type="number"
                            value={row.referenceRangeHigh ?? ''}
                            onChange={(e) =>
                              update(index, {
                                referenceRangeHigh: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                          />
                        </FormField>
                      </div>
                    </EditableCell>
                  )}
                  {template ? (
                    <td className={tableCellClass('status')}>
                      <StatusBadge tone={isCriticalRow ? 'danger' : isAbnormal ? 'warning' : 'success'}>
                        {flags.find((flag) => flag.value === row.interpretationCode)?.label || '正常'}
                      </StatusBadge>
                      <small>{diagnosticRuleStatus(row.ruleStatus) || '国家标准参考区间'}</small>
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
                <FormField label={`${row.observationName} · 仪器`}>
                  <Select
                    disabled={disabled}
                    value={row.instrumentCode || ''}
                    options={instruments.map((value) => ({ value, label: value }))}
                    onChange={(value) => update(index, { instrumentCode: value || undefined })}
                  />
                </FormField>
              )}
              {populations.length > 0 && (
                <FormField label={`${row.observationName} · 生理状态`}>
                  <Select
                    disabled={disabled}
                    value={row.populationCode || ''}
                    options={populations.map((value) => ({ value, label: value }))}
                    onChange={(value) => update(index, { populationCode: value || undefined })}
                  />
                </FormField>
              )}
            </div>
          ) : null
        })}
    </section>
  )
}

