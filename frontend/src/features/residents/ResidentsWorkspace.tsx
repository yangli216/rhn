import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ClinicalContext } from '../../app/AppShell'
import { age, formatTime, genderLabel } from '../../shared/format'
import type { Encounter, Resident, TimelineEvent } from '../../shared/model'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import type { DiagnosticObservation, DiagnosticReport, ExternalMessageReceipt } from '../../shared/api/diagnosticsApi'
import type { ServiceRequest } from '../../shared/api/encountersApi'
import type { DiseaseConcept, MedicationKnowledge, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { ReceptionQueueItem, ServiceSchedule } from '../../shared/api/schedulingApi'
import { encounterStatusPresentation, timelineEventLabel } from '../../shared/presentation'
import { errorMessage, type CreateResidentInput, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, BackButton, Button, ClinicalResourceSearch, Dialog, EmptyState, FormField, Icon, LoadingState,
  ObjectContextBar, PageHeader, Panel, PanelHead, Select, StatusBadge, type ClinicalResourceOption,
} from '../../shared/ui'

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function isOrderableService(item: ServiceCatalogItem) {
  return item.orderable && Boolean(item.organizationAdoption?.orderable)
}

export function OutpatientReceptionWorkspace({ api, clinicalContext }: {
  api: RhnApi; clinicalContext: ClinicalContext
}) {
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [selected, setSelected] = useState<Resident | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const queryClient = useQueryClient()
  const linkedResidentId = searchParams.get('residentId')
  const linkedResident = useQuery({
    queryKey: ['resident-deep-link', linkedResidentId],
    queryFn: () => api.residents.get(linkedResidentId!),
    enabled: Boolean(linkedResidentId),
  })

  useEffect(() => {
    if (linkedResident.data) setSelected(linkedResident.data)
  }, [linkedResident.data])

  const residents = useQuery({
    queryKey: ['residents', submittedQuery],
    queryFn: () => api.residents.search(submittedQuery),
    enabled: submittedQuery.length >= 2,
  })
  const encounters = useQuery({
    queryKey: ['resident-encounters', selected?.id],
    queryFn: () => api.encounters.byResident(selected!.id),
    enabled: Boolean(selected),
  })
  const timeline = useQuery({
    queryKey: ['resident-timeline', selected?.id],
    queryFn: () => api.timeline.byResident(selected!.id),
    enabled: Boolean(selected),
  })
  const queue = useQuery({
    queryKey: ['outpatient-reception-queue', businessDate(), clinicalContext.department.id],
    queryFn: () => api.scheduling.receptionQueue(businessDate()),
  })
  const schedules = useQuery({
    queryKey: ['reception-schedules', businessDate(), clinicalContext.department.id],
    queryFn: () => api.scheduling.schedules(businessDate(), businessDate()),
    enabled: showRegister,
  })
  const registerEncounter = useMutation({
    mutationFn: ({ residentId, scheduleId }: { residentId: string; scheduleId?: string }) => api.encounters.register({
      residentId, scheduleId, organizationId: clinicalContext.organization.id,
      departmentId: clinicalContext.department.id,
      idempotencyCode: `REG-${residentId}-${Date.now()}`,
      registrationSource: scheduleId ? 'WINDOW' : 'DIRECT', visitType: 'GENERAL',
    }),
    onSuccess: async () => {
      setShowRegister(false)
      await Promise.all([refreshResident(), queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] })])
    },
  })
  const openQueuedResident = useMutation({
    mutationFn: (item: ReceptionQueueItem) => api.residents.get(item.residentId),
    onSuccess: setSelected,
  })

  function search(event: FormEvent) {
    event.preventDefault()
    const normalized = query.trim()
    if (normalized.length >= 2) setSubmittedQuery(normalized)
  }

  async function refreshResident() {
    if (!selected) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['resident-encounters', selected.id] }),
      queryClient.invalidateQueries({ queryKey: ['resident-timeline', selected.id] }),
    ])
  }

  if (selected) {
    const message = [encounters.error, timeline.error, registerEncounter.error].find(Boolean)
    return <><ResidentChart resident={selected} encounters={encounters.data ?? []}
      timeline={timeline.data ?? []} api={api}
      busy={encounters.isPending || timeline.isPending || registerEncounter.isPending}
      message={message ? errorMessage(message) : ''}
      onBack={() => setSelected(null)} onRefresh={refreshResident}
      onRegister={() => { setShowRegister(true); return Promise.resolve() }} />
      {showRegister && <RegisterEncounterDialog schedules={schedules.data ?? []} loading={schedules.isPending}
        error={schedules.error || registerEncounter.error} onClose={() => setShowRegister(false)}
        onConfirm={(scheduleId) => registerEncounter.mutate({ residentId: selected.id, scheduleId })} />}</>
  }

  const searchTooShort = query.trim().length > 0 && query.trim().length < 2
  return (
    <>
      <PageHeader eyebrow="门诊医疗 · 接诊工作台" title="门诊接诊"
        description="从今日候诊队列开始接诊，也可检索居民完成现场挂号。"
        actions={<Button variant="secondary" onClick={() => void queue.refetch()}><Icon name="refresh" />刷新队列</Button>} />
      <ReceptionQueuePanel items={queue.data ?? []} loading={queue.isPending}
        error={queue.error || openQueuedResident.error} onOpen={(item) => openQueuedResident.mutate(item)} />
      <Panel className="search-panel">
        <form className="resident-search" onSubmit={search}>
          <span className="resident-search__icon" aria-hidden="true"><Icon name="search" /></span>
          <label className="visually-hidden" htmlFor="resident-search-input">查找现场挂号居民</label>
          <input id="resident-search-input" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="输入姓名或居民标识，办理现场挂号" />
          <Button type="submit" busy={residents.isFetching}>查询</Button>
        </form>
        <div className="search-hint"><span>未在候诊队列中时，可检索居民办理现场挂号</span><span>建档和资料维护请前往居民中心</span></div>
      </Panel>
      {searchTooShort && <Alert className="ui-page-feedback">至少输入 2 个字符</Alert>}
      {linkedResidentId && linkedResident.isPending && <LoadingState label="正在打开待办居民…" />}
      {linkedResident.error && <Alert className="ui-page-feedback">{errorMessage(linkedResident.error)}</Alert>}
      {residents.error && <Alert className="ui-page-feedback">{errorMessage(residents.error)}</Alert>}
      <Panel className="results-panel">
        <PanelHead title="现场挂号检索结果" meta={`${residents.data?.length ?? 0} 位居民`} />
        {residents.isFetching ? <LoadingState label="正在检索居民…" /> :
          !residents.data?.length ? <EmptyState icon="residents" title="从候诊队列选择患者"
            copy="候诊队列中没有目标患者时，再使用上方检索办理现场挂号。" /> : (
            <div className="resident-list">{residents.data.map((resident) => (
              <button key={resident.id} className="resident-row" onClick={() => setSelected(resident)}>
                <div className={`resident-avatar ${resident.gender.toLowerCase()}`}>{resident.fullName.slice(-1)}</div>
                <div className="resident-main"><strong>{resident.fullName}</strong>
                  <span>{genderLabel(resident.gender)} · {age(resident.birthDate)} 岁 · {resident.maskedNationalId || '无身份证标识'}</span></div>
                <div><small>健康档案号</small><strong>{resident.healthRecordNo}</strong></div><Icon name="chevron-right" />
              </button>
            ))}</div>
          )}
      </Panel>
    </>
  )
}

