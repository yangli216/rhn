import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TriageRecord } from '../../../shared/api/outpatientTriageApi'
import { TriageTicketModal } from './TriageTicketModal'

const record = { id: 'triage-1', triageNo: 'TRI-001', organizationId: 'org-1',
  triageTime: '2026-10-03T00:00:00Z', patientName: '患者甲', gender: 'UNKNOWN',
  triageLevel: 'LEVEL_2_URGENT', consciousness: 'ALERT', greenChannel: 'NONE',
} as TriageRecord

describe('triage ticket records', () => {
  it('does not invent a hospital, department, nurse, print identifier or scannable barcode', () => {
    const { container } = render(<TriageTicketModal open record={record} onClose={vi.fn()} />)
    expect(screen.getByText('机构名称未提供')).toBeInTheDocument()
    expect(screen.getByText('未指定')).toBeInTheDocument()
    expect(screen.getByText('分诊台护士：未记录')).toBeInTheDocument()
    expect(screen.queryByText(/中心医院|全科医疗科|打印流水/)).not.toBeInTheDocument()
    expect(container.querySelector('.triage-ticket-barcode-lines')).not.toBeInTheDocument()
    expect(screen.getByText('分诊单号：TRI-001')).toBeInTheDocument()
  })
  it('does not default unknown assessment to non-urgent or unconscious', () => {
    render(<TriageTicketModal open record={{ ...record, triageLevel: 'UNKNOWN', consciousness: undefined } as unknown as TriageRecord} onClose={vi.fn()} />)
    expect(screen.getByText('分诊等级未记录或无法识别，请核实后打印。')).toBeInTheDocument()
    expect(screen.queryByText('无反应/昏迷')).not.toBeInTheDocument()
    expect(screen.queryByText('非急诊')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打印分诊小票' })).toBeDisabled()
  })
  it('prints known assessment and renders supplied identity fields and zero vital values', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<TriageTicketModal open hospitalName="实际医疗机构" record={{ ...record,
      targetDepartmentName: '发热门诊', triageNurseName: '张护士', consciousness: 'UNRESPONSIVE', oxygenSaturation: 0,
    }} onClose={vi.fn()} />)
    expect(screen.getByText('实际医疗机构')).toBeInTheDocument()
    expect(screen.getByText('发热门诊')).toBeInTheDocument()
    expect(screen.getByText('分诊台护士：张护士')).toBeInTheDocument()
    expect(screen.getByText('无反应/昏迷')).toBeInTheDocument()
    expect(screen.getByText('0 %')).toHaveClass('triage-ticket-vital-val--danger')
    await userEvent.click(screen.getByRole('button', { name: '打印分诊小票' }))
    expect(print).toHaveBeenCalledOnce()
    print.mockRestore()
  })
})
