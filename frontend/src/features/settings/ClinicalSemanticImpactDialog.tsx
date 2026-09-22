import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import type { UsageImpactSelection } from '../../shared/api/clinicalSemanticImpactApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, Pagination, Select, StatusBadge, TableShell } from '../../shared/ui'
import './medication-standard-impact.css'

const kinds: Record<string, string> = { MEDICATION: '药品默认用法', PRODUCT: '关联产品', FREQUENCY_CONFIGURATION: '机构／科室配置', SEMANTIC_VERSION: '语义冻结记录', KNOWLEDGE: '知识版本', RULE_VERSION: '规则版本', DEPLOYMENT: '发布记录' }
const relationNames: Record<string, string> = { CURRENT_REFERENCE: '当前保存引用', INDIRECT_REFERENCE: '经药品间接引用', FROZEN_REFERENCE: '保存的冻结引用', POTENTIAL: '潜在影响 · 待复核' }
const areas: Record<string, string> = { MASTER_DATA_REFERENCES: '基础数据与语义历史', RULE_VERSIONS: '知识、规则与发布', ACTIVE_ORDERS: '当前科室在用医嘱', ORDER_TEMPLATES: '医嘱模板', DEPENDENCY_SOURCE_UNAVAILABLE: '未完成的依赖查询' }
const statuses: Record<string, string> = { ACTIVE: '启用 / 生效', INACTIVE: '停用', DRAFT: '草稿', IN_REVIEW: '待审核', APPROVED: '已审核', REJECTED: '已退回', PAUSED: '已暂停', SUPERSEDED: '已替换', SCHEDULED: '待生效', EXPIRED: '已到期', FROZEN: '冻结记录', MISSING: '定义不可见或缺失' }
export function ClinicalSemanticImpactDialog({ api, scope, onClose }: { api: RhnApi; scope: UsageImpactSelection; onClose: () => void }) {
  const instance = useId(), [objectKind, setObjectKind] = useState('ALL'), [includeHistory, setIncludeHistory] = useState(true), [page, setPage] = useState(0)
  const report = useQuery({ queryKey: ['clinical-semantic-impact', instance, scope.kind, scope.conceptId, objectKind, includeHistory, page], queryFn: () => api.clinicalSemanticImpact.references(scope, objectKind, includeHistory, page) })
  const value = report.isError ? undefined : report.data
  return <Dialog title="用法标准变更影响" size="xwide" enterNavigation={false} onClose={onClose}>
    <section className="standard-impact" aria-label="用法标准依赖盘点"><p><strong>{scope.name || value?.scope.name || scope.conceptId}</strong> · 盘点当前引用和历史记录，帮助确定复核范围；不自动修改标准或下游对象。</p>
      <div className="standard-impact__toolbar"><div>{value?.scope.code || scope.conceptId}<small> · {value?.scope.system || scope.kind} · {value?.scope.version || '当前版本未知'}</small></div>
        <Select aria-label="用法影响对象类型" clearable={false} value={objectKind} onChange={v => { setObjectKind(v); setPage(0) }} options={[{ value: 'ALL', label: '全部对象' }, ...Object.entries(kinds).map(([value, label]) => ({ value, label }))]} />
        <label><input type="checkbox" checked={includeHistory} onChange={e => { setIncludeHistory(e.target.checked); setPage(0) }} />包含冻结记录与非当前版本</label><Button variant="secondary" disabled={report.isFetching} onClick={() => { void report.refetch() }}>重新盘点</Button></div>
      {report.error && <Alert tone="error">{errorMessage(report.error)}；当前未能完成盘点，不能判断没有影响。</Alert>}{report.isPending && <p>正在核对默认用法、知识和规则引用…</p>}
      {value && <><div className="standard-impact__metrics standard-impact__metrics--usage">{Object.entries(kinds).map(([kind, label]) => <div key={kind}><small>{label}</small><strong>{value.totals[kind] ?? 0}</strong></div>)}</div>
        <small>统计为本次已识别记录，不随下方类型和历史筛选改变；未完成来源不计入数量。潜在影响 {value.potentialCount} 条，冻结／历史记录 {value.historicalCount} 条。盘点时间 {new Date(value.inspectedAt).toLocaleString()}。</small>
        {value.scope.status === 'MISSING' && <Alert tone="warning">当前标准定义不可见或已缺失；下方仍保留能按原标识识别的历史引用，编码或别名引用可能无法归属。</Alert>}
        {value.coverage.some(c => ['UNAVAILABLE', 'PARTIAL'].includes(c.coverage)) && <Alert tone="warning">存在未覆盖或未完成的来源，请查看右侧核对边界；清单不能作为“变更无影响”的依据。</Alert>}
        <div className="standard-impact__layout"><section><TableShell><table><thead><tr><th>对象与版本</th><th>状态</th><th>引用依据</th></tr></thead><tbody>{value.content.map((item, index) => <tr key={`${item.kind}-${item.id}-${item.version}-${index}`}>
          <td><strong>{item.name}</strong><small>{kinds[item.kind] ?? item.kind} · {item.id}</small>{item.version && <small>版本／指纹：{item.version}</small>}{item.parentId && <small>所属对象：{item.parentId}</small>}</td>
          <td><StatusBadge tone={item.relation === 'POTENTIAL' ? 'warning' : 'info'}>{relationNames[item.relation] ?? item.relation}</StatusBadge><small>{statuses[item.status] ?? item.status}{item.historical ? ' · 历史 / 冻结' : ''}</small></td>
          <td>{item.references.map((ref, i) => <details key={i}><summary>{ref.location}</summary><p>{ref.note}</p>{ref.conceptId && <small>概念：{ref.conceptId}</small>}{ref.code && <small>保存编码：{ref.code}</small>}{ref.system && <small>来源：{ref.system} · {ref.version || '未锁定版本'}</small>}{ref.fingerprint && <small>冻结指纹：{ref.fingerprint}</small>}</details>)}</td>
        </tr>)}</tbody></table></TableShell>
          {!value.content.length && <Alert>当前筛选没有已识别的明细，不等于没有依赖；请核对覆盖状态和动态引用。</Alert>}
          <Pagination page={page} totalPages={Math.max(1, value.totalPages)} total={value.totalElements} pageSize={20} onChange={setPage} label="用法影响清单分页" /></section>
          <aside><h4>覆盖状态</h4>{value.coverage.map((c, i) => <section key={`${c.area}-${i}`}><strong>{areas[c.area] ?? c.area}</strong><p>{c.note}</p>{c.activeCount !== null && <p>{c.area === 'ACTIVE_ORDERS' ? '当前范围草稿／有效医嘱' : '启用药品引用'}：{c.activeCount}</p>}{c.area === 'ACTIVE_ORDERS' && <small>机构 {value.organizationId || '未选择'} / 科室 {value.departmentId || '未选择'}。此处不展示患者明细。</small>}</section>)}<h4>核对边界</h4><ul>{value.limitations.map(note => <li key={note}>{note}</li>)}</ul></aside>
        </div></>}
    </section>
  </Dialog>
}
