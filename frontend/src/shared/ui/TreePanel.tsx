import {
  IconChevronRight, IconEdit, IconFile, IconFolder, IconFolderOpen,
  IconGripVertical, IconPlus, IconSearch, IconSortAscending, IconTrash,
} from '@tabler/icons-react'
import {
  useEffect, useMemo, useRef, useState,
  type DragEvent, type KeyboardEvent,
} from 'react'

export interface TreePanelNode {
  id: string
  parentId?: string
  label: string
  keywords?: string[]
  secondaryText?: string
  disabled?: boolean
  inactive?: boolean
}

export interface TreePanelMove {
  nodeId: string
  parentId?: string
  index: number
}

export interface TreePanelProps {
  title: string
  nodes: TreePanelNode[]
  selectedId?: string
  rootLabel?: string
  searchPlaceholder?: string
  emptyText?: string
  busy?: boolean
  onSelect?: (id?: string) => void
  onAdd?: (parentId?: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onMove?: (move: TreePanelMove) => void | Promise<void>
}

const ROOT_ID = '__tree_panel_root__'

export function TreePanel({
  title,
  nodes,
  selectedId,
  rootLabel = '全部',
  searchPlaceholder = '搜索名称或编码',
  emptyText = '暂无树节点',
  busy = false,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onMove,
}: TreePanelProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => parentNodeIds(nodes))
  const [sortMode, setSortMode] = useState(false)
  const [focusedId, setFocusedId] = useState(selectedId ?? ROOT_ID)
  const [draggingId, setDraggingId] = useState<string>()
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition }>()
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const childrenByParent = useMemo(() => buildChildren(nodes), [nodes])
  const matchingIds = useMemo(() => matchTree(nodes, childrenByParent, query), [childrenByParent, nodes, query])
  const visibleRows = useMemo(() => flattenVisible(
    childrenByParent,
    query ? parentNodeIds(nodes) : expanded,
    matchingIds,
  ), [childrenByParent, expanded, matchingIds, nodes, query])
  const navigableIds = [ROOT_ID, ...visibleRows.map((row) => row.node.id)]

  useEffect(() => {
    setExpanded((current) => new Set([...current, ...parentNodeIds(nodes)]))
  }, [nodes])

  useEffect(() => {
    if (focusedId !== ROOT_ID && !nodeById.has(focusedId)) setFocusedId(ROOT_ID)
  }, [focusedId, nodeById])

  function focusRow(id: string) {
    setFocusedId(id)
    requestAnimationFrame(() => rowRefs.current.get(id)?.focus())
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function move(moveRequest: TreePanelMove) {
    if (!onMove || busy || invalidMove(moveRequest.nodeId, moveRequest.parentId, childrenByParent)) return
    await onMove(moveRequest)
    setFocusedId(moveRequest.nodeId)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, id: string) {
    const index = navigableIds.indexOf(id)
    if (event.altKey && sortMode && id !== ROOT_ID && onMove) {
      const node = nodeById.get(id)
      if (!node) return
      const siblings = childrenByParent.get(node.parentId ?? '') ?? []
      const siblingIndex = siblings.findIndex((item) => item.id === id)
      if (event.key === 'ArrowUp' && siblingIndex > 0) {
        event.preventDefault(); void move({ nodeId: id, parentId: node.parentId, index: siblingIndex - 1 }); return
      }
      if (event.key === 'ArrowDown' && siblingIndex < siblings.length - 1) {
        event.preventDefault(); void move({ nodeId: id, parentId: node.parentId, index: siblingIndex + 1 }); return
      }
      if (event.key === 'ArrowRight' && siblingIndex > 0) {
        const previous = siblings[siblingIndex - 1]
        event.preventDefault(); setExpanded((current) => new Set(current).add(previous.id))
        void move({ nodeId: id, parentId: previous.id, index: (childrenByParent.get(previous.id) ?? []).length }); return
      }
      if (event.key === 'ArrowLeft' && node.parentId) {
        const parent = nodeById.get(node.parentId)
        const parentSiblings = childrenByParent.get(parent?.parentId ?? '') ?? []
        event.preventDefault(); void move({
          nodeId: id,
          parentId: parent?.parentId,
          index: Math.max(0, parentSiblings.findIndex((item) => item.id === node.parentId) + 1),
        }); return
      }
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? navigableIds.length - 1
        : event.key === 'ArrowDown' ? Math.min(navigableIds.length - 1, index + 1) : Math.max(0, index - 1)
      focusRow(navigableIds[nextIndex]); return
    }
    const children = id === ROOT_ID ? childrenByParent.get('') ?? [] : childrenByParent.get(id) ?? []
    if (event.key === 'ArrowRight' && children.length) {
      event.preventDefault()
      if (id !== ROOT_ID && !expanded.has(id)) toggle(id)
      else focusRow(children[0].id)
      return
    }
    if (event.key === 'ArrowLeft' && id !== ROOT_ID) {
      event.preventDefault()
      if (children.length && expanded.has(id)) toggle(id)
      else focusRow(nodeById.get(id)?.parentId ?? ROOT_ID)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); onSelect?.(id === ROOT_ID ? undefined : id)
    }
  }

  function dragOver(event: DragEvent<HTMLDivElement>, id: string) {
    if (!sortMode || !draggingId || busy) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / rect.height
    const position: DropPosition = id === ROOT_ID ? 'inside' : ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside'
    const request = dropMove(draggingId, id, position, nodeById, childrenByParent)
    if (request && !invalidMove(request.nodeId, request.parentId, childrenByParent)) setDropTarget({ id, position })
    else setDropTarget(undefined)
  }

  function drop(event: DragEvent<HTMLDivElement>, id: string) {
    event.preventDefault()
    if (!draggingId || !dropTarget || dropTarget.id !== id) return
    const request = dropMove(draggingId, id, dropTarget.position, nodeById, childrenByParent)
    if (request) void move(request)
    setDraggingId(undefined); setDropTarget(undefined)
  }

  const hasResults = visibleRows.length > 0
  return <section className={`ui-tree-panel ${sortMode ? 'is-sorting' : ''}`} aria-label={title}>
    <header className="ui-tree-panel__head">
      <h3>{title}</h3>
      <div className="ui-tree-panel__actions" aria-label={`${title}操作`}>
        {onAdd && <TreeAction label="新增节点" disabled={busy} onClick={() => onAdd(selectedId)}><IconPlus /></TreeAction>}
        {onEdit && <TreeAction label="编辑节点" disabled={busy || !selectedId} onClick={() => selectedId && onEdit(selectedId)}><IconEdit /></TreeAction>}
        {onDelete && <TreeAction label="删除节点" disabled={busy || !selectedId} onClick={() => selectedId && onDelete(selectedId)}><IconTrash /></TreeAction>}
        {onMove && <TreeAction label={sortMode ? '结束排序' : '拖拽排序'} pressed={sortMode} disabled={busy}
          onClick={() => setSortMode((current) => !current)}><IconSortAscending /></TreeAction>}
      </div>
    </header>
    <label className="ui-tree-panel__search">
      <span className="visually-hidden">搜索树节点</span><IconSearch aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />
      {query && <button type="button" onClick={() => setQuery('')}>清空</button>}
    </label>
    {sortMode && <p className="ui-tree-panel__sort-hint">拖动节点调整层级和顺序；键盘可使用 Alt + 方向键。</p>}
    <div className="ui-tree-panel__tree" role="tree" aria-label={`${title}树`} aria-busy={busy || undefined}>
      <div ref={(node) => setRowRef(rowRefs.current, ROOT_ID, node)} role="treeitem" aria-level={1}
        aria-expanded="true" aria-selected={!selectedId} tabIndex={focusedId === ROOT_ID ? 0 : -1}
        className={`ui-tree-panel__row is-root ${!selectedId ? 'is-selected' : ''} ${dropClass(dropTarget, ROOT_ID)}`}
        onFocus={() => setFocusedId(ROOT_ID)} onKeyDown={(event) => handleKeyDown(event, ROOT_ID)}
        onClick={() => onSelect?.(undefined)} onDragOver={(event) => dragOver(event, ROOT_ID)} onDrop={(event) => drop(event, ROOT_ID)}>
        <span className="ui-tree-panel__indent" aria-hidden="true" />
        <span className="ui-tree-panel__chevron is-open"><IconChevronRight /></span>
        <IconFolderOpen className="ui-tree-panel__node-icon" aria-hidden="true" />
        <span className="ui-tree-panel__label"><strong>{rootLabel}</strong><small>{nodes.length} 项</small></span>
      </div>
      {hasResults && visibleRows.map(({ node, depth }) => {
        const children = childrenByParent.get(node.id) ?? []
        const isExpanded = query ? true : expanded.has(node.id)
        const selected = node.id === selectedId
        return <div key={node.id} ref={(element) => setRowRef(rowRefs.current, node.id, element)}
          role="treeitem" aria-level={depth + 2} aria-expanded={children.length ? isExpanded : undefined}
          aria-selected={selected} aria-disabled={node.disabled || undefined} tabIndex={focusedId === node.id ? 0 : -1}
          data-tree-node-id={node.id} draggable={sortMode && !busy && !node.disabled}
          className={`ui-tree-panel__row ${selected ? 'is-selected' : ''} ${node.inactive ? 'is-inactive' : ''} ${draggingId === node.id ? 'is-dragging' : ''} ${dropClass(dropTarget, node.id)}`}
          style={{ '--tree-depth': depth } as React.CSSProperties}
          onFocus={() => setFocusedId(node.id)} onKeyDown={(event) => handleKeyDown(event, node.id)}
          onClick={() => !node.disabled && onSelect?.(node.id)}
          onDragStart={(event) => { setDraggingId(node.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', node.id) }}
          onDragEnd={() => { setDraggingId(undefined); setDropTarget(undefined) }}
          onDragOver={(event) => dragOver(event, node.id)} onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(undefined)
          }} onDrop={(event) => drop(event, node.id)}>
          <span className="ui-tree-panel__indent" aria-hidden="true" />
          {children.length ? <button type="button" className={`ui-tree-panel__chevron ${isExpanded ? 'is-open' : ''}`}
            aria-label={isExpanded ? `收起${node.label}` : `展开${node.label}`} onClick={(event) => { event.stopPropagation(); toggle(node.id) }}>
            <IconChevronRight /></button> : <span className="ui-tree-panel__chevron" aria-hidden="true" />}
          {children.length ? (isExpanded ? <IconFolderOpen className="ui-tree-panel__node-icon" /> : <IconFolder className="ui-tree-panel__node-icon" />)
            : <IconFile className="ui-tree-panel__node-icon is-leaf" />}
          <span className="ui-tree-panel__label"><strong>{node.label}</strong>{node.secondaryText && <small>{node.secondaryText}</small>}</span>
          {node.inactive && <span className="ui-tree-panel__badge">已停用</span>}
          {sortMode && <span className="ui-tree-panel__grip" title="拖动排序"><IconGripVertical /></span>}
        </div>
      })}
      {!hasResults && <div className="ui-tree-panel__empty">{query ? '未找到匹配节点' : emptyText}</div>}
    </div>
  </section>
}

