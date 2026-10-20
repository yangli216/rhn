import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ChsPersonInfoResponse, InsuranceSettlementView, RegistrationBillingIntent, Settlement } from '../../shared/api/billingApi'
import { confirmInsuranceResult } from '../../shared/billing/insuranceResult'
import type { SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { AnchoredPanel, Button, Icon, StatusBadge } from '../../shared/ui'

/** 机构／科室选择的医保挂号结算时机；仅在选择医保身份后查询。 */
export function useRegistrationInsuranceTiming(api: RhnApi, organizationId: string, departmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['registration-insurance-timing', organizationId, departmentId],
    queryFn: () => api.billing.registrationInsuranceTiming(organizationId, departmentId),
    enabled,
    staleTime: 60_000,
  })
}

export interface InsuranceCoverageInfo {
  sdCoverageTypeText?: string
  payerName: string
  memberNo?: string | null
  primary?: boolean
  validFrom?: string | null
  validTo?: string | null
}

/** 费用类别旁的「参保信息」入口：轻量浮窗展示患者档案中的医保保障及本次鉴权结果（尚未鉴权时不展示鉴权项）。 */
export function InsuranceInfoPopover({ coverage, coverageLabel, person }: {
  coverage: InsuranceCoverageInfo
  coverageLabel: string
  person: ChsPersonInfoResponse | null
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [open, setOpen] = useState(false)
  const row = (label: string, value: ReactNode) => <div className="registration-insurance-info__row">
    <dt>{label}</dt><dd>{value}</dd></div>
  return <>
    <Button variant="secondary" className="registration-insurance-info-trigger" aria-haspopup="dialog" aria-expanded={open}
      onClick={(event) => { setAnchor(event.currentTarget.getBoundingClientRect()); setOpen((value) => !value) }}>
      <Icon name="credential" />查看参保信息
    </Button>
    {open && <AnchoredPanel label="参保信息" anchorRect={anchor} onClose={() => setOpen(false)}
      className="registration-insurance-info">
      <header className="registration-insurance-info__header"><strong>参保信息</strong>
        <Button size="sm" variant="text" aria-label="关闭参保信息" onClick={() => setOpen(false)}>关闭</Button></header>
      <dl className="registration-insurance-info__body">
        {row('险种', coverageLabel)}
        {row('参保单位 / 医保机构', coverage.payerName)}
        {coverage.memberNo ? row('医保个人编号', coverage.memberNo) : null}
        {row('有效期', `${coverage.validFrom ?? '—'} ~ ${coverage.validTo ?? '长期'}`)}
        {person
          ? <>
            {row('参保状态', <StatusBadge tone={person.status === 'NORMAL' ? 'success' : 'warning'}>
              {person.status === 'NORMAL' ? '参保正常' : person.status ?? '未知'}</StatusBadge>)}
            {row('统筹区', person.insuOptinsName ?? person.insuOptins)}
            {Number.isFinite(person.balc) ? row('个人账户余额', `¥${person.balc.toFixed(2)}`) : null}
          </>
          : <p className="registration-insurance-info__hint">点击「确认挂号并出单」时将自动完成医保鉴权。</p>}
      </dl>
    </AnchoredPanel>}
  </>
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