function ReceptionQueuePanel({ items, loading, error, onOpen }: {
  items: ReceptionQueueItem[]; loading: boolean; error: unknown; onOpen: (item: ReceptionQueueItem) => void
}) {
  const activeItems = items.filter((item) => item.status === 'WAITING' || item.status === 'IN_SERVICE')
  return <Panel className="reception-queue-panel">
    <PanelHead title="今日候诊队列" meta={`${activeItems.length} 人待处理`} />
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    {loading ? <LoadingState label="正在加载今日候诊队列…" /> : activeItems.length === 0
      ? <EmptyState icon="clinical" title="当前没有候诊患者" copy="可在下方检索居民并办理现场挂号。" />
      : <div className="reception-queue-list">{activeItems.map((item) => <button key={item.registrationId}
        onClick={() => onOpen(item)}>
        <span className="reception-ticket">{item.ticketNo}</span>
        <span><strong>{item.residentName}</strong><small>{genderLabel(item.gender)} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small></span>
        <span><strong>{item.practitionerName || '现场接诊'}</strong><small>{item.serviceName || '普通门诊'}{item.locationName ? ` · ${item.locationName}` : ''}</small></span>
        <StatusBadge tone={item.status === 'IN_SERVICE' ? 'success' : 'warning'}>
          {item.status === 'IN_SERVICE' ? '接诊中' : '候诊中'}</StatusBadge>
        <Icon name="chevron-right" />
      </button>)}</div>}
  </Panel>
}

function RegisterEncounterDialog({ schedules, loading, error, onClose, onConfirm }: {
  schedules: ServiceSchedule[]; loading: boolean; error: unknown; onClose: () => void
  onConfirm: (scheduleId?: string) => void
}) {
  const available = schedules.filter((item) => item.sdStatus === 'PUBLISHED' && item.availableCount > 0)
  const [selection, setSelection] = useState('')
  const selected = selection || available[0]?.id || 'DIRECT'
  const options = [
    ...available.map((item) => ({ value: item.id,
      label: `${item.sdDayPartText} · ${item.practitionerName} · ${item.serviceName}（余 ${item.availableCount}）` })),
    { value: 'DIRECT', label: '无排班临时接诊（不占用号源）' },
  ]
  return <Dialog title="办理现场挂号" eyebrow="门诊接诊" onClose={onClose} closeOnBackdrop={false}
    description="默认选择今天的可用排班并占用一个共享号源，同时生成预约快照和候诊号。"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button onClick={() => onConfirm(selected === 'DIRECT' ? undefined : selected)} disabled={loading}>确认挂号</Button></>}>
    {loading ? <LoadingState label="正在加载今日排班…" /> : <FormField label="今日排班">
      <Select options={options} value={selected} onChange={setSelection} showValue />
    </FormField>}
    {available.length === 0 && !loading && <Alert tone="info">今天暂无可用排班，可使用临时接诊；建议后续在“排班与号源”中建立日常排班。</Alert>}
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
  </Dialog>
}

const clinicalSchema = z.object({
  chiefComplaint: z.string().trim().min(1, '请输入主诉').max(1000, '主诉不能超过1000字'),
  systolic: z.number().int().min(40, '收缩压不能低于40').max(300, '收缩压不能高于300'),
  diastolic: z.number().int().min(20, '舒张压不能低于20').max(200, '舒张压不能高于200'),
  code: z.string().trim().min(1, '请输入诊断编码'),
  display: z.string().trim().min(1, '请输入诊断名称'),
})
type ClinicalForm = z.infer<typeof clinicalSchema>

