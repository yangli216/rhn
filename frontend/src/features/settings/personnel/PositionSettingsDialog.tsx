import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems, type Position, type PositionType, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, Dialog, FormField, Select, StatusBadge, tableCellClass } from '../../../shared/ui'
import { requirePositions } from '../organizationPersonnelFacts'
import type { usePersonnelOptions } from './usePersonnelOptions'

/** 岗位目录：新增、改名改类别、停用/启用。已有任职引用的岗位由后端拒绝改类别；停用后不再接收新任职。 */
export function PositionSettingsDialog({ api, options, onClose, onChanged }: {
  api: RhnApi; options: ReturnType<typeof usePersonnelOptions>; onClose: () => void; onChanged: (message: string) => Promise<void>
}) {
  const positions = options.positions.data ?? []
  const types = systemEnumItems(options.enums, ORGANIZATION_SYSTEM_ENUM.positionType).map(item => ({ value: item.code, label: item.name }))
  const [editing, setEditing] = useState<Position>()
  const [form, setForm] = useState({ code: '', name: '', type: '' })
  const [validation, setValidation] = useState('')
  const edit = (position?: Position) => { setEditing(position); setValidation(''); save.reset()
    setForm({ code: position?.code ?? '', name: position?.name ?? '', type: position?.sdPositionType ?? '' }) }
  const save = useMutation({
    mutationFn: async (input: { position?: Position; status?: Position['sdPersonnelStatus'] }) => {
      const target = input.position ?? editing
      if (target) {
        const [next] = requirePositions([await api.organization.updatePosition(target.id, { expectedRevision: target.revision,
          name: input.status ? target.name : form.name.trim(), sdPositionType: (input.status ? target.sdPositionType : form.type) as PositionType,
          dutyDescription: target.dutyDescription ?? undefined, sdPersonnelStatus: input.status ?? target.sdPersonnelStatus, reason: '岗位维护' })])
        if (next.id !== target.id || next.revision <= target.revision) throw new Error('岗位保存结果未确认，请重新加载核实')
        return `已保存岗位“${next.name}”`
      }
      const [created] = requirePositions([await api.organization.createPosition({ code: form.code.trim(), name: form.name.trim(), sdPositionType: form.type as PositionType })])
      return `已新增岗位“${created.name}”`
    },
    onSuccess: async message => { edit(undefined); await onChanged(message) },
  })
  const submit = () => {
    setValidation('')
    if ((!editing && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(form.code.trim())) || !form.name.trim() || !form.type) { setValidation('请填写字母开头的岗位代码、岗位名称和类别'); return }
    save.mutate({})
  }
  return <Dialog title="岗位设置" eyebrow="人员管理" size="wide" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    {(validation || save.error) && <Alert placement="inline">{validation || `保存未完成：${errorMessage(save.error)}`}</Alert>}
    <fieldset disabled={save.isPending} className="personnel-position-form" aria-label={editing ? '编辑岗位' : '新增岗位'}>
      <FormField label="岗位代码" required>{editing ? <input value={form.code} readOnly /> :
        <input maxLength={64} value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} />}</FormField>
      <FormField label="岗位名称" required><input maxLength={128} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></FormField>
      <FormField label="类别" required><Select value={form.type} onChange={type => setForm(current => ({ ...current, type }))} options={types} /></FormField>
      <div className="personnel-position-form__actions">
        <Button busy={save.isPending} onClick={submit}>{editing ? '保存修改' : '新增岗位'}</Button>
        {editing && <Button variant="secondary" onClick={() => edit(undefined)}>取消编辑</Button>}
      </div>
    </fieldset>
    <DataTable compact aria-label="岗位目录">
      <thead><tr><th>代码</th><th>名称</th><th>类别</th><th className={tableCellClass('status')}>状态</th><th className={tableCellClass('actions')}>操作</th></tr></thead>
      <tbody>{positions.map(position => <tr key={position.id}>
        <td><code>{position.code}</code></td><td>{position.name}</td><td>{position.sdPositionTypeText}</td>
        <td className={tableCellClass('status')}><StatusBadge tone={position.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>{position.sdPersonnelStatus === 'ACTIVE' ? '启用' : '停用'}</StatusBadge></td>
        <td className={tableCellClass('actions')}>
          <Button size="sm" variant="text" disabled={save.isPending} onClick={() => edit(position)}>编辑</Button>
          <Button size="sm" variant="text" disabled={save.isPending} onClick={() => save.mutate({ position, status: position.sdPersonnelStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
            {position.sdPersonnelStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
        </td>
      </tr>)}</tbody>
    </DataTable>
  </Dialog>
}
