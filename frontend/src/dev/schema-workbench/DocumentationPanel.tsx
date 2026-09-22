import { useEffect, useState, type ReactNode } from 'react'
import { Button, DataTable, EmptyState, LoadingState, PanelHead, SearchField, Select } from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { messageOf, request, type DocumentInfo } from './api'

const inline = (text: string) => text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) =>
  part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)

/** Render a deliberately small Markdown subset as React text; never execute embedded HTML. */
export function MarkdownDocument({ text }: { text: string }) {
  const lines = text.split(/\r?\n/), blocks: ReactNode[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], key = index
    if (line.startsWith('```')) {
      const code: string[] = []; while (++index < lines.length && !lines[index].startsWith('```')) code.push(lines[index])
      blocks.push(<pre key={key}>{code.join('\n')}</pre>)
    } else if (/^#{1,6} /.test(line)) blocks.push(<h3 key={key}>{inline(line.replace(/^#+\s*/, ''))}</h3>)
    else if (line.startsWith('|') && lines[index + 1]?.match(/^\|[\s:|-]+\|$/)) {
      const cells = (row: string) => row.split('|').slice(1, -1).map(c => c.trim())
      const header = cells(line), rows: string[][] = []; index++
      while (lines[index + 1]?.startsWith('|')) rows.push(cells(lines[++index]))
      blocks.push(<DataTable key={key} compact><thead><tr>{header.map((cell, i) => <th key={i}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{inline(cell)}</td>)}</tr>)}</tbody></DataTable>)
    } else if (line.trim()) blocks.push(<p key={key}>{inline(line)}</p>)
  }
  return <article className="schema-document">{blocks}</article>
}

export function DocumentationPanel({ documents }: { documents: DocumentInfo[] }) {
  const [id, setId] = useState('rhn'), [document, setDocument] = useState<DocumentInfo | null>(null)
  const [query, setQuery] = useState(''), [section, setSection] = useState('all'), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setSection('all')
    request<DocumentInfo>(`document?id=${encodeURIComponent(id)}`).then(data => { if (active) setDocument(data) }).catch(e => { if (active) setError(messageOf(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, retry])
  const sections = (document?.content ?? '').split(/\n(?=## )/).map((text, index) => ({ id: String(index), title: text.split('\n')[0].replace(/^#+\s*/, ''), text }))
  const shown = sections.filter(s => (section === 'all' || s.id === section) && (!query.trim() || s.text.toLowerCase().includes(query.trim().toLowerCase())))
  return <WorkspacePane className="schema-fill-pane" label="设计规范" resetScrollKey={`${id}:${section}:${query}`} header={<>
    <PanelHead title="数据库设计规范" />
    <div className="schema-grid"><Select aria-label="选择设计规范" value={id} onChange={setId} clearable={false} options={documents.map(d => ({ value: d.id, label: d.title, secondaryText: d.scope }))} />
      <Select aria-label="规范章节" value={section} clearable={false} onChange={setSection} options={[{ value: 'all', label: '全部章节' }, ...sections.map(s => ({ value: s.id, label: s.title }))]} /></div>
    <SearchField label="搜索规范内容" value={query} onChange={setQuery} placeholder="查找租户、主键、命名、索引等规范" />
  </>}>
    {loading ? <LoadingState label="正在读取设计规范…" /> : error ? <EmptyState icon="database" title="规范读取失败" copy={error} action={<Button variant="secondary" onClick={() => setRetry(value => value + 1)}>重试读取规范</Button>} /> : <>
      <p className="schema-muted">{document?.scope}<br /><code>{document?.path}</code></p>
      {!shown.length ? <EmptyState icon="search" title="没有匹配章节" copy="请修改搜索词或切换章节。" /> : shown.map(s => <MarkdownDocument key={s.id} text={s.text} />)}
    </>}
  </WorkspacePane>
}
