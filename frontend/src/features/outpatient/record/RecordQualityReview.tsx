import { Alert, Button } from '../../../shared/ui'
import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { RecordQualityFeedback } from '../../../shared/api/clinicalAiApi'
import type { useRecordQualityDecision } from './useRecordQualityDecision'
import './record-quality-review.css'

export function RecordQualityReview({ decision, disabled, document, onLocate }: {
  decision: ReturnType<typeof useRecordQualityDecision>; disabled: boolean; document?: ClinicalDocument
  onLocate: (field: string) => void
}) {
  const { assessment, latest } = decision
  const canConfirm = document && decision.pendingAdoption && document.currentVersion > (assessment?.baselineDocumentVersion ?? 0)
  if (!assessment && !decision.error && !decision.retryPending) return null
  return <section className="record-quality-review" aria-label="病历完整性与矛盾核查">
    {(decision.retryPending || canConfirm) && <div className="record-quality-review__head">
      {decision.retryPending && <Button type="button" size="sm" disabled={disabled || decision.busy}
        onClick={() => void decision.retry()}>重试反馈</Button>}
      {canConfirm && !decision.retryPending && <Button type="button" size="sm" disabled={disabled || decision.busy}
        onClick={() => void decision.confirmSaved(document)}>核实已保存版本</Button>}
    </div>}
    {decision.error && <Alert placement="inline">{decision.error}</Alert>}
    {assessment && <p role="status">{assessment.message}</p>}
    {assessment?.findings?.length ? <>
      {decision.stale && <p>病历已变化或结果来自上次会话；已采纳提示可在保存后核实，新的采纳需重新核查。</p>}
      {decision.pendingAdoption && <p>请核实后编辑相关段落并保存。保存反馈仅说明字段是否变化，不代表问题已解决。</p>}
      <ul>{assessment.findings.map(finding => {
        const feedback: RecordQualityFeedback | undefined = latest.get(finding.code)
        return <li key={finding.code}>
          <div><strong>{finding.title}</strong><p>{finding.prompt}</p>
            {feedback && <small>{feedback.actionText ?? feedback.action}
              {feedback.documentVersion && ` · 病历 V${feedback.documentVersion}`}</small>}</div>
          <div className="record-quality-review__actions">
            <Button type="button" size="sm" variant="text" disabled={disabled || decision.busy || decision.stale || decision.retryPending || feedback?.action === 'ADOPTED'}
              onClick={async () => { if (finding.code && await decision.act(finding.code, 'ADOPTED') && finding.field) onLocate(finding.field) }}>采纳并定位</Button>
            <Button type="button" size="sm" variant="text" disabled={disabled || decision.busy || decision.retryPending || feedback?.action === 'DISMISSED'}
              onClick={() => { if (finding.code) void decision.act(finding.code, 'DISMISSED') }}>忽略</Button>
          </div>
        </li>
      })}</ul>
    </> : null}
  </section>
}
