import { useState } from 'react'
import type { ReceptionLocateMatch } from '../../../shared/api/schedulingApi'
import { errorMessage } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, StatusBadge } from '../../../shared/ui'

const statusText: Record<string, string> = {
  WAITING: '候诊', CALLED: '已叫号', SERVING: '接诊中', SUSPENDED: '已暂挂', MISSED: '已过号', COMPLETED: '已诊毕',
}

function matchSummary(match: ReceptionLocateMatch) {
  const { item } = match
  return `${item.ticketNo ?? ''} · ${item.serviceName ?? '门诊'} · ${statusText[item.status] ?? item.status}`
    + (item.clinicianName ? ` · 接诊医生 ${item.clinicianName}` : '')
}

/** 读卡定位到多条有效就诊时，由医生选择本次要处理的一条。 */
export function LocateChoiceDialog({ residentName, matches, onChoose, onClose }: {
  residentName: string; matches: ReceptionLocateMatch[]
  onChoose: (match: ReceptionLocateMatch) => void; onClose: () => void
}) {
  return <Dialog title={`选择就诊记录 · ${residentName}`}
    description="该患者在本机构有多条有效就诊，请选择本次要处理的一条。"
    onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>取消</Button>}>
    <ul className="locate-choice-list">
      {matches.map((match) => <li key={match.item.registrationId}>
        <div>
          <strong>{match.item.registrationNo ?? match.item.ticketNo}</strong>
          <span>{matchSummary(match)}</span>
          {match.reason && <StatusBadge tone="warning">{match.reason}</StatusBadge>}
        </div>
        <Button size="sm" variant={match.action === 'ENTER' ? 'primary' : 'secondary'} onClick={() => onChoose(match)}>
          {match.action === 'ENTER' ? '接诊' : match.action === 'CONFIRM_TAKEOVER' ? '接管' : '查看'}
        </Button>
      </li>)}
    </ul>
  </Dialog>
}

/** 患者正由其他医生接诊或暂挂：必须填写原因并确认后才接管，避免悄然改变他人的工作状态。 */
export function TakeoverDialog({ match, busy, error, onConfirm, onViewOnly, onClose }: {
  match: ReceptionLocateMatch; busy: boolean; error: unknown
  onConfirm: (reason: string) => void; onViewOnly: () => void; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const { item } = match
  const suspended = item.status === 'SUSPENDED'
  return <Dialog title="接管他人接诊" eyebrow="门诊队列 · 状态处置" onClose={onClose}
    description={`${item.residentName} 正由 ${item.clinicianName ?? '其他医生'} ${suspended ? '暂挂中' : '接诊中'}。接管后原医生的接诊会话将关闭，病历和医嘱保留，操作全程留痕。`}
    footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button variant="secondary" disabled={busy} onClick={onViewOnly}>只读查看</Button>
      <Button busy={busy} disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>确认接管</Button>
    </>}>
    <FormField label="接管原因" required>
      <textarea value={reason} maxLength={300} placeholder="例如：原接诊医生离岗、患者转至本诊室"
        onChange={(event) => setReason(event.target.value)} />
    </FormField>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
  </Dialog>
}

/** 启用叫号时，读卡患者前面还有候诊者：提示后由医生决定是否优先接诊。 */
export function OutOfTurnDialog({ match, onConfirm, onClose }: {
  match: ReceptionLocateMatch; onConfirm: () => void; onClose: () => void
}) {
  return <Dialog title="患者未排到" onClose={onClose}
    description={`${match.item.residentName} 当前排第 ${match.queuePosition ?? '?'} 位，前面还有候诊患者。仍要优先接诊吗？`}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button onClick={onConfirm}>优先接诊</Button></>}>
    <p>优先接诊会跳过排在前面的患者，接诊记录保留叫号与开始时间供复核。</p>
  </Dialog>
}
