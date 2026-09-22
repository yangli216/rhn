import type { KeyboardEvent } from 'react'
import type { OrderEntryType } from './orderDraftTypes'
import type { MedicationEntry, MedicationEntryUpdate } from './medicationEntry'
import type { DispensableProductOption } from './dispensableOptions'
import { roundNumber } from '../../../shared/utils/precision'
import { formatPackageUnit } from './orderPresentation'
import { numberValue } from './orderEditorControls'

export function OrderComposerQuantity({
  entryType, isMedication, hasEnteredOrder, medicationEntry, updateMedication, selectedProduct,
  isStockInsufficient, frequencyQuantityUnavailable, calculationText, serviceQuantity,
  setServiceQuantity, serviceUnit, continueOnEnter
}: {
  entryType: OrderEntryType
  isMedication: boolean
  hasEnteredOrder: boolean
  medicationEntry: Pick<MedicationEntry, 'doseValue' | 'herbalDoseCount' | 'quantity'>
  updateMedication: MedicationEntryUpdate
  selectedProduct?: Pick<DispensableProductOption, 'unitName' | 'unitCode'>
  isStockInsufficient: boolean
  frequencyQuantityUnavailable: boolean
  calculationText?: string
  serviceQuantity: number
  setServiceQuantity: (value: number) => void
  serviceUnit?: string
  continueOnEnter: (event: KeyboardEvent<HTMLInputElement>, nextControlId?: string) => void
}) {
  return <>
    {isMedication ? (
      entryType === 'HERBAL' ? (
        <div className="doctor-inline-order-static doctor-inline-order-quantity">
          {hasEnteredOrder && medicationEntry.doseValue !== '' ? (
            <span className="doctor-direction-chip is-calc-qty">
              {roundNumber(Number(medicationEntry.doseValue) * Number(medicationEntry.herbalDoseCount || 7), 2)}g
            </span>
          ) : (
            <span className="doctor-inline-order-placeholder">—</span>
          )}
        </div>
      ) : (
        <div className={`doctor-inline-order-field doctor-inline-order-quantity ${isStockInsufficient ? 'is-danger' : ''}${!hasEnteredOrder ? ' is-disabled' : ''}`}>
          <div className="doctor-entry-input-unit">
            <input id="doctor-unified-quantity" aria-label="总量" type="number" min="0.01" step="0.01"
              disabled={!hasEnteredOrder}
              title={isStockInsufficient ? `开立数量超过当前可用库存` : frequencyQuantityUnavailable
                ? '当前频次无法自动推算总量，请手动填写' : calculationText}
              value={medicationEntry.quantity} placeholder="数量"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => updateMedication('quantity', numberValue(event.target.value))}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-instruction')} />
            <small>{formatPackageUnit(selectedProduct?.unitName, selectedProduct?.unitCode)}</small>
          </div>
        </div>
      )
    ) : (
      <div className={`doctor-inline-order-field doctor-inline-order-quantity${!hasEnteredOrder ? ' is-disabled' : ''}`}>
        <div className="doctor-entry-input-unit">
          <input id="doctor-unified-quantity" aria-label="项目数量" type="number" min="0.01" step="0.01"
            disabled={!hasEnteredOrder}
            value={serviceQuantity} placeholder="数量"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setServiceQuantity(Number(event.target.value))}
            onKeyDown={(event) => continueOnEnter(event, entryType === 'TREATMENT' ? 'doctor-unified-service-note' : undefined)} />
          <small>{serviceUnit ?? '项'}</small>
        </div>
      </div>
    )}
  </>
}
