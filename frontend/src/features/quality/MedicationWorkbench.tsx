import { MedicationEvaluationLog } from './MedicationEvaluationLog'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type {
  ActiveRuleView,
  ActiveRuleTrialRun,
  MedicationKnowledge,
  MedicationTrialItem
} from '../../shared/api/medicationWorkbenchApi'
import { Alert, Button, ClinicalResourceSearch, FormField, IconButton, Icon, PageHeader, Select, StatusBadge, Tabs, type ClinicalResourceOption } from '../../shared/ui'
import type { MedicationKnowledge as MasterMedicationKnowledge } from '../../shared/api/masterDataApi'
import './medication-workbench.css'
import { MedicationKnowledgeDrafts } from './MedicationKnowledgeDrafts'
import { MedicationRuleCatalog } from './MedicationRuleCatalog'
import { MedicationSafetyCategories } from './MedicationSafetyCategories'

type TabKey = 'knowledge' | 'catalog' | 'safetyCategories' | 'sandbox' | 'evaluations' | 'factory'

export const severityMap: Record<string, { label: string; tone: string }> = {
  CRITICAL: { label: '极高风险', tone: 'critical' },
  HIGH: { label: '高风险', tone: 'high' },
  MEDIUM: { label: '中风险', tone: 'medium' },
  LOW: { label: '低风险', tone: 'low' }
}

const decisionMap: Record<string, { label: string; tone: string }> = {
  BLOCK: { label: '绝对拦截 (BLOCK)', tone: 'critical' },
  REQUIRE_OVERRIDE: { label: '阻断需理由 (REQUIRE_OVERRIDE)', tone: 'high' },
  WARN: { label: '预警核对 (WARN)', tone: 'medium' },
  PASS: { label: '核对通过 (PASS)', tone: 'pass' },
  UNAVAILABLE: { label: '数据不足无法评价', tone: 'muted' }
}

export const usageScopeName = (value: string) => value
  .replaceAll('SHADOW_ONLY', '仅用于旁路监控')
  .replaceAll('NOT_CLINICAL_EVIDENCE', '非临床证据')
  .replaceAll('CLINICAL_EVIDENCE', '临床证据')

const genderOptions = [{ value: '男', label: '男' }, { value: '女', label: '女' }, { value: '未知', label: '未知' }]
type ClinicalSelectOption = { value: string; label: string; secondaryText?: string; searchKeywords?: string[] }

function simulationMedicationValue(item: MedicationTrialItem, medications: MedicationKnowledge[]): ClinicalResourceOption<MasterMedicationKnowledge> | undefined {
  if (!item.medicationId) return undefined
  const current = medications.find(m => m.medication.id === item.medicationId)?.medication
  // Imported names/specifications remain historical facts until the user selects a replacement.
  const name = item.name ?? current?.name ?? '药品名称缺失'
  const spec = item.name !== undefined ? item.spec : current?.preparationSpec
  return { value: item.medicationId, label: spec ? `${name} (${spec})` : name, code: '' }
}

function simulationMedicationPatch(option?: ClinicalResourceOption<MasterMedicationKnowledge>): Partial<MedicationTrialItem> {
  const medication = option?.raw
  return {
    medicationId: medication?.id ?? null,
    name: medication?.name,
    spec: medication?.preparationSpec,
    routeCode: medication?.defaultRoute || null,
    frequencyCode: medication?.defaultFrequency || null
  }
}

