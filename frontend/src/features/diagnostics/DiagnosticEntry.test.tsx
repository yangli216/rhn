import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DiagnosticWorkspace } from './DiagnosticWorkspace'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { RhnApi } from '../../shared/rhnApi'

describe('legacy diagnostic entry', () => {
  it('keeps encounter/resident filters for both business entries and exposes no writing bypass', () => {
    const navigate = vi.fn()
    render(<MemoryRouter initialEntries={['/diagnostics?encounterId=e1&residentId=p1&requestType=LABORATORY']}>
      <DiagnosticWorkspace api={{} as RhnApi} clinicalContext={{ organization: { name: '机构' }, department: { name: '科室' } } as ClinicalContext}
        onNavigate={navigate} /></MemoryRouter>)
    fireEvent.click(screen.getByText('进入检验工作台'))
    expect(navigate).toHaveBeenLastCalledWith('/diagnostics/laboratory?encounterId=e1&residentId=p1')
    fireEvent.click(screen.getByText('进入检查工作台'))
    expect(navigate).toHaveBeenLastCalledWith('/diagnostics/examination?encounterId=e1&residentId=p1')
    expect(screen.queryByText('签发正式报告')).not.toBeInTheDocument()
  })
})
