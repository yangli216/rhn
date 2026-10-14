import { Button, Icon, IconButton, StatusBadge } from '../../../shared/ui'
import { chronicRefillActionLabel, type ChronicRefillController } from './useChronicRefill'

const VISIBLE_MEDICATIONS = 3

/**
 * Nonmodal chronic follow-up guide anchored under the AI pill. It never takes focus from the record editor.
 * With a refillable stable plan it offers one-click refill; otherwise it guides record generation and history review.
 */
export function ChronicRefillQuickPanel({ refill, onRefill, refillDisabled, onGenerateRecord, sceneSummary, onClose, onOpenHub }: {
  refill: ChronicRefillController
  onRefill: () => void
  refillDisabled?: boolean
  /** Fallback when no stable plan can be refilled: generate the follow-up record draft only. */
  onGenerateRecord?: () => void
  sceneSummary?: string
  onClose: () => void
  onOpenHub?: () => void
}) {
  const { stablePlan, medications, safetyAssessment } = refill
  if (!stablePlan || !refill.ready) {
    if (!onGenerateRecord) return null
    return (
      <section className="doctor-ai-refill-quick" aria-label="慢病复诊引导">
        <header className="doctor-ai-refill-quick__head">
          <span className="doctor-ai-refill-quick__icon" aria-hidden="true"><Icon name="sparkles" /></span>
          <strong className="doctor-ai-refill-quick__title">识别为慢病复诊 · {refill.conditionsText}</strong>
          <IconButton icon="close" label="关闭慢病复诊引导" onClick={onClose} />
        </header>
        <p className="doctor-ai-refill-quick__summary">
          {sceneSummary ? `${sceneSummary.replace(/[；。]\s*$/, '')}；` : ''}暂无可直接续用的历史稳定方案。
        </p>
        <footer className="doctor-ai-refill-quick__actions">
          <Button size="sm" variant="primary" disabled={refillDisabled} onClick={onGenerateRecord}>
            <Icon name="sparkles" />
            <span>生成病历</span>
          </Button>
          {refill.openHistory && (
            <Button size="sm" variant="text" onClick={refill.openHistory}>
              <span>历史处方</span>
              <Icon name="chevron-right" />
            </Button>
          )}
          {onOpenHub && (
            <Button size="sm" variant="text" className="doctor-ai-refill-quick__hub" title="展开 AI 辅诊中心" onClick={onOpenHub}>
              更多
            </Button>
          )}
        </footer>
      </section>
    )
  }
  const hiddenCount = Math.max(0, medications.length - VISIBLE_MEDICATIONS)
  const alerts = safetyAssessment?.alerts.filter((alert) => alert.severity !== 'SAFE') ?? []

  return (
    <section className={`doctor-ai-refill-quick is-${refill.tone}`} aria-label="慢病快捷续方">
      <header className="doctor-ai-refill-quick__head">
        <span className="doctor-ai-refill-quick__icon" aria-hidden="true"><Icon name="sparkles" /></span>
        <strong className="doctor-ai-refill-quick__title">识别为慢病复诊 · {refill.conditionsText}</strong>
        <StatusBadge tone={refill.tone}>{refill.toneLabel}</StatusBadge>
        <IconButton icon="close" label="关闭慢病快捷续方" onClick={onClose} />
      </header>
      <p className="doctor-ai-refill-quick__summary">{stablePlan.summary}</p>

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
            <span>调整处方</span>
            <Icon name="chevron-right" />
          </Button>
        )}
        {onOpenHub && (
          <Button size="sm" variant="text" className="doctor-ai-refill-quick__hub" title="展开 AI 辅诊中心" onClick={onOpenHub}>
            更多
          </Button>
        )}
      </footer>
    </section>
  )
}