export function MedicationWorkbench({ api }: { api: RhnApi }) {
  const [tab, setTab] = useState<TabKey>('catalog')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 1. 生效规则库 (首屏优先秒开)
  const [activeRules, setActiveRules] = useState<ActiveRuleView[]>([])
  const [_selectedRule, setSelectedRule] = useState<ActiveRuleView | null>(null)
  const [_rulesLoading, setRulesLoading] = useState(true)
  const [sandboxScope, setSandboxScope] = useState<'ALL' | 'SINGLE'>('ALL')
  const [sandboxRuleCode, setSandboxRuleCode] = useState('')
  const [activeSandboxRun, setActiveSandboxRun] = useState<ActiveRuleTrialRun | null>(null)
  const [sandboxCaseFilter, setSandboxCaseFilter] = useState<'ALL' | 'HIT' | 'PASS'>('ALL')

  // 2. 处方质量评价记录 (异步加载)

  // 3. AI 工坊与候选规则 (异步解耦探测)
  const [ai, setAi] = useState<{ available: boolean; model: string | null; message: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(true)
  const [meds, setMeds] = useState<MedicationKnowledge[]>([])
  const [items, setItems] = useState<MedicationTrialItem[]>([])

  // 模拟门诊就诊沙舱状态
  const [simPatientName, setSimPatientName] = useState('模拟患者')
  const [simPatientAge, setSimPatientAge] = useState<number | ''>(35)
  const [simPatientGender, setSimPatientGender] = useState<string>('男')
  const [simDepartment, setSimDepartment] = useState<string>('普通内科')
  const [simAllergy, setSimAllergy] = useState<string>('无已知药物过敏')
  const [routeOptions, setRouteOptions] = useState<ClinicalSelectOption[]>([])
  const [frequencyOptions, setFrequencyOptions] = useState<ClinicalSelectOption[]>([])

  const epoch = useRef(0)

  useEffect(() => {
    const current = ++epoch.current
    setError('')
    // 不再锁死全局 setBusy('初始化工作台')，改由各区块异步局部加载

    // A. 首屏第一优先级：在行生效规则库秒开（不等待任何外部探测与大列表）
    setRulesLoading(true)
    api.medicationWorkbench.activeRules()
      .then(rules => {
        if (current !== epoch.current) return
        setActiveRules(rules)
        if (rules.length > 0) {
          setSelectedRule(rules[0])
          setSandboxRuleCode(rules[0].ruleCode)
        }
      })
      .catch(err => {
        if (current !== epoch.current) return
        setError(prev => prev ? `${prev}；内置验证规则: ${errorMessage(err)}` : `内置验证规则: ${errorMessage(err)}`)
      })
      .finally(() => {
        if (current === epoch.current) setRulesLoading(false)
      })

    // B. AI 模型连通性探测完全异步化 (在后台非阻塞探测，平滑更新状态徽章)
    setAiLoading(true)
    api.medicationWorkbench.status()
      .then(res => {
        if (current !== epoch.current) return
        setAi(res)
      })
      .catch(err => {
        if (current !== epoch.current) return
        setAi({ available: false, model: null, message: errorMessage(err) })
      })
      .finally(() => {
        if (current === epoch.current) setAiLoading(false)
      })

    // C. 门诊给药途径与频次主数据并发异步拉取
    api.masterData.activeMedicationRoutes('OUTPATIENT')
      .then(routes => {
        if (current !== epoch.current) return
        setRouteOptions(routes.map(route => ({
          value: route.code,
          label: route.name,
          secondaryText: route.code,
          searchKeywords: [route.code, route.name]
        })))
      })
      .catch(err => {
        if (current !== epoch.current) return
        console.warn('activeMedicationRoutes error:', err)
      })

    api.masterData.activeOrderFrequencies(undefined, undefined, 'OUTPATIENT', 'MEDICATION')
      .then(freqs => {
        if (current !== epoch.current) return
        setFrequencyOptions(freqs.map(frequency => ({
          value: frequency.code,
          label: frequency.name,
          secondaryText: `${frequency.code}${frequency.executionTimes.length ? ` · ${frequency.executionTimes.join('/')}` : ''}`,
          searchKeywords: [frequency.code, frequency.shortName ?? '']
        })))
      })
      .catch(err => {
        if (current !== epoch.current) return
        console.warn('activeOrderFrequencies error:', err)
      })

    // E. 沙箱模拟处方的首批药品；其余药品独立检索主档。
    api.medicationWorkbench.medications()
      .then(medList => {
        if (current !== epoch.current) return
        setMeds(medList)
      })
      .catch(err => {
        if (current !== epoch.current) return
        setError(prev => prev ? `${prev}；药品目录: ${errorMessage(err)}` : `药品目录: ${errorMessage(err)}`)
      })

    return () => {
      epoch.current = current + 1
    }
  }, [api])

  async function action(label: string, work: () => Promise<void>) {
    setBusy(label)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy('')
    }
  }

  function openActiveSandbox(scope: 'ALL' | 'SINGLE', rule?: ActiveRuleView) {
    setSandboxScope(scope)
    if (rule) setSandboxRuleCode(rule.ruleCode)
    setActiveSandboxRun(null)
    if (items.length === 0) {
      setItems([{ medicationId: null, status: 'DRAFT', durationDays: 3, routeCode: null, frequencyCode: null }])
    }
    setTab('sandbox')
  }

  async function executeActiveSandbox() {
    const ruleCodes = sandboxScope === 'SINGLE' && sandboxRuleCode ? [sandboxRuleCode] : []
    const patientContext = {
      patientAgeYears: simPatientAge === '' ? null : simPatientAge,
      gender: simPatientGender,
      activeAllergies: simAllergy && simAllergy !== '无已知药物过敏' ? [simAllergy] : []
    }
    setActiveSandboxRun(await api.medicationWorkbench.activeRuleTrial(ruleCodes, items, patientContext))
  }

  function updateItem(index: number, patch: Partial<MedicationTrialItem>) {
    setItems(values => values.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  return (
    <div className="qmed-workbench">
      <PageHeader
        compact
        eyebrow="临床质量 · 规则与知识"
        title="合理用药规则工作台"
        actions={
          <div className="qmed-header-actions">
            <div className="qmed-header-meta" aria-label="规则验证与AI状态">
              <span className="qmed-header-meta__item">
                <span className="qmed-kpi-dot" />
                <span className="qmed-kpi-label">内置验证集</span>
                <strong className="qmed-kpi-val text-accent">{activeRules[0]?.ruleSetVersion ?? '—'}</strong>
              </span>
              <span className="qmed-header-meta__item"><span className="qmed-kpi-label">临床运行</span><strong className="qmed-kpi-val">按规则发布设置</strong></span>
              <span className="qmed-header-meta__item"><span className="qmed-kpi-label">内置验证规则</span><strong className="qmed-kpi-val">{activeRules.length} 条</strong></span>
              <span className="qmed-header-meta__item"><span className="qmed-kpi-label">AI</span><strong className="qmed-kpi-val">{aiLoading ? '检测中…' : ai?.available ? ai.model : '未配置'}</strong></span>
            </div>
            <Link to="/settings/ai-assistant" className="qmed-link-btn" title="配置或更换后台大模型">
              <Icon name="settings" />
              <span>AI助理配置</span>
            </Link>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              onClick={() =>
                action('刷新状态', async () => {
                  const [aiStatus, rules] = await Promise.allSettled([
                    api.medicationWorkbench.status(),
                    api.medicationWorkbench.activeRules()
                  ])
                  if (aiStatus.status === 'fulfilled') setAi(aiStatus.value)
                  if (rules.status === 'fulfilled') setActiveRules(rules.value)
                })
              }
            >
              <Icon name="refresh" />
              <span>刷新数据</span>
            </Button>
          </div>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && (
        <Alert
          tone="info"
          duration={3500}
          onDismiss={() => setNotice('')}
        >
          {notice}
        </Alert>
      )}

      <Tabs
        value={tab === 'knowledge' ? 'factory' : tab}
        label="工作台主导航"
        variant="workspace"
        items={[
          { value: 'catalog', label: '在行规则目录' },
          { value: 'safetyCategories', label: '安全分类维护' },
          { value: 'evaluations', label: '处方质量审查日志' },
          { value: 'sandbox', label: '内置规则验证沙箱', meta: '单条 / 全部' },
          { value: 'factory', label: 'AI 规则工坊' },
        ]}
        onChange={(value) => value === 'sandbox' ? openActiveSandbox('ALL') : setTab(value as TabKey)}
      />

      {/* Tab 主体内容容器：自适应高度并杜绝外部整页滚动 */}
      <div className="qmed-tab-content">
        {tab === 'safetyCategories' && (
          <MedicationSafetyCategories
            api={api}
            onNotice={msg => setNotice(msg)}
            onError={msg => setError(msg)}
          />
        )}
        {/* Tab 1: 在行生效规则库 */}
        {tab === 'catalog' && (
          <MedicationRuleCatalog
            api={api}
            onBuiltinTrial={(code) => { const found=activeRules.find(rule => rule.ruleCode===code); if(found) openActiveSandbox('SINGLE', found) }}
            onOpenFactory={() => setTab('factory')}
          />
        )}

      {/* Tab: 内置规则验证沙箱 */}
      {tab === 'sandbox' && (
        <div className="qmed-active-sandbox-view">
          <div className="qmed-active-sandbox-head">
            <div className="qmed-title-with-help">
              <h3>内置规则验证沙箱</h3>
              <span
                className="qmed-guide-help"
                title="此处验证内置规则基线，不代表当前机构、科室的全部生效规则。知识生成的候选请在“在行规则目录 → 人工验证样例”中验证；实际生效范围与模式以该规则的发布设置为准。沙箱结果不写入临床处方。"
              >
                <Icon name="info" />
              </span>
            </div>
            <div className="qmed-sandbox-scope-controls">
              <FormField label="验证范围">
                <Select
                  aria-label="验证范围"
                  value={sandboxScope}
                  searchable={false}
                  clearable={false}
                  options={[
                    { value: 'ALL', label: `全部内置规则（${activeRules.length} 条）` },
                    { value: 'SINGLE', label: '指定单条规则' }
                  ]}
                  onChange={value => {
                    setSandboxScope(value as 'ALL' | 'SINGLE')
                    setActiveSandboxRun(null)
                  }}
                />
              </FormField>
              {sandboxScope === 'SINGLE' && (
                <FormField label="内置规则" className="qmed-sandbox-rule-field">
                  <Select
                    aria-label="选择内置规则"
                    value={sandboxRuleCode}
                    clearable={false}
                    options={activeRules.map(rule => ({
                      value: rule.ruleCode,
                      label: rule.ruleName,
                      secondaryText: `${rule.ruleCode} · v${rule.version}`,
                      searchKeywords: [rule.ruleCode, rule.category]
                    }))}
                    onChange={value => {
                      setSandboxRuleCode(value)
                      setActiveSandboxRun(null)
                    }}
                  />
                </FormField>
              )}
            </div>
          </div>

          <div className="qmed-active-sandbox-grid">
            <section className="qmed-sandbox-panel">
              <div className="qmed-patient-sim-card">
                <div className="qmed-patient-sim-title">
                  <div className="title-left">
                    <span><Icon name="user" /> 虚拟门诊患者画像</span>
                    <div className="qmed-age-quick-chips">
                      <span className="chip-label">快速预设:</span>
                      <Button size="sm" variant="text" className="qmed-quick-age-btn" onClick={() => { setSimPatientAge(14); setSimPatientGender('男'); setActiveSandboxRun(null) }}>14岁儿童</Button>
                      <Button size="sm" variant="text" className="qmed-quick-age-btn" onClick={() => { setSimPatientAge(28); setSimPatientGender('女'); setActiveSandboxRun(null) }}>28岁育龄女性</Button>
                      <Button size="sm" variant="text" className="qmed-quick-age-btn" onClick={() => { setSimPatientAge(35); setSimPatientGender('男'); setActiveSandboxRun(null) }}>35岁成人</Button>
                      <Button size="sm" variant="text" className="qmed-quick-age-btn" onClick={() => { setSimPatientAge(72); setSimPatientGender('女'); setActiveSandboxRun(null) }}>72岁老年</Button>
                    </div>
                  </div>
                </div>
                <div className="qmed-patient-sim-fields">
                  <FormField size="sm" label="患者姓名" className="qmed-inline-field"><input value={simPatientName} onChange={e => setSimPatientName(e.target.value)} /></FormField>
                  <FormField size="sm" label="性别" className="qmed-inline-field">
                    <Select size="sm" value={simPatientGender} options={genderOptions} searchable={false} clearable={false} onChange={setSimPatientGender} />
                  </FormField>
                  <FormField size="sm" label="年龄（岁）" className="qmed-inline-field">
                    <input type="number" min="0" max="120" value={simPatientAge} onChange={e => { setSimPatientAge(e.target.value === '' ? '' : Number(e.target.value)); setActiveSandboxRun(null) }} />
                  </FormField>
                  <FormField size="sm" label="就诊科室" className="qmed-inline-field"><input value={simDepartment} onChange={e => setSimDepartment(e.target.value)} /></FormField>
                  <FormField size="sm" label="药物过敏史" className="qmed-inline-field"><input value={simAllergy} onChange={e => { setSimAllergy(e.target.value); setActiveSandboxRun(null) }} /></FormField>
                </div>
              </div>

              <div className="qmed-rx-table-wrap">
                <div className="qmed-rx-table-header">
                  <h5><Icon name="pill" /> 模拟门诊处方 ({items.length} 项)</h5>
                  <span className="qmed-meta-text">处方只存在于本次验证请求，不会保存为真实医嘱</span>
                </div>
                {items.map((item, i) => {
                  const isHitRow = activeSandboxRun?.cases.some(c => c.decision !== 'PASS' && c.matchedRows.includes(i + 1))
                  return (
                    <div className={`qmed-trial-row qmed-active-trial-row ${isHitRow ? 'is-hit-row' : ''}`} key={i}>
                      <span className={`row-num ${isHitRow ? 'is-hit' : ''}`} title={isHitRow ? '该处方行命中了合理用药质控拦截规则' : undefined}>
                        {i + 1}
                      </span>
                      <div className="qmed-med-picker-col">
                        <ClinicalResourceSearch<MasterMedicationKnowledge> api={api} resource="medication"
                          aria-label={`沙箱第${i + 1}行药品`} value={simulationMedicationValue(item, meds)}
                          placeholder="选择模拟处方药品" clearable
                          onChange={option => {
                            updateItem(i, simulationMedicationPatch(option))
                            setActiveSandboxRun(null)
                          }} />
                      </div>
                      <span className="qmed-row-tag is-in-scope">{meds.find(m => m.medication.id === item.medicationId)?.classifications?.[0]?.display || (item.medicationId ? '已选药品' : '待选药品')}</span>
                      <Select className="qmed-select-route" aria-label={`沙箱第${i + 1}行给药途径`}
                        value={item.routeCode || ''} options={routeOptions} placeholder="给药途径" clearable={false}
                        onChange={value => { updateItem(i, { routeCode: value }); setActiveSandboxRun(null) }} />
                      <Select className="qmed-select-freq" aria-label={`沙箱第${i + 1}行给药频次`}
                        value={item.frequencyCode || ''} options={frequencyOptions} placeholder="给药频次" clearable={false}
                        onChange={value => { updateItem(i, { frequencyCode: value }); setActiveSandboxRun(null) }} />
                      <div className="qmed-days-input-wrap">
                        <input className="ui-field__control" type="number" min="1" max="90" aria-label={`沙箱第${i + 1}行疗程天数`}
                          value={item.durationDays ?? ''} onChange={e => { updateItem(i, { durationDays: e.target.value === '' ? null : Number(e.target.value) }); setActiveSandboxRun(null) }} />
                        <span className="unit">天</span>
                      </div>
                      <IconButton icon="close" label={`删除沙箱第${i + 1}行`} className="qmed-row-del-btn"
                        onClick={() => { setItems(values => values.filter((_, index) => index !== i)); setActiveSandboxRun(null) }} />
                    </div>
                  )
                })}
                <div className="qmed-rx-add-actions">
                  <Button variant="secondary" size="sm" disabled={items.length >= 20}
                    onClick={() => setItems(values => [...values, { medicationId: null, status: 'DRAFT', durationDays: 3, routeCode: null, frequencyCode: null }])}>
                    + 添加处方药品
                  </Button>
                </div>
              </div>

              <div className="qmed-sim-trigger-bar">
                <Button variant="primary" disabled={!!busy || items.length === 0 || items.some(item => !item.medicationId) || (sandboxScope === 'SINGLE' && !sandboxRuleCode)}
                  onClick={() => action('运行内置规则沙箱', executeActiveSandbox)}>
                  {sandboxScope === 'ALL' ? '验证全部内置规则' : '验证所选单条规则'}
                </Button>
                <span className="qmed-meta-text">{sandboxScope === 'ALL' ? `将运行规则集内 ${activeRules.length} 条规则` : `仅运行 ${activeRules.find(rule => rule.ruleCode === sandboxRuleCode)?.ruleName || '所选规则'}`}</span>
              </div>
            </section>

            <aside className="qmed-active-sandbox-result">
              <div className="qmed-active-result-head">
                <div>
                  <h3>验证结果</h3>
                  <p>{activeSandboxRun ? `${activeSandboxRun.cases.length} 条规则已执行` : '运行后逐条展示命中与执行状态'}</p>
                </div>
                {activeSandboxRun && <span className={`qmed-dec-badge dec-${decisionMap[activeSandboxRun.decision]?.tone || 'muted'}`}>{decisionMap[activeSandboxRun.decision]?.label || activeSandboxRun.decision}</span>}
              </div>
              {activeSandboxRun && (
                <div className="qmed-active-filter-tabs" role="group" aria-label="沙箱结果过滤">
                  <Button
                    size="sm"
                    variant={sandboxCaseFilter === 'ALL' ? 'primary' : 'secondary'}
                    onClick={() => setSandboxCaseFilter('ALL')}
                  >
                    全部 ({activeSandboxRun.cases.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={sandboxCaseFilter === 'HIT' ? 'primary' : 'secondary'}
                    onClick={() => setSandboxCaseFilter('HIT')}
                  >
                    仅看命中 ({activeSandboxRun.cases.filter(c => c.decision !== 'PASS').length})
                  </Button>
                  <Button
                    size="sm"
                    variant={sandboxCaseFilter === 'PASS' ? 'primary' : 'secondary'}
                    onClick={() => setSandboxCaseFilter('PASS')}
                  >
                    正常通过 ({activeSandboxRun.cases.filter(c => c.decision === 'PASS').length})
                  </Button>
                </div>
              )}
              {!activeSandboxRun ? (
                <div className="qmed-empty"><p>配置患者与处方后开始验证。单条验证便于调试规则，全部验证用于检查规则间的综合判定。</p></div>
              ) : (
                <div className="qmed-active-rule-cases">
                  {activeSandboxRun.cases
                    .filter(c => {
                      if (sandboxCaseFilter === 'HIT') return c.decision !== 'PASS'
                      if (sandboxCaseFilter === 'PASS') return c.decision === 'PASS'
                      return true
                    })
                    .map(result => (
                      <article className={`qmed-case result-${result.decision.toLowerCase()}`} key={result.ruleCode}>
                        <div className="qmed-case-header">
                          <div><strong>{result.ruleName}</strong><small>{result.ruleCode} · v{result.version}</small></div>
                          <StatusBadge tone={result.decision === 'BLOCK' ? 'danger' : result.decision === 'WARN' || result.decision === 'REQUIRE_OVERRIDE' ? 'warning' : result.decision === 'PASS' ? 'success' : 'neutral'}>
                            {decisionMap[result.decision]?.label || result.decision}
                          </StatusBadge>
                        </div>
                        <div className="qmed-case-body">
                          <p className="qmed-case-reason">{result.failureCode ? `执行失败：${result.failureCode}` : result.reasons.join('；') || '本次模拟处方未命中该规则。'}</p>
                          {result.matchedRows.length > 0 && (
                            <div className="qmed-case-meta">
                              <span className="qmed-hit-label">命中处方药品：</span>
                              <div className="qmed-hit-drugs">
                                {result.matchedRows.map(rowNum => {
                                  const item = items[rowNum - 1]
                                  const medKnowledge = meds.find(m => m.medication.id === item?.medicationId)
                                  const medName = item?.name || medKnowledge?.medication.name || (item?.spec ? `药品 (${item.spec})` : `第 ${rowNum} 行`)
                                  return (
                                    <span key={rowNum} className="qmed-hit-drug-pill">
                                      <span className="pill-index">#{rowNum}</span>
                                      <span className="pill-name">{medName}</span>
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              )}
            </aside>
          </div>
        </div>
      )}

      {/* Tab 2: 处方质量审查日志 */}
      {tab === 'evaluations' && <MedicationEvaluationLog api={api} />}

      {/* AI 规则工坊：对话整理规则卡片 ➔ 确认转为系统规则草稿 */}
      {(tab === 'factory' || tab === 'knowledge') && (
        <div className="qmed-factory-container">
          <MedicationKnowledgeDrafts api={api} />
        </div>
      )}
      </div>
    </div>
  )
}
