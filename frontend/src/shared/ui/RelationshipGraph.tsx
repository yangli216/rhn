import { useState } from 'react'
import { Button, EmptyState, Pagination } from './index'
import './relationship-graph.css'

export type RelationshipNode = { id: string; label: string; detail?: string }
export type RelationshipEdge = { id: string; source: string; target: string; label: string; detail?: string; tentative?: boolean }

/** Shared, accessible one-hop graph. Every visible line corresponds to a supplied edge. */
export function RelationshipGraph({ nodes, edges, selected, onSelect, label = '数据关系图' }: {
  nodes: RelationshipNode[]; edges: RelationshipEdge[]; selected: string; onSelect: (id: string) => void; label?: string
}) {
  const [page, setPage] = useState(0)
  const center = nodes.find(n => n.id === selected)
  const relevant = edges.filter(edge => edge.source === selected || edge.target === selected)
  const pageSize = 8, current = Math.min(page, Math.max(0, Math.ceil(relevant.length / pageSize) - 1))
  const visible = relevant.slice(current * pageSize, (current + 1) * pageSize)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  if (!center) return <EmptyState icon="database" title="请选择一个对象" copy="选择后显示其直接关联及完整条件。" />
  return <section className="ui-relationship-graph" aria-label={label}>
    <div className="ui-relationship-graph__center"><strong>{center.label}</strong><code>{center.detail ?? center.id}</code></div>
    {visible.length === 0 ? <p>当前对象没有已登记的直接关系。</p> : <div className="ui-relationship-graph__paths">
      {visible.map(edge => {
        const source = nodeMap.get(edge.source), target = nodeMap.get(edge.target)
        return <div className="ui-relationship-graph__path" key={edge.id}>
          <Button variant="secondary" aria-pressed={edge.source === selected} onClick={() => { setPage(0); onSelect(edge.source) }}>
            <span>{source?.label ?? edge.source}<small>{source?.detail ?? edge.source}</small></span>
          </Button>
          <div className={`ui-relationship-graph__edge ${edge.tentative ? 'is-tentative' : ''}`}>
            <span>{edge.label}</span><svg viewBox="0 0 200 16" aria-hidden="true"><path d="M 1 8 H 192 M 184 2 L 192 8 L 184 14" /></svg>
            <small>{edge.detail}</small>
          </div>
          <Button variant="secondary" aria-pressed={edge.target === selected} onClick={() => { setPage(0); onSelect(edge.target) }}>
            <span>{target?.label ?? edge.target}<small>{target?.detail ?? edge.target}</small></span>
          </Button>
        </div>
      })}
    </div>}
    <Pagination label="关系图分页" page={current} totalPages={Math.ceil(relevant.length / pageSize)} total={relevant.length} onChange={setPage} />
  </section>
}
