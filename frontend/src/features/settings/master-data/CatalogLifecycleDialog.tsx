import { assertCatalogLifecycleCommand, requireCatalogLifecycleReceipt, requirePersistedCatalogReceipt, type CatalogLifecycleCommand } from "../catalogLifecycleReceipt";
import { requireCatalogLifecycle, requireCatalogDepartments, nextCatalogVersionDate } from "../catalogLifecycleFacts";
import { requireCatalogSource } from "../organizationCatalogFacts";
import { requireOrganizationDictionary } from "../organizationDictionaryFacts";
import { catalogImportScope, requireImportCandidates, requireImportReceipt, type CatalogImportAttempt } from "../catalogImportFacts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Organization } from "../../../shared/model";
import { errorMessage, type CatalogPrice, type RhnApi, type CatalogLifecycle, type LifecycleAdoptionInput, type LifecyclePriceInput, type CatalogAdoptionCandidate, type OrganizationAdoption, type CatalogChangeBatch } from "../../../shared/rhnApi";
import { Alert, Button, DataTable, Dialog, EmptyState, FormField, Icon, LoadingState, Pagination, SearchField, StatusBadge, TableShell, Tabs } from "../../../shared/ui";
import { type DictionaryMap, today, DataStatus, optionalText, checked, text, DateRangeFields, StaticSelectField, Checkboxes, Checkbox, Table, RowActions, SelectField } from './masterDataShared'

export type AdoptionDefaults = Pick<LifecycleAdoptionInput, 'orderable' | 'executable' | 'chargeable' | 'purchasable' |
  'stocked' | 'dispensable' | 'returnable'>

export type CatalogLifecycleDialogProps = {
  api: RhnApi; catalogItemId: string; itemName: string; organization: Organization;
  packages?: Array<{ id: string; packageSpec?: string; unitName: string }>; dictionaries: DictionaryMap;
  defaults: AdoptionDefaults; onClose: () => void; onChanged: () => Promise<unknown>
}

export function CatalogLifecycleDialog(props: CatalogLifecycleDialogProps) {
  const scope = `${catalogImportScope(props.api, props.organization.id)}:${props.catalogItemId}`
  return <CatalogLifecycleSession key={scope} {...props} scope={scope} />
}

