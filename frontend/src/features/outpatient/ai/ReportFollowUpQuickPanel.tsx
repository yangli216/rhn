import { Button, Icon, IconButton } from '../../../shared/ui'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'

const VISIBLE_HIGHLIGHTS = 3

/**
 * Nonmodal guide for a patient who comes back with the results of earlier orders. It never takes focus from the
 * record editor; it surfaces what came back and offers the two things a doctor does next: read the results, or
 * let AI write the follow-up record from them.
 */
export function ReportFollowUpQuickPanel({ scene, generateDisabled, onGenerateRecord, onOpenResults, onOpenHub, onClose }: {
  scene: ReceptionSceneAssessment
  generateDisabled?: boolean
  onGenerateRecord: () => void
  onOpenResults?: () => void
  onOpenHub?: () => void
  onClose: () => void
}) {
  const hidden = Math.max(0, scene.reportHighlights.length - VISIBLE_HIGHLIGHTS)
  const earlier = scene.followUpOf
  const day = earlier ? new Date(earlier.registeredAt) : undefined
  return (
    <section className="doctor-ai-refill-quick is-warning" aria-label="报告回诊引导">
      <header className="doctor-ai-refill-quick__head">
        <span className="doctor-ai-refill-quick__icon" aria-hidden="true"><Icon name="sparkles" /></span>
        <strong className="doctor-ai-refill-quick__title">识别为报告回诊 · {scene.reportCount ?? scene.selectedReportIds.length} 份报告已出</strong>
        <IconButton icon="close" label="关闭报告回诊引导" onClick={onClose} />
      </header>
      <p className="doctor-ai-refill-quick__summary">
        {day && !Number.isNaN(day.getTime()) ? `承接 ${day.getMonth() + 1}月${day.getDate()}日就诊${earlier?.diagnoses.length ? `（${earlier.diagnoses.join('、')}）` : ''}；` : ''}
        {scene.summaryText}
      </p>
      {scene.reportHighlights.length > 0 && (
        <ul className="doctor-ai-refill-quick__meds" aria-label="异常结果">
          {scene.reportHighlights.slice(0, VISIBLE_HIGHLIGHTS).map((item) => <li key={item}>{item}</li>)}
          {hidden > 0 && <li className="doctor-ai-refill-quick__more">另有 {hidden} 项异常，可在结果页核对</li>}
        </ul>
      )}
      <footer className="doctor-ai-refill-quick__actions">
        <Button size="sm" variant="primary" disabled={generateDisabled} onClick={onGenerateRecord}>
          <Icon name="sparkles" />
          <span>生成回诊病历</span>
        </Button>
        {onOpenResults && (
          <Button size="sm" variant="text" onClick={onOpenResults}>
            <span>查看结果</span>
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