function ResidentChart({ resident, encounters, timeline, api, busy, message, onBack, onRefresh, onRegister }: {
  resident: Resident; encounters: Encounter[]; timeline: TimelineEvent[]; api: RhnApi; busy: boolean; message: string
  onBack: () => void; onRefresh: () => Promise<void>; onRegister: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const active = encounters.find((item) => item.status === 'IN_PROGRESS' || item.status === 'REGISTERED')
  const clinicalDocuments = useQuery({
    queryKey: ['encounter-clinical-documents', active?.id],
    queryFn: () => api.clinicalDocuments.byEncounter(active!.id),
    enabled: active?.status === 'IN_PROGRESS',
  })
  const outpatientNote = clinicalDocuments.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const noteSigned = outpatientNote?.status === 'SIGNED'
  const [diagnosis, setDiagnosis] = useState<ClinicalResourceOption<DiseaseConcept>>()
  const { register, handleSubmit, formState, setValue } = useForm<ClinicalForm>({
    resolver: zodResolver(clinicalSchema),
    defaultValues: { chiefComplaint: '', systolic: undefined, diastolic: undefined, code: '', display: '' },
  })
  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['encounter-clinical-documents', active?.id] }),
        onRefresh(),
      ])
    },
  })
  const actionMessage = action.error ? errorMessage(action.error) : ''

  return (
    <>
      <BackButton onClick={onBack}>返回接诊工作台</BackButton>
      <ObjectContextBar avatar={resident.fullName.slice(-1)} eyebrow="统一居民主索引" title={resident.fullName}
        description={`${genderLabel(resident.gender)} · ${age(resident.birthDate)} 岁 · ${resident.maskedNationalId || '无身份证标识'}`}
        facts={[{ label: '健康档案号', value: resident.healthRecordNo }, { label: '联系电话', value: resident.phone || '未登记' }]}
        actions={<Button onClick={() => onRegister()} disabled={busy || Boolean(active)}><Icon name="add" />门诊挂号</Button>} />
      {(message || actionMessage) && <Alert className="ui-page-feedback">{message || actionMessage}</Alert>}

      <section className="chart-grid">
        <div className="chart-main">
          <Panel className="encounter-panel">
            <PanelHead title="本次门诊" meta={active ? encounterStatusPresentation(active.status).label : '暂无进行中就诊'} />
            {busy && encounters.length === 0 ? <LoadingState /> :
              !active ? <EmptyState icon="clinical" title="尚未发起门诊就诊" copy="点击“门诊挂号”创建本次就诊。" /> :
              active.status === 'REGISTERED' ? (
                <div className="encounter-ready"><div className="step-badge">01</div><div><strong>已完成挂号</strong>
                  <p>就诊号 {active.encounterNo}，等待医生开始接诊。</p></div>
                  <Button busy={action.isPending} onClick={() => action.mutate(() => api.encounters.start(active.id))}>开始接诊</Button>
                </div>
              ) : (
                <form className="clinical-form" noValidate onSubmit={handleSubmit((form) =>
                  action.mutate(() => api.encounters.recordClinicalData(active.id, {
                    chiefComplaint: form.chiefComplaint, systolic: form.systolic, diastolic: form.diastolic,
                    diagnoses: [{ code: form.code, display: form.display, type: 'PRIMARY' }],
                  })))}>
                  <div className="form-section-head"><span>02</span><div><strong>记录门诊病历</strong>
                    <small>{noteSigned ? '当前版本已签署；如需修改须发起正式修订' : '保存后形成待签署临床文档、生命体征和诊断事件'}</small></div></div>
                  <FormField className="ui-field--full" label="主诉" error={formState.errors.chiefComplaint?.message}>
                    <textarea {...register('chiefComplaint')} disabled={noteSigned} />
                  </FormField>
                  <div className="ui-form-row">
                    <FormField label="收缩压（mmHg）" error={formState.errors.systolic?.message}>
                      <input type="number" {...register('systolic', { valueAsNumber: true })} disabled={noteSigned} />
                    </FormField>
                    <FormField label="舒张压（mmHg）" error={formState.errors.diastolic?.message}>
                      <input type="number" {...register('diastolic', { valueAsNumber: true })} disabled={noteSigned} />
                    </FormField>
                  </div>
                  <input type="hidden" {...register('code')} />
                  <input type="hidden" {...register('display')} />
                  <FormField className="ui-field--full" label="主要诊断" required
                    hint="输入诊断名称、标准编码或拼音码，系统仅在输入后动态检索。"
                    error={formState.errors.display?.message || formState.errors.code?.message}>
                    <ClinicalResourceSearch<DiseaseConcept> api={api} resource="diagnosis" value={diagnosis}
                      disabled={noteSigned} onChange={(option) => {
                        setDiagnosis(option)
                        setValue('code', option?.raw?.code ?? '', { shouldDirty: true, shouldValidate: true })
                        setValue('display', option?.raw?.display ?? '', { shouldDirty: true, shouldValidate: true })
                      }} />
                  </FormField>
                  <div className="ui-form-actions">
                    <Button type="button" variant="secondary" disabled={!noteSigned || action.isPending}
                      onClick={() => action.mutate(() => api.encounters.complete(active.id))}>完成就诊</Button>
                    <Button type="submit" busy={action.isPending} disabled={noteSigned}>保存病历</Button>
                  </div>
                </form>
              )}
          </Panel>
          {active?.status === 'IN_PROGRESS' && <ClinicalDocumentPanel encounter={active} document={outpatientNote}
            loading={clinicalDocuments.isPending} error={clinicalDocuments.error} api={api} onRefresh={onRefresh} />}
          {active?.status === 'IN_PROGRESS' && <ServiceRequestsPanel encounter={active} api={api}
            onRefresh={onRefresh} />}
          {active?.status === 'IN_PROGRESS' && <MedicationRequestsPanel encounter={active} api={api}
            onRefresh={onRefresh} />}
          <Panel className="history-panel">
            <PanelHead title="就诊记录" meta={`最近 ${encounters.length} 次`} />
            {encounters.map((encounter) => {
              const presentation = encounterStatusPresentation(encounter.status)
              return <div className="history-row" key={encounter.id}>
                <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
                <div><strong>{encounter.chiefComplaint || '门诊就诊'}</strong>
                  <small>{formatTime(encounter.registeredAt)} · {encounter.encounterNo}</small></div>
                <div>{encounter.diagnoses.map((item) => item.display).join('、') || '尚无诊断'}</div>
              </div>
            })}
          </Panel>
        </div>
        <Panel className="timeline-panel">
          <PanelHead title="健康时间轴" meta="跨业务归集" />
          {timeline.length === 0 ? <EmptyState icon="roadmap" title="暂无健康事件" copy="挂号后事件将自动出现在这里。" /> :
            <div className="timeline-list">{timeline.map((event) => (
              <div className="timeline-item" key={event.id}><i /><div><span>{timelineEventLabel(event.eventType)}</span>
                <strong>{event.summary}</strong><small>{formatTime(event.occurredAt)} · {event.recordedBy}</small></div></div>
            ))}</div>}
        </Panel>
      </section>
    </>
  )
}

