import { FontSizeControl } from '../shared/ui/FontSizeControl'
import { useRef, useState, type ReactNode } from 'react'
import {
  Alert, Button, DataTable, EmptyState, FormField, LoadingState, Pagination, Panel, PanelHead,
  SearchField, Select, StatusBadge, Switch, Tabs, tableCellClass,
} from '../shared/ui'
import { FormPage, ListPage, MasterDetailPage, WorkbenchPage } from '../shared/ui/templates/PageTemplates'

type DemoState = 'ready' | 'loading' | 'empty' | 'no-results' | 'error' | 'forbidden'
type PageKind = 'list' | 'master-detail' | 'workbench' | 'form'
type ExampleProps = { state: DemoState; longData: boolean; onRetry: () => void }
type DemoItem = { id: string; name: string; department: string }

function demoItems(longData: boolean): DemoItem[] {
  return Array.from({ length: longData ? 75 : 8 }, (_, index) => ({
    id: `DEMO-${String(index + 1).padStart(3, '0')}`,
    name: longData ? `用于检查长文本换行与列宽的健康服务项目示例 ${index + 1}` : `健康服务示例 ${index + 1}`,
    department: longData ? '演示机构 · 社区健康管理与连续照护服务中心' : '演示机构 · 健康管理科',
  }))
}

/** 保留所在模板和搜索条件，切换的是业务区域内容。 */
function DemoContent({ state, onRetry, children }: { state: DemoState; onRetry: () => void; children: ReactNode }) {
  if (state === 'loading') return <LoadingState label="正在加载示例…" />
  if (state === 'ready') return children
  const message = {
    empty: ['暂无服务项目', '新增项目后将在这里展示。'],
    'no-results': ['没有匹配结果', '请清空或修改搜索条件。'],
    error: ['暂时无法读取数据', '请重试，已输入的搜索条件会保留。'],
    forbidden: ['无权查看此内容', '请联系管理员申请对应业务权限。'],
  }[state]
  return <EmptyState icon={state === 'forbidden' ? 'lock' : 'database'} title={message[0]} copy={message[1]}
    action={state === 'error' ? <Button variant="secondary" onClick={onRetry}>重试加载</Button> : undefined} />
}

export function ListExample({ state, longData, onRetry }: ExampleProps) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const rows = demoItems(longData).filter(item => `${item.name} ${item.id}`.includes(query))
  const pageSize = 20
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1))
  return <ListPage title="服务项目查询" description="查找服务项目及所属机构。"
    resetScrollKey={`${query}:${currentPage}`}
    filters={<SearchField label="搜索服务项目" value={query} onChange={value => { setQuery(value); setPage(0) }} placeholder="输入项目名称或编码" />}
    footer={state === 'ready' && rows.length > 0 ? <Pagination page={currentPage} totalPages={Math.ceil(rows.length / pageSize)}
      total={rows.length} onChange={setPage} /> : undefined}>
    <DemoContent state={state === 'ready' && rows.length === 0 ? 'no-results' : state} onRetry={onRetry}>
      <DataTable aria-label="服务项目结果" compact>
        <thead><tr><th>项目名称</th><th>编码</th><th>所属机构</th><th className={tableCellClass('status')}>状态</th></tr></thead>
        <tbody>{rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(item => <tr key={item.id}>
          <td>{item.name}</td><td>{item.id}</td><td>{item.department}</td>
          <td className={tableCellClass('status')}><StatusBadge tone="neutral">示例</StatusBadge></td>
        </tr>)}</tbody>
      </DataTable>
    </DemoContent>
  </ListPage>
}

function ItemDetails({ item }: { item: DemoItem }) {
  return <>
    <dl className="template-demo__facts"><dt>项目编码</dt><dd>{item.id}</dd><dt>所属机构</dt><dd>{item.department}</dd>
      <dt>说明</dt><dd>此处是虚构的模板演示数据，用于检查主从切换与长文本布局。</dd></dl>
  </>
}

function Queue({ items, selected, onSelect }: { items: DemoItem[]; selected: string; onSelect: (id: string) => void }) {
  return <div className="template-demo__queue">{items.map(item => <Button key={item.id} variant="text" aria-pressed={selected === item.id}
    onClick={() => onSelect(item.id)}>{item.name}</Button>)}</div>
}

export function MasterDetailExample({ state, longData, onRetry }: ExampleProps) {
  const items = demoItems(longData)
  const [selected, setSelected] = useState(items[0].id)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const filtered = items.filter(item => item.name.includes(query))
  const pageSize = 20, currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
  const item = items.find(candidate => candidate.id === selected) ?? items[0]
  return <MasterDetailPage title="服务项目维护" navigationLabel="项目目录"
    navigationHeader={<><PanelHead title="项目目录" /><SearchField label="搜索项目目录" value={query} onChange={value => { setQuery(value); setPage(0) }} /></>}
    navigationFooter={<Pagination label="项目目录分页" page={currentPage} total={filtered.length} totalPages={Math.ceil(filtered.length / pageSize)} onChange={setPage} />}
    navigationResetScrollKey={`${query}:${currentPage}`} detailResetScrollKey={selected}
    detailHeader={<PanelHead title={state === 'ready' ? item.name : '项目详情'} />}
    navigation={
      <DemoContent state={state === 'ready' && filtered.length === 0 ? 'no-results' : state} onRetry={onRetry}>
        <Queue items={filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)} selected={selected} onSelect={setSelected} />
      </DemoContent>}>
    <DemoContent state={state} onRetry={onRetry}><ItemDetails item={item} /></DemoContent>
  </MasterDetailPage>
}