type DropPosition = 'before' | 'inside' | 'after'

function TreeAction({ label, pressed, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  pressed?: boolean
}) {
  return <button type="button" className="ui-tree-panel__action" aria-label={label} title={label}
    aria-pressed={pressed} {...props}>{children}</button>
}

function buildChildren(nodes: TreePanelNode[]) {
  const result = new Map<string, TreePanelNode[]>()
  for (const node of nodes) {
    const key = node.parentId ?? ''
    result.set(key, [...(result.get(key) ?? []), node])
  }
  return result
}

function parentNodeIds(nodes: TreePanelNode[]) {
  const parentIds = new Set(nodes.map((node) => node.parentId).filter((value): value is string => Boolean(value)))
  return parentIds
}

function matchTree(nodes: TreePanelNode[], childrenByParent: Map<string, TreePanelNode[]>, query: string) {
  if (!query.trim()) return new Set(nodes.map((node) => node.id))
  const normalized = query.trim().toLocaleLowerCase()
  const direct = new Set(nodes.filter((node) => [node.label, node.secondaryText, ...(node.keywords ?? [])]
    .filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(normalized))).map((node) => node.id))
  const visible = new Set(direct)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const id of direct) {
    let parentId = byId.get(id)?.parentId
    while (parentId) { visible.add(parentId); parentId = byId.get(parentId)?.parentId }
    addDescendants(id, childrenByParent, visible)
  }
  return visible
}

