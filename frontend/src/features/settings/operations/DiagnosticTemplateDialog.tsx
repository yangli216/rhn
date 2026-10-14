import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DiagnosticIndicatorDefinition, DiagnosticReferenceRule, DiagnosticTemplateContent, DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import type { RhnApi, ServiceCatalogItem } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, Dialog, FormField, LoadingState, Select } from '../../../shared/ui'

const list = (value: string) => value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
const number = (value: string) => value === '' ? undefined : Number(value)
export function DiagnosticTemplateDialog({ api, service, organizationId, onClose }: {
  api: RhnApi; service: ServiceCatalogItem; organizationId: string; onClose: () => void
}) {
  const client = useQueryClient()
  const lab = service.sdServiceType === 'LABORATORY'
  const [content, setContent] = useState<DiagnosticTemplateContent>({ indicators: [], phrases: [], requiredChecks: [], minimumImages: 0 })
  const [effectiveFrom, setDate] = useState('')
  const [publicationBasis, setBasis] = useState('')
  const [selected, setSelected] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const history = useQuery({ queryKey: ['diagnostic-template-history', organizationId, service.id], queryFn: async () => {
    const result = await api.masterData.diagnosticTemplates(service.id)
    if (!Array.isArray(result) || result.some((value) => value.organizationId !== organizationId || value.catalogItemId !== service.id))
      throw new Error('报告模板与当前机构或项目不一致，请重新读取。')
    return result
  } })
  const units = useQuery({ queryKey: ['master-data-operational-units'], queryFn: () => api.masterData.units() })
  const latest = history.data?.[0]
  useEffect(() => {
    if (!history.isSuccess || dirty) return
    const value = history.data[0]
    if (value) { setContent(structuredClone(value.content)); setDate(value.effectiveFrom); setBasis(value.publicationBasis) }
  }, [history.data, history.isSuccess, dirty])
  const change = (next: DiagnosticTemplateContent) => { setContent(next); setDirty(true); setFeedback('') }
  const save = useMutation({ mutationFn: () => api.masterData.publishDiagnosticTemplate(service.id, {
    expectedVersion: latest?.version || 0, effectiveFrom, publicationBasis,
    content: { ...content, requiredChecks: content.requiredChecks.map((value) => value.trim()).filter(Boolean),
      indicators: content.indicators.map((value) => ({ ...value, allowedCodes: value.allowedCodes.map((code) => code.trim()).filter(Boolean) })) },
  }), onSuccess: async (saved: DiagnosticTemplateVersion) => {
    setDirty(false); setContent(structuredClone(saved.content)); setFeedback(`已发布 V${saved.version}，已有报告和草稿保留原版本。`)
    await client.invalidateQueries({ queryKey: ['diagnostic-template-history', organizationId, service.id] })
    await client.invalidateQueries({ queryKey: ['diagnostic-template'] })
  } })
  const busy = save.isPending || history.isFetching || units.isFetching
  const updateIndicator = (patch: Partial<DiagnosticIndicatorDefinition>) => change({ ...content,
    indicators: content.indicators.map((value, index) => index === selected ? { ...value, ...patch } : value) })
  const indicator = content.indicators[selected]
  const close = () => dirty ? setConfirmClose(true) : onClose()
  return <><Dialog title={`${service.name} · 报告模板与规则`} size="xwide" onClose={close}
    description="维护后直接发布新版本；参考区间和危急阈值须有机构确认依据，空白不表示正常。"
    footer={<><Button variant="secondary" disabled={save.isPending} onClick={close}>关闭</Button>
      <Button busy={save.isPending} disabled={busy || history.isError || units.isError || !effectiveFrom || !publicationBasis.trim()}
        onClick={() => save.mutate()}>发布新版本</Button></>}>
    {(history.error || units.error || save.error) && <Alert>{errorMessage(history.error || units.error || save.error)}</Alert>}
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {history.isPending ? <LoadingState label="正在读取已发布模板…" /> : history.isError ? <Button onClick={() => void history.refetch()}>重新读取模板</Button> : <>
      <p>{latest ? `当前已发布 V${latest.version} · ${latest.effectiveFrom} 生效` : '尚未发布机构模板；不自动载入示例阈值。'}</p>
      <div className="master-data-form-grid master-data-form-grid--2">
        <FormField label="生效日期" required><input type="date" disabled={busy} value={effectiveFrom} onChange={(e) => { setDate(e.target.value); setDirty(true) }} /></FormField>
        <FormField label="机构确认与发布依据" required><input disabled={busy} value={publicationBasis} onChange={(e) => { setBasis(e.target.value); setDirty(true) }} /></FormField>
      </div>
      {lab ? <div className="master-data-form-grid master-data-form-grid--2"><section>
        <div className="row-actions"><Button size="sm" variant="secondary" disabled={busy} onClick={() => {
          setSelected(content.indicators.length); change({ ...content, indicators: [...content.indicators,
            { code: '', name: '', valueType: 'NUMBER', required: true, allowedCodes: [], rules: [] }] })
        }}>添加模板指标</Button></div>
        <DataTable aria-label="模板指标列表"><thead><tr><th>代码 / 名称</th><th>类型</th><th>操作</th></tr></thead>
          <tbody>{content.indicators.map((value, index) => <tr key={index}><td>{value.code || '待填写代码'} · {value.name || '待填写名称'}</td>
            <td>{value.valueType}</td><td><Button size="sm" variant="text" onClick={() => setSelected(index)}>编辑指标{index + 1}</Button></td></tr>)}</tbody></DataTable>
      </section><section>{indicator && <>
        <IndicatorFields value={indicator} units={units.data?.filter((unit) => unit.status === 'ACTIVE').map((unit) => ({ value: unit.code, label: unit.name })) || []}
          disabled={busy} onChange={updateIndicator} />
        <div className="row-actions"><Button size="sm" variant="secondary" disabled={busy} onClick={() => updateIndicator({ rules: [...indicator.rules,
          { code: `RULE_${indicator.rules.length + 1}`, criticalCodes: [] }] })}>添加参考规则</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => { change({ ...content, indicators: content.indicators.filter((_, index) => index !== selected) }); setSelected(0) }}>移除当前指标</Button></div>
        {indicator.rules.map((rule, index) => <RuleFields key={index} value={rule} index={index} disabled={busy} coded={indicator.valueType === 'CODE'} numeric={indicator.valueType === 'NUMBER'}
          onChange={(patch) => updateIndicator({ rules: indicator.rules.map((value, i) => i === index ? { ...value, ...patch } : value) })}
          onRemove={() => updateIndicator({ rules: indicator.rules.filter((_, i) => i !== index) })} />)}
      </>}</section></div> : <>
        <div className="master-data-form-grid master-data-form-grid--2">
          <FormField label="必须完成的检查核对项目（每行一项）"><textarea rows={4} disabled={busy} value={content.requiredChecks.join('\n')}
            onChange={(e) => change({ ...content, requiredChecks: e.target.value.split('\n') })} /></FormField>
          <FormField label="正式报告最低图像数量"><input type="number" min={0} max={4} disabled={busy} value={content.minimumImages}
            onChange={(e) => change({ ...content, minimumImages: Number(e.target.value) })} /></FormField>
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => change({ ...content,
          phrases: [...content.phrases, { code: '', title: '', findings: '', conclusion: '' }] })}>添加检查词条</Button>
        {content.phrases.map((phrase, index) => <section key={index}><h3>词条{index + 1}</h3><div className="master-data-form-grid master-data-form-grid--2">
          {(['code', 'title', 'findings', 'conclusion'] as const).map((field) => <FormField key={field} label={{ code: '词条代码', title: '词条名称', findings: '所见词条', conclusion: '结论词条' }[field]}>
            <textarea disabled={busy} rows={field === 'code' || field === 'title' ? 1 : 3} value={phrase[field]}
              onChange={(e) => change({ ...content, phrases: content.phrases.map((value, i) => i === index ? { ...value, [field]: e.target.value } : value) })} /></FormField>)}
        </div><Button size="sm" variant="danger" disabled={busy} onClick={() => change({ ...content, phrases: content.phrases.filter((_, i) => i !== index) })}>移除词条{index + 1}</Button></section>)}
        <p>词条仅供显式插入。使用 {'{{待填写项目}}'} 标记待补内容；含占位项的报告不能签发。</p>
      </>}
    </>}
  </Dialog>{confirmClose && <Dialog title="放弃未发布的模板修改？" onClose={() => setConfirmClose(false)}
    footer={<><Button variant="secondary" onClick={() => setConfirmClose(false)}>继续编辑</Button><Button variant="danger" onClick={onClose}>放弃并关闭</Button></>}>
    <p>这些修改尚未发布，关闭后将丢失。已发布版本会保留。</p></Dialog>}</>
}
function IndicatorFields({ value, units, disabled, onChange }: { value: DiagnosticIndicatorDefinition; units: { value: string; label: string }[];
  disabled: boolean; onChange: (patch: Partial<DiagnosticIndicatorDefinition>) => void }) {
  return <div className="master-data-form-grid master-data-form-grid--2">
    {(['code', 'name', 'methodCode', 'specimenType'] as const).map((field) => <FormField key={field} label={{ code: '指标代码', name: '指标名称', methodCode: '方法代码', specimenType: '适用标本类型代码' }[field]}>
      <input disabled={disabled} value={value[field] || ''} onChange={(e) => onChange({ [field]: e.target.value || undefined })} /></FormField>)}
    <FormField label="结果类型"><Select disabled={disabled} value={value.valueType} clearable={false} searchable={false}
      options={[{ value: 'NUMBER', label: '数值' }, { value: 'CODE', label: '定性编码' }, { value: 'STRING', label: '文本' }]}
      onChange={(type) => onChange({ valueType: type as DiagnosticIndicatorDefinition['valueType'], allowedCodes: [], rules: [] })} /></FormField>
    <FormField label="单位"><Select disabled={disabled} value={value.unitCode || ''} options={units} onChange={(unitCode) => onChange({ unitCode: unitCode || undefined })} /></FormField>
    <FormField label="允许小数位"><input type="number" min={0} max={8} disabled={disabled || value.valueType !== 'NUMBER'} value={value.precision ?? ''}
      onChange={(e) => onChange({ precision: number(e.target.value) })} /></FormField>
    <FormField label="是否必填"><Select disabled={disabled} value={value.required ? 'YES' : 'NO'} clearable={false} searchable={false}
      options={[{ value: 'YES', label: '必填' }, { value: 'NO', label: '可选' }]} onChange={(result) => onChange({ required: result === 'YES' })} /></FormField>
    {value.valueType === 'CODE' && <FormField label="允许定性编码（逗号分隔）"><input disabled={disabled} value={value.allowedCodes.join(',')}
      onChange={(e) => onChange({ allowedCodes: e.target.value.split(',') })} /></FormField>}
  </div>
}
function RuleFields({ value, index, disabled, coded, numeric, onChange, onRemove }: { value: DiagnosticReferenceRule; index: number; disabled: boolean;
  coded: boolean; numeric: boolean; onChange: (patch: Partial<DiagnosticReferenceRule>) => void; onRemove: () => void }) {
  return <section><h3>参考规则{index + 1}</h3><div className="master-data-form-grid master-data-form-grid--2">
    <FormField label="规则代码"><input disabled={disabled} value={value.code} onChange={(e) => onChange({ code: e.target.value })} /></FormField>
    <FormField label="适用性别"><Select disabled={disabled} value={value.gender || ''} searchable={false}
      options={[{ value: '1', label: '男' }, { value: '2', label: '女' }]} placeholder="不限定性别"
      onChange={(gender) => onChange({ gender: gender ? gender as '1' | '2' : undefined })} /></FormField>
    {(['minimumAgeDays', 'maximumAgeDays', 'referenceLow', 'referenceHigh', 'criticalLow', 'criticalHigh'] as const).map((field) => <FormField key={field}
      label={{ minimumAgeDays: '最小年龄（日，含）', maximumAgeDays: '最大年龄（日，不含）', referenceLow: '参考下限（含）', referenceHigh: '参考上限（含）', criticalLow: '危急低阈值（小于）', criticalHigh: '危急高阈值（大于）' }[field]}>
      <input type="number" disabled={disabled || !numeric && !field.endsWith('Days')} value={value[field] ?? ''}
        onChange={(e) => onChange({ [field]: number(e.target.value) })} /></FormField>)}
    {(['instrumentCode', 'populationCode'] as const).map((field) => <FormField key={field} label={field === 'instrumentCode' ? '适用仪器代码' : '适用生理状态代码'}>
      <input disabled={disabled} value={value[field] || ''} onChange={(e) => onChange({ [field]: e.target.value || undefined })} /></FormField>)}
    {coded && <FormField label="危急定性编码（逗号分隔）"><input disabled={disabled} value={value.criticalCodes.join(',')}
      onChange={(e) => onChange({ criticalCodes: list(e.target.value) })} /></FormField>}
  </div><Button size="sm" variant="danger" disabled={disabled} onClick={onRemove}>移除规则{index + 1}</Button></section>
}
