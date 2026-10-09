import { useEffect, useState } from 'react'
import type { RhnApi } from '../../../shared/rhnApi'
import type {
  ClinicalAiEvidenceChainResult,
  ClinicalAiEvidenceCheckpoint,
  ClinicalAiGapOrder,
  ClinicalAiDraftContext,
} from '../../../shared/api/clinicalAiApi'
import { Alert, Button, LoadingState, EmptyState, Icon } from '../../../shared/ui'
import { ClinicalKnowledgePanel } from './ClinicalKnowledgePanel'
import './clinical-evidence.css'

export interface ClinicalEvidenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  encounterId: string
  targetDiagnosis: { code: string; display: string } | null
  context?: ClinicalAiDraftContext | null
  api: RhnApi
  onApplyGapOrders?: (orders: ClinicalAiGapOrder[]) => void | Promise<void>
  onOpenWikiDoc?: (params: { id?: string; name?: string; type?: string }) => void
}

const checkpointTypeLabels: Record<string, string> = {
  VITAL: '体征指标',
  SYMPTOM: '症状主诉',
  EXAMINATION: '查体体征',
  DIFFERENTIAL: '鉴别依据',
  RISK_FACTOR: '危险因素',
  GAP_EXAM: '待补检查',
}

function checkpointTypeLabel(checkpoint: ClinicalAiEvidenceCheckpoint) {
  return checkpointTypeLabels[checkpoint.type] || '临床依据'
}

