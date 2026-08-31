import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import { age, formatTime, genderLabel } from '../../shared/format'
import type { InpatientBed, InpatientDischargeDiagnosis, InpatientEpisode } from '../../shared/api/inpatientApi'
import type { Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, DictionarySelect, EmptyState, FormField, LoadingState, PageHeader, Panel,
  PatientIdentitySearch, SearchField, Select, StatusBadge } from '../../shared/ui'

const bedStatusText: Record<InpatientBed['displayStatus'], string> = {
  AVAILABLE: '空床', OCCUPIED: '占用', CLEANING: '待清洁', BLOCKED: '封床', MAINTENANCE: '维护',
}

const bedTone: Record<InpatientBed['displayStatus'], 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  AVAILABLE: 'success', OCCUPIED: 'info', CLEANING: 'warning', BLOCKED: 'neutral', MAINTENANCE: 'danger',
}

interface AdmissionCompletion {
  episode: InpatientEpisode
  depositAmount?: number
  depositError?: string
}

export function InpatientAdmissionWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate?: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [completed, setCompleted] = useState<AdmissionCompletion | null>(null)
  const bootstrap = useQuery({
    queryKey: ['inpatient-bootstrap', clinicalContext.organization.id, 'admission'],
    queryFn: () => api.inpatient.bootstrap('ACTIVE'),
  })
  const beds = bootstrap.data?.beds ?? []
  const available = beds.filter((value) => value.displayStatus === 'AVAILABLE').length

  useEffect(() => {
    setCompleted(null)
  }, [clinicalContext.organization.id])

  return <>
    <PageHeader eyebrow="住院医疗 · 登记窗口" title="入院登记"
      actions={<Button variant="secondary" onClick={() => onNavigate?.('/inpatient/admission-query')}>查询登记记录</Button>} />
    {bootstrap.error && <Alert>{errorMessage(bootstrap.error)}</Alert>}
    {bootstrap.isPending ? <LoadingState label="正在加载可用床位…" /> : completed ?
      <Panel className="inpatient-admission-success"><StatusBadge tone="success">登记完成</StatusBadge>
        <h2>{completed.episode.residentName} 已成功入院</h2>
        <p>住院号 <strong>{completed.episode.episodeNo}</strong> · {completed.episode.wardName}
          {' '}{completed.episode.roomName} {completed.episode.bedNo}</p>
        {completed.depositAmount !== undefined && !completed.depositError && <Alert tone="success">
          快捷预交金 {money(completed.depositAmount)} 已收取，可在“预交金管理”中查看流水。
        </Alert>}
        {completed.depositError && <Alert tone="warning">入院登记已完成，但快捷预交金收取失败：
          {completed.depositError}。请前往“预交金管理”补录。</Alert>}
        <div className="ui-form-actions"><Button variant="secondary" onClick={() => setCompleted(null)}>继续登记</Button>
          <Button variant="secondary" onClick={() => onNavigate?.('/inpatient/deposits')}>预交金管理</Button>
          <Button onClick={() => onNavigate?.('/inpatient/admission-query')}>查看登记记录</Button></div></Panel> :
      <AdmissionForm api={api} beds={beds} onSuccess={async (value) => {
        setCompleted(value)
        await queryClient.invalidateQueries({ queryKey: ['inpatient-bootstrap'] })
      }} />}
    {!bootstrap.isPending && available === 0 && !completed && <Alert>当前没有可分配床位，请先在病区护士站完成床位释放。</Alert>}
  </>
}

/** @deprecated Use the role-oriented inpatient workspaces instead. */
export const InpatientWorkspace = InpatientAdmissionWorkspace

