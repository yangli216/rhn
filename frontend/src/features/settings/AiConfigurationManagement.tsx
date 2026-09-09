import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  errorMessage, type ClinicalAiConfigurationScope, type ClinicalAiConfigurationSetting,
  type ClinicalAiConfigurationTestResult, type ClinicalAiConfigurationUpdate, type RhnApi,
} from '../../shared/rhnApi'
import {
  Alert, Button, FormField, Icon, type IconName, LoadingState, PageHeader, Panel, PanelHead, StatusBadge, Switch, Tabs
} from '../../shared/ui'

type DraftValue = string | number | boolean

const GROUP_PRIMARY_TOGGLES: Record<string, string> = {
  '语音能力': 'voice-enabled',
  '知识能力': 'knowledge-enabled',
}

const MODE_OPTIONS = [
  { value: 'DISABLED', label: '关闭' },
  { value: 'LOCAL_ASSIST', label: '本地规则辅助' },
  { value: 'MODEL', label: '模型辅助' },
]

const MODE_METAS: Record<string, { label: string; desc: string; icon: IconName; tone: string }> = {
  DISABLED: { label: '已关闭', desc: '完全停用 AI 智能辅助，不产生外部调用与算力消耗', icon: 'close', tone: 'neutral' },
  LOCAL_ASSIST: { label: '本地规则辅助', desc: '基于内置临床指南与规约知识库秒级推荐，零外部依赖', icon: 'clinical', tone: 'success' },
  MODEL: { label: '大模型辅助', desc: '调用大语言模型进行高阶方案推演、处方预检与语义智能生成', icon: 'sparkles', tone: 'brand' },
}

const LIMITS: Record<string, { min: number; max: number; step?: number }> = {
  'request-timeout-seconds': { min: 5, max: 120, step: 1 },
  'max-output-tokens': { min: 512, max: 8000, step: 128 },
  'suggestion-ttl-minutes': { min: 5, max: 240, step: 5 },
  'rollout-percentage': { min: 0, max: 100, step: 5 },
  'voice-max-audio-mb': { min: 1, max: 20, step: 1 },
  'knowledge-max-results': { min: 1, max: 10, step: 1 },
}

const UNITS: Record<string, string> = {
  'request-timeout-seconds': '秒 (s)',
  'max-output-tokens': 'Tokens',
  'suggestion-ttl-minutes': '分钟',
  'rollout-percentage': '%',
  'voice-max-audio-mb': 'MB',
  'knowledge-max-results': '条',
}

const GROUP_ICONS: Record<string, IconName> = {
  '运行策略': 'roadmap',
  '模型服务': 'sparkles',
  '临床治理': 'clinical',
  '语音能力': 'face',
  '知识能力': 'residents',
}

const MODEL_PRESETS = [
  {
    name: 'DeepSeek-V3 / R1 (官方开放平台)',
    desc: '高性价比推理模型，60s / 4096 tokens',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    timeout: 60,
    maxTokens: 4096,
  },
  {
    name: 'Qwen-2.5 医疗定制 (阿里百炼平台)',
    desc: '中文临床语义推理，45s / 3000 tokens',
    model: 'qwen-plus',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    timeout: 45,
    maxTokens: 3000,
  },
  {
    name: '智谱 GLM-4 (清言大模型开放平台)',
    desc: '医疗通用知识问答，45s / 4096 tokens',
    model: 'glm-4',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    timeout: 45,
    maxTokens: 4096,
  },
  {
    name: '本地私有化部署 (Ollama / vLLM 局域网)',
    desc: '医院内网私有部署，零外网数据出境',
    model: 'qwen2.5:72b',
    endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    timeout: 60,
    maxTokens: 4096,
  },
]

