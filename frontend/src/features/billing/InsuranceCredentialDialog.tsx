import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ChsPersonInfoResponse } from '../../shared/api/billingApi'
import type { Resident } from '../../shared/model'
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
export function InsuranceCredentialDialog({ api, residentId = '', patientName, busy = false, error, onVerified, onCancel,
  lookupMode = false, initialCertType = '02', initialCertNo = '', onResident }: {
  api: RhnApi
  residentId?: string
  patientName?: string
  /** 验证成功后外部正在继续试算。 */
  busy?: boolean
  /** 继续试算时仍出现的凭证问题。 */
  error?: string
  onVerified?: () => void
  onCancel: () => void
  /** 调入患者模式：读证后按参保人证件号/姓名定位患者档案，不需要 residentId，也不做试算鉴权。 */
  lookupMode?: boolean
  initialCertType?: string
  initialCertNo?: string
  /** 调入患者模式：找到档案后回调；返回错误文案时留在弹窗内展示，返回空则由调用方关闭弹窗。 */
  onResident?: (resident: Resident, person?: ChsPersonInfoResponse) => string | undefined
}) {
  const [certType, setCertType] = useState(initialCertType)
  const [certNo, setCertNo] = useState(initialCertNo)
  const [lookupError, setLookupError] = useState('')
  const [person, setPerson] = useState<ChsPersonInfoResponse | null>(null)
  const simulator = useInsuranceSimulator(api)

  const accept = (value: ChsPersonInfoResponse) => {
    setPerson(value)
    if (!value.status || value.status === 'NORMAL') onVerified?.()
  }
  const deliverResident = (resident: Resident, value?: ChsPersonInfoResponse) => {
    setLookupError(onResident?.(resident, value) ?? '')
  }
  const locateResident = async (value: ChsPersonInfoResponse) => {
    const certno = value.certno?.trim()
    const name = value.psnName?.trim()
    const pick = (candidates: Resident[]) => {
      if (name) return candidates.find((item) => item.fullName === name) ?? (certno && candidates.length === 1 ? candidates[0] : undefined)
      return candidates.length === 1 ? candidates[0] : undefined
    }
    let resident = certno ? pick(await api.residents.search(certno)) : undefined
    if (!resident && name) resident = (await api.residents.search(name)).find((item) => item.fullName === name)
    if (!resident) throw new Error('未找到对应患者档案')
    return resident
  }
  const manual = useMutation({
    mutationFn: () => api.billing.queryInsurancePerson({ psnCertType: certType, certno: certNo.trim(), psnName: undefined }),
    onMutate: () => setPerson(null),
    onSuccess: (value) => { setCertNo(''); accept(value) },
  })
  const lookup = useMutation({
    mutationFn: async () => {
      const value = await api.billing.queryInsurancePerson({ psnCertType: certType, certno: certNo.trim(), psnName: undefined })
      return { value, resident: await locateResident(value) }
    },
    onMutate: () => { setPerson(null); setLookupError('') },
    onSuccess: ({ value, resident }) => { setCertNo(''); deliverResident(resident, value) },
  })
  const byResident = useMutation({
    mutationFn: () => api.billing.authenticateInsuranceByResident(residentId),
    onMutate: () => setPerson(null),
    onSuccess: accept,
  })
  const pending = manual.isPending || byResident.isPending || lookup.isPending || busy
  const abnormal = Boolean(person?.status && person.status !== 'NORMAL')
  const readError = lookupMode ? lookup.error : manual.error ?? byResident.error

  const current = CERT_TYPES.find((item) => item.value === certType) ?? CERT_TYPES[0]
  const read = () => { if (!pending && certNo.trim()) (lookupMode ? lookup : manual).mutate() }

  return <Dialog title={lookupMode ? '读取凭证调入患者' : '读取医保凭证'} size="default" className="insurance-credential-modal"
    onClose={() => { if (!pending) onCancel() }}
    footer={<Button variant="secondary" onClick={onCancel} disabled={pending}>取消</Button>}>
    <div className="insurance-credential-dialog">
      <div className="insurance-credential-dialog__intro">
        <p>{lookupMode ? '请读取参保人的医保介质以调入待收费患者' : '请读取参保人的医保介质以继续试算'}</p>
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
        <Button busy={manual.isPending || lookup.isPending} disabled={pending || !certNo.trim()} onClick={read}>读取</Button>
      </div>
      {simulator.data?.enabled && (lookupMode
        ? <InsuranceMediaSimulator api={api} variant="card" disabled={pending} onRead={(value) => deliverResident(value.resident, value.person)} />
        : <InsuranceMediaSimulator api={api} variant="card" disabled={pending} onCredentialRead={accept} />)}
      {!lookupMode && <div className="insurance-credential-dialog__alt">
        <Button variant="text" busy={byResident.isPending} disabled={pending} onClick={() => byResident.mutate()}>按档案身份证鉴权</Button>
        <small>医保个人编号需与患者保障信息一致</small>
      </div>}
      {abnormal && person && <div className="insurance-credential-result insurance-credential-result--warning" role="status">
        <Icon name="warning" aria-hidden="true" />
        <span>参保人：{person.psnName}，险种：{person.insutypeName}，状态：{person.status}</span>
        <strong>参保状态异常，不能办理医保结算</strong>
      </div>}
      {readError && <Alert tone="error">{errorMessage(readError)}</Alert>}
      {lookupError && <Alert tone="error">{lookupError}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  </Dialog>
}
