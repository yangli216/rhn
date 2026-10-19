import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalAiConfigurationView, RhnApi } from '../../shared/rhnApi'
import { AiConfigurationManagement } from './AiConfigurationManagement'

const configuration: ClinicalAiConfigurationView = {
  scope: 'TENANT', canManagePlatform: true, encryptionAvailable: true, encryptionKeyId: 'test-key',
  runtime: { mode: 'MODEL', assistantReady: true, modelReady: true, speechReady: false,
    knowledgeReady: false, provider: 'openai-compatible', model: 'clinical-v1' },
  settings: [
    { key: 'mode', group: '运行策略', name: 'AI运行模式', description: '运行模式', valueType: 'STRING',
      secret: false, effectiveValue: 'MODEL', sourceScope: 'PLATFORM', inherited: true,
      secretConfigured: false, overridePresent: false, overrideActive: false },
    { key: 'model', group: '模型服务', name: '临床模型标识', description: '模型名称', valueType: 'STRING',
      secret: false, effectiveValue: 'clinical-v1', sourceScope: 'TENANT', inherited: false,
      secretConfigured: false, overridePresent: true, overrideRevision: 3, overrideActive: true },
    { key: 'endpoint', group: '模型服务', name: '模型服务地址', description: '服务地址', valueType: 'STRING',
      secret: false, effectiveValue: 'https://ai.example/v1/chat/completions', sourceScope: 'PLATFORM', inherited: true,
      secretConfigured: false, overridePresent: false, overrideActive: false },
    { key: 'api-key', group: '模型服务', name: '模型服务 API Key', description: '访问凭据', valueType: 'STRING',
      secret: true, effectiveValue: null, sourceScope: 'PLATFORM', inherited: true,
      secretConfigured: true, overridePresent: false, overrideActive: false },
  ],
}

