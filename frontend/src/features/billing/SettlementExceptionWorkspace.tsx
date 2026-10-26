import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Icon, PageHeader, Panel, Tabs } from '../../shared/ui'
import { money } from './BillingShared'
import { SETTLEMENT_EXCEPTIONS_KEY, SettlementExceptionList, useSettlementExceptions } from './settlementExceptions'
import './settlement-exceptions.css'

export function SettlementExceptionWorkspace({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const contextKey = `${clinicalContext.organization.id}:${clinicalContext.department.id}`
  const exceptions = useSettlementExceptions(api, true, contextKey)
  const items = useMemo(() => exceptions.data ?? [], [exceptions.data])

  const [filterType, setFilterType] = useState<'ALL' | 'CRITICAL' | 'OTHER'>('ALL')

  const criticalItems = useMemo(() => items.filter((item) => item.severity === 'CRITICAL'), [items])
  const otherItems = useMemo(() => items.filter((item) => item.severity !== 'CRITICAL'), [items])

  const totalOutstanding = useMemo(() => items.reduce((sum, item) => sum + item.outstandingAmount, 0), [items])
  const patientCount = useMemo(() => new Set(items.map((item) => item.settlement.residentId)).size, [items])

  const filteredItems = useMemo(() => {
    if (filterType === 'CRITICAL') return criticalItems
    if (filterType === 'OTHER') return otherItems
    return items
  }, [filterType, items, criticalItems, otherItems])

  const refresh = () => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: [SETTLEMENT_EXCEPTIONS_KEY] }),
      queryClient.invalidateQueries({ queryKey: ['billing-settlement-records'] }),
    ])
  }

  return (
    <div className="settlement-exception-workspace">
      <PageHeader
        eyebrow="收费管理"
        title="异常待处理"
        description="集中监控与处置单边账、支付未完成、医保已结算自付未收等异常结算单，支持在线补收、撤销医保与冲正对账。"
        actions={
          <Button variant="secondary" onClick={() => void refresh()} busy={exceptions.isFetching}>
            <Icon name="refresh" />刷新
          </Button>
        }
      />

      {exceptions.error && (
        <Alert tone="error" placement="inline">
          {errorMessage(exceptions.error)}
        </Alert>
      )}

      {/* 顶部统计看板 */}
      <div className="settlement-exception-metrics" role="region" aria-label="异常结算指标概览">
        <div className="settlement-exception-metric-card">
          <span>待处理总数</span>
          <strong>{items.length} 笔</strong>
        </div>
        <div className={`settlement-exception-metric-card${criticalItems.length ? ' is-critical' : ''}`}>
          <span>紧急单边账</span>
          <strong>{criticalItems.length} 笔</strong>
        </div>
        <div className="settlement-exception-metric-card is-warning">
          <span>未收金额合计</span>
          <strong>{money(totalOutstanding)}</strong>
        </div>
        <div className="settlement-exception-metric-card">
          <span>涉及就诊人</span>
          <strong>{patientCount} 人</strong>
        </div>
      </div>

      {/* 过滤切换 */}
      {items.length > 0 && (
        <Tabs label="异常分类筛选" value={filterType} onChange={setFilterType} items={[
          { value: 'ALL', label: `全部异常（${items.length}）` },
          { value: 'CRITICAL', label: `紧急单边账（${criticalItems.length}）` },
          { value: 'OTHER', label: `一般异常（${otherItems.length}）` },
        ]} />
      )}

      {/* 待办卡片列表 */}
      <Panel className="settlement-exception-main-panel" aria-label="异常结算待处理列表">
        <SettlementExceptionList
          api={api}
          items={filteredItems}
          loading={exceptions.isPending && !exceptions.data}
          error={exceptions.isError ? exceptions.error : undefined}
          onChanged={() => void refresh()}
        />
      </Panel>
    </div>
  )
}
