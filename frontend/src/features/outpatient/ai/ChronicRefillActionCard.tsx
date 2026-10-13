import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { DiagnosticReport } from '../../../shared/api/diagnosticsApi'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'
import { assessChronicMedicationSafety, type ChronicSafetyAssessment } from './chronicSafetyVerification'
import { Button, Icon, StatusBadge } from '../../../shared/ui'
import type { InlineAiSelection } from './ClinicalAiInlineWorkspace'

import { buildChronicRefillPrompt } from './chronicRefillPromptBuilder'

export interface ChronicRefillActionCardProps {
  encounter: Encounter
  api: RhnApi
  sceneAssessment: ReceptionSceneAssessment
  diagnosticReports: DiagnosticReport[]
  disabled: boolean
  busy: boolean
  onApply: (selection: InlineAiSelection) => void
  onGenerate?: (focus?: string) => Promise<string>
  onOpenHistory?: () => void
  onNotice?: (msg: string) => void
}

export function ChronicRefillActionCard({
  encounter,
  api,
  sceneAssessment,
  diagnosticReports,
  disabled,
  busy,
  onApply,
  onGenerate,
  onOpenHistory,
  onNotice,
}: ChronicRefillActionCardProps) {
  const [adopted, setAdopted] = useState(false)
  const [overrideWarning, setOverrideWarning] = useState(false)

  // 1. Fetch historical stable plan
  const stablePlanQuery = useQuery({
    queryKey: ['historical-stable-plan', encounter.id, encounter.residentId],
    queryFn: () => api.outpatientPlanTemplates.getHistoricalStablePlan(encounter.id),
    staleTime: 60_000,
  })

  const stablePlan = stablePlanQuery.data
  const medications = useMemo(() => stablePlan?.medications.map((item) => ({
    ...item, medicationName: item.medicationName?.trim() || '药品待核对',
  })) ?? [], [stablePlan])

  // 2. Compute medication safety assessment against recent reports
  const safetyAssessment: ChronicSafetyAssessment | undefined = useMemo(() => {
    if (!stablePlan || !stablePlan.medications.length) return undefined
    return assessChronicMedicationSafety({
      medications,
      reports: diagnosticReports,
    })
  }, [stablePlan, medications, diagnosticReports])

  if (stablePlanQuery.isLoading) {
    return (
      <div className="doctor-ai-chronic-card is-loading">
        <span className="doctor-ai-copilot-pill__pulse" aria-hidden="true" />
        <span>正在分析慢病历史用药与指标安全…</span>
      </div>
    )
  }

  if (!stablePlan || !stablePlan.medications.length) {
    return null
  }

  const conditionsText = sceneAssessment.matchedConditions.length
    ? sceneAssessment.matchedConditions.join('、')
    : stablePlan.conditionTitle || '慢性病'

  const handleApplyFullRefill = () => {
    if (disabled || busy || adopted) return

    // If critical blocker exists, warn and allow doctor override if confirmed
    if (safetyAssessment?.hasCriticalBlockers && !overrideWarning) {
      setOverrideWarning(true)
      onNotice?.('⚠️ 检测到近期化验指标高危警示，请先确认风险后再续方')
      return
    }

    const promptData = buildChronicRefillPrompt({
      encounter,
      matchedConditions: sceneAssessment.matchedConditions,
      medications,
      safetyAssessment,
    })

    if (onGenerate) {
      // Leverage AI model generation for personalized, clinically deep SOAP note
      void onGenerate(promptData.aiFocusPrompt).catch(() => undefined)
    } else {
      // Deterministic compliant fallback
      const annotations = [
        {
          field: 'chiefComplaint' as const,
          text: promptData.fallbackChiefComplaint,
          source: 'AI' as const,
          kind: 'IMPORTANT' as const,
        },
        {
          field: 'presentIllness' as const,
          text: promptData.fallbackPresentIllness,
          source: 'AI' as const,
          kind: 'IMPORTANT' as const,
        },
      ]

      onApply({
        recordDraft: {
          chiefComplaint: promptData.fallbackChiefComplaint,
          presentIllness: promptData.fallbackPresentIllness,
          annotations,
        },
        incrementalRecord: false,
      })
    }

    setAdopted(true)
    onNotice?.(`已采纳【${conditionsText}】复诊病历草稿，请在历史处方中确认医嘱明细`)

    // Open history drawer for final confirmation if available
    if (onOpenHistory) {
      onOpenHistory()
    }
  }

  const tone = safetyAssessment?.overallStatus === 'CRITICAL'
    ? 'danger'
    : safetyAssessment?.overallStatus === 'WARNING'
    ? 'warning'
    : 'success'

  const toneLabel = safetyAssessment?.overallStatus === 'CRITICAL'
    ? '高危用药风险'
    : safetyAssessment?.overallStatus === 'WARNING'
    ? '随访超期建议'
    : '指标核查平稳'

  return (
    <section className={`doctor-ai-chronic-refill-card is-${tone}`} aria-label="慢病智能续方">
      <header className="doctor-ai-chronic-refill-card__header">
        <div className="doctor-ai-chronic-refill-card__title-row">
          <span className="doctor-ai-chronic-refill-card__icon" aria-hidden="true">
            <Icon name="sparkles" />
          </span>
          <strong className="doctor-ai-chronic-refill-card__title">慢病智能续方推荐</strong>
          <StatusBadge tone={tone}>{toneLabel}</StatusBadge>
        </div>
        <span className="doctor-ai-chronic-refill-card__summary">{stablePlan.summary}</span>
      </header>

      {/* Safety Alert List */}
      {safetyAssessment && safetyAssessment.alerts.length > 0 && (
        <div className="doctor-ai-chronic-refill-card__alerts">
          {safetyAssessment.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`doctor-ai-chronic-alert is-${alert.severity.toLowerCase()}`}
            >
              <Icon
                name={alert.severity === 'CRITICAL' ? 'warning' : alert.severity === 'WARNING' ? 'info' : 'check'}
                className="doctor-ai-chronic-alert__icon"
              />
              <div className="doctor-ai-chronic-alert__content">
                <strong>{alert.title}：</strong>
                <span>{alert.detail}</span>
                {alert.suggestedAction && (
                  <span className="doctor-ai-chronic-alert__action">
                    （{alert.suggestedAction}）
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommended Medications List */}
      <div className="doctor-ai-chronic-refill-card__meds">
        <span className="doctor-ai-chronic-refill-card__meds-title">建议续方药品清单 (长处方)：</span>
        <ul className="doctor-ai-chronic-refill-card__med-list">
          {stablePlan.medications.map((med, idx) => (
            <li key={idx} className="doctor-ai-chronic-refill-card__med-item">
              <span className="doctor-ai-chronic-refill-card__med-name">{med.medicationName}</span>
              <span className="doctor-ai-chronic-refill-card__med-usage">
                {med.doseValue}{med.doseUnit} {med.medicationInstruction ?? '用法请核对历史医嘱'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <footer className="doctor-ai-chronic-refill-card__actions">
        <Button
          size="sm"
          variant={safetyAssessment?.hasCriticalBlockers ? 'secondary' : 'primary'}
          disabled={disabled || busy || adopted}
          onClick={handleApplyFullRefill}
        >
          <Icon name="sparkles" />
          <span>
            {adopted
              ? '✓ 已采纳续方方案'
              : safetyAssessment?.hasCriticalBlockers && !overrideWarning
              ? '⚠️ 确认风险并一键续方'
              : '⚡ 一键安全续方 (病历+医嘱)'}
          </span>
        </Button>
        {onOpenHistory && (
          <Button
            size="sm"
            variant="text"
            onClick={onOpenHistory}
            title="查看完整历史就诊记录与历史处方"
          >
            <span>微调处方明细</span>
            <Icon name="chevron-right" />
          </Button>
        )}
      </footer>
    </section>
  )
}
