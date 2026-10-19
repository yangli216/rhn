import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InsuranceProbeCapability, InsuranceProbeStepResult } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InsuranceProbePanel } from './InsuranceProbePanel'

const available: InsuranceProbeCapability = { available: true, mode: 'GATEWAY', modeText: '正式网关', signInRequired: true,
  settlementAllowed: false, settlementReason: '结算探测（2207/2208）未开放' }

function result(step: string, status: string, extra: Partial<InsuranceProbeStepResult> = {}): InsuranceProbeStepResult {
  return { step, stepText: step, status, statusText: status === 'PASS' ? '通过' : '失败', summary: `${step} 摘要`,
    startedAt: '2026-10-18T02:00:00Z', durationMs: 12, facts: [], exchanges: [], ...extra }
}

function setup(capability: InsuranceProbeCapability = available, run = vi.fn((step: string) => Promise.resolve(result(step, 'PASS')))) {
  const insuranceProbeCapability = vi.fn(() => Promise.resolve(capability))
  const api = { billing: { insuranceProbeCapability, runInsuranceProbe: run } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <InsuranceProbePanel api={api} /></QueryClientProvider>)
  return { run }
}

const stepCard = (name: RegExp) => within(screen.getByRole('region', { name }))

describe('InsuranceProbePanel', () => {
  it('explains why probing is unavailable and disables every step', async () => {
    setup({ ...available, available: false, mode: 'MOCK', modeText: '模拟客户端（进程内）', reason: '当前使用进程内模拟客户端，无法探测网关' })
    expect(await screen.findByText('当前使用进程内模拟客户端，无法探测网关')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '依次执行 A～C' })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: '执行' })) expect(button).toBeDisabled()
  })

  it('runs the sign-in step and shows failure hints with redacted messages on demand', async () => {
    const failed = result('SIGN_IN', 'FAIL', {
      hint: '签到被拒绝：多半是默认经办人、签到 mac／ip 与平台登记资料不一致',
      exchanges: [{ infno: '9001', infnoText: '签到', startedAt: '2026-10-18T02:00:00Z', durationMs: 31, httpStatus: 200, infcode: '-1',
        errMsg: '签到经办人不一致', outcome: 'REJECTED', outcomeText: '平台拒绝', request: '{"sign_no":"****"}', response: '{"infcode":-1}' }],
    })
    const { run } = setup(available, vi.fn(() => Promise.resolve(failed)))
    await userEvent.click(await within(await screen.findByRole('region', { name: /A 网关连通与签到/ })).findByRole('button', { name: '执行' }))
    expect(run).toHaveBeenCalledWith('SIGN_IN', {})
    expect(await screen.findByText(/签到被拒绝/)).toBeInTheDocument()
    const table = screen.getByRole('table', { name: /报文往返/ })
    expect(within(table).getByText('签到经办人不一致')).toBeInTheDocument()
    await userEvent.click(within(table).getByRole('button', { name: '查看报文' }))
    expect(screen.getByText('{"sign_no":"****"}')).toBeInTheDocument()
    expect(stepCard(/A 网关/).getByRole('button', { name: '重试' })).toBeEnabled()
  })

  it('validates inputs locally before calling the server and never stores credentials in the result', async () => {
    const { run } = setup()
    const person = await screen.findByRole('region', { name: /B 人员鉴权/ })
    await userEvent.click(within(person).getByRole('button', { name: '执行' }))
    expect(await screen.findByText('请填写证件号码或电子凭证 token')).toBeInTheDocument()
    expect(run).not.toHaveBeenCalled()
    await userEvent.type(within(person).getByLabelText(/证件号码／电子凭证 token/), 'TEST-310')
    await userEvent.click(within(person).getByRole('button', { name: '执行' }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('PERSON', { person: { certType: '01', certNo: 'TEST-310', personName: undefined } }))

    const pre = screen.getByRole('region', { name: /C 预结算全链路/ })
    await userEvent.click(within(pre).getByRole('button', { name: '执行' }))
    expect(await screen.findByText('请填写科室编码、主诊断编码与名称')).toBeInTheDocument()
  })

  it('submits a pre-settlement with typed numbers and chains settlement behind the explicit confirmation', async () => {
    const run = vi.fn((step: string) => Promise.resolve(step === 'PRE_SETTLE'
      ? result(step, 'PASS', { facts: [{ label: '探测单号', value: 'PROBE1' }] }) : result(step, 'PASS')))
    setup({ ...available, settlementAllowed: true, settlementReason: undefined }, run)
    const pre = await screen.findByRole('region', { name: /C 预结算全链路/ })
    const fill = async (label: string | RegExp, value: string) => userEvent.type(within(pre).getByLabelText(label), value)
    await fill(/科室编码/, 'D01'); await fill(/主诊断编码/, 'J00'); await fill(/主诊断名称/, '上呼吸道感染')
    await fill('项目编码 1', 'L1'); await fill('医保目录编码 1', 'XA01'); await fill('项目名称 1', '阿莫西林')
    await userEvent.clear(within(pre).getByLabelText('数量 1')); await fill('数量 1', '2'); await fill('单价 1', '50')
    await userEvent.click(within(pre).getByRole('button', { name: '执行' }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('PRE_SETTLE', { preSettle: {
      departmentCode: 'D01', practitionerCode: undefined, diagnosisCode: 'J00', diagnosisName: '上呼吸道感染',
      lines: [{ itemCode: 'L1', insuranceItemCode: 'XA01', itemName: '阿莫西林', quantity: 2, unitPrice: 50 }] } }))

    const settle = screen.getByRole('region', { name: /D 结算与自动撤销/ })
    expect(within(settle).getByRole('button', { name: '执行' })).toBeDisabled()
    await userEvent.click(within(settle).getByRole('switch'))
    expect(within(settle).getByRole('button', { name: '执行' })).toBeDisabled()    // 还需输入探测单号
    await userEvent.type(within(settle).getByLabelText(/输入预结算探测单号 PROBE1/), 'PROBE1')
    await userEvent.click(within(settle).getByRole('button', { name: '执行' }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('SETTLE', { settle: { confirmed: true, confirmation: 'PROBE1' } }))
  })

  it('keeps settlement locked with the server reason when the deployment does not allow it', async () => {
    setup()
    const settle = await screen.findByRole('region', { name: /D 结算与自动撤销/ })
    expect(within(settle).getByText('结算探测（2207/2208）未开放')).toBeInTheDocument()
    expect(within(settle).getByRole('button', { name: '执行' })).toBeDisabled()
  })

  it('exports only after there is a result', async () => {
    const createObjectURL = vi.fn(() => 'blob:x'); const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    setup()
    const exportButton = await screen.findByRole('button', { name: '导出探测结果' })
    expect(exportButton).toBeDisabled()
    await userEvent.click(within(screen.getByRole('region', { name: /A 网关连通与签到/ })).getByRole('button', { name: '执行' }))
    await waitFor(() => expect(exportButton).toBeEnabled())
    await userEvent.click(exportButton)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('reports server errors without losing earlier results', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(result('SIGN_IN', 'PASS'))
      .mockRejectedValueOnce(new Error('需要医保联通探测权限'))
    setup(available, run)
    const signIn = await screen.findByRole('region', { name: /A 网关连通与签到/ })
    await userEvent.click(within(signIn).getByRole('button', { name: '执行' }))
    expect(await within(signIn).findByText('SIGN_IN 摘要')).toBeInTheDocument()
    await userEvent.click(within(signIn).getByRole('button', { name: '重试' }))
    expect(await screen.findByText('需要医保联通探测权限')).toBeInTheDocument()
    expect(within(signIn).getByText('SIGN_IN 摘要')).toBeInTheDocument()
  })
})
