import type { ClinicalContext } from '../../app/AppShell'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, EmptyState, PageHeader } from '../../shared/ui'
import { InpatientBillingPanel } from './InpatientBillingPanel'
import { InpatientPatientContextBar, useInpatientPatientSelection } from './InpatientStationShared'

export function InpatientDepositWorkspace({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const patient = useInpatientPatientSelection(api, clinicalContext, 'ALL')
  return <>
    <PageHeader eyebrow="住院医疗 · 费用管理" title="预交金管理"
      description="查询在院及历史住院患者，收取预交金并核对每笔款项的抵扣、退款和可用余额。" />
    {patient.bootstrap.error && <Alert>{errorMessage(patient.bootstrap.error)}</Alert>}
    <InpatientPatientContextBar title="预交金管理" episodes={patient.episodes} selected={patient.selected}
      selectedId={patient.selectedId} keyword={patient.keyword} loading={patient.bootstrap.isPending}
      onKeywordChange={patient.setKeyword} onSearch={patient.search} onSelect={patient.setSelectedId} />
    {!patient.selected && !patient.bootstrap.isPending
      ? <EmptyState icon="billing" title="请选择住院记录" copy="可查询当前在院及历史出院患者的预交金记录。" />
      : patient.selected && <InpatientBillingPanel api={api} episode={patient.selected} view="deposits" />}
  </>
}

export default InpatientDepositWorkspace
