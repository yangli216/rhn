import type { KeyboardEvent } from 'react'
import type { OrderEntryType } from './orderDraftTypes'
import type { MedicationEntry, MedicationEntryUpdate } from './medicationEntry'
import { Select } from '../../../shared/ui'
import { formatServiceExecution } from './orderPresentation'
import { numberValue, focusControl, focusControlAfterSelection } from './orderEditorControls'

export function OrderComposerDirections({
  entryType, isMedication, hasEnteredOrder, medicationEntry, updateMedication, availableDoseUnits,
  updateRoute, routesLoading, frequenciesLoading, routeOptions, frequencyOptions, serviceType,
  continueOnEnter, addCurrentEntry
}: {
  entryType: OrderEntryType
  isMedication: boolean
  hasEnteredOrder: boolean
  medicationEntry: Pick<MedicationEntry, 'doseValue' | 'doseUnit' | 'routeCode' | 'frequencyCode' | 'durationValue'>
  updateMedication: MedicationEntryUpdate
  availableDoseUnits: string[]
  updateRoute: (code: string) => void
  routesLoading: boolean
  frequenciesLoading: boolean
  routeOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  frequencyOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  serviceType?: string
  continueOnEnter: (event: KeyboardEvent<HTMLInputElement>, nextControlId?: string) => void
  addCurrentEntry: () => void
}) {
  return <>
    {isMedication ? (
      entryType === 'HERBAL' ? (
        <div className="doctor-inline-order-directions-group is-herbal-single">
          <div className={`doctor-inline-order-field doctor-inline-order-dose${!hasEnteredOrder ? ' is-disabled' : ''}`} title="单味每付剂量 (g)">
            <div className="doctor-entry-input-unit">
              <input id="doctor-unified-dose" aria-label="每付剂量" type="number" min="0" step="0.5"
                disabled={!hasEnteredOrder}
                value={medicationEntry.doseValue} placeholder="0"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    event.stopPropagation()
                    addCurrentEntry()
                    return
                  }
                  if (event.key === 'Tab' && !event.shiftKey) {
                    event.preventDefault()
                    focusControl('doctor-unified-instruction')
                    return
                  }
                }} />
              <small>{medicationEntry.doseUnit || 'g'}</small>
            </div>
          </div>
        </div>
      ) : (
        <div className="doctor-inline-order-directions-group">
          <div className={`doctor-inline-order-field doctor-inline-order-dose${!hasEnteredOrder ? ' is-disabled' : ''}`} title="单次剂量">
            <div className="doctor-entry-input-unit">
              <input id="doctor-unified-dose" aria-label="单次剂量" type="number" min="0" step="0.01"
                disabled={!hasEnteredOrder}
                value={medicationEntry.doseValue} placeholder="0"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-route')} />
              {availableDoseUnits.length > 1 ? (
                <select
                  id="doctor-unified-dose-unit"
                  aria-label="单次剂量单位"
                  className="doctor-inline-dose-unit-select"
                  value={medicationEntry.doseUnit}
                  disabled={!hasEnteredOrder}
                  onChange={(event) => updateMedication('doseUnit', event.target.value)}
                >
                  {availableDoseUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : (
                <small>{medicationEntry.doseUnit || ''}</small>
              )}
            </div>
          </div>

          <div className={`doctor-inline-order-field doctor-inline-order-route${!hasEnteredOrder ? ' is-disabled' : ''}`} title="给药途径">
            <Select id="doctor-unified-route" aria-label="给药途径" value={medicationEntry.routeCode}
              disabled={!hasEnteredOrder}
              onChange={updateRoute}
              openOnFocus
              onSelectionCommit={() => focusControlAfterSelection('doctor-unified-frequency')}
              showValue loading={routesLoading} popoverMinWidth={220}
              placeholder="途径" options={routeOptions} />
          </div>

          <div className={`doctor-inline-order-field doctor-inline-order-frequency${!hasEnteredOrder ? ' is-disabled' : ''}`} title="执行频次">
            <Select id="doctor-unified-frequency" aria-label="频次" value={medicationEntry.frequencyCode}
              disabled={!hasEnteredOrder}
              onChange={(value) => updateMedication('frequencyCode', value)}
              openOnFocus
              onSelectionCommit={() => focusControlAfterSelection('doctor-unified-duration')}
              showValue loading={frequenciesLoading} popoverMinWidth={260}
              placeholder="频次" options={frequencyOptions} />
          </div>

          <div className={`doctor-inline-order-field doctor-inline-order-duration${!hasEnteredOrder ? ' is-disabled' : ''}`} title="疗程">
            <div className="doctor-entry-input-unit">
              <input id="doctor-unified-duration" aria-label="疗程" type="number" min="1"
                disabled={!hasEnteredOrder}
                value={medicationEntry.durationValue} placeholder="天数"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => updateMedication('durationValue', numberValue(event.target.value))}
                onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />
              <small>天</small>
            </div>
          </div>
        </div>
      )
    ) : (
      <div className="doctor-inline-order-static doctor-inline-service-execution">
        <span className="doctor-direction-service">{formatServiceExecution(serviceType || (entryType === 'ALL' ? undefined : entryType))}</span>
      </div>
    )}
  </>
}
