import { useState } from 'react'
import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import type { LocalDiagnosticReportInput } from '../../../shared/api/diagnosticsApi'
import { Alert, Button, Dialog, Select } from '../../../shared/ui'

export function DiagnosticTemplateSelection({ current, selected, input, disabled, onChange }: {
  current: DiagnosticTemplateVersion | null; selected?: DiagnosticTemplateVersion; input: LocalDiagnosticReportInput
  disabled: boolean; onChange: (patch: Partial<LocalDiagnosticReportInput>) => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [phraseCode, setPhrase] = useState('')
  const apply = () => {
    if (!current) return
    onChange({ templateVersionId: current.id, templateSnapshot: JSON.stringify(current),
      observations: current.content.indicators.map((indicator) => ({ observationCode: indicator.code, observationName: indicator.name,
        valueType: indicator.valueType, observationValue: '', unitCode: indicator.unitCode, valueComparator: indicator.valueType === 'NUMBER' ? 'EQ' : undefined })) })
    setConfirm(false)
  }
  const requestApply = () => input.observations?.some((item) => item.observationValue?.trim()) ? setConfirm(true) : apply()
  if (!current && selected?.serviceType !== 'EXAMINATION') {
    return null
  }
  return <section aria-label="报告模板选择">
    <div className="diagnostic-editor-head"><h3>{selected ? `机构模板 V${selected.version}` : '报告模板'}</h3>
      {current && <Button size="sm" variant="secondary" disabled={disabled || selected?.id === current.id} onClick={requestApply}>
        {selected ? `改用当前模板 V${current.version}` : `载入机构模板 V${current.version}`}</Button>}</div>
    {selected && <p>生效：{selected.effectiveFrom} · 依据：{selected.publicationBasis}</p>}
    {current && !selected && (
      <Alert tone="info" placement="inline">
        请载入机构模板后填写；已有模板的项目不能绕过机构规则签发。
      </Alert>
    )}
    {selected?.serviceType === 'EXAMINATION' && selected.content.phrases.length > 0 && <div className="diagnostic-form-row">
      <Select aria-label="选择检查词条" disabled={disabled} value={phraseCode} options={selected.content.phrases.map((phrase) => ({ value: phrase.code, label: phrase.title }))}
        onChange={setPhrase} /><Button variant="secondary" disabled={disabled || !phraseCode} onClick={() => {
          const phrase = selected.content.phrases.find((value) => value.code === phraseCode)
          if (phrase) onChange({ findings: [input.findings, phrase.findings].filter(Boolean).join('\n'),
            conclusion: [input.conclusion, phrase.conclusion].filter(Boolean).join('\n') })
        }}>插入检查词条</Button></div>}
    {confirm && <Dialog title="载入新模板并清空现有指标结果？" onClose={() => setConfirm(false)}
      footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>保留当前内容</Button><Button onClick={apply}>载入并清空指标结果</Button></>}>
      <p>当前已填写指标结果将被替换；报告所见、结论和已保存的历史报告保留。</p></Dialog>}
  </section>
}
