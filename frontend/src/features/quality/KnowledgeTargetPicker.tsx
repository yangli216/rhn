import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeTarget, KnowledgeReference } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, Pagination, SearchField, Select } from '../../shared/ui'

export function KnowledgeTargetPicker({ api, onClose, onSelect, specificationOnly = false }: { api: RhnApi; onClose: () => void; onSelect: (target: KnowledgeTarget, label: string, reference?: KnowledgeReference) => void; specificationOnly?: boolean }) {
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(0)
  const [entry, setEntry] = useState(''), [level, setLevel] = useState('SPECIFICATION'), [mode, setMode] = useState<'DRUG' | 'CATEGORY'>('DRUG')
  const summary = useQuery({ queryKey: ['knowledge-standard-summary'], queryFn: () => api.masterData.standardMedicationSummary() })
  const entries = useQuery({ queryKey: ['knowledge-standard-search', query, page], queryFn: () => api.masterData.standardMedications(query, '', '', page, 20) })
  const categories = useQuery({ queryKey: ['knowledge-standard-categories', query], queryFn: () => api.masterData.standardMedicationCategories(query), enabled: mode === 'CATEGORY' })
  const detail = useQuery({ queryKey: ['knowledge-standard-detail', entry], queryFn: () => api.masterData.standardMedicationDetail(entry), enabled: !!entry })
  return <Dialog title="从标准参考目录选择药品范围" size="xwide" onClose={onClose} enterNavigation={false}>
    <p>直接引用标准目录，不要求先建立机构药品。标准条目范围覆盖该条目的所有规格，不自动扩展至同成分或同药理类别。</p>
    {[summary.error, entries.error, detail.error, categories.error].filter(Boolean).map((error, index) => <Alert key={index} tone="error">{errorMessage(error)}</Alert>)}
    {!specificationOnly && <Select aria-label="选择方式" clearable={false} value={mode} onChange={v => { setMode(v as 'DRUG' | 'CATEGORY'); setEntry('') }} options={[{ value: 'CATEGORY', label: '按目录分类（如“青霉素类”，覆盖分类下全部药品）' }, { value: 'DRUG', label: '按药品名称或规格' }]} />}
    {mode === 'CATEGORY' && !specificationOnly ? <div className="knowledge-picker__entries">
      <form className="knowledge-toolbar" onSubmit={e => { e.preventDefault(); setQuery(search.trim()) }}><SearchField label="检索目录分类" value={search} onChange={setSearch} placeholder="分类名称，如 青霉素类" /><Button type="submit">检索</Button></form>
      {categories.isPending && <p>正在读取目录分类…</p>}
      {categories.data?.map(c => <Button variant="text" type="button" key={c.key} disabled={!summary.data} onClick={() => { const s = summary.data; if (!s) return
        onSelect({ level: 'CATEGORY', specificationId: '', categoryKey: c.key, catalogId: s.catalogId, catalogVersion: s.catalogVersion, contentHash: s.contentHash }, `${c.label} · 目录分类`); onClose() }}>
        <strong>{c.label}</strong><small>{c.entryIds.length} 个药品 · 选择后覆盖分类下全部药品及规格</small></Button>)}
      {categories.data && !categories.data.length && <p>未找到目录分类，请调整检索条件。</p>}
    </div> : <div className="knowledge-picker">
      <section><form className="knowledge-toolbar" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); setPage(0); setEntry('') }}>
        <SearchField label="检索标准药品" value={search} onChange={setSearch} placeholder="标准名称、编码" /><Button type="submit">检索</Button>
      </form><div className="knowledge-picker__entries">{entries.isPending && <p>正在读取标准目录…</p>}
        {entries.data?.content.map(item => <button type="button" key={item.id} className={entry === item.id ? 'is-selected' : ''} onClick={() => setEntry(item.id)}>
          <strong>{item.name}</strong><small>{item.legacyCode} · {item.specificationCount} 个规格</small></button>)}
        {entries.data && !entries.data.content.length && <p>未找到标准条目，请调整检索条件。</p>}
      </div>{entries.data && <Pagination page={page} pageSize={20} total={entries.data.totalElements} totalPages={Math.max(1, entries.data.totalPages)} onChange={setPage} label="标准药品选择分页" />}</section>
      <section>{!specificationOnly && <Select aria-label="药品范围层级" clearable={false} value={level} onChange={setLevel} options={[{ value: 'SPECIFICATION', label: '仅指定规格' }, { value: 'ENTRY', label: '整个标准条目（所有规格）' }]} />}
        {!entry && <p>选择左侧标准条目，再核对右侧具体规格。</p>}
        {detail.isFetching && <p>正在读取规格…</p>}
        {detail.data && <><h4>{detail.data.name}</h4><p>目录版本：{summary.data?.catalogVersion}</p>
          {!detail.data.specifications.length && <Alert>该条目没有可绑定的标准规格，需先补充标准目录。</Alert>}
          {detail.data.specifications.map(spec => <div className="knowledge-picker__spec" key={spec.id}><div><strong>{spec.doseFormName || spec.doseForm} · {spec.specification}</strong><small>{spec.id}</small></div>
            <Button size="sm" disabled={!summary.data || detail.isFetching} onClick={() => { const s = summary.data; if (!s) return; onSelect({ level, specificationId: spec.id, catalogId: s.catalogId, catalogVersion: s.catalogVersion, contentHash: s.contentHash }, `${detail.data!.name} · ${level === 'ENTRY' ? '全部规格' : spec.specification}`, { catalogId: s.catalogId, catalogVersion: s.catalogVersion, contentHash: s.contentHash, sourceHash: s.source?.sha256 ?? '', entryId: detail.data!.id, specificationId: spec.id, name: detail.data!.name, doseForm: spec.doseForm, preparationSpec: spec.specification }); onClose() }}>选择{level === 'ENTRY' ? '该条目' : '该规格'}</Button></div>)}
        </>}
      </section>
    </div>}
  </Dialog>
}