export function InpatientAdmissionQueryWorkspace({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const [history, setHistory] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const bootstrap = useQuery({
    queryKey: ['inpatient-bootstrap', clinicalContext.organization.id, history, submittedKeyword],
    queryFn: () => api.inpatient.bootstrap(history ? 'ALL' : 'ACTIVE', submittedKeyword),
  })
  const episodes = bootstrap.data?.episodes ?? []
  const selected = episodes.find((value) => value.id === selectedId) ?? episodes[0]

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
    if (!selected && selectedId) setSelectedId('')
  }, [selected, selectedId])
  useEffect(() => setSelectedId(''), [clinicalContext.organization.id])

  return <>
    <PageHeader eyebrow="住院医疗 · 登记管理" title="入院登记查询"
      description="集中查询当前及历史入院登记，核对住院号、床位和登记详情。" />
    {bootstrap.error && <Alert>{errorMessage(bootstrap.error)}</Alert>}
    <div className="inpatient-toolbar"><form onSubmit={(event) => {
      event.preventDefault(); setSubmittedKeyword(keyword.trim())
    }}><SearchField value={keyword} onChange={setKeyword} label="搜索入院登记"
      placeholder="姓名 / 健康档案号 / 住院号 / 床号" /><Button type="submit" variant="secondary">查询</Button></form>
      <nav aria-label="住院记录范围"><button type="button" className={!history ? 'is-active' : ''}
        onClick={() => setHistory(false)}>当前在院</button><button type="button" className={history ? 'is-active' : ''}
        onClick={() => setHistory(true)}>全部登记</button></nav></div>
    {bootstrap.isPending ? <LoadingState label="正在查询入院登记…" /> : <div className="inpatient-layout inpatient-query-layout">
      <Panel className="inpatient-patient-panel inpatient-query-list"><header className="inpatient-section-head"><div><h2>登记记录</h2>
        <span>共 {episodes.length} 条</span></div></header>
        {episodes.length === 0 ? <EmptyState icon="residents" title="没有匹配的登记记录" copy="请调整查询条件后重试。" /> :
          <div className="inpatient-patient-list">{episodes.map((value) => <PatientRow key={value.id} value={value}
            active={value.id === selected?.id} onClick={() => setSelectedId(value.id)} />)}</div>}</Panel>
      <Panel className="inpatient-detail-panel">{selected ? <EpisodeDetail value={selected} /> :
        <EmptyState icon="residents" title="请选择登记记录" copy="选择后查看完整入院登记信息。" />}</Panel>
    </div>}
  </>
}

export function BedBoard({ beds, selectedId, onSelectEpisode, onRelease, onBlock }: {
  beds: InpatientBed[]
  selectedId?: string
  onSelectEpisode: (episodeId: string) => void
  onRelease?: (bed: InpatientBed) => void
  onBlock?: (bed: InpatientBed) => void
}) {
  const rooms = useMemo(() => Object.entries(beds.reduce<Record<string, InpatientBed[]>>((grouped, bed) => {
    const key = `${bed.wardName ?? '病区'} · ${bed.roomName ?? '未分房间'}`
    ;(grouped[key] ??= []).push(bed)
    return grouped
  }, {})), [beds])
  return <Panel className="inpatient-bed-board"><header className="inpatient-section-head"><div><h2>病区床位板</h2>
    <span>颜色即状态，患者占床可直接定位</span></div></header>
    {rooms.map(([room, values]) => <section className="inpatient-room" key={room}><h3>{room}</h3>
      <div className="inpatient-bed-grid">{values.map((bed) => <article key={bed.id}
        className={`inpatient-bed inpatient-bed--${bed.displayStatus.toLowerCase()} ${selectedId && bed.episodeId === selectedId ? 'is-active' : ''}`}>
        <button type="button" className="inpatient-bed__main" disabled={!bed.episodeId}
          onClick={() => bed.episodeId && onSelectEpisode(bed.episodeId)}>
          <span><strong>{bed.bedNo}</strong><StatusBadge tone={bedTone[bed.displayStatus]}>{bedStatusText[bed.displayStatus]}</StatusBadge></span>
          <b>{bed.residentName ?? (bed.bedType === 'EXTRA' ? '加床' : '待分配')}</b>
          <small>{bed.dailyBedRate === undefined ? bed.code : `床位费 ¥${bed.dailyBedRate}/日`}</small>
        </button>
        {bed.displayStatus === 'CLEANING' && onRelease && <Button size="sm" variant="text" onClick={() => onRelease(bed)}>清洁完成</Button>}
        {['AVAILABLE', 'BLOCKED'].includes(bed.displayStatus) && onBlock && <Button size="sm" variant="text" onClick={() => onBlock(bed)}>
          {bed.displayStatus === 'BLOCKED' ? '恢复' : '封床'}</Button>}
      </article>)}</div></section>)}
  </Panel>
}

