import { useEffect, useMemo, useState } from 'react'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Resident } from '../../../shared/model'
import { InsuranceMediaButtons, useInsuranceMediaReader } from '../../../shared/billing/insuranceMedia'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { ReceptionQueueScope } from '../../../shared/api/schedulingApi'
import { Button, EmptyState, Icon, StatusBadge, Switch } from '../../../shared/ui'
import { CallingControlHub } from './CallingControlHub'
import { PreEncounterBriefingCard } from './PreEncounterBriefingCard'
import { formatLocaleDateTime } from '../../../shared/format'
import {
  DEFAULT_DISPATCH_RULES,
  announceQueueCall,
  determineNextCallCandidate,
  filterQueueItems,
  matchesQueueQuery,
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
  activeItemKey?: string | null
  /** 未启用排队叫号时医生直接从列表接诊：不显示叫号、重呼、过号和叫号中枢。 */
  callingEnabled?: boolean
  /** 传入后搜索栏提供读社保卡、医保码调入患者。 */
  api?: RhnApi
  /** 搜索提交后覆盖所有可见范围的数据；未提供时只在当前列表内查找。 */
  searchItems?: EnhancedQueueItem[]
  searchLoading?: boolean
  /** 提交（回车或点“查询”）或清空搜索时通知父级，由父级加载全范围数据。 */
  onSearchChange?: (term: string) => void
  /** 读卡、扫码唯一识别患者后交由父级定位就诊并决定进入方式。 */
  onLocateResident?: (resident: Resident) => void
  onEnter: (item: EnhancedQueueItem) => void
  onView: (item: EnhancedQueueItem) => void
  onRefresh: () => void
  onCallItem: (item: EnhancedQueueItem) => Promise<unknown>
  onMissItem: (item: EnhancedQueueItem) => Promise<unknown>
  onRequeueItem: (item: EnhancedQueueItem) => Promise<unknown>
  onSuspendItem?: (item: EnhancedQueueItem) => void
}

/** 读社保卡、医保码调入患者；读取弹窗与读卡结果的定位都在这里编排。 */
function CardReadTools({ api, busy, onLocate }: { api: RhnApi; busy: boolean; onLocate: (resident: Resident) => void }) {
  const reader = useInsuranceMediaReader(api, ({ resident }) => { onLocate(resident); return undefined })
  return <>
    <InsuranceMediaButtons size="sm" disabled={busy} onRead={reader.open} />
    {reader.dialog}
  </>
}

