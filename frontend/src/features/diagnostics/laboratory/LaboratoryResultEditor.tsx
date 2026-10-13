import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import { diagnosticRuleStatus } from '../../../shared/clinical/diagnosticResults'
import type { LocalDiagnosticObservationInput } from '../../../shared/api/diagnosticsApi'
import { Button, EditableCell, EditableRow, EditableTable, FormField, Select } from '../../../shared/ui'

type Row = LocalDiagnosticObservationInput
const flags = [{ value: 'N', label: '正常' }, { value: 'H', label: '偏高' }, { value: 'L', label: '偏低' },
  { value: 'HH', label: '危急高值' }, { value: 'LL', label: '危急低值' }, { value: 'A', label: '异常' }]
export function LaboratoryResultEditor({ rows, onChange, disabled, template }: {
  rows: Row[]; onChange: (rows: Row[]) => void; disabled: boolean; template?: DiagnosticTemplateVersion
}) {
  const update = (index: number, patch: Partial<Row>) => onChange(rows.map((row, i) => i === index
    ? { ...row, ...patch, ...(template ? { interpretationCode: undefined, referenceRangeLow: undefined, referenceRangeHigh: undefined, ruleStatus: undefined, ruleSnapshot: undefined } : {}) } : row))
  const append = () => onChange([...rows, { observationCode: '', observationName: '', valueType: 'NUMBER', observationValue: '' }])
  return <section aria-label="检验指标录入"><div className="diagnostic-editor-head"><h3>检验指标</h3>
    <Button size="sm" variant="secondary" disabled={disabled || Boolean(template)} onClick={append}>添加指标</Button></div>
    <div className="diagnostic-indicator-table"><EditableTable aria-label="检验指标" onAppendRow={disabled || template ? undefined : append}>
      <thead><tr><th>代码 / 名称</th><th>类型</th><th>比较符 / 结果</th><th>单位</th><th>参考下限</th><th>参考上限</th><th>标志</th><th>操作</th></tr></thead>
      <tbody>{rows.map((row, index) => <EditableRow key={index}>
        <EditableCell display={row.observationName}><FormField label={`指标${index + 1}代码`}>
          <input disabled={disabled || Boolean(template)} value={row.observationCode} onChange={(e) => update(index, { observationCode: e.target.value })} /></FormField>
          <FormField label={`指标${index + 1}名称`}><input disabled={disabled || Boolean(template)} value={row.observationName}
            onChange={(e) => update(index, { observationName: e.target.value })} /></FormField></EditableCell>
        <EditableCell display={row.valueType}><Select aria-label={`指标${index + 1}类型`} disabled={disabled || Boolean(template)} value={row.valueType}
          clearable={false} searchable={false} options={[{ value: 'NUMBER', label: '数值' }, { value: 'STRING', label: '文本' }, { value: 'CODE', label: '定性编码' }]}
          onChange={(value) => update(index, { valueType: value as Row['valueType'] })} /></EditableCell>
        <EditableCell display={row.observationValue}>{row.valueType === 'NUMBER' && <Select aria-label={`指标${index + 1}比较符`}
          disabled={disabled} value={row.valueComparator || 'EQ'} clearable={false} searchable={false}
          options={[{ value: 'EQ', label: '=' }, { value: 'LT', label: '<' }, { value: 'LE', label: '≤' }, { value: 'GT', label: '>' }, { value: 'GE', label: '≥' }]}
          onChange={(value) => update(index, { valueComparator: value as Row['valueComparator'] })} />}
          <FormField label={`指标${index + 1}结果`}>{template && row.valueType === 'CODE'
          ? <Select aria-label={`指标${index + 1}结果`} disabled={disabled} value={row.observationValue || ''}
              options={(template.content.indicators.find((value) => value.code === row.observationCode)?.allowedCodes || []).map((value) => ({ value, label: value }))}
              onChange={(value) => update(index, { observationValue: value })} />
          : <input disabled={disabled} value={row.observationValue || ''} onChange={(e) => update(index, { observationValue: e.target.value })} />}</FormField></EditableCell>
        <EditableCell display={row.unitCode}><FormField label={`指标${index + 1}单位`}><input disabled={disabled || Boolean(template)}
          value={row.unitCode || ''} onChange={(e) => update(index, { unitCode: e.target.value || undefined })} /></FormField></EditableCell>
        <EditableCell display={row.referenceRangeLow}><FormField label={`指标${index + 1}参考下限`}><input disabled={disabled || Boolean(template)} type="number"
          value={row.referenceRangeLow ?? ''} onChange={(e) => update(index, { referenceRangeLow: e.target.value === '' ? undefined : Number(e.target.value) })} /></FormField></EditableCell>
        <EditableCell display={row.referenceRangeHigh}><FormField label={`指标${index + 1}参考上限`}><input disabled={disabled || Boolean(template)} type="number"
          value={row.referenceRangeHigh ?? ''} onChange={(e) => update(index, { referenceRangeHigh: e.target.value === '' ? undefined : Number(e.target.value) })} /></FormField></EditableCell>
        <EditableCell display={flags.find((flag) => flag.value === row.interpretationCode)?.label || '未判定'}>
          <Select aria-label={`指标${index + 1}标志`} disabled={disabled || Boolean(template)} placeholder="未判定" value={row.interpretationCode || ''}
            searchable={false} options={flags} onChange={(value) => update(index, { interpretationCode: (value || undefined) as Row['interpretationCode'] })} />{template && <small>{diagnosticRuleStatus(row.ruleStatus) || '保存后由机构规则判定'}</small>}</EditableCell>
        <td><Button size="sm" variant="danger" disabled={disabled || Boolean(template) || rows.length === 1} onClick={() => onChange(rows.filter((_, i) => i !== index))}>移除指标{index + 1}</Button></td>
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