function ClinicalDocumentPanel({ encounter, document, loading, error, api, onRefresh }: {
  encounter: Encounter; document?: ClinicalDocument; loading: boolean; error: Error | null
  api: RhnApi; onRefresh: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [printConfirming, setPrintConfirming] = useState(false)
  const sign = useMutation({
    mutationFn: () => api.clinicalDocuments.sign(document!.id, document!.currentVersion),
    onSuccess: async () => {
      setConfirming(false); setConfirmed(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['encounter-clinical-documents', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['work-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-summary'] }),
        onRefresh(),
      ])
    },
  })
  const printDocument = useMutation({
    mutationFn: async () => {
      const receipt = await api.printing.clinicalDocument(document!.id)
      await api.printing.download(receipt)
      return receipt
    },
    onSuccess: () => setPrintConfirming(false),
  })
  const content = document?.content
  const diagnoses = content?.diagnoses ?? []
  const statusLabel = document?.status === 'SIGNED' ? '已签署' : document?.status === 'AMENDMENT_IN_PROGRESS'
    ? '修订中' : '待签署'

  return <Panel className="clinical-document-panel">
    <PanelHead title="门诊病历签署" meta="当前版本签署后方可完成本次就诊"
      actions={document ? <div className="clinical-document-actions">
        {document.status === 'SIGNED' && <Button size="sm" variant="secondary" onClick={() => setPrintConfirming(true)}>
          <Icon name="print" />打印病历</Button>}
        {document.status !== 'SIGNED' && <Button size="sm" onClick={() => setConfirming(true)}>
          <Icon name="check" />核对并签署</Button>}
      </div> : undefined} />
    {(error || sign.error || printDocument.error) && <Alert className="clinical-document-feedback">
      {errorMessage(error || sign.error || printDocument.error)}</Alert>}
    {loading ? <LoadingState label="正在加载门诊病历…" /> : !document ?
      <EmptyState icon="clinical" title="尚未形成门诊病历" copy="先保存接诊记录，再核对并签署当前版本。" /> : <>
        <div className="clinical-document-summary">
          <div className="clinical-document-summary__title"><div><strong>{document.title}</strong>
            <small>{document.contentSchema} · 版本 {document.currentVersion} · 更新于 {formatTime(document.updatedAt)}</small></div>
            <StatusBadge tone={document.status === 'SIGNED' ? 'success' : 'warning'}>{statusLabel}</StatusBadge></div>
          <dl><div><dt>主诉</dt><dd>{content?.chiefComplaint || '—'}</dd></div>
            <div><dt>血压</dt><dd>{content?.vitalSigns?.systolic ?? '—'}/{content?.vitalSigns?.diastolic ?? '—'} mmHg</dd></div>
            <div><dt>诊断</dt><dd>{diagnoses.map((item) => `${item.display}（${item.code}）`).join('、') || '—'}</dd></div></dl>
        </div>
        <div className="clinical-document-history"><strong>版本与证据</strong>
          <div className="service-order-table-wrap"><table className="service-order-table">
            <thead><tr><th>版本</th><th>变更</th><th>保存人/时间</th><th>签署</th><th>完整性证据</th></tr></thead>
            <tbody>{document.history.map((version) => <tr key={version.version}>
              <td>V{version.version}</td><td>{version.changeReason}<small>{version.changeType}</small></td>
              <td>{version.createdBy}<small>{formatTime(version.createdAt)}</small></td>
              <td>{version.signedAt ? `${version.signedBy} · ${formatTime(version.signedAt)}` : '待签署'}</td>
              <td><code title={version.contentDigest ?? ''}>{version.contentDigest
                ? `${version.contentDigest.slice(0, 12)}…` : '—'}</code></td>
            </tr>)}</tbody>
          </table></div>
        </div>
      </>}
    {confirming && document && <Dialog eyebrow="临床文档正式签署" title={`签署${document.title}`}
      description="签署将绑定当前版本内容与作者含义，并生成不可否认证据；签署后不能直接覆盖修改。"
      closeOnBackdrop={false} onClose={() => { setConfirming(false); setConfirmed(false) }}
      footer={<><Button variant="secondary" onClick={() => { setConfirming(false); setConfirmed(false) }}>取消</Button>
        <Button busy={sign.isPending} disabled={!confirmed} onClick={() => sign.mutate()}>确认签署 V{document.currentVersion}</Button></>}>
      <div className="clinical-sign-confirmation"><dl>
        <div><dt>就诊号</dt><dd>{encounter.encounterNo}</dd></div>
        <div><dt>文档版本</dt><dd>{document.contentSchema} · V{document.currentVersion}</dd></div>
        <div><dt>主诉</dt><dd>{content?.chiefComplaint || '—'}</dd></div>
        <div><dt>诊断</dt><dd>{diagnoses.map((item) => item.display).join('、') || '—'}</dd></div>
      </dl><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>我已核对当前患者、就诊、主诉、生命体征和诊断，确认以作者身份签署此版本。</span></label></div>
    </Dialog>}
    {printConfirming && document && <Dialog eyebrow="受控打印" title="生成门诊病历打印文件"
      description="系统将按当前已签署版本生成不可变 PDF 患者副本，并登记模板版本、内容摘要和操作人。"
      closeOnBackdrop={false} onClose={() => setPrintConfirming(false)}
      footer={<><Button variant="secondary" onClick={() => setPrintConfirming(false)}>取消</Button>
        <Button busy={printDocument.isPending} onClick={() => printDocument.mutate()}>
          <Icon name="print" />生成并下载</Button></>}>
      <div className="print-confirmation"><dl>
        <div><dt>就诊号</dt><dd>{encounter.encounterNo}</dd></div>
        <div><dt>文档</dt><dd>{document.title} · V{document.currentVersion}</dd></div>
        <div><dt>打印用途</dt><dd>患者副本</dd></div>
        <div><dt>输出格式</dt><dd>A4 · PDF · 1 份</dd></div>
      </dl><Alert tone="info">下载成功仅表示正式打印文件已生成；实体打印机是否完成出纸由操作系统打印队列负责。</Alert></div>
    </Dialog>}
  </Panel>
}