export function ClinicalEvidenceDrawer({
  isOpen,
  onClose,
  encounterId,
  targetDiagnosis,
  context,
  api,
  onApplyGapOrders,
  onOpenWikiDoc,
}: ClinicalEvidenceDrawerProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClinicalAiEvidenceChainResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

  useEffect(() => {
    if (!isOpen || !encounterId || !targetDiagnosis) {
      setResult(null)
      setError(null)
      setLoading(false)
      setSelectedOrderIds([])
      setApplyError('')
      return
    }

    let active = true
    setLoading(true)
    setError(null)
    setApplyError('')

    // 构建生命体征字典
    const vitals: Record<string, unknown> = {}
    if (context?.systolic != null) vitals.systolic = context.systolic
    if (context?.diastolic != null) vitals.diastolic = context.diastolic
    if (context?.pulseRate != null) vitals.heartRate = context.pulseRate
    if (context?.temperature != null) vitals.temperature = context.temperature
    if (context?.weightKg != null) vitals.weightKg = context.weightKg

    api.clinicalAi
      .getEvidenceChain(encounterId, {
        diagnosis: targetDiagnosis.display,
        diagnosisCode: targetDiagnosis.code,
        chiefComplaint: context?.chiefComplaint,
        presentIllness: context?.presentIllness,
        physicalExam: context?.physicalExam,
        medicalHistory: context?.medicalHistory,
        vitals,
      })
      .then((data) => {
        if (!active) return
        setResult(data)
        const initialSelected = (data.gapOrders || [])
          .filter((order) => order.defaultChecked !== false)
          .map((order) => order.id)
        setSelectedOrderIds(initialSelected)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || '生成循证推导证据链失败')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, encounterId, targetDiagnosis, context, api])

  if (!isOpen) return null

  const handleToggleOrder = (id: string) => {
    setSelectedOrderIds((curr) =>
      curr.includes(id) ? curr.filter((item) => item !== id) : [...curr, id]
    )
  }

  const handleToggleAllOrders = () => {
    if (!result?.gapOrders) return
    if (selectedOrderIds.length === result.gapOrders.length) {
      setSelectedOrderIds([])
    } else {
      setSelectedOrderIds(result.gapOrders.map((o) => o.id))
    }
  }

  const handleExecuteOrders = async () => {
    if (!result?.gapOrders || !onApplyGapOrders || selectedOrderIds.length === 0) return
    const ordersToApply = result.gapOrders.filter((o) => selectedOrderIds.includes(o.id))
    try {
      setApplying(true)
      setApplyError('')
      await onApplyGapOrders(ordersToApply)
      onClose()
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : '建议项目未能带入医嘱，请稍后重试')
    } finally {
      setApplying(false)
    }
  }

  const checkpoints = result?.checkpoints || []
  const metCheckpoints = checkpoints.filter((cp) => cp.status === 'MET')
  const suggestedCheckpoints = checkpoints.filter((cp) => cp.status === 'SUGGESTED')
  const gapOrders = result?.gapOrders || []
  const guidelines = result?.guidelines || []

  return (
    <ClinicalKnowledgePanel
      title={`推荐依据 · ${targetDiagnosis?.display || '诊断推导'}`}
      onClose={onClose}
    >
      {loading && <LoadingState label="正在整理当前诊断的推荐依据…" />}

      {!loading && (error || !result) && (
        <EmptyState
          icon="error"
          title="推荐依据暂不可用"
          copy={error || '未能成功获取当前诊断的证据链推导，请确认临床知识库服务正常运行。'}
        />
      )}

      {!loading && result && (
        <div className="clinical-evidence-drawer">
          {applyError && <Alert tone="warning" duration={null}>{applyError}</Alert>}
          <div className="clinical-evidence-header-card">
            <div className="clinical-evidence-header-title">
              <span className="clinical-evidence-header-main-title">
                推荐诊断：{result.diagnosis?.name || targetDiagnosis?.display}
              </span>
              {result.protocolTitle && <span className="clinical-evidence-diag-badge">{result.protocolTitle}</span>}
            </div>
            <p className="clinical-evidence-summary">
              {result.summary || '已根据当前病历信息整理诊断依据。'}
            </p>
          </div>

          <div className="clinical-evidence-section">
            <h3 className="clinical-evidence-section-title">
              <span>诊断依据</span>
              <span className="clinical-evidence-section-subtitle">
                满足 {metCheckpoints.length} 项 · 待补 {suggestedCheckpoints.length} 项
              </span>
            </h3>

            <div className="evidence-checklist">
              {metCheckpoints.map((cp, idx) => (
                <div key={`met-${idx}`} className="evidence-check-item is-met">
                  <div className="evidence-check-header">
                    <span className="evidence-status-pill is-met">
                      <Icon name="check" /> 已满足
                    </span>
                    <span className="evidence-type-tag">{checkpointTypeLabel(cp)}</span>
                    <strong className="evidence-label">{cp.label}</strong>
                  </div>
                  <p className="evidence-detail">{cp.detail}</p>
                  {cp.sourceQuote && (
                    <div className="evidence-quote">来源摘录：“{cp.sourceQuote}”</div>
                  )}
                </div>
              ))}

              {suggestedCheckpoints.map((cp, idx) => (
                <div key={`sug-${idx}`} className="evidence-check-item is-suggested">
                  <div className="evidence-check-header">
                    <span className="evidence-status-pill is-suggested">
                      <Icon name="warning" /> 建议补充
                    </span>
                    <span className="evidence-type-tag">{checkpointTypeLabel(cp)}</span>
                    <strong className="evidence-label">{cp.label}</strong>
                  </div>
                  <p className="evidence-detail">{cp.detail}</p>
                  {cp.sourceQuote && (
                    <div className="evidence-quote">来源摘录：“{cp.sourceQuote}”</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {gapOrders.length > 0 && (
            <div className="clinical-evidence-section">
              <h3 className="clinical-evidence-section-title">
                <span>建议补充的检验检查</span>
                <span className="clinical-evidence-section-subtitle">
                  用于补充诊断依据
                </span>
              </h3>

              <div className="gap-orders-container">
                <div className="gap-orders-list">
                  {gapOrders.map((order) => {
                    const isChecked = selectedOrderIds.includes(order.id)
                    return (
                      <div
                        key={order.id}
                        className="gap-order-item"
                        onClick={() => handleToggleOrder(order.id)}
                      >
                        <input
                          type="checkbox"
                          className="gap-order-checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleOrder(order.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`选择医嘱 ${order.name}`}
                        />
                        <div className="gap-order-info">
                          <div className="gap-order-name-row">
                            <strong className="gap-order-name">{order.name}</strong>
                            <span className="gap-order-type-badge">
                              {order.category === 'LABORATORY' ? '检验' : '检查'}
                            </span>
                            <span className="gap-order-dept">{order.dept}</span>
                          </div>
                          <div className="gap-order-indication">
                            推荐依据：{order.indication}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="gap-orders-action-bar">
                  <Button size="sm" variant="text" onClick={handleToggleAllOrders}>
                    {selectedOrderIds.length === gapOrders.length ? '取消全选' : '全部勾选'}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={selectedOrderIds.length === 0 || !onApplyGapOrders || applying}
                    busy={applying}
                    onClick={handleExecuteOrders}
                  >
                    <Icon name="check" />
                    带入医嘱（已选 {selectedOrderIds.length} 项）
                  </Button>
                </div>
              </div>
            </div>
          )}

          {guidelines.length > 0 && (
            <div className="clinical-evidence-section">
              <h3 className="clinical-evidence-section-title">
                <span>参考资料</span>
              </h3>

              <div className="guideline-card-list">
                {guidelines.map((guide) => (
                  <div key={guide.id} className="guideline-ref-card">
                    <div className="guideline-ref-head">
                      <div>
                        <div className="guideline-ref-title">{guide.title}</div>
                        <div className="guideline-ref-meta">
                          {guide.authority && <span>{guide.authority}</span>}
                          {guide.publishYear && <span>{guide.publishYear}年版</span>}
                          {guide.chapter && <span>{guide.chapter}</span>}
                        </div>
                      </div>
                      {onOpenWikiDoc && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            onOpenWikiDoc({
                              id: guide.id,
                              name: guide.title,
                              type: 'guideline',
                            })
                          }
                        >
                          <Icon name="clinical" />
                          查看全文
                        </Button>
                      )}
                    </div>

                    {guide.keyExcerpts && guide.keyExcerpts.length > 0 && (
                      <div>
                        <span className="guideline-ref-excerpts-title">
                          相关摘录：
                        </span>
                        <ul className="guideline-ref-excerpts">
                          {guide.keyExcerpts.map((excerpt, idx) => (
                            <li key={idx}>{excerpt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ClinicalKnowledgePanel>
  )
}
