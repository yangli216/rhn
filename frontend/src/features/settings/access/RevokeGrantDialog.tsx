import { useMutation } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type UserRoleAssignment } from '../../../shared/rhnApi'
import { Alert, Button, Dialog } from '../../../shared/ui'
import { grantScopeText } from './accessFacts'

/** 撤销即刻终止授权（待生效授权终止于其生效时刻），保留记录与审计事件。 */
export function RevokeGrantDialog({ api, grant, onClose, onDone }: {
  api: RhnApi; grant: UserRoleAssignment; onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const who = grant.practitionerName ?? grant.username
  const mutation = useMutation({
    mutationFn: async () => { await api.identityAccess.revokeAssignment(grant.id); return `已撤销${who}的“${grant.roleName}”` },
    onSuccess: message => onDone(message),
  })
  return <Dialog title="撤销角色授权" eyebrow={who} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button variant="danger" busy={mutation.isPending} onClick={() => mutation.mutate()}>确认撤销</Button></>}>
    {mutation.error && <Alert placement="inline">撤销未完成：{errorMessage(mutation.error)}</Alert>}
    <p>撤销{who}在“{grantScopeText(grant)}”的“{grant.roleName}”授权，立即生效。</p>
    {grant.grantSource === 'DEPT_DEFAULT' && <p className="access-hint">该授权来自科室默认角色；撤销后，同一任职期间不会再自动补授。</p>}
  </Dialog>
}
