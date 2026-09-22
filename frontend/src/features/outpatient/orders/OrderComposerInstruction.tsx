import type { KeyboardEvent } from 'react'
import type { OrderEntryType } from './orderDraftTypes'
import type { MedicationEntry, MedicationEntryUpdate } from './medicationEntry'

export function OrderComposerInstruction({
  entryType, isMedication, hasEnteredOrder, medicationEntry, updateMedication, serviceDescription,
  setServiceDescription, continueOnEnter, addCurrentEntry
}: {
  entryType: OrderEntryType
  isMedication: boolean
  hasEnteredOrder: boolean
  medicationEntry: Pick<MedicationEntry, 'instruction'>
  updateMedication: MedicationEntryUpdate
  serviceDescription: string
  setServiceDescription: (value: string) => void
  continueOnEnter: (event: KeyboardEvent<HTMLInputElement>, nextControlId?: string) => void
  addCurrentEntry: () => void
}) {
  return <>
    {isMedication ? (
      entryType === 'HERBAL' ? (
        <div className={`doctor-inline-order-field doctor-inline-order-instruction${!hasEnteredOrder ? ' is-disabled' : ''}`} title="特殊煎法 (选填)">
          <input id="doctor-unified-instruction" aria-label="特殊煎法" value={medicationEntry.instruction}
            disabled={!hasEnteredOrder}
            list="doctor-herbal-instruction-options"
            onFocus={(event) => event.currentTarget.select()}
            placeholder="如: 先煎、后下 (选填)" onChange={(event) => updateMedication('instruction', event.target.value)}
            onKeyDown={(event) => {
              if (entryType === 'HERBAL' && event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                event.stopPropagation()
                addCurrentEntry()
                return
              }
              continueOnEnter(event)
            }} />
          <datalist id="doctor-herbal-instruction-options">
            {['先煎', '后下', '包煎', '烊化', '冲服', '另煎', '生用'].map((value) => <option key={value} value={value} />)}
          </datalist>
        </div>
      ) : (
        <div className={`doctor-inline-order-field doctor-inline-order-instruction${!hasEnteredOrder ? ' is-disabled' : ''}`} title="用药嘱托">
          <input id="doctor-unified-instruction" aria-label="用药嘱托" value={medicationEntry.instruction}
            disabled={!hasEnteredOrder}
            onFocus={(event) => event.currentTarget.select()}
            placeholder="嘱托 (如: 饭后)" onChange={(event) => updateMedication('instruction', event.target.value)}
            onKeyDown={(event) => continueOnEnter(event)} />
        </div>
      )
    ) : (
      <div className={`doctor-inline-order-field doctor-inline-order-instruction doctor-inline-order-service-note${!hasEnteredOrder ? ' is-disabled' : ''}`}>
        <input id="doctor-unified-service-note" className="doctor-unified-service-note" aria-label="临床说明"
          disabled={!hasEnteredOrder}
          value={serviceDescription} placeholder={entryType === 'LABORATORY' ? '标本种类或检验目的 (回车跳至数量)' : entryType === 'EXAMINATION' ? '检查部位及检查目的 (回车跳至数量)' : '治疗部位或临床说明 (回车确认添加)'}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setServiceDescription(event.target.value)}
          onKeyDown={(event) => continueOnEnter(event, entryType === 'TREATMENT' ? undefined : 'doctor-unified-quantity')} />
      </div>
    )}
  </>
}
