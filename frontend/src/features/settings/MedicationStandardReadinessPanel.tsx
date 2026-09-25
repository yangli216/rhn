import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, DataTable, EmptyState, LoadingState, Pagination, SearchField, Select, StatusBadge, TableShell, tableCellClass } from '../../shared/ui'
import { MedicationStandardBindingDialog } from './MedicationStandardBindingDialog'
import './clinical-medication-standards.css'

const statuses: Record<string, string> = { LINKED: '关联一致', UNMAPPED: '未关联', AMBIGUOUS: '关联冲突', STALE: '版本不可用', MISMATCH: '信息不一致' }
const matchingLabels: Record<string, string> = {
  UNIQUE_MATCH: '唯一匹配待确认', MULTIPLE_MATCHES: '多个规格待辨别', DUPLICATE_LOCAL: '同规格历史档案待关联',
  TARGET_IN_USE: '可复用已有标准身份', IDENTITY_MISMATCH: '身份字段需修正', NO_CANDIDATE: '无可匹配规格',
}
const matchingActions: Record<string, string> = {
  UNIQUE_MATCH: '存在唯一一致规格，核对来源后建立关联。',
  MULTIPLE_MATCHES: '多个规格身份字段相同，需进一步区分盐型、成分或来源描述。',
  DUPLICATE_LOCAL: '多个历史本地档案对应同一规格；核对剂型、规格和含量后可分别关联，保留各自业务记录。',
  TARGET_IN_USE: '此规格已有标准关联；当前历史档案身份一致时也可关联，新建药品仍应复用已有档案。',
  IDENTITY_MISMATCH: '打开候选对照具体差异，按来源修正剂型、规格或单位后重新核查。',
  NO_CANDIDATE: '核对名称与目录范围；范围性条目、占位规格不能直接作为具体药品关联。',
}
const reasons: Record<string, string> = {
  STANDARD_SPECIFICATION_INCOMPLETE: '标准规格不完整，须先核对原文',
  STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW: '标准原文包含未分开的剂型段落',
  STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW: '成分片段不能单独作为完整规格',

  STANDARD_REFERENCE_MISSING: '尚未绑定标准规格', STANDARD_REFERENCE_AMBIGUOUS: '存在多个标准关联',
  STANDARD_REFERENCE_QUALIFIER_MISSING: '同规格存在不同盐型，需补全药品名称',
  STANDARD_REFERENCE_QUALIFIER_MISMATCH: '药品盐型与标准不一致',
  STANDARD_REFERENCE_VERSION_UNAVAILABLE: '目录版本或内容已变化', STANDARD_REFERENCE_SPECIFICATION_UNAVAILABLE: '关联规格在当前目录中不存在',
  STANDARD_REFERENCE_IDENTITY_MISMATCH: '药品属性与标准规格不一致', STANDARD_REFERENCE_STRENGTH_MISMATCH: '含量与标准规格不一致',
  STRENGTH_VALUE_INVALID: '标准含量或体积数值无效',
  DOSE_CONVERSION_NOT_DEFINED: '规格尚未定义此换算关系', STRENGTH_UNIT_NOT_COMPUTABLE: '当前未支持此含量单位',
}
const explain = (codes: string[]) => codes.map(code => reasons[code] ?? '需要进一步核对标准数据').join('、')
const actions: Record<string, string> = {
  UNMAPPED: '到标准参考目录核对具体规格并关联已有药品；目录未覆盖时先补充标准。',
  AMBIGUOUS: '核对多重关联，保留可追溯的唯一标准身份。',
  STALE: '核对关联版本、内容指纹和规格是否仍可用。',
  MISMATCH: '核对剂型、规格、制剂单位及含量；不能用改名替代身份修正。',
}

