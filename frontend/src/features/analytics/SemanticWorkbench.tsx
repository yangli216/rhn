import { useState, useEffect } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type {
  OntologyGraphDto,
  CopilotSuggestResponse,
  SemanticExecutionResult,
} from '../../shared/api/semanticOntologyApi'
import { Alert, Button, Icon, LoadingState } from '../../shared/ui'
import './semantic-workbench.css'

export function SemanticWorkbench({ api, onBack }: { api: RhnApi; onBack?: () => void }) {
  const [graph, setGraph] = useState<OntologyGraphDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedEntityCode, setSelectedEntityCode] = useState<string>('DEPARTMENT')
  const [viewTab, setViewTab] = useState<'graph' | 'dictionary' | 'probe'>('graph')
  const [filterText, setFilterText] = useState('')

  // Copilot 人机共建状态
  const [copilotPrompt, setCopilotPrompt] = useState('')
  const [copilotResult, setCopilotResult] = useState<CopilotSuggestResponse | null>(null)
  const [copilotBusy, setCopilotBusy] = useState(false)
  const [copilotConfirmed, setCopilotConfirmed] = useState(false)

  // Live Semantic Probe 即时语义探针状态
  const [probeText, setProbeText] = useState('本月各科室药品费用，只显示诊疗科室')
  const [probeResult, setProbeResult] = useState<SemanticExecutionResult | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [probeError, setProbeError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.analytics
      .ontologyGraph()
      .then((data) => {
        if (active) {
          setGraph(data)
          if (data.nodes.length > 0) {
            setSelectedEntityCode('DEPARTMENT')
          }
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api])

  const selectedNode = graph?.nodes.find((n) => n.id === selectedEntityCode)
  const selectedDimensions = graph?.dimensions.filter(
    (d) =>
      (d.entity && d.entity.toUpperCase() === selectedEntityCode.toUpperCase()) ||
      (d.grain && d.grain.toUpperCase() === selectedEntityCode.toUpperCase()) ||
      (d.code && d.code.toLowerCase().includes(selectedEntityCode.toLowerCase()))
  ) ?? []
  const selectedMetrics = graph?.metrics.filter(
    (m) =>
      (m.source && m.source.toUpperCase() === selectedEntityCode.toUpperCase()) ||
      (m.grain && m.grain.toUpperCase() === selectedEntityCode.toUpperCase()) ||
      (m.code && m.code.toLowerCase().includes(selectedEntityCode.toLowerCase()))
  ) ?? []

  // Copilot 建议触发
  async function handleCopilotSuggest() {
    if (!copilotPrompt.trim() || copilotBusy) return
    setCopilotBusy(true)
    setCopilotConfirmed(false)
    try {
      const res = await api.analytics.copilotSuggest({
        prompt: copilotPrompt.trim(),
        targetEntity: selectedEntityCode,
      })
      setCopilotResult(res)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setCopilotBusy(false)
    }
  }

  // Live Probe 执行触发
  async function handleRunProbe(customText?: string) {
    const textToRun = customText ?? probeText
    if (!textToRun.trim() || probeBusy) return
    setProbeBusy(true)
    setProbeError('')
    try {
      const res = await api.analytics.executeV2({ text: textToRun.trim() })
      setProbeResult(res)
    } catch (e) {
      setProbeError(errorMessage(e))
    } finally {
      setProbeBusy(false)
    }
  }

  if (loading) {
    return <LoadingState label="正在装载业务实体拓扑与关系网元数据…" />
  }
  if (error && !graph) {
    return <Alert tone="error">加载数据关系网失败：{error}</Alert>
  }

  const filteredNodes = graph?.nodes.filter(
    (n) =>
      n.label.includes(filterText.trim()) ||
      n.entityCode.toLowerCase().includes(filterText.trim().toLowerCase()) ||
      n.table.toLowerCase().includes(filterText.trim().toLowerCase())
  ) ?? []

  const factNodes = filteredNodes.filter((n) => n.nodeType === 'FACT')
  const dimNodes = filteredNodes.filter((n) => n.nodeType === 'DIMENSION')

  return (
    <div className="sw-root">
      {/* 顶部状态与工具栏 */}
      <header className="sw-header">
        <div className="sw-header-title">
          {onBack && (
            <Button variant="secondary" size="sm" onClick={onBack} aria-label="返回统计功能库">
              ← 返回统计库
            </Button>
          )}
          <h2>
            <Icon name="roadmap" /> 业务实体数据关系网 · 语义工作台
          </h2>
          <span className="sw-badge-asset">
            {graph?.statistics.assetPath ?? 'outpatient-ontology.v1.yaml'} · 随程序包发布
          </span>
        </div>

        <div className="sw-header-stats">
          <span className="sw-stat-pill">
            实体：<strong>{graph?.statistics.entityCount}</strong>
          </span>
          <span className="sw-stat-pill">
            拓扑关联：<strong>{graph?.statistics.relationshipCount}</strong>
          </span>
          <span className="sw-stat-pill">
            分析维度：<strong>{graph?.statistics.dimensionCount}</strong>
          </span>
          <span className="sw-stat-pill">
            受控指标：<strong>{graph?.statistics.metricCount}</strong>
          </span>
          <span className="sw-stat-pill is-warning">
            风控拦截：<strong>{graph?.statistics.fanoutRiskCount} 处</strong>
          </span>
        </div>

        <div className="sw-header-tabs" role="tablist" aria-label="工作台视图">
          <button
            type="button"
            className={`sw-tab-btn ${viewTab === 'graph' ? 'is-active' : ''}`}
            onClick={() => setViewTab('graph')}
          >
            关系拓扑网 (Graph)
          </button>
          <button
            type="button"
            className={`sw-tab-btn ${viewTab === 'dictionary' ? 'is-active' : ''}`}
            onClick={() => setViewTab('dictionary')}
          >
            维度属性与规则字典
          </button>
          <button
            type="button"
            className={`sw-tab-btn ${viewTab === 'probe' ? 'is-active' : ''}`}
            onClick={() => {
              setViewTab('probe')
              if (!probeResult) void handleRunProbe()
            }}
          >
            即时语义探针 (Live Probe)
          </button>
        </div>
      </header>

      {/* PC 宽屏三栏主体协同布局 */}
      <div className="sw-body">
        {/* 左侧栏：实体目录树与筛选 */}
        <aside className="sw-pane-left">
          <div className="sw-search-box">
            <input
              type="search"
              aria-label="搜索实体或表名"
              placeholder="搜索实体、表名、代码..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>

          <div className="sw-entity-list">
            <div className="sw-group-label">业务事实实体 (Facts)</div>
            {factNodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={`sw-node-item ${selectedEntityCode === node.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedEntityCode(node.id)}
              >
                <div className="sw-node-item-head">
                  <span className="sw-node-item-name">{node.label}</span>
                  <span className="sw-node-tag tag-fact">{node.entityCode}</span>
                </div>
                <span className="sw-node-item-meta">{node.table}</span>
                <div className="sw-node-item-counts">
                  <span>度量: {node.metricCount}</span>
                  <span>粒度: {node.grain}</span>
                </div>
              </button>
            ))}

            <div className="sw-group-label">主数据维度实体 (Dimensions)</div>
            {dimNodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={`sw-node-item ${selectedEntityCode === node.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedEntityCode(node.id)}
              >
                <div className="sw-node-item-head">
                  <span className="sw-node-item-name">{node.label}</span>
                  <span className="sw-node-tag tag-dim">{node.entityCode}</span>
                </div>
                <span className="sw-node-item-meta">{node.table}</span>
                <div className="sw-node-item-counts">
                  <span>属性: {node.attributes?.length ? node.attributes.join(', ') : '主键'}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* 中间主作业区：拓扑画布 / 字典表格 / 语义探针 */}
        <main className="sw-pane-center">
          {viewTab === 'graph' && (
            <div className="sw-canvas-wrap">
              <div className="sw-fanout-banner">
                <Icon name="tasks" />
                <span>
                  <strong>确定性风控机制生效中：</strong>
                  拓扑路径由 QueryPlanner 自动寻路并受 QueryPlanValidator 审查，严格拦截未经预聚合的 1:N 笛卡尔积扇出路径。
                </span>
              </div>

              {/* 实体拓扑层级网络 */}
              <div className="sw-topology-grid">
                {/* 顶层：主数据维度实体 */}
                <div className="sw-topology-tier">
                  {dimNodes.map((node) => (
                    <div
                      key={node.id}
                      className={`sw-card-node ${selectedEntityCode === node.id ? 'is-active' : ''}`}
                      onClick={() => setSelectedEntityCode(node.id)}
                    >
                      <div className="sw-card-node-head">
                        <span className="sw-card-node-title">{node.label}</span>
                        <span className="sw-node-tag tag-dim">{node.id}</span>
                      </div>
                      <div className="sw-card-table">{node.table}</div>
                      <div className="sw-card-details">
                        <span>主键: {node.primaryKey}</span>
                        <span>属性: {node.attributes?.length ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 中层：诊疗与医嘱实体 */}
                <div className="sw-topology-tier">
                  {factNodes
                    .filter((n) => n.id === 'ENCOUNTER' || n.id === 'DIAGNOSIS' || n.id === 'ORDER')
                    .map((node) => (
                      <div
                        key={node.id}
                        className={`sw-card-node ${selectedEntityCode === node.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedEntityCode(node.id)}
                      >
                        <div className="sw-card-node-head">
                          <span className="sw-card-node-title">{node.label}</span>
                          <span className="sw-node-tag tag-fact">{node.id}</span>
                        </div>
                        <div className="sw-card-table">{node.table}</div>
                        <div className="sw-card-details">
                          <span>指标: {node.metricCount}</span>
                          <span>粒度: {node.grain}</span>
                        </div>
                      </div>
                    ))}
                </div>

                {/* 底层：收费明细事实 */}
                <div className="sw-topology-tier">
                  {factNodes
                    .filter((n) => n.id === 'CHARGE')
                    .map((node) => (
                      <div
                        key={node.id}
                        className={`sw-card-node ${selectedEntityCode === node.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedEntityCode(node.id)}
                        style={{ width: '280px' }}
                      >
                        <div className="sw-card-node-head">
                          <span className="sw-card-node-title">{node.label}</span>
                          <span className="sw-node-tag tag-fact">核心计费明细</span>
                        </div>
                        <div className="sw-card-table">{node.table}</div>
                        <div className="sw-card-details">
                          <span>度量指标: {node.metricCount} 个</span>
                          <span>支持科室、医嘱多路安全关联</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {viewTab === 'dictionary' && (
            <div style={{ padding: '20px', overflowY: 'auto', height: '100%' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '15px' }}>维度属性与自然语言词典全景一览</h3>
              <div className="da-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>所属实体</th>
                      <th>维度代码</th>
                      <th>维度名称</th>
                      <th>属性代码</th>
                      <th>物理列</th>
                      <th>标准枚举值与映射词库 (Value Aliases)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {graph?.dimensions.flatMap((dim) =>
                      (dim.attributes && dim.attributes.length > 0 ? dim.attributes : [null]).map((attr, idx) => (
                        <tr key={`${dim.code}-${idx}`}>
                          <td>{dim.entity}</td>
                          <td><code>{dim.code}</code></td>
                          <td><strong>{dim.name}</strong></td>
                          <td>{attr ? <code>{attr.code}</code> : '—'}</td>
                          <td>{attr ? <code>{attr.physicalColumn}</code> : <code>{dim.field}</code>}</td>
                          <td>
                            {attr?.valueAliases ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {Object.entries(attr.valueAliases).map(([k, aliases]) => (
                                  <div key={k} style={{ fontSize: '12px' }}>
                                    <strong style={{ color: '#0f766e' }}>{k}</strong>: {aliases.join('、')}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>基础维度值</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewTab === 'probe' && (
            <div className="sw-probe-panel">
              <div className="sw-probe-input-bar">
                <input
                  type="text"
                  aria-label="语义测试语句"
                  value={probeText}
                  onChange={(e) => setProbeText(e.target.value)}
                  placeholder="输入任意统计提问，如：本月各科室药品费用，只显示诊疗科室"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRunProbe()
                  }}
                />
                <Button busy={probeBusy} onClick={() => void handleRunProbe()}>
                  执行语义探针
                </Button>
              </div>

              <div className="sw-probe-presets">
                <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center' }}>快速体验场景：</span>
                <button
                  type="button"
                  className="sw-preset-chip"
                  onClick={() => {
                    setProbeText('本月各科室药品费用，只显示诊疗科室')
                    void handleRunProbe('本月各科室药品费用，只显示诊疗科室')
                  }}
                >
                  本月各科室药品费用，只显示诊疗科室
                </button>
                <button
                  type="button"
                  className="sw-preset-chip"
                  onClick={() => {
                    setProbeText('本月挂号人次按就诊科室')
                    void handleRunProbe('本月挂号人次按就诊科室')
                  }}
                >
                  本月挂号人次按就诊科室
                </button>
                <button
                  type="button"
                  className="sw-preset-chip"
                  onClick={() => {
                    setProbeText('本月门诊收入')
                    void handleRunProbe('本月门诊收入')
                  }}
                >
                  本月门诊收入 (触发歧义澄清)
                </button>
                <button
                  type="button"
                  className="sw-preset-chip"
                  onClick={() => {
                    setProbeText('高血压患者用了哪些药')
                    void handleRunProbe('高血压患者用了哪些药')
                  }}
                >
                  高血压患者用了哪些药 (触发风控拦截)
                </button>
              </div>

              {probeError && <Alert tone="error">{probeError}</Alert>}

              {probeResult && (
                <div className="sw-probe-result">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className="sw-node-tag"
                        style={{
                          background:
                            probeResult.status === 'READY'
                              ? '#dcfce7'
                              : probeResult.status === 'CLARIFY'
                              ? '#fef3c7'
                              : '#fee2e2',
                          color:
                            probeResult.status === 'READY'
                              ? '#15803d'
                              : probeResult.status === 'CLARIFY'
                              ? '#b45309'
                              : '#b91c1c',
                          fontWeight: 600,
                          fontSize: '11px',
                        }}
                      >
                        {probeResult.status}
                      </span>
                      <strong style={{ fontSize: '13px' }}>{probeResult.explanation}</strong>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      耗时: {probeResult.executionTimeMs} ms
                    </span>
                  </div>

                  {probeResult.status === 'CLARIFY' && probeResult.clarification && (
                    <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '6px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#92400e' }}>
                        {probeResult.clarification.message}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {probeResult.clarification.options.map((opt) => (
                          <span
                            key={opt.code}
                            className="sw-alias-pill"
                            style={{ background: '#fff', borderColor: '#fde68a' }}
                          >
                            <strong>{opt.name}</strong>：{opt.description}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {probeResult.compiledSql && (
                    <details open>
                      <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                        生成的参数化 SQL (带防注入命名绑定)
                      </summary>
                      <pre className="sw-probe-sql">{probeResult.compiledSql}</pre>
                    </details>
                  )}

                  {probeResult.rows.length > 0 && (
                    <div className="da-table-wrap" style={{ margin: '8px 0' }}>
                      <table>
                        <thead>
                          <tr>
                            {probeResult.columns.map((c) => (
                              <th key={c.alias}>{c.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {probeResult.rows.map((row, idx) => (
                            <tr key={idx}>
                              {probeResult.columns.map((c) => (
                                <td key={c.alias}>{String(row[c.alias] ?? '')}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* 右侧栏：规则详情与人机共建 Copilot */}
        <aside className="sw-pane-right">
          <div className="sw-inspector-header">
            <h3>实体与规则详情</h3>
            <span className="sw-node-tag tag-fact">{selectedEntityCode}</span>
          </div>

          <div className="sw-inspector-scroll">
            {selectedNode && (
              <div className="sw-meta-card">
                <div className="sw-meta-row">
                  <span>物理映射表:</span>
                  <strong>{selectedNode.table}</strong>
                </div>
                <div className="sw-meta-row">
                  <span>主键粒度:</span>
                  <strong>{selectedNode.primaryKey} ({selectedNode.grain})</strong>
                </div>
                <div className="sw-meta-row">
                  <span>实体说明:</span>
                  <span>{selectedNode.description}</span>
                </div>
              </div>
            )}

            {/* 维度属性与字典网络展示 */}
            <div>
              <h4 className="sw-section-subtitle">
                <Icon name="tasks" /> 关联维度属性与字典网络
              </h4>
              {selectedDimensions.length === 0 && (
                <p style={{ fontSize: '12px', color: '#64748b' }}>该实体暂无额外附属维度属性定义。</p>
              )}
              {selectedDimensions.map((dim) => (
                <div key={dim.code} className="sw-attribute-card" style={{ marginBottom: '10px' }}>
                  <div className="sw-attr-head">
                    <span className="sw-attr-name">{dim.name} ({dim.code})</span>
                    <span className="sw-attr-col">{dim.field}</span>
                  </div>
                  {dim.attributes?.map((attr) => (
                    <div key={attr.code} className="sw-val-map">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{attr.name} (<code>{attr.code}</code>)</strong>
                        <span className="sw-attr-col">物理列: {attr.physicalColumn}</span>
                      </div>
                      {attr.valueAliases &&
                        Object.entries(attr.valueAliases).map(([val, aliases]) => (
                          <div key={val} className="sw-val-item">
                            <span className="sw-val-key">{val}</span>
                            <div className="sw-val-aliases">
                              {aliases.map((a) => (
                                <span key={a} className="sw-alias-pill">
                                  {a}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* 关联指标默认业务规则 */}
            <div>
              <h4 className="sw-section-subtitle">
                <Icon name="roadmap" /> 包含指标及默认业务规则 (Default Filters)
              </h4>
              {selectedMetrics.length === 0 && (
                <p style={{ fontSize: '12px', color: '#64748b' }}>该实体非主要统计度量源。</p>
              )}
              {selectedMetrics.map((metric) => (
                <div key={metric.code} className="sw-metric-filter-item" style={{ marginBottom: '8px' }}>
                  <strong>{metric.name} ({metric.code})</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                    {metric.description}
                  </span>
                  {metric.defaultFilters.length > 0 ? (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {metric.defaultFilters.map((df, i) => (
                        <span key={i} className="sw-alias-pill" style={{ background: '#e0f2fe' }}>
                          {df.field} {df.op} {df.values.join(',')}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>无默认过滤</span>
                  )}
                </div>
              ))}
            </div>

            {/* 人机共建规则助手 (Catalog Copilot) */}
            <div className="sw-copilot-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                  🤖 人机共建规则标注助手 (Catalog Copilot)
                </strong>
                <span className="sw-node-tag tag-dim">AI 辅助推断</span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                输入临床科室或业务人员的自然语言反馈，AI 将逆向推断属性字典并在下方生成候选模型增量。
              </p>
              <textarea
                value={copilotPrompt}
                onChange={(e) => setCopilotPrompt(e.target.value)}
                placeholder="例如：建议将检验科、放射科、超声科也纳入医技科室识别..."
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button
                  size="sm"
                  busy={copilotBusy}
                  disabled={!copilotPrompt.trim() || copilotBusy}
                  onClick={() => void handleCopilotSuggest()}
                >
                  AI 逆向推断规则
                </Button>
                {copilotConfirmed && (
                  <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                    ✓ 专家已确认标记
                  </span>
                )}
              </div>

              {copilotResult && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#334155' }}>
                    <strong>推断理由：</strong>
                    {copilotResult.rationale}
                  </div>
                  {copilotResult.suggestedYamlDiff && (
                    <pre className="sw-diff-box">{copilotResult.suggestedYamlDiff}</pre>
                  )}
                  {!copilotConfirmed && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCopilotConfirmed(true)}
                    >
                      确认采纳此项规则 (加入待发布资产队列)
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
