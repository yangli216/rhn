import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  errorMessage, type ClinicalAiConfigurationScope, type ClinicalAiConfigurationSetting,
  type ClinicalAiConfigurationUpdate, type RhnApi,
} from '../../shared/rhnApi'
import { Alert, Button, FormField, Icon, LoadingState, PageHeader, Panel, PanelHead, Select, StatusBadge } from '../../shared/ui'

type DraftValue = string | number | boolean

const MODE_OPTIONS = [
  { value: 'DISABLED', label: '关闭' },
  { value: 'LOCAL_ASSIST', label: '本地规则辅助' },
  { value: 'MODEL', label: '模型辅助' },
]

const LIMITS: Record<string, { min: number; max: number }> = {
  'request-timeout-seconds': { min: 5, max: 120 },
  'max-output-tokens': { min: 512, max: 8000 },
  'suggestion-ttl-minutes': { min: 5, max: 240 },
  'rollout-percentage': { min: 0, max: 100 },
  'voice-max-audio-mb': { min: 1, max: 20 },
  'knowledge-max-results': { min: 1, max: 10 },
}

export function AiConfigurationManagement({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<ClinicalAiConfigurationScope>('TENANT')
  const [draft, setDraft] = useState<Record<string, DraftValue>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [resetKeys, setResetKeys] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const query = useQuery({
    queryKey: ['clinical-ai-administration', scope],
    queryFn: () => api.clinicalAi.administrationConfiguration(scope),
  })

  useEffect(() => {
    if (!query.data) return
    setDraft(Object.fromEntries(query.data.settings.filter((item) => !item.secret)
      .map((item) => [item.key, normalizeValue(item)])))
    setSecrets({})
    setResetKeys(new Set())
  }, [query.data])

  const original = useMemo(() => Object.fromEntries((query.data?.settings ?? [])
    .filter((item) => !item.secret).map((item) => [item.key, normalizeValue(item)])), [query.data])
  const updates = useMemo(() => buildUpdates(query.data?.settings ?? [], original, draft, secrets, resetKeys),
    [draft, original, query.data?.settings, resetKeys, secrets])
  const save = useMutation({
    mutationFn: () => api.clinicalAi.updateAdministrationConfiguration(scope, updates, 'AI 配置页面人工维护'),
    onSuccess: async (next) => {
      queryClient.setQueryData(['clinical-ai-administration', scope], next)
      setFeedback('AI 配置已保存并立即生效')
      setOperationError('')
      setSecrets({})
      setResetKeys(new Set())
      await queryClient.invalidateQueries({ queryKey: ['clinical-ai-administration'] })
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })

  function switchScope(next: ClinicalAiConfigurationScope) {
    setScope(next)
    setFeedback('')
    setOperationError('')
  }

  function resetOverride(setting: ClinicalAiConfigurationSetting) {
    setResetKeys((current) => new Set(current).add(setting.key))
    setSecrets((current) => ({ ...current, [setting.key]: '' }))
  }

  if (query.isPending) return <LoadingState label="正在加载 AI 配置…" />
  const data = query.data
  const groups = Array.from(new Set(data?.settings.map((item) => item.group) ?? []))

  return <>
    <PageHeader compact eyebrow="系统配置 · 临床智能" title="AI 助理配置"
      description="统一维护平台默认与租户覆盖参数，配置保存后立即作用于新的诊疗请求。"
      actions={<Button disabled={!updates.length || save.isPending || !data?.encryptionAvailable}
        busy={save.isPending} onClick={() => save.mutate()}>
        <Icon name="check" />保存变更
      </Button>} />

    {(operationError || query.error) && <Alert>{operationError || errorMessage(query.error)}</Alert>}
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {!data?.encryptionAvailable && <Alert>服务端未配置密钥加密主密钥，AI 配置暂不可写。</Alert>}

    <div className="ai-config-scope" role="group" aria-label="配置作用域">
      <button type="button" className={scope === 'TENANT' ? 'is-active' : ''} onClick={() => switchScope('TENANT')}>
        当前租户
      </button>
      <button type="button" className={scope === 'PLATFORM' ? 'is-active' : ''}
        disabled={!data?.canManagePlatform} onClick={() => switchScope('PLATFORM')}>平台默认</button>
    </div>

    {data && <div className="ai-config-workspace">
      <Panel className="ai-config-status">
        <PanelHead title="运行状态" meta={data.runtime.provider} />
        <div className="ai-config-status__body">
          <ReadinessRow label="诊疗助理" ready={data.runtime.assistantReady} />
          <ReadinessRow label="模型生成" ready={data.runtime.modelReady} />
          <ReadinessRow label="语音转写" ready={data.runtime.speechReady} />
          <ReadinessRow label="知识检索" ready={data.runtime.knowledgeReady} />
          <dl className="ai-config-facts">
            <div><dt>运行模式</dt><dd>{modeLabel(data.runtime.mode)}</dd></div>
            <div><dt>当前模型</dt><dd>{data.runtime.model || '未配置'}</dd></div>
            <div><dt>密钥版本</dt><dd>{data.encryptionKeyId}</dd></div>
          </dl>
        </div>
      </Panel>

      <Panel className="ai-config-editor">
        <PanelHead title={scope === 'TENANT' ? '租户参数' : '平台默认参数'} meta={`${updates.length} 项待保存`} />
        <div className="ai-config-editor__body">
          {groups.map((group) => <section className="ai-config-group" key={group}>
            <h3>{group}</h3>
            <div className="ai-config-fields">
              {data.settings.filter((item) => item.group === group).map((setting) =>
                <SettingField key={setting.key} setting={setting} value={draft[setting.key]}
                  secretValue={secrets[setting.key] ?? ''} reset={resetKeys.has(setting.key)}
                  onChange={(value) => {
                    setDraft((current) => ({ ...current, [setting.key]: value }))
                    setResetKeys((current) => without(current, setting.key))
                  }}
                  onSecretChange={(value) => {
                    setSecrets((current) => ({ ...current, [setting.key]: value }))
                    setResetKeys((current) => without(current, setting.key))
                  }}
                  onReset={() => resetOverride(setting)} />)}
            </div>
          </section>)}
        </div>
      </Panel>

      <Panel className="ai-config-governance">
        <PanelHead title="作用域与治理" />
        <div className="ai-config-governance__body">
          <div className="ai-config-governance__scope"><Icon name="lock" />
            <div><strong>仅平台与租户</strong><span>机构、科室和业务人员级覆盖已被后端禁止。</span></div>
          </div>
          <div className="ai-config-governance__scope"><Icon name="credential" />
            <div><strong>AES-256-GCM</strong><span>API Key 使用随机 nonce 与作用域绑定加密，接口不返回明文。</span></div>
          </div>
          <div className="ai-config-source-list">
            {data.settings.map((item) => <div key={item.key}>
              <span>{item.name}</span>
              <StatusBadge tone={item.inherited ? 'info' : item.sourceScope === 'DEPLOYMENT' ? 'neutral' : 'success'}>
                {sourceLabel(item.sourceScope, item.inherited)}
              </StatusBadge>
            </div>)}
          </div>
        </div>
      </Panel>
    </div>}
  </>
}

function SettingField({ setting, value, secretValue, reset, onChange, onSecretChange, onReset }: {
  setting: ClinicalAiConfigurationSetting
  value?: DraftValue
  secretValue: string
  reset: boolean
  onChange: (value: DraftValue) => void
  onSecretChange: (value: string) => void
  onReset: () => void
}) {
  const control = setting.secret
    ? <input className="ui-input" type="password" autoComplete="new-password" value={secretValue}
      placeholder={setting.secretConfigured ? '已配置，留空保持不变' : '输入 API Key'} onChange={(event) => onSecretChange(event.target.value)} />
    : setting.key === 'mode'
      ? <Select aria-label={setting.name} searchable={false} clearable={false} options={MODE_OPTIONS}
        value={String(value ?? '')} onChange={(next) => onChange(next)} />
      : setting.valueType === 'BOOLEAN'
        ? <label className="ai-config-switch"><input type="checkbox" checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)} /><span>{value ? '已启用' : '已停用'}</span></label>
        : setting.valueType === 'NUMBER'
          ? <input className="ui-input" type="number" value={Number(value ?? 0)} {...LIMITS[setting.key]}
            onChange={(event) => onChange(Number(event.target.value))} />
          : <input className="ui-input" type="text" value={String(value ?? '')}
            onChange={(event) => onChange(event.target.value)} />
  return <div className={`ai-config-field ${setting.secret ? 'is-secret' : ''} ${reset ? 'is-reset' : ''}`}>
    <FormField label={setting.name} hint={setting.description}>{control}</FormField>
    <div className="ai-config-field__meta">
      <span>{reset ? '保存后恢复上级值' : sourceLabel(setting.sourceScope, setting.inherited)}</span>
      {setting.overridePresent && !reset && <button type="button" onClick={onReset}>
        <Icon name="refresh" />恢复{setting.sourceScope === 'TENANT' ? '继承' : '默认'}
      </button>}
    </div>
  </div>
}

