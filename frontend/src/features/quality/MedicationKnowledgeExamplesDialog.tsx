import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeExample } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, StatusBadge } from '../../shared/ui'
import './medication-knowledge-examples.css'

const outcomes: Record<string,string> = { MATCH: '命中', NO_MATCH: '未命中', NOT_APPLICABLE: '不适用', UNAVAILABLE: '无法评价' }
export function MedicationKnowledgeExamplesDialog({ api, kind, onClose, onAdopt, adoptLabel = '填入未保存知识草稿' }: {
  api: RhnApi; kind?: string; onClose: () => void; onAdopt: (example: KnowledgeExample) => void; adoptLabel?: string
}) {
  const query = useQuery({ queryKey: ['medication-knowledge-examples'], queryFn: () => api.medicationKnowledgeDrafts.examples(), retry: false })
  const [id, setId] = useState('')
  const examples = query.data?.filter(value => !kind || value.body.kind === kind) ?? []
  const current = examples.find(value => value.id === id) ?? examples[0]
  const download = () => {
    if (!current) return
    const url = URL.createObjectURL(new Blob([current.sourceMaterial], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `合理用药验收依据-${current.id}.md`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Dialog title="重复用药与相互作用 · 验收样例" size="xwide" onClose={onClose} enterNavigation={false}>
    <p>人工编写的验收样例，使用已核对的公开依据与当前标准药品。载入后仍由你核对保存，临床启用在统一规则目录中另行操作。</p>
    {query.isPending && <p>正在核对标准目录并运行样例…</p>}
    {query.error && <Alert>{errorMessage(query.error)}</Alert>}
    {!query.isError && current && <div className="knowledge-examples-layout">
      <aside>{examples.map(value => <Button key={value.id} variant={value.id === current.id ? 'primary' : 'secondary'}
        onClick={() => setId(value.id)}>{value.purpose}</Button>)}
        <p>后续操作：填入草稿 → 核对来源和范围 → 生成规则候选 → 载入并运行验收样例 → 审核、旁路与正式启用 → 开方及药师处理。</p>
        <p>需要验证 AI 时，载入草稿后使用“AI 从原文提取知识”，对比模型结果与这里的人工预期。</p>
      </aside>
      <section><h3>{current.body.title}</h3><StatusBadge tone="warning">验收方案待确认 · 未发布</StatusBadge>
        <ul>{current.notes.map(note => <li key={note}>{note}</li>)}</ul>
        <p><a href={current.sourceUrl} target="_blank" rel="noreferrer">查看公开原始依据</a></p>
        <blockquote>{current.body.evidence.excerpt}</blockquote>
        <p>{current.body.evidence.edition}</p>
        <Button variant="secondary" onClick={download}>下载依据摘录与验收方案</Button>
        <p>文件指纹对应下载的摘录与方案，不是官方全文文件。</p>
        <h4>范围与预期</h4><p>{current.assessment.ruleDescription}</p>
        {!!current.assessment.issues.length && <Alert>{current.assessment.issues.map(issue => issue.message).join('；')}</Alert>}
        <div className="knowledge-examples-results"><table><thead><tr><th>验收情形</th><th>人工预期</th><th>实际结果</th><th>核对</th></tr></thead>
          <tbody>{current.results.map(result => <tr key={result.name}><td>{result.name}</td><td>{outcomes[result.expected]}</td>
            <td>{outcomes[result.actual.outcome]}</td><td>{result.passed ? '符合' : '不符合'}</td></tr>)}</tbody></table></div>
        <p>未命中或不适用只代表本条样例的结果，不代表处方安全。样例使用合成医嘱，不会创建患者或真实处方。</p>
        <Button disabled={!current.assessment.structureComplete || !current.results.length || current.results.some(value => !value.passed)}
          onClick={() => onAdopt(current)}>{adoptLabel}</Button>
      </section>
    </div>}
  </Dialog>
}