export function PatientRow({ value, active, onClick }: { value: InpatientEpisode; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
    <span><strong>{value.bedNo ?? '已离院'}</strong><b>{value.residentName}</b></span>
    <span>{value.gender === 'UNKNOWN' ? '未知' : genderLabel(value.gender)} · {value.birthDate ? `${age(value.birthDate)}岁` : '年龄未知'} · {value.healthRecordNo}</span>
    <small>{value.episodeNo} · {formatTime(value.admittedAt)}</small>
    <StatusBadge tone={value.status === 'ADMITTED' ? 'info' : 'neutral'}>{value.status === 'ADMITTED' ? '在院' : '已出院'}</StatusBadge>
  </button>
}

export function EpisodeDetail({ value, onTransfer, onDischarge }: {
  value: InpatientEpisode
  onTransfer?: () => void
  onDischarge?: () => void
}) {
  return <div className="inpatient-episode-detail">
    <header><div><span>{value.departmentName} · {value.bedNo ?? '已离院'}</span><h2>{value.residentName}</h2>
      <p>{genderLabel(value.gender)} · {value.birthDate ? `${age(value.birthDate)}岁` : '年龄未知'} · 健康档案 {value.healthRecordNo}</p></div>
      <StatusBadge tone={value.status === 'ADMITTED' ? 'info' : 'neutral'}>{value.status === 'ADMITTED' ? '在院' : '已出院'}</StatusBadge></header>
    <dl><div><dt>住院号</dt><dd>{value.episodeNo}</dd></div><div><dt>入院时间</dt><dd>{formatTime(value.admittedAt)}</dd></div>
      <div><dt>病区 / 病房</dt><dd>{[value.wardName, value.roomName].filter(Boolean).join(' · ') || value.departmentName}</dd></div>
      <div><dt>护理级别</dt><dd>{nursingLevelText(value.nursingLevelCode)}</dd></div>
      <div><dt>入院来源</dt><dd>{admissionSourceText(value.admissionSourceCode)}</dd></div>
      <div><dt>入院类型</dt><dd>{admissionTypeText(value.admissionTypeCode)}</dd></div>
      <div><dt>入院方式</dt><dd>{admissionMethodText(value.admissionMethodCode)}</dd></div>
      <div><dt>入院病情</dt><dd>{conditionText(value.conditionCode)}</dd></div>
      <div><dt>付费方式</dt><dd>{paymentMethodText(value.paymentMethodCode)}</dd></div>
      <div><dt>饮食</dt><dd>{dietText(value.dietCode)}</dd></div>
      <div><dt>转诊机构</dt><dd>{value.referralOrganizationName || '—'}</dd></div></dl>
    <section><h3>入院原因</h3><p>{value.admissionReason || '未填写入院原因'}</p></section>
    <section><h3>联系人</h3><p>{value.emergencyContactName ?
      `${value.emergencyContactName} · ${value.emergencyContactRelationshipText || value.emergencyContactRelationship || '关系未填'} · ${value.emergencyContactPhone || '电话未填'}` : '未登记联系人'}</p></section>
    {value.admissionNote && <section><h3>登记备注</h3><p>{value.admissionNote}</p></section>}
    {value.status === 'DISCHARGED' && <section><h3>出院记录</h3><p>{value.dischargeNote || '已完成出院登记'}</p>
      <small>{value.dischargedAt ? formatTime(value.dischargedAt) : ''}</small></section>}
    {value.status === 'ADMITTED' && (onTransfer || onDischarge) && <div className="ui-form-actions">
      {onTransfer && <Button variant="secondary" onClick={onTransfer}>转床</Button>}
      {onDischarge && <Button onClick={onDischarge}>办理出院</Button>}
    </div>}
  </div>
}

function localDateTimeValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function money(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: 'CNY', minimumFractionDigits: 2,
  }).format(value)
}

const admissionTypeOptions = [
  { value: 'GENERAL', label: '一般入院' }, { value: 'EMERGENCY', label: '急诊入院' },
  { value: 'TRANSFER', label: '转院入院' },
]
const admissionSourceOptions = [
  { value: 'OUTPATIENT', label: '门诊建议入院' }, { value: 'EMERGENCY', label: '急诊入院' },
  { value: 'REFERRAL', label: '转诊入院' }, { value: 'DIRECT', label: '直接入院' },
]
const admissionMethodOptions = [
  { value: 'WALKING', label: '步行' }, { value: 'WHEELCHAIR', label: '轮椅' },
  { value: 'STRETCHER', label: '平车' }, { value: 'AMBULANCE', label: '救护车' },
]
const admissionConditionOptions = [
  { value: 'GENERAL', label: '一般' }, { value: 'URGENT', label: '急' }, { value: 'CRITICAL', label: '危重' },
]
const nursingLevelOptions = [
  { value: 'LEVEL_III', label: '三级护理' }, { value: 'LEVEL_II', label: '二级护理' },
  { value: 'LEVEL_I', label: '一级护理' }, { value: 'SPECIAL', label: '特级护理' },
]
const dietOptions = [
  { value: 'NORMAL', label: '普通饮食' }, { value: 'SOFT', label: '软食' },
  { value: 'LIQUID', label: '流质' }, { value: 'FASTING', label: '禁食' },
]
const inpatientPaymentOptions = [
  { value: 'BASIC_MEDICAL_INSURANCE', label: '基本医疗保险' }, { value: 'SELF_PAY', label: '自费' },
  { value: 'COMMERCIAL_INSURANCE', label: '商业保险' }, { value: 'OTHER', label: '其他' },
]
const quickDepositPaymentOptions = [
  { value: 'CASH', label: '现金' }, { value: 'WECHAT', label: '微信' },
  { value: 'ALIPAY', label: '支付宝' }, { value: 'BANK_CARD', label: '银行卡' },
]

