import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { DiagnosisPanel } from './DiagnosisPanel'

const initial: DiagnosisInput[] = [
  { conceptId: 'd1', code: 'I10', display: '高血压', type: 'PRIMARY' },
  { conceptId: 'd2', code: 'E11', display: '糖尿病', type: 'SECONDARY' },
]
function Harness({ editing = true, signed = false }) {
  const [diagnoses, setDiagnoses] = useState(initial)
  return <DiagnosisPanel encounterId="enc-1" api={{} as RhnApi} diagnoses={diagnoses}
    setDiagnoses={setDiagnoses} editing={editing} signed={signed} />
}

describe('diagnosis panel', () => {
  it('promotes, reorders and removes the primary diagnosis while preserving one primary', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '设为主要' }))
    const rows = () => screen.getAllByRole('row').filter((row) => row.classList.contains('doctor-diagnosis-row'))
    expect(rows()[0]).toHaveTextContent('糖尿病')
    expect(rows()[0]).toHaveTextContent('主要诊断')
    fireEvent.click(screen.getByRole('button', { name: '上移诊断 高血压' }))
    expect(rows()[0]).toHaveTextContent('高血压')
    fireEvent.click(within(rows()[0]).getByRole('button', { name: '移除' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除' }))
    expect(rows()[0]).toHaveTextContent('糖尿病')
    expect(rows()[0]).toHaveTextContent('主要诊断')
    expect(screen.getAllByText('主要诊断')).toHaveLength(1)
  })

  it.each([{ editing: false, signed: false }, { editing: true, signed: true }])(
    'hides mutation controls for read-only state %j', (props) => {
      render(<Harness {...props} />)
      expect(screen.getByText('高血压')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '新增诊断' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '设为主要' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /上移诊断/ })).not.toBeInTheDocument()
    },
  )
})
