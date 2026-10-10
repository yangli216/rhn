import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { TerminateEncounterInput } from "../../../shared/api/outpatientFlowApi";
import type { Encounter } from "../../../shared/model";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, FormField, Icon, LoadingState, Select } from "../../../shared/ui"
import { commandCode } from './workstationShared'

export const suspensionReasons = ['患者暂时离开诊室', '等待检查检验结果', '急诊或其他患者优先处置', '其他原因'] as const

export const terminationTypes = [
  ['PATIENT_LEFT', '患者自行离院'],
  ['PATIENT_REQUEST', '患者要求终止'],
  ['TRANSFERRED', '转其他机构或急诊'],
  ['OTHER', '其他原因'],
] as const

export function EncounterTerminationDialog({ encounter, api, busy, error, onClose, onConfirm }: {
  encounter: Encounter; api: RhnApi; busy: boolean; error: unknown; onClose: () => void
  onConfirm: (input: TerminateEncounterInput) => void
}) {
  const [terminationCode, setTerminationCode] = useState<TerminateEncounterInput['terminationCode']>('PATIENT_LEFT')
  const [reason, setReason] = useState('')
  const [requestCommand, setRequestCommand] = useState(() => commandCode('TERMINATE', encounter.id))
  const readiness = useQuery({
    queryKey: ['encounter-termination-readiness', encounter.id],
    queryFn: () => api.outpatientFlow.terminationReadiness(encounter.id),
  })
  const issues = readiness.data?.issues ?? []
  return <Dialog title="终止本次诊疗" eyebrow="门诊接诊 · 异常收口" closeOnBackdrop={false}
    description="仅用于已经接诊但无法正常诊毕的场景。系统会保留挂号、病历和已完成业务事实。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>返回接诊</Button>
      <Button busy={busy} disabled={readiness.isPending || !readiness.data?.ready || !reason.trim()}
        onClick={() => onConfirm({ commandCode: requestCommand,
          terminationCode, reason: reason.trim() })}>确认终止诊疗</Button></>}>
    <div className="ui-form-grid">
      <FormField label="终止类型" required><Select value={terminationCode} clearable={false}
        onChange={(value) => { setTerminationCode(value as TerminateEncounterInput['terminationCode'])
          setRequestCommand(commandCode('TERMINATE', encounter.id)) }}
        options={terminationTypes.map(([value, label]) => ({ value, label }))} /></FormField>
      <FormField label="终止原因" required><textarea value={reason} maxLength={500}
        onChange={(event) => { setReason(event.target.value); setRequestCommand(commandCode('TERMINATE', encounter.id)) }}
        placeholder="记录患者离院、拒绝继续诊疗或转诊等具体情况" /></FormField>
    </div>
    {readiness.isPending && <LoadingState label="正在核对费用及诊后任务…" />}
    {readiness.data?.ready && <Alert>当前没有未处置的费用、药房、医技或治疗任务，可以终止本次接诊。</Alert>}
    {issues.length > 0 && <div className="doctor-completion-checklist doctor-completion-checklist--dialog">
      {issues.map((issue) => <span key={issue.code}><Icon name="warning" className="ui-icon-inline" /> {issue.message}</span>)}
    </div>}
    {Boolean(readiness.error || error) && <Alert>{errorMessage(readiness.error || error)}</Alert>}
  </Dialog>
}

export function EncounterSuspendDialog({ encounterId, busy, error, onClose, onConfirm }: {
  encounterId: string; busy: boolean; error: unknown; onClose: () => void
  onConfirm: (input: { commandCode: string; reason: string }) => void
}) {
  const [reason, setReason] = useState<(typeof suspensionReasons)[number]>(suspensionReasons[0])
  const [note, setNote] = useState('')
  const [requestCommand, setRequestCommand] = useState(() => commandCode('SUSPEND', encounterId))
  const value = `${reason}${note.trim() ? `：${note.trim()}` : ''}`
  return <Dialog title="暂挂本次接诊" eyebrow="门诊队列 · 状态处置"
    description="暂挂后患者会保留在今日队列，病历和医嘱不会丢失，返回后可以继续接诊。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={busy} onClick={() => onConfirm({ commandCode: requestCommand, reason: value })}>确认暂挂</Button></>}>
    <div className="ui-form-grid">
      <FormField label="暂挂原因" required><Select value={reason} clearable={false}
        onChange={(value) => { setReason(value as typeof reason)
          setRequestCommand(commandCode('SUSPEND', encounterId)) }}
        options={suspensionReasons.map((value) => ({ value, label: value }))} /></FormField>
      <FormField label="补充说明"><textarea value={note} maxLength={300}
        onChange={(event) => { setNote(event.target.value); setRequestCommand(commandCode('SUSPEND', encounterId)) }}
        placeholder="可选" /></FormField>
    </div>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
  </Dialog>
}
