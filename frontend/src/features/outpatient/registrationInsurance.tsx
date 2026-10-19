import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ChsPersonInfoResponse, InsuranceSettlementView, RegistrationBillingIntent, Settlement } from '../../shared/api/billingApi'
import { confirmInsuranceResult } from '../../shared/billing/insuranceResult'
import type { SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, FormField, Select, StatusBadge } from '../../shared/ui'

const CERT_TYPES = [
  { value: '01', label: '居民身份证' },
  { value: '02', label: '医保电子凭证' },
  { value: '06', label: '社保卡' },
]

/** 机构／科室选择的医保挂号结算时机；仅在选择医保身份后查询。 */
export function useRegistrationInsuranceTiming(api: RhnApi, organizationId: string, departmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['registration-insurance-timing', organizationId, departmentId],
    queryFn: () => api.billing.registrationInsuranceTiming(organizationId, departmentId),
    enabled,
    staleTime: 60_000,
  })
}

/** 医保读证（1101）：鉴权凭证只保存在服务端内存并有时效，挂号结算时机为“挂号时结算”时必须先完成。 */
export function RegistrationInsuranceAuth({ api, person, onAuthenticated }: {
  api: RhnApi
  person: ChsPersonInfoResponse | null
  onAuthenticated: (value: ChsPersonInfoResponse | null) => void
}) {
  const [certType, setCertType] = useState('01')
  const [certNo, setCertNo] = useState('')
  const [name, setName] = useState('')
  const query = useMutation({
    mutationFn: () => api.billing.queryInsurancePerson({ psnCertType: certType, certno: certNo.trim(), psnName: name.trim() || undefined }),
    onSuccess: (value) => { setCertNo(''); onAuthenticated(value) },
    onError: () => onAuthenticated(null),
  })
  return <div className="registration-insurance-auth">
    {person
      ? <Alert tone="success">
        医保鉴权已完成：{person.psnName}，{person.insutypeName}，状态
        <StatusBadge tone={person.status === 'NORMAL' ? 'success' : 'warning'}>{person.status === 'NORMAL' ? '参保正常' : person.status ?? '未知'}</StatusBadge>
        {Number.isFinite(person.balc) && person.balc > 0 ? `，个人账户余额 ¥${person.balc.toFixed(2)}` : ''}。
        凭证仅短时有效，超时后需重新读取。
      </Alert>
      : <Alert tone="warning">本院挂号时即办理医保结算，请先读取医保电子凭证、证件或社保卡完成参保鉴权。</Alert>}
    <div className="ui-form-row">
      <FormField label="凭证类型"><Select aria-label="医保凭证类型" value={certType} options={CERT_TYPES}
        onChange={(value) => setCertType(value)} /></FormField>
      <FormField label={certType === '02' ? '电子凭证码' : certType === '06' ? '社会保障号' : '证件号码'}>
        <input aria-label="医保凭证号码" autoComplete="off" value={certNo} onChange={(e) => setCertNo(e.target.value)} /></FormField>
      <FormField label="姓名（身份证鉴权时核对）"><input aria-label="医保鉴权姓名" value={name} onChange={(e) => setName(e.target.value)} /></FormField>
      <Button variant="secondary" busy={query.isPending} disabled={!certNo.trim()} onClick={() => query.mutate()}>
        {person ? '重新读取' : '读取参保信息'}</Button>
    </div>
    {query.error && <Alert tone="error">{errorMessage(query.error)}</Alert>}
  </div>
}

/**
 * 挂号结算单上的医保流程：快捷预结算 → 医保结算(2207) → 个人自付部分走统一支付面板。
 * 医保资金（含个人账户）已结清结算单时，由后端建立就诊，无需再收款。
 */
export function useRegistrationInsuranceSettlement(api: RhnApi, intent: RegistrationBillingIntent | undefined,
                                                   settlement: Settlement | undefined,
                                                   pay: (command: SettlementPaymentCommand) => Promise<unknown>,
                                                   refresh: () => Promise<unknown>) {
  const [claim, setClaim] = useState<InsuranceSettlementView | null>(null)
  const preKey = useRef<string | null>(null)
  const target = useMemo(() => intent?.settlementId && intent.patientAccountId && settlement ? {
    settlementId: intent.settlementId, patientAccountId: intent.patientAccountId,
    currencyCode: settlement.currencyCode, grossAmount: settlement.netAmount,
  } : null, [intent?.patientAccountId, intent?.settlementId, settlement])

  const preSettle = useMutation({
    mutationFn: async (settlementId: string) => {
      if (!target || target.settlementId !== settlementId) throw new Error('医保结果未确认：挂号结算资料不完整，请刷新后重试。')
      preKey.current ??= `PRE-REG-${crypto.randomUUID()}`
      const receipt = await api.billing.quickPreSettleInsurance(settlementId, { idempotencyKey: preKey.current })
      return confirmInsuranceResult(api.billing, receipt, 'PRE_SETTLED', target, () => undefined)
    },
    onSuccess: async (value) => { setClaim(value); await refresh() },
  })

  const submit = useMutation({
    mutationFn: async (command: SettlementPaymentCommand) => {
      if (!claim || !target) throw new Error('请先完成医保预结算。')
      const receipt = await api.billing.settleInsurance(claim.claimId, `CHS-SETL-${claim.claimId}`)
      const settled = await confirmInsuranceResult(api.billing, receipt, 'SETTLED',
        { ...target, grossAmount: claim.grossAmount, claimId: claim.claimId }, () => undefined)
      setClaim(settled)
      if (Math.abs(command.amount - (command.roundingAdjustment ?? 0) - settled.patientCashAmount) > 0.005) {
        throw new Error('医保已结算，自付金额与试算不一致，请刷新结算余额后收款。')
      }
      if (settled.patientCashAmount > 0.005) {
        if (!command.paymentMethodCode) throw new Error('医保已结算，请选择个人自付的支付方式后收款。')
        return pay(command)
      }
      return settled
    },
    onSettled: async () => { await refresh() },
  })

  return { claim, preSettle, submit }
}
