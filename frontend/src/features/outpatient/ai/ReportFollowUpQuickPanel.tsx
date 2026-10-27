import { Button, Icon, IconButton } from '../../../shared/ui'
import { parseReportHighlightGroups, type ReceptionSceneAssessment } from './receptionSceneAssessment'

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
  const groups = scene.reportHighlightGroups && scene.reportHighlightGroups.length > 0
    ? scene.reportHighlightGroups
    : parseReportHighlightGroups(scene.reportHighlights)

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
      {groups.length > 0 && (
        <div className="doctor-ai-refill-quick__reports" aria-label="异常结果">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="doctor-ai-refill-quick__report-group">
              <div className="doctor-ai-refill-quick__report-head">
                <Icon name="document" />
                <span className="doctor-ai-refill-quick__report-name">{group.reportName}</span>
              </div>
              <ul className="doctor-ai-refill-quick__meds">
                {group.items.slice(0, VISIBLE_HIGHLIGHTS).map((item, idx) => (
                  <li key={idx} className="doctor-ai-refill-quick__report-row" title={item.fullText}>
                    <span className="doctor-ai-refill-quick__indicator-name">{item.observationName}</span>
                    <span className="doctor-ai-refill-quick__indicator-val">
                      {item.valueText && <span className="doctor-ai-refill-quick__indicator-num">{item.valueText}</span>}
                      {item.direction && (
                        <span className={`doctor-ai-refill-quick__indicator-flag is-${item.direction === '↑' ? 'high' : item.direction === '↓' ? 'low' : 'abnormal'}`}>
                          {item.direction}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {hidden > 0 && <p className="doctor-ai-refill-quick__more">另有 {hidden} 项异常，可在结果页核对</p>}
        </div>
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
