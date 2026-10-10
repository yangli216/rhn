import { RemoteSearchSelect, type RemoteSearchOption } from "../../../shared/ui/RemoteSearchSelect";
import { requireMappingSystems, requireMappingTerms, mappingAuthorityMatches, assertMappingSaveCommand, verifyMappingSaveReceipt, requireUnchangedMappingSelection, type MappingSaveCommand, requireStandardMappings, assertMappingStatusCommand, verifyMappingStatusReceipt, requirePersistedMappings } from "../standardMappingFacts";
import { nextCatalogVersionDate } from "../catalogLifecycleFacts";
import { catalogImportScope } from "../catalogImportFacts";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, type RhnApi, type ItemAttributeSubjectType, type ItemTermMapping, type StandardEquivalence, type StandardMappingType, type StandardTerm } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, EmptyState, FormField, LoadingState, Select, StatusBadge } from "../../../shared/ui";
import { today, Checkbox, Table, RowActions } from './masterDataShared'

export type StandardMappingDialogProps = {
  api: RhnApi; subjectType: ItemAttributeSubjectType; targetId: string; itemName: string
  systemType: 'SERVICE' | 'MEDICATION'; onClose: () => void
}

export function StandardMappingDialog(props: StandardMappingDialogProps) {
  const scope = `${catalogImportScope(props.api, props.subjectType)}:${props.targetId}:${props.systemType}`
  return <StandardMappingSession key={scope} {...props} scope={scope} />
}

