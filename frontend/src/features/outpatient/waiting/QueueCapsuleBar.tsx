import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Icon } from '../../../shared/ui'
import {
  DEFAULT_DISPATCH_RULES,
  announceQueueCall,
  determineNextCallCandidate,
} from './queueDispatchService'
import type { DispatchRuleConfig, EnhancedQueueItem } from './queueTypes'

export interface QueueCapsuleBarProps {
  items: EnhancedQueueItem[]
  currentEncounterId: string | null
  currentResidentName: string
  canEdit: boolean
  busy?: boolean
  onCallAndEnterNext: (item: EnhancedQueueItem) => void
  onRecallCurrent?: () => void
  onSkipAndPostpone?: () => void
  onSuspendCurrent: () => void
  onOpenPeekDrawer: () => void
  rules?: DispatchRuleConfig
}

export function QueueCapsuleBar({
  items,
  currentResidentName,
  canEdit,
  busy = false,
  onCallAndEnterNext,
  onRecallCurrent,
  onSkipAndPostpone,
  onSuspendCurrent,
  onOpenPeekDrawer,
  rules = DEFAULT_DISPATCH_RULES,
}: QueueCapsuleBarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 统计数据
  const counts = useMemo(() => {
    const active = items.filter((i) => i.queueCategory !== 'SKIPPED')
    const waiting = items.filter((i) => i.status === 'WAITING' && i.queueCategory !== 'SKIPPED')
    const returnVisitReady = items.filter(
      (i) => i.queueCategory === 'RETURN_VISIT' && i.reportSummary?.allReportsReady
    )
    const criticalWaiting = items.filter(
      (i) => i.status === 'WAITING' && i.triageLevel === 'LEVEL_1_CRITICAL'
    )
    return {
      totalActive: active.length,
      waiting: waiting.length,
      initial: items.filter((i) => i.queueCategory === 'INITIAL').length,
      returnVisit: items.filter((i) => i.queueCategory === 'RETURN_VISIT').length,
      returnVisitReady: returnVisitReady.length,
      priority: items.filter((i) => i.queueCategory === 'PRIORITY').length,
      suspended: items.filter((i) => i.queueCategory === 'SUSPENDED').length,
      criticalCount: criticalWaiting.length,
    }
  }, [items])

  // 下一位候选人
  const nextCandidate = useMemo(() => {
    return determineNextCallCandidate(items, rules)
  }, [items, rules])

  const candidate = nextCandidate.candidate
  const hasCriticalAlert = counts.criticalCount > 0

  // 快捷键支持：按 F8 或 Alt+Q 呼出悬浮控制岛
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F8' || (event.altKey && (event.key === 'q' || event.key === 'Q'))) {
        event.preventDefault()
        setPopoverOpen((prev) => !prev)
      }
      if (event.key === 'Escape' && popoverOpen) {
        setPopoverOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [popoverOpen])

  // 点击外部收起 Popover
  useEffect(() => {
    if (!popoverOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [popoverOpen])

  const handleQuickCallAndEnter = () => {
    if (!candidate) return
    announceQueueCall(candidate.ticketNo, candidate.residentName, '1号诊室', {
      enabled: rules.voiceEnabled,
      volume: rules.voiceVolume,
    })
    setPopoverOpen(false)
    onCallAndEnterNext(candidate)
  }

  return (
    <div ref={containerRef} className="queue-capsule-container">
      {/* 微型常态胶囊 (高度 26~28px，零空间挤占) */}
      <div
        className={`queue-mini-pill ${hasCriticalAlert ? 'is-pulsing-critical' : ''} ${popoverOpen ? 'is-active' : ''}`}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        aria-label={`候诊协同胶囊: 候诊 ${counts.waiting} 人, 回诊 ${counts.returnVisit} 人, 快捷键 F8`}
        onClick={() => setPopoverOpen(!popoverOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setPopoverOpen(!popoverOpen)
          }
        }}
        title="点击或按 F8 展开候诊协同控制岛"
      >
        <span className="pill-segment pill-segment--count">
          <Icon name="residents" />
          <span>候诊 <strong>{counts.waiting}</strong></span>
        </span>

        {counts.returnVisit > 0 && (
          <span className="pill-segment pill-segment--return">
            <span className="dot-indicator tone-purple" />
            <span>回诊 <strong>{counts.returnVisit}</strong>{counts.returnVisitReady > 0 && ` (${counts.returnVisitReady}全)`}</span>
          </span>
        )}

        {hasCriticalAlert && (
          <span className="pill-segment pill-segment--critical">
            <span className="dot-indicator tone-danger pulse" />
            <span>危急 <strong>{counts.criticalCount}</strong></span>
          </span>
        )}

        <span className="pill-segment pill-segment--action">
          <Icon name="notification" />
          <span>呼下一位 {candidate ? `(${candidate.residentName})` : ''}</span>
          <Icon name="chevron-down" className={`chevron ${popoverOpen ? 'is-expanded' : ''}`} />
        </span>
      </div>

      {/* 悬浮展开操作岛 (Floating Action Pod - 唤醒态，挥之即去) */}
      {popoverOpen && (
        <div
          className="floating-action-pod"
          role="dialog"
          aria-label="候诊协同控制岛"
        >
          {/* 头部统计 */}
          <div className="pod-header">
            <div className="pod-title">
              <Icon name="clinical" />
              <strong>候诊协同控制岛</strong>
              <small className="pod-shortcut">快捷键 F8</small>
            </div>
            <button
              type="button"
              className="pod-close-btn"
              onClick={() => setPopoverOpen(false)}
              aria-label="关闭控制岛"
            >
              <Icon name="close" />
            </button>
          </div>

          {/* 队列分布条 */}
          <div className="pod-distribution-bar">
            <span>全部 <strong>{counts.totalActive}</strong></span>
            <span className="sep">·</span>
            <span>初诊 <strong>{counts.initial}</strong></span>
            <span className="sep">·</span>
            <span className="color-purple">回诊 <strong>{counts.returnVisit}</strong></span>
            <span className="sep">·</span>
            <span className="color-gold">优抚 <strong>{counts.priority}</strong></span>
            <span className="sep">·</span>
            <span>暂挂 <strong>{counts.suspended}</strong></span>
          </div>

          {/* 下一位预备患者简报 */}
          <div className="pod-candidate-card">
            <div className="candidate-badge">
              <span className="badge-tag">🔜 下一位预备呼叫</span>
              <span className="badge-rule">{nextCandidate.reason}</span>
            </div>

            {candidate ? (
              <div className="candidate-details">
                <div className="candidate-main-line">
                  <span className="candidate-ticket">{candidate.ticketNo}</span>
                  <strong className="candidate-name">{candidate.residentName}</strong>
                  <span className="candidate-demographics">
                    {candidate.gender === 'MALE' ? '男' : candidate.gender === 'FEMALE' ? '女' : ''} ·{' '}
                    {candidate.birthDate ? `${new Date().getFullYear() - parseInt(candidate.birthDate.slice(0, 4), 10)}岁` : ''}
                  </span>
                  {candidate.triageLevel === 'LEVEL_1_CRITICAL' && (
                    <span className="critical-tag">🔴 危急</span>
                  )}
                  {candidate.queueCategory === 'RETURN_VISIT' && (
                    <span className="return-tag">🟣 回诊就绪</span>
                  )}
                </div>

                {candidate.vitals && (
                  <div className="candidate-vitals-line">
                    <span>🩺 体征: </span>
                    <strong className={candidate.vitals.systolic && candidate.vitals.systolic >= 140 ? 'color-danger' : ''}>
                      {candidate.vitals.systolic}/{candidate.vitals.diastolic} mmHg
                    </strong>
                    <span className="sep">|</span>
                    <span>脉搏 {candidate.vitals.pulseRate} 次/分</span>
                    <span className="sep">|</span>
                    <span>体温 {candidate.vitals.temperature} ℃</span>
                  </div>
                )}

                {candidate.aiPreConsultation && (
                  <div className="candidate-ai-quote">
                    <Icon name="sparkles" />
                    <span>{candidate.aiPreConsultation.chiefComplaintSummary}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="candidate-empty">
                <p>当前队列无候诊患者，诊室空闲</p>
              </div>
            )}
          </div>

          {/* 快捷控制操作组 */}
          <div className="pod-actions-grid">
            <Button
              variant="primary"
              size="sm"
              className="pod-btn-primary"
              disabled={!candidate || busy || !canEdit}
              title={candidate ? `呼叫并直接接诊 ${candidate.residentName}（自动保存并平滑切换）` : '无候诊患者'}
              onClick={handleQuickCallAndEnter}
            >
              <Icon name="notification" />
              <span>呼叫并接诊下一位</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !onRecallCurrent}
              onClick={() => {
                onRecallCurrent?.()
                setPopoverOpen(false)
              }}
              title={`重新播报呼叫当前患者 ${currentResidentName}`}
            >
              <Icon name="refresh" />
              <span>重呼当前</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !onSkipAndPostpone}
              onClick={() => {
                onSkipAndPostpone?.()
                setPopoverOpen(false)
              }}
              title="将未到患者标记为过号并自动顺延插入"
            >
              <Icon name="chevron-right" />
              <span>设为过号顺延</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                onSuspendCurrent()
                setPopoverOpen(false)
              }}
              title="挂起当前接诊就诊"
            >
              <Icon name="calendar" />
              <span>暂挂当前就诊</span>
            </Button>
          </div>

          {/* 底部完整队列/抽屉入口 */}
          <div className="pod-footer">
            <button
              type="button"
              className="pod-drawer-trigger"
              onClick={() => {
                setPopoverOpen(false)
                onOpenPeekDrawer()
              }}
            >
              <Icon name="tasks" />
              <span>展开侧拉透视抽屉 (查看完整队列) ↗</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