export function AiConfigurationManagement({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<ClinicalAiConfigurationScope>('TENANT')
  const [draft, setDraft] = useState<Record<string, DraftValue>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [resetKeys, setResetKeys] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, ClinicalAiConfigurationTestResult | null>>({})
  const [governanceCollapsed, setGovernanceCollapsed] = useState(true)

  const testModel = useMutation({
    mutationFn: () => api.clinicalAi.testAdministrationConfiguration({
      scope,
      target: 'MODEL',
      endpoint: typeof draft['endpoint'] === 'string' ? draft['endpoint'] : undefined,
      model: typeof draft['model'] === 'string' ? draft['model'] : undefined,
      secretValue: secrets['api-key'] || undefined,
      timeoutSeconds: typeof draft['request-timeout-seconds'] === 'number' ? draft['request-timeout-seconds'] : 15,
    }),
    onSuccess: (res) => {
      setTestResult((prev) => ({ ...prev, MODEL: res }))
      if (res.success) {
        setTimeout(() => {
          setTestResult((prev) => (prev.MODEL?.success ? { ...prev, MODEL: null } : prev))
        }, 3500)
      }
    },
    onError: (err) => {
      setTestResult((prev) => ({
        ...prev,
        MODEL: {
          target: 'MODEL',
          success: false,
          statusCode: 0,
          latencyMs: 0,
          message: `测试请求执行失败：${errorMessage(err)}`,
        },
      }))
    },
  })

  const testSpeech = useMutation({
    mutationFn: () => api.clinicalAi.testAdministrationConfiguration({
      scope,
      target: 'SPEECH',
      endpoint: typeof draft['speech-endpoint'] === 'string' ? draft['speech-endpoint'] : undefined,
      model: typeof draft['speech-model'] === 'string' ? draft['speech-model'] : undefined,
      secretValue: secrets['api-key'] || undefined,
      timeoutSeconds: typeof draft['request-timeout-seconds'] === 'number' ? draft['request-timeout-seconds'] : 15,
    }),
    onSuccess: (res) => {
      setTestResult((prev) => ({ ...prev, SPEECH: res }))
      if (res.success) {
        setTimeout(() => {
          setTestResult((prev) => (prev.SPEECH?.success ? { ...prev, SPEECH: null } : prev))
        }, 3500)
      }
    },
    onError: (err) => {
      setTestResult((prev) => ({
        ...prev,
        SPEECH: {
          target: 'SPEECH',
          success: false,
          statusCode: 0,
          latencyMs: 0,
          message: `测试请求执行失败：${errorMessage(err)}`,
        },
      }))
    },
  })

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
      setFeedback('AI 配置已成功保存并立即生效')
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
    setTestResult({})
  }

  function resetOverride(setting: ClinicalAiConfigurationSetting) {
    setResetKeys((current) => new Set(current).add(setting.key))
    setSecrets((current) => ({ ...current, [setting.key]: '' }))
  }

  function handleDiscard() {
    if (!query.data) return
    setDraft(Object.fromEntries(query.data.settings.filter((item) => !item.secret)
      .map((item) => [item.key, normalizeValue(item)])))
    setSecrets({})
    setResetKeys(new Set())
    setTestResult({})
    setFeedback('已放弃未保存的修改，恢复原配置值')
  }

  function applyModelPreset(preset: typeof MODEL_PRESETS[number]) {
    setDraft((current) => ({
      ...current,
      model: preset.model,
      endpoint: preset.endpoint,
      'request-timeout-seconds': preset.timeout,
      'max-output-tokens': preset.maxTokens,
    }))
    setResetKeys((current) => {
      const next = new Set(current)
      next.delete('model')
      next.delete('endpoint')
      next.delete('request-timeout-seconds')
      next.delete('max-output-tokens')
      return next
    })
    setPresetMenuOpen(false)
    setFeedback(`已填入【${preset.name}】推荐参数模板，确认后可点击右上角保存`)
  }

  function copyKeyId(text: string) {
    navigator.clipboard?.writeText(text)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  if (query.isPending) return <LoadingState label="正在加载 AI 助理配置…" />
  const data = query.data
  const groups = Array.from(new Set(data?.settings.map((item) => item.group) ?? []))

  const stats = {
    total: data?.settings.length ?? 0,
    deployment: data?.settings.filter((s) => s.sourceScope === 'DEPLOYMENT').length ?? 0,
    platform: data?.settings.filter((s) => s.sourceScope === 'PLATFORM' && !s.inherited).length ?? 0,
    inheritedPlatform: data?.settings.filter((s) => s.sourceScope === 'PLATFORM' && s.inherited).length ?? 0,
    tenant: data?.settings.filter((s) => s.sourceScope === 'TENANT').length ?? 0,
    overridden: (data?.settings ?? []).filter((s) => s.overridePresent),
  }

  const overallReady = data?.runtime.mode === 'DISABLED'
    ? 'DISABLED'
    : data?.runtime.mode === 'LOCAL_ASSIST'
      ? 'READY_LOCAL'
      : (data?.runtime.modelReady && data?.runtime.assistantReady)
        ? 'READY_MODEL'
        : 'NEEDS_CONFIG'

  return <div className="ai-config-page">
    <PageHeader
      compact
      eyebrow="系统配置 · 智能引擎"
      title="AI 助理配置中心"
      description="统一治理平台全局基线与租户个性化参数。敏感凭据由 AES-256-GCM 加密，热加载配置保存后立即生效。"
      actions={<div className="ai-config-actions">
        {updates.length > 0 && <>
          <span className="ai-config-dirty-badge" title="有尚未提交到服务端的配置变更">
            <span className="ai-config-dirty-dot" />
            已修改 {updates.length} 项参数
          </span>
          <Button variant="secondary" onClick={handleDiscard}>
            <Icon name="refresh" />放弃修改
          </Button>
        </>}
        <Button
          disabled={!updates.length || save.isPending || !data?.encryptionAvailable}
          busy={save.isPending}
          onClick={() => save.mutate()}
        >
          <Icon name="check" />保存变更
        </Button>
      </div>}
    />

    {(operationError || query.error) && <Alert>{operationError || errorMessage(query.error)}</Alert>}
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {!data?.encryptionAvailable && <Alert>服务端未配置密钥加密主密钥，AI 敏感配置暂不可写。</Alert>}

    <Tabs<ClinicalAiConfigurationScope>
      value={scope}
      onChange={switchScope}
      label="AI配置作用域"
      variant="workspace"
      className="ai-config-tabs"
      actions={<div className="ai-config-scope-tip">
        <Icon name="info" />
        <span>
          {scope === 'TENANT'
            ? '当前处于【租户作用域】：优先使用当前机构定制值，未覆盖项自动继承平台默认基线。'
            : '当前处于【平台作用域】：维护所有机构租户的默认基线参数，修改将影响所有未覆盖的租户。'}
        </span>
      </div>}
      items={[
        {
          value: 'TENANT',
          label: <span className="ai-config-tab-label">
            <Icon name="hospital" />
            <span>当前租户覆盖</span>
            {stats.tenant > 0 && <span className="ai-config-tab-badge">{stats.tenant}项定制</span>}
          </span>,
        },
        {
          value: 'PLATFORM',
          label: <span className="ai-config-tab-label">
            <Icon name="organization" />
            <span>平台默认基线</span>
            {stats.platform > 0 && <span className="ai-config-tab-badge">{stats.platform}项覆盖</span>}
          </span>,
          disabled: !data?.canManagePlatform,
        },
      ]}
    />

    {data && <div className="ai-config-workspace">
      {/* 1. 左侧栏：运行状态与健康诊断 */}
      <Panel className="ai-config-status">
        <PanelHead title="运行状态与诊断" meta={data.runtime.provider || 'AI Engine'} />
        <div className="ai-config-status__body">
          {/* 整体引擎健康横幅 */}
          <div className={`ai-config-hero-status tone-${overallReady.toLowerCase()}`}>
            <div className="ai-config-hero-status__indicator">
              <span className="ai-config-pulse-dot" />
              <strong>
                {overallReady === 'READY_MODEL' && '大模型辅助 · 全量就绪'}
                {overallReady === 'READY_LOCAL' && '本地规则 · 离线就绪'}
                {overallReady === 'NEEDS_CONFIG' && '配置待就绪 · 需填写端点'}
                {overallReady === 'DISABLED' && 'AI 引擎 · 策略已停用'}
              </strong>
            </div>
            <p className="ai-config-hero-status__desc">
              {overallReady === 'READY_MODEL' && 'OpenAI 协议模型网关握手正常，具备完整推演能力。'}
              {overallReady === 'READY_LOCAL' && '基于内置临床规约知识库运行，零外部网络依赖。'}
              {overallReady === 'NEEDS_CONFIG' && '模型服务地址或 API Key 尚未配置完成。'}
              {overallReady === 'DISABLED' && '接诊台与工作站当前不触发任何 AI 建议。'}
            </p>
          </div>

          {/* 核心能力四维雷达状态 */}
          <div className="ai-config-readiness-group">
            <div className="ai-config-readiness-title">核心能力就绪度</div>
            <ReadinessRow
              label="智能诊疗助理"
              icon="sparkles"
              ready={data.runtime.assistantReady}
              detail={data.runtime.assistantReady ? '门诊工作站交互就绪' : '未就绪或已关闭'}
            />
            <ReadinessRow
              label="大模型推理"
              icon="clinical"
              ready={data.runtime.modelReady}
              detail={data.runtime.modelReady ? (data.runtime.model || '已就绪') : '端点或模型未就绪'}
            />
            <ReadinessRow
              label="语音转写 ASR"
              icon="face"
              ready={data.runtime.speechReady}
              detail={data.runtime.speechReady ? '音频转录服务可用' : '未启用或端点无效'}
            />
            <ReadinessRow
              label="人卫知识检索"
              icon="roadmap"
              ready={data.runtime.knowledgeReady}
              detail={data.runtime.knowledgeReady ? '医学知识库在线' : '未启用或端点无效'}
            />
          </div>

          {/* 底层规格参数卡片 */}
          <div className="ai-config-runtime-specs">
            <div className="ai-config-runtime-spec-row">
              <span>生效模式</span>
              <StatusBadge tone={data.runtime.mode === 'DISABLED' ? 'neutral' : 'success'}>
                {modeLabel(data.runtime.mode)}
              </StatusBadge>
            </div>
            <div className="ai-config-runtime-spec-row">
              <span>当前模型</span>
              <code className="ai-config-code-pill" title={data.runtime.model || '未配置'}>
                {data.runtime.model || '未配置'}
              </code>
            </div>
            <div className="ai-config-runtime-spec-row">
              <span>密文安全版本</span>
              <div className="ai-config-key-copy">
                <code className="ai-config-code-pill" title={data.encryptionKeyId}>
                  {data.encryptionKeyId}
                </code>
                <button
                  type="button"
                  className="ai-config-mini-copy-btn"
                  onClick={() => copyKeyId(data.encryptionKeyId)}
                  title="复制密钥版本号"
                >
                  <Icon name={copiedKey ? 'check' : 'copy'} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* 2. 中间主配置区 */}
      <Panel className="ai-config-editor">
        <PanelHead
          title={scope === 'TENANT' ? '租户参数维护' : '平台全局默认参数'}
          meta={updates.length > 0 ? `${updates.length} 项变更待保存` : '参数已同步'}
        />
        <div className="ai-config-editor__body">
          {groups.map((group) => {
            const groupSettings = data.settings.filter((item) => item.group === group)
            const primaryToggleKey = GROUP_PRIMARY_TOGGLES[group]
            const primarySetting = primaryToggleKey ? groupSettings.find((item) => item.key === primaryToggleKey) : undefined
            const childSettings = primaryToggleKey ? groupSettings.filter((item) => item.key !== primaryToggleKey) : groupSettings
            const isGroupEnabled = primarySetting ? Boolean(draft[primaryToggleKey] ?? primarySetting.effectiveValue) : true

            return <section className={`ai-config-group-card ${!isGroupEnabled ? 'is-disabled-group' : ''}`} key={group}>
              <div className="ai-config-group-card__head">
                <div className="ai-config-group-card__title">
                  <span className="ai-config-group-icon">
                    <Icon name={GROUP_ICONS[group] ?? 'settings'} />
                  </span>
                  <div>
                    <h3>{group}</h3>
                    <span className="ai-config-group-subtitle">
                      {group === '运行策略' && '控制全流程 AI 介入程度与推演模式'}
                      {group === '模型服务' && '配置 OpenAI 协议大语言模型连接参数与输出限制'}
                      {group === '临床治理' && '把控临床建议生命周期与医师分批灰度策略'}
                      {group === '语音能力' && '接诊问诊音频流服务端转写配置'}
                      {group === '知识能力' && '人民卫生出版社可追溯临床知识库接入'}
                    </span>
                  </div>
                </div>

                <div className="ai-config-group-card__actions">
                  {primarySetting && (
                    <div className="ai-config-group-toggle-wrap">
                      <span className="ai-config-group-toggle-label">{primarySetting.name}</span>
                      <Switch
                        size="sm"
                        checked={isGroupEnabled}
                        onChange={(checked) => {
                          setDraft((current) => ({ ...current, [primaryToggleKey]: checked }))
                          setResetKeys((current) => without(current, primaryToggleKey))
                        }}
                        checkedText="已启用"
                        uncheckedText="已停用"
                      />
                      {resetKeys.has(primaryToggleKey) ? (
                        <StatusBadge tone="warning">待保存恢复</StatusBadge>
                      ) : (primarySetting.sourceScope === 'TENANT' || (primarySetting.overridePresent && primarySetting.sourceScope !== 'DEPLOYMENT')) ? (
                        <div className="ai-config-group-toggle-override">
                          <StatusBadge tone="success">
                            {sourceLabel(primarySetting.sourceScope, primarySetting.inherited)}
                          </StatusBadge>
                          <button
                            type="button"
                            className="ai-config-reset-corner-btn"
                            onClick={() => resetOverride(primarySetting)}
                            title={`清除覆盖，恢复为${primarySetting.sourceScope === 'TENANT' ? '平台基线' : '部署默认'}`}
                          >
                            <Icon name="refresh" />
                            <span>恢复</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {group === '临床治理' && (
                    <div className="ai-config-group-actions">
                      <span className="ai-config-governance-summary-badge">
                        建议: {draft['suggestion-ttl-minutes'] ?? 30}分钟 · 灰度: {draft['rollout-percentage'] ?? 100}%
                      </span>
                      <button
                        type="button"
                        className="ai-config-collapse-btn"
                        onClick={() => setGovernanceCollapsed(!governanceCollapsed)}
                        title={governanceCollapsed ? '展开微调低频临床治理参数' : '收起折叠'}
                      >
                        <Icon name={governanceCollapsed ? 'chevron-down' : 'chevron-up'} />
                        <span>{governanceCollapsed ? '展开选项' : '收起'}</span>
                      </button>
                    </div>
                  )}

                  {group === '模型服务' && (
                    <div className="ai-config-group-actions">
                      {testResult.MODEL?.success && (
                        <span className="ai-config-test-success-pill" title={testResult.MODEL.message}>
                          <Icon name="check" />
                          <span>已连通 · {testResult.MODEL.latencyMs}ms</span>
                        </span>
                      )}

                      <button
                        type="button"
                        className="ai-config-test-btn"
                        disabled={testModel.isPending}
                        onClick={() => testModel.mutate()}
                        title="向模型服务地址发送测试探针，实时检测连通性、密钥与模型可用性"
                      >
                        <Icon name={testModel.isPending ? 'refresh' : 'sparkles'} />
                        <span>{testModel.isPending ? '正在测试…' : '测试模型连接'}</span>
                      </button>

                      <div className="ai-config-preset-dropdown-wrap">
                        <button
                          type="button"
                          className="ai-config-preset-btn"
                          onClick={() => setPresetMenuOpen(!presetMenuOpen)}
                          aria-expanded={presetMenuOpen}
                        >
                          <Icon name="sparkles" />
                          <span>常用模型预设</span>
                          <Icon name="chevron-down" />
                        </button>
                        {presetMenuOpen && (
                          <div className="ai-config-preset-menu" role="menu">
                            <div className="ai-config-preset-menu-header">选择常用模型模板一键填充：</div>
                            {MODEL_PRESETS.map((preset) => (
                              <button
                                type="button"
                                key={preset.name}
                                className="ai-config-preset-item"
                                onClick={() => applyModelPreset(preset)}
                              >
                                <div className="ai-config-preset-item__title">{preset.name}</div>
                                <div className="ai-config-preset-item__desc">{preset.desc}</div>
                                <code className="ai-config-preset-item__endpoint">{preset.endpoint}</code>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {group === '语音能力' && isGroupEnabled && (
                    <div className="ai-config-group-actions">
                      {testResult.SPEECH?.success && (
                        <span className="ai-config-test-success-pill" title={testResult.SPEECH.message}>
                          <Icon name="check" />
                          <span>千问已连通 · {testResult.SPEECH.latencyMs}ms</span>
                        </span>
                      )}

                      <button
                        type="button"
                        className="ai-config-test-btn"
                        disabled={testSpeech.isPending}
                        onClick={() => testSpeech.mutate()}
                        title="向语音转写服务地址发送测试探针，检测连通性与密钥是否正确"
                      >
                        <Icon name={testSpeech.isPending ? 'refresh' : 'face'} />
                        <span>{testSpeech.isPending ? '正在测试…' : '测试语音连接'}</span>
                      </button>

                      <button
                        type="button"
                        className="ai-config-preset-btn"
                        onClick={() => {
                          setDraft((current) => ({
                            ...current,
                            'speech-endpoint': 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
                            'speech-model': 'qwen3-asr-flash-filetrans',
                          }))
                          setResetKeys((current) => {
                            const next = new Set(current)
                            next.delete('speech-endpoint')
                            next.delete('speech-model')
                            return next
                          })
                          setFeedback('已自动填入【通义千问官方语音】推荐服务地址与模型参数，确认后可点击保存变更')
                        }}
                        title="一键填入通义千问官方语音转写服务地址与推荐模型"
                      >
                        <Icon name="sparkles" />
                        <span>千问推荐配置</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isGroupEnabled && (group !== '临床治理' || !governanceCollapsed) ? (
                <>
                  {group === '模型服务' && testResult.MODEL && !testResult.MODEL.success && (
                    <div className="ai-config-test-banner ai-config-test-banner--error">
                      <div className="ai-config-test-banner__header">
                        <div className="ai-config-test-banner__status">
                          <Icon name="warning" />
                          <strong>模型连接测试未通过</strong>
                          <span className="ai-config-test-banner__meta">
                            {testResult.MODEL.statusCode > 0 && `HTTP ${testResult.MODEL.statusCode} · `}
                            {testResult.MODEL.latencyMs}ms
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ai-config-test-banner__close"
                          onClick={() => setTestResult((prev) => ({ ...prev, MODEL: null }))}
                          title="关闭诊断结果"
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                      <p className="ai-config-test-banner__message">{testResult.MODEL.message}</p>
                      {testResult.MODEL.rawDetail && (
                        <details className="ai-config-test-banner__details">
                          <summary>查看上游原始返回 / 异常明细</summary>
                          <pre>{testResult.MODEL.rawDetail}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  {group === '语音能力' && testResult.SPEECH && !testResult.SPEECH.success && (
                    <div className="ai-config-test-banner ai-config-test-banner--error">
                      <div className="ai-config-test-banner__header">
                        <div className="ai-config-test-banner__status">
                          <Icon name="warning" />
                          <strong>语音连接测试未通过</strong>
                          <span className="ai-config-test-banner__meta">
                            {testResult.SPEECH.statusCode > 0 && `HTTP ${testResult.SPEECH.statusCode} · `}
                            {testResult.SPEECH.latencyMs}ms
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ai-config-test-banner__close"
                          onClick={() => setTestResult((prev) => ({ ...prev, SPEECH: null }))}
                          title="关闭诊断结果"
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                      <p className="ai-config-test-banner__message">{testResult.SPEECH.message}</p>
                      {testResult.SPEECH.rawDetail && (
                        <details className="ai-config-test-banner__details">
                          <summary>查看上游原始返回 / 异常明细</summary>
                          <pre>{testResult.SPEECH.rawDetail}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  <div className="ai-config-fields">
                  {childSettings.map((setting) =>
                    <SettingField
                      key={setting.key}
                      setting={setting}
                      value={draft[setting.key]}
                      secretValue={secrets[setting.key] ?? ''}
                      reset={resetKeys.has(setting.key)}
                      onChange={(value) => {
                        setDraft((current) => ({ ...current, [setting.key]: value }))
                        setResetKeys((current) => without(current, setting.key))
                      }}
                      onSecretChange={(value) => {
                        setSecrets((current) => ({ ...current, [setting.key]: value }))
                        setResetKeys((current) => without(current, setting.key))
                      }}
                      onReset={() => resetOverride(setting)}
                    />)}
                  </div>
                </>
              ) : null}
            </section>
          })}
        </div>
      </Panel>

      {/* 3. 右侧栏：作用域与治理体系 */}
      <Panel className="ai-config-governance">
        <PanelHead title="治理体系与概览" meta="安全性与隔离" />
        <div className="ai-config-governance__body">
          {/* 配置分布统计看板 */}
          <div className="ai-config-stats-card">
            <div className="ai-config-stats-title">配置来源分布</div>
            <div className="ai-config-stats-grid">
              <div className="ai-config-stat-tile">
                <span className="ai-config-stat-num">{stats.deployment}</span>
                <span className="ai-config-stat-label">
                  <Icon name="settings" />
                  <span>部署默认</span>
                </span>
              </div>
              <div className="ai-config-stat-tile">
                <span className="ai-config-stat-num">{stats.platform + stats.inheritedPlatform}</span>
                <span className="ai-config-stat-label">
                  <Icon name="organization" />
                  <span>平台基线</span>
                </span>
              </div>
              <div className="ai-config-stat-tile highlight">
                <span className="ai-config-stat-num">{stats.tenant}</span>
                <span className="ai-config-stat-label">
                  <Icon name="hospital" />
                  <span>租户定制</span>
                </span>
              </div>
            </div>
          </div>

          {/* 安全防线卡片 */}
          <div className="ai-config-governance-cards">
            <div className="ai-config-gov-box">
              <span className="ai-config-gov-box__icon"><Icon name="lock" /></span>
              <div>
                <strong>双层作用域隔离</strong>
                <span>仅平台基线与租户定制生效，已禁止科室和个人级随意覆盖，严防策略碎片化。</span>
              </div>
            </div>

            <div className="ai-config-gov-box">
              <span className="ai-config-gov-box__icon"><Icon name="credential" /></span>
              <div>
                <strong>AES-256-GCM 密文保密</strong>
                <span>API Key 使用动态随机 nonce 与作用域双向绑定加密，数据落库加密，接口绝不返回明文。</span>
              </div>
            </div>

            <div className="ai-config-gov-box">
              <span className="ai-config-gov-box__icon"><Icon name="clinical" /></span>
              <div>
                <strong>临床方案 Preflight 质控</strong>
                <span>AI 输出建议在呈递给医生前均经过用药配伍与禁忌规则审核，筑牢医疗安全底线。</span>
              </div>
            </div>
          </div>

          {/* 自定义覆盖清单 */}
          <div className="ai-config-overrides-section">
            <div className="ai-config-overrides-header">
              <span>当前定制项追踪</span>
              <span className="ai-config-overrides-count">{stats.overridden.length} 项</span>
            </div>
            {stats.overridden.length === 0 ? (
              <div className="ai-config-empty-overrides">
                <Icon name="check" />
                <span>当前所有参数均继承上级基线，运行平稳。</span>
              </div>
            ) : (
              <div className="ai-config-override-list">
                {stats.overridden.map((item) => (
                  <div className="ai-config-override-item" key={item.key}>
                    <div className="ai-config-override-item__left">
                      <strong>{item.name}</strong>
                      <span>{item.group}</span>
                    </div>
                    <StatusBadge tone="success">
                      {sourceLabel(item.sourceScope, item.inherited)}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>}
  </div>
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
  const [revealSecret, setRevealSecret] = useState(false)
  const unit = UNITS[setting.key]
  const limit = LIMITS[setting.key]

  let control: React.ReactElement<any>

  if (setting.key === 'mode') {
    control = <div className="ai-config-mode-grid" role="radiogroup" aria-label="AI运行模式选择">
        {MODE_OPTIONS.map((opt) => {
          const meta = MODE_METAS[opt.value]
          const isSelected = String(value ?? '') === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`ai-config-mode-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onChange(opt.value)}
            >
              <div className="ai-config-mode-card__top">
                <span className={`ai-config-mode-card__icon tone-${meta.tone}`}>
                  <Icon name={meta.icon} />
                </span>
                <strong>{opt.label}</strong>
                {isSelected && (
                  <span className="ai-config-mode-card__tag">
                    <Icon name="check" />已选生效
                  </span>
                )}
              </div>
              <p className="ai-config-mode-card__desc">{meta.desc}</p>
            </button>
          )
        })}
      </div>
  } else if (setting.secret) {
    control = <div className="ai-config-secret-wrap">
      <div className="ai-config-password-box">
        <input
          type={revealSecret ? 'text' : 'password'}
          autoComplete="new-password"
          value={secretValue}
          placeholder={setting.secretConfigured ? '已配置，留空保持不变' : '输入 API Key'}
          onChange={(event) => onSecretChange(event.target.value)}
        />
        <button
          type="button"
          className="ai-config-eye-btn"
          onClick={() => setRevealSecret(!revealSecret)}
          title={revealSecret ? '隐藏明文' : '查看明文'}
          aria-label={revealSecret ? '隐藏明文' : '查看明文'}
        >
          <Icon name={revealSecret ? 'eye-off' : 'eye'} />
        </button>
      </div>
      <div className="ai-config-secret-status-tag">
        {secretValue ? (
          <span className="ai-config-tag-new">
            <Icon name="sparkles" />
            <span>已输入新密钥，保存后加密生效</span>
          </span>
        ) : setting.secretConfigured ? (
          <span className="ai-config-tag-configured">
            <Icon name="lock" />
            <span>服务端已密保存储 (AES-256-GCM)，留空则继续保留</span>
          </span>
        ) : (
          <span className="ai-config-tag-missing">
            <Icon name="warning" />
            <span>尚未配置凭据，模型网关调用将受阻</span>
          </span>
        )}
      </div>
    </div>
  } else if (setting.valueType === 'BOOLEAN') {
    control = <Switch
      checked={Boolean(value)}
      onChange={(checked) => onChange(checked)}
      checkedText="已开启"
      uncheckedText="已停用"
    />
  } else if (setting.key === 'rollout-percentage') {
    const numVal = Math.max(0, Math.min(100, Number(value ?? 0)))
    control = <div className="ai-config-slider-control">
      <div className="ai-config-input-affix">
        <input
          type="number"
          min={0}
          max={100}
          value={numVal}
          onChange={(event) => onChange(Math.max(0, Math.min(100, Number(event.target.value))))}
        />
        <span className="ai-config-input-unit">%</span>
      </div>
      <div className="ai-config-slider-track-wrap">
        <input
          className="ai-config-slider"
          type="range"
          min={0}
          max={100}
          step={5}
          value={numVal}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <div className="ai-config-slider-caption">
        {numVal === 100
          ? '全院执业医师 100% 全量生效'
          : numVal === 0
            ? '所有接诊医师均不启用 (0%)'
            : `按医师工号哈希分流：约 ${numVal}% 执业医师生效`}
      </div>
    </div>
  } else if (setting.valueType === 'NUMBER') {
    control = <div className="ai-config-input-affix">
      <input
        type="number"
        value={Number(value ?? 0)}
        {...limit}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {unit && <span className="ai-config-input-unit">{unit}</span>}
    </div>
  } else {
    control = <input
      type="text"
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  }

  const isFullWidth = setting.secret || setting.key === 'mode'
  const isOverridden = setting.sourceScope === 'TENANT' || (setting.overridePresent && setting.sourceScope !== 'DEPLOYMENT')
  const isPlatformInherited = setting.sourceScope === 'PLATFORM' && setting.inherited
  const showCorner = reset || isOverridden || isPlatformInherited

  const labelNode = (
    <span className="ai-config-field-label">
      <span>{setting.name}</span>
      {limit && !showCorner && (
        <span className="ai-config-field-range" title={`允许输入范围：${limit.min} ~ ${limit.max}${unit ? ` ${unit}` : ''}`}>
          ({limit.min} ~ {limit.max})
        </span>
      )}
    </span>
  )

  const fieldHint = [
    setting.description,
    limit ? `取值范围：${limit.min} ~ ${limit.max}${unit ? ` ${unit}` : ''}` : '',
    setting.sourceScope === 'DEPLOYMENT' ? '基线状态：系统部署默认' : '',
  ].filter(Boolean).join(' · ')

  return <div className={`ai-config-field ${isFullWidth ? 'is-full-width' : ''} ${reset ? 'is-reset' : ''} ${isOverridden ? 'is-override' : ''} ${showCorner ? 'has-corner' : ''}`}>
    {showCorner && (
      <div className="ai-config-field-corner">
        {reset ? (
          <StatusBadge tone="warning">待保存恢复</StatusBadge>
        ) : (
          <StatusBadge tone={setting.inherited ? 'info' : 'success'}>
            {sourceLabel(setting.sourceScope, setting.inherited)}
          </StatusBadge>
        )}
        {isOverridden && !reset && (
          <button
            type="button"
            className="ai-config-reset-corner-btn"
            onClick={onReset}
            title={`清除覆盖，恢复为${setting.sourceScope === 'TENANT' ? '平台基线' : '部署默认'}`}
          >
            <Icon name="refresh" />
            <span>恢复</span>
          </button>
        )}
      </div>
    )}
    <FormField label={labelNode} hint={fieldHint}>
      {control}
    </FormField>
  </div>
}

function ReadinessRow({ label, icon, ready, detail }: { label: string; icon: IconName; ready: boolean; detail: string }) {
  return <div className={`ai-config-readiness-row ${ready ? 'is-ready' : 'is-unready'}`}>
    <div className="ai-config-readiness-row__left">
      <span className="ai-config-readiness-icon">
        <Icon name={icon} />
      </span>
      <div>
        <div className="ai-config-readiness-label">{label}</div>
        <div className="ai-config-readiness-detail">{detail}</div>
      </div>
    </div>
    <StatusBadge tone={ready ? 'success' : 'neutral'}>
      {ready ? '就绪' : '未就绪'}
    </StatusBadge>
  </div>
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
