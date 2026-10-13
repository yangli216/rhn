import type { MaintenancePlan } from '../../../shared/rhnApi'
import { formatTime } from '../../../shared/format'
import { Alert, DataTable, EmptyState, tableCellClass } from '../../../shared/ui'
import { maintenanceModuleLabels } from '../../../shared/presentation/maintenance'

export function MaintenancePreview({ plan, organizations = [] }: { plan: MaintenancePlan | null; organizations?: { value: string; label: string }[] }) {
  if (!plan) return <EmptyState icon="settings" title="先生成影响预览" copy="选择范围、方案并填写操作原因，核对新增、保留、清理及库存补偿内容后执行。" />
  return <div className="maintenance-detail">
    <p>预览有效至 {formatTime(plan.expiresAt)}。执行期间整个租户的业务写入暂停，查询保持可用。</p>
    {!!plan.blockers?.length && <Alert placement="inline" tone="warning">{plan.blockers.map((item, index) =>
      <p key={index}>{item.message}</p>)}</Alert>}
    <p>默认保留：{plan.retained?.join('、')}</p>
    <DataTable aria-label="维护影响预览">
      <thead><tr><th>机构</th><th>模块</th><th>对象 / 项目</th><th>处理</th><th>处理前</th><th>处理后</th><th>说明</th></tr></thead>
      <tbody>{plan.lines?.map((line, index) => <tr key={index}>
        <td>{line.organizationId ? organizations.find(item => item.value === line.organizationId)?.label ?? line.organizationId : '目标范围合计'}</td>
        <td>{maintenanceModuleLabels[line.module ?? ''] ?? line.module}</td><td>{line.label}<br />{line.code}</td>
        <td>{({ DELETE: '清理', KEEP: '保留', CREATE: '新增', COMPENSATE: '补偿', SKIP: '跳过' } as Record<string,string>)[line.action ?? ''] ?? line.action}</td>
        <td className={tableCellClass('numeric')}>{line.beforeValue ?? '—'}</td>
        <td className={tableCellClass('numeric')}>{line.afterValue ?? '—'}</td><td>{line.detail}</td>
      </tr>)}</tbody>
    </DataTable>
  </div>
}