function ServiceRequestsPanel({ encounter, api, onRefresh }: {
  encounter: Encounter; api: RhnApi; onRefresh: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const [catalogItemId, setCatalogItemId] = useState('')
  const [serviceOption, setServiceOption] = useState<ClinicalResourceOption<ServiceCatalogItem>>()
  const [quantity, setQuantity] = useState(1)
  const requests = useQuery({
    queryKey: ['encounter-service-requests', encounter.id],
    queryFn: () => api.encounters.serviceRequests(encounter.id),
  })
  const diagnosticRequests = (requests.data ?? []).filter((item) =>
    item.serviceType === 'LABORATORY' || item.serviceType === 'EXAMINATION')
  const reports = useQuery({
    queryKey: ['encounter-diagnostic-reports', encounter.id],
    queryFn: () => api.diagnostics.reportsByEncounter(encounter.id),
    enabled: diagnosticRequests.length > 0,
  })
  const lisMessages = useQuery({
    queryKey: ['diagnostic-outbound', encounter.id, 'LIS'],
    queryFn: () => api.diagnostics.outbound('LIS'),
    enabled: diagnosticRequests.some((item) => item.serviceType === 'LABORATORY'),
  })
  const pacsMessages = useQuery({
    queryKey: ['diagnostic-outbound', encounter.id, 'PACS'],
    queryFn: () => api.diagnostics.outbound('PACS'),
    enabled: diagnosticRequests.some((item) => item.serviceType === 'EXAMINATION'),
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['encounter-service-requests', encounter.id] }),
      queryClient.invalidateQueries({ queryKey: ['encounter-diagnostic-reports', encounter.id] }),
      queryClient.invalidateQueries({ queryKey: ['diagnostic-outbound', encounter.id] }),
      onRefresh(),
    ])
  }
  const createRequest = useMutation({
    mutationFn: () => api.encounters.createServiceRequest(encounter.id, {
      catalogItemId, quantity, priceType: 'SALE', pricingRequired: true,
      reason: '门诊诊疗开立', clinicalDescription: '由本次门诊接诊开立',
    }),
    onSuccess: async () => { setCatalogItemId(''); setServiceOption(undefined); setQuantity(1); await refresh() },
  })
  const cancelRequest = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      api.encounters.cancelServiceRequest(encounter.id, id, revision, '门诊医生撤销'),
    onSuccess: refresh,
  })
  const dispatchRequest = useMutation({
    mutationFn: (request: ServiceRequest) => api.diagnostics.dispatch(request.id,
      request.serviceType === 'LABORATORY' ? 'LIS' : 'PACS'),
    onSuccess: refresh,
  })
  const selected = serviceOption?.raw
  const outboundMessages = [...(lisMessages.data ?? []), ...(pacsMessages.data ?? [])]
  const latestReports = (reports.data ?? []).filter((report, index, values) => values.findIndex((candidate) =>
    candidate.endpointCode === report.endpointCode && candidate.externalReportId === report.externalReportId) === index)
  const error = [requests.error, reports.error, lisMessages.error, pacsMessages.error,
    createRequest.error, cancelRequest.error, dispatchRequest.error].find(Boolean)

  return <Panel className="service-order-panel">
    <PanelHead title="诊疗项目开立" meta="目录、价格与属性按开立时点固化" />
    <div className="service-order-form">
      <FormField label="诊疗项目" className="service-order-form__item">
        <ClinicalResourceSearch<ServiceCatalogItem> api={api} resource="service"
          organizationId={encounter.organizationId} value={serviceOption}
          filterResult={isOrderableService} onChange={(option) => {
            setServiceOption(option)
            setCatalogItemId(option?.value ?? '')
          }} />
      </FormField>
      <FormField label={`数量${selected?.unitCode ? `（${selected.unitCode}）` : ''}`}>
        <input type="number" min="0.001" step="0.001" value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))} />
      </FormField>
      <Button className="service-order-form__submit" busy={createRequest.isPending}
        disabled={!catalogItemId || !Number.isFinite(quantity) || quantity <= 0}
        onClick={() => createRequest.mutate()}><Icon name="add" />开立项目</Button>
    </div>
    {error && <Alert className="service-order-feedback">{errorMessage(error)}</Alert>}
    {requests.isPending ? <LoadingState label="正在加载诊疗请求…" /> :
      !requests.data?.length ? <EmptyState icon="clinical" title="尚未开立诊疗项目"
        copy="选择当前机构已采用且可开立、可收费的项目。" /> :
        <div className="service-order-table-wrap"><table className="service-order-table diagnostic-order-table">
          <thead><tr><th>项目</th><th>类型 / 要求</th><th>数量</th><th>金额</th><th>交换状态</th><th>最新报告</th><th>申请状态</th><th>操作</th></tr></thead>
          <tbody>{requests.data.map((request) => <tr key={request.id}>
            <td><strong>{request.localName || request.itemName}</strong>
              <small>{request.localCode || request.itemCode} · <code title={request.itemAttributeHash}>
                {request.itemAttributeHash.slice(0, 8)}…</code></small></td>
            <td>{serviceTypeLabel(request.serviceType)}<small>{request.specimenType || request.examinationType || '常规'}</small></td>
            <td>{request.quantity} {request.unitCode}</td>
            <td>{request.totalAmount == null ? '不计价' : `¥${request.totalAmount.toFixed(2)}`}
              <small>{request.unitPrice == null ? '无单价' : `单价 ¥${request.unitPrice.toFixed(2)}`}</small></td>
            <td><DiagnosticExchangeState request={request} messages={outboundMessages} /></td>
            <td><DiagnosticReportState request={request} reports={latestReports} /></td>
            <td><StatusBadge tone={request.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {request.status === 'ACTIVE' ? '已开立' : '已撤销'}</StatusBadge></td>
            <td><div className="clinical-action-group">
              {request.status === 'ACTIVE' && (request.serviceType === 'LABORATORY' || request.serviceType === 'EXAMINATION') &&
                <Button size="sm" variant="secondary" busy={dispatchRequest.isPending}
                  onClick={() => dispatchRequest.mutate(request)}>
                  发送{request.serviceType === 'LABORATORY' ? 'LIS' : 'PACS'}</Button>}
              {request.status === 'ACTIVE' && <Button size="sm" variant="text" busy={cancelRequest.isPending}
                onClick={() => { if (window.confirm('确认撤销该诊疗项目？')) cancelRequest.mutate(request) }}>撤销</Button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>}
    {diagnosticRequests.length > 0 && <DiagnosticResults reports={latestReports} loading={reports.isPending} />}
  </Panel>
}

function serviceTypeLabel(value: ServiceRequest['serviceType']) {
  return value === 'LABORATORY' ? '检验' : value === 'EXAMINATION' ? '检查'
    : value === 'TREATMENT' ? '治疗' : '其他'
}

function DiagnosticExchangeState({ request, messages }: { request: ServiceRequest; messages: ExternalMessageReceipt[] }) {
  if (request.serviceType !== 'LABORATORY' && request.serviceType !== 'EXAMINATION') return <span className="muted-copy">不适用</span>
  const message = messages.find((item) => item.relatedResourceId === request.id)
  if (!message) return <><StatusBadge tone="neutral">未发送</StatusBadge><small>等待进入交换队列</small></>
  const presentation = message.status === 'ACKNOWLEDGED' ? ['已接收', 'success'] as const
    : message.status === 'REJECTED' || message.status === 'FAILED' ? ['交换异常', 'danger'] as const
      : message.status === 'SENT' ? ['已发送', 'warning'] as const : ['待发送', 'warning'] as const
  return <><StatusBadge tone={presentation[1]}>{presentation[0]}</StatusBadge>
    <small>{message.endpointCode} · {message.businessMessageId}</small></>
}

function DiagnosticReportState({ request, reports }: { request: ServiceRequest; reports: DiagnosticReport[] }) {
  if (request.serviceType !== 'LABORATORY' && request.serviceType !== 'EXAMINATION') return <span className="muted-copy">不适用</span>
  const report = reports.find((item) => item.requestId === request.id)
  if (!report) return <><StatusBadge tone="neutral">待报告</StatusBadge><small>尚未接收结果</small></>
  const tone = report.status === 'FINAL' ? 'success' : report.status === 'CORRECTED' ? 'warning' : 'neutral'
  return <><StatusBadge tone={tone}>{report.status === 'FINAL' ? '最终报告'
    : report.status === 'CORRECTED' ? '已更正' : report.status === 'PRELIMINARY' ? '初步报告' : '已取消'}</StatusBadge>
    <small>V{report.reportVersion} · {formatTime(report.issuedAt)}</small></>
}

function DiagnosticResults({ reports, loading }: { reports: DiagnosticReport[]; loading: boolean }) {
  if (loading) return <LoadingState label="正在加载检查检验结果…" />
  if (!reports.length) return <div className="diagnostic-results-empty">外部系统回传报告后，将在此处显示最新版本和结构化结果。</div>
  return <section className="diagnostic-results" aria-label="检查检验结果">
    <div className="diagnostic-results__head"><strong>检查检验结果</strong><span>{reports.length} 份最新报告</span></div>
    <div className="diagnostic-results__grid">{reports.map((report) => <article className="diagnostic-report-card" key={report.id}>
      <header><div><span>{report.reportType === 'LABORATORY' ? 'LIS 检验' : 'PACS 检查'}</span>
        <strong>{report.reportName}</strong><small>{report.reportCode} · V{report.reportVersion} · {formatTime(report.issuedAt)}</small></div>
        <StatusBadge tone={report.status === 'FINAL' ? 'success' : report.status === 'CORRECTED' ? 'warning' : 'neutral'}>
          {report.status === 'FINAL' ? '最终' : report.status === 'CORRECTED' ? '更正' : report.status === 'PRELIMINARY' ? '初步' : '取消'}
        </StatusBadge></header>
      {report.conclusion && <p className="diagnostic-report-card__conclusion">{report.conclusion}</p>}
      {report.observations.length > 0 && <div className="diagnostic-observation-table"><table>
        <thead><tr><th>项目</th><th>结果</th><th>参考范围</th><th>提示</th></tr></thead>
        <tbody>{report.observations.map((item) => <tr key={item.id}><td><strong>{item.observationName}</strong>
          <small>{item.observationCode}</small></td><td>{observationValue(item)}</td>
          <td>{referenceRange(item)}</td><td>{interpretationLabel(item.interpretationCode)}</td></tr>)}</tbody>
      </table></div>}
      <footer><span>报告人：{report.authorName || report.authorCode || '外部系统'}</span>
        <code title={report.contentDigest}>{report.contentDigest.slice(0, 12)}…</code></footer>
    </article>)}</div>
  </section>
}

function observationValue(item: DiagnosticObservation) {
  const value = item.valueType === 'NUMBER' ? item.valueNumber : item.valueType === 'BOOLEAN'
    ? (item.valueBoolean ? '是' : '否') : item.valueType === 'DATETIME'
      ? (item.valueDateTime ? formatTime(item.valueDateTime) : '—') : item.valueType === 'CODE'
        ? item.valueCode : item.valueString
  return `${value ?? '—'}${item.unitCode ? ` ${item.unitCode}` : ''}`
}

function referenceRange(item: DiagnosticObservation) {
  if (item.referenceRangeLow == null && item.referenceRangeHigh == null) return '—'
  return `${item.referenceRangeLow ?? '—'} ～ ${item.referenceRangeHigh ?? '—'}${item.unitCode ? ` ${item.unitCode}` : ''}`
}

function interpretationLabel(value?: string) {
  return value === 'H' ? '偏高' : value === 'L' ? '偏低' : value === 'HH' ? '危急高值'
    : value === 'LL' ? '危急低值' : value === 'N' ? '正常' : value || '—'
}

function MedicationRequestsPanel({ encounter, api, onRefresh }: {
  encounter: Encounter; api: RhnApi; onRefresh: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const [activePrescriptionId, setActivePrescriptionId] = useState('')
  const [medicationId, setMedicationId] = useState('')
  const [medicationOption, setMedicationOption] = useState<ClinicalResourceOption<MedicationKnowledge>>()
  const [catalogItemId, setCatalogItemId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [doseValue, setDoseValue] = useState('')
  const [doseUnit, setDoseUnit] = useState('')
  const [routeCode, setRouteCode] = useState('')
  const [frequencyCode, setFrequencyCode] = useState('')
  const [selfProvided, setSelfProvided] = useState(false)
  const [printTarget, setPrintTarget] = useState<import('../../shared/api/encountersApi').Prescription | null>(null)
  const prescriptions = useQuery({
    queryKey: ['encounter-prescriptions', encounter.id],
    queryFn: () => api.encounters.prescriptions(encounter.id),
  })
  const requests = useQuery({
    queryKey: ['encounter-medication-requests', encounter.id],
    queryFn: () => api.encounters.medicationRequests(encounter.id),
  })
  const drafts = (prescriptions.data ?? []).filter((item) => item.status === 'DRAFT')
  const activePrescription = drafts.find((item) => item.id === activePrescriptionId) ?? drafts[0]
  const selectedMedication = medicationOption?.raw
  const products = (selectedMedication?.products ?? []).filter((product) => product.orderable
    && product.sdStatus === 'ACTIVE' && product.organizationAdoption?.orderable)
  const selectedProduct = products.find((item) => item.id === catalogItemId)
  const packages = (selectedProduct?.packages ?? []).filter((item) => item.sdStatus === 'ACTIVE')
  const selectedPackage = packages.find((item) => item.id === packageId)
  const ungroupedRequests = (requests.data ?? []).filter((item) => !item.prescriptionId)
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['encounter-medication-requests', encounter.id] }),
      queryClient.invalidateQueries({ queryKey: ['encounter-prescriptions', encounter.id] }),
      onRefresh(),
    ])
  }
  const createPrescription = useMutation({
    mutationFn: () => api.encounters.createPrescription(encounter.id, '门诊处方草稿'),
    onSuccess: async (value) => { setActivePrescriptionId(value.id); await refresh() },
  })
  const createRequest = useMutation({
    mutationFn: () => api.encounters.createMedicationRequest(encounter.id, {
      prescriptionId: activePrescription?.id, medicationId,
      catalogItemId: catalogItemId || undefined, packageId: packageId || undefined, quantity,
      quantityUnit: selectedPackage?.unitCode || selectedProduct?.unitCode || selectedMedication?.preparationUnit,
      doseValue: doseValue ? Number(doseValue) : undefined, doseUnit: doseUnit || undefined,
      routeCode: routeCode || undefined, frequencyCode: frequencyCode || undefined,
      substitutionAllowed: true, selfProvided, priceType: 'SALE',
      pricingRequired: Boolean(catalogItemId) && !selfProvided,
      medicationInstruction: '遵医嘱使用', reason: '门诊药品处方',
    }),
    onSuccess: async () => {
      setMedicationId(''); setMedicationOption(undefined); setCatalogItemId(''); setPackageId(''); setQuantity(1); setDoseValue(''); setDoseUnit('')
      setRouteCode(''); setFrequencyCode(''); setSelfProvided(false); await refresh()
    },
  })
  const cancelRequest = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      api.encounters.cancelMedicationRequest(encounter.id, id, revision, '门诊医生调整处方'),
    onSuccess: refresh,
  })
  const submitPrescription = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      api.encounters.submitPrescription(encounter.id, id, revision),
    onSuccess: async () => { setActivePrescriptionId(''); await refresh() },
  })
  const cancelPrescription = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      api.encounters.cancelPrescription(encounter.id, id, revision, '门诊医生撤销整张处方'),
    onSuccess: async () => { setActivePrescriptionId(''); await refresh() },
  })
  const printPrescription = useMutation({
    mutationFn: async (prescription: import('../../shared/api/encountersApi').Prescription) => {
      const receipt = await api.printing.prescription(encounter.id, prescription.id)
      await api.printing.download(receipt)
      return receipt
    },
    onSuccess: () => setPrintTarget(null),
  })
  const productOptions = products.map((product) => ({
    value: product.id,
    label: product.organizationAdoption?.localName || product.name,
    secondaryText: product.organizationAdoption?.localCode || product.code,
    searchKeywords: [selectedMedication?.name ?? '', selectedMedication?.code ?? '', product.name, product.code,
      product.tradeName ?? '', product.manufacturerName, product.organizationAdoption?.localName ?? '',
      product.organizationAdoption?.localCode ?? ''],
  }))
  const packageOptions = packages.map((item) => ({
    value: item.id, label: `${item.unitName}${item.packageSpec ? ` · ${item.packageSpec}` : ''}`,
    secondaryText: `1${item.unitCode}=${item.quantityFactor}${selectedProduct?.unitCode || ''}`,
    searchKeywords: [item.unitCode, item.unitName, item.packageSpec ?? '', item.barcode ?? ''],
  }))
  const error = [prescriptions.error, requests.error, createPrescription.error,
    createRequest.error, cancelRequest.error, submitPrescription.error, cancelPrescription.error,
    printPrescription.error].find(Boolean)

  function selectMedication(option?: ClinicalResourceOption<MedicationKnowledge>) {
    setMedicationOption(option); setMedicationId(option?.value ?? ''); setCatalogItemId(''); setPackageId('')
    const medication = option?.raw
    setDoseValue(medication?.defaultDose?.toString() ?? '')
    setDoseUnit(medication?.defaultDoseUnit ?? '')
    setRouteCode(medication?.defaultRoute ?? '')
    setFrequencyCode(medication?.defaultFrequency ?? '')
  }

  function selectProduct(value: string) {
    setCatalogItemId(value)
    const product = products.find((item) => item.id === value)
    const preferred = product?.packages.find((item) => item.sdStatus === 'ACTIVE' && item.defaultDispense)
      ?? product?.packages.find((item) => item.sdStatus === 'ACTIVE')
    setPackageId(preferred?.id ?? '')
  }

  return <Panel className="medication-order-panel">
    <PanelHead title="门诊处方" meta="通用名必选，产品与包装可由药房后选"
      actions={<Button size="sm" variant="secondary" busy={createPrescription.isPending}
        onClick={() => createPrescription.mutate()}><Icon name="add" />新建处方</Button>} />
    {drafts.length > 0 && <div className="prescription-draft-bar">
      <span>当前编辑</span><Select value={activePrescription?.id} onChange={setActivePrescriptionId}
        options={drafts.map((item) => ({ value: item.id, label: item.prescriptionNo,
          secondaryText: `${item.medicationRequests.length} 项药品` }))} showValue searchable={false} clearable={false} />
      <small>药品先加入草稿，提交后整体生效。</small>
    </div>}
    <div className="medication-order-form">
      <FormField label="通用药品" className="medication-order-form__product">
        <ClinicalResourceSearch<MedicationKnowledge> api={api} resource="medication"
          organizationId={encounter.organizationId} value={medicationOption} onChange={selectMedication} />
      </FormField>
      <FormField label="具体产品（可选）">
        <Select value={catalogItemId} onChange={selectProduct} options={productOptions}
          disabled={!selectedMedication} placeholder="由药房选择产品" showValue />
      </FormField>
      <FormField label="发药包装">
        <Select value={packageId} onChange={setPackageId} options={packageOptions}
          disabled={!selectedProduct || packageOptions.length === 0}
          placeholder={selectedProduct ? '按产品基本单位' : '选择产品后可选'} showValue />
      </FormField>
      <FormField label={`申请数量（${selectedPackage?.unitCode || selectedProduct?.unitCode
        || selectedMedication?.preparationUnit || '单位'}）`}>
        <input type="number" min="0.001" step="0.001" value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))} />
      </FormField>
      <FormField label="单次剂量"><input type="number" min="0.001" step="0.001" value={doseValue}
        onChange={(event) => setDoseValue(event.target.value)} /></FormField>
      <FormField label="剂量单位"><input value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} /></FormField>
      <FormField label="给药途径"><input value={routeCode} onChange={(event) => setRouteCode(event.target.value)} /></FormField>
      <FormField label="频次"><input value={frequencyCode} onChange={(event) => setFrequencyCode(event.target.value)} /></FormField>
      <label className="medication-order-form__check"><input type="checkbox" checked={selfProvided}
        onChange={(event) => setSelfProvided(event.target.checked)} /><span>患者自备药（不计价、不校验发药能力）</span></label>
      <Button className="medication-order-form__submit" busy={createRequest.isPending}
        disabled={!activePrescription || !medicationId || !Number.isFinite(quantity) || quantity <= 0
          || Boolean(doseValue) !== Boolean(doseUnit)} onClick={() => createRequest.mutate()}>
        <Icon name="add" />加入处方</Button>
    </div>
    {selectedPackage && <div className="medication-order-conversion">
      包装换算预览：{quantity || 0} {selectedPackage.unitCode} × {selectedPackage.quantityFactor}
      = {(quantity || 0) * selectedPackage.quantityFactor} {selectedProduct?.unitCode}
    </div>}
    {error && <Alert className="service-order-feedback">{errorMessage(error)}</Alert>}
    {prescriptions.isPending || requests.isPending ? <LoadingState label="正在加载处方…" /> :
      !(prescriptions.data?.length || ungroupedRequests.length) ? <EmptyState icon="clinical" title="尚未建立门诊处方"
        copy="先建立处方草稿，再按通用名加入药品；具体产品可选。" /> : <div className="prescription-list">
        {(prescriptions.data ?? []).map((prescription) => <div className="prescription-card" key={prescription.id}>
          <div className="prescription-card__head"><div><strong>{prescription.prescriptionNo}</strong>
            <small>{formatTime(prescription.authoredAt)} · {prescription.medicationRequests.length} 项药品</small></div>
            <StatusBadge tone={prescription.status === 'ACTIVE' ? 'success'
              : prescription.status === 'DRAFT' ? 'warning' : 'neutral'}>
              {prescription.status === 'ACTIVE' ? '已提交' : prescription.status === 'DRAFT' ? '草稿' : '已撤销'}
            </StatusBadge><div className="prescription-card__actions">
              {prescription.status === 'ACTIVE' && <Button size="sm" variant="secondary"
                onClick={() => setPrintTarget(prescription)}><Icon name="print" />打印处方</Button>}
              {prescription.status === 'DRAFT' && <Button size="sm" busy={submitPrescription.isPending}
                disabled={!prescription.medicationRequests.some((item) => item.status === 'DRAFT')}
                onClick={() => submitPrescription.mutate(prescription)}>提交处方</Button>}
              {prescription.status !== 'CANCELLED' && <Button size="sm" variant="text" busy={cancelPrescription.isPending}
                onClick={() => { if (window.confirm('确认撤销整张处方？')) cancelPrescription.mutate(prescription) }}>撤销整单</Button>}
            </div></div>
          <MedicationRequestTable requests={prescription.medicationRequests} cancelBusy={cancelRequest.isPending}
            onCancel={(request) => cancelRequest.mutate(request)} />
        </div>)}
        {ungroupedRequests.length > 0 && <div className="prescription-card"><div className="prescription-card__head">
          <div><strong>历史单条药品请求</strong><small>处方组能力启用前形成</small></div></div>
          <MedicationRequestTable requests={ungroupedRequests} cancelBusy={cancelRequest.isPending}
            onCancel={(request) => cancelRequest.mutate(request)} /></div>}
      </div>}
    {printTarget && <Dialog eyebrow="受控打印" title="生成门诊处方打印文件"
      description="系统仅允许打印已提交且未撤销的处方，并锁定处方与药品明细快照。"
      closeOnBackdrop={false} onClose={() => setPrintTarget(null)}
      footer={<><Button variant="secondary" onClick={() => setPrintTarget(null)}>取消</Button>
        <Button busy={printPrescription.isPending} onClick={() => printPrescription.mutate(printTarget)}>
          <Icon name="print" />生成并下载</Button></>}>
      <div className="print-confirmation"><dl>
        <div><dt>处方号</dt><dd>{printTarget.prescriptionNo}</dd></div>
        <div><dt>药品明细</dt><dd>{printTarget.medicationRequests.length} 项</dd></div>
        <div><dt>打印用途</dt><dd>患者副本</dd></div>
        <div><dt>输出格式</dt><dd>A4 · PDF · 1 份</dd></div>
      </dl><Alert tone="info">如需再次输出，请走“重打”操作形成独立审计记录，不覆盖本次生成记录。</Alert></div>
    </Dialog>}
  </Panel>
}

