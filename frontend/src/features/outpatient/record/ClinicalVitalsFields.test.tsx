import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { ClinicalVitalsFields } from './ClinicalVitalsFields'
import type { RecordForm } from './clinicalRecordDraft'

function setup() {
  const api = {
    clinicalDocuments: { byEncounter: vi.fn(async () => []) },
    clinicalSafety: { vitalSignRules: vi.fn(async () => ({ rules: [] })) },
  }
  function Harness() {
    const form = useForm<RecordForm>({ defaultValues: {
      chiefComplaint: '医生主诉', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '',
      temperature: 37, heightCm: 170, weightKg: 65,
    } })
    return <>
      <input aria-label="主诉" {...form.register('chiefComplaint')} />
      <ClinicalVitalsFields api={api}
        encounterId="enc-1" form={form} recordValues={form.watch()} bloodPressureRequired signed={false}
        triageVitals={{ systolic: 120, diastolic: 80, temperature: 38.2, spo2: 98 }} />
    </>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  return { ...view, api }
}

describe('clinical vitals reference boundary', () => {
  it('applies available measurements without erasing unrelated or missing fields', () => {
    const h = setup()
    fireEvent.change(screen.getByRole('spinbutton', { name: '体重' }), { target: { value: '66' } })
    fireEvent.click(screen.getByRole('button', { name: '引用分诊数据' }))
    expect(screen.getByRole('spinbutton', { name: '收缩压' })).toHaveValue(120)
    expect(screen.getByRole('spinbutton', { name: '舒张压' })).toHaveValue(80)
    expect(screen.getByRole('spinbutton', { name: '体温' })).toHaveValue(38.2)
    expect(screen.getByRole('spinbutton', { name: '血氧' })).toHaveValue(98)
    expect(screen.getByRole('spinbutton', { name: '身高' })).toHaveValue(170)
    expect(screen.getByRole('spinbutton', { name: '体重' })).toHaveValue(66)
    expect(screen.getByRole('textbox', { name: '主诉' })).toHaveValue('医生主诉')
    expect(h.api.clinicalDocuments.byEncounter).not.toHaveBeenCalled()
  })
})
