import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import { age, formatTime, genderLabel } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { Button, EmptyState, Icon, IconButton, LoadingState, Panel, SearchField, Select, StatusBadge } from '../../shared/ui'
import './inpatient-station.css'

export function useInpatientPatientSelection(api: RhnApi, clinicalContext: ClinicalContext,
  status: 'ACTIVE' | 'ALL' = 'ACTIVE', selectFirst = true) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const handledEncounter = useRef('')
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const bootstrap = useQuery({
    queryKey: ['inpatient-bootstrap', clinicalContext.organization.id, status, submittedKeyword],
    queryFn: () => api.inpatient.bootstrap(status, submittedKeyword),
  })
  const episodes = bootstrap.data?.episodes ?? []
  const selected = episodes.find((value) => value.id === selectedId) ?? (selectFirst ? episodes[0] : undefined)
  const requestedEncounterId = new URLSearchParams(location.search).get('encounterId') ?? ''

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
    if (!selected && selectedId) setSelectedId('')
  }, [selected, selectedId])

  useEffect(() => {
    if (!requestedEncounterId || handledEncounter.current === requestedEncounterId) return
    const requested = episodes.find((value) => value.encounterId === requestedEncounterId)
    if (!requested) return
    handledEncounter.current = requestedEncounterId
    setSelectedId(requested.id)
  }, [episodes, requestedEncounterId])

  useEffect(() => {
    setKeyword('')
    setSubmittedKeyword('')
    setSelectedId('')
    handledEncounter.current = ''
  }, [clinicalContext.organization.id, clinicalContext.department.id])

  const search = (event: FormEvent) => {
    event.preventDefault()
    setSubmittedKeyword(keyword.trim())
  }

  return {
    bootstrap,
    beds: bootstrap.data?.beds ?? [],
    episodes,
    keyword,
    selected,
    selectedId,
    setKeyword,
    setSelectedId,
    search,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['inpatient-bootstrap'] }),
  }
}

export function InpatientPatientContextBar({ title, episodes, selected, selectedId, keyword, loading,
  onKeywordChange, onSearch, onSelect }: {
  title: string
  episodes: InpatientEpisode[]
  selected?: InpatientEpisode
  selectedId: string
  keyword: string
  loading: boolean
  onKeywordChange: (value: string) => void
  onSearch: (event: FormEvent) => void
  onSelect: (value: string) => void
}) {
  return <Panel className="inpatient-station-context" aria-label={`${title}患者上下文`}>
    <form onSubmit={onSearch} className="inpatient-station-context__search">
      <div className="inpatient-station-context__lookup">
        <SearchField label="搜索在院患者" value={keyword} onChange={onKeywordChange}
          placeholder="姓名 / 住院号 / 床号" />
        <Button type="submit" size="sm" variant="secondary">查询</Button>
      </div>
      {episodes.length > 0 && <div className="inpatient-station-context__picker"><span>当前患者</span>
        <Select aria-label="当前在院患者" value={selectedId || selected?.id} clearable={false}
          options={episodes.map((episode) => ({
            value: episode.id,
            label: `${bedLabel(episode.bedNo)} · ${episode.residentName}`,
            secondaryText: episode.episodeNo,
            searchKeywords: [episode.residentName, episode.episodeNo, episode.bedNo ?? ''],
          }))} onChange={onSelect} />
      </div>}
    </form>
    {loading ? <LoadingState label="正在加载在院患者…" /> : episodes.length === 0
      ? <EmptyState icon="clinical" title="当前没有在院患者" copy="完成入院登记后，患者会进入对应业务工作台。" />
      : selected && <div className="inpatient-station-context__summary">
        <span><strong>{selected.residentName}</strong><small>{genderLabel(selected.gender)} · {
          selected.birthDate ? `${age(selected.birthDate)}岁` : '年龄未知'}</small></span>
        <span><b>{selected.bedNo ?? '未分床'}</b><small>{selected.wardName ?? selected.departmentName}</small></span>
        <span><b>{selected.episodeNo}</b><small>{formatTime(selected.admittedAt)} 入院</small></span>
        <StatusBadge tone={selected.status === 'ADMITTED' ? 'success' : 'neutral'}>
          {selected.status === 'ADMITTED' ? '在院' : '已出院'}
        </StatusBadge>
      </div>}
  </Panel>
}

