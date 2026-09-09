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
