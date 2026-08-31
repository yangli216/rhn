import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InpatientEpisode, InpatientTemperatureChart } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import {
  InpatientTemperatureChartPanel,
  TemperatureChartEntry,
  TemperatureChartView,
} from './InpatientTemperatureChart'

const weekStart = '2026-08-24'
const chart: InpatientTemperatureChart = {
  episodeId: 'episode-1',
  weekStart,
  weekEnd: '2026-08-30',
  readOnly: false,
  observations: [
    {
      id: 'vital-1', observedAt: '2026-08-24T10:00:00+08:00', temperatureCelsius: 38.2,
      temperatureSite: 'AXILLARY', coolingTemperatureCelsius: 37.5,
      coolingObservedAt: '2026-08-24T10:30:00+08:00', pulseRate: 106, respiratoryRate: 23,
      systolicBloodPressure: 132, diastolicBloodPressure: 82, oxygenSaturation: 96,
      bodyWeightKg: 62.5, intakeVolumeMl: 1200, outputVolumeMl: 850, status: 'SIGNED',
      recorderName: '护士甲', signedAt: '2026-08-24T10:35:00+08:00',
    },
  ],
  events: [{
    id: 'event-1', eventType: 'BED_TRANSFER', occurredAt: '2026-08-24T14:00:00+08:00',
    displayText: '<img src=x onerror=alert(1)>转床', status: 'SIGNED',
  }],
}

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 1, episodeNo: 'ZY20260824001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', healthRecordNo: 'HR001', gender: 'MALE', birthDate: '1980-01-01',
  organizationId: 'org-1', departmentId: 'dept-1', departmentName: '综合病区', encounterId: 'encounter-1',
  encounterNo: 'E001', bedId: 'bed-1', bedNo: '01床', admittedAt: '2026-08-24T08:00:00+08:00',
}

describe('TemperatureChartView', () => {
  it('draws the seven-day clinical facts and keeps event content as inert text', () => {
    const { container } = render(<TemperatureChartView chart={chart} weekStart={weekStart} />)

    expect(screen.getByRole('img', { name: /体温单，含体温、脉搏、呼吸和每日生命体征/ })).toBeInTheDocument()
    expect(screen.getAllByText('<img src=x onerror=alert(1)>转床').length).toBeGreaterThan(0)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.temperature-chart-mark.is-cooling')).toBeInTheDocument()
    expect(screen.getByText('132/82')).toBeInTheDocument()
    expect(screen.getByText('96')).toBeInTheDocument()
    expect(screen.getByText('62.5')).toBeInTheDocument()
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText('850')).toBeInTheDocument()
  })

  it('labels out-of-range facts with their exact values and breaks misleading trend lines', () => {
    const outlierChart: InpatientTemperatureChart = {
      ...chart,
      events: [],
      observations: [
        { id: 'before', observedAt: '2026-08-24T06:00:00+08:00', temperatureCelsius: 38,
          pulseRate: 100, status: 'SIGNED' },
        { id: 'outlier', observedAt: '2026-08-24T10:00:00+08:00', temperatureCelsius: 43.5,
          pulseRate: 220, status: 'SIGNED' },
        { id: 'after', observedAt: '2026-08-24T14:00:00+08:00', temperatureCelsius: 37.2,
          pulseRate: 92, status: 'SIGNED' },
      ],
    }
    const { container } = render(<TemperatureChartView chart={outlierChart} weekStart={weekStart} />)

    expect(screen.getByText('43.5↑')).toBeInTheDocument()
    expect(screen.getByText('220↑')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-out-of-range="high"]')).toHaveLength(2)
    expect(container.querySelector('.temperature-chart-line.is-temperature')).toBeNull()
    expect(container.querySelector('.temperature-chart-line.is-pulse')).toBeNull()
  })
})

describe('TemperatureChartEntry', () => {
  it('submits one append-only vital observation with physical-cooling semantics', async () => {
    const onRecordVital = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })
    render(<TemperatureChartEntry weekStart={weekStart} onRecordVital={onRecordVital} onRecordEvent={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('体温 ℃'), '38.2')
    await userEvent.type(screen.getByLabelText('脉搏 次/分'), '106')
    await userEvent.type(screen.getByLabelText('呼吸 次/分'), '23')
    await userEvent.type(screen.getByLabelText('降温后 ℃'), '37.5')
    await userEvent.type(screen.getByLabelText('收缩压'), '132')
    await userEvent.type(screen.getByLabelText('舒张压'), '82')
    await userEvent.click(screen.getByRole('button', { name: '保存体征' }))

    await waitFor(() => expect(onRecordVital).toHaveBeenCalledWith(expect.objectContaining({
      temperatureCelsius: 38.2,
      temperatureSite: 'AXILLARY',
      coolingTemperatureCelsius: 37.5,
      pulseRate: 106,
      respiratoryRate: 23,
      systolicBloodPressure: 132,
      diastolicBloodPressure: 82,
      commandCode: 'VITAL-request-1',
    })))
    const input = onRecordVital.mock.calls[0][0]
    expect(new Date(input.coolingObservedAt).getTime() - new Date(input.observedAt).getTime()).toBe(30 * 60_000)
  })

  it('requires both blood-pressure values before recording', async () => {
    const onRecordVital = vi.fn()
    render(<TemperatureChartEntry weekStart={weekStart} onRecordVital={onRecordVital} onRecordEvent={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('收缩压'), '132')
    await userEvent.click(screen.getByRole('button', { name: '保存体征' }))

    expect(await screen.findByText('血压需要同时填写收缩压和舒张压。')).toBeInTheDocument()
    expect(onRecordVital).not.toHaveBeenCalled()
  })
})

describe('InpatientTemperatureChartPanel', () => {
  it('does not expose data-entry actions for a locked historical chart', async () => {
    const api = { inpatient: { temperatureChart: vi.fn().mockResolvedValue({ ...chart, readOnly: true }) } } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}>
      <InpatientTemperatureChartPanel api={api} episode={episode} />
    </QueryClientProvider>)

    expect(await screen.findByText('历史只读')).toBeInTheDocument()
    expect(screen.getByText('该住院记录已结束或体温单已锁定，历史事实仅供查看。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存体征' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '记录事件' })).not.toBeInTheDocument()
  })
})
