import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExaminationReportEditor } from './ExaminationReportEditor'

describe('ExaminationReportEditor (WS 445.11 Structured Reporting)', () => {
  it('renders template selector, phrase tags, findings and conclusion fields', () => {
    render(
      <ExaminationReportEditor
        findings="双肺清晰"
        conclusion="心肺正常"
        onChange={vi.fn()}
        disabled={false}
      />
    )

    expect(screen.getByRole('region', { name: '检查报告录入' })).toBeInTheDocument()
    expect(screen.getByLabelText('选择国家标准检查报告模板')).toBeInTheDocument()
    expect(screen.getByText('套用模板')).toBeInTheDocument()
    expect(screen.getByText('胸部常见征象')).toBeInTheDocument()
    expect(screen.getByText('腹部超声征象')).toBeInTheDocument()
    expect(screen.getByLabelText(/检查所见/)).toHaveValue('双肺清晰')
    expect(screen.getByLabelText(/检查结论/)).toHaveValue('心肺正常')
  })

  it('applies selected national template to findings and conclusion', async () => {
    const onChange = vi.fn()
    render(
      <ExaminationReportEditor
        findings=""
        conclusion=""
        onChange={onChange}
        disabled={false}
      />
    )

    // 点击下拉触发器
    const selectTrigger = screen.getByLabelText('选择国家标准检查报告模板')
    fireEvent.click(selectTrigger)

    // 点击第一个模板选项（胸部）
    const option = await screen.findByRole('option', { name: /\[DR\] 胸部/ })
    fireEvent.click(option)

    // 点击套用模板按钮
    const applyBtn = screen.getByRole('button', { name: '套用模板' })
    fireEvent.click(applyBtn)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        findings: expect.stringContaining('双肺野清晰，肺纹理走行分布自然'),
        conclusion: expect.stringContaining('胸部摄片未见明确活动性病变'),
      })
    )
  })

  it('inserts common phrase into findings and conclusion when clicked', () => {
    const onChange = vi.fn()
    render(
      <ExaminationReportEditor
        findings="初步所见："
        conclusion="初步意见："
        onChange={onChange}
        disabled={false}
      />
    )

    const phraseBtn = screen.getByText('+ 双肺纹理增多增粗')
    fireEvent.click(phraseBtn)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        findings: expect.stringContaining('双侧肺纹理走行增多、粗糙紊乱'),
        conclusion: expect.stringContaining('双肺纹理增多增粗，多考虑慢性支气管疾患'),
      })
    )
  })
})
