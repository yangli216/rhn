import { Button, Icon, StatusBadge } from '../../../shared/ui'
import type { EnhancedQueueItem } from './queueTypes'

export interface PreEncounterBriefingCardProps {
  item: EnhancedQueueItem
  onClose: () => void
  onEnter: () => void
  busy?: boolean
  canEdit?: boolean
}

export function PreEncounterBriefingCard({
  item,
  onClose,
  onEnter,
  busy = false,
  canEdit = true,
}: PreEncounterBriefingCardProps) {
  const isCritical = item.triageLevel === 'LEVEL_1_CRITICAL'
  const isUrgent = item.triageLevel === 'LEVEL_2_URGENT'

  return (
    <div className="briefing-overlay" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
      <div className="briefing-card">
        <header className="briefing-header">
          <div className="briefing-header__title">
            <span className="briefing-ticket">{item.ticketNo}</span>
            <div>
              <h3 id="briefing-title">
                {item.residentName}
                <small className="briefing-meta">
                  {item.gender === 'MALE' ? '男' : item.gender === 'FEMALE' ? '女' : '未知'} ·{' '}
                  {item.birthDate ? `${new Date().getFullYear() - parseInt(item.birthDate.slice(0, 4), 10)} 岁` : ''} ·{' '}
                  {item.healthRecordNo}
                </small>
              </h3>
              <div className="briefing-tags">
                <StatusBadge tone={isCritical ? 'danger' : isUrgent ? 'warning' : 'neutral'}>
                  {isCritical ? '🔴 危急抢救' : isUrgent ? '🟡 重点关注' : '🟢 常规候诊'}
                </StatusBadge>
                {item.publicHealthTags?.chronicLabel && (
                  <span className="briefing-tag briefing-tag--chronic">
                    🩺 {item.publicHealthTags.chronicLabel}
                  </span>
                )}
                {item.queueCategory === 'RETURN_VISIT' && (
                  <span className="briefing-tag briefing-tag--return">
                    🟣 回诊看报告
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="briefing-close-btn"
            onClick={onClose}
            aria-label="关闭临床画像卡"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="briefing-body">
          {/* 分诊生命体征 */}
          {item.vitals && (
            <section className="briefing-section briefing-vitals">
              <h4 className="briefing-section__title">
                <Icon name="clinical" /> 分诊生命体征
                {item.triageReason && <span className="briefing-alert-text">（{item.triageReason}）</span>}
              </h4>
              <div className="briefing-vitals-grid">
                <div className={`vitals-item ${item.vitals.systolic && item.vitals.systolic >= 140 ? 'is-abnormal' : ''}`}>
                  <span>血压</span>
                  <strong>{item.vitals.systolic ?? '--'}/{item.vitals.diastolic ?? '--'} <small>mmHg</small></strong>
                </div>
                <div className={`vitals-item ${item.vitals.pulseRate && (item.vitals.pulseRate > 100 || item.vitals.pulseRate < 60) ? 'is-abnormal' : ''}`}>
                  <span>脉搏</span>
                  <strong>{item.vitals.pulseRate ?? '--'} <small>次/分</small></strong>
                </div>
                <div className={`vitals-item ${item.vitals.temperature && item.vitals.temperature >= 37.3 ? 'is-abnormal' : ''}`}>
                  <span>体温</span>
                  <strong>{item.vitals.temperature ?? '--'} <small>℃</small></strong>
                </div>
                <div className="vitals-item">
                  <span>血氧 (SpO2)</span>
                  <strong>{item.vitals.spo2 ?? '--'} <small>%</small></strong>
                </div>
              </div>
            </section>
          )}

          {/* AI 预问诊主诉与现病史 */}
          {item.aiPreConsultation && (
            <section className="briefing-section briefing-ai">
              <h4 className="briefing-section__title">
                <Icon name="sparkles" /> AI 预问诊画像提炼
              </h4>
              <div className="briefing-ai-summary">
                <div className="briefing-ai-quote">
                  <strong>一句话主诉：</strong>
                  <span>{item.aiPreConsultation.chiefComplaintSummary}</span>
                </div>
                <p className="briefing-ai-draft">
                  <strong>现病史草稿：</strong>{item.aiPreConsultation.presentIllnessDraft}
                </p>
                {item.aiPreConsultation.symptomTags?.length > 0 && (
                  <div className="briefing-symptoms">
                    {item.aiPreConsultation.symptomTags.map((tag) => (
                      <span key={tag} className="symptom-chip">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 高危警示与过敏史 */}
          <section className="briefing-section briefing-alerts">
            <h4 className="briefing-section__title">
              <Icon name="warning" /> ⚠️ 临床高危警示 & 过敏史
            </h4>
            <div className="briefing-alert-box">
              {item.allergies && item.allergies.length > 0 ? (
                <ul className="briefing-list briefing-list--danger">
                  {item.allergies.map((allergy, idx) => (
                    <li key={idx}><strong>药物过敏：</strong>{allergy}</li>
                  ))}
                </ul>
              ) : (
                <p className="briefing-empty-text">未登记明确药物过敏史</p>
              )}
              {item.aiPreConsultation?.riskFlags && item.aiPreConsultation.riskFlags.length > 0 && (
                <div className="briefing-risks">
                  {item.aiPreConsultation.riskFlags.map((flag, idx) => (
                    <span key={idx} className="risk-badge">🚨 {flag}</span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 既往慢性病与长期用药 */}
          <div className="briefing-two-columns">
            <section className="briefing-section">
              <h4 className="briefing-section__title">
                <Icon name="tasks" /> 既往慢性病史
              </h4>
              {item.pastConditions && item.pastConditions.length > 0 ? (
                <ul className="briefing-list">
                  {item.pastConditions.map((cond, idx) => (
                    <li key={idx}>{cond}</li>
                  ))}
                </ul>
              ) : (
                <p className="briefing-empty-text">暂无既往慢性病史记录</p>
              )}
            </section>

            <section className="briefing-section">
              <h4 className="briefing-section__title">
                <Icon name="pill" /> 长期/近期用药
              </h4>
              {item.currentMedications && item.currentMedications.length > 0 ? (
                <ul className="briefing-list">
                  {item.currentMedications.map((med, idx) => (
                    <li key={idx}>{med}</li>
                  ))}
                </ul>
              ) : (
                <p className="briefing-empty-text">无长期用药处方记录</p>
              )}
            </section>
          </div>

          {/* 检验检查就绪度 */}
          {item.reportSummary && (
            <section className="briefing-section briefing-reports">
              <h4 className="briefing-section__title">
                <Icon name="clinical" /> 检验检查报告回传统计 ({item.reportSummary.totalCompleted}/{item.reportSummary.totalRequested} 就绪)
              </h4>
              {item.reportSummary.items && (
                <div className="briefing-report-items">
                  {item.reportSummary.items.map((rep) => (
                    <div key={rep.id} className={`report-pill ${rep.abnormal ? 'is-abnormal' : ''}`}>
                      <span className="report-name">{rep.name}</span>
                      <span className="report-summary">{rep.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 近期就诊历程 */}
          {item.recentVisits && item.recentVisits.length > 0 && (
            <section className="briefing-section">
              <h4 className="briefing-section__title">
                <Icon name="calendar" /> 近期就诊足迹
              </h4>
              <ul className="briefing-list briefing-list--timeline">
                {item.recentVisits.map((visit, idx) => (
                  <li key={idx}>{visit}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="briefing-footer">
          <Button variant="secondary" onClick={onClose}>
            关闭画像
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!canEdit}
            title={canEdit ? `接诊 ${item.residentName}` : '当前账号无病历编辑权限'}
            onClick={() => {
              onClose()
              onEnter()
            }}
          >
            <Icon name="clinical" /> 立即接诊并代入预问诊
          </Button>
        </footer>
      </div>
    </div>
  )
}
