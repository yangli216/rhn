import type { KnowledgeRulePreview } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, StatusBadge } from '../../shared/ui'
import './medication-knowledge-rule.css'

const outcomes: Record<string, string> = { MATCH: '条件命中', NO_MATCH: '未命中', NOT_APPLICABLE: '不适用', UNAVAILABLE: '不可评价' }
const actions: Record<string, string> = { WARN: '警告提示', REQUIRE_OVERRIDE: '需理由后继续', BLOCK: '阻断' }
const sources: Record<string, string> = { LABEL: '药品说明书', GUIDELINE: '指南 / 共识', LITERATURE: '文献', INSTITUTION_POLICY: '机构管理规范' }
const ageUnits: Record<string, string> = { YEAR: '岁', MONTH: '月龄', DAY: '日龄' }
export function MedicationKnowledgeRuleView({ value }: { value: Pick<KnowledgeRulePreview, 'knowledge' | 'knowledgeHash' | 'program' | 'programHash' | 'cases'> }) {
  const { knowledge: k, program: p } = value, evidence = k.body.evidence
  return <div className="knowledge-rule-view">
    <Alert>规则表达与结构样例用于核对候选；审核和部署状态以统一规则目录为准。合成样例通过仅验证结构与匹配边界，不代替药学审核。</Alert>
    <div className="knowledge-rule-view__columns"><section><h4>规则表达与适用范围</h4><p>{k.assessment.ruleDescription}</p>
      {p && <><p><strong>同一处方内</strong> · {p.operator === 'SAME_STANDARD_ENTRY' ? `全部标准药品，按同一标准条目分组，至少 ${p.minimumOrders} 条不同有效医嘱` : p.operator === 'EXPLICIT_GROUP' ? `明确药品组内，至少 ${p.minimumOrders} 条不同有效医嘱` : 'A、B 两组分别由不同有效医嘱满足'}。</p>
        <p>年龄：{p.age.mode === 'ALL' ? '不限年龄' : `${p.age.minimumInclusive ?? '无下限'}（含）至 ${p.age.maximumExclusive ?? '无上限'}（不含）${ageUnits[p.age.unit ?? ''] || p.age.unit}`}。来源有效期：{p.effectiveFrom || '未限定起日'} 至 {p.effectiveTo || '未限定止日'}（含）。</p>
        {(p.operator === 'GROUP_PAIR' ? [['A', p.groupA], ['B', p.groupB]] as const : [['A', p.groupA]] as const).map(([label, group]) => <div className="knowledge-rule-view__group" key={label}>
          <strong>{label} 组范围</strong>{p.operator === 'SAME_STANDARD_ENTRY' ? <p>运行时依据冻结标准身份分组，无须指定本院药品。</p> : <ul>{group.targets.map((t, i) => <li key={i}>{t.reference.name} · {t.level === 'ENTRY' ? '此标准条目的全部规格' : t.reference.preparationSpec}<small>条目 {t.reference.entryId} / 规格 {t.reference.specificationId} · 目录 {t.reference.catalogId} · {t.reference.catalogVersion}</small></li>)}</ul>}
          <p>途径：{group.routeMode === 'ALL' ? '不限途径' : group.routes.map(r => `${r.name}（${r.code} · ${r.systemCode}/${r.systemVersion}）`).join('；')}</p>
        </div>)}
        <p>建议动作：{actions[p.proposedAction] || p.proposedAction}，正式动作待审核确定。</p><p>{k.body.clinicalMeaning}</p><h4>必需的业务事实</h4><ul>{p.requiredFacts.map(f => <li key={f}>{f}</li>)}</ul><p>缺失关键事实或标准版本冲突时返回“不可评价”；未命中不代表用药安全。</p>
      </>}
    </section><section><h4>冻结来源 · 知识第 {k.version} 版</h4><p>来源类型：{sources[evidence?.sourceType] || evidence?.sourceType || '尚未明确'}</p><p>{evidence?.title} · {evidence?.publisher} · {evidence?.edition}</p><p>{evidence?.locator}</p><blockquote>{evidence?.excerpt || '未提供原文'}</blockquote>
      <h4>结构样例 {value.cases.filter(c => c.passed).length} / {value.cases.length} 通过</h4>{value.cases.map((c, i) => <details key={i}><summary><StatusBadge tone={c.passed ? 'info' : 'danger'}>{c.passed ? '通过' : '失败'}</StatusBadge> {c.name}</summary><p>预期：{outcomes[c.expected]}；实际：{outcomes[c.actual.outcome]}</p><p>{c.actual.reasons.join('；')}</p><p>参与命中：{c.actual.matchedOrderIds.join('、') || '无'}</p><pre>{JSON.stringify(c.input, null, 2)}</pre></details>)}
    </section></div>
    <details><summary>追溯信息与完整结构化表达</summary><small>知识 {k.id} · 第 {k.version} 版 · {k.actor} · {new Date(k.savedAt).toLocaleString()}</small><small>知识指纹：{value.knowledgeHash}</small><small>来源文件指纹：{evidence?.documentHash}</small><small>规则表达指纹：{value.programHash}</small><pre>{JSON.stringify({ program: p, knowledge: k }, null, 2)}</pre></details>
  </div>
}