export function InpatientPatientPool({ title, description, episodes, keyword, loading, onKeywordChange, onSearch,
  onSelect, summary }: {
  title: string
  description: string
  episodes: InpatientEpisode[]
  keyword: string
  loading: boolean
  onKeywordChange: (value: string) => void
  onSearch: (event: FormEvent) => void
  onSelect: (value: string) => void
  summary?: ReactNode
}) {
  const [view, setView] = useState<'GRID' | 'LIST'>('GRID')

  return <section className="inpatient-patient-pool" aria-label={title}>
    <header className="inpatient-patient-pool__toolbar">
      <div className="inpatient-patient-pool__heading">
        <span className="ui-eyebrow">患者工作入口</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <form onSubmit={onSearch} className="inpatient-patient-pool__search">
        <SearchField label="搜索在院患者" value={keyword} onChange={onKeywordChange}
          placeholder="住院号 / 床号 / 姓名" />
        <Button type="submit" size="sm" variant="secondary">定位患者</Button>
      </form>
      <div className="inpatient-patient-pool__view" aria-label="患者展示方式">
        <IconButton icon="menu" label="卡片视图" aria-pressed={view === 'GRID'}
          className={view === 'GRID' ? 'is-active' : ''} onClick={() => setView('GRID')} />
        <IconButton icon="tasks" label="列表视图" aria-pressed={view === 'LIST'}
          className={view === 'LIST' ? 'is-active' : ''} onClick={() => setView('LIST')} />
      </div>
    </header>
    {summary && <div className="inpatient-patient-pool__summary">{summary}</div>}
    {loading ? <LoadingState label="正在加载病区患者…" /> : episodes.length === 0
      ? <EmptyState icon="clinical" title="当前没有在院患者" copy="完成入院登记后，患者会进入医生站和护士站。" />
      : <div className={`inpatient-patient-pool__items is-${view.toLowerCase()}`}>
        {episodes.map((episode) => <PatientPoolCard key={episode.id} episode={episode}
          onSelect={() => onSelect(episode.id)} />)}
      </div>}
  </section>
}

