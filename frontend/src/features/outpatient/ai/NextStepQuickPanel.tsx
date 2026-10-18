import { Button, Icon, IconButton } from '../../../shared/ui'
import type { ClinicalAiRecommendedPlan } from '../../../shared/api/clinicalAiApi'
import type { CopilotNextStep } from './copilotNextStep'

const VISIBLE_PLANS = 3

/** Nonmodal one-line shortcut for the next AI step; shares the guide styling and never takes focus. */
export function NextStepQuickPanel({ step, plans = [], disabled, onRun, onReviewPlan, onOpenHub, onClose }: {
  step: CopilotNextStep
  /** Matched whole plans, listed when the step is a plan recommendation. */
  plans?: ClinicalAiRecommendedPlan[]
  onReviewPlan?: (plan: ClinicalAiRecommendedPlan) => void
  disabled?: boolean
  onRun: () => void
  onOpenHub?: () => void
  onClose: () => void
}) {
  return (
    <section className="doctor-ai-refill-quick" aria-label="下一步建议">
      <header className="doctor-ai-refill-quick__head">
        <span className="doctor-ai-refill-quick__icon" aria-hidden="true"><Icon name="sparkles" /></span>
        <strong className="doctor-ai-refill-quick__title">下一步 · {step.tag}</strong>
        <IconButton icon="close" label="关闭下一步建议" onClick={onClose} />
      </header>
      <p className="doctor-ai-refill-quick__summary">{step.hint}</p>
      {step.kind === 'PLAN' && plans.length > 0 && (
        <ul className="doctor-ai-refill-quick__meds" aria-label="可用诊疗方案">
          {plans.slice(0, VISIBLE_PLANS).map((plan) => (
            <li key={plan.templateId} className="doctor-ai-refill-quick__plan">
              <span className="doctor-ai-refill-quick__med-name">{plan.name}</span>
              <span className="doctor-ai-refill-quick__plan-note">{plan.description || plan.rationale}</span>
              <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onReviewPlan?.(plan)}>核对</Button>
            </li>
          ))}
          {plans.length > VISIBLE_PLANS && <li className="doctor-ai-refill-quick__more">另有 {plans.length - VISIBLE_PLANS} 个方案，可在诊疗方案页查看</li>}
        </ul>
      )}
      <footer className="doctor-ai-refill-quick__actions">
        {step.kind === 'PLAN' ? (
          <Button size="sm" variant="text" disabled={disabled} onClick={onRun}>
            <Icon name="sparkles" />
            <span>不用方案，AI 生成</span>
          </Button>
        ) : (
          <Button size="sm" variant="primary" disabled={disabled} onClick={onRun}>
            <Icon name="sparkles" />
            <span>{step.action}</span>
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