function AdmissionForm({ api, beds, onSuccess }: {
  api: RhnApi
  beds: InpatientBed[]
  onSuccess: (value: AdmissionCompletion) => void | Promise<void>
}) {
  const availableBeds = beds.filter((value) => value.displayStatus === 'AVAILABLE')
  const [resident, setResident] = useState<Resident | null>(null)
  const [bedId, setBedId] = useState(availableBeds[0]?.id ?? '')
  const [admittedAt, setAdmittedAt] = useState(localDateTimeValue)
  const [admissionType, setAdmissionType] = useState<'GENERAL' | 'EMERGENCY' | 'TRANSFER'>('GENERAL')
  const [source, setSource] = useState<'OUTPATIENT' | 'EMERGENCY' | 'REFERRAL' | 'DIRECT'>('OUTPATIENT')
  const [method, setMethod] = useState<'WALKING' | 'WHEELCHAIR' | 'STRETCHER' | 'AMBULANCE'>('WALKING')
  const [condition, setCondition] = useState<'GENERAL' | 'URGENT' | 'CRITICAL'>('GENERAL')
  const [level, setLevel] = useState<'SPECIAL' | 'LEVEL_I' | 'LEVEL_II' | 'LEVEL_III'>('LEVEL_III')
  const [diet, setDiet] = useState('NORMAL')
  const [payment, setPayment] = useState<'SELF_PAY' | 'BASIC_MEDICAL_INSURANCE' | 'COMMERCIAL_INSURANCE' | 'OTHER'>('BASIC_MEDICAL_INSURANCE')
  const [reason, setReason] = useState('')
  const [referralOrganization, setReferralOrganization] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactRelationshipCode, setContactRelationshipCode] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [note, setNote] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositPaymentMethod, setDepositPaymentMethod] = useState('CASH')
  const parsedDepositAmount = Number(depositAmount)
  const depositRequested = depositAmount.trim().length > 0
  const validDepositAmount = Number.isFinite(parsedDepositAmount) && parsedDepositAmount > 0
  const admit = useMutation({
    mutationFn: async () => {
      const episode = await api.inpatient.admit({
        residentId: resident!.id, bedId, admittedAt: new Date(admittedAt).toISOString(), admissionTypeCode: admissionType,
        admissionSourceCode: source, admissionReason: reason.trim() || undefined, nursingLevelCode: level,
        dietCode: diet, admissionMethodCode: method, conditionCode: condition, paymentMethodCode: payment,
        referralOrganizationName: referralOrganization.trim() || undefined,
        emergencyContactName: contactName.trim() || undefined,
        emergencyContactRelationship: contactRelationshipCode || undefined,
        emergencyContactPhone: contactPhone.trim() || undefined,
        admissionNote: note.trim() || undefined, commandCode: `ADMIT-${crypto.randomUUID()}`,
      })
      if (!depositRequested) return { episode }
      try {
        await api.inpatient.registerDeposit(episode.id, {
          paymentNo: `IPD-${episode.id}-${Date.now()}`, amount: parsedDepositAmount,
          currencyCode: 'CNY', paymentMethodCode: depositPaymentMethod,
          description: `${episode.residentName}入院快捷预交金`,
        })
        return { episode, depositAmount: parsedDepositAmount }
      } catch (error) {
        return { episode, depositAmount: parsedDepositAmount, depositError: errorMessage(error) }
      }
    },
    onSuccess,
  })
  const contactIncomplete = Boolean(contactName || contactRelationshipCode || contactPhone) &&
    !(contactName.trim() && contactRelationshipCode && contactPhone.trim())
  const canSubmit = Boolean(resident && bedId && admittedAt && !contactIncomplete
    && (!depositRequested || validDepositAmount))
  return <form className="inpatient-admission-form" onSubmit={(event) => {
    event.preventDefault(); if (canSubmit) admit.mutate()
  }}>
    {admit.error && <Alert>{errorMessage(admit.error)}</Alert>}
    <Panel className="inpatient-admission-section"><header className="inpatient-section-head"><div><h2>1. 患者确认</h2></div>
      {resident && <StatusBadge tone="success">已选择</StatusBadge>}</header>
      <div className="inpatient-admission-section__body"><PatientIdentitySearch queryKey="inpatient-admission"
        search={api.residents.search} selected={resident} autoFocus compact showInitialEmpty={false}
        onClear={() => setResident(null)}
        onSelect={(value) => { setResident(value); if (!contactPhone && value.phone) setContactPhone(value.phone) }}
        getOptionDisabledReason={(value) => value.deceased ? '已死亡，不能办理入院'
          : value.status !== 'ACTIVE' ? '居民档案状态不可用' : undefined} /></div>
    </Panel>
    <Panel className="inpatient-admission-section"><header className="inpatient-section-head"><div><h2>2. 入院信息</h2></div></header>
      <div className="inpatient-admission-section__body inpatient-form-grid">
        <FormField label="入院时间" required><input type="datetime-local" value={admittedAt} max={localDateTimeValue()}
          onChange={(event) => setAdmittedAt(event.target.value)} /></FormField>
        <FormField label="入院类型" required><Select value={admissionType} options={admissionTypeOptions}
          searchable={false} clearable={false} onChange={(value) => setAdmissionType(value as typeof admissionType)} /></FormField>
        <FormField label="入院来源" required><Select value={source} options={admissionSourceOptions}
          searchable={false} clearable={false} onChange={(value) => setSource(value as typeof source)} /></FormField>
        <FormField label="入院方式" required><Select value={method} options={admissionMethodOptions}
          searchable={false} clearable={false} onChange={(value) => setMethod(value as typeof method)} /></FormField>
        <FormField label="入院病情" required><Select value={condition} options={admissionConditionOptions}
          searchable={false} clearable={false} onChange={(value) => setCondition(value as typeof condition)} /></FormField>
        <FormField label="转诊机构" hint={source === 'REFERRAL' ? '转诊入院时建议填写' : '非转诊入院可不填'}><input value={referralOrganization}
          onChange={(event) => setReferralOrganization(event.target.value)} disabled={source !== 'REFERRAL'} /></FormField>
        <FormField label="入院原因 / 主要症状" className="is-wide"><textarea rows={3} value={reason}
          maxLength={1000} placeholder="简要记录主要症状、持续时间或住院目的" onChange={(event) => setReason(event.target.value)} /></FormField>
      </div></Panel>
    <Panel className="inpatient-admission-section"><header className="inpatient-section-head"><div><h2>3. 病区与费用</h2></div></header>
      <div className="inpatient-admission-section__body inpatient-form-grid">
        <FormField label="分配床位" required><Select value={bedId}
          options={availableBeds.map((bed) => ({ value: bed.id, label: `${bed.wardName} · ${bed.roomName} · ${bed.bedNo}` }))}
          placeholder="请选择可用床位" emptyText="暂无可用床位" clearable={false} disabled={!availableBeds.length}
          searchPlaceholder="搜索病区、房间或床号" onChange={setBedId} /></FormField>
        <FormField label="护理级别" required><Select value={level} options={nursingLevelOptions}
          searchable={false} clearable={false} onChange={(value) => setLevel(value as typeof level)} /></FormField>
        <FormField label="饮食类别"><Select value={diet} options={dietOptions}
          searchable={false} clearable={false} onChange={setDiet} /></FormField>
        <FormField label="付费方式" required><Select value={payment} options={inpatientPaymentOptions}
          searchable={false} clearable={false} onChange={(value) => setPayment(value as typeof payment)} /></FormField>
        <FormField label="快捷预交金（选填）" hint="登记成功后直接收取"
          error={depositRequested && !validDepositAmount ? '请输入大于 0 的金额' : undefined}>
          <input inputMode="decimal" value={depositAmount} placeholder="0.00"
            onChange={(event) => setDepositAmount(event.target.value)} /></FormField>
        <FormField label="预交金支付方式"><Select value={depositPaymentMethod} options={quickDepositPaymentOptions}
          searchable={false} clearable={false} disabled={!depositRequested} onChange={setDepositPaymentMethod} /></FormField>
      </div></Panel>
    <Panel className="inpatient-admission-section"><header className="inpatient-section-head"><div><h2>4. 联系人与备注</h2></div></header>
      <div className="inpatient-admission-section__body inpatient-form-grid">
        <FormField label="联系人姓名" error={contactIncomplete && !contactName.trim() ? '请填写联系人姓名' : undefined}>
          <input value={contactName} maxLength={100} onChange={(event) => setContactName(event.target.value)} /></FormField>
        <FormField label="与患者关系" error={contactIncomplete && !contactRelationshipCode ? '请选择与患者关系' : undefined}>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RELATED_PERSON_RELATIONSHIP"
            value={contactRelationshipCode} placeholder="请选择" clearable onChange={setContactRelationshipCode} /></FormField>
        <FormField label="联系电话" error={contactIncomplete && !contactPhone.trim() ? '请填写联系电话' : undefined}>
          <input value={contactPhone} maxLength={32} inputMode="tel" onChange={(event) => setContactPhone(event.target.value)} /></FormField>
        <FormField label="登记备注" className="is-wide"><textarea rows={3} value={note} maxLength={1000}
          placeholder="可记录陪护、沟通或其他行政注意事项" onChange={(event) => setNote(event.target.value)} /></FormField>
      </div></Panel>
    <div className="inpatient-admission-submit"><span>{depositRequested && validDepositAmount
      ? `登记后将生成住院号、占用床位并收取预交金 ${money(parsedDepositAmount)}。`
      : '登记后将生成住院号并立即占用所选床位。'}</span>
      <Button type="submit" busy={admit.isPending} disabled={!canSubmit}>确认入院登记</Button></div>
  </form>
}

