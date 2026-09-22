import { Fragment, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { ActiveOrderFrequency } from '../../../shared/api/masterDataApi'
import type { SkinTestWorkItem } from '../../../shared/api/treatmentApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { roundNumber } from '../../../shared/utils/precision'
import type { MedicationPlanDraft } from './medicationDraft'
import type { ServicePlanDraft, OrderEntryType } from './orderDraftTypes'
import type { DraftOrderEntry } from './orderEntries'
import type { EditingOrderDraft, GroupingComposerTarget, HerbalComposerFormula } from './orderListTypes'
import { extractSpecialMethod, parseHerbalInstruction, buildHerbalInstruction } from './herbalInstructions'
import { HerbalFormulaHeaderBar } from './HerbalFormulaHeaderBar'
import { HerbalPrescriptionMatrix } from './HerbalPrescriptionMatrix'
import { OrderDocumentGroupHeader } from './OrderDocumentGroupHeader'
import { MedicationDraftEditRow } from './MedicationDraftEditRow'
import { ServiceDraftEditRow } from './ServiceDraftEditRow'
import { MedicationDraftRow, ServiceDraftRow } from './OrderDraftRows'

export function DraftOrderList({ draftEntries, herbalFormula, onHerbalFormulaChange, frequencyOptions,
  routeOptions, administrationGroupOptions, routes, frequencies, readOnly, isComposerActive, entryType, setMedicationDrafts,
  setServiceDrafts, startHerbalGrouping, groupingComposerTarget, composer, editingDraft,
  setEditingDraft, onEditDraft, onSaveMedicationDraft, continueGroupingFromDraft, groupingSession,
  currentDept, encounter, api, allergies, skinTests }: {
  draftEntries: DraftOrderEntry[]
  herbalFormula: HerbalComposerFormula
  onHerbalFormulaChange: (formula: HerbalComposerFormula) => void
  frequencyOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  routeOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  administrationGroupOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  routes: Array<{ code: string; executionType: 'NONE' | 'ADMINISTRATION' | 'INFUSION' }>
  frequencies: ActiveOrderFrequency[]
  readOnly: boolean
  isComposerActive: boolean
  entryType: OrderEntryType
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  startHerbalGrouping: () => void
  groupingComposerTarget: GroupingComposerTarget
  composer: ReactNode
  editingDraft: EditingOrderDraft | null
  setEditingDraft: Dispatch<SetStateAction<EditingOrderDraft | null>>
  onEditDraft: (draft: EditingOrderDraft) => void
  onSaveMedicationDraft: (draft: MedicationPlanDraft) => void
  continueGroupingFromDraft: (draft: MedicationPlanDraft) => void
  groupingSession: { groupKey: string } | null
  currentDept: string
  encounter: Encounter
  api: RhnApi
  allergies: AllergyIntolerance[]
  skinTests: { data?: SkinTestWorkItem[] }
}) {
  return <>{draftEntries.map((entry, index) => {
        const draftCategoryOf = (e: typeof draftEntries[0]) => {
          if (e.kind === 'medication' && (e.value.categoryCode === 'HERBAL' || e.value.editorMode === 'herbal')) return 'herbal'
          if (e.kind === 'medication') return 'regular-med'
          const sType = (e.value as ServicePlanDraft).serviceType
          if (e.kind === 'service' && sType === 'LABORATORY') return 'lab'
          if (e.kind === 'service' && sType === 'EXAMINATION') return 'exam'
          return 'other-service'
        }

        const currCat = draftCategoryOf(entry)
        const prevCat = index > 0 ? draftCategoryOf(draftEntries[index - 1]) : null
        const isFirstOfDraftCat = currCat !== prevCat
        const catDrafts = draftEntries.filter((e) => draftCategoryOf(e) === currCat)
        const getDraftQuantity = (e: typeof draftEntries[0]) =>
          e.kind === 'medication' ? ((e.value as MedicationPlanDraft).request.quantity || 1) : ((e.value as ServicePlanDraft).quantity || 1)

        let headerNode: React.ReactNode = null
        if (isFirstOfDraftCat) {
          if (currCat === 'herbal') {
            const subtotal = catDrafts.reduce((sum, e) => sum + (e.value.unitPrice || 0) * getDraftQuantity(e), 0)
            const firstHerbDraft = catDrafts[0]?.value as MedicationPlanDraft
            const herbalDoseCount = firstHerbDraft?.request.durationValue || herbalFormula.herbalDoseCount || 7
            const parsedFirstInstruction = parseHerbalInstruction(firstHerbDraft?.request.medicationInstruction)
            const herbalMethod = parsedFirstInstruction.method || herbalFormula.herbalMethod || '水煎服'
            const herbalFrequency = firstHerbDraft?.request.frequencyCode || herbalFormula.frequencyCode || 'BID'
            const herbalInstruction = parsedFirstInstruction.instruction ?? (herbalFormula.instruction || '')

            headerNode = (
              <Fragment key="draft-group-herbal">
                <OrderDocumentGroupHeader
                  title="中药处方"
                  kind="herbal"
                  isDraft
                  itemCount={catDrafts.length}
                  itemUnit="味"
                  dept="中药房"
                  subtotal={subtotal}
                >
                  <HerbalFormulaHeaderBar
                    doseCount={herbalDoseCount}
                    method={herbalMethod}
                    frequencyCode={herbalFrequency}
                    instruction={herbalInstruction}
                    frequencyOptions={frequencyOptions}
                    readOnly={readOnly}
                    isActivelyAdding={isComposerActive && entryType === 'HERBAL'}
                    onUpdateFormula={(updates) => {
                      const nextDoseCount = updates.doseCount !== undefined ? updates.doseCount : herbalDoseCount
                      const nextMethod = updates.method !== undefined ? updates.method : herbalMethod
                      const nextFreq = updates.frequencyCode !== undefined ? updates.frequencyCode : herbalFrequency
                      const nextInst = updates.instruction !== undefined ? updates.instruction : herbalInstruction

                      setMedicationDrafts((curr) => curr.map((d) => {
                        if (d.editorMode !== 'herbal' && d.categoryCode !== 'HERBAL') return d
                        const dose = d.request.doseValue || 0
                        const parsed = parseHerbalInstruction(d.request.medicationInstruction)
                        return {
                          ...d,
                          request: {
                            ...d.request,
                            durationValue: nextDoseCount,
                            frequencyCode: nextFreq,
                            quantity: roundNumber(dose * nextDoseCount, 2),
                            medicationInstruction: buildHerbalInstruction(nextMethod, parsed.specialMethod, nextInst),
                          },
                        }
                      }))

                      onHerbalFormulaChange({
                        herbalDoseCount: nextDoseCount, herbalMethod: nextMethod,
                        frequencyCode: nextFreq, instruction: nextInst,
                      })
                    }}
                  />
                </OrderDocumentGroupHeader>
                <HerbalPrescriptionMatrix
                  items={catDrafts.map((e) => {
                    const d = e.value as MedicationPlanDraft
                    return {
                      id: d.id,
                      name: d.medicationName,
                      doseValue: d.request.doseValue || 0,
                      doseUnit: d.request.doseUnit || 'g',
                      price: d.unitPrice,
                      specialMethod: extractSpecialMethod(d.request.medicationInstruction),
                      isDraft: true,
                    }
                  })}
                  doseCount={herbalDoseCount}
                  readOnly={readOnly}
                  isActivelyAdding={isComposerActive && entryType === 'HERBAL'}
                  onAddMoreHerbs={startHerbalGrouping}
                  onRemoveDraft={(id) => setMedicationDrafts((curr) => curr.filter((d) => d.id !== id))}
                  onUpdateDraft={(id, updates) => {
                    setMedicationDrafts((curr) => curr.map((d) => {
                      if (d.id !== id) return d
                      const newDose = updates.doseValue !== undefined ? roundNumber(updates.doseValue, 2) : (d.request.doseValue || 0)
                      const durationValue = d.request.durationValue || herbalDoseCount || 7
                      const parsed = parseHerbalInstruction(d.request.medicationInstruction)
                      const nextSpecial = updates.specialMethod !== undefined ? updates.specialMethod : parsed.specialMethod
                      const newInstruction = buildHerbalInstruction(parsed.method || herbalMethod, nextSpecial, parsed.instruction)
                      return {
                        ...d,
                        request: {
                          ...d.request,
                          doseValue: newDose,
                          quantity: roundNumber(newDose * durationValue, 2),
                          medicationInstruction: newInstruction,
                        },
                      }
                    }))
                  }}
                />
                {!readOnly && isComposerActive && entryType === 'HERBAL' && composer}
              </Fragment>
            )
          } else if (currCat === 'regular-med') {
            const subtotal = catDrafts.reduce((sum, e) => sum + (e.value.unitPrice || 0) * getDraftQuantity(e), 0)
            headerNode = (
              <OrderDocumentGroupHeader
                key="draft-group-med"
                title="西药/中成药处方"
                kind="western"
                isDraft
                itemCount={catDrafts.length}
                itemUnit="项"
                dept="西药房"
                subtotal={subtotal}
              />
            )
          } else if (currCat === 'lab') {
            const subtotal = catDrafts.reduce((sum, e) => sum + (e.value.unitPrice || 0) * getDraftQuantity(e), 0)
            headerNode = (
              <OrderDocumentGroupHeader
                key="draft-group-lab"
                title="检验申请"
                kind="lab"
                isDraft
                itemCount={catDrafts.length}
                itemUnit="项"
                dept="检验科"
                subtotal={subtotal}
              />
            )
          } else if (currCat === 'exam') {
            const subtotal = catDrafts.reduce((sum, e) => sum + (e.value.unitPrice || 0) * getDraftQuantity(e), 0)
            headerNode = (
              <OrderDocumentGroupHeader
                key="draft-group-exam"
                title="检查申请"
                kind="exam"
                isDraft
                itemCount={catDrafts.length}
                itemUnit="项"
                dept="放射/超声科"
                subtotal={subtotal}
              />
            )
          } else {
            const subtotal = catDrafts.reduce((sum, e) => sum + (e.value.unitPrice || 0) * getDraftQuantity(e), 0)
            headerNode = (
              <OrderDocumentGroupHeader
                key="draft-group-other"
                title="诊疗医嘱"
                kind="treatment"
                isDraft
                itemCount={catDrafts.length}
                itemUnit="项"
                subtotal={subtotal}
              />
            )
          }
        }

        if (currCat === 'herbal') {
          if (groupingComposerTarget?.type === 'draft' && groupingComposerTarget.index === index) {
            return (
              <Fragment key={`draft-wrap-${entry.value.id}`}>
                {headerNode}
                {composer}
              </Fragment>
            )
          }
          return headerNode
        }

        const rowNode = entry.kind === 'service'
          ? editingDraft?.kind === 'service' && editingDraft.id === entry.value.id
            ? <ServiceDraftEditRow key={`draft-service-edit-${entry.value.id}`} value={entry.value}
                currentDept={currentDept}
                onCancel={() => setEditingDraft(null)}
                onSave={(next) => {
                  setServiceDrafts((current) => current.map((value) => value.id === next.id ? next : value))
                  setEditingDraft(null)
                }}
                onRemove={() => {
                  setEditingDraft((curr) => curr?.id === entry.value.id ? null : curr)
                  setServiceDrafts((current) => current.filter((value) => value.id !== entry.value.id))
                }} />
            : <ServiceDraftRow key={`draft-service-${entry.value.id}`} value={entry.value}
                currentDept={currentDept}
                onEdit={() => onEditDraft({ kind: 'service', id: entry.value.id })}
                onRemove={() => setServiceDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
          : editingDraft?.kind === 'medication' && editingDraft.id === entry.value.id
            ? <MedicationDraftEditRow key={`draft-medication-edit-${entry.value.id}`} value={entry.value}
                routeOptions={routeOptions} frequencyOptions={frequencyOptions}
                routeExecutionTypes={new Map(routes.map((value) => [value.code, value.executionType]))}
                administrationGroupOptions={administrationGroupOptions}
                frequencies={frequencies}
                currentDept={currentDept}
                encounter={encounter}
                api={api}
                allergies={allergies}
                skinTests={skinTests}
                onAppendToGroup={continueGroupingFromDraft}
                onCancel={() => setEditingDraft(null)}
                onSave={onSaveMedicationDraft}
                onRemove={() => {
                  setEditingDraft((curr) => curr?.id === entry.value.id ? null : curr)
                  setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))
                }} />
            : (() => {
                const prev = index > 0 ? draftEntries[index - 1] : undefined
                const next = index < draftEntries.length - 1 ? draftEntries[index + 1] : undefined
                const sameGroupAsPrev = Boolean(
                  entry.value.administrationGroupKey &&
                  prev?.kind === 'medication' &&
                  prev.value.administrationGroupKey === entry.value.administrationGroupKey
                )
                const nextInDrafts = Boolean(
                  entry.value.administrationGroupKey &&
                  next?.kind === 'medication' &&
                  next.value.administrationGroupKey === entry.value.administrationGroupKey
                )
                const isLastDraftInThisGroup = !draftEntries.slice(index + 1).some(
                  (d) => d.kind === 'medication' && d.value.administrationGroupKey === entry.value.administrationGroupKey
                )
                const nextIsComposerSession = Boolean(
                  isLastDraftInThisGroup &&
                  isComposerActive &&
                  groupingSession &&
                  entry.value.administrationGroupKey === groupingSession.groupKey
                )
                const sameGroupAsNext = nextInDrafts || nextIsComposerSession
                const isHead = !sameGroupAsPrev && sameGroupAsNext
                const isMid = sameGroupAsPrev && sameGroupAsNext
                const isTail = sameGroupAsPrev && !sameGroupAsNext
                return <MedicationDraftRow key={`draft-medication-${entry.value.id}`} value={entry.value}
                  isHead={isHead}
                  isMid={isMid}
                  isTail={isTail}
                  currentDept={currentDept}
                  onAppendToGroup={continueGroupingFromDraft}
                  onEdit={() => onEditDraft({ kind: 'medication', id: entry.value.id })}
                  onRemove={() => setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
              })()
        if (groupingComposerTarget?.type === 'draft' && groupingComposerTarget.index === index) {
          return (
            <Fragment key={`draft-wrap-${entry.value.id}`}>
              {headerNode}
              {rowNode}
              {composer}
            </Fragment>
          )
        }
        return headerNode ? <Fragment key={`draft-frag-${entry.value.id}`}>{headerNode}{rowNode}</Fragment> : rowNode
      })}</>
}