export function MedicationStandardReadinessPanel({ api, organizationId, onOpenCatalog, compact = false }: {
  api: RhnApi; organizationId?: string; onOpenCatalog?: () => void; compact?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [medicationId, setMedicationId] = useState<string>()
  const query = useQuery({
    queryKey: ['medication-standard-readiness', organizationId, search, filter, page],
    queryFn: () => api.masterData.medicationStandardReadiness(search, filter, page, 20),
    placeholderData: keepPreviousData,
  })
  const value = query.data
  return <section className="medication-readiness" aria-label="药品标准建设情况">
    {!compact && (
      <div className="medication-readiness__heading">
        <div>
          <h4>药品标准建设情况</h4>
          <p>统计本租户全部启用药品，不限于当前机构采用目录。关联、来源核验、换算能力分别核查。</p>
        </div>
        {onOpenCatalog && <Button variant="secondary" onClick={onOpenCatalog}>前往标准参考目录</Button>}
      </div>
    )}
    {value && <>
      <div className="medication-readiness__metrics">
        <div><span>启用药品</span><strong>{value.summary.totalActive}</strong><small>全量统计，筛选不改变分母</small></div>
        <div><span>关联一致</span><strong>{value.summary.referenceStatuses.LINKED}</strong><small>身份一致，不代表知识完备</small></div>
        <div><span>待处理关联</span><strong>{value.summary.totalActive - value.summary.referenceStatuses.LINKED}</strong><small>未关联、冲突、版本或信息异常</small></div>
        <div><span>关联后来源待核验</span><strong>{value.summary.sourceUnverified}</strong><small>与换算缺口可重叠</small></div>
        <div><span>关联后含量换算待补</span><strong>{value.summary.clinicalConversionUnavailable ?? value.summary.conversionUnavailable}</strong><small>制剂或体积到含量的关系尚不完整</small></div>
      </div>
      <small className="medication-readiness__metrics-meta">核查时间：{new Date(value.inspectedAt).toLocaleString()}。来源与换算统计仅覆盖关联一致的药品，不构成用药安全评分。{value.summary.concentrationAvailable !== undefined && ` 已支持 ${value.summary.concentrationAvailable} 项明确浓度的体积到含量换算；不据此推算整支、整瓶用量。`}</small>
    </>}
    {value?.summary.matchingStatuses && <div className="medication-readiness__matching" aria-label="未关联药品处理分组">
      <span className="medication-readiness__matching-label">未关联归因：</span>
      {Object.entries(matchingLabels).map(([status, label]) => <Button key={status} size="sm"
        variant={filter === status ? 'primary' : 'secondary'} onClick={() => {setFilter(status); setPage(0)}}>
        {label} · {value.summary.matchingStatuses?.[status] ?? 0}
      </Button>)}
    </div>}
    <form className="medication-readiness__toolbar" onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); setPage(0) }}>
      <SearchField label="搜索标准建设药品" value={draft} onChange={setDraft} onSearch={val => { setSearch(val.trim()); setPage(0) }} placeholder="药品名称、编码或规格（回车或点击查询）" />
      <Select aria-label="标准建设筛选" value={filter} onChange={value => { setFilter(value || 'ALL'); setPage(0) }} options={[
        { value: 'ALL', label: '全部关联状态' }, ...Object.entries(statuses).map(([value, label]) => ({ value, label })),
        ...Object.entries(matchingLabels).map(([value, label]) => ({ value, label })),
        { value: 'SOURCE_UNVERIFIED', label: '关联后来源待核验' }, { value: 'CLINICAL_CONVERSION_UNAVAILABLE', label: '关联后含量换算待补' }, { value: 'CONCENTRATION_AVAILABLE', label: '已支持浓度换算' },
      ]} />
      <Button type="submit" variant="primary">查询</Button>
      <Button type="button" variant="secondary" onClick={() => { void query.refetch() }} disabled={query.isFetching}>重新核查</Button>
    </form>
    {query.error && <Alert>{errorMessage(query.error)}</Alert>}
    {!value && query.isPending ? <LoadingState label="正在核查药品标准关联…" /> : value && <div className={`medication-readiness__content ${query.isFetching ? 'is-fetching' : ''}`}>
      {!value.content.length ? (
        <EmptyState icon="pharmacy" title="当前条件下没有药品" copy="请调整查询条件；无匹配结果不代表所有药品已完成标准化。" />
      ) : (
        <TableShell
          className="medication-readiness-shell"
          scrollClassName="master-data-table-wrap"
          footer={
            <Pagination
              page={page}
              totalPages={Math.max(1, value.totalPages)}
              total={value.totalElements}
              pageSize={20}
              onChange={setPage}
              label="药品标准建设分页"
            />
          }
        >
          <DataTable className="master-data-table medication-readiness-table">
            <thead>
              <tr>
                <th className="col-medication">药品 / 规格</th>
                <th className="col-standard">标准关联</th>
                <th className={`col-source ${tableCellClass('status')}`}>来源核验</th>
                <th className="col-conversion">含量换算能力</th>
                <th className={`col-actions ${tableCellClass('text')}`}>下一步处理</th>
              </tr>
            </thead>
            <tbody>
              {value.content.map(item => {
                const ref = item.standardReference
                const linked = ref.status === 'LINKED'
                const conversionStatus = item.clinicalConversion?.status ?? item.presentationConversionStatus
                const conversionReasons = item.clinicalConversion?.unavailableReasons ?? item.conversionReasons
                const actionDesc =
                  (ref.issues.some(issue =>
                    ['STANDARD_SPECIFICATION_INCOMPLETE', 'STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW', 'STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW'].includes(issue)
                  ) && '先在标准参考目录核对原文并补齐完整规格；当前不能作为规则身份依据。') ||
                  (item.matching && matchingActions[item.matching.status]) ||
                  actions[ref.status] ||
                  (ref.sourceVerificationStatus !== 'VERIFIED'
                    ? '先核验标准来源；临床剂量上限须另有审核通过的知识依据。'
                    : conversionStatus === 'UNAVAILABLE'
                    ? '核对规格结构与单位；暂不能用于依赖此换算的规则。'
                    : '按规则类型继续补齐适用人群、用法约束及知识依据。')

                return (
                  <tr key={item.medicationId}>
                    <td className="col-medication">
                      <div className="medication-readiness__item-main">
                        <strong className="medication-readiness__item-title">{item.name}</strong>
                        <small className="medication-readiness__item-spec">{item.code} · {item.preparationSpec || '规格未记录'}</small>
                      </div>
                    </td>
                    <td className="col-standard">
                      <div className="medication-readiness__standard-cell">
                        <div className="medication-readiness__badge-wrap">
                          <StatusBadge tone={linked ? 'info' : 'warning'}>{statuses[ref.status] ?? ref.status}</StatusBadge>
                        </div>
                        <small className="medication-readiness__meta-text">
                          {linked ? `${ref.specificationId} · ${ref.catalogVersion}` : explain(ref.issues)}
                        </small>
                        {item.matching && (
                          <small className="medication-readiness__matching-hint">
                            {matchingLabels[item.matching.status]} · 候选 {item.matching.candidateCount} / 一致 {item.matching.consistentCount}
                          </small>
                        )}
                      </div>
                    </td>
                    <td className={`col-source ${tableCellClass('status')}`}>
                      {!linked ? (
                        <span className="medication-readiness__placeholder-text">关联后核查</span>
                      ) : ref.sourceVerificationStatus === 'VERIFIED' ? (
                        <StatusBadge tone="success">已核验</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">待核验</StatusBadge>
                      )}
                    </td>
                    <td className="col-conversion">
                      <div className="medication-readiness__conversion-cell">
                        <div>
                          {conversionStatus === 'COMPUTABLE' ? (
                            <StatusBadge tone="success">{item.clinicalConversion?.basis === 'REFERENCE_MASS_PER_VOLUME' ? '体积→含量' : '制剂→含量'}</StatusBadge>
                          ) : conversionStatus === 'NOT_ASSESSED' ? (
                            <span className="medication-readiness__placeholder-text">关联后核查</span>
                          ) : (
                            <StatusBadge tone="danger">当前不支持</StatusBadge>
                          )}
                        </div>
                        {conversionStatus === 'COMPUTABLE' && item.clinicalConversion && <small className="medication-readiness__meta-text">{item.clinicalConversion.inputUnit} → {item.clinicalConversion.outputUnit}；依据标准规格</small>}
                        {conversionStatus === 'UNAVAILABLE' && (
                          <small className="medication-readiness__meta-text">{explain(conversionReasons)}</small>
                        )}
                      </div>
                    </td>
                    <td className={`col-actions ${tableCellClass('text')}`}>
                      <div className="medication-readiness__action-cell">
                        <span className="medication-readiness__action-desc">{actionDesc}</span>
                        <div className="medication-readiness__action-btn">
                          <Button variant="secondary" size="sm" onClick={() => setMedicationId(item.medicationId)}>
                            核对标准关联
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </TableShell>
      )}
    </div>}
    {medicationId && <MedicationStandardBindingDialog api={api} medicationId={medicationId}
      onClose={() => setMedicationId(undefined)} onOpenCatalog={onOpenCatalog} />}
  </section>
}
