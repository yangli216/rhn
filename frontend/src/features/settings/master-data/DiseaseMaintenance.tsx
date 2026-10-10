import { diseaseMemberEditorScope, diseaseMemberPageSize, requireDiseaseMemberSearchPage, type DiseaseMemberCandidate } from "../diseaseMemberSearchFacts";
import { prepareDiseaseScopeSave, requireDiseaseScopeReceipt } from "../diseaseScopeReceipt";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { errorMessage, type DiseaseConcept, type DiseaseInput, type DiseaseManagementProgram, type DiseaseManagementProgramInput, type DiseaseManagementRule, type DiseaseManagementExceptionInput, type CodeSystemSummary, type MasterDataStatus, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from "../../../shared/ui";
import { Table, DataStatus, RowActions, type DictionaryMap, today, DataFormDialog, text, optionalText, FormSection, FormGrid, StaticSelectField, SelectField, optionalNumber, DateRangeFields, options } from './masterDataShared'

export function DiseaseTable({ values, loading, pagination, onEdit, onStatus }: { values?: DiseaseConcept[]; loading: boolean;
  pagination: ReactNode;
  onEdit: (value: DiseaseConcept) => void; onStatus: (value: DiseaseConcept) => void }) {
  if (loading) return <LoadingState label="正在加载疾病术语…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到疾病概念" copy="请调整筛选条件或新增疾病概念。" />
  return <Table headers={['疾病概念', '标准编码', '诊断体系 / 类型', '管理标识', '别名', '状态', '操作']}
    footer={pagination}>
    {values.map((value) => <tr key={value.id}><td><strong>{value.display}</strong><small>{value.shortDisplay || value.definition || '—'}</small></td>
      <td><code>{value.code}</code><small>{value.systemName} · {value.systemVersion}</small></td>
      <td><strong>{value.sdDiagnosisDomainText}</strong><small>{value.sdConceptTypeText} · {value.chapterName || '未分类'}</small></td>
      <td>{value.managementPrograms.length ? value.managementPrograms.map((item) => <StatusBadge key={item.id}
        tone={item.sdManagementType === 'DISEASE_REPORT' ? 'warning' : 'success'}>{item.name}</StatusBadge>) : '—'}</td>
      <td>{value.aliases.slice(0, 2).map((item) => item.name).join('、') || '—'}</td>
      <td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td>
      <td><RowActions><Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑</Button>
        <Button size="sm" variant="text" onClick={() => onStatus(value)}>{value.sdStatus === 'ACTIVE' ? '暂停' : '启用'}</Button></RowActions></td></tr>)}
  </Table>
}

export function DiseaseManagementTable({ values, loading, pagination, onEdit, onMembers, onStatus }: {
  values?: DiseaseManagementProgram[]; loading: boolean; pagination: ReactNode
  onEdit: (value: DiseaseManagementProgram) => void
  onMembers: (value: DiseaseManagementProgram) => void
  onStatus: (value: DiseaseManagementProgram) => void
}) {
  if (loading) return <LoadingState label="正在加载疾病管理项目…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到疾病管理项目"
    copy="请新增慢病管理、疾病报告或专项登记项目。" />
  return <Table headers={['管理项目', '类别 / 触发动作', '适用疾病', '报卡要求', '有效期 / 状态', '操作']}
    footer={pagination}>
    {values.map((value) => <tr key={value.id}>
      <td><strong>{value.name}</strong><code>{value.code}</code><small>{value.description || '未填写说明'}</small></td>
      <td><StatusBadge tone={value.sdManagementType === 'DISEASE_REPORT' ? 'warning' : 'success'}>
        {value.sdManagementTypeText}</StatusBadge><small>{value.sdTriggerActionText}</small></td>
      <td><strong>{value.ruleCount} 条规则</strong><small>{value.exceptionCount
        ? `${value.exceptionCount} 个精确例外` : value.ruleCount ? '按规则自动识别，无精确例外' : '尚未配置适用范围'}</small></td>
      <td>{reportCardTypeLabel(value.reportCardType)}<small>{value.reportDeadlineHours
        ? `${value.reportDeadlineHours} 小时内` : value.sdManagementType === 'DISEASE_REPORT' ? '按适用规则确认' : '—'}</small></td>
      <td><DataStatus value={value.sdStatus} text={value.sdStatusText} />
        <small>{value.effectiveFrom} 至 {value.effectiveTo || '长期'}</small></td>
      <td><RowActions><Button size="sm" variant="text" onClick={() => onMembers(value)}>配置识别范围</Button>
        <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑规则</Button>
        <Button size="sm" variant="text" onClick={() => onStatus(value)}>
          {value.sdStatus === 'ACTIVE' ? '暂停' : '启用'}</Button></RowActions></td>
    </tr>)}
  </Table>
}

export function reportCardTypeLabel(value?: string) {
  if (!value) return '不适用'
  const labels: Record<string, string> = { INFECTIOUS_DISEASE: '传染病报告卡' }
  return labels[value] ?? value
}

export function DiseaseDialog({ dictionaries, codeSystems, value, onClose, onSave }: { dictionaries: DictionaryMap;
  codeSystems: Array<{ id: string; name: string; version: string }>; value?: DiseaseConcept; onClose: () => void;
  onSave: (input: DiseaseInput) => void }) {
  const [aliases, setAliases] = useState(value?.aliases.map((item) => item.name).join('、') ?? '')
  const [effectiveFrom, setEffectiveFrom] = useState(value?.effectiveFrom ?? today())
  return <DataFormDialog title={value ? '编辑疾病概念' : '新增疾病概念'} eyebrow="疾病与临床术语" onClose={onClose}
    size="xwide" description="先确认标准身份，再补充目录与检索信息；标准编码和编码体系创建后不可修改。"
    onSubmit={(form) => onSave({ codeSystemId: value?.codeSystemId || text(form, 'codeSystemId'), code: (value?.code || text(form, 'code')).trim(),
      display: text(form, 'display'), shortDisplay: optionalText(form, 'shortDisplay'),
      sdConceptType: text(form, 'sdConceptType'), chapterCode: optionalText(form, 'chapterCode'),
      chapterName: optionalText(form, 'chapterName'), definition: optionalText(form, 'definition'),
      searchCode: optionalText(form, 'searchCode'), effectiveFrom: text(form, 'effectiveFrom'),
      effectiveTo: optionalText(form, 'effectiveTo'), sdStatus: (value?.sdStatus ?? 'ACTIVE') as MasterDataStatus,
      aliases: aliases.split(/[、,，;；\n]/).map((item) => item.trim()).filter(Boolean) })}>
    <FormSection title="标准身份" description="确定概念的权威来源、唯一编码和临床类型。">
      <FormGrid columns={3}>
        <StaticSelectField name="codeSystemId" label="编码体系" disabled={Boolean(value)}
          options={codeSystems.map((item) => ({ value: item.id, label: `${item.name} · ${item.version}` }))}
          defaultValue={value?.codeSystemId ?? codeSystems[0]?.id} />
        <FormField label="标准编码" required><input name="code" defaultValue={value?.code}
          disabled={Boolean(value)} placeholder="如 M54.5" autoFocus={!value} required /></FormField>
        {value && <input type="hidden" name="code" value={value.code} />}
        <SelectField name="sdConceptType" label="概念类型" values={dictionaries.BD_CONCEPT_TYPE}
          defaultValue={value?.sdConceptType ?? 'DISEASE'} />
        <FormField label="规范名称" required className="span-2"><input name="display" defaultValue={value?.display}
          placeholder="录入标准规范名称" required /></FormField>
        <FormField label="简称"><input name="shortDisplay" defaultValue={value?.shortDisplay}
          placeholder="用于空间受限的场景" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="目录与检索" description="章节用于目录治理，别名和检索码用于提升检索召回。">
      <FormGrid columns={3}>
        <FormField label="章节编码"><input name="chapterCode" defaultValue={value?.chapterCode}
          placeholder="如 XIII" /></FormField>
        <FormField label="章节名称"><input name="chapterName" defaultValue={value?.chapterName}
          placeholder="如 肌肉骨骼系统疾病" /></FormField>
        <FormField label="检索码" hint="支持拼音首字母"><input name="searchCode" defaultValue={value?.searchCode}
          placeholder="如 YT" /></FormField>
        <FormField label="同义词 / 旧名" className="span-3"
          hint="用顿号或逗号分隔；可命中检索，但不会覆盖规范名称">
          <input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="如 腰部疼痛、下背痛" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="有效期与说明" description="失效日期为空表示持续有效；结束日期不能早于生效日期。">
      <FormGrid>
        <FormField label="生效日期" required><input name="effectiveFrom" type="date" value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)} required /></FormField>
        <FormField label="失效日期"><input name="effectiveTo" type="date" defaultValue={value?.effectiveTo}
          min={effectiveFrom} /></FormField>
        <FormField label="定义说明" className="span-2"><textarea name="definition" defaultValue={value?.definition}
          placeholder="说明概念边界、纳入条件或与相近概念的区别" rows={3} /></FormField>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}