export function CatalogLifecycleSession({ api, catalogItemId, itemName, organization, packages = [],
  defaults, onClose, onChanged, scope }: CatalogLifecycleDialogProps & { scope: string }) {
  const queryClient = useQueryClient()
  const [businessDate, setBusinessDate] = useState(today())
  const editorsRef = useRef<HTMLDivElement>(null)
  const [replacementAdoption, setReplacementAdoption] = useState<OrganizationAdoption>()
  const [replacementPrice, setReplacementPrice] = useState<CatalogPrice>()
  const [pending, setPending] = useState('')
  const [operationError, setOperationError] = useState('')
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [editorSnapshot, setEditorSnapshot] = useState<CatalogLifecycle>()
  const [editorGeneration, setEditorGeneration] = useState(0)
  const active = useRef(true), busy = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const source = useQuery({ queryKey: ['catalog-lifecycle-source', scope],
    queryFn: async () => requireCatalogSource(await api.organization.catalogSource(organization.id), organization.id) })
  const sourceReady = source.isSuccess && !source.isFetching
  const dateReady = /^\d{4}-\d{2}-\d{2}$/.test(businessDate) && Number.isFinite(Date.parse(businessDate))
  const priceTypes = useQuery({ queryKey: ['catalog-lifecycle-price-types', scope],
    queryFn: async () => requireOrganizationDictionary(await api.dictionaries.resolve('BD_PRICE_TYPE')) })
  const priceTypesReady = priceTypes.isSuccess && !priceTypes.isFetching && priceTypes.data.length > 0
  const maintenance = useQuery({
    queryKey: ['catalog-lifecycle', scope, source.data?.organizationRevision, businessDate],
    queryFn: async () => requireCatalogLifecycle(await api.masterData.catalogLifecycle(catalogItemId, organization.id, businessDate),
      { catalogItemId, organizationId: organization.id, businessDate, sourceOrganizationId: source.data?.sourceOrganizationId }),
    enabled: sourceReady && dateReady,
  })
  const departments = useQuery({
    queryKey: ['organization-catalog-departments', scope],
    queryFn: async () => requireCatalogDepartments(await api.organization.departments(organization.id), organization.id),
  })
  const [activeTab, setActiveTab] = useState<'adoption' | 'price'>('adoption')
  const ready = sourceReady && dateReady && maintenance.isSuccess && !maintenance.isFetching && !unconfirmed
  const departmentsReady = departments.isSuccess && !departments.isFetching
  const values = ready ? maintenance.data : undefined
  useEffect(() => { if (ready && !editorSnapshot) setEditorSnapshot(maintenance.data) }, [ready, maintenance.data, editorSnapshot])
  const outdated = Boolean(ready && editorSnapshot && JSON.stringify(editorSnapshot) !== JSON.stringify(maintenance.data))
  const editable = ready && !pending && !outdated
  const reload = async () => {
    if (busy.current) return
    const freshSource = await source.refetch()
    if (freshSource.isError || !active.current) return
    try {
      const verifiedSource = freshSource.data!
      await queryClient.fetchQuery({
        queryKey: ['catalog-lifecycle', scope, verifiedSource.organizationRevision, businessDate], staleTime: 0,
        queryFn: async () => requireCatalogLifecycle(await api.masterData.catalogLifecycle(catalogItemId, organization.id, businessDate),
          { catalogItemId, organizationId: organization.id, businessDate, sourceOrganizationId: verifiedSource.sourceOrganizationId }),
      })
      if (active.current) { setUnconfirmed(false); setOperationError('') }
    } catch (error) { if (active.current) setOperationError(errorMessage(error)) }
  }
  const resetEditor = () => {
    if (!ready || pending) return
    setEditorSnapshot(maintenance.data); setEditorGeneration(value => value + 1)
    setReplacementAdoption(undefined); setReplacementPrice(undefined); setOperationError('')
  }
  const execute = async (key: string, intent: CatalogLifecycleCommand) => {
    if (busy.current || !editable || !maintenance.data || !source.data) return
    const before = structuredClone(maintenance.data), command = structuredClone(intent)
    const originalSource = structuredClone(source.data)
    const responseDate = 'input' in command ? command.input.validFrom : today()
    try { assertCatalogLifecycleCommand(before, command) }
    catch (error) { setOperationError(errorMessage(error)); return }
    const sourceUnchanged = () => {
      const current = queryClient.getQueryData<typeof originalSource>(['catalog-lifecycle-source', scope])
      if (!current || current.organizationRevision !== originalSource.organizationRevision
        || current.sourceOrganizationId !== originalSource.sourceOrganizationId) throw new Error('目录来源已变化，请重新核实当前目录')
    }
    let receiptConfirmed = false
    busy.current = true; setPending(key); setOperationError('')
    try {
      const response = command.kind === 'adoption-save' ? command.replaced
        ? await api.masterData.replaceLifecycleAdoption(command.replaced.id, command.replaced.revision, command.input)
        : await api.masterData.createLifecycleAdoption(catalogItemId, command.input)
        : command.kind === 'price-save' ? command.replaced
          ? await api.masterData.replaceLifecyclePrice(command.replaced.id, command.replaced.revision, command.input)
          : await api.masterData.createLifecyclePrice(catalogItemId, command.input)
          : command.kind === 'adoption-status'
            ? await api.masterData.changeLifecycleAdoptionStatus(command.original.id, command.original.revision, command.status, command.validTo)
            : await api.masterData.changeLifecyclePriceStatus(command.original.id, command.original.revision, command.status, command.validTo)
      const receipt = requireCatalogLifecycleReceipt(response, before, command, responseDate, originalSource.sourceOrganizationId)
      if (!active.current) return
      sourceUnchanged()
      const fresh = await maintenance.refetch({ throwOnError: true })
      if (!active.current) return
      sourceUnchanged()
      const persisted = requireCatalogLifecycleReceipt(fresh.data, before, command, businessDate, originalSource.sourceOrganizationId)
      requirePersistedCatalogReceipt(receipt, persisted)
      receiptConfirmed = true
      await onChanged()
      if (!active.current) return
      setEditorSnapshot(persisted); setEditorGeneration(value => value + 1)
      setReplacementAdoption(undefined); setReplacementPrice(undefined)
    } catch (error) {
      if (active.current) { setUnconfirmed(true); setOperationError(`${receiptConfirmed ? '保存已核实，但列表刷新失败' : '操作结果待核实'}：${errorMessage(error)}`) }
    } finally { busy.current = false; if (active.current) setPending('') }
  }
  const nextDate = (value: string) => nextCatalogVersionDate(value, today())
  const startAdoptionReplacement = (value: OrganizationAdoption) => {
    if (!editable) return
    setActiveTab('adoption')
    setReplacementAdoption(value); setReplacementPrice(undefined)
    editorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const startPriceReplacement = (value: CatalogPrice) => {
    if (!editable || value.organizationId !== organization.id) return
    setActiveTab('price')
    setReplacementPrice(value); setReplacementAdoption(undefined)
    editorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const packageLabel = (id?: string | null) => {
    if (!id) return '最小单位拆零'
    const item = packages.find((entry) => entry.id === id)
    return item ? (item.packageSpec || item.unitName) : `包装 ${id}（信息待确认）`
  }
  const changeAdoptionStatus = (value: OrganizationAdoption, status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED') =>
    execute(`a-${value.id}`, { kind: 'adoption-status', original: value,
      status, validTo: status === 'RETIRED' ? businessDate : undefined })
  const changePriceStatus = (value: CatalogPrice, status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED') =>
    execute(`p-${value.id}`, { kind: 'price-status', original: value,
      status, validTo: status === 'RETIRED' ? businessDate : undefined })
  const adoptionSeed = replacementAdoption ?? editorSnapshot?.currentAdoption
  const priceSeed = replacementPrice
  const adoptionOptionsReady = departmentsReady && (!adoptionSeed?.defaultDepartmentId
    || departments.data.some(item => item.id === adoptionSeed.defaultDepartmentId))
  const priceOptionsReady = priceTypesReady && (!priceSeed?.sdPriceType || priceTypes.data.some(item => item.code === priceSeed.sdPriceType))
    && (!priceSeed?.packageId || packages.some(item => item.id === priceSeed.packageId))
  return <Dialog title={`${itemName} · 机构目录与价格`} eyebrow={`${organization.name} · 生命周期工作台`}
    size="xwide" className="master-data-lifecycle-dialog-window" onClose={() => { if (!busy.current) onClose() }}
    footer={<Button variant="secondary" disabled={Boolean(pending)} onClick={onClose}>关闭</Button>}>
    <div className="master-data-lifecycle-dialog">
      {(operationError || source.isError || maintenance.isError) && <div role="alert">
        {operationError || `目录与价格加载失败：${errorMessage(source.error || maintenance.error)}`}
        <Button size="sm" variant="text" disabled={Boolean(pending)} onClick={() => void reload()}>重新核实目录与价格</Button>
      </div>}
      {!sourceReady && !source.isError && <LoadingState label="正在核实目录来源…" />}
      {sourceReady && maintenance.isFetching && <LoadingState label="正在读取目录与价格…" />}
      {!dateReady && <div role="alert">请选择有效的业务基准日</div>}
      {outdated && <div role="alert">目录或价格已更新，草稿暂不可提交。
        <Button size="sm" variant="text" disabled={Boolean(pending)} onClick={resetEditor}>放弃草稿并载入最新数据</Button>
      </div>}
      {departments.isError && <div role="alert">默认科室加载失败
        <Button size="sm" variant="text" onClick={() => void departments.refetch()}>重新加载默认科室</Button></div>}
      {(priceTypes.isError || (priceTypes.isSuccess && !priceTypes.data.length)) && <div role="alert">
        {priceTypes.isError ? '价格类型加载失败' : '价格类型为空，不能维护价格'}
        <Button size="sm" variant="text" onClick={() => void priceTypes.refetch()}>重新加载价格类型</Button></div>}
      {editorSnapshot && !ready && <div role="status">已保留编辑草稿，当前事实待确认，暂不可提交。</div>}
      {departmentsReady && !adoptionOptionsReady && <div role="alert">原默认科室不在当前目录中，不能静默清空后保存。</div>}
      {priceTypesReady && !priceOptionsReady && <div role="alert">原价格类型或包装不在当前选项中，请先核实目录。</div>}
      {editorSnapshot && <>

      <Tabs
        value={activeTab}
        onChange={(val) => { if (!pending) setActiveTab(val as 'adoption' | 'price') }}
        label="生命周期维护维度"
        variant="workspace"
        items={[
          {
            value: 'adoption',
            label: '机构目录与能力',
            meta: values?.adoptionHistory.length ? `${values.adoptionHistory.length} 个版本` : undefined,
          },
          {
            value: 'price',
            label: '机构价格与计价',
            meta: values?.priceHistory.length ? `${values.priceHistory.length} 条记录` : undefined,
          },
        ]}
      />

      {(
        <div className="master-data-lifecycle-tab-panel" hidden={activeTab !== 'adoption'}>
          <section className="master-data-lifecycle-status">
            <FormField label="业务基准日" className="master-data-lifecycle-status__date">
              <input type="date" disabled={Boolean(pending)} value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
            </FormField>
            {!ready ? <span>目录事实待确认</span> : (
              <div className="master-data-lifecycle-status__content">
                <span className="master-data-lifecycle-status__label">当前生效目录：</span>
                {values?.currentAdoption ? (
                  <div className="master-data-lifecycle-status__meta-line">
                    <DataStatus value={values.currentAdoption.sdStatus} text={values.currentAdoption.sdStatusText} />
                    <span>{values.currentAdoption.organizationId === organization.id ? '本机构目录' : `共享 ${source.data?.sourceOrganizationName}`}</span>
                    <strong>{values.currentAdoption.localName || itemName}</strong>
                    <code>{values.currentAdoption.localCode || '沿用中心编码'}</code>
                    <span className="master-data-lifecycle-status__meta-sub">
                      （{values.currentAdoption.validFrom} 起{values.currentAdoption.validTo ? ` 至 ${values.currentAdoption.validTo}` : '，长期有效'}）
                    </span>
                    <span className="master-data-lifecycle-status__caps">
                      开放能力：{capabilityShortLabels(values.currentAdoption).join(' · ') || '未开放'}
                    </span>
                  </div>
                ) : (
                  <StatusBadge>当前日期未采用 / 暂无生效目录</StatusBadge>
                )}
              </div>
            )}
          </section>

          <div className="master-data-lifecycle-workspace">
            <section className="master-data-lifecycle-editor" ref={editorsRef}>
              <header>
                <div>
                  <h3>{replacementAdoption ? '以当前目录为基准调整' : '调整机构目录'}</h3>
                </div>
              </header>
              <form
                key={`adoption-${editorGeneration}-${adoptionSeed?.id ?? 'new'}-${adoptionSeed?.revision ?? 0}`}
                className="master-data-lifecycle-form" inert={!editable}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!editable) return;
                  const form = new FormData(event.currentTarget);
                  const input: LifecycleAdoptionInput = {
                    organizationId: organization.id,
                    defaultDepartmentId: optionalText(form, 'defaultDepartmentId'),
                    localCode: optionalText(form, 'localCode'),
                    localName: optionalText(form, 'localName'),
                    orderable: checked(form, 'orderable'),
                    executable: checked(form, 'executable'),
                    chargeable: checked(form, 'chargeable'),
                    purchasable: checked(form, 'purchasable'),
                    stocked: checked(form, 'stocked'),
                    dispensable: checked(form, 'dispensable'),
                    returnable: checked(form, 'returnable'),
                    status: 'ACTIVE',
                    validFrom: text(form, 'validFrom'),
                    validTo: optionalText(form, 'validTo'),
                  };
                  if (!adoptionOptionsReady || (input.defaultDepartmentId && !departments.data.some(item => item.id === input.defaultDepartmentId))) {
                    setOperationError('默认科室尚未确认或已失效，请重新加载并选择'); return;
                  }
                  void execute('save-adoption', { kind: 'adoption-save', input, replaced: replacementAdoption });
                }}
              >
                {replacementAdoption && (
                  <Alert tone="info">
                    替代 {replacementAdoption.localName || itemName} · {replacementAdoption.validFrom}
                    <Button size="sm" variant="text" onClick={() => setReplacementAdoption(undefined)}>取消替代</Button>
                  </Alert>
                )}
                <FormField label="机构本地编码">
                  <input name="localCode" defaultValue={adoptionSeed?.localCode} placeholder="留空则沿用中心编码" />
                </FormField>
                <FormField label="机构显示名称">
                  <input name="localName" defaultValue={adoptionSeed?.localName} placeholder="留空则沿用中心名称" />
                </FormField>
                <DateRangeFields
                  fromName="validFrom"
                  toName="validTo"
                  fromLabel="生效日期"
                  toLabel="失效日期"
                  fromDefault={replacementAdoption ? nextDate(replacementAdoption.validFrom) : today()}
                />
                <StaticSelectField
                  name="defaultDepartmentId"
                  label={defaults.executable ? '默认执行科室' : '默认科室'}
                  required={false}
                  className="span-2"
                  defaultValue={adoptionSeed?.defaultDepartmentId}
                  placeholder={defaults.executable ? '未设置时检验检查自动匹配' : '请选择默认科室（选填）'}
                  disabled={!editable || !departmentsReady}
                  options={(departmentsReady ? departments.data : []).map((value) => ({
                    value: value.id,
                    label: `${value.name}（${value.code}）`,
                  }))}
                />
                <Checkboxes title="机构可用能力" className="span-2">
                  {(['orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable'] as const)
                    .map((key) => (
                      <Checkbox
                        key={key}
                        name={key}
                        label={capabilityLabel(key)}
                        defaultChecked={adoptionSeed?.[key] ?? defaults[key]}
                      />
                    ))}
                </Checkboxes>
                <div className="master-data-lifecycle-editor-actions">
                  <Button type="submit" disabled={!editable || !adoptionOptionsReady} busy={pending === 'save-adoption'}>
                    {replacementAdoption ? '保存替代版本' : '保存目录版本'}
                  </Button>
                </div>
              </form>
            </section>

            <section className="master-data-lifecycle-history">
              <header>
                <div>
                  <h3>机构目录版本历史</h3>
                </div>
              </header>
              {!ready ? <span>机构目录历史待确认</span> : !values?.adoptionHistory.length ? (
                <EmptyState icon="clinical" title="暂无机构目录历史" copy="可在左侧表单维护首个版本。" />
              ) : (
                <div className="master-data-table-wrap">
                  <Table compact headers={['本地目录', '业务能力', '有效期', '状态', '操作']}>
                    {values.adoptionHistory.map((value) => (
                      <tr key={`${value.id}-${value.revision}`}>
                        <td>
                          <strong>{value.localName || itemName}</strong>
                          <code>{value.localCode || '沿用中心编码'}</code>
                        </td>
                        <td>{capabilityShortLabels(value).join(' · ') || '未开放'}</td>
                        <td>{value.validFrom} 起 · {value.validTo ? `至 ${value.validTo}` : '长期'}</td>
                        <td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td>
                        <td>
                          <RowActions>
                            {value.sdStatus === 'ACTIVE' && (
                              <>
                                <Button size="sm" variant="text" disabled={!editable} onClick={() => startAdoptionReplacement(value)}>替代</Button>
                                <Button size="sm" variant="text" disabled={!editable} busy={pending === `a-${value.id}`} onClick={() => void changeAdoptionStatus(value, 'SUSPENDED')}>暂停</Button>
                                <Button size="sm" variant="text" disabled={!editable} busy={pending === `a-${value.id}`} onClick={() => void changeAdoptionStatus(value, 'RETIRED')}>停用</Button>
                              </>
                            )}
                            {value.sdStatus === 'SUSPENDED' && (
                              <Button size="sm" variant="text" disabled={!editable} busy={pending === `a-${value.id}`} onClick={() => void changeAdoptionStatus(value, 'ACTIVE')}>恢复</Button>
                            )}
                          </RowActions>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {(
        <div className="master-data-lifecycle-tab-panel" hidden={activeTab !== 'price'}>
          <section className="master-data-lifecycle-status">
            <FormField label="业务基准日" className="master-data-lifecycle-status__date">
              <input type="date" disabled={Boolean(pending)} value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
            </FormField>
            {!ready ? <span>价格事实待确认</span> : (
              <div className="master-data-lifecycle-status__content">
                <span className="master-data-lifecycle-status__label">当前有效价格：</span>
                {values?.currentPrices.length ? (
                  <div className="master-data-lifecycle-status__prices">
                    {values.currentPrices.map((value) => (
                      <div key={value.id} className="master-data-lifecycle-price-badge">
                        <span className="master-data-price-val">{value.currencyCode} {value.price}</span>
                        <span className="master-data-price-meta">{value.organizationId ? '本机构' : '租户公共'} · {value.sdPriceTypeText} · {packageLabel(value.packageId)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <StatusBadge>当前日期未维护有效价格</StatusBadge>
                )}
              </div>
            )}
          </section>

          <div className="master-data-lifecycle-workspace">
            <section className="master-data-lifecycle-editor" ref={editorsRef}>
              <header>
                <div>
                  <h3>{replacementPrice ? '以当前价格为基准调价' : '调整价格'}</h3>
                </div>
              </header>
              <form
                key={`price-${editorGeneration}-${priceSeed?.id ?? 'new'}-${priceSeed?.revision ?? 0}`}
                className="master-data-lifecycle-form" inert={!editable}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!editable) return;
                  const form = new FormData(event.currentTarget);
                  const input: LifecyclePriceInput = {
                    organizationId: organization.id,
                    packageId: optionalText(form, 'packageId'),
                    priceType: text(form, 'priceType'),
                    price: Number(text(form, 'price')),
                    currencyCode: text(form, 'currencyCode'),
                    priceDocumentCode: optionalText(form, 'priceDocumentCode'),
                    priceReason: optionalText(form, 'priceReason'),
                    validFrom: text(form, 'validFrom'),
                    validTo: optionalText(form, 'validTo'),
                    status: 'ACTIVE',
                  };
                  if (!priceOptionsReady || !priceTypes.data!.some(item => item.code === input.priceType)
                    || (input.packageId && !packages.some(item => item.id === input.packageId))) {
                    setOperationError('价格类型或计价包装尚未确认，请重新选择'); return;
                  }
                  void execute('save-price', { kind: 'price-save', input, replaced: replacementPrice });
                }}
              >
                {replacementPrice && (
                  <Alert tone="info">
                    调价：{replacementPrice.currencyCode} {replacementPrice.price} · {replacementPrice.sdPriceTypeText}
                    <Button size="sm" variant="text" onClick={() => setReplacementPrice(undefined)}>取消调价</Button>
                  </Alert>
                )}
                <div className="master-data-field-hint span-2">
                  💡 <strong>计价规则说明</strong>：选择包装时按包装计价；不选包装时按产品最小单位计价，供允许拆零销售处方使用。
                </div>
                {packages.length > 0 ? (
                  <>
                    <StaticSelectField
                      name="packageId"
                      label="计价包装"
                      required={false}
                      defaultValue={priceSeed?.packageId}
                      placeholder="最小单位（拆零计价）"
                      options={packages.map((item) => ({
                        value: item.id,
                        label: item.packageSpec || item.unitName,
                      }))}
                    />
                    <SelectField
                      name="priceType"
                      label="价格类型"
                      values={priceTypesReady ? priceTypes.data : []}
                      disabled={!editable || !priceTypesReady}
                      defaultValue={priceSeed?.sdPriceType}
                    />
                    <FormField label="金额" required>
                      <input name="price" type="number" min="0" step="0.000001" defaultValue={priceSeed?.price} required placeholder="0.00" />
                    </FormField>
                    <FormField label="币种" required>
                      <input name="currencyCode" defaultValue={priceSeed?.currencyCode ?? 'CNY'} required />
                    </FormField>
                    <FormField label="价格文件号" className="span-2">
                      <input name="priceDocumentCode" defaultValue={priceSeed?.priceDocumentCode} placeholder="如：发改物价字[2024]12号（选填）" />
                    </FormField>
                  </>
                ) : (
                  <>
                    <SelectField
                      name="priceType"
                      label="价格类型"
                      values={priceTypesReady ? priceTypes.data : []}
                      disabled={!editable || !priceTypesReady}
                      defaultValue={priceSeed?.sdPriceType}
                    />
                    <FormField label="金额" required>
                      <input name="price" type="number" min="0" step="0.000001" defaultValue={priceSeed?.price} required placeholder="0.00" />
                    </FormField>
                    <FormField label="币种" required>
                      <input name="currencyCode" defaultValue={priceSeed?.currencyCode ?? 'CNY'} required />
                    </FormField>
                    <FormField label="价格文件号">
                      <input name="priceDocumentCode" defaultValue={priceSeed?.priceDocumentCode} placeholder="如：发改物价字[2024]12号（选填）" />
                    </FormField>
                  </>
                )}
                <DateRangeFields
                  fromName="validFrom"
                  toName="validTo"
                  fromLabel="生效日期"
                  toLabel="失效日期"
                  fromDefault={replacementPrice ? nextDate(replacementPrice.validFrom) : today()}
                />
                <FormField label="调价依据" className="span-2">
                  <textarea
                    name="priceReason"
                    defaultValue={priceSeed?.priceReason}
                    rows={2}
                    placeholder="填写本次定价或调价原因、依据等（选填）"
                  />
                </FormField>
                <div className="master-data-lifecycle-editor-actions">
                  <Button type="submit" disabled={!editable || !priceOptionsReady} busy={pending === 'save-price'}>
                    {replacementPrice ? '保存调价版本' : '保存价格版本'}
                  </Button>
                </div>
              </form>
            </section>

            <section className="master-data-lifecycle-history">
              <header>
                <div>
                  <h3>价格调整历史</h3>
                </div>
              </header>
              {!ready ? <span>价格历史待确认</span> : !values?.priceHistory.length ? (
                <EmptyState icon="clinical" title="暂无价格历史" copy="可在左侧表单新增价格。" />
              ) : (
                <div className="master-data-table-wrap">
                  <Table compact headers={['价格 / 类型', '计价范围', '依据', '有效期', '状态', '操作']}>
                    {values.priceHistory.map((value) => (
                      <tr key={`${value.id}-${value.revision}`}>
                        <td>
                          <strong className="master-data-price">{value.currencyCode} {value.price}</strong>
                          <small>{value.sdPriceTypeText}</small>
                        </td>
                        <td>{value.organizationId ? '本机构价格' : '租户公共价格'}<small>{packageLabel(value.packageId)}</small></td>
                        <td>
                          {value.priceDocumentCode || '—'}
                          <small>{value.priceReason || '未说明'}</small>
                        </td>
                        <td>{value.validFrom} 起 · {value.validTo ? `至 ${value.validTo}` : '长期'}</td>
                        <td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td>
                        <td>
                          <RowActions>
                            {value.organizationId === organization.id && value.sdStatus === 'ACTIVE' && (
                              <>
                                <Button size="sm" variant="text" disabled={!editable} onClick={() => startPriceReplacement(value)}>调价</Button>
                                <Button size="sm" variant="text" disabled={!editable} busy={pending === `p-${value.id}`} onClick={() => void changePriceStatus(value, 'SUSPENDED')}>暂停</Button>
                                <Button size="sm" variant="text" disabled={!editable} busy={pending === `p-${value.id}`} onClick={() => void changePriceStatus(value, 'RETIRED')}>停用</Button>
                              </>
                            )}
                            {value.organizationId === organization.id && value.sdStatus === 'SUSPENDED' && (
                              <Button size="sm" variant="text" disabled={!editable} busy={pending === `p-${value.id}`} onClick={() => void changePriceStatus(value, 'ACTIVE')}>恢复</Button>
                            )}
                          </RowActions>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
      </>}
    </div>
  </Dialog>
}

export function OrganizationCatalogImportDialog({ api, organization, initialItemType, onClose, onCompleted }: {
  api: RhnApi; organization: Organization; initialItemType: 'SERVICE' | 'MED_PRODUCT'
  onClose: () => void; onCompleted: () => Promise<void>
}) {
  const scope = catalogImportScope(api, organization.id)
  return <OrganizationCatalogImportSession key={scope} api={api} organization={organization} initialItemType={initialItemType}
    onClose={onClose} onCompleted={onCompleted} scope={scope} />
}

export function OrganizationCatalogImportSession({ api, organization, initialItemType, onClose, onCompleted, scope }: {
  api: RhnApi; organization: Organization; initialItemType: 'SERVICE' | 'MED_PRODUCT'
  onClose: () => void; onCompleted: () => Promise<void>; scope: string
}) {
  const queryClient = useQueryClient()
  const attemptKey = ['organization-catalog-import-attempt', scope]
  const [attempt, setAttempt] = useState<CatalogImportAttempt | undefined>(() => queryClient.getQueryData(attemptKey))
  const [result, setResult] = useState<CatalogChangeBatch>()
  const active = useRef(true), busy = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [itemType, setItemType] = useState<'SERVICE' | 'MED_PRODUCT'>(attempt?.items[0].itemType ?? initialItemType)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [businessDate, setBusinessDate] = useState(attempt?.input.businessDate ?? today())
  const [selected, setSelected] = useState<Map<string, CatalogAdoptionCandidate>>(() => new Map(attempt?.items.map(item => [item.id, item])))
  const [pending, setPending] = useState(false)
  const [operationError, setOperationError] = useState(attempt ? '上次调入结果待核实，请使用原请求重新核实本批结果。' : '')
  const locked = pending || Boolean(attempt)
  const dateReady = /^\d{4}-\d{2}-\d{2}$/.test(businessDate) && Number.isFinite(Date.parse(businessDate))
  const terminal = result && result.status !== 'PROCESSING'

  const handleSearch = () => {
    setQuery(keyword.trim())
    setPage(0)
  }

  const handleReset = () => {
    setKeyword('')
    setQuery('')
    setPage(0)
  }

  const handleItemTypeChange = (value: string) => {
    if (locked) return
    setSelected(new Map())
    setItemType(value as 'SERVICE' | 'MED_PRODUCT')
    setKeyword('')
    setQuery('')
    setPage(0)
  }

  const candidates = useQuery({
    queryKey: ['master-data-adoption-candidates', scope, itemType, query, businessDate, page, pageSize],
    queryFn: async () => requireImportCandidates(await api.masterData.adoptionCandidates(
      organization.id, itemType, query, page, pageSize, businessDate, true,
    ), { organizationId: organization.id, itemType, page, size: pageSize }),
    enabled: dateReady && !locked,
  })
  useEffect(() => { setPage(0) }, [query, pageSize])
  const candidatesReady = !locked && dateReady && candidates.isSuccess && !candidates.isFetching
  const values = candidatesReady ? candidates.data.content : []
  const totalPages = Math.max(1, candidates.data?.totalPages ?? 1)
  const toggle = (value: CatalogAdoptionCandidate) => setSelected((current) => {
    if (locked || !candidatesReady) return current
    const next = new Map(current)
    if (next.has(value.id)) next.delete(value.id); else next.set(value.id, value)
    return next
  })
  const allPageSelected = values.length > 0 && values.every((value) => selected.has(value.id))
  const selectedValues = [...selected.values()]
  const remember = (value: CatalogImportAttempt) => {
    setAttempt(value)
    queryClient.setQueryDefaults(attemptKey, { gcTime: Infinity })
    queryClient.setQueryData(attemptKey, value)
  }
  const execute = async (command: CatalogImportAttempt) => {
    if (busy.current) return
    busy.current = true
    setPending(true); setOperationError('')
    try {
      const receipt = requireImportReceipt(command.batchId
        ? await api.masterData.catalogChangeBatch(command.batchId)
        : await api.masterData.adoptionBatch(command.input), command)
      if (!active.current) return
      remember({ ...command, batchId: receipt.id })
      setResult(receipt)
      if (receipt.status !== 'PROCESSING') {
        queryClient.removeQueries({ queryKey: attemptKey, exact: true })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['master-data-adoption-candidates'] }),
          queryClient.invalidateQueries({ queryKey: ['organization-catalog'] }),
        ])
      }
    } catch (error) {
      if (active.current) setOperationError(`调入结果未确认：${errorMessage(error)}`)
    } finally {
      busy.current = false
      if (active.current) setPending(false)
    }
  }
  const submit = async (form: FormData) => {
    if (busy.current || attempt) return
    if (!candidatesReady || !dateReady) { setOperationError('待调入目录尚未确认，请重新加载'); return }
    if (!selected.size || selected.size > 500) { setOperationError('请选择 1 至 500 个待调入项目'); return }
    const command: CatalogImportAttempt = { items: [...selected.values()], input: {
      requestCode: crypto.randomUUID(), operationType: 'ADOPT', organizationId: organization.id, businessDate,
      catalogItemIds: [...selected.keys()], template: { localCode: undefined, localName: undefined,
        orderable: checked(form, 'orderable'), executable: checked(form, 'executable'),
        chargeable: checked(form, 'chargeable'), purchasable: checked(form, 'purchasable'),
        stocked: checked(form, 'stocked'), dispensable: checked(form, 'dispensable'),
        returnable: checked(form, 'returnable'), status: 'ACTIVE' },
    } }
    remember(command)
    await execute(command)
  }
  const finish = async () => {
    if (busy.current || !terminal || result.status !== 'COMPLETED') return
    busy.current = true; setPending(true); setOperationError('')
    try { await onCompleted() }
    catch (error) { if (active.current) setOperationError(`调入已完成，但列表刷新失败：${errorMessage(error)}`) }
    finally { busy.current = false; if (active.current) setPending(false) }
  }
  const continueFailed = () => {
    if (pending || !terminal || !attempt) return
    const failedIds = new Set(result.rows.filter(row => row.status === 'FAILED').map(row => row.catalogItemId))
    setSelected(new Map(attempt.items.filter(item => failedIds.has(item.id)).map(item => [item.id, item])))
    setAttempt(undefined); setResult(undefined); setOperationError('')
    void candidates.refetch()
  }
  return <Dialog title="机构项目调入" eyebrow={organization.name} size="xwide" onClose={() => { if (!busy.current) onClose() }}
    className="master-data-catalog-import-dialog"
    description="仅展示当前生效日期下尚未调入的中心目录项目；本批项目将共用同一套机构业务能力。"
    footer={<div className="master-data-catalog-import-footer">
      <span>本批已选 <strong>{selected.size}</strong> 项</span>
      <div><Button variant="secondary" disabled={pending} onClick={onClose}>关闭</Button>
        {terminal ? result.status === 'COMPLETED'
          ? <Button busy={pending} onClick={() => void finish()}>完成并刷新列表</Button>
          : <Button disabled={pending} onClick={continueFailed}>继续处理失败项</Button>
          : attempt ? <Button busy={pending} onClick={() => void execute(attempt)}>核实本批结果</Button>
          : <Button type="submit" form="organization-catalog-import-form"
            disabled={!selected.size || selected.size > 500 || !candidatesReady} busy={pending}>
            确认调入 {selected.size ? `${selected.size} 项` : ''}
          </Button>}
      </div>
    </div>}>
    <div className="master-data-catalog-import">
      {operationError && <div role="alert">{operationError}</div>}
      {attempt && !terminal && <div role="status">请求号：{attempt.input.requestCode}。配置已锁定，核实使用原请求内容；本页面内关闭后重新打开仍可继续核实。</div>}
      {result && <div role="status">{result.status === 'PROCESSING' ? '批次仍在处理，尚未确认完成' : result.status === 'COMPLETED'
        ? `全部调入完成：${result.succeededRows} 项` : `本批调入成功 ${result.succeededRows} 项，失败 ${result.failedRows} 项`} · 批次 {result.id}</div>}
      <form id="organization-catalog-import-form" inert={locked && !result} onSubmit={(event) => {
        event.preventDefault(); void submit(new FormData(event.currentTarget))
      }}>
        <div className="master-data-catalog-import-toolbar">
          <Tabs value={itemType} onChange={handleItemTypeChange} label="待调入目录类型" variant="line"
            items={[{ value: 'SERVICE', label: '诊疗项目' }, { value: 'MED_PRODUCT', label: '药品产品' }]} />
          <div className="master-data-catalog-import-search">
            <SearchField label="搜索待调入目录" disabled={locked} value={keyword} onChange={setKeyword} onSearch={handleSearch}
              placeholder="项目名称或编码" />
            <Button size="sm" variant="primary" type="button" disabled={locked} onClick={handleSearch}>查询</Button>
            <Button size="sm" variant="secondary" type="button" disabled={locked} onClick={handleReset}>重置</Button>
          </div>
          <span className="master-data-count">{candidatesReady ? `${candidates.data.totalElements} 项待调入` : '待调入数量未确认'}</span>
        </div>

        <div className="master-data-catalog-import-workspace">
          <section className="master-data-catalog-import-candidates" aria-label="待调入中心目录">
            <header><div><h3>待调入中心目录</h3><p>勾选后加入右侧本批清单，支持跨页累计选择。</p></div>
              <Button size="sm" variant="text" disabled={locked || !values.length} onClick={() => setSelected((current) => {
                const next = new Map(current)
                values.forEach((value) => allPageSelected ? next.delete(value.id) : next.set(value.id, value))
                return next
              })}>{allPageSelected ? '取消本页选择' : '选择本页'}</Button></header>
            {result ? <TableShell scrollLabel="本批调入逐项结果"><DataTable compact>
              <thead><tr><th>项目</th><th>结果</th><th>说明</th></tr></thead>
              <tbody>{result.rows.map(row => <tr key={row.id}>
                <td>{attempt?.items.find(item => item.id === row.catalogItemId)?.name}<code>{row.catalogItemId}</code></td>
                <td>{row.status === 'SUCCEEDED' ? '已调入' : '失败'}</td>
                <td>{row.status === 'SUCCEEDED' ? `采用记录：${row.targetId}` : `${row.errorCode}：${row.errorMessage}`}</td>
              </tr>)}</tbody></DataTable></TableShell>
              : attempt ? <EmptyState icon="clinical" title="等待核实本批结果" copy="使用下方核实按钮读取原批次的实际结果。" />
              : !dateReady ? <EmptyState icon="clinical" title="请选择生效日期" copy="选择日期后读取对应的待调入目录。" />
              : candidates.isFetching || candidates.isPending ? <LoadingState label="正在读取待调入目录…" />
              : candidates.isError ? <div role="alert">待调入目录加载失败：{errorMessage(candidates.error)}
                <Button size="sm" variant="text" onClick={() => void candidates.refetch()}>重新加载待调入目录</Button></div>
              : !values.length
              ? candidates.data!.totalElements > 0 ? <div>当前页已无项目<Button size="sm" variant="text" onClick={() => setPage(0)}>返回第一页</Button></div>
              : <EmptyState icon="clinical" title={query ? '没有匹配的待调入项目' : '没有待调入项目'}
                copy={query ? '请调整查询条件。' : '本次查询没有可调入项目。'} />
              : <TableShell className="master-data-catalog-import-table" scrollLabel="待调入中心目录列表"
                resetScrollKey={`${itemType}-${query}-${businessDate}-${page}`}
                footer={<Pagination page={page} totalPages={totalPages}
                  total={candidates.data!.totalElements} pageSize={pageSize} onPageSizeChange={setPageSize}
                  onChange={setPage} label="待调入目录分页" />}>
                <DataTable compact>
                  <thead><tr><th className="master-data-select-column">选择</th><th>中心项目</th><th>中心编码</th><th>目录信息</th></tr></thead>
                  <tbody>{values.map((value) => <tr key={value.id} className={selected.has(value.id) ? 'is-selected' : ''}>
                    <td><input type="checkbox" aria-label={`选择 ${value.name}`} checked={selected.has(value.id)}
                      onChange={() => toggle(value)} /></td>
                    <td><strong>{value.name}</strong></td>
                    <td><code>{value.code}</code></td>
                    <td>{itemType === 'MED_PRODUCT'
                      ? value.packages.length ? `${value.packages.length} 种有效包装` : '暂无有效包装'
                      : '诊疗服务项目'}</td>
                  </tr>)}</tbody>
                </DataTable>
              </TableShell>}
          </section>

          <aside className="master-data-catalog-import-batch" aria-label="本批调入配置">
            <section className="master-data-catalog-import-selected">
              <header><div><h3>本批调入清单</h3><p>共用下方生效日期和业务能力。</p></div>
                <Button size="sm" variant="text" disabled={locked || !selected.size}
                  onClick={() => setSelected(new Map())}>清空</Button></header>
              {!selectedValues.length ? <div className="master-data-catalog-import-selected-empty">
                <Icon name="tasks" /><strong>尚未选择项目</strong><span>从左侧勾选本批需要调入的目录项目。</span>
              </div> : <div className="master-data-catalog-import-selected-list">{selectedValues.map((value) =>
                <article key={value.id}><div><strong>{value.name}</strong><code>{value.code}</code></div>
                  <Button size="sm" variant="text" aria-label={`移除 ${value.name}`} title="移除" disabled={locked}
                    onClick={() => toggle(value)}><Icon name="close" /></Button></article>)}</div>}
            </section>
            <section className="master-data-catalog-import-config">
              <header><div><h3>机构业务能力</h3><p>{itemType === 'SERVICE'
                ? '配置项目在本机构的开立、执行和收费能力。'
                : '配置药品产品从采购入库到发药退回的业务能力。'}</p></div></header>
              <FormField label="生效日期" required><input name="businessDate" type="date" disabled={locked} value={businessDate}
                onChange={(event) => { setBusinessDate(event.target.value); setPage(0); setSelected(new Map()) }} required /></FormField>
              <Checkboxes key={itemType} title={itemType === 'SERVICE' ? '诊疗业务范围' : '药品业务范围'}>
                <Checkbox disabled={locked} name="orderable" label="允许开立" defaultChecked={attempt?.input.template?.orderable ?? true} />
                {itemType === 'SERVICE' && <Checkbox disabled={locked} name="executable" label="允许执行" defaultChecked={attempt?.input.template?.executable ?? true} />}
                <Checkbox disabled={locked} name="chargeable" label="允许收费" defaultChecked={attempt?.input.template?.chargeable ?? true} />
                {itemType === 'MED_PRODUCT' && <>
                  <Checkbox disabled={locked} name="purchasable" label="允许采购" defaultChecked={attempt?.input.template?.purchasable ?? true} />
                  <Checkbox disabled={locked} name="stocked" label="允许入库" defaultChecked={attempt?.input.template?.stocked ?? true} />
                  <Checkbox disabled={locked} name="dispensable" label="允许发放" defaultChecked={attempt?.input.template?.dispensable ?? true} />
                  <Checkbox disabled={locked} name="returnable" label="允许退药/退库" defaultChecked={attempt?.input.template?.returnable ?? true} />
                </>}
              </Checkboxes>
            </section>
          </aside>
        </div>
      </form>
    </div>
  </Dialog>
}

export function capabilityLabel(value: keyof AdoptionDefaults) {
  return ({ orderable: '允许开立', executable: '允许执行', chargeable: '允许收费', purchasable: '允许采购',
    stocked: '允许入库', dispensable: '允许发放', returnable: '允许退药/退库' } as const)[value]
}

export function capabilityShortLabels(value: OrganizationAdoption) {
  const short: Record<keyof AdoptionDefaults, string> = { orderable: '开立', executable: '执行', chargeable: '收费',
    purchasable: '采购', stocked: '入库', dispensable: '发放', returnable: '退药/退库' }
  return (['orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable'] as const)
    .filter((key) => value[key]).map((key) => short[key])
}
