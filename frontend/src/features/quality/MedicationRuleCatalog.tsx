import { useEffect, useState } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type {
  CatalogVersion,
  MedicationCandidate,
  MedicationKnowledge,
  RuleCatalog,
  RuleCatalogCommand,
  RuleCatalogEntry,
  RuleDeployment
} from '../../shared/api/medicationWorkbenchApi'
import { Alert, Button, Dialog, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'
import './medication-rule-catalog.css'
import { MedicationKnowledgePublicationDialog } from './MedicationKnowledgePublicationDialog'
import { MedicationKnowledgeDeploymentDialog } from './MedicationKnowledgeDeploymentDialog'
import { MedicationKnowledgeReviewDialog } from './MedicationKnowledgeReviewDialog'
import { MedicationKnowledgeTestDialog } from './MedicationKnowledgeTestDialog'
import { MedicationKnowledgeRuleView } from './MedicationKnowledgeRuleView'
import { getBuiltinRuleSpec } from './medicationRuleCatalogSpecs'
import { formatLocaleDateTime } from '../../shared/format'

const reviews: Record<string, string> = {
  DRAFT: '草稿',
  IN_REVIEW: '待审核',
  REJECTED: '已退回',
  APPROVED: '审核通过',
  RETIRED: '已废止'
}

const actions: Record<string, string> = {
  WARN: '提醒核对',
  REQUIRE_OVERRIDE: '继续开立需说明',
  BLOCK: '阻止提交'
}

const modes: Record<string, string> = {
  SHADOW: '旁路观察',
  ENFORCED: '正式生效'
}

const operations: Record<string, string> = {
  SUBMIT: '提交审核',
  APPROVE: '审核通过',
  REJECT: '退回修改',
  DEPLOY: '发布版本',
  PAUSE: '暂停运行',
  ROLLBACK: '回滚版本',
  RETIRE: '废止版本',
  WITHDRAW: '撤回提交'
}

const originName: Record<string, string> = {
  BUILTIN: '系统内置',
  AI: 'AI 辅助起草',
  MANUAL: '人工起草',
  KNOWLEDGE: '知识编译'
}

function reviewTone(status?: string): 'neutral' | 'warning' | 'info' | 'success' | 'danger' {
  switch (status) {
    case 'APPROVED': return 'success'
    case 'IN_REVIEW': return 'info'
    case 'DRAFT': return 'warning'
    case 'REJECTED': return 'danger'
    case 'RETIRED': return 'neutral'
    default: return 'neutral'
  }
}

function modeTone(modeStr?: string): 'neutral' | 'warning' | 'info' | 'success' | 'danger' {
  if (!modeStr) return 'neutral'
  if (modeStr.includes('正式生效')) return 'success'
  if (modeStr.includes('旁路观察')) return 'info'
  if (modeStr.includes('待生效')) return 'warning'
  if (modeStr.includes('已暂停') || modeStr.includes('已结束') || modeStr.includes('已替换')) return 'neutral'
  return 'neutral'
}

function runtimeStatus(d: RuleDeployment) {
  if (d.status === 'PAUSED') return '已暂停'
  if (d.status === 'SUPERSEDED') return '已替换'
  if (d.effectiveTo && Date.parse(d.effectiveTo) <= Date.now()) return '已结束'
  if (Date.parse(d.effectiveFrom) > Date.now()) return '待生效'
  return modes[d.mode] ?? d.mode
}

function hasDefaultShadow(rule: RuleCatalogEntry) {
  return rule.origin === 'BUILTIN' && !rule.deployments.length && rule.versions.some(v => v.builtin?.ruleSetVersion === 'qmed-standard-shadow-v2' && v.reviewStatus !== 'RETIRED')
}

function summary(rule: RuleCatalogEntry) {
  const live = rule.deployments.filter(d => ['正式生效', '旁路观察'].includes(runtimeStatus(d)))
  return live.length
    ? live.map(d => `${modes[d.mode]} v${d.version}`).join(' · ')
    : hasDefaultShadow(rule)
      ? '内置正式审查'
      : rule.deployments.length
        ? '暂无运行版本'
        : '尚未发布'
}

function getRuleStatusTone(rule: RuleCatalogEntry): 'neutral' | 'warning' | 'info' | 'success' | 'danger' {
  const s = summary(rule)
  if (s.includes('正式生效') || s.includes('内置正式审查')) return 'success'
  if (s.includes('旁路观察')) return 'info'
  if (s.includes('待生效')) return 'warning'
  if (rule.versions.some(v => v.reviewStatus === 'IN_REVIEW')) return 'info'
  if (rule.versions.some(v => v.reviewStatus === 'DRAFT')) return 'warning'
  return 'neutral'
}

export function MedicationRuleCatalog({
  api,
  onBuiltinTrial,
  onOpenFactory
}: {
  api: RhnApi
  onBuiltinTrial: (code: string) => void
  onOpenFactory?: () => void
}) {
  const [data, setData] = useState<RuleCatalog>()
  const [selected, setSelected] = useState('')
  const [versionId, setVersionId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [origin, setOrigin] = useState('ALL')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [testCandidate, setTestCandidate] = useState<NonNullable<CatalogVersion['knowledgeCandidate']>>()
  const [publicationCandidate, setPublicationCandidate] = useState<NonNullable<CatalogVersion['knowledgeCandidate']>>()
  const [deploymentCandidate, setDeploymentCandidate] = useState<NonNullable<CatalogVersion['knowledgeCandidate']>>()
  const [reviewCandidate, setReviewCandidate] = useState<NonNullable<CatalogVersion['knowledgeCandidate']>>()
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<{ operation: string; versionId: string; deployment?: RuleDeployment; mode?: string }>()
  const [draft, setDraft] = useState<{ parent?: MedicationCandidate }>()

  const rule = data?.rules.find(r => r.key === selected)
  const version = rule?.versions.find(v => v.id === versionId) ?? rule?.versions[0]

  const loadCatalog = (): Promise<RuleCatalog> => api.medicationWorkbench.catalog()

  async function reload(prefer?: string) {
    setLoading(true)
    try {
      const result = await loadCatalog()
      setData(result)
      setSelected(old => prefer ?? (result.rules.some(r => r.key === old) ? old : result.rules[0]?.key ?? ''))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    loadCatalog()
      .then(value => {
        if (alive) {
          setData(value)
          setSelected(value.rules[0]?.key ?? '')
        }
      })
      .catch(e => {
        if (alive) setError(errorMessage(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [api])

  const visible = (data?.rules ?? []).filter(r => {
    const matchText = `${r.code} ${r.name}`.toLowerCase().includes(query.toLowerCase())
    const matchState = filter === 'ALL'
      || r.versions.some(v => v.reviewStatus === filter)
      || r.deployments.some(d => runtimeStatus(d) === filter)
      || (filter === '正式生效' && hasDefaultShadow(r))
    return matchText && matchState && (origin === 'ALL' || r.origin === origin)
  })

  async function runSuite(v: CatalogVersion) {
    if (!v.candidate) return
    setBusy(true)
    setError('')
    try {
      const runResult = await api.medicationWorkbench.suite(v.candidate.id)
      setNotice(runResult.cases.every(c => c.passed) ? '当前版本回归用例全部通过，可以提交审核。' : '存在未通过用例，请先修正规则。')
      await reload(selected)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="qmed-governance" aria-label="合理用药规则目录">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      {/* 单行紧凑筛选条 (严格控制桌面端宽度，杜绝换行) */}
      <div className="qmed-governance__filters ui-query-filters">
        <SearchField
          label="搜索规则名称"
          value={query}
          onChange={setQuery}
          placeholder="搜索规则名称"
        />
        <Select
          aria-label="规则状态筛选"
          value={filter}
          onChange={setFilter}
          options={[
            ['ALL', '全部状态'],
            ['DRAFT', '草稿'],
            ['IN_REVIEW', '待审核'],
            ['REJECTED', '已退回'],
            ['APPROVED', '审核通过'],
            ['旁路观察', '旁路观察'],
            ['正式生效', '正式生效'],
            ['待生效', '待生效'],
            ['已暂停', '已暂停'],
            ['已结束', '历史发布'],
            ['RETIRED', '已废止']
          ].map(([value, label]) => ({ value, label }))}
        />
        <Select
          aria-label="规则来源筛选"
          value={origin}
          onChange={setOrigin}
          options={[
            { value: 'ALL', label: '全部来源' },
            ...Object.entries(originName).map(([value, label]) => ({ value, label }))
          ]}
        />
        {(query || filter !== 'ALL' || origin !== 'ALL') && (
          <Button
            variant="text"
            onClick={() => {
              setQuery('')
              setFilter('ALL')
              setOrigin('ALL')
            }}
          >
            重置筛选
          </Button>
        )}
        <div className="ui-query-filters__actions">
          <Button variant="secondary" onClick={() => void reload()}>
            <Icon name="refresh" />
            <span>刷新目录</span>
          </Button>
          <Button variant="primary" onClick={() => onOpenFactory ? onOpenFactory() : setDraft({})}>
            <Icon name="add" />
            <span>去规则工坊起草</span>
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <LoadingState label="正在读取规则目录…" />
      ) : (
        <div className="qmed-governance__panes">
          {/* 左侧规则列表面板 */}
          <div className="qmed-governance__list-panel">
            <div className="qmed-governance__list-head">
              <span>规则列表</span>
              <span>共 <strong>{visible.length}</strong>{visible.length !== (data?.rules.length ?? 0) ? ` / ${data?.rules.length ?? 0}` : ''} 条</span>
            </div>
            <div className="qmed-governance__list">
              {visible.map(r => {
                const ruleSummary = summary(r)
                const statusTone = getRuleStatusTone(r)
                const isSelected = r.key === selected

                return (
                  <button
                    type="button"
                    key={r.key}
                    className={`qmed-governance__rule ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelected(r.key)
                      setVersionId('')
                    }}
                  >
                    <div className="qmed-governance__rule-head">
                      <strong>{r.name}</strong>
                      <StatusBadge tone={statusTone}>{ruleSummary}</StatusBadge>
                    </div>
                    {r.origin !== 'BUILTIN' && (
                      <div className="qmed-governance__rule-code-row">
                        <span className={`qmed-chip ${r.origin === 'AI' ? 'qmed-chip--ai' : ''}`}>
                          {originName[r.origin] ?? r.origin}
                        </span>
                      </div>
                    )}
                  </button>
                )
              })}
              {!visible.length && (
                <div className="qmed-empty-state">
                  <Icon name="search" />
                  <p>当前筛选条件下没有规则。</p>
                </div>
              )}
            </div>
          </div>

          {/* 右侧详情与治理工作区 */}
          <div className="qmed-governance__detail">
            {rule && version ? (
              <>
                {/* 详情顶部核心看板 (2 行紧凑布局，标题、状态徽章与操作按钮同行对齐) */}
                <div className="qmed-detail-hero">
                  <div className="qmed-detail-hero__row2">
                    <div className="qmed-detail-hero__title-box">
                      <h3>{rule.name}</h3>
                      {rule.origin !== 'BUILTIN' && (
                        <span className={`qmed-chip ${rule.origin === 'AI' ? 'qmed-chip--ai' : ''}`}>
                          {originName[rule.origin] ?? rule.origin}
                        </span>
                      )}
                      <div className="qmed-detail-hero__badges">
                        {version.builtin ? (
                          <>
                            <StatusBadge tone="success">系统在行基线</StatusBadge>
                            <StatusBadge tone={version.builtin.decision === 'BLOCK' ? 'danger' : 'warning'}>
                              执行动作：{actions[version.builtin.decision] ?? version.builtin.decision}
                            </StatusBadge>
                          </>
                        ) : (
                          <>
                            <StatusBadge tone={reviewTone(version.reviewStatus)}>
                              {reviews[version.reviewStatus] ?? version.reviewStatus}
                            </StatusBadge>
                            <StatusBadge tone={version.testsPassed ? 'success' : 'warning'}>
                              {version.testsPassed
                                ? (version.knowledgeCandidate ? '结构样例通过 · 人工验证另查' : '回归测试通过')
                                : '尚未通过回归测试'}
                            </StatusBadge>
                            {version.knowledgeCandidate && (
                              <StatusBadge tone={version.manualValidation?.status === 'FAILED' ? 'danger' : 'info'}>
                                人工样例：{version.manualValidation?.status === 'PASSED' ? `v${version.manualValidation.suiteVersion} 全部通过` : version.manualValidation?.status === 'FAILED' ? `v${version.manualValidation.suiteVersion} 有失败项` : version.manualValidation?.status === 'NOT_RUN' ? `v${version.manualValidation.suiteVersion} 待运行` : '尚未编写'}
                              </StatusBadge>
                            )}
                            <span className="qmed-action-chip">
                              审核动作：{version.review?.action ? actions[version.review.action] ?? version.review.action : '待审核确定'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="qmed-detail-hero__action-inline">
                    <div className="qmed-detail-hero__version-ctrl">
                      <span className="qmed-field-label">审阅版本:</span>
                      <Select
                        aria-label="规则版本"
                        value={version.id}
                        onChange={setVersionId}
                        options={rule.versions.map(v => ({
                          value: v.id,
                          label: `v${v.version} · ${reviews[v.reviewStatus] ?? v.reviewStatus}`
                        }))}
                      />
                    </div>
                      {version.knowledgeCandidate && (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => setTestCandidate(version.knowledgeCandidate!)}>人工样例</Button>
                          <Button variant="secondary" size="sm" onClick={() => setReviewCandidate(version.knowledgeCandidate!)}>审核提交</Button>
                          <Button variant="secondary" size="sm" onClick={() => setDeploymentCandidate(version.knowledgeCandidate!)}>旁路部署</Button>
                          <Button variant="primary" size="sm" onClick={() => setPublicationCandidate(version.knowledgeCandidate!)}>启用回退</Button>
                        </>
                      )}
                      {version.candidate && (
                        <>
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runSuite(version)}>
                            <Icon name="flask" />
                            <span>运行回归套件</span>
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setDraft({ parent: version.candidate! })}>
                            <Icon name="add" />
                            <span>新版本</span>
                          </Button>
                        </>
                      )}
                      {version.builtin && (
                        <Button variant="secondary" onClick={() => onBuiltinTrial(rule.code)}>
                          <Icon name="flask" />
                          <span>验证当前规则</span>
                        </Button>
                      )}
                      {!version.builtin && !version.knowledgeCandidate && ['DRAFT', 'REJECTED'].includes(version.reviewStatus) && (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!version.testsPassed}
                          onClick={() => setAction({ operation: 'SUBMIT', versionId: version.id })}
                        >
                          <span>提交审核</span>
                        </Button>
                      )}
                      {!version.knowledgeCandidate && version.reviewStatus === 'IN_REVIEW' && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setAction({ operation: 'APPROVE', versionId: version.id })}
                          >
                            <Icon name="check" />
                            <span>审核通过</span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setAction({ operation: 'REJECT', versionId: version.id })}
                          >
                            <Icon name="close" />
                            <span>退回修改</span>
                          </Button>
                        </>
                      )}
                      {!version.knowledgeCandidate && version.reviewStatus === 'APPROVED' && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setAction({ operation: 'DEPLOY', versionId: version.id, mode: 'SHADOW' })}
                          >
                            <Icon name="eye" />
                            <span>旁路观察</span>
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setAction({ operation: 'DEPLOY', versionId: version.id, mode: 'ENFORCED' })}
                          >
                            <Icon name="check" />
                            <span>正式发布</span>
                          </Button>
                        </>
                      )}
                      {!version.builtin && version.reviewStatus !== 'RETIRED' && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setAction({ operation: 'RETIRE', versionId: version.id })}
                        >
                          <span>废止</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>


                {/* 主卡片：规则版本内容、判定逻辑与循证医学依据 (全宽展示) */}
                {(() => {
                  const evidences = (version.builtin?.evidence?.length ? version.builtin.evidence : undefined)
                    ?? (version.review?.evidence?.length ? version.review.evidence : undefined)
                    ?? []

                  return (
                    <section className={`qmed-card qmed-card--fullwidth${version.knowledgeCandidate ? ' qmed-card--knowledge' : ''}`}>
                      <div className="qmed-card__header">
                        <div className="qmed-card__header-title">
                          <Icon name="clinical" />
                          <h4>版本内容与规则定义</h4>
                        </div>
                        <span className="qmed-ver-tag">v{version.version}</span>
                      </div>
                      <div className="qmed-card__body">
                        <p className="qmed-card__lead">
                          {version.candidate?.rule.explanation
                            ?? (version.builtin ? getBuiltinRuleSpec(rule.code, version.builtin.implementationKey)?.explanation : undefined)
                            ?? version.builtin?.definition.category}
                        </p>
                        {version.candidate && (
                          <>
                            {version.candidate.medications.length > 0 && (
                              <div className="qmed-meds-tags">
                                <span className="qmed-field-label">适用药品：</span>
                                {version.candidate.medications.map(m => (
                                  <span key={m.medication.id} className="qmed-med-pill">
                                    {m.medication.name}
                                    {m.medication.preparationSpec ? ` · ${m.medication.preparationSpec}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="qmed-code-block">
                              <div className="qmed-code-header">
                                <span>规则表达式 (DSL)</span>
                                <span className="qmed-code-type">强化校验规则</span>
                              </div>
                              <pre>{version.candidate.rule.ruleExpression ?? version.candidate.rule.explanation}</pre>
                            </div>
                            <div className="qmed-meta-row">
                              <span className="qmed-field-label">起草依据：</span>
                              <span>{version.candidate.source || '尚未填写'}</span>
                            </div>
                          </>
                        )}
                        {version.knowledgeCandidate && <><p>来源知识 {version.knowledgeCandidate.knowledgeId} · 第 {version.knowledgeCandidate.knowledge.version} 版；生成者：{version.knowledgeCandidate.actor}；原因：{version.knowledgeCandidate.reason}。修改时请回到知识草稿，保存后生成新候选版本。可维护人工验证样例并提交独立审核；旁路部署、暂停及观察请使用“旁路部署与观察”入口；正式启用、暂停正式及回退请使用“正式启用与回退”入口。</p><MedicationKnowledgeRuleView value={version.knowledgeCandidate} /></>}
                        {version.builtin && (() => {
                          const builtinSpec = getBuiltinRuleSpec(rule.code, version.builtin.implementationKey)
                          if (builtinSpec) {
                            return (
                              <div className="qmed-builtin-spec-detailed">
                                {/* 临床机制与拦截风险说明 (置于表达式前，引导临床语境) */}
                                {builtinSpec.clinicalRisk && (
                                  <div className="qmed-clinical-risk-callout">
                                    <Icon name="info" />
                                    <div className="qmed-clinical-risk-content">
                                      <strong>临床药理风险与拦截防范目的：</strong>
                                      <span>{builtinSpec.clinicalRisk}</span>
                                    </div>
                                  </div>
                                )}

                                {/* 结构化规则表达式 (DSL) 代码块 */}
                                <details className="qmed-fold">
                                  <summary>规则判定表达式（DSL）<span className="qmed-code-type">{builtinSpec.templateName}</span></summary>
                                  <div className="qmed-code-block"><pre>{builtinSpec.dslExpression}</pre></div>
                                </details>

                                {/* 参数化判定条件与规则配置 */}
                                <div className="qmed-builtin-params-section">
                                  <div className="qmed-builtin-params-title">
                                    <span className="qmed-field-label">参数化判定条件与规则配置：</span>
                                  </div>
                                  <div className="qmed-builtin-params-grid">
                                    {builtinSpec.parameters.map((p, idx) => (
                                      <div key={idx} className="qmed-builtin-param-item">
                                        <span className="qmed-param-label">{p.label}</span>
                                        <span className="qmed-param-val">
                                          {p.badgeTone ? (
                                            <StatusBadge tone={p.badgeTone}>{p.value}</StatusBadge>
                                          ) : (
                                            p.value
                                          )}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* 挂载合理用药安全分类 */}
                                {builtinSpec.boundCategories.length > 0 && (
                                  <div className="qmed-builtin-categories-row">
                                    <span className="qmed-field-label">挂载合理用药安全分类：</span>
                                    <div className="qmed-builtin-categories-list">
                                      {builtinSpec.boundCategories.map(cat => (
                                        <span key={cat.code} className="qmed-bound-cat-pill" title={cat.description}>
                                          <strong>{cat.name}</strong>
                                        </span>
                                      ))}
                                      <span className="qmed-cat-link-tip">
                                        （支持在【安全分类维护】中扩展药品，规则动态生效）
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          }

                          return (
                            <div className="qmed-builtin-spec">
                              <p>内置规则的计算逻辑由版本化执行器维护，发布范围和审核策略在此管理。</p>
                            </div>
                          )
                        })()}

                        {/* 循证医学与审核依据 (仅当有证据时按需展示，绝不常驻空态) */}
                        {evidences.length > 0 && (
                          <details className="qmed-fold qmed-builtin-evidence-section">
                            <summary>循证医学与法规依据（{evidences.length} 项已审定）</summary>
                            <div className="qmed-builtin-evidence-grid">
                              {evidences.map((e, i) => (
                                <div key={i} className="qmed-evidence-card">
                                  <div className="qmed-evidence-card__head">
                                    <strong>{e.sourceTitle}</strong>
                                    <span className="qmed-evidence-ver">版本：{e.sourceVersion}</span>
                                  </div>
                                  <div className="qmed-evidence-card__locator">
                                    {e.sourceLocator}{e.section ? ` · ${e.section}` : ''}
                                  </div>
                                  <blockquote className="qmed-evidence-card__excerpt">
                                    <Icon name="info" />
                                    <span>{e.excerpt}</span>
                                  </blockquote>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>

                      {/* 卡片底栏：规则执行基准、发布范围与管控 */}
                      {version.builtin && (
                        <div className="qmed-card__footer">
                          <div className="qmed-card-footer-bar">
                            <div className="qmed-card-footer-meta">
                              {hasDefaultShadow(rule) && !rule.deployments.length && (
                                <div className="qmed-card-footer-item">
                                  <span className="qmed-field-label">发布策略：</span>
                                  <StatusBadge tone="success">内置正式审查</StatusBadge>
                                  <span className="qmed-card-footer-scope">（全机构各科室生效）</span>
                                </div>
                              )}
                            </div>
                            {hasDefaultShadow(rule) && !rule.deployments.length && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setAction({
                                  operation: 'PAUSE',
                                  versionId: rule.versions.find(v => v.builtin?.ruleSetVersion === 'qmed-standard-shadow-v2')!.id
                                })}
                              >
                                暂停本机构内置规则
                              </Button>
                            )}
                          </div>
                          <div className="qmed-card-footer-hint">
                            <small className="qmed-runtime-hint-text">
                              内置规则按正式审查参与处方提交校验；旁路发布的知识规则只记录评价，不改变提交结果。
                            </small>
                          </div>
                        </div>
                      )}
                    </section>
                  )
                })()}


                {/* 发布与运行范围管控 (非内置默认旁路或已有发布部署记录时展示) */}
                {(!hasDefaultShadow(rule) || rule.deployments.length > 0) && (
                  <section className="qmed-card">
                    <div className="qmed-card__header">
                      <div className="qmed-card__header-title">
                        <Icon name="hospital" />
                        <h4>发布与运行范围</h4>
                      </div>
                      <small>管控本机构及科室范围生效策略</small>
                    </div>
                    <div className="qmed-card__body">
                      {!rule.deployments.length && (
                        <div className="qmed-empty-state">
                          <Icon name="warning" />
                          <p>尚未发布。旧的旁路批准标签仅作历史记录，须在此完成审核并启用。</p>
                        </div>
                      )}
                      {rule.deployments.length > 0 && (
                        <div className="qmed-deployments-list">
                          {[...rule.deployments].reverse().map(d => (
                            <div key={d.id} className="qmed-release-row">
                              <div className="qmed-release-row__info">
                                <div className="qmed-release-row__title">
                                  <span className="qmed-ver-tag">v{d.version}</span>
                                  <StatusBadge tone={modeTone(runtimeStatus(d))}>{runtimeStatus(d)}</StatusBadge>
                                  <strong>{actions[d.action] ?? d.action}</strong>
                                  <span className="qmed-scope-tag">
                                    机构 {d.organizationId} / {d.departmentId ? `科室 ${d.departmentId}` : '全机构'}
                                  </span>
                                </div>
                                <div className="qmed-release-row__meta">
                                  <span>有效期限：{formatLocaleDateTime(d.effectiveFrom)} 至 {d.effectiveTo ? formatLocaleDateTime(d.effectiveTo) : '长期有效'}</span>
                                  {d.reason && <span>· 说明：{d.reason}</span>}
                                </div>
                              </div>
                              <div className="qmed-release-row__actions">
                                {d.status === 'ACTIVE' && runtimeStatus(d) !== '已结束' && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => { const candidate = rule.versions.find(v => v.id === d.versionId)?.knowledgeCandidate; if (candidate) { if (d.mode === 'ENFORCED') setPublicationCandidate(candidate); else setDeploymentCandidate(candidate); } else setAction({ operation: 'PAUSE', versionId: d.versionId, deployment: d }) }}
                                  >
                                    暂停
                                  </Button>
                                )}
                                {rule.origin !== 'KNOWLEDGE' && ['已结束', '已替换', '已暂停'].includes(runtimeStatus(d)) && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setAction({ operation: 'ROLLBACK', versionId: d.versionId, deployment: d, mode: d.mode })}
                                  >
                                    回滚至 v{d.version}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                )}

              </>
            ) : (
              <div className="qmed-empty-state">
                <Icon name="search" />
                <p>选择一条规则查看全部版本和发布记录。</p>
              </div>
            )}
          </div>
        </div>
      )}

      {action && rule && data && (
        <CatalogActionDialog
          action={action}
          entry={rule}
          catalog={data}
          onClose={() => setAction(undefined)}
          onSave={async body => {
            const updated = await api.medicationWorkbench.catalogCommand(rule.key, body)
            setAction(undefined)
            setNotice('规则目录已更新，操作及发布版本已留痕。')
            setData(old => old ? { ...old, rules: old.rules.map(r => r.key === updated.key ? updated : r) } : old)
          }}
        />
      )}

      {publicationCandidate && <MedicationKnowledgePublicationDialog key={publicationCandidate.id} api={api} candidate={publicationCandidate} onClose={() => { setPublicationCandidate(undefined); void reload() }} />}
      {deploymentCandidate && <MedicationKnowledgeDeploymentDialog key={deploymentCandidate.id} api={api} candidate={deploymentCandidate} onClose={() => { setDeploymentCandidate(undefined); void reload() }} />}
      {reviewCandidate && <MedicationKnowledgeReviewDialog key={reviewCandidate.id} api={api} candidate={reviewCandidate} onClose={() => { setReviewCandidate(undefined); void reload() }} />}
      {testCandidate && <MedicationKnowledgeTestDialog key={testCandidate.id} api={api} candidate={testCandidate} onClose={() => { setTestCandidate(undefined); void reload() }} />}
      {draft && (
        <RuleDraftDialog
          api={api}
          parent={draft.parent}
          onClose={() => setDraft(undefined)}
          onSaved={async value => {
            setDraft(undefined)
            setNotice(`已保存 v${value.version} 草稿，请运行回归套件后提交审核。`)
            await reload()
            setVersionId(value.id)
          }}
        />
      )}
    </section>
  )
}

function CatalogActionDialog({
  action,
  entry,
  catalog,
  onClose,
  onSave
}: {
  action: { operation: string; versionId: string; deployment?: RuleDeployment; mode?: string }
  entry: RuleCatalogEntry
  catalog: RuleCatalog
  onClose: () => void
  onSave: (body: RuleCatalogCommand) => Promise<void>
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(action.mode ?? 'SHADOW')
  const [scope, setScope] = useState(action.deployment?.departmentId ? 'DEPARTMENT' : 'ORGANIZATION')
  const [decision, setDecision] = useState('WARN')
  const release = ['DEPLOY', 'ROLLBACK'].includes(action.operation)
  const field = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

  return (
    <Dialog title={operations[action.operation] ?? action.operation} onClose={onClose}>
      <form
        className="qmed-governance__form"
        onSubmit={async e => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          setBusy(true)
          setError('')
          try {
            const body: RuleCatalogCommand = {
              expectedRevision: entry.revision,
              operation: action.operation,
              versionId: action.versionId,
              deploymentId: action.deployment?.id,
              reason: field(form, 'reason'),
              organizationId: action.deployment?.organizationId ?? catalog.organizationId ?? undefined,
              departmentId: scope === 'DEPARTMENT' ? (action.deployment?.departmentId ?? catalog.departmentId) : null
            }
            if (action.operation === 'APPROVE') {
              Object.assign(body, {
                action: decision,
                standardVerified: form.has('standardVerified'),
                evidenceVerified: form.has('evidenceVerified'),
                evidence: [{
                  sourceType: 'REVIEWED_CLINICAL_SOURCE',
                  sourceTitle: field(form, 'sourceTitle'),
                  sourceVersion: field(form, 'sourceVersion'),
                  sourceLocator: field(form, 'sourceLocator'),
                  section: field(form, 'section'),
                  excerpt: field(form, 'excerpt'),
                  usageScope: 'CLINICAL_EVIDENCE'
                }]
              })
            }
            if (release) {
              Object.assign(body, {
                mode,
                effectiveFrom: field(form, 'effectiveFrom') ? new Date(field(form, 'effectiveFrom')).toISOString() : null,
                effectiveTo: field(form, 'effectiveTo') ? new Date(field(form, 'effectiveTo')).toISOString() : null
              })
            }
            await onSave(body)
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        {action.operation === 'APPROVE' && (
          <>
            <Alert tone="info">请核对标准身份、回归结果和证据后作出审核结论；审核通过不会自动启用规则。</Alert>
            <FormField label="正式执行动作">
              <Select
                value={decision}
                onChange={setDecision}
                options={Object.entries(actions).map(([value, label]) => ({ value, label }))}
              />
            </FormField>
            <div className="qmed-governance__form-grid">
              <FormField label="证据标题" required>
                <input name="sourceTitle" required maxLength={300} placeholder="例如：国家基本药物临床应用指南" />
              </FormField>
              <FormField label="证据版本" required>
                <input name="sourceVersion" required maxLength={100} placeholder="2025年版" />
              </FormField>
            </div>
            <FormField label="来源定位" required>
              <input name="sourceLocator" required maxLength={2000} placeholder="说明书、指南或经审核制度的定位信息" />
            </FormField>
            <FormField label="章节">
              <input name="section" maxLength={300} placeholder="例如：第二章 抗菌药物临床合理应用" />
            </FormField>
            <FormField label="支持条款" required>
              <textarea name="excerpt" required maxLength={8000} rows={3} placeholder="引用具体的指南条款或说明书禁忌原文…" />
            </FormField>
            <div className="qmed-governance__check-row">
              <label>
                <input type="checkbox" name="standardVerified" required />
                <span>已核对适用药品及标准语义</span>
              </label>
              <label>
                <input type="checkbox" name="evidenceVerified" required />
                <span>已核对证据与执行动作，并审阅验证结果</span>
              </label>
            </div>
          </>
        )}
        {release && (
          <>
            <FormField label="运行模式">
              <Select
                value={mode}
                onChange={setMode}
                disabled={action.operation === 'ROLLBACK'}
                options={Object.entries(modes).map(([value, label]) => ({ value, label }))}
              />
            </FormField>
            <FormField label="发布范围">
              <Select
                value={scope}
                onChange={setScope}
                disabled={action.operation === 'ROLLBACK'}
                options={[
                  { value: 'ORGANIZATION', label: '当前机构全部科室' },
                  ...(catalog.departmentId ? [{ value: 'DEPARTMENT', label: '当前科室' }] : [])
                ]}
              />
            </FormField>
            <div className="qmed-governance__form-grid">
              <FormField label="生效时间（留空立即生效）">
                <input type="datetime-local" name="effectiveFrom" />
              </FormField>
              <FormField label="失效时间（留空长期有效）">
                <input type="datetime-local" name="effectiveTo" />
              </FormField>
            </div>
            <Alert tone="info">
              {mode === 'ENFORCED'
                ? '正式发布将参与处方提交校验。请先审阅当前版本在适用范围内的真实旁路观察结果。'
                : '启用后将自动评价适用范围内的真实处方，旁路结果不会阻止提交。'}
            </Alert>
          </>
        )}
        <FormField label="操作原因" required>
          <textarea name="reason" required maxLength={2000} rows={2} placeholder="填写本次目录管理操作的原因与背景说明…" />
        </FormField>
        <div className="qmed-governance__form-actions">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? '正在保存…' : (operations[action.operation] ?? action.operation)}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function RuleDraftDialog({
  api,
  parent,
  onClose,
  onSaved
}: {
  api: RhnApi
  parent?: MedicationCandidate
  onClose: () => void
  onSaved: (value: MedicationCandidate) => Promise<void>
}) {
  const [template, setTemplate] = useState(parent?.rule.template ?? 'EXACT_GENERIC_DUPLICATE')
  const [meds, setMeds] = useState<MedicationKnowledge[]>(parent?.medications ?? [])
  const [ids, setIds] = useState(parent?.medications.map(m => m.medication.id) ?? [])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 循证依据结构化状态
  const [sourceType, setSourceType] = useState('药品说明书')
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceLocator, setSourceLocator] = useState('')
  const [sourceContent, setSourceContent] = useState(parent?.source ?? '')

  // 安全分类快捷载入
  const [safetyCategories, setSafetyCategories] = useState<{ id: string; name: string; code: string; memberCount: number }[]>([])
  const [selectedCatId, setSelectedCatId] = useState('')
  const [catLoading, setCatLoading] = useState(false)

  useEffect(() => {
    api.medicationWorkbench.listSafetyCategories('', '')
      .then((cats) => setSafetyCategories(cats.map(c => ({ id: c.id, name: c.name, code: c.code, memberCount: c.memberCount }))))
      .catch(() => {})
  }, [api])

  async function handleLoadCategoryMembers(catId: string) {
    if (!catId) return
    setSelectedCatId(catId)
    setCatLoading(true)
    setError('')
    try {
      // The members endpoint returns a plain array (List<MemberView>), not a { members } wrapper.
      const members = await api.medicationWorkbench.listSafetyCategoryMembers(catId)
      const memberIds = members.map(m => String(m.medicationId)).slice(0, 10)
      // 查找或合并已有药品
      const matched = await api.medicationWorkbench.medications('')
      const validMeds = matched.filter(m => memberIds.includes(String(m.medication.id)) && m.standardReference?.status === 'LINKED')
      if (validMeds.length > 0) {
        setMeds(prev => {
          const map = new Map<string, MedicationKnowledge>()
          prev.forEach(item => map.set(item.medication.id, item))
          validMeds.forEach(item => map.set(item.medication.id, item))
          return Array.from(map.values())
        })
        setIds(validMeds.map(m => m.medication.id))
      }
    } catch (e) {
      setError(`从安全分类载入药品失败: ${errorMessage(e)}`)
    } finally {
      setCatLoading(false)
    }
  }

  async function search() {
    try {
      setMeds(await api.medicationWorkbench.medications(query))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Dialog title={parent ? '创建规则新版本' : '新建规则草稿 (受限候选)'} onClose={onClose}>
      <form
        className="qmed-governance__form"
        onSubmit={async e => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const f = new FormData(e.currentTarget)
          const text = (key: string) => String(f.get(key) ?? '').trim()

          // 组合标准化循证依据文本
          const compositeSource = sourceTitle.trim()
            ? `【${sourceType}】${sourceTitle.trim()}${sourceLocator.trim() ? ` · 定位/指纹: ${sourceLocator.trim()}` : ''}。依据说明: ${sourceContent.trim()}`
            : (sourceContent.trim() || text('source'))

          try {
            const value = await api.medicationWorkbench.createDraft({
              parentId: parent?.id,
              requirement: text('requirement'),
              source: compositeSource,
              medicationIds: ids,
              rule: {
                template,
                name: text('name'),
                explanation: text('requirement'),
                duplicateCount: Number(f.get('duplicateCount') ?? 2),
                message: text('message'),
                decision: 'WARN',
                minAge: template === 'AGE_CONTRAINDICATION' ? Number(f.get('minAge')) : undefined
              }
            })
            await onSaved(value)
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Alert tone="info">
          <strong>候选规则准入须知：</strong>此入口起草的内容作为“候选规则（Candidate）”保存，必须通过回归套件验证、药学专家审核并在指定科室完成旁路观察（SHADOW）后方可正式生效阻断。如需基于指南或说明书建立通用知识，推荐使用【AI 规则工坊】进行标准提取。
        </Alert>

        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="规则名称" required>
          <input name="name" required maxLength={120} defaultValue={parent?.rule.name} placeholder="例如：儿童及特定年龄禁用用药核对" />
        </FormField>
        <FormField label="规则模板">
          <Select
            value={template}
            onChange={setTemplate}
            options={[
              { value: 'EXACT_GENERIC_DUPLICATE', label: '同标准规格重复' },
              { value: 'CATEGORY_DUPLICATE', label: '所选标准规格组重复' },
              { value: 'ANTIMICROBIAL_MAX_DAYS', label: '抗菌药疗程核对' },
              { value: 'AGE_CONTRAINDICATION', label: '年龄阈值核对' }
            ]}
          />
        </FormField>
        <div className="qmed-governance__form-grid">
          <FormField label="重复条目阈值">
            <input type="number" min={2} max={10} required name="duplicateCount" defaultValue={parent?.rule.duplicateCount ?? 2} />
          </FormField>
          {template === 'AGE_CONTRAINDICATION' && (
            <FormField label="年龄下限" required>
              <input type="number" min={0} max={150} required name="minAge" defaultValue={parent?.rule.minAge ?? 18} />
            </FormField>
          )}
        </div>
        <FormField label="规则需求与适用说明" required>
          <textarea name="requirement" required maxLength={2000} rows={2} defaultValue={parent?.requirement} placeholder="详细说明规则临床意图、适用范围及拦截目的…" />
        </FormField>
        <FormField label="命中提示" required>
          <input name="message" required maxLength={500} defaultValue={parent?.rule.message} placeholder="医生开立处方命中规则时弹出的提示文案…" />
        </FormField>

        {/* 规范化起草依据字段 */}
        <fieldset className="qmed-governance__evidence-fieldset">
          <legend>循证依据溯源 (严格审计)</legend>
          <div className="qmed-governance__form-grid">
            <FormField label="依据来源类型">
              <Select
                value={sourceType}
                onChange={setSourceType}
                options={[
                  { value: '药品说明书', label: '国家法定药品说明书' },
                  { value: '临床指南/共识', label: '中华医学会等权威指南' },
                  { value: '国家法规规范', label: '《处方管理办法》等法规' },
                  { value: '院内药事会制度', label: '医院药事委员会红头批文' },
                  { value: 'medical-llm-wiki', label: 'medical-llm-wiki 权威词条' }
                ]}
              />
            </FormField>
            <FormField label="依据名称 / 版次 / 文号">
              <input
                value={sourceTitle}
                onChange={e => setSourceTitle(e.target.value)}
                maxLength={300}
                placeholder="例如: 《中国高血压防治指南(2024版)》或说明书版次"
              />
            </FormField>
          </div>
          <FormField label="原文定位 / 文件指纹 (SHA-256)">
            <input
              value={sourceLocator}
              onChange={e => setSourceLocator(e.target.value)}
              maxLength={256}
              placeholder="例如: 【禁忌】章节或 SHA-256 文件哈希"
            />
          </FormField>
          <FormField label="依据详细说明 / 原文节选">
            <textarea
              name="source"
              value={sourceContent}
              onChange={e => setSourceContent(e.target.value)}
              maxLength={8000}
              rows={2}
              placeholder="粘贴支持本规则的权威原文段落或院内制度具体条文…"
            />
          </FormField>
        </fieldset>

        <div className="qmed-governance__meds-box">
          {safetyCategories.length > 0 && (
            <div className="qmed-governance__cat-loader">
              <span className="qmed-governance__cat-loader-label">从安全分类快速载入:</span>
              <Select
                value={selectedCatId}
                onChange={val => void handleLoadCategoryMembers(val)}
                options={[
                  { value: '', label: '选择安全分类快速填入药品…' },
                  ...safetyCategories.map(c => ({ value: c.id, label: `${c.name}（${c.memberCount} 药）` }))
                ]}
              />
              {catLoading && <span className="qmed-governance__cat-loader-status">载入中…</span>}
            </div>
          )}
          <div className="qmed-governance__meds-filter ui-query-filters">
            <SearchField label="检索已关联标准药品" value={query} onChange={setQuery} onSearch={() => void search()} placeholder="检索已关联标准药品（回车或点击检索）" />
            <Button variant="secondary" onClick={() => void search()}>检索药品</Button>
            <span className="qmed-count-chip">已选 {ids.length} / 10 项药品</span>
          </div>
          <div className="qmed-governance__meds">
            {meds.map(m => (
              <label key={m.medication.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(m.medication.id)}
                  disabled={m.standardReference?.status !== 'LINKED'}
                  onChange={e => setIds(old => e.target.checked ? [...old, m.medication.id] : old.filter(id => id !== m.medication.id))}
                />
                <span>{m.medication.name} · {m.medication.preparationSpec} {m.standardReference?.status !== 'LINKED' ? '（待标准关联）' : ''}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="qmed-governance__form-actions">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" disabled={busy || !ids.length || ids.length > 10}>
            {busy ? '正在保存…' : '保存为候选草稿'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