function ReadinessRow({ label, ready }: { label: string; ready: boolean }) {
  return <div className="ai-config-readiness"><span>{label}</span>
    <StatusBadge tone={ready ? 'success' : 'neutral'}>{ready ? '就绪' : '未就绪'}</StatusBadge></div>
}

function normalizeValue(setting: ClinicalAiConfigurationSetting): DraftValue {
  if (setting.valueType === 'BOOLEAN') return Boolean(setting.effectiveValue)
  if (setting.valueType === 'NUMBER') return Number(setting.effectiveValue ?? 0)
  return String(setting.effectiveValue ?? '')
}

function buildUpdates(settings: ClinicalAiConfigurationSetting[], original: Record<string, DraftValue>,
  draft: Record<string, DraftValue>, secrets: Record<string, string>, resetKeys: Set<string>) {
  const updates: ClinicalAiConfigurationUpdate[] = []
  settings.forEach((setting) => {
    if (resetKeys.has(setting.key)) {
      updates.push({ key: setting.key, clearOverride: true, expectedRevision: setting.overrideRevision })
    } else if (setting.secret) {
      if (secrets[setting.key]?.trim()) updates.push({ key: setting.key,
        secretValue: secrets[setting.key].trim(), expectedRevision: setting.overrideRevision })
    } else if (draft[setting.key] !== original[setting.key]) {
      updates.push({ key: setting.key, value: draft[setting.key], expectedRevision: setting.overrideRevision })
    }
  })
  return updates
}

function without(values: Set<string>, key: string) {
  const next = new Set(values)
  next.delete(key)
  return next
}

function sourceLabel(scope: ClinicalAiConfigurationSetting['sourceScope'], inherited: boolean) {
  if (scope === 'DEPLOYMENT') return '部署默认'
  if (scope === 'DEFAULT') return '参数默认'
  if (scope === 'PLATFORM') return inherited ? '继承平台' : '平台覆盖'
  return '租户覆盖'
}

function modeLabel(mode: string) {
  return MODE_OPTIONS.find((item) => item.value === mode)?.label ?? mode
}