export function TransferDialog({ api, episode, beds, onClose, onSuccess }: {
  api: RhnApi
  episode: InpatientEpisode
  beds: InpatientBed[]
  onClose: () => void
  onSuccess: (value: InpatientEpisode) => void | Promise<void>
}) {
  const targets = beds.filter((value) => value.displayStatus === 'AVAILABLE' && value.id !== episode.bedId)
  const [bedId, setBedId] = useState(targets[0]?.id ?? '')
  const [reason, setReason] = useState('病情及护理需要')
  const transfer = useMutation({ mutationFn: () => api.inpatient.transfer(episode.id, {
    expectedRevision: episode.revision, targetBedId: bedId, reason, commandCode: `TRANSFER-${crypto.randomUUID()}`,
  }), onSuccess })
  return <Dialog title="转床" eyebrow={`${episode.residentName} · ${episode.bedNo}`} onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={transfer.isPending}
      disabled={!bedId || !reason.trim()} onClick={() => transfer.mutate()}>确认转床</Button></>}>
    {transfer.error && <Alert>{errorMessage(transfer.error)}</Alert>}
    <div className="inpatient-form-grid"><FormField label="目标床位" required><select value={bedId}
      onChange={(event) => setBedId(event.target.value)}>{targets.map((bed) => <option key={bed.id} value={bed.id}>
        {bed.wardName} · {bed.roomName} · {bed.bedNo}</option>)}</select></FormField>
      <FormField label="转床原因" required><input value={reason} onChange={(event) => setReason(event.target.value)} /></FormField></div>
  </Dialog>
}

