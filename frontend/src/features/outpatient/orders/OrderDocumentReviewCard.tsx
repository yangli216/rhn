import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import type { Encounter } from '../../../shared/model'
import type { OrderDocumentInfo } from '../../../shared/api/encountersApi'
import { StatusBadge, DataTable, Select, TableShell, Tooltip, IconButton, Button, FormField, tableCellClass } from '../../../shared/ui'
import { IconFlask, IconPill, IconPlant2, IconScan, IconFileText, IconAlertCircle } from '@tabler/icons-react'
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

function supplementaryServiceNote(note?: string, purpose?: string | null) {
  if (!purpose || !note || note === purpose) return ''
  const suffix = ` · ${purpose}`
  return note.endsWith(suffix) ? note.slice(0, -suffix.length) : note
}

const ReviewListContext = createContext(false)

export function OrderDocumentReviewList({ children }: { children: ReactNode }) {
  return <ReviewListContext.Provider value>
    <TableShell className="doctor-review-list" scrollLabel="分单核查清单">
      <DataTable compact className="doctor-review-table" aria-label="分单核查清单">
        <colgroup><col className="doctor-review-name-col" /><col /><col className="doctor-review-quantity-col" /></colgroup>
        <thead><tr><th>药品 / 项目</th><th>用法 / 检查目的</th>
          <th className={tableCellClass('numeric')}>数量</th></tr></thead>
        {children}
      </DataTable>
    </TableShell>
  </ReviewListContext.Provider>
}

export function OrderDocumentReviewCard({
  cardKey,
  title,
  kind,
  deptOrSite,
  ruleReasons,
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
  ruleReasons?: string[]
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
  const inList = useContext(ReviewListContext)
  const [expanded, setExpanded] = useState(false)

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

  const content = <tbody data-card-key={cardKey} aria-label={`${title}单据`}>
    <tr className="doctor-review-document-head"><td colSpan={3}>
      <div className="doctor-review-document-summary">
        <div className="doctor-review-document-identity">
          {renderIcon()}<strong>{title}</strong>
          {ruleReasons && ruleReasons.length > 0 && <Tooltip content={ruleReasons.join('；')}>
            <IconButton icon="info" label="查看分方原因" title="" />
          </Tooltip>}
          <span>{deptOrSite}</span><span>{items.length} 项</span>
        </div>
        <div className="doctor-review-document-diagnoses">
          {info.diagnoses.length ? info.diagnoses.map(diagnosis => diagnosis.display).join('、')
            : hasDiagnoses ? '未关联诊断' : '病历未录入诊断'}
          {isPrescription && info.externalPrescription && <span> · 外配</span>}
          {isPrescription && info.specialDisease && <span> · {info.specialDisease}</span>}
        </div>
        <div className="doctor-review-document-actions">
          {missing.length > 0 && <StatusBadge tone="warning">
            <IconAlertCircle size={12} stroke={2} /> 缺{missing.join('、')}
          </StatusBadge>}
          {!readOnly && <Button size="sm" variant="text" aria-expanded={expanded}
            aria-controls={`${baseId}-editor`} onClick={() => setExpanded(value => !value)}>
            {expanded ? '收起' : missing.length ? '补充' : '修改'}
          </Button>}
        </div>
      </div>
    </td></tr>
    {expanded && !readOnly && <tr><td colSpan={3}>
      <div id={`${baseId}-editor`} className="doctor-review-document-editor">
        <FormField label="关联诊断">
          <Select multiple aria-label="诊断" clearable value={info.diagnoses.map(diagnosis => diagnosis.code)}
            options={diagnosisOptions} placeholder="选择诊断" onChange={changeDiagnoses} />
        </FormField>
        {isPrescription && <>
          <FormField label="门诊特病病种"><input aria-label="门诊特病病种" placeholder="选填"
            value={info.specialDisease || ''} maxLength={120}
            onChange={event => onChangeInfo({ ...info, specialDisease: event.target.value })} /></FormField>
          <label className="doctor-review-external"><input type="checkbox" checked={Boolean(info.externalPrescription)}
            onChange={event => onChangeInfo({ ...info, externalPrescription: event.target.checked })} />外配处方</label>
        </>}
        {requiresExaminationPurpose && <FormField label="检查目的" required>
          <input aria-label="检查目的" aria-required="true" value={info.examinationPurpose || ''} maxLength={500}
            placeholder="填写检查目的" onChange={event => onChangeInfo({ ...info, examinationPurpose: event.target.value })} />
        </FormField>}
      </div>
    </td></tr>}
    {items.map((item, index) => <tr key={item.id ?? index} className={item.isInfusionGroup ? 'is-infusion-row' : ''}>
      <td><strong>{item.name}</strong>
        {(item.manufacturer || item.spec) && <small>{[item.manufacturer, item.spec].filter(Boolean).join(' / ')}</small>}
        {item.isGroupLeader && <span className="doctor-split-group-badge">输液组首药</span>}
      </td>
      <td>{isService ? (info.examinationPurpose || item.note || '—')
        : [item.doseText, item.routeAndFreqText].filter(Boolean).join(' · ') || '—'}
        {isService && supplementaryServiceNote(item.note, info.examinationPurpose)
          && <small>{supplementaryServiceNote(item.note, info.examinationPurpose)}</small>}
        {!isService && supplementaryInstruction(item.routeAndFreqText, item.instruction)
          && <small>{supplementaryInstruction(item.routeAndFreqText, item.instruction)}</small>}
      </td>
      <td className={tableCellClass('numeric')}>{item.quantityText}</td>
    </tr>)}
  </tbody>
  return inList ? content : <OrderDocumentReviewList>{content}</OrderDocumentReviewList>
}
