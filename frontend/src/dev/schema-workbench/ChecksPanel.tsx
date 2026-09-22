import { useState } from 'react'
import { Button, DataTable, EmptyState, PanelHead, Pagination, Select, StatusBadge, TableShell, tableCellClass } from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { schemaIssuePresentation } from '../../shared/presentation'
import type { Catalog } from './api'

export function ChecksPanel({ catalog, selected, onSelect }: { catalog: Catalog; selected: string; onSelect: (table: string) => void }) {
  const [mode, setMode] = useState('governance'), [scope, setScope] = useState('all'), [page, setPage] = useState(0)
  const changes = (mode === 'previous' ? catalog.changes : catalog.drift).filter(c => scope === 'all' || c.table === selected)
  const issues = catalog.issues.filter(i => scope === 'all' || i.table === selected)
  const size = 25, rows = mode === 'governance' ? issues.length : changes.length, current = Math.min(page, Math.max(0, Math.ceil(rows / size) - 1))
  const selectMode = (value: string) => { setMode(value); setPage(0) }
  return <WorkspacePane className="schema-fill-pane" label="结构检查" scroll="content" header={<>
    <PanelHead title="结构与语义一致性检查" />
    <div className="schema-toolbar"><Select aria-label="检查类别" value={mode} onChange={selectMode} clearable={false} options={[
      { value: 'governance', label: '目录与语义检查' }, { value: 'drift', label: '迁移结构 → Oracle 实库' }, { value: 'previous', label: '上次 Oracle → 当前快照' }, { value: 'migrations', label: '迁移记录' },
    ]} /><Select aria-label="检查范围" value={scope} onChange={value => { setScope(value); setPage(0) }} clearable={false} options={[{ value: 'all', label: '全库' }, { value: 'table', label: '当前表' }]} /></div>
  </>}>
    {mode === 'migrations' ? <div className="schema-migrations">{([['迁移验证库', catalog.expected], ['Oracle 开发库', catalog.oracle]] as const).map(([title, snapshot]) =>
      <section key={title} aria-label={`${title}迁移记录`} className="schema-migration-list">
        <PanelHead title={title} /><p className="schema-muted">{snapshot?.capturedAt ?? '尚未采集'}</p>
        <TableShell scrollLabel={`${title}迁移滚动区`}><DataTable compact aria-label={`${title}迁移`}><thead><tr><th>版本</th><th>脚本</th><th className={tableCellClass('status')}>结果</th></tr></thead><tbody>
          {snapshot?.migrations.map((migration, index) => <tr key={index}><td>{migration.version}</td><td>{migration.script}</td><td className={tableCellClass('status')}>{migration.success ? '成功' : '失败'}</td></tr>)}
        </tbody></DataTable></TableShell>
      </section>)}</div> : <TableShell scrollLabel="检查结果滚动区" resetScrollKey={`${mode}:${scope}:${selected}:${current}`}
        footer={<Pagination label="检查结果分页" total={rows} page={current} totalPages={Math.ceil(rows / size)} onChange={setPage} />}>
    {mode === 'governance' ? <><p className="schema-muted">确定性结构问题与待人工补充项分别展示。统计实体尚未落地或关系缺少条件时，会保留待核对记录。</p>
      {!catalog.expected && <p>尚未采集迁移结构，请先刷新结构再检查目录覆盖。</p>}
      <DataTable compact aria-label="治理检查结果"><thead><tr><th className={tableCellClass('status')}>级别</th><th>表 / 规则</th><th>发现</th></tr></thead><tbody>
        {issues.slice(current * size, (current + 1) * size).map((issue, index) => { const status = schemaIssuePresentation(issue.severity); return <tr key={index}>
          <td className={tableCellClass('status')}><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td><td>{issue.table ? <Button variant="text" size="sm" onClick={() => onSelect(issue.table)}>{issue.table}</Button> : '未映射'}<br />{issue.rule}</td><td>{issue.message}</td>
        </tr> })}</tbody></DataTable>{catalog.expected && !issues.length && <p>当前范围没有检查发现。</p>}</>
      : !catalog.oracle || mode === 'drift' && !catalog.expected || mode === 'previous' && !catalog.previousOracle ? <EmptyState icon="database" title="尚无可比较的快照" copy="需要迁移验证结构和 Oracle 快照；同库变更需要至少两次成功快照。" />
          : <><p className="schema-muted">{mode === 'drift' ? '左侧为迁移验证结构，右侧为 Oracle 实库。常见类型已归一化；跨方言默认值、检查表达式和函数索引需在结构详情中核对。' : '左侧为上次成功的 Oracle 采集，右侧为当前快照。差异只用于评审。'}</p>
            <DataTable compact aria-label="结构差异"><thead><tr><th>表 / 变化项</th><th>之前 / 预期</th><th>当前 / 实库</th></tr></thead><tbody>{changes.slice(current * size, (current + 1) * size).map((change, index) => <tr key={index}>
              <td><Button variant="text" size="sm" onClick={() => onSelect(change.table)}>{change.table}</Button><br />{change.subject} · {change.kind === 'added' ? '新增' : change.kind === 'removed' ? '缺少 / 删除' : '变化'}</td><td><code>{change.before}</code></td><td><code>{change.after}</code></td>
            </tr>)}</tbody></DataTable>{!changes.length && <p>当前检查范围未发现差异。</p>}</>}
    </TableShell>}
  </WorkspacePane>
}