export function StandardMappingSession({ api, subjectType, targetId, itemName, systemType, onClose, scope }: StandardMappingDialogProps & { scope: string }) {
  const active = useRef(true)
  const pendingRef = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [businessDate, setBusinessDate] = useState(today())
  const [mappingType, setMappingType] = useState<StandardMappingType>('CLINICAL')
  const [equivalence, setEquivalence] = useState<StandardEquivalence>('EXACT')
  const [systemId, setSystemId] = useState('')
  const [selectedTerm, setSelectedTerm] = useState<RemoteSearchOption<StandardTerm>>()
  const [validFrom, setValidFrom] = useState(today())
  const [validTo, setValidTo] = useState('')
  const [limitation, setLimitation] = useState('')
  const [primaryMapping, setPrimaryMapping] = useState(true)
  const [replacement, setReplacement] = useState<ItemTermMapping>()
  const [pending, setPending] = useState('')
  const [operationError, setOperationError] = useState('')
  const maintenance = useQuery({
    queryKey: ['master-data-standard-mappings', scope, businessDate],
    queryFn: async () => requireStandardMappings(await api.masterData.itemTermMappings(subjectType, targetId, businessDate),
      { subjectType, targetId, businessDate }),
  })
  const systems = useQuery({
    queryKey: ['master-data-standard-systems', scope, validFrom],
    queryFn: async () => requireMappingSystems(await api.masterData.standardCodeSystems(systemType, '', validFrom), systemType, validFrom),
    enabled: Boolean(validFrom),
  })
  const systemsReady = systems.isSuccess && !systems.isFetching
  const eligibleSystems = useMemo(() => systemsReady
    ? systems.data.filter(value => mappingAuthorityMatches(mappingType, value.authorityType)) : [], [systemsReady, systems.data, mappingType])
  const selectedSystem = eligibleSystems.find(value => value.id === systemId)
  const loadTerms = useCallback(async (query: string): Promise<RemoteSearchOption<StandardTerm>[]> => {
    if (!selectedSystem) throw new Error('请先确认标准发布版')
    return requireMappingTerms(await api.masterData.standardTerms(selectedSystem.id, validFrom, query), selectedSystem, validFrom)
      .map(value => ({ value: value.id, label: value.display, code: value.code, raw: value }))
  }, [api, selectedSystem, validFrom])

  const ready = maintenance.isSuccess && !maintenance.isFetching && !unconfirmed
  const reload = async () => {
    if (pendingRef.current) return
    try {
      await maintenance.refetch({ throwOnError: true })
      if (active.current) { setUnconfirmed(false); setOperationError('') }
    } catch (error) { if (active.current) setOperationError(errorMessage(error)) }
  }
  const save = async () => {
    if (pendingRef.current || !ready || !selectedSystem || !selectedTerm?.raw || !validFrom) return
    const command: MappingSaveCommand = structuredClone({
      input: { conceptId: selectedTerm.raw.id, mappingType, equivalence, primaryMapping,
        limitation: limitation.trim() || undefined, validFrom, validTo: validTo || undefined,
        replacesMappingId: replacement?.id, expectedReplacesRevision: replacement?.revision },
      system: selectedSystem, term: selectedTerm.raw, replaced: replacement,
    })
    try { assertMappingSaveCommand(maintenance.data!, command) }
    catch (error) { setOperationError(errorMessage(error)); return }
    pendingRef.current = true; setPending('save'); setOperationError('')
    try {
      const [source, publishers, concepts] = await Promise.all([
        api.masterData.itemTermMappings(subjectType, targetId, businessDate),
        api.masterData.standardCodeSystems(systemType, '', command.input.validFrom),
        api.masterData.standardTerms(command.system.id, command.input.validFrom, command.term.code),
      ])
      if (!active.current) return
      const before = requireStandardMappings(source, { subjectType, targetId, businessDate })
      const freshSystems = requireMappingSystems(publishers, systemType, command.input.validFrom)
      const freshTerms = requireMappingTerms(concepts, command.system, command.input.validFrom)
      requireUnchangedMappingSelection(command, freshSystems, freshTerms)
      assertMappingSaveCommand(before, command)
      const receipt = verifyMappingSaveReceipt(await api.masterData.saveItemTermMapping(subjectType, targetId, command.input), before, command)
      if (!active.current) return
      const result = await maintenance.refetch({ throwOnError: true })
      requirePersistedMappings(receipt, requireStandardMappings(result.data, { subjectType, targetId, businessDate }))
      if (active.current) { setLimitation(''); setValidTo(''); setReplacement(undefined); setSelectedTerm(undefined) }
    } catch (error) { if (active.current) { setUnconfirmed(true); setOperationError(errorMessage(error)) } }
    finally { pendingRef.current = false; if (active.current) setPending('') }
  }
  const changeStatus = async (value: ItemTermMapping, status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED') => {
    if (pendingRef.current || !ready) return
    const before = structuredClone(maintenance.data!)
    const command = { original: structuredClone(value), status, validTo: status === 'RETIRED' ? businessDate : undefined }
    try { assertMappingStatusCommand(before, command) }
    catch (error) { setOperationError(errorMessage(error)); return }
    pendingRef.current = true; setPending(`${value.id}:${status}`); setOperationError('')
    try {
      const receipt = verifyMappingStatusReceipt(await api.masterData.changeItemTermMappingStatus(
        value.id, value.revision, status, command.validTo), before, command)
      if (!active.current) return
      const result = await maintenance.refetch({ throwOnError: true })
      requirePersistedMappings(receipt, requireStandardMappings(result.data, { subjectType, targetId, businessDate }))
    } catch (error) { if (active.current) { setUnconfirmed(true); setOperationError(errorMessage(error)) } }
    finally { pendingRef.current = false; if (active.current) setPending('') }
  }
  const startReplacement = (value: ItemTermMapping) => {
    if (!ready || pendingRef.current) return
    setReplacement(value); setMappingType(value.mappingType); setEquivalence(value.equivalence)
    setPrimaryMapping(value.primaryMapping); setSystemId(value.codeSystemId); setSelectedTerm(undefined)
    setValidFrom(nextCatalogVersionDate(value.validFrom, today())); setValidTo(''); setLimitation(value.limitation ?? '')
  }
  const values = ready ? maintenance.data : undefined
  return <Dialog title={`${itemName} · 标准映射`} eyebrow="基础数据 · 标准来源与有效期" size="xwide" closeOnBackdrop={false} onClose={() => { if (!pendingRef.current) onClose() }}
    description="维护国家、医保、监管及地方标准映射；业务模块按业务日期解析，历史映射不会被覆盖。">
    <div className="master-data-mapping-dialog">
      {(operationError || maintenance.error || unconfirmed) && <div role="alert">
        {operationError || errorMessage(maintenance.error) || '标准映射结果尚未确认'}
        <Button variant="secondary" size="sm" disabled={Boolean(pending)} onClick={() => void reload()}>重新核实映射</Button>
      </div>}
      <section className="master-data-mapping-current">
        <header><div><h3>业务日期下的有效映射</h3><p>改变日期可回看当时应使用的标准编码。</p></div>
          <FormField label="业务日期"><input type="date" value={businessDate} disabled={Boolean(pending)}
            onChange={(event) => setBusinessDate(event.target.value)} /></FormField></header>
        {maintenance.isFetching ? <LoadingState label="正在解析标准映射…" />
          : !values ? <p>有效映射尚未确认，请重新加载核实。</p>
          : !values.effectiveMappings.length ? <EmptyState icon="clinical" title="当前日期暂无有效映射"
            copy="可在右侧维护区新增首条映射。" />
            : <div className="master-data-mapping-cards">{values.effectiveMappings.map((value) =>
              <MappingSummary key={value.id} value={value} />)}</div>}
      </section>

      <section className="master-data-mapping-editor" inert={!ready || Boolean(pending)}>
        <header><h3>{replacement ? '建立替代映射' : '新增标准映射'}</h3><p>{replacement
          ? `将替代 ${replacement.systemName} · ${replacement.termCode}，原记录自动截止到新映射生效前一天。`
          : '先选用途与权威发布版，再选标准条目和有效期。'}</p></header>
        {systems.isError && <div role="alert">标准发布版加载失败：{errorMessage(systems.error)}
          <Button size="sm" variant="secondary" onClick={() => void systems.refetch()}>重新加载发布版</Button></div>}
        {systemId && systemsReady && !selectedSystem && <p role="alert">已选发布版不适用于当前日期或用途，请重新选择。</p>}
        {replacement && <Alert tone="info">正在替代：{replacement.termDisplay}（{replacement.termCode}）
          <Button size="sm" variant="text" onClick={() => setReplacement(undefined)}>取消替代</Button></Alert>}
        <div className="master-data-mapping-form">
          <FormField label="映射用途" required><Select value={mappingType} disabled={Boolean(replacement)}
            onChange={(value) => { setMappingType(value as StandardMappingType); setSystemId(''); setSelectedTerm(undefined) }} options={[
              { value: 'CLINICAL', label: '临床标准' }, { value: 'INSURANCE', label: '医保目录' },
              { value: 'REGULATORY', label: '监管标准' }, { value: 'LOCAL', label: '地方 / 院内标准' },
            ]} /></FormField>
          <FormField label="标准发布版" required><Select value={systemId} onChange={(value) => { setSystemId(value); setSelectedTerm(undefined) }}
            loading={systems.isFetching} disabled={!systemsReady} placeholder="选择权威标准及发布版" showValue options={eligibleSystems.map((value) => ({
              value: value.id, label: `${value.name} · ${value.version}`, secondaryText: value.code,
              searchKeywords: [value.publisher ?? '', value.authorityType],
            }))} /></FormField>
          <FormField label="标准条目" required><RemoteSearchSelect<StandardTerm>
            key={`${scope}:${systemId}:${validFrom}`} value={selectedTerm} onChange={setSelectedTerm} loadOptions={loadTerms}
            disabled={!selectedSystem || Boolean(pending)} placeholder="输入名称或编码远程检索" minChars={1} resultLimit={500}
            popoverHeader={<p>每次最多显示 500 条匹配结果；可输入更精确的名称、编码或拼音码。</p>} />
          </FormField>
          <FormField label="等价关系" required><Select value={equivalence}
            onChange={(value) => setEquivalence(value as StandardEquivalence)} options={[
              { value: 'EXACT', label: '完全匹配' }, { value: 'EQUIVALENT', label: '语义等价' },
              { value: 'WIDER', label: '本地范围更宽' }, { value: 'NARROWER', label: '本地范围更窄' },
              { value: 'RELATED', label: '相关但不等价' },
            ]} /></FormField>
          <FormField label="生效日期" required><input type="date" value={validFrom}
            onChange={(event) => { setValidFrom(event.target.value); setSelectedTerm(undefined) }} required /></FormField>
          <FormField label="失效日期"><input type="date" value={validTo} min={validFrom}
            onChange={(event) => setValidTo(event.target.value)} /></FormField>
          <FormField label="限制使用范围" className="span-2"><input value={limitation}
            onChange={(event) => setLimitation(event.target.value)} placeholder="例如：仅限门诊检验收费，不用于住院结算" /></FormField>
          <Checkbox name="primaryMapping" label="设为该标准体系下的主要映射" checked={primaryMapping}
            onChange={setPrimaryMapping} />
        </div>
        <div className="master-data-mapping-editor-actions"><Button disabled={!ready || Boolean(pending) || !selectedTerm?.raw || !selectedSystem || !validFrom}
          busy={pending === 'save'} onClick={() => void save()}>{replacement ? '保存替代映射' : '新增映射'}</Button></div>
      </section>

      <section className="master-data-mapping-history">
        <header><h3>映射历史</h3><p>包含当前、暂停、停用和已被替代的全部记录。</p></header>
        {!values ? <p>映射历史尚未确认，请重新加载核实。</p> : !values.history.length ? <EmptyState icon="clinical" title="暂无映射历史" copy="建立映射后将在此追溯。" />
          : <Table compact headers={['用途 / 标准来源', '标准条目', '关系 / 范围', '有效期', '状态', '操作']}>
            {values.history.map((value) => <tr key={`${value.id}-${value.revision}`}>
              <td><strong>{mappingTypeLabel(value.mappingType)}</strong><small>{value.systemName} · {value.systemVersion}</small>
                <code>{value.systemCode}</code></td><td><strong>{value.termDisplay}</strong><code>{value.termCode}</code></td>
              <td>{equivalenceLabel(value.equivalence)}{value.primaryMapping && <StatusBadge tone="success">主要</StatusBadge>}
                <small>{value.limitation || '无限制范围'}</small></td>
              <td>{value.validFrom}<small>至 {value.validTo || '长期'}</small></td>
              <td><StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'SUSPENDED' ? 'warning' : 'neutral'}>
                {mappingStatusLabel(value.status)}</StatusBadge></td>
              <td><RowActions>{value.status === 'ACTIVE' && <>
                <Button size="sm" variant="text" disabled={Boolean(pending)} onClick={() => startReplacement(value)}>替代</Button>
                <Button size="sm" variant="text" disabled={Boolean(pending)} busy={pending === `${value.id}:SUSPENDED`}
                  onClick={() => void changeStatus(value, 'SUSPENDED')}>暂停</Button>
                <Button size="sm" variant="text" disabled={Boolean(pending)} busy={pending === `${value.id}:RETIRED`}
                  onClick={() => void changeStatus(value, 'RETIRED')}>停用</Button></>}
                {value.status === 'SUSPENDED' && <Button size="sm" variant="text" disabled={Boolean(pending)} busy={pending === `${value.id}:ACTIVE`}
                  onClick={() => void changeStatus(value, 'ACTIVE')}>恢复</Button>}</RowActions></td>
            </tr>)}</Table>}
      </section>
      <div className="ui-form-actions"><Button variant="secondary" disabled={Boolean(pending)} onClick={onClose}>关闭</Button></div>
    </div>
  </Dialog>
}

