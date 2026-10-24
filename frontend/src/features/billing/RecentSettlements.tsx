import { useQuery } from '@tanstack/react-query'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { SettlementRecord } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { Alert, Button, DataTable, LoadingState, StatusBadge, tableCellClass } from '../../shared/ui'
import { Icon } from '../../shared/ui/Icon'
import { formatDateTimeParts } from '../../shared/format'
import { formatDateKey } from '../../shared/utils/dateRange'
import { money } from './BillingShared'

const RECENT_COUNT = 3
/** 后端按机构业务时区（Asia/Shanghai）解释结算日期范围，“今日”与展示时间必须用同一时区，不能取浏览器本地日期。 */
const BUSINESS_TIME_ZONE = 'Asia/Shanghai'

export const recentSettlementsQueryKey = 'billing-recent-settlements'

function clockTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const time = formatDateTimeParts(date, { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${formatDateKey(date, BUSINESS_TIME_ZONE)} ${time}`
}

/** 收费台底部：今日最近几笔已完成的结算及快捷操作，便于结算后补开票据或核对单号。 */
export function RecentSettlements({ api, clinicalContext, username, onReceipt, onCopy }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  /** 当前登录工号；后端按子串匹配，这里再按工号精确过滤，只留本人办理的结算。 */
  username?: string
  onReceipt: (record: SettlementRecord) => void
  onCopy: (record: SettlementRecord) => void
}) {
  const today = formatDateKey(new Date(), BUSINESS_TIME_ZONE)
  const records = useQuery({
    queryKey: [recentSettlementsQueryKey, clinicalContext.organization.id, clinicalContext.department.id, today, username],
    queryFn: () => api.billing.settlementRecords(100, { from: today, to: today, cashier: username }),
  })
  const mine = username?.trim().toLowerCase()
  const all = (records.data ?? []).filter((record) => !mine || record.cashierUsername?.toLowerCase() === mine)
    .filter((record) => record.settlementType === 'NORMAL'
    && record.settlementScene !== 'REGISTRATION' && record.status === 'SETTLED')
  const recent = [...all].sort((left, right) =>
    (right.finalizedAt ?? right.createdAt).localeCompare(left.finalizedAt ?? left.createdAt)).slice(0, RECENT_COUNT)

  return <details className="billing-recent-settlements" open>
    <summary>
      <span><strong>本人今日最近结算（最近 {RECENT_COUNT} 笔）</strong> · 今日已完成 {all.length} 笔</span>
      <span className="billing-recent-settlements__actions">
        <Button size="sm" variant="text" onClick={(event) => {
          event.preventDefault(); event.stopPropagation(); void records.refetch()
        }}><Icon name="refresh" />刷新</Button>
        <span className="billing-recent-settlements__toggle">展开 / 收起 <Icon name="chevron-down" /></span>
      </span>
    </summary>
    <div className="billing-recent-settlements__content">
      {records.isPending ? <LoadingState label="正在加载最近结算…" />
        : records.isError ? <Alert tone="error" placement="inline">最近结算加载失败，请刷新重试。</Alert>
        : recent.length === 0 ? <p className="billing-recent-settlements__empty">今日尚无本人办理的结算。</p>
        : <DataTable compact aria-label="今日最近结算">
          <thead><tr>
            <th>结算单号</th><th>患者</th><th>就诊号</th><th>结算时间</th>
            <th className={tableCellClass('numeric')}>医保支付</th>
            <th className={tableCellClass('numeric')}>个人支付</th>
            <th className={tableCellClass('status')}>状态</th>
            <th className={tableCellClass('actions')}>操作</th>
          </tr></thead>
          <tbody>{recent.map((record) => <tr key={record.id}>
            <td>{record.settlementNo}</td>
            <td><strong>{record.residentName}</strong></td>
            <td>{record.encounterNo ?? '—'}</td>
            <td>{clockTime(record.finalizedAt ?? record.createdAt)}</td>
            <td className={tableCellClass('numeric')}>{money(record.insuranceAmount, record.currencyCode)}</td>
            <td className={tableCellClass('numeric')}>{money(record.patientAmount, record.currencyCode)}</td>
            <td className={tableCellClass('status')}><StatusBadge tone="success">已结算</StatusBadge></td>
            <td className={tableCellClass('actions')}>
              <Button size="sm" variant="text" onClick={() => onReceipt(record)}>电子票据</Button>
              <Button size="sm" variant="text" onClick={() => onCopy(record)}>复制单号</Button>
            </td>
          </tr>)}</tbody>
        </DataTable>}
    </div>
  </details>
}
