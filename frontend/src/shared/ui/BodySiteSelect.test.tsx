import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BodySiteSelect } from './BodySiteSelect'

describe('BodySiteSelect', () => {
  it('renders input with default presets and selects a preset chip', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <BodySiteSelect
        value="左前臂屈侧下段"
        onChange={onChange}
      />
    )

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('左前臂屈侧下段')

    const chip = screen.getByRole('button', { name: '右前臂屈侧下段' })
    await user.click(chip)

    expect(onChange).toHaveBeenCalledWith('右前臂屈侧下段')
  })

  it('allows typing custom site text and supports clearing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <BodySiteSelect
        value="腹壁皮下"
        onChange={onChange}
      />
    )

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('腹壁皮下')

    const clearBtn = screen.getByRole('button', { name: '清空部位' })
    await user.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith('')
  })
})
