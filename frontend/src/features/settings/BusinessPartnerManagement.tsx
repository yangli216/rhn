import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Organization } from '../../shared/model'
import {
  errorMessage, type DictionaryValue, type Manufacturer, type ManufacturerInput,
  type RhnApi, type Supplier, type SupplierInput,
} from '../../shared/rhnApi'
import {
  Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel,
  Select, StatusBadge,
} from '../../shared/ui'

type PartnerTab = 'manufacturers' | 'suppliers'
const today = () => new Date().toISOString().slice(0, 10)
const statusText: Record<string, string> = {
  ACTIVE: '已启用', SUSPENDED: '已禁用', RETIRED: '已停用',
  DRAFT: '草稿', PENDING_REVIEW: '待审核', PUBLISHED: '已发布', REPLACED: '已替代',
}

export function BusinessPartnerManagement({ api, organization }: { api: RhnApi; organization: Organization }) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab: PartnerTab = params.get('tab') === 'suppliers' ? 'suppliers' : 'manufacturers'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [manufacturerDialog, setManufacturerDialog] = useState<Manufacturer | null | undefined>()
  const [supplierDialog, setSupplierDialog] = useState<Supplier | null | undefined>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [pendingId, setPendingId] = useState('')

  const dictionaries = useQuery({
    queryKey: ['partner-maintenance-dictionaries'],
    queryFn: async () => ({
      types: await api.dictionaries.resolve('BD_MANUFACTURER_TYPE'),
      places: await api.dictionaries.resolve('BD_PRODUCTION_PLACE'),
    }), staleTime: 5 * 60 * 1000,
  })
  const manufacturers = useQuery({
    queryKey: ['partner-manufacturers', query], queryFn: () => api.masterData.manufacturers(query),
    enabled: tab === 'manufacturers',
  })
  const suppliers = useQuery({
    queryKey: ['partner-suppliers', organization.id, query, status],
    queryFn: () => api.pharmacy.suppliers(organization.id, query, status), enabled: tab === 'suppliers',
  })
  const visibleManufacturers = useMemo(() => (manufacturers.data ?? [])
    .filter((value) => !status || value.sdStatus === status), [manufacturers.data, status])

  const switchTab = (next: PartnerTab) => {
    setParams({ tab: next }); setQuery(''); setStatus(''); setFeedback(''); setOperationError('')
  }
  const refresh = async (message: string) => {
    await queryClient.invalidateQueries({ predicate: (value) => String(value.queryKey[0]).startsWith('partner-') })
    await queryClient.invalidateQueries({ queryKey: ['master-data-manufacturers'] })
    await queryClient.invalidateQueries({ queryKey: ['warehouse-suppliers'] })
    setFeedback(message); setOperationError('')
  }
  const changeManufacturerStatus = async (value: Manufacturer) => {
    setPendingId(value.id); setFeedback(''); setOperationError('')
    try {
      await api.masterData.manufacturerStatus(value.id, value.revision,
        value.sdStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
      await refresh(value.sdStatus === 'ACTIVE' ? '生产企业已禁用' : '生产企业已启用')
    } catch (error) { setOperationError(errorMessage(error)) } finally { setPendingId('') }
  }
  const changeSupplierStatus = async (value: Supplier) => {
    setPendingId(value.id); setFeedback(''); setOperationError('')
    try {
      await api.pharmacy.supplierStatus(value.id, value.revision,
        value.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
      await refresh(value.status === 'ACTIVE' ? '供应商已禁用' : '供应商已启用')
    } catch (error) { setOperationError(errorMessage(error)) } finally { setPendingId('') }
  }
  const currentError = dictionaries.error || manufacturers.error || suppliers.error
  const count = tab === 'manufacturers' ? visibleManufacturers.length : (suppliers.data?.length ?? 0)

  return <>
    <PageHeader eyebrow="平台管理 · 基础档案" title="厂商与供应商"
      description="集中维护药品生产主体和机构采购供应商；药品、耗材和采购业务只引用档案。"
      actions={<Button onClick={() => tab === 'manufacturers' ? setManufacturerDialog(null) : setSupplierDialog(null)}
        disabled={tab === 'manufacturers' && !dictionaries.data}><Icon name="add" />
        新增{tab === 'manufacturers' ? '生产企业' : '供应商'}</Button>} />
    {feedback && <Alert tone="success" className="partner-feedback">{feedback}</Alert>}
    {(operationError || currentError) && <Alert className="partner-feedback">{operationError || errorMessage(currentError)}</Alert>}
    <Panel className="partner-panel">
      <div className="master-data-tabs" role="tablist" aria-label="业务主体类型">
        <button type="button" role="tab" aria-selected={tab === 'manufacturers'}
          className={tab === 'manufacturers' ? 'is-active' : ''} onClick={() => switchTab('manufacturers')}>
          <strong>生产企业</strong><small>租户统一 · 产品引用</small></button>
        <button type="button" role="tab" aria-selected={tab === 'suppliers'}
          className={tab === 'suppliers' ? 'is-active' : ''} onClick={() => switchTab('suppliers')}>
          <strong>药品供应商</strong><small>机构维护 · 采购引用</small></button>
      </div>
      <div className="partner-toolbar">
        <label className="dictionary-search"><Icon name="search" /><span className="visually-hidden">搜索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'manufacturers' ? '搜索企业名称、简称或编码' : '搜索供应商、编码、证照或联系人'} /></label>
        <Select value={status} onChange={setStatus} placeholder="全部状态" showValue options={[
          { value: 'ACTIVE', label: '已启用' }, { value: 'SUSPENDED', label: '已禁用' },
          { value: 'RETIRED', label: '已停用' },
        ]} />
        <span className="partner-toolbar__count">{count} 条</span>
      </div>
      {tab === 'manufacturers' ? <ManufacturerTable values={visibleManufacturers} loading={manufacturers.isPending}
        pendingId={pendingId} onEdit={setManufacturerDialog} onStatus={changeManufacturerStatus} />
        : <SupplierTable values={suppliers.data ?? []} loading={suppliers.isPending} pendingId={pendingId}
          onEdit={setSupplierDialog} onStatus={changeSupplierStatus} />}
    </Panel>
    {manufacturerDialog !== undefined && dictionaries.data && <ManufacturerEditor value={manufacturerDialog ?? undefined}
      types={dictionaries.data.types} places={dictionaries.data.places} onClose={() => setManufacturerDialog(undefined)}
      onSave={async (input) => {
        if (manufacturerDialog) await api.masterData.updateManufacturer(manufacturerDialog.id, manufacturerDialog.revision, input)
        else await api.masterData.createManufacturer(input)
        setManufacturerDialog(undefined); await refresh(manufacturerDialog ? '生产企业已更新' : '生产企业已创建')
      }} />}
    {supplierDialog !== undefined && <SupplierEditor organization={organization} value={supplierDialog ?? undefined}
      onClose={() => setSupplierDialog(undefined)} onSave={async (input) => {
        if (supplierDialog) await api.pharmacy.updateSupplier(supplierDialog.id, supplierDialog.revision, {
          ...input, status: supplierDialog.status, validFrom: input.validFrom ?? today(),
        })
        else await api.pharmacy.createSupplier(input)
        setSupplierDialog(undefined); await refresh(supplierDialog ? '供应商已更新' : '供应商已创建')
      }} />}
  </>
}

