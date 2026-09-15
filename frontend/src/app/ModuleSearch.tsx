import { useEffect, useRef, useState } from 'react'
import { IconButton, Dialog, Icon, type IconName } from '../shared/ui'
import './module-search.css'

type SearchNode = { id: string; label: string; to?: string; icon?: IconName; children?: SearchNode[] }
type SearchEntry = { id: string; label: string; to: string; icon?: IconName; category: string }

export function searchableModules(nodes: SearchNode[], parents: string[] = []): SearchEntry[] {
  return nodes.flatMap((node) => node.children
    ? searchableModules(node.children, [...parents, node.label])
    : node.to ? [{ id: node.id, label: node.label, to: node.to, icon: node.icon, category: parents.join(' / ') || '工作门户' }] : [])
}

export function ModuleSearch({ nodes, onNavigate }: { nodes: SearchNode[]; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const results = searchableModules(nodes).filter((entry) => terms.every((term) =>
    `${entry.label} ${entry.category}`.toLocaleLowerCase().includes(term)))

  function showSearch() { setQuery(''); setOpen(true) }
  function select(path: string) { setOpen(false); onNavigate(path) }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
        if (document.querySelector('[role="dialog"]')) return
        event.preventDefault()
        showSearch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return <>
    <IconButton icon="search" label="搜索模块" onClick={showSearch} title="搜索模块（Ctrl / ⌘ K）" />
    {open && <Dialog title="搜索模块" description="按模块名称或所属分类查找，点击结果即可进入。仅显示当前可访问的模块。"
      onClose={() => setOpen(false)} initialFocusRef={inputRef} enterNavigation={false} size="wide">
      <input className="module-search-input" ref={inputRef} type="search" aria-label="模块名称或分类" placeholder="例如：统计、门诊、药房、收费"
        value={query} onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && results.length) {
            event.preventDefault(); select(results[0].to)
          }
        }} />
      <p className="module-search-summary" role="status">找到 {results.length} 个模块 · 回车打开首项，Tab 选择，Esc 关闭</p>
      <div className="module-search-results">
        {results.map((entry) => <button className="module-search-result" type="button" key={entry.id}
          onClick={() => select(entry.to)}>
          <Icon name={entry.icon ?? 'roadmap'} />
          <span><strong>{entry.label}</strong><small>{entry.category}</small></span>
          <Icon name="chevron-right" />
        </button>)}
        {!results.length && <p className="module-search-empty">没有找到匹配模块，请尝试更短的名称或其他分类。</p>}
      </div>
    </Dialog>}
  </>
}
