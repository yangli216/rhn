import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type AccessUser, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField } from '../../../shared/ui'
import { passwordAcceptable, requireAccountChange } from './accessFacts'

/** 管理员重置密码：新密码仅在此处输入，不回显、不保存在页面；重置后该账号已登录的会话全部失效。 */
export function ResetPasswordDialog({ api, account, practitionerName, onClose, onDone }: {
  api: RhnApi; account: AccessUser; practitionerName: string; onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validation, setValidation] = useState('')
  const mutation = useMutation({
    mutationFn: async () => {
      const next = requireAccountChange(await api.identityAccess.resetPassword(account, password), account)
      return `已重置${practitionerName}的登录账号 ${next.username} 的密码`
    },
    onSuccess: message => onDone(message),
  })
  const submit = () => {
    setValidation('')
    if (!passwordAcceptable(password)) { setValidation('新密码须为 8–64 位，且同时包含字母和数字'); return }
    if (password !== confirm) { setValidation('两次输入的新密码不一致'); return }
    mutation.mutate()
  }
  return <Dialog title="重置密码" eyebrow={practitionerName} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} onClick={submit}>确认重置</Button></>}>
    {(validation || mutation.error) && <Alert placement="inline">{validation || `重置未完成：${errorMessage(mutation.error)}`}</Alert>}
    <p className="access-hint">重置账号 <code>{account.username}</code> 的密码后，其已登录的会话立即失效；请通过线下安全渠道告知新密码。</p>
    <fieldset disabled={mutation.isPending} className="access-form">
      <FormField label="新密码" required hint="8–64 位，同时包含字母和数字">
        <input type="password" maxLength={64} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></FormField>
      <FormField label="确认新密码" required>
        <input type="password" maxLength={64} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /></FormField>
    </fieldset>
  </Dialog>
}
