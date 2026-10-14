import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { DiagnosticReport } from '../../../shared/api/diagnosticsApi'
import type { HistoricalStablePlan } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'
import { assessChronicMedicationSafety, type ChronicSafetyAssessment } from './chronicSafetyVerification'
import { buildChronicRefillPrompt } from './chronicRefillPromptBuilder'
import type { InlineAiSelection } from './ClinicalAiInlineWorkspace'

export interface UseChronicRefillOptions {
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
  /** False skips the stable-plan query, e.g. when another owner already provides the controller. */
  enabled?: boolean
}

export type ChronicRefillMedication = HistoricalStablePlan['medications'][number] & { medicationName: string }

export type ChronicRefillTone = 'danger' | 'warning' | 'success'

/** One refill session per encounter, shared by the side card and the quick panel. */
export interface ChronicRefillController {
  encounterId: string
  loading: boolean
  /** True only when a historical stable plan with medications can be refilled. */
  ready: boolean
  stablePlan?: HistoricalStablePlan
  medications: ChronicRefillMedication[]
  safetyAssessment?: ChronicSafetyAssessment
  conditionsText: string
  tone: ChronicRefillTone
  toneLabel: string
  adopted: boolean
  /** A critical blocker was shown and the next refill click is an explicit override. */
  overrideWarning: boolean
  actionDisabled: boolean
  /** `generate` lets a host (the copilot hub) route generation through its own auto-adoption. */
  applyRefill: (generate?: (focus?: string) => Promise<string>) => void
  openHistory?: () => void
}

export function useChronicRefill({
  encounter, api, sceneAssessment, diagnosticReports, disabled, busy,
  onApply, onGenerate, onOpenHistory, onNotice, enabled = true,
}: UseChronicRefillOptions): ChronicRefillController {
  const [adoption, setAdoption] = useState({ encounterId: encounter.id, adopted: false, overrideWarning: false })
  useEffect(() => {
    setAdoption((current) => current.encounterId === encounter.id ? current
      : { encounterId: encounter.id, adopted: false, overrideWarning: false })
  }, [encounter.id])
  const sameEncounter = adoption.encounterId === encounter.id
  const adopted = sameEncounter && adoption.adopted
  const overrideWarning = sameEncounter && adoption.overrideWarning

  const stablePlanQuery = useQuery({
    queryKey: ['historical-stable-plan', encounter.id, encounter.residentId],
    queryFn: () => api.outpatientPlanTemplates.getHistoricalStablePlan(encounter.id),
    staleTime: 60_000,
    enabled,
  })

  const stablePlan = enabled ? stablePlanQuery.data ?? undefined : undefined
  const medications = useMemo<ChronicRefillMedication[]>(() => stablePlan?.medications.map((item) => ({
    ...item, medicationName: item.medicationName?.trim() || '药品待核对',
  })) ?? [], [stablePlan])

  const safetyAssessment = useMemo(() => {
    if (!stablePlan || !stablePlan.medications.length) return undefined
    return assessChronicMedicationSafety({ medications, reports: diagnosticReports })
  }, [stablePlan, medications, diagnosticReports])

  const conditionsText = sceneAssessment.matchedConditions.length
    ? sceneAssessment.matchedConditions.join('、')
    : stablePlan?.conditionTitle || '慢性病'

  const applyRefill = (generate: ((focus?: string) => Promise<string>) | undefined = onGenerate) => {
    if (disabled || busy || adopted || !stablePlan) return
    if (safetyAssessment?.hasCriticalBlockers && !overrideWarning) {
      setAdoption({ encounterId: encounter.id, adopted: false, overrideWarning: true })
      onNotice?.('⚠️ 检测到近期化验指标高危警示，请先确认风险后再续方')
      return
    }
    const promptData = buildChronicRefillPrompt({
      encounter,
      matchedConditions: sceneAssessment.matchedConditions,
      medications,
      safetyAssessment,
    })
    if (generate) {
      void generate(promptData.aiFocusPrompt).catch(() => undefined)
    } else {
      onApply({
        recordDraft: {
          chiefComplaint: promptData.fallbackChiefComplaint,
          presentIllness: promptData.fallbackPresentIllness,
          annotations: [
            { field: 'chiefComplaint', text: promptData.fallbackChiefComplaint, source: 'AI', kind: 'IMPORTANT' },
            { field: 'presentIllness', text: promptData.fallbackPresentIllness, source: 'AI', kind: 'IMPORTANT' },
          ],
        },
        incrementalRecord: false,
      })
    }
    setAdoption({ encounterId: encounter.id, adopted: true, overrideWarning })
    onNotice?.(`已采纳【${conditionsText}】复诊病历草稿，请在历史处方中确认医嘱明细`)
    onOpenHistory?.()
  }

  const status = safetyAssessment?.overallStatus
  return {
    encounterId: encounter.id,
    loading: enabled && stablePlanQuery.isLoading,
    ready: Boolean(stablePlan && stablePlan.medications.length),
    stablePlan,
    medications,
    safetyAssessment,
    conditionsText,
    tone: status === 'CRITICAL' ? 'danger' : status === 'WARNING' ? 'warning' : 'success',
    toneLabel: status === 'CRITICAL' ? '高危用药风险' : status === 'WARNING' ? '随访超期建议' : '指标核查平稳',
    adopted,
    overrideWarning,
    actionDisabled: disabled || busy || adopted,
    applyRefill,
    openHistory: onOpenHistory,
  }
}

export function chronicRefillActionLabel(controller: Pick<ChronicRefillController, 'adopted' | 'overrideWarning' | 'safetyAssessment'>) {
  if (controller.adopted) return '✓ 已采纳续方方案'
  if (controller.safetyAssessment?.hasCriticalBlockers && !controller.overrideWarning) return '⚠️ 确认风险并一键续方'
  return '⚡ 一键安全续方 (病历+医嘱)'
}