export function DischargeDialog({ api, episode, onClose, onSuccess }: {
  api: RhnApi
  episode: InpatientEpisode
  onClose: () => void
  onSuccess: (value: InpatientEpisode) => void | Promise<void>
}) {
  const [disposition, setDisposition] = useState<'HOME' | 'TRANSFER' | 'DEATH' | 'OTHER'>('HOME')
  const [note, setNote] = useState('')
  const [diagnosisQuery, setDiagnosisQuery] = useState('')
  const [diagnosisSearch, setDiagnosisSearch] = useState('')
  const [diagnoses, setDiagnoses] = useState<InpatientDischargeDiagnosis[]>([])
  const [diagnosesInitialized, setDiagnosesInitialized] = useState(false)
  const readiness = useQuery({
    queryKey: ['inpatient-discharge-readiness', episode.id],
    queryFn: () => api.inpatient.dischargeReadiness(episode.id),
  })
  const diseaseResults = useQuery({
    queryKey: ['inpatient-discharge-disease-search', diagnosisSearch],
    queryFn: () => api.masterData.diseases(diagnosisSearch, '', 'ACTIVE'),
    enabled: diagnosisSearch.length >= 2,
  })
  useEffect(() => {
    if (!diagnosesInitialized && readiness.data) {
      setDiagnoses(readiness.data.dischargeDiagnoses)
      setDiagnosesInitialized(true)
    }
  }, [diagnosesInitialized, readiness.data])
  const saveDiagnoses = useMutation({
    mutationFn: () => api.inpatient.saveDischargeDiagnoses(episode.id, {
      expectedEpisodeRevision: episode.revision,
      diagnoses: diagnoses.map(({ code, display, diagnosisType }) => ({ code, display, diagnosisType })),
      commandCode: `DISCHARGE-DIAGNOSIS-${crypto.randomUUID()}`,
    }),
    onSuccess: async (value) => {
      setDiagnoses(value.diagnoses)
      await readiness.refetch()
    },
  })
  const discharge = useMutation({ mutationFn: () => api.inpatient.discharge(episode.id, {
    expectedRevision: episode.revision, dispositionCode: disposition, note: note.trim() || undefined,
    commandCode: `DISCHARGE-${crypto.randomUUID()}`,
  }), onSuccess })
  const primaryDiagnosis = diagnoses.find((value) => value.diagnosisType === 'PRIMARY')
  const ready = readiness.data?.ready === true
  const addDiagnosis = (code: string, display: string) => {
    if (diagnoses.some((value) => value.code.toUpperCase() === code.toUpperCase())) return
    setDiagnoses((current) => [...current, {
      diagnosisStage: 'DISCHARGE', code, display,
      diagnosisType: current.some((value) => value.diagnosisType === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY',
    }])
  }
  return <Dialog title="办理出院" eyebrow={`${episode.residentName} · ${episode.episodeNo}`} size="wide"
    closeOnBackdrop={false} onClose={onClose}
    description="先完成医嘱收口、出院记录签署和结构化出院诊断；临床条件满足后释放床位，欠费仅提示、不阻断医疗出院。"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={discharge.isPending}
      disabled={!ready} title={ready ? '确认临床出院' : '请先处理出院门禁项'}
      onClick={() => discharge.mutate()}>确认出院</Button></>}>
    {(readiness.error || saveDiagnoses.error || discharge.error) && <Alert>
      {errorMessage(readiness.error || saveDiagnoses.error || discharge.error)}</Alert>}
    {readiness.isPending ? <LoadingState label="正在核对出院条件…" /> : readiness.data && <section
      className={`inpatient-discharge-readiness ${ready ? 'is-ready' : 'is-blocked'}`}>
      <header><div><span>出院门禁</span><strong>{ready ? '临床条件已满足' : `还有 ${readiness.data.blockers.length} 项待处理`}</strong></div>
        <StatusBadge tone={ready ? 'success' : 'warning'}>{ready ? '可以出院' : '暂不可出院'}</StatusBadge></header>
      <div className="inpatient-discharge-checks">
        <span className={readiness.data.openLongTermOrderCount === 0 ? 'is-ready' : ''}>医嘱收口
          <small>{readiness.data.openLongTermOrderCount ? `${readiness.data.openLongTermOrderCount} 条长期医嘱未停止` : '长期医嘱已停止'}</small></span>
        <span className={readiness.data.incompleteTemporaryOrderCount === 0 && readiness.data.pendingTaskCount === 0 ? 'is-ready' : ''}>执行完成
          <small>{readiness.data.incompleteTemporaryOrderCount + readiness.data.pendingTaskCount
            ? `${readiness.data.incompleteTemporaryOrderCount} 条临时医嘱、${readiness.data.pendingTaskCount} 个任务待处理` : '临时医嘱及任务已完成'}</small></span>
        {readiness.data.requiredDocuments.map((document) => <span key={document.documentType}
          className={document.satisfied ? 'is-ready' : ''}>{document.title}
          <small>{document.satisfied ? '已签署' : '请在下方住院病历中完成并签署'}</small></span>)}
        <span className={primaryDiagnosis ? 'is-ready' : ''}>主要出院诊断
          <small>{primaryDiagnosis?.display ?? '请录入一条主要诊断'}</small></span>
      </div>
      {!ready && readiness.data.blockers.length > 0 && <ul>{readiness.data.blockers.map((blocker) =>
        <li key={blocker.code}>{blocker.message}</li>)}</ul>}
    </section>}
    <section className="inpatient-discharge-diagnoses"><header><div><span>结构化出院诊断</span>
      <strong>{diagnoses.length ? `${diagnoses.length} 条` : '尚未录入'}</strong></div>
      <Button size="sm" variant="secondary" busy={saveDiagnoses.isPending}
        disabled={!primaryDiagnosis || diagnoses.length === 0} onClick={() => saveDiagnoses.mutate()}>保存诊断</Button></header>
      <form onSubmit={(event) => { event.preventDefault(); setDiagnosisSearch(diagnosisQuery.trim()) }}>
        <input aria-label="搜索出院诊断" value={diagnosisQuery} onChange={(event) => setDiagnosisQuery(event.target.value)}
          placeholder="输入疾病名称、ICD 编码或拼音码" /><Button type="submit" size="sm" variant="secondary"
          disabled={diagnosisQuery.trim().length < 2}>查询</Button>
      </form>
      {diseaseResults.data && <div className="inpatient-disease-results">{diseaseResults.data.slice(0, 8).map((disease) =>
        <button type="button" key={disease.id} onClick={() => addDiagnosis(disease.code, disease.display)}>
          <strong>{disease.display}</strong><small>{disease.code} · {disease.systemName}</small></button>)}</div>}
      <div className="inpatient-selected-diagnoses">{diagnoses.map((diagnosis) => <article key={diagnosis.code}>
        <span><StatusBadge tone={diagnosis.diagnosisType === 'PRIMARY' ? 'info' : 'neutral'}>
          {diagnosis.diagnosisType === 'PRIMARY' ? '主要' : '次要'}</StatusBadge><strong>{diagnosis.display}</strong>
          <small>{diagnosis.code}</small></span><div>{diagnosis.diagnosisType !== 'PRIMARY' && <Button size="sm" variant="text"
            onClick={() => setDiagnoses((current) => current.map((value) => ({ ...value,
              diagnosisType: value.code === diagnosis.code ? 'PRIMARY' : value.diagnosisType === 'PRIMARY' ? 'SECONDARY' : value.diagnosisType })))}>
              设为主要</Button>}<Button size="sm" variant="text" onClick={() => setDiagnoses((current) =>
                current.filter((value) => value.code !== diagnosis.code))}>移除</Button></div></article>)}</div>
    </section>
    <div className="inpatient-form-grid"><FormField label="出院转归"><select value={disposition}
      onChange={(event) => setDisposition(event.target.value as typeof disposition)}><option value="HOME">回家</option>
      <option value="TRANSFER">转院</option><option value="DEATH">死亡</option><option value="OTHER">其他</option></select></FormField>
      <FormField label="出院说明" className="is-wide"><textarea rows={3} value={note}
        placeholder="病情、用药和随访交代" onChange={(event) => setNote(event.target.value)} /></FormField></div>
  </Dialog>
}

