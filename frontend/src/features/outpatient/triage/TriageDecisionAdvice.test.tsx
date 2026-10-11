import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TriageDecisionAssessment } from '../../../shared/api/outpatientTriageApi'
import { TriageDecisionAdvice } from './TriageDecisionAdvice'

const assessment: TriageDecisionAssessment = {
  mode: 'ASSIST', status: 'ASSIST', message: '建议需人工确认，不决定分级。',
  department: { departmentId: '102', departmentName: '呼吸内科', availableScheduleCount: 0,
    scheduledToday: false, confidence: 0.99, probability: 0.995 },
  supplements: [{ topic: 'ONSET', message: '请补充开始时间。', confidence: 0.99 }],
}

describe('分诊辅助展示边界', () => {
  it('显示建议和资料提示，仅点击才采纳，不展示正确概率', () => {
    const onAdopt = vi.fn()
    render(<TriageDecisionAdvice assessment={assessment} loading={false} failed={false} canAdopt onAdopt={onAdopt} />)
    expect(onAdopt).not.toHaveBeenCalled()
    expect(screen.getByText('请补充开始时间。')).toBeInTheDocument()
    expect(screen.getByText('今日暂无已发布排班')).toBeInTheDocument()
    expect(screen.queryByText(/99%/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '人工采纳科室建议' }))
    expect(onAdopt).toHaveBeenCalledWith(assessment.department)
  })
  it('旁路即使收到建议字段也不展示可执行建议', () => {
    render(<TriageDecisionAdvice assessment={{ ...assessment, mode: 'SHADOW', status: 'SHADOW' }}
      loading={false} failed={false} canAdopt onAdopt={vi.fn()} />)
    expect(screen.queryByText(/呼吸内科/)).not.toBeInTheDocument()
    expect(screen.queryByText('请补充开始时间。')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('已有挂号和只读场景不提供采纳操作，等待时不显示旧建议', () => {
    const { rerender } = render(<TriageDecisionAdvice assessment={assessment} loading={false}
      failed={false} canAdopt={false} onAdopt={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<TriageDecisionAdvice assessment={assessment} loading failed={false} canAdopt onAdopt={vi.fn()} />)
    expect(screen.queryByText(/呼吸内科/)).not.toBeInTheDocument()
  })
  it('失效或失败时保留人工操作，不继续展示旧结果', () => {
    render(<TriageDecisionAdvice assessment={assessment} loading={false} failed canAdopt onAdopt={vi.fn()} />)
    expect(screen.getByText(/辅助建议获取失败/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
