import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationDialog, ServiceDialog } from './BasicDataManagement'

const attr = { definitionId: 'attr-1', name: '实际配置属性', dataType: 'TEXT', cardinality: 'SINGLE',
  schema: {}, storageMode: 'EXTENSION', variability: 'SCOPE_OVERRIDE', required: false }
const maintenance = { schema: { attributes: [attr] }, baseValues: [{ id: 'base-1', definitionId: 'attr-1',
  value: '真实基线', revision: 1, validFrom: '2026-01-01' }], overrides: [] }

function setup(query: ReturnType<typeof vi.fn>, kind: 'MEDICATION' | 'CATALOG_ITEM' = 'MEDICATION', storage = [{ code: 'ROOM_TEMPERATURE', name: '常温' }]) {
  const onSave = vi.fn().mockResolvedValue({})
  const onClose = vi.fn()
  const saveAttribute = vi.fn().mockImplementation(async (input) => ({ ...maintenance,
    ...(input.scopeType ? { overrides: [{ ...input, status: 'ACTIVE', id: input.overrideId ?? 'override-saved', revision: (input.expectedRevision ?? 0) + 1 }] }
      : { baseValues: [{ ...input, status: 'ACTIVE', id: input.valueId ?? 'base-saved', revision: (input.expectedRevision ?? 0) + 1 }] }) }))
  const api = { masterData: { itemAttributeMaintenance: query, saveItemAttributeValue: saveAttribute,
    saveItemAttributeOverride: saveAttribute }, dictionaries: { get: vi.fn().mockResolvedValue({ items: [] }) } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const shared = { api, organization: { id: 'org-main', name: '总院' } as never, onClose, onSave,
    dictionaries: { BD_MEDICATION_TYPE: [{ code: 'WESTERN', name: '西药' }], BD_DOSE_FORM: [{ code: 'TABLET', name: '片剂' }],
      BD_STORAGE_TYPE: storage, BD_SERVICE_TYPE: [{ code: 'EXAMINATION', name: '检查' }], BD_SERVICE_USE: [{ code: 'COMMON', name: '通用' }] } as never }
  render(<QueryClientProvider client={client}>{kind === 'MEDICATION'
    ? <MedicationDialog {...shared} frequencies={[]} routes={[]} value={{ id: 'med-1', code: 'TEST', name: '测试药品', sdMedicationType: 'WESTERN', sdDoseForm: 'TABLET', sdStatus: 'ACTIVE' } as never} />
    : <ServiceDialog {...shared} value={{ id: 'service-1', code: 'TEST', name: '测试项目', sdServiceType: 'EXAMINATION', sdUsageType: 'COMMON', sdStatus: 'ACTIVE', validFrom: '2026-01-01' } as never} />
  }</QueryClientProvider>)
  const submit = () => fireEvent.submit(screen.getByRole('button', { name: '保存' }).closest('form')!)
  return { onSave, onClose, saveAttribute, submit, client }
}

describe('master data attribute loading and values', () => {
  it.each(['MEDICATION', 'CATALOG_ITEM'] as const)('keeps %s open until attributes are confirmed and reuses the request code on retry', async (kind) => {
    const { submit, onSave, onClose, saveAttribute } = setup(vi.fn().mockResolvedValue(maintenance), kind)
    const input = await screen.findByDisplayValue('真实基线')
    fireEvent.change(input, { target: { value: '机构新值' } })
    saveAttribute.mockRejectedValueOnce(new Error('网络中断'))
    submit()
    expect(await screen.findByText(/保存未确认.*网络中断/)).toBeInTheDocument()
    expect(input).toHaveValue('机构新值')
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    submit()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(saveAttribute.mock.calls[0][0].requestCode).toBe(saveAttribute.mock.calls[1][0].requestCode)
    expect(saveAttribute.mock.invocationCallOrder[1]).toBeLessThan(onSave.mock.invocationCallOrder[0])
  })

  it('retains confirmed attribute revisions through partial failure and master-save failure', async () => {
    const first = { ...attr, variability: 'BASE_ONLY' }
    const second = { ...attr, definitionId: 'attr-2', name: '第二属性' }
    const data = { ...maintenance, schema: { attributes: [first, second] } }
    const { submit, onSave, saveAttribute } = setup(vi.fn().mockResolvedValue(data))
    fireEvent.change(await screen.findByDisplayValue('真实基线'), { target: { value: '新基线' } })
    fireEvent.change(screen.getByLabelText('第二属性'), { target: { value: '新覆盖' } })
    const successful = saveAttribute.getMockImplementation()!
    saveAttribute.mockImplementationOnce(successful).mockRejectedValueOnce(new Error('第二项失败'))
    submit()
    expect(await screen.findByText(/保存未确认.*第二项失败/)).toBeInTheDocument()
    expect(screen.getByText(/实际配置属性.*已保存，主档尚待保存/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    expect(saveAttribute).toHaveBeenCalledTimes(2)
    // A further edit must use the revision returned by the first successful write.
    fireEvent.change(screen.getByDisplayValue('新基线'), { target: { value: '再次修改基线' } })
    onSave.mockRejectedValueOnce(new Error('主档版本冲突'))
    submit()
    expect(await screen.findByText('主档版本冲突')).toBeInTheDocument()
    expect(saveAttribute.mock.calls[2][0]).toMatchObject({ valueId: 'base-1', expectedRevision: 2, value: '再次修改基线' })
    expect(saveAttribute.mock.calls[3][0].requestCode).toBe(saveAttribute.mock.calls[1][0].requestCode)
    submit()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(saveAttribute).toHaveBeenCalledTimes(4)
  })

  it.each([{}, { ...maintenance, overrides: [] }])('does not report an unconfirmed save response as success: %j', async (response) => {
    const { submit, onSave, saveAttribute } = setup(vi.fn().mockResolvedValue(maintenance))
    fireEvent.change(await screen.findByDisplayValue('真实基线'), { target: { value: '新值' } })
    saveAttribute.mockResolvedValueOnce(response)
    submit()
    expect(await screen.findByText(/保存未确认/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('新值')).toBeInTheDocument()
  })

  it('blocks editing and closing while an attribute save is pending', async () => {
    const { submit, onClose, saveAttribute } = setup(vi.fn().mockResolvedValue(maintenance))
    const input = await screen.findByDisplayValue('真实基线')
    fireEvent.change(input, { target: { value: '新值' } })
    let reject!: (error: Error) => void
    saveAttribute.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    submit()
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => reject(new Error('保存失败')))
    expect(input).toBeEnabled()
  })

  it('offers only configured storage types instead of adding invented dictionary entries', async () => {
    setup(vi.fn().mockResolvedValue(maintenance))
    await screen.findByDisplayValue('真实基线')
    await userEvent.click(screen.getByLabelText('储藏方式'))
    expect(screen.getByRole('option', { name: '常温' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '冷藏' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '冷链' })).not.toBeInTheDocument()
  })

  it('keeps an empty storage dictionary empty', async () => {
    setup(vi.fn().mockResolvedValue(maintenance), 'MEDICATION', [])
    await screen.findByDisplayValue('真实基线')
    await userEvent.click(screen.getByLabelText('储藏方式'))
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('does not report failed attribute loading as no configured attributes or save the master record', async () => {
    const user = userEvent.setup()
    const query = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(maintenance)
    const { onSave, submit } = setup(query)
    expect(await screen.findByText('扩展属性加载失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByText('当前项目类型未装配自定义扩展属性。')).not.toBeInTheDocument()
    submit()
    expect(await screen.findByText('扩展属性尚未加载成功，请重试后保存')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '重试扩展属性' }))
    expect(await screen.findByDisplayValue('真实基线')).toBeInTheDocument()
  })

  it('preserves an explicit null override instead of replacing it with a base or default value', async () => {
    setup(vi.fn().mockResolvedValue({ ...maintenance, overrides: [{ definitionId: 'attr-1', organizationId: 'org-main', scopeType: 'ORGANIZATION', valueMode: 'EXPLICIT_NULL', value: null }] }))
    expect(await screen.findByPlaceholderText('机构已明确清空')).toHaveValue('')
    expect(screen.queryByDisplayValue('真实基线')).not.toBeInTheDocument()
  })

  it('does not use a department override as the organization value or update that override', async () => {
    const { submit, saveAttribute } = setup(vi.fn().mockResolvedValue({ ...maintenance, overrides: [{ id: 'department-override',
      definitionId: 'attr-1', organizationId: 'org-main', departmentId: 'dept-1', scopeType: 'DEPARTMENT', valueMode: 'OVERRIDE', value: '科室专用值' }] }))
    const input = await screen.findByDisplayValue('真实基线')
    expect(screen.queryByDisplayValue('科室专用值')).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: '机构新值' } })
    submit()
    await waitFor(() => expect(saveAttribute).toHaveBeenCalledWith(expect.objectContaining({
      scopeType: 'ORGANIZATION', overrideId: undefined, value: '机构新值',
    })))
  })

  it('validates changed attributes before sending any master-record update', async () => {
    const { submit, onSave, saveAttribute } = setup(vi.fn().mockResolvedValue({ ...maintenance,
      schema: { attributes: [{ ...attr, dataType: 'INTEGER' }] }, baseValues: [{ ...maintenance.baseValues[0], value: 1 }] }))
    const input = await screen.findByRole('spinbutton', { name: '实际配置属性' })
    fireEvent.change(input, { target: { value: '1.5' } })
    submit()
    await waitFor(() => expect(screen.getAllByText(/属性值必须符合 INTEGER 类型/).length).toBeGreaterThan(0))
    expect(onSave).not.toHaveBeenCalled()
    expect(saveAttribute).not.toHaveBeenCalled()
  })

  it('shows an incomplete response as a failure', async () => {
    setup(vi.fn().mockResolvedValue({ schema: { attributes: [] } }))
    expect(await screen.findByText('扩展属性加载失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByText('当前项目类型未装配自定义扩展属性。')).not.toBeInTheDocument()
  })
})
