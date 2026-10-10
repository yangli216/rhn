import './master-data/clinical-content.css'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { Manufacturer, RhnApi } from "../../shared/rhnApi";
import { errorMessage } from "../../shared/rhnApi";
import type { Organization } from "../../shared/model";
import { Alert, Button, EmptyState, Icon, LoadingState, Tabs } from "../../shared/ui";
import { type Area, requireOperationalRows, ListSection, DataTable, groupTypeLabels, State } from './operations/operationalShared'
import { GroupDialog } from './operations/ItemGroupDialog'
import { SupplyDialog } from './operations/SupplyDialog'
import { UnitWorkspace } from './operations/UnitMaintenance'
import { FrequencyWorkspace } from './operations/FrequencyMaintenance'
export { ClinicalServiceConfigurationDialog } from './operations/ClinicalServiceConfiguration'

export function OperationalMasterDataPanel({ api, organization, manufacturers }: {
  api: RhnApi; organization: Organization; manufacturers: Manufacturer[]
}) {
  const client = useQueryClient()
  const [area, setArea] = useState<Area>('group')
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const services = useQuery({ queryKey: ['master-data-services-operational', organization.id],
    queryFn: async () => requireOperationalRows(await api.masterData.services('', '', '', organization.id), '诊疗项目'), enabled: area === 'group' || area === 'unit' })
  const supplies = useQuery({ queryKey: ['master-data-operational-supplies'], queryFn: async () => requireOperationalRows(await api.masterData.supplies(), '耗材'), enabled: area === 'supply' || area === 'unit' })
  const groups = useQuery({ queryKey: ['master-data-operational-groups'], queryFn: async () => requireOperationalRows(await api.masterData.itemGroups(), '项目组套'), enabled: area === 'group' })
  const units = useQuery({ queryKey: ['master-data-operational-units'], queryFn: async () => requireOperationalRows(await api.masterData.units(), '计量单位'), enabled: area !== 'frequency' })
  const conversions = useQuery({ queryKey: ['master-data-operational-conversions'], queryFn: async () => requireOperationalRows(await api.masterData.unitConversions(), '换算规则'), enabled: area === 'unit' })
  const frequencies = useQuery({ queryKey: ['master-data-operational-frequencies'],
    queryFn: async () => requireOperationalRows(await api.masterData.orderFrequencies(), '医嘱频次'), enabled: area === 'frequency' })
  const departments = useQuery({ queryKey: ['master-data-operational-frequency-departments', organization.id],
    queryFn: async () => requireOperationalRows(await api.organization.departments(organization.id), '科室'), enabled: area === 'frequency' })
  const areaQueries = area === 'group' ? [groups, services, units]
    : area === 'supply' ? [supplies, units]
      : area === 'unit' ? [units, conversions, services, supplies] : [frequencies, departments]
  const failedQuery = areaQueries.find((query) => query.isError)
  const loadingArea = areaQueries.some((query) => query.isPending)

  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await client.invalidateQueries({ predicate: ({ queryKey }) => String(queryKey[0] ?? '').startsWith('master-data-operational') })
    await client.invalidateQueries({ predicate: ({ queryKey }) => String(queryKey[0] ?? '').includes('active-order-frequencies') })
    await client.invalidateQueries({ queryKey: ['master-data-services'] })
  }
  const execute = (message: string, task: Promise<unknown>) => task.then(() => invalidate(message))

  return <div className="operational-master-data">
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {operationError && <Alert>{operationError}</Alert>}
    <Tabs value={area} onChange={setArea} label="运营主数据类型" variant="cards" items={[
      { value: 'group', label: '项目组套', meta: 'LIS/PACS 组套与组合项目' },
      { value: 'supply', label: '耗材与器械', meta: 'UDI、注册证、型号与库存属性' },
      { value: 'unit', label: '计量与换算', meta: '统一单位、全局/项目换算' },
      { value: 'frequency', label: '医嘱频次', meta: '规则语义、适用场景与执行时点' },
    ]} />
    {failedQuery ? <>
      <Alert duration={null}>{errorMessage(failedQuery.error)}</Alert>
      <EmptyState icon="clinical" title="运营主数据加载失败" copy="尚无法确认当前数据，请重新加载后再维护。"
        action={<Button variant="secondary" onClick={() => { void Promise.all(areaQueries.map((query) => query.refetch())) }}>重新加载</Button>} />
    </> : loadingArea ? <LoadingState label="正在加载运营主数据…" /> : <>
    {area === 'group' && <ListSection title="项目组套与组合" copy="组套用于一次展开多个检验/检查项目；组合用于常用医嘱或套餐复用，服务端按类型校验成员。"
      action={<Button onClick={() => setDialog(<GroupDialog api={api} services={services.data ?? []} organization={organization} units={units.data ?? []}
        onClose={() => setDialog(undefined)} onSave={(input) => execute('项目组套已新增', api.masterData.createItemGroup(input))} />)}><Icon name="add" />新增组套</Button>}>
      {groups.isPending ? <LoadingState label="正在加载项目组套…" /> : !groups.data?.length
        ? <EmptyState icon="clinical" title="暂无项目组套" copy="可建立检验组套、检查组套或常用组合项目。" />
        : <DataTable headers={['组套/组合', '类型', '适用范围', '成员', '状态', '操作']} rows={groups.data.map((value) => [
          <b title={`组套编码：${value.code}`}>{value.name}</b>, groupTypeLabels[value.groupType],
          value.organizationId ? organization.name : '租户通用', `${value.members.length} 项`, <State value={value.status} />,
          <Button size="sm" variant="text" onClick={() => setDialog(<GroupDialog api={api} value={value} services={services.data ?? []} organization={organization} units={units.data ?? []}
            onClose={() => setDialog(undefined)} onSave={(input) => execute('项目组套已更新', api.masterData.updateItemGroup(value, input))} />)}>编辑</Button>,
        ])} />}
    </ListSection>}
    {area === 'supply' && <ListSection title="医用耗材/器械主数据" copy="统一维护编码、UDI-DI、注册信息、供应商和库存能力。"
      action={<Button onClick={() => setDialog(<SupplyDialog units={units.data ?? []} manufacturers={manufacturers} onClose={() => setDialog(undefined)}
        onSave={(input) => execute('耗材/器械已新增', api.masterData.createSupply(input))} />)}><Icon name="add" />新增耗材/器械</Button>}>
      {supplies.isPending ? <LoadingState label="正在加载耗材与器械…" /> : !supplies.data?.length
        ? <EmptyState icon="pharmacy" title="暂无耗材/器械资料" copy="可先维护单位，再建立耗材或器械主档。" />
        : <DataTable headers={['名称/编码', '类型/型号', 'UDI/注册证', '经营属性', '状态', '操作']} rows={supplies.data.map((value) => [
          <b title={`耗材编码：${value.code}`}>{value.name}</b>, `${value.supplyType === 'DEVICE' ? '医疗器械' : '医用耗材'}${value.modelName ? ` · ${value.modelName}` : ''}`,
          <span>{value.udiDi || '—'}<small>{value.registrationCode || '未维护注册证'}</small></span>,
          [value.stocked && '库存', value.chargeable && '收费', value.highValue && '高值', value.implant && '植入'].filter(Boolean).join(' · ') || '—',
          <State value={value.status} />, <Button size="sm" variant="text" onClick={() => setDialog(<SupplyDialog value={value} units={units.data ?? []} manufacturers={manufacturers}
            onClose={() => setDialog(undefined)} onSave={(input) => execute('耗材/器械已更新', api.masterData.updateSupply(value, input))} />)}>编辑</Button>,
        ])} />}
    </ListSection>}
    {area === 'unit' && <UnitWorkspace api={api} organizationId={organization.id} units={units.data ?? []} conversions={conversions.data ?? []}
      catalogItems={[...(services.data ?? []), ...(supplies.data ?? [])]}
      loading={units.isPending || conversions.isPending} onDialog={setDialog} onDone={invalidate} />}
    {area === 'frequency' && <FrequencyWorkspace api={api} organization={organization}
      departments={departments.data ?? []} values={frequencies.data ?? []}
      loading={frequencies.isPending || departments.isPending} onDialog={setDialog}
      onDone={invalidate} onError={(e) => setOperationError(errorMessage(e))} />}
    </>}
    {dialog}
  </div>
}
