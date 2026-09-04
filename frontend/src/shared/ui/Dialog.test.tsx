import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, FormField, Select } from './index'

describe('Dialog form keyboard navigation', () => {
  it('focuses the requested field and advances with Enter only when the current value is valid', async () => {
    const initialFocusRef = createRef<HTMLInputElement>()
    render(<Dialog title="编辑资料" onClose={vi.fn()} initialFocusRef={initialFocusRef}>
      <form>
        <FormField label="姓名" required>
          <input ref={initialFocusRef} required />
        </FormField>
        <FormField label="证件号">
          <input aria-label="证件号" pattern="[0-9]{3}" />
        </FormField>
        <FormField label="性别" required>
          <Select value="MALE" onChange={vi.fn()} options={[{ value: 'MALE', label: '男' }]} />
        </FormField>
      </form>
    </Dialog>)

    const name = screen.getByLabelText(/姓名/)
    const identity = screen.getByLabelText('证件号')
    const gender = screen.getByRole('combobox', { name: /性别/ })
    expect(name).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(name).toHaveFocus()

    await userEvent.type(name, '张三{Enter}')
    expect(identity).toHaveFocus()

    await userEvent.type(identity, '12{Enter}')
    expect(identity).toHaveFocus()

    await userEvent.type(identity, '3{Enter}')
    expect(gender).toHaveFocus()
  })

  it('keeps Enter available for multiline fields', async () => {
    render(<Dialog title="填写说明" onClose={vi.fn()}>
      <form><FormField label="说明"><textarea /></FormField></form>
    </Dialog>)

    const textarea = screen.getByLabelText('说明')
    await userEvent.type(textarea, '第一行{Enter}第二行')
    expect(textarea).toHaveValue('第一行\n第二行')
  })
})
