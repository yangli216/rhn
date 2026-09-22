import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type {
  ActiveRuleView,
  ActiveRuleTrialRun,
  EvaluationSummary,
  MedicationCandidate,
  MedicationKnowledge,
  PrescriptionPreview,
  MedicationTrialItem,
  MedicationTrialRun
} from '../../shared/api/medicationWorkbenchApi'
import { Alert, Button, Dialog, FormField, IconButton, Icon, PageHeader, SearchField, Select, StatusBadge } from '../../shared/ui'
import { medicationCandidateStatusPresentation } from '../../shared/presentation'
import './medication-workbench.css'
import { MedicationRuleIntake, type IntakeSeed } from './MedicationRuleIntake'
import { MedicationKnowledgeDrafts } from './MedicationKnowledgeDrafts'
import { MedicationRuleCatalog } from './MedicationRuleCatalog'

type TabKey = 'knowledge' | 'catalog' | 'sandbox' | 'evaluations' | 'factory'

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

export const overridePolicyMap: Record<string, string> = {
  NOT_APPLICABLE: '不可覆盖 (强制执行)',
  ACKNOWLEDGE: '仅需医生勾选已知晓',
  REASON_REQUIRED: '必须录入合理解释理由'
}

const templateMap: Record<string, string> = {
  AGE_CONTRAINDICATION: '特殊人群 / 年龄禁忌核对',
  EXACT_GENERIC_DUPLICATE: '同类药物 / 重复用药核对',
  ANTIMICROBIAL_MAX_DAYS: '门诊抗菌药物疗程上限核对',
  DOSAGE_ROUTE_CHECK: '给药途径 / 用法用量合规核对',
  INTERACTION_CONTRAINDICATION: '药物相互作用与配伍禁忌核对',
  CUSTOM: '自定义临床质量规则'
}

const templateName = (code: string) => templateMap[code] || code
export const usageScopeName = (value: string) => value
  .replaceAll('SHADOW_ONLY', '仅用于旁路监控')
  .replaceAll('NOT_CLINICAL_EVIDENCE', '非临床证据')
  .replaceAll('CLINICAL_EVIDENCE', '临床证据')

const genderOptions = [{ value: '男', label: '男' }, { value: '女', label: '女' }, { value: '未知', label: '未知' }]
type ClinicalSelectOption = { value: string; label: string; secondaryText?: string; searchKeywords?: string[] }

