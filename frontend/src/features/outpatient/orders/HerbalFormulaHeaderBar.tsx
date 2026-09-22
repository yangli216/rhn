import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../shared/ui'

export function HerbalFormulaHeaderBar({
  doseCount = 7,
  method = '水煎服',
  frequencyCode = 'BID',
  instruction,
  frequencyOptions,
  readOnly,
  onUpdateFormula,
  isActivelyAdding,
}: {
  doseCount?: number
  method?: string
  frequencyCode?: string
  instruction?: string
  frequencyOptions?: Array<{ value: string; label: string }>
  readOnly?: boolean
  onUpdateFormula?: (updates: {
    doseCount?: number
    method?: string
    frequencyCode?: string
    instruction?: string
  }) => void
  isActivelyAdding?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [localCount, setLocalCount] = useState<string>(String(doseCount || 7))
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalCount(String(doseCount || 7))
  }, [doseCount])

  const effectiveEditing = Boolean(isActivelyAdding || isEditing)

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (isActivelyAdding) return
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsEditing(false)
    }
  }

  if (!onUpdateFormula || readOnly) {
    return (
      <div className="doctor-formula-inline-bar is-readonly" role="region" aria-label="整方属性">
        <div className="doctor-formula-tags">
          <span className="doctor-formula-tag is-pill"><strong>{doseCount || 7}</strong> 剂</span>
          <span className="doctor-formula-tag">{method || '水煎服'}</span>
          <span className="doctor-formula-tag">{frequencyCode || 'BID'}</span>
          {instruction && <span className="doctor-formula-tag is-inst">嘱托：{instruction}</span>}
        </div>
      </div>
    )
  }

  if (!effectiveEditing) {
    return (
      <div
        ref={containerRef}
        className={`doctor-formula-inline-bar is-reading-mode${isActivelyAdding ? ' is-actively-adding' : ''}`}
        role="region"
        aria-label="整方属性（点击或获得焦点可调整）"
        tabIndex={0}
        onClick={() => setIsEditing(true)}
        onFocus={() => setIsEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsEditing(true)
          }
        }}
        title="点击或按回车调整整方付数、煎服法与频次"
      >
        <div className="doctor-formula-tags">
          <span className="doctor-formula-tag is-pill"><strong>{doseCount || 7}</strong> 剂</span>
          <span className="doctor-formula-tag">{method || '水煎服'}</span>
          <span className="doctor-formula-tag">{frequencyCode || 'BID'}</span>
          {instruction ? (
            <span className="doctor-formula-tag is-inst">嘱托：{instruction}</span>
          ) : null}
          <span className="doctor-formula-edit-hint">点击调整</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`doctor-formula-inline-bar is-editing-mode${isActivelyAdding ? ' is-actively-adding' : ''}`}
      role="region"
      aria-label="整方属性设置"
      onBlur={handleBlur}
    >
      <div className="doctor-formula-field">
        <label htmlFor="formula-dose-count" className="doctor-formula-label">剂数</label>
        <div className="doctor-formula-input-unit">
          <input
            id="formula-dose-count"
            type="number"
            min="1"
            max="99"
            step="1"
            className="doctor-formula-input is-count"
            value={localCount}
            autoFocus={!isActivelyAdding}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setLocalCount(e.target.value)
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val > 0) {
                onUpdateFormula({ doseCount: val })
              }
            }}
            onBlur={() => {
              const val = parseInt(localCount, 10)
              if (isNaN(val) || val <= 0) {
                setLocalCount(String(doseCount || 7))
              }
            }}
            aria-label="整方剂数"
          />
          <span className="doctor-formula-unit">剂</span>
        </div>
      </div>

      <div className="doctor-formula-field">
        <label htmlFor="formula-method" className="doctor-formula-label">煎法</label>
        <select
          id="formula-method"
          className="doctor-formula-select"
          value={method || '水煎服'}
          onChange={(e) => onUpdateFormula({ method: e.target.value })}
          aria-label="整方煎服法"
        >
          <option value="水煎服">水煎服</option>
          <option value="代煎">代煎</option>
          <option value="颗粒冲服">颗粒冲服</option>
          <option value="外用煎洗">外用煎洗</option>
          <option value="另煎兑服">另煎兑服</option>
        </select>
      </div>

      <div className="doctor-formula-field">
        <label htmlFor="formula-freq" className="doctor-formula-label">频次</label>
        <select
          id="formula-freq"
          className="doctor-formula-select is-freq"
          value={frequencyCode || 'BID'}
          onChange={(e) => onUpdateFormula({ frequencyCode: e.target.value })}
          aria-label="整方频次"
        >
          {frequencyOptions && frequencyOptions.length > 0 ? (
            frequencyOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))
          ) : (
            <>
              <option value="BID">每日两次 (BID)</option>
              <option value="TID">每日三次 (TID)</option>
              <option value="QD">每日一次 (QD)</option>
              <option value="Q8H">每8小时一次 (Q8H)</option>
            </>
          )}
        </select>
      </div>

      <div className="doctor-formula-field is-instruction">
        <label htmlFor="formula-instruction" className="doctor-formula-label">嘱托</label>
        <input
          id="formula-instruction"
          type="text"
          className="doctor-formula-input is-instruction"
          placeholder="温服/忌辛辣等"
          value={instruction || ''}
          onChange={(e) => onUpdateFormula({ instruction: e.target.value })}
          aria-label="整方嘱托"
        />
      </div>

      {!isActivelyAdding && (
        <div className="doctor-formula-actions">
          <Button
            size="sm"
            variant="text"
            className="doctor-formula-done-btn"
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(false)
            }}
          >
            完成
          </Button>
        </div>
      )}
    </div>
  )
}
