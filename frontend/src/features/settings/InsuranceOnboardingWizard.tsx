import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { InsuranceCoverageQuery } from '../../shared/api/masterDataApi'
import { coverageRateLabel, coverageStatusTones, readinessStatusTones } from '../../shared/presentation/insuranceOnboarding'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, EmptyState, FormField, LoadingState, PageHeader, Pagination, SearchField, Select, StatusBadge,
  TableShell, tableCellClass,
} from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { InsuranceProbePanel } from './InsuranceProbePanel'
import './insurance-onboarding.css'

const COVERAGE = 'coverage'
const PROBE = 'probe'
const ASSESSMENT = 'assessment'
const PAGE_SIZE = 20

const categoryOptions = [{ value: '', label: '全部类别' }, { value: 'DRUG', label: '药品' }, { value: 'SERVICE', label: '诊疗' }, { value: 'SUPPLY', label: '耗材' }]
const statusOptions = [{ value: '', label: '全部状态' }, { value: 'MAPPED', label: '已对照' }, { value: 'UNMAPPED', label: '未映射' },
  { value: 'AMBIGUOUS', label: '歧义' }, { value: 'EXPIRED', label: '已过期' }]

export type WizardProps = {
  api: RhnApi
  contextKey: string
  canProbe?: boolean
  canDebug?: boolean
  canConfigureDebug?: boolean
  canViewRawDebug?: boolean
  canReverseDebug?: boolean
  onNavigate: (path: string) => void
}

type WizardStep = {
  key: string
  title: string
  category: 'section' | 'coverage' | 'probe' | 'assessment'
  statusText?: string
  statusTone?: 'success' | 'warning' | 'danger' | 'neutral'
}

export function InsuranceOnboardingWizard(props: WizardProps) {
  return <InsuranceOnboardingWorkspace key={props.contextKey} {...props} />
}

