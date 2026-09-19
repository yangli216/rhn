import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { EditableTable, EditableRow, EditableCell } from './EditableTable'
import { Select } from './Select'
import { DatePicker } from './DatePicker'
import { UnitNumberInput } from './UnitNumberInput'

function Entry({ onAppendRow = vi.fn() }: { onAppendRow?: () => void }) {
  const [item, setItem] = useState('a')
  const [quantity, setQuantity] = useState('1')
  const [date, setDate] = useState('2030-04-08')
  return <>
    <EditableTable aria-label="连续录入" onAppendRow={onAppendRow}><tbody>
      <EditableRow data-testid="row">
        <EditableCell display={item}><Select aria-label="药品" value={item} onChange={setItem}
          options={[{ value: 'a', label: '药品甲' }, { value: 'b', label: '药品乙' }]} /></EditableCell>
        <EditableCell display={quantity}><UnitNumberInput aria-label="数量" value={quantity}
          unit="盒" unitReadOnly onValueChange={setQuantity} /></EditableCell>
        <EditableCell display={date}><DatePicker aria-label="效期" value={date} onChange={setDate} /></EditableCell>
      </EditableRow>
    </tbody></EditableTable>
    <input aria-label="表格外" />
  </>
}

it('enters edit mode through focus, retains it in select/date portals, and restores reading outside the row', async () => {
  const user = userEvent.setup()
  render(<Entry />)
  const row = screen.getByTestId('row')
  expect(row).toHaveAttribute('data-mode', 'read')
  await user.tab()
  expect(row).toHaveAttribute('data-mode', 'edit')
  await user.click(screen.getByRole('combobox'))
  expect(screen.getByRole('textbox', { name: '检索选项' })).toHaveFocus()
  expect(row).toHaveAttribute('data-mode', 'edit')
  await user.click(screen.getByRole('option', { name: /药品乙/ }))
  await user.click(screen.getByLabelText('效期'))
  await user.click(screen.getByRole('button', { name: '下一月' }))
  expect(row).toHaveAttribute('data-mode', 'edit')
  await user.click(screen.getByRole('button', { name: '2030-05-15' }))
  await user.tab()
  expect(screen.getByLabelText('表格外')).toHaveFocus()
  expect(row).toHaveAttribute('data-mode', 'read')
  expect(screen.getByLabelText('效期')).toHaveValue('2030-05-15')
  await user.click(screen.getByLabelText('数量'))
  expect(row).toHaveAttribute('data-mode', 'edit')
  expect(screen.getByRole('combobox')).toHaveTextContent('药品乙')
})

it('advances with Enter, lets calendars commit before appending and preserves composition and modifier shortcuts', async () => {
  const user = userEvent.setup()
  const append = vi.fn()
  render(<Entry onAppendRow={append} />)
  await user.click(screen.getByLabelText('数量'))
  fireEvent.keyDown(screen.getByLabelText('数量'), { key: 'Enter', isComposing: true })
  expect(screen.getByLabelText('数量')).toHaveFocus()
  await user.keyboard('{Control>}{Enter}{/Control}')
  expect(screen.getByLabelText('数量')).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('效期')).toHaveFocus()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(append).toHaveBeenCalledTimes(1)
})

it('leaves Enter to open select options and ignores option commits inside their portal', async () => {
  const user = userEvent.setup()
  const append = vi.fn()
  render(<Entry onAppendRow={append} />)
  await user.click(screen.getByRole('combobox'))
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('数量')).not.toHaveFocus()
  expect(append).not.toHaveBeenCalled()
})
