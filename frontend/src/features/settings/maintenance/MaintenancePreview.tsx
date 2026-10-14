import { useState } from 'react'
import type { MaintenancePlan } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, Dialog, EmptyState, TableShell, tableCellClass } from '../../../shared/ui'
import { maintenanceIssueGuidance, maintenanceModuleLabels } from '../../../shared/presentation/maintenance'

export function MaintenancePreview({ plan, organizations = [] }: { plan: MaintenancePlan | null; organizations?: { value: string; label: string }[] }) {
  const [blockersOpen, setBlockersOpen] = useState(false)
  if (!plan) return <EmptyState icon="settings" title="先生成影响预览" copy="填写左侧设置，生成预览后核对执行。" />
  const guidance = [...new Set((plan.blockers ?? []).map(item => maintenanceIssueGuidance[item.code ?? '']).filter(Boolean))]
  return <div className="maintenance-preview">
    {!!plan.blockers?.length && <Alert placement="inline" tone="warning">
      <div className="maintenance-blocker-summary"><span>存在 {plan.blockers.length} 项阻断，暂不可执行</span>
        <Button variant="text" size="sm" onClick={() => setBlockersOpen(true)}>查看阻断原因</Button>
      </div>
    </Alert>}
    {!!plan.retained?.length && <details className="maintenance-retained"><summary>保留数据 · {plan.retained.length} 类</summary>
      <div>{plan.retained.join('、')}</div>
    </details>}
    <TableShell scrollLabel="维护影响预览内容" resetScrollKey={plan.id}>
      <DataTable compact aria-label="维护影响预览">
      <thead><tr><th>机构</th><th>模块</th><th>对象 / 项目</th><th>处理</th><th>处理前</th><th>处理后</th><th>说明</th></tr></thead>
      <tbody>{plan.lines?.map((line, index) => <tr key={index}>
        <td>{line.organizationId ? organizations.find(item => item.value === line.organizationId)?.label ?? line.organizationId : '目标范围合计'}</td>
        <td>{maintenanceModuleLabels[line.module ?? ''] ?? line.module}</td><td>{line.label}{line.code && <><br />{line.code}</>}</td>
        <td>{({ DELETE: '清理', KEEP: '保留', CREATE: '新增', COMPENSATE: '补偿', SKIP: '跳过' } as Record<string,string>)[line.action ?? ''] ?? line.action}</td>
        <td className={tableCellClass('numeric')}>{line.beforeValue ?? '—'}</td>
        <td className={tableCellClass('numeric')}>{line.afterValue ?? '—'}</td><td>{line.detail}</td>
      </tr>)}</tbody>
      </DataTable>
    </TableShell>
    {blockersOpen && <Dialog title="预览阻断原因" size="wide" onClose={() => setBlockersOpen(false)}
      footer={<Button variant="secondary" onClick={() => setBlockersOpen(false)}>返回预览</Button>}>
      <DataTable compact aria-label="预览阻断项"><thead><tr><th>模块</th><th>原因</th></tr></thead>
        <tbody>{plan.blockers?.map((item, index) => <tr key={index}>
          <td>{maintenanceModuleLabels[item.module ?? ''] ?? item.module ?? '—'}</td><td>{item.message}</td>
        </tr>)}</tbody>
      </DataTable>
      {!!guidance.length && <section className="maintenance-blocker-guidance" aria-label="处理建议">
        <h3 className="maintenance-section-title">处理建议</h3>
        <ul>{guidance.map(item => <li key={item}>{item}</li>)}</ul>
      </section>}
    </Dialog>}
  </div>
}
