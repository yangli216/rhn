import { editorStandardsFixture } from './templateEditorFacts.testFixtures'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/api'
import type { PlanTextDraft } from '../../../shared/api/outpatientPlanTemplatesApi'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { maintainedNoteReceipt } from './maintainedTemplateSave.testFixtures'
import { catalogPage, catalogProduct, catalogService } from './templateCatalogSearch.testFixtures'

describe('AiPlanTemplateDraftModal', () => {
  it('streams the clinical rows without exposing a duplicate narrative tail', async () => {
    let complete!: (value: PlanTextDraft) => void
    let continueStream!: () => void
    const compileDraftStream = vi.fn((_input, _scope, _signal, onDelta: (value: string) => void) => {
      onDelta('{"name":"成人上感方案","noteTemplateContent":{"chiefComplaint":"[主要不适]，[持续时间]","presentIllness":"需询问起病')
      continueStream = () => onDelta('及伴随症状","medicalHistory":"既往体健","physicalExam":"咽部充血，双肺清","healthEducation":"注意休息","followUp":"症状加重复诊"},"items":[{"kind":"DIAGNOSIS","name":"急性上呼吸道感染 [J06.9]","details":"结合症状核对"}],"narrative":"正在生成诊断与处置建议')
      return new Promise<PlanTextDraft>((resolve) => { complete = resolve })
    })
    const reviseDraftStream = vi.fn((_input, _narrative, _instruction, _scope, _signal,
      onDelta: (value: string) => void) => {
      onDelta('{"name":"修订后的成人上感方案","narrative":"正在删除血常规')
      return Promise.resolve<PlanTextDraft>({
        scopeType: 'PERSONAL', name: '修订后的成人上感方案', narrative: '诊断与评估：急性上呼吸道感染。',
        sourceType: 'AI_INPUT', reviewItems: [
          { kind: 'DIAGNOSIS', text: '急性上呼吸道感染，未特指 [J06.9]', origin: 'SUGGESTED', details: '结合门诊表现核对' },
        ],
      })
    })
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '成人上感常用方案')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    const note = screen.getByRole('region', { name: '病历书写内容' })
    expect(await within(note).findByLabelText('现病史')).toHaveValue('需询问起病')
    expect(within(note).getByLabelText('现病史')).toBeDisabled()
    await act(async () => continueStream())
    expect(within(note).getByLabelText('现病史')).toHaveValue('需询问起病及伴随症状')
    expect(await screen.findByText('正在完成方案生成与一致性校验…')).toBeInTheDocument()
    expect(screen.queryByText(/实时方案草案流/)).not.toBeInTheDocument()

    // 验证流式阶段：诊断输出完整后即刻分块呈现，明确标记编码仍需目录核对
    expect(await screen.findByText('急性上呼吸道感染 [J06.9]')).toBeInTheDocument()
    expect(screen.getByText('诊断编码待目录核对')).toBeInTheDocument()

    await act(async () => complete({
      scopeType: 'PERSONAL', name: '成人上感方案', narrative: '诊断与评估：上呼吸道感染。',
      sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'DIAGNOSIS', text: '急性上呼吸道感染 [J06.9]', origin: 'SUGGESTED', details: '结合症状核对' },
        { kind: 'LABORATORY', text: '血常规', origin: 'EXPLICIT', sourceQuote: '必要时查血常规' },
      ],
    }))
    expect(await screen.findByRole('region', { name: '临床方案审核清单' })).toBeInTheDocument()
    expect(screen.getByText('诊断与评估')).toBeInTheDocument()
    expect(screen.getByText('检验检查')).toBeInTheDocument()
    expect(screen.getByText('急性上呼吸道感染 [J06.9]')).toBeInTheDocument()
    const infoBtn = screen.getByRole('button', { name: '查看 急性上呼吸道感染 [J06.9] 依据' })
    expect(infoBtn).toBeInTheDocument()
    await user.hover(infoBtn)
    expect(await screen.findByText('结合症状核对')).toBeInTheDocument()
    expect(screen.getByText('诊断编码待目录核对')).toBeInTheDocument()
    expect(screen.queryByText('AI 建议')).not.toBeInTheDocument()
    expect(screen.queryByText('原文明确')).not.toBeInTheDocument()
    expect(screen.queryByText('查看依据')).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: '对话式修订要求' }), '删除血常规，并使用标准诊断名称')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText(/急性上呼吸道感染，未特指/)).toBeInTheDocument()
    expect(screen.queryByText('血常规')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '方案修订记录' })).toHaveTextContent('删除血常规，并使用标准诊断名称')
    expect(reviseDraftStream).toHaveBeenCalledWith(
      '成人上感常用方案', '诊断与评估：上呼吸道感染。', '删除血常规，并使用标准诊断名称', 'PERSONAL',
      expect.any(AbortSignal), expect.any(Function),
    )
  })

  it.each([
    ['常规用法：0.5g 口服 tid 7-10天；核对适用条件', '规格待确认', '用法：每次 0.5g 口服 tid 7-10天'],
    ['规格：0.25g/粒；常规用法：每次 0.5g 口服 tid 7天', '建议规格：0.25g/粒', '用法：每次 0.5g 口服 tid 7天'],
    ['规格：0.25g/粒；口服 tid 7-10天', '建议规格：0.25g/粒', '用法：口服 · tid · 7-10天'],
    ['规格：待确认；单次剂量：0.5g，口服 tid 7天', '规格待确认', '用法：每次 0.5g · 口服 · tid · 7天'],
  ])('separates medication strength from a single dose: %s', async (details, specification, _usage) => {
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream: vi.fn().mockResolvedValue({
        scopeType: 'PERSONAL', name: '测试方案', narrative: '用药建议', sourceType: 'AI_INPUT',
        reviewItems: [{ kind: 'MEDICATION', text: '阿莫西林胶囊', origin: 'SUGGESTED', details }],
      }) },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '测试方案')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    expect(await screen.findByText(specification)).toBeInTheDocument()
    expect(screen.getByText(`原始说明：${details}`)).toBeInTheDocument()
  })

  it('shows an applicability condition separately from a diagnosis', async () => {
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream: vi.fn().mockResolvedValue({
        scopeType: 'PERSONAL', name: '急性扁桃体炎方案', narrative: '诊断与评估：急性扁桃体炎。', sourceType: 'AI_INPUT',
        reviewItems: [
          { kind: 'DIAGNOSIS', text: '急性扁桃体炎，未特指 [J03.9]', origin: 'SUGGESTED' },
          { kind: 'CONDITION', text: '门诊轻症患者', origin: 'SUGGESTED' },
        ],
      }) },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '急性扁桃体炎')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    const checklist = await screen.findByRole('region', { name: '临床方案审核清单' })
    expect(within(checklist).getByText('门诊轻症患者').closest('section')).toHaveTextContent('适用条件')
    expect(within(checklist).queryByText('待对齐诊断')).not.toBeInTheDocument()
  })

  it('removes review items before catalog matching and keeps only the doctor-selected plan', async () => {
    const reviewItems: PlanTextDraft['reviewItems'] = [
      { kind: 'DIAGNOSIS', text: '急性上呼吸道感染，未特指 [J06.9]', origin: 'EXPLICIT', sourceQuote: '成人上感' },
      { kind: 'MEDICATION', text: '对乙酰氨基酚', origin: 'SUGGESTED', details: '发热或疼痛时考虑' },
      { kind: 'LABORATORY', text: '血常规', origin: 'SUGGESTED', details: '高热持续时考虑' },
    ]
    const compileDraftStream = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL',
      name: '成人上感常用方案',
      narrative: '诊断与评估：急性上呼吸道感染。治疗方案：按症状选择对乙酰氨基酚。检验检查：必要时血常规。',
      sourceType: 'AI_INPUT',
      reviewItems,
    })
    const convertDraft = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL', name: '成人上感常用方案', diagnoses: [], medications: [], services: [], tasks: [],
    })
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream: vi.fn(), convertDraft },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '成人上感')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    await user.click(await screen.findByRole('button', { name: '移除 对乙酰氨基酚' }))

    expect(screen.queryByText('对乙酰氨基酚')).not.toBeInTheDocument()
    expect(screen.getByText('血常规')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认方案并匹配院内目录' }))

    expect(convertDraft).toHaveBeenCalledWith(
      '成人上感',
      expect.stringContaining('急性上呼吸道感染'),
      '成人上感常用方案',
      [reviewItems[0], reviewItems[2]],
      'PERSONAL',
    )
    expect(await screen.findByText(/当前方案尚无已匹配的 ICD-10 标准诊断/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认存入方案池' })).toBeDisabled()
  })

  it('blocks saving while confirmed clinical candidates are not matched to the institution catalog', async () => {
    const compileDraftStream = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL', name: '成人上感常用方案', narrative: '诊断、用药和检验方案。',
      sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'MEDICATION', text: '对乙酰氨基酚', origin: 'SUGGESTED' },
        { kind: 'LABORATORY', text: '血常规', origin: 'SUGGESTED' },
      ],
    })
    const convertDraft = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL', name: '成人上感常用方案',
      diagnoses: [{ code: 'J06.9', display: '急性上呼吸道感染，未特指', type: 'PRIMARY' }],
      medications: [{
        medicationId: '1', catalogItemId: '11', packageId: '111', medicationName: '对乙酰氨基酚',
        preparationSpec: '0.5g', doseValue: 0.5, doseUnit: 'g', routeCode: 'PO', frequencyCode: 'BID',
        quantity: 1, quantityUnit: 'BOX', substitutionAllowed: false, selfProvided: false,
      }],
      services: [],
      tasks: [
        { kind: 'MEDICATION', text: '对乙酰氨基酚', origin: 'SUGGESTED', status: 'MATCHED' },
        { kind: 'LABORATORY', text: '血常规', origin: 'SUGGESTED', status: 'UNMATCHED' },
      ],
    })
    const reviseDraftStream = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL', name: '成人上感常用方案', narrative: '仅保留已确认用药。',
      sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'MEDICATION', text: '对乙酰氨基酚', origin: 'SUGGESTED' },
      ],
    })
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue(editorStandardsFixture()) },
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream, convertDraft },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '成人上感')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    await user.click(await screen.findByRole('button', { name: '确认方案并匹配院内目录' }))

    expect(await screen.findByText(/仍有 1 项诊断、药品或检验检查未能唯一匹配/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认存入方案池' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '移除任务 血常规' }))
    expect(screen.getByRole('button', { name: '确认存入方案池' })).toBeEnabled()

    await user.type(screen.getByRole('textbox', { name: '对话式修订要求' }), '删除未匹配的血常规')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByRole('button', { name: '确认方案并匹配院内目录' })).toBeEnabled()
    expect(screen.queryByText(/仍有 1 项诊断、药品或检验检查未能唯一匹配/)).not.toBeInTheDocument()
  })

  it('supports selecting department scope via flat radio pill and compiles draft', async () => {
    const compileDraftStream = vi.fn().mockResolvedValue({
      scopeType: 'DEPARTMENT', name: '社区获得性肺炎方案', narrative: '诊断：社区获得性肺炎。',
      sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'DIAGNOSIS', text: '社区获得性肺炎', origin: 'EXPLICIT' },
      ],
    })
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream: vi.fn() },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    // 验证平铺单选按钮存在且能切换
    const deptRadio = screen.getByRole('radio', { name: '科室' })
    expect(deptRadio).toHaveAttribute('aria-checked', 'false')
    await user.click(deptRadio)
    expect(deptRadio).toHaveAttribute('aria-checked', 'true')

    // 输入长篇指南条文推荐
    const inputArea = screen.getByPlaceholderText(/请输入您的问题或描述症状/)
    await user.type(inputArea, '《成人CAP指南》建议门诊首选口服阿莫西林或阿奇霉素，复查胸片')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(compileDraftStream).toHaveBeenCalledWith(
      '《成人CAP指南》建议门诊首选口服阿莫西林或阿奇霉素，复查胸片',
      'DEPARTMENT',
      expect.any(AbortSignal),
      expect.any(Function),
    )
  })

  it('supports web search toggle and includes voice recognition action button', async () => {
    const compileDraftStream = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL', name: '带联网检索的CAP方案', narrative: '诊断：CAP。',
      sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'DIAGNOSIS', text: '社区获得性肺炎', origin: 'EXPLICIT' },
      ],
    })
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream: vi.fn() },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    // 验证语音输入按钮存在
    expect(screen.getByRole('button', { name: '语音输入' })).toBeInTheDocument()

    // 点击开启联网检索
    const webSearchBtn = screen.getByRole('button', { name: '联网检索' })
    expect(webSearchBtn).not.toHaveClass('is-active')
    await user.click(webSearchBtn)
    expect(webSearchBtn).toHaveClass('is-active')

    // 输入内容并发送
    const inputArea = screen.getByPlaceholderText(/请输入您的问题或描述症状/)
    await user.type(inputArea, '最新指南儿童支原体肺炎耐药用药')
    await user.click(screen.getByRole('button', { name: '发送' }))

    // 验证联网模式带前缀
    expect(compileDraftStream).toHaveBeenCalledWith(
      '【联网检索模式】最新指南儿童支原体肺炎耐药用药',
      'PERSONAL',
      expect.any(AbortSignal),
      expect.any(Function),
    )
    // 验证界面气泡展示联网检索标签
    expect(await screen.findByText('联网检索')).toBeInTheDocument()
  })

  it('collapses overflow chips into 更多 dropdown and selects an item', async () => {
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream: vi.fn(), reviseDraftStream: vi.fn() },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    // 前面 2 个直接展示，其余收拢入更多下拉
    expect(screen.getByRole('button', { name: '+ 成人风寒感冒' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ 急性上感对症' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ 慢支止咳化痰' })).not.toBeInTheDocument()

    // 点击 更多 ▾ 展开下拉菜单
    const moreBtn = screen.getByRole('button', { name: '更多 ▾' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(moreBtn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '+ 慢支止咳化痰' })).toBeInTheDocument()

    // 点击下拉菜单中的项目
    const overflowItem = screen.getByRole('menuitem', { name: '+ 血压升高初诊评估' })
    await user.click(overflowItem)

    // 验证填入输入框并关闭菜单
    const inputArea = screen.getByPlaceholderText(/请输入您的问题或描述症状/)
    expect(inputArea).toHaveValue('血压升高初诊评估')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // 再次点击更多展开，测试失去焦点后自动收缩
    await user.click(moreBtn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // 点击输入框使其失去焦点
    await user.click(inputArea)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('supports in-place catalog search and alignment for unmatched medication tasks', async () => {
    const compileDraftStream = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL', name: '扁桃体炎方案', narrative: '用药建议。',
      sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'MEDICATION', text: '阿莫西林胶囊', origin: 'SUGGESTED' },
      ],
    })
    const convertDraft = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL', name: '扁桃体炎方案',
      diagnoses: [{ code: 'J03.9', display: '急性扁桃体炎，未特指', type: 'PRIMARY' }],
      medications: [],
      services: [],
      tasks: [
        { kind: 'MEDICATION', text: '阿莫西林胶囊', origin: 'SUGGESTED', status: 'UNMATCHED', details: '缺少在库唯一规格' },
      ],
    })
    const searchMedicationProducts = vi.fn().mockResolvedValue(catalogPage([catalogProduct('prod-001', 'med-001', '阿莫西林胶囊 (哈药)')]))
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
      }) },
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream: vi.fn(), convertDraft },
      masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue(editorStandardsFixture()), searchMedicationProducts, searchMedications: vi.fn().mockResolvedValue(catalogPage([])) },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '急性扁桃体炎')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    await user.click(await screen.findByRole('button', { name: '确认方案并匹配院内目录' }))

    // 检查用药卡片中显示待对齐状态
    expect(await screen.findByText('待匹配目录')).toBeInTheDocument()
    expect(screen.getByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认存入方案池' })).toBeDisabled()

    // 点击对齐目录药品
    await user.click(screen.getByRole('button', { name: /对齐目录药品/ }))
    expect(searchMedicationProducts).toHaveBeenCalledWith('阿莫西林胶囊', '', 'ACTIVE', '', 0, 10)

    // 选用候选药品
    const chooseBtn = await screen.findByRole('button', { name: '选用' })
    await user.click(chooseBtn)

    const confirmation = within(screen.getByRole('dialog', { name: '确认药品用法与数量' }))
    const dose = confirmation.getByRole('spinbutton', { name: '单次剂量' })
    await waitFor(() => expect(dose).toBeEnabled())
    await user.type(dose, '0.5')
    await user.click(within(dose.closest<HTMLElement>('.ui-field')!).getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '克' }))
    await user.click(confirmation.getByRole('combobox', { name: '给药途径' }))
    await user.click(screen.getByRole('option', { name: '口服' }))
    await user.click(confirmation.getByRole('combobox', { name: '用药频次' }))
    await user.click(screen.getByRole('option', { name: '每日三次' }))
    await user.type(confirmation.getByRole('spinbutton', { name: '药品数量' }), '2')
    await user.click(confirmation.getByRole('button', { name: '确认加入方案' }))

    // 明确确认后才变为产品已对齐，保存按钮可用
    expect(await screen.findByText('产品已对齐')).toBeInTheDocument()
    expect(screen.getByText('阿莫西林胶囊 (哈药)')).toBeInTheDocument()
    expect(screen.queryByText('待匹配目录')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认存入方案池' })).toBeEnabled()
  })

  it('directly displays education and follow-up guidance text in editable textarea without tooltip', async () => {
    const compileDraftStream = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL',
      name: '小儿积食咳嗽方案',
      narrative: '诊断与评估：小儿功能性消化不良；健康宣教：饮食清淡易消化。',
      sourceType: 'AI_INPUT',
      reviewItems: [
        { kind: 'DIAGNOSIS', text: '小儿功能性消化不良 [K30]', origin: 'SUGGESTED' },
        { kind: 'EDUCATION', text: '饮食调整指导', details: '清淡易消化饮食，避免生冷油腻' },
        { kind: 'FOLLOW_UP', text: '病情监测与复诊', details: '3天后若症状未缓解请及时复诊' },
      ],
    })
    const convertDraft = vi.fn().mockResolvedValue({
      scopeType: 'PERSONAL',
      name: '小儿积食咳嗽方案',
      diagnoses: [{ code: 'K30', display: '小儿功能性消化不良', type: 'PRIMARY' }],
      medications: [],
      services: [],
      tasks: [],
    })
    const api = {
      clinicalAi: {
        capabilities: vi.fn().mockResolvedValue({
          mode: 'MODEL', available: true, model: 'qwen-test', features: ['PLAN_COMPILATION'],
        }),
      },
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream: vi.fn(), convertDraft },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '小儿积食咳嗽')
    await user.click(await screen.findByRole('button', { name: '发送' }))

    // 验证方案待审阅状态，且没有全文修订Tab与适用条件独立胶囊
    expect(await screen.findByText('方案待审阅')).toBeInTheDocument()
    expect(screen.queryByText('全文修订')).not.toBeInTheDocument()
    expect(screen.queryByText('适用条件')).not.toBeInTheDocument()

    // 验证宣教与随访项目直接展示可编辑文本框，而不是隐藏在 ⓘ 图标中
    expect(screen.getByRole('region', { name: '配套病历书写模板' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '随访复诊' })).toHaveValue('3天后若症状未缓解请及时复诊')
    expect(screen.queryByRole('button', { name: '查看 饮食调整指导 依据' })).not.toBeInTheDocument()

    const educationInput = screen.getByRole('textbox', { name: '健康宣教' })
    expect(educationInput).toHaveValue('清淡易消化饮食，避免生冷油腻')

    // 医生可以直接编辑宣教内容
    await user.clear(educationInput)
    await user.type(educationInput, '清淡饮食，少量多餐')
    expect(educationInput).toHaveValue('清淡饮食，少量多餐')

    // 进入系统方案核对
    await user.click(screen.getByRole('button', { name: '确认方案并匹配院内目录' }))
    expect(convertDraft).toHaveBeenCalledWith(
      '小儿积食咳嗽',
      expect.any(String),
      '小儿积食咳嗽方案',
      expect.arrayContaining([
        expect.objectContaining({ kind: 'EDUCATION', details: '清淡易消化饮食，避免生冷油腻' }),
      ]),
      'PERSONAL',
    )
    expect(screen.getByRole('textbox', { name: '健康宣教' })).toHaveValue('清淡饮食，少量多餐')
  })

  it('supports in-place manual adjustment for diagnoses, medication dosage, service quantity and additions', async () => {
    const editingTemplate: any = {
      id: 'tpl-001', status: 'ACTIVE', sortOrder: 0, useCount: 0,
      revision: 1,
      scopeType: 'PERSONAL',
      name: '轻症门诊方案',
      description: '适用成人轻症',
      sourceType: 'AI_INPUT',
      diagnoses: [
        { code: 'J06.9', display: '急性上呼吸道感染', type: 'PRIMARY' },
        { code: 'R50.9', display: '发热，未特指', type: 'SECONDARY' },
      ],
      medications: [
        {
          lineId: 'line-1', editorMode: 'regular', categoryCode: 'WESTERN', medicationCode: 'M1',
          medicationId: 'med-1',
          medicationName: '阿莫西林胶囊',
          preparationSpec: '0.25g',
          doseValue: 0.5,
          doseUnit: 'g',
          routeCode: 'PO',
          frequencyCode: 'TID',
          durationValue: 7,
          durationUnit: 'd',
          quantity: 2,
          quantityUnit: '盒',
          substitutionAllowed: true,
          selfProvided: false,
        },
      ],
      services: [
        {
          catalogItemId: 'srv-1',
          itemCode: '2501',
          itemName: '血常规',
          serviceType: 'LABORATORY',
          quantity: 1,
          unitCode: '次',
          pricingRequired: true,
        },
      ],
      tasks: [],
    }

    const update = vi.fn(async (_id, input) => ({ ...editingTemplate, ...input, revision: 2,
      medications: input.medications.map((item: object, index: number) => ({ ...item, lineId: `line-${index}`, editorMode: 'regular', categoryCode: 'WESTERN', medicationCode: `M${index}` })),
    }))
    const searchMedicationProducts = vi.fn().mockResolvedValue(catalogPage([catalogProduct('prod-002', 'med-002', '布洛芬缓释胶囊')]))
    const searchServices = vi.fn().mockResolvedValue(catalogPage([{ ...catalogService('srv-002', 'C反应蛋白测定', 'LABORATORY'), code: '2502' }]))
    const api = {
      clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true }) },
      outpatientPlanTemplates: { update },
      outpatientNoteTemplates: { create: vi.fn(async input => ({ ...maintainedNoteReceipt(input), id: 'note-linked' })) },
      masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue(editorStandardsFixture()), searchMedicationProducts, searchServices, searchMedications: vi.fn().mockResolvedValue(catalogPage([])) },
    } as unknown as RhnApi

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal organizationId="org" api={api} editingTemplate={editingTemplate} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()

    // 1. 验证核对界面使用了统一的分组标题与图标以及纯规格值徽标
    expect(screen.getByRole('region', { name: '诊断与评估' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '用药建议' })).toBeInTheDocument()
    expect(screen.getByText('0.25g')).toBeInTheDocument()
    expect(screen.queryByText(/主档规格/)).not.toBeInTheDocument()
    expect(screen.queryByText(/实际规格/)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '检验检查' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '配套病历书写模板' })).toBeInTheDocument()

    // 2. 诊断：设为主诊断
    const makePrimaryBtn = screen.getByRole('button', { name: '设为主诊断' })
    await user.click(makePrimaryBtn)
    // 验证发热变为主要诊断
    const feverRow = screen.getByText('发热，未特指').closest('article')!
    expect(feverRow).toHaveTextContent('主诊断')

    // 3. 用药：调整用法
    await user.click(screen.getByRole('button', { name: '调整用法' }))
    const durationInput = screen.getByRole('spinbutton', { name: '疗程' })
    await user.clear(durationInput)
    await user.type(durationInput, '5')
    await user.click(screen.getByRole('button', { name: '完成' }))
    // 验证更新后的疗程呈现
    expect(screen.getByText(/5d/)).toBeInTheDocument()

    // 4. 检验检查：调量
    await user.click(screen.getByRole('button', { name: '调量' }))
    const qtyInput = screen.getByRole('spinbutton', { name: '项目数量' })
    await user.clear(qtyInput)
    await user.type(qtyInput, '2')
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.getByText('2 次')).toBeInTheDocument()

    // 5. 手动添加目录药品
    await user.click(screen.getByRole('button', { name: '添加目录药品' }))
    const medInput = screen.getByPlaceholderText(/输入药品名称搜索目录产品/)
    await user.type(medInput, '布洛芬')
    await user.click(screen.getAllByRole('button', { name: '搜索' })[0])
    expect(await screen.findByText('布洛芬缓释胶囊')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选用' }))
    expect(await screen.findByRole('dialog', { name: '确认药品用法与数量' })).toHaveTextContent('布洛芬缓释胶囊')

    const confirmation = within(screen.getByRole('dialog', { name: '确认药品用法与数量' }))
    await user.type(confirmation.getByRole('spinbutton', { name: '药品数量' }), '2')
    await user.click(confirmation.getByRole('button', { name: '确认加入方案' }))

    // 6. 手动添加检验检查
    await user.click(screen.getByRole('button', { name: '添加检验/检查' }))
    const srvInput = screen.getByPlaceholderText(/输入项目名称搜索院内服务/)
    await user.type(srvInput, 'C反应蛋白')
    await user.click(screen.getAllByRole('button', { name: '搜索' })[0])
    expect(await screen.findByText('C反应蛋白测定')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选用' }))
    const serviceConfirmation = within(screen.getByRole('dialog', { name: '确认项目数量与说明' }))
    await user.type(serviceConfirmation.getByRole('spinbutton', { name: '项目数量' }), '1')
    await user.click(serviceConfirmation.getByRole('button', { name: '确认项目加入方案' }))

    // 宣教与随访进入配套病历模板，不创建第二套文字性方案任务。
    await user.type(screen.getByRole('textbox', { name: '健康宣教' }), '多饮温开水，保持通风')

    // 8. 确认保存调整
    await user.click(screen.getByRole('button', { name: '确认保存调整' }))
    await vi.waitFor(() => expect(update).toHaveBeenCalled())
    const addedMedication = update.mock.calls[0][1].medications.find((item: { medicationId: string }) => item.medicationId === 'med-002')
    for (const field of ['packageId', 'doseValue', 'routeCode', 'frequencyCode']) expect(addedMedication[field]).toBeUndefined()
    expect(addedMedication.quantity).toBe(2)
    expect(update.mock.calls[0][1].medications.find((item: { medicationId: string }) => item.medicationId === 'med-002').durationValue).toBeUndefined()
    expect(update).toHaveBeenCalledWith(
      'tpl-001',
      expect.objectContaining({
        diagnoses: expect.arrayContaining([
          expect.objectContaining({ code: 'R50.9', type: 'PRIMARY' }),
          expect.objectContaining({ code: 'J06.9', type: 'SECONDARY' }),
        ]),
        medications: expect.arrayContaining([
          expect.objectContaining({ medicationName: '阿莫西林胶囊', durationValue: 5 }),
          expect.objectContaining({ medicationName: '布洛芬缓释胶囊' }),
        ]),
        services: expect.arrayContaining([
          expect.objectContaining({ itemName: '血常规', quantity: 2 }),
          expect.objectContaining({ itemName: 'C反应蛋白测定' }),
        ]),
        noteTemplateId: 'note-linked',
      }),
    )
  })
})


