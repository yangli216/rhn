import { useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { errorMessage, type RhnApi } from '../rhnApi'
import type { GridAddressNode } from '../api/gridAddressApi'
import { GRID_ADDRESS_LEVELS as LEVELS, gridAddressValueFromPath, inspectGridAddressPath, requireGridAddressOptions, type GridAddressValue } from '../validation/gridAddressFacts'
import { Icon } from './Icon'
import { pinyinInitials } from './pinyinInitials'
import { Button } from './index'

export type { GridAddressValue } from '../validation/gridAddressFacts'

export interface GridAddressInputProps {
  api: Pick<RhnApi['gridAddresses'], 'list'>
  value?: GridAddressValue
  onChange: (value: GridAddressValue, selectedPath: GridAddressNode[]) => void
  levels?: 3 | 5
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
}

interface PopoverPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

export function GridAddressInput({ api, value = {}, onChange, levels = 5, disabled, required,
  className = '', placeholder }: GridAddressInputProps) {
  const controlId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<GridAddressValue>(value)
  const [activeResult, setActiveResult] = useState(0)
  const [position, setPosition] = useState<PopoverPosition>()
  const queryResult = useQuery({
    queryKey: ['grid-address-options', levels],
    queryFn: async () => requireGridAddressOptions(await api.list(levels), levels),
    staleTime: 10 * 60 * 1000,
  })
  const ready = queryResult.isSuccess && !queryResult.isFetching
  const nodes = ready ? queryResult.data : []
  const nodeByCode = useMemo(() => new Map(nodes.map((node) => [node.code, node])), [nodes])
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const visibleLevels = LEVELS.slice(0, levels)
  const selectedFacts = inspectGridAddressPath(value, levels, nodeByCode)
  const selectedPath = selectedFacts.issue ? [] : selectedFacts.path
  const draftFacts = inspectGridAddressPath(draft, levels, nodeByCode, false)
  const draftPath = draftFacts.path
  const hasValue = LEVELS.some(({ key }) => value[key] != null && value[key] !== '')
  const targetLevel = visibleLevels.at(-1)!.level
  const searchResults = useMemo(() => {
    const keyword = normalize(query)
    if (!keyword) return []
    return nodes.filter((node) => node.level === targetLevel && searchable(node).some((text) => normalize(text).includes(keyword)))
  }, [nodes, query, targetLevel])
  const selectedNode = selectedPath.at(-1)
  const unavailable = disabled || !ready
  const selectionIssue = ready ? selectedFacts.issue : undefined
  const valueKey = JSON.stringify(LEVELS.map(({ key }) => value[key] ?? null))

  useEffect(() => {
    if (!open) return
    setDraft(value)
    setQuery('')
    setActiveResult(0)
  }, [open, valueKey, levels])

  useEffect(() => {
    if (!open) return
    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open || unavailable) { setPosition(undefined); return }
    function updatePosition() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const margin = 12
      const gap = 4
      const availableBelow = window.innerHeight - rect.bottom - gap - margin
      const availableAbove = rect.top - gap - margin
      const placement = availableBelow < 320 && availableAbove > availableBelow ? 'top' : 'bottom'
      const availableHeight = placement === 'bottom' ? availableBelow : availableAbove
      const preferredWidth = levels === 5 ? 780 : 520
      const width = Math.min(preferredWidth, window.innerWidth - margin * 2)
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
      setPosition({ left, width, maxHeight: Math.max(260, Math.min(480, availableHeight)),
        top: placement === 'bottom' ? rect.bottom + gap : undefined,
        bottom: placement === 'top' ? window.innerHeight - rect.top + gap : undefined, placement })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [levels, open, unavailable])

  useEffect(() => {
    if (open && position) searchRef.current?.focus()
  }, [open, position])

  useEffect(() => { setActiveResult(0) }, [query])

  function chooseAt(index: number, node: GridAddressNode) {
    if (unavailable) return
    const next = { ...draft }
    for (let cursor = index; cursor < LEVELS.length; cursor += 1) delete next[LEVELS[cursor].key]
    next[visibleLevels[index].key] = node.code
    setDraft(next)
    if (index === visibleLevels.length - 1) commit(next)
  }

  function chooseSearchResult(node: GridAddressNode) {
    if (unavailable) return
    const path: GridAddressNode[] = []
    for (let current: GridAddressNode | undefined = node; current; current = current.parentId ? nodeById.get(current.parentId) : undefined) {
      path.unshift(current)
    }
    const next: GridAddressValue = {}
    path.forEach((item, index) => { if (visibleLevels[index]) next[visibleLevels[index].key] = item.code })
    commit(next)
  }

  function commit(next: GridAddressValue) {
    if (unavailable) return
    const verified = inspectGridAddressPath(next, levels, nodeByCode)
    if (verified.issue || verified.path.length !== levels) return
    onChange(gridAddressValueFromPath(verified.path), verified.path)
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  function clear() {
    if (unavailable) return
    onChange(gridAddressValueFromPath([]), [])
    setDraft({})
    setOpen(false)
    triggerRef.current?.focus()
  }

  return <div ref={containerRef} className={`ui-grid-address-input ${open ? 'is-open' : ''} ${className}`} data-levels={levels}>
    <button ref={triggerRef} id={controlId} type="button" role="combobox" className="ui-grid-address-input__trigger"
      aria-label="网格地址" aria-expanded={open && !unavailable} aria-haspopup="dialog" aria-required={required} aria-busy={!ready}
      aria-invalid={Boolean(selectionIssue || queryResult.isError)} aria-describedby={selectionIssue || queryResult.isError ? `${controlId}-error` : undefined}
      disabled={unavailable} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      }}>
      <span className={`ui-grid-address-input__value ${selectedPath.length ? '' : 'is-placeholder'}`}>
        {queryResult.isPending || queryResult.isFetching ? '正在核实网格地址…' : queryResult.isError ? '网格地址加载失败'
          : selectionIssue ? '已有地址未确认'
          : selectedPath.length ? selectedPath.map((node) => node.name).join(' / ')
            : placeholder ?? (levels === 3 ? '请选择省 / 市 / 县区' : '请选择省 / 市 / 县区 / 街道 / 社区')}
      </span>
      {selectedNode && <code>{selectedNode.code}</code>}
      {queryResult.isFetching ? <span className="ui-spinner" aria-hidden="true" /> : <Icon name="chevron-down" />}
    </button>
    {(queryResult.isError || selectionIssue) && <div id={`${controlId}-error`} role="alert">
      <p>{queryResult.isError ? `网格地址加载失败：${errorMessage(queryResult.error)}` : selectionIssue}</p>
      <Button variant="secondary" disabled={disabled || queryResult.isFetching} onClick={() => void queryResult.refetch()}>重新核实地址目录</Button>
    </div>}

    {open && position && !unavailable && createPortal(<div ref={popoverRef} className="ui-grid-address-input__popover"
      role="dialog" aria-label="选择网格地址" data-placement={position.placement}
      style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
      <label className="ui-grid-address-input__search">
        <span className="visually-hidden">检索网格地址</span><Icon name="search" />
        <input ref={searchRef} value={query} placeholder="搜索名称、12位区划代码或拼音首字母"
          aria-activedescendant={query && searchResults[activeResult] ? `${controlId}-result-${activeResult}` : undefined}
          onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveResult((current) => Math.min(current + 1, searchResults.length - 1)) }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveResult((current) => Math.max(current - 1, 0)) }
            else if (event.key === 'Enter' && !event.nativeEvent.isComposing && searchResults[activeResult]) {
              event.preventDefault(); chooseSearchResult(searchResults[activeResult])
            } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus() }
          }} />
        {query && <button type="button" aria-label="清除检索内容" onClick={() => { setQuery(''); searchRef.current?.focus() }}><Icon name="close" /></button>}
      </label>

      {query ? <div className="ui-grid-address-input__results" role="listbox">
        {searchResults.length === 0 && <div className="ui-grid-address-input__empty">未找到匹配的完整网格地址</div>}
        {searchResults.map((node, index) => <button key={node.id} id={`${controlId}-result-${index}`} type="button" role="option"
          aria-selected={index === activeResult} className={index === activeResult ? 'is-active' : ''}
          onMouseEnter={() => setActiveResult(index)} onClick={() => chooseSearchResult(node)}>
          <span><strong>{node.name}</strong><small>{node.fullPath.replaceAll('/', ' / ')}</small></span><code>{node.code}</code>
        </button>)}
      </div> : <div className="ui-grid-address-input__columns"
        style={{ gridTemplateColumns: `repeat(${visibleLevels.length}, minmax(0, 1fr))` }}>
        {visibleLevels.map((item, index) => {
          const parent = index ? draftPath[index - 1] : undefined
          const parentId = parent?.id
          const options = nodes.filter((node) => node.level === item.level && (index === 0 ? !node.parentId : node.parentId === parentId))
          const enabled = index === 0 || Boolean(parent)
          const isCurrentActive = enabled && !draft[item.key]
          return <section key={item.level} aria-label={item.label} className={isCurrentActive ? 'is-active-level' : ''}>
            <header className={draft[item.key] ? 'is-completed' : isCurrentActive ? 'is-active' : ''}>
              <span>{item.label}</span>
              <small>{index + 1}/{levels}</small>
            </header>
            <div role="listbox" aria-label={`${item.label}选项`}>
              {!enabled && <p className="ui-grid-address-input__placeholder">请先选择{visibleLevels[index - 1].label}</p>}
              {enabled && options.length === 0 && <p className="ui-grid-address-input__placeholder">暂无下级区划</p>}
              {enabled && options.map((node) => {
                const selected = draft[item.key] === node.code
                return <button key={node.id} type="button" role="option" aria-selected={selected}
                  title={node.name}
                  className={selected ? 'is-selected' : ''} onClick={() => chooseAt(index, node)}>
                  <span>{node.name}</span>{index === levels - 1 ? <Icon name="check" /> : <Icon name="chevron-right" />}
                </button>
              })}
            </div>
          </section>
        })}
      </div>}

      <footer><span>{draftFacts.issue ?? (draftPath.length ? draftPath.map((node) => node.name).join(' / ') : `请选择到${levels === 3 ? '县区' : '社区村'}层级`)}</span>
        {hasValue && <button type="button" onClick={clear}>清空选择</button>}</footer>
    </div>, document.body)}
  </div>
}

function searchable(node: GridAddressNode) {
  return [node.name, node.shortName ?? '', node.code, node.pinyinCode, node.fullPath, pinyinInitials(node.name), pinyinInitials(node.fullPath)]
}

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s/]+/g, '')
}
