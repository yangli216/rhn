import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { InpatientBed, InpatientEpisode } from '../../shared/api/inpatientApi'
import type { Resident } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientAdmissionWorkspace } from './InpatientWorkspace'

const resident: Resident = {
  id: 'resident-1', healthRecordNo: 'HR0001', fullName: '张三', maskedNationalId: '3301********1234',
  gender: 'MALE', birthDate: '1990-01-01', deceased: false, createdAt: '2026-08-29T01:00:00Z',
  status: 'ACTIVE', version: 0, identifiers: [],
}

const bed: InpatientBed = {
  id: 'bed-1', revision: 0, organizationId: 'org-1', departmentId: 'dept-1', departmentName: '综合病区',
  wardId: 'ward-1', wardName: '综合病区', roomId: 'room-1', roomName: '一病室', code: 'B01', bedNo: '01床',
  bedType: 'PHYSICAL', genderRestriction: 'ANY', operationalStatus: 'AVAILABLE', displayStatus: 'AVAILABLE',
}

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 0, episodeNo: 'IP20260831001', status: 'ADMITTED', residentId: resident.id,
  residentName: resident.fullName, healthRecordNo: resident.healthRecordNo, gender: resident.gender,
  birthDate: resident.birthDate, organizationId: 'org-1', departmentId: 'dept-1', departmentName: '综合病区',
  encounterId: 'encounter-1', encounterNo: 'E001', wardId: bed.wardId, wardName: bed.wardName,
  roomId: bed.roomId, roomName: bed.roomName, bedId: bed.id, bedNo: bed.bedNo,
  admittedAt: '2026-08-31T08:00:00+08:00',
}

describe('InpatientAdmissionWorkspace quick deposit', () => {
  it('collects an optional deposit immediately after admission', async () => {
    const admit = vi.fn().mockResolvedValue(episode)
    const registerDeposit = vi.fn().mockResolvedValue({ paymentId: 'payment-1', paymentNo: 'IPD-1',
      amount: 500, currencyCode: 'CNY', paymentMethodCode: 'CASH', paidAt: '2026-08-31T08:00:00+08:00',
      duplicate: false, account: {},
    })
    const api = { inpatient: { bootstrap: vi.fn().mockResolvedValue({ beds: [bed], episodes: [] }),
      admit, registerDeposit }, residents: { search: vi.fn().mockResolvedValue([resident]) },
      dictionaries: { resolve: vi.fn().mockResolvedValue([
        { code: 'SPOUSE', name: '配偶', sortOrder: 10 },
        { code: 'CHILD', name: '子女', sortOrder: 30 },
      ]) },
    } as unknown as RhnApi
    const clinicalContext = { organization: { id: 'org-1', name: '县医院' },
      department: { id: 'dept-1', name: '综合病区' } } as ClinicalContext
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.stubGlobal('crypto', { randomUUID: () => 'command-1' })

    render(<QueryClientProvider client={client}><InpatientAdmissionWorkspace api={api}
      clinicalContext={clinicalContext} /></QueryClientProvider>)

    await screen.findByRole('heading', { name: /患者确认/ })
    await userEvent.type(screen.getByLabelText('患者姓名、证件或卡号'), '330102199001011234')
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    expect(await screen.findByText('已回填')).toBeInTheDocument()
    expect(screen.queryByText('从居民主索引选择患者，避免重复建档')).not.toBeInTheDocument()
    expect(screen.queryByText('登记入院时间、来源、方式及病情状态')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('联系人姓名'), '李家属')
    const relationship = screen.getByLabelText('与患者关系')
    await waitFor(() => expect(relationship).toBeEnabled())
    await userEvent.click(relationship)
    await userEvent.click(await screen.findByRole('option', { name: /子女/ }))
    await userEvent.type(screen.getByLabelText('联系电话'), '13800000000')
    await userEvent.type(screen.getByLabelText('快捷预交金（选填）'), '500')
    await userEvent.click(screen.getByRole('button', { name: '确认入院登记' }))

    await waitFor(() => expect(admit).toHaveBeenCalledWith(expect.objectContaining({
      residentId: resident.id, bedId: bed.id, emergencyContactName: '李家属',
      emergencyContactRelationship: 'CHILD', emergencyContactPhone: '13800000000',
    })))
    await waitFor(() => expect(registerDeposit).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      amount: 500, currencyCode: 'CNY', paymentMethodCode: 'CASH', description: '张三入院快捷预交金',
    })))
    expect(await screen.findByText(/快捷预交金.*¥500.00.*已收取/)).toBeInTheDocument()
  })
})