export function DiseaseManagementProgramDialog({ dictionaries, value, onClose, onSave }: {
  dictionaries: DictionaryMap; value?: DiseaseManagementProgram; onClose: () => void
  onSave: (input: DiseaseManagementProgramInput) => void
}) {
  return <DataFormDialog title={value ? '编辑疾病管理项目' : '新增疾病管理项目'} eyebrow="疾病管理分类"
    size="xwide" onClose={onClose}
    description="管理项目可以关联多个疾病；诊断命中后只生成受控提示或草稿，不会静默完成纳管和上报。"
    onSubmit={(form) => onSave({ productScope: value?.scopeType === 'PRODUCT',
      code: (value?.code || text(form, 'code')).trim(), name: text(form, 'name'),
      sdManagementType: text(form, 'sdManagementType') as DiseaseManagementProgramInput['sdManagementType'],
      sdTriggerAction: text(form, 'sdTriggerAction') as DiseaseManagementProgramInput['sdTriggerAction'],
      description: optionalText(form, 'description'), reportCardType: optionalText(form, 'reportCardType'),
      reportDeadlineHours: optionalNumber(form, 'reportDeadlineHours'), effectiveFrom: text(form, 'effectiveFrom'),
      effectiveTo: optionalText(form, 'effectiveTo') })}>
    <FormSection title="项目身份" description="项目编码创建后不可修改；租户项目只在当前租户内生效。">
      <FormGrid columns={3}>
        <FormField label="项目编码" required><input name="code" defaultValue={value?.code}
          disabled={Boolean(value)} placeholder="如 CHRONIC_COPD" required /></FormField>
        {value && <input type="hidden" name="code" value={value.code} />}
        <FormField label="项目名称" required className="span-2"><input name="name" defaultValue={value?.name}
          placeholder="如 慢阻肺慢病管理" required /></FormField>
        <SelectField name="sdManagementType" label="管理类别" values={dictionaries.BD_DISEASE_MANAGEMENT_TYPE}
          defaultValue={value?.sdManagementType ?? 'CHRONIC_CARE'} />
        <SelectField name="sdTriggerAction" label="诊断触发动作" values={dictionaries.BD_DISEASE_TRIGGER_ACTION}
          defaultValue={value?.sdTriggerAction ?? 'PROMPT_CONFIRMATION'} />
        <FormField label="当前作用域"><input value={value?.scopeType === 'PRODUCT' ? '平台公共' : '当前租户'} disabled /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="报告与有效期" description="疾病报告信息为空时，由医生按当前适用规则确认具体时限。">
      <FormGrid columns={3}>
        <FormField label="报卡类型"><input name="reportCardType" defaultValue={value?.reportCardType}
          placeholder="如 INFECTIOUS_DISEASE" /></FormField>
        <FormField label="报告时限（小时）"><input name="reportDeadlineHours" type="number" min="1"
          defaultValue={value?.reportDeadlineHours} placeholder="按规则选填" /></FormField>
        <span />
        <DateRangeFields fromName="effectiveFrom" toName="effectiveTo" fromLabel="生效日期" toLabel="失效日期"
          fromDefault={value?.effectiveFrom} toDefault={value?.effectiveTo} />
        <FormField label="规则说明" className="span-3"><textarea name="description" rows={3}
          defaultValue={value?.description} placeholder="说明纳入条件、人工确认边界和后续责任岗位" /></FormField>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}

