import { Button, Icon, IconButton, StatusBadge } from '../../../shared/ui'
import { chronicRefillActionLabel, type ChronicRefillController } from './useChronicRefill'

const VISIBLE_MEDICATIONS = 3

/** Nonmodal refill shortcut anchored under the AI pill. It never takes focus from the record editor. */
export function ChronicRefillQuickPanel({ refill, onRefill, refillDisabled, onClose, onOpenHub }: {
  refill: ChronicRefillController
  onRefill: () => void
  refillDisabled?: boolean
  onClose: () => void
  onOpenHub?: () => void
}) {
  const { stablePlan, medications, safetyAssessment } = refill
  if (!stablePlan || !refill.ready) return null
  const hiddenCount = Math.max(0, medications.length - VISIBLE_MEDICATIONS)
  const alerts = safetyAssessment?.alerts.filter((alert) => alert.severity !== 'SAFE') ?? []

  return (
    <section className={`doctor-ai-refill-quick is-${refill.tone}`} aria-label="慢病快捷续方">
      <header className="doctor-ai-refill-quick__head">
        <span className="doctor-ai-refill-quick__icon" aria-hidden="true"><Icon name="sparkles" /></span>
        <div className="doctor-ai-refill-quick__title-wrap">
          <strong className="doctor-ai-refill-quick__title">识别为慢病复诊 · {refill.conditionsText}</strong>
          <span className="doctor-ai-refill-quick__summary">{stablePlan.summary}</span>
        </div>
        <StatusBadge tone={refill.tone}>{refill.toneLabel}</StatusBadge>
        <IconButton icon="close" label="关闭慢病快捷续方" onClick={onClose} />
      </header>

      {alerts.length > 0 && (
        <ul className="doctor-ai-refill-quick__alerts" aria-label="续方安全提示">
          {alerts.map((alert) => (
            <li key={alert.id} className={`doctor-ai-refill-quick__alert is-${alert.severity.toLowerCase()}`}>
              <Icon name={alert.severity === 'CRITICAL' ? 'warning' : 'info'} />
              <span><strong>{alert.title}</strong>：{alert.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <ul className="doctor-ai-refill-quick__meds" aria-label="建议续方药品">
        {medications.slice(0, VISIBLE_MEDICATIONS).map((med, index) => (
          <li key={`${med.medicationId ?? med.medicationName}-${index}`}>
            <span className="doctor-ai-refill-quick__med-name">{med.medicationName}</span>
            <span className="doctor-ai-refill-quick__med-usage">
              {med.doseValue}{med.doseUnit} {med.medicationInstruction ?? '用法请核对历史医嘱'}
            </span>
          </li>
        ))}
        {hiddenCount > 0 && <li className="doctor-ai-refill-quick__more">另有 {hiddenCount} 种药品，可在处方明细中核对</li>}
      </ul>

      <footer className="doctor-ai-refill-quick__actions">
        <Button size="sm" variant={safetyAssessment?.hasCriticalBlockers ? 'secondary' : 'primary'}
          disabled={refill.actionDisabled || refillDisabled} onClick={onRefill}>
          <Icon name="sparkles" />
          <span>{chronicRefillActionLabel(refill)}</span>
        </Button>
        {refill.openHistory && (
          <Button size="sm" variant="text" onClick={refill.openHistory}>
            <span>微调处方明细</span>
            <Icon name="chevron-right" />
          </Button>
        )}
        {onOpenHub && (
          <Button size="sm" variant="text" className="doctor-ai-refill-quick__hub" onClick={onOpenHub}>
            更多 AI 辅诊
          </Button>
        )}
      </footer>
    </section>
  )
}