export function MedicationWorkbench({ api }: { api: RhnApi }) {
  const [tab, setTab] = useState<TabKey>('catalog')
  const [factoryMode, setFactoryMode] = useState<'intake' | 'template'>('intake')
  const [intakeSeed, setIntakeSeed] = useState<IntakeSeed>()
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

  // 2. 处方质量评价记录 (异步加载)
  const [evaluations, setEvaluations] = useState<EvaluationSummary[]>([])
  const [evalsLoading, setEvalsLoading] = useState(false)

  // 3. AI 工坊与候选规则 (异步解耦探测)
  const [ai, setAi] = useState<{ available: boolean; model: string | null; message: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(true)
  const [meds, setMeds] = useState<MedicationKnowledge[]>([])
  const [medsLoading, setMedsLoading] = useState(false)
  const [selectedMeds, setSelectedMeds] = useState<MedicationKnowledge[]>([])
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<MedicationCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidate, setCandidate] = useState<MedicationCandidate | null>(null)
  const [requirement, setRequirement] = useState('')
  const [source, setSource] = useState('')
  const [items, setItems] = useState<MedicationTrialItem[]>([])
  const [run, setRun] = useState<MedicationTrialRun | null>(null)
  const [history, setHistory] = useState<MedicationTrialRun[]>([])
  const [encounter, setEncounter] = useState('')
  const [prescription, setPrescription] = useState('')
  const [showHisModal, setShowHisModal] = useState(false)
  const [hisEncounterInput, setHisEncounterInput] = useState('')
  const [hisPrescriptionInput, setHisPrescriptionInput] = useState('')
  const [importedPrescription, setImportedPrescription] = useState<PrescriptionPreview | null>(null)

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

    // D. 处方质量评价历史记录并发异步拉取
    setEvalsLoading(true)
    api.medicationWorkbench.evaluations()
      .then(evalList => {
        if (current !== epoch.current) return
        setEvaluations(evalList)
      })
      .catch(err => {
        if (current !== epoch.current) return
        setError(prev => prev ? `${prev}；评价日志: ${errorMessage(err)}` : `评价日志: ${errorMessage(err)}`)
      })
      .finally(() => {
        if (current === epoch.current) setEvalsLoading(false)
      })

    // E. 药品全量目录并发异步拉取
    setMedsLoading(true)
    api.medicationWorkbench.medications()
      .then(medList => {
        if (current !== epoch.current) return
        setMeds(medList)
      })
      .catch(err => {
        if (current !== epoch.current) return
        setError(prev => prev ? `${prev}；药品目录: ${errorMessage(err)}` : `药品目录: ${errorMessage(err)}`)
      })
      .finally(() => {
        if (current === epoch.current) setMedsLoading(false)
      })

    // F. AI 候选规则并发异步拉取并自动装配
    setCandidatesLoading(true)
    api.medicationWorkbench.candidates()
      .then(cands => {
        if (current !== epoch.current) return
        setCandidates(cands)
      })
      .catch(err => {
        if (current !== epoch.current) return
        setError(prev => prev ? `${prev}；候选规则: ${errorMessage(err)}` : `候选规则: ${errorMessage(err)}`)
      })
      .finally(() => {
        if (current === epoch.current) setCandidatesLoading(false)
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

  function startNewCandidate() {
    setCandidate(null)
    setRequirement('')
    setSource('')
    setSelectedMeds([])
    setItems([])
    setRun(null)
    setHistory([])
    setImportedPrescription(null)
    setEncounter('')
    setPrescription('')
    setNotice('已进入空白新建，不会自动带入演示需求、药品或处方。')
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
      setNotice(`规则【${updated.rule.name}】已审核通过，已批准进入旁路监控运行测试！`)
    })
  }

  async function execute(kind: 'suite' | 'trial' | 'shadow') {
    if (!candidate) return
    const id = candidate.id
    const current = epoch.current
    const patientContext = {
      patientAgeYears: simPatientAge === '' ? null : simPatientAge,
      gender: simPatientGender,
      activeAllergies: simAllergy && simAllergy !== '无已知药物过敏' ? [simAllergy] : []
    }
    const result =
      kind === 'suite'
        ? await api.medicationWorkbench.suite(id)
        : kind === 'trial'
          ? await api.medicationWorkbench.trial(id, items, patientContext)
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

  async function importPrescription() {
    const preview = await api.medicationWorkbench.prescriptionPreview(hisEncounterInput.trim(), hisPrescriptionInput.trim())
    const context = preview.patientContext
    setEncounter(preview.encounterId)
    setPrescription(preview.prescriptionId)
    setImportedPrescription(preview)
    setSimPatientName(`患者 ${preview.residentId}`)
    setSimPatientAge(context.patientAgeYears ?? '')
    if (context.gender) setSimPatientGender(context.gender)
    setSimDepartment(`科室 ${preview.departmentId}`)
    setSimAllergy(context.activeAllergies?.length ? context.activeAllergies.join('、') : '无已知药物过敏')
    setItems(preview.items.map(item => ({
      medicationId: item.medicationId,
      status: item.status,
      durationDays: item.durationDays,
      routeCode: item.routeCode,
      frequencyCode: item.frequencyCode,
      name: item.medicationName,
      spec: item.preparationSpec ?? undefined
    })))
    setRun(null)
    setShowHisModal(false)
    setNotice(`已从 HIS 读取就诊 ${preview.encounterId} 的处方 ${preview.prescriptionId}，载入 ${preview.items.length} 条原始处方明细。表单调整仅用于模拟；“原始处方旁路核对”始终重新读取后端不可变快照。`)
  }

  // 场景 1：未成年人禁用喹诺酮类（年龄禁忌 + 模拟门诊就诊）
  function loadAgeContraindicationPreset() {
    const matched = meds.filter(m =>
      m.medication.name.includes('诺氟沙星') ||
      m.medication.name.includes('左氧氟沙星') ||
      m.medication.name.includes('环丙沙星')
    )
    const targets = matched.length > 0 ? matched.slice(0, 2) : []
    if (targets.length === 0) {
      setNotice('当前药品目录中未检索到喹诺酮类药品，请先在标的药品中选择药品。')
      return
    }
    setSelectedMeds(targets)
    setRequirement('18岁以下未成年人门诊禁用左氧氟沙星、诺氟沙星等喹诺酮类抗菌药物。')
    setSource('《处方管理办法》、《抗菌药物临床应用指导原则》：喹诺酮类可能导致软骨发育障碍，18岁以下患者禁用。')
    setSimPatientName('模拟患者（未成年）')
    setSimPatientAge(14)
    setSimPatientGender('男')
    setSimDepartment('普通儿科/内科')
    setSimAllergy('无已知药物过敏')
    setItems([
      {
        medicationId: targets[0].medication.id,
        status: 'DRAFT',
        durationDays: 3,
        routeCode: targets[0].medication.defaultRoute || 'ORAL',
        frequencyCode: targets[0].medication.defaultFrequency || 'qd'
      }
    ])
    const cand1 = candidates.find(c => c.rule.name.includes('未成年') || c.rule.name.includes('喹诺酮') || c.rule.template === 'AGE_CONTRAINDICATION')
    if (cand1) setCandidate(cand1)
    setNotice('已装配【未成年人禁用喹诺酮类】场景，已设定 14 岁患者画像与处方明细，可执行就诊审查。')
  }

  // 场景 2：解热镇痛药（NSAID）同类重复用药核对
  function loadNsaidPreset() {
    const matched = meds.filter(m =>
      m.medication.name.includes('布洛芬') ||
      m.medication.name.includes('双氯芬酸') ||
      m.medication.name.includes('阿司匹林')
    )
    const targets = matched.length > 0 ? matched.slice(0, 3) : []
    if (targets.length < 2) {
      setNotice('当前药品目录中未检索到足够的解热镇痛抗炎类（NSAIDs）药品，请在标的药品中选择至少2种药品。')
      return
    }
    setSelectedMeds(targets)
    setRequirement('同一张处方中，解热镇痛抗炎类通用药（NSAIDs，如布洛芬、双氯芬酸）出现两次及以上时拦截并提示医生重复用药风险，已撤销项目不参与。')
    setSource('《处方管理办法》第十六条、第二十一条：医师开具处方应当遵循安全、有效、经济的原则，严禁同一类药物无指征重复联合使用。')
    setSimPatientName('模拟患者（门诊成人）')
    setSimPatientAge(28)
    setSimPatientGender('男')
    setSimDepartment('普通内科')
    setSimAllergy('无已知药物过敏')
    setItems([
      { medicationId: targets[0].medication.id, status: 'DRAFT', durationDays: 3, routeCode: 'ORAL', frequencyCode: 'BID' },
      { medicationId: targets[1].medication.id, status: 'DRAFT', durationDays: 3, routeCode: 'ORAL', frequencyCode: 'TID' }
    ])
    const cand2 = candidates.find(c => c.rule.name.includes('解热镇痛') || c.rule.name.includes('重复') || c.rule.template === 'EXACT_GENERIC_DUPLICATE')
    if (cand2) setCandidate(cand2)
    setNotice(`已装配【解热镇痛药重复核对】场景，已勾选 ${targets.length} 种标的药品并载入处方明细。`)
  }

  // 场景 3：门诊抗菌药物疗程上限核对
  function loadAntimicrobialPreset() {
    const matched = meds.filter(m =>
      m.medication.name.includes('头孢') ||
      m.medication.name.includes('阿莫西林') ||
      m.medication.antimicrobial
    )
    const targets = matched.length > 0 ? matched.slice(0, 2) : []
    if (targets.length === 0) {
      setNotice('当前药品目录中未检索到抗菌药物，请在标的药品中选择抗菌药。')
      return
    }
    setSelectedMeds(targets)
    setRequirement('门诊抗菌药物处方单张疗程天数不得超过药品主数据设定的最大天数上限（如 7 天），超期开具需阻断并强制医生录入用药理由。')
    setSource('《抗菌药物临床应用管理办法》第二十四条：门诊患者抗菌药物处方用药量一般不得超过7日用量。')
    setSimPatientName('模拟患者（门诊成人）')
    setSimPatientAge(35)
    setSimPatientGender('女')
    setSimDepartment('急诊科')
    setSimAllergy('无已知药物过敏')
    setItems([
      {
        medicationId: targets[0].medication.id,
        status: 'DRAFT',
        durationDays: 10,
        routeCode: targets[0].medication.defaultRoute || 'ORAL'
      }
    ])
    const cand3 = candidates.find(c => c.rule.name.includes('疗程') || c.rule.name.includes('抗菌') || c.rule.template === 'ANTIMICROBIAL_MAX_DAYS')
    if (cand3) setCandidate(cand3)
    setNotice(`已装配【门诊抗菌药疗程上限】场景，已勾选 ${targets.length} 种标的药品并填入超限 10 天处方明细。`)
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
              <Icon name="refresh" />
              <span>刷新数据</span>
            </Button>
          </div>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}

      {/* 主 Tab 导航 */}
      <nav className="qmed-tabs" aria-label="工作台主导航">
        <button
          className={`qmed-tab-btn ${tab === 'catalog' ? 'is-active' : ''}`}
          onClick={() => setTab('catalog')}
        >
          <strong>在行规则目录</strong>
        </button>
        <button
          className={`qmed-tab-btn ${tab === 'evaluations' ? 'is-active' : ''}`}
          onClick={() => setTab('evaluations')}
        >
          <strong>处方质量审查日志</strong>
          <span className="qmed-tab-badge">{evaluations.length}</span>
        </button>
        <button
          className={`qmed-tab-btn ${tab === 'sandbox' ? 'is-active' : ''}`}
          onClick={() => openActiveSandbox('ALL')}
        >
          <strong>内置规则验证沙箱</strong>
          <span className="qmed-tab-badge">单条 / 全部</span>
        </button>
        <button
          className={`qmed-tab-btn ${tab === 'factory' ? 'is-active' : ''}`}
          onClick={() => setTab('factory')}
        >
          <strong>AI 规则工坊与候选孵化</strong>
          <span className="qmed-tab-badge">{candidates.length}</span>
        </button>
        <button className={`qmed-tab-btn ${tab === 'knowledge' ? 'is-active' : ''}`} onClick={() => setTab('knowledge')}><strong>规则知识草稿</strong></button>
      </nav>

      {/* Tab 主体内容容器：自适应高度并杜绝外部整页滚动 */}
      <div className="qmed-tab-content">
        {tab === 'knowledge' && <MedicationKnowledgeDrafts api={api} initialIntake={intakeSeed} onIntakeConsumed={() => setIntakeSeed(undefined)} />}
        {/* Tab 1: 在行生效规则库 */}
        {tab === 'catalog' && (
          <MedicationRuleCatalog api={api} onOpenCandidate={(value) => { setCandidate(value); setFactoryMode('template'); setTab('factory') }} onBuiltinTrial={(code) => { const found=activeRules.find(rule => rule.ruleCode===code); if(found) openActiveSandbox('SINGLE', found) }} />
        )}

      {/* Tab: 内置规则验证沙箱 */}
      {tab === 'sandbox' && (
        <div className="qmed-active-sandbox-view">
          <div className="qmed-active-sandbox-head">
            <div>
              <h3>内置规则验证沙箱</h3>
              <p>此处验证内置规则基线，不代表当前机构、科室的全部生效规则。知识生成的候选请在“在行规则目录 → 人工验证样例”中验证；实际生效范围与模式以该规则的发布设置为准。沙箱结果不写入临床处方。</p>
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
                <FormField label="内置规则">
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
                      <button type="button" className="qmed-quick-age-btn" onClick={() => { setSimPatientAge(14); setActiveSandboxRun(null) }}>14岁儿童</button>
                      <button type="button" className="qmed-quick-age-btn" onClick={() => { setSimPatientAge(35); setActiveSandboxRun(null) }}>35岁成人</button>
                      <button type="button" className="qmed-quick-age-btn" onClick={() => { setSimPatientAge(72); setActiveSandboxRun(null) }}>72岁老年</button>
                    </div>
                  </div>
                </div>
                <div className="qmed-patient-sim-fields">
                  <FormField label="患者姓名" className="qmed-inline-field"><input value={simPatientName} onChange={e => setSimPatientName(e.target.value)} /></FormField>
                  <FormField label="性别" className="qmed-inline-field">
                    <Select value={simPatientGender} options={genderOptions} searchable={false} clearable={false} onChange={setSimPatientGender} />
                  </FormField>
                  <FormField label="年龄（岁）" className="qmed-inline-field">
                    <input type="number" min="0" max="120" value={simPatientAge} onChange={e => { setSimPatientAge(e.target.value === '' ? '' : Number(e.target.value)); setActiveSandboxRun(null) }} />
                  </FormField>
                  <FormField label="就诊科室" className="qmed-inline-field"><input value={simDepartment} onChange={e => setSimDepartment(e.target.value)} /></FormField>
                  <FormField label="药物过敏史" className="qmed-inline-field"><input value={simAllergy} onChange={e => { setSimAllergy(e.target.value); setActiveSandboxRun(null) }} /></FormField>
                </div>
              </div>

              <div className="qmed-rx-table-wrap">
                <div className="qmed-rx-table-header">
                  <h5><Icon name="pill" /> 模拟门诊处方 ({items.length} 项)</h5>
                  <span className="qmed-meta-text">处方只存在于本次验证请求，不会保存为真实医嘱</span>
                </div>
                {items.map((item, i) => {
                  const medicationOptions = meds.map(m => ({
                    value: m.medication.id,
                    label: m.medication.name,
                    secondaryText: m.medication.preparationSpec || m.medication.doseForm || '规格待维护',
                    description: m.classifications?.[0]?.display,
                    trailingText: m.medication.code,
                    searchKeywords: [m.medication.code, m.classifications?.[0]?.display || '']
                  }))
                  return (
                    <div className="qmed-trial-row qmed-active-trial-row" key={i}>
                      <span className="row-num">{i + 1}</span>
                      <div className="qmed-med-picker-col">
                        <Select aria-label={`沙箱第${i + 1}行药品`} value={item.medicationId || ''}
                          options={medicationOptions} placeholder="选择模拟处方药品" clearable
                          onChange={value => {
                            const selected = meds.find(m => m.medication.id === value)
                            updateItem(i, selected ? {
                              medicationId: selected.medication.id,
                              routeCode: selected.medication.defaultRoute,
                              frequencyCode: selected.medication.defaultFrequency,
                              name: selected.medication.name,
                              spec: selected.medication.preparationSpec || undefined
                            } : { medicationId: value || null })
                            setActiveSandboxRun(null)
                          }} />
                      </div>
                      <span className="qmed-row-tag is-in-scope">{meds.find(m => m.medication.id === item.medicationId)?.classifications?.[0]?.display || '待选药品'}</span>
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
              {!activeSandboxRun ? (
                <div className="qmed-empty"><p>配置患者与处方后开始验证。单条验证便于调试规则，全部验证用于检查规则间的综合判定。</p></div>
              ) : (
                <div className="qmed-active-rule-cases">
                  {activeSandboxRun.cases.map(result => (
                    <article className={`qmed-case result-${result.decision.toLowerCase()}`} key={result.ruleCode}>
                      <div className="qmed-case-header">
                        <div><strong>{result.ruleName}</strong><small>{result.ruleCode} · v{result.version}</small></div>
                        <StatusBadge tone={result.decision === 'BLOCK' ? 'danger' : result.decision === 'WARN' || result.decision === 'REQUIRE_OVERRIDE' ? 'warning' : result.decision === 'PASS' ? 'success' : 'neutral'}>
                          {decisionMap[result.decision]?.label || result.decision}
                        </StatusBadge>
                      </div>
                      <div className="qmed-case-body">
                        <p className="qmed-case-reason">{result.failureCode ? `执行失败：${result.failureCode}` : result.reasons.join('；') || '本次模拟处方未命中该规则。'}</p>
                        {result.matchedRows.length > 0 && <div className="qmed-case-meta">命中处方行：{result.matchedRows.join('、')}</div>}
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
      {tab === 'evaluations' && (
        <div className="qmed-evaluations-view">
          <div className="qmed-eval-header">
            <div>
              <h3>真实处方审查结果</h3>
              <p>展示处方实际记录的审查模式、结论及命中项；旁路观察和正式审查分别标示。</p>
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
                {evalsLoading ? (
                  <tr>
                    <td colSpan={8} className="qmed-empty-cell">
                      <span className="ui-spinner" style={{ marginRight: '6px' }} />
                      <span>正在拉取真实处方审查流水记录…</span>
                    </td>
                  </tr>
                ) : evaluations.map(ev => {
                  const dec = decisionMap[ev.decision] || { label: ev.decision, tone: 'muted' }
                  return (
                    <tr key={ev.evaluationId}>
                      <td><code>{ev.evaluationId}</code></td>
                      <td>{ev.completedAt ? new Date(ev.completedAt).toLocaleString() : '—'}</td>
                      <td>{ev.prescriptionId}</td>
                      <td>{ev.encounterId}</td>
                      <td><small>{ev.ruleSetVersion}</small></td>
                      <td><span className="qmed-tag">{ev.mode === 'ENFORCED' ? '正式审查' : ev.mode === 'SHADOW' ? '旁路观察' : ev.mode || '模式待核对'}</span></td>
                      <td><span className={`qmed-dec-badge dec-${dec.tone}`}>{dec.label}</span></td>
                      <td>
                        {ev.findingCount > 0 ? (
                          <strong className="text-danger">{ev.findingCount} 项风险</strong>
                        ) : (
                          <span className="text-muted">未记录命中项</span>
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
      {tab === 'factory' && <><div className="qmed-intake-switch"><Button variant={factoryMode === 'intake' ? 'primary' : 'secondary'} onClick={() => setFactoryMode('intake')}>需求分析与澄清</Button><Button variant={factoryMode === 'template' ? 'primary' : 'secondary'} onClick={() => setFactoryMode('template')}>模板候选与历史</Button></div>{factoryMode === 'intake' && <MedicationRuleIntake api={api} onStartKnowledge={seed => { setIntakeSeed(seed); setTab('knowledge') }} />}</>}
      {tab === 'factory' && factoryMode === 'template' && (
        <div className="qmed-factory-layout">
          {/* 单行高密度向导与场景工具条 (高度压缩至 36px，移除常驻长文本) */}
          <div className="qmed-wizard-bar">
            <div className="qmed-wizard-left">
              <div className="qmed-wizard-title">
                <Icon name="clinical" />
                <span>规则孵化向导</span>
                <Button size="sm" variant="secondary" onClick={() => setTab('knowledge')}>重复用药 / 相互作用知识提取</Button>
                <span
                  className="qmed-guide-help"
                  title="遵循医疗合规审计要求，大模型输出严禁直接介入临床生产阻断；须经【起草规则串 ➔ 结构化解析 ➔ 模拟门诊就诊测试 ➔ 离线单测/处方回放 ➔ 专家批准】五步闭环后进入旁路监控。"
                >
                  <Icon name="info" />
                </span>
              </div>

              <div className="qmed-stepper">
                <div className={`qmed-step-item ${requirement.trim() ? 'is-done' : 'is-active'}`}>
                  <span className="qmed-step-num">{requirement.trim() ? '✓' : '1'}</span>
                  <span>起草需求</span>
                </div>
                <span className="qmed-step-divider">›</span>
                <div className={`qmed-step-item ${candidate ? 'is-done' : requirement.trim() ? 'is-active' : ''}`}>
                  <span className="qmed-step-num">{candidate ? '✓' : '2'}</span>
                  <span>AI解析规则串</span>
                </div>
                <span className="qmed-step-divider">›</span>
                <div className={`qmed-step-item ${run?.mode === 'SYNTHETIC' ? 'is-done' : candidate ? 'is-active' : ''}`}>
                  <span className="qmed-step-num">{run?.mode === 'SYNTHETIC' ? '✓' : '3'}</span>
                  <span>模拟门诊就诊测试</span>
                </div>
                <span className="qmed-step-divider">›</span>
                <div className={`qmed-step-item ${run?.mode === 'HIS_SHADOW' ? 'is-done' : ''}`}>
                  <span className="qmed-step-num">{run?.mode === 'HIS_SHADOW' ? '✓' : '4'}</span>
                  <span>处方回放</span>
                </div>
                <span className="qmed-step-divider">›</span>
                <div className={`qmed-step-item ${candidate?.status === 'APPROVED_FOR_SHADOW' ? 'is-done' : ''}`}>
                  <span className="qmed-step-num">{candidate?.status === 'APPROVED_FOR_SHADOW' ? '✓' : '5'}</span>
                  <span>批准进入旁路监控</span>
                </div>
              </div>
            </div>

            <div className="qmed-preset-group">
              <span className="qmed-preset-label">快捷场景:</span>
              <button
                type="button"
                className="qmed-preset-btn"
                onClick={loadAgeContraindicationPreset}
                title="一键装配18岁以下未成年人禁用喹诺酮类场景"
              >
                <Icon name="sparkles" />
                <span>未成年人禁用喹诺酮类</span>
              </button>
              <button
                type="button"
                className="qmed-preset-btn"
                onClick={loadNsaidPreset}
                title="一键选择基药布洛芬/双氯芬酸并填入重复核对规范需求"
              >
                <Icon name="sparkles" />
                <span>解热镇痛药重复核对</span>
              </button>
              <button
                type="button"
                className="qmed-preset-btn"
                onClick={loadAntimicrobialPreset}
                title="一键选择基药头孢菌素/阿莫西林并填入抗菌药疗程上限需求"
              >
                <Icon name="sparkles" />
                <span>门诊抗菌药疗程上限</span>
              </button>
            </div>
          </div>

          {/* 工坊左右两栏协同 (各自局部独立平滑滚动) */}
          <div className="qmed-factory-panes">
            {/* 左栏：自然语言需求起草 + 规则串预览 + 药品参考预览 + 就绪清单 + 候选清单 */}
            <div className="qmed-factory-pane-left">
              {/* 规则需求描述 */}
              <div className="qmed-req-box">
                <div className="qmed-req-header">
                  <strong>规则审查需求描述</strong>
                  <div className="qmed-preset-btns">
                    <button
                      type="button"
                      className="qmed-chip-btn"
                      aria-label="预设模板 未成年禁忌"
                      onClick={() => setRequirement('18岁以下未成年人门诊禁用左氧氟沙星、诺氟沙星等喹诺酮类抗菌药物。')}
                    >
                      模板: 儿童禁忌
                    </button>
                    <button
                      type="button"
                      className="qmed-chip-btn"
                      aria-label="预设模板 通用药重复核对"
                      onClick={() => setRequirement('同一张门诊处方中，解热镇痛抗炎类药物出现两次以上时拦截，已撤销项目不参与。')}
                    >
                      模板: 重复核对
                    </button>
                    <button
                      type="button"
                      className="qmed-chip-btn"
                      aria-label="预设模板 抗菌药疗程上限"
                      onClick={() => setRequirement('门诊抗菌药物处方单张疗程天数不得超过 7 天上限，超期需阻断。')}
                    >
                      模板: 疗程上限
                    </button>
                  </div>
                </div>
                <FormField label="规则审查需求描述" className="qmed-visually-labelled-field">
                  <textarea rows={3} value={requirement} maxLength={4000}
                    onChange={e => setRequirement(e.target.value)}
                    placeholder="请直接输入自然语言临床规则需求，例如：18岁以下门诊禁用喹诺酮类，或解热镇痛药处方内不得超过1种…" />
                </FormField>
              </div>

              {/* 依据原文 */}
              <div className="qmed-req-box">
                <FormField label="依据 / 机构管理规范原文（可选）">
                  <textarea rows={2} value={source} maxLength={8000}
                    placeholder="未填写时标记为缺少依据，不自动补造药学证据"
                    onChange={e => setSource(e.target.value)} />
                </FormField>
              </div>

              {/* 标准药品定义候选规则的明确适用范围，不只是展示参考。 */}
              <div className="qmed-med-select-header">
                <h4>
                  规则适用药品范围 <small>({selectedMeds.length > 0 ? `已明确 ${selectedMeds.length} 种` : '生成时自动语义匹配'})</small>
                </h4>
                {selectedMeds.length > 0 && (
                  <Button variant="text" size="sm" onClick={() => setSelectedMeds([])}>清空筛选</Button>
                )}
              </div>
              <p className="qmed-med-scope-help">候选规则绑定标准规格及版本。请先关联标准参考目录；AI 可编写候选，不能自行创造药品身份或剂量上限。</p>
              <form className="qmed-med-search-box" onSubmit={e => {
                e.preventDefault()
                void action('搜索药品', async () => setMeds(await api.medicationWorkbench.medications(query)))
              }}>
                <SearchField label="搜索 HIS 药品" placeholder="检索药品 / 编码 / 别名（回车筛选）"
                  value={query} onChange={setQuery} />
              </form>
              <div className="qmed-med-scroll-list" style={{ maxHeight: '180px' }}>
                {meds.map(m => (
                  <label className="qmed-med-item" key={m.medication.id}>
                    <input
                      type="checkbox"
                      className="qmed-checkbox"
                      aria-label={`选择药品 ${m.medication.name}`}
                      checked={selectedMeds.some(v => v.medication.id === m.medication.id)}
                      disabled={!!busy || m.standardReference?.status !== 'LINKED'}
                      onChange={e => {
                        setSelectedMeds(s =>
                          e.target.checked
                            ? [...s, m]
                            : s.filter(v => v.medication.id !== m.medication.id)
                        )
                      }}
                    />
                    <div className="qmed-med-info">
                      <div className="qmed-med-name-row">
                        <strong className="qmed-med-name">{m.medication.name}</strong>
                        {m.medication.antimicrobial && <span className="qmed-mini-tag tag-anti">抗菌药</span>}
                        {m.classifications && m.classifications.length > 0 && (
                          <span className="qmed-mini-tag tag-blue">{m.classifications[0].display}</span>
                        )}
                      </div>
                      <div className="qmed-med-meta-row">
                        <code className="qmed-med-code">{m.standardReference?.specificationId ?? '待关联标准目录'}</code>
                        <span className="qmed-med-spec">{m.medication.preparationSpec || m.medication.doseForm || '规格待维护'}</span>
                      </div>
                    </div>
                  </label>
                ))}
                {meds.length === 0 && <p className="qmed-muted" style={{ padding: '8px' }}>{medsLoading ? '正在载入 HIS 药品…' : '未搜索到匹配的 HIS 药品'}</p>}
              </div>

              {/* AI 模型状态与生成主操作栏 (紧凑高密度单行) */}
              <div className="qmed-generation-action-box">
                <div className={`qmed-ai-compact-bar ${aiLoading ? 'is-checking' : ai?.available ? 'is-available' : 'is-unavailable'}`}>
                  <div className="qmed-ai-status-indicator">
                    <Icon name={aiLoading ? 'clinical' : ai?.available ? 'check' : 'warning'} />
                    <span>{aiLoading ? 'AI模型连通性检测中…' : ai?.available ? `模型已就绪: ${ai.model}` : '未配置大模型'}</span>
                    <span
                      className="qmed-guide-help"
                      title={aiLoading ? '正在后台非阻塞检测AI模型服务状态' : ai?.available ? `模型 ${ai.model} 已就绪，输入临床需求即可提炼规则串` : (ai?.message || '请前往系统设置配置模型')}
                    >
                      <Icon name="info" />
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!!busy || aiLoading || !ai?.available || !requirement.trim()}
                    onClick={() => action('AI 生成', generate)}
                  >
                    <Icon name="sparkles" />
                    <span>{busy === 'AI 生成' ? '正在生成规则串…' : aiLoading ? '检测模型中…' : candidate ? '重新生成规则串' : 'AI 生成候选规则'}</span>
                  </Button>
                </div>
              </div>

              {/* 候选版本清单 */}
              <div className="qmed-pane-subhead">
                <h4>
                  候选规则版本 <span className="qmed-badge">{candidates.length}</span>
                </h4>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!!busy}
                  onClick={startNewCandidate}
                >
                  新建候选
                </Button>
              </div>

              <div className="qmed-saved">
                {candidates.map(c => (
                  <button
                    disabled={!!busy}
                    className={`qmed-candidate-item ${candidate?.id === c.id ? 'is-active' : ''}`}
                    key={c.id}
                    aria-label={`候选版本 ${c.rule.name} v${c.version}`}
                    onClick={() => chooseCandidate(c)}
                  >
                    <div className="qmed-cand-title">
                      <strong>{c.rule.name}</strong>
                      <StatusBadge tone={medicationCandidateStatusPresentation(c.status).tone}>
                        {medicationCandidateStatusPresentation(c.status).label}
                      </StatusBadge>
                    </div>
                    {c.rule.ruleExpression && (
                      <div className="qmed-cand-expr-snippet">
                        <code>{c.rule.ruleExpression}</code>
                      </div>
                    )}
                    <small>
                      v{c.version} · {c.rule.categoryName || templateName(c.rule.template)} · {new Date(c.createdAt).toLocaleDateString()}
                    </small>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="qmed-muted" style={{ padding: '8px 0' }}>{candidatesLoading ? '正在载入候选规则…' : '暂无候选规则，请在上方输入需求生成或按需点击预设体验。'}</p>
                )}
              </div>
            </div>

            {/* 右栏：候选规则卡片 + 模拟门诊就诊测试舱 + 审查判定结果 */}
            <div className="qmed-factory-pane-right">
              {!candidate ? (
                <div className="qmed-factory-hero">
                  <div className="qmed-hero-banner">
                    <div className="qmed-hero-icon"><Icon name="clinical" /></div>
                    <div className="qmed-hero-content">
                      <h4>AI 规则孵化与模拟门诊就诊沙盘</h4>
                      <p>
                        基于标准药品目录与多级分类体系，通过自然语言提取可审阅的结构化规则表达式与受控模板参数。预制场景仅在点击后装配，空白新建不会自动带入演示内容。
                      </p>
                    </div>
                  </div>

                  <div className="qmed-hero-scenarios-head">
                    <h5>基药经典合规场景推荐</h5>
                    <span>点击一键装配规则需求、标的药品与模拟就诊患者</span>
                  </div>

                  <div className="qmed-scenario-cards-grid">
                    <div className="qmed-scenario-card" onClick={loadAgeContraindicationPreset} role="button" tabIndex={0}>
                      <div className="qmed-scenario-header">
                        <span className="qmed-scenario-tag tag-blue">儿童用药禁忌</span>
                        <span className="qmed-scenario-action">一键装配 ➔</span>
                      </div>
                      <h4 className="qmed-scenario-title">未成年人禁用喹诺酮类抗菌药</h4>
                      <p className="qmed-scenario-desc">
                        18 岁以下未成年患者门诊开具左氧氟沙星、诺氟沙星等喹诺酮类药物时直接阻断，保障儿童用药安全。
                      </p>
                      <div className="qmed-scenario-meta">
                        <span>规则串：IF Patient.Age &lt; 18 AND Category == '喹诺酮类' THEN BLOCK</span>
                        <span>模拟患者：李小明（男，14岁儿童）</span>
                      </div>
                    </div>

                    <div className="qmed-scenario-card" onClick={loadNsaidPreset} role="button" tabIndex={0}>
                      <div className="qmed-scenario-header">
                        <span className="qmed-scenario-tag tag-blue">基药重复用药</span>
                        <span className="qmed-scenario-action">一键装配 ➔</span>
                      </div>
                      <h4 className="qmed-scenario-title">解热镇痛药（NSAIDs）同类重复核对</h4>
                      <p className="qmed-scenario-desc">
                        同一张门诊处方中，解热镇痛抗炎类药品（如布洛芬、双氯芬酸）出现 2 种及以上时提示重复用药风险并预警。
                      </p>
                      <div className="qmed-scenario-meta">
                        <span>规则串：IF Prescription.Count(Category == '解热镇痛抗炎药') &gt;= 2 THEN WARN</span>
                        <span>模拟患者：张伟（男，28岁成人）</span>
                      </div>
                    </div>

                    <div className="qmed-scenario-card" onClick={loadAntimicrobialPreset} role="button" tabIndex={0}>
                      <div className="qmed-scenario-header">
                        <span className="qmed-scenario-tag tag-teal">抗菌药专项质控</span>
                        <span className="qmed-scenario-action">一键装配 ➔</span>
                      </div>
                      <h4 className="qmed-scenario-title">门诊抗菌药物疗程天数上限核对</h4>
                      <p className="qmed-scenario-desc">
                        门诊抗菌药物处方单张单品种疗程超过 7 天上限时进行阻断，要求医生录入病情依据或特殊指征。
                      </p>
                      <div className="qmed-scenario-meta">
                        <span>规则串：IF Medication.IsAntimicrobial == true AND DurationDays &gt; 7 THEN BLOCK</span>
                        <span>模拟患者：陈芳（女，35岁，开具10天超期）</span>
                      </div>
                    </div>
                  </div>

                  <div className="qmed-standards-pipeline">
                    <h5>QMED 规则安全准入五步闭环体系</h5>
                    <div className="qmed-pipeline-steps">
                      <div className="qmed-pipe-step">
                        <span className="step-num">01</span>
                        <div className="step-body">
                          <strong>需求与规则串生成</strong>
                          <small>自然语言生成可审阅表达式，并映射到受控确定性模板</small>
                        </div>
                      </div>
                      <div className="qmed-pipe-step">
                        <span className="step-num">02</span>
                        <div className="step-body">
                          <strong>标准分类联动</strong>
                          <small>关联国家基药多级分类与属性，摆脱手工勾选</small>
                        </div>
                      </div>
                      <div className="qmed-pipe-step">
                        <span className="step-num">03</span>
                        <div className="step-body">
                          <strong>模拟门诊就诊审查</strong>
                          <small>真实患者画像与处方开立，就诊级全要素验算</small>
                        </div>
                      </div>
                      <div className="qmed-pipe-step">
                        <span className="step-num">04</span>
                        <div className="step-body">
                          <strong>处方回放与单测</strong>
                          <small>自动离线测试用例与历史真实处方影子比对</small>
                        </div>
                      </div>
                      <div className="qmed-pipe-step">
                        <span className="step-num">05</span>
                        <div className="step-body">
                          <strong>专家批准进入旁路监控</strong>
                          <small>药事专家一键审批，在真实门诊旁路静默运行</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* 候选规则定义卡片 */}
                  <div className="qmed-candidate-card">
                    <div className="qmed-cand-top-bar">
                      <div className="qmed-cand-title-group">
                        <h4>{candidate.rule.name} · v{candidate.version}</h4>
                        <span className="qmed-pill-code">{templateName(candidate.rule.template)}</span>
                      </div>
                      {candidate.status !== 'APPROVED_FOR_SHADOW' ? (
                        <Button disabled={!!busy} onClick={() => approveCandidate(candidate.id)}>
                          批准进入旁路监控
                        </Button>
                      ) : (
                        <span className="qmed-tag tag-pass">已批准进入旁路监控</span>
                      )}
                    </div>

                    {/* 结构化规则判定串 (Rule Expression) 高亮展示区 */}
                    <div className="qmed-rule-expression-card">
                      <div className="qmed-expr-card-header">
                        <span className="qmed-expr-badge">规则判定串</span>
                        {candidate.rule.categoryName && (
                          <span className="qmed-expr-cat-tag">适用分类: {candidate.rule.categoryName}</span>
                        )}
                        <span className={`qmed-decision-tag tag-${candidate.rule.decision.toLowerCase()}`}>
                          动作: {candidate.rule.decision === 'BLOCK' ? '强制阻断 (BLOCK)' : candidate.rule.decision === 'WARN' ? '临床预警 (WARN)' : candidate.rule.decision}
                        </span>
                      </div>
                      <pre className="qmed-expr-code-block">
                        {candidate.rule.ruleExpression || candidate.rule.explanation}
                      </pre>
                    </div>

                    <p className="qmed-cand-explanation">{candidate.rule.explanation}</p>
                    <div className="qmed-cand-spec-grid">
                      <div className="qmed-spec-col">
                        <span className="qmed-spec-k">执行模板:</span>
                        <span className="qmed-spec-v">{templateName(candidate.rule.template)}</span>
                      </div>
                      <div className="qmed-spec-col">
                        <span className="qmed-spec-k">判定阈值:</span>
                        <span className="qmed-spec-v">
                          {candidate.rule.minAge ? `限制年龄 < ${candidate.rule.minAge} 岁` : `阈值数量 ≥ ${candidate.rule.duplicateCount}`}
                        </span>
                      </div>
                      <div className="qmed-spec-col full">
                        <span className="qmed-spec-k">依据出处:</span>
                        <span className="qmed-spec-v spec-source">{candidate.source ? candidate.source : '未填依据，供模拟就诊测试'}</span>
                      </div>
                      <div className="qmed-spec-col full">
                        <span className="qmed-spec-k">违规提示:</span>
                        <span className="qmed-spec-v spec-msg">{candidate.rule.message}</span>
                      </div>
                    </div>
                  </div>

                  {/* 模拟门诊就诊测试舱 */}
                  <div className="qmed-sandbox-panel">
                    <div className="qmed-sim-cabin-header">
                      <div className="qmed-cabin-title">
                        <h4><Icon name="clinical" /> 模拟门诊就诊测试舱</h4>
                        <p className="qmed-muted" style={{ margin: 0, fontSize: '12px' }}>
                          设定虚拟患者画像并模拟门诊医生开方，调用候选模板解释器验证结构化参数的判定效果；表达式用于审阅，不直接执行自由文本。
                        </p>
                      </div>
                      <div className="qmed-cabin-quick-actions">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!!busy}
                          onClick={() => action('运行标准用例', () => execute('suite'))}
                        >
                          跑离线标准单测
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!!busy}
                          onClick={() =>
                            action('历史记录', async () => setHistory(await api.medicationWorkbench.runs(candidate.id)))
                          }
                        >
                          历史测试记录{history.length > 0 ? `（${history.length}）` : ''}
                        </Button>
                      </div>
                    </div>

                    {/* 虚拟门诊患者档案卡 */}
                    <div className="qmed-patient-sim-card">
                      <div className="qmed-patient-sim-title">
                        <div className="title-left">
                          <span><Icon name="user" /> 虚拟门诊患者画像</span>
                          <div className="qmed-age-quick-chips">
                          <span className="chip-label">快速预设:</span>
                          <button
                            type="button"
                            className={`qmed-quick-age-btn ${simPatientAge === 14 ? 'is-active' : ''}`}
                            onClick={() => { setSimPatientAge(14); setSimPatientName('李小明'); setSimPatientGender('男'); setRun(null) }}
                          >
                            14岁儿童
                          </button>
                          <button
                            type="button"
                            className={`qmed-quick-age-btn ${simPatientAge === 28 ? 'is-active' : ''}`}
                            onClick={() => { setSimPatientAge(28); setSimPatientName('张伟'); setSimPatientGender('男'); setRun(null) }}
                          >
                            28岁成人
                          </button>
                          <button
                            type="button"
                            className={`qmed-quick-age-btn ${simPatientAge === 72 ? 'is-active' : ''}`}
                            onClick={() => { setSimPatientAge(72); setSimPatientName('赵大爷'); setSimPatientGender('男'); setRun(null) }}
                          >
                            72岁老年
                          </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="qmed-link-import-his"
                          onClick={() => setShowHisModal(true)}
                          title="从 HIS 真实历史处方库调入就诊与开方明细"
                        >
                          <Icon name="copy" />
                          <span>调入门诊真实历史处方</span>
                        </button>
                      </div>
                      <div className="qmed-patient-sim-fields">
                        <FormField label="患者姓名" className="qmed-inline-field qmed-patient-name-field">
                          <input value={simPatientName} onChange={e => setSimPatientName(e.target.value)} />
                        </FormField>
                        <FormField label="性别" className="qmed-inline-field qmed-gender-field">
                          <Select value={simPatientGender} options={genderOptions} searchable={false} clearable={false}
                            onChange={value => setSimPatientGender(value)} />
                        </FormField>
                        <FormField label="年龄（岁）" className="qmed-inline-field qmed-age-field">
                          <input type="number" min="0" max="120" value={simPatientAge}
                            onChange={e => { setSimPatientAge(e.target.value === '' ? '' : Number(e.target.value)); setRun(null) }} />
                        </FormField>
                        <FormField label="就诊科室" className="qmed-inline-field qmed-department-field">
                          <input value={simDepartment} onChange={e => setSimDepartment(e.target.value)} />
                        </FormField>
                        <FormField label="药物过敏史" className="qmed-inline-field qmed-allergy-field">
                          <input value={simAllergy} onChange={e => { setSimAllergy(e.target.value); setRun(null) }}
                            placeholder="如无已知药物过敏" />
                        </FormField>
                      </div>
                    </div>

                    {/* 模拟门诊开方表格 */}
                    <div className="qmed-rx-table-wrap">
                      <div className="qmed-rx-table-header">
                        <h5><Icon name="pill" /> 门诊处方开具明细 ({items.length} 项)</h5>
                        <div className="qmed-rx-presets">
                          <span className="chip-label">模拟用例:</span>
                          <button
                            type="button"
                            className="qmed-sample-btn"
                            onClick={() => {
                              const quinolone = meds.find(m => m.medication.name.includes('左氧氟沙星') || m.medication.name.includes('诺氟沙星'))
                              if (quinolone) {
                                setItems([{ medicationId: quinolone.medication.id, status: 'DRAFT', durationDays: 3, routeCode: quinolone.medication.defaultRoute || 'ORAL' }])
                                setSimPatientAge(14)
                                setRun(null)
                              } else {
                                setNotice('药品目录中未找到喹诺酮类药品，请手动选择药品。')
                              }
                            }}
                          >
                            未成年开喹诺酮
                          </button>
                          <button
                            type="button"
                            className="qmed-sample-btn"
                            onClick={() => {
                              const cef = meds.find(m => m.medication.name.includes('头孢') || m.medication.antimicrobial)
                              if (cef) {
                                setItems([{ medicationId: cef.medication.id, status: 'DRAFT', durationDays: 10, routeCode: cef.medication.defaultRoute || 'ORAL' }])
                                setRun(null)
                              } else {
                                setNotice('药品目录中未找到抗菌药，请手动选择药品。')
                              }
                            }}
                          >
                            抗菌药超7天疗程
                          </button>
                          <button
                            type="button"
                            className="qmed-sample-btn"
                            onClick={() => {
                              const nsaids = meds.filter(m => m.medication.name.includes('布洛芬') || m.medication.name.includes('双氯芬酸') || m.medication.name.includes('阿司匹林'))
                              if (nsaids.length >= 2) {
                                setItems([
                                  { medicationId: nsaids[0].medication.id, status: 'DRAFT', durationDays: 3, routeCode: nsaids[0].medication.defaultRoute || 'ORAL' },
                                  { medicationId: nsaids[1].medication.id, status: 'DRAFT', durationDays: 3, routeCode: nsaids[1].medication.defaultRoute || 'ORAL' }
                                ])
                                setRun(null)
                              } else {
                                setNotice('药品目录中未找到至少2种非甾体抗炎药，请手动添加明细并选择药品。')
                              }
                            }}
                          >
                            同类NSAIDs双重开药
                          </button>
                        </div>
                      </div>

                      {items.map((item, i) => {
                        const targetMed = meds.find(m => m.medication.id === item.medicationId)
                        const inRuleScope = !!item.medicationId && candidate.medications.some(m => m.medication.id === item.medicationId)
                        const medicationOptions = meds.map(m => ({
                          value: m.medication.id,
                          label: m.medication.name,
                          secondaryText: m.medication.preparationSpec || m.medication.doseForm || '规格待维护',
                          description: m.classifications?.[0]?.display,
                          trailingText: m.medication.code,
                          searchKeywords: [m.medication.code, m.classifications?.[0]?.display || '']
                        }))
                        if (item.medicationId && !medicationOptions.some(option => option.value === item.medicationId)) {
                          medicationOptions.unshift({ value: item.medicationId, label: item.name || '历史药品', secondaryText: item.spec || '历史快照', description: '仅存在于历史处方', trailingText: '', searchKeywords: [] })
                        }
                        return (
                          <div className="qmed-trial-row" key={i}>
                            <span className="row-num">{i + 1}</span>
                            <div className="qmed-med-picker-col">
                              <Select aria-label={`第${i + 1}行药品`} value={item.medicationId || ''}
                                options={medicationOptions} placeholder="录入药品名称/拼音/编码搜索..." clearable
                                onChange={value => {
                                  const selected = meds.find(m => m.medication.id === value)
                                  updateItem(i, selected ? {
                                    medicationId: selected.medication.id,
                                    routeCode: selected.medication.defaultRoute || item.routeCode || 'ORAL',
                                    frequencyCode: selected.medication.defaultFrequency || item.frequencyCode || 'TID',
                                    name: selected.medication.name,
                                    spec: selected.medication.preparationSpec || undefined
                                  } : { medicationId: value || null })
                                }} />
                            </div>
                            <span className={`qmed-row-tag ${inRuleScope ? 'is-in-scope' : 'is-out-of-scope'}`} title={inRuleScope ? '该药已绑定到候选规则适用范围' : '该药不在候选规则适用范围，原始处方旁路核对时不会参与此规则判定'}>
                              {inRuleScope ? (targetMed?.classifications?.[0]?.display || '规则范围内') : '不在规则范围'}
                            </span>
                            <Select className="qmed-select-route" aria-label={`第${i + 1}行给药途径`}
                              value={item.routeCode || 'ORAL'} options={routeOptions} placeholder="选择给药途径" clearable={false}
                              onChange={value => updateItem(i, { routeCode: value })} />
                            <Select className="qmed-select-freq" aria-label={`第${i + 1}行给药频次`}
                              value={item.frequencyCode || 'TID'} options={frequencyOptions} placeholder="选择频次" clearable={false}
                              onChange={value => updateItem(i, { frequencyCode: value })} />
                            <div className="qmed-days-input-wrap">
                              <input
                                className="ui-field__control"
                                type="number"
                                min="1"
                                max="90"
                                step="1"
                                aria-label={`第${i + 1}行疗程天数`}
                                title="疗程天数"
                                placeholder="天数"
                                value={item.durationDays ?? ''}
                                onChange={e => {
                                  updateItem(i, { durationDays: e.target.value === '' ? null : Number(e.target.value) })
                                  setRun(null)
                                }}
                              />
                              <span className="unit">天</span>
                            </div>
                            <IconButton
                              icon="close"
                              label={`删除第${i + 1}行`}
                              className="qmed-row-del-btn"
                              onClick={() => {
                                setItems(s => s.filter((_, n) => n !== i))
                                setRun(null)
                              }}
                            />
                          </div>
                        )
                      })}

                      <div className="qmed-rx-add-actions">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!!busy || items.length >= 20 || meds.length === 0}
                          onClick={() => {
                            if (meds.length > 0) {
                              setItems(s => [
                                ...s,
                                {
                                  medicationId: meds[0].medication.id,
                                  status: 'DRAFT',
                                  durationDays: 3,
                                  routeCode: meds[0].medication.defaultRoute || 'ORAL'
                                }
                              ])
                              setRun(null)
                            }
                          }}
                        >
                          + 添加开方药品
                        </Button>
                      </div>
                    </div>

                    {/* 审查触发操作栏 */}
                    <div className="qmed-sim-trigger-bar">
                      <Button
                        variant="primary"
                        disabled={!!busy || items.length === 0}
                        onClick={() => action('模拟就诊审查', () => execute('trial'))}
                      >
                        模拟门诊就诊审查
                      </Button>
                      {importedPrescription && (
                        <Button variant="secondary" disabled={!!busy}
                          onClick={() => action('原始处方旁路核对', () => execute('shadow'))}>
                          原始处方旁路核对
                        </Button>
                      )}
                      <span className="qmed-meta-text">
                        {importedPrescription
                          ? `已调入 HIS 处方 ${importedPrescription.prescriptionId}；当前表单可用于调整后模拟，原始旁路核对不采用表单修改。`
                          : items.length > 0
                          ? `患者【${simPatientName} (${simPatientAge === '' ? '年龄未知' : `${simPatientAge}岁`})】已就诊，开具 ${items.length} 种药品，可随时触发就诊级审查`
                          : '请至少添加 1 种处方药品进行模拟审查'}
                      </span>
                    </div>

                    {/* 临床审查判定报告 */}
                    {run && (
                      <div className="qmed-results">
                        <div className="qmed-results-header">
                          <h3>{run.mode === 'HIS_SHADOW' ? 'HIS 真实处方旁路核对报告' : '门诊模拟就诊安全核对报告'}</h3>
                          <small>规则版本 v{candidate.version} · {new Date(run.createdAt).toLocaleTimeString()}</small>
                        </div>
                        {run.cases.map((c, i) => (
                          <article key={i} className={`qmed-case result-${c.actual.toLowerCase()}`}>
                            <div className="qmed-case-header">
                              <strong className="qmed-case-name">{c.name}</strong>
                              <StatusBadge
                                tone={c.actual === 'BLOCK' ? 'danger' : c.actual === 'WARN' ? 'warning' : c.actual === 'PASS' ? 'success' : 'neutral'}
                              >
                                <Icon name={c.actual === 'BLOCK' ? 'error' : c.actual === 'WARN' ? 'warning' : c.actual === 'PASS' ? 'check' : 'info'} />
                                <span>{c.actual === 'BLOCK' ? '强制阻断 (BLOCK)' : c.actual === 'WARN' ? '临床预警 (WARN)' : c.actual === 'PASS' ? '审核通过 (PASS)' : '事实缺失 (UNAVAILABLE)'}</span>
                              </StatusBadge>
                            </div>
                            <div className="qmed-case-body">
                              <p className="qmed-case-reason">
                                {c.reasons.join('；') || '未发现用药安全风险，符合处方管理规范。'}
                              </p>
                              {c.matchedRows.length > 0 && (
                                <div className="qmed-case-meta">
                                  <span>命中违规处方条目：第 <strong>{c.matchedRows.join('、')}</strong> 行</span>
                                </div>
                              )}
                              {candidate.rule.ruleExpression && (
                                <div className="qmed-case-expr">
                                  <span>规则表达式（审阅）：</span>
                                  <code>{candidate.rule.ruleExpression}</code>
                                </div>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}

                    {showHisModal && (
                      <Dialog
                        title="调入门诊真实处方"
                        eyebrow="合理用药模拟沙舱"
                        description="按就诊与处方标识读取 HIS 保存的原始快照，载入患者安全上下文与全部处方明细；此操作不会立即执行审查。"
                        size="wide"
                        onClose={() => setShowHisModal(false)}
                        footer={<div className="qmed-dialog-footer-actions">
                          <Button variant="secondary" onClick={() => setShowHisModal(false)}>取消</Button>
                          <Button variant="primary" busy={busy === '读取真实处方'}
                            disabled={!hisEncounterInput.trim() || !hisPrescriptionInput.trim()}
                            onClick={() => action('读取真实处方', importPrescription)}>
                            读取并载入处方
                          </Button>
                        </div>}
                      >
                        <div className="qmed-his-modal-content">
                          <div className="qmed-his-import-note">
                            <Icon name="info" />
                            <p><strong>调入与核对分为两步。</strong>载入后可查看或调整沙舱表单；调整后的内容走“模拟门诊就诊审查”。如需验证真实历史处方，请使用“原始处方旁路核对”，系统会重新读取不可变快照，不会把表单修改冒充真实处方。</p>
                          </div>
                          <div className="qmed-his-inputs-row">
                            <FormField label="就诊标识" required className="qmed-his-input-field">
                              <input inputMode="numeric" value={hisEncounterInput}
                                onChange={e => setHisEncounterInput(e.target.value)} placeholder="请输入真实就诊标识" />
                            </FormField>
                            <FormField label="处方标识" required className="qmed-his-input-field">
                              <input inputMode="numeric" value={hisPrescriptionInput}
                                onChange={e => setHisPrescriptionInput(e.target.value)} placeholder="请输入真实处方标识" />
                            </FormField>
                          </div>
                        </div>
                      </Dialog>
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
