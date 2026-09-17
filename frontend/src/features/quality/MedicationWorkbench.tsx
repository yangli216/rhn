import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type {
  ActiveRuleView,
  EvaluationSummary,
  MedicationCandidate,
  MedicationKnowledge,
  MedicationTrialItem,
  MedicationTrialRun
} from '../../shared/api/medicationWorkbenchApi'
import { Alert, Button, PageHeader } from '../../shared/ui'
import './medication-workbench.css'

type TabKey = 'catalog' | 'evaluations' | 'factory'

const severityMap: Record<string, { label: string; tone: string }> = {
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

const overridePolicyMap: Record<string, string> = {
  NOT_APPLICABLE: '不可覆盖 (强制执行)',
  ACKNOWLEDGE: '仅需医生勾选已知晓',
  REASON_REQUIRED: '必须录入合理解释理由'
}

const templateName = (code: string) =>
  code === 'EXACT_GENERIC_DUPLICATE'
    ? '通用药重复核对'
    : code === 'ANTIMICROBIAL_MAX_DAYS'
      ? 'HIS 抗菌药疗程上限'
      : code

export function MedicationWorkbench({ api }: { api: RhnApi }) {
  const [tab, setTab] = useState<TabKey>('catalog')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 1. 生效规则库
  const [activeRules, setActiveRules] = useState<ActiveRuleView[]>([])
  const [selectedRule, setSelectedRule] = useState<ActiveRuleView | null>(null)

  // 2. 处方质量评价记录
  const [evaluations, setEvaluations] = useState<EvaluationSummary[]>([])

  // 3. AI 工坊与候选规则
  const [ai, setAi] = useState<{ available: boolean; model: string | null; message: string } | null>(null)
  const [meds, setMeds] = useState<MedicationKnowledge[]>([])
  const [selectedMeds, setSelectedMeds] = useState<MedicationKnowledge[]>([])
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<MedicationCandidate[]>([])
  const [candidate, setCandidate] = useState<MedicationCandidate | null>(null)
  const [requirement, setRequirement] = useState('同一张处方中，相同通用药出现两次以上时提示核对，已撤销项目不参与。')
  const [source, setSource] = useState('')
  const [items, setItems] = useState<MedicationTrialItem[]>([])
  const [run, setRun] = useState<MedicationTrialRun | null>(null)
  const [history, setHistory] = useState<MedicationTrialRun[]>([])
  const [encounter, setEncounter] = useState('')
  const [prescription, setPrescription] = useState('')

  const epoch = useRef(0)

  useEffect(() => {
    const current = ++epoch.current
    setBusy('初始化工作台')
    setError('')

    Promise.allSettled([
      api.medicationWorkbench.status(),
      api.medicationWorkbench.activeRules(),
      api.medicationWorkbench.evaluations(),
      api.medicationWorkbench.medications(),
      api.medicationWorkbench.candidates()
    ])
      .then(([aiRes, rulesRes, evalsRes, medsRes, candidatesRes]) => {
        if (current !== epoch.current) return
        const errors: string[] = []
        if (aiRes.status === 'fulfilled') setAi(aiRes.value)
        else errors.push(`AI状态: ${errorMessage(aiRes.reason)}`)

        if (rulesRes.status === 'fulfilled') {
          setActiveRules(rulesRes.value)
          if (rulesRes.value.length > 0) setSelectedRule(rulesRes.value[0])
        } else {
          errors.push(`生效规则库: ${errorMessage(rulesRes.reason)}`)
        }

        if (evalsRes.status === 'fulfilled') setEvaluations(evalsRes.value)
        else errors.push(`评价日志: ${errorMessage(evalsRes.reason)}`)

        if (medsRes.status === 'fulfilled') setMeds(medsRes.value)
        else errors.push(`药品目录: ${errorMessage(medsRes.reason)}`)

        if (candidatesRes.status === 'fulfilled') setCandidates(candidatesRes.value)
        else errors.push(`候选规则: ${errorMessage(candidatesRes.reason)}`)

        if (errors.length > 0) {
          setError(errors.join('；'))
        }
      })
      .finally(() => {
        if (current === epoch.current) setBusy('')
      })

    return () => {
      epoch.current++
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

  function chooseCandidate(c: MedicationCandidate) {
    setCandidate(c)
    setSelectedMeds(c.medications)
    setRequirement(c.requirement)
    setSource(c.source)
    setRun(null)
    setHistory([])
    setNotice('')
    if (c.medications.length > 0) {
      setItems([
        {
          medicationId: c.medications[0].medication.id,
          status: 'DRAFT',
          durationDays: 1,
          routeCode: c.medications[0].medication.defaultRoute
        }
      ])
    }
  }

  async function generate() {
    const current = epoch.current
    const reply = await api.medicationWorkbench.generate(
      requirement,
      source,
      selectedMeds.map(m => m.medication.id),
      candidate?.id ?? null
    )
    if (current !== epoch.current) return
    setNotice(reply.message)
    if (reply.candidate) {
      chooseCandidate(reply.candidate)
      setCandidates(c => [reply.candidate!, ...c])
    }
  }

  async function approveCandidate(id: string) {
    await action('审批规则', async () => {
      const updated = await api.medicationWorkbench.approve(id)
      setCandidate(updated)
      setCandidates(prev => prev.map(c => (c.id === updated.id ? updated : c)))
      setNotice(`规则【${updated.rule.name}】已审核通过，已批准准入 SHADOW 运行测试！`)
    })
  }

  async function execute(kind: 'suite' | 'trial' | 'shadow') {
    if (!candidate) return
    const id = candidate.id
    const current = epoch.current
    const result =
      kind === 'suite'
        ? await api.medicationWorkbench.suite(id)
        : kind === 'trial'
          ? await api.medicationWorkbench.trial(id, items)
          : await api.medicationWorkbench.shadow(id, encounter, prescription)
    if (current === epoch.current) {
      setRun(result)
      if (result.mode === 'SYNTHETIC') setHistory(h => [result, ...h])
    }
  }

  function updateItem(index: number, patch: Partial<MedicationTrialItem>) {
    setItems(values => values.map((v, i) => (i === index ? { ...v, ...patch } : v)))
    setRun(null)
  }

  // 预置场景 1：解热镇痛药（NSAID）同类重复用药核对
  function loadNsaidPreset() {
    const matched = meds.filter(m =>
      m.medication.name.includes('布洛芬') ||
      m.medication.name.includes('双氯芬酸') ||
      m.medication.name.includes('阿司匹林')
    )
    const targets = matched.length > 0 ? matched.slice(0, 3) : (meds.length > 0 ? [meds[0]] : [])
    setSelectedMeds(targets)
    setRequirement('同一张处方中，解热镇痛抗炎类通用药（NSAIDs，如布洛芬、双氯芬酸）出现两次及以上时拦截并提示医生重复用药风险，已撤销项目不参与。')
    setSource('《处方管理办法》第十六条、第二十一条：医师开具处方应当遵循安全、有效、经济的原则，严禁同一类药物无指征重复联合使用。')
    setNotice(`已一键装配基药经典场景【解热镇痛药重复核对】，已勾选 ${targets.length} 种标的药品并填入规范需求。`)
  }

  // 预置场景 2：门诊抗菌药物疗程上限核对
  function loadAntimicrobialPreset() {
    const matched = meds.filter(m =>
      m.medication.name.includes('头孢') ||
      m.medication.name.includes('阿莫西林') ||
      m.medication.antimicrobial
    )
    const targets = matched.length > 0 ? matched.slice(0, 2) : (meds.length > 0 ? [meds[0]] : [])
    setSelectedMeds(targets)
    setRequirement('门诊抗菌药物处方单张疗程天数不得超过药品主数据设定的最大天数上限（如 7 天），超期开具需阻断并强制医生录入用药理由。')
    setSource('《抗菌药物临床应用管理办法》第二十四条：门诊患者抗菌药物处方用药量一般不得超过7日用量。')
    setNotice(`已一键装配基药经典场景【门诊抗菌药疗程上限】，已勾选 ${targets.length} 种标的药品并填入规范需求。`)
  }

  return (
    <div className="qmed-workbench">
      <PageHeader
        eyebrow="临床质量 · 规则治理与审计"
        title="合理用药规则工作台"
      />

      {/* 顶部运行看板 Banner */}
      <div className="qmed-kpi-bar">
        <div className="qmed-kpi-item">
          <span className="qmed-kpi-label">活跃规则集</span>
          <span className="qmed-kpi-value text-accent">qmed-foundation-shadow-v1</span>
        </div>
        <div className="qmed-kpi-item">
          <span className="qmed-kpi-label">运行模式</span>
          <span className="qmed-kpi-value">SHADOW · 旁路监控</span>
        </div>
        <div className="qmed-kpi-item">
          <span className="qmed-kpi-label">生效在行规则</span>
          <span className="qmed-kpi-value">{activeRules.length} 条核心规则</span>
        </div>
        <div className="qmed-kpi-item">
          <span className="qmed-kpi-label">AI 规则工坊</span>
          <span className="qmed-kpi-value">{ai?.available ? `直连模型 · ${ai.model}` : '尚未启用'}</span>
        </div>
        <div className="qmed-kpi-actions">
          <Link to="/settings/ai-assistant" className="qmed-link-btn">AI助理配置</Link>
          <Button
            disabled={!!busy}
            onClick={() =>
              action('刷新状态', async () => {
                const [aiStatus, rules, evals] = await Promise.allSettled([
                  api.medicationWorkbench.status(),
                  api.medicationWorkbench.activeRules(),
                  api.medicationWorkbench.evaluations()
                ])
                if (aiStatus.status === 'fulfilled') setAi(aiStatus.value)
                if (rules.status === 'fulfilled') setActiveRules(rules.value)
                if (evals.status === 'fulfilled') setEvaluations(evals.value)
              })
            }
          >
            刷新数据
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}

      {/* 主 Tab 导航 */}
      <nav className="qmed-tabs" aria-label="工作台主导航">
        <button
          className={`qmed-tab-btn ${tab === 'catalog' ? 'is-active' : ''}`}
          onClick={() => setTab('catalog')}
        >
          <strong>在行生效规则库</strong>
          <span className="qmed-tab-badge">{activeRules.length}</span>
        </button>
        <button
          className={`qmed-tab-btn ${tab === 'evaluations' ? 'is-active' : ''}`}
          onClick={() => setTab('evaluations')}
        >
          <strong>处方质量审查日志</strong>
          <span className="qmed-tab-badge">{evaluations.length}</span>
        </button>
        <button
          className={`qmed-tab-btn ${tab === 'factory' ? 'is-active' : ''}`}
          onClick={() => setTab('factory')}
        >
          <strong>AI 规则工坊与候选孵化</strong>
          <span className="qmed-tab-badge">{candidates.length}</span>
        </button>
      </nav>

      {/* Tab 主体内容容器：自适应高度并杜绝外部整页滚动 */}
      <div className="qmed-tab-content">
        {/* Tab 1: 在行生效规则库 */}
        {tab === 'catalog' && (
        <div className="qmed-catalog-view">
          <div className="qmed-catalog-list">
            <div className="qmed-catalog-list-header">
              <h3>在行规则目录</h3>
              <p>全量注册于质量引擎中的不可变安全审查规则，参与临床处方旁路核查。</p>
            </div>
            <div className="qmed-rule-cards">
              {activeRules.map(rule => {
                const sev = severityMap[rule.severity] || { label: rule.severity, tone: 'low' }
                const dec = decisionMap[rule.decision] || { label: rule.decision, tone: 'muted' }
                const isSelected = selectedRule?.ruleCode === rule.ruleCode
                return (
                  <article
                    key={rule.ruleCode}
                    className={`qmed-rule-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedRule(rule)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={e => { if (e.key === 'Enter') setSelectedRule(rule) }}
                  >
                    <div className="qmed-rule-card-top">
                      <span className={`qmed-tag tag-${sev.tone}`}>{sev.label}</span>
                      <span className="qmed-tag tag-code">{rule.ruleCode}</span>
                      <span className="qmed-rule-ver">v{rule.version}</span>
                    </div>
                    <h4 className="qmed-rule-card-title">{rule.ruleName}</h4>
                    <div className="qmed-rule-card-bottom">
                      <span className={`qmed-dec-badge dec-${dec.tone}`}>{dec.label}</span>
                      <span className="qmed-meta-text">分类: {rule.category}</span>
                    </div>
                  </article>
                )
              })}
              {activeRules.length === 0 && (
                <div className="qmed-empty">
                  <p>当前活跃规则集中暂未查询到已启用的规则。</p>
                </div>
              )}
            </div>
          </div>

          {/* 规则详情与治理看板 */}
          <aside className="qmed-catalog-detail">
            {selectedRule ? (
              <div className="qmed-detail-box">
                <div className="qmed-detail-header">
                  <div>
                    <span className="qmed-meta-pill">规则编码: {selectedRule.ruleCode}</span>
                    <span className="qmed-meta-pill">版本: v{selectedRule.version}</span>
                    <span className="qmed-meta-pill">规则集: {selectedRule.ruleSetVersion}</span>
                  </div>
                  <h2>{selectedRule.ruleName}</h2>
                </div>

                <div className="qmed-detail-section">
                  <h3>执行参数与门禁策略</h3>
                  <dl className="qmed-kv-grid">
                    <dt>阻断级别</dt>
                    <dd>
                      <span className={`qmed-tag tag-${severityMap[selectedRule.severity]?.tone || 'low'}`}>
                        {severityMap[selectedRule.severity]?.label || selectedRule.severity}
                      </span>
                    </dd>
                    <dt>判定动作</dt>
                    <dd>
                      <span className={`qmed-dec-badge dec-${decisionMap[selectedRule.decision]?.tone || 'muted'}`}>
                        {decisionMap[selectedRule.decision]?.label || selectedRule.decision}
                      </span>
                    </dd>
                    <dt>医生覆盖政策</dt>
                    <dd>{overridePolicyMap[selectedRule.overridePolicy] || selectedRule.overridePolicy}</dd>
                    <dt>执行器实现</dt>
                    <dd><code>{selectedRule.implementation}</code></dd>
                    <dt>生效起止</dt>
                    <dd>
                      {new Date(selectedRule.effectiveFrom).toLocaleDateString()} 至{' '}
                      {selectedRule.effectiveTo ? new Date(selectedRule.effectiveTo).toLocaleDateString() : '长期有效'}
                    </dd>
                    <dt>运行状态</dt>
                    <dd><span className="qmed-tag tag-shadow">{selectedRule.status}</span></dd>
                  </dl>
                </div>

                <div className="qmed-detail-section">
                  <h3>循证医学依据与管理规范原文</h3>
                  {selectedRule.evidence.map((ev, i) => (
                    <div key={i} className="qmed-evidence-card">
                      <div className="qmed-evidence-header">
                        <strong>{ev.sourceTitle}</strong>
                        <small>v{ev.sourceVersion} · {ev.section}</small>
                      </div>
                      <blockquote className="qmed-evidence-excerpt">
                        “{ev.excerpt}”
                      </blockquote>
                      <div className="qmed-evidence-footer">
                        <span>依据定位: <code>{ev.sourceLocator}</code></span>
                        <span>使用范畴: {ev.usageScope}</span>
                      </div>
                    </div>
                  ))}
                  {selectedRule.evidence.length === 0 && (
                    <p className="qmed-muted">本规则未绑定外部药学文献或法规依据（属于底层工程基线）。</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="qmed-empty">
                <p>请在左侧选择规则查看详情。</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Tab 2: 处方质量审查日志 */}
      {tab === 'evaluations' && (
        <div className="qmed-evaluations-view">
          <div className="qmed-eval-header">
            <div>
              <h3>真实处方旁路审查流水</h3>
              <p>记录本租户门诊处方提交时，合理用药质量引擎触发的旁路（SHADOW）安全评价结果与风险命中发现。</p>
            </div>
            <Button
              disabled={!!busy}
              onClick={() =>
                action('刷新评价流水', async () => {
                  setEvaluations(await api.medicationWorkbench.evaluations())
                })
              }
            >
              刷新日志
            </Button>
          </div>

          <div className="qmed-table-wrap">
            <table className="qmed-table">
              <thead>
                <tr>
                  <th>评价 ID</th>
                  <th>评价时间</th>
                  <th>处方 ID</th>
                  <th>就诊 ID</th>
                  <th>规则集</th>
                  <th>模式</th>
                  <th>评价结论</th>
                  <th>风险项数</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map(ev => {
                  const dec = decisionMap[ev.decision] || { label: ev.decision, tone: 'muted' }
                  return (
                    <tr key={ev.evaluationId}>
                      <td><code>{ev.evaluationId}</code></td>
                      <td>{ev.completedAt ? new Date(ev.completedAt).toLocaleString() : '—'}</td>
                      <td>{ev.prescriptionId}</td>
                      <td>{ev.encounterId}</td>
                      <td><small>{ev.ruleSetVersion}</small></td>
                      <td><span className="qmed-tag tag-shadow">{ev.mode}</span></td>
                      <td><span className={`qmed-dec-badge dec-${dec.tone}`}>{dec.label}</span></td>
                      <td>
                        {ev.findingCount > 0 ? (
                          <strong className="text-danger">{ev.findingCount} 项风险</strong>
                        ) : (
                          <span className="text-muted">无风险</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {evaluations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="qmed-empty-cell">
                      暂无处方安全评价流水记录。在门诊开立处方或在 AI 工坊中执行 HIS 旁路验证后将在此记录。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: AI 规则工坊与候选孵化 (规范化 QMED-5) */}
      {tab === 'factory' && (
        <div className="qmed-factory-layout">
          {/* 全景业务向导卡片 (吸顶固定) */}
          <div className="qmed-wizard-card">
            <div className="qmed-wizard-intro">
              <div className="qmed-wizard-title">
                <h3>QMED 临床规则孵化器 · 业务向导</h3>
                <p>
                  遵循医疗合规审计要求，大模型输出严禁直接介入临床生产阻断；须经【起草 ➔ 结构化解析 ➔ 离线单测 ➔ 沙箱回放 ➔ 专家批准】五步闭环准入 SHADOW 旁路监控。
                </p>
              </div>
              <div className="qmed-preset-group">
                <span>⚡ 快速体验基药场景:</span>
                <button
                  type="button"
                  className="qmed-preset-btn"
                  onClick={loadNsaidPreset}
                  title="一键选择基药布洛芬/双氯芬酸并填入重复核对规范需求"
                >
                  解热镇痛药重复核对
                </button>
                <button
                  type="button"
                  className="qmed-preset-btn"
                  onClick={loadAntimicrobialPreset}
                  title="一键选择基药头孢菌素/阿莫西林并填入抗菌药疗程上限需求"
                >
                  门诊抗菌药疗程上限
                </button>
              </div>
            </div>

            {/* 5 步进度向导条 */}
            <div className="qmed-stepper">
              <div className={`qmed-step-item ${selectedMeds.length > 0 && requirement.trim() ? 'is-done' : 'is-active'}`}>
                <span className="qmed-step-num">1</span>
                <span>起草需求与选药</span>
              </div>
              <span className="qmed-step-divider">➔</span>
              <div className={`qmed-step-item ${candidate ? 'is-done' : selectedMeds.length > 0 && requirement.trim() ? 'is-active' : ''}`}>
                <span className="qmed-step-num">2</span>
                <span>AI 解析生成</span>
              </div>
              <span className="qmed-step-divider">➔</span>
              <div className={`qmed-step-item ${run?.mode === 'SYNTHETIC' ? 'is-done' : candidate ? 'is-active' : ''}`}>
                <span className="qmed-step-num">3</span>
                <span>标准用例单测</span>
              </div>
              <span className="qmed-step-divider">➔</span>
              <div className={`qmed-step-item ${run?.mode === 'HIS_SHADOW' ? 'is-done' : ''}`}>
                <span className="qmed-step-num">4</span>
                <span>沙箱/处方回放</span>
              </div>
              <span className="qmed-step-divider">➔</span>
              <div className={`qmed-step-item ${candidate?.status === 'APPROVED_FOR_SHADOW' ? 'is-done' : ''}`}>
                <span className="qmed-step-num">5</span>
                <span>准入 SHADOW</span>
              </div>
            </div>
          </div>

          {/* 工坊左右两栏协同 (各自局部独立平滑滚动) */}
          <div className="qmed-factory-panes">
            {/* 左栏：HIS 药品多选 + 自然语言需求起草 + 就绪清单 + 候选清单 */}
            <div className="qmed-factory-pane-left">
              {/* 标的药品范围 */}
              <div className="qmed-med-select-header">
                <h4>标的药品范围 <small>({selectedMeds.length}/{meds.length})</small></h4>
                {selectedMeds.length > 0 && (
                  <Button variant="ghost" size="small" onClick={() => setSelectedMeds([])}>清空已选</Button>
                )}
              </div>
              <form
                className="qmed-med-search-box"
                onSubmit={e => {
                  e.preventDefault()
                  void action('搜索药品', async () => setMeds(await api.medicationWorkbench.medications(query)))
                }}
              >
                <input
                  aria-label="搜索 HIS 药品"
                  placeholder="药品名 / 编码 / 别名（回车搜索）"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </form>
              <div className="qmed-med-scroll-list">
                {meds.map(m => (
                  <label className="qmed-medication" key={m.medication.id}>
                    <input
                      type="checkbox"
                      aria-label={`选择药品 ${m.medication.name}`}
                      checked={selectedMeds.some(v => v.medication.id === m.medication.id)}
                      disabled={!!busy}
                      onChange={e => {
                        setSelectedMeds(s =>
                          e.target.checked
                            ? [...s, m]
                            : s.filter(v => v.medication.id !== m.medication.id)
                        )
                      }}
                    />
                    <span>
                      <strong>{m.medication.name}</strong>
                      <small>
                        {m.medication.code} · {m.medication.preparationSpec || m.medication.doseForm || '规格待维护'}
                      </small>
                    </span>
                  </label>
                ))}
                {meds.length === 0 && <p className="qmed-muted" style={{ padding: '8px' }}>未搜索到匹配的 HIS 药品</p>}
              </div>

              {/* 规则需求描述 */}
              <div className="qmed-req-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="qmed-req-input">规则审查需求描述</label>
                  <div className="qmed-preset-btns">
                    <button
                      type="button"
                      className="qmed-chip-btn"
                      aria-label="预设模板 通用药重复核对"
                      onClick={() => setRequirement('同一张处方中，相同通用药出现两次以上时提示核对，已撤销项目不参与。')}
                    >
                      模板: 重复核对
                    </button>
                    <button
                      type="button"
                      className="qmed-chip-btn"
                      aria-label="预设模板 抗菌药疗程上限"
                      onClick={() => setRequirement('门诊抗菌药处方疗程天数不得超过 HIS 主数据设定的最大天数上限。')}
                    >
                      模板: 疗程上限
                    </button>
                  </div>
                </div>
                <textarea
                  id="qmed-req-input"
                  rows={3}
                  value={requirement}
                  maxLength={4000}
                  onChange={e => setRequirement(e.target.value)}
                  placeholder="请清晰描述审查条件与判定规则…"
                />
              </div>

              {/* 依据原文 */}
              <div className="qmed-req-box">
                <label htmlFor="qmed-src-input">依据 / 机构管理规范原文（可选）</label>
                <textarea
                  id="qmed-src-input"
                  rows={2}
                  value={source}
                  maxLength={8000}
                  placeholder="未填写时标记为缺少依据，不自动补造药学证据"
                  onChange={e => setSource(e.target.value)}
                />
              </div>

              {/* AI 就绪检查清单与生成按钮 */}
              <div className="qmed-generation-action-box">
                <div className={`qmed-ai-status-alert ${ai?.available ? 'is-available' : 'is-unavailable'}`}>
                  {ai?.available ? (
                    <span>✅ <strong>AI 模型直连已就绪</strong>：当前使用 <code>{ai.model}</code>。</span>
                  ) : (
                    <div>
                      <span>⚠️ <strong>AI 模型服务未启用</strong>：{ai?.message || '尚未检测到已配置的模型'}。</span>
                      <div style={{ marginTop: '4px' }}>
                        <span>医疗合规要求：合理用药质量引擎严禁大模型决策造假，需前往 </span>
                        <Link to="/settings/ai-assistant" className="qmed-link-btn" style={{ padding: '0 4px', textDecoration: 'underline' }}>
                          系统设置 ➔ AI 助理配置
                        </Link>
                        <span> 填写真实模型（如 DeepSeek、通义千问等）后刷新本页。</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="qmed-checklist">
                  <div className={`qmed-check-item ${selectedMeds.length > 0 ? 'is-ready' : ''}`}>
                    <span>{selectedMeds.length > 0 ? '✓' : '○'}</span>
                    <span>标的药品范围：{selectedMeds.length > 0 ? `已勾选 ${selectedMeds.length} 种标的药品` : '待在上方勾选 1~10 种药品'}</span>
                  </div>
                  <div className={`qmed-check-item ${requirement.trim() ? 'is-ready' : ''}`}>
                    <span>{requirement.trim() ? '✓' : '○'}</span>
                    <span>需求语义描述：{requirement.trim() ? '已录入规则需求' : '待录入审查条件'}</span>
                  </div>
                  <div className={`qmed-check-item ${ai?.available ? 'is-ready' : ''}`}>
                    <span>{ai?.available ? '✓' : '○'}</span>
                    <span>真实大模型接入：{ai?.available ? `模型可用 (${ai.model})` : '未启用真实模型（按钮将保持禁用以防造假）'}</span>
                  </div>
                </div>

                <div className="qmed-actions-row">
                  <Button
                    disabled={!!busy || !ai?.available || !selectedMeds.length || !requirement.trim()}
                    onClick={() => action('AI 生成', generate)}
                  >
                    {busy === 'AI 生成' ? '真实模型分析中…' : candidate ? 'AI 生成新版本' : 'AI 生成候选规则'}
                  </Button>
                  <small className="qmed-meta-text">
                    {ai?.available && selectedMeds.length > 0 && requirement.trim()
                      ? '所有前置条件已满足，可点击生成'
                      : '需满足全部前置条件方可启动 AI 生成'}
                  </small>
                </div>
              </div>

              {/* 候选版本清单 */}
              <div className="qmed-pane-subhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '13px' }}>候选版本清单 <small>({candidates.length})</small></h3>
                <Button
                  disabled={!!busy}
                  onClick={() => {
                    setCandidate(null)
                    setRun(null)
                    setHistory([])
                    setItems([])
                    setNotice('已重置表单，可输入新需求由 AI 生成新候选规则')
                  }}
                >
                  新建候选
                </Button>
              </div>

              <div className="qmed-saved">
                {candidates.map(c => (
                  <button
                    disabled={!!busy}
                    className={candidate?.id === c.id ? 'is-active' : ''}
                    key={c.id}
                    aria-label={`候选版本 ${c.rule.name} v${c.version}`}
                    onClick={() => chooseCandidate(c)}
                  >
                    <div className="qmed-cand-title">
                      <strong>{c.rule.name}</strong>
                      <span className={`qmed-status-pill pill-${c.status.toLowerCase()}`}>
                        {c.status === 'APPROVED_FOR_SHADOW' ? '已批准准入' : c.status}
                      </span>
                    </div>
                    <small>
                      v{c.version} · {templateName(c.rule.template)} · {new Date(c.createdAt).toLocaleDateString()}
                    </small>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="qmed-muted" style={{ padding: '8px 0' }}>暂无候选规则，请在上方输入需求生成或点击顶部预设体验。</p>
                )}
              </div>
            </div>

            {/* 右栏：候选规则卡片 + 标准回归测试 + 模拟处方沙箱 + HIS 旁路验证 */}
            <div className="qmed-factory-pane-right">
              {!candidate ? (
                <div className="qmed-empty" style={{ margin: 'auto', textAlign: 'center', padding: '40px 20px' }}>
                  <h4>👈 请在左侧选择候选版本，或点击上方【⚡ 快速体验基药场景】</h4>
                  <p className="qmed-muted" style={{ maxWidth: '520px', margin: '8px auto 16px', lineHeight: 1.6 }}>
                    AI 规则工坊产出的候选版本必须通过【一键运行标准案例】与【模拟处方沙箱】测试验证无误后，才能批准准入 SHADOW 旁路监控，在门诊真实处方开立时进行后台质量监测。
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button type="button" className="qmed-preset-btn" onClick={loadNsaidPreset}>
                      ⚡ 体验：解热镇痛药重复核对
                    </button>
                    <button type="button" className="qmed-preset-btn" onClick={loadAntimicrobialPreset}>
                      ⚡ 体验：门诊抗菌药疗程上限
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 候选规则定义卡片 */}
                  <div className="qmed-candidate-card">
                    <div className="qmed-cand-top-bar">
                      <h4>{candidate.rule.name} · v{candidate.version}</h4>
                      {candidate.status !== 'APPROVED_FOR_SHADOW' ? (
                        <Button disabled={!!busy} onClick={() => approveCandidate(candidate.id)}>
                          批准准入 SHADOW
                        </Button>
                      ) : (
                        <span className="qmed-tag tag-pass">已批准准入旁路</span>
                      )}
                    </div>
                    <p className="qmed-cand-explanation">{candidate.rule.explanation}</p>
                    <div className="qmed-cand-spec-grid">
                      <div>
                        <strong>执行模板:</strong> {templateName(candidate.rule.template)}
                      </div>
                      <div>
                        <strong>执行参数:</strong>{' '}
                        {candidate.rule.template === 'EXACT_GENERIC_DUPLICATE'
                          ? `相同通用药数量 ≥ ${candidate.rule.duplicateCount}`
                          : '使用抗菌药最大天数上限'}
                      </div>
                      <div>
                        <strong>命中动作:</strong> WARN · {candidate.rule.message}
                      </div>
                      <div>
                        <strong>依据状态:</strong> {candidate.source ? '用户提供，待专家复核' : '未提供，不具备生产发布资格'}
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <strong>绑定药品:</strong> {candidate.medications.map(m => m.medication.name).join('、')}
                      </div>
                    </div>
                  </div>

                  {/* 沙箱与回归测试套件 */}
                  <div className="qmed-sandbox-panel">
                    <div className="qmed-actions-row">
                      <Button disabled={!!busy} onClick={() => action('批量试跑', () => execute('suite'))}>
                        一键运行标准案例
                      </Button>
                      <Button
                        disabled={!!busy}
                        onClick={() =>
                          action('历史记录', async () => setHistory(await api.medicationWorkbench.runs(candidate.id)))
                        }
                      >
                        历史模拟记录
                      </Button>
                    </div>

                    <h4>模拟处方沙箱测试</h4>
                    <p className="qmed-muted" style={{ margin: 0, fontSize: '12px' }}>
                      仅模拟输入，执行真实规则模板引擎；不会写入 HIS 处方或变动药品库存。
                    </p>

                    {items.map((item, i) => (
                      <div className="qmed-trial-row" key={i}>
                        <span>{i + 1}</span>
                        <select
                          aria-label={`第${i + 1}行药品`}
                          value={item.medicationId ?? ''}
                          onChange={e => updateItem(i, { medicationId: e.target.value || null })}
                        >
                          <option value="">缺失药品标识</option>
                          {candidate.medications.map(m => (
                            <option key={m.medication.id} value={m.medication.id}>
                              {m.medication.name}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`第${i + 1}行状态`}
                          value={item.status}
                          onChange={e => updateItem(i, { status: e.target.value })}
                        >
                          <option value="DRAFT">有效</option>
                          <option value="CANCELLED">已撤销</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          aria-label={`第${i + 1}行疗程天数`}
                          title="疗程天数"
                          placeholder="天"
                          value={item.durationDays ?? ''}
                          onChange={e =>
                            updateItem(i, { durationDays: e.target.value === '' ? null : Number(e.target.value) })
                          }
                        />
                        <button
                          aria-label={`删除第${i + 1}行`}
                          onClick={() => {
                            setItems(s => s.filter((_, n) => n !== i))
                            setRun(null)
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    <div className="qmed-actions-row">
                      <Button
                        disabled={!!busy || items.length >= 100}
                        onClick={() =>
                          setItems(s => [
                            ...s,
                            {
                              medicationId: candidate.medications[0].medication.id,
                              status: 'DRAFT',
                              durationDays: 1,
                              routeCode: null
                            }
                          ])
                        }
                      >
                        添加药品
                      </Button>
                      <Button disabled={!!busy} onClick={() => action('自定义试跑', () => execute('trial'))}>
                        运行此处方
                      </Button>
                    </div>

                    <details className="qmed-shadow">
                      <summary>从 HIS 真实处方进行旁路验证</summary>
                      <p className="qmed-muted" style={{ margin: '6px 0', fontSize: '12px' }}>
                        后端校验就诊权限并读取整张处方；疗程规则使用处方保存的药品快照，不用当前主数据重写历史。
                      </p>
                      <label>
                        就诊 ID
                        <input value={encounter} onChange={e => setEncounter(e.target.value)} />
                      </label>
                      <label>
                        处方 ID
                        <input value={prescription} onChange={e => setPrescription(e.target.value)} />
                      </label>
                      <Button
                        disabled={!!busy || !/^\d+$/.test(encounter) || !/^\d+$/.test(prescription)}
                        onClick={() => action('HIS 旁路验证', () => execute('shadow'))}
                      >
                        读取并评价
                      </Button>
                    </details>

                    {busy && <p role="status">{busy}中…</p>}

                    {run && (
                      <div className="qmed-results">
                        <h3>{run.mode === 'HIS_SHADOW' ? 'HIS 旁路结果' : '模拟执行结果'}</h3>
                        <small>规则版本 v{candidate.version} · {new Date(run.createdAt).toLocaleString()}</small>
                        {run.cases.map((c, i) => (
                          <article key={i} className={`qmed-case result-${c.actual.toLowerCase()}`}>
                            <strong>{c.name}</strong>
                            <span>{decisionMap[c.actual]?.label || c.actual}</span>
                            {c.expected && (
                              <small>预期 {decisionMap[c.expected]?.label || c.expected} · {c.passed ? '符合预期' : '不符合预期'}</small>
                            )}
                            <p>{c.reasons.join('；') || '本规则未发现命中条件，不代表完整用药安全结论。'}</p>
                            {c.matchedRows.length > 0 && <small>命中处方第 {c.matchedRows.join('、')} 行</small>}
                            <details>
                              <summary>查看完整模拟输入</summary>
                              <pre>{JSON.stringify(c.input, null, 2)}</pre>
                            </details>
                          </article>
                        ))}
                      </div>
                    )}

                    {history.length > 0 && (
                      <details>
                        <summary>历史模拟记录（{history.length}）</summary>
                        {history.map(h => (
                          <button className="qmed-history" key={h.id} onClick={() => setRun(h)}>
                            {new Date(h.createdAt).toLocaleString()} · {h.cases.length} 个案例
                          </button>
                        ))}
                      </details>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
