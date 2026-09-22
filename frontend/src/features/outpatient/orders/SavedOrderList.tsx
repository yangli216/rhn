import { Fragment, type ReactNode } from 'react'
import type { MedicationRequest, Prescription, ServiceRequest } from '../../../shared/api/encountersApi'
import type { SkinTestWorkItem } from '../../../shared/api/treatmentApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { OrderDocumentInlineEditor, documentMissing, type OrderDocument } from '../OrderDocuments'
import { canPrintPrescription } from './dispensableOptions'
import { resolveExecutingDepartment } from './orderPresentation'
import { extractSpecialMethod, parseHerbalInstruction } from './herbalInstructions'
import { HerbalFormulaHeaderBar } from './HerbalFormulaHeaderBar'
import { HerbalPrescriptionMatrix } from './HerbalPrescriptionMatrix'
import { OrderDocumentGroupHeader } from './OrderDocumentGroupHeader'
import { MedicationReadRow, ServiceReadRow } from './OrderReadRows'
import type { SavedOrderEntry, DraftOrderEntry } from './orderEntries'
import type { GroupingComposerTarget } from './orderListTypes'

export function SavedOrderList({ savedEntries, draftEntries, allDocuments, prescriptions,
  documentRows, activeDocKey, handleSelectDoc, onSavedDocument, encounter, api, readOnly, busy,
  documentEditing, currentDept, onCancelService, onPrintService, onCancelMedication, onPrint,
  skinTestByRequest, groupingComposerTarget, groupingSession, isComposerActive, composer }: {
  savedEntries: SavedOrderEntry[]
  draftEntries: DraftOrderEntry[]
  allDocuments: OrderDocument[]
  prescriptions: Prescription[]
  documentRows: Record<string, { key: string; label: string; selected: boolean }>
  activeDocKey: string | null
  handleSelectDoc: (key: string | null) => void
  onSavedDocument?: () => Promise<unknown>
  encounter: Encounter
  api: RhnApi
  readOnly: boolean
  busy: boolean
  documentEditing: boolean
  currentDept: string
  onCancelService: (value: ServiceRequest) => void
  onPrintService: (value: ServiceRequest) => void
  onCancelMedication: (value: MedicationRequest) => void
  onPrint: (value: Prescription) => void
  skinTestByRequest: Map<string, SkinTestWorkItem>
  groupingComposerTarget: GroupingComposerTarget
  groupingSession: { groupKey: string } | null
  isComposerActive: boolean
  composer: ReactNode
}) {
  return <>{savedEntries.map((entry, index) => {
        const getEntryDocKey = (e: typeof entry) =>
          e.kind === 'service' ? `service:${e.value.id}` : `prescription:${(e.value as MedicationRequest).prescriptionId || e.value.id}`
        const entryDocKey = getEntryDocKey(entry)
        const prevDocKey = index > 0 ? getEntryDocKey(savedEntries[index - 1]) : null
        const isFirstInDocGroup = entryDocKey !== prevDocKey

        const doc = allDocuments.find((d) => d.key === entryDocKey)
        const docItems = savedEntries.filter((e) => getEntryDocKey(e) === entryDocKey)

        const isHerbal = entry.kind === 'medication' && (
          entry.value.medicationType === 'HERBAL' ||
          prescriptions.find((p) => p.id === entry.value.prescriptionId)?.categoryCode === 'HERBAL'
        )

        let headerNode: React.ReactNode = null
        if (isFirstInDocGroup) {
          if (entry.kind === 'service') {
            const svc = entry.value as ServiceRequest
            const groupKind = svc.serviceType === 'LABORATORY' ? 'lab' : svc.serviceType === 'EXAMINATION' ? 'exam' : 'treatment'
            const defaultTitle = groupKind === 'lab' ? '检验申请' : groupKind === 'exam' ? '检查申请' : '治疗单'
            const title = doc?.label || defaultTitle
            const docLabel = (docItems[0] && documentRows[docItems[0].value.id]?.label) || doc?.shortLabel || doc?.label || title
            const subtotal = (svc.unitPrice || 0) * (svc.quantity || 1)
            const missingFields = doc ? documentMissing(doc) : []
            headerNode = (
              <Fragment key={`doc-group-${entryDocKey}`}>
                <OrderDocumentGroupHeader
                  title={title}
                  docLabel={docLabel}
                  kind={groupKind}
                  itemCount={docItems.length}
                  itemUnit="项"
                  dept={resolveExecutingDepartment({ kind: 'service', type: svc.serviceType, itemName: svc.itemName }, currentDept)}
                  subtotal={subtotal}
                  missingFields={missingFields}
                  isSelected={activeDocKey === entryDocKey || Boolean(documentRows[svc.id]?.selected)}
                  isEditing={activeDocKey === entryDocKey}
                  onToggleEdit={() => handleSelectDoc(activeDocKey === entryDocKey ? null : entryDocKey)}
                  canPrint={svc.status === 'ACTIVE'}
                  onPrint={() => onPrintService(svc)}
                  canCancel={svc.status !== 'CANCELLED'}
                  onCancel={() => onCancelService(svc)}
                />
                {activeDocKey === entryDocKey && doc && (
                  <OrderDocumentInlineEditor
                    document={doc}
                    encounter={encounter}
                    api={api}
                    readOnly={readOnly}
                    onSaved={async () => {
                      if (onSavedDocument) await onSavedDocument()
                      handleSelectDoc(null)
                    }}
                    onClose={() => handleSelectDoc(null)}
                  />
                )}
              </Fragment>
            )
          } else {
            const rx = prescriptions.find((p) => p.id === entry.value.prescriptionId)
            const groupKind = isHerbal ? 'herbal' : rx?.categoryCode === 'CHINESE_PATENT' ? 'patent' : 'western'
            const defaultTitle = isHerbal ? '中药处方' : rx?.categoryCode === 'CHINESE_PATENT' ? '中成药处方' : '西药处方'
            const title = doc?.label || defaultTitle
            const docLabel = (docItems[0] && documentRows[docItems[0].value.id]?.label) || doc?.shortLabel || doc?.label || title
            const subtotal = docItems.reduce((sum, e) => sum + (e.value.unitPrice || 0) * (e.value.quantity || 1), 0)
            const missingFields = doc ? documentMissing(doc) : []
            const firstActive = rx?.medicationRequests.find((v) => v.status === 'ACTIVE')
            const firstMed = docItems[0]?.value as MedicationRequest | undefined
            const parsed = isHerbal && firstMed ? parseHerbalInstruction(firstMed.medicationInstruction) : undefined
            headerNode = (
              <Fragment key={`doc-group-${entryDocKey}`}>
                <OrderDocumentGroupHeader
                  title={title}
                  docLabel={docLabel}
                  kind={groupKind}
                  itemCount={docItems.length}
                  itemUnit={isHerbal ? '味' : '项'}
                  dept={isHerbal ? '中药房' : rx?.categoryCode === 'CHINESE_PATENT' ? '中成药房' : '西药房'}
                  subtotal={subtotal}
                  missingFields={missingFields}
                  isSelected={activeDocKey === entryDocKey || docItems.some((e) => documentRows[e.value.id]?.selected)}
                  isEditing={activeDocKey === entryDocKey}
                  onToggleEdit={() => handleSelectDoc(activeDocKey === entryDocKey ? null : entryDocKey)}
                  canPrint={Boolean(rx && firstActive && canPrintPrescription(rx))}
                  onPrint={() => rx && onPrint(rx)}
                  canCancel={docItems.some((e) => e.value.status !== 'CANCELLED')}
                  onCancel={() => docItems.forEach((e) => onCancelMedication(e.value as MedicationRequest))}
                >
                  {isHerbal && firstMed && (
                    <HerbalFormulaHeaderBar
                      doseCount={firstMed.durationValue || 7}
                      method={parsed?.method}
                      frequencyCode={firstMed.frequencyCode}
                      instruction={parsed?.instruction}
                      readOnly
                    />
                  )}
                </OrderDocumentGroupHeader>
                {activeDocKey === entryDocKey && doc && (
                  <OrderDocumentInlineEditor
                    document={doc}
                    encounter={encounter}
                    api={api}
                    readOnly={readOnly}
                    onSaved={async () => {
                      if (onSavedDocument) await onSavedDocument()
                      handleSelectDoc(null)
                    }}
                    onClose={() => handleSelectDoc(null)}
                  />
                )}
                {isHerbal && (
                  <HerbalPrescriptionMatrix
                    items={docItems.map((e) => {
                      const m = e.value as MedicationRequest
                      return {
                        id: m.id,
                        name: m.itemName || m.medicationName,
                        doseValue: m.doseValue || 0,
                        doseUnit: m.doseUnit || 'g',
                        price: m.unitPrice,
                        specialMethod: extractSpecialMethod(m.medicationInstruction),
                        isDraft: false,
                        status: m.status,
                      }
                    })}
                    doseCount={firstMed?.durationValue || 7}
                    readOnly={readOnly}
                  />
                )}
              </Fragment>
            )
          }
        }

        if (isHerbal) {
          if (groupingComposerTarget?.type === 'saved' && groupingComposerTarget.index === index) {
            return (
              <Fragment key={`saved-wrap-${entry.value.id}`}>
                {headerNode}
                {composer}
              </Fragment>
            )
          }
          return headerNode
        }

        let rowNode: React.ReactNode
        if (entry.kind === 'service') {
          rowNode = <ServiceReadRow key={`service-${entry.value.id}`} value={entry.value}
            busy={busy || Boolean(documentEditing && documentRows[entry.value.id]?.selected)} readOnly={readOnly} currentDept={currentDept}
            documentLink={documentRows[entry.value.id]} onCancel={() => onCancelService(entry.value)}
            onPrint={entry.value.status === 'ACTIVE' ? () => onPrintService(entry.value) : undefined} />
        } else {
          const prescription = prescriptions.find((value) => value.id === entry.value.prescriptionId)
          const firstLine = prescription?.medicationRequests.find((value) => value.status === 'ACTIVE')?.id === entry.value.id
          const prev = index > 0 ? savedEntries[index - 1] : undefined
          const next = index < savedEntries.length - 1 ? savedEntries[index + 1] : undefined
          const entryGroupId = entry.value.parentRequestId || entry.value.id
          const sameGroupAsPrev = Boolean(
            entry.value.routeExecutionType === 'INFUSION' &&
            prev?.kind === 'medication' &&
            prev.value.routeExecutionType === 'INFUSION' &&
            entryGroupId === (prev.value.parentRequestId || prev.value.id)
          )
          const nextInSaved = Boolean(
            entry.value.routeExecutionType === 'INFUSION' &&
            next?.kind === 'medication' &&
            next.value.routeExecutionType === 'INFUSION' &&
            entryGroupId === (next.value.parentRequestId || next.value.id)
          )
          const isLastSavedInGroup = !savedEntries.slice(index + 1).some(
            (s) => s.kind === 'medication' &&
              s.value.routeExecutionType === 'INFUSION' &&
              (s.value.parentRequestId || s.value.id) === entryGroupId
          )
          const hasDraftsInGroup = draftEntries.some(
            (d) => d.kind === 'medication' &&
              d.value.routeExecutionType === 'INFUSION' &&
              (d.value.parentRequestId || d.value.administrationGroupKey) === entryGroupId
          )
          const nextIsComposerSession = Boolean(
            isLastSavedInGroup &&
            !hasDraftsInGroup &&
            isComposerActive &&
            groupingSession &&
            (groupingSession.groupKey === entry.value.id ||
              groupingSession.groupKey === entry.value.parentRequestId ||
              groupingSession.groupKey === `request:${entry.value.id}` ||
              groupingSession.groupKey === `request:${entry.value.parentRequestId}`)
          )
          const sameGroupAsNext = nextInSaved || hasDraftsInGroup || nextIsComposerSession
          const isHead = !sameGroupAsPrev && sameGroupAsNext
          const isMid = sameGroupAsPrev && sameGroupAsNext
          const isTail = sameGroupAsPrev && !sameGroupAsNext
          rowNode = <MedicationReadRow key={`medication-${entry.value.id}`} value={entry.value} busy={busy || Boolean(documentEditing && documentRows[entry.value.id]?.selected)}
            documentLink={documentRows[entry.value.id]}
            isHead={isHead}
            isMid={isMid}
            isTail={isTail}
            readOnly={readOnly}
            currentDept={currentDept}
            skinTest={skinTestByRequest.get(entry.value.id)}
            onCancel={() => onCancelMedication(entry.value)}
            onPrint={prescription && firstLine && canPrintPrescription(prescription) ? () => onPrint(prescription) : undefined} />
        }
        if (groupingComposerTarget?.type === 'saved' && groupingComposerTarget.index === index) {
          return (
            <Fragment key={`saved-wrap-${entry.value.id}`}>
              {headerNode}
              {rowNode}
              {composer}
            </Fragment>
          )
        }
        return headerNode ? <Fragment key={`saved-frag-${entry.value.id}`}>{headerNode}{rowNode}</Fragment> : rowNode
      })}</>
}
