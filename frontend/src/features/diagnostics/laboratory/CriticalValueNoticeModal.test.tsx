import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CriticalValueNoticeModal } from './CriticalValueNoticeModal'

describe('CriticalValueNoticeModal', () => {
  const criticalItems = [
    {
      itemName: '血葡萄糖(GLU)',
      value: '2.1',
      unit: 'mmol/L',
      flag: 'LL',
      criticalLevel: 'CRITICAL_LOW',
      referenceRange: '3.90 - 6.10',
    },
    {
      itemName: '白细胞计数(WBC)',
      value: '1.8',
      unit: '10^9/L',
      flag: 'LL',
      criticalLevel: 'CRITICAL_LOW',
      referenceRange: '3.50 - 9.50',
    },
  ]

  it('renders critical items and prevents submitting without recipient name', () => {
    const onConfirm = vi.fn()
    render(
      <CriticalValueNoticeModal
        isOpen={true}
        onClose={vi.fn()}
        criticalItems={criticalItems}
        patientName="王五"
        healthRecordNo="HR-2026-0001"
        departmentName="急诊科"
        operatorName="技师小张"
        onConfirmNotice={onConfirm}
      />
    )

    expect(screen.getByText('危急值口头电话通报登记卡 (国家临床安全规范)')).toBeInTheDocument()
    expect(screen.getByText(/检测到 2 项生命危急值/)).toBeInTheDocument()
    expect(screen.getByText('血葡萄糖(GLU)')).toBeInTheDocument()
    expect(screen.getByText('白细胞计数(WBC)')).toBeInTheDocument()
    expect(screen.getAllByText('↓↓ 极低危急')).toHaveLength(2)

    const submitBtn = screen.getByRole('button', { name: '确认通报登记并继续签发' })
    expect(submitBtn).toBeDisabled()
  })

  it('submits closed-loop record when recipient name is filled', () => {
    const onConfirm = vi.fn()
    render(
      <CriticalValueNoticeModal
        isOpen={true}
        onClose={vi.fn()}
        criticalItems={criticalItems}
        patientName="王五"
        healthRecordNo="HR-2026-0001"
        departmentName="急诊科"
        operatorName="技师小张"
        onConfirmNotice={onConfirm}
      />
    )

    const nameInput = screen.getByPlaceholderText('必填，例如：张医生、李护士长')
    fireEvent.change(nameInput, { target: { value: '急诊张医生' } })

    const phoneInput = screen.getByPlaceholderText('例如：内线8021 或 手机号')
    fireEvent.change(phoneInput, { target: { value: '8021' } })

    const submitBtn = screen.getByRole('button', { name: '确认通报登记并继续签发' })
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const record = onConfirm.mock.calls[0][0]
    expect(record).toContain('【危急值通报闭环】')
    expect(record).toContain('接报人员: 急诊张医生 (电话: 8021)')
    expect(record).toContain('通报人: 技师小张')
    expect(record).toContain('血葡萄糖(GLU) 2.1 mmol/L [LL]')
  })
})