export function InpatientStationPatientWorkspace({ title, episodes, selected, selectedId, keyword, loading,
  onKeywordChange, onSearch, onSelect, onBack, actions, children }: {
  title: string
  episodes: InpatientEpisode[]
  selected: InpatientEpisode
  selectedId: string
  keyword: string
  loading: boolean
  onKeywordChange: (value: string) => void
  onSearch: (event: FormEvent) => void
  onSelect: (value: string) => void
  onBack: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  return <section className="inpatient-station-workspace" aria-label={`${title}患者工作区`}>
    <aside className="inpatient-patient-rail" aria-label="在院患者列表">
      <header>
        <div><span className="ui-eyebrow">患者选择</span><strong>{episodes.length} 位在院</strong></div>
        <IconButton icon="menu" label="返回患者池" onClick={onBack} />
      </header>
      <form onSubmit={onSearch}>
        <SearchField label="筛选在院患者" value={keyword} onChange={onKeywordChange}
          placeholder="床号 / 姓名" />
      </form>
      {loading ? <LoadingState label="加载患者…" /> : <nav>
        {episodes.map((episode) => <button key={episode.id} type="button"
          className={episode.id === selectedId ? 'is-active' : ''}
          aria-current={episode.id === selectedId ? 'true' : undefined}
          onClick={() => onSelect(episode.id)}>
          <strong>{bedLabel(episode.bedNo)}</strong>
          <span>{episode.residentName}</span>
          {episode.conditionCode && episode.conditionCode !== 'GENERAL'
            && <small className={`is-${episode.conditionCode.toLowerCase()}`}>{conditionLabel(episode.conditionCode)}</small>}
        </button>)}
      </nav>}
    </aside>
    <div className="inpatient-station-workspace__main">
      <PatientContextHeader episode={selected} actions={actions} onBack={onBack} />
      <div className="inpatient-station-workspace__content">{children}</div>
    </div>
  </section>
}

function PatientPoolCard({ episode, onSelect }: { episode: InpatientEpisode; onSelect: () => void }) {
  const care = nursingLevelLabel(episode.nursingLevelCode)
  const condition = episode.conditionCode && episode.conditionCode !== 'GENERAL'
    ? conditionLabel(episode.conditionCode) : ''
  return <button type="button" className={`inpatient-patient-card is-${episode.conditionCode?.toLowerCase() ?? 'general'}`}
    onClick={onSelect} aria-label={`进入${bedLabel(episode.bedNo)}${episode.residentName}的住院工作区`}>
    <span className="inpatient-patient-card__identity">
      <span className="inpatient-patient-card__avatar"><Icon name="user" /></span>
      <span><strong>{episode.residentName}</strong><small>{genderLabel(episode.gender)} · {
        episode.birthDate ? `${age(episode.birthDate)}岁` : '年龄未知'}</small></span>
      <b>{bedLabel(episode.bedNo)}</b>
    </span>
    <span className="inpatient-patient-card__facts">
      <span><small>住院号</small><b>{episode.episodeNo}</b></span>
      <span><small>入院</small><b>{formatDate(episode.admittedAt)} · 第{inpatientDay(episode.admittedAt)}天</b></span>
      <span><small>病区</small><b>{episode.wardName ?? episode.departmentName}</b></span>
      <span><small>入院原因</small><b>{episode.admissionReason || '未登记'}</b></span>
    </span>
    <span className="inpatient-patient-card__footer">
      <span>{care}</span>
      <span className="inpatient-patient-card__badges">
        {condition && <StatusBadge tone={episode.conditionCode === 'CRITICAL' ? 'danger' : 'warning'}>{condition}</StatusBadge>}
        {['SPECIAL', 'LEVEL_I'].includes(episode.nursingLevelCode ?? '') && <StatusBadge tone="info">重点护理</StatusBadge>}
      </span>
    </span>
  </button>
}

function PatientContextHeader({ episode, actions, onBack }: {
  episode: InpatientEpisode
  actions?: ReactNode
  onBack: () => void
}) {
  return <header className="inpatient-patient-context">
    <button type="button" className="inpatient-patient-context__back" onClick={onBack}>
      <Icon name="arrow-left" />患者池
    </button>
    <span className="inpatient-patient-context__avatar"><Icon name="user" /></span>
    <div className="inpatient-patient-context__identity">
      <span><h2>{episode.residentName}</h2><small>{genderLabel(episode.gender)} · {
        episode.birthDate ? `${age(episode.birthDate)}岁` : '年龄未知'}</small></span>
      <div className="inpatient-patient-context__badges">
        <StatusBadge tone="info">{paymentLabel(episode.paymentMethodCode)}</StatusBadge>
        {episode.conditionCode && episode.conditionCode !== 'GENERAL'
          && <StatusBadge tone={episode.conditionCode === 'CRITICAL' ? 'danger' : 'warning'}>
            {conditionLabel(episode.conditionCode)}
          </StatusBadge>}
        <StatusBadge tone="neutral">{nursingLevelLabel(episode.nursingLevelCode)}</StatusBadge>
      </div>
    </div>
    <dl className="inpatient-patient-context__facts">
      <div><dt>住院号</dt><dd>{episode.episodeNo}</dd></div>
      <div><dt>床位</dt><dd>{bedLabel(episode.bedNo)}</dd></div>
      <div><dt>病区</dt><dd>{episode.wardName ?? episode.departmentName}</dd></div>
      <div><dt>入院时间</dt><dd>{formatTime(episode.admittedAt)}</dd></div>
    </dl>
    {actions && <div className="inpatient-patient-context__actions">{actions}</div>}
  </header>
}

function bedLabel(value?: string) {
  if (!value) return '未分床'
  return value.endsWith('床') ? value : `${value}床`
}

function nursingLevelLabel(value?: string) {
  const labels: Record<string, string> = {
    SPECIAL: '特级护理', LEVEL_I: '一级护理', LEVEL_II: '二级护理', LEVEL_III: '三级护理',
  }
  return labels[value ?? ''] ?? '护理级别未登记'
}

function conditionLabel(value: NonNullable<InpatientEpisode['conditionCode']>) {
  return ({ GENERAL: '一般', URGENT: '急症', CRITICAL: '危重' } as const)[value]
}

function paymentLabel(value?: InpatientEpisode['paymentMethodCode']) {
  const labels: Record<NonNullable<InpatientEpisode['paymentMethodCode']>, string> = {
    SELF_PAY: '自费', BASIC_MEDICAL_INSURANCE: '基本医保', COMMERCIAL_INSURANCE: '商业保险', OTHER: '其他支付',
  }
  return labels[value ?? 'SELF_PAY']
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function inpatientDay(value: string) {
  return Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000) + 1)
}
