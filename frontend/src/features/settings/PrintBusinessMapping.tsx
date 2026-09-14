import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  errorMessage, type PrintBusinessTask, type PrintImplementationScope, type PrintPurpose, type RhnApi,
} from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, Icon, LoadingState, Select, StatusBadge, Tabs, Tooltip } from '../../shared/ui'

type EditableScope = Exclude<PrintImplementationScope, 'PLATFORM'>

const CATEGORY_LABELS: Record<string, string> = {
  CLINICAL_DOCUMENT: '临床文书', PRESCRIPTION: '处方', APPLICATION: '申请单',
  CARD: '执行卡', LABEL: '标签', LIST: '清单',
}
const PURPOSE_LABELS: Record<string, string> = {
  '*': '全部用途', CLINICAL_USE: '临床使用', PATIENT_COPY: '患者副本', ARCHIVE_COPY: '归档副本',
}
const SCOPE_LABELS: Record<PrintImplementationScope, string> = {
  PLATFORM: '平台', TENANT: '租户', ORGANIZATION: '机构', DEPARTMENT: '科室',
}

export function PrintBusinessMapping({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const overview = useQuery({ queryKey: ['print-business-overview'], queryFn: api.printing.printBusinessOverview })
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [purpose, setPurpose] = useState<PrintPurpose>('CLINICAL_USE')
  const [scope, setScope] = useState<EditableScope>('ORGANIZATION')
  const [bindingPurpose, setBindingPurpose] = useState<PrintPurpose | '*'>('*')
  const [implementationId, setImplementationId] = useState('')
  const [fallbackPolicy, setFallbackPolicy] = useState<'FAIL_CLOSED' | 'PLATFORM_DEFAULT'>('FAIL_CLOSED')
  const [feedback, setFeedback] = useState('')

  const selectedTask = overview.data?.tasks.find((item) => item.id === selectedTaskId)
  const resolution = useQuery({
    queryKey: ['print-task-resolution', selectedTask?.taskCode, purpose],
    queryFn: () => api.printing.previewPrintTaskResolution(selectedTask!.taskCode, purpose),
    enabled: Boolean(selectedTask && selectedTask.allowedPurposes.includes(purpose)),
  })
  const groups = useMemo(() => groupTasks(overview.data?.tasks ?? []), [overview.data?.tasks])
  const compatible = overview.data?.implementations.filter((item) => item.payloadSchema === selectedTask?.payloadSchema) ?? []
  const currentBinding = overview.data?.bindings.find((item) => item.taskDefinitionId === selectedTaskId
    && item.scopeType === scope && item.purpose === bindingPurpose)

  useEffect(() => {
    if (!selectedTaskId && overview.data?.tasks.length) setSelectedTaskId(overview.data.tasks[0].id)
  }, [overview.data, selectedTaskId])
  useEffect(() => {
    if (!selectedTask) return
    if (!selectedTask.allowedPurposes.includes(purpose)) setPurpose(selectedTask.allowedPurposes[0])
  }, [selectedTask?.id])
  useEffect(() => {
    setImplementationId(currentBinding?.implementationId ?? resolution.data?.implementation.id ?? '')
    setFallbackPolicy(currentBinding?.fallbackPolicy ?? 'FAIL_CLOSED')
  }, [currentBinding?.id, currentBinding?.revision, resolution.data?.implementation.id, scope, bindingPurpose])

  const save = useMutation({
    mutationFn: () => api.printing.bindPrintImplementation({
      expectedRevision: currentBinding?.revision ?? 0, taskDefinitionId: selectedTaskId,
      scopeType: scope, purpose: bindingPurpose, implementationId, fallbackPolicy,
    }),
    onSuccess: async () => {
      setFeedback('打印业务映射已生效')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['print-business-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['print-task-resolution'] }),
      ])
    },
  })

  if (overview.isPending) return <LoadingState label="正在加载打印业务标准…" />
  if (overview.error || !overview.data) return <Alert tone="error">{errorMessage(overview.error)}</Alert>

  return <div className="print-business-workbench">
    {(save.error || feedback) && <div className="print-business-feedback">
      {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      {feedback && <Alert tone="success" onDismiss={() => setFeedback('')}>{feedback}</Alert>}
    </div>}
    <aside className="print-business-tasks" aria-label="标准打印任务">
      <div className="print-pane-heading"><div><strong>打印业务标准</strong><span>{overview.data.tasks.length} 个标准任务</span></div></div>
      <div className="print-business-scroll">
        {Object.entries(groups).map(([category, tasks]) => <section key={category}>
          <h2>{CATEGORY_LABELS[category] ?? category}</h2>
          {tasks.map((task) => <button type="button" key={task.id}
            className={`print-business-task ${task.id === selectedTaskId ? 'is-active' : ''}`}
            onClick={() => setSelectedTaskId(task.id)}>
            <span><strong>{task.taskName}</strong><small>{task.taskCode}</small></span>
            {task.batchSupported && <Tooltip content="支持批量打印"><i>批</i></Tooltip>}
          </button>)}
        </section>)}
      </div>
    </aside>

    <section className="print-business-resolution" aria-label="生效配置">
      <div className="print-pane-heading"><div><strong>{selectedTask?.taskName ?? '生效配置'}</strong>
        <span>{overview.data.organizationName} · 当前工作上下文</span></div>
        {resolution.data && <StatusBadge tone="success">已解析</StatusBadge>}</div>
      {selectedTask ? <div className="print-business-resolution__body">
        <div className="print-business-contract">
          <div><span>数据提供器</span><strong>{selectedTask.dataProviderCode}</strong></div>
          <div><span>数据契约</span><strong>{selectedTask.payloadSchema}</strong></div>
          <div><span>来源类型</span><strong>{selectedTask.sourceType}</strong></div>
        </div>
        <FormField label="验证打印用途"><Select value={purpose} clearable={false} searchable={false}
          options={selectedTask.allowedPurposes.map((value) => ({ value, label: PURPOSE_LABELS[value] }))}
          onChange={(value) => setPurpose(value as PrintPurpose)} /></FormField>
        {resolution.isPending && <LoadingState label="正在解析生效配置…" />}
        {resolution.error && <Alert tone="error">{errorMessage(resolution.error)}</Alert>}
        {resolution.data && <>
          <div className="print-effective-implementation">
            <span>当前生效实现</span><strong>{resolution.data.implementation.implementationName}</strong>
            <small>{SCOPE_LABELS[resolution.data.binding.scopeType]} · {resolution.data.templateName} V{resolution.data.templateVersion}</small>
          </div>
          <ol className="print-resolution-trace">
            {resolution.data.trace.map((step) => <li key={`${step.scopeType}-${step.bindingId ?? 'empty'}`}
              className={step.selected ? 'is-selected' : ''}>
              <i>{SCOPE_LABELS[step.scopeType].slice(0, 1)}</i>
              <span><strong>{SCOPE_LABELS[step.scopeType]}</strong><small>{step.result}</small></span>
              {step.selected && <StatusBadge tone="success">命中</StatusBadge>}
            </li>)}
          </ol>
        </>}
      </div> : <EmptyState icon="tasks" title="选择打印任务" copy="查看其数据契约和当前生效实现" />}
    </section>

    <aside className="print-business-editor" aria-label="覆盖配置">
      <div className="print-pane-heading"><div><strong>覆盖配置</strong><span>调用标准不变，仅替换具体实现</span></div></div>
      {selectedTask ? <div className="print-business-editor__body">
        <Tabs value={scope} onChange={setScope} label="配置作用域" variant="line" items={[
          { value: 'TENANT', label: '租户' }, { value: 'ORGANIZATION', label: '机构' }, { value: 'DEPARTMENT', label: '科室' },
        ]} />
        <Alert tone="info">{scope === 'TENANT' ? '该租户下未单独配置的机构将继承此实现。'
          : scope === 'ORGANIZATION' ? `仅覆盖 ${overview.data.organizationName}。` : '仅覆盖当前工作科室。'}</Alert>
        <FormField label="适用用途"><Select value={bindingPurpose} clearable={false} searchable={false}
          options={[{ value: '*', label: '全部用途' }, ...selectedTask.allowedPurposes.map((value) => ({
            value, label: PURPOSE_LABELS[value],
          }))]} onChange={(value) => setBindingPurpose(value as PrintPurpose | '*')} /></FormField>
        <FormField label="打印实现"><Select value={implementationId} clearable={false}
          options={compatible.map((item) => ({ value: item.id, label: item.implementationName,
            secondaryText: `${item.scope === 'PLATFORM' ? '平台' : '本院'} · ${item.templateName ?? item.adapterCode}` }))}
          onChange={setImplementationId} /></FormField>
        <FormField label="实现不可用时"><Select value={fallbackPolicy} clearable={false} searchable={false}
          options={[{ value: 'FAIL_CLOSED', label: '阻断打印并提示配置错误' },
            { value: 'PLATFORM_DEFAULT', label: '回退平台默认实现' }]}
          onChange={(value) => setFallbackPolicy(value as typeof fallbackPolicy)} /></FormField>
        {currentBinding && <div className="print-current-binding"><Icon name="info" />
          正在编辑现有{SCOPE_LABELS[currentBinding.scopeType]}配置，修订号 {currentBinding.revision}</div>}
        {!compatible.length && <Alert tone="warning">没有与 {selectedTask.payloadSchema} 兼容的已发布实现。</Alert>}
        <Button busy={save.isPending} disabled={!implementationId || !compatible.length}
          onClick={() => save.mutate()}><Icon name="check" />保存并立即生效</Button>
      </div> : <EmptyState icon="settings" title="暂无配置" copy="选择标准打印任务后维护覆盖关系" />}
    </aside>
  </div>
}

function groupTasks(values: PrintBusinessTask[]) {
  return values.reduce<Record<string, PrintBusinessTask[]>>((groups, item) => {
    (groups[item.category] ??= []).push(item)
    return groups
  }, {})
}
