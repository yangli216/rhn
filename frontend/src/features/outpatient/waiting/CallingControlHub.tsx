import { useState } from 'react'
import { Button, Icon } from '../../../shared/ui'
import type { CallingState, DispatchRuleConfig, EnhancedQueueItem } from './queueTypes'
import type { NextCandidateResult } from './queueDispatchService'

export interface CallingControlHubProps {
  callingState: CallingState
  nextCandidate: NextCandidateResult
  currentCalledPatient: EnhancedQueueItem | null
  currentServingPatient: EnhancedQueueItem | null
  rules: DispatchRuleConfig
  onUpdateRules: (rules: DispatchRuleConfig) => void
  onCallNext: () => void
  onRecallCurrent: () => void
  onSkipCurrent: () => void
  onSuspendCurrent?: () => void
  busy?: boolean
}

export function CallingControlHub({
  callingState,
  nextCandidate,
  currentCalledPatient,
  currentServingPatient,
  rules,
  onUpdateRules,
  onCallNext,
  onRecallCurrent,
  onSkipCurrent,
  onSuspendCurrent,
  busy = false,
}: CallingControlHubProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const candidate = nextCandidate.candidate
  const candidateLabel = candidate
    ? `(${candidate.ticketNo} ${candidate.residentName})`
    : '(队列空)'

  return (
    <div className="calling-hub" role="region" aria-label="门诊全局叫号控制中枢">
      <div className="calling-hub__main">
        {/* 叫号主动作组 */}
        <div className="calling-hub__actions">
          <Button
            variant="primary"
            size="md"
            className="calling-hub__btn-primary"
            disabled={!candidate || busy}
            busy={busy}
            title={nextCandidate.reason}
            onClick={onCallNext}
            aria-label={`呼叫下一位 ${candidate ? `${candidate.ticketNo} ${candidate.residentName}` : ''}`}
          >
            <Icon name="notification" />
            <span>呼叫下一位 <strong>{candidateLabel}</strong></span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={!currentCalledPatient || busy}
            onClick={onRecallCurrent}
            title={currentCalledPatient ? `重新呼叫 ${currentCalledPatient.residentName}` : '当前无已叫号患者'}
            aria-label="重新呼叫当前患者"
          >
            <Icon name="refresh" />
            <span>重呼当前</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={!currentCalledPatient || busy}
            onClick={onSkipCurrent}
            title="将当前呼叫未到的患者设为过号并顺延重排"
            aria-label="设为过号并顺延"
          >
            <Icon name="chevron-right" />
            <span>设为过号</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={!currentServingPatient || !onSuspendCurrent || busy}
            onClick={onSuspendCurrent}
            title="暂时挂起当前患者就诊"
            aria-label="暂挂当前接诊"
          >
            <Icon name="calendar" />
            <span>暂挂就诊</span>
          </Button>
        </div>

        {/* 呼叫状态与穿插提示 */}
        <div className="calling-hub__status">
          {callingState.callingTicketNo ? (
            <div className="calling-broadcast-indicator is-calling">
              <span className="pulse-dot" />
              <span>
                正在呼叫：<strong>{callingState.callingTicketNo}</strong> {callingState.callingPatientName}
              </span>
            </div>
          ) : currentServingPatient ? (
            <div className="calling-broadcast-indicator is-inservice">
              <span className="status-dot tone-success" />
              <span>
                当前接诊：<strong>{currentServingPatient.ticketNo}</strong> {currentServingPatient.residentName}
              </span>
            </div>
          ) : (
            <div className="calling-broadcast-indicator is-idle">
              <span className="status-dot tone-neutral" />
              <span>诊室空闲，等待呼叫患者</span>
            </div>
          )}

          <div className="calling-dispatch-hint" title={nextCandidate.reason}>
            <span className="hint-pill">
              顺位规则: {nextCandidate.reason}
            </span>
          </div>

          <button
            type="button"
            className="calling-settings-trigger"
            aria-label="呼叫与调度规则设置"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Icon name="settings" />
            <span>规则设置</span>
          </button>
        </div>
      </div>

      {/* 呼叫设置浮层 */}
      {settingsOpen && (
        <div className="calling-settings-popover" role="dialog" aria-label="叫号与调度规则设置">
          <div className="calling-settings-popover__header">
            <h4>叫号与智能排队设置</h4>
            <button
              type="button"
              className="settings-close-btn"
              onClick={() => setSettingsOpen(false)}
              aria-label="关闭设置"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="calling-settings-popover__body">
            <div className="settings-field">
              <label>
                <strong>回诊穿插比例</strong>
                <small>每呼叫/接诊 N 位初诊，自动轮换呼叫 1 位回诊看报告患者</small>
              </label>
              <div className="ratio-selector">
                {[1, 2, 3, 4].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    className={`ratio-btn ${rules.initialToReturnRatio === ratio ? 'is-active' : ''}`}
                    onClick={() => onUpdateRules({ ...rules, initialToReturnRatio: ratio })}
                  >
                    {ratio}:1
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field">
              <label>
                <strong>过号顺延位数</strong>
                <small>患者过号到诊报到后，自动顺延插入队列的位数</small>
              </label>
              <div className="ratio-selector">
                {[2, 3, 5].map((steps) => (
                  <button
                    key={steps}
                    type="button"
                    className={`ratio-btn ${rules.skipPostponeSteps === steps ? 'is-active' : ''}`}
                    onClick={() => onUpdateRules({ ...rules, skipPostponeSteps: steps })}
                  >
                    顺延 {steps} 位
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field">
              <label>
                <strong>优抚绿通优先抢占</strong>
                <small>高龄老人、军人及急危重症患者直接排在顺位第一位</small>
              </label>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={rules.priorityFirst}
                  onChange={(e) => onUpdateRules({ ...rules, priorityFirst: e.target.checked })}
                />
                <span>开启绿色通道优先</span>
              </label>
            </div>

            <div className="settings-field">
              <label>
                <strong>智能语音叫号播报</strong>
                <small>呼叫时通过诊室扬声器自动播报“请 X 号 到 1 号诊室就诊”</small>
              </label>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={rules.voiceEnabled}
                  onChange={(e) => onUpdateRules({ ...rules, voiceEnabled: e.target.checked })}
                />
                <span>启用语音播报</span>
              </label>
            </div>

            {rules.voiceEnabled && (
              <div className="settings-field">
                <label>
                  <strong>播报音量: {Math.round(rules.voiceVolume * 100)}%</strong>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={rules.voiceVolume}
                  onChange={(e) => onUpdateRules({ ...rules, voiceVolume: parseFloat(e.target.value) })}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