export function WorkbenchExample({ state, longData, onRetry }: ExampleProps) {
  const items = demoItems(longData)
  const [selected, setSelected] = useState(items[0].id)
  const item = items.find(candidate => candidate.id === selected) ?? items[0]
  return <WorkbenchPage title="健康服务工作台" queueLabel="待处理队列" referenceLabel="服务参考"
    queueHeader={<PanelHead title="待处理队列" />}
    queue={<DemoContent state={state} onRetry={onRetry}>
      <Queue items={items} selected={selected} onSelect={setSelected} /></DemoContent>}
    reference={<><PanelHead title="服务参考" /><p>在此查看历史服务、相关记录与当前任务需要的参考信息。</p>
      <p>较窄的 PC 内容区内，本区域接在主作业之后，保持队列与主作业两栏。</p></>}>
    <DemoContent state={state} onRetry={onRetry}>
      <PanelHead title={item.name} />
      <ItemDetails item={item} />
      <PanelHead title="服务内容" />
      {Array.from({ length: longData ? 20 : 3 }, (_, index) => <p key={index}>服务记录 {index + 1}：核对当前任务的信息，记录处理结果。</p>)}
    </DemoContent>
  </WorkbenchPage>
}

export function FormExample({ state, onRetry }: ExampleProps) {
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('health')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)
  const [success, setSuccess] = useState(false)
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const saving = useRef(false)

  async function save() {
    if (saving.current) return
    if (!name.trim()) { setInvalid(true); return }
    saving.current = true
    setInvalid(false)
    setBusy(true)
    setFailure(false)
    setSuccess(false)
    // 仅演示延时；正式页面改为真实 mutation，使用服务端返回结果。
    await new Promise(resolve => setTimeout(resolve, 300))
    setBusy(false)
    saving.current = false
    if (simulateFailure) setFailure(true)
    else setSuccess(true)
  }

  return <FormPage title="新建服务项目" description="分组填写项目的基本信息与服务说明。"
    onSubmit={event => { event.preventDefault(); void save() }}
    feedback={<>{failure && <Alert duration={null}>保存失败，输入已保留，请重试。</Alert>}
      {success && <Alert tone="success">演示保存成功</Alert>}</>}
    footer={<><Switch label="模拟保存失败" checked={simulateFailure} onChange={setSimulateFailure} />
      <Button variant="secondary" disabled={busy} onClick={() => {
        setName(''); setDepartment('health'); setNote(''); setFailure(false); setSuccess(false); setInvalid(false)
      }}>重置</Button><Button type="submit" busy={busy} disabled={state !== 'ready'}>保存项目</Button></>}>
    <DemoContent state={state} onRetry={onRetry}>
      <Panel><PanelHead title="基本信息" /><div className="ui-page-template__fields">
        <FormField label="项目名称" required error={invalid ? '请填写项目名称' : undefined}>
          <input value={name} disabled={busy} onChange={event => { setName(event.target.value); setInvalid(false) }} />
        </FormField>
        <FormField label="执行科室"><Select value={department} disabled={busy} onChange={setDepartment}
          options={[{ value: 'health', label: '健康管理科' }, { value: 'general', label: '全科门诊' }]} /></FormField>
      </div></Panel>
      <Panel><PanelHead title="服务说明" /><FormField label="备注"><textarea value={note} disabled={busy}
        onChange={event => setNote(event.target.value)} /></FormField></Panel>
    </DemoContent>
  </FormPage>
}

export function PageTemplateGallery() {
  const [kind, setKind] = useState<PageKind>('list')
  const [state, setState] = useState<DemoState>('ready')
  const [longData, setLongData] = useState(false)
  const props: ExampleProps = { state, longData, onRetry: () => setState('ready') }
  return <div className="template-demo">
    <aside className="template-demo__sidebar" aria-label="工作站侧栏占位"><strong>RHN 页面模板</strong><p>本地演示 · 虚构数据</p>
      <p>预留工作站导航宽度，用于人工检查真实可用空间。</p></aside>
    <main className="template-demo__main">
      <div className="template-demo__controls">
        <Tabs<PageKind> label="页面模板" value={kind} onChange={setKind} items={[
          { value: 'list', label: '查询列表' }, { value: 'master-detail', label: '主从维护' },
          { value: 'workbench', label: '临床工作台' }, { value: 'form', label: '分组表单' },
        ]} />
        <Select aria-label="演示状态" value={state} onChange={value => setState(value as DemoState)} options={[
          { value: 'ready', label: '正常' }, { value: 'loading', label: '加载中' }, { value: 'empty', label: '空数据' },
          { value: 'no-results', label: '无结果' }, { value: 'error', label: '失败' }, { value: 'forbidden', label: '无权限' },
        ]} />
        <FontSizeControl />
        <Switch label="长文本与长列表" checked={longData} onChange={setLongData} />
      </div>
      {kind === 'list' && <ListExample {...props} />}
      {kind === 'master-detail' && <MasterDetailExample {...props} />}
      {kind === 'workbench' && <WorkbenchExample {...props} />}
      {kind === 'form' && <FormExample {...props} />}
    </main>
  </div>
}
