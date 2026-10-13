import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, DataTable, EmptyState, LoadingState, SearchField, tableCellClass } from '../../shared/ui'
import { ListPage } from '../../shared/ui/templates/PageTemplates'
import { businessNumberLabels } from './businessNumberLabels'

const scopes: Record<string, string> = { SYSTEM: '全系统', TENANT: '租户', ORGANIZATION: '机构', DEPARTMENT: '科室' }
const numeric = tableCellClass('numeric')

export function BusinessNumberManagement({ api, context, tenantId }: { api: RhnApi; context: ClinicalContext; tenantId: string }) {
  const [query, setQuery] = useState('')
  const rules = useQuery({
    queryKey: ['business-number-rules', tenantId, context.organization?.id, context.department?.id],
    queryFn: api.businessNumbering.rules,
  })
  const needle = query.trim().toLowerCase()
  const rows = (rules.data ?? []).filter(row =>
    `${row.businessCode} ${businessNumberLabels[row.businessCode ?? ''] ?? ''} ${row.rule?.prefix ?? ''}`.toLowerCase().includes(needle))
  return <ListPage title="业务编码管理" description="查看生效规则与可用流水；下一号码为查询时快照，实际办理时分配。"
    filters={<>
      <SearchField label="搜索业务编码" placeholder="业务名称、规则编码或前缀" value={query} onChange={setQuery} />
      <div className="ui-query-filters__actions">
        <Button busy={rules.isFetching} onClick={() => void rules.refetch()}>刷新流水</Button>
      </div>
    </>}
    feedback={rules.isError ? <Alert duration={null}>{errorMessage(rules.error)}</Alert> : undefined}
    footer={<span>当前机构：{context.organization?.name ?? '未选择'} · 当前科室：{context.department?.name ?? '未选择'} · {rows.length} 条规则</span>}
    resetScrollKey={query}>
    {rules.isPending ? <LoadingState label="正在查询编码规则和流水" />
      : rules.isError ? <EmptyState icon="settings" title="编码规则查询失败" copy="请刷新流水重试；权限不足时请联系管理员。" />
      : !rows.length ? <EmptyState icon="settings" title="暂无匹配规则" copy="请调整搜索条件。" />
      : <DataTable aria-label="业务编码规则和流水">
        <thead><tr><th>业务名称 / 规则编码</th><th>前缀</th><th>日期格式 / 流水周期</th><th>后缀</th>
          <th className={numeric}>流水位数</th><th>计数范围</th><th>业务日期 / 时区</th>
          <th className={numeric}>已用流水</th><th className={numeric}>下一可用流水</th><th>下一号码</th><th>状态</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.businessCode}>
          <td>{businessNumberLabels[row.businessCode ?? ''] ?? row.businessCode}<br /><code>{row.businessCode}</code></td>
          <td><code>{row.rule?.prefix || '—'}</code></td><td><code>{row.rule?.dateFormat || '无日期'}</code><br />{row.rule?.dateFormat ? '每日流水' : '持续流水'}</td><td><code>{row.rule?.suffix || '—'}</code></td>
          <td className={numeric}>{row.rule?.sequenceWidth}</td><td>{scopes[row.rule?.scope ?? ''] ?? row.rule?.scope}</td>
          <td>{row.sequence?.businessDate ?? '—'}<br />{row.sequence?.zoneId ?? '—'}</td>
          <td className={numeric}>{row.sequence?.currentSequence ?? '—'}</td>
          <td className={numeric}>{row.sequence?.nextSequence ?? '—'}</td><td><code>{row.sequence?.nextNumber ?? '—'}</code></td>
          <td>{row.status === 'AVAILABLE' ? '可用' : row.status === 'EXHAUSTED' ? '流水已用尽'
            : row.status === 'BUSINESS_NUMBER_CONTEXT_INVALID' ? '请选择相应工作上下文' : row.message || '流水查询不可用'}</td>
        </tr>)}</tbody>
      </DataTable>}
  </ListPage>
}