function addDescendants(id: string, childrenByParent: Map<string, TreePanelNode[]>, result: Set<string>) {
  for (const child of childrenByParent.get(id) ?? []) { result.add(child.id); addDescendants(child.id, childrenByParent, result) }
}

function flattenVisible(childrenByParent: Map<string, TreePanelNode[]>, expanded: Set<string>, matchingIds: Set<string>) {
  const result: Array<{ node: TreePanelNode; depth: number }> = []
  const visit = (parentId: string, depth: number) => {
    for (const node of childrenByParent.get(parentId) ?? []) {
      if (!matchingIds.has(node.id)) continue
      result.push({ node, depth })
      if (expanded.has(node.id)) visit(node.id, depth + 1)
    }
  }
  visit('', 0)
  return result
}

function invalidMove(nodeId: string, parentId: string | undefined, childrenByParent: Map<string, TreePanelNode[]>) {
  if (!parentId) return false
  if (nodeId === parentId) return true
  const descendants = new Set<string>()
  addDescendants(nodeId, childrenByParent, descendants)
  return descendants.has(parentId)
}

function dropMove(sourceId: string, targetId: string, position: DropPosition,
  nodeById: Map<string, TreePanelNode>, childrenByParent: Map<string, TreePanelNode[]>): TreePanelMove | undefined {
  if (targetId === ROOT_ID) return { nodeId: sourceId, parentId: undefined, index: (childrenByParent.get('') ?? []).length }
  const target = nodeById.get(targetId)
  if (!target) return undefined
  if (position === 'inside') return { nodeId: sourceId, parentId: target.id, index: (childrenByParent.get(target.id) ?? []).length }
  const siblings = childrenByParent.get(target.parentId ?? '') ?? []
  const targetIndex = siblings.findIndex((node) => node.id === target.id)
  return { nodeId: sourceId, parentId: target.parentId, index: targetIndex + (position === 'after' ? 1 : 0) }
}

function dropClass(target: { id: string; position: DropPosition } | undefined, id: string) {
  return target?.id === id ? `is-drop-${target.position}` : ''
}

function setRowRef(map: Map<string, HTMLDivElement>, id: string, node: HTMLDivElement | null) {
  if (node) map.set(id, node)
  else map.delete(id)
}
