import { useMutation, useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import type {
  InsuranceProbeRequest, InsuranceProbeStepCode, InsuranceProbeStepResult,
} from '../../shared/api/billingApi'
import { probeStatusTones } from '../../shared/presentation/insuranceOnboarding'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, DataTable, FormField, LoadingState, Select, StatusBadge, Switch } from '../../shared/ui'

type LineDraft = { itemCode: string; insuranceItemCode: string; itemName: string; quantity: string; unitPrice: string }

const STEPS: { code: InsuranceProbeStepCode; label: string; copy: string }[] = [
  { code: 'SIGN_IN', label: 'A 网关连通与签到', copy: '发送 9001 签到，验证地址、请求头、经办人与签到终端登记资料。' },
  { code: 'PERSON', label: 'B 人员鉴权', copy: '用平台提供的测试人员发送 1101。凭证只在服务端内存中使用，不保存、不回显。' },
  { code: 'PRE_SETTLE', label: 'C 预结算全链路', copy: '依次 2201 就诊登记、2203A 诊断上传、2204 费用上传、2206 预结算，并校验资金分摊守恒。不产生正式结算。' },
  { code: 'SETTLE', label: 'D 结算与自动撤销', copy: '发送 2207 正式结算，成功后立即 2208 撤销。仅限平台测试人员，默认关闭。' },
]
const certTypeOptions = [{ value: '01', label: '居民身份证' }, { value: '02', label: '医保电子凭证' }, { value: '06', label: '社保卡' }]
const emptyLine = (): LineDraft => ({ itemCode: '', insuranceItemCode: '', itemName: '', quantity: '1', unitPrice: '' })

