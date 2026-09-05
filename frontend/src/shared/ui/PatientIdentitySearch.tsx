import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { age, genderLabel } from '../format'
import type { Resident } from '../model'
import { Icon, type IconName } from './Icon'

export type PatientIdentityMethodId = 'CARD' | 'FACE' | 'ELECTRONIC_CREDENTIAL' | string

export interface PatientIdentityMethod {
  id: PatientIdentityMethodId
  label: string
  icon?: IconName
  description?: string
  unavailableReason?: string
  identify?: () => Promise<Resident | null>
}

export interface PatientIdentitySearchProps {
  search: (query: string) => Promise<Resident[]>
  queryKey: string
  selected?: Resident | null
  onSelect: (resident: Resident) => void
  onClear?: () => void
  methods?: PatientIdentityMethod[]
  placeholder?: string
  emptyTitle?: string
  emptyCopy?: string
  minimumQueryLength?: number
  autoFocus?: boolean
  disabled?: boolean
  compact?: boolean
  showInitialEmpty?: boolean
  showSelectedSummary?: boolean
  hideResultsWhenSelected?: boolean
  className?: string
  getOptionDisabledReason?: (resident: Resident) => string | undefined
  inputRef?: React.Ref<HTMLInputElement>
}

export const unavailablePatientIdentityMethods: PatientIdentityMethod[] = [
  { id: 'CARD', label: '读卡', icon: 'card', unavailableReason: '读卡设备接口尚未配置' },
  { id: 'FACE', label: '人脸', icon: 'face', unavailableReason: '人脸识别接口尚未配置' },
  { id: 'ELECTRONIC_CREDENTIAL', label: '电子凭证', icon: 'credential', unavailableReason: '电子凭证接口尚未配置' },
]

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return '患者识别失败，请稍后重试'
}

function uniqueIdentityKind(query: string) {
  if (/^\d{17}[\dXx]$/.test(query) || /^\d{15}$/.test(query)) return '身份证'
  if (/^(?=.*\d)[A-Za-z0-9-]{8,}$/.test(query)) return '证件号或卡号'
  return null
}

