import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField } from '../../../shared/ui'
import { requirePractitionerAccess } from './accessFacts'

/** 为人员开通登录账号；开通后自动授予其任职科室的默认角色。初始密码仅在此处输入，不回显、不保存在页面。 */
export function OpenAccountDialog({ api, practitionerId, practitionerName, suggestedUsername, onClose, onDone }: {
  api: RhnApi; practitionerId: string; practitionerName: string; suggestedUsername: string
  onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const [username, setUsername] = useState(suggestedUsername.toLowerCase())
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validation, setValidation] = useState('')
  const mutation = useMutation({
    mutationFn: async () => {
      const next = requirePractitionerAccess(await api.identityAccess.openAccount(practitionerId, { username: username.trim(), initialPassword: password }), practitionerId)
      if (!next.account) throw new Error('账号开通结果未确认，请重新加载核实')
      const defaults = next.assignments.filter(item => item.grantSource === 'DEPT_DEFAULT' && item.effective).length
      return `已为${practitionerName}开通账号 ${next.account.username}${defaults ? `，并按科室默认授予 ${defaults} 个角色` : ''}`
    },
    onSuccess: message => onDone(message),
  })
  const submit = () => {
    setValidation('')
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(username.trim())) { setValidation('登录账号为 3–64 位字母、数字、点、下划线或连字符，且以字母或数字开头'); return }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setValidation('初始密码须为 8–64 位，且同时包含字母和数字'); return }
    if (password !== confirm) { setValidation('两次输入的初始密码不一致'); return }
    mutation.mutate()
  }
  return <Dialog title="开通登录账号" eyebrow={practitionerName} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} onClick={submit}>确认开通</Button></>}>
    {(validation || mutation.error) && <Alert placement="inline">{validation || `开通未完成：${errorMessage(mutation.error)}`}</Alert>}
    <p className="access-hint">开通后按其任职科室的默认角色自动授权；请通过线下安全渠道告知初始密码。</p>
    <fieldset disabled={mutation.isPending} className="access-form">
      <FormField label="登录账号" required hint="默认使用工号，可修改；保存后不区分大小写">
        <input maxLength={64} autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} /></FormField>
      <FormField label="初始密码" required hint="8–64 位，同时包含字母和数字">
        <input type="password" maxLength={64} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></FormField>
      <FormField label="确认初始密码" required>
        <input type="password" maxLength={64} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /></FormField>
    </fieldset>
  </Dialog>
}
