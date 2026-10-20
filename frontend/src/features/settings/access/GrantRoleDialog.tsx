import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type AccessRole, type AccessUser, type DataScopeType, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DatePicker, Dialog, FormField, Select } from '../../../shared/ui'
import { endOfDateInstant, requireGrants } from './accessFacts'

export type GrantTarget = { key: string; label: string; dataScopeType: DataScopeType; organizationId?: string | null; departmentId?: string | null }

/**
 * 手工授予角色。人员抽屉中固定账号、选择角色；角色反查中固定角色、选择账号。
 * 授权范围只提供当前账号可管理、且对方有任职的科室，后端仍会校验管理范围与权限上限。
 */
export function GrantRoleDialog({ api, title, eyebrow, user, users, role, roles, targets, onClose, onDone }: {
  api: RhnApi; title: string; eyebrow?: string
  user?: AccessUser; users?: AccessUser[]; role?: AccessRole; roles?: AccessRole[]
  targets: GrantTarget[]; onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const [userId, setUserId] = useState(user?.id ?? '')
  const [roleId, setRoleId] = useState(role?.id ?? '')
  const [targetKey, setTargetKey] = useState(targets.length === 1 ? targets[0].key : '')
  const [validTo, setValidTo] = useState('')
  const [validation, setValidation] = useState('')
  const today = new Date().toLocaleDateString('sv-SE')
  const mutation = useMutation({
    mutationFn: async () => {
      const target = targets.find(item => item.key === targetKey)!
      const chosenRole = role ?? roles!.find(item => item.id === roleId)!
      const created = requireGrants([await api.identityAccess.assignRole(userId, { roleId: chosenRole.id, dataScopeType: target.dataScopeType,
        organizationId: target.organizationId ?? null, departmentId: target.departmentId ?? null, validTo: validTo ? endOfDateInstant(validTo) : null })])[0]
      if (created.userId !== userId || created.roleId !== chosenRole.id || created.grantSource !== 'MANUAL') throw new Error('授权保存结果未确认，请重新加载核实')
      return `已授予“${chosenRole.name}”：${target.label}`
    },
    onSuccess: message => onDone(message),
  })
  const submit = () => {
    setValidation('')
    if (!userId || !roleId || !targetKey) { setValidation('请完整填写必填项'); return }
    if (validTo && validTo < today) { setValidation('失效日期不能早于今天'); return }
    mutation.mutate()
  }
  return <Dialog title={title} eyebrow={eyebrow} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} disabled={!targets.length} onClick={submit}>确认授予</Button></>}>
    {(validation || mutation.error) && <Alert placement="inline">{validation || `授权未完成：${errorMessage(mutation.error)}`}</Alert>}
    {!targets.length && <Alert placement="inline" tone="warning">当前管理范围内没有可授权的科室：对方需在您可管理的科室有在岗或待生效任职。</Alert>}
    <fieldset disabled={mutation.isPending} className="access-form">
      {users && <FormField label="人员账号" required><Select value={userId} onChange={setUserId} searchable
        options={users.filter(item => item.status === 'ACTIVE').map(item => ({ value: item.id, label: item.practitionerName || item.username,
          secondaryText: item.practitionerName ? `${item.practitionerCode ?? ''} · ${item.username}` : item.username,
          searchKeywords: [item.username, item.practitionerCode ?? ''] }))} /></FormField>}
      {roles && <FormField label="角色" required><Select value={roleId} onChange={setRoleId} searchable
        options={roles.filter(item => item.status === 'ACTIVE').map(item => ({ value: item.id, label: item.name, secondaryText: item.code }))} /></FormField>}
      <FormField label="授权范围" required hint="角色只在该科室的工作上下文中生效">
        <Select value={targetKey} onChange={setTargetKey} clearable={false} options={targets.map(item => ({ value: item.key, label: item.label }))} /></FormField>
      <FormField label="失效日期（含当日，可选）" hint="留空表示长期有效">
        <DatePicker value={validTo} min={today} onChange={setValidTo} /></FormField>
    </fieldset>
  </Dialog>
}
