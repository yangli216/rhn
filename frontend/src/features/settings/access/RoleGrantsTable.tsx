import type { UserRoleAssignment } from '../../../shared/rhnApi'
import { Button, DataTable, StatusBadge, tableCellClass } from '../../../shared/ui'
import { formatValidity, grantOpen, grantScopeText, grantStatus } from './accessFacts'

/**
 * 授权记录表。person 视角首列为角色（人员抽屉），role 视角首列为人员（角色反查）。
 * 科室默认授权随对应任职结束自动失效，也可手工撤销；撤销后不会再被自动补回。
 */
export function RoleGrantsTable({ rows, view, canRevoke, busy, onRevoke, label }: {
  rows: UserRoleAssignment[]; view: 'person' | 'role'; canRevoke: boolean; busy: boolean
  onRevoke: (row: UserRoleAssignment) => void; label: string
}) {
  return <DataTable compact aria-label={label}>
    <thead><tr>
      {view === 'role' ? <><th>人员</th><th>登录账号</th></> : <th>角色</th>}
      <th>授权范围</th><th>来源</th><th>有效期</th><th className={tableCellClass('status')}>状态</th>
      {canRevoke && <th className={tableCellClass('actions')}>操作</th>}
    </tr></thead>
    <tbody>{rows.map(row => {
      const status = grantStatus(row)
      return <tr key={row.id}>
        {view === 'role'
          ? <><td>{row.practitionerName ? `${row.practitionerName}（${row.practitionerCode}）` : '未关联人员'}</td><td><code>{row.username}</code></td></>
          : <td>{row.roleName} <code>{row.roleCode}</code></td>}
        <td>{grantScopeText(row)}</td>
        <td>{row.grantSource === 'DEPT_DEFAULT' ? '科室默认' : '手工授予'}</td>
        <td>{formatValidity(row.validFrom, row.validTo)}</td>
        <td className={tableCellClass('status')}><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
        {canRevoke && <td className={tableCellClass('actions')}>
          {grantOpen(row) && <Button size="sm" variant="text" disabled={busy} onClick={() => onRevoke(row)}>撤销</Button>}</td>}
      </tr>
    })}</tbody>
  </DataTable>
}
