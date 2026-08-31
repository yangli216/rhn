import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { InpatientBed } from '../../shared/api/inpatientApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, PageHeader, Tabs } from '../../shared/ui'
import { InpatientNursingWorkspace } from './InpatientNursingWorkspace'
import { InpatientOrderWorkspace } from './InpatientOrderWorkspace'
import { InpatientShiftHandoffWorkspace } from './InpatientShiftHandoffWorkspace'
import { InpatientPatientPool, InpatientStationPatientWorkspace,
  useInpatientPatientSelection } from './InpatientStationShared'
import { InpatientTemperatureChartPanel } from './InpatientTemperatureChart'
import { currentWardShiftWindow, InpatientWardBoard } from './InpatientWardBoard'
import { BedBoard, TransferDialog } from './InpatientWorkspace'

type NurseArea = 'OVERVIEW' | 'EXECUTION' | 'MEDICATION' | 'NURSING' | 'HANDOFF' | 'TEMPERATURE'

export function InpatientNurseStation({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const patient = useInpatientPatientSelection(api, clinicalContext, 'ACTIVE', false)
  const [area, setArea] = useState<NurseArea>('OVERVIEW')
  const [transferOpen, setTransferOpen] = useState(false)
  const shift = useMemo(() => currentWardShiftWindow(), [
    clinicalContext.organization.id, clinicalContext.department.id,
  ])
  const wardBoard = useQuery({
    queryKey: ['inpatient-ward-board', clinicalContext.organization.id, clinicalContext.department.id,
      shift.from, shift.to],
    queryFn: () => api.inpatient.wardBoard(shift.from, shift.to),
  })
  const bedStatus = useMutation({
    mutationFn: ({ bed, status, reason }: {
      bed: InpatientBed
      status: 'AVAILABLE' | 'BLOCKED'
      reason: string
    }) => api.inpatient.changeBedStatus(bed.id, {
      expectedRevision: bed.revision, status, reason, commandCode: `BED-${crypto.randomUUID()}`,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inpatient-bootstrap'] }),
        queryClient.invalidateQueries({ queryKey: ['inpatient-ward-board'] }),
      ])
    },
  })
  const available = patient.beds.filter((value) => value.displayStatus === 'AVAILABLE').length
  const occupied = patient.beds.filter((value) => value.displayStatus === 'OCCUPIED').length
  const cleaning = patient.beds.filter((value) => value.displayStatus === 'CLEANING').length
  const error = patient.bootstrap.error || wardBoard.error || bedStatus.error

  return <>
    <PageHeader compact eyebrow="住院医疗 · 护理工作区" title="病区护士站"
      description={patient.selected ? `正在处理 ${patient.selected.bedNo ?? '未分床'} · ${patient.selected.residentName}`
        : '先从病区患者池发现护理重点，再进入患者工作区完成执行、记录和交接。'} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    {!patient.selected ? <>
      <InpatientPatientPool title="本病区在院患者" description="先处理危急、逾期和重点护理患者，也可以按床号、住院号或姓名定位。"
        episodes={patient.episodes} keyword={patient.keyword} loading={patient.bootstrap.isPending}
        onKeywordChange={patient.setKeyword} onSearch={patient.search} onSelect={(id) => {
          patient.setSelectedId(id)
          setArea('EXECUTION')
        }} summary={<section className="inpatient-metrics" aria-label="病区运行摘要">
        <div><span>在院患者</span><strong>{occupied}</strong><small>{clinicalContext.department.name}</small></div>
        <div><span>可用床位</span><strong>{available}</strong><small>可接收入院患者</small></div>
        <div><span>待清洁</span><strong>{cleaning}</strong><small>清洁后释放</small></div>
        <div><span>需重点交接</span><strong>{wardBoard.data?.metrics.exceptionPatientCount ?? 0}</strong><small>本班异常事项</small></div>
      </section>} />
      <details className="inpatient-nurse-pool-support">
        <summary><span>病区床位管理</span><small>空床 {available} · 待清洁 {cleaning}</small></summary>
        <BedBoard beds={patient.beds} onSelectEpisode={(id) => {
          patient.setSelectedId(id)
          setArea('EXECUTION')
        }}
          onRelease={(bed) => bedStatus.mutate({ bed, status: 'AVAILABLE', reason: '床单位清洁消毒完成' })}
          onBlock={(bed) => bedStatus.mutate({ bed,
            status: bed.displayStatus === 'BLOCKED' ? 'AVAILABLE' : 'BLOCKED',
            reason: bed.displayStatus === 'BLOCKED' ? '恢复床位使用' : '人工封床' })} />
      </details>
    </> : <InpatientStationPatientWorkspace title="病区护士站" episodes={patient.episodes}
      selected={patient.selected} selectedId={patient.selectedId} keyword={patient.keyword}
      loading={patient.bootstrap.isPending} onKeywordChange={patient.setKeyword} onSearch={patient.search}
      onSelect={patient.setSelectedId} onBack={() => {
        patient.setSelectedId('')
        setArea('OVERVIEW')
      }} actions={<Button size="sm" variant="secondary" onClick={() => setTransferOpen(true)}>转床</Button>}>
      <Tabs value={area} onChange={setArea} label="护士站工作区" variant="workspace" responsiveCards
        className="inpatient-station-tabs" items={[
          { value: 'EXECUTION', label: '执行任务', meta: wardBoard.data?.metrics.pendingTaskCount,
            panelId: 'nurse-execution-panel' },
          { value: 'MEDICATION', label: '病区药品', meta: wardBoard.data?.metrics.awaitingReceiptBatchCount,
            panelId: 'nurse-medication-panel' },
          { value: 'NURSING', label: '护理记录', panelId: 'nurse-nursing-panel' },
          { value: 'TEMPERATURE', label: '体温单', panelId: 'nurse-temperature-panel' },
          { value: 'HANDOFF', label: '交接班', meta: wardBoard.data?.metrics.exceptionPatientCount,
            panelId: 'nurse-handoff-panel' },
          { value: 'OVERVIEW', label: '病区总览', panelId: 'nurse-overview-panel' },
        ]} />
      {area === 'OVERVIEW' && <div role="tabpanel" id="nurse-overview-panel">
        <section className="inpatient-metrics" aria-label="病区运行摘要">
          <div><span>在院患者</span><strong>{occupied}</strong><small>{clinicalContext.department.name}</small></div>
          <div><span>可用床位</span><strong>{available}</strong><small>可接收入院患者</small></div>
          <div><span>待清洁</span><strong>{cleaning}</strong><small>清洁后释放</small></div>
          <div><span>需重点交接</span><strong>{wardBoard.data?.metrics.exceptionPatientCount ?? 0}</strong><small>本班异常事项</small></div>
        </section>
        <InpatientWardBoard value={wardBoard.data} loading={wardBoard.isPending}
          selectedId={patient.selected.id} onSelect={patient.setSelectedId} />
        <BedBoard beds={patient.beds} selectedId={patient.selected.id} onSelectEpisode={patient.setSelectedId}
          onRelease={(bed) => bedStatus.mutate({ bed, status: 'AVAILABLE', reason: '床单位清洁消毒完成' })}
          onBlock={(bed) => bedStatus.mutate({ bed,
            status: bed.displayStatus === 'BLOCKED' ? 'AVAILABLE' : 'BLOCKED',
            reason: bed.displayStatus === 'BLOCKED' ? '恢复床位使用' : '人工封床' })} />
      </div>}
      {area === 'EXECUTION'
      && <div role="tabpanel" id="nurse-execution-panel"><InpatientOrderWorkspace api={api} episode={patient.selected}
        fixedWorkbench="NURSE" nurseArea="EXECUTION" /></div>}
      {area === 'MEDICATION'
      && <div role="tabpanel" id="nurse-medication-panel"><InpatientOrderWorkspace api={api} episode={patient.selected}
        fixedWorkbench="NURSE" nurseArea="MEDICATION" /></div>}
      {area === 'NURSING' && <div role="tabpanel" id="nurse-nursing-panel">
      <InpatientNursingWorkspace api={api} episode={patient.selected} /></div>}
      {area === 'HANDOFF' && <div role="tabpanel" id="nurse-handoff-panel">
      <InpatientShiftHandoffWorkspace api={api} episodes={patient.episodes} /></div>}
      {area === 'TEMPERATURE' && <div role="tabpanel" id="nurse-temperature-panel">
      <InpatientTemperatureChartPanel api={api} episode={patient.selected} /></div>}
    </InpatientStationPatientWorkspace>}
    {transferOpen && patient.selected && <TransferDialog api={api} episode={patient.selected} beds={patient.beds}
      onClose={() => setTransferOpen(false)} onSuccess={async (value) => {
        setTransferOpen(false)
        patient.setSelectedId(value.id)
        await patient.refresh()
      }} />}
  </>
}

export default InpatientNurseStation
