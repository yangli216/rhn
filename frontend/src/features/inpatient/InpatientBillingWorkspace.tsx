import type { ClinicalContext } from '../../app/AppShell'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, EmptyState, PageHeader } from '../../shared/ui'
import { InpatientBillingPanel } from './InpatientBillingPanel'
import { InpatientPatientContextBar, useInpatientPatientSelection } from './InpatientStationShared'

export function InpatientBillingWorkspace({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const patient = useInpatientPatientSelection(api, clinicalContext, 'ALL')
  return <>
    <PageHeader eyebrow="住院医疗 · 费用工作区" title="住院费用"
      description="按住院患者独立管理预交金、费用明细、日清单和出院结算，不占用医生站或护士站工作空间。" />
    {patient.bootstrap.error && <Alert>{errorMessage(patient.bootstrap.error)}</Alert>}
    <InpatientPatientContextBar title="住院费用" episodes={patient.episodes} selected={patient.selected}
      selectedId={patient.selectedId} keyword={patient.keyword} loading={patient.bootstrap.isPending}
      onKeywordChange={patient.setKeyword} onSearch={patient.search} onSelect={patient.setSelectedId} />
    {!patient.selected && !patient.bootstrap.isPending
      ? <EmptyState icon="billing" title="请选择住院记录" copy="可查询当前在院及历史出院患者的住院费用。" />
      : patient.selected && <InpatientBillingPanel api={api} episode={patient.selected} />}
  </>
}

export default InpatientBillingWorkspace
