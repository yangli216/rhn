import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import { diagnosticRuleStatus } from '../../../shared/clinical/diagnosticResults'
import type { LocalDiagnosticObservationInput } from '../../../shared/api/diagnosticsApi'
import { Button, EditableCell, EditableRow, EditableTable, FormField, Select, StatusBadge, tableCellClass } from '../../../shared/ui'

type Row = LocalDiagnosticObservationInput
const flags = [{ value: 'N', label: '正常' }, { value: 'H', label: '偏高' }, { value: 'L', label: '偏低' },
  { value: 'HH', label: '危急高值' }, { value: 'LL', label: '危急低值' }, { value: 'A', label: '异常' },
  { value: 'CRITICAL', label: '危急值' }, { value: 'PANIC', label: '危急值（PANIC）' }]
const comparators = [{ value: 'EQ', label: '=' }, { value: 'LT', label: '<' }, { value: 'LE', label: '≤' }, { value: 'GT', label: '>' }, { value: 'GE', label: '≥' }]
export function LaboratoryResultEditor({ rows, onChange, disabled, template }: {
  rows: Row[]; onChange: (rows: Row[]) => void; disabled: boolean; template?: DiagnosticTemplateVersion
}) {
  const update = (index: number, patch: Partial<Row>) => onChange(rows.map((row, i) => i === index
    ? { ...row, ...patch, ...(template ? { interpretationCode: undefined, referenceRangeLow: undefined, referenceRangeHigh: undefined, ruleStatus: undefined, ruleSnapshot: undefined } : {}) } : row))
  const append = () => onChange([...rows, { observationCode: '', observationName: '', valueType: 'NUMBER', observationValue: '' }])
  const abnormal = rows.filter((row) => row.interpretationCode && row.interpretationCode !== 'N').length
  const critical = rows.filter((row) => ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(row.interpretationCode || '')).length
  return <section aria-label="检验指标录入"><div className="diagnostic-editor-head"><h3>检验结果</h3>
    <span>{rows.filter((row) => row.observationValue.trim()).length} / {rows.length} 项已录入 · 异常 {abnormal} 项</span>
    <Button size="sm" variant="secondary" disabled={disabled || Boolean(template)} onClick={append}>添加指标</Button></div>
    {critical > 0 && <p className="diagnostic-critical-summary"><StatusBadge tone="danger">危急结果 {critical} 项</StatusBadge> 请核对数值与参考规则。</p>}
    <div className="diagnostic-indicator-table"><EditableTable aria-label="检验指标" onAppendRow={disabled || template ? undefined : append}>
      <thead><tr><th className={tableCellClass('text')}>指标 / 代码</th><th className={tableCellClass('numeric')}>结果</th>
        <th className={tableCellClass('text')}>单位</th><th className={tableCellClass('numeric')}>参考区间</th>
        <th className={tableCellClass('status')}>标志 / 判定</th>{!template && <th className={tableCellClass('actions')}>操作</th>}</tr></thead>
      <tbody>{rows.map((row, index) => <EditableRow key={index} className={row.interpretationCode && row.interpretationCode !== 'N' ? 'is-abnormal' : undefined}>
        {template ? <td className={tableCellClass('text')}><strong>{row.observationName}</strong><small>{row.observationCode}
          {template.content.indicators.find((item) => item.code === row.observationCode)?.required ? ' · 必填' : ''}</small></td>
          : <EditableCell className={tableCellClass('text')} display={<span>{row.observationName}<small>{row.observationCode}</small></span>}>
            <FormField label={`指标${index + 1}代码`}><input disabled={disabled} value={row.observationCode} onChange={(e) => update(index, { observationCode: e.target.value })} /></FormField>
            <FormField label={`指标${index + 1}名称`}><input disabled={disabled} value={row.observationName} onChange={(e) => update(index, { observationName: e.target.value })} /></FormField>
            <Select aria-label={`指标${index + 1}类型`} disabled={disabled} value={row.valueType} clearable={false} searchable={false}
              options={[{ value: 'NUMBER', label: '数值' }, { value: 'STRING', label: '文本' }, { value: 'CODE', label: '定性编码' }]}
              onChange={(value) => update(index, { valueType: value as Row['valueType'] })} /></EditableCell>}
        <EditableCell className={tableCellClass('numeric')} display={row.observationValue ? `${row.valueType === 'NUMBER' ? comparators.find((value) => value.value === (row.valueComparator || 'EQ'))?.label || '' : ''}${row.observationValue}` : ''}>
          <div className={row.valueType === 'NUMBER' ? 'diagnostic-result-value' : undefined}>
            {row.valueType === 'NUMBER' && <Select aria-label={`指标${index + 1}比较符`} disabled={disabled} value={row.valueComparator || 'EQ'}
              clearable={false} searchable={false} options={comparators} onChange={(value) => update(index, { valueComparator: value as Row['valueComparator'] })} />}
            <FormField label={`指标${index + 1}结果`}>{template && row.valueType === 'CODE'
              ? <Select aria-label={`指标${index + 1}结果`} disabled={disabled} value={row.observationValue || ''}
                  options={(template.content.indicators.find((value) => value.code === row.observationCode)?.allowedCodes || []).map((value) => ({ value, label: value }))}
                  onChange={(value) => update(index, { observationValue: value })} />
              : <input disabled={disabled} inputMode={row.valueType === 'NUMBER' ? 'decimal' : 'text'} value={row.observationValue || ''}
                  onChange={(e) => update(index, { observationValue: e.target.value })} />}</FormField></div></EditableCell>
        {template ? <td className={tableCellClass('text')}>{row.unitCode || '—'}</td>
          : <EditableCell className={tableCellClass('text')} display={row.unitCode}><FormField label={`指标${index + 1}单位`}><input disabled={disabled}
            value={row.unitCode || ''} onChange={(e) => update(index, { unitCode: e.target.value || undefined })} /></FormField></EditableCell>}
        {template ? <td className={tableCellClass('numeric')}>{row.referenceRangeLow == null && row.referenceRangeHigh == null ? '待规则匹配'
          : `${row.referenceRangeLow ?? '—'} ～ ${row.referenceRangeHigh ?? '—'}`}</td>
          : <EditableCell className={tableCellClass('numeric')} display={`${row.referenceRangeLow ?? '—'} ～ ${row.referenceRangeHigh ?? '—'}`}>
            <div className="diagnostic-reference-range"><FormField label={`指标${index + 1}参考下限`}><input disabled={disabled} type="number"
              value={row.referenceRangeLow ?? ''} onChange={(e) => update(index, { referenceRangeLow: e.target.value === '' ? undefined : Number(e.target.value) })} /></FormField>
              <FormField label={`指标${index + 1}参考上限`}><input disabled={disabled} type="number" value={row.referenceRangeHigh ?? ''}
                onChange={(e) => update(index, { referenceRangeHigh: e.target.value === '' ? undefined : Number(e.target.value) })} /></FormField></div></EditableCell>}
        {template ? <td className={tableCellClass('status')}><StatusBadge tone={row.interpretationCode && row.interpretationCode !== 'N' ? 'danger' : 'neutral'}>
          {flags.find((flag) => flag.value === row.interpretationCode)?.label || '未判定'}</StatusBadge>
          <small>{diagnosticRuleStatus(row.ruleStatus) || '保存后匹配机构规则'}</small></td>
          : <EditableCell className={tableCellClass('status')} display={flags.find((flag) => flag.value === row.interpretationCode)?.label || '未判定'}>
            <Select aria-label={`指标${index + 1}标志`} disabled={disabled} placeholder="未判定" value={row.interpretationCode || ''}
              searchable={false} options={flags} onChange={(value) => update(index, { interpretationCode: (value || undefined) as Row['interpretationCode'] })} /></EditableCell>}
        {!template && <td className={tableCellClass('actions')}><Button size="sm" variant="text" disabled={disabled || rows.length === 1}
          onClick={() => onChange(rows.filter((_, i) => i !== index))}>移除指标{index + 1}</Button></td>}
      </EditableRow>)}</tbody>
    </EditableTable></div>
    {template && rows.map((row, index) => {
      const definition = template.content.indicators.find((value) => value.code === row.observationCode)
      const instruments = [...new Set(definition?.rules.map((value) => value.instrumentCode).filter((value): value is string => Boolean(value)))]
      const populations = [...new Set(definition?.rules.map((value) => value.populationCode).filter((value): value is string => Boolean(value)))]
      return instruments.length || populations.length ? <div key={row.observationCode} className="diagnostic-form-row">
        {instruments.length > 0 && <FormField label={`${row.observationName} · 仪器`}><Select disabled={disabled} value={row.instrumentCode || ''}
          options={instruments.map((value) => ({ value, label: value }))} onChange={(value) => update(index, { instrumentCode: value || undefined })} /></FormField>}
        {populations.length > 0 && <FormField label={`${row.observationName} · 生理状态`}><Select disabled={disabled} value={row.populationCode || ''}
          options={populations.map((value) => ({ value, label: value }))} onChange={(value) => update(index, { populationCode: value || undefined })} /></FormField>}
      </div> : null
    })}
  </section>
}
