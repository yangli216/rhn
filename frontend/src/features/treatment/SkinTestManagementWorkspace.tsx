import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type {
  SkinTestResult, SkinTestStatus, SkinTestWorkItem, StartSkinTestInput,
} from '../../shared/api/treatmentApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, StatusBadge } from '../../shared/ui'

type StatusFilter = 'ACTIONABLE' | 'FINISHED' | 'ALL'

const statusLabel: Record<SkinTestStatus, string> = {
  WAITING_SETTLEMENT: '待结算', WAITING_DISPENSE: '待发药', PENDING: '待皮试', IN_PROGRESS: '观察中',
  NEGATIVE: '阴性', POSITIVE: '阳性', UNCERTAIN: '可疑', INVALID: '无效',
}

function statusTone(value: SkinTestStatus) {
  if (value === 'NEGATIVE') return 'success' as const
  if (value === 'POSITIVE') return 'danger' as const
  if (['WAITING_SETTLEMENT', 'WAITING_DISPENSE', 'UNCERTAIN', 'INVALID'].includes(value)) return 'warning' as const
  return 'info' as const
}

export function SkinTestManagementWorkspace({ api, clinicalContext }: {
  api: RhnApi; clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIONABLE')
  const [keyword, setKeyword] = useState('')
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const worklist = useQuery({
    queryKey: ['skin-test-worklist'], queryFn: () => api.treatments.skinTestWorklist(), refetchInterval: 20_000,
  })
  const allItems = worklist.data ?? []
  const values = useMemo(() => {
    const term = keyword.trim().toLowerCase()
    return allItems.filter((item) => {
      if (statusFilter === 'ACTIONABLE' && !['PENDING', 'IN_PROGRESS', 'UNCERTAIN', 'INVALID',
        'WAITING_SETTLEMENT', 'WAITING_DISPENSE'].includes(item.status)) return false
      if (statusFilter === 'FINISHED' && !['NEGATIVE', 'POSITIVE'].includes(item.status)) return false
      if (!term) return true
      return [item.residentName, item.healthRecordNo, item.requestNo, item.medicationName, item.itemName]
        .some((value) => value?.toLowerCase().includes(term))
    })
  }, [allItems, keyword, statusFilter])

  useEffect(() => {
    if (!linkedEncounterId || !worklist.data) return
    const target = worklist.data.find((item) => item.encounterId === linkedEncounterId)
    if (target) {
      setStatusFilter(['NEGATIVE', 'POSITIVE'].includes(target.status) ? 'FINISHED' : 'ACTIONABLE')
      setSelectedRequestId(target.medicationRequestId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId')
    setSearchParams(next, { replace: true })
  }, [linkedEncounterId, searchParams, setSearchParams, worklist.data])
  useEffect(() => {
    if (linkedEncounterId) return
    if (!selectedRequestId && values.length) setSelectedRequestId(values[0].medicationRequestId)
    if (selectedRequestId && !values.some((item) => item.medicationRequestId === selectedRequestId)) {
      setSelectedRequestId(values[0]?.medicationRequestId ?? '')
    }
  }, [linkedEncounterId, selectedRequestId, values])
  const selected = values.find((item) => item.medicationRequestId === selectedRequestId)
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['skin-test-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['treatment-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-skin-tests'] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-allergies'] }),
    ])
  }
  const metrics = {
    pending: allItems.filter((item) => ['PENDING', 'UNCERTAIN', 'INVALID'].includes(item.status)).length,
    observing: allItems.filter((item) => item.status === 'IN_PROGRESS').length,
    positive: allItems.filter((item) => item.status === 'POSITIVE').length,
    negative: allItems.filter((item) => item.status === 'NEGATIVE').length,
  }

  return <>
    <PageHeader eyebrow="门诊医疗 · 用药安全" title="皮试管理"
      description="承接需皮试用药的开始、观察、判读与用药放行。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新队列</Button>} />
    {worklist.error && <Alert>{errorMessage(worklist.error)}</Alert>}
    <section className="skin-test-metrics" aria-label="皮试队列摘要">
      <div><span>待皮试 / 待复试</span><strong>{metrics.pending}</strong></div>
      <div><span>观察中</span><strong>{metrics.observing}</strong></div>
      <div><span>今日阴性</span><strong>{metrics.negative}</strong></div>
      <div><span>阳性阻断</span><strong>{metrics.positive}</strong></div>
    </section>
    <div className="skin-test-workspace">
      <Panel className="skin-test-queue">
        <header className="skin-test-section-head"><div><h2>皮试队列</h2><span>{values.length} 项</span></div>
          <input aria-label="搜索皮试任务" value={keyword} placeholder="姓名 / 档案号 / 药品"
            onChange={(event) => setKeyword(event.target.value)} /></header>
        <nav className="skin-test-filters" aria-label="皮试状态筛选">
          {([['ACTIONABLE', '待处理'], ['FINISHED', '已判读'], ['ALL', '全部']] as [StatusFilter, string][])
            .map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? 'is-active' : ''}
              onClick={() => setStatusFilter(value)}>{label}</button>)}
        </nav>
        {worklist.isPending && <LoadingState label="正在加载皮试队列…" />}
        {!worklist.isPending && values.length === 0 && <EmptyState icon="clinical" title="当前没有皮试任务"
          copy="需皮试药品完成开立后会自动进入此处。" />}
        <div className="skin-test-queue-list">{values.map((item) => <button type="button"
          key={item.medicationRequestId} className={item.medicationRequestId === selectedRequestId ? 'is-active' : ''}
          onClick={() => setSelectedRequestId(item.medicationRequestId)}>
          <div><strong>{item.residentName}</strong><StatusBadge tone={statusTone(item.status)}>{statusLabel[item.status]}</StatusBadge></div>
          <span>{item.medicationName}</span><small>{item.requestNo} · {item.startedAt ? formatTime(item.startedAt) : '未开始'}</small>
        </button>)}</div>
      </Panel>
      <Panel className="skin-test-detail">
        {!selected ? <EmptyState icon="clinical" title="请选择皮试任务" copy="从左侧队列选择患者后开始处理。" />
          : <SkinTestDetail key={`${selected.medicationRequestId}:${selected.eventId ?? 'pending'}:${selected.eventRevision ?? 0}`}
              item={selected} api={api} departmentName={clinicalContext.department.name} onRefresh={refresh} />}
      </Panel>
    </div>
  </>
}