export function InsuranceProbePanel({ api }: { api: RhnApi }) {
  const capability = useQuery({ queryKey: ['insurance-probe-capability'], queryFn: () => api.billing.insuranceProbeCapability(),
    gcTime: 0, retry: false, refetchOnWindowFocus: false })
  const [results, setResults] = useState<Partial<Record<InsuranceProbeStepCode, InsuranceProbeStepResult>>>({})
  const [running, setRunning] = useState<InsuranceProbeStepCode>()
  const [failure, setFailure] = useState<string>()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [certType, setCertType] = useState('01')
  const [certNo, setCertNo] = useState('')
  const [personName, setPersonName] = useState('')
  const [departmentCode, setDepartmentCode] = useState('')
  const [practitionerCode, setPractitionerCode] = useState('')
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [diagnosisName, setDiagnosisName] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [settleConfirmed, setSettleConfirmed] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [inputError, setInputError] = useState<string>()

  const mutation = useMutation({ mutationFn: ({ step, body }: { step: InsuranceProbeStepCode; body: InsuranceProbeRequest }) =>
    api.billing.runInsuranceProbe(step, body) })
  const info = capability.data
  const available = info?.available === true
  const busy = running !== undefined

  const buildBody = (step: InsuranceProbeStepCode): InsuranceProbeRequest | string => {
    if (step === 'PERSON') {
      return certNo.trim() ? { person: { certType, certNo: certNo.trim(), personName: personName.trim() || undefined } } : '请填写证件号码或电子凭证 token'
    }
    if (step === 'PRE_SETTLE') {
      const parsed = lines.map(line => ({ ...line, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }))
      if (!departmentCode.trim() || !diagnosisCode.trim() || !diagnosisName.trim()) return '请填写科室编码、主诊断编码与名称'
      if (parsed.some(line => !line.itemCode.trim() || !line.insuranceItemCode.trim() || !line.itemName.trim()
        || !(line.quantity > 0) || !(line.unitPrice > 0))) return '费用行需填写项目编码、医保目录编码、名称，数量与单价须大于零'
      return { preSettle: { departmentCode: departmentCode.trim(), practitionerCode: practitionerCode.trim() || undefined,
        diagnosisCode: diagnosisCode.trim(), diagnosisName: diagnosisName.trim(),
        lines: parsed.map(line => ({ itemCode: line.itemCode.trim(), insuranceItemCode: line.insuranceItemCode.trim(),
          itemName: line.itemName.trim(), quantity: line.quantity, unitPrice: line.unitPrice })) } }
    }
    if (step === 'SETTLE') return { settle: { confirmed: settleConfirmed, confirmation: confirmation.trim() } }
    return {}
  }

  const runStep = async (step: InsuranceProbeStepCode): Promise<InsuranceProbeStepResult | undefined> => {
    const body = buildBody(step)
    if (typeof body === 'string') { setInputError(body); return undefined }
    setInputError(undefined); setFailure(undefined); setRunning(step)
    try {
      const result = await mutation.mutateAsync({ step, body })
      setResults(previous => ({ ...previous, [step]: result }))
      return result
    } catch (error) {
      setFailure(errorMessage(error))
      return undefined
    } finally { setRunning(undefined) }
  }

  const runAll = async () => {
    for (const step of ['SIGN_IN', 'PERSON', 'PRE_SETTLE'] as const) {
      const result = await runStep(step)
      if (result?.status !== 'PASS' && result?.status !== 'SKIPPED') return
    }
  }

  const exportResults = () => {
    const ordered = STEPS.map(step => results[step.code]).filter((value): value is InsuranceProbeStepResult => value !== undefined)
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), mode: info?.modeText, note: '报文均已脱敏，不含凭证', steps: ordered }, null, 2)],
      { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'insurance-probe-result.json'
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
  }

  const setLine = (index: number, patch: Partial<LineDraft>) => setLines(previous => previous.map((line, i) => i === index ? { ...line, ...patch } : line))
  const toggle = (key: string) => setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const settlementNo = results.PRE_SETTLE?.status === 'PASS' ? results.PRE_SETTLE.facts.find(fact => fact.label === '探测单号')?.value : undefined
  const anyResult = Object.keys(results).length > 0

  if (capability.isPending) return <LoadingState label="正在检查探测条件…" />
  if (capability.isError) return <Alert duration={null}>{errorMessage(capability.error)}
    <Button variant="secondary" onClick={() => { void capability.refetch() }}>重新检查</Button></Alert>

  return <div className="insurance-probe">
    {!available && <Alert tone="warning" placement="inline">{info?.reason ?? '当前无法探测'}</Alert>}
    {failure && <Alert duration={null}>{failure}</Alert>}
    {inputError && <Alert tone="warning" duration={null}>{inputError}</Alert>}
    <div className="insurance-probe__toolbar">
      <span>{`当前医保客户端：${info?.modeText ?? '—'}。探测会向医保网关发出真实报文，请只使用平台提供的测试人员。`}</span>
      <div className="insurance-probe__toolbar-actions">
        <Button disabled={!available || busy} onClick={() => { void runAll() }}>{busy ? '正在探测…' : '依次执行 A～C'}</Button>
        <Button variant="secondary" disabled={!anyResult} onClick={exportResults}>导出探测结果</Button>
      </div>
    </div>
    {STEPS.map(step => {
      const result = results[step.code]
      const locked = step.code === 'SETTLE' && !info?.settlementAllowed
      const canRun = available && !busy && !locked
        && (step.code !== 'SETTLE' || (settleConfirmed && confirmation.trim().length > 0))
      return <section key={step.code} className="insurance-probe__step" aria-label={step.label}>
        <header className="insurance-probe__step-head">
          <h3>{step.label}</h3>
          {result && <StatusBadge tone={probeStatusTones[result.status]}>{result.statusText}</StatusBadge>}
          <Button variant={result ? 'secondary' : 'primary'} size="sm" disabled={!canRun}
            onClick={() => { void runStep(step.code) }}>{running === step.code ? '执行中…' : result ? '重试' : '执行'}</Button>
        </header>
        <p className="insurance-probe__copy">{step.copy}</p>
        {step.code === 'PERSON' && <div className="insurance-probe__form">
          <FormField label="凭证类型"><Select value={certType} options={certTypeOptions} onChange={setCertType} /></FormField>
          <FormField label="证件号码／电子凭证 token" required><input type="password" autoComplete="off" value={certNo}
            onChange={event => setCertNo(event.target.value)} /></FormField>
          <FormField label="姓名（可选）"><input autoComplete="off" value={personName} onChange={event => setPersonName(event.target.value)} /></FormField>
        </div>}
        {step.code === 'PRE_SETTLE' && <>
          <div className="insurance-probe__form">
            <FormField label="科室编码" required><input value={departmentCode} onChange={event => setDepartmentCode(event.target.value)} /></FormField>
            <FormField label="经办医师编码（默认使用 default-operator）"><input value={practitionerCode}
              onChange={event => setPractitionerCode(event.target.value)} /></FormField>
            <FormField label="主诊断编码" required><input value={diagnosisCode} onChange={event => setDiagnosisCode(event.target.value)} /></FormField>
            <FormField label="主诊断名称" required><input value={diagnosisName} onChange={event => setDiagnosisName(event.target.value)} /></FormField>
          </div>
          <DataTable aria-label="测试费用行" compact>
            <thead><tr><th>项目编码</th><th>医保目录编码</th><th>项目名称</th><th>数量</th><th>单价</th><th /></tr></thead>
            <tbody>{lines.map((line, index) => <tr key={index}>
              <td><input aria-label={`项目编码 ${index + 1}`} value={line.itemCode} onChange={event => setLine(index, { itemCode: event.target.value })} /></td>
              <td><input aria-label={`医保目录编码 ${index + 1}`} value={line.insuranceItemCode} onChange={event => setLine(index, { insuranceItemCode: event.target.value })} /></td>
              <td><input aria-label={`项目名称 ${index + 1}`} value={line.itemName} onChange={event => setLine(index, { itemName: event.target.value })} /></td>
              <td><input aria-label={`数量 ${index + 1}`} inputMode="decimal" value={line.quantity} onChange={event => setLine(index, { quantity: event.target.value })} /></td>
              <td><input aria-label={`单价 ${index + 1}`} inputMode="decimal" value={line.unitPrice} onChange={event => setLine(index, { unitPrice: event.target.value })} /></td>
              <td><Button variant="text" size="sm" disabled={lines.length === 1}
                onClick={() => setLines(previous => previous.filter((_, i) => i !== index))}>删除</Button></td>
            </tr>)}</tbody>
          </DataTable>
          <div><Button variant="secondary" size="sm" disabled={lines.length >= 20} onClick={() => setLines(previous => [...previous, emptyLine()])}>添加费用行</Button></div>
        </>}
        {step.code === 'SETTLE' && (locked
          ? <Alert tone="info" placement="inline">{info?.settlementReason ?? '结算探测不可用'}</Alert>
          : <div className="insurance-probe__form">
            <Switch checked={settleConfirmed} onChange={setSettleConfirmed} label="我确认向医保平台发起真实结算，并随后自动撤销" />
            <FormField label={settlementNo ? `输入预结算探测单号 ${settlementNo} 以确认` : '请先完成预结算全链路'}>
              <input value={confirmation} disabled={!settlementNo} onChange={event => setConfirmation(event.target.value)} /></FormField>
          </div>)}
        {result && <>
          <p className="insurance-probe__summary">{result.summary}</p>
          {result.hint && <Alert tone="warning" placement="inline">{result.hint}</Alert>}
          {result.facts.length > 0 && <dl className="insurance-probe__facts">
            {result.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
          </dl>}
          {result.exchanges.length > 0 && <DataTable aria-label={`${step.label}报文往返`} compact>
            <thead><tr><th>交易</th><th>结果</th><th>耗时</th><th>HTTP</th><th>infcode</th><th>说明</th><th /></tr></thead>
            <tbody>{result.exchanges.map((exchange, index) => {
              const key = `${step.code}:${index}`
              return <Fragment key={key}>
                <tr>
                  <td>{`${exchange.infno} ${exchange.infnoText}`}</td>
                  <td><StatusBadge tone={exchange.outcome === 'OK' ? 'success' : 'danger'}>{exchange.outcomeText}</StatusBadge></td>
                  <td>{`${exchange.durationMs} ms`}</td><td>{exchange.httpStatus ?? '—'}</td><td>{exchange.infcode ?? '—'}</td>
                  <td>{exchange.errMsg ?? exchange.hint ?? '—'}</td>
                  <td><Button variant="text" size="sm" aria-expanded={expanded.has(key)} onClick={() => toggle(key)}>
                    {expanded.has(key) ? '收起报文' : '查看报文'}</Button></td>
                </tr>
                {expanded.has(key) && <tr><td colSpan={7}><div className="insurance-probe__messages">
                  <div><strong>请求（已脱敏）</strong><pre>{exchange.request}</pre></div>
                  <div><strong>回执（已脱敏）</strong><pre>{exchange.response}</pre></div>
                </div></td></tr>}
              </Fragment>
            })}</tbody>
          </DataTable>}
        </>}
      </section>
    })}
  </div>
}
