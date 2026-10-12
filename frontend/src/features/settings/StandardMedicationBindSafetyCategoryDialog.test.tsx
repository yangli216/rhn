import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi, StandardMedicationDetail } from '../../shared/rhnApi'
import { StandardMedicationBindSafetyCategoryDialog } from './StandardMedicationBindSafetyCategoryDialog'

describe('StandardMedicationBindSafetyCategoryDialog', () => {
  const mockEntry: StandardMedicationDetail = {
    id: 'GEN-PENICILLIN',
    name: '青霉素',
    innName: 'Benzylpenicillin',
    legacyCode: 'MED-2026-W001',
    pinyinCode: 'QMS',
    sourceLocations: ['table:1/row:1'],
    categories: [{ major: '抗微生物药', sub: '青霉素类', function: '' }],
    entryType: 'MEDICATION',
    medicationType: 'WESTERN',
    specificationCount: 2,
    issueCount: 0,
    source: {
      title: '国家基本药物目录',
      claimedEdition: '2026',
      sha256: 'hash',
      verificationStatus: 'VERIFIED',
      note: ''
    },
    sourceSpecification: '注射剂:80万单位',
    sourceNote: '',
    specialistGuidance: false,
    specifications: [
      {
        id: 'SPEC-1',
        doseForm: '注射剂',
        doseFormName: '注射剂',
        specification: '80万单位',
        substanceQualifier: '',
        sourceBlock: '注射剂:80万单位',
        orderable: true,
        strength: {
          kind: 'AMOUNT_PER_PRESENTATION',
          numerator: null,
          denominator: null,
          components: [],
          computable: true
        }
      }
    ],
    issues: []
  }

  const mockCategories = [
    {
      id: 'CAT-1',
      code: 'BETA_LACTAM_ALLERGY',
      name: 'β-内酰胺类过敏高危监控',
      ruleKind: 'INTERACTION_CONTRAINDICATION',
      rationale: '严重过敏性休克风险',
      isSystem: true,
      status: 'ACTIVE',
      memberCount: 3,
      revision: 0
    },
    {
      id: 'CAT-2',
      code: 'INACTIVE_CAT',
      name: '已停用分类',
      ruleKind: 'DUPLICATE_THERAPY',
      status: 'INACTIVE',
      memberCount: 0,
      revision: 0
    }
  ]

  const mockMedications = [
    {
      id: 'MED-101',
      code: 'H1102001',
      name: '注射用青霉素钠',
      preparationSpec: '80万单位',
      sdDoseFormText: '注射剂',
      status: 'ACTIVE'
    },
    {
      id: 'MED-102',
      code: 'H1102002',
      name: '青霉素V钾片',
      preparationSpec: '0.236g',
      sdDoseFormText: '片剂',
      status: 'ACTIVE'
    },
    {
      id: 'MED-103',
      code: 'H1102003',
      name: '青霉素软膏',
      preparationSpec: '10g:10万单位',
      sdDoseFormText: '软膏剂',
      status: 'ACTIVE'
    }
  ]

  function renderDialog(customApi?: Partial<RhnApi>, onClose = vi.fn(), onSuccess = vi.fn()) {
    const api = {
      medicationWorkbench: {
        listSafetyCategories: vi.fn().mockResolvedValue(mockCategories),
        addSafetyCategoryMembers: vi.fn().mockResolvedValue(2)
      },
      masterData: {
        medications: vi.fn().mockResolvedValue(mockMedications)
      },
      ...customApi
    } as unknown as RhnApi

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false }
      }
    })

    const view = render(
      <QueryClientProvider client={client}>
        <StandardMedicationBindSafetyCategoryDialog
          api={api}
          entry={mockEntry}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </QueryClientProvider>
    )

    return { api, onClose, onSuccess, view }
  }

  it('renders standard medication info and filters out topical drugs by default', async () => {
    renderDialog()

    expect(screen.getByText('绑定标准药品至合理用药分类')).toBeInTheDocument()
    expect(screen.getByText(/标准品种：青霉素 · Benzylpenicillin/)).toBeInTheDocument()

    // 默认全身用药勾选，只展示注射用青霉素钠和青霉素V钾片，过滤掉青霉素软膏
    expect(await screen.findByText('注射用青霉素钠')).toBeInTheDocument()
    expect(screen.getByText('青霉素V钾片')).toBeInTheDocument()
    expect(screen.queryByText('青霉素软膏')).not.toBeInTheDocument()
    expect(screen.getByText(/全院在库匹配规格清单（共 2 种）/)).toBeInTheDocument()
  })

  it('shows topical drugs when unchecking systemic only filter', async () => {
    const user = userEvent.setup()
    renderDialog()

    expect(await screen.findByText('注射用青霉素钠')).toBeInTheDocument()
    const checkbox = screen.getByRole('checkbox', { name: /仅纳管全身给药剂型/ })
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(await screen.findByText('青霉素软膏')).toBeInTheDocument()
    expect(screen.getByText(/全院在库匹配规格清单（共 3 种）/)).toBeInTheDocument()
  })

  it('supports selecting category and submitting batch binding', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const { api } = renderDialog(undefined, onClose, onSuccess)

    expect(await screen.findByText('注射用青霉素钠')).toBeInTheDocument()

    // 默认已选中第一个可用分类 (CAT-1)
    const submitBtn = screen.getByRole('button', { name: '确认一键绑定全规格并纳入' })
    expect(submitBtn).toBeEnabled()
    await user.click(submitBtn)

    await waitFor(() => {
      expect(api.medicationWorkbench.addSafetyCategoryMembers).toHaveBeenCalledWith(
        'CAT-1',
        expect.arrayContaining([
          expect.objectContaining({ medicationName: '注射用青霉素钠' }),
          expect.objectContaining({ medicationName: '青霉素V钾片' })
        ])
      )
      expect(onSuccess).toHaveBeenCalledWith('β-内酰胺类过敏高危监控', 2)
      expect(onClose).toHaveBeenCalled()
    })
  })
})
