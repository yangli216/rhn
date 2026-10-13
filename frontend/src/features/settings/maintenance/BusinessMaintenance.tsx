import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import { errorMessage, type MaintenancePlan, type MaintenancePreviewRequest, type MaintenanceScopeRequest, type RhnApi } from '../../../shared/rhnApi'
import { safeRandomUUID } from '../../../shared/utils/uuid'
import { Alert, Button, Dialog, FormField, LoadingState, Select, Tabs } from '../../../shared/ui'
import { MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { MaintenanceBatchDialog } from './MaintenanceBatchDialog'
import { MaintenancePreview } from './MaintenancePreview'
import { MaintenanceTaskRecords, downloadMaintenanceFile } from './MaintenanceTaskRecords'
import { maintenanceLifecycleLabels, maintenanceModuleLabels } from '../../../shared/presentation/maintenance'
import './maintenance.css'

type Tab = 'initialize' | 'cleanup' | 'records'
type FileInput = { fileName: string; contentBase64: string }

export function BusinessMaintenance(props: { api: RhnApi; tenantId: string; context: ClinicalContext; authorities: string[] }) {
  const scopeKey = `${props.tenantId}:${props.context.organization?.id}:${props.context.department?.id}`
  return <MaintenanceWorkspace key={scopeKey} {...props} scopeKey={scopeKey} />
}
function MaintenanceWorkspace({ api, context, authorities, scopeKey }: {
  api: RhnApi; tenantId: string; context: ClinicalContext; authorities: string[]; scopeKey: string
}) {
  const [tab, setTab] = useState<Tab>('initialize')
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
  const canPreview = manage && !busy && (wholeTenant || organizations.length > 0) && !!reason.trim()
    && (tab === 'cleanup' ? (cleanupMode === 'CLEAN_TEST' ? !!batchId : preliveConfirmed) && modules.length > 0 && !!workspace.data?.physicalCleanupEnabled
      : dataset === 'PARAMETER_DEFAULTS' ? keys.length > 0 : !!file)
  function invalidate() { generation.current++; setPlan(null); setConfirmOpen(false); setConfirmation(''); setFailure('') }
  async function preview() {
    if (!canPreview) return
    const epoch = generation.current
    const body: MaintenancePreviewRequest = { scope, reason,
      datasetCode: tab === 'cleanup' ? 'CLINICAL_TEST' : dataset,
      operation: tab === 'cleanup' ? cleanupMode : dataset === 'PARAMETER_DEFAULTS' ? 'INITIALIZE' : 'IMPORT_CATALOG',
      modules: tab === 'cleanup' ? modules : [dataset === 'PARAMETER_DEFAULTS' ? 'CONFIGURATION' : 'MASTER_DATA'],
      batchId: tab === 'cleanup' && cleanupMode === 'CLEAN_TEST' ? batchId : undefined,
      inputJson: JSON.stringify(tab === 'cleanup' ? { noRealEffectsConfirmed: preliveConfirmed } : dataset === 'PARAMETER_DEFAULTS' ? { keys } : file) }
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
    if (busy || !plan?.id || !plan.fingerprint || !execute || confirmation !== targetName) return
    if (executionCommand.current.plan !== plan.id) executionCommand.current = { plan: plan.id, command: safeRandomUUID() }
    setBusy(true); setFailure('')
    try { await api.maintenance.execute(plan.id, { fingerprint: plan.fingerprint, requestCode: executionCommand.current.command, confirmation })
      setConfirmOpen(false); setPlan(null); setTab('records') }
    catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  async function updateLifecycle() {
    if (busy || !reason.trim() || confirmation !== targetName || (lifecycle === 'PRELIVE' && !preliveConfirmed)) return
    setBusy(true); setFailure('')
    try { await api.maintenance.lifecycle({ scope: { ...scope, includeDescendants: false }, lifecycle,
      reason, confirmation, noRealEffectsConfirmed: preliveConfirmed }); setLifecycleOpen(false); invalidate(); await workspace.refetch() }
    catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  return <MasterDetailPage title="业务初始化与清理" description="上线前补齐基础数据，按机构与模块核对并清理测试批次。"
    navigationLabel="维护范围与方案" detailLabel={tab === 'records' ? '执行记录' : '影响预览'}
    navigationHeader={<p>环境：{workspace.data?.environmentName ?? '加载中'} · 租户：{workspace.data?.tenantName ?? '加载中'}</p>}
    navigation={<div className="maintenance-detail">
      {workspace.isPending && <LoadingState label="加载授权范围" />}
      {workspace.isError && <Alert placement="inline">{errorMessage(workspace.error)}</Alert>}
      <FormField label="范围类型"><Select disabled={busy} value={wholeTenant ? 'TENANT' : 'ORGANIZATION'} options={[
        { value: 'ORGANIZATION', label: '指定机构' }, { value: 'TENANT', label: '整个租户', disabled: !authorities.includes('MAINTENANCE.TENANT') },
      ]} onChange={value => { invalidate(); setWholeTenant(value === 'TENANT'); setDescendants(false); setBatchId('') }} /></FormField>
      {!wholeTenant && <FormField label="目标机构" required><Select multiple value={organizations} options={options} disabled={busy}
        onChange={values => { invalidate(); setOrganizations(values); setBatchId('') }} /></FormField>}
      <label className="maintenance-check"><input type="checkbox" checked={descendants} disabled={busy || wholeTenant}
        onChange={event => { invalidate(); setDescendants(event.target.checked); setBatchId('') }} />包含下属机构</label>
      <p>上线状态：{workspace.data?.organizations?.filter(item => wholeTenant || organizations.includes(item.id!))
        .map(item => `${item.name}：${maintenanceLifecycleLabels[item.lifecycle ?? 'UNKNOWN']}`).join('；')}</p>
      {authorities.includes('MAINTENANCE.LIFECYCLE') && <Button variant="secondary" disabled={busy || descendants}
        onClick={() => { invalidate(); setLifecycleOpen(true) }}>确认机构上线状态</Button>}
      {tab === 'initialize' && <>
        <FormField label="初始化方案"><Select value={dataset} disabled={busy} options={[
          { value: 'PARAMETER_DEFAULTS', label: '基础配置补齐', disabled: !authorities.includes('CONFIGURATION.ACCESS') },
          { value: 'ORGANIZATION_CATALOG', label: '机构目录与价格导入' },
        ]} onChange={value => { invalidate(); setDataset(value) }} /></FormField>
        {dataset === 'PARAMETER_DEFAULTS' ? <FormField label="待补齐参数" hint="仅新增缺失配置，保留已有值。"><Select multiple value={keys}
          loading={parameters.isPending} options={(parameters.data?.parameters ?? []).map(item => ({ value: item.key!, label: item.name! }))}
          disabled={busy} onChange={values => { invalidate(); setKeys(values) }} /></FormField>
          : <><Button variant="secondary" onClick={() => { void api.maintenance.catalogTemplate().then(blob => downloadMaintenanceFile(blob, '机构目录导入模板.xlsx')).catch(error => setFailure(errorMessage(error))) }}>下载目录导入模板</Button>
            <FormField label="机构目录文件" hint="CSV / XLSX，最多 5 MB；保留已有机构目录和价格。"><input type="file" accept=".csv,.xlsx" disabled={busy}
              onChange={event => void readFile(event.target.files?.[0])} /></FormField><p>{file?.fileName}</p></>}
        {parameters.isError && dataset === 'PARAMETER_DEFAULTS' && <Alert placement="inline">{errorMessage(parameters.error)}</Alert>}
      </>}
      {tab === 'cleanup' && <>
        {!workspace.data?.physicalCleanupEnabled && <Alert placement="inline" tone="warning">当前环境尚未开放物理清理。</Alert>}
        <FormField label="清理场景"><Select value={cleanupMode} disabled={busy} options={[
          { value: 'CLEAN_TEST', label: '清理测试来源批次' },
          { value: 'RESET_PRELIVE', label: '上线前重置门诊业务', disabled: !authorities.includes('MAINTENANCE.LIFECYCLE') },
        ]} onChange={value => { invalidate(); setCleanupMode(value as 'CLEAN_TEST' | 'RESET_PRELIVE') }} /></FormField>
        <FormField label="业务模块" required><Select multiple value={modules} disabled={busy} options={['OUTPATIENT','BILLING','PHARMACY']
          .map(value => ({ value, label: maintenanceModuleLabels[value] }))} onChange={values => { invalidate(); setModules(values) }} /></FormField>
        {cleanupMode === 'CLEAN_TEST' && <>
        <FormField label="测试来源批次" required><Select value={batchId} disabled={busy} options={(batches.data ?? []).map(item => ({ value: item.id!, label: item.name! }))}
          onChange={value => { invalidate(); setBatchId(value) }} /></FormField>
        {batches.isError && <Alert placement="inline">{errorMessage(batches.error)}</Alert>}
        <Button variant="secondary" disabled={!manage || busy || (!wholeTenant && !organizations.length)} onClick={() => setBatchOpen(true)}>登记测试来源批次</Button>
        </>}
        {cleanupMode === 'RESET_PRELIVE' && <label className="maintenance-check"><input type="checkbox" checked={preliveConfirmed} disabled={busy}
          onChange={event => { invalidate(); setPreliveConfirmed(event.target.checked) }} />所选机构尚未上线，未发生真实诊疗、资金收付或药品交付</label>}
      </>}
      {tab !== 'records' && <FormField label="操作原因" required><textarea value={reason} maxLength={1000} disabled={busy}
        onChange={event => { invalidate(); setReason(event.target.value) }} /></FormField>}
    </div>}
    navigationFooter={tab !== 'records' ? <Button busy={busy} disabled={!canPreview} onClick={() => void preview()}>生成影响预览</Button> : undefined}
    detailHeader={<Tabs label="维护功能" value={tab} items={[{ value: 'initialize', label: '基础初始化' }, { value: 'cleanup', label: '业务清理' }, { value: 'records', label: '执行记录' }]}
      onChange={value => { invalidate(); setTab(value) }} />}
    detailFooter={tab !== 'records' ? <Button variant={tab === 'cleanup' ? 'danger' : 'primary'} disabled={!plan?.id || !!plan.blockers?.length || !execute || busy}
      onClick={() => { setConfirmation(''); setConfirmOpen(true) }}>{tab === 'cleanup' ? '核对并清理业务' : '核对并初始化'}</Button> : undefined}
    feedback={failure ? <Alert placement="inline">{failure}</Alert> : undefined}>
    {tab === 'records' ? <MaintenanceTaskRecords api={api} scopeKey={scopeKey} authorities={authorities} tenantName={workspace.data?.tenantName ?? ''} organizations={options} /> : <MaintenancePreview plan={plan} organizations={options} />}
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
    {confirmOpen && <Dialog title={tab === 'cleanup' ? '确认业务清理' : '确认基础初始化'} onClose={() => { if (!busy) setConfirmOpen(false) }} closeOnBackdrop={!busy}
      footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>返回核对预览</Button>
        <Button variant={tab === 'cleanup' ? 'danger' : 'primary'} busy={busy} disabled={confirmation !== targetName || !targetName} onClick={() => void run()}>启动维护任务</Button></>}>
      <p>环境：{workspace.data?.environmentName}；目标：{targetName}。执行期间整个租户暂停业务写入。</p>
      <p>机构范围和影响以已生成的预览为准。数据库处理前保存加密范围快照，完成后保留执行审计。</p>
      <FormField label={`输入目标名称确认：${targetName}`} required><input value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></FormField>
      {failure && <Alert placement="inline">{failure}</Alert>}
    </Dialog>}
  </MasterDetailPage>
}
