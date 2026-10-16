import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ServiceInsertButton } from './ServiceInsertButton'
import { serviceInsertTarget } from './medicalInsertTargets'

describe('service insert target', () => {
  it.each([
    ['LABORATORY', 'laboratory'],
    ['EXAMINATION', 'examination'],
  ])('maps %s to the %s knowledge type', (serviceType, type) => {
    expect(serviceInsertTarget(' 血常规 ', serviceType)).toEqual({ name: '血常规', type })
  })

  it.each(['TREATMENT', 'OTHER', undefined, null])('has no insert for %s', (serviceType) => {
    expect(serviceInsertTarget('雾化吸入', serviceType)).toBeNull()
  })

  it('opens the insert for a laboratory item and renders nothing for treatments', async () => {
    const onView = vi.fn()
    const { rerender } = render(<ServiceInsertButton name="血常规" serviceType="LABORATORY" onView={onView} />)
    await userEvent.click(screen.getByRole('button', { name: '说明书' }))
    expect(onView).toHaveBeenCalledWith({ name: '血常规', type: 'laboratory' })
    rerender(<ServiceInsertButton name="雾化吸入" serviceType="TREATMENT" onView={onView} />)
    expect(screen.queryByRole('button', { name: '说明书' })).not.toBeInTheDocument()
  })
})