it('keeps education in the document while removing the intended structured review row', async () => {
  const api = {
    clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true,
      features: ['PLAN_COMPILATION'] }) },
    outpatientPlanTemplates: { compileDraftStream: vi.fn().mockResolvedValue({ scopeType: 'PERSONAL',
      name: '问诊方案', narrative: '待审核的方案', sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'EDUCATION', text: '健康宣教', details: '注意休息，多饮水', origin: 'SUGGESTED' },
        { kind: 'DIAGNOSIS', text: '急性上呼吸道感染', origin: 'SUGGESTED' },
      ] }) },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AiPlanTemplateDraftModal organizationId="org" api={api}
    onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>)
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '问诊方案')
  await user.click(await screen.findByRole('button', { name: '发送' }))
  const plan = await screen.findByRole('region', { name: '诊疗方案内容' })
  expect(await within(plan).findByText('急性上呼吸道感染')).toBeInTheDocument()
  const note = screen.getByRole('region', { name: '病历书写内容' })
  expect(within(note).getByLabelText('健康宣教')).toHaveValue('注意休息，多饮水')
  await user.click(await within(plan).findByRole('button', { name: '移除 急性上呼吸道感染' }))
  expect(within(plan).queryByText('急性上呼吸道感染')).not.toBeInTheDocument()
  expect(within(note).getByLabelText('健康宣教')).toHaveValue('注意休息，多饮水')
})


