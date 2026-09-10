import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceCatalogItem } from '../../shared/rhnApi'
import {
  ServiceTable,
  MedicationTable,
  serviceSubtypeLabel,
  serviceDuplicateRuleLabel,
  serviceTypeTone,
  accountingCategoryLabel,
} from './BasicDataManagement'

const mockServices: ServiceCatalogItem[] = [
  {
    id: 'srv-001',
    revision: 1,
    itemTypeId: 'type-lab',
    code: 'DEMO-LAB-CRP',
    name: 'C反应蛋白测定',
    unitCode: '项',
    accountingCategory: 'LABORATORY',
    orderable: true,
    chargeable: true,
    sdStatus: 'ACTIVE',
    sdStatusText: '有效',
    validFrom: '2026-01-01',
    sdServiceType: 'LABORATORY',
    sdServiceTypeText: '检验',
    serviceSubtype: 'IMMUNOASSAY',
    sdUsageType: 'COMMON',
    sdUsageTypeText: '通用',
    medicalTechnology: true,
    combinationItem: false,
    singleOrder: true,
    pregnancyAlert: false,
    sdDuplicateRule: 'SAME_DAY',
    sdDuplicateRuleText: 'SAME_DAY',
    mutualRecognitionCode: 'MR-LAB-CRP',
    laboratory: {
      sdLaboratoryMethod: 'IMMUNO',
      sdLaboratoryMethodText: '免疫透射比浊法',
      reportDuration: 120,
      fastingRequired: false,
      pointOfCare: false,
      specimens: [
        {
          id: 'spec-1',
          specimenItemId: 'material-serum',
          containerItemId: 'material-red-tube',
          minimumQuantity: 2,
          minimumQuantityUnit: 'ml',
          defaultSpecimen: true,
          requiredSpecimen: true,
          sortOrder: 1,
          collectionDescription: '静脉采血',
          status: 'ACTIVE',
        },
      ],
    },
    prices: [],
  },
  {
    id: 'srv-002',
    revision: 1,
    itemTypeId: 'type-treatment',
    code: 'SRV-OPD-TCM-EXP',
    name: '中医名医门诊诊查',
    unitCode: '次',
    accountingCategory: 'REGISTRATION',
    orderable: true,
    chargeable: true,
    sdStatus: 'ACTIVE',
    sdStatusText: '有效',
    validFrom: '2026-01-01',
    sdServiceType: 'TREATMENT',
    sdServiceTypeText: '处置',
    serviceSubtype: 'OUTPATIENT_VISIT',
    sdUsageType: 'OUTPATIENT',
    sdUsageTypeText: '门诊',
    medicalTechnology: false,
    combinationItem: false,
    singleOrder: true,
    pregnancyAlert: false,
    sdDuplicateRule: 'ALLOW',
    sdDuplicateRuleText: 'ALLOW',
    prices: [],
  },
  {
    id: 'srv-003',
    revision: 1,
    itemTypeId: 'type-exam',
    code: 'DEMO-EXAM-DR-CHEST',
    name: '胸部正位数字摄影(DR)',
    unitCode: '部位',
    accountingCategory: '检查费',
    orderable: true,
    chargeable: true,
    sdStatus: 'ACTIVE',
    sdStatusText: '有效',
    validFrom: '2026-01-01',
    sdServiceType: 'EXAMINATION',
    sdServiceTypeText: '检查',
    serviceSubtype: 'RADIOGRAPHY',
    sdUsageType: 'COMMON',
    sdUsageTypeText: '通用',
    medicalTechnology: true,
    combinationItem: false,
    singleOrder: false,
    pregnancyAlert: true,
    examination: {
      sdExaminationType: 'DR',
      sdExaminationTypeText: 'X线平片',
      bodySiteRequired: true,
      multiBodySite: false,
      variants: [
        {
          id: 'var-1',
          bodySiteConceptId: 'body-site-chest',
          code: 'CHEST-PA',
          name: '胸部后前正位',
          sdMethodType: 'PA',
          sdMethodTypeText: '后前位',
          bodySiteRequired: true,
          sortOrder: 1,
          status: 'ACTIVE',
        },
      ],
    },
    prices: [],
  },
]

