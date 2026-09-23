import { useEffect, useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type CatalogEdition } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Pagination, Select } from '../../shared/ui'
import './standard-catalog-editions.css'

const groups: Record<string, string> = { ALL: '全部字段', ENTRY: '目录条目', SPECIFICATION: '剂型规格', METADATA: '来源、问题与其他字段' }
const operations: Record<string, string> = { ADDED: '新增', REMOVED: '移除', CHANGED: '修改' }
const display = (value: unknown) => value === null || value === undefined ? '未提供 / 空值' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
export function StandardCatalogEditionsDialog({ api, onClose }: { api: RhnApi; onClose: () => void }) {
  const instance = useId(), cache = useQueryClient(), [listPage, setListPage] = useState(0), [id, setId] = useState('0')
  const [base, setBase] = useState<CatalogEdition>(), [diffPage, setDiffPage] = useState(0), [group, setGroup] = useState('ALL'), [dependencyPage, setDependencyPage] = useState(0)
  const [tab, setTab] = useState<'diff' | 'dependencies'>('diff')
  const [content, setContent] = useState(''), [fileName, setFileName] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const runtime = useQuery({ queryKey: ['standard-catalog-editions', instance, 'runtime'], queryFn: api.standardCatalogEditions.runtime, retry: false })
  const list = useQuery({ queryKey: ['standard-catalog-editions', instance, 'list', listPage], queryFn: () => api.standardCatalogEditions.list(listPage), retry: false })
  const detail = useQuery({ queryKey: ['standard-catalog-editions', instance, 'detail', id], queryFn: () => api.standardCatalogEditions.detail(id), retry: false })
  const current = detail.isError ? undefined : detail.data
  const baseId = base?.id ?? current?.edition.baselineId ?? '0'
  const compare = useQuery({ queryKey: ['standard-catalog-editions', instance, 'diff', id, baseId, diffPage, group], queryFn: () => api.standardCatalogEditions.compare(id, baseId, diffPage, group), enabled: tab === 'diff' && !!current, retry: false })
  const dependencies = useQuery({ queryKey: ['standard-catalog-editions', instance, 'dependencies', id, dependencyPage], queryFn: () => api.standardCatalogEditions.dependencies(id, dependencyPage), enabled: tab === 'dependencies', retry: false })
  useEffect(() => { setConfirmed(false) }, [runtime.data?.packageHash])
  const select = (next: string) => { setId(next); setDiffPage(0); setDependencyPage(0); setNotice(''); setError('') }
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await work() } catch (e) { setError(errorMessage(e)); setConfirmed(false) } finally { setBusy(false) } }
  const register = () => { if (!runtime.data || runtime.isError || !confirmed) return; void task(async () => {
    const value = await api.standardCatalogEditions.register({ content, fileName, reason: reason.trim(), expectedRuntimeHash: runtime.data.packageHash })
    setContent(''); setFileName(''); setReason(''); setConfirmed(false); setListPage(0); select(value.edition.id)
    await cache.invalidateQueries({ queryKey: ['standard-catalog-editions'] }); setNotice('已登记不可变候选版次，可继续比较差异；通过准入检查后才可作为标准使用。当前运行目录保持原版。')
  }) }
  const download = (original = false) => void task(async () => {
    const text = original ? (await api.standardCatalogEditions.original(id)).content : JSON.stringify(await api.standardCatalogEditions.content(id), null, 2), blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `standard-catalog-${id}.json`; link.click(); URL.revokeObjectURL(url)
  })
  return <Dialog title="标准目录版次登记与差异核对" size="xwide" enterNavigation={false} onClose={busy ? () => {} : onClose}>
    <div className="catalog-editions"><Alert>候选版次独立保存；通过准入检查后才可作为标准使用。运行目录切换及药品批量迁移尚未开放，本页操作不会更新现有药品关联或规则。</Alert>
      {error && <Alert tone="error">{error}</Alert>}{notice && <Alert>{notice}</Alert>}
      <div className="catalog-editions__layout"><aside className="catalog-editions__pane"><h3>当前运行与登记版次</h3>
        {runtime.error && <Alert tone="error">{errorMessage(runtime.error)}</Alert>}
        {!runtime.isError && runtime.data && <Button variant="secondary" disabled={busy} onClick={() => select('0')}>运行版 {runtime.data.identity.catalogVersion}</Button>}
        {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}{!list.isError && list.data?.content.map(e => <button type="button" className="catalog-editions__version" key={e.id} aria-pressed={id === e.id} disabled={busy} onClick={() => select(e.id)}><strong>{e.origin === 'RUNTIME_ARCHIVE' ? '运行归档' : '候选版'} {e.identity.catalogVersion}</strong><span>{e.fileName}</span><small>{e.actor} · {e.entries} 条目 / {e.specifications} 规格</small></button>)}
        {list.data && <Pagination page={listPage} totalPages={Math.max(1, list.data.totalPages)} total={list.data.totalElements} pageSize={20} onChange={setListPage} label="目录登记版次分页" />}
        <h3>登记后续版次</h3><p>使用 schemaVersion=1 的完整 JSON 目录包。可先导出目录检查格式；来源文件哈希须与原文核对，同版号不能覆盖。</p>
        <FormField label="目录 JSON 文件"><input aria-label="目录 JSON 文件" type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; setContent(''); setFileName(''); setConfirmed(false); if (!file) return; void task(async () => { if (file.size > 16 * 1024 * 1024) throw new Error('目录文件请控制在 16 MB 以内'); const text = await file.text(); if (text.length > 8_000_000) throw new Error('目录文本不能超过 8 百万字符'); JSON.parse(text); setContent(text); setFileName(file.name) }) }} /></FormField>
        {fileName && <p>待登记：{fileName}</p>}
        <FormField label="登记原因"><textarea aria-label="登记原因" rows={3} maxLength={2000} value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setConfirmed(false) }} /></FormField>
        <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />已核对文件、版次及来源，确认登记为候选标准数据</label>
        <Button disabled={busy || !content || !reason.trim() || !confirmed || !runtime.data || runtime.isError || runtime.isFetching} onClick={register}>登记候选版次</Button>
      </aside><main className="catalog-editions__pane">
        {detail.error && <Alert tone="error">{errorMessage(detail.error)}</Alert>}
        {current && <><h3>{current.edition.runtime ? '当前运行目录' : current.edition.origin === 'RUNTIME_ARCHIVE' ? '运行目录归档' : '候选目录'} · {current.edition.identity.catalogVersion}</h3><p>{String(current.source.title ?? '')} · {current.edition.entries} 条目 · {current.edition.specifications} 规格 · {current.edition.issues} 待核验项</p>
          {current.edition.origin === 'RUNTIME_ARCHIVE' && <Alert>归档版与当前运行目录的身份及指纹一致；标准来源已在准入时核对。</Alert>}
          <p>来源已在目录准入时核对。{current.edition.reason}</p>
          <div className="catalog-editions__actions"><Button variant="secondary" disabled={busy || detail.isFetching} onClick={() => download()}>导出规范化目录</Button><Button variant="secondary" disabled={busy || detail.isFetching} onClick={() => download(true)}>下载登记原文</Button><Button variant="secondary" disabled={busy || detail.isFetching} onClick={() => { setBase(current.edition); setDiffPage(0) }}>设为对照基准</Button><Button variant="secondary" disabled={busy || runtime.isError || !runtime.data} onClick={() => { setBase(runtime.data); setDiffPage(0) }}>恢复运行版基准</Button></div>
          <details><summary>版次身份与登记指纹</summary><p>目录内容：{current.edition.identity.contentHash}</p><p>来源文件声明：{current.edition.identity.sourceHash}</p><p>上传文本：{current.edition.packageHash}</p><p>原声明内容指纹：{current.edition.declaredContentHash || '未提供'}</p><p>{current.notices.join('；')}</p></details>
        </>}
        <div className="catalog-editions__actions"><Button variant={tab === 'diff' ? 'primary' : 'secondary'} onClick={() => setTab('diff')}>字段差异</Button><Button variant={tab === 'dependencies' ? 'primary' : 'secondary'} onClick={() => setTab('dependencies')}>当前依赖清单</Button><Button variant="secondary" disabled={busy} onClick={() => { setConfirmed(false); void cache.invalidateQueries({ queryKey: ['standard-catalog-editions'] }) }}>刷新材料</Button></div>
        {tab === 'diff' && <><p>对照基准：{base?.identity.catalogVersion ?? (current?.edition.baselineId ? `登记时运行目录（归档 ${current.edition.baselineId}）` : runtime.data?.identity.catalogVersion ?? '读取中')}。条目与规格按标识比较；其他数组按原位置比较，顺序变化也会呈现。</p><Select aria-label="差异对象范围" value={group} clearable={false} onChange={value => { setGroup(value); setDiffPage(0) }} options={Object.entries(groups).map(([value, label]) => ({ value, label }))} />
          {compare.isPending && <p>正在比较完整目录…</p>}{compare.error && <Alert tone="error">{errorMessage(compare.error)}</Alert>}
          {!compare.isError && compare.data && <><p>{Object.entries(compare.data.counts).map(([k, n]) => `${groups[k]} ${n} 处差异`).join(' · ')}。统计覆盖全部差异，不受当前分页影响。</p>
            <table><thead><tr><th>对象与字段</th><th>基准版</th><th>目标版</th></tr></thead><tbody>{compare.data.changes.content.map((row, index) => <tr key={`${row.group}-${row.objectId}-${row.path}-${index}`}><td>{row.name}<small>{groups[row.group]} · {operations[row.operation]} · {row.objectId}</small><code>{row.path}</code></td><td><pre>{display(row.before)}</pre></td><td><pre>{display(row.after)}</pre></td></tr>)}</tbody></table>
            {!compare.data.changes.totalElements && <p>所选范围无字段差异；这不表示来源或医学含义已核验。</p>}
            <Pagination page={diffPage} totalPages={Math.max(1, compare.data.changes.totalPages)} total={compare.data.changes.totalElements} pageSize={20} onChange={setDiffPage} label="目录字段差异分页" /><details><summary>本次对照指纹</summary><code>{compare.data.fingerprint}</code></details>
          </>}
        </>}
        {tab === 'dependencies' && <>{dependencies.isPending && <p>正在读取当前租户保存的完整依赖…</p>}{dependencies.error && <Alert tone="error">{errorMessage(dependencies.error)}</Alert>}{!dependencies.isError && dependencies.data && <><Alert>此清单覆盖同一目录体系各版次的当前及历史依赖，是迁移前盘点，不等于每项都因本次差异发生临床变化。</Alert><p>{dependencies.data.coverage.join('；')}</p><p>{dependencies.data.limitations.join('；')}</p>
          <table><thead><tr><th>依赖对象</th><th>状态与范围</th><th>引用版本</th></tr></thead><tbody>{dependencies.data.items.content.map(row => <tr key={`${row.kind}-${row.id}-${row.version}`}><td>{row.name}<small>{row.kind} · {row.id} · {row.version}</small></td><td>{row.status} · {row.historical ? '历史' : '当前'}<small>{row.mode} · {row.organizationId} / {row.departmentId}</small></td><td>{row.traces.map((t, i) => <small key={i}>{t.catalogVersion} · {t.specificationId || t.entryId || '动态或目录范围'}</small>)}</td></tr>)}</tbody></table>
          <Pagination page={dependencyPage} totalPages={Math.max(1, dependencies.data.items.totalPages)} total={dependencies.data.items.totalElements} pageSize={20} onChange={setDependencyPage} label="目录依赖分页" /><details><summary>当前依赖指纹</summary><code>{dependencies.data.fingerprint}</code></details>
        </>}</>}
      </main></div>
    </div>
  </Dialog>
}