it('buffers early treatment rows and keeps education and follow-up on the left throughout streaming', async () => {
  let beginNote!: () => void
  let finishNote!: () => void
  let finish!: (value: PlanTextDraft) => void
  const noteContent = { chiefComplaint: '咳嗽、咳痰3天', presentIllness: '患者3天前出现咳嗽、咳痰，无发热',
    medicalHistory: '既往体健', physicalExam: '双肺呼吸音粗', healthEducation: '注意休息', followUp: '症状加重复诊' }
  const items = [{ kind: 'DIAGNOSIS', name: '慢性支气管炎 [J42]' },
    { kind: 'EDUCATION', name: '生活方式宣教', details: '注意休息' },
    { kind: 'FOLLOW_UP', name: '复诊指征', details: '症状加重复诊' }]
  const api = {
    clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true,
      features: ['PLAN_COMPILATION'] }) },
    outpatientPlanTemplates: { compileDraftStream: vi.fn((_input, _scope, _signal, delta) => {
      delta('{"name":"慢性支气管炎方案","items":' + JSON.stringify(items))
      beginNote = () => delta(',"noteTemplateContent":' + JSON.stringify(noteContent).slice(0, -2))
      finishNote = () => delta('"},"narrative":"核对病历与诊疗方案')
      return new Promise<PlanTextDraft>((resolve) => { finish = resolve })
    }) },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AiPlanTemplateDraftModal organizationId="org" api={api}
    onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>)
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '慢性支气管炎')
  await user.click(await screen.findByRole('button', { name: '发送' }))
  const note = screen.getByRole('region', { name: '病历书写内容' })
  const plan = screen.getByRole('region', { name: '诊疗方案内容' })
  expect(within(plan).queryByText('慢性支气管炎 [J42]')).not.toBeInTheDocument()
  expect(within(note).getByLabelText('健康宣教')).toHaveValue('注意休息')
  expect(within(note).getByLabelText('随访复诊')).toHaveValue('症状加重复诊')
  await act(async () => beginNote())
  expect(within(plan).queryByText('慢性支气管炎 [J42]')).not.toBeInTheDocument()
  await act(async () => finishNote())
  expect(within(plan).getByText('慢性支气管炎 [J42]')).toBeInTheDocument()
  expect(within(plan).queryByText('生活方式宣教')).not.toBeInTheDocument()
  expect(within(plan).queryByText('复诊指征')).not.toBeInTheDocument()
  await act(async () => finish({ scopeType: 'PERSONAL', name: '慢性支气管炎方案', narrative: '核对病历与诊疗方案',
    sourceType: 'AI_INPUT', noteTemplateContent: noteContent,
    reviewItems: items.map(({ name, ...item }) => ({ ...item, kind: item.kind as PlanTextDraft['reviewItems'][number]['kind'], text: name, origin: 'SUGGESTED' })) }))
  expect(within(plan).queryByText('生活方式宣教')).not.toBeInTheDocument()
  expect(within(note).getByLabelText('健康宣教')).toHaveValue('注意休息')
  expect(within(note).queryByLabelText('过敏史补充')).not.toBeInTheDocument()
  expect(within(note).queryByLabelText('用药史')).not.toBeInTheDocument()
  expect(within(note).queryByLabelText('辅助检查结果')).not.toBeInTheDocument()
})

it('opens and mounts cleanly when editingTemplate has null tasks, null diagnoses, or null services', async () => {
  const editingTemplate: any = {
    id: 'tpl-sparse',
    revision: 1,
    scopeType: 'PERSONAL',
    name: '极简门诊方案',
    status: 'ACTIVE',
    sortOrder: 0,
    useCount: 0,
    sourceType: 'MANUAL',
    diagnoses: null,
    medications: null,
    services: null,
    tasks: null,
  }
  const api = {
    clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true }) },
    masterData: {
      clinicalMedicationStandards: vi.fn().mockResolvedValue(editorStandardsFixture()),
    },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <AiPlanTemplateDraftModal organizationId="org" api={api} editingTemplate={editingTemplate} onClose={vi.fn()} onSaved={vi.fn()} />
  </QueryClientProvider>)
  expect(screen.getByText('方案调整与明细微调')).toBeInTheDocument()
  expect(screen.getByDisplayValue('极简门诊方案')).toBeInTheDocument()
})