export function DedicatedWaitingWorkspace({
  items,
  queueScope = 'PERSONAL',
  onQueueScopeChange,
  clinicalContext,
  canEdit,
  busy,
  activeItemKey,
  callingEnabled = true,
  api,
  searchItems,
  searchLoading = false,
  onSearchChange,
  onLocateResident,
  onEnter,
  onView,
  onRefresh,
  onCallItem,
  onMissItem,
  onRequeueItem,
  onSuspendItem,
}: DedicatedWaitingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<QueueTabFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [rules, setRules] = useState<DispatchRuleConfig>(DEFAULT_DISPATCH_RULES)
  const [consecutiveInitialCalls, setConsecutiveInitialCalls] = useState(0)
  const [briefingPatient, setBriefingPatient] = useState<EnhancedQueueItem | null>(null)
  const [doctorStatus, setDoctorStatus] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE')
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)
  const submitSearch = () => {
    const term = searchInput.trim()
    // 没有输入内容时点“查询”等同刷新列表
    if (!term) { clearSearch(); onRefresh(); return }
    setSearchQuery(term)
    onSearchChange?.(term)
  }
  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    onSearchChange?.('')
  }

  useEffect(() => {
    if (!busy) {
      setPendingActionKey(null)
    }
  }, [busy])

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
    if (!searchQuery) return filterQueueItems(items, activeTab)
    // 搜索覆盖全部可见范围与全部状态，不受当前视角和标签限制
    const normalized = searchQuery.toLowerCase()
    const rank = (item: EnhancedQueueItem) => ['SERVING', 'SUSPENDED', 'CALLED', 'WAITING', 'MISSED', 'COMPLETED'].indexOf(item.status)
    return (searchItems ?? items).filter((item) => matchesQueueQuery(item, normalized))
      .sort((left, right) => rank(left) - rank(right))
  }, [items, searchItems, activeTab, searchQuery])

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
      {callingEnabled && <>
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
      </>}

      {/* 2. 统一工作台环境与多队列筛选总控栏 */}
      <div className="waiting-filter-bar">
        <div className="waiting-filter-left">
          <div className="waiting-context-chips">
            <span
              className="waiting-context-chip"
              title={`执业科室：${clinicalContext.department.name} · 1号诊室`}
            >
              <Icon name="hospital" />
              <strong>{clinicalContext.department.name}</strong>
              <span className="chip-sep" aria-hidden="true">·</span>
              <span>1号诊室</span>
            </span>

            <div className="waiting-doctor-status" title="切换医生接诊与暂停状态">
              <Switch
                size="sm"
                checked={doctorStatus === 'ACTIVE'}
                onChange={(checked) => setDoctorStatus(checked ? 'ACTIVE' : 'PAUSED')}
                checkedText="接诊中"
                uncheckedText="暂停"
                aria-label="医生接诊状态切换"
              />
            </div>
          </div>

          <span className="waiting-bar-divider" aria-hidden="true" />

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

          <span className="waiting-bar-divider" aria-hidden="true" />

          {!searchQuery && <div className="waiting-tabs" role="tablist" aria-label="候诊队列分类">
            {([
              ['ALL', '待诊', tabCounts.ALL],
              ['SUSPENDED', '暂挂', tabCounts.SUSPENDED],
              ...(callingEnabled ? [['SKIPPED', '过号', tabCounts.SKIPPED] as const] : []),
              ['COMPLETED', '已接诊', tabCounts.COMPLETED],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeTab === value}
                className={`waiting-tab-btn ${value === 'COMPLETED' ? 'waiting-tab-btn--completed ' : ''}${activeTab === value ? 'is-active' : ''}`}
                onClick={() => setActiveTab(value)}
              >
                {label} <span className="tab-badge">{count}</span>
              </button>
            ))}
          </div>}
        </div>

        <div className="waiting-filter-tools">
          <div className="waiting-search-box">
            <Icon name="search" />
            <input
              type="search"
              placeholder="姓名 / 排队号 / 档案号，回车查询"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitSearch() } }}
              aria-label="搜索门诊患者"
            />
            {searchInput && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={clearSearch}
                aria-label="清空搜索"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={submitSearch}>
            <Icon name="search" /><span>查询</span>
          </Button>
          {api && <CardReadTools api={api} busy={busy} onLocate={(resident) => { clearSearch(); onLocateResident?.(resident) }} />}
        </div>
      </div>

      {searchQuery && (
        <div className="waiting-search-summary" role="status">
          搜索“{searchQuery}”· 覆盖全部可见范围与状态 · {searchLoading ? '查找中…' : `共 ${displayedItems.length} 条`}
          <Button size="sm" variant="text" onClick={clearSearch}>清除搜索</Button>
        </div>
      )}

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
          <table className="waiting-table">
            {/* 无可见表头：列含义由内容自明，保留给读屏软件 */}
            <thead className="waiting-table__head">
              <tr>
                <th scope="col">排队号</th>
                <th scope="col">患者</th>
                <th scope="col">状态</th>
                <th scope="col">就诊服务</th>
                <th scope="col">接诊医生</th>
                <th scope="col">挂号时间</th>
                <th scope="col">{activeTab === 'COMPLETED' && !searchQuery ? '完成时间' : '效期至'}</th>
                <th scope="col" className="waiting-table__actions-col">操作</th>
              </tr>
            </thead>
            <tbody>
            {displayedItems.map((item) => {
              const isCalling = item.status === 'CALLED'
              const isCompleted = item.status === 'COMPLETED'
              const isCritical = item.triageLevel === 'LEVEL_1_CRITICAL'
              const isUrgent = item.triageLevel === 'LEVEL_2_URGENT'

              const entryLabel = item.status === 'SERVING' ? '继续接诊' : item.status === 'SUSPENDED' ? '恢复接诊' : '接诊'
              const statusLabel = item.status === 'CALLED' && callingEnabled ? '已叫号'
                : item.status === 'SERVING' ? '接诊中'
                  : item.status === 'SUSPENDED' ? '已暂挂'
                    : item.status === 'MISSED' ? '已过号'
                      : isCompleted ? '已接诊' : '候诊'

              const itemKey = item.registrationId || item.encounterId
              const isCurrentOperating = Boolean(busy && (
                activeItemKey ? (activeItemKey === item.registrationId || activeItemKey === item.encounterId)
                  : (pendingActionKey === item.registrationId || pendingActionKey === item.encounterId)
              ))

              return (
                <tr
                  key={item.registrationId}
                  className={`waiting-row ${isCalling ? 'is-calling' : ''} ${isCritical ? 'has-critical-vitals' : ''}`}
                >
                  <td>
                    <div className="waiting-card__ticket-col">
                      <span className="waiting-card__ticket-badge">{item.ticketNo}</span>
                    </div>
                  </td>

                  <td>
                    <div className="patient-identity">
                      <strong className="patient-name">{item.residentName}</strong>
                      <span className="patient-demographics">
                        {item.genderText ?? '未知'} ·{' '}
                        {item.birthDate ? `${new Date().getFullYear() - parseInt(item.birthDate.slice(0, 4), 10)} 岁` : ''} ·{' '}
                        {item.healthRecordNo}
                      </span>
                    </div>
                    <div className="card-badge-group">
                      {isCritical && <span className="clinical-pulse-badge is-critical">危急抢救</span>}
                      {isUrgent && <span className="clinical-pulse-badge is-urgent">重点关注</span>}
                      {item.queueCategory === 'RETURN_VISIT' && <span className="category-pill category-pill--return">回诊</span>}
                      {item.queueCategory === 'PRIORITY' && <span className="category-pill category-pill--priority">绿色通道</span>}
                      {item.publicHealthTags?.chronicLabel && (
                        <span className="category-pill category-pill--chronic">{item.publicHealthTags.chronicLabel}</span>
                      )}
                    </div>
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
                        {item.triageReason && <span className="vitals-alert-text">({item.triageReason})</span>}
                      </div>
                    )}
                    {item.aiPreConsultation && (
                      <div className="waiting-card__ai-line">
                        <span className="ai-icon"><Icon name="sparkles" /> AI主诉:</span>
                        <span className="ai-text">{item.aiPreConsultation.chiefComplaintSummary}</span>
                      </div>
                    )}
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
                  </td>

                  <td>
                    <div className="card-badge-group">
                      <StatusBadge tone={['SERVING', 'COMPLETED'].includes(item.status) ? 'success' : ['SUSPENDED', 'MISSED'].includes(item.status) ? 'warning' : 'neutral'}>
                        {statusLabel}
                      </StatusBadge>
                      {callingEnabled && item.calledCount > 0 && (
                        <span className="category-pill category-pill--called" title={`已叫号 ${item.calledCount} 次`}>
                          叫号 {item.calledCount} 次
                        </span>
                      )}
                    </div>
                  </td>

                  <td>{item.serviceName || '普通门诊'}</td>
                  <td>{item.clinicianName || item.practitionerName || '现场接诊'}</td>
                  <td><span className="waiting-cell-label">挂号</span> {item.registeredAt ? formatLocaleDateTime(item.registeredAt, { hour: '2-digit', minute: '2-digit' }) : '--:--'}</td>
                  <td>
                    {isCompleted ? <><span className="waiting-cell-label">完成</span> {item.completedAt ? formatLocaleDateTime(item.completedAt, { hour: '2-digit', minute: '2-digit' }) : '--:--'}</>
                      : item.validUntil ? <><span className="waiting-cell-label">效期至</span> {formatLocaleDateTime(item.validUntil, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</> : '—'}
                  </td>

                  <td className="waiting-table__actions-col">
                    <div className="waiting-card__actions">
                      {isCompleted ? <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        aria-label={`查看病历 ${item.residentName}`}
                        onClick={() => {
                          setPendingActionKey(itemKey)
                          onView(item)
                        }}
                      >
                        <Icon name="clinical" />
                        <span>查看病历</span>
                      </Button> : <>
                      {callingEnabled && ['WAITING', 'CALLED'].includes(item.status) && <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setPendingActionKey(itemKey)
                          void handleCallItem(item)
                        }}
                        title={`${item.status === 'CALLED' ? '重呼' : '呼叫'} ${item.ticketNo} ${item.residentName}`}
                        aria-label={`${item.status === 'CALLED' ? '重呼' : '呼叫'} ${item.residentName}`}
                      >
                        <Icon name={item.status === 'CALLED' ? 'refresh' : 'notification'} />
                        <span>{item.status === 'CALLED' ? '重呼' : '呼叫'}</span>
                      </Button>}

                      {callingEnabled && item.status === 'CALLED' && <Button size="sm" variant="secondary" disabled={busy}
                        onClick={() => {
                          setPendingActionKey(itemKey)
                          void onMissItem(item)
                        }}>过号</Button>}

                      {callingEnabled && item.status === 'MISSED' && <Button size="sm" variant="secondary" disabled={busy}
                        onClick={() => {
                          setPendingActionKey(itemKey)
                          void onRequeueItem(item)
                        }}>回队</Button>}

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
                        onClick={() => {
                          setPendingActionKey(itemKey)
                          onView(item)
                        }}
                      >
                        查看
                      </Button>

                      <Button
                        size="sm"
                        variant="primary"
                        busy={isCurrentOperating}
                        disabled={busy || !canEdit || item.status === 'MISSED'}
                        title={canEdit ? `${entryLabel}${item.residentName}` : '当前账号没有病历编辑权限'}
                        aria-label={`${entryLabel} ${item.residentName}`}
                        onClick={() => {
                          setPendingActionKey(itemKey)
                          onEnter(item)
                        }}
                      >
                        {entryLabel}
                      </Button>
                      </>}
                    </div>
                  </td>
                </tr>
              )
            })}
            </tbody>
          </table>
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
            setPendingActionKey(p.registrationId || p.encounterId)
            onEnter(p)
          }}
          busy={Boolean(busy && (
            activeItemKey ? (activeItemKey === briefingPatient.registrationId || activeItemKey === briefingPatient.encounterId)
              : (pendingActionKey === briefingPatient.registrationId || pendingActionKey === briefingPatient.encounterId)
          ))}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}
