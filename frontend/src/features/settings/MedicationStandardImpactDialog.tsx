import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi, StandardMedicationDetail } from '../../shared/rhnApi'
import type { StandardImpactScope } from '../../shared/api/medicationStandardImpactApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, Pagination, Select, StatusBadge, TableShell } from '../../shared/ui'
import './medication-standard-impact.css'

const kinds: Record<string, string> = { MEDICATION: '药品档案', PRODUCT: '厂家产品', KNOWLEDGE: '知识版本', RULE_VERSION: '规则版本', DEPLOYMENT: '发布记录', STANDARD_REVISION: '关联修订审计' }
const statuses: Record<string, string> = { ACTIVE: '启用 / 生效', INACTIVE: '停用', MISSING: '档案缺失', DRAFT: '草稿', IN_REVIEW: '待审核', APPROVED: '已审核', REJECTED: '已退回', PAUSED: '已暂停', SUPERSEDED: '已替换', SCHEDULED: '待生效', EXPIRED: '已到期', CANDIDATE: '候选', SHADOW: '旁路', RETIRED: '已退役', SUBMITTED: '待复核', APPLIED: '已应用', CANCELLED: '已撤回' }
export function MedicationStandardImpactDialog({ api, catalogId, entry, fixedScope, onClose }: { api: RhnApi; catalogId: string; entry?: StandardMedicationDetail; fixedScope?: StandardImpactScope; onClose: () => void }) {
  const [selectedScope, setSelectedScope] = useState(fixedScope ? 'SPECIFIED' : entry ? 'ENTRY' : 'CATALOG')
  const [kind, setKind] = useState('ALL'), [includeHistory, setIncludeHistory] = useState(true), [page, setPage] = useState(0)
  const scope = selectedScope === 'SPECIFIED' && fixedScope ? fixedScope : { catalogId, ...(selectedScope !== 'CATALOG' && entry ? { entryId: entry.id } : {}), ...(selectedScope !== 'CATALOG' && selectedScope !== 'ENTRY' ? { specificationId: selectedScope } : {}) }
  const report = useQuery({ queryKey: ['medication-standard-impact', scope, kind, includeHistory, page], queryFn: () => api.medicationStandardImpact.inspect(scope, kind, includeHistory, page) })
  const value = report.data
  return <Dialog title="标准变更影响清单" size="xwide" onClose={onClose} enterNavigation={false}>
    <div className="standard-impact"><p>盘点已保存的标准依赖，帮助确定修订范围。清单包含旧版本；引用关系不代表对象一定需要修改，也不代表已完成变更风险评估。</p>
      <div className="standard-impact__toolbar"><Select aria-label="标准影响范围" clearable={false} value={selectedScope} onChange={v => { setSelectedScope(v); setPage(0) }} options={[
        { value: 'CATALOG', label: '整个标准目录（跨版本）' }, ...(fixedScope ? [{ value: 'SPECIFIED', label: `指定引用：${fixedScope.specificationId || fixedScope.entryId || fixedScope.catalogId}` }] : []), ...(entry ? [{ value: 'ENTRY', label: `${entry.name} · 全部规格（跨版本）` }, ...entry.specifications.map(s => ({ value: s.id, label: `${entry.name} · ${s.doseFormName || s.doseForm} · ${s.specification}` }))] : []),
      ]} /><Select aria-label="影响对象类型" clearable={false} value={kind} onChange={v => { setKind(v); setPage(0) }} options={[{ value: 'ALL', label: '全部对象' }, ...Object.entries(kinds).map(([value, label]) => ({ value, label }))]} />
        <label><input type="checkbox" checked={includeHistory} onChange={e => { setIncludeHistory(e.target.checked); setPage(0) }} />包含非最新版与已结束发布</label>
        <Button variant="secondary" disabled={report.isFetching} onClick={() => { void report.refetch() }}>重新盘点</Button>
      </div>
      {report.error && <Alert tone="error">{errorMessage(report.error)}</Alert>}{report.isPending && <p>正在读取标准关联、知识版本和规则发布快照…</p>}
      {value && <><div className="standard-impact__metrics">{Object.entries(kinds).map(([key, label]) => <div key={key}><small>{label}</small><strong>{value.totals[key] ?? 0}</strong></div>)}</div>
        <small>统计基于当前标准范围，类型与历史筛选不改变统计总数。潜在影响待复核 {value.potentialCount} 条；非最新版／已结束发布 {value.historicalCount} 条。盘点时间：{new Date(value.inspectedAt).toLocaleString()}。</small>
        <div className="standard-impact__layout"><section><TableShell><table><thead><tr><th>对象 / 版本</th><th>状态与范围</th><th>依赖依据</th></tr></thead><tbody>{value.content.map(item => <tr key={`${item.kind}-${item.id}-${item.version}`}>
          <td><strong>{item.name}</strong><small>{kinds[item.kind]} · {item.version ? `第 ${item.version} 版` : item.id}</small>{item.parentId && <small>关联对象：{item.parentId}</small>}</td>
          <td><StatusBadge tone={item.matchType === 'POTENTIAL' ? 'warning' : 'info'}>{item.matchType === 'POTENTIAL' ? '潜在影响 · 待复核' : '有保存引用'}</StatusBadge><small>{statuses[item.status] ?? item.status}{item.historical ? ' · 历史记录' : ''}{item.mode ? ` · ${['LIVE', 'ENFORCED'].includes(item.mode) ? '正式执行' : item.mode === 'SHADOW' ? '旁路监控' : item.mode}` : ''}</small>
            {item.organizationId && <small>机构 {item.organizationId} / 科室 {item.departmentId ?? '全部'}</small>}{item.effectiveFrom && <small>{new Date(item.effectiveFrom).toLocaleString()} 起{item.effectiveTo ? `，至 ${new Date(item.effectiveTo).toLocaleString()}` : ''}</small>}</td>
          <td>{item.traces.map((trace, i) => <details key={i}><summary>{trace.location}</summary><p>{trace.reason}</p>{trace.catalogId && <small>目录：{trace.catalogId} · {trace.catalogVersion || '版本未知'}</small>}{trace.entryId && <small>条目：{trace.entryId}</small>}{trace.specificationId && <small>规格：{trace.specificationId}</small>}{trace.contentHash && <small>内容指纹：{trace.contentHash}</small>}</details>)}</td>
        </tr>)}</tbody></table></TableShell>
          {!value.content.length && <Alert>当前筛选下没有已识别的依赖，不能据此判断变更无影响。请核对右侧覆盖范围及未覆盖对象。</Alert>}
          <Pagination page={page} totalPages={Math.max(1, value.totalPages)} total={value.totalElements} pageSize={20} onChange={setPage} label="标准影响清单分页" /></section>
          <aside><h4>本次已覆盖</h4><ul>{value.coverage.map(text => <li key={text}>{text}</li>)}</ul><h4>核对边界</h4><ul>{value.limitations.map(text => <li key={text}>{text}</li>)}</ul><p>先区分新引用、旧快照及动态规则，再制定修订与回归计划。此页面仅提供盘点。</p></aside>
        </div></>}
    </div>
  </Dialog>
}
