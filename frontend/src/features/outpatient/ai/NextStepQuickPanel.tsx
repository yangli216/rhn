import { Button, Icon, IconButton } from '../../../shared/ui'
import type { CopilotNextStep } from './copilotNextStep'

/** Nonmodal one-line shortcut for the next AI step; shares the guide styling and never takes focus. */
export function NextStepQuickPanel({ step, disabled, onRun, onOpenHub, onClose }: {
  step: CopilotNextStep
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
      <footer className="doctor-ai-refill-quick__actions">
        <Button size="sm" variant="primary" disabled={disabled} onClick={onRun}>
          <Icon name="sparkles" />
          <span>{step.action}</span>
        </Button>
        {onOpenHub && (
          <Button size="sm" variant="text" className="doctor-ai-refill-quick__hub" title="展开 AI 辅诊中心" onClick={onOpenHub}>
            更多
          </Button>
        )}
      </footer>
    </section>
  )
}
