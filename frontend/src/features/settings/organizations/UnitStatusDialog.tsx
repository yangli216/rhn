import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { errorMessage, type OrganizationUnit, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, LoadingState } from '../../../shared/ui'
import { organizationQueryScope } from '../organizationQueryScope'

const impactSchema = z.object({ activeChildren: z.number().int().nonnegative(), continuingAssignments: z.number().int().nonnegative(),
  continuingEmployments: z.number().int().nonnegative() })

/** 停用前展示依赖；存在启用下级、在岗/待生效任职或未结束聘用时不允许停用，后端同样拒绝。 */
export function UnitStatusDialog({ api, unit, busy, error, onClose, onConfirm }: {
  api: RhnApi; unit: OrganizationUnit; busy: boolean; error?: string; onClose: () => void; onConfirm: () => void
}) {
  const deactivating = unit.sdOrgStatus === 'ACTIVE'
  const impact = useQuery({ queryKey: ['organization-impact', organizationQueryScope(api), unit.id, unit.revision], enabled: deactivating,
    queryFn: async () => impactSchema.parse(await api.organization.deactivationImpact(unit)) })
  const blockers = impact.data ? [
    impact.data.activeChildren && `启用中的下级组织 ${impact.data.activeChildren} 个`,
    impact.data.continuingAssignments && `仍在继续或待生效的任职 ${impact.data.continuingAssignments} 条`,
    impact.data.continuingEmployments && `未结束的聘用 ${impact.data.continuingEmployments} 条`,
  ].filter(Boolean) as string[] : []
  const blocked = deactivating && (!impact.isSuccess || impact.isFetching || blockers.length > 0)
  const action = deactivating ? '停用' : '启用'
  return <Dialog title={`${action}${unit.name}`} onClose={onClose} footer={<>
    <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
    <Button variant={deactivating ? 'danger' : 'primary'} busy={busy} disabled={busy || blocked} onClick={onConfirm}>确认{action}</Button></>}>
    {deactivating && (impact.isPending ? <LoadingState label="正在检查依赖…" /> : impact.isError
      ? <Alert placement="inline">{errorMessage(impact.error)}<Button size="sm" variant="secondary" onClick={() => void impact.refetch()}>重新检查</Button></Alert>
      : blockers.length ? <Alert placement="inline" tone="warning">需先处理：{blockers.join('；')}。</Alert>
        : <p>停用后不再出现在新业务的选择中，已发生的业务记录不受影响。</p>)}
    {!deactivating && <p>启用后可再次用于排班、开单和新任职。</p>}
    {error && <Alert placement="inline">{error}</Alert>}
  </Dialog>
}
