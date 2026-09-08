import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../rhnApi'
import { ClinicalResourceSearch } from './ClinicalResourceSearch'

describe('ClinicalResourceSearch', () => {
  const mockApi = {
    encounters: {
      orderableMedications: vi.fn(),
    },
    masterData: {
      diseases: vi.fn(),
      medications: vi.fn(),
      services: vi.fn(),
    },
  } as unknown as RhnApi

  it('renders clinical order items with manufacturer, unit price, stock and clinical tags without duplicate pharmacy tag', async () => {
    const user = userEvent.setup()
    const mockMedication = {
      id: 'med-1',
      code: 'MED-001',
      name: '对乙酰氨基酚片',
      preparationSpec: '0.5g',
      preparationUnit: '片',
      sdMedicationType: 'WESTERN',
      sdMedicationTypeText: '西药',
      sdDoseForm: 'TABLET',
      sdDoseFormText: '片剂',
      prescriptionDrug: true,
      essentialDrug: true,
      skinTestRequired: true,
      antimicrobial: false,
      stockSiteId: 'stock-1',
      stockSiteName: '门诊药房',
      availablePackageQuantity: 49,
      packageUnitName: '盒',
      products: [
        {
          id: 'prod-1',
          code: 'PROD-001',
          name: '对乙酰氨基酚片（泰诺林）',
          manufacturerName: '中美天津史克制药有限公司',
          unitCode: '片',
          packages: [
            {
              id: 'pkg-1',
              packageSpec: '0.5g*20片/盒',
              unitName: '盒',
              quantityFactor: 20,
            },
          ],
          prices: [
            {
              id: 'price-1',
              packageId: 'pkg-1',
              price: 15.6,
              sdStatus: 'ACTIVE',
            },
          ],
        },
      ],
    }

    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValueOnce([mockMedication] as never)

    render(
      <ClinicalResourceSearch
        id="test-med-search"
        api={mockApi}
        resource="medication"
        encounterId="enc-101"
        defaultOpen
        onChange={vi.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('输入通用名、编码或别名')
    await user.type(searchInput, '对乙')

    const option = await screen.findByRole('option', { name: /对乙酰氨基酚片/ })
    expect(option).toBeInTheDocument()

    // 验证第一行通用信息：药品通用名、制剂规格、剂型、类型及属性标签
    expect(option.textContent).toContain('对乙酰氨基酚片 (0.5g) · 片剂')
    expect(option.textContent).toContain('西药')
    expect(option.textContent).toContain('处方药')
    expect(option.textContent).toContain('基药')
    expect(option.textContent).toContain('需皮试')

    // 验证第二行产品信息：厂家、单价、包装、药房库存（直接显示纯内容，无 label 前缀）
    expect(option.textContent).toContain('中美天津史克制药有限公司')
    expect(option.textContent).toContain('¥15.60/盒')
    expect(option.textContent).toContain('0.5g*20片/盒')
    expect(option.textContent).toContain('门诊药房 (可用: 49盒)')
    expect(option.textContent).not.toContain('厂家:')
    expect(option.textContent).not.toContain('单价:')
    expect(option.textContent).not.toContain('包装:')
    expect(option.textContent).not.toContain('药房:')

    // 重点验证：消除重复！门诊药房绝不能出现在 tags 徽标中
    const tagsContainer = option.querySelector('.ui-remote-search__tags')
    expect(tagsContainer).toBeInTheDocument()
    const tagsText = Array.from(tagsContainer?.querySelectorAll('.ui-remote-search__tag') ?? []).map(
      (el) => el.textContent
    )
    expect(tagsText).toEqual(['西药', '基药', '处方药', '需皮试'])
    expect(tagsText).not.toContain('门诊药房')
  })

  it('displays out-of-stock badge when available quantity is 0', async () => {
    const user = userEvent.setup()
    const outOfStockMed = {
      id: 'med-2',
      code: 'MED-002',
      name: '阿莫西林胶囊',
      preparationSpec: '0.25g',
      sdDoseFormText: '胶囊剂',
      prescriptionDrug: true,
      stockSiteName: '门诊药房',
      availablePackageQuantity: 0,
      packageUnitName: '盒',
      products: [],
    }

    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValueOnce([outOfStockMed] as never)

    render(
      <ClinicalResourceSearch
        id="test-med-search-2"
        api={mockApi}
        resource="medication"
        encounterId="enc-102"
        defaultOpen
        onChange={vi.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('输入通用名、编码或别名')
    await user.type(searchInput, '阿莫')

    const option = await screen.findByRole('option', { name: /阿莫西林胶囊/ })
    expect(option.textContent).toContain('门诊药房 (缺药)')
    expect(option.textContent).not.toContain('药房:')
  })

  it('renders service items with unit price and tags', async () => {
    const user = userEvent.setup()
    const mockService = {
      id: 'srv-1',
      code: 'SRV-001',
      name: '血常规五分类',
      unitCode: '次',
      sdServiceTypeText: '检验',
      serviceSubtype: '血液学',
      medicalTechnology: true,
      prices: [
        {
          id: 'p-1',
          price: 20.0,
          sdStatus: 'ACTIVE',
        },
      ],
    }

    vi.mocked(mockApi.masterData.services).mockResolvedValueOnce([mockService] as never)

    render(
      <ClinicalResourceSearch
        id="test-srv-search"
        api={mockApi}
        resource="service"
        defaultOpen
        onChange={vi.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('输入项目名称、编码或项目类型')
    await user.type(searchInput, '血常规')

    const option = await screen.findByRole('option', { name: /血常规五分类/ })
    expect(option.textContent).toContain('检验 · 血液学 · ¥20.00/次')
    expect(option.textContent).not.toContain('单价:')
    expect(option.textContent).not.toContain('单位:')
    expect(option.textContent).toContain('医疗技术')
  })
})
