import { useEffect, useRef, useState } from 'react'
import type { RhnApi } from '../../../shared/rhnApi'
import type {
  ClinicalAiEvidenceChainResult,
  ClinicalAiEvidenceCheckpoint,
  ClinicalAiTreatmentMatch,
  ClinicalAiTreatmentRecommendation,
  ClinicalAiSuggestion,
  ClinicalAiDraftContext,
} from '../../../shared/api/clinicalAiApi'
import { Alert, Button, LoadingState, EmptyState, Icon } from '../../../shared/ui'
import { ClinicalKnowledgePanel } from './ClinicalKnowledgePanel'
import { ClinicalAiCatalogReview } from './ClinicalAiCatalogReview'
import './clinical-evidence.css'

export interface ClinicalEvidenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  encounterId: string
  organizationId?: string
  targetDiagnosis: { code: string; display: string } | null
  context?: ClinicalAiDraftContext | null
  sourceSuggestion?: ClinicalAiSuggestion | null
  api: RhnApi
  onApplyGapOrders?: (orders: ClinicalAiTreatmentRecommendation[]) => void | Promise<void>
  onOpenWikiDoc?: (params: { id?: string; name?: string; type?: string }) => void
}

const checkpointTypeLabels: Record<string, string> = {
  VITAL: '体征指标',
  SYMPTOM: '症状主诉',
  EXAMINATION: '查体体征',
  DIFFERENTIAL: '鉴别依据',
  RISK_FACTOR: '危险因素',
  GAP_EXAM: '待补检查',
  EVIDENCE_GAP: '依据待补充',
}

function checkpointTypeLabel(checkpoint: ClinicalAiEvidenceCheckpoint) {
  return checkpointTypeLabels[checkpoint.type] || '临床依据'
}

export function ClinicalEvidenceDrawer({
  isOpen,
  onClose,
  encounterId,
  organizationId,
  targetDiagnosis,
  context,
  sourceSuggestion,
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
  const [catalog, setCatalog] = useState<{ selection: string; matches: ClinicalAiTreatmentMatch[] } | null>(null)
  const epoch = useRef(0)
  const applyOrders = useRef(onApplyGapOrders)
  applyOrders.current = onApplyGapOrders
  const diagnosisCode = targetDiagnosis?.code
  const diagnosis = targetDiagnosis?.display
  const sourceSuggestionId = sourceSuggestion?.id
  const recommendationReason = sourceSuggestion?.diagnosisCandidates.find(item => item.code === diagnosisCode)?.rationale
  const {
    chiefComplaint, presentIllness, physicalExam, medicalHistory,
    systolic, diastolic, pulseRate, temperature, weightKg,
  } = context ?? {}

  // Depend on evidence inputs, not the identity of parent-created diagnosis/context objects.
  useEffect(() => {
    const requestEpoch = ++epoch.current
    setApplying(false)
    setCatalog(null)
    if (!isOpen || !encounterId || diagnosis == null || diagnosisCode == null) {
      setResult(null)
      setError(null)
      setLoading(false)
      setSelectedOrderIds([])
      setApplyError('')
      return () => { epoch.current += 1 }
    }

    let active = true
    setLoading(true)
    setResult(null)
    setSelectedOrderIds([])
    setError(null)
    setApplyError('')

    // 构建生命体征字典
    const vitals: Record<string, unknown> = {}
    if (systolic != null) vitals.systolic = systolic
    if (diastolic != null) vitals.diastolic = diastolic
    if (pulseRate != null) vitals.heartRate = pulseRate
    if (temperature != null) vitals.temperature = temperature
    if (weightKg != null) vitals.weightKg = weightKg

    api.clinicalAi
      .getEvidenceChain(encounterId, {
        diagnosis,
        diagnosisCode,
        chiefComplaint,
        presentIllness,
        physicalExam,
        medicalHistory,
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
      if (epoch.current === requestEpoch) epoch.current += 1
    }
  }, [isOpen, encounterId, diagnosis, diagnosisCode, sourceSuggestionId, chiefComplaint, presentIllness,
    physicalExam, medicalHistory, systolic, diastolic, pulseRate, temperature, weightKg, api])

  if (!isOpen) return null

  const handleToggleOrder = (id: string) => {
    if (applying) return
    setCatalog(null)
    setSelectedOrderIds((curr) =>
      curr.includes(id) ? curr.filter((item) => item !== id) : [...curr, id]
    )
  }

  const handleToggleAllOrders = () => {
    if (applying) return
    setCatalog(null)
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
    const selection = selectedOrderIds.slice().sort().join('|')
    const requestEpoch = epoch.current
    try {
      setApplying(true)
      setApplyError('')
      const matches = catalog?.selection === selection ? catalog.matches : await api.clinicalAi.resolveTreatments(encounterId,
        ordersToApply.map(order => ({ type: order.category, name: order.name, rationale: order.indication })))
      if (epoch.current !== requestEpoch) return
      setCatalog({ selection, matches })
      if (!matches.length) throw new Error('未返回目录匹配结果，请重试。')
      if (matches.some(match => match.status !== 'MATCHED')) {
        setApplyError('请先核对以下院内项目。')
        return
      }
      if (!applyOrders.current) throw new Error('当前无法带入医嘱，请重新核对。')
      await applyOrders.current([...new Map(matches.flatMap(match => match.candidates)
        .map(item => [`${item.type}:${item.catalogItemId}`, item])).values()])
      if (epoch.current === requestEpoch) onClose()
    } catch (err) {
      if (epoch.current === requestEpoch) setApplyError(err instanceof Error ? err.message : '建议项目未能带入医嘱，请稍后重试')
    } finally {
      if (epoch.current === requestEpoch) setApplying(false)
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
            {recommendationReason && <p className="clinical-evidence-summary"><strong>本轮 AI 推荐理由：</strong>{recommendationReason}</p>}
            <div className="clinical-evidence-header-title">
              <span className="clinical-evidence-header-main-title">
                推荐诊断：{result.diagnosis?.name || targetDiagnosis?.display}
              </span>
              {result.protocolTitle && <span className="clinical-evidence-diag-badge">{result.protocolTitle}</span>}
            </div>
            <p className="clinical-evidence-summary">
              {result.summary || '暂无对应知识库依据，请结合实际临床资料核对。'}
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
                          disabled={applying} onChange={() => handleToggleOrder(order.id)}
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

                {catalog && <ClinicalAiCatalogReview layout="compact" key={catalog.selection} matches={catalog.matches.filter(match => match.status !== 'MATCHED')}
                  api={api} encounterId={encounterId} organizationId={organizationId} disabled={applying}
                  onResolved={(keys, items) => {
                    setCatalog(previous => previous && ({ ...previous, matches: previous.matches.map(match => keys.includes(match.key)
                      ? { ...match, status: 'MATCHED', candidates: items } : match) }))
                    setApplyError('')
                  }} />}
                <div className="gap-orders-action-bar">
                  <Button size="sm" variant="text" disabled={applying} onClick={handleToggleAllOrders}>
                    {selectedOrderIds.length === gapOrders.length ? '取消全选' : '全部勾选'}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={selectedOrderIds.length === 0 || !onApplyGapOrders || applying || Boolean(catalog?.matches.some(match => match.status !== 'MATCHED'))}
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
