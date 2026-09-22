import { useEffect, useState } from 'react'
import { Icon } from '../../../shared/ui'
import { IconX } from '@tabler/icons-react'
import { roundNumber, formatDose } from '../../../shared/utils/precision'
import { formatUnitPrice } from './orderPresentation'

export interface HerbalMatrixItem {
  id: string
  name: string
  spec?: string
  doseValue: number
  doseUnit: string
  price?: number
  specialMethod?: string
  isDraft: boolean
  status?: string
}

export const SPECIAL_METHODS = ['先煎', '后下', '包煎', '烊化', '冲服', '另煎']

export function HerbalPrescriptionMatrix({
  items,
  doseCount: _doseCount,
  readOnly,
  isActivelyAdding,
  onRemoveDraft,
  onUpdateDraft,
  onAddMoreHerbs,
}: {
  items: HerbalMatrixItem[]
  doseCount?: number
  readOnly?: boolean
  isActivelyAdding?: boolean
  onRemoveDraft?: (id: string) => void
  onUpdateDraft?: (id: string, updates: { doseValue?: number; specialMethod?: string }) => void
  onAddMoreHerbs?: () => void
}) {
  const [editingHerbId, setEditingHerbId] = useState<string | null>(null)
  const [editDose, setEditDose] = useState<string>('')
  const [activeMethodMenuId, setActiveMethodMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeMethodMenuId) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.doctor-herb-method-wrap')) {
        setActiveMethodMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [activeMethodMenuId])

  const handleSaveDose = (herbId: string) => {
    const val = parseFloat(editDose)
    if (!isNaN(val) && val > 0 && onUpdateDraft) {
      onUpdateDraft(herbId, { doseValue: roundNumber(val, 2) })
    }
    setEditingHerbId(null)
  }

  return (
    <div className="doctor-herbal-matrix-wrap" aria-label="中药饮片方剂药味矩阵">
      <div className="doctor-herbal-grid">
        {items.map((herb) => {
          const isCurrentEditing = editingHerbId === herb.id
          const canEditThisHerb = !readOnly && herb.isDraft && Boolean(onUpdateDraft)

          return (
            <div
              key={herb.id}
              id={`order-${herb.id}`}
              className={`doctor-herb-card${herb.isDraft ? ' is-draft' : ''}${isCurrentEditing ? ' is-editing' : ''}${activeMethodMenuId === herb.id ? ' is-active-menu' : ''}`}
            >
              <div className="doctor-herb-main">
                <strong className="doctor-herb-name" title={herb.name}>{herb.name}</strong>
                <div className={`doctor-herb-method-wrap${!herb.specialMethod ? ' is-empty' : ''}`}>
                  {herb.specialMethod ? (
                    canEditThisHerb ? (
                      <button
                        type="button"
                        className="doctor-herb-decoction-badge is-clickable"
                        title="点击切换或清除特殊煎法"
                        aria-label={`${herb.name} 特殊煎法 ${herb.specialMethod}`}
                        onClick={() => setActiveMethodMenuId(activeMethodMenuId === herb.id ? null : herb.id)}
                      >
                        {herb.specialMethod}
                      </button>
                    ) : (
                      <span className="doctor-herb-decoction-badge">{herb.specialMethod}</span>
                    )
                  ) : (
                    canEditThisHerb && (
                      <button
                        type="button"
                        className="doctor-herb-add-method-btn"
                        title="添加特殊煎法"
                        aria-label={`为 ${herb.name} 添加特殊煎法`}
                        onClick={() => setActiveMethodMenuId(activeMethodMenuId === herb.id ? null : herb.id)}
                      >
                        +煎法
                      </button>
                    )
                  )}

                  {canEditThisHerb && activeMethodMenuId === herb.id && (
                    <div className="doctor-herb-method-menu" role="menu">
                      {herb.specialMethod && (
                        <button
                          type="button"
                          className="doctor-herb-method-item is-clear"
                          onClick={() => {
                            onUpdateDraft?.(herb.id, { specialMethod: '' })
                            setActiveMethodMenuId(null)
                          }}
                        >
                          清除煎法
                        </button>
                      )}
                      {SPECIAL_METHODS.map((method) => (
                        <button
                          key={method}
                          type="button"
                          className={`doctor-herb-method-item${method === herb.specialMethod ? ' is-active' : ''}`}
                          onClick={() => {
                            onUpdateDraft?.(herb.id, { specialMethod: method })
                            setActiveMethodMenuId(null)
                          }}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="doctor-herb-aside">
                {isCurrentEditing ? (
                  <div className="doctor-herb-dose-editor">
                    <input
                      id={`dose-input-${herb.id}`}
                      type="number"
                      min="0"
                      step="0.5"
                      className="doctor-herb-dose-input"
                      autoFocus
                      value={editDose}
                      aria-label={`编辑 ${herb.name} 剂量`}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setEditDose(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveDose(herb.id)
                        } else if (e.key === 'Escape') {
                          setEditingHerbId(null)
                        }
                      }}
                      onBlur={() => handleSaveDose(herb.id)}
                    />
                    <small className="doctor-herb-dose-unit">{herb.doseUnit || 'g'}</small>
                  </div>
                ) : canEditThisHerb ? (
                  <button
                    type="button"
                    className="doctor-herb-dose-btn"
                    title="点击修改剂量"
                    aria-label={`修改 ${herb.name} 剂量 ${formatDose(herb.doseValue)}${herb.doseUnit || 'g'}`}
                    onClick={() => {
                      setEditingHerbId(herb.id)
                      setEditDose(String(herb.doseValue))
                    }}
                  >
                    <span className="doctor-herb-dose">{formatDose(herb.doseValue)}{herb.doseUnit || 'g'}</span>
                  </button>
                ) : (
                  <span className="doctor-herb-dose">{formatDose(herb.doseValue)}{herb.doseUnit || 'g'}</span>
                )}

                {herb.price != null && herb.price > 0 && (
                  <span className="doctor-herb-price">{formatUnitPrice(herb.price, 'CNY')}</span>
                )}
                {!readOnly && herb.isDraft && onRemoveDraft && (
                  <button
                    type="button"
                    className="doctor-herb-remove-btn"
                    title={`移除 ${herb.name}`}
                    aria-label={`移除 ${herb.name}`}
                    onClick={() => onRemoveDraft(herb.id)}
                  >
                    <IconX size={13} stroke={2} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {!readOnly && onAddMoreHerbs && !isActivelyAdding && (
          <button
            type="button"
            className="doctor-herbal-add-chip is-icon-only"
            onClick={onAddMoreHerbs}
            title="继续添加草药"
            aria-label="继续加药"
          >
            <Icon name="add" />
          </button>
        )}
      </div>
    </div>
  )
}