function ManufacturerTable({ values, loading, pendingId, onEdit, onStatus }: {
  values: Manufacturer[]; loading: boolean; pendingId: string
  onEdit: (value: Manufacturer) => void; onStatus: (value: Manufacturer) => void
}) {
  if (loading) return <LoadingState label="正在加载生产企业…" />
  if (!values.length) return <EmptyState icon="clinical" title="未找到生产企业" copy="请调整筛选条件或新增企业档案。" />
  return <div className="dictionary-table-wrap"><table className="dictionary-table partner-table"><thead><tr>
    <th>企业</th><th>主体类型</th><th>生产地</th><th>国家 / 地址</th><th>状态</th><th>操作</th>
  </tr></thead><tbody>{values.map((value) => <tr key={value.id}>
    <td><strong>{value.name}</strong><code>{value.code}</code><small>{value.shortName || '未维护简称'}</small></td>
    <td>{value.sdManufacturerTypeText}</td><td>{value.sdProductionPlaceText || '—'}</td>
    <td>{value.countryCode || '—'}<small>{value.address || '未维护地址'}</small></td>
    <td><PartnerStatus status={value.sdStatus} text={value.sdStatusText} /></td>
    <td><div className="dictionary-row-actions"><Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑</Button>
      {value.sdStatus !== 'RETIRED' && <Button size="sm" variant="text" busy={pendingId === value.id}
        onClick={() => onStatus(value)}>{value.sdStatus === 'ACTIVE' ? '禁用' : '启用'}</Button>}</div></td>
  </tr>)}</tbody></table></div>
}

