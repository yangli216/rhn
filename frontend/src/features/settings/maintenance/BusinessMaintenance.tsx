import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import { errorMessage, type MaintenancePlan, type MaintenancePreviewRequest, type MaintenanceScopeRequest, type RhnApi } from '../../../shared/rhnApi'
import { formatTime } from '../../../shared/format'
import { safeRandomUUID } from '../../../shared/utils/uuid'
import { Alert, Button, Dialog, FormField, LoadingState, Select, ActionMenu, PanelHead } from '../../../shared/ui'
import { ListPage, MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { MaintenanceBatchDialog } from './MaintenanceBatchDialog'
import { MaintenancePreview } from './MaintenancePreview'
import { MaintenanceTaskRecords, downloadMaintenanceFile } from './MaintenanceTaskRecords'
import { maintenanceLifecycleLabels, maintenanceModuleLabels } from '../../../shared/presentation/maintenance'
import './maintenance.css'

type MaintenanceView = 'initialize' | 'cleanup' | 'records'
type FileInput = { fileName: string; contentBase64: string }

export function BusinessMaintenance(props: { api: RhnApi; tenantId: string; context: ClinicalContext; authorities: string[] }) {
  const scopeKey = `${props.tenantId}:${props.context.organization?.id}:${props.context.department?.id}`
  return <MaintenanceWorkspace key={scopeKey} {...props} scopeKey={scopeKey} />
}
function MaintenanceWorkspace({ api, context, authorities, scopeKey }: {
  api: RhnApi; tenantId: string; context: ClinicalContext; authorities: string[]; scopeKey: string
}) {
  const [view, setView] = useState<MaintenanceView>('initialize')
  const [wholeTenant, setWholeTenant] = useState(false)
  const [organizations, setOrganizations] = useState<string[]>(context.organization?.id ? [context.organization.id] : [])
  const [descendants, setDescendants] = useState(false)
  const [dataset, setDataset] = useState(authorities.includes('CONFIGURATION.ACCESS') ? 'PARAMETER_DEFAULTS' : 'ORGANIZATION_CATALOG')
  const [keys, setKeys] = useState<string[]>([])
  const [modules, setModules] = useState(['OUTPATIENT', 'BILLING', 'PHARMACY'])
  const [batchId, setBatchId] = useState('')
  const [cleanupMode, setCleanupMode] = useState<'CLEAN_TEST' | 'RESET_PRELIVE'>('CLEAN_TEST')
  const [preliveConfirmed, setPreliveConfirmed] = useState(false)
  const [lifecycleOpen, setLifecycleOpen] = useState(false)
  const [lifecycle, setLifecycle] = useState<'PRELIVE' | 'LIVE'>('PRELIVE')
  const [file, setFile] = useState<FileInput | null>(null)
  const [reason, setReason] = useState('')
  const [plan, setPlan] = useState<MaintenancePlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [submittedTaskId, setSubmittedTaskId] = useState<string>()
  const [now, setNow] = useState(Date.now)
  const queryClient = useQueryClient()
  const generation = useRef(0)
  const fileGeneration = useRef(0)
  const executionCommand = useRef({ plan: '', command: '' })
  const workspace = useQuery({ queryKey: ['maintenance-workspace', scopeKey], queryFn: api.maintenance.workspace })
  const batches = useQuery({ queryKey: ['maintenance-batches', scopeKey], queryFn: api.maintenance.batches })
  const parameters = useQuery({ queryKey: ['maintenance-parameters', scopeKey], queryFn: api.maintenance.parameterOptions,
    enabled: authorities.includes('CONFIGURATION.ACCESS') })
  const manage = authorities.includes('MAINTENANCE.MANAGE')
  const execute = authorities.includes('MAINTENANCE.EXECUTE')
  const scope: MaintenanceScopeRequest = { wholeTenant, organizationIds: wholeTenant ? [] : organizations, includeDescendants: descendants }
  const options = (workspace.data?.organizations ?? []).map(item => ({ value: item.id!, label: item.name! }))
  const targetScope = plan?.scope
  const targetName = (targetScope?.wholeTenant ?? wholeTenant) ? workspace.data?.tenantName ?? ''
    : (targetScope?.organizationIds ?? organizations).map(id => options.find(item => item.value === id)?.label ?? '').join('、')
  const scopeBatches = (batches.data ?? []).filter(batch => batch.datasetCode === 'CLINICAL_TEST'
    && batch.roots?.some(root => wholeTenant || descendants || organizations.includes(root.organizationId ?? '')))
  const lifecycleReady = !!workspace.data?.organizations?.length && workspace.data.organizations
    .filter(item => wholeTenant || organizations.includes(item.id!)).every(item => item.lifecycle === 'PRELIVE')
  const previewHint = !manage ? '缺少维护方案管理权限。'
    : !workspace.data || workspace.isError ? '请先加载授权机构范围。'
    : !wholeTenant && !organizations.length ? '请选择目标机构。'
    : view === 'cleanup' && !workspace.data.physicalCleanupEnabled ? '当前环境未开放物理清理。'
    : view === 'cleanup' && !modules.length ? '请选择清理模块。'
    : view === 'cleanup' && cleanupMode === 'CLEAN_TEST' && batches.isError ? '批次加载失败，请重试。'
    : view === 'cleanup' && cleanupMode === 'CLEAN_TEST' && !scopeBatches.some(batch => batch.id === batchId) ? '请登记并选择测试批次。'
    : view === 'cleanup' && cleanupMode === 'RESET_PRELIVE' && !lifecycleReady ? '请先确认目标机构处于上线前。'
    : view === 'cleanup' && cleanupMode === 'RESET_PRELIVE' && !preliveConfirmed ? '请确认未发生真实业务交付。'
    : view === 'initialize' && dataset === 'PARAMETER_DEFAULTS' && !keys.length ? '请选择待补齐参数。'
    : view === 'initialize' && dataset !== 'PARAMETER_DEFAULTS' && !file ? '请上传机构目录文件。'
    : !reason.trim() ? '请填写操作原因。' : ''
  const canPreview = !busy && !previewHint
  const expired = !!plan && (!plan.expiresAt || Date.parse(plan.expiresAt) <= now)
  const executionHint = !plan ? '生成影响预览后可核对并执行。'
    : plan.blockers?.length ? '预览存在阻断项，请按右侧说明处理后重新生成预览。'
    : expired ? '预览已过期，请重新生成。'
    : !execute ? '缺少维护执行权限。'
    : !targetName ? '请重新加载目标机构名称。' : ''
  useEffect(() => {
    if (!plan) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [plan])
  function invalidate() { generation.current++; setPlan(null); setConfirmOpen(false); setConfirmation(''); setFailure('') }
  function invalidateScope() { invalidate(); setBatchId(''); setPreliveConfirmed(false) }
  async function preview() {
    if (!canPreview) return
    invalidate()
    const epoch = generation.current
    const body: MaintenancePreviewRequest = { scope, reason,
      datasetCode: view === 'cleanup' ? 'CLINICAL_TEST' : dataset,
      operation: view === 'cleanup' ? cleanupMode : dataset === 'PARAMETER_DEFAULTS' ? 'INITIALIZE' : 'IMPORT_CATALOG',
      modules: view === 'cleanup' ? modules : [dataset === 'PARAMETER_DEFAULTS' ? 'CONFIGURATION' : 'MASTER_DATA'],
      batchId: view === 'cleanup' && cleanupMode === 'CLEAN_TEST' ? batchId : undefined,
      inputJson: JSON.stringify(view === 'cleanup' ? { noRealEffectsConfirmed: preliveConfirmed } : dataset === 'PARAMETER_DEFAULTS' ? { keys } : file) }
    setBusy(true); setFailure('')
    try { const result = await api.maintenance.preview(body); if (epoch === generation.current) setPlan(result) }
    catch (error) { if (epoch === generation.current) setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  async function readFile(value?: File) {
    invalidate(); setFile(null); fileGeneration.current++
    if (!value) return
    if (value.size > 5_000_000 || !/\.(csv|xlsx)$/i.test(value.name)) { setFailure('请选择不超过 5 MB 的 CSV 或 XLSX 文件'); return }
    const epoch = fileGeneration.current
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(value) })
      if (epoch === fileGeneration.current) setFile({ fileName: value.name, contentBase64: data })
    } catch (error) { if (epoch === fileGeneration.current) setFailure(errorMessage(error)) }
  }
  async function run() {
    if (busy || executionHint || !plan?.id || !plan.fingerprint || !execute || confirmation !== targetName
      || !plan.expiresAt || Date.parse(plan.expiresAt) <= Date.now()) return
    if (executionCommand.current.plan !== plan.id) executionCommand.current = { plan: plan.id, command: safeRandomUUID() }
    setBusy(true); setFailure('')
    try { const task = await api.maintenance.execute(plan.id, { fingerprint: plan.fingerprint, requestCode: executionCommand.current.command, confirmation })
      setSubmittedTaskId(task.id)
      void queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', scopeKey] })
      setConfirmOpen(false); setPlan(null); setView('records') }
    catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  async function updateLifecycle() {
    if (busy || !reason.trim() || confirmation !== targetName || (lifecycle === 'PRELIVE' && !preliveConfirmed)) return
    setBusy(true); setFailure('')
    try { await api.maintenance.lifecycle({ scope: { ...scope, includeDescendants: false }, lifecycle,
      reason, confirmation, noRealEffectsConfirmed: preliveConfirmed }); setLifecycleOpen(false); invalidate(); await workspace.refetch() }
    catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  function changeView(next: MaintenanceView) { invalidate(); setView(next) }
  const environment = `环境：${workspace.data?.environmentName ?? '加载中'} · 租户：${workspace.data?.tenantName ?? '加载中'}`
  const actions = <>
    <ActionMenu label="切换操作" disabled={busy} items={[
      { key: 'initialize', label: '业务初始化', disabled: view === 'initialize', onSelect: () => changeView('initialize') },
      { key: 'cleanup', label: '业务清理', disabled: view === 'cleanup', onSelect: () => changeView('cleanup') },
    ]} />
    {view !== 'records' && <Button variant="secondary" size="sm" disabled={busy} onClick={() => changeView('records')}>执行记录</Button>}
  </>
  if (view === 'records') return <div className="maintenance-page maintenance-page--records">
    <ListPage title="维护执行记录" description={environment} actions={actions} filters={null}>
      <MaintenanceTaskRecords api={api} scopeKey={scopeKey} authorities={authorities} tenantName={workspace.data?.tenantName ?? ''} organizations={options}
        initialTaskId={submittedTaskId} onReturnToSetup={operation => {
          invalidate(); setPreliveConfirmed(false)
          if (operation === 'CLEAN_TEST' || operation === 'RESET_PRELIVE') { setCleanupMode(operation); setView('cleanup') }
          else { setDataset(operation === 'IMPORT_CATALOG' ? 'ORGANIZATION_CATALOG' : 'PARAMETER_DEFAULTS'); setView('initialize') }
        }} />
    </ListPage>
  </div>
  const title = view === 'cleanup' ? '业务清理' : '业务初始化'
  const selectedLifecycle = workspace.data?.organizations?.filter(item => wholeTenant || organizations.includes(item.id!)) ?? []
  return <div className="maintenance-page"><MasterDetailPage title={title} description={environment} actions={actions}
    navigationLabel={`${title}设置`} detailLabel="影响预览" navigationResetScrollKey={view} detailResetScrollKey={view}
    navigationHeader={<PanelHead title={`${title}设置`} />}
    navigation={<div className="maintenance-form">
      {workspace.isPending && <LoadingState label="加载授权范围" />}
      {workspace.isError && <Alert placement="inline">{errorMessage(workspace.error)}</Alert>}
      <section aria-label="目标范围">
        <h3 className="maintenance-section-title">目标范围</h3>
        <div className="ui-page-template__fields maintenance-form-grid">
          <FormField label="范围类型"><Select disabled={busy} value={wholeTenant ? 'TENANT' : 'ORGANIZATION'} options={[
            { value: 'ORGANIZATION', label: '指定机构' }, { value: 'TENANT', label: '整个租户', disabled: !authorities.includes('MAINTENANCE.TENANT') },
          ]} onChange={value => { invalidateScope(); setWholeTenant(value === 'TENANT'); setDescendants(false) }} /></FormField>
          {!wholeTenant && <FormField label="目标机构" required><Select multiple value={organizations} options={options} disabled={busy}
            onChange={values => { invalidateScope(); setOrganizations(values) }} /></FormField>}
        </div>
        <label className="maintenance-check"><input type="checkbox" checked={descendants} disabled={busy || wholeTenant}
          onChange={event => { invalidateScope(); setDescendants(event.target.checked) }} />包含下属机构</label>
        {view === 'cleanup' && <div className="maintenance-scope-status">
          <span className="maintenance-help">上线状态：{selectedLifecycle.map(item =>
            `${selectedLifecycle.length > 1 ? `${item.name}：` : ''}${maintenanceLifecycleLabels[item.lifecycle ?? 'UNKNOWN']}`).join('；') || '未选择'}</span>
          {authorities.includes('MAINTENANCE.LIFECYCLE') && <Button variant="text" size="sm" disabled={busy || descendants}
            onClick={() => { invalidate(); setLifecycleOpen(true) }}>确认机构上线状态</Button>}
        </div>}
      </section>
      <section aria-label={view === 'cleanup' ? '清理方案' : '初始化方案设置'}>
        <h3 className="maintenance-section-title">{view === 'cleanup' ? '清理方案' : '初始化方案'}</h3>
        <div className="ui-page-template__fields maintenance-form-grid">
          {view === 'initialize' && <>
            <FormField label="初始化方案" className="maintenance-field-wide"><Select value={dataset} disabled={busy} options={[
              { value: 'PARAMETER_DEFAULTS', label: '基础配置补齐', disabled: !authorities.includes('CONFIGURATION.ACCESS') },
              { value: 'ORGANIZATION_CATALOG', label: '机构目录与价格导入' },
            ]} onChange={value => { invalidate(); setDataset(value) }} /></FormField>
            {dataset === 'PARAMETER_DEFAULTS' ? <FormField label="待补齐参数" className="maintenance-field-wide" hint="补齐缺失的默认配置，已有值保留。"><Select multiple value={keys}
              loading={parameters.isPending} options={(parameters.data?.parameters ?? []).map(item => ({ value: item.key!, label: item.name! }))}
              disabled={busy} onChange={values => { invalidate(); setKeys(values) }} /></FormField>
              : <FormField label="机构目录文件" className="maintenance-field-wide" hint="CSV / XLSX，最多 5 MB；已有机构目录和价格保留。"><input type="file" accept=".csv,.xlsx" disabled={busy}
                onChange={event => void readFile(event.target.files?.[0])} /></FormField>}
            {dataset !== 'PARAMETER_DEFAULTS' && <Button className="maintenance-field-wide" variant="text" size="sm" disabled={busy} onClick={() => {
              void api.maintenance.catalogTemplate().then(blob => downloadMaintenanceFile(blob, '机构目录导入模板.xlsx')).catch(error => setFailure(errorMessage(error)))
            }}>下载目录导入模板</Button>}
            {parameters.isError && dataset === 'PARAMETER_DEFAULTS' && <Alert className="maintenance-field-wide" placement="inline">{errorMessage(parameters.error)}</Alert>}
          </>}
          {view === 'cleanup' && <>
            <FormField label="清理场景" className="maintenance-field-wide" hint="测试批次按已登记来源清理；上线前重置处理目标机构的全部门诊业务。"><Select value={cleanupMode} disabled={busy} options={[
              { value: 'CLEAN_TEST', label: '清理测试来源批次' },
              { value: 'RESET_PRELIVE', label: '上线前重置门诊业务', disabled: !authorities.includes('MAINTENANCE.LIFECYCLE') },
            ]} onChange={value => { invalidate(); setCleanupMode(value as 'CLEAN_TEST' | 'RESET_PRELIVE') }} /></FormField>
            <FormField label="业务模块" required className="maintenance-field-wide" hint="支持门诊、收费与药房；住院及完整检验检查关联尚未接入，会阻断清理。"><Select multiple value={modules} disabled={busy} options={['OUTPATIENT','BILLING','PHARMACY']
              .map(value => ({ value, label: maintenanceModuleLabels[value] }))} onChange={values => { invalidate(); setModules(values) }} /></FormField>
            {cleanupMode === 'CLEAN_TEST' && <>
              <FormField label="测试来源批次" required className="maintenance-field-wide"><Select value={batchId} disabled={busy} loading={batches.isPending} options={scopeBatches.map(item => ({ value: item.id!, label: `${item.name}（${item.roots?.length ?? 0} 个就诊）` }))}
                onChange={value => { invalidate(); setBatchId(value) }} /></FormField>
              <Button className="maintenance-field-wide" variant="secondary" size="sm" disabled={!manage || busy || (!wholeTenant && !organizations.length)} onClick={() => setBatchOpen(true)}>登记测试来源批次</Button>
              {batches.isError && <Alert className="maintenance-field-wide" placement="inline">{errorMessage(batches.error)}<Button variant="secondary" onClick={() => void batches.refetch()}>重新加载测试批次</Button></Alert>}
            </>}
          </>}
        </div>
        {view === 'cleanup' && cleanupMode === 'RESET_PRELIVE' && <label className="maintenance-check"><input type="checkbox" checked={preliveConfirmed} disabled={busy}
          onChange={event => { invalidate(); setPreliveConfirmed(event.target.checked) }} />所选机构尚未上线，未发生真实诊疗、资金收付或药品交付</label>}
      </section>
      <div className="ui-page-template__fields maintenance-form-grid">
        <FormField label="操作原因" required className="maintenance-field-wide"><textarea value={reason} rows={3} maxLength={1000} disabled={busy}
          onChange={event => { invalidate(); setReason(event.target.value) }} /></FormField>
      </div>
    </div>}
    navigationFooter={<div className="maintenance-footer">
      {previewHint && <span className="maintenance-help">{previewHint}</span>}
      <Button variant={plan ? 'secondary' : 'primary'} busy={busy} disabled={!canPreview} onClick={() => void preview()}>{view === 'cleanup' ? '生成清理预览' : '生成初始化预览'}</Button>
    </div>}
    detailHeader={<PanelHead title={view === 'cleanup' ? '清理预览' : '初始化预览'} meta={plan ? `有效至 ${formatTime(plan.expiresAt)}` : undefined} />}
    detailScroll="content"
    detailFooter={<div className="maintenance-footer">
      {plan && !plan.blockers?.length && executionHint && <span className="maintenance-help">{executionHint}</span>}
      <Button variant={view === 'cleanup' ? 'danger' : 'primary'} disabled={!plan?.id || !!executionHint || busy}
        onClick={() => { setConfirmation(''); setConfirmOpen(true) }}>{view === 'cleanup' ? '执行业务清理' : '执行初始化'}</Button>
    </div>}
    feedback={failure ? <Alert placement="inline">{failure}</Alert> : undefined}>
    <MaintenancePreview key={plan?.id ?? view} plan={plan} organizations={options} />
    {batchOpen && <MaintenanceBatchDialog api={api} scope={scope} scopeKey={scopeKey} onClose={() => setBatchOpen(false)}
      onRegistered={batch => { invalidate(); setBatchId(batch.id!); setBatchOpen(false); void batches.refetch() }} />}
    {lifecycleOpen && <Dialog title="确认机构上线状态" onClose={() => { if (!busy) setLifecycleOpen(false) }} closeOnBackdrop={!busy}
      footer={<><Button variant="secondary" disabled={busy} onClick={() => setLifecycleOpen(false)}>返回维护范围</Button>
        <Button variant={lifecycle === 'LIVE' ? 'danger' : 'primary'} busy={busy} disabled={confirmation !== targetName || !reason.trim() || (lifecycle === 'PRELIVE' && !preliveConfirmed)}
          onClick={() => void updateLifecycle()}>确认上线状态</Button></>}>
      <p>目标：{targetName}。确认正式上线后不能回退，上线前重置入口将关闭。</p>
      <FormField label="上线状态"><Select value={lifecycle} options={[{ value: 'PRELIVE', label: '尚未上线' }, { value: 'LIVE', label: '正式上线' }]}
        disabled={busy} onChange={value => setLifecycle(value as 'PRELIVE' | 'LIVE')} /></FormField>
      <FormField label="变更原因" required><textarea value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></FormField>
      {lifecycle === 'PRELIVE' && <label className="maintenance-check"><input type="checkbox" checked={preliveConfirmed} disabled={busy}
        onChange={event => setPreliveConfirmed(event.target.checked)} />目标机构尚未上线，未发生真实业务交付</label>}
      <FormField label={`输入目标名称确认：${targetName}`} required><input value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></FormField>
      {failure && <Alert placement="inline">{failure}</Alert>}
    </Dialog>}
    {confirmOpen && <Dialog title={view === 'cleanup' ? '确认业务清理' : '确认基础初始化'} onClose={() => { if (!busy) setConfirmOpen(false) }} closeOnBackdrop={!busy}
      footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>返回核对预览</Button>
        <Button variant={view === 'cleanup' ? 'danger' : 'primary'} busy={busy} disabled={confirmation !== targetName || !targetName || !!executionHint} onClick={() => void run()}>启动维护任务</Button></>}>
      <p>环境：{workspace.data?.environmentName}；目标：{targetName}。执行期间整个租户暂停业务写入。</p>
      <p>执行范围以本次预览为准，处理前保存范围快照。</p>
      <FormField label={`输入目标名称确认：${targetName}`} required><input value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></FormField>
      {executionHint && <Alert placement="inline" tone="warning">{executionHint}</Alert>}
      {failure && <Alert placement="inline">{failure}</Alert>}
    </Dialog>}
  </MasterDetailPage></div>
}
