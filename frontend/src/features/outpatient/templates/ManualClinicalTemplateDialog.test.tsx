import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import { ManualClinicalTemplateDialog } from './ManualClinicalTemplateDialog'

function mockApi() {
  return {
    outpatientNoteTemplates: {
      create: vi.fn().mockImplementation((input) => Promise.resolve({
        id: 'note-1', revision: 0, specialtyCode: 'GENERAL_PRACTICE', documentType: 'OUTPATIENT_NOTE',
        contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1', status: 'ACTIVE', sortOrder: 0, useCount: 0,
        createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z', ...input,
      })),
      update: vi.fn(),
    },
    outpatientPlanTemplates: { create: vi.fn(), update: vi.fn() },
    masterData: { diseases: vi.fn(), medications: vi.fn(), services: vi.fn() },
  } as unknown as RhnApi
}

describe('ManualClinicalTemplateDialog', () => {
  it('creates a note template without invoking AI', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const onSaved = vi.fn()
    render(<ManualClinicalTemplateDialog api={api} kind="NOTE" onClose={vi.fn()} onSaved={onSaved} />)

    await user.type(screen.getByPlaceholderText('输入便于识别的模板名称'), '高血压复诊病历')
    await user.type(screen.getByPlaceholderText('输入可复用的主诉内容'), '血压升高复诊')
    await user.type(screen.getByPlaceholderText('输入可复用的现病史内容'), '近期家庭血压：')
    await user.click(screen.getByRole('button', { name: '保存模板' }))

    await waitFor(() => expect(api.outpatientNoteTemplates.create).toHaveBeenCalledWith(expect.objectContaining({
      scopeType: 'PERSONAL',
      name: '高血压复诊病历',
      specialtyCode: 'GENERAL_PRACTICE',
      content: expect.objectContaining({ chiefComplaint: '血压升高复诊', presentIllness: '近期家庭血压：' }),
    })))
    expect(api.outpatientPlanTemplates.create).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()
  })

  it('provides standard directory selectors for a manually maintained plan', () => {
    render(<ManualClinicalTemplateDialog api={mockApi()} organizationId="org-1" kind="PLAN"
      onClose={vi.fn()} onSaved={vi.fn()} />)

    expect(screen.getByLabelText('添加标准诊断')).toBeInTheDocument()
    expect(screen.getByLabelText('添加机构药品')).toBeInTheDocument()
    expect(screen.getByLabelText('添加诊疗项目')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存模板' })).toBeDisabled()
  })
})