function MedicationRequestTable({ requests, cancelBusy, onCancel }: {
  requests: import('../../shared/api/encountersApi').MedicationRequest[]
  cancelBusy: boolean
  onCancel: (request: import('../../shared/api/encountersApi').MedicationRequest) => void
}) {
  return <div className="service-order-table-wrap"><table className="service-order-table medication-order-table">
    <thead><tr><th>通用药品 / 产品</th><th>用法</th><th>申请与换算</th><th>金额</th><th>安全提示</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>{requests.map((request) => <tr key={request.id}>
      <td><strong>{request.medicationName}</strong><small>{request.catalogItemId
        ? `${request.localName || request.itemName} · ${request.itemCode}` : '通用名开立 · 产品待药房选择'}</small></td>
      <td>{request.doseValue == null ? '未设剂量' : `${request.doseValue} ${request.doseUnit}`}
        <small>{[request.routeCode, request.frequencyCode].filter(Boolean).join(' · ') || '未设途径/频次'}</small></td>
      <td>{request.quantity} {request.quantityUnit}<small>= {request.baseQuantity} {request.baseUnit}
        {request.packageSpec ? ` · ${request.packageSpec}` : ''}</small></td>
      <td>{request.totalAmount == null ? request.catalogItemId
        ? (request.selfProvided ? '自备药' : '不计价') : '待选产品计价' : `¥${request.totalAmount.toFixed(2)}`}</td>
      <td>{request.skinTestRequired ? '需皮试' : request.antimicrobial ? '抗菌药物' : '常规'}
        <small><code title={request.itemAttributeHash}>{request.itemAttributeHash.slice(0, 10)}…</code></small></td>
      <td><StatusBadge tone={request.status === 'ACTIVE' ? 'success'
        : request.status === 'DRAFT' ? 'warning' : 'neutral'}>
        {request.status === 'ACTIVE' ? '已生效' : request.status === 'DRAFT' ? '草稿' : '已撤销'}</StatusBadge></td>
      <td>{request.status !== 'CANCELLED' ? <Button size="sm" variant="text" busy={cancelBusy}
        onClick={() => { if (window.confirm('确认撤销该药品？')) onCancel(request) }}>撤销</Button> : '—'}</td>
    </tr>)}</tbody>
  </table></div>
}

