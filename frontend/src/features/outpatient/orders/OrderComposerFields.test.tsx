import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrderComposerInstruction } from './OrderComposerInstruction'
import { OrderComposerQuantity } from './OrderComposerQuantity'

describe('controlled order composer fields', () => {
  it('adds a herbal ingredient once on Enter and waits for IME composition to finish', () => {
    const add = vi.fn(), parentKeyDown = vi.fn(), continueOnEnter = vi.fn()
    render(<div onKeyDown={parentKeyDown}><OrderComposerInstruction entryType="HERBAL" isMedication
      hasEnteredOrder medicationEntry={{ instruction: '' }} updateMedication={vi.fn()}
      serviceDescription="" setServiceDescription={vi.fn()} continueOnEnter={continueOnEnter} addCurrentEntry={add} /></div>)
    const field = screen.getByLabelText('特殊煎法')
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    expect(add).not.toHaveBeenCalled()
    parentKeyDown.mockClear()
    continueOnEnter.mockClear()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(add).toHaveBeenCalledTimes(1)
    expect(parentKeyDown).not.toHaveBeenCalled()
    expect(continueOnEnter).not.toHaveBeenCalled()
  })

  it.each([{ type: 'LABORATORY' as const, next: 'doctor-unified-quantity' },
    { type: 'TREATMENT' as const, next: undefined }])('preserves the $type note keyboard destination', ({ type, next }) => {
    const continueOnEnter = vi.fn()
    render(<OrderComposerInstruction entryType={type} isMedication={false} hasEnteredOrder
      medicationEntry={{ instruction: '' }} updateMedication={vi.fn()} serviceDescription=""
      setServiceDescription={vi.fn()} continueOnEnter={continueOnEnter} addCurrentEntry={vi.fn()} />)
    fireEvent.keyDown(screen.getByLabelText('临床说明'), { key: 'Enter' })
    expect(continueOnEnter).toHaveBeenCalledWith(expect.anything(), next)
  })

  it('passes explicit quantities to the parent when the frequency cannot be calculated', () => {
    const update = vi.fn()
    render(<OrderComposerQuantity entryType="WESTERN" isMedication hasEnteredOrder
      medicationEntry={{ doseValue: 1, herbalDoseCount: 7, quantity: '' }} updateMedication={update}
      selectedProduct={{ unitCode: 'BOX', unitName: '盒' }} isStockInsufficient={false}
      frequencyQuantityUnavailable serviceQuantity={1} setServiceQuantity={vi.fn()} continueOnEnter={vi.fn()} />)
    const field = screen.getByLabelText('总量')
    expect(field).toHaveAttribute('title', '当前频次无法自动推算总量，请手动填写')
    fireEvent.change(field, { target: { value: '3' } })
    expect(update).toHaveBeenCalledWith('quantity', 3)
  })
})