export type EditableDiseaseRule = DiseaseManagementRule & { key: string }

export interface DiseaseManagementMembersProps {
  program: DiseaseManagementProgram; api: RhnApi; dictionaries: DictionaryMap; codeSystems: CodeSystemSummary[]
  onClose: () => void
  onSave: (rules: DiseaseManagementRule[], exceptions: DiseaseManagementExceptionInput[]) => Promise<unknown>
  onSaved?: () => void
}

export function DiseaseManagementMembersDialog(props: DiseaseManagementMembersProps) {
  return <DiseaseManagementMembersEditor key={diseaseMemberEditorScope(props.api, props.program.id, props.program.revision)} {...props} />
}

export function DiseaseManagementMembersEditor({ program, api, dictionaries, codeSystems, onClose, onSave, onSaved }: DiseaseManagementMembersProps) {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('')
  const [page, setPage] = useState(0)
  const [session] = useState(() => crypto.randomUUID())
  const [attempt, setAttempt] = useState(0)
  const [selectionError, setSelectionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const saveLock = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const [rules, setRules] = useState<EditableDiseaseRule[]>(() => program.rules.map((rule) => ({
    ...rule, key: rule.id ?? crypto.randomUUID(),
  })))
  const [exceptions, setExceptions] = useState(() => new Map(program.members.map((item) => [item.conceptId, {
    conceptId: item.conceptId, inclusionMode: item.inclusionMode, note: item.note, display: item.display,
    code: item.code, systemName: item.systemName,
    domainText: item.sdDiagnosisDomain ? item.sdDiagnosisDomainText?.trim() || '体系名称待确认' : '体系待确认',
  }])))

  const handleSearch = () => {
    setQuery(keyword.trim())
    setPage(0)
    setAttempt(value => value + 1)
    setSelectionError('')
  }

  const handleReset = () => {
    setKeyword('')
    setQuery('')
    setPage(0)
    setAttempt(value => value + 1)
    setSelectionError('')
  }

  const search = useQuery({
    queryKey: ['disease-management-scope-search', session, attempt, query, domain, page],
    queryFn: async () => requireDiseaseMemberSearchPage(
      await api.masterData.searchDiseases(query, '', 'ACTIVE', domain, page, diseaseMemberPageSize), page, domain),
    enabled: query.trim().length >= 2,
    retry: false,
    gcTime: 0,
  })
  const searchReady = query.length >= 2 && search.isSuccess && !search.isFetching
  const currentSearch = useRef({ ready: searchReady, data: search.data })
  currentSearch.current = { ready: searchReady, data: search.data }
  const changePage = (value: number) => { setPage(value); setAttempt(current => current + 1); setSelectionError('') }
  const addRule = () => setRules((current) => [...current, {
    key: crypto.randomUUID(), inclusionMode: 'INCLUDE', sdDiagnosisDomain: 'WESTERN_MEDICINE',
  }])
  const updateRule = (key: string, field: keyof DiseaseManagementRule, value: string) => setRules((current) =>
    current.map((rule) => rule.key === key ? { ...rule, [field]: value || undefined } : rule))
  const addException = (disease: DiseaseMemberCandidate, inclusionMode: 'INCLUDE' | 'EXCLUDE') => {
    if (!currentSearch.current.ready || !currentSearch.current.data?.content.includes(disease)) {
      setSelectionError('候选已失效，请重新检索后选择')
      return
    }
    setExceptions((current) => new Map(current).set(disease.id, { conceptId: disease.id, inclusionMode, note: '',
      display: disease.display, code: disease.code, systemName: disease.systemName,
      domainText: disease.sdDiagnosisDomain ? disease.sdDiagnosisDomainText?.trim() || '体系名称待确认' : '体系待确认' }))
  }
  const domainOptions = options(dictionaries, 'BD_DIAGNOSIS_DOMAIN')
  const conceptTypeOptions = options(dictionaries, 'BD_CONCEPT_TYPE')
  const exceptionValues = [...exceptions.values()]
  async function save() {
    if (saveLock.current) return
    setSaveError('')
    try {
      const command = prepareDiseaseScopeSave(program, rules.map(({ key: _key, id: _id, ...rule }) => rule),
        exceptionValues.map(({ display: _display, code: _code, systemName: _systemName, domainText: _domainText, ...item }) => item))
      saveLock.current = true; setSaving(true)
      const receipt = await onSave(command.rules, command.exceptions)
      if (!alive.current) return
      requireDiseaseScopeReceipt(command, receipt)
      onSaved?.()
    } catch (error) {
      if (alive.current) setSaveError(`${errorMessage(error)}。草稿已保留；请核实远端结果后重试，未确认不代表已回滚。`)
    } finally {
      saveLock.current = false
      if (alive.current) setSaving(false)
    }
  }
  return <Dialog title="配置疾病识别范围" eyebrow={program.name} size="xwide" onClose={() => { if (!saveLock.current) onClose() }}
    description="使用规则覆盖大批量疾病，只为少数特殊疾病配置精确例外；精确例外的优先级最高。">
    {saveError && <Alert tone="warning">{saveError}</Alert>}
    <div className="disease-scope-editor" inert={saving}>
      <section className="disease-scope-section">
        <div className="disease-scope-section__head"><div><h3>批量识别规则</h3>
          <p>同一行内的条件同时满足，多条“纳入”规则取并集；命中“排除”规则时不纳入。</p></div>
          <Button variant="secondary" size="sm" onClick={addRule}><Icon name="add" />新增规则</Button></div>
        {!rules.length && <Alert tone="info">尚未配置批量规则。可以按诊断体系、编码体系、疾病类型、章节或编码范围建立规则。</Alert>}
        <div className="disease-rule-list">{rules.map((rule, index) => <div className="disease-rule-card" key={rule.key}>
          <div className="disease-rule-card__title"><strong>规则 {index + 1}</strong>
            <StatusBadge tone={rule.inclusionMode === 'INCLUDE' ? 'success' : 'warning'}>
              {rule.inclusionMode === 'INCLUDE' ? '纳入' : '排除'}</StatusBadge>
            <Button variant="text" size="sm" onClick={() => setRules((current) => current.filter((item) => item.key !== rule.key))}>删除</Button></div>
          <div className="disease-rule-grid">
            <FormField label="处理方式"><Select value={rule.inclusionMode}
              onChange={(value) => updateRule(rule.key, 'inclusionMode', value)} options={[
                { value: 'INCLUDE', label: '纳入' }, { value: 'EXCLUDE', label: '排除' },
              ]} /></FormField>
            <FormField label="诊断体系"><Select value={rule.sdDiagnosisDomain ?? ''}
              onChange={(value) => updateRule(rule.key, 'sdDiagnosisDomain', value)}
              placeholder="不限" options={domainOptions} /></FormField>
            <FormField label="编码体系"><Select value={rule.codeSystemId ?? ''}
              onChange={(value) => updateRule(rule.key, 'codeSystemId', value)} placeholder="不限"
              options={codeSystems.map((item) => ({ value: item.id, label: `${item.name} · ${item.version}` }))} /></FormField>
            <FormField label="疾病类型"><Select value={rule.sdConceptType ?? ''}
              onChange={(value) => updateRule(rule.key, 'sdConceptType', value)}
              placeholder="不限" options={conceptTypeOptions} /></FormField>
            <FormField label="章节编码"><input value={rule.chapterCode ?? ''} placeholder="如 I"
              onChange={(event) => updateRule(rule.key, 'chapterCode', event.target.value)} /></FormField>
            <FormField label="编码起始"><input value={rule.codeFrom ?? ''} placeholder="如 I10"
              onChange={(event) => updateRule(rule.key, 'codeFrom', event.target.value)} /></FormField>
            <FormField label="编码结束"><input value={rule.codeTo ?? ''} placeholder="如 I15.9"
              onChange={(event) => updateRule(rule.key, 'codeTo', event.target.value)} /></FormField>
            <FormField label="规则说明"><input value={rule.note ?? ''} placeholder="便于后续审查"
              onChange={(event) => updateRule(rule.key, 'note', event.target.value)} /></FormField>
          </div>
        </div>)}</div>
      </section>

      <section className="disease-scope-section">
        <div className="disease-scope-section__head"><div><h3>精确疾病例外</h3>
          <p>仅维护规则无法表达的特殊疾病；可明确纳入，也可从规则结果中明确排除。</p></div>
          <span>{exceptionValues.length} 个例外</span></div>
        {!!exceptionValues.length && <div className="disease-exception-list">{exceptionValues.map((item) => <div key={item.conceptId}>
          <span><strong>{item.display}</strong><small>{item.domainText} · {item.systemName}</small></span><code>{item.code || '编码待确认'}</code>
          <Select value={item.inclusionMode} options={[{ value: 'INCLUDE', label: '明确纳入' }, { value: 'EXCLUDE', label: '明确排除' }]}
            onChange={(value) => setExceptions((current) => {
              const next = new Map(current); next.set(item.conceptId, { ...item, inclusionMode: value as 'INCLUDE' | 'EXCLUDE' }); return next
            })} />
          <Button variant="text" size="sm" onClick={() => setExceptions((current) => {
            const next = new Map(current); next.delete(item.conceptId); return next
          })}>移除</Button></div>)}</div>}
        <div className="disease-management-member-toolbar">
          <SearchField label="查找精确疾病" value={keyword} onChange={value => {
            setKeyword(value); setQuery(''); setPage(0); setAttempt(current => current + 1); setSelectionError('')
          }} onSearch={handleSearch} placeholder="至少输入 2 个字符（回车或点击检索）" />
          <Select aria-label="检索诊断体系" value={domain} onChange={(val) => {
            setDomain(val); setPage(0); setAttempt(current => current + 1); setSelectionError('')
          }} placeholder="全部诊断体系" options={domainOptions} />
          <Button size="sm" variant="primary" type="button" onClick={handleSearch}>检索</Button>
          <Button size="sm" variant="secondary" type="button" onClick={handleReset}>重置</Button>
          <span>{query.length < 2 ? '输入关键词后检索' : search.isFetching ? '正在检索…'
            : searchReady ? `共 ${search.data.totalElements} 条` : '数量未确认'}</span>
        </div>
        {selectionError && <Alert tone="warning">{selectionError}</Alert>}
        {query.trim().length >= 2 && <div className="disease-search-results">
          {search.isFetching && <LoadingState label="正在检索疾病…" />}
          {search.isError && !search.isFetching && <Alert tone="warning">疾病检索失败：{errorMessage(search.error)}
            <Button variant="text" size="sm" onClick={() => { setAttempt(current => current + 1); setSelectionError('') }}>重新检索</Button></Alert>}
          {searchReady && search.data.content.map((disease) => <div key={disease.id}><span><strong>{disease.display}</strong>
            <small>{disease.sdDiagnosisDomain ? disease.sdDiagnosisDomainText?.trim() || '体系名称待确认' : '体系待确认'} · {disease.systemName}</small></span><code>{disease.code}</code>
            <Button variant="secondary" size="sm" onClick={() => addException(disease, 'INCLUDE')}>明确纳入</Button>
            <Button variant="text" size="sm" onClick={() => addException(disease, 'EXCLUDE')}>明确排除</Button></div>)}
          {searchReady && !search.data.content.length && <EmptyState icon="clinical"
            title={search.data.totalElements === 0 ? '未找到疾病' : '当前页无结果'}
            copy={search.data.totalElements === 0 ? '请调整检索条件。' : '目录数据已变化，请返回第一页重新检索。'} />}
          {searchReady && !search.data.content.length && page > 0 && <Button variant="secondary" size="sm" onClick={() => changePage(0)}>返回第一页</Button>}
          {searchReady && search.data.totalPages > 1 && <div className="disease-search-pagination">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => changePage(page - 1)}>上一页</Button>
            <span>第 {page + 1} / {search.data.totalPages} 页</span>
            <Button variant="secondary" size="sm" disabled={page + 1 >= search.data.totalPages}
              onClick={() => changePage(page + 1)}>下一页</Button></div>}
        </div>}
      </section>
      <div className="ui-form-actions"><Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
        <Button busy={saving} disabled={saving} onClick={() => void save()}>保存识别范围</Button></div>
    </div>
  </Dialog>
}
