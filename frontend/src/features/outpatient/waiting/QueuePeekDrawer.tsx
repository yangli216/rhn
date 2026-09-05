import { useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, Icon } from '../../../shared/ui'
import { filterQueueItems } from './queueDispatchService'
import type { EnhancedQueueItem, QueueTabFilter } from './queueTypes'

export interface QueuePeekDrawerProps {
  open: boolean
  onClose: () => void
  items: EnhancedQueueItem[]
  currentEncounterId: string | null
  canEdit: boolean
  busy?: boolean
  onSelectPatient: (item: EnhancedQueueItem) => void
  onSkipItem?: (item: EnhancedQueueItem) => void
}

export function QueuePeekDrawer({
  open,
  onClose,
  items,
  currentEncounterId,
  canEdit,
  busy = false,
  onSelectPatient,
  onSkipItem,
}: QueuePeekDrawerProps) {
  const [activeTab, setActiveTab] = useState<QueueTabFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // 监听 Escape 键关闭抽屉
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const tabCounts = useMemo(() => {
    return {
      ALL: items.filter((i) => i.queueCategory !== 'SKIPPED').length,
      INITIAL: items.filter((i) => i.queueCategory === 'INITIAL').length,
      RETURN_VISIT: items.filter((i) => i.queueCategory === 'RETURN_VISIT').length,
      PRIORITY: items.filter((i) => i.queueCategory === 'PRIORITY').length,
      SUSPENDED: items.filter((i) => i.queueCategory === 'SUSPENDED').length,
      SKIPPED: items.filter((i) => i.queueCategory === 'SKIPPED').length,
    }
  }, [items])

  const filteredItems = useMemo(() => {
    return filterQueueItems(items, activeTab, searchQuery)
  }, [items, activeTab, searchQuery])

  if (!open) return null

  return (
    <div className="peek-drawer-backdrop" onClick={onClose}>
      <aside
        className="peek-drawer"
        role="dialog"
        aria-label="候诊全景透视抽屉"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 抽屉头部 */}
        <header className="peek-drawer__header">
          <div className="drawer-title-group">
            <Icon name="tasks" />
            <div>
              <h3>门诊候诊全景透视</h3>
              <small>无需离开当前病历，实时掌握门外排队变化</small>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="关闭透视抽屉"
          >
            <Icon name="close" />
          </button>
        </header>

        {/* 抽屉搜索与分类过滤 */}
        <div className="peek-drawer__filter-section">
          <div className="drawer-search">
            <Icon name="search" />
            <input
              type="search"
              placeholder="搜索候诊患者..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="搜索候诊患者"
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

          <div className="drawer-tabs">
            <button
              type="button"
              className={`drawer-tab-btn ${activeTab === 'ALL' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('ALL')}
            >
              全部 ({tabCounts.ALL})
            </button>
            <button
              type="button"
              className={`drawer-tab-btn ${activeTab === 'INITIAL' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('INITIAL')}
            >
              初诊 ({tabCounts.INITIAL})
            </button>
            <button
              type="button"
              className={`drawer-tab-btn drawer-tab-btn--return ${activeTab === 'RETURN_VISIT' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('RETURN_VISIT')}
            >
              回诊 ({tabCounts.RETURN_VISIT})
            </button>
            <button
              type="button"
              className={`drawer-tab-btn drawer-tab-btn--priority ${activeTab === 'PRIORITY' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('PRIORITY')}
            >
              绿通 ({tabCounts.PRIORITY})
            </button>
            <button
              type="button"
              className={`drawer-tab-btn ${activeTab === 'SUSPENDED' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('SUSPENDED')}
            >
              暂挂 ({tabCounts.SUSPENDED})
            </button>
          </div>
        </div>

        {/* 抽屉列表 */}
        <div className="peek-drawer__content">
          {filteredItems.length === 0 ? (
            <EmptyState
              icon="clinical"
              title="当前无匹配患者"
              copy="没有找到符合当前分类或搜索条件的候诊记录。"
            />
          ) : (
            <div className="drawer-patient-list">
              {filteredItems.map((item) => {
                const isCurrent = item.encounterId === currentEncounterId
                const isCritical = item.triageLevel === 'LEVEL_1_CRITICAL'

                return (
                  <article
                    key={item.registrationId}
                    className={`drawer-patient-card ${isCurrent ? 'is-current-active' : ''} ${isCritical ? 'has-critical-alert' : ''}`}
                  >
                    <div className="drawer-card-header">
                      <span className="drawer-card-ticket">{item.ticketNo}</span>
                      <strong className="drawer-card-name">{item.residentName}</strong>
                      <span className="drawer-card-meta">
                        {item.gender === 'MALE' ? '男' : '女'} ·{' '}
                        {item.birthDate ? `${new Date().getFullYear() - parseInt(item.birthDate.slice(0, 4), 10)}岁` : ''}
                      </span>
                      {isCurrent && <span className="current-badge">正在接诊</span>}
                      {item.queueCategory === 'RETURN_VISIT' && (
                        <span className="pill-tag pill-tag--purple">回诊</span>
                      )}
                      {isCritical && (
                        <span className="pill-tag pill-tag--danger">危急</span>
                      )}
                    </div>

                    {item.vitals && (
                      <div className="drawer-card-vitals">
                        <span>血压 {item.vitals.systolic}/{item.vitals.diastolic}</span>
                        <span>脉搏 {item.vitals.pulseRate}</span>
                        <span>体温 {item.vitals.temperature}℃</span>
                      </div>
                    )}

                    {item.aiPreConsultation && (
                      <p className="drawer-card-ai">
                        🤖 {item.aiPreConsultation.chiefComplaintSummary}
                      </p>
                    )}

                    {item.reportSummary && (
                      <div className="drawer-card-reports">
                        📋 报告 ({item.reportSummary.totalCompleted}/{item.reportSummary.totalRequested}):{' '}
                        {item.reportSummary.allReportsReady ? '全部就绪' : '出具中'}
                      </div>
                    )}

                    <div className="drawer-card-actions">
                      {isCurrent ? (
                        <span className="current-label">当前已在病历中</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy || !canEdit}
                          onClick={() => {
                            onClose()
                            onSelectPatient(item)
                          }}
                        >
                          切换接诊
                        </Button>
                      )}
                      {item.status === 'CALLED' && !isCurrent && onSkipItem && (
                        <Button
                          size="sm"
                          variant="text"
                          disabled={busy}
                          onClick={() => onSkipItem(item)}
                        >
                          设为过号
                        </Button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
