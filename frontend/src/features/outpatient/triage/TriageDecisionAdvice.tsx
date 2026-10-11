import type { TriageDecisionAssessment, TriageDecisionDepartment } from '../../../shared/api/outpatientTriageApi'
import { Button, LoadingState } from '../../../shared/ui'

interface Props {
  assessment?: TriageDecisionAssessment
  loading: boolean
  failed: boolean
  canAdopt: boolean
  targetDepartmentId?: string
  onAdopt: (department: TriageDecisionDepartment) => void
}

export function TriageDecisionAdvice({ assessment, loading, failed, canAdopt, targetDepartmentId, onAdopt }: Props) {
  if (!loading && !failed && (!assessment || assessment.mode === 'DISABLED')) return null
  const department = assessment?.department
  const shadow = assessment?.mode === 'SHADOW'
  return <section className="triage-decision-advice" aria-label="分诊辅助建议">
    <h3>科室与资料辅助</h3>
    <div className="triage-decision-advice__body">
      {loading ? <LoadingState label="正在形成辅助建议…" />
        : failed ? <p role="status">辅助建议获取失败，请继续规则评估与人工选择。</p>
        : <>
          <p role="status">{assessment?.message}</p>
          {!shadow && department?.departmentId && department.departmentName && <div>
            <strong>建议核对科室：{department.departmentName}</strong>
            <p>{department.scheduledToday === false ? '今日暂无已发布排班' : `今日可用号源：${department.availableScheduleCount ?? 0} 个`}</p>
            {canAdopt ? <Button size="sm" variant="secondary"
              disabled={targetDepartmentId === department.departmentId}
              onClick={() => onAdopt(department)}>
              {targetDepartmentId === department.departmentId ? '当前科室与建议一致' : '人工采纳科室建议'}
            </Button> : <p>建议仅供核对，请按现有流程确认接诊去向。</p>}
          </div>}
          {!shadow && Boolean(assessment?.supplements?.length) && <div>
            <strong>待核实资料</strong>
            <ul>{assessment?.supplements?.map((prompt) => <li key={prompt.topic}>{prompt.message}</li>)}</ul>
          </div>}
        </>}
    </div>
  </section>
}
