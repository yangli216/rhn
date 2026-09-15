import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnitNumberInput } from './UnitNumberInput'

describe('UnitNumberInput', () => {
  it('renders with value and allows changing number and custom unit', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const onUnitChange = vi.fn()

    render(
      <UnitNumberInput
        value={500}
        unit="U/ml"
        onValueChange={onValueChange}
        onUnitChange={onUnitChange}
      />
    )

    const numberInput = screen.getByRole('spinbutton')
    expect(numberInput).toHaveValue(500)

    const unitInput = screen.getByRole('textbox', { name: '单位' })
    expect(unitInput).toHaveValue('U/ml')

    await user.clear(numberInput)
    await user.type(numberInput, '250')
    expect(onValueChange).toHaveBeenCalled()

    await user.clear(unitInput)
    await user.type(unitInput, 'mg/ml')
    expect(onUnitChange).toHaveBeenCalled()
  })

  it('renders select dropdown when unit options are provided', async () => {
    const user = userEvent.setup()
    const onUnitChange = vi.fn()

    render(
      <UnitNumberInput
        value={10}
        unit="mg/ml"
        units={['U/ml', 'mg/ml', 'g/l', '%']}
        onUnitChange={onUnitChange}
      />
    )

    const select = screen.getByRole('combobox', { name: '单位' })
    expect(select).toHaveTextContent('mg/ml')

    await user.click(select)
    const option = await screen.findByRole('option', { name: 'U/ml' })
    await user.click(option)
    expect(onUnitChange).toHaveBeenCalledWith('U/ml')
  })

  it('renders fixed text label when unitReadOnly is true', () => {
    render(
      <UnitNumberInput
        value={15}
        unit="mm"
        unitReadOnly
      />
    )

    expect(screen.queryByRole('textbox', { name: '单位' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '单位' })).not.toBeInTheDocument()
    expect(screen.getByText('mm')).toBeInTheDocument()
  })
})