const residentSchema = z.object({
  fullName: z.string().trim().min(1, '请输入姓名').max(100, '姓名不能超过100字'),
  nationalId: z.string().trim().min(8, '证件号至少8位').max(32, '证件号不能超过32位'),
  gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
  birthDate: z.string().min(1, '请选择出生日期'),
  phone: z.string().trim().max(32, '联系电话不能超过32位'),
})

const genderOptions = [
  { value: 'UNKNOWN', label: '未知' },
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' },
]

function CreateResidentDialog({ api, onClose, onCreated }: {
  api: RhnApi; onClose: () => void; onCreated: (resident: Resident) => void
}) {
  const { control, register, handleSubmit, formState } = useForm<CreateResidentInput>({
    resolver: zodResolver(residentSchema),
    defaultValues: { fullName: '', nationalId: '', gender: 'UNKNOWN', birthDate: '', phone: '' },
  })
  const createResident = useMutation({ mutationFn: api.residents.create, onSuccess: onCreated })

  return <Dialog title="新建居民" eyebrow="居民主索引" onClose={onClose} closeOnBackdrop={false}
    description="证件号将在当前医共体租户内进行重复识别，并登记为正式居民标识。"
    footer={<><Button type="button" variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="create-resident-form" busy={createResident.isPending}>建立居民主索引</Button></>}>
    <form id="create-resident-form" noValidate onSubmit={handleSubmit((input) => createResident.mutate(input))}>
      <div className="ui-form-row">
        <FormField className="ui-field--grow" label="姓名" error={formState.errors.fullName?.message}><input {...register('fullName')} autoFocus /></FormField>
        <FormField label="性别" error={formState.errors.gender?.message}>
          <Controller control={control} name="gender" render={({ field }) => <Select
            options={genderOptions} value={field.value} onChange={field.onChange} showValue />}/>
        </FormField>
      </div>
      <FormField className="ui-field--full" label="证件号" error={formState.errors.nationalId?.message}><input {...register('nationalId')} /></FormField>
      <div className="ui-form-row">
        <FormField className="ui-field--grow" label="出生日期" error={formState.errors.birthDate?.message}><input type="date" {...register('birthDate')} /></FormField>
        <FormField className="ui-field--grow" label="联系电话" error={formState.errors.phone?.message}><input {...register('phone')} /></FormField>
      </div>
      {createResident.error && <Alert>{errorMessage(createResident.error)}</Alert>}
    </form>
  </Dialog>
}
