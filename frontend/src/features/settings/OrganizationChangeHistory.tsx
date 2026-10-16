import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { organizationQueryScope } from './organizationQueryScope'
import { Alert, Button, DataTable, Dialog, EmptyState, LoadingState } from '../../shared/ui'

const historySchema = z.array(z.object({ id: z.string().min(1), action: z.string(), actionText: z.string().min(1), beforeSnapshot: z.string(),
  afterSnapshot: z.string(), reason: z.string(), occurredAt: z.string(), actor: z.string() }))
function summary(source: string): string[] {
  let value: unknown
  try { value = JSON.parse(source) } catch { return ['历史快照无法解析，请联系管理员核查。'] }
  if (!value || typeof value !== 'object') return ['无记录']
  const names: Record<string, string> = { name: '名称', fullName: '姓名', code: '代码', sdOrgStatus: '组织状态', sdPersonnelStatus: '记录状态',
    parentId: '上级组织', sdDepartmentProperty: '业务属性', sdDepartmentType: '科室类型', departmentName: '任职科室', positionName: '岗位',
    validFrom: '开始日期', validTo: '结束日期', hireDate: '入职日期', leaveDate: '离职日期', contactValue: '联系方式', streetAddress: '详细地址',
    responsibleName: '负责人', identifierCode: '标识编码', sdCapabilityType: '服务能力', sdVerifyStatus: '核验状态', sdDetailStatus: '资料状态' }
  function rows(record: Record<string, unknown>, prefix = ''): string[] {
    const simple = Object.entries(names).flatMap(([key, label]) => record[key] != null ? [`${label}：${String(record[key])}`] : [])
    return [...(simple.length ? [`${prefix}${simple.join('；')}`] : []), ...Object.entries(record).flatMap(([key, child]) => {
      if (Array.isArray(child)) return child.flatMap((item, index) => item && typeof item === 'object' ? rows(item, `${({ assignments: '任职', employments: '聘用', contacts: '联系', capabilities: '能力', responsibilities: '负责人', addresses: '地址', identifiers: '标识', relations: '关系' } as Record<string, string>)[key] ?? '记录'} ${index + 1}：`) : [])
      return child && typeof child === 'object' ? rows(child as Record<string, unknown>, prefix) : []
    })]
  }
  return rows(value as Record<string, unknown>)
}
export function OrganizationChangeHistory({ api, type, id }: { api: RhnApi; type: 'organization' | 'department' | 'practitioner'; id: string }) {
  const [selected, setSelected] = useState<z.infer<typeof historySchema>[number]>()
  const query = useQuery({ queryKey: ['organization-changes', organizationQueryScope(api), type, id], queryFn: async () => historySchema.parse(await api.organization.changes(type, id)) })
  if (query.isPending) return <LoadingState label="正在加载变更记录…" />
  if (query.isError) return <Alert>{errorMessage(query.error)}<Button variant="secondary" onClick={() => void query.refetch()}>重新加载变更记录</Button></Alert>
  return <>
    <p>展示最近 200 条维护记录。结束、作废和调岗保留原记录；历史版本以变更时快照为准。</p>
    {!query.data.length ? <EmptyState icon="settings" title="暂无变更记录" copy="启用维护留痕后发生的变更将在这里展示。" /> : <DataTable compact aria-label="组织人员变更记录">
      <thead><tr><th>时间</th><th>操作</th><th>原因</th><th>操作账号</th><th className="ui-table-cell--actions">详情</th></tr></thead>
      <tbody>{query.data.map(item => <tr key={item.id}><td>{new Date(item.occurredAt).toLocaleString('zh-CN')}</td><td>{item.actionText}</td>
        <td>{item.reason}</td><td>{item.actor}</td><td className="ui-table-cell--actions"><Button size="sm" variant="text" onClick={() => setSelected(item)}>查看变更</Button></td></tr>)}</tbody>
    </DataTable>}
    {selected && <Dialog title="变更前后记录" onClose={() => setSelected(undefined)} size="xwide" footer={<Button onClick={() => setSelected(undefined)}>关闭</Button>}>
      <p>{selected.reason}</p><div className="master-profile-grid">{[['变更前', selected.beforeSnapshot], ['变更后', selected.afterSnapshot]].map(([title, value]) =>
        <section key={title}><h3>{title}</h3>{summary(value).map((text, index) => <p key={index}>{text}</p>)}</section>)}</div>
    </Dialog>}
  </>
}