function SkinTestDetail({ item, api, departmentName, onRefresh }: {
  item: SkinTestWorkItem; api: RhnApi; departmentName: string; onRefresh: () => Promise<void>
}) {
  const [identityVerified, setIdentityVerified] = useState(false)
  const [verificationMethod, setVerificationMethod] = useState<StartSkinTestInput['verificationMethod']>('NAME_AND_IDENTIFIER')
  const [testMethod, setTestMethod] = useState<StartSkinTestInput['testMethod']>('INTRADERMAL')
  const [originalSolution, setOriginalSolution] = useState(false)
  const [solutionName, setSolutionName] = useState('按药品配置配制皮试液')
  const [lotNo, setLotNo] = useState('')
  const [concentration, setConcentration] = useState('')
  const [concentrationUnit, setConcentrationUnit] = useState('U/ml')
  const [bodySite, setBodySite] = useState('左前臂屈侧')
  const [observationMinutes, setObservationMinutes] = useState(20)
  const [result, setResult] = useState<SkinTestResult>('NEGATIVE')
  const [wheal, setWheal] = useState('')
  const [flare, setFlare] = useState('')
  const [reaction, setReaction] = useState('')
  const [earlyReadReason, setEarlyReadReason] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [clock, setClock] = useState(Date.now())
  useEffect(() => {
    if (item.status !== 'IN_PROGRESS') return
    const timer = window.setInterval(() => setClock(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [item.status])
  const refresh = async () => { await onRefresh() }
  const start = useMutation({
    mutationFn: () => api.treatments.startSkinTest(item.medicationRequestId, {
      expectedMedicationRevision: item.medicationRequestRevision, identityVerified, verificationMethod,
      testMethod, originalSolution, solutionName: solutionName.trim() || undefined, lotNo: lotNo.trim() || undefined,
      concentration: concentration ? Number(concentration) : undefined,
      concentrationUnit: concentration ? concentrationUnit.trim() || undefined : undefined,
      bodySite: bodySite.trim() || undefined, observationMinutes,
    }), onSuccess: refresh,
  })
  const complete = useMutation({
    mutationFn: () => api.treatments.completeSkinTest(item.eventId!, {
      expectedRevision: item.eventRevision!, result,
      whealDiameterMm: wheal ? Number(wheal) : undefined, flareDiameterMm: flare ? Number(flare) : undefined,
      reactionDescription: reaction.trim() || undefined, earlyReadReason: earlyReadReason.trim() || undefined,
    }), onSuccess: refresh,
  })
  const cancel = useMutation({
    mutationFn: () => api.treatments.cancelSkinTest(item.eventId!, item.eventRevision!, cancelReason.trim()),
    onSuccess: refresh,
  })
  const readyAt = item.startedAt && item.observationMinutes
    ? new Date(item.startedAt).getTime() + item.observationMinutes * 60_000 : 0
  const remainingMinutes = readyAt ? Math.max(0, Math.ceil((readyAt - clock) / 60_000)) : 0
  const negativeBeforeObservationEnds = remainingMinutes > 0 && result === 'NEGATIVE'
  const error = start.error || complete.error || cancel.error
  const canStart = ['PENDING', 'UNCERTAIN', 'INVALID'].includes(item.status)
  const dose = [item.doseValue, item.doseUnit].filter((value) => value !== undefined && value !== '').join(' ')

  return <>
    <header className="skin-test-detail-head"><div><span>{item.requestNo} · {item.healthRecordNo}</span>
      <h2>{item.residentName}</h2><p>{item.medicationName} · {[dose, item.routeCode].filter(Boolean).join(' · ')}</p></div>
      <StatusBadge tone={statusTone(item.status)}>{statusLabel[item.status]}</StatusBadge></header>
    <section className="skin-test-order-summary">
      <div><span>皮试药品</span><strong>{item.itemName || item.medicationName}</strong><small>{item.medicationCode}</small></div>
      <div><span>执行科室</span><strong>{departmentName}</strong><small>第 {item.attemptNo ?? 1} 次</small></div>
      <div><span>用药放行</span><strong>{item.status === 'NEGATIVE' ? '已放行' : item.status === 'POSITIVE' ? '禁止执行' : '未放行'}</strong>
        <small>{item.status === 'NEGATIVE' ? '治疗任务可继续' : '需取得阴性结果'}</small></div>
    </section>
    {error && <Alert>{errorMessage(error)}</Alert>}
    {['WAITING_SETTLEMENT', 'WAITING_DISPENSE'].includes(item.status) && <Alert tone="info">
      {item.gateMessage || '当前药品尚未满足皮试执行条件。'}</Alert>}
    {canStart && <section className="skin-test-action-card">
      {['UNCERTAIN', 'INVALID'].includes(item.status) && <Alert tone="info">上次判读为{statusLabel[item.status]}，可重新执行皮试。</Alert>}
      <h3>开始皮试</h3>
      <label className="treatment-identity-check"><input type="checkbox" checked={identityVerified}
        onChange={(event) => setIdentityVerified(event.target.checked)} /><span>
        <strong>已当面核对患者身份、药品和皮试液</strong><small>开始前必须完成姓名与证件/卡核对</small></span></label>
      <div className="skin-test-form-grid">
        <FormField label="核对方式"><select value={verificationMethod}
          onChange={(event) => setVerificationMethod(event.target.value as typeof verificationMethod)}>
          <option value="NAME_AND_IDENTIFIER">姓名 + 证件/卡</option><option value="CARD">读卡核对</option>
          <option value="MANUAL">人工核对</option></select></FormField>
        <FormField label="皮试方式"><select value={testMethod}
          onChange={(event) => setTestMethod(event.target.value as typeof testMethod)}>
          <option value="INTRADERMAL">皮内试验</option><option value="PRICK">点刺试验</option><option value="OTHER">其他</option>
        </select></FormField>
        <FormField label="试液类型"><select value={originalSolution ? 'ORIGINAL' : 'PREPARED'}
          onChange={(event) => setOriginalSolution(event.target.value === 'ORIGINAL')}>
          <option value="PREPARED">配制皮试液</option><option value="ORIGINAL">原液</option></select></FormField>
        <FormField label="观察时长"><div className="skin-test-number-unit"><input type="number" min={1} max={120}
          value={observationMinutes} onChange={(event) => setObservationMinutes(Number(event.target.value))} /><span>分钟</span></div></FormField>
        <FormField label="试液 / 配制说明"><input value={solutionName} maxLength={300}
          onChange={(event) => setSolutionName(event.target.value)} /></FormField>
        <FormField label="药品或试液批号"><input value={lotNo} maxLength={128} placeholder="可扫码或手工录入"
          onChange={(event) => setLotNo(event.target.value)} /></FormField>
        <FormField label="浓度"><div className="skin-test-number-unit"><input type="number" min="0" step="0.01"
          value={concentration} placeholder="可选" onChange={(event) => setConcentration(event.target.value)} />
          <input value={concentrationUnit} aria-label="浓度单位" onChange={(event) => setConcentrationUnit(event.target.value)} /></div></FormField>
        <FormField label="皮试部位"><input value={bodySite} maxLength={128}
          onChange={(event) => setBodySite(event.target.value)} /></FormField>
      </div>
      <div className="ui-form-actions"><Button busy={start.isPending} disabled={!identityVerified || observationMinutes < 1}
        onClick={() => start.mutate()}>确认开始并计时</Button></div>
    </section>}
    {item.status === 'IN_PROGRESS' && <section className="skin-test-action-card is-observing">
      <header className="skin-test-observation-head"><div><span>观察计时</span>
        <strong>{remainingMinutes > 0 ? `还需 ${remainingMinutes} 分钟` : '已到判读时间'}</strong></div>
        <StatusBadge tone={remainingMinutes > 0 ? 'warning' : 'success'}>
          {item.observationMinutes} 分钟</StatusBadge></header>
      <dl className="skin-test-facts"><div><dt>开始时间</dt><dd>{formatTime(item.startedAt!)}</dd></div>
        <div><dt>皮试部位</dt><dd>{item.bodySite || '未记录'}</dd></div>
        <div><dt>试液</dt><dd>{item.solutionName || (item.originalSolution ? '原液' : '配制皮试液')}</dd></div>
        <div><dt>批号</dt><dd>{item.lotNo || '未记录'}</dd></div></dl>
      <h3>判读结果</h3><div className="skin-test-result-options">
        {([['NEGATIVE', '阴性'], ['POSITIVE', '阳性'], ['UNCERTAIN', '可疑'], ['INVALID', '无效']] as [SkinTestResult, string][])
          .map(([value, label]) => <label key={value} className={result === value ? 'is-active' : ''}>
            <input type="radio" name="skin-test-result" value={value} checked={result === value}
              onChange={() => setResult(value)} /><span>{label}</span></label>)}
      </div>
      <div className="skin-test-form-grid">
        <FormField label="风团直径"><div className="skin-test-number-unit"><input type="number" min="0" step="0.1"
          value={wheal} onChange={(event) => setWheal(event.target.value)} /><span>mm</span></div></FormField>
        <FormField label="红晕直径"><div className="skin-test-number-unit"><input type="number" min="0" step="0.1"
          value={flare} onChange={(event) => setFlare(event.target.value)} /><span>mm</span></div></FormField>
      </div>
      <FormField label={result === 'POSITIVE' ? '反应与处置' : '判读说明'} required={result === 'POSITIVE'}>
        <textarea rows={2} value={reaction} maxLength={1000} placeholder={result === 'POSITIVE' ? '记录局部/全身反应及处置' : '可选'}
          onChange={(event) => setReaction(event.target.value)} /></FormField>
      {negativeBeforeObservationEnds && <Alert tone="info">阴性结果需完成规定观察时间后才能判读。</Alert>}
      {remainingMinutes > 0 && result !== 'NEGATIVE' && <FormField label="提前判读原因" required><input value={earlyReadReason} maxLength={1000}
        placeholder="如发生明确急性反应" onChange={(event) => setEarlyReadReason(event.target.value)} /></FormField>}
      <div className="skin-test-action-row"><Button variant="text" onClick={() => setCancelOpen((value) => !value)}>取消本次皮试</Button>
        <Button busy={complete.isPending} disabled={(result === 'POSITIVE' && !reaction.trim())
          || negativeBeforeObservationEnds
          || (remainingMinutes > 0 && result !== 'NEGATIVE' && !earlyReadReason.trim())}
          onClick={() => complete.mutate()}>{negativeBeforeObservationEnds ? '等待观察结束' : '确认判读'}</Button></div>
      {cancelOpen && <div className="skin-test-cancel-row"><input value={cancelReason} maxLength={1000}
        placeholder="填写取消原因" onChange={(event) => setCancelReason(event.target.value)} />
        <Button size="sm" variant="danger" busy={cancel.isPending} disabled={!cancelReason.trim()}
          onClick={() => cancel.mutate()}>确认取消</Button></div>}
    </section>}
    {['NEGATIVE', 'POSITIVE'].includes(item.status) && <section className={`skin-test-result-summary is-${item.status.toLowerCase()}`}>
      <header><div><span>最终判读</span><h3>皮试{statusLabel[item.status]}</h3></div>
        <StatusBadge tone={statusTone(item.status)}>{formatTime(item.completedAt!)}</StatusBadge></header>
      <dl className="skin-test-facts"><div><dt>皮试方式</dt><dd>{testMethodLabel(item.testMethod)}</dd></div>
        <div><dt>部位</dt><dd>{item.bodySite || '未记录'}</dd></div>
        <div><dt>风团</dt><dd>{item.whealDiameterMm === undefined ? '未记录' : `${item.whealDiameterMm} mm`}</dd></div>
        <div><dt>红晕</dt><dd>{item.flareDiameterMm === undefined ? '未记录' : `${item.flareDiameterMm} mm`}</dd></div></dl>
      {item.reactionDescription && <p>{item.reactionDescription}</p>}
      {item.status === 'POSITIVE' && <Alert>已禁止当前用药执行，并同步登记患者药物过敏信息。</Alert>}
    </section>}
  </>
}

function testMethodLabel(value?: SkinTestWorkItem['testMethod']) {
  if (value === 'PRICK') return '点刺试验'
  if (value === 'OTHER') return '其他'
  return '皮内试验'
}
