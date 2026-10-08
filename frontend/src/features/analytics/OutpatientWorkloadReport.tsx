import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RhnApi } from '../../shared/rhnApi'
import {
  DEFAULT_QUERY_PRESETS,
  formatDate,
  offsetDays,
  type DateRange,
} from '../../shared/utils/dateRange'
import { Alert, Button, DataTable, DateRangePicker, EmptyState, Icon, LoadingState, PageHeader, Select, tableCellClass } from '../../shared/ui'
import { workloadData, workloadSpec } from './workloadReportData'
import './analytics-reports.css'

export function OutpatientWorkloadReport({ api }: { api: RhnApi }) {
  const navigate = useNavigate()

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date()
    return {
      from: formatDate(offsetDays(now, -6)),
      to: formatDate(now),
    }
  })
  const [scope, setScope] = useState<'AUTHORIZED' | 'CURRENT'>('AUTHORIZED')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [data, setData] = useState<ReturnType<typeof workloadData>>(() => workloadData({ series: [] }))
  const { list: workloadList, totalEnc, totalPat, totalOrders, totalMedOrders } = data
  const requestVersion = useRef(0)

  const loadData = async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    try {
      const result = await api.analytics.queryPage(workloadSpec(dateRange, scope))
      if (version !== requestVersion.current) return
      setData(workloadData(result))
    } catch {
      if (version !== requestVersion.current) return
      setError('工作量统计数据加载失败或指标不完整，请刷新重试。')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    return () => { requestVersion.current += 1 }
  }, [api, dateRange, scope])

  const maxEnc = useMemo(() => Math.max(1, ...workloadList.map((w) => w.encounterCount)), [workloadList])
  const avgOverallOrders = totalEnc > 0 ? (totalOrders / totalEnc).toFixed(2) : '—'

  return (
    <section className="analytics-report-page" aria-label="门诊就诊与工作量统计报表">
      <PageHeader
        eyebrow="统计分析 · 固化业务报表"
        title="门诊就诊与医疗工作量统计"
        description="按就诊登记日期统计就诊记录及去重患者，按医嘱开立日期统计当前有效的药品与服务医嘱。"
        actions={
          <div className="analytics-page-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigate('/analytics/explore')
              }}
              title="跳转至 AI 分析助手展开即席探索"
            >
              <Icon name="sparkles" /> AI 探索此数据
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={loading || !!error || workloadList.length === 0} title="打印或导出此报表">
              <Icon name="print" /> 打印报表
            </Button>
            <Button size="sm" onClick={() => void loadData()} busy={loading}>
              <Icon name="refresh" /> 刷新统计
            </Button>
          </div>
        }
      />

      {error && <Alert tone="warning">{error}</Alert>}

      {/* 筛选条 */}
      <div className="analytics-filter-strip">
        <div className="analytics-filter-group">
          <label className="analytics-filter-label">统计周期：</label>
          <DateRangePicker
            compact
            value={dateRange}
            onChange={(nextRange: DateRange) => setDateRange(nextRange)}
            presets={DEFAULT_QUERY_PRESETS}
          />
        </div>

        <div className="analytics-filter-group">
          <label className="analytics-filter-label">机构与科室范围：</label>
          <Select
            className="analytics-scope-select"
            value={scope}
            onChange={(value) => setScope(value as 'AUTHORIZED' | 'CURRENT')}
            aria-label="科室统计范围"
            clearable={false} searchable={false}
            options={[{ value: 'AUTHORIZED', label: '全院可访问科室（综合分析）' },
              { value: 'CURRENT', label: '当前登录科室' }]}
          />
        </div>
      </div>

      {/* KPI 卡片 */}
      {!loading && !error && workloadList.length > 0 && <div className="analytics-kpi-grid">
        <article className="analytics-kpi-card analytics-kpi-card--primary">
          <span className="analytics-kpi-label">门诊登记就诊总人次</span>
          <div className="analytics-kpi-val-row">
            <strong>{totalEnc.toLocaleString()}</strong>
            <small>人次</small>
          </div>
          <p className="analytics-kpi-sub">
            去重服务患者 {totalPat.toLocaleString()} 人
          </p>
        </article>

        <article className="analytics-kpi-card analytics-kpi-card--success">
          <span className="analytics-kpi-label">有效医嘱总量</span>
          <div className="analytics-kpi-val-row">
            <strong>{totalOrders.toLocaleString()}</strong>
            <small>条</small>
          </div>
          <p className="analytics-kpi-sub">
            药品医嘱 {totalMedOrders.toLocaleString()} 条 · 服务医嘱 {Math.max(0, totalOrders - totalMedOrders).toLocaleString()} 条
          </p>
        </article>

        <article className="analytics-kpi-card analytics-kpi-card--info">
          <span className="analytics-kpi-label">每就诊人次医嘱数</span>
          <div className="analytics-kpi-val-row">
            <strong>{avgOverallOrders}</strong>
            <small>条 / 人次</small>
          </div>
          <p className="analytics-kpi-sub">
            有效医嘱条数 ÷ 登记就诊人次
          </p>
        </article>

        <article className="analytics-kpi-card analytics-kpi-card--warning">
          <span className="analytics-kpi-label">有业务记录科室数</span>
          <div className="analytics-kpi-val-row">
            <strong>{workloadList.length}</strong>
            <small>个科室</small>
          </div>
          <p className="analytics-kpi-sub">
            所选范围内有就诊或有效医嘱记录的科室
          </p>
        </article>
      </div>}

      {loading && <LoadingState label="正在汇总各科室就诊与医嘱数据..." />}

      {!loading && !error && workloadList.length === 0 && <EmptyState icon="clinical" title="所选范围内暂无就诊或有效医嘱记录" copy="请调整统计周期或科室范围后重试。" />}

      {!loading && !error && workloadList.length > 0 && (
        <div className="analytics-report-content">
          <div className="analytics-split-layout">
            {/* 左侧：科室就诊负荷排行 */}
            <div className="analytics-chart-box">
              <div className="analytics-box-head">
                <h3>
                  <Icon name="clinical" /> 科室登记就诊量排行
                </h3>
                <span className="analytics-box-meta">按登记就诊人次降序</span>
              </div>
              <div className="analytics-rank-list">
                {workloadList.map((w, index) => {
                  const pct = Math.round((w.encounterCount / maxEnc) * 100)
                  return (
                    <div key={w.deptId} className="analytics-rank-row">
                      <span className={`analytics-rank-badge ${index < 3 ? 'is-top' : ''}`}>
                        {index + 1}
                      </span>
                      <span className="analytics-rank-name" title={w.deptName}>
                        {w.deptName}
                      </span>
                      <div className="analytics-rank-bar-bg">
                        <div className="analytics-rank-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="analytics-rank-val">{w.encounterCount.toLocaleString()} 人次</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 右侧：工作量全景明细表 */}
            <div className="analytics-table-box">
              <div className="analytics-box-head">
                <h3>
                  <Icon name="tasks" /> 各科室就诊与医嘱明细全景表
                </h3>
                <span className="analytics-box-meta">共 {workloadList.length} 个科室</span>
              </div>
              <div className="analytics-table-wrap">
                <DataTable className="analytics-data-table">
                  <thead>
                    <tr>
                      <th>排名</th>
                      <th>科室名称</th>
                      <th className={tableCellClass('numeric')}>登记就诊人次</th>
                      <th className={tableCellClass('numeric')}>患者人数</th>
                      <th className={tableCellClass('numeric')}>药品医嘱</th>
                      <th className={tableCellClass('numeric')}>服务医嘱</th>
                      <th className={tableCellClass('numeric')}>医嘱总量</th>
                      <th className={tableCellClass('numeric')}>每就诊人次医嘱数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workloadList.map((w, index) => (
                      <tr key={w.deptId}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{w.deptName}</strong>
                        </td>
                        <td className={tableCellClass('numeric')}>{w.encounterCount.toLocaleString()}</td>
                        <td className={tableCellClass('numeric')}>{w.patientCount.toLocaleString()}</td>
                        <td className={tableCellClass('numeric')}>{w.medOrderCount.toLocaleString()}</td>
                        <td className={tableCellClass('numeric')}>{w.serviceOrderCount.toLocaleString()}</td>
                        <td className={tableCellClass('numeric')}>{w.totalOrderCount.toLocaleString()}</td>
                        <td className={tableCellClass('numeric')}>{w.avgOrdersPerEncounter?.toFixed(2) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>所选范围合计</th>
                      <th className={tableCellClass('numeric')}>{totalEnc.toLocaleString()}</th>
                      <th className={tableCellClass('numeric')}>{totalPat.toLocaleString()}</th>
                      <th className={tableCellClass('numeric')}>{totalMedOrders.toLocaleString()}</th>
                      <th className={tableCellClass('numeric')}>{Math.max(0, totalOrders - totalMedOrders).toLocaleString()}</th>
                      <th className={tableCellClass('numeric')}>{totalOrders.toLocaleString()}</th>
                      <th className={tableCellClass('numeric')}>{avgOverallOrders}</th>
                    </tr>
                  </tfoot>
                </DataTable>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
