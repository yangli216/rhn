import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type {
  ClinicalConfiguration, DiagnosticChargeLine, DictionaryValue, ExaminationChargePlan, ExaminationProfileInput, ExaminationVariantConfiguration, ExaminationVariantInput,
  ExaminationAttachmentConfiguration, ExaminationAttachmentInput,
  Department, ItemGroup, ItemGroupInput, LaboratoryProfile, Manufacturer, RhnApi, ServiceCatalogItem,
  LaboratoryTubePlan, SpecimenConfiguration, SpecimenConfigurationInput, SupplyInput, SupplyItem, UnitConversion,
  UnitConversionInput, UnitDefinition, OrderFrequency, OrderFrequencyConfiguration,
  OrderFrequencyConfigurationInput, OrderFrequencyInput, OrderFrequencyRuleType,
} from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { Organization } from '../../shared/model'
import {
  Alert, Button, DataTable as UiDataTable, Dialog, EmptyState, FormField, Icon, LoadingState, Select,
  StatusBadge, TableShell, Tabs,
} from '../../shared/ui'

type Area = 'group' | 'supply' | 'unit' | 'frequency'
const today = () => new Date().toISOString().slice(0, 10)
const activeStatus = [{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }]
const dimensions = [
  ['COUNT', '计数'], ['MASS', '质量'], ['VOLUME', '体积'], ['TIME', '时间'], ['LENGTH', '长度'],
  ['AREA', '面积'], ['ACTIVITY', '活度'], ['TEMPERATURE', '温度'], ['OTHER', '其它'],
].map(([value, label]) => ({ value, label }))

export function OperationalMasterDataPanel({ api, organization, manufacturers }: {
  api: RhnApi; organization: Organization; manufacturers: Manufacturer[]
}) {
  const client = useQueryClient()
  const [area, setArea] = useState<Area>('group')
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const services = useQuery({ queryKey: ['master-data-services-operational', organization.id],
    queryFn: () => api.masterData.services('', '', '', organization.id) })
  const supplies = useQuery({ queryKey: ['master-data-operational-supplies'], queryFn: () => api.masterData.supplies(), enabled: area === 'supply' || area === 'unit' })
  const groups = useQuery({ queryKey: ['master-data-operational-groups'], queryFn: () => api.masterData.itemGroups(), enabled: area === 'group' })
  const units = useQuery({ queryKey: ['master-data-operational-units'], queryFn: () => api.masterData.units(), enabled: area === 'unit' || area === 'supply' })
  const conversions = useQuery({ queryKey: ['master-data-operational-conversions'], queryFn: () => api.masterData.unitConversions(), enabled: area === 'unit' })
  const frequencies = useQuery({ queryKey: ['master-data-operational-frequencies'],
    queryFn: () => api.masterData.orderFrequencies(), enabled: area === 'frequency' })
  const departments = useQuery({ queryKey: ['master-data-operational-frequency-departments', organization.id],
    queryFn: () => api.organization.departments(organization.id), enabled: area === 'frequency' })

  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await client.invalidateQueries({ predicate: ({ queryKey }) => String(queryKey[0] ?? '').startsWith('master-data-operational') })
    await client.invalidateQueries({ predicate: ({ queryKey }) => String(queryKey[0] ?? '').includes('active-order-frequencies') })
    await client.invalidateQueries({ queryKey: ['master-data-services'] })
  }
  const execute = (message: string, task: Promise<unknown>) => task.then(() => invalidate(message)).catch((error) => setOperationError(errorMessage(error)))

  return <div className="operational-master-data">
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {operationError && <Alert>{operationError}</Alert>}
    <Tabs value={area} onChange={setArea} label="运营主数据类型" variant="cards" items={[
      { value: 'group', label: '项目组套', meta: 'LIS/PACS 组套与组合项目' },
      { value: 'supply', label: '耗材与器械', meta: 'UDI、注册证、型号与库存属性' },
      { value: 'unit', label: '计量与换算', meta: '统一单位、全局/项目换算' },
      { value: 'frequency', label: '医嘱频次', meta: '规则语义、适用场景与执行时点' },
    ]} />
    {area === 'group' && <ListSection title="项目组套" copy="LIS 只能选检验项目，PACS 只能选检查项目；服务端会再次校验。"
      action={<Button onClick={() => setDialog(<GroupDialog services={services.data ?? []} organization={organization} units={units.data ?? []}
        onClose={() => setDialog(undefined)} onSave={(input) => execute('项目组套已新增', api.masterData.createItemGroup(input))} />)}><Icon name="add" />新增组套</Button>}>
      {groups.isPending ? <LoadingState label="正在加载项目组套…" /> : !groups.data?.length
        ? <EmptyState icon="clinical" title="暂无项目组套" copy="可建立检验组套、检查组套或常用组合项目。" />
        : <DataTable headers={['组套', '类型', '适用范围', '成员', '状态', '操作']} rows={groups.data.map((value) => [
          <b>{value.name}<code>{value.code}</code></b>, value.groupType,
          value.organizationId ? organization.name : '租户通用', `${value.members.length} 项`, <State value={value.status} />,
          <Button size="sm" variant="text" onClick={() => setDialog(<GroupDialog value={value} services={services.data ?? []} organization={organization} units={units.data ?? []}
            onClose={() => setDialog(undefined)} onSave={(input) => execute('项目组套已更新', api.masterData.updateItemGroup(value, input))} />)}>编辑</Button>,
        ])} />}
    </ListSection>}
    {area === 'supply' && <ListSection title="医用耗材/器械主数据" copy="统一维护编码、UDI-DI、注册信息、供应商和库存能力。"
      action={<Button onClick={() => setDialog(<SupplyDialog units={units.data ?? []} manufacturers={manufacturers} onClose={() => setDialog(undefined)}
        onSave={(input) => execute('耗材/器械已新增', api.masterData.createSupply(input))} />)}><Icon name="add" />新增耗材/器械</Button>}>
      {supplies.isPending ? <LoadingState label="正在加载耗材与器械…" /> : !supplies.data?.length
        ? <EmptyState icon="pharmacy" title="暂无耗材/器械资料" copy="可先维护单位，再建立耗材或器械主档。" />
        : <DataTable headers={['名称/编码', '类型/型号', 'UDI/注册证', '经营属性', '状态', '操作']} rows={supplies.data.map((value) => [
          <b>{value.name}<code>{value.code}</code></b>, `${value.supplyType === 'DEVICE' ? '医疗器械' : '医用耗材'}${value.modelName ? ` · ${value.modelName}` : ''}`,
          <span>{value.udiDi || '—'}<small>{value.registrationCode || '未维护注册证'}</small></span>,
          [value.stocked && '库存', value.chargeable && '收费', value.highValue && '高值', value.implant && '植入'].filter(Boolean).join(' · ') || '—',
          <State value={value.status} />, <Button size="sm" variant="text" onClick={() => setDialog(<SupplyDialog value={value} units={units.data ?? []} manufacturers={manufacturers}
            onClose={() => setDialog(undefined)} onSave={(input) => execute('耗材/器械已更新', api.masterData.updateSupply(value, input))} />)}>编辑</Button>,
        ])} />}
    </ListSection>}
    {area === 'unit' && <UnitWorkspace api={api} units={units.data ?? []} conversions={conversions.data ?? []}
      catalogItems={[...(services.data ?? []), ...(supplies.data ?? [])]}
      loading={units.isPending || conversions.isPending} onDialog={setDialog} onDone={invalidate} onError={(e) => setOperationError(errorMessage(e))} />}
    {area === 'frequency' && <FrequencyWorkspace api={api} organization={organization}
      departments={departments.data ?? []} values={frequencies.data ?? []}
      loading={frequencies.isPending || departments.isPending} onDialog={setDialog}
      onDone={invalidate} onError={(e) => setOperationError(errorMessage(e))} />}
    {dialog}
  </div>
}

export function ClinicalServiceConfigurationDialog({ api, service, organizationId, dictionaries, onClose }: {
  api: RhnApi; service: ServiceCatalogItem; organizationId: string
  dictionaries: Record<string, DictionaryValue[]>; onClose: () => void
}) {
  const client = useQueryClient()
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const configuration = useQuery({
    queryKey: ['master-data-clinical-configuration', service.id],
    queryFn: () => api.masterData.clinicalConfiguration(service.id),
  })
  const services = useQuery({
    queryKey: ['master-data-services-project-configuration', organizationId],
    queryFn: () => api.masterData.services('', '', '', organizationId),
  })
  const units = useQuery({ queryKey: ['master-data-operational-units'], queryFn: () => api.masterData.units() })
  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await client.invalidateQueries({ queryKey: ['master-data-clinical-configuration', service.id] })
    await client.invalidateQueries({ queryKey: ['master-data-services'] })
  }
  const execute = (message: string, task: Promise<unknown>) => task.then(() => invalidate(message))
    .catch((error) => setOperationError(errorMessage(error)))
  const value = configuration.data
  const allServices = services.data ?? []
  const allUnits = units.data ?? []
  const laboratory = service.sdServiceType === 'LABORATORY'
  const examination = service.sdServiceType === 'EXAMINATION'
  const supportedType = laboratory || examination
  const configurationMatchesType = Boolean(value && (laboratory
    ? value.serviceType === 'LABORATORY' && value.laboratory && !value.examination
    : examination && value.serviceType === 'EXAMINATION' && value.examination && !value.laboratory))
  const description = laboratory
    ? '统一维护检验方法、报告要求、标本容器、分管规则和试管加收；这里是该检验项目的唯一业务配置入口。'
    : '统一维护检查准备、允许部位与方式、多部位计价和附加收费；这里是该检查项目的唯一业务配置入口。'

  if (dialog) return <>{dialog}</>
  return <Dialog title={`${service.name} · 项目配置`} eyebrow="诊疗项目 · 执行与收费" size="xwide"
    className="clinical-project-dialog" onClose={onClose}
    description={description}
    footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {operationError && <Alert>{operationError}</Alert>}
    {(configuration.error || services.error || units.error) && <Alert>
      {errorMessage(configuration.error || services.error || units.error)}
    </Alert>}
    {configuration.isPending || services.isPending || units.isPending
      ? <LoadingState label="正在加载项目执行与收费配置…" />
      : !supportedType ? <Alert>当前项目类型不支持检验检查业务配置。</Alert>
        : value && !configurationMatchesType ? <Alert>项目类型与执行配置不一致，已停止展示和编辑，请联系管理员修复主数据。</Alert>
          : value && <ClinicalWorkspace api={api} value={value} services={allServices} dictionaries={dictionaries}
          unitCodes={allUnits.filter((item) => item.status === 'ACTIVE')}
          onEditProfile={() => setDialog(laboratory
            ? <LaboratoryProfileDialog value={value.laboratory!} dictionaries={dictionaries} units={allUnits}
              onClose={() => setDialog(undefined)} onSave={(input) => execute('检验项目配置已更新',
                api.masterData.updateLaboratoryProfile(service.id, value.laboratory!.revision, input))} />
            : <ExaminationProfileDialog value={value.examination!} dictionaries={dictionaries}
              services={allServices} currentServiceId={service.id} onClose={() => setDialog(undefined)}
              onSave={(input) => execute('检查项目配置已更新',
                api.masterData.updateExaminationProfile(service.id, value.examination!.revision, input))} />)}
          onSpecimen={(row) => setDialog(<SpecimenDialog value={row} configuration={value}
            units={allUnits} services={allServices} onClose={() => setDialog(undefined)}
            onSave={(input) => execute(row ? '标本配置已更新' : '标本配置已新增', row
              ? api.masterData.updateSpecimenConfiguration(service.id, row, input)
              : api.masterData.createSpecimenConfiguration(service.id, input))} />)}
          onVariant={(row) => setDialog(<VariantDialog value={row} dictionaries={dictionaries}
            onClose={() => setDialog(undefined)} onSave={(input) => execute(row ? '检查部位或方式已更新' : '检查部位或方式已新增', row
              ? api.masterData.updateExaminationVariant(service.id, row, input)
              : api.masterData.createExaminationVariant(service.id, input))} />)}
        onAttachment={(row) => setDialog(<AttachmentDialog value={row} services={allServices}
          currentServiceId={service.id} onClose={() => setDialog(undefined)}
          onSave={(input) => execute(row ? '附加收费规则已更新' : '附加收费规则已新增', row
            ? api.masterData.updateExaminationAttachment(service.id, row, input)
            : api.masterData.createExaminationAttachment(service.id, input))} />)} />}
  </Dialog>
}

