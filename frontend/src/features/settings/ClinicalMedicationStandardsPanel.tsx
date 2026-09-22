import { useState } from 'react'
import { ClinicalSemanticImpactDialog } from './ClinicalSemanticImpactDialog'
import type { UsageImpactSelection } from '../../shared/api/clinicalSemanticImpactApi'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, DataTable, LoadingState, StatusBadge, TableShell, Tabs, tableCellClass } from '../../shared/ui'
import './clinical-medication-standards.css'
import { MedicationStandardReadinessPanel } from './MedicationStandardReadinessPanel'

const kinds: Record<string, string> = {
  TIMES_PER_DAY: '周期次数',
  INTERVAL: '固定间隔',
  AS_NEEDED: '按需',
  ONCE: '单次',
  SCHEDULED_TIME: '日历安排',
  OTHER: '其他',
}

export type MedicationStandardsSubTab = 'readiness' | 'rules'
export type ClinicalRuleCategory = 'frequency' | 'route' | 'unit'

export function ClinicalMedicationStandardsPanel({
  api,
  organizationId,
  onOpenCatalog,
  defaultTab = 'readiness',
  hideNav = false,
}: {
  api: RhnApi
  organizationId?: string
  onOpenCatalog?: () => void
  defaultTab?: MedicationStandardsSubTab
  hideNav?: boolean
}) {
  const [tab, setTab] = useState<MedicationStandardsSubTab>(defaultTab)
  const [ruleCategory, setRuleCategory] = useState<ClinicalRuleCategory>('frequency')
  const [impact, setImpact] = useState<UsageImpactSelection>()
  const query = useQuery({
    queryKey: ['master-data-clinical-medication-standards', organizationId],
    queryFn: api.masterData.clinicalMedicationStandards,
  })

  if (query.isPending) return <LoadingState label="正在读取用药标准…" />
  if (query.error) return <Alert>{errorMessage(query.error)}</Alert>
  const value = query.data

  return (
    <section className="clinical-medication-standards" aria-label="用药标准体系">
      {!hideNav && (
        <header className="clinical-medication-standards__header">
          <div className="clinical-medication-standards__header-main">
            <div>
              <h3>用药标准体系</h3>
              <p>药品来自标准参考目录；给药途径、频次和临床单位共同构成规则输入。</p>
            </div>
            <StatusBadge tone="info">{value.version}</StatusBadge>
          </div>
          <div className="clinical-medication-standards__nav">
            <Tabs
              value={tab}
              onChange={setTab}
              label="用药标准子视图切换"
              variant="line"
              items={[
                {
                  value: 'readiness',
                  label: '药品标准建设与对齐',
                  meta: '全院药品对齐 · 缺口治理 · 来源核验',
                },
                {
                  value: 'rules',
                  label: '临床用药规则基准',
                  meta: `频次 ${value.frequencies.length} · 途径 ${value.routes.length} · 单位 ${value.doseUnits.length}`,
                },
              ]}
            />
          </div>
        </header>
      )}

      <div className="clinical-medication-standards__content">
        {tab === 'readiness' && (
          <MedicationStandardReadinessPanel
            api={api}
            organizationId={organizationId}
            onOpenCatalog={onOpenCatalog}
          />
        )}

        {tab === 'rules' && (
          <div className="clinical-medication-standards__rules-view">
            <Alert tone="info">
              默认剂量不代表安全上限。按需、单次和日历用药不推算固定日剂量；包装数量不直接参与临床剂量换算。
            </Alert>

            <div className="clinical-rules__category-bar">
              <Tabs
                value={ruleCategory}
                onChange={setRuleCategory}
                label="规则基准类型切换"
                variant="cards"
                items={[
                  {
                    value: 'frequency',
                    label: `频次标准 · ${value.frequencies.length}`,
                    meta: '日频率推算 · 执行时点排程能力',
                  },
                  {
                    value: 'route',
                    label: `给药途径 · ${value.routes.length}`,
                    meta: '受控途径概念 · 标准编码与来源版本',
                  },
                  {
                    value: 'unit',
                    label: `临床剂量单位 · ${value.doseUnits.length}`,
                    meta: '质量与体积物理维度 · 规范换算比率',
                  },
                ]}
              />
            </div>

            <div className="clinical-rules__active-view">
              {ruleCategory === 'frequency' && (
                <section className="clinical-medication-standards__card clinical-rules__workspace-card">
                  <div className="clinical-medication-standards__card-header">
                    <h4>频次标准明细</h4>
                    <p>当前门诊用药场景的有效频次。平均频率、具体时点与任意 24 小时最大给药量是不同概念。</p>
                  </div>
                  <TableShell className="clinical-medication-standards__card-table" scrollClassName="master-data-table-wrap">
                    <DataTable className="master-data-table clinical-rules-table clinical-rules-table--frequencies">
                      <thead>
                        <tr>
                          <th className="col-freq-name">本院频次</th>
                          <th className="col-freq-semantic">标准语义</th>
                          <th className="col-freq-rate">平均给药次数</th>
                          <th className="col-freq-schedule">执行时点能力</th>
                          <th className={`col-freq-action ${tableCellClass('actions')}`}>影响</th>
                        </tr>
                      </thead>
                      <tbody>
                        {value.frequencies.map((f) => (
                          <tr key={f.id}>
                            <td className="col-freq-name">
                              <div className="clinical-rules__cell-title">
                                <strong className="clinical-rules__title">{f.name}</strong>
                                <small className="clinical-rules__subtext clinical-rules__subtext--code">{f.code}</small>
                              </div>
                            </td>
                            <td className="col-freq-semantic">
                              <div className="clinical-rules__semantic-cell">
                                <span className="clinical-rules__kind-text">
                                  {kinds[f.standard.interpretation.kind] ?? f.standard.interpretation.kind}
                                </span>
                                <small className="clinical-rules__subtext clinical-rules__concept-id">
                                  {f.standard.conceptId ?? '待补充计算语义'}
                                </small>
                              </div>
                            </td>
                            <td className="col-freq-rate">
                              {f.standard.interpretation.dailyRateComputable ? (
                                <span className="clinical-rules__doses-text">
                                  {f.standard.interpretation.doses} 次 / {f.standard.interpretation.perDays} 天
                                </span>
                              ) : (
                                <span className="clinical-rules__muted-text">无固定日频率</span>
                              )}
                            </td>
                            <td className="col-freq-schedule">
                              <span className="clinical-rules__schedule-text">
                                {f.scheduleCapability?.explanation ?? '尚未读取排程能力'}
                              </span>
                            </td>
                            <td className={`col-freq-action ${tableCellClass('actions')}`}>
                              <Button variant="secondary" size="sm" onClick={() => setImpact({ kind: 'FREQUENCY', conceptId: f.id, name: f.name })}>
                                查看引用
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableShell>
                </section>
              )}

              {ruleCategory === 'route' && (
                <section className="clinical-medication-standards__card clinical-rules__workspace-card">
                  <div className="clinical-medication-standards__card-header">
                    <h4>给药途径明细</h4>
                    <p>沿用受控途径概念及来源版本，显示名不作为识别依据。</p>
                  </div>
                  <TableShell className="clinical-medication-standards__card-table" scrollClassName="master-data-table-wrap">
                    <DataTable className="master-data-table clinical-rules-table clinical-rules-table--routes">
                      <thead>
                        <tr>
                          <th className="col-route-name">途径</th>
                          <th className="col-route-code">标准编码</th>
                          <th className="col-route-source">来源版本</th>
                          <th className={`col-route-action ${tableCellClass('actions')}`}>影响</th>
                        </tr>
                      </thead>
                      <tbody>
                        {value.routes.map((r) => (
                          <tr key={r.id}>
                            <td className="col-route-name">
                              <strong className="clinical-rules__title">{r.name}</strong>
                            </td>
                            <td className="col-route-code">
                              <span className="clinical-rules__code-text">{r.code}</span>
                            </td>
                            <td className="col-route-source">
                              <div className="clinical-rules__source-cell">
                                <span className="clinical-rules__system-code">{r.systemCode}</span>
                                <small className="clinical-rules__subtext">v{r.systemVersion}</small>
                              </div>
                            </td>
                            <td className={`col-route-action ${tableCellClass('actions')}`}>
                              <Button variant="secondary" size="sm" onClick={() => setImpact({ kind: 'ROUTE', conceptId: r.id, name: r.name })}>
                                查看引用
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableShell>
                </section>
              )}

              {ruleCategory === 'unit' && (
                <section className="clinical-medication-standards__card clinical-rules__workspace-card">
                  <div className="clinical-medication-standards__card-header">
                    <h4>临床剂量单位明细</h4>
                    <p>只进行同维度换算；片、粒等须有标准规格定义的含量关系。</p>
                  </div>
                  <TableShell className="clinical-medication-standards__card-table" scrollClassName="master-data-table-wrap">
                    <DataTable className="master-data-table clinical-rules-table clinical-rules-table--units">
                      <thead>
                        <tr>
                          <th className="col-unit-name">单位</th>
                          <th className={`col-unit-dim ${tableCellClass('status')}`}>维度</th>
                          <th className="col-unit-conversion">规范换算</th>
                          <th className={`col-unit-action ${tableCellClass('actions')}`}>影响</th>
                        </tr>
                      </thead>
                      <tbody>
                        {value.doseUnits.map((u) => (
                          <tr key={u.id}>
                            <td className="col-unit-name">
                              <div className="clinical-rules__unit-cell">
                                <strong className="clinical-rules__title">{u.display}</strong>
                                <small className="clinical-rules__subtext clinical-rules__subtext--code">{u.code}</small>
                              </div>
                            </td>
                            <td className={`col-unit-dim ${tableCellClass('status')}`}>
                              <StatusBadge tone="neutral">{u.dimension === 'MASS' ? '质量' : '体积'}</StatusBadge>
                            </td>
                            <td className="col-unit-conversion">
                              <div className="clinical-rules__conversion-formula">
                                <code>1 {u.code} = {u.conversionFactor} {u.canonicalUnit}</code>
                              </div>
                            </td>
                            <td className={`col-unit-action ${tableCellClass('actions')}`}>
                              <Button variant="secondary" size="sm" onClick={() => setImpact({ kind: 'UNIT', conceptId: u.id, name: u.display })}>
                                查看引用
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableShell>
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      {impact && <ClinicalSemanticImpactDialog api={api} scope={impact} onClose={() => setImpact(undefined)} />}
    </section>
  )
}