function InsuranceOnboardingWorkspace({ api, canProbe = false, onNavigate }: WizardProps) {
  const [selected, setSelected] = useState<string>()
  const readiness = useQuery({ queryKey: ['insurance-readiness'], queryFn: () => api.billing.insuranceReadiness(),
    gcTime: 0, retry: false, refetchOnWindowFocus: false })
  const report = readiness.data

  const sectionSteps: WizardStep[] = (report?.sections ?? []).map(section => {
    const worstCheck = section.checks.find(check => check.status === 'BLOCK')
      ?? section.checks.find(check => check.status === 'WARN')
      ?? section.checks[0]
    const worstStatus = worstCheck?.status ?? 'PASS'
    return {
      key: section.code,
      title: section.title,
      category: 'section',
      statusText: worstCheck?.statusText ?? '通过',
      statusTone: readinessStatusTones[worstStatus] ?? 'neutral',
    }
  })

  const coverageStep: WizardStep = {
    key: COVERAGE,
    title: '标准目录对照覆盖率',
    category: 'coverage',
    statusText: '主数据',
    statusTone: 'neutral',
  }

  const probeStep: WizardStep | undefined = canProbe ? {
    key: PROBE,
    title: '接口联通探测',
    category: 'probe',
    statusText: '探针验证',
    statusTone: 'neutral',
  } : undefined

  const assessmentStep: WizardStep = {
    key: ASSESSMENT,
    title: '上线就绪评估报告',
    category: 'assessment',
    statusText: report ? (report.overall === 'BLOCK' ? '有阻断' : report.overall === 'WARN' ? '有警告' : '已就绪') : '待体检',
    statusTone: report ? readinessStatusTones[report.overall] : 'neutral',
  }

  const steps: WizardStep[] = [
    ...sectionSteps,
    coverageStep,
    ...(probeStep ? [probeStep] : []),
    assessmentStep,
  ]

  const defaultStepKey = sectionSteps[0]?.key ?? COVERAGE
  const currentKey = selected && steps.some(step => step.key === selected) ? selected : defaultStepKey
  const currentIndex = Math.max(0, steps.findIndex(step => step.key === currentKey))
  const currentStep = steps[currentIndex] ?? { key: defaultStepKey, title: '检查结果', category: 'section' }
  const currentSection = report?.sections.find(value => value.code === currentKey)

  const goPrevious = () => {
    if (currentIndex > 0) setSelected(steps[currentIndex - 1].key)
  }

  const goNext = () => {
    if (currentIndex < steps.length - 1) {
      setSelected(steps[currentIndex + 1].key)
    } else {
      void readiness.refetch()
    }
  }

  return <section className="ui-page-template insurance-wizard" aria-label="医保接入向导">
    <PageHeader title="医保接入向导"
      description="上线前核对医保网关配置、机构与医师注册资料及标准目录对照。体检与覆盖率只读，不会调用医保平台；接口联通探测会发出真实报文，需要单独授权。"
      compact
      actions={<div className="insurance-onboarding__overall">
        {report
          ? <><StatusBadge tone={readinessStatusTones[report.overall]}>{`总体${report.overallText}`}</StatusBadge>
            <span>{`通过 ${report.summary.pass} · 警告 ${report.summary.warn} · 阻断 ${report.summary.block}`}</span></>
          : <span>{readiness.isPending ? '正在体检…' : '体检未完成'}</span>}
        <Button variant="secondary" size="sm" disabled={readiness.isFetching} onClick={() => { void readiness.refetch() }}>
          重新体检
        </Button>
      </div>} />

    {readiness.isError && <Alert duration={null}>
      {errorMessage(readiness.error)}
      <Button variant="secondary" onClick={() => { void readiness.refetch() }}>重新体检</Button>
    </Alert>}

    <nav className="insurance-wizard__stepper" aria-label="接入向导步骤">
      {steps.map((step, index) => {
        const isActive = step.key === currentKey
        return <div key={step.key} className="insurance-wizard__stepper-segment">
          <Button variant="secondary"
            className={`insurance-wizard__stepper-item ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'step' : undefined}
            aria-label={step.title}
            onClick={() => setSelected(step.key)}>
            <span className="insurance-wizard__stepper-num" aria-hidden="true">{index + 1}</span>
            <div className="insurance-wizard__stepper-text" aria-hidden="true">
              <span className="insurance-wizard__stepper-title">{step.title}</span>
              {step.statusText && <StatusBadge tone={step.statusTone}>{step.statusText}</StatusBadge>}
            </div>
          </Button>
          {index < steps.length - 1 && <span className="insurance-wizard__stepper-arrow" aria-hidden="true">›</span>}
        </div>
      })}
    </nav>

    <div className="insurance-wizard__content">
      <WorkspacePane label={currentStep.title} scroll={currentKey === COVERAGE ? 'content' : 'pane'}
        resetScrollKey={currentKey}
        header={<div className="insurance-wizard__step-head">
          <h2>{currentStep.title}</h2>
          {currentStep.statusText && <StatusBadge tone={currentStep.statusTone}>{currentStep.statusText}</StatusBadge>}
        </div>}>
        {currentKey === PROBE ? <InsuranceProbePanel api={api} />
          : currentKey === COVERAGE ? <CoverageView api={api} systemCodes={report?.insuranceSystemCodes ?? []} onNavigate={onNavigate} />
          : currentKey === ASSESSMENT ? <AssessmentView report={report} onNavigate={onNavigate} onSelectStep={setSelected} onRefetch={() => void readiness.refetch()} />
          : readiness.isPending ? <LoadingState label="正在检查接入配置…" />
          : report && currentSection && <>
            <SectionGuideCard sectionCode={currentSection.code} clientModeText={report.clientModeText} />
            <p className="insurance-onboarding__mode">{`当前医保客户端：${report.clientModeText}`}</p>
            <DataTable aria-label={`${currentSection.title}检查结果`} compact>
              <thead>
                <tr>
                  <th className={tableCellClass('status')}>结果</th>
                  <th>检查项</th>
                  <th>说明</th>
                  <th>修复提示</th>
                </tr>
              </thead>
              <tbody>
                {currentSection.checks.map(check => <tr key={check.code}>
                  <td className={tableCellClass('status')}>
                    <StatusBadge tone={readinessStatusTones[check.status]}>{check.statusText}</StatusBadge>
                  </td>
                  <td><strong>{check.title}</strong></td>
                  <td>{check.detail}</td>
                  <td>{check.fix ? check.fix : <span className="insurance-wizard__pass-hint">已达标</span>}</td>
                </tr>)}
              </tbody>
            </DataTable>
          </>}
      </WorkspacePane>
    </div>

    <footer className="insurance-wizard__footer">
      <span className="insurance-wizard__footer-progress">
        {`步骤 ${currentIndex + 1} / ${steps.length} · ${currentStep.title}`}
      </span>
      <div className="insurance-wizard__footer-actions">
        <Button variant="secondary" disabled={currentIndex === 0} onClick={goPrevious}>
          上一步
        </Button>
        <Button variant="primary" onClick={goNext}>
          {currentIndex === steps.length - 1 ? '完成向导（重新体检）' : '下一步'}
        </Button>
      </div>
    </footer>
  </section>
}

function SectionGuideCard({ sectionCode, clientModeText }: { sectionCode: string; clientModeText: string }) {
  if (sectionCode === 'client') {
    return <aside className="insurance-wizard__guide-card" aria-label="客户端模式指引">
      <div className="insurance-wizard__guide-head">
        <strong>国家医保统一客户端架构说明</strong>
        <StatusBadge tone={clientModeText.includes('未接入') ? 'danger' : 'success'}>{clientModeText}</StatusBadge>
      </div>
      <ul className="insurance-wizard__guide-points">
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">接入标准</span>
          <p className="insurance-wizard__guide-point-text">严格遵循国家医保平台统一接口规范（9001 签到、1101 人员鉴权、2201 就诊登记及预结算）。</p>
        </li>
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">网络与安全</span>
          <p className="insurance-wizard__guide-point-text">正式网关须部署在卫生专网环境中，具备签名密钥与专网前置，严禁跨公网直接透传敏感数据。</p>
        </li>
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">准入说明</span>
          <p className="insurance-wizard__guide-point-text">生产投产前必须使用平台测试人员在专网完成全流程探针联调，方可切换为正式结算模式。</p>
        </li>
      </ul>
    </aside>
  }

  if (sectionCode === 'gateway') {
    return <aside className="insurance-wizard__guide-card" aria-label="正式网关配置指引">
      <div className="insurance-wizard__guide-head">
        <strong>医保网关参数安全核验须知</strong>
      </div>
      <ul className="insurance-wizard__guide-points">
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">配置只读核对</span>
          <p className="insurance-wizard__guide-point-text">体检服务仅在本地核对必填参数是否存在与格式正确性，绝不回显任何密码、密钥等机密凭据。</p>
        </li>
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">机构编码一致性</span>
          <p className="insurance-wizard__guide-point-text">定点医药机构编码（fixmedins-code）必须与属地医保局核发的唯一定点机构代码逐字对齐。</p>
        </li>
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">修改生效方式</span>
          <p className="insurance-wizard__guide-point-text">在 rhn.billing.insurance.chs.gateway 补充或更正配置后，刷新上下文或重启应用即可重新体检生效。</p>
        </li>
      </ul>
    </aside>
  }

  if (sectionCode === 'registration') {
    return <aside className="insurance-wizard__guide-card" aria-label="机构与医师备案指引">
      <div className="insurance-wizard__guide-head">
        <strong>机构科室与医师医保注册号匹配须知</strong>
      </div>
      <ul className="insurance-wizard__guide-points">
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">险种编码标准</span>
          <p className="insurance-wizard__guide-point-text">险种类型必须符合平台标准三位代码（如 310 职工基本医疗保险、390 城乡居民基本医疗保险）。</p>
        </li>
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">在岗医师人工核查</span>
          <p className="insurance-wizard__guide-point-text">系统无法自动获取当前全部在岗排班医师，各临床科室管理员必须逐一核实在岗接诊医师医保注册号。</p>
        </li>
        <li className="insurance-wizard__guide-point">
          <span className="insurance-wizard__guide-point-title">科室登记唯一性</span>
          <p className="insurance-wizard__guide-point-text">同一科室、险种与统筹区只允许保留一条有效注册记录，存在重复记录将被预结算拦截。</p>
        </li>
      </ul>
    </aside>
  }

  return null
}

function CoverageView({ api, systemCodes, onNavigate }: { api: RhnApi; systemCodes: string[]; onNavigate: (path: string) => void }) {
  const [filter, setFilter] = useState<InsuranceCoverageQuery>({})
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [exportError, setExportError] = useState<string>()
  const [exporting, setExporting] = useState(false)
  const coverage = useQuery({ queryKey: ['insurance-coverage', filter, page], queryFn: () => api.masterData.insuranceCoverage(filter, page, PAGE_SIZE),
    gcTime: 0, retry: false, refetchOnWindowFocus: false, placeholderData: previous => previous })
  const apply = (next: InsuranceCoverageQuery) => { setFilter(next); setPage(0) }
  const systemOptions = [{ value: '', label: '全部医保目录体系' }, ...systemCodes.map(value => ({ value, label: value }))]
  const data = coverage.data

  const exportCsv = async () => {
    setExporting(true); setExportError(undefined)
    try {
      const blob = await api.masterData.insuranceCoverageExport(filter)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'insurance-coverage.csv'
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    } catch (error) { setExportError(errorMessage(error)) } finally { setExporting(false) }
  }

  return <div className="insurance-onboarding__coverage">
    <div className="insurance-onboarding__summary" role="list" aria-label="覆盖率汇总">
      {data?.summary.map(item => <dl key={item.category} role="listitem">
        <dt>{item.categoryText}</dt>
        <dd className="insurance-onboarding__rate">{coverageRateLabel(item.coverageRate)}</dd>
        <dd>{`共 ${item.total} 项 · 已对照 ${item.mapped} · 未映射 ${item.unmapped} · 歧义 ${item.ambiguous} · 过期 ${item.expired}`}</dd>
      </dl>)}
    </div>
    <div className="ui-query-filters">
      <SearchField label="搜索项目" value={keyword} placeholder="项目编码或名称"
        onChange={value => { setKeyword(value); apply({ ...filter, query: value }) }} />
      <FormField label="医保目录体系">
        <Select value={filter.systemCode ?? ''} options={systemOptions} onChange={value => apply({ ...filter, systemCode: value })} />
      </FormField>
      <FormField label="类别">
        <Select value={filter.category ?? ''} options={categoryOptions} onChange={value => apply({ ...filter, category: value })} />
      </FormField>
      <FormField label="对照状态">
        <Select value={filter.status ?? ''} options={statusOptions} onChange={value => apply({ ...filter, status: value })} />
      </FormField>
      <div className="ui-query-filters__actions">
        <Button variant="secondary" disabled={exporting} onClick={() => { void exportCsv() }}>
          {exporting ? '正在导出…' : '导出当前筛选'}
        </Button>
        <Button onClick={() => onNavigate('/settings/standard-mappings')}>前往标准映射管理</Button>
      </div>
    </div>
    {exportError && <Alert duration={null}>{exportError}</Alert>}
    {coverage.isError && <Alert duration={null}>
      {errorMessage(coverage.error)}
      <Button variant="secondary" onClick={() => { void coverage.refetch() }}>重新加载</Button>
    </Alert>}
    {!data && coverage.isPending ? <LoadingState label="正在统计对照覆盖率…" />
      : data && (data.items.length === 0
        ? <EmptyState icon="search" title="没有符合条件的项目" copy="调整筛选条件，或确认已维护在用的可收费目录。" />
        : <TableShell scrollLabel="目录对照明细" resetScrollKey={`${page}:${JSON.stringify(filter)}`}
          footer={<Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.total / data.size))} total={data.total}
            label="目录对照分页" onChange={setPage} />}>
          <DataTable aria-label="目录对照明细" compact>
            <thead>
              <tr>
                <th>类别</th>
                <th>项目编码</th>
                <th>项目名称</th>
                <th className={tableCellClass('status')}>对照状态</th>
                <th>说明</th>
                <th>医保目录编码</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(item => <tr key={item.catalogItemId}>
                <td>{item.categoryText}</td>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td className={tableCellClass('status')}>
                  <StatusBadge tone={coverageStatusTones[item.status]}>{item.statusText}</StatusBadge>
                </td>
                <td>{item.detail}</td>
                <td>{item.termCodes.length ? item.termCodes.join('、') : '—'}</td>
              </tr>)}
            </tbody>
          </DataTable>
        </TableShell>)}
  </div>
}

function AssessmentView({ report, onNavigate, onSelectStep, onRefetch }: {
  report?: {
    overall: string
    overallText: string
    clientModeText: string
    summary: { pass: number; warn: number; block: number }
    sections: { code: string; title: string; checks: { code: string; title: string; status: string; statusText: string; detail: string; fix?: string | null }[] }[]
  }
  onNavigate: (path: string) => void
  onSelectStep: (stepKey: string) => void
  onRefetch: () => void
}) {
  if (!report) return <LoadingState label="正在生成上线就绪评估报告…" />

  const isBlocked = report.overall === 'BLOCK'
  const isWarn = report.overall === 'WARN'
  const allIssues = report.sections.flatMap(section =>
    section.checks
      .filter(check => check.status !== 'PASS')
      .map(check => ({ ...check, sectionCode: section.code, sectionTitle: section.title })))

  const exportAssessmentJson = () => {
    const assessmentData = {
      evaluatedAt: new Date().toISOString(),
      clientMode: report.clientModeText,
      verdict: report.overallText,
      summary: report.summary,
      issues: allIssues.map(issue => ({ section: issue.sectionTitle, item: issue.title, status: issue.statusText, detail: issue.detail, fix: issue.fix })),
    }
    const blob = new Blob([JSON.stringify(assessmentData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'insurance-onboarding-readiness.json'
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
  }

  return <div className="insurance-wizard__assessment">
    <div className="insurance-wizard__assessment-summary">
      <div className="insurance-wizard__assessment-lead">
        <div>
          <h3 className="insurance-wizard__assessment-title">{`接入就绪度总体结论：${report.overallText}`}</h3>
          <p className="insurance-wizard__assessment-copy">
            {isBlocked ? '当前检测到阻断项，无法满足医保上线标准，请先整改以下阻断问题。'
              : isWarn ? '当前配置基本具备接入条件，但存在部分警告项，建议确认无误后再行投产。'
              : '各项体检项与基础资料均已达标，已具备正式启用医保结算的准入条件。'}
          </p>
        </div>
        <StatusBadge tone={readinessStatusTones[report.overall]}>{`总体${report.overallText}`}</StatusBadge>
      </div>
      <div className="insurance-wizard__assessment-actions">
        <Button variant="secondary" size="sm" onClick={exportAssessmentJson}>导出就绪报告</Button>
        <Button variant="secondary" size="sm" onClick={onRefetch}>重新评估</Button>
      </div>
    </div>

    <div className="insurance-wizard__checklist">
      <div className="insurance-wizard__check-card">
        <div className="insurance-wizard__check-card-head">
          <strong>1. 客户端与环境</strong>
          <StatusBadge tone={report.clientModeText.includes('未接入') ? 'danger' : 'success'}>
            {report.clientModeText}
          </StatusBadge>
        </div>
        <p>确认系统采用国家医保统一标准的正式网关模式，并具备专网通道与证书。</p>
      </div>
      <div className="insurance-wizard__check-card">
        <div className="insurance-wizard__check-card-head">
          <strong>2. 网关与机构资质</strong>
          <StatusBadge tone={report.summary.block > 0 ? 'danger' : report.summary.warn > 0 ? 'warning' : 'success'}>
            {report.summary.block > 0 ? '有阻断' : report.summary.warn > 0 ? '有警告' : '已就绪'}
          </StatusBadge>
        </div>
        <p>核对医药机构编码、科室医保注册映射、3位险种编码及在岗接诊医师医保注册号。</p>
      </div>
      <div className="insurance-wizard__check-card">
        <div className="insurance-wizard__check-card-head">
          <strong>3. 目录对照覆盖率</strong>
          <StatusBadge tone="neutral">主数据对照</StatusBadge>
        </div>
        <p>确保本机构在用的药品、诊疗、耗材收费目录具备唯一的有效医保映射，避免结算拦截。</p>
      </div>
      <div className="insurance-wizard__check-card">
        <div className="insurance-wizard__check-card-head">
          <strong>4. 接口链路探针</strong>
          <StatusBadge tone="neutral">仿真联通</StatusBadge>
        </div>
        <p>在测试网关下验证 9001 签到、1101 人员鉴权与 2201~2206 预结算报文收发一致性。</p>
      </div>
    </div>

    {allIssues.length > 0 && <div className="insurance-wizard__issues">
      <h3 className="insurance-wizard__issues-title">{`待整改与关注项目清单（共 ${allIssues.length} 项）`}</h3>
      <DataTable aria-label="待整改问题清单" compact>
        <thead>
          <tr>
            <th className={tableCellClass('status')}>级别</th>
            <th>所属阶段</th>
            <th>检查项</th>
            <th>说明</th>
            <th>修复提示</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {allIssues.map(issue => <tr key={issue.code}>
            <td className={tableCellClass('status')}>
              <StatusBadge tone={readinessStatusTones[issue.status]}>{issue.statusText}</StatusBadge>
            </td>
            <td>{issue.sectionTitle}</td>
            <td>{issue.title}</td>
            <td>{issue.detail}</td>
            <td>{issue.fix ? issue.fix : <span className="insurance-wizard__pass-hint">已达标</span>}</td>
            <td>
              <Button variant="text" size="sm" onClick={() => onSelectStep(issue.sectionCode)}>
                前往核对
              </Button>
            </td>
          </tr>)}
        </tbody>
      </DataTable>
    </div>}

    <div className="insurance-wizard__ops-banner">
      <div className="insurance-wizard__ops-copy">
        <strong>日常交易监控与排障提示</strong>
        <span>医保接入完成上线后，如需实时监控生产交易往返、排查医保拒绝或网络超时、执行异常交易冲正或调试抓包，请使用运维专用的「医保调试控制台」。</span>
      </div>
      <Button variant="secondary" onClick={() => onNavigate('/settings/insurance-debug')}>
        前往医保调试控制台
      </Button>
    </div>
  </div>
}
