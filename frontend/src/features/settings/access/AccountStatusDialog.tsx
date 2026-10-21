import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type AccessUser, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField } from '../../../shared/ui'
import { requireAccountChange } from './accessFacts'

/** 停用或启用登录账号。停用立即结束其已登录会话，角色授权保留；启用后按原有授权恢复登录。 */
export function AccountStatusDialog({ api, account, practitionerName, onClose, onDone }: {
  api: RhnApi; account: AccessUser; practitionerName: string; onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const disabling = account.status === 'ACTIVE'
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: async () => {
      const target = disabling ? 'INACTIVE' : 'ACTIVE'
      const next = requireAccountChange(await api.identityAccess.changeAccountStatus(account, target, reason.trim()), account)
      if (next.status !== target) throw new Error('账号状态保存结果未确认，请重新加载核实')
      return `已${disabling ? '停用' : '启用'}${practitionerName}的登录账号 ${next.username}`
    },
    onSuccess: message => onDone(message),
  })
  const title = disabling ? '停用登录账号' : '启用登录账号'
  return <Dialog title={title} eyebrow={practitionerName} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button variant={disabling ? 'danger' : 'primary'} busy={mutation.isPending} onClick={() => mutation.mutate()}>{disabling ? '确认停用' : '确认启用'}</Button></>}>
    {mutation.error && <Alert placement="inline">{disabling ? '停用' : '启用'}未完成：{errorMessage(mutation.error)}</Alert>}
    <p>{disabling
      ? <>停用账号 <code>{account.username}</code> 后，其已登录的会话立即失效且不能再登录；角色授权保留，重新启用即恢复。</>
      : <>启用账号 <code>{account.username}</code> 后可使用现有密码登录，权限以当前有效的角色授权为准。</>}</p>
    <fieldset disabled={mutation.isPending} className="access-form">
      <FormField label="原因" hint="记入账号审计记录">
        <textarea rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></FormField>
    </fieldset>
  </Dialog>
}