function SupplierTable({ values, loading, pendingId, onEdit, onStatus }: {
  values: Supplier[]; loading: boolean; pendingId: string
  onEdit: (value: Supplier) => void; onStatus: (value: Supplier) => void
}) {
  if (loading) return <LoadingState label="正在加载供应商…" />
  if (!values.length) return <EmptyState icon="pharmacy" title="未找到供应商" copy="请调整筛选条件或新增机构供应商。" />
  return <div className="dictionary-table-wrap"><table className="dictionary-table partner-table"><thead><tr>
    <th>供应商</th><th>资质</th><th>联系方式</th><th>业务有效期</th><th>状态</th><th>操作</th>
  </tr></thead><tbody>{values.map((value) => <tr key={value.id}>
    <td><strong>{value.name}</strong><code>{value.code}</code><small>{value.unifiedCreditCode || '未维护统一信用代码'}</small></td>
    <td>{value.licenseNo || '—'}<small>{value.licenseValidTo ? `有效至 ${value.licenseValidTo}` : '未设置资质到期日'}</small></td>
    <td>{value.contactName || '—'}<small>{value.contactPhone || '未维护电话'}</small></td>
    <td>{value.validFrom}<small>{value.validTo ? `至 ${value.validTo}` : '长期有效'}</small></td>
    <td><PartnerStatus status={value.status} /></td>
    <td><div className="dictionary-row-actions"><Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑</Button>
      {value.status !== 'RETIRED' && <Button size="sm" variant="text" busy={pendingId === value.id}
        onClick={() => onStatus(value)}>{value.status === 'ACTIVE' ? '禁用' : '启用'}</Button>}</div></td>
  </tr>)}</tbody></table></div>
}

function PartnerStatus({ status, text }: { status: string; text?: string }) {
  return <StatusBadge tone={status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'warning' : 'neutral'}>
    {text || statusText[status] || status}</StatusBadge>
}

