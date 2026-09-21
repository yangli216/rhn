import { useEffect, useState } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, PageHeader, Tabs } from '../../shared/ui'
import { prefetchCanvasEditor } from './CanvasMedicalRecordEditor'
import '../../styles/features/inpatient.css'
import { InpatientAdmissionDiagnosisPanel } from './InpatientAdmissionDiagnosisPanel'
import { InpatientDiagnosticResults } from './InpatientDiagnosticResults'
import { InpatientMedicalRecordWorkspace } from './InpatientMedicalRecordWorkspace'
import { InpatientOrderWorkspace } from './InpatientOrderWorkspace'
import { InpatientPatientPool, InpatientStationPatientWorkspace,
  useInpatientPatientSelection } from './InpatientStationShared'
import { DischargeDialog, EpisodeDetail } from './InpatientWorkspace'

type DoctorArea = 'OVERVIEW' | 'DIAGNOSES' | 'ORDERS' | 'RESULTS' | 'RECORDS'

export function InpatientDoctorStation({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const patient = useInpatientPatientSelection(api, clinicalContext, 'ACTIVE', false)
  const [area, setArea] = useState<DoctorArea>('OVERVIEW')
  const [dischargeOpen, setDischargeOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => { prefetchCanvasEditor() }, 1000)
    return () => clearTimeout(timer)
  }, [])

  return <>
    <PageHeader compact eyebrow="住院医疗 · 临床工作区" title="住院医生站"
      description={patient.selected ? `正在处理 ${patient.selected.bedNo ?? '未分床'} · ${patient.selected.residentName}`
        : '先从病区患者池定位患者，再进入持续保留患者上下文的诊疗工作区。'} />
    {patient.bootstrap.error && <Alert>{errorMessage(patient.bootstrap.error)}</Alert>}
    {!patient.selected ? <InpatientPatientPool title="我的在院患者" description="点击患者卡片进入诊疗工作区；危急和重点护理患者会被优先标识。"
      episodes={patient.episodes} keyword={patient.keyword} loading={patient.bootstrap.isPending}
      onKeywordChange={patient.setKeyword} onSearch={patient.search} onSelect={(id) => {
        patient.setSelectedId(id)
        setArea('ORDERS')
      }} /> : <InpatientStationPatientWorkspace title="住院医生站" episodes={patient.episodes}
        selected={patient.selected} selectedId={patient.selectedId} keyword={patient.keyword}
        loading={patient.bootstrap.isPending} onKeywordChange={patient.setKeyword} onSearch={patient.search}
        onSelect={patient.setSelectedId} onBack={() => {
          patient.setSelectedId('')
          setArea('OVERVIEW')
        }} actions={<Button size="sm" variant="secondary" onClick={() => setDischargeOpen(true)}>办理出院</Button>}>
      <Tabs value={area} onChange={setArea} label="住院医生工作区" variant="workspace" responsiveCards
        className="inpatient-station-tabs" items={[
          { value: 'OVERVIEW', label: '患者概览', panelId: 'doctor-overview-panel' },
          { value: 'DIAGNOSES', label: '诊断', panelId: 'doctor-diagnoses-panel' },
          { value: 'ORDERS', label: '医嘱', panelId: 'doctor-orders-panel' },
          { value: 'RESULTS', label: '检查检验', panelId: 'doctor-results-panel' },
          { value: 'RECORDS', label: '住院病历', panelId: 'doctor-records-panel' },
        ]} />
      {area === 'OVERVIEW' && <div className="inpatient-doctor-overview" role="tabpanel"
        id="doctor-overview-panel">
        <EpisodeDetail value={patient.selected} onDischarge={() => setDischargeOpen(true)} />
        <InpatientAdmissionDiagnosisPanel api={api} episode={patient.selected} variant="summary"
          onManage={() => setArea('DIAGNOSES')} />
      </div>}
      {area === 'DIAGNOSES' && <div role="tabpanel" id="doctor-diagnoses-panel">
        <InpatientAdmissionDiagnosisPanel api={api} episode={patient.selected} />
      </div>}
      {area === 'ORDERS' && <div role="tabpanel" id="doctor-orders-panel">
        <InpatientOrderWorkspace api={api} episode={patient.selected} fixedWorkbench="DOCTOR" />
      </div>}
      {area === 'RESULTS' && <div role="tabpanel" id="doctor-results-panel">
        <InpatientDiagnosticResults api={api} episode={patient.selected} />
      </div>}
      {area === 'RECORDS' && <div role="tabpanel" id="doctor-records-panel">
        <InpatientMedicalRecordWorkspace api={api} episode={patient.selected}
          organizationName={clinicalContext.organization.name} />
      </div>}
    </InpatientStationPatientWorkspace>}
    {dischargeOpen && patient.selected && <DischargeDialog api={api} episode={patient.selected}
      onClose={() => setDischargeOpen(false)} onSuccess={async () => {
        setDischargeOpen(false)
        patient.setSelectedId('')
        await patient.refresh()
      }} />}
  </>
}

export default InpatientDoctorStation
