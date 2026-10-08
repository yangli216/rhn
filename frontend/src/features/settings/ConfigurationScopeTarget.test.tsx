import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { ConfigurationScopeTarget, useConfigurationScopeTarget } from './ConfigurationScopeTarget'

const organization = { id: 'org-a', name: '机构甲', code: 'A' }
const department = { id: 'dept-a', name: '科室甲', code: 'DA', organizationId: 'org-a' }
function setup(list = vi.fn().mockResolvedValue([organization]), departments = vi.fn().mockResolvedValue([department]),
  initialOrganization = 'org-a', initialDepartment = 'dept-a') {
  const api = { organization: { list, departments } } as unknown as RhnApi
  const changed = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Harness({ tenantId }: { tenantId: string }) {
    const [organizationId, setOrganizationId] = useState(initialOrganization)
    const [departmentId, setDepartmentId] = useState(initialDepartment)
    const verification = useConfigurationScopeTarget({ api, scopeType: 'DEPARTMENT', tenantId, organizationId, departmentId })
    return <><ConfigurationScopeTarget verification={verification} scopeType="DEPARTMENT" tenantId={tenantId}
      organizationId={organizationId} departmentId={departmentId}
      onOrganizationChange={(value) => { changed('organization', value); setOrganizationId(value) }}
      onDepartmentChange={(value) => { changed('department', value); setDepartmentId(value) }} />
      <output data-testid="target">{organizationId}/{departmentId}</output>
      <button disabled={!verification.ready}>提交配置</button></>
  }
  const view = render(<QueryClientProvider client={client}><Harness tenantId="tenant-a" /></QueryClientProvider>)
  return { user: userEvent.setup(), changed, client, departments,
    changeTenant: () => view.rerender(<QueryClientProvider client={client}><Harness tenantId="tenant-b" /></QueryClientProvider>) }
}

describe('configuration target facts', () => {
  it('keeps missing targets until the user explicitly selects an organization and department', async () => {
    const { user, changed, departments } = setup(undefined, undefined, 'missing-org', 'missing-dept')
    expect(await screen.findByText('原机构不在可用列表，请明确重新选择')).toBeInTheDocument()
    expect(screen.getByTestId('target')).toHaveTextContent('missing-org/missing-dept')
    expect(changed).not.toHaveBeenCalled()
    expect(departments).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '提交配置' })).toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: '所属机构' }))
    await user.click(screen.getByRole('option', { name: /机构甲/ }))
    expect(await screen.findByText('请选择科室', { selector: '.ui-field__error' })).toBeInTheDocument()
    expect(screen.getByTestId('target')).toHaveTextContent('org-a/')
    expect(changed).not.toHaveBeenCalledWith('department', 'dept-a')
    await user.click(screen.getByRole('combobox', { name: '目标科室' }))
    await user.click(screen.getByRole('option', { name: /科室甲/ }))
    expect(screen.getByRole('button', { name: '提交配置' })).toBeEnabled()
  })

  it.each([null, {}, [{ id: 'org-a' }]])('rejects malformed organization response %j and recovers with retry', async (response) => {
    const list = vi.fn().mockResolvedValueOnce(response).mockResolvedValue([organization])
    const { user, changed } = setup(list)
    expect(await screen.findByText('机构列表加载失败，请重试')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交配置' })).toBeDisabled()
    expect(changed).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '重新核实配置对象' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '提交配置' })).toBeEnabled())
    expect(changed).not.toHaveBeenCalled()
  })

  it('rejects a department returned under another organization', async () => {
    const { changed } = setup(undefined, vi.fn().mockResolvedValue([{ ...department, organizationId: 'org-b' }]))
    expect(await screen.findByText('科室列表加载失败，请重试')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交配置' })).toBeDisabled()
    expect(changed).not.toHaveBeenCalled()
  })

  it('does not replace a missing department with the first returned department', async () => {
    const { changed } = setup(undefined, undefined, 'org-a', 'missing-dept')
    expect(await screen.findByText('原科室不在所选机构中，请明确重新选择')).toBeInTheDocument()
    expect(screen.getByTestId('target')).toHaveTextContent('org-a/missing-dept')
    expect(screen.getByRole('button', { name: '提交配置' })).toBeDisabled()
    expect(changed).not.toHaveBeenCalled()
  })

  it('keeps cached targets blocked while organization refresh is pending and after it fails', async () => {
    let reject!: (reason: Error) => void
    const list = vi.fn().mockResolvedValueOnce([organization]).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    const { client, changed } = setup(list)
    await waitFor(() => expect(screen.getByRole('button', { name: '提交配置' })).toBeEnabled())
    act(() => { void client.invalidateQueries({ queryKey: ['configuration-scope-organizations'] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: '提交配置' })).toBeDisabled())
    await act(async () => { reject(new Error('连接失败')) })
    expect(await screen.findByText('机构列表加载失败，请重试')).toBeInTheDocument()
    expect(screen.getByTestId('target')).toHaveTextContent('org-a/dept-a')
    expect(changed).not.toHaveBeenCalled()
  })

  it('does not reuse another tenant’s cached organization list', async () => {
    const list = vi.fn().mockResolvedValueOnce([organization]).mockResolvedValue([{ ...organization, id: 'org-b' }])
    const { changeTenant, changed } = setup(list)
    await waitFor(() => expect(screen.getByRole('button', { name: '提交配置' })).toBeEnabled())
    changeTenant()
    expect(await screen.findByText('原机构不在可用列表，请明确重新选择')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '提交配置' })).toBeDisabled()
    expect(changed).not.toHaveBeenCalled()
  })
})
