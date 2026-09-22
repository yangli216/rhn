import type { PrescriptionSafetyReview } from '../../shared/api/pharmacyApi'
import { formatTime } from '../../shared/format'
import { Alert, StatusBadge } from '../../shared/ui'

const decisions = { PASS: '未触发控制', WARN: '提醒核对', REQUIRE_OVERRIDE: '需说明理由', BLOCK: '阻断', UNAVAILABLE: '无法评价' }

export function PharmacyMedicationSafety({ reviews }: { reviews?: PrescriptionSafetyReview[] }) {
  return <section className="pharmacy-action-section" aria-label="处方合理用药与医生处理">
    <div className="pharmacy-section-head"><div><h3>合理用药与医生处理</h3>
      <span>以下为处方提交时的检查结果，供本次药学审核核对。</span></div></div>
    {!reviews?.length ? <Alert tone="info">未提供提交时的合理用药信息，请按处方及患者资料完成药学审核；不能据此认定已通过规则检查。</Alert>
      : reviews.map((review) => <div key={review.prescriptionId} className="pharmacy-safety-summary">
        <header><strong>{review.prescriptionNo}</strong><span>{formatTime(review.submittedAt)}</span>
          <StatusBadge tone={review.evaluation.decision === 'PASS' ? 'neutral' : 'warning'}>
            {review.evaluation.mode === 'SHADOW' ? '旁路提示' : '正式审查'} · {review.evaluation.evaluationId
              ? decisions[review.evaluation.decision] : '评价记录不完整'}
          </StatusBadge></header>
        <p><strong>医生继续开立理由：</strong>{review.doctorReason?.trim() || '未填写'}</p>
        <div className="pharmacy-safety-findings">{review.evaluation.findings.map((finding) => <article key={finding.findingId}>
          <strong>{finding.category === 'DUPLICATE_THERAPY' ? '重复用药' : finding.category === 'DRUG_INTERACTION' ? '相互作用' : '用药风险'} · {decisions[finding.decision]}</strong>
          <p>涉及药品：{finding.medicationRequestIds.map((id) => review.medications.find((item) => item.requestId === id)?.name
            ?? '名称未记录').join('、') || '请核对整张处方'}</p>
          <p>{finding.message}</p>
          {finding.suggestedAction && <p>建议：{finding.suggestedAction}</p>}
          {!!finding.evidence.length && <details><summary>查看依据</summary>{finding.evidence.map((evidence, index) => <div key={index}>
            <p>{[evidence.sourceTitle, evidence.sourceVersion, evidence.section, evidence.sourceLocator].filter(Boolean).join(' · ')}</p>
            <p>{evidence.excerpt}</p>{evidence.usageScope && <p>适用范围：{evidence.usageScope}</p>}
          </div>)}</details>}
        </article>)}</div>
        {(review.evaluation.failureCodes.length > 0 || !review.evaluation.evaluationId) && <Alert tone="warning">
          提交时的规则评价不完整，请结合处方和患者资料核对。
          {review.evaluation.failureCodes.join('、')}
        </Alert>}
        {review.evaluation.decision === 'PASS' && review.evaluation.evaluationId && !review.evaluation.failureCodes.length
          && <p>本次已执行规则未触发控制，仍需完成药学审核。</p>}
      </div>)}
  </section>
}