function ListSection({ title, copy, action, children }: { title: string; copy: string; action: ReactNode; children: ReactNode }) {
  return <section className="operational-master-data__body"><div className="operational-master-data__toolbar">
    <div><h3>{title}</h3><p>{copy}</p></div>{action}</div>{children}</section>
}
function State({ value }: { value: string }) { return <StatusBadge tone={value === 'ACTIVE' ? 'success' : 'neutral'}>{value === 'ACTIVE' ? '启用' : '停用'}</StatusBadge> }
function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <TableShell scrollClassName="master-data-table-wrap"><UiDataTable className="master-data-table">
    <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
  </UiDataTable></TableShell>
}

function ClinicalWorkspace({ api, value, services, dictionaries, unitCodes, onEditProfile, onSpecimen, onVariant, onAttachment }: {
  api: RhnApi; value: ClinicalConfiguration; services: ServiceCatalogItem[]
  dictionaries: Record<string, DictionaryValue[]>; unitCodes: UnitDefinition[]
  onEditProfile: () => void; onSpecimen: (value?: SpecimenConfiguration) => void
  onVariant: (value?: ExaminationVariantConfiguration) => void
  onAttachment: (value?: ExaminationAttachmentConfiguration) => void
}) {
  void unitCodes
  const laboratory = value.serviceType === 'LABORATORY'
  const [tab, setTab] = useState<'requirements' | 'options' | 'charge'>('requirements')
  const profile = value.laboratory ?? value.examination
  const dictionaryName = (dictionaryCode: string, code?: string) =>
    code ? dictionaries[dictionaryCode]?.find((item) => item.code === code)?.name ?? code : '未设置'
  const tabs = laboratory
    ? ([['requirements', '执行要求'], ['options', '标本与分管'], ['charge', '分管试算']] as const)
    : ([['requirements', '执行要求'], ['options', '允许部位与方式'], ['charge', '收费规则与试算']] as const)
  return <div className="clinical-configuration">
    <header><div><strong>{value.serviceName}</strong><code>{value.serviceCode}</code></div><State value="ACTIVE" />
      <Button variant="secondary" onClick={onEditProfile}>编辑项目执行配置</Button></header>
    <div className="clinical-configuration__facts">
      {laboratory ? <><span>检验方法<strong>{dictionaryName('BD_LAB_METHOD', value.laboratory!.laboratoryMethod)}</strong></span>
        <span>报告时长<strong>{value.laboratory!.reportDuration ? `${value.laboratory!.reportDuration} ${value.laboratory!.reportDurationUnit ?? ''}`.trim() : '未设置'}</strong></span>
        <span>执行属性<strong>{[value.laboratory!.fastingRequired && '空腹', value.laboratory!.pointOfCare && 'POCT'].filter(Boolean).join(' · ') || '常规'}</strong></span></>
        : <><span>检查类型<strong>{dictionaryName('BD_EXAM_TYPE', value.examination?.examinationType)}</strong></span>
          <span>部位规则<strong>{value.examination?.bodySiteRequired ? `必选 · ${value.examination.maxBodySiteCount ? `最多 ${value.examination.maxBodySiteCount} 个` : '数量不限'}` : '不要求'}</strong></span>
          <span>多部位计价<strong>{sitePricingLabel(value.examination!)}</strong></span></>}
    </div>
    <nav className="clinical-configuration__tabs" aria-label="项目配置内容">
      {tabs.map(([key, label]) => <button type="button" key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>
    {tab === 'requirements' && <div className="clinical-requirement-card">
      <div><span>开立与执行说明</span><strong>{laboratory ? value.laboratory!.collectionDescription || '暂未维护' : value.examination!.preparationDescription || '暂未维护'}</strong></div>
      <div><span>配置完整度</span><strong>{profile ? '已建立项目配置' : '待初始化'}</strong></div>
      <p>执行要求用于开立校验与{laboratory ? '采集' : '检查'}提示；收费结果请在“{laboratory ? '分管试算' : '收费规则与试算'}”中验证。</p>
    </div>}
    {tab === 'options' && <div className="clinical-configuration__section"><div className="section-heading"><div><h4>{laboratory ? '可用标本、容器与分管规则' : '允许部位与检查方式'}</h4>
      <p>{laboratory ? '维护标本、容器和同次申请的合管拆管依据。' : '部位与执行方式按独立业务含义维护，编码用于开立与执行交换。'}</p></div>
      <Button onClick={() => laboratory ? onSpecimen() : onVariant()}><Icon name="add" />{laboratory ? '新增标本规则' : '新增部位或方式'}</Button></div>
      {laboratory ? <DataTable headers={['标本', '容器', '最小采集量', '分管/加收', '状态', '操作']} rows={value.laboratory!.specimens.map((row) => [
        <b>{row.specimenName}<code>{row.specimenCode}</code></b>, row.containerName || '未限定', row.minimumQuantity ? `${row.minimumQuantity} ${row.minimumQuantityUnit}` : '未设置',
        <span>{tubeRuleLabel(row)}<small>{[row.defaultSpecimen && '默认', row.requiredSpecimen && '必需'].filter(Boolean).join(' · ') || '可选'}</small></span>, <State value={row.status} />,
        <Button size="sm" variant="text" onClick={() => onSpecimen(row)}>编辑</Button>,
      ])} /> : <DataTable headers={['配置项', '执行方式', '申请要求', '排序', '状态', '操作']} rows={(value.examination?.variants ?? []).map((row) => [
        <b>{row.name}<code>{row.code}</code></b>, dictionaryName('BD_SERVICE_VARIANT_METHOD', row.methodType), row.bodySiteRequired ? '需选择标准部位' : '无需另选部位', row.sortOrder,
        <State value={row.status} />, <Button size="sm" variant="text" onClick={() => onVariant(row)}>编辑</Button>,
      ])} />}
    </div>}
    {tab === 'charge' && !laboratory && value.examination && <><div className="clinical-configuration__section"><div className="section-heading"><div>
      <h4>附加收费规则</h4><p>以“触发条件 → 收费动作”展示胶片、造影、麻醉和多部位加收。</p></div>
      <Button onClick={() => onAttachment()}><Icon name="add" />新增收费规则</Button></div>
      {!value.examination.attachments.length ? <EmptyState icon="clinical" title="暂无附加收费规则" copy="可配置始终带出、按需选择或多部位触发的收费动作。" />
        : <DataTable headers={['规则项目', '触发条件', '收费动作', '要求', '状态', '操作']} rows={value.examination.attachments.map((row) => [
          <b>{row.attachmentItemName}<code>{row.attachmentItemCode}</code></b>, attachmentTriggerLabel(row.triggerType),
          `${attachmentQuantityLabel(row.quantityBasis)} × ${row.quantity}`, [row.requiredAttachment && '必须', row.separatelyChargeable ? '独立收费行' : '随主项'].filter(Boolean).join(' · '),
          <State value={row.status} />, <Button size="sm" variant="text" onClick={() => onAttachment(row)}>编辑</Button>,
        ])} />}
    </div><ExaminationChargeSimulator api={api} value={value} /></>}
    {tab === 'charge' && laboratory && <LaboratoryTubeSimulator api={api} currentServiceId={value.serviceId} services={services} />}
    {!profile && <Alert>当前项目未初始化执行配置。</Alert>}
  </div>
}

function ExaminationChargeSimulator({ api, value }: { api: RhnApi; value: ClinicalConfiguration }) {
  const examination = value.examination!
  const availableSites = examination.variants.filter((item) => item.status === 'ACTIVE')
  const optionalRules = examination.attachments.filter((item) => item.status === 'ACTIVE' && item.triggerType === 'OPTIONAL')
  const [selectedSites, setSelectedSites] = useState<string[]>([])
  const [selectedRules, setSelectedRules] = useState<string[]>([])
  const [result, setResult] = useState<ExaminationChargePlan>()
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const toggle = (items: string[], value: string, setter: (next: string[]) => void) =>
    setter(items.includes(value) ? items.filter((item) => item !== value) : [...items, value])
  const run = () => {
    setRunning(true); setError('')
    api.masterData.examinationChargePlan(value.serviceId, selectedSites, selectedRules)
      .then(setResult).catch((reason) => setError(errorMessage(reason))).finally(() => setRunning(false))
  }
  return <section className="rule-simulator" aria-label="检查收费规则试算">
    <header><div><h4>收费规则试算</h4><p>选择本次实际执行部位和按需项目，核对收费行与计算依据。</p></div>
      <Button onClick={run} disabled={running || examination.bodySiteRequired && selectedSites.length === 0}>{running ? '计算中…' : '开始试算'}</Button></header>
    {error && <Alert>{error}</Alert>}
    <div className="rule-simulator__inputs">
      <div><strong>实际执行部位</strong><div className="rule-option-grid">
        {availableSites.map((site) => <Check key={site.id} label={`${site.name} · ${site.code}`} checked={selectedSites.includes(site.code)} onChange={() => toggle(selectedSites, site.code, setSelectedSites)} />)}
        {!availableSites.length && <span>请先在“允许部位与方式”中配置启用项。</span>}
      </div></div>
      <div><strong>本次按需收费项</strong><div className="rule-option-grid">
        {optionalRules.map((rule) => <Check key={rule.id} label={`${rule.attachmentItemName} · ${rule.attachmentItemCode}`} checked={selectedRules.includes(rule.id)} onChange={() => toggle(selectedRules, rule.id, setSelectedRules)} />)}
        {!optionalRules.length && <span>当前没有需要人工选择的附加收费规则。</span>}
      </div></div>
    </div>
    {result && <div className="rule-simulator__result"><div className="rule-simulator__summary">
      <span>实际部位 <strong>{result.siteCount}</strong></span><span>包含部位 <strong>{result.includedSiteCount}</strong></span><span>加收部位 <strong>{result.extraSiteCount}</strong></span>
    </div><ChargeLines lines={result.lines} /></div>}
  </section>
}

function LaboratoryTubeSimulator({ api, currentServiceId, services }: { api: RhnApi; currentServiceId: string; services: ServiceCatalogItem[] }) {
  const laboratoryServices = services.filter((service) => service.sdServiceType === 'LABORATORY' && service.sdStatus === 'ACTIVE')
  const [selected, setSelected] = useState<string[]>([currentServiceId])
  const [quantities, setQuantities] = useState<Record<string, string>>({ [currentServiceId]: '1' })
  const [result, setResult] = useState<LaboratoryTubePlan>()
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  useEffect(() => { setSelected([currentServiceId]); setQuantities({ [currentServiceId]: '1' }); setResult(undefined) }, [currentServiceId])
  const toggle = (serviceId: string) => setSelected((items) => items.includes(serviceId)
    ? items.filter((item) => item !== serviceId) : [...items, serviceId])
  const run = () => {
    setRunning(true); setError('')
    api.masterData.laboratoryTubePlan(selected.map((serviceId) => ({ serviceId, quantity: Number(quantities[serviceId] || 1) })))
      .then(setResult).catch((reason) => setError(errorMessage(reason))).finally(() => setRunning(false))
  }
  return <section className="rule-simulator" aria-label="检验分管规则试算">
    <header><div><h4>同次申请分管试算</h4><p>组合多个检验项目，核对建议试管数、每管项目与试管加收。</p></div>
      <Button onClick={run} disabled={running || selected.length === 0}>{running ? '计算中…' : '开始试算'}</Button></header>
    {error && <Alert>{error}</Alert>}
    <div className="tube-service-picker">{laboratoryServices.map((service) => <div key={service.id} className={selected.includes(service.id) ? 'is-selected' : ''}>
      <Check label={`${service.name} · ${service.code}`} checked={selected.includes(service.id)} onChange={() => toggle(service.id)} />
      {selected.includes(service.id) && <input type="number" min="1" aria-label={`${service.name}数量`} value={quantities[service.id] ?? '1'} onChange={(event) => setQuantities({ ...quantities, [service.id]: event.target.value })} />}
    </div>)}</div>
    {result && <div className="tube-plan-result">{result.groups.map((group) => <article key={group.groupCode}>
      <div><strong>{group.specimenName || '未命名标本'} · {group.containerName || '未限定容器'}</strong><code>{group.groupCode.startsWith('ITEM:') ? '独立分管' : group.groupCode}</code></div>
      <b>{group.tubeCount} 管</b><small>{group.serviceIds.length} 个项目 · {tubeSharingModeLabel(group.sharingMode)}</small>
    </article>)}<ChargeLines lines={result.chargeLines} /></div>}
  </section>
}

function ChargeLines({ lines }: { lines: DiagnosticChargeLine[] }) {
  if (!lines.length) return <p className="rule-simulator__empty">本次没有生成收费行。</p>
  return <DataTable headers={['收费项目', '来源', '数量/金额', '说明']} rows={lines.map((line) => [
    <b>{line.itemName}<code>{line.itemCode}</code></b>, chargeSourceLabel(line.sourceType),
    line.fixedAmount != null ? `¥ ${line.fixedAmount}` : `${line.quantity}${line.unitCode ? ` ${line.unitCode}` : ''}`,
    line.description || '—',
  ])} />
}

const sitePricingLabel = (value: NonNullable<ClinicalConfiguration['examination']>) => ({
  SINGLE: '主项计费一次', PER_SITE: '按部位计主项', BASE_PLUS_FIXED: `含 ${value.includedSiteCount} 个 · 超出固定加收`,
  BASE_PLUS_ITEM: `含 ${value.includedSiteCount} 个 · 超出加收项目`,
}[value.sitePricingMode])
const tubeRuleLabel = (value: SpecimenConfiguration) => {
  const sharing = { SEPARATE: '独立分管', SHARE: '同组共管', BY_TEST_COUNT: `每管最多 ${value.maxTestsPerTube} 项` }[value.tubeSharingMode]
  const charge = value.tubeChargeMode === 'NONE' ? '' : ` · ${value.tubeChargeItemName || '试管加收'}`
  return `${sharing}${value.tubeGroupCode ? ` · ${value.tubeGroupCode}` : ''}${charge}`
}
const attachmentTriggerLabel = (value: ExaminationAttachmentConfiguration['triggerType']) => ({ ALWAYS: '始终带出', OPTIONAL: '按需选择', MULTI_SITE: '多部位时' }[value])
const attachmentQuantityLabel = (value: ExaminationAttachmentConfiguration['quantityBasis']) => ({ FIXED: '固定', PER_SITE: '每部位', PER_EXTRA_SITE: '每超出部位' }[value])
const tubeSharingModeLabel = (value: SpecimenConfiguration['tubeSharingMode']) => ({ SEPARATE: '独立分管', SHARE: '同组共管', BY_TEST_COUNT: '按项目数拆管' }[value])
const chargeSourceLabel = (value: string) => ({ BASE_SERVICE: '主项目', MULTI_SITE_FIXED: '多部位固定加收', MULTI_SITE_ITEM: '多部位加收项目', ATTACHMENT: '附加收费规则', TUBE_SURCHARGE: '试管加收' }[value] ?? value)

function FormDialog({ title, description, onClose, onSubmit, children }: { title: string; description: string; onClose: () => void; onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return <Dialog title={title} eyebrow="基础数据 · 运营配置" description={description} size="wide" onClose={onClose}>
    <form className="master-data-dialog-form" onSubmit={onSubmit}><div className="master-data-form-grid master-data-form-grid--2">{children}</div>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose} type="button">取消</Button><Button type="submit">保存</Button></div></form>
  </Dialog>
}
function Check({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return <label className={`operational-check${disabled ? ' is-disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
}

function LaboratoryProfileDialog({ value, dictionaries, units, onClose, onSave }: { value: LaboratoryProfile; dictionaries: Record<string, DictionaryValue[]>; units: UnitDefinition[]; onClose: () => void; onSave: (input: Omit<LaboratoryProfile, 'serviceId' | 'revision' | 'specimens'>) => void }) {
  const [form, setForm] = useState({ laboratoryMethod: value.laboratoryMethod ?? '', reportDuration: value.reportDuration?.toString() ?? '', reportDurationUnit: value.reportDurationUnit ?? '', fastingRequired: value.fastingRequired, pointOfCare: value.pointOfCare, collectionDescription: value.collectionDescription ?? '' })
  return <FormDialog title="编辑检验项目配置" description="维护检验方法、报告时长与采集要求。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ ...form, laboratoryMethod: form.laboratoryMethod || undefined, reportDuration: form.reportDuration ? Number(form.reportDuration) : undefined, reportDurationUnit: form.reportDurationUnit || undefined, collectionDescription: form.collectionDescription || undefined }) }}>
    <FormField label="检验方法"><Select value={form.laboratoryMethod} onChange={(v) => setForm({ ...form, laboratoryMethod: v })} showValue placeholder="选择检验方法" options={(dictionaries.BD_LAB_METHOD ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="报告时长"><input type="number" min="0.001" step="0.001" value={form.reportDuration} onChange={(e) => setForm({ ...form, reportDuration: e.target.value })} /></FormField>
    <FormField label="时长单位"><Select value={form.reportDurationUnit} onChange={(v) => setForm({ ...form, reportDurationUnit: v })} showValue options={units.filter((v) => v.dimension === 'TIME' && v.status === 'ACTIVE').map(unitOption)} /></FormField>
    <FormField label="采集说明" className="span-2"><textarea value={form.collectionDescription} onChange={(e) => setForm({ ...form, collectionDescription: e.target.value })} /></FormField>
    <Check label="要求空腹" checked={form.fastingRequired} onChange={(v) => setForm({ ...form, fastingRequired: v })} /><Check label="院内快速检测（POCT）" checked={form.pointOfCare} onChange={(v) => setForm({ ...form, pointOfCare: v })} />
  </FormDialog>
}

function ExaminationProfileDialog({ value, dictionaries, services, currentServiceId, onClose, onSave }: {
  value: NonNullable<ClinicalConfiguration['examination']>; dictionaries: Record<string, DictionaryValue[]>
  services: ServiceCatalogItem[]; currentServiceId: string; onClose: () => void
  onSave: (input: ExaminationProfileInput) => void
}) {
  const [form, setForm] = useState({ examinationType: value.examinationType ?? '', bodySiteRequired: value.bodySiteRequired,
    multiBodySite: value.multiBodySite, maxBodySiteCount: value.maxBodySiteCount?.toString() ?? '1',
    preparationDescription: value.preparationDescription ?? '', sitePricingMode: value.sitePricingMode,
    includedSiteCount: String(value.includedSiteCount), additionalSitePrice: value.additionalSitePrice?.toString() ?? '',
    additionalSiteItemId: value.additionalSiteItemId ?? '', additionalSiteQuantity: String(value.additionalSiteQuantity || 1),
    maxChargeableSiteCount: value.maxChargeableSiteCount?.toString() ?? value.maxBodySiteCount?.toString() ?? '1' })
  const itemOptions = services.filter((v) => v.id !== currentServiceId && v.chargeable && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  const pricingMode = form.multiBodySite ? form.sitePricingMode : 'SINGLE'
  return <FormDialog title="编辑检查项目配置" description="维护检查类型、部位约束和多部位计价规则。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ examinationType: form.examinationType || undefined, bodySiteRequired: form.bodySiteRequired, multiBodySite: form.bodySiteRequired && form.multiBodySite, maxBodySiteCount: form.bodySiteRequired ? Number(form.maxBodySiteCount || 1) : undefined, preparationDescription: form.preparationDescription || undefined, sitePricingMode: pricingMode, includedSiteCount: Number(form.includedSiteCount || 1), additionalSitePrice: pricingMode === 'BASE_PLUS_FIXED' ? Number(form.additionalSitePrice) : undefined, additionalSiteItemId: pricingMode === 'BASE_PLUS_ITEM' ? form.additionalSiteItemId : undefined, additionalSiteQuantity: Number(form.additionalSiteQuantity || 1), maxChargeableSiteCount: form.multiBodySite ? Number(form.maxChargeableSiteCount || form.maxBodySiteCount) : 1 }) }}>
    <FormField label="检查类型"><Select value={form.examinationType} onChange={(v) => setForm({ ...form, examinationType: v })} showValue options={(dictionaries.BD_EXAM_TYPE ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="最多部位数"><input type="number" min="1" disabled={!form.bodySiteRequired} value={form.maxBodySiteCount} onChange={(e) => setForm({ ...form, maxBodySiteCount: e.target.value })} /></FormField>
    <FormField label="多部位计价"><Select disabled={!form.multiBodySite} value={pricingMode} onChange={(v) => setForm({ ...form, sitePricingMode: v as typeof form.sitePricingMode })} options={[
      { value: 'SINGLE', label: '主项目只计一次' }, { value: 'PER_SITE', label: '主项目按部位数量计费' },
      { value: 'BASE_PLUS_FIXED', label: '基础部位 + 固定金额' }, { value: 'BASE_PLUS_ITEM', label: '基础部位 + 加收项目' },
    ]} /></FormField>
    <FormField label="价格包含部位数"><input type="number" min="1" disabled={!form.multiBodySite} value={form.includedSiteCount} onChange={(e) => setForm({ ...form, includedSiteCount: e.target.value })} /></FormField>
    {pricingMode === 'BASE_PLUS_FIXED' && <FormField label="每超出部位加收金额" required><input type="number" min="0" step="0.01" value={form.additionalSitePrice} onChange={(e) => setForm({ ...form, additionalSitePrice: e.target.value })} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="多部位加收项目" required><Select value={form.additionalSiteItemId} onChange={(v) => setForm({ ...form, additionalSiteItemId: v })} showValue options={itemOptions} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="每超出部位加收数量"><input type="number" min="0.0001" step="any" value={form.additionalSiteQuantity} onChange={(e) => setForm({ ...form, additionalSiteQuantity: e.target.value })} /></FormField>}
    {form.multiBodySite && <FormField label="最大计费部位数"><input type="number" min={form.includedSiteCount || 1} max={form.maxBodySiteCount} value={form.maxChargeableSiteCount} onChange={(e) => setForm({ ...form, maxChargeableSiteCount: e.target.value })} /></FormField>}
    <FormField label="检查前准备" className="span-2"><textarea value={form.preparationDescription} onChange={(e) => setForm({ ...form, preparationDescription: e.target.value })} /></FormField>
    <Check label="申请时必须选择检查部位" checked={form.bodySiteRequired} onChange={(v) => setForm({ ...form, bodySiteRequired: v })} /><Check label="允许多部位" checked={form.multiBodySite} onChange={(v) => setForm({ ...form, multiBodySite: v })} />
  </FormDialog>
}

function SpecimenDialog({ value, configuration, units, services, onClose, onSave }: { value?: SpecimenConfiguration; configuration: ClinicalConfiguration; units: UnitDefinition[]; services: ServiceCatalogItem[]; onClose: () => void; onSave: (input: SpecimenConfigurationInput) => void }) {
  const [form, setForm] = useState({ specimenItemId: value?.specimenItemId ?? '', containerItemId: value?.containerItemId ?? '', minimumQuantity: value?.minimumQuantity?.toString() ?? '', minimumQuantityUnit: value?.minimumQuantityUnit?.toUpperCase() ?? '', defaultSpecimen: value?.defaultSpecimen ?? false, requiredSpecimen: value?.requiredSpecimen ?? true, sortOrder: String(value?.sortOrder ?? ((configuration.laboratory?.specimens.length ?? 0) + 1) * 10), collectionDescription: value?.collectionDescription ?? '', status: value?.status ?? 'ACTIVE', tubeGroupCode: value?.tubeGroupCode ?? '', tubeSharingMode: value?.tubeSharingMode ?? 'SEPARATE', baseTubeCount: String(value?.baseTubeCount ?? 1), maxTestsPerTube: value?.maxTestsPerTube?.toString() ?? '', tubeChargeMode: value?.tubeChargeMode ?? 'NONE', tubeChargeItemId: value?.tubeChargeItemId ?? '', includedTubeCount: String(value?.includedTubeCount ?? 0), tubeChargeQuantity: String(value?.tubeChargeQuantity ?? 1) })
  const chargeOptions = services.filter((v) => v.id !== configuration.serviceId && v.chargeable && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  return <FormDialog title={value ? '编辑标本与分管规则' : '新增标本与分管规则'} description="维护标本容器、合管拆管条件以及采血管加收规则。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ specimenItemId: form.specimenItemId, containerItemId: form.containerItemId || undefined, minimumQuantity: form.minimumQuantity ? Number(form.minimumQuantity) : undefined, minimumQuantityUnit: form.minimumQuantityUnit || undefined, defaultSpecimen: form.defaultSpecimen, requiredSpecimen: form.requiredSpecimen, sortOrder: Number(form.sortOrder), collectionDescription: form.collectionDescription || undefined, status: form.status as 'ACTIVE' | 'INACTIVE', tubeGroupCode: form.tubeGroupCode || undefined, tubeSharingMode: form.tubeSharingMode, baseTubeCount: Number(form.baseTubeCount || 1), maxTestsPerTube: form.tubeSharingMode === 'BY_TEST_COUNT' ? Number(form.maxTestsPerTube) : undefined, tubeChargeMode: form.tubeChargeMode, tubeChargeItemId: form.tubeChargeMode === 'NONE' ? undefined : form.tubeChargeItemId, includedTubeCount: Number(form.includedTubeCount || 0), tubeChargeQuantity: Number(form.tubeChargeQuantity || 1) }) }}>
    <FormField label="标本类型" required><Select value={form.specimenItemId} onChange={(v) => setForm({ ...form, specimenItemId: v })} showValue options={configuration.specimenOptions.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="采集容器"><Select value={form.containerItemId} onChange={(v) => setForm({ ...form, containerItemId: v })} showValue placeholder="不限定" options={configuration.containerOptions.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="最小采集量"><input type="number" min="0.001" step="0.001" value={form.minimumQuantity} onChange={(e) => setForm({ ...form, minimumQuantity: e.target.value })} /></FormField>
    <FormField label="采集量单位"><Select value={form.minimumQuantityUnit} onChange={(v) => setForm({ ...form, minimumQuantityUnit: v })} showValue options={units.filter((v) => v.status === 'ACTIVE').map(unitOption)} /></FormField>
    <FormField label="分管方式"><Select value={form.tubeSharingMode} onChange={(v) => setForm({ ...form, tubeSharingMode: v as typeof form.tubeSharingMode })} options={[
      { value: 'SEPARATE', label: '独立分管' }, { value: 'SHARE', label: '同组项目共管' }, { value: 'BY_TEST_COUNT', label: '按每管项目数拆分' },
    ]} /></FormField>
    <FormField label="分管编码" required={form.tubeSharingMode !== 'SEPARATE'}><input value={form.tubeGroupCode} placeholder="如 EDTA_HEMATOLOGY" onChange={(e) => setForm({ ...form, tubeGroupCode: e.target.value.toUpperCase() })} /></FormField>
    <FormField label="基础试管数" required><input type="number" min="1" value={form.baseTubeCount} onChange={(e) => setForm({ ...form, baseTubeCount: e.target.value })} /></FormField>
    {form.tubeSharingMode === 'BY_TEST_COUNT' && <FormField label="每管最大项目数" required><input type="number" min="1" value={form.maxTestsPerTube} onChange={(e) => setForm({ ...form, maxTestsPerTube: e.target.value })} /></FormField>}
    <FormField label="试管加收"><Select value={form.tubeChargeMode} onChange={(v) => setForm({ ...form, tubeChargeMode: v as typeof form.tubeChargeMode })} options={[
      { value: 'NONE', label: '不加收' }, { value: 'PER_TUBE', label: '每管加收' }, { value: 'EXCESS_TUBE', label: '超出包含管数后加收' },
    ]} /></FormField>
    {form.tubeChargeMode !== 'NONE' && <FormField label="试管加收项目" required><Select value={form.tubeChargeItemId} onChange={(v) => setForm({ ...form, tubeChargeItemId: v })} showValue options={chargeOptions} /></FormField>}
    {form.tubeChargeMode === 'EXCESS_TUBE' && <FormField label="已包含试管数"><input type="number" min="0" value={form.includedTubeCount} onChange={(e) => setForm({ ...form, includedTubeCount: e.target.value })} /></FormField>}
    {form.tubeChargeMode !== 'NONE' && <FormField label="每管加收数量"><input type="number" min="0.0001" step="any" value={form.tubeChargeQuantity} onChange={(e) => setForm({ ...form, tubeChargeQuantity: e.target.value })} /></FormField>}
    <FormField label="排序号" required><input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' })} options={activeStatus} /></FormField>
    <FormField label="采集说明" className="span-2"><textarea value={form.collectionDescription} onChange={(e) => setForm({ ...form, collectionDescription: e.target.value })} /></FormField>
    <Check label="默认标本" checked={form.defaultSpecimen} onChange={(v) => setForm({ ...form, defaultSpecimen: v })} /><Check label="必需标本" checked={form.requiredSpecimen} onChange={(v) => setForm({ ...form, requiredSpecimen: v })} />
  </FormDialog>
}

function VariantDialog({ value, dictionaries, onClose, onSave }: { value?: ExaminationVariantConfiguration; dictionaries: Record<string, DictionaryValue[]>; onClose: () => void; onSave: (input: ExaminationVariantInput) => void }) {
  const [form, setForm] = useState({ code: value?.code ?? '', name: value?.name ?? '', methodType: value?.methodType ?? '', bodySiteRequired: value?.bodySiteRequired ?? true, mutualRecognitionCode: value?.mutualRecognitionCode ?? '', sortOrder: String(value?.sortOrder ?? 10), status: value?.status ?? 'ACTIVE' })
  return <FormDialog title={value ? '编辑允许部位或检查方式' : '新增允许部位或检查方式'} description="维护申请可选项及其执行方式；部位名称与方式名称不要合并为一个长名称。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ code: form.code, name: form.name, methodType: form.methodType || undefined, bodySiteRequired: form.bodySiteRequired, mutualRecognitionCode: form.mutualRecognitionCode || undefined, sortOrder: Number(form.sortOrder), status: form.status as 'ACTIVE' | 'INACTIVE' }) }}>
    <FormField label="配置编码" required><input value={form.code} disabled={Boolean(value)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField><FormField label="配置名称" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
    <FormField label="检查方式"><Select value={form.methodType} onChange={(v) => setForm({ ...form, methodType: v })} showValue placeholder="未限定检查方式" options={(dictionaries.BD_SERVICE_VARIANT_METHOD ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField><FormField label="标准/互认编码"><input value={form.mutualRecognitionCode} onChange={(e) => setForm({ ...form, mutualRecognitionCode: e.target.value })} /></FormField>
    <FormField label="排序号"><input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' })} options={activeStatus} /></FormField>
    <Check label="选择此项后仍需指定标准部位" checked={form.bodySiteRequired} onChange={(v) => setForm({ ...form, bodySiteRequired: v })} />
  </FormDialog>
}

function AttachmentDialog({ value, services, currentServiceId, onClose, onSave }: {
  value?: ExaminationAttachmentConfiguration; services: ServiceCatalogItem[]; currentServiceId: string
  onClose: () => void; onSave: (input: ExaminationAttachmentInput) => void
}) {
  const [form, setForm] = useState({ attachmentCatalogItemId: value?.attachmentCatalogItemId ?? '',
    triggerType: value?.triggerType ?? 'ALWAYS', quantityBasis: value?.quantityBasis ?? 'FIXED',
    quantity: String(value?.quantity ?? 1), requiredAttachment: value?.requiredAttachment ?? false,
    separatelyChargeable: value?.separatelyChargeable ?? true, sortOrder: String(value?.sortOrder ?? 10),
    description: value?.description ?? '', status: value?.status ?? 'ACTIVE' })
  const options = services.filter((v) => v.id !== currentServiceId && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: `${v.code}${v.chargeable ? ' · 可收费' : ''}` }))
  return <FormDialog title={value ? '编辑附加收费规则' : '新增附加收费规则'}
    description="以触发条件和数量依据生成胶片、造影、麻醉、耗材等收费动作。"
    onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ attachmentCatalogItemId: form.attachmentCatalogItemId,
      triggerType: form.triggerType, quantityBasis: form.quantityBasis, quantity: Number(form.quantity),
      requiredAttachment: form.triggerType === 'OPTIONAL' ? false : form.requiredAttachment,
      separatelyChargeable: form.separatelyChargeable, sortOrder: Number(form.sortOrder),
      description: form.description || undefined, status: form.status as 'ACTIVE' | 'INACTIVE' }) }}>
    <FormField label="收费项目" required><Select disabled={Boolean(value)} value={form.attachmentCatalogItemId} onChange={(v) => setForm({ ...form, attachmentCatalogItemId: v })} showValue options={options} /></FormField>
    <FormField label="触发条件"><Select value={form.triggerType} onChange={(v) => setForm({ ...form, triggerType: v as typeof form.triggerType })} options={[
      { value: 'ALWAYS', label: '始终带出' }, { value: 'OPTIONAL', label: '申请时按需选择' }, { value: 'MULTI_SITE', label: '选择多个部位时' },
    ]} /></FormField>
    <FormField label="数量依据"><Select value={form.quantityBasis} onChange={(v) => setForm({ ...form, quantityBasis: v as typeof form.quantityBasis })} options={[
      { value: 'FIXED', label: '固定数量' }, { value: 'PER_SITE', label: '每个检查部位' }, { value: 'PER_EXTRA_SITE', label: '每个超出部位' },
    ]} /></FormField>
    <FormField label="数量"><input type="number" min="0.0001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></FormField>
    <FormField label="排序号"><input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></FormField>
    <FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as typeof form.status })} options={activeStatus} /></FormField>
    <FormField label="规则说明" className="span-2"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="说明适用条件、人工调整约束或收费依据" /></FormField>
    <Check label="命中后必须带出" checked={form.requiredAttachment} disabled={form.triggerType === 'OPTIONAL'} onChange={(v) => setForm({ ...form, requiredAttachment: v })} />
    <Check label="生成独立收费行" checked={form.separatelyChargeable} onChange={(v) => setForm({ ...form, separatelyChargeable: v })} />
  </FormDialog>
}

function SupplyDialog({ value, units, manufacturers, onClose, onSave }: {
  value?: SupplyItem; units: UnitDefinition[]; manufacturers: Manufacturer[]
  onClose: () => void; onSave: (input: SupplyInput) => void
}) {
  const [form, setForm] = useState({
    supplyType: value?.supplyType ?? 'CONSUMABLE', code: value?.code ?? '', name: value?.name ?? '',
    unitCode: value?.unitCode ?? 'EA', udiDi: value?.udiDi ?? '', genericCode: value?.genericCode ?? '',
    genericName: value?.genericName ?? '', modelName: value?.modelName ?? '', specification: value?.specification ?? '',
    materialType: value?.materialType ?? '', deviceClass: value?.deviceClass ?? '',
    registrationCode: value?.registrationCode ?? '', registrationName: value?.registrationName ?? '',
    registrantName: value?.registrantName ?? '', registrationFrom: value?.registrationFrom ?? '',
    registrationTo: value?.registrationTo ?? '', manufacturerId: value?.manufacturerId ?? '',
    structureDescription: value?.structureDescription ?? '', scopeDescription: value?.scopeDescription ?? '',
    instruction: value?.instruction ?? '', validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '',
    orderable: value?.orderable ?? true, chargeable: value?.chargeable ?? true, stocked: value?.stocked ?? true,
    highValue: value?.highValue ?? false, implant: value?.implant ?? false,
    intervention: value?.intervention ?? false, sterile: value?.sterile ?? false,
    singleUse: value?.singleUse ?? true, status: value?.status ?? 'ACTIVE',
  })
  const optional = (text: string) => text.trim() || undefined
  return <FormDialog title={value ? '编辑耗材/器械' : '新增耗材/器械'}
    description="统一维护经营属性、UDI、注册证和生产企业信息。" onClose={onClose}
    onSubmit={(e) => { e.preventDefault(); onSave({
      supplyType: form.supplyType as 'CONSUMABLE' | 'DEVICE', code: form.code, name: form.name,
      unitCode: form.unitCode, orderable: form.orderable, chargeable: form.chargeable, stocked: form.stocked,
      status: form.status as 'ACTIVE' | 'INACTIVE', validFrom: form.validFrom, validTo: form.validTo || undefined,
      udiDi: optional(form.udiDi), genericCode: optional(form.genericCode), genericName: optional(form.genericName),
      modelName: optional(form.modelName), specification: optional(form.specification), materialType: optional(form.materialType),
      deviceClass: form.deviceClass as 'I' | 'II' | 'III' || undefined, highValue: form.highValue,
      implant: form.implant, intervention: form.intervention, sterile: form.sterile, singleUse: form.singleUse,
      registrationCode: optional(form.registrationCode), registrationName: optional(form.registrationName),
      registrantName: optional(form.registrantName), registrationFrom: form.registrationFrom || undefined,
      registrationTo: form.registrationTo || undefined, manufacturerId: form.manufacturerId || undefined,
      structureDescription: optional(form.structureDescription), scopeDescription: optional(form.scopeDescription),
      instruction: optional(form.instruction),
    }) }}>
    <FormField label="主数据类型" required><Select value={form.supplyType} onChange={(v) => setForm({ ...form, supplyType: v as 'CONSUMABLE' | 'DEVICE' })} options={[{ value: 'CONSUMABLE', label: '医用耗材' }, { value: 'DEVICE', label: '医疗器械' }]} /></FormField>
    <FormField label="编码" required><input value={form.code} disabled={Boolean(value)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField>
    <FormField label="名称" required className="span-2"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
    <FormField label="基础单位" required><Select value={form.unitCode} onChange={(v) => setForm({ ...form, unitCode: v })} showValue options={units.filter((v) => v.status === 'ACTIVE' || v.code === value?.unitCode).map(unitOption)} /></FormField>
    <FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField>
    <FormField label="UDI-DI"><input value={form.udiDi} onChange={(e) => setForm({ ...form, udiDi: e.target.value })} /></FormField>
    <FormField label="通用编码"><input value={form.genericCode} onChange={(e) => setForm({ ...form, genericCode: e.target.value })} /></FormField>
    <FormField label="通用名"><input value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} /></FormField>
    <FormField label="生产企业"><Select value={form.manufacturerId} onChange={(v) => setForm({ ...form, manufacturerId: v })} placeholder="未指定" showValue options={manufacturers.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="型号"><input value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })} /></FormField>
    <FormField label="规格"><input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} /></FormField>
    <FormField label="材质类型"><input value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })} /></FormField>
    <FormField label="器械分类"><Select value={form.deviceClass} onChange={(v) => setForm({ ...form, deviceClass: v })} placeholder="非器械/未设置" options={['I', 'II', 'III'].map((v) => ({ value: v, label: `${v} 类` }))} /></FormField>
    <FormField label="注册证号"><input value={form.registrationCode} onChange={(e) => setForm({ ...form, registrationCode: e.target.value })} /></FormField>
    <FormField label="注册证名称"><input value={form.registrationName} onChange={(e) => setForm({ ...form, registrationName: e.target.value })} /></FormField>
    <FormField label="注册人"><input value={form.registrantName} onChange={(e) => setForm({ ...form, registrantName: e.target.value })} /></FormField>
    <FormField label="注册有效期起"><input type="date" value={form.registrationFrom} onChange={(e) => setForm({ ...form, registrationFrom: e.target.value })} /></FormField>
    <FormField label="注册有效期止"><input type="date" min={form.registrationFrom} value={form.registrationTo} onChange={(e) => setForm({ ...form, registrationTo: e.target.value })} /></FormField>
    <FormField label="主档生效日期" required><input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></FormField>
    <FormField label="主档失效日期"><input type="date" min={form.validFrom} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></FormField>
    <FormField label="结构组成" className="span-2"><textarea value={form.structureDescription} onChange={(e) => setForm({ ...form, structureDescription: e.target.value })} /></FormField>
    <FormField label="适用范围" className="span-2"><textarea value={form.scopeDescription} onChange={(e) => setForm({ ...form, scopeDescription: e.target.value })} /></FormField>
    <FormField label="使用说明" className="span-2"><textarea value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} /></FormField>
    <Check label="可开立" checked={form.orderable} onChange={(v) => setForm({ ...form, orderable: v })} />
    <Check label="可收费" checked={form.chargeable} onChange={(v) => setForm({ ...form, chargeable: v })} />
    <Check label="可库存" checked={form.stocked} onChange={(v) => setForm({ ...form, stocked: v })} />
    <Check label="高值耗材" checked={form.highValue} onChange={(v) => setForm({ ...form, highValue: v })} />
    <Check label="植入类" checked={form.implant} onChange={(v) => setForm({ ...form, implant: v, highValue: v || form.highValue })} />
    <Check label="介入类" checked={form.intervention} onChange={(v) => setForm({ ...form, intervention: v })} />
    <Check label="无菌" checked={form.sterile} onChange={(v) => setForm({ ...form, sterile: v })} />
    <Check label="一次性使用" checked={form.singleUse} onChange={(v) => setForm({ ...form, singleUse: v })} />
  </FormDialog>
}

function GroupDialog({ value, services, organization, units, onClose, onSave }: { value?: ItemGroup; services: ServiceCatalogItem[]; organization: Organization; units: UnitDefinition[]; onClose: () => void; onSave: (input: ItemGroupInput) => void }) {
  const [type, setType] = useState(value?.groupType ?? 'LIS')
  const [selected, setSelected] = useState<string[]>(value?.members.map((v) => v.catalogItemId) ?? [])
  const [memberConfig, setMemberConfig] = useState<Record<string, { quantity: string; unitCode: string; requiredMember: boolean; memberDescription: string }>>(
    Object.fromEntries((value?.members ?? []).map((v) => [v.catalogItemId, { quantity: String(v.quantity), unitCode: v.unitCode ?? '', requiredMember: v.requiredMember, memberDescription: v.memberDescription ?? '' }])),
  )
  const [code, setCode] = useState(value?.code ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [scope, setScope] = useState(value?.organizationId ? 'ORGANIZATION' : 'TENANT')
  const [usageType, setUsageType] = useState(value?.usageType ?? '')
  const [pointOfCare, setPointOfCare] = useState(value?.pointOfCare ?? false)
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? today())
  const [validTo, setValidTo] = useState(value?.validTo ?? '')
  const [status, setStatus] = useState(value?.status ?? 'ACTIVE')
  const available = services.filter((v) => type === 'LIS' ? v.sdServiceType === 'LABORATORY' : type === 'PACS' ? v.sdServiceType === 'EXAMINATION' : true)
  const toggle = (id: string) => setSelected((items) => {
    if (items.includes(id)) return items.filter((v) => v !== id)
    setMemberConfig((current) => ({ ...current, [id]: current[id] ?? { quantity: '1', unitCode: '', requiredMember: true, memberDescription: '' } }))
    return [...items, id]
  })
  const setMember = (id: string, patch: Partial<{ quantity: string; unitCode: string; requiredMember: boolean; memberDescription: string }>) =>
    setMemberConfig((current) => ({ ...current, [id]: {
      quantity: current[id]?.quantity ?? '1', unitCode: current[id]?.unitCode ?? '',
      requiredMember: current[id]?.requiredMember ?? true,
      memberDescription: current[id]?.memberDescription ?? '', ...patch,
    } }))
  return <FormDialog title={value ? '编辑项目组套' : '新增项目组套'} description="组套成员会在开立时展开，不复制成员主档。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ organizationId: scope === 'ORGANIZATION' ? organization.id : undefined, code, name, groupType: type as ItemGroup['groupType'], usageType: usageType || undefined, pointOfCare, status: status as 'ACTIVE' | 'INACTIVE', validFrom, validTo: validTo || undefined, members: selected.map((catalogItemId, index) => ({ catalogItemId, sortOrder: (index + 1) * 10, quantity: Number(memberConfig[catalogItemId]?.quantity || 1), unitCode: memberConfig[catalogItemId]?.unitCode || undefined, requiredMember: memberConfig[catalogItemId]?.requiredMember ?? true, memberDescription: memberConfig[catalogItemId]?.memberDescription || undefined })) }) }}>
    <FormField label="组套编码" required><input value={code} disabled={Boolean(value)} onChange={(e) => setCode(e.target.value.toUpperCase())} /></FormField><FormField label="组套名称" required><input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
    <FormField label="组套类型"><Select value={type} onChange={(v) => { setType(v as typeof type); setSelected([]); setMemberConfig({}) }} options={[{ value: 'LIS', label: '检验组套（LIS）' }, { value: 'PACS', label: '检查组套（PACS）' }, { value: 'ORDER_SET', label: '常用组合项目' }, { value: 'PACKAGE', label: '项目包' }]} /></FormField><FormField label="适用范围"><Select value={scope} onChange={setScope} options={[{ value: 'TENANT', label: '租户通用' }, { value: 'ORGANIZATION', label: organization.name }]} /></FormField>
    <FormField label="使用场景"><input value={usageType} onChange={(e) => setUsageType(e.target.value)} placeholder="例如：门诊、住院、体检" /></FormField><FormField label="状态"><Select value={status} onChange={(v) => setStatus(v as 'ACTIVE' | 'INACTIVE')} options={activeStatus} /></FormField>
    <FormField label="生效日期" required><input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></FormField><FormField label="失效日期"><input type="date" min={validFrom} value={validTo} onChange={(e) => setValidTo(e.target.value)} /></FormField>
    <Check label="院内快速检测组套（POCT）" checked={pointOfCare} onChange={setPointOfCare} />
    <FormField label={`组套成员（已选 ${selected.length} 项）`} required className="span-2"><div className="group-member-picker">{available.map((service) => <Check key={service.id} label={`${service.name} · ${service.code}`} checked={selected.includes(service.id)} onChange={() => toggle(service.id)} />)}</div></FormField>
    {selected.length > 0 && <FormField label="成员执行参数" className="span-2"><div className="group-member-config">
      {selected.map((id) => { const service = services.find((v) => v.id === id); const config = memberConfig[id] ?? { quantity: '1', unitCode: '', requiredMember: true, memberDescription: '' }; return <div className="group-member-config__row" key={id}>
        <strong>{service?.name}<code>{service?.code}</code></strong>
        <input type="number" min="0.001" step="any" aria-label={`${service?.name}数量`} value={config.quantity} onChange={(e) => setMember(id, { quantity: e.target.value })} />
        <Select aria-label={`${service?.name}单位`} value={config.unitCode} onChange={(unitCode) => setMember(id, { unitCode })} placeholder="沿用项目单位" showValue options={units.filter((v) => v.status === 'ACTIVE').map(unitOption)} />
        <Check label="必选" checked={config.requiredMember} onChange={(requiredMember) => setMember(id, { requiredMember })} />
        <input aria-label={`${service?.name}说明`} value={config.memberDescription} onChange={(e) => setMember(id, { memberDescription: e.target.value })} placeholder="成员说明（可选）" />
      </div> })}
    </div></FormField>}
  </FormDialog>
}

function FrequencyWorkspace({ api, organization, departments, values, loading, onDialog, onDone, onError }: {
  api: RhnApi; organization: Organization; departments: Department[]; values: OrderFrequency[]; loading: boolean
  onDialog: (value?: ReactNode) => void; onDone: (message: string) => Promise<void>; onError: (error: unknown) => void
}) {
  const [selectedId, setSelectedId] = useState('')
  const [previewCode, setPreviewCode] = useState('')
  const [previewDepartmentId, setPreviewDepartmentId] = useState('')
  const [previewStart, setPreviewStart] = useState(() => new Date().toISOString().slice(0, 16))
  const [preview, setPreview] = useState<{ explanation: string; plannedTimes: string[] }>()
  useEffect(() => {
    if (!values.length) { setSelectedId(''); setPreviewCode(''); return }
    if (!values.some((value) => value.id === selectedId)) setSelectedId(values[0].id)
    if (!values.some((value) => value.code === previewCode)) setPreviewCode(values[0].code)
  }, [previewCode, selectedId, values])
  const selected = values.find((value) => value.id === selectedId)
  const saveFrequency = (value?: OrderFrequency) => (input: OrderFrequencyInput) =>
    (value ? api.masterData.updateOrderFrequency(value, input) : api.masterData.createOrderFrequency(input))
      .then(() => onDone(value ? '医嘱频次已更新' : '医嘱频次已新增')).catch(onError)
  const saveConfiguration = (frequency: OrderFrequency, value?: OrderFrequencyConfiguration) =>
    (input: OrderFrequencyConfigurationInput) => (value
      ? api.masterData.updateOrderFrequencyConfiguration(frequency.id, value, input)
      : api.masterData.createOrderFrequencyConfiguration(frequency.id, input))
      .then(() => onDone(value ? '执行时间配置已更新' : '执行时间配置已新增')).catch(onError)
  const runPreview = () => api.masterData.previewOrderFrequency(previewCode, organization.id,
    previewDepartmentId || undefined, previewStart ? `${previewStart}:00` : undefined, 8)
    .then(setPreview).catch(onError)
  return <section className="operational-master-data__body frequency-workspace">
    <div className="operational-master-data__toolbar"><div><h3>医嘱频次主档</h3>
      <p>稳定编码承载医嘱语义，机构和科室只维护本地名称、启停与标准执行时间。</p></div>
      <Button onClick={() => onDialog(<FrequencyDialog onClose={() => onDialog(undefined)} onSave={saveFrequency()} />)}>
        <Icon name="add" />新增频次</Button></div>
    {loading ? <LoadingState label="正在加载医嘱频次…" /> : !values.length
      ? <EmptyState icon="clinical" title="暂无医嘱频次" copy="请先建立频次规则，再配置机构执行时点。" />
      : <><DataTable headers={['频次', '规则语义', '适用范围', '默认执行时点', '机构配置', '状态', '操作']} rows={values.map((value) => [
        <b>{value.name}<code>{value.code}{value.shortName ? ` · ${value.shortName}` : ''}</code></b>,
        <span>{frequencyRuleLabel(value)}<small>{value.automaticTaskGeneration ? '自动生成执行任务' : '不预生成固定任务'}</small></span>,
        frequencyApplicabilityLabel(value), value.defaultExecutionTimes.join('、') || '随医嘱/事件',
        `${value.configurations.length} 条`, <State value={value.status} />,
        <div className="master-data-row-actions"><Button size="sm" variant="text" onClick={() => setSelectedId(value.id)}>执行配置</Button>
          <Button size="sm" variant="text" onClick={() => onDialog(<FrequencyDialog value={value}
            onClose={() => onDialog(undefined)} onSave={saveFrequency(value)} />)}>编辑</Button></div>,
      ])} />
      {selected && <div className="frequency-workspace__details">
        <div className="section-heading"><div><h4>{selected.name} · 机构/科室执行配置</h4>
          <p>科室配置优先于机构配置；未维护时继承主档默认执行时点。</p></div>
          <Button onClick={() => onDialog(<FrequencyConfigurationDialog frequency={selected}
            organization={organization} departments={departments} onClose={() => onDialog(undefined)}
            onSave={saveConfiguration(selected)} />)}><Icon name="add" />新增执行配置</Button></div>
        {!selected.configurations.length ? <EmptyState icon="clinical" title="当前频次暂无局部配置"
          copy={`当前机构将使用主档默认值：${selected.defaultExecutionTimes.join('、') || '随医嘱开始时间'}`} />
          : <DataTable headers={['作用范围', '本地显示', '执行时点', '首日策略', '启用', '有效期', '操作']}
            rows={selected.configurations.map((config) => [
              config.departmentId ? departments.find((item) => item.id === config.departmentId)?.name ?? config.departmentId : organization.name,
              <span>{config.localName || selected.name}<small>{config.localCode || selected.code}</small></span>,
              config.executionTimes.join('、') || `继承：${selected.defaultExecutionTimes.join('、') || '无固定时点'}`,
              firstDayPolicyLabel(config.firstDayPolicy), config.enabled ? '启用' : '禁用',
              `${config.validFrom} 至 ${config.validTo || '长期'}`,
              <Button size="sm" variant="text" onClick={() => onDialog(<FrequencyConfigurationDialog
                frequency={selected} value={config} organization={organization} departments={departments}
                onClose={() => onDialog(undefined)} onSave={saveConfiguration(selected, config)} />)}>编辑</Button>,
            ])} />}
      </div>}
      <div className="frequency-preview"><strong>执行排程试算</strong>
        <Select value={previewCode} onChange={setPreviewCode} showValue options={values.filter((value) => value.status === 'ACTIVE')
          .map((value) => ({ value: value.code, label: value.name, secondaryText: value.code }))} />
        <Select value={previewDepartmentId} onChange={setPreviewDepartmentId} placeholder="机构级配置" showValue
          options={departments.filter((value) => value.sdOrgStatus === 'ACTIVE')
            .map((value) => ({ value: value.id, label: value.name, secondaryText: value.code }))} />
        <input type="datetime-local" value={previewStart} onChange={(event) => setPreviewStart(event.target.value)} />
        <Button variant="secondary" disabled={!previewCode} onClick={runPreview}>生成 8 个时点</Button>
        {preview && <output><span>{preview.explanation}</span>
          <strong>{preview.plannedTimes.length ? preview.plannedTimes.map(formatDateTime).join(' · ') : '无固定执行时点'}</strong></output>}
      </div></>}
  </section>
}

function FrequencyDialog({ value, onClose, onSave }: {
  value?: OrderFrequency; onClose: () => void; onSave: (input: OrderFrequencyInput) => void
}) {
  const [form, setForm] = useState<FrequencyDraft>({
    code: value?.code ?? '', name: value?.name ?? '', shortName: value?.shortName ?? '',
    description: value?.description ?? '', ruleType: value?.ruleType ?? 'TIMES_PER_PERIOD',
    frequencyCount: String(value?.frequencyCount ?? 2), periodValue: String(value?.periodValue ?? 1),
    periodUnit: value?.periodUnit ?? 'D', anchorType: value?.anchorType ?? 'STANDARD_TIME',
    defaultExecutionTimes: value?.defaultExecutionTimes.join(',') ?? '08:00,20:00',
    outpatientApplicable: value?.outpatientApplicable ?? true, inpatientApplicable: value?.inpatientApplicable ?? true,
    emergencyApplicable: value?.emergencyApplicable ?? true, medicationApplicable: value?.medicationApplicable ?? true,
    treatmentApplicable: value?.treatmentApplicable ?? true, nursingApplicable: value?.nursingApplicable ?? false,
    automaticTaskGeneration: value?.automaticTaskGeneration ?? true, sortOrder: String(value?.sortOrder ?? 100),
    status: value?.status ?? 'ACTIVE', validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '',
  })
  const [templateId, setTemplateId] = useState(value ? '' : 'DAILY')
  const [formError, setFormError] = useState('')
  const ruleType = form.ruleType as OrderFrequencyRuleType
  const usesPeriod = ruleType === 'TIMES_PER_PERIOD' || ruleType === 'FIXED_INTERVAL'
  const usesTimes = ruleType === 'TIMES_PER_PERIOD' || ruleType === 'CALENDAR'
  const executionTimes = frequencyExecutionTimes(form.defaultExecutionTimes)
  const preview = frequencyDraftPreview(form)
  const scopeLabel = frequencyDraftScopeLabel(form)
  const changeRule = (next: string) => setForm((current) => ({ ...current, ruleType: next as OrderFrequencyRuleType,
    anchorType: next === 'TIMES_PER_PERIOD' ? 'STANDARD_TIME' : next === 'CALENDAR' ? 'CALENDAR'
      : next === 'PRN' ? 'EVENT' : 'ORDER_START',
    automaticTaskGeneration: !['PRN', 'CONTINUOUS'].includes(next),
    defaultExecutionTimes: next === 'TIMES_PER_PERIOD' ? current.defaultExecutionTimes || '08:00' : current.defaultExecutionTimes,
  }))
  const applyTemplate = (id: string) => {
    const template = frequencyTemplates.find((item) => item.id === id)
    if (!template) return
    setTemplateId(id); setFormError('')
    setForm((current) => ({ ...current, ...template.values, code: current.code, name: current.name,
      shortName: current.shortName, description: current.description, sortOrder: current.sortOrder,
      status: current.status, validFrom: current.validFrom, validTo: current.validTo }))
  }
  const setExecutionTimes = (times: string[]) => setForm((current) => ({ ...current,
    defaultExecutionTimes: times.join(','),
    frequencyCount: current.ruleType === 'TIMES_PER_PERIOD' ? String(Math.max(1, times.length)) : current.frequencyCount,
  }))
  return <FormDialog title={value ? '编辑医嘱频次' : '新增医嘱频次'}
    description={value ? '修改只影响后续新医嘱，历史医嘱继续使用已保存的规则快照。' : '先选择业务模板，再补充编码和名称即可完成常用频次配置。'} onClose={onClose}
    onSubmit={(event) => { event.preventDefault()
      if (usesTimes && !executionTimes.length) { setFormError('请至少添加一个执行时点'); return }
      if (!form.outpatientApplicable && !form.inpatientApplicable && !form.emergencyApplicable) { setFormError('请至少选择一个适用场景'); return }
      if (!form.medicationApplicable && !form.treatmentApplicable && !form.nursingApplicable) { setFormError('请至少选择一种医嘱类型'); return }
      setFormError(''); onSave({
      code: form.code, name: form.name, shortName: form.shortName || undefined,
      description: form.description || undefined, ruleType,
      frequencyCount: usesPeriod ? (ruleType === 'TIMES_PER_PERIOD' ? executionTimes.length : 1) : ruleType === 'ONCE' ? 1 : undefined,
      periodValue: usesPeriod ? Number(form.periodValue) : undefined,
      periodUnit: usesPeriod ? form.periodUnit : undefined,
      anchorType: form.anchorType as OrderFrequencyInput['anchorType'],
      defaultExecutionTimes: usesTimes ? executionTimes.join(',') : undefined,
      outpatientApplicable: form.outpatientApplicable, inpatientApplicable: form.inpatientApplicable,
      emergencyApplicable: form.emergencyApplicable, medicationApplicable: form.medicationApplicable,
      treatmentApplicable: form.treatmentApplicable, nursingApplicable: form.nursingApplicable,
      automaticTaskGeneration: form.automaticTaskGeneration, sortOrder: Number(form.sortOrder),
      status: form.status as 'ACTIVE' | 'INACTIVE', validFrom: form.validFrom, validTo: form.validTo || undefined,
    }) }}>
    {!value && <section className="frequency-template-picker span-2" aria-label="频次业务模板">
      <header><strong>1. 选择业务模板</strong><small>系统自动填充规则，仍可在下方调整</small></header>
      <div>{frequencyTemplates.map((template) => <button type="button" key={template.id}
        className={template.id === templateId ? 'is-active' : ''} onClick={() => applyTemplate(template.id)}>
        <strong>{template.title}</strong><small>{template.copy}</small></button>)}</div>
    </section>}
    {formError && <div className="span-2"><Alert>{formError}</Alert></div>}
    <div className="frequency-form-section span-2"><header><strong>{value ? '频次身份与规则' : '2. 补充频次身份'}</strong>
      <small>编码创建后不可修改，建议使用院内稳定编码或通用缩写</small></header></div>
    <FormField label="频次编码" required hint="常用标准编码示例：QD（每日一次）、BID（每日两次）、Q6H（每6小时一次）。"><input value={form.code} disabled={Boolean(value)} required
      onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="如 BID、Q6H" /></FormField>
    <FormField label="频次名称" required><input value={form.name} required
      onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="如 每日两次" /></FormField>
    <FormField label="简称"><input value={form.shortName} onChange={(event) => setForm({ ...form, shortName: event.target.value })} /></FormField>
    <FormField label="规则类型" required><Select value={form.ruleType} onChange={changeRule} options={frequencyRuleOptions} /></FormField>
    {usesPeriod && <><FormField label={ruleType === 'FIXED_INTERVAL' ? '间隔值' : '周期内次数'} required>
      <input type="number" min="1" step="1" readOnly={ruleType === 'TIMES_PER_PERIOD'}
        value={ruleType === 'FIXED_INTERVAL' ? form.periodValue : Math.max(1, executionTimes.length)}
        onChange={(event) => ruleType === 'FIXED_INTERVAL' && setForm({ ...form, periodValue: event.target.value })} /></FormField>
      <FormField label={ruleType === 'FIXED_INTERVAL' ? '间隔单位' : '统计周期'} required><Select value={form.periodUnit}
        onChange={(next) => setForm({ ...form, periodUnit: next, periodValue: ruleType === 'TIMES_PER_PERIOD' ? '1' : form.periodValue })}
        options={periodUnitOptions} /></FormField></>}
    {usesTimes && <FormField label="默认执行时点" required className="span-2"><FrequencyTimeEditor
      value={executionTimes} onChange={setExecutionTimes} /></FormField>}
    <section className="frequency-scope-section span-2"><header><strong>适用范围</strong><small>明确该频次可以在哪些业务中被选择</small></header>
      <div className="frequency-scope-grid">
        <Check label="门诊适用" checked={form.outpatientApplicable} onChange={(next) => setForm({ ...form, outpatientApplicable: next })} />
        <Check label="住院适用" checked={form.inpatientApplicable} onChange={(next) => setForm({ ...form, inpatientApplicable: next })} />
        <Check label="急诊适用" checked={form.emergencyApplicable} onChange={(next) => setForm({ ...form, emergencyApplicable: next })} />
        <Check label="药品医嘱" checked={form.medicationApplicable} onChange={(next) => setForm({ ...form, medicationApplicable: next })} />
        <Check label="治疗医嘱" checked={form.treatmentApplicable} onChange={(next) => setForm({ ...form, treatmentApplicable: next })} />
        <Check label="护理医嘱" checked={form.nursingApplicable} onChange={(next) => setForm({ ...form, nursingApplicable: next })} />
      </div><p><strong>当前范围：</strong>{scopeLabel}</p>
    </section>
    <FrequencyDraftPreview form={form} preview={preview} />
    <details className="frequency-advanced span-2" open={Boolean(value)}><summary><span>高级设置</span><small>状态、生效期、排序和任务生成策略</small></summary>
      <div className="frequency-advanced__grid">
        <FormField label="状态"><Select value={form.status} onChange={(next) => setForm({ ...form, status: next as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField>
        <FormField label="排序号"><input type="number" min="0" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></FormField>
        <FormField label="生效日期" required><input type="date" value={form.validFrom} required onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></FormField>
        <FormField label="失效日期"><input type="date" min={form.validFrom} value={form.validTo} onChange={(event) => setForm({ ...form, validTo: event.target.value })} /></FormField>
        <FormField label="业务说明" className="span-2"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField>
        <Check label="自动生成执行任务" checked={form.automaticTaskGeneration}
          disabled={ruleType === 'PRN' || ruleType === 'CONTINUOUS'}
          onChange={(next) => setForm({ ...form, automaticTaskGeneration: next })} />
      </div>
    </details>
  </FormDialog>
}

function FrequencyConfigurationDialog({ frequency, value, organization, departments, onClose, onSave }: {
  frequency: OrderFrequency; value?: OrderFrequencyConfiguration; organization: Organization; departments: Department[]
  onClose: () => void; onSave: (input: OrderFrequencyConfigurationInput) => void
}) {
  const [form, setForm] = useState({ departmentId: value?.departmentId ?? '', localCode: value?.localCode ?? '',
    localName: value?.localName ?? '', executionTimes: value?.executionTimes.join(',') ?? '',
    firstDayPolicy: value?.firstDayPolicy ?? 'REMAINING_SLOTS', enabled: value?.enabled ?? true,
    status: value?.status ?? 'ACTIVE', validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '' })
  const configuredTimes = frequencyExecutionTimes(form.executionTimes)
  const effectiveTimes = configuredTimes.length ? configuredTimes : frequency.defaultExecutionTimes
  const localDraft = { code: frequency.code, name: form.localName || frequency.name, shortName: frequency.shortName ?? '',
    description: frequency.description ?? '', ruleType: frequency.ruleType, frequencyCount: String(frequency.frequencyCount ?? 1),
    periodValue: String(frequency.periodValue ?? 1), periodUnit: frequency.periodUnit ?? 'D', anchorType: frequency.anchorType,
    defaultExecutionTimes: effectiveTimes.join(','), outpatientApplicable: frequency.outpatientApplicable,
    inpatientApplicable: frequency.inpatientApplicable, emergencyApplicable: frequency.emergencyApplicable,
    medicationApplicable: frequency.medicationApplicable, treatmentApplicable: frequency.treatmentApplicable,
    nursingApplicable: frequency.nursingApplicable, automaticTaskGeneration: frequency.automaticTaskGeneration,
    sortOrder: String(frequency.sortOrder), status: frequency.status, validFrom: frequency.validFrom,
    validTo: frequency.validTo ?? '' } satisfies FrequencyDraft
  return <FormDialog title={`${frequency.name} · ${value ? '编辑执行配置' : '新增执行配置'}`}
    description="只需选择作用范围并调整执行时点；留空时自动继承频次主档。" onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); onSave({ organizationId: organization.id,
      departmentId: form.departmentId || undefined, localCode: form.localCode || undefined,
      localName: form.localName || undefined, executionTimes: form.executionTimes || undefined,
      firstDayPolicy: form.firstDayPolicy as OrderFrequencyConfigurationInput['firstDayPolicy'],
      enabled: form.enabled, status: form.status as 'ACTIVE' | 'INACTIVE', validFrom: form.validFrom,
      validTo: form.validTo || undefined }) }}>
    <FormField label="作用范围" required><Select value={form.departmentId} disabled={Boolean(value)}
      onChange={(departmentId) => setForm({ ...form, departmentId })} placeholder={`机构：${organization.name}`}
      showValue options={departments.map((department) => ({ value: department.id, label: department.name, secondaryText: department.code }))} /></FormField>
    <Check label="在当前范围启用" checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
    {(frequency.ruleType === 'TIMES_PER_PERIOD' || frequency.ruleType === 'CALENDAR') && <FormField label="执行时点" className="span-2"><FrequencyTimeEditor
      value={configuredTimes} inheritLabel={`留空继承主档：${frequency.defaultExecutionTimes.join('、') || '无固定时点'}`}
      inheritTimes={frequency.defaultExecutionTimes}
      onChange={(times) => setForm({ ...form, executionTimes: times.join(',') })} /></FormField>}
    <FormField label="首日执行策略" hint="决定医嘱在当天标准执行时点之后开立时如何处理。"><Select value={form.firstDayPolicy} onChange={(firstDayPolicy) => setForm({ ...form,
      firstDayPolicy: firstDayPolicy as OrderFrequencyConfiguration['firstDayPolicy'] })}
      options={[{ value: 'REMAINING_SLOTS', label: '仅执行剩余时点' }, { value: 'FULL_SCHEDULE', label: '执行完整日计划' },
        { value: 'FROM_ORDER_TIME', label: '从开立时间起算' }]} /></FormField>
    <div className="frequency-config-policy"><strong>{firstDayPolicyLabel(form.firstDayPolicy as OrderFrequencyConfiguration['firstDayPolicy'])}</strong>
      <span>{frequencyFirstDayPolicyDescription(form.firstDayPolicy)}</span></div>
    <FrequencyDraftPreview form={localDraft} preview={frequencyDraftPreview(localDraft)} compact />
    <details className="frequency-advanced span-2" open={Boolean(value)}><summary><span>高级设置</span><small>本地显示名称、状态和有效期</small></summary>
      <div className="frequency-advanced__grid">
        <FormField label="本地编码"><input value={form.localCode} onChange={(event) => setForm({ ...form, localCode: event.target.value.toUpperCase() })} placeholder={frequency.code} /></FormField>
        <FormField label="本地名称"><input value={form.localName} onChange={(event) => setForm({ ...form, localName: event.target.value })} placeholder={frequency.name} /></FormField>
        <FormField label="状态"><Select value={form.status} onChange={(status) => setForm({ ...form, status: status as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField>
        <FormField label="生效日期"><input type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></FormField>
        <FormField label="失效日期"><input type="date" min={form.validFrom} value={form.validTo} onChange={(event) => setForm({ ...form, validTo: event.target.value })} /></FormField>
      </div>
    </details>
  </FormDialog>
}

type FrequencyDraft = {
  code: string; name: string; shortName: string; description: string; ruleType: OrderFrequencyRuleType
  frequencyCount: string; periodValue: string; periodUnit: string; anchorType: string; defaultExecutionTimes: string
  outpatientApplicable: boolean; inpatientApplicable: boolean; emergencyApplicable: boolean
  medicationApplicable: boolean; treatmentApplicable: boolean; nursingApplicable: boolean
  automaticTaskGeneration: boolean; sortOrder: string; status: string; validFrom: string; validTo: string
}

const frequencyTemplates: Array<{ id: string; title: string; copy: string; values: Partial<FrequencyDraft> }> = [
  { id: 'DAILY', title: '每日定时', copy: '每日一次或多次，如 QD/BID/TID', values: { ruleType: 'TIMES_PER_PERIOD',
    frequencyCount: '2', periodValue: '1', periodUnit: 'D', anchorType: 'STANDARD_TIME', defaultExecutionTimes: '08:00,20:00',
    outpatientApplicable: true, inpatientApplicable: true, emergencyApplicable: true, medicationApplicable: true,
    treatmentApplicable: true, nursingApplicable: false, automaticTaskGeneration: true } },
  { id: 'INTERVAL', title: '固定间隔', copy: '从开立时间起每隔若干小时执行', values: { ruleType: 'FIXED_INTERVAL',
    frequencyCount: '1', periodValue: '6', periodUnit: 'H', anchorType: 'ORDER_START', defaultExecutionTimes: '',
    outpatientApplicable: true, inpatientApplicable: true, emergencyApplicable: true, medicationApplicable: true,
    treatmentApplicable: true, nursingApplicable: false, automaticTaskGeneration: true } },
  { id: 'ONCE', title: '单次执行', copy: '仅执行一次或立即执行', values: { ruleType: 'ONCE', frequencyCount: '1',
    periodValue: '1', periodUnit: 'D', anchorType: 'ORDER_START', defaultExecutionTimes: '', outpatientApplicable: true,
    inpatientApplicable: true, emergencyApplicable: true, medicationApplicable: true, treatmentApplicable: true,
    nursingApplicable: false, automaticTaskGeneration: true } },
  { id: 'PRN', title: '必要时', copy: '由临床事件触发，不预生成任务', values: { ruleType: 'PRN', anchorType: 'EVENT',
    defaultExecutionTimes: '', outpatientApplicable: true, inpatientApplicable: true, emergencyApplicable: true,
    medicationApplicable: true, treatmentApplicable: true, nursingApplicable: true, automaticTaskGeneration: false } },
  { id: 'CONTINUOUS', title: '持续执行', copy: '持续输注、监护或治疗', values: { ruleType: 'CONTINUOUS', anchorType: 'ORDER_START',
    defaultExecutionTimes: '', outpatientApplicable: false, inpatientApplicable: true, emergencyApplicable: true,
    medicationApplicable: true, treatmentApplicable: true, nursingApplicable: true, automaticTaskGeneration: false } },
]

function FrequencyTimeEditor({ value, onChange, inheritLabel, inheritTimes = [] }: {
  value: string[]; onChange: (value: string[]) => void; inheritLabel?: string; inheritTimes?: string[]
}) {
  const update = (index: number, next: string) => onChange(value.map((item, current) => current === index ? next : item)
    .filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).sort())
  const add = () => {
    if (!value.length && inheritTimes.length) { onChange([...inheritTimes].sort()); return }
    const minutes = value.map((item) => Number(item.slice(0, 2)) * 60 + Number(item.slice(3, 5))).sort((a, b) => a - b)
    let nextMinutes = 8 * 60
    if (minutes.length) {
      let gapStart = minutes[0]; let gapSize = -1
      for (let index = 0; index < minutes.length; index += 1) {
        const start = minutes[index]; const end = index === minutes.length - 1 ? minutes[0] + 24 * 60 : minutes[index + 1]
        if (end - start > gapSize) { gapStart = start; gapSize = end - start }
      }
      nextMinutes = Math.round((gapStart + gapSize / 2) / 30) * 30 % (24 * 60)
    }
    const next = `${String(Math.floor(nextMinutes / 60)).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`
    onChange([...value, next].filter((item, index, all) => all.indexOf(item) === index).sort())
  }
  return <div className="frequency-time-editor">
    {value.map((time, index) => <span key={`${time}-${index}`}><input type="time" aria-label={`执行时点 ${index + 1}`} value={time}
      onChange={(event) => update(index, event.target.value)} /><button type="button" aria-label={`移除执行时点 ${time}`}
        onClick={() => onChange(value.filter((_, current) => current !== index))}>×</button></span>)}
    <button type="button" className="frequency-time-editor__add" onClick={add}><Icon name="add" />
      {!value.length && inheritTimes.length ? '基于主档调整' : '添加时点'}</button>
    {!value.length && inheritLabel && <small>{inheritLabel}</small>}
  </div>
}

function FrequencyDraftPreview({ form, preview, compact = false }: { form: FrequencyDraft; preview: string[]; compact?: boolean }) {
  return <aside className={`frequency-draft-preview span-2${compact ? ' is-compact' : ''}`}>
    <div><span>规则解释</span><strong>{frequencyDraftRuleLabel(form)}</strong><small>{frequencyDraftScopeLabel(form)}</small></div>
    <div><span>执行示例</span><strong>{preview.length ? preview.join(' · ') : '不预生成固定执行时点'}</strong>
      <small>{form.automaticTaskGeneration ? '将自动生成执行任务' : '由业务事件或人工触发'}</small></div>
  </aside>
}

function frequencyExecutionTimes(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function frequencyDraftRuleLabel(form: FrequencyDraft) {
  const times = frequencyExecutionTimes(form.defaultExecutionTimes)
  if (form.ruleType === 'ONCE') return '按医嘱开始时间执行一次'
  if (form.ruleType === 'TIMES_PER_PERIOD') return `每 ${form.periodValue || 1} ${periodUnitLabel(form.periodUnit)}执行 ${times.length} 次${times.length ? `（${times.join('、')}）` : ''}`
  if (form.ruleType === 'FIXED_INTERVAL') return `从医嘱开始时间起，每 ${form.periodValue || 1} ${periodUnitLabel(form.periodUnit)}执行一次`
  if (form.ruleType === 'CALENDAR') return `按标准时点执行${times.length ? `（${times.join('、')}）` : ''}`
  if (form.ruleType === 'PRN') return '必要时执行，不预先生成固定任务'
  return '持续执行，由业务过程控制开始和停止'
}

function frequencyDraftScopeLabel(form: FrequencyDraft) {
  const scenes = [form.outpatientApplicable && '门诊', form.inpatientApplicable && '住院', form.emergencyApplicable && '急诊'].filter(Boolean)
  const orders = [form.medicationApplicable && '药品', form.treatmentApplicable && '治疗', form.nursingApplicable && '护理'].filter(Boolean)
  return `${scenes.join('、') || '未选择场景'} · ${orders.join('、') || '未选择医嘱类型'}`
}

function frequencyDraftPreview(form: FrequencyDraft) {
  if (!form.automaticTaskGeneration || form.ruleType === 'PRN' || form.ruleType === 'CONTINUOUS') return []
  const start = new Date(); const result: Date[] = []
  if (form.ruleType === 'ONCE') result.push(start)
  else if (form.ruleType === 'FIXED_INTERVAL') {
    let cursor = new Date(start)
    for (let index = 0; index < 8; index += 1) { result.push(new Date(cursor)); cursor = addFrequencyPeriod(cursor, Number(form.periodValue || 1), form.periodUnit) }
  } else {
    const times = frequencyExecutionTimes(form.defaultExecutionTimes); let cursor = new Date(start); let guard = 0
    cursor.setSeconds(0, 0)
    while (result.length < 8 && guard < 64) {
      for (const time of times) {
        const candidate = new Date(cursor); candidate.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0)
        if (candidate >= start) result.push(candidate)
        if (result.length === 8) break
      }
      cursor = addFrequencyPeriod(cursor, Number(form.periodValue || 1), form.periodUnit === 'H' || form.periodUnit === 'MIN' ? 'D' : form.periodUnit)
      guard += 1
    }
  }
  return result.slice(0, 8).map((item) => `${String(item.getMonth() + 1).padStart(2, '0')}-${String(item.getDate()).padStart(2, '0')} ${String(item.getHours()).padStart(2, '0')}:${String(item.getMinutes()).padStart(2, '0')}`)
}

function addFrequencyPeriod(value: Date, amount: number, unit: string) {
  const next = new Date(value)
  if (unit === 'MIN') next.setMinutes(next.getMinutes() + amount)
  else if (unit === 'H') next.setHours(next.getHours() + amount)
  else if (unit === 'WK') next.setDate(next.getDate() + amount * 7)
  else if (unit === 'MO') next.setMonth(next.getMonth() + amount)
  else next.setDate(next.getDate() + amount)
  return next
}

function frequencyFirstDayPolicyDescription(value: string) {
  if (value === 'FULL_SCHEDULE') return '首日仍展示全天所有标准时点，适合按完整日计划管理的场景。'
  if (value === 'FROM_ORDER_TIME') return '忽略标准时点，从医嘱开立时间开始按规则计算。'
  return '自动跳过医嘱开立前的时点，仅生成当天尚未到达的执行任务。'
}

const frequencyRuleOptions = [
  { value: 'ONCE', label: '单次执行' }, { value: 'TIMES_PER_PERIOD', label: '周期内固定次数' },
  { value: 'FIXED_INTERVAL', label: '固定间隔' }, { value: 'CALENDAR', label: '日历/标准时点' },
  { value: 'PRN', label: '必要时（PRN）' }, { value: 'CONTINUOUS', label: '持续执行' },
]
const periodUnitOptions = [
  { value: 'MIN', label: '分钟' }, { value: 'H', label: '小时' }, { value: 'D', label: '天' },
  { value: 'WK', label: '周' }, { value: 'MO', label: '月' },
]
function frequencyRuleLabel(value: OrderFrequency) {
  if (value.ruleType === 'ONCE') return '执行一次'
  if (value.ruleType === 'TIMES_PER_PERIOD') return `每 ${value.periodValue} ${periodUnitLabel(value.periodUnit)} ${value.frequencyCount} 次`
  if (value.ruleType === 'FIXED_INTERVAL') return `每 ${value.periodValue} ${periodUnitLabel(value.periodUnit)}一次`
  return frequencyRuleOptions.find((item) => item.value === value.ruleType)?.label ?? value.ruleType
}
function periodUnitLabel(value?: string) { return ({ MIN: '分钟', H: '小时', D: '天', WK: '周', MO: '月' } as Record<string, string>)[value ?? ''] ?? value ?? '' }
function frequencyApplicabilityLabel(value: OrderFrequency) {
  const scenes = [value.outpatientApplicable && '门诊', value.inpatientApplicable && '住院', value.emergencyApplicable && '急诊'].filter(Boolean)
  const orders = [value.medicationApplicable && '药品', value.treatmentApplicable && '治疗', value.nursingApplicable && '护理'].filter(Boolean)
  return `${scenes.join('/')} · ${orders.join('/')}`
}
function firstDayPolicyLabel(value: OrderFrequencyConfiguration['firstDayPolicy']) {
  return ({ REMAINING_SLOTS: '仅剩余时点', FULL_SCHEDULE: '完整日计划', FROM_ORDER_TIME: '从开立起算' } as const)[value]
}
function formatDateTime(value: string) { return value.replace('T', ' ').slice(0, 16) }

function UnitWorkspace({ api, units, conversions, catalogItems, loading, onDialog, onDone, onError }: { api: RhnApi; units: UnitDefinition[]; conversions: UnitConversion[]; catalogItems: Array<ServiceCatalogItem | SupplyItem>; loading: boolean; onDialog: (v?: ReactNode) => void; onDone: (m: string) => Promise<void>; onError: (e: unknown) => void }) {
  const [quantity, setQuantity] = useState('1'); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [catalogItemId, setCatalogItemId] = useState(''); const [result, setResult] = useState('')
  const opts = units.filter((v) => v.status === 'ACTIVE').map(unitOption)
  const catalogOptions = catalogItems.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  const catalogName = (id?: string) => catalogItems.find((v) => v.id === id)?.name ?? '项目专属'
  const run = () => api.masterData.convertUnit(Number(quantity), from, to, catalogItemId || undefined, today()).then((v) => setResult(`${v.input} ${v.fromUnitCode} = ${v.result} ${v.toUnitCode} · ${v.path.join(' → ')}`)).catch(onError)
  const saveUnit = (value?: UnitDefinition) => (input: Omit<UnitDefinition, 'id' | 'revision'>) =>
    (value ? api.masterData.updateUnit(value, input) : api.masterData.createUnit(input))
      .then(() => { onDialog(undefined); return onDone(value ? '计量单位已更新' : '计量单位已新增') }).catch(onError)
  const saveConversion = (value?: UnitConversion) => (input: UnitConversionInput) =>
    (value ? api.masterData.updateUnitConversion(value, input) : api.masterData.createUnitConversion(input))
      .then(() => { onDialog(undefined); return onDone(value ? '换算规则已更新' : '换算规则已新增') }).catch(onError)
  return <section className="operational-master-data__body"><div className="operational-master-data__toolbar"><div><h3>统一计量单位与换算</h3><p>单位按计量维度管理，项目专属规则优先于全局规则。</p></div><div className="row-actions"><Button variant="secondary" onClick={() => onDialog(<UnitDialog onClose={() => onDialog(undefined)} onSave={saveUnit()} />)}>新增单位</Button><Button onClick={() => onDialog(<ConversionDialog units={units} catalogItems={catalogItems} onClose={() => onDialog(undefined)} onSave={saveConversion()} />)}>新增换算</Button></div></div>
    {loading ? <LoadingState label="正在加载计量体系…" /> : <div className="unit-workspace"><div><h4>单位定义</h4><DataTable headers={['单位', '维度', '精度', '状态', '操作']} rows={units.map((v) => [<b>{v.name}<code>{v.code} · {v.symbol}</code></b>, dimensions.find((d) => d.value === v.dimension)?.label, v.decimalScale, <State value={v.status} />, <Button size="sm" variant="text" onClick={() => onDialog(<UnitDialog value={v} onClose={() => onDialog(undefined)} onSave={saveUnit(v)} />)}>编辑</Button>])} /></div>
      <div><h4>换算规则</h4><DataTable headers={['范围', '换算', '有效期', '状态', '操作']} rows={conversions.map((v) => [v.catalogItemId ? catalogName(v.catalogItemId) : '全局', `1 ${v.fromUnitCode} = ${v.factor} ${v.toUnitCode}${v.offset ? ` + ${v.offset}` : ''}`, `${v.validFrom} 至 ${v.validTo || '长期'}`, <State value={v.status} />, <Button size="sm" variant="text" onClick={() => onDialog(<ConversionDialog value={v} units={units} catalogItems={catalogItems} onClose={() => onDialog(undefined)} onSave={saveConversion(v)} />)}>编辑</Button>])} /></div></div>}
    <div className="unit-converter"><strong>换算试算</strong><Select value={catalogItemId} onChange={setCatalogItemId} placeholder="全局规则（可选项目）" options={catalogOptions} showValue /><input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><Select value={from} onChange={setFrom} placeholder="来源单位" options={opts} /><span>→</span><Select value={to} onChange={setTo} placeholder="目标单位" options={opts} /><Button variant="secondary" disabled={!from || !to} onClick={run}>试算</Button>{result && <output>{result}</output>}</div>
  </section>
}

function UnitDialog({ value, onClose, onSave }: { value?: UnitDefinition; onClose: () => void; onSave: (v: Omit<UnitDefinition, 'id' | 'revision'>) => void }) {
  const [form, setForm] = useState({ code: value?.code ?? '', name: value?.name ?? '', symbol: value?.symbol ?? '', dimension: value?.dimension ?? 'COUNT', decimalScale: String(value?.decimalScale ?? 0), status: value?.status ?? 'ACTIVE' })
  return <FormDialog title={value ? '编辑计量单位' : '新增计量单位'} description="单位编码作为跨业务交换键，创建后不可修改。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ code: form.code, name: form.name, symbol: form.symbol || undefined, dimension: form.dimension as UnitDefinition['dimension'], decimalScale: Number(form.decimalScale), status: form.status as 'ACTIVE' | 'INACTIVE' }) }}><FormField label="单位编码" required><input value={form.code} disabled={Boolean(value)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField><FormField label="单位名称" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField><FormField label="显示符号"><input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} /></FormField><FormField label="计量维度"><Select value={form.dimension} onChange={(v) => setForm({ ...form, dimension: v as UnitDefinition['dimension'] })} options={dimensions} /></FormField><FormField label="小数精度"><input type="number" min="0" max="12" value={form.decimalScale} onChange={(e) => setForm({ ...form, decimalScale: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField></FormDialog>
}
function ConversionDialog({ value, units, catalogItems, onClose, onSave }: { value?: UnitConversion; units: UnitDefinition[]; catalogItems: Array<ServiceCatalogItem | SupplyItem>; onClose: () => void; onSave: (v: UnitConversionInput) => void }) {
  const [form, setForm] = useState({ catalogItemId: value?.catalogItemId ?? '', fromUnitCode: value?.fromUnitCode ?? '', toUnitCode: value?.toUnitCode ?? '', factor: String(value?.factor ?? ''), offset: String(value?.offset ?? 0), validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '', status: value?.status ?? 'ACTIVE' }); const opts = units.filter((v) => v.status === 'ACTIVE' || v.code === value?.fromUnitCode || v.code === value?.toUnitCode).map(unitOption)
  const catalogOptions = catalogItems.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  return <FormDialog title={value ? '编辑单位换算' : '新增单位换算'} description="全局规则适用于通用物理换算；包装规格等应使用项目专属换算。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ catalogItemId: form.catalogItemId || undefined, fromUnitCode: form.fromUnitCode, toUnitCode: form.toUnitCode, factor: Number(form.factor), offset: Number(form.offset), validFrom: form.validFrom, validTo: form.validTo || undefined, status: form.status as 'ACTIVE' | 'INACTIVE' }) }}><FormField label="规则范围"><Select disabled={Boolean(value)} value={form.catalogItemId} onChange={(v) => setForm({ ...form, catalogItemId: v })} placeholder="全局通用" showValue options={catalogOptions} /></FormField><FormField label="来源单位" required><Select disabled={Boolean(value)} value={form.fromUnitCode} onChange={(v) => setForm({ ...form, fromUnitCode: v })} showValue options={opts} /></FormField><FormField label="目标单位" required><Select disabled={Boolean(value)} value={form.toUnitCode} onChange={(v) => setForm({ ...form, toUnitCode: v })} showValue options={opts} /></FormField><FormField label="乘数" required><input type="number" min="0.000000001" step="any" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} /></FormField><FormField label="偏移量"><input type="number" step="any" value={form.offset} onChange={(e) => setForm({ ...form, offset: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField><FormField label="生效日期"><input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></FormField><FormField label="失效日期"><input type="date" min={form.validFrom} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></FormField></FormDialog>
}

const unitOption = (v: UnitDefinition) => ({ value: v.code, label: v.name, secondaryText: `${v.code}${v.symbol ? ` · ${v.symbol}` : ''}` })
