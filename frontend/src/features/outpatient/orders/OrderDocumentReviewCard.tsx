import { useId } from 'react'
import type { Encounter } from '../../../shared/model'
import type { OrderDocumentInfo } from '../../../shared/api/encountersApi'
import { StatusBadge, DataTable, Select, TableShell } from '../../../shared/ui'
import { IconFlask, IconPill, IconPlant2, IconScan, IconFileText, IconAlertCircle, IconCheck } from '@tabler/icons-react'
import { checkDocumentInfoMissing } from './orderDocumentDefaults'

export interface ReviewItemDisplay {
  id?: string | number
  name: string
  spec?: string
  manufacturer?: string
  doseText?: string
  routeAndFreqText?: string
  instruction?: string
  quantityText: string
  isInfusionGroup?: boolean
  isGroupLeader?: boolean
  note?: string
}

function supplementaryInstruction(routeAndFreqText?: string, instruction?: string) {
  const normalizedRoute = (routeAndFreqText || '').replace(/[\s,，、;；/·]+/g, '').toLowerCase()
  return (instruction || '')
    .split(/[,，、;；/·]+/)
    .map((part) => part.trim())
    .filter((part) => part && !normalizedRoute.includes(part.replace(/\s+/g, '').toLowerCase()))
    .join('；')
}

