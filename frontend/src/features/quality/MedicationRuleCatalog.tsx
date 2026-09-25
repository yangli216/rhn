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
  RuleDeployment,
  RuleRuntimeRecord
} from '../../shared/api/medicationWorkbenchApi'
import { Alert, Button, Dialog, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'
import './medication-rule-catalog.css'
import { MedicationKnowledgePublicationDialog } from './MedicationKnowledgePublicationDialog'
import { MedicationKnowledgeDeploymentDialog } from './MedicationKnowledgeDeploymentDialog'
import { MedicationKnowledgeReviewDialog } from './MedicationKnowledgeReviewDialog'
import { MedicationKnowledgeTestDialog } from './MedicationKnowledgeTestDialog'
import { MedicationKnowledgeRuleView } from './MedicationKnowledgeRuleView'

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
      ? '内置旁路观察'
      : rule.deployments.length
        ? '暂无运行版本'
        : '尚未发布'
}

function getRuleStatusTone(rule: RuleCatalogEntry): 'neutral' | 'warning' | 'info' | 'success' | 'danger' {
  const s = summary(rule)
  if (s.includes('正式生效')) return 'success'
  if (s.includes('旁路观察')) return 'info'
  if (s.includes('待生效')) return 'warning'
  if (rule.versions.some(v => v.reviewStatus === 'IN_REVIEW')) return 'info'
  if (rule.versions.some(v => v.reviewStatus === 'DRAFT')) return 'warning'
  return 'neutral'
}