export function MappingSummary({ value }: { value: ItemTermMapping }) {
  return <article><header><StatusBadge>{mappingTypeLabel(value.mappingType)}</StatusBadge>
    {value.primaryMapping && <StatusBadge tone="success">主要映射</StatusBadge>}</header>
    <strong>{value.termDisplay}</strong><code>{value.termCode}</code>
    <small>{value.systemName} · {value.systemVersion}</small>
    <footer><span>{equivalenceLabel(value.equivalence)}</span><span>{value.validFrom} — {value.validTo || '长期'}</span></footer></article>
}

export function mappingTypeLabel(value: StandardMappingType) {
  return ({ CLINICAL: '临床标准', INSURANCE: '医保目录', REGULATORY: '监管标准', LOCAL: '地方 / 院内' } as const)[value]
}

export function equivalenceLabel(value: StandardEquivalence) {
  return ({ EXACT: '完全匹配', EQUIVALENT: '语义等价', WIDER: '本地范围更宽',
    NARROWER: '本地范围更窄', RELATED: '相关但不等价' } as const)[value]
}

export function mappingStatusLabel(value: ItemTermMapping['status']) {
  return ({ ACTIVE: '有效', SUSPENDED: '已暂停', RETIRED: '已停用', SUPERSEDED: '已替代' } as const)[value]
}
