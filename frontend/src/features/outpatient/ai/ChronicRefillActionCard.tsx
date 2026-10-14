import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { DiagnosticReport } from '../../../shared/api/diagnosticsApi'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'
import { Button, Icon, StatusBadge } from '../../../shared/ui'
import type { InlineAiSelection } from './ClinicalAiInlineWorkspace'
import { chronicRefillActionLabel, useChronicRefill, type ChronicRefillController } from './useChronicRefill'

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
  /** Shared refill session; when provided the card does not fetch or own adoption state. */
  controller?: ChronicRefillController
}

export function ChronicRefillActionCard({ controller, ...options }: ChronicRefillActionCardProps) {
  const own = useChronicRefill({ ...options, enabled: !controller })
  const refill = controller ?? own
  const { stablePlan, safetyAssessment, tone, toneLabel } = refill

  if (refill.loading) {
    return (
      <div className="doctor-ai-chronic-card is-loading">
        <span className="doctor-ai-copilot-pill__pulse" aria-hidden="true" />
        <span>正在分析慢病历史用药与指标安全…</span>
      </div>
    )
  }

  if (!stablePlan || !refill.ready) {
    return null
  }

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
          disabled={refill.actionDisabled}
          onClick={() => refill.applyRefill()}
        >
          <Icon name="sparkles" />
          <span>{chronicRefillActionLabel(refill)}</span>
        </Button>
        {refill.openHistory && (
          <Button
            size="sm"
            variant="text"
            onClick={refill.openHistory}
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
