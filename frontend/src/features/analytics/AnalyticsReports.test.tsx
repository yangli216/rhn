import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientRegistrationReport } from './OutpatientRegistrationReport'
import { OutpatientWorkloadReport } from './OutpatientWorkloadReport'
import type { PageSpec } from '../../shared/api/analysisPagesApi'

function createMockApi(): RhnApi {
  return {
    organization: {
      listDepartments: vi.fn().mockResolvedValue([
        { id: 'dept-1', code: 'IM', name: '内科门诊' },
        { id: 'dept-2', code: 'SUR', name: '外科门诊' },
      ]),
    },
    analytics: {
      queryPage: vi.fn().mockImplementation(async (spec: PageSpec) => {
        if (spec.measures?.some((m) => m.source === 'REGISTRATION')) {
          const points = spec.dimension === 'DAY'
            ? [{ key: '2026-09-18', label: '2026-09-18', value: 100 }]
            : [{ key: 'dept-1', label: '心血管内科门诊', value: 60 }, { key: 'dept-2', label: '呼吸与危重症门诊', value: 40 }]
          return { series: [
            { code: 'M1', total: 100, points },
            { code: 'M2', total: 5, points: [{ ...points[0], value: 5 }] },
            { code: 'M3', total: 65, points: points.map((p, i) => ({ ...p, value: i === 0 ? 45 : 30 })) },
          ] }
        }
        if (spec.measures?.some((m) => m.source === 'ENCOUNTER')) {
          return { series: ['M1', 'M2', 'M3', 'M4'].map((code, i) => ({
            code, total: [100, 65, 120, 20][i],
            points: [{ key: 'dept-1', label: '内科门诊', value: [100, 65, 120, 20][i] }],
          })) }
        }
        if (spec.dimension === 'DAY') {
          return {
            title: spec.title,
            columns: [
              { code: 'key', label: '日期' },
              { code: 'M1', label: '总量' },
              { code: 'M2', label: '退号' },
            ],
            series: [
              {
                code: 'M1',
                name: '挂号总量',
                total: 100,
                points: [
                  { key: '2026-09-18', label: '2026-09-18', value: 100 },
                ],
              },
              {
                code: 'M2',
                name: '退号量',
                total: 5,
                points: [
                  { key: '2026-09-18', label: '2026-09-18', value: 5 },
                ],
              },
            ],
          }
        }
        return {
          title: spec.title,
          columns: [
            { code: 'key', label: '科室' },
            { code: 'M1', label: '挂号总量' },
          ],
          series: [
            {
              code: 'M1',
              name: '挂号总量',
              total: 100,
              points: [
                { key: 'dept-1', label: '心血管内科门诊', value: 60 },
                { key: 'dept-2', label: '呼吸与危重症门诊', value: 40 },
              ],
            },
          ],
        }
      }),
    },
    analysisPages: {
      preview: vi.fn().mockResolvedValue({
        title: '',
        columns: [],
        rows: [],
        totalCount: 0,
      }),
    },
  } as unknown as RhnApi
}

describe('OutpatientRegistrationReport', () => {
  it('renders registration report with KPIs and department distribution view', async () => {
    const api = createMockApi()
    render(
      <MemoryRouter>
        <OutpatientRegistrationReport api={api} />
      </MemoryRouter>
    )

    // 检查页面主标题与 AI 联动入口
    expect(screen.getByText('门诊挂号与号源统计')).toBeInTheDocument()
    expect(screen.getByText(/AI 探索此数据/)).toBeInTheDocument()

    // 检查高密度 KPI 指标卡，并等待数据加载完成
    await waitFor(() => {
      expect(screen.queryByText('正在汇总各科室挂号业务数据...')).not.toBeInTheDocument()
      expect(screen.getByText('挂号总人次')).toBeInTheDocument()
      expect(screen.getByText('有效挂号人次')).toBeInTheDocument()
      expect(screen.getByText('退号总量与退号率')).toBeInTheDocument()
      expect(screen.getByText('去重挂号患者数')).toBeInTheDocument()
    })

    // 切换至科室全景对比视图
    const deptTab = screen.getByRole('button', { name: /科室分布对比/ })
    fireEvent.click(deptTab)

    await waitFor(() => {
      const section = screen.getByRole('region', { name: '门诊挂号统计报表' })
      expect(section).toHaveTextContent('各科室挂号与退号综合统计全景表')
      expect(section).toHaveTextContent('心血管内科门诊')
    })
  })
})

describe('OutpatientWorkloadReport', () => {
  it('renders workload report with summary cards and workload split layout', async () => {
    const api = createMockApi()
    render(
      <MemoryRouter>
        <OutpatientWorkloadReport api={api} />
      </MemoryRouter>
    )

    // 检查页面主标题
    expect(screen.getByText('门诊就诊与医疗工作量统计')).toBeInTheDocument()

    // 检查工作量指标卡与左右分栏内容
    await waitFor(() => {
      expect(screen.getByText('门诊登记就诊总人次')).toBeInTheDocument()
      expect(screen.getByText('有效医嘱总量')).toBeInTheDocument()
      expect(screen.getAllByText('每就诊人次医嘱数').length).toBeGreaterThan(0)
      expect(screen.getByText('各科室就诊与医嘱明细全景表')).toBeInTheDocument()
    })
  })
})

it('uses the shared scope selector and reloads registration data for the selected scope', async () => {
  const api = createMockApi()
  render(<MemoryRouter><OutpatientRegistrationReport api={api}/></MemoryRouter>)
  const control = screen.getByRole('combobox', { name: '科室统计范围' })
  expect(control.tagName).not.toBe('SELECT')
  fireEvent.click(control)
  fireEvent.click(await screen.findByRole('option', { name: '当前登录科室' }))
  await waitFor(() => expect(api.analytics.queryPage).toHaveBeenCalledWith(expect.objectContaining({ scope: 'CURRENT' })))
})
