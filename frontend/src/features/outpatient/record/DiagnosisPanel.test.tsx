import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { DiagnosisPanel } from './DiagnosisPanel'

const initial: DiagnosisInput[] = [
  { conceptId: 'd1', code: 'I10', display: '高血压', type: 'PRIMARY' },
  { conceptId: 'd2', code: 'E11', display: '糖尿病', type: 'SECONDARY' },
]
function Harness({ editing = true, signed = false, values = initial, api = {} as RhnApi }) {
  const [diagnoses, setDiagnoses] = useState(values)
  return <DiagnosisPanel encounterId="enc-1" api={api} diagnoses={diagnoses}
    setDiagnoses={setDiagnoses} editing={editing} signed={signed} />
}

describe('diagnosis panel', () => {
  it.each(['different-system', 'different-version', 'same-concept'] as const)('uses catalog identity to distinguish same-code selections: %s', async variant => {
    const candidate = { id: variant === 'same-concept' ? 'original' : 'new-concept', code: 'SAME', display: '候选诊断',
      systemCode: variant === 'different-system' ? 'SYS_B' : 'SYS_A', systemName: '目录', sdDiagnosisDomain: 'WESTERN_MEDICINE',
      sdDiagnosisDomainText: '西医诊断', sdStatus: 'ACTIVE', managementPrograms: [] }
    const api = { masterData: { diseases: vi.fn().mockResolvedValue([candidate]) } } as unknown as RhnApi
    render(<Harness values={[{ conceptId: 'original', codeSystem: 'SYS_A', diagnosisDomain: 'WESTERN_MEDICINE',
      code: 'SAME', display: '已有诊断', type: 'PRIMARY' }]} api={api} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '新增诊断' }))
    await user.click(screen.getByRole('combobox', { name: '' }))
    await user.type(screen.getByPlaceholderText('输入诊断名称、编码或拼音码'), 'SAME')
    await user.click(await screen.findByRole('option', { name: /候选诊断/ }))
    const rows = screen.getAllByRole('row').filter(row => row.matches('.doctor-diagnosis-row:not(.is-launcher):not(.is-active-composer)'))
    expect(rows).toHaveLength(variant === 'same-concept' ? 1 : 2)
    if (variant === 'same-concept') expect(screen.getByText('该诊断已经录入')).toBeInTheDocument()
    else expect(rows[1]).toHaveTextContent('候选诊断')
  })
  it('reorders and removes only the selected free-code identity across systems', async () => {
    render(<Harness values={[
      { codeSystem: 'SYS_A', diagnosisDomain: 'WESTERN_MEDICINE', code: 'SAME', display: '体系甲', type: 'PRIMARY' },
      { codeSystem: 'SYS_B', diagnosisDomain: 'WESTERN_MEDICINE', code: 'SAME', display: '体系乙', type: 'SECONDARY' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: '设为主要' }))
    const rows = () => screen.getAllByRole('row').filter(row => row.matches('.doctor-diagnosis-row:not(.is-launcher):not(.is-active-composer)'))
    expect(rows()[0]).toHaveTextContent('体系乙')
    fireEvent.click(within(rows()[0]).getByRole('button', { name: '移除' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移除' }))
    expect(rows()).toHaveLength(1); expect(rows()[0]).toHaveTextContent('体系甲')
  })
  it.each([undefined, null, 'UNRECOGNIZED'])('shows missing or unsupported domain %s as unconfirmed', (domain) => {
    const diagnoses = [{ code: 'HISTORY', display: '历史诊断', type: 'PRIMARY', diagnosisDomain: domain }] as DiagnosisInput[]
    render(<DiagnosisPanel encounterId="enc-1" api={{} as RhnApi} diagnoses={diagnoses}
      setDiagnoses={() => {}} editing={false} signed={true} />)
    expect(screen.getByText('体系待确认')).toBeInTheDocument()
    expect(screen.queryByText('西医诊断')).not.toBeInTheDocument()
  })

  it.each([['WESTERN_MEDICINE', '西医诊断'], ['TCM_DISEASE', '中医病名'], ['TCM_SYNDROME', '中医证候']])(
    'preserves the explicitly recorded domain %s', (domain, label) => {
      const diagnoses = [{ code: 'KNOWN', display: '已知体系诊断', type: 'PRIMARY', diagnosisDomain: domain }] as DiagnosisInput[]
      render(<DiagnosisPanel encounterId="enc-1" api={{} as RhnApi} diagnoses={diagnoses}
        setDiagnoses={() => {}} editing={false} signed={true} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.queryByText('体系待确认')).not.toBeInTheDocument()
    },
  )

  it('shows unknown, confirmed-empty and confirmed management requirements distinctly', () => {
    const diagnoses: DiagnosisInput[] = [
      { code: 'UNKNOWN', display: '历史诊断待核对', type: 'PRIMARY', managementPrograms: [] },
      { code: 'NONE', display: '已核实无管理要求', type: 'SECONDARY', managementResolutionStatus: 'CONFIRMED', managementPrograms: [] },
      { code: 'I10', display: '已核实高血压', type: 'SECONDARY', managementResolutionStatus: 'CONFIRMED', managementPrograms: [
        { id: '101', code: 'CHRONIC', name: '高血压随访', managementType: 'CHRONIC_CARE', triggerAction: 'PROMPT_CONFIRMATION' },
      ] },
    ]
    render(<DiagnosisPanel encounterId="enc-1" api={{} as RhnApi} diagnoses={diagnoses}
      setDiagnoses={() => {}} editing={false} signed={true} />)
    const row = (name: string) => screen.getByText(name).closest('[role="row"]')!
    expect(row('历史诊断待核对')).toHaveTextContent('待核对')
    expect(row('历史诊断待核对')).not.toHaveTextContent('—')
    expect(row('已核实无管理要求')).toHaveTextContent('—')
    expect(row('已核实无管理要求')).not.toHaveTextContent('待核对')
    expect(row('已核实高血压')).toHaveTextContent('高血压随访')
    expect(screen.getByRole('alert')).toHaveTextContent('已核实高血压：高血压随访')
    expect(screen.getByRole('alert')).not.toHaveTextContent('历史诊断待核对')
  })
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