export function MedicationRuleCatalog({
  api,
  onOpenCandidate,
  onBuiltinTrial
}: {
  api: RhnApi
  onOpenCandidate: (candidate: MedicationCandidate) => void
  onBuiltinTrial: (code: string) => void
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
  const [runs, setRuns] = useState<RuleRuntimeRecord[]>([])
  const [action, setAction] = useState<{ operation: string; versionId: string; deployment?: RuleDeployment; mode?: string }>()
  const [draft, setDraft] = useState<{ parent?: MedicationCandidate }>()

  const rule = data?.rules.find(r => r.key === selected)
  const version = rule?.versions.find(v => v.id === versionId) ?? rule?.versions[0]

  const loadCatalog = async (): Promise<RuleCatalog> => {
    const service = api.medicationWorkbench as any
    if (typeof service.catalog === 'function') return service.catalog()
    const legacy = await service.activeRules()
    return {
      organizationId: null,
      departmentId: null,
      rules: legacy.map((r: any) => ({
        key: `BUILTIN:${r.ruleCode}`,
        code: r.ruleCode,
        name: r.ruleName,
        origin: 'BUILTIN',
        revision: 1,
        versions: [{
          id: r.ruleVersionId,
          version: r.version,
          name: r.ruleName,
          reviewStatus: 'APPROVED',
          testsPassed: true,
          origin: 'BUILTIN',
          candidate: null,
          builtin: {
            id: r.ruleVersionId,
            version: r.version,
            ruleSetVersion: r.ruleSetVersion,
            implementationKey: r.implementation,
            decision: r.decision,
            severity: r.severity,
            definition: { id: r.ruleId, code: r.ruleCode, category: r.category, title: r.ruleName },
            evidence: r.evidence
          },
          review: {
            versionId: r.ruleVersionId,
            status: 'APPROVED',
            action: r.decision,
            evidence: r.evidence,
            standardVerified: true,
            evidenceVerified: true,
            actorId: '',
            recordedAt: r.effectiveFrom,
            reason: ''
          }
        }],
        deployments: [],
        history: []
      }))
    }
  }

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

  useEffect(() => {
    setRuns([])
    if (!selected) return
    let alive = true
    const catalogRunsFn = (api.medicationWorkbench as any).catalogRuns
    ;(typeof catalogRunsFn === 'function' ? catalogRunsFn(selected) : Promise.resolve([] as RuleRuntimeRecord[]))
      .then((value: RuleRuntimeRecord[]) => {
        if (alive) setRuns(value)
      })
      .catch((e: unknown) => {
        if (alive) setError(errorMessage(e))
      })
    return () => { alive = false }
  }, [api, selected, data])

  const visible = (data?.rules ?? []).filter(r => {
    const matchText = `${r.code} ${r.name}`.toLowerCase().includes(query.toLowerCase())
    const matchState = filter === 'ALL'
      || r.versions.some(v => v.reviewStatus === filter)
      || r.deployments.some(d => runtimeStatus(d) === filter)
      || (filter === '旁路观察' && hasDefaultShadow(r))
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
      <div className="qmed-governance__filters">
        <SearchField
          label="搜索规则名称或编码"
          value={query}
          onChange={setQuery}
          placeholder="搜索规则名称或编码"
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
        <div className="qmed-governance__filters-count">
          <span>当前显示 <strong>{visible.length}</strong> / {data?.rules.length ?? 0} 条规则</span>
          {(query || filter !== 'ALL' || origin !== 'ALL') && (
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                setQuery('')
                setFilter('ALL')
                setOrigin('ALL')
              }}
            >
              重置筛选
            </Button>
          )}
        </div>
        <div className="qmed-governance__filter-actions">
          <Button variant="secondary" onClick={() => void reload()}>
            <Icon name="refresh" />
            <span>刷新目录</span>
          </Button>
          <Button variant="primary" onClick={() => setDraft({})}>
            <Icon name="add" />
            <span>新建规则草稿</span>
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
              <span>规则名称与在行状态</span>
              <span>版本 / 审核</span>
            </div>
            <div className="qmed-governance__list">
              {visible.map(r => {
                const ruleSummary = summary(r)
                const statusTone = getRuleStatusTone(r)
                const isSelected = r.key === selected
                const latestVersion = r.versions[0]
                const latestReview = latestVersion ? reviews[latestVersion.reviewStatus] ?? '待核对' : '暂无'

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
                    <div className="qmed-governance__rule-code-row">
                      <code className="qmed-code-pill" title={r.code}>{r.code}</code>
                      <span className={`qmed-chip ${r.origin === 'BUILTIN' ? 'qmed-chip--brand' : r.origin === 'AI' ? 'qmed-chip--ai' : ''}`}>
                        {originName[r.origin] ?? r.origin}
                      </span>
                    </div>
                    <div className="qmed-governance__rule-foot">
                      <span>{r.versions.length} 个版本 · 最新 {latestReview}</span>
                      {isSelected && <Icon name="chevron-right" />}
                    </div>
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
                {/* 详情顶部核心看板 */}
                <div className="qmed-detail-hero">
                  <div className="qmed-detail-hero__top">
                    <div className="qmed-detail-hero__identity">
                      <div className="qmed-detail-hero__tags">
                        <code className="qmed-code-pill">{rule.code}</code>
                        <span className={`qmed-chip ${rule.origin === 'BUILTIN' ? 'qmed-chip--brand' : rule.origin === 'AI' ? 'qmed-chip--ai' : ''}`}>
                          {originName[rule.origin] ?? rule.origin}
                        </span>
                        <span className="qmed-chip">修订 #{rule.revision}</span>
                      </div>
                      <h3>{rule.name}</h3>
                    </div>
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
                  </div>

                  <div className="qmed-detail-hero__badges">
                    <StatusBadge tone={reviewTone(version.reviewStatus)}>
                      {reviews[version.reviewStatus] ?? version.reviewStatus}
                    </StatusBadge>
                    <StatusBadge tone={version.testsPassed ? 'success' : 'warning'}>
                      {version.testsPassed
                        ? (version.knowledgeCandidate ? '结构样例通过 · 人工验证另查' : version.builtin ? '内置执行器回归基线' : '回归测试通过')
                        : '尚未通过回归测试'}
                    </StatusBadge>
                    {version.knowledgeCandidate && <StatusBadge tone={version.manualValidation?.status === 'FAILED' ? 'danger' : 'info'}>
                      人工样例：{version.manualValidation?.status === 'PASSED' ? `v${version.manualValidation.suiteVersion} 全部通过` : version.manualValidation?.status === 'FAILED' ? `v${version.manualValidation.suiteVersion} 有失败项` : version.manualValidation?.status === 'NOT_RUN' ? `v${version.manualValidation.suiteVersion} 待运行` : '尚未编写'}
                    </StatusBadge>}
                    <span className="qmed-action-chip">
                      审核动作：{version.review?.action ? actions[version.review.action] ?? version.review.action : '待审核确定'}
                    </span>
                  </div>

                  <div className="qmed-detail-hero__actions">
                    <div className="qmed-detail-hero__action-group">
                      {version.knowledgeCandidate && <><Button variant="secondary" onClick={() => setTestCandidate(version.knowledgeCandidate!)}>人工验证样例</Button><Button variant="secondary" onClick={() => setReviewCandidate(version.knowledgeCandidate!)}>审核与提交</Button><Button variant="secondary" onClick={() => setDeploymentCandidate(version.knowledgeCandidate!)}>旁路部署与观察</Button><Button variant="primary" onClick={() => setPublicationCandidate(version.knowledgeCandidate!)}>正式启用与回退</Button></>}
                      {version.candidate && (
                        <>
                          <Button variant="secondary" disabled={busy} onClick={() => void runSuite(version)}>
                            <Icon name="flask" />
                            <span>运行回归套件</span>
                          </Button>
                          <Button variant="secondary" onClick={() => onOpenCandidate(version.candidate!)}>
                            <Icon name="clinical" />
                            <span>模拟与处方回放</span>
                          </Button>
                          <Button variant="secondary" onClick={() => setDraft({ parent: version.candidate! })}>
                            <Icon name="add" />
                            <span>创建新版本</span>
                          </Button>
                        </>
                      )}
                      {version.builtin && (
                        <Button variant="secondary" onClick={() => onBuiltinTrial(rule.code)}>
                          <Icon name="flask" />
                          <span>验证当前规则</span>
                        </Button>
                      )}
                      {!version.knowledgeCandidate && ['DRAFT', 'REJECTED'].includes(version.reviewStatus) && (
                        <Button
                          variant="primary"
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
                            onClick={() => setAction({ operation: 'APPROVE', versionId: version.id })}
                          >
                            <Icon name="check" />
                            <span>审核通过</span>
                          </Button>
                          <Button
                            variant="secondary"
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
                            onClick={() => setAction({ operation: 'DEPLOY', versionId: version.id, mode: 'SHADOW' })}
                          >
                            <Icon name="eye" />
                            <span>启用旁路观察</span>
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() => setAction({ operation: 'DEPLOY', versionId: version.id, mode: 'ENFORCED' })}
                          >
                            <Icon name="check" />
                            <span>正式发布</span>
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="qmed-detail-hero__action-group">
                      {version.reviewStatus !== 'RETIRED' && (
                        <Button
                          variant="danger"
                          onClick={() => setAction({ operation: 'RETIRE', versionId: version.id })}
                        >
                          <span>废止此版本</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="qmed-runtime-note">
                    <Icon name="info" />
                    <span>
                      当前在行规则由版本化强类型执行器运行，正式版本会在发布范围内参与处方提交校验；旁路版本只记录评价，不改变提交结果。
                    </span>
                  </div>
                </div>

                {/* 宽屏卡片栅格 1：规则版本内容 vs 临床审核证据 */}
                <div className="qmed-grid-2col">
                  {/* 卡片 1：版本内容与执行逻辑 */}
                  <section className={`qmed-card${version.knowledgeCandidate ? ' qmed-card--knowledge' : ''}`}>
                    <div className="qmed-card__header">
                      <div className="qmed-card__header-title">
                        <Icon name="clinical" />
                        <h4>版本内容</h4>
                      </div>
                      <span className="qmed-ver-tag">v{version.version}</span>
                    </div>
                    <div className="qmed-card__body">
                      <p className="qmed-card__lead">
                        {version.candidate?.rule.explanation ?? version.builtin?.definition.category}
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
                      {version.builtin && (
                        <div className="qmed-builtin-spec">
                          <p>内置规则的计算逻辑由版本化执行器维护，发布范围和审核策略在此管理。</p>
                          <div className="qmed-kv-list">
                            <div>
                              <span className="qmed-field-label">执行器实现：</span>
                              <code>{version.builtin.implementationKey || '内置引擎'}</code>
                            </div>
                            <div>
                              <span className="qmed-field-label">规则集基准：</span>
                              <code>标准基线 · {version.builtin.ruleSetVersion || 'qmed-standard-shadow-v2'}</code>
                            </div>
                            <div>
                              <span className="qmed-field-label">默认动作：</span>
                              <span>{actions[version.builtin.decision] ?? version.builtin.decision}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* 卡片 2：审核依据与循证医学支持 */}
                  <section className="qmed-card">
                    <div className="qmed-card__header">
                      <div className="qmed-card__header-title">
                        <Icon name="award" />
                        <h4>审核依据</h4>
                      </div>
                      {version.review?.status === 'APPROVED' && (
                        <StatusBadge tone="success">已审核通过</StatusBadge>
                      )}
                    </div>
                    <div className="qmed-card__body">
                      {version.review?.evidence?.length ? (
                        version.review.evidence.map((e, i) => (
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
                        ))
                      ) : (
                        <div className="qmed-empty-evidence">
                          <Icon name="info" />
                          <p>尚无已审核证据。AI 起草内容和工程基线不会自动成为正式发布依据。</p>
                          <small>正式上线前须由药事专家录入经审定的说明书、指南或规范条款。</small>
                        </div>
                      )}
                      {version.review && (version.review.actorId || version.review.recordedAt) && (
                        <div className="qmed-review-stamp">
                          <Icon name="check" />
                          <div>
                            <strong>审核责任人：{version.review.actorId || '系统管理员'}</strong>
                            <small> · {new Date(version.review.recordedAt).toLocaleString()}</small>
                            {version.review.reason && (
                              <p className="qmed-review-reason">审核理由：{version.review.reason}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* 卡片 3：发布与运行范围管控 */}
                <section className="qmed-card">
                  <div className="qmed-card__header">
                    <div className="qmed-card__header-title">
                      <Icon name="hospital" />
                      <h4>发布与运行范围</h4>
                    </div>
                    <small>管控本机构及科室范围生效策略</small>
                  </div>
                  <div className="qmed-card__body">
                    {hasDefaultShadow(rule) && (
                      <div className="qmed-release-row is-builtin">
                        <div className="qmed-release-row__info">
                          <div className="qmed-release-row__title">
                            <StatusBadge tone="info">内置默认旁路</StatusBadge>
                            <strong>内置默认旁路 · 全部适用机构</strong>
                          </div>
                          <small>默认旁路静默记录评价结果，不干预处方开立。可按需暂停本机构默认旁路。</small>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setAction({
                            operation: 'PAUSE',
                            versionId: rule.versions.find(v => v.builtin?.ruleSetVersion === 'qmed-standard-shadow-v2')!.id
                          })}
                        >
                          暂停本机构默认旁路
                        </Button>
                      </div>
                    )}
                    {!rule.deployments.length && !hasDefaultShadow(rule) && (
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
                                <span>有效期限：{new Date(d.effectiveFrom).toLocaleString()} 至 {d.effectiveTo ? new Date(d.effectiveTo).toLocaleString() : '长期有效'}</span>
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

                {/* 底部双列卡片：真实处方观察流水 vs 操作审计日志 */}
                <div className="qmed-grid-2col">
                  {/* 卡片 4：真实处方观察 */}
                  <section className="qmed-card">
                    <div className="qmed-card__header">
                      <div className="qmed-card__header-title">
                        <Icon name="pill" />
                        <h4>真实处方观察 · 最近 {runs.length} 次</h4>
                      </div>
                      {runs.length > 0 && <span className="qmed-count-chip">{runs.length} 条流水</span>}
                    </div>
                    <div className="qmed-card__body">
                      {!runs.length ? (
                        <div className="qmed-empty-state">
                          <Icon name="eye" />
                          <p>尚无自动运行记录。启用旁路后，适用范围内的处方评价会自动产生记录。</p>
                        </div>
                      ) : (
                        <div className="qmed-runs-stream">
                          {runs.slice(0, 12).map(r => (
                            <div key={r.id} className="qmed-stream-item">
                              <div className="qmed-stream-item__left">
                                <StatusBadge tone={modeTone(modes[r.mode] ?? r.mode)}>
                                  {modes[r.mode] ?? r.mode}
                                </StatusBadge>
                                <span className="qmed-stream-decision">
                                  {r.decision === 'NOT_APPLICABLE' ? '不在适用范围' : (actions[r.decision] ?? r.decision)}
                                </span>
                              </div>
                              <div className="qmed-stream-item__right">
                                <code>处方 {r.prescriptionId}</code>
                                <small>{new Date(r.time).toLocaleString()}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* 卡片 5：操作记录 */}
                  <section className="qmed-card">
                    <div className="qmed-card__header">
                      <div className="qmed-card__header-title">
                        <Icon name="tasks" />
                        <h4>操作记录</h4>
                      </div>
                      {rule.history.length > 0 && <span className="qmed-count-chip">{rule.history.length} 次操作</span>}
                    </div>
                    <div className="qmed-card__body">
                      {!rule.history.length ? (
                        <div className="qmed-empty-state">
                          <Icon name="info" />
                          <p>尚无目录管理操作。</p>
                        </div>
                      ) : (
                        <div className="qmed-history-timeline">
                          {[...rule.history].reverse().slice(0, 20).map(h => (
                            <div key={h.id} className="qmed-history-item">
                              <div className="qmed-history-item__dot" />
                              <div className="qmed-history-item__content">
                                <div className="qmed-history-item__head">
                                  <strong>{operations[h.operation] ?? h.operation}</strong>
                                  <span className="qmed-ver-chip">
                                    版本 {rule.versions.find(v => v.id === h.versionId)?.version ?? h.versionId}
                                  </span>
                                  <span className="qmed-chip">操作人 {h.actorId}</span>
                                  <small>{new Date(h.time).toLocaleString()}</small>
                                </div>
                                {h.reason && <p className="qmed-history-reason">{h.reason}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
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
            if (typeof (api.medicationWorkbench as any).catalogCommand !== 'function') {
              setNotice('规则目录兼容视图仅支持查看，请使用最新接口。')
              return
            }
            const updated = await (api.medicationWorkbench as any).catalogCommand(rule.key, body)
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

  async function search() {
    try {
      setMeds(await api.medicationWorkbench.medications(query))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Dialog title={parent ? '创建规则新版本' : '新建规则草稿'} onClose={onClose}>
      <form
        className="qmed-governance__form"
        onSubmit={async e => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const f = new FormData(e.currentTarget)
          const text = (key: string) => String(f.get(key) ?? '').trim()
          try {
            const value = await api.medicationWorkbench.createDraft({
              parentId: parent?.id,
              requirement: text('requirement'),
              source: text('source'),
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
        <FormField label="起草依据">
          <textarea name="source" maxLength={8000} rows={2} defaultValue={parent?.source} placeholder="指南、说明书或制度依据说明…" />
        </FormField>
        <div className="qmed-governance__meds-box">
          <div className="qmed-governance__meds-filter">
            <SearchField label="检索已关联标准药品" value={query} onChange={setQuery} onSearch={() => void search()} placeholder="检索已关联标准药品（回车或点击检索）" />
            <Button variant="secondary" size="sm" onClick={() => void search()}>检索药品</Button>
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
            保存草稿
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