function nursingLevelText(value?: string) {
  return ({ SPECIAL: '特级护理', LEVEL_I: '一级护理', LEVEL_II: '二级护理', LEVEL_III: '三级护理' } as Record<string, string>)[value ?? ''] ?? '未登记'
}

function admissionSourceText(value?: string) {
  return ({ OUTPATIENT: '门诊建议入院', EMERGENCY: '急诊入院', REFERRAL: '转诊入院', DIRECT: '直接入院' } as Record<string, string>)[value ?? ''] ?? '未登记'
}

function admissionTypeText(value?: string) {
  return ({ GENERAL: '一般入院', EMERGENCY: '急诊入院', TRANSFER: '转院入院' } as Record<string, string>)[value ?? ''] ?? '未登记'
}

function admissionMethodText(value?: string) {
  return ({ WALKING: '步行', WHEELCHAIR: '轮椅', STRETCHER: '平车', AMBULANCE: '救护车' } as Record<string, string>)[value ?? ''] ?? '未登记'
}

function conditionText(value?: string) {
  return ({ GENERAL: '一般', URGENT: '急', CRITICAL: '危重' } as Record<string, string>)[value ?? ''] ?? '未登记'
}

function paymentMethodText(value?: string) {
  return ({ SELF_PAY: '自费', BASIC_MEDICAL_INSURANCE: '基本医疗保险', COMMERCIAL_INSURANCE: '商业保险', OTHER: '其他' } as Record<string, string>)[value ?? ''] ?? '未登记'
}

function dietText(value?: string) {
  return ({ NORMAL: '普通饮食', SOFT: '软食', LIQUID: '流质', FASTING: '禁食' } as Record<string, string>)[value ?? ''] ?? value ?? '未登记'
}

export default InpatientWorkspace
