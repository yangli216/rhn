import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemAttributeWorkspace } from './ItemAttributeWorkspace'
import type { RhnApi } from '../../shared/rhnApi'

describe('ItemAttributeWorkspace', () => {
  let queryClient: QueryClient
  let mockApi: Partial<RhnApi>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

    mockApi = {
      masterData: {
        itemAttributeConfigurations: vi.fn().mockResolvedValue({
          subjectType: 'MEDICATION',
          itemTypeId: '',
          itemTypes: [
            { id: 'type-1', code: 'WESTERN', name: '西药', sdStatus: 'ACTIVE' },
          ],
          definitions: [
            {
              id: 'def-1',
              code: 'HIGH_ALERT_LEVEL',
              name: '高危等级',
              description: '高危药品分级管理',
              dataType: 'TEXT',
              cardinality: 'SINGLE',
              variability: 'BASE_ONLY',
              contextBasis: 'NONE',
              sensitivity: 'NORMAL',
              status: 'ACTIVE',
              scopeType: 'TENANT',
              allowedScopes: [],
              storageMode: 'JSON_OVERRIDE',
              editable: true,
            },
          ],
          assignments: [],
        }),
      } as any,
      dictionaries: {
        list: vi.fn().mockResolvedValue([]),
      } as any,
    }
  })

  it('renders workspace page header and action buttons', async () => {
    const handleNavigate = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <ItemAttributeWorkspace api={mockApi as RhnApi} onNavigate={handleNavigate} />
      </QueryClientProvider>
    )

    // PageHeader 标题与描述
    expect(screen.getByText('扩展属性管理')).toBeInTheDocument()
    expect(screen.getByText(/统一维护药品主档与诊疗服务项目的租户自定义扩展属性/)).toBeInTheDocument()
    expect(screen.getByText('中心治理 · 扩展属性')).toBeInTheDocument()

    // 快捷跳转按钮
    const medBtn = screen.getByRole('button', { name: '药品知识与目录' })
    const srvBtn = screen.getByRole('button', { name: '诊疗服务目录' })
    expect(medBtn).toBeInTheDocument()
    expect(srvBtn).toBeInTheDocument()

    fireEvent.click(medBtn)
    expect(handleNavigate).toHaveBeenCalledWith('/settings/medications')

    fireEvent.click(srvBtn)
    expect(handleNavigate).toHaveBeenCalledWith('/settings/services')
  })

  it('renders embedded ItemAttributeConfigurationPanel with attribute definitions', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ItemAttributeWorkspace api={mockApi as RhnApi} />
      </QueryClientProvider>
    )

    // 验证内部 ItemAttributeConfigurationPanel
    expect(await screen.findByRole('button', { name: /高危等级/ })).toBeInTheDocument()
    expect(screen.getAllByText('HIGH_ALERT_LEVEL').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '新增租户属性' })).toBeInTheDocument()
  })
})
