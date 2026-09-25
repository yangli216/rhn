import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/api'
import type { PlanTextDraft } from '../../../shared/api/outpatientPlanTemplatesApi'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'

describe('AiPlanTemplateDraftModal', () => {
  it('streams the narrative and then presents a compact clinical task checklist', async () => {
    let complete!: (value: PlanTextDraft) => void
    const compileDraftStream = vi.fn((_input, _scope, _signal, onDelta: (value: string) => void) => {
      onDelta('{"name":"成人上感方案","items":[{"kind":"DIAGNOSIS","name":"急性上呼吸道感染 [J06.9]","details":"结合症状核对"}],"narrative":"正在生成诊断与处置建议')
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
      <AiPlanTemplateDraftModal api={api} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '成人上感常用方案')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    expect(await screen.findByText(/正在生成诊断与处置建议/)).toBeInTheDocument()

    // 验证流式阶段：诊断输出完整后即刻分块呈现，并带 ICD-10 标准诊断徽标
    expect(await screen.findByText('急性上呼吸道感染 [J06.9]')).toBeInTheDocument()
    expect(screen.getByText('ICD-10 标准诊断')).toBeInTheDocument()

    await act(async () => complete({
      scopeType: 'PERSONAL', name: '成人上感方案', narrative: '诊断与评估：上呼吸道感染。',
      sourceType: 'AI_INPUT', reviewItems: [
        { kind: 'DIAGNOSIS', text: '急性上呼吸道感染 [J06.9]', origin: 'SUGGESTED', details: '结合症状核对' },
        { kind: 'LABORATORY', text: '血常规', origin: 'EXPLICIT', sourceQuote: '必要时查血常规' },
      ],
    }))
    expect(await screen.findByRole('region', { name: '临床方案审核清单' })).toBeInTheDocument()
    expect(screen.getByText('诊断与适用条件')).toBeInTheDocument()
    expect(screen.getByText('检验检查')).toBeInTheDocument()
    expect(screen.getByText('急性上呼吸道感染 [J06.9]')).toBeInTheDocument()
    expect(screen.getByText('结合症状核对')).toBeVisible()
    expect(screen.getByText('ICD-10 标准诊断')).toBeInTheDocument()
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
      <AiPlanTemplateDraftModal api={api} onClose={vi.fn()} onSaved={vi.fn()} />
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
        preparationSpec: '0.5g', doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL', frequencyCode: 'PRN',
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
      outpatientPlanTemplates: { compileDraftStream, reviseDraftStream, convertDraft },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <AiPlanTemplateDraftModal api={api} onClose={vi.fn()} onSaved={vi.fn()} />
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
      <AiPlanTemplateDraftModal api={api} onClose={vi.fn()} onSaved={vi.fn()} />
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
      <AiPlanTemplateDraftModal api={api} onClose={vi.fn()} onSaved={vi.fn()} />
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
      <AiPlanTemplateDraftModal api={api} onClose={vi.fn()} onSaved={vi.fn()} />
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
    const overflowItem = screen.getByRole('menuitem', { name: '+ 高血压门诊初诊' })
    await user.click(overflowItem)

    // 验证填入输入框并关闭菜单
    const inputArea = screen.getByPlaceholderText(/请输入您的问题或描述症状/)
    expect(inputArea).toHaveValue('高血压门诊初诊')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // 再次点击更多展开，测试失去焦点后自动收缩
    await user.click(moreBtn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // 点击输入框使其失去焦点
    await user.click(inputArea)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
