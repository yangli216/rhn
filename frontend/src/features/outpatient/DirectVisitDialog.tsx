import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { Encounter, Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, PatientIdentitySearch, Select, type PatientIdentityMethod } from '../../shared/ui'
import { formatTime } from '../../shared/format'

export function DirectVisitDialog({ api, hasServiceFee, onClose, onReceived, identityMethods }: {
  api: RhnApi; hasServiceFee: boolean; onClose: () => void
  onReceived: (resident: Resident, encounter: Encounter) => void
  identityMethods?: PatientIdentityMethod[]
}) {
  const [resident, setResident] = useState<Resident | null>(null)
  const [nameChecked, setNameChecked] = useState(false)
  const [identityChecked, setIdentityChecked] = useState(false)
  const [candidates, setCandidates] = useState<Encounter[]>([])
  const [encounterId, setEncounterId] = useState('')
  const code = useRef('')
  const receive = useMutation({
    mutationFn: () => api.encounters.directVisit({ residentId: resident!.id, encounterId: encounterId || undefined,
      commandCode: code.current, factorResults: { NAME: nameChecked, DEMOGRAPHIC_OR_IDENTIFIER: identityChecked },
      terminalCode: 'DOCTOR_WORKSTATION' }),
    onSuccess: result => {
      if (result.outcome === 'SELECT_REGISTRATION') { setCandidates(result.candidates); return }
      if (result.encounter && resident) onReceived(resident, result.encounter)
    },
  })
  const selectResident = (value: Resident | null) => {
    setResident(value); setNameChecked(false); setIdentityChecked(false); setCandidates([]); setEncounterId('')
    code.current = crypto.randomUUID(); receive.reset()
  }
  return <Dialog title="直接接诊" description="确认患者身份后，复用本科室有效挂号；没有有效挂号时自动挂号并接诊。"
    closeOnBackdrop={false} onClose={receive.isPending ? () => {} : onClose}
    footer={<><Button variant="secondary" disabled={receive.isPending} onClick={onClose}>取消</Button>
      <Button busy={receive.isPending} disabled={!resident || !nameChecked || !identityChecked || candidates.length > 0 && !encounterId}
        onClick={() => receive.mutate()}>确认身份并接诊</Button></>}>
    {receive.error && <Alert>{errorMessage(receive.error)}</Alert>}
    <PatientIdentitySearch queryKey="doctor-direct-visit" search={api.residents.search} selected={resident}
      onSelect={selectResident} onClear={() => selectResident(null)} methods={identityMethods}
      disabled={receive.isPending} getOptionDisabledReason={value => value.deceased ? '已登记死亡，不能接诊' : undefined} />
    {resident && <div className="doctor-direct-visit-verification">
      <label><input type="checkbox" checked={nameChecked} disabled={receive.isPending}
        onChange={event => setNameChecked(event.target.checked)} />已核对患者姓名：{resident.fullName}</label>
      <label><input type="checkbox" checked={identityChecked} disabled={receive.isPending}
        onChange={event => setIdentityChecked(event.target.checked)} />已核对出生日期、证件或卡号等另一项身份信息</label>
    </div>}
    {candidates.length > 0 && <div><p>发现多条有效挂号，请选择本次接诊记录。</p>
      <Select aria-label="选择有效挂号" value={encounterId} onChange={setEncounterId} disabled={receive.isPending}
        options={candidates.map(value => ({ value: value.id, label: value.encounterNo,
          secondaryText: `${formatTime(value.registeredAt)} · ${value.status === 'REGISTERED' ? '待接诊' : '已接诊'}` }))} />
    </div>}
    <p>{hasServiceFee ? '自动新建就诊时，科室配置的门诊服务费将加入待结算费用，与本次其他费用一起收取。'
      : '本科室未配置门诊服务费，自动挂号不收费。后续药品、检查等费用按正常规则结算。'}</p>
  </Dialog>
}
