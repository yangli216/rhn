import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InpatientWardBoard as WardBoardValue } from '../../shared/api/inpatientApi'
import { currentWardShiftWindow, InpatientWardBoard } from './InpatientWardBoard'

const board: WardBoardValue = {
  generatedAt: '2026-08-31T08:00:00+08:00',
  from: '2026-08-31T08:00:00+08:00',
  to: '2026-08-31T16:00:00+08:00',
  metrics: {
    patientCount: 2, specialCareCount: 1, pendingVerificationCount: 1,
    pendingTaskCount: 3, overdueTaskCount: 1, awaitingReceiptPatientCount: 1,
    awaitingReceiptBatchCount: 1, exceptionPatientCount: 1,
  },
  patients: [{
    episodeId: 'episode-1', encounterId: 'encounter-1', residentId: 'resident-1', residentName: '张三',
    episodeNo: 'IP001', bedNo: '02床', wardName: '综合病区', nursingLevelCode: 'LEVEL_I',
    admittedAt: '2026-08-30T08:00:00+08:00', pendingVerificationCount: 1,
    pendingTaskCount: 2, overdueTaskCount: 1, medicationTaskCount: 1, serviceTaskCount: 0,
    nursingTaskCount: 1, pendingDispatchCount: 0, awaitingReceiptCount: 1,
    deliveryDiscrepancyCount: 0, attentionLevel: 'OVERDUE',
    handoverSummary: '待核对医嘱 1 条；本班待执行 2 项（逾期 1 项）；1 批药品待签收',
  }, {
    episodeId: 'episode-2', encounterId: 'encounter-2', residentId: 'resident-2', residentName: '李四',
    episodeNo: 'IP002', bedNo: '10床', wardName: '综合病区', nursingLevelCode: 'LEVEL_III',
    admittedAt: '2026-08-30T09:00:00+08:00', pendingVerificationCount: 0,
    pendingTaskCount: 1, overdueTaskCount: 0, medicationTaskCount: 0, serviceTaskCount: 1,
    nursingTaskCount: 0, pendingDispatchCount: 0, awaitingReceiptCount: 0,
    deliveryDiscrepancyCount: 0, attentionLevel: 'PENDING',
    handoverSummary: '本班待执行 1 项',
  }],
}

describe('InpatientWardBoard', () => {
  it('renders compact handover metrics and selects a patient row', async () => {
    const onSelect = vi.fn()
    render(<InpatientWardBoard value={board} loading={false} onSelect={onSelect} />)

    const metrics = screen.getByRole('region', { name: '病区交接摘要' })
    expect(within(metrics).getByText('待核对医嘱')).toBeInTheDocument()
    expect(within(metrics).getByText('待签收批次')).toBeInTheDocument()
    expect(screen.getByText(/本班.*08:00.*16:00/)).toBeInTheDocument()
    expect(screen.getByText(/逾期 1 项/)).toBeInTheDocument()
    expect(screen.getByText('执行逾期')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /02床.*张三/ }))
    expect(onSelect).toHaveBeenCalledWith('episode-1')
  })

  it('builds an explicit eight-hour ward shift window', () => {
    const reference = new Date(2026, 7, 31, 10, 37, 12)
    const shift = currentWardShiftWindow(reference)

    expect(new Date(shift.from).getHours()).toBe(8)
    expect(new Date(shift.from).getMinutes()).toBe(0)
    expect(new Date(shift.to).getHours()).toBe(16)
    expect(new Date(shift.to).getTime() - new Date(shift.from).getTime()).toBe(8 * 60 * 60 * 1000)
  })

  it('does not render an empty board', () => {
    const { container } = render(<InpatientWardBoard value={{ ...board, patients: [] }} loading={false}
      onSelect={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
