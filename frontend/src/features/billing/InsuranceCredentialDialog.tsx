import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ChsPersonInfoResponse } from '../../shared/api/billingApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, Icon } from '../../shared/ui'
import { InsuranceMediaSimulator, useInsuranceSimulator } from '../outpatient/InsuranceMediaSimulator'
import './insurance-credential-dialog.css'

const CERT_TYPES = [
  { value: '02', label: '医保电子凭证', hint: '扫码或输入凭证码', icon: 'credential' as const, placeholder: '扫码或输入电子凭证码' },
  { value: '06', label: '社保卡', hint: '读取或输入卡号', icon: 'card' as const, placeholder: '读取或输入社保卡号' },
  { value: '01', label: '居民身份证', hint: '输入身份证号', icon: 'user' as const, placeholder: '输入身份证号' },
]

/**
 * 医保参保人鉴权凭证（1101 读证结果）仅短时保存在后端；失效后在此重新读取，成功且参保正常后回调 onVerified 继续试算。
 * 证件号只经请求体提交，不写入 URL 或日志。
 */
export function InsuranceCredentialDialog({ api, residentId, patientName, busy = false, error, onVerified, onCancel }: {
  api: RhnApi
  residentId: string
  patientName?: string
  /** 验证成功后外部正在继续试算。 */
  busy?: boolean
  /** 继续试算时仍出现的凭证问题。 */
  error?: string
  onVerified: () => void
  onCancel: () => void
}) {
  const [certType, setCertType] = useState('02')
  const [certNo, setCertNo] = useState('')
  const [person, setPerson] = useState<ChsPersonInfoResponse | null>(null)
  const simulator = useInsuranceSimulator(api)

  const accept = (value: ChsPersonInfoResponse) => {
    setPerson(value)
    if (!value.status || value.status === 'NORMAL') onVerified()
  }
  const manual = useMutation({
    mutationFn: () => api.billing.queryInsurancePerson({ psnCertType: certType, certno: certNo.trim(), psnName: undefined }),
    onMutate: () => setPerson(null),
    onSuccess: (value) => { setCertNo(''); accept(value) },
  })
  const byResident = useMutation({
    mutationFn: () => api.billing.authenticateInsuranceByResident(residentId),
    onMutate: () => setPerson(null),
    onSuccess: accept,
  })
  const pending = manual.isPending || byResident.isPending || busy
  const abnormal = Boolean(person?.status && person.status !== 'NORMAL')
  const readError = manual.error ?? byResident.error

  const current = CERT_TYPES.find((item) => item.value === certType) ?? CERT_TYPES[0]
  const read = () => { if (!pending && certNo.trim()) manual.mutate() }

  return <Dialog title="读取医保凭证" size="default" className="insurance-credential-modal"
    onClose={() => { if (!pending) onCancel() }}
    footer={<Button variant="secondary" onClick={onCancel} disabled={pending}>取消</Button>}>
    <div className="insurance-credential-dialog">
      <div className="insurance-credential-dialog__intro">
        <p>请读取参保人的医保介质以继续试算</p>
        {patientName && <span className="insurance-credential-dialog__patient"><Icon name="user" aria-hidden="true" />{patientName}</span>}
      </div>
      <div className="insurance-credential-dialog__media" role="group" aria-label="医保介质">
        {CERT_TYPES.map((item) =>
          <Button key={item.value} variant="secondary" className="insurance-credential-card" aria-pressed={item.value === certType}
            disabled={pending} onClick={() => setCertType(item.value)}>
            <span className="insurance-credential-card__icon"><Icon name={item.icon} aria-hidden="true" /></span>
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </Button>)}
      </div>
      <div className="insurance-credential-dialog__input">
        <Icon name={current.icon} aria-hidden="true" />
        <input value={certNo} onChange={(event) => setCertNo(event.target.value)} autoComplete="off" disabled={pending}
          aria-label="凭证号 / 卡号" placeholder={current.placeholder}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); read() } }} />
        <Button busy={manual.isPending} disabled={pending || !certNo.trim()} onClick={read}>读取</Button>
      </div>
      {simulator.data?.enabled && <InsuranceMediaSimulator api={api} variant="card" disabled={pending} onCredentialRead={accept} />}
      <div className="insurance-credential-dialog__alt">
        <Button variant="text" busy={byResident.isPending} disabled={pending} onClick={() => byResident.mutate()}>按档案身份证鉴权</Button>
        <small>医保个人编号需与患者保障信息一致</small>
      </div>
      {abnormal && person && <div className="insurance-credential-result insurance-credential-result--warning" role="status">
        <Icon name="warning" aria-hidden="true" />
        <span>参保人：{person.psnName}，险种：{person.insutypeName}，状态：{person.status}</span>
        <strong>参保状态异常，不能办理医保结算</strong>
      </div>}
      {readError && <Alert tone="error">{errorMessage(readError)}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  </Dialog>
}
