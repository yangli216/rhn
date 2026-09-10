import { useMemo, useState } from 'react'
import type { ClinicalContext } from '../../../app/AppShell'
import type { ReceptionQueueScope } from '../../../shared/api/schedulingApi'
import { Button, EmptyState, Icon, StatusBadge } from '../../../shared/ui'
import { CallingControlHub } from './CallingControlHub'
import { PreEncounterBriefingCard } from './PreEncounterBriefingCard'
import {
  DEFAULT_DISPATCH_RULES,
  announceQueueCall,
  determineNextCallCandidate,
  filterQueueItems,
} from './queueDispatchService'
import type {
  CallingState,
  DispatchRuleConfig,
  EnhancedQueueItem,
  QueueTabFilter,
} from './queueTypes'

export interface DedicatedWaitingWorkspaceProps {
  items: EnhancedQueueItem[]
  queueScope?: ReceptionQueueScope
  onQueueScopeChange?: (scope: ReceptionQueueScope) => void
  clinicalContext: ClinicalContext
  canEdit: boolean
  busy: boolean
  onEnter: (item: EnhancedQueueItem) => void
  onView: (item: EnhancedQueueItem) => void
  onRefresh: () => void
  onCallItem: (item: EnhancedQueueItem) => Promise<unknown>
  onMissItem: (item: EnhancedQueueItem) => Promise<unknown>
  onRequeueItem: (item: EnhancedQueueItem) => Promise<unknown>
  onSuspendItem?: (item: EnhancedQueueItem) => void
}