describe('AiConfigurationManagement', () => {
  it.each([
    ['MODEL', '测试模型连接', undefined], ['MODEL', '测试模型连接', 90],
    ['SPEECH', '测试语音连接', undefined], ['SPEECH', '测试语音连接', 90],
    ['KNOWLEDGE', '测试临床知识库连接', undefined], ['KNOWLEDGE', '测试临床知识库连接', 90],
  ] as const)('passes the configured timeout or defers to the server for %s (%s, %s)', async (target, button, timeout) => {
    const user = userEvent.setup()
    const settings: ClinicalAiConfigurationView['settings'] = [...configuration.settings,
      ...[['voice-enabled', '语音能力'], ['knowledge-enabled', '知识能力']].map(([key, group]) => ({
        key, group, name: key, description: '', valueType: 'BOOLEAN' as const,
        secret: false, effectiveValue: true, sourceScope: 'PLATFORM' as const, inherited: true,
        secretConfigured: false, overridePresent: false, overrideActive: false,
      })),
    ]
    if (timeout !== undefined) settings.push({
      key: 'request-timeout-seconds', group: '模型服务', name: '请求超时', description: '', valueType: 'NUMBER',
      secret: false, effectiveValue: timeout, sourceScope: 'TENANT', inherited: false,
      secretConfigured: false, overridePresent: true, overrideRevision: 1, overrideActive: true,
    })
    const test = vi.fn().mockResolvedValue({ target, success: false, statusCode: 504, latencyMs: 0, message: '模拟超时' })
    const api = { clinicalAi: {
      administrationConfiguration: vi.fn().mockResolvedValue({ ...configuration, settings }),
      testAdministrationConfiguration: test,
    } } as unknown as RhnApi
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiConfigurationManagement api={api} />
    </QueryClientProvider>)
    await user.click(await screen.findByRole('button', { name: button }))
    await waitFor(() => expect(test).toHaveBeenCalledWith(expect.objectContaining({ target, timeoutSeconds: timeout })))
  })

  it.each([undefined, 17])('uses independent Jev settings and preserves timeout %s for a synthetic connection test', async (timeout) => {
    const user = userEvent.setup()
    const pilot = { ...configuration, settings: [...configuration.settings,
      ...[
        ['decision-mode', '决策总开关', 'DISABLED', false],
        ['decision-model', 'Jev 模型标识', 'jev-1.13.0', false],
        ['decision-endpoint', 'Jev 服务地址', 'https://api.typesafe.ai/v1/systemone', false],
        ['decision-api-key', 'Jev API Key', null, true],
      ].map(([key, name, effectiveValue, secret]) => ({
        key: String(key), name: String(name), group: '决策公共配置', description: '目录匹配', valueType: 'STRING',
        secret: Boolean(secret), effectiveValue, sourceScope: 'DEPLOYMENT', inherited: false,
        secretConfigured: false, overridePresent: false, overrideActive: false,
      }))],
    } as ClinicalAiConfigurationView
    if (timeout !== undefined) pilot.settings.push({
      key: 'decision-timeout-seconds', group: '决策公共配置', name: '决策请求超时', description: '', valueType: 'NUMBER',
      secret: false, effectiveValue: timeout, sourceScope: 'TENANT', inherited: false,
      secretConfigured: false, overridePresent: true, overrideRevision: 1, overrideActive: true,
    })
    const test = vi.fn().mockResolvedValue({ target: 'DECISION', success: true, statusCode: 200,
      latencyMs: 12, message: 'Jev 连接通过，使用虚构目录' })
    const api = { clinicalAi: {
      administrationConfiguration: vi.fn().mockResolvedValue(pilot),
      testAdministrationConfiguration: test,
    } } as unknown as RhnApi
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiConfigurationManagement api={api} />
    </QueryClientProvider>)
    await user.type(await screen.findByPlaceholderText('输入 API Key'), 'independent-test-key')
    await user.click(screen.getByRole('button', { name: '测试 Jev 连接' }))
    await waitFor(() => expect(test).toHaveBeenCalledWith({ scope: 'TENANT', target: 'DECISION',
      endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0',
      secretValue: 'independent-test-key', timeoutSeconds: timeout }))
    expect(await screen.findByText(/Jev 连接通过，使用虚构目录/)).toBeInTheDocument()
  })
  it('saves a business scene independently while retaining the shared master configuration', async () => {
    const user = userEvent.setup()
    const scenes = { ...configuration, settings: [...configuration.settings,
      { key: 'decision-mode', name: '决策总开关', group: '决策公共配置', valueType: 'STRING',
        effectiveValue: 'ASSIST', secret: false, inherited: true, sourceScope: 'PLATFORM',
        secretConfigured: false, overridePresent: false, overrideActive: false, description: '共享配置' },
      ...[['assistant-recommendations', '辅诊建议', true], ['plan-compilation', '智能建方', false]].map(
        ([key, name, effectiveValue]) => ({ key: `decision-scene-${key}-enabled`, name: String(name),
          group: '决策业务场景', valueType: 'BOOLEAN', effectiveValue, secret: false,
          inherited: true, sourceScope: 'PLATFORM', secretConfigured: false, overridePresent: false,
          overrideActive: false, description: '受总开关控制' }))],
    } as ClinicalAiConfigurationView
    const update = vi.fn().mockResolvedValue(scenes)
    const api = { clinicalAi: { administrationConfiguration: vi.fn().mockResolvedValue(scenes),
      updateAdministrationConfiguration: update } } as unknown as RhnApi
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiConfigurationManagement api={api} />
    </QueryClientProvider>)
    const plan = await screen.findByRole('switch', { name: '智能建方' })
    expect(plan).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: '辅诊建议' })).toHaveAttribute('aria-checked', 'true')
    await user.click(plan)
    await user.click(screen.getByRole('button', { name: '保存变更' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('TENANT', [
      { key: 'decision-scene-plan-compilation-enabled', value: true, expectedRevision: undefined },
    ], 'AI 配置页面人工维护'))
  })
  it('keeps existing secrets blank and submits only changed values', async () => {
    const user = userEvent.setup()
    const update = vi.fn().mockResolvedValue(configuration)
    const api = { clinicalAi: {
      administrationConfiguration: vi.fn().mockResolvedValue(configuration),
      updateAdministrationConfiguration: update,
    } } as unknown as RhnApi
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AiConfigurationManagement api={api} />
    </QueryClientProvider>)

    const secret = await screen.findByPlaceholderText('已配置，留空保持不变')
    expect(secret).toHaveValue('')
    const model = screen.getByDisplayValue('clinical-v1')
    await user.clear(model)
    await user.type(model, 'clinical-v2')
    await user.click(screen.getByRole('button', { name: '保存变更' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('TENANT', [
      { key: 'model', value: 'clinical-v2', expectedRevision: 3 },
    ], 'AI 配置页面人工维护'))
    expect(update.mock.calls[0][1][0]).not.toHaveProperty('secretValue')
  })
})
