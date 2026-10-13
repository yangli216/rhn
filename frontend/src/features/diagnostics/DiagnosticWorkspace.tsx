import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { RhnApi } from '../../shared/rhnApi'
import { Button, PageHeader, Panel } from '../../shared/ui'

/** Retained links choose a business workspace without losing their patient/encounter filters. */
export function DiagnosticWorkspace({ clinicalContext, onNavigate }: {
  api: RhnApi; clinicalContext: ClinicalContext; onNavigate: (path: string) => void
}) {
  const [params] = useSearchParams()
  const open = (category: 'laboratory' | 'examination') => {
    const query = new URLSearchParams(params)
    query.delete('requestType')
    onNavigate(`/diagnostics/${category}${query.size ? `?${query}` : ''}`)
  }
  return <><PageHeader title="检查检验" description={`${clinicalContext.organization.name} · ${clinicalContext.department.name}`} />
    <Panel><h2>选择作业工作台</h2><p>患者和就诊筛选会带入所选工作台。</p>
      <div className="ui-form-actions"><Button onClick={() => open('laboratory')}>进入检验工作台</Button>
        <Button variant="secondary" onClick={() => open('examination')}>进入检查工作台</Button></div>
    </Panel></>
}