describe('BasicDataManagement - ServiceTable & helpers', () => {
  it('maps subtype and duplicate rule codes to user-friendly Chinese', () => {
    expect(serviceSubtypeLabel('IMMUNOASSAY')).toBe('免疫检测')
    expect(serviceSubtypeLabel('OUTPATIENT_VISIT')).toBe('门诊诊查')
    expect(serviceSubtypeLabel('RADIOGRAPHY')).toBe('普通放射 (DR)')
    expect(serviceSubtypeLabel('UNKNOWN_CODE')).toBe('UNKNOWN_CODE')

    expect(serviceDuplicateRuleLabel('SAME_DAY')).toBe('当日不重复')
    expect(serviceDuplicateRuleLabel('ALLOW')).toBe('允许重复')
    expect(serviceDuplicateRuleLabel('BLOCK')).toBe('禁止重复')

    expect(serviceTypeTone('LABORATORY')).toBe('info')
    expect(serviceTypeTone('EXAMINATION')).toBe('info')
    expect(serviceTypeTone('TREATMENT')).toBe('success')
    expect(serviceTypeTone('SURGERY')).toBe('warning')

    expect(accountingCategoryLabel('LABORATORY')).toBe('检验费')
    expect(accountingCategoryLabel('REGISTRATION')).toBe('诊察挂号费')
  })

  it('renders ServiceTable in two-line standard mode, omitting code from visible text while retaining tooltip', () => {
    const handleConfigure = vi.fn()
    const handleEdit = vi.fn()
    const handleAttributes = vi.fn()
    const handleMappings = vi.fn()

    render(
      <ServiceTable
        values={mockServices}
        loading={false}
        pagination={<div>分页</div>}
        density="two-line"
        onConfigure={handleConfigure}
        onEdit={handleEdit}
        onAttributes={handleAttributes}
        onMappings={handleMappings}
      />,
    )

    // 项目名称可见
    expect(screen.getByText('C反应蛋白测定')).toBeInTheDocument()
    expect(screen.getByText('中医名医门诊诊查')).toBeInTheDocument()
    expect(screen.getByText('胸部正位数字摄影(DR)')).toBeInTheDocument()

    // 费用归并正常映射为中文
    expect(screen.getByText('检验费')).toBeInTheDocument()
    expect(screen.getByText('诊察挂号费')).toBeInTheDocument()

    // 项目编码不在列表可见文本中展示，但包含在 DOM title 属性中
    expect(screen.queryByText('DEMO-LAB-CRP')).not.toBeInTheDocument()
    expect(screen.queryByText('SRV-OPD-TCM-EXP')).not.toBeInTheDocument()
    expect(screen.getByTitle('项目编码: DEMO-LAB-CRP')).toBeInTheDocument()

    // 计价单位正常展示
    expect(screen.getByText('项')).toBeInTheDocument()
    expect(screen.getByText('次')).toBeInTheDocument()
    expect(screen.getByText('部位')).toBeInTheDocument()

    // 临床语义与中文映射
    expect(screen.getByText(/免疫检测/)).toBeInTheDocument()
    expect(screen.getAllByText(/门诊诊查/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/免疫透射比浊法.*1 种标本.*当日不重复/)).toBeInTheDocument()
    expect(screen.getByText(/允许重复/)).toBeInTheDocument()

    // 中心能力
    expect(screen.getAllByText('可开立').length).toBe(3)
    expect(screen.getAllByText('可收费').length).toBe(3)
    expect(screen.getAllByText('允许单开').length).toBe(2)
    expect(screen.getByText(/仅组合使用.*孕期提醒/)).toBeInTheDocument()

    // 操作按钮（检验/检查具备“项目配置”，处置不具备）
    const configureBtns = screen.getAllByRole('button', { name: '项目配置' })
    expect(configureBtns.length).toBe(2) // 检验 srv-001 和检查 srv-003

    const editBtns = screen.getAllByRole('button', { name: '编辑主档' })
    expect(editBtns.length).toBe(3)
  })

  it('renders ServiceTable in single-line compact mode with inline class and compact indicators', () => {
    const { container } = render(
      <ServiceTable
        values={mockServices}
        loading={false}
        pagination={<div>分页</div>}
        density="single-line"
        onConfigure={vi.fn()}
        onEdit={vi.fn()}
        onAttributes={vi.fn()}
        onMappings={vi.fn()}
      />,
    )

    const table = container.querySelector('.service-catalog-table.is-single-line')
    expect(table).toBeInTheDocument()

    const rows = container.querySelectorAll('.service-catalog-row.is-single-line')
    expect(rows.length).toBe(3)

    // 单行紧凑标签
    expect(screen.getAllByText('开立').length).toBe(3)
    expect(screen.getAllByText('收费').length).toBe(3)
    expect(screen.getAllByText('单开').length).toBe(2)
    expect(screen.getByText('组合')).toBeInTheDocument()
  })

  it('renders MedicationTable in knowledge mode with 8-column clinical master data', async () => {
    const handleModeChange = vi.fn()
    const handleEdit = vi.fn()
    const handleProduct = vi.fn()

    const mockMedications = [
      {
        id: 'med-001',
        revision: 1,
        itemTypeId: 'type-med',
        code: 'MED-2026-W001',
        name: '阿莫西林胶囊',
        sdMedicationType: 'WESTERN',
        sdMedicationTypeText: '西药',
        sdDoseForm: 'CAPSULE',
        sdDoseFormText: '胶囊剂',
        preparationSpec: '0.25g',
        strengthValue: 0.25,
        strengthUnit: 'g',
        sdStorageType: 'NORMAL',
        sdStorageTypeText: '常温',
        prescriptionDrug: true,
        essentialDrug: true,
        antimicrobial: true,
        sdAntimicrobialLevelText: '非限制级',
        skinTestRequired: true,
        chronicDiseaseDrug: false,
        singleOrder: true,
        defaultDose: 0.5,
        defaultDoseUnit: 'g',
        defaultRoute: 'ORAL',
        defaultFrequency: 'TID',
        sdStatus: 'ACTIVE' as const,
        sdStatusText: '有效',
        products: [
          {
            id: 'prod-001',
            revision: 1,
            code: 'PROD-001',
            name: '阿莫西林胶囊(严迪)',
            manufacturerName: '哈药集团制药总厂',
            approvalCode: '国药准字H23021465',
            sdStatus: 'ACTIVE' as const,
            sdStatusText: '有效',
            packages: [
              {
                id: 'pkg-001',
                packageSpec: '0.25g*24粒/盒',
                unitName: '盒',
                quantityFactor: 24,
                sdUsageTypeText: '门诊发药',
                defaultDispense: true,
                defaultPurchase: true,
                defaultSale: true,
              },
            ],
          },
        ],
      },
    ]

    render(
      <MedicationTable
        values={mockMedications as any}
        loading={false}
        pagination={<div>分页</div>}
        mode="knowledge"
        onModeChange={handleModeChange}
        routes={[{ id: 'r1', code: 'ORAL', name: '口服', systemCode: 'ROUTE', systemVersion: '1', executionType: 'NONE' }]}
        frequencies={[{ id: 'f1', code: 'TID', name: '每日三次' } as any]}
        onEdit={handleEdit}
        onAttributes={vi.fn()}
        onMappings={vi.fn()}
        onProduct={handleProduct}
        onEditProduct={vi.fn()}
        onPackage={vi.fn()}
        onEditPackage={vi.fn()}
      />,
    )

    // 表头验证
    expect(screen.getByText('药品通用名 / 编码')).toBeInTheDocument()
    expect(screen.getByText('分类与剂型')).toBeInTheDocument()
    expect(screen.getByText('规格与含量')).toBeInTheDocument()
    expect(screen.getByText('默认用法')).toBeInTheDocument()
    expect(screen.getByText('安全监管')).toBeInTheDocument()
    expect(screen.getByText('厂家产品')).toBeInTheDocument()

    // 内容验证
    expect(screen.getByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(screen.getByText('MED-2026-W001')).toBeInTheDocument()
    expect(screen.getByText('西药')).toBeInTheDocument()
    expect(screen.getByText('胶囊剂')).toBeInTheDocument()
    expect(screen.getByText('0.25g · 常温')).toBeInTheDocument()
    expect(screen.getByText('0.5g')).toBeInTheDocument()
    expect(screen.getByText('口服 · 每日三次')).toBeInTheDocument()
    expect(screen.getByText('处方药')).toBeInTheDocument()
    expect(screen.getByText('基药')).toBeInTheDocument()
    expect(screen.getByText('需皮试')).toBeInTheDocument()

    // 厂家产品微标与点击切换
    const countChip = screen.getByRole('button', { name: /1 个产品/ })
    expect(countChip).toBeInTheDocument()
    countChip.click()
    expect(handleModeChange).toHaveBeenCalledWith('product')
  })

  it('renders MedicationTable in product mode with flattened manufacturer product table', () => {
    const handleEditProduct = vi.fn()
    const handlePackage = vi.fn()

    const mockMedications = [
      {
        id: 'med-001',
        revision: 1,
        itemTypeId: 'type-med',
        code: 'MED-2026-W001',
        name: '阿莫西林胶囊',
        sdMedicationType: 'WESTERN',
        sdMedicationTypeText: '西药',
        sdDoseForm: 'CAPSULE',
        sdDoseFormText: '胶囊剂',
        preparationSpec: '0.25g',
        strengthValue: 0.25,
        strengthUnit: 'g',
        prescriptionDrug: true,
        essentialDrug: true,
        antimicrobial: true,
        skinTestRequired: true,
        chronicDiseaseDrug: false,
        singleOrder: true,
        sdStatus: 'ACTIVE' as const,
        sdStatusText: '有效',
        products: [
          {
            id: 'prod-001',
            revision: 1,
            code: 'PROD-001',
            name: '阿莫西林胶囊(严迪)',
            manufacturerName: '哈药集团制药总厂',
            approvalCode: '国药准字H23021465',
            sdStatus: 'ACTIVE' as const,
            sdStatusText: '有效',
            packages: [
              {
                id: 'pkg-001',
                packageSpec: '0.25g*24粒/盒',
                unitName: '盒',
                quantityFactor: 24,
                sdUsageTypeText: '门诊发药',
                defaultDispense: true,
                defaultPurchase: true,
                defaultSale: true,
              },
            ],
          },
        ],
      },
    ]

    render(
      <MedicationTable
        values={mockMedications as any}
        loading={false}
        pagination={<div>分页</div>}
        mode="product"
        routes={[]}
        frequencies={[]}
        onEdit={vi.fn()}
        onAttributes={vi.fn()}
        onMappings={vi.fn()}
        onProduct={vi.fn()}
        onEditProduct={handleEditProduct}
        onPackage={handlePackage}
        onEditPackage={vi.fn()}
      />,
    )

    // 产品表头
    expect(screen.getByText('厂家产品 / 生产企业')).toBeInTheDocument()
    expect(screen.getByText('所属通用药品')).toBeInTheDocument()
    expect(screen.getByText('剂型规格 / 含量')).toBeInTheDocument()
    expect(screen.getByText('批准文号')).toBeInTheDocument()
    expect(screen.getByText('包装规格与换算')).toBeInTheDocument()

    // 产品内容
    expect(screen.getByText('阿莫西林胶囊(严迪)')).toBeInTheDocument()
    expect(screen.getByText('哈药集团制药总厂')).toBeInTheDocument()
    expect(screen.getByText('国药准字H23021465')).toBeInTheDocument()
    expect(screen.getByText(/0.25g\*24粒\/盒/)).toBeInTheDocument()

    // 操作按钮
    expect(screen.getByRole('button', { name: '编辑产品' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加包装' })).toBeInTheDocument()
  })
})