export function DedicatedWaitingWorkspace({
  items,
  queueScope = 'PERSONAL',
  onQueueScopeChange,
  clinicalContext,
  canEdit,
  busy,
  onEnter,
  onView,
  onRefresh,
  onCallItem,
  onMissItem,
  onRequeueItem,
  onSuspendItem,
}: DedicatedWaitingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<QueueTabFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [rules, setRules] = useState<DispatchRuleConfig>(DEFAULT_DISPATCH_RULES)
  const [consecutiveInitialCalls, setConsecutiveInitialCalls] = useState(0)
  const [briefingPatient, setBriefingPatient] = useState<EnhancedQueueItem | null>(null)
  const [doctorStatus, setDoctorStatus] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE')

  // 计算多 Tab 数量
  const tabCounts = useMemo(() => {
    return {
      ALL: items.filter((i) => !['SKIPPED', 'COMPLETED'].includes(i.queueCategory)).length,
      INITIAL: items.filter((i) => i.queueCategory === 'INITIAL').length,
      RETURN_VISIT: items.filter((i) => i.queueCategory === 'RETURN_VISIT').length,
      PRIORITY: items.filter((i) => i.queueCategory === 'PRIORITY').length,
      SUSPENDED: items.filter((i) => i.queueCategory === 'SUSPENDED').length,
      SKIPPED: items.filter((i) => i.queueCategory === 'SKIPPED').length,
      COMPLETED: items.filter((i) => i.status === 'COMPLETED').length,
    }
  }, [items])

  const currentCalled = useMemo(() => {
    return items.find((i) => i.status === 'CALLED') ?? null
  }, [items])

  const currentServing = useMemo(() => {
    return items.find((i) => i.status === 'SERVING') ?? null
  }, [items])

  const callingState = useMemo<CallingState>(() => currentCalled ? {
    activeCallingId: currentCalled.registrationId,
    callingTicketNo: currentCalled.ticketNo,
    callingPatientName: currentCalled.residentName,
    calledAt: currentCalled.calledAt,
  } : { activeCallingId: null }, [currentCalled])

  // 计算智能推荐的下一位呼叫候选人
  const nextCandidateResult = useMemo(() => {
    return determineNextCallCandidate(items, rules, consecutiveInitialCalls)
  }, [items, rules, consecutiveInitialCalls])

  // 经过 Tab 与关键词过滤后的列表
  const displayedItems = useMemo(() => {
    return filterQueueItems(items, activeTab, searchQuery)
  }, [items, activeTab, searchQuery])

  // 呼叫特定患者
  const handleCallItem = async (item: EnhancedQueueItem) => {
    try {
      await onCallItem(item)
      if (item.queueCategory === 'INITIAL') {
        setConsecutiveInitialCalls((prev) => prev + 1)
      } else if (item.queueCategory === 'RETURN_VISIT') {
        setConsecutiveInitialCalls(0)
      }
      announceQueueCall(item.ticketNo, item.residentName, `${clinicalContext.department.name || '门诊'}1号诊室`, {
        enabled: rules.voiceEnabled,
        volume: rules.voiceVolume,
      })
    } catch {
      // Mutation feedback is rendered by the parent workspace.
    }
  }

  // 呼叫下一位
  const handleCallNext = () => {
    if (nextCandidateResult.candidate) {
      void handleCallItem(nextCandidateResult.candidate)
    }
  }

  // 重呼当前患者
  const handleRecallCurrent = () => {
    if (currentCalled) {
      void handleCallItem(currentCalled)
    }
  }

  // 设为过号
  const handleSkipCurrent = () => {
    if (currentCalled) {
      void onMissItem(currentCalled)
    }
  }

  // 暂挂当前
  const handleSuspendCurrent = () => {
    if (currentServing && onSuspendItem) {
      onSuspendItem(currentServing)
    }
  }

  return (
    <div className="dedicated-waiting-workspace">
      {/* 1. 科室全景状态栏 */}
      <div className="waiting-workspace-topbar">
        <div className="topbar-info">
          <span className="topbar-chip">
            <Icon name="hospital" /> 科室：<strong>{clinicalContext.department.name}</strong>
          </span>
          <span className="topbar-chip">
            <Icon name="clinical" /> 诊室：<strong>1号诊室</strong>
          </span>
          <span className="topbar-chip">
            <Icon name="user" /> 接诊状态：
            <button
              type="button"
              className={`doctor-status-toggle ${doctorStatus === 'ACTIVE' ? 'is-active' : 'is-paused'}`}
              onClick={() => setDoctorStatus(doctorStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
              title="点击切换接诊与暂停状态"
              aria-label={`当前接诊状态：${doctorStatus === 'ACTIVE' ? '接诊中' : '暂停接诊'}，点击切换`}
            >
              <span className="doctor-status-dot" aria-hidden="true" />
              <span>{doctorStatus === 'ACTIVE' ? '接诊中' : '暂停接诊'}</span>
            </button>
          </span>
        </div>
        <div className="topbar-actions">
          <div className="queue-scope-control" role="group" aria-label="患者数据视角">
            {([
              ['PERSONAL', '本人'],
              ['DEPARTMENT', '本科室'],
              ['ORGANIZATION', '本院'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button"
                className={queueScope === value ? 'is-active' : ''}
                aria-pressed={queueScope === value}
                onClick={() => onQueueScopeChange?.(value)}>{label}</button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            <Icon name="refresh" />
            <span>刷新队列</span>
          </Button>
        </div>
      </div>

      {/* 2. 全局叫号中枢条 */}
      <CallingControlHub
        callingState={callingState}
        nextCandidate={nextCandidateResult}
        currentCalledPatient={currentCalled}
        currentServingPatient={currentServing}
        rules={rules}
        onUpdateRules={setRules}
        onCallNext={handleCallNext}
        onRecallCurrent={handleRecallCurrent}
        onSkipCurrent={handleSkipCurrent}
        onSuspendCurrent={onSuspendItem ? handleSuspendCurrent : undefined}
        busy={busy}
      />

      {/* 3. 多队列分流 Tab 栏与搜索过滤 */}
      <div className="waiting-filter-bar">
        <div className="waiting-tabs" role="tablist" aria-label="候诊队列分类">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ALL'}
            className={`waiting-tab-btn ${activeTab === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('ALL')}
          >
            全部待诊 <span className="tab-badge">{tabCounts.ALL}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'INITIAL'}
            className={`waiting-tab-btn ${activeTab === 'INITIAL' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('INITIAL')}
          >
            初诊待诊 <span className="tab-badge">{tabCounts.INITIAL}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'RETURN_VISIT'}
            className={`waiting-tab-btn waiting-tab-btn--return ${activeTab === 'RETURN_VISIT' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('RETURN_VISIT')}
          >
            回诊看结果 <span className="tab-badge tab-badge--purple">{tabCounts.RETURN_VISIT}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'PRIORITY'}
            className={`waiting-tab-btn waiting-tab-btn--priority ${activeTab === 'PRIORITY' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('PRIORITY')}
          >
            优抚绿通 <span className="tab-badge tab-badge--gold">{tabCounts.PRIORITY}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'SUSPENDED'}
            className={`waiting-tab-btn ${activeTab === 'SUSPENDED' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('SUSPENDED')}
          >
            已暂挂 <span className="tab-badge">{tabCounts.SUSPENDED}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'SKIPPED'}
            className={`waiting-tab-btn ${activeTab === 'SKIPPED' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('SKIPPED')}
          >
            过号 <span className="tab-badge">{tabCounts.SKIPPED}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'COMPLETED'}
            className={`waiting-tab-btn waiting-tab-btn--completed ${activeTab === 'COMPLETED' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('COMPLETED')}
          >
            已接诊 <span className="tab-badge">{tabCounts.COMPLETED}</span>
          </button>
        </div>

        <div className="waiting-search-box">
          <Icon name="search" />
          <input
            type="search"
            placeholder="搜索姓名 / 排队号 / 档案号..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="搜索门诊患者"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="清空搜索"
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {/* 4. 富信息候诊卡片流 */}
      <div className="waiting-card-container">
        {displayedItems.length === 0 ? (
          <EmptyState
            icon="clinical"
            title={activeTab === 'COMPLETED' ? '当前视角下暂无已接诊患者' : '当前分类下没有候诊患者'}
            copy={searchQuery ? '没有找到符合搜索条件的患者，请尝试清空搜索关键词。' : activeTab === 'COMPLETED'
              ? '完成诊疗的患者将按完成时间显示在这里。'
              : '新挂号或回诊患者将自动进入当前视角的候诊队列。'}
          />
        ) : (
          <div className="waiting-card-list">
            {displayedItems.map((item) => {
              const isCalling = item.status === 'CALLED'
              const isCompleted = item.status === 'COMPLETED'
              const isCritical = item.triageLevel === 'LEVEL_1_CRITICAL'
              const isUrgent = item.triageLevel === 'LEVEL_2_URGENT'

              const entryLabel = item.status === 'SERVING' ? '继续接诊' : item.status === 'SUSPENDED' ? '恢复接诊' : '接诊'
              const statusLabel = item.status === 'CALLED' ? '已叫号'
                : item.status === 'SERVING' ? '接诊中'
                  : item.status === 'SUSPENDED' ? '已暂挂'
                    : item.status === 'MISSED' ? '已过号'
                      : isCompleted ? '已接诊' : '候诊'

              return (
                <article
                  key={item.registrationId}
                  className={`waiting-card ${isCalling ? 'is-calling' : ''} ${isCritical ? 'has-critical-vitals' : ''}`}
                >
                  {/* 卡片左侧票号与排队类别 */}
                  <div className="waiting-card__ticket-col">
                    <span className="waiting-card__ticket-badge">{item.ticketNo}</span>
                    <span className="waiting-card__seq">第 {item.sequenceNo} 号</span>
                  </div>

                  {/* 卡片主内容区 */}
                  <div className="waiting-card__content">
                    {/* 患者姓名与基础信息 */}
                    <div className="waiting-card__header-line">
                      <div className="patient-identity">
                        <strong className="patient-name">{item.residentName}</strong>
                        <span className="patient-demographics">
                          {item.gender === 'MALE' ? '男' : item.gender === 'FEMALE' ? '女' : '未知'} ·{' '}
                          {item.birthDate ? `${new Date().getFullYear() - parseInt(item.birthDate.slice(0, 4), 10)} 岁` : ''} ·{' '}
                          {item.healthRecordNo}
                        </span>
                      </div>

                      <div className="card-badge-group">
                        <StatusBadge tone={['SERVING', 'COMPLETED'].includes(item.status) ? 'success' : ['SUSPENDED', 'MISSED'].includes(item.status) ? 'warning' : 'neutral'}>
                          {statusLabel}
                        </StatusBadge>

                        {item.calledCount > 0 && (
                          <span className="category-pill category-pill--called" title={`已叫号 ${item.calledCount} 次`}>
                            叫号 {item.calledCount} 次
                          </span>
                        )}

                        {isCritical && (
                          <span className="clinical-pulse-badge is-critical">
                            危急抢救
                          </span>
                        )}
                        {isUrgent && (
                          <span className="clinical-pulse-badge is-urgent">
                            重点关注
                          </span>
                        )}
                        {item.queueCategory === 'RETURN_VISIT' && (
                          <span className="category-pill category-pill--return">
                            回诊
                          </span>
                        )}
                        {item.queueCategory === 'PRIORITY' && (
                          <span className="category-pill category-pill--priority">
                            绿色通道
                          </span>
                        )}
                        {item.publicHealthTags?.chronicLabel && (
                          <span className="category-pill category-pill--chronic">
                            {item.publicHealthTags.chronicLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 分诊生命体征透视 */}
                    {item.vitals && (
                      <div className="waiting-card__vitals-line">
                        <span className="vitals-label">分诊体征:</span>
                        <span className={`vital-val ${item.vitals.systolic && item.vitals.systolic >= 140 ? 'is-danger' : ''}`}>
                          血压: {item.vitals.systolic}/{item.vitals.diastolic} mmHg
                        </span>
                        <span className="vital-sep">|</span>
                        <span className={`vital-val ${item.vitals.pulseRate && item.vitals.pulseRate > 100 ? 'is-danger' : ''}`}>
                          脉搏: {item.vitals.pulseRate} 次/分
                        </span>
                        <span className="vital-sep">|</span>
                        <span className={`vital-val ${item.vitals.temperature && item.vitals.temperature >= 37.3 ? 'is-danger' : ''}`}>
                          体温: {item.vitals.temperature} ℃
                        </span>
                        {item.triageReason && (
                          <span className="vitals-alert-text">({item.triageReason})</span>
                        )}
                      </div>
                    )}

                    {/* AI 预问诊一句话主诉 */}
                    {item.aiPreConsultation && (
                      <div className="waiting-card__ai-line">
                        <span className="ai-icon"><Icon name="sparkles" /> AI主诉:</span>
                        <span className="ai-text">{item.aiPreConsultation.chiefComplaintSummary}</span>
                      </div>
                    )}

                    {/* 检查检验报告回传就绪度 */}
                    {item.reportSummary && (
                      <div className="waiting-card__reports-line">
                        <span className="report-badge-pill">
                          报告状态: {item.reportSummary.allReportsReady ? '全部已出具' : '部分出具'} ({item.reportSummary.totalCompleted}/{item.reportSummary.totalRequested})
                        </span>
                        {item.reportSummary.items?.map((rep) => (
                          <span key={rep.id} className={`report-item-tag ${rep.abnormal ? 'is-abnormal' : ''}`}>
                            [{rep.name}: {rep.summary || (rep.status === 'COMPLETED' ? '已出' : '检验中')}]
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 挂号与服务归属 */}
                    <div className="waiting-card__footer-meta">
                      <span>就诊服务: <strong>{item.serviceName || '普通门诊'}</strong></span>
                      <span>接诊医生: {item.clinicianName || item.practitionerName || '现场接诊'}</span>
                      <span>挂号时间: {item.registeredAt ? new Date(item.registeredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                      {isCompleted && <span>完成时间: {item.completedAt ? new Date(item.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>}
                      {item.validUntil && <span>效期至: {new Date(item.validUntil).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>

                  {/* 卡片右侧快捷操作区 */}
                  <div className="waiting-card__actions">
                    {isCompleted ? <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      aria-label={`查看病历 ${item.residentName}`}
                      onClick={() => onView(item)}
                    >
                      <Icon name="clinical" />
                      <span>查看病历</span>
                    </Button> : <>
                    {['WAITING', 'CALLED'].includes(item.status) && <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void handleCallItem(item)}
                      title={`${item.status === 'CALLED' ? '重呼' : '呼叫'} ${item.ticketNo} ${item.residentName}`}
                      aria-label={`${item.status === 'CALLED' ? '重呼' : '呼叫'} ${item.residentName}`}
                    >
                      <Icon name={item.status === 'CALLED' ? 'refresh' : 'notification'} />
                      <span>{item.status === 'CALLED' ? '重呼' : '呼叫'}</span>
                    </Button>}

                    {item.status === 'CALLED' && <Button size="sm" variant="secondary" disabled={busy}
                      onClick={() => void onMissItem(item)}>过号</Button>}

                    {item.status === 'MISSED' && <Button size="sm" variant="secondary" disabled={busy}
                      onClick={() => void onRequeueItem(item)}>回队</Button>}

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setBriefingPatient(item)}
                      title="查看30秒临床透视画像"
                      aria-label={`查看画像 ${item.residentName}`}
                    >
                      <Icon name="sparkles" />
                      <span>画像</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      aria-label={`查看 ${item.residentName}`}
                      onClick={() => onView(item)}
                    >
                      查看
                    </Button>

                    <Button
                      size="sm"
                      variant="primary"
                      busy={busy}
                      disabled={!canEdit || item.status === 'MISSED'}
                      title={canEdit ? `${entryLabel}${item.residentName}` : '当前账号没有病历编辑权限'}
                      aria-label={`${entryLabel} ${item.residentName}`}
                      onClick={() => onEnter(item)}
                    >
                      {entryLabel}
                    </Button>
                    </>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* 5. 接诊前 30 秒临床透视简报卡弹层 */}
      {briefingPatient && (
        <PreEncounterBriefingCard
          item={briefingPatient}
          onClose={() => setBriefingPatient(null)}
          onEnter={() => {
            const p = briefingPatient
            setBriefingPatient(null)
            onEnter(p)
          }}
          busy={busy}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}
