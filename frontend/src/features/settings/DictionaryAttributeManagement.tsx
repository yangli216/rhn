import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, EmptyState, Icon, LoadingState, PageHeader, Panel, PanelHead, StatusBadge,
} from '../../shared/ui'
import { DictionaryAttributeConfiguration } from './DictionaryAttributeConfiguration'
import type { DictionaryAttributeContext } from './DictionaryAttributeConfiguration'

export function DictionaryAttributeManagement({ api, context, onNavigate }: {
  api: RhnApi
  context: DictionaryAttributeContext
  onNavigate: (path: string) => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState('')
  const selectedId = searchParams.get('dictionaryId') ?? ''
  const dictionaries = useQuery({
    queryKey: ['dictionary-attribute-catalog', query],
    queryFn: () => api.dictionaries.list(query, '', '', ''),
  })
  const detail = useQuery({
    queryKey: ['dictionary', selectedId],
    queryFn: () => api.dictionaries.get(selectedId),
    enabled: Boolean(selectedId),
  })

  useEffect(() => {
    const values = dictionaries.data ?? []
    if (!values.length || values.some((value) => value.id === selectedId)) return
    setSearchParams({ dictionaryId: values[0].id }, { replace: true })
  }, [dictionaries.data, selectedId, setSearchParams])

  const selectedSummary = useMemo(() => dictionaries.data?.find((value) => value.id === selectedId),
    [dictionaries.data, selectedId])
  const current = detail.data
  const queryError = dictionaries.error || detail.error

  return <>
    <PageHeader eyebrow="平台管理 · 扩展能力" title="字典扩展配置"
      description="独立维护字典扩展属性定义及各字典项在全局、租户、机构、科室层级的业务配置。"
      actions={<Button variant="secondary" onClick={() => onNavigate('/settings/dictionaries')}>
        返回字典管理
      </Button>} />

    {feedback && <Alert tone="success" className="dictionary-feedback">{feedback}</Alert>}
    {queryError && <Alert className="dictionary-feedback">{errorMessage(queryError)}</Alert>}

    <section className="dictionary-attribute-workspace">
      <Panel className="dictionary-catalog dictionary-attribute-catalog">
        <PanelHead title="适用字典" meta={`${dictionaries.data?.length ?? 0} 个`} />
        <div className="dictionary-attribute-catalog__search">
          <label className="dictionary-search">
            <span className="visually-hidden">搜索适用字典</span><Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索字典名称或编码" />
          </label>
        </div>
        <div className="dictionary-catalog__list" role="listbox" aria-label="扩展配置适用字典">
          {dictionaries.isPending && <LoadingState label="正在加载字典…" />}
          {dictionaries.data?.map((dictionary) => <button key={dictionary.id} type="button" role="option"
            aria-selected={dictionary.id === selectedId}
            className={`dictionary-card ${dictionary.id === selectedId ? 'is-selected' : ''}`}
            onClick={() => {
              setSearchParams({ dictionaryId: dictionary.id })
              setFeedback('')
            }}>
            <span className="dictionary-card__icon"><Icon name="settings" /></span>
            <span className="dictionary-card__content">
              <span className="dictionary-card__title"><strong>{dictionary.name}</strong>
                <StatusBadge tone={dictionary.sdDictStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                  {dictionary.sdDictStatusText}
                </StatusBadge></span>
              <code>{dictionary.code}</code>
              <small>{dictionary.categoryName} · {dictionary.itemCount} 个字典项</small>
            </span><Icon name="chevron-right" />
          </button>)}
          {!dictionaries.isPending && dictionaries.data?.length === 0 && <EmptyState icon="search"
            title="未找到匹配字典" copy="请调整名称或编码检索条件。" />}
        </div>
      </Panel>

      <Panel className="dictionary-attribute-detail">
        {detail.isPending && selectedId && <LoadingState label="正在加载扩展配置…" />}
        {!current && !detail.isPending && <EmptyState icon="settings" title="请选择字典"
          copy="从左侧选择字典后，可维护属性定义及字典项属性值。" />}
        {current && <>
          <header className="dictionary-detail__head dictionary-attribute-detail__head">
            <div>
              <div className="dictionary-detail__title-row"><h2>{current.name}</h2>
                {current.systemManaged && <StatusBadge>系统托管</StatusBadge>}
                <StatusBadge tone={current.sdDictStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                  {current.sdDictStatusText}
                </StatusBadge></div>
              <code>{current.code}</code>
              <p>先定义扩展属性，再为具体字典项配置不同业务层级下的实际值。</p>
            </div>
            <Button size="sm" variant="secondary"
              onClick={() => onNavigate(`/settings/dictionaries?dictionaryId=${current.id}`)}>维护字典内容</Button>
          </header>
          <dl className="dictionary-facts">
            <div><dt>所属分类</dt><dd>{current.categoryName}</dd></div>
            <div><dt>适用范围</dt><dd>{current.sdDictScopeTypeText}</dd></div>
            <div><dt>字典项</dt><dd>{current.items.length}</dd></div>
            <div><dt>当前修订号</dt><dd>{current.revision}</dd></div>
          </dl>
          <DictionaryAttributeConfiguration api={api} dictionary={current} items={current.items} context={context}
            onChanged={(message) => setFeedback(message)} />
        </>}
      </Panel>
    </section>
  </>
}