export function PatientIdentitySearch({
  search,
  queryKey,
  selected,
  onSelect,
  onClear,
  methods = unavailablePatientIdentityMethods,
  placeholder = '输入姓名、身份证、卡号或健康档案号',
  emptyTitle = '查找患者',
  emptyCopy = '输入姓名等要素后，从候选列表中确认患者。',
  minimumQueryLength = 2,
  autoFocus = false,
  disabled = false,
  compact = false,
  showInitialEmpty = true,
  showSelectedSummary = true,
  hideResultsWhenSelected = false,
  className = '',
  getOptionDisabledReason,
  inputRef,
}: PatientIdentitySearchProps) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [lookupKind, setLookupKind] = useState<string | null>(null)
  const [autoResolvedQuery, setAutoResolvedQuery] = useState('')
  const [methodBusy, setMethodBusy] = useState('')
  const [methodError, setMethodError] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const normalized = query.trim()
  const residents = useQuery({
    queryKey: ['patient-identity-search', queryKey, submitted],
    queryFn: () => search(submitted),
    enabled: submitted.length >= minimumQueryLength,
  })
  const candidates = residents.data ?? []
  const availableMethods = methods.filter((method) => Boolean(method.identify))
  const selectableCandidates = useMemo(() => candidates.filter((resident) =>
    !getOptionDisabledReason?.(resident)), [candidates, getOptionDisabledReason])

  useEffect(() => {
    setActiveIndex(0)
  }, [submitted, candidates.length])

  useEffect(() => {
    if (!lookupKind || !submitted || residents.isFetching || selectableCandidates.length !== 1) return
    const match = selectableCandidates[0]
    if (selected?.id !== match.id) onSelect(match)
    setAutoResolvedQuery(submitted)
  }, [lookupKind, onSelect, residents.isFetching, selectableCandidates, selected?.id, submitted])

  function submit() {
    if (normalized.length < minimumQueryLength) return
    setLookupKind(uniqueIdentityKind(normalized))
    setAutoResolvedQuery('')
    setMethodError('')
    setSubmitted(normalized)
    setActiveIndex(0)
  }

  async function identify(method: PatientIdentityMethod) {
    if (!method.identify || disabled) return
    setMethodBusy(method.id)
    setMethodError('')
    try {
      const resident = await method.identify()
      if (!resident) {
        setMethodError(`${method.label}未识别到有效患者记录`)
        return
      }
      const disabledReason = getOptionDisabledReason?.(resident)
      if (disabledReason) {
        setMethodError(`${resident.fullName}：${disabledReason}`)
        return
      }
      setQuery('')
      setSubmitted('')
      setLookupKind(method.label)
      setAutoResolvedQuery(method.id)
      onSelect(resident)
    } catch (error) {
      setMethodError(errorText(error))
    } finally {
      setMethodBusy('')
    }
  }

  const showCandidates = submitted && autoResolvedQuery !== submitted && !residents.isFetching
    && !(hideResultsWhenSelected && selected)
  const hasDuplicateUniqueMatches = Boolean(lookupKind && candidates.length > 1)

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (showCandidates && selectableCandidates.length > 0) {
        setActiveIndex((prev) => (prev + 1) % selectableCandidates.length)
      } else if (normalized.length >= minimumQueryLength) {
        submit()
      }
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (showCandidates && selectableCandidates.length > 0) {
        setActiveIndex((prev) => (prev - 1 + selectableCandidates.length) % selectableCandidates.length)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (showCandidates && selectableCandidates.length > 0 && query.trim() === submitted) {
        const target = selectableCandidates[activeIndex >= 0 && activeIndex < selectableCandidates.length ? activeIndex : 0]
        if (target) {
          onSelect(target)
          return
        }
      }
      submit()
      return
    }

    if (event.key === 'Escape') {
      if (showCandidates) {
        event.preventDefault()
        setSubmitted('')
        setAutoResolvedQuery('')
      }
    }
  }

  return <div className={`ui-patient-search ${compact ? 'is-compact' : ''} ${className}`}>
    <div className="ui-patient-search__toolbar">
      {availableMethods.length > 0 && <div className="ui-patient-search__methods" aria-label="患者识别方式">
        {availableMethods.map((method) => {
        const busy = methodBusy === method.id
        return <button key={method.id} type="button" disabled={disabled || Boolean(methodBusy)}
          title={method.description} onClick={() => void identify(method)}>
          <Icon name={method.icon ?? 'residents'} /><strong>{method.label}</strong>
          <small>{busy ? '识别中…' : '识别'}</small>
        </button>
        })}
      </div>}

      <div className="ui-patient-search__form">
        <Icon name="search" />
        <label className="visually-hidden" htmlFor={`${queryKey}-patient-search`}>患者姓名、证件或卡号</label>
        <input ref={inputRef} id={`${queryKey}-patient-search`} value={query} disabled={disabled} autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)} placeholder={placeholder}
          onKeyDown={handleInputKeyDown} />
        <button className="ui-button ui-button--secondary ui-button--sm" type="button" onClick={submit}
          disabled={disabled || normalized.length < minimumQueryLength || residents.isFetching}>
          <span className="ui-button__label">{residents.isFetching ? '查询中…' : '查询'}</span>
        </button>
      </div>
    </div>

    {normalized.length > 0 && normalized.length < minimumQueryLength && <p className="ui-patient-search__message is-error" role="alert">
      至少输入 {minimumQueryLength} 个字符
    </p>}
    {(methodError || residents.error) && <p className="ui-patient-search__message is-error" role="alert">
      {methodError || errorText(residents.error)}
    </p>}

    {selected && showSelectedSummary && <div className="ui-patient-search__selected" aria-live="polite">
      <span className={`resident-avatar ${selected.gender.toLowerCase()}`}>{selected.fullName.slice(-1)}</span>
      <div><small>{autoResolvedQuery ? `${lookupKind || '唯一身份'}识别并自动回填` : '已确认患者'}</small>
        <strong>{selected.fullName}</strong><span>{genderLabel(selected.gender)} · {age(selected.birthDate)} 岁 · 档案号: {selected.healthRecordNo}{selected.maskedNationalId ? ` · 身份证: ${selected.maskedNationalId}` : ''}</span></div>
      <span className="ui-badge ui-badge--success"><Icon name="check" />已回填</span>
      {onClear && <button type="button" className="ui-patient-search__clear" disabled={disabled}
        onClick={() => { setAutoResolvedQuery(''); onClear() }}>重新选择</button>}
    </div>}

    {residents.isFetching && <div className="ui-patient-search__loading" role="status">
      <span className="ui-spinner" aria-hidden="true" />正在检索患者…
    </div>}
    {hasDuplicateUniqueMatches && showCandidates && <p className="ui-patient-search__message is-warning">
      该唯一标识返回多条记录，请人工确认并检查主索引数据。
    </p>}
    {showCandidates && (candidates.length ? <div className="ui-patient-search__results" aria-label="患者候选列表">
      <header>
        <strong>请选择并确认患者</strong>
        <span>{candidates.length} 条候选记录</span>
      </header>
      <div>{candidates.map((resident) => {
        const disabledReason = getOptionDisabledReason?.(resident)
        const selectableIdx = selectableCandidates.findIndex((r) => r.id === resident.id)
        const isFocused = selectableIdx >= 0 && selectableIdx === activeIndex
        return <button key={resident.id} type="button" disabled={disabled || Boolean(disabledReason)}
          className={`${selected?.id === resident.id ? 'is-selected' : ''} ${isFocused ? 'is-keyboard-focused' : ''}`}
          aria-selected={isFocused}
          onMouseEnter={() => { if (selectableIdx >= 0) setActiveIndex(selectableIdx) }}
          onClick={() => onSelect(resident)}>
          <span className={`resident-avatar ${resident.gender.toLowerCase()}`}>{resident.fullName.slice(-1)}</span>
          <span>
            <span className="ui-patient-search__candidate-title">
              <strong>{resident.fullName}</strong>
              <small>{genderLabel(resident.gender)} · {age(resident.birthDate)} 岁</small>
            </span>
            <span className="ui-patient-search__candidate-meta">
              <small>档案号: {resident.healthRecordNo}</small>
              <small>身份证: {resident.maskedNationalId || '未登记'}</small>
            </span>
          </span>
          {disabledReason ? <small className="ui-patient-search__disabled-reason">{disabledReason}</small>
            : <Icon name={selected?.id === resident.id ? 'check' : 'chevron-right'} />}
        </button>
      })}</div>
    </div> : <div className="ui-patient-search__empty"><Icon name="residents" /><div><strong>{emptyTitle}</strong><span>未找到匹配记录，可核对条件后重试。</span></div></div>)}
    {showInitialEmpty && !submitted && !selected && <div className="ui-patient-search__empty"><Icon name="residents" /><div>
      <strong>{emptyTitle}</strong><span>{emptyCopy}</span></div></div>}
  </div>
}
