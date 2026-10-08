import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import '../../styles/features/treatment-skintest.css'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { GridAddressCreateInput, GridAddressLevel, GridAddressNode, RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, Dialog, EmptyState, FormField, GridAddressInput, Icon, LoadingState,
  PageHeader, Panel, PanelHead, Select, StatusBadge, TreePanel, type GridAddressValue,
} from '../../shared/ui'
import { requireGridAddressNodes, requireSavedGridAddress, type GridAddressCommand } from '../../shared/validation/gridAddressFacts'

const LEVEL_OPTIONS = [
  { value: 'PROVINCE', label: '省级' }, { value: 'CITY', label: '市级' },
  { value: 'COUNTY', label: '县区级' }, { value: 'STREET', label: '街道乡镇' },
  { value: 'COMMUNITY', label: '社区村' },
]

export function GridAddressManagement({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<3 | 5>(5)
  const [selectedId, setSelectedId] = useState<string>()
  const [dialog, setDialog] = useState<{ mode: 'create'; parentId?: string } | { mode: 'edit'; node: GridAddressNode }>()
  const [preview, setPreview] = useState<GridAddressValue>({})
  const [feedback, setFeedback] = useState('')
  const session = useRef(0)
  const currentApi = useRef(api)
  currentApi.current = api
  const nodes = useQuery({ queryKey: ['grid-addresses', 'management'], queryFn: async () => requireGridAddressNodes(await api.gridAddresses.list(5, '', true)) })
  const ready = nodes.isSuccess && !nodes.isFetching
  const visible = useMemo(() => (nodes.data ?? []).filter((node) => node.depth <= mode), [mode, nodes.data])
  const selected = ready ? visible.find((node) => node.id === selectedId) : undefined

  useEffect(() => {
    if (!ready) return
    if (!visible.length) { setSelectedId(undefined); return }
    if (!selectedId || !visible.some((node) => node.id === selectedId)) setSelectedId(visible[0].id)
  }, [ready, selectedId, visible])
  useEffect(() => { session.current += 1; setDialog(undefined); setFeedback('') }, [api])

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['grid-addresses'] }),
      queryClient.invalidateQueries({ queryKey: ['grid-address-options'] }),
    ])
  }

  const write = useMutation({
    mutationFn: async (command: GridAddressCommand) => {
      if (!ready) throw new Error('网格目录尚未确认，请重新加载')
      const before = requireGridAddressNodes(nodes.data)
      const result = command.kind === 'create' ? await api.gridAddresses.create(command.input)
        : command.kind === 'update' ? await api.gridAddresses.update(command.before.id, { ...command.input, expectedRevision: command.before.revision })
          : await api.gridAddresses.changeStatus(command.before, command.status)
      return requireSavedGridAddress(result, command, before)
    },
    onMutate: () => { session.current += 1; setFeedback(''); return { api, session: session.current } },
    onSuccess: async (node, command, submitted) => {
      if (submitted.api !== currentApi.current || submitted.session !== session.current) return
      setFeedback(command.kind === 'status' ? `网格“${node.name}”状态已更新` : `已保存网格“${node.name}”`)
      setDialog(undefined); setSelectedId(node.id)
      await refresh()
    },
    onError: (_error, _command, submitted) => {
      if (submitted?.api === currentApi.current && submitted.session === session.current) void refresh()
    },
  })
  const operationError = write.context?.api === api && write.context.session === session.current && write.error
    ? `网格操作未确认：${errorMessage(write.error)}。请重新加载核实。` : undefined
  function openDialog(next: NonNullable<typeof dialog>) { session.current += 1; write.reset(); setFeedback(''); setDialog(next) }
  function closeDialog() { if (!write.isPending) { session.current += 1; setDialog(undefined) } }

  const treeNodes = visible.map((node) => ({ id: node.id, parentId: node.parentId, label: node.name,
    secondaryText: `${node.levelName} · ${node.code}`, keywords: [node.code, node.pinyinCode, node.fullPath],
    inactive: node.status === 'INACTIVE' }))
  const busy = write.isPending

  return <>
    <PageHeader compact eyebrow="平台管理 · 基础设置" title="网格地址管理"
      description="统一维护省、市、县、街道和社区五级地址网格，为公卫管理、居民档案和机构地址提供标准编码。"
      actions={<><div className="grid-address-mode"><Select aria-label="管理层级" value={String(mode)}
        options={[{ value: '3', label: '省市县 3 级' }, { value: '5', label: '公卫网格 5 级' }]}
        onChange={(value) => { setMode(value === '3' ? 3 : 5); setPreview({}) }} /></div>
        <Button disabled={!ready || busy} onClick={() => openDialog({ mode: 'create', parentId: selectedId })}><Icon name="add" />新增网格</Button></>} />
    {feedback && <Alert tone="success" className="grid-address-feedback">{feedback}</Alert>}
    {!dialog && operationError && <div role="alert"><p>{operationError}</p>
      <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>重新加载网格</Button>
      {write.variables?.kind === 'status' && <Button disabled={!ready || busy} onClick={() => write.variables && write.mutate(write.variables)}>重试本次状态操作</Button>}
    </div>}
    {nodes.isError && <div role="alert"><p>网格地址加载失败：{errorMessage(nodes.error)}</p>
      <Button variant="secondary" disabled={nodes.isFetching || busy} onClick={() => void refresh()}>重新加载网格</Button></div>}

    <section className="grid-address-workspace">
      {ready ? <TreePanel title="地址网格" rootLabel="全国网格" nodes={treeNodes} selectedId={selectedId}
        searchPlaceholder="搜索名称、编码或拼音码" busy={busy} onSelect={setSelectedId}
        onAdd={(parentId) => openDialog({ mode: 'create', parentId })}
        onEdit={(id) => { const node = visible.find((item) => item.id === id); if (node) openDialog({ mode: 'edit', node }) }} />
        : <Panel>{nodes.isFetching ? <LoadingState label="正在加载网格地址…" />
          : <EmptyState icon="error" title="网格目录未确认" copy="重新加载成功后才能维护网格。" />}</Panel>}
      <div className="grid-address-content">
        <Panel className="grid-address-detail">
          <PanelHead title={selected?.name ?? '网格详情'} meta={selected && <StatusBadge tone={selected.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {selected.status === 'ACTIVE' ? '已启用' : '已停用'}</StatusBadge>} />
          {ready && !selected && <EmptyState icon="roadmap" title="选择一个网格节点" copy="可查看编码、层级和完整地址路径。" />}
          {selected && <div className="grid-address-detail__body">
            <div className="grid-address-path"><span>完整路径</span><strong>{selected.fullPath.replaceAll('/', ' / ')}</strong></div>
            <dl className="grid-address-facts">
              <div><dt>行政编码</dt><dd>{selected.code}</dd></div><div><dt>层级</dt><dd>{selected.levelName}</dd></div>
              <div><dt>拼音码</dt><dd>{selected.pinyinCode}</dd></div><div><dt>排序号</dt><dd>{selected.sortOrder}</dd></div>
            </dl>
            <div className="grid-address-detail__actions">
              <Button variant="secondary" disabled={busy} onClick={() => openDialog({ mode: 'edit', node: selected })}>编辑网格</Button>
              <Button variant={selected.status === 'ACTIVE' ? 'danger' : 'secondary'} busy={busy}
                onClick={() => write.mutate({ kind: 'status', before: selected, status: selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{selected.status === 'ACTIVE' ? '停用网格' : '启用网格'}</Button>
            </div>
          </div>}
        </Panel>
        <Panel className="grid-address-preview">
          <PanelHead title="录入组件预览" meta={mode === 3 ? '省市县 3 级' : '省市县街道社区 5 级'} />
          <p>单字段级联选择；支持名称、12 位统计用区划代码和拼音首字母检索。</p>
          {ready && <GridAddressInput api={api.gridAddresses} levels={mode} value={preview} onChange={setPreview} disabled={busy} />}
        </Panel>
      </div>
    </section>
    {dialog && <GridAddressDialog state={dialog} nodes={nodes.data ?? []} busy={busy} available={ready} error={operationError}
      onRefresh={refresh} onClose={closeDialog}
      onCreate={(input) => write.mutate({ kind: 'create', input })} onUpdate={(node, input) => write.mutate({ kind: 'update', before: node, input })} />}
  </>
}

function GridAddressDialog({ state, nodes, busy, available, error, onRefresh, onClose, onCreate, onUpdate }: {
  state: { mode: 'create'; parentId?: string } | { mode: 'edit'; node: GridAddressNode }
  nodes: GridAddressNode[]; busy: boolean; onClose: () => void
  available: boolean; error?: string; onRefresh: () => Promise<void>
  onCreate: (input: GridAddressCreateInput) => void
  onUpdate: (node: GridAddressNode, input: Omit<GridAddressCreateInput, 'level' | 'code'>) => void
}) {
  const editing = state.mode === 'edit' ? state.node : undefined
  const initialParent = editing?.parentId ?? (state.mode === 'create' ? state.parentId : undefined)
  const initialLevel = editing?.level ?? childLevel(nodes.find((node) => node.id === initialParent)?.level)
  const [parentId, setParentId] = useState(initialParent ?? '')
  const [level, setLevel] = useState<GridAddressLevel>(initialLevel)
  const [code, setCode] = useState(editing?.code ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  const [shortName, setShortName] = useState(editing?.shortName ?? '')
  const [pinyinCode, setPinyinCode] = useState(editing?.pinyinCode ?? '')
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 10))
  const [formError, setFormError] = useState('')
  const parentOptions = nodes.filter((node) => (node.status === 'ACTIVE' || node.id === editing?.parentId)
    && node.level === parentLevel(level) && node.id !== editing?.id)
    .map((node) => ({ value: node.id, label: node.name, secondaryText: node.code, searchKeywords: [node.pinyinCode, node.fullPath] }))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !available) return
    if (!name.trim() || !pinyinCode.replace(/[^A-Za-z0-9]/g, '') || !/^\d+$/.test(sortOrder)
      || Number(sortOrder) > 999999 || level !== 'PROVINCE' && !parentOptions.some(option => option.value === parentId)) {
      setFormError('请确认名称、有效拼音码、上级网格及 0～999999 的整数排序号'); return
    }
    setFormError('')
    const common = { parentId: parentId || undefined, name: name.trim(), shortName: shortName.trim() || undefined,
      pinyinCode: pinyinCode.trim(), sortOrder: Number(sortOrder) }
    if (editing) onUpdate(editing, common)
    else onCreate({ ...common, level, code: code.trim() })
  }

  return <Dialog title={editing ? '编辑网格地址' : '新增网格地址'} eyebrow="地址网格" size="wide" onClose={onClose}
    description="行政编码创建后保持稳定；统一使用国家统计用区划代码的 12 位结构。"
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button form="grid-address-form" type="submit" disabled={!available} busy={busy}>保存网格</Button></>}>
    {(!available || error) && <div role="alert"><p>{error ?? '网格目录尚未确认，请重新加载后再保存。'}</p>
      <Button variant="secondary" disabled={busy} onClick={() => void onRefresh()}>重新确认网格</Button></div>}
    {formError && <p role="alert">{formError}</p>}
    <form id="grid-address-form" className="grid-address-form" onSubmit={submit} inert={busy}>
      <div className="ui-form-row">
        <FormField label="网格层级" required><Select value={level} options={LEVEL_OPTIONS}
          disabled={Boolean(editing)} onChange={(value) => { const next = value as GridAddressLevel; setLevel(next); setParentId('') }} /></FormField>
        <FormField label="上级网格" required={level !== 'PROVINCE'}><Select value={parentId} options={parentOptions}
          placeholder={level === 'PROVINCE' ? '省级无上级' : '请选择上级网格'} disabled={level === 'PROVINCE'}
          onChange={setParentId} showValue /></FormField>
      </div>
      <div className="ui-form-row">
        <FormField label="统计用区划代码" required hint="固定 12 位：省2、市2、县2、乡3、村3；未到层级的码段补0"><input value={code}
          inputMode="numeric" pattern="[0-9]{12}" maxLength={12} disabled={Boolean(editing)}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 12))} required /></FormField>
        <FormField label="网格名称" required><input value={name} onChange={(event) => setName(event.target.value)} required /></FormField>
      </div>
      <div className="ui-form-row">
        <FormField label="简称"><input value={shortName} onChange={(event) => setShortName(event.target.value)} /></FormField>
        <FormField label="拼音码" required hint="例如“青禾社区”填写 QHSQ"><input value={pinyinCode}
          onChange={(event) => setPinyinCode(event.target.value.toUpperCase())} required /></FormField>
        <FormField label="排序号"><input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></FormField>
      </div>
    </form>
  </Dialog>
}

function parentLevel(level: GridAddressLevel): GridAddressLevel | undefined {
  return ({ CITY: 'PROVINCE', COUNTY: 'CITY', STREET: 'COUNTY', COMMUNITY: 'STREET' } as Partial<Record<GridAddressLevel, GridAddressLevel>>)[level]
}
function childLevel(level?: GridAddressLevel): GridAddressLevel {
  if (!level) return 'PROVINCE'
  return ({ PROVINCE: 'CITY', CITY: 'COUNTY', COUNTY: 'STREET', STREET: 'COMMUNITY' } as Partial<Record<GridAddressLevel, GridAddressLevel>>)[level] ?? 'COMMUNITY'
}