export function OrderDocumentReviewCard({
  cardKey,
  title,
  kind,
  deptOrSite,
  items,
  info,
  onChangeInfo,
  encounter,
  readOnly = false,
}: {
  cardKey: string
  title: string
  kind: 'western' | 'patent' | 'herbal' | 'lab' | 'exam' | 'treatment'
  deptOrSite?: string
  items: ReviewItemDisplay[]
  info: OrderDocumentInfo
  onChangeInfo: (next: OrderDocumentInfo) => void
  encounter: Encounter
  readOnly?: boolean
}) {
  const isPrescription = ['western', 'patent', 'herbal'].includes(kind)
  const isService = !isPrescription
  const requiresExaminationPurpose = kind === 'lab' || kind === 'exam'
  const missing = checkDocumentInfoMissing(info, requiresExaminationPurpose ? 'service' : 'prescription')
  const baseId = useId()

  const availableDiagnoses = encounter.diagnoses ?? []
  const hasDiagnoses = availableDiagnoses.length > 0
  const diagnosisOptions = availableDiagnoses.map((diagnosis) => ({
    value: diagnosis.code,
    label: diagnosis.display,
    secondaryText: diagnosis.code,
    searchKeywords: [diagnosis.code],
    trailingText: diagnosis.type === 'PRIMARY' ? '主诊断' : undefined,
  }))

  const renderIcon = () => {
    switch (kind) {
      case 'lab':
        return <span className="doctor-group-icon is-lab"><IconFlask size={16} stroke={1.75} /></span>
      case 'exam':
        return <span className="doctor-group-icon is-exam"><IconScan size={16} stroke={1.75} /></span>
      case 'herbal':
        return <span className="doctor-group-icon is-herbal"><IconPlant2 size={16} stroke={1.75} /></span>
      case 'treatment':
        return <span className="doctor-group-icon"><IconFileText size={16} stroke={1.75} /></span>
      case 'patent':
      case 'western':
      default:
        return <span className="doctor-group-icon"><IconPill size={16} stroke={1.75} /></span>
    }
  }

  const changeDiagnoses = (codes: string[]) => {
    if (readOnly) return
    const retainedPrimary = info.diagnoses.find((diagnosis) => diagnosis.primary && codes.includes(diagnosis.code))?.code
    const encounterPrimary = availableDiagnoses.find((diagnosis) => diagnosis.type === 'PRIMARY' && codes.includes(diagnosis.code))?.code
    const primaryCode = retainedPrimary || encounterPrimary || codes[0]
    onChangeInfo({
      ...info,
      diagnoses: codes.flatMap((code) => {
        const diagnosis = availableDiagnoses.find((candidate) => candidate.code === code)
        return diagnosis ? [{ code, display: diagnosis.display, primary: code === primaryCode }] : []
      }),
    })
  }

  return (
    <div className={`doctor-prescription-preview-card ${isService ? 'is-service-card' : ''}`} data-card-key={cardKey}>
      <div className="doctor-prescription-preview-card__head">
        <div className="doctor-prescription-preview-card__title">
          {renderIcon()}
          <strong>{title}</strong>
          {deptOrSite && (
            <span className="doctor-prescription-preview-card__site">
              {deptOrSite}
            </span>
          )}
        </div>
        <div className="doctor-review-card__head-controls">
          {hasDiagnoses ? (
            <Select
              multiple
              className="doctor-review-card__diagnosis-select"
              aria-label="诊断"
              disabled={readOnly}
              clearable={!readOnly}
              value={info.diagnoses.map((diagnosis) => diagnosis.code)}
              options={diagnosisOptions}
              placeholder="选择诊断"
              onChange={changeDiagnoses}
            />
          ) : (
            <span className="doctor-review-card__empty-hint">病历未录入诊断</span>
          )}

          {isPrescription && <>
            <label className="doctor-review-checkbox-label">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Boolean(info.externalPrescription)}
                onChange={(event) => onChangeInfo({ ...info, externalPrescription: event.target.checked })}
              />
              <span>外配</span>
            </label>
            <input
              type="text"
              className="doctor-review-card__text-input"
              aria-label="门诊特病病种"
              disabled={readOnly}
              placeholder="特病病种（选填）"
              value={info.specialDisease || ''}
              maxLength={120}
              onChange={(event) => onChangeInfo({ ...info, specialDisease: event.target.value })}
            />
          </>}

          {requiresExaminationPurpose && <input
            id={`${baseId}-purpose`}
            type="text"
            className={`doctor-review-card__text-input is-purpose ${!info.examinationPurpose?.trim() ? 'is-missing' : ''}`}
            aria-label="检查目的"
            aria-required="true"
            disabled={readOnly}
            placeholder="检查目的（必填）"
            value={info.examinationPurpose || ''}
            maxLength={500}
            onChange={(event) => onChangeInfo({ ...info, examinationPurpose: event.target.value })}
          />}
        </div>
        <div className="doctor-review-card-head-right">
          {missing.length > 0 ? (
            <span title={`待补充：${missing.join('、')}`}>
              <StatusBadge tone="warning">
                <IconAlertCircle size={12} stroke={2} /> 缺{missing.join('、')}
              </StatusBadge>
            </span>
          ) : (
            <span className="doctor-review-card__complete" aria-label="信息齐备" title="信息齐备">
              <IconCheck size={16} stroke={2} />
            </span>
          )}
        </div>
      </div>

      <TableShell>
        <DataTable compact className="doctor-prescription-preview-table">
          <thead>
            <tr>
              <th>{isService ? '项目名称' : '药品名称'}</th>
              {!isService && <th>剂量</th>}
              {!isService && <th>途径/频次</th>}
              <th>数量</th>
              {isService && <th>临床说明</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id ?? idx} className={item.isInfusionGroup ? 'is-infusion-row' : ''}>
                <td>
                  <strong>{item.name}</strong>
                  {(item.manufacturer || item.spec) && <small>
                    {[item.manufacturer, item.spec].filter(Boolean).join(' / ')}
                  </small>}
                  {item.isGroupLeader && <span className="doctor-split-group-badge">输液组首药</span>}
                </td>
                {!isService && <td>{item.doseText || '—'}</td>}
                {!isService && <td>{item.routeAndFreqText || '—'}
                  {supplementaryInstruction(item.routeAndFreqText, item.instruction) && (
                    <small>{supplementaryInstruction(item.routeAndFreqText, item.instruction)}</small>
                  )}
                </td>}
                <td>{item.quantityText}</td>
                {isService && <td>{item.note || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableShell>
    </div>
  )
}
