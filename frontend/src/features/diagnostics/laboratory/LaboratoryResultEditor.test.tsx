import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import { CBC_5PART_INDICATORS } from '../../../shared/clinical/nationalStandardLabCatalog'
import { LaboratoryResultEditor } from './LaboratoryResultEditor'

const mockTemplate: DiagnosticTemplateVersion = {
  id: 'tpl-v1',
  organizationId: 'org-1',
  catalogItemId: 'cat-cbc',
  version: 1,
  serviceType: 'LABORATORY',
  effectiveFrom: '2026-01-01T00:00:00Z',
  publicationBasis: 'WS/T 405-2012',
  publishedBy: '专家组',
  publishedAt: '2026-01-01T00:00:00Z',
  content: {
    indicators: [...CBC_5PART_INDICATORS],
    phrases: [],
    requiredChecks: [],
    minimumImages: 0,
  },
}

describe('LaboratoryResultEditor real-time evaluation & navigation', () => {
  it('evaluates normal, high, and critical lifeline deviations in real time based on patient conditions', () => {
    const onChange = vi.fn()
    const rows = [
      {
        observationCode: 'WBC',
        observationName: '白细胞计数 (WBC)',
        valueType: 'NUMBER' as const,
        observationValue: '',
        unitCode: '10^9/L',
      },
      {
        observationCode: 'HGB',
        observationName: '血红蛋白测定 (HGB)',
        valueType: 'NUMBER' as const,
        observationValue: '',
        unitCode: 'g/L',
      },
    ]

    // 成年男性（gender '1' / 'MALE', 30岁）
    const { rerender } = render(
      <LaboratoryResultEditor
        rows={rows}
        onChange={onChange}
        disabled={false}
        template={mockTemplate}
        patient={{ gender: 'MALE', ageDays: 10950 }}
      />
    )

    // 输入正常 WBC 值 6.5
    const wbcInput = screen.getByLabelText('指标1结果')
    fireEvent.change(wbcInput, { target: { value: '6.5' } })

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          observationCode: 'WBC',
          observationValue: '6.5',
          interpretationCode: 'N',
          referenceRangeLow: 3.5,
          referenceRangeHigh: 9.5,
        }),
      ])
    )

    // 模拟重绘为危急高值 WBC 28.0 (触发 HH 危急生命线)
    rerender(
      <LaboratoryResultEditor
        rows={[
          {
            observationCode: 'WBC',
            observationName: '白细胞计数 (WBC)',
            valueType: 'NUMBER' as const,
            observationValue: '28.0',
            unitCode: '10^9/L',
            interpretationCode: 'HH',
            referenceRangeLow: 3.5,
            referenceRangeHigh: 9.5,
          },
        ]}
        onChange={onChange}
        disabled={false}
        template={mockTemplate}
        patient={{ gender: 'MALE', ageDays: 10950 }}
      />
    )

    expect(screen.getByText(/危急值预警/)).toBeInTheDocument()
    expect(screen.getByText('极高危急 ↑↑')).toBeInTheDocument()
    expect(screen.getByText('3.5 ～ 9.5')).toBeInTheDocument()
  })

  it('jumps to next indicator input upon pressing Enter key', () => {
    const onChange = vi.fn()
    const rows = [
      { observationCode: 'WBC', observationName: '白细胞', valueType: 'NUMBER' as const, observationValue: '5.0' },
      { observationCode: 'RBC', observationName: '红细胞', valueType: 'NUMBER' as const, observationValue: '' },
    ]

    render(
      <LaboratoryResultEditor
        rows={rows}
        onChange={onChange}
        disabled={false}
        template={mockTemplate}
        patient={{ gender: 'MALE', ageDays: 10000 }}
      />
    )

    const firstInput = screen.getByLabelText('指标1结果') as HTMLInputElement
    const secondInput = screen.getByLabelText('指标2结果') as HTMLInputElement

    firstInput.focus()
    expect(document.activeElement).toBe(firstInput)

    fireEvent.keyDown(firstInput, { key: 'Enter', code: 'Enter' })
    expect(document.activeElement).toBe(secondInput)
  })

  it('allows applying national standard templates when no template exists', () => {
    const onChange = vi.fn()
    const onApply = vi.fn()

    render(
      <LaboratoryResultEditor
        rows={[]}
        onChange={onChange}
        disabled={false}
        onApplyTemplate={onApply}
      />
    )

    expect(screen.getByText('套用国家标准模板 (WS/T 404/405)')).toBeInTheDocument()
  })

  it('triggers critical value warning only on blur, avoiding premature alert during continuous typing', () => {
    let currentRows = [
      {
        observationCode: 'RBC',
        observationName: '红细胞计数 (RBC)',
        valueType: 'NUMBER' as const,
        observationValue: '',
        unitCode: '10^12/L',
      },
    ]
    const onChange = vi.fn((newRows) => {
      currentRows = newRows
    })

    const { rerender } = render(
      <LaboratoryResultEditor
        rows={currentRows}
        onChange={onChange}
        disabled={false}
        template={mockTemplate}
        patient={{ gender: 'MALE', ageDays: 10950 }}
      />
    )

    const rbcInput = screen.getByLabelText('指标1结果')
    fireEvent.focus(rbcInput)

    // 用户在输入框中敲入 "1"，正在输入过程中（未失焦）
    fireEvent.change(rbcInput, { target: { value: '1' } })

    // onChange 触发，但 interpretationCode 此时被暂缓为偏低 'L'，而非危急值 'LL'
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          observationCode: 'RBC',
          observationValue: '1',
          interpretationCode: 'L',
        }),
      ])
    )

    // 重新渲染当前正在聚焦打字的状态
    rerender(
      <LaboratoryResultEditor
        rows={currentRows}
        onChange={onChange}
        disabled={false}
        template={mockTemplate}
        patient={{ gender: 'MALE', ageDays: 10950 }}
      />
    )

    // 录入过程中不应弹出危急值预警横幅
    expect(screen.queryByText(/危急值预警/)).not.toBeInTheDocument()
    expect(screen.queryByText('极低危急 ↓↓')).not.toBeInTheDocument()

    // 用户确认该指标为 1.0 并离开输入框（失去焦点）
    fireEvent.blur(rbcInput, { target: { value: '1.0' } })

    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          observationCode: 'RBC',
          observationValue: '1.0',
          interpretationCode: 'LL',
        }),
      ])
    )

    // 失焦后渲染最新结果
    rerender(
      <LaboratoryResultEditor
        rows={currentRows}
        onChange={onChange}
        disabled={false}
        template={mockTemplate}
        patient={{ gender: 'MALE', ageDays: 10950 }}
      />
    )

    // 失焦后危急值正式触发
    expect(screen.getByText(/危急值预警 1 项/)).toBeInTheDocument()
    expect(screen.getByText('极低危急 ↓↓')).toBeInTheDocument()
  })
})