function ManufacturerEditor({ value, types, places, onClose, onSave }: {
  value?: Manufacturer; types: DictionaryValue[]; places: DictionaryValue[]
  onClose: () => void; onSave: (input: ManufacturerInput) => Promise<void>
}) {
  const [code, setCode] = useState(value?.code ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [shortName, setShortName] = useState(value?.shortName ?? '')
  const [type, setType] = useState(value?.sdManufacturerType ?? 'DRUG')
  const [place, setPlace] = useState(value?.sdProductionPlace ?? 'DOMESTIC')
  const [countryCode, setCountryCode] = useState(value?.countryCode ?? 'CN')
  const [address, setAddress] = useState(value?.address ?? '')
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true); setError('')
    try { await onSave({ code: code.trim(), name: name.trim(), shortName: shortName.trim() || undefined,
      sdManufacturerType: type, sdProductionPlace: place || undefined, countryCode: countryCode.trim() || undefined,
      address: address.trim() || undefined, sdStatus: value?.sdStatus ?? 'ACTIVE' }) }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  return <Dialog title={value ? '编辑生产企业' : '新增生产企业'} eyebrow="生产主体档案" size="wide"
    description="企业档案由租户统一管理，药品产品和耗材只保存引用。" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={busy}
      disabled={!code.trim() || !name.trim() || !type} onClick={() => void submit()}>保存</Button></>}>
    {error && <Alert>{error}</Alert>}<div className="partner-form-grid">
      <FormField label="企业编码" required><input className="ui-field__control" autoFocus value={code} onChange={(e) => setCode(e.target.value)} /></FormField>
      <FormField label="企业名称" required><input className="ui-field__control" value={name} onChange={(e) => setName(e.target.value)} /></FormField>
      <FormField label="企业简称"><input className="ui-field__control" value={shortName} onChange={(e) => setShortName(e.target.value)} /></FormField>
      <FormField label="主体类型" required><Select value={type} onChange={setType} clearable={false} showValue
        options={types.map(option)} /></FormField>
      <FormField label="生产地类别"><Select value={place} onChange={setPlace} showValue options={places.map(option)} /></FormField>
      <FormField label="国家 / 地区代码"><input className="ui-field__control" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} /></FormField>
      <FormField label="注册或生产地址" className="partner-form-grid__wide"><input className="ui-field__control" value={address} onChange={(e) => setAddress(e.target.value)} /></FormField>
    </div>
  </Dialog>
}

function SupplierEditor({ organization, value, onClose, onSave }: {
  organization: Organization; value?: Supplier; onClose: () => void; onSave: (input: SupplierInput) => Promise<void>
}) {
  const [code, setCode] = useState(value?.code ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [creditCode, setCreditCode] = useState(value?.unifiedCreditCode ?? '')
  const [licenseNo, setLicenseNo] = useState(value?.licenseNo ?? '')
  const [licenseValidTo, setLicenseValidTo] = useState(value?.licenseValidTo ?? '')
  const [contactName, setContactName] = useState(value?.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(value?.contactPhone ?? '')
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? today())
  const [validTo, setValidTo] = useState(value?.validTo ?? '')
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true); setError('')
    try { await onSave({ organizationId: organization.id, code: code.trim(), name: name.trim(),
      unifiedCreditCode: creditCode.trim() || undefined, licenseNo: licenseNo.trim() || undefined,
      licenseValidTo: licenseValidTo || undefined, contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined, validFrom, validTo: validTo || undefined }) }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  return <Dialog title={value ? '编辑药品供应商' : '新增药品供应商'} eyebrow={organization.name} size="wide"
    description="供应商按机构维护，资质和业务有效期将用于采购校验。" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={busy}
      disabled={!code.trim() || !name.trim() || !validFrom} onClick={() => void submit()}>保存</Button></>}>
    {error && <Alert>{error}</Alert>}<div className="partner-form-grid">
      <FormField label="供应商编码" required><input className="ui-field__control" autoFocus value={code} onChange={(e) => setCode(e.target.value)} /></FormField>
      <FormField label="供应商名称" required><input className="ui-field__control" value={name} onChange={(e) => setName(e.target.value)} /></FormField>
      <FormField label="统一社会信用代码"><input className="ui-field__control" value={creditCode} onChange={(e) => setCreditCode(e.target.value)} /></FormField>
      <FormField label="许可证号"><input className="ui-field__control" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} /></FormField>
      <FormField label="资质有效期"><input className="ui-field__control" type="date" value={licenseValidTo} onChange={(e) => setLicenseValidTo(e.target.value)} /></FormField>
      <FormField label="联系人"><input className="ui-field__control" value={contactName} onChange={(e) => setContactName(e.target.value)} /></FormField>
      <FormField label="联系电话"><input className="ui-field__control" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></FormField>
      <FormField label="业务生效日" required><input className="ui-field__control" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></FormField>
      <FormField label="业务失效日"><input className="ui-field__control" type="date" min={validFrom} value={validTo} onChange={(e) => setValidTo(e.target.value)} /></FormField>
    </div>
  </Dialog>
}

const option = (value: DictionaryValue) => ({ value: value.code, label: value.name, secondaryText: value.code })
