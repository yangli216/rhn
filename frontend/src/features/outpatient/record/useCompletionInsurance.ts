import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { AccountStatement, InsuranceSettlementView } from '../../../shared/api/billingApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { SettlementModeCode } from '../../../shared/billing/SettlementPaymentPanel'
import { insuranceFailureText, isInsuranceCredentialError, preSettleInsurance, requireInsuranceTarget,
  settleInsuranceClaim } from '../../../shared/billing/insuranceCheckout'

/**
 * Doctor-station insurance settlement, reusing the cashier's claim confirmation. The settlement mode defaults to the
 * one chosen at registration; a missing or expired insurance credential opens the card / e-code reader and resumes.
 */
export function useCompletionInsurance({ api, encounter, sessionKey, captureSession }: {
  api: RhnApi
  encounter: Encounter
  sessionKey: unknown
  captureSession: () => () => void
}) {
  const registered = useQuery({
    queryKey: ['doctor-completion-settlement-mode', sessionKey, encounter.id], retry: false, staleTime: 5 * 60_000,
    queryFn: async () => (await api.billing.registrationSettlementModes([encounter.id]))[encounter.id] ?? 'SELF_PAY',
  })
  const [chosenMode, setChosenMode] = useState<SettlementModeCode>()
  const mode: SettlementModeCode = chosenMode ?? registered.data ?? 'SELF_PAY'
  const [claim, setClaim] = useState<InsuranceSettlementView | null>(null)
  const [preSettling, setPreSettling] = useState(false)
  const [credential, setCredential] = useState<{ settlementId: string; error?: string } | null>(null)
  const [error, setError] = useState('')
  // One pre-settlement key per settlement, so a retried request is recognised by the server.
  const keys = useRef(new Map<string, string>())

  const target = (statement: AccountStatement | undefined, settlementId: string) =>
    requireInsuranceTarget(statement, settlementId, { encounterId: encounter.id })

  const preSettle = async (statement: AccountStatement | undefined, settlementId: string, fromCredentialDialog = false) => {
    setPreSettling(true); setError('')
    try {
      const assertCurrent = captureSession()
      const key = keys.current.get(settlementId) ?? `PRE-CHS-${globalThis.crypto.randomUUID()}`
      keys.current.set(settlementId, key)
      const result = await preSettleInsurance(api.billing, target(statement, settlementId), key, assertCurrent)
      setClaim(result); setCredential(null)
      return result
    } catch (err: unknown) {
      setClaim(null)
      if (isInsuranceCredentialError(err)) {
        setCredential({ settlementId, error: fromCredentialDialog ? insuranceFailureText(err, '') : undefined })
      } else {
        setCredential(null)
        setError(insuranceFailureText(err, '医保预结算失败，请重试'))
      }
      return null
    } finally { setPreSettling(false) }
  }

  /** Final settlement of the confirmed pre-settled claim; the caller collects any remaining self-pay amount. */
  const settle = async (statement: AccountStatement, settlementId: string, assertCurrent: () => void) => {
    if (!claim) throw new Error('医保结果未确认：试算申请已失效，请重新试算。')
    const settled = await settleInsuranceClaim(api.billing, claim, target(statement, settlementId), assertCurrent)
    setClaim(settled)
    return settled
  }

  return {
    mode, claim, preSettling, credential, error,
    setMode: (value: SettlementModeCode) => { setChosenMode(value); setClaim(null); setError('') },
    clearClaim: () => setClaim(null),
    cancelCredential: () => { setCredential(null); setError('未读取医保凭证，未执行医保预结算') },
    preSettle, settle,
  }
}
