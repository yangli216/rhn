import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { historicalImportFixture } from '../ai/historicalPrescriptionImport.testFixtures'
import { MedicationReadRow } from './OrderReadRows'
import { SavedOrderList } from './SavedOrderList'

describe('saved order pharmacy facts', () => {
  it('uses the saved reservation destination rather than the current department', () => {
    const f = historicalImportFixture()
    render(<MedicationReadRow value={{ ...f.rx.medicationRequests[0], stockSiteId: 'pharmacy',
      stockSiteName: '原发药药房', stockSiteSource: 'RESERVATION' }} busy={false} readOnly
      currentDept="接诊科室" onCancel={vi.fn()} />)
    expect(screen.getByRole('row')).toHaveTextContent('原发药药房')
    expect(screen.getByRole('row')).not.toHaveTextContent('接诊科室')
  })

  it('distinguishes a draft route from an opened order and preserves self-provided medication semantics', () => {
    const f = historicalImportFixture()
    const props = { busy: false, readOnly: true, onCancel: vi.fn() }
    const { rerender } = render(<MedicationReadRow {...props} value={{ ...f.rx.medicationRequests[0],
      status: 'DRAFT', stockSiteName: '本次路由药房', stockSiteSource: 'ROUTING' }} />)
    expect(screen.getByRole('row')).toHaveTextContent('本次路由药房（当前路由）')
    rerender(<MedicationReadRow {...props} value={{ ...f.rx.medicationRequests[0], selfProvided: true }} />)
    expect(screen.getByRole('row')).toHaveTextContent('患者自备，无需药房发药')
    rerender(<MedicationReadRow {...props} value={f.rx.medicationRequests[0]} />)
    expect(screen.getByRole('row')).toHaveTextContent('发药药房待确认')
  })

  it('summarizes actual pharmacies in the document header and keeps each row destination', () => {
    const f = historicalImportFixture()
    const medications = [
      { ...f.rx.medicationRequests[0], stockSiteName: '第一药房', stockSiteSource: 'RESERVATION' as const },
      { ...f.rx.medicationRequests[0], id: 'second', stockSiteName: '第二药房', stockSiteSource: 'RESERVATION' as const },
    ]
    render(<QueryClientProvider client={new QueryClient()}><SavedOrderList
      savedEntries={medications.map(value => ({ kind: 'medication', value }))} draftEntries={[]}
      allDocuments={[]} prescriptions={[{ ...f.rx, medicationRequests: medications }]}
      documentRows={{}} activeDocKey={null} handleSelectDoc={vi.fn()} encounter={f.target} api={f.api} readOnly busy={false}
      documentEditing={false} currentDept="接诊科室" onCancelService={vi.fn()} onPrintService={vi.fn()}
      onCancelMedication={vi.fn()} onPrint={vi.fn()} skinTestByRequest={new Map()}
      groupingComposerTarget={null} groupingSession={null} isComposerActive={false} composer={null}
    /></QueryClientProvider>)
    expect(screen.getByText('第一药房 / 第二药房')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').filter(row => row.id.startsWith('order-'))
    expect(within(rows[0]).getByText('第一药房')).toBeInTheDocument()
    expect(within(rows[1]).getByText('第二药房')).toBeInTheDocument()
  })
})
