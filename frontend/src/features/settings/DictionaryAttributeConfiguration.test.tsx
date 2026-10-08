import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DictionaryAttributeDefinition, DictionaryDetail, DictionaryItem, RhnApi } from '../../shared/rhnApi'
import { DictionaryAttributeConfiguration } from './DictionaryAttributeConfiguration'

const attribute: DictionaryAttributeDefinition = {
  id: 'attribute-1', revision: 1, dictionaryId: 'dictionary-1', code: 'CHANNEL', name: '渠道', description: '',
  dataType: 'TEXT', cardinality: 'SINGLE', schema: {}, minimumScope: 'DEPARTMENT', overridePolicy: 'ANY',
  requiredValue: false, searchable: false, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z', updatedBy: 'user-1', referenceOptions: [],
}
const item = { id: 'item-1', dictionaryId: 'dictionary-1', code: 'CASH', name: '现金', sortOrder: 1,
  sdDictItemStatus: 'ACTIVE', sdDictItemStatusText: '启用' } as DictionaryItem
const dictionary = { id: 'dictionary-1', name: '支付方式', revision: 1, items: [item] } as DictionaryDetail
const configuration = {
  dictionaryId: dictionary.id, dictionaryItemId: item.id, itemCode: item.code, itemName: item.name,
  editingScope: 'ORGANIZATION', editingScopeCode: 'TENANT:tenant-a/ORG:org-a', attributes: [{ definition: attribute, inherited: false,
    configured: { scopeType: 'ORGANIZATION', scopeCode: 'TENANT:tenant-a/ORG:org-a', valueMode: 'OVERRIDE', values: [{ id: 'value-1', valueOrder: 1, value: '原始值' }], sourceLabel: '机构甲' },
    resolved: { scopeType: 'ORGANIZATION', scopeCode: 'TENANT:tenant-a/ORG:org-a', valueMode: 'OVERRIDE', values: [{ id: 'value-1', valueOrder: 1, value: '原始值' }], sourceLabel: '机构甲' },
  }],
}
const organizations = [{ id: 'org-a', name: '机构甲', code: 'A' }]
function setup(options: { initialOrganization?: string; list?: ReturnType<typeof vi.fn>; detail?: ReturnType<typeof vi.fn>;
  configurationList?: ReturnType<typeof vi.fn>; noOverride?: boolean; definition?: DictionaryAttributeDefinition;
  attributes?: ReturnType<typeof vi.fn>; dictionaryList?: ReturnType<typeof vi.fn> } = {}) {
  const selectedAttribute = options.definition ?? (options.noOverride ? { ...attribute, overridePolicy: 'NO_OVERRIDE' } : attribute)
  const list = options.list ?? vi.fn().mockResolvedValue(organizations)
  const detail = options.detail ?? vi.fn().mockImplementation((_dictionary, _item, scope) => Promise.resolve({ ...configuration, editingScope: scope, editingScopeCode: scope === 'PLATFORM' ? 'PLATFORM' : 'TENANT:tenant-a/ORG:org-a' }))
  const configurations = options.configurationList ?? vi.fn().mockResolvedValue([configuration])
  const save = vi.fn().mockImplementation((_dictionary, _item, _attribute, input) => {
    const source = { ...configuration.attributes[0].configured, valueMode: input.valueMode,
      values: input.values.map((value: string, index: number) => ({ id: `saved-${index}`, valueOrder: index + 1,
        ...(selectedAttribute.dataType === 'DICT_REF' ? { referenceItemId: value } : { value }) })) }
    return Promise.resolve({ ...configuration, attributes: [{ definition: selectedAttribute, configured: source, resolved: source, inherited: false }] })
  })
  const inherit = vi.fn().mockResolvedValue({ ...configuration, attributes: [{ ...configuration.attributes[0], configured: undefined, inherited: true }] })
  const attributes = options.attributes ?? vi.fn().mockResolvedValue([selectedAttribute])
  const updateAttribute = vi.fn().mockImplementation((_dictionary, _attribute, input) => Promise.resolve({ ...selectedAttribute,
    ...input, code: selectedAttribute.code, revision: selectedAttribute.revision + 1 }))
  const changeAttributeStatus = vi.fn().mockImplementation((_dictionary, _attribute, enabled) => Promise.resolve({ ...selectedAttribute,
    status: enabled ? 'ACTIVE' : 'INACTIVE', revision: selectedAttribute.revision + 1 }))
  const onChanged = vi.fn()
  const api = {
    organization: { list, departments: vi.fn().mockResolvedValue([]) },
    dictionaries: { attributes, updateAttribute, changeAttributeStatus, list: options.dictionaryList ?? vi.fn().mockResolvedValue([]),
      itemAttributeConfigurations: configurations, itemAttributes: detail, setItemAttribute: save, inheritItemAttribute: inherit },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><DictionaryAttributeConfiguration api={api} dictionary={dictionary} items={[item]}
    context={{ tenantId: 'tenant-a', organization: { id: options.initialOrganization ?? 'org-a', name: '当前机构' },
      department: { id: 'dept-a', name: '当前科室', organizationId: 'org-a' } }} onChanged={onChanged} /></QueryClientProvider>)
  return { user: userEvent.setup(), configurations, detail, save, inherit, client, updateAttribute, attributes, changeAttributeStatus, onChanged }
}

describe('dictionary configuration target verification', () => {
  it.each([null, [{ ...configuration, editingScopeCode: 'TENANT:tenant-b/ORG:org-a' }]])(
    'does not display a missing or foreign-scope list %j as current facts', async (response) => {
      const configurationList = vi.fn().mockResolvedValueOnce(response).mockResolvedValue([configuration])
      const { user } = setup({ configurationList })
      const retry = await screen.findByRole('button', { name: '重新加载属性列表' })
      expect(screen.queryByRole('button', { name: '配置' })).not.toBeInTheDocument()
      expect(screen.queryByText('未找到匹配的字典项。')).not.toBeInTheDocument()
      await user.click(retry)
      expect(await screen.findByRole('button', { name: '配置' })).toBeEnabled()
    },
  )

  it('does not load another organization’s configuration until explicitly selected', async () => {
    const { user, configurations } = setup({ initialOrganization: 'missing-org' })
    expect(await screen.findByText('原机构不在可用列表，请明确重新选择')).toBeInTheDocument()
    expect(configurations).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '配置' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '目标机构' }))
    await user.click(screen.getByRole('option', { name: /机构甲/ }))
    expect(await screen.findByRole('button', { name: '配置' })).toBeEnabled()
    expect(configurations).toHaveBeenCalledWith(dictionary.id, 'ORGANIZATION', 'org-a', '')
  })

  it('blocks both save and inherit after target refresh failure while preserving input', async () => {
    const list = vi.fn().mockResolvedValue(organizations)
    const { user, client, save, inherit } = setup({ list })
    await user.click(await screen.findByRole('button', { name: '配置' }))
    const dialog = within(screen.getByRole('dialog'))
    const input = await dialog.findByRole('textbox', { name: '属性值' })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeEnabled())
    await user.clear(input)
    await user.type(input, '尚未保存的草稿')
    list.mockRejectedValue(new Error('目标查询失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['configuration-scope-organizations'] }) })
    expect(await dialog.findByText('机构列表加载失败，请重试')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: '恢复继承' })).toBeDisabled()
    expect(input).toHaveValue('尚未保存的草稿')
    expect(save).not.toHaveBeenCalled()
    expect(inherit).not.toHaveBeenCalled()
    list.mockResolvedValue(organizations)
    await user.click(dialog.getByRole('button', { name: '重新核实配置对象' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeEnabled())
    expect(input).toHaveValue('尚未保存的草稿')
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3]).toEqual(expect.objectContaining({ organizationId: 'org-a', values: ['尚未保存的草稿'] }))
  })

  it.each([null, { ...configuration, dictionaryItemId: 'another-item' }, { ...configuration, attributes: null }, { ...configuration, editingScopeCode: 'TENANT:tenant-a/ORG:org-b' }])(
    'blocks incomplete or mismatched configuration %j until reload succeeds', async (response) => {
      const detail = vi.fn().mockResolvedValueOnce(response).mockResolvedValue(configuration)
      const { user, save } = setup({ detail })
      await user.click(await screen.findByRole('button', { name: '配置' }))
      const dialog = within(screen.getByRole('dialog'))
      expect(await dialog.findByText('当前属性配置未确认，请重新加载后再保存。')).toBeInTheDocument()
      expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
      expect(save).not.toHaveBeenCalled()
      await user.click(dialog.getByRole('button', { name: '重新加载属性配置' }))
      await waitFor(() => expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeEnabled())
    },
  )

  it('requires an explicit level choice instead of silently broadening to the platform', async () => {
    const { user, detail } = setup({ noOverride: true })
    await user.click(await screen.findByRole('button', { name: '配置' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('原层级不允许配置此属性，请明确选择允许的层级')).toBeInTheDocument()
    expect(detail).not.toHaveBeenCalled()
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    await user.click(dialog.getByRole('combobox', { name: '配置层级' }))
    await user.click(screen.getByRole('option', { name: /全局/ }))
    await waitFor(() => expect(detail).toHaveBeenCalledWith(dictionary.id, item.id, 'PLATFORM', '', ''))
  })
})

describe('dictionary attribute definition truth', () => {
  it.each([null, {}, [{ ...attribute, schema: null }], [{ ...attribute, status: 'UNKNOWN' }], [{ ...attribute, requiredValue: null }]])(
    'rejects incomplete definitions %j without displaying an empty definition list', async (response) => {
      const attributes = vi.fn().mockResolvedValueOnce(response).mockResolvedValue([attribute])
      const { user, configurations } = setup({ attributes })
      expect(await screen.findByText('属性定义加载失败，不能判断是否已配置。')).toBeInTheDocument()
      expect(screen.queryByText(/当前字典尚未定义扩展属性/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '新增属性' })).toBeDisabled()
      expect(configurations).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: '重新加载属性定义' }))
      expect(await screen.findByRole('button', { name: '编辑' })).toBeEnabled()
    },
  )

  it('shows an empty state only after a successful empty response', async () => {
    setup({ attributes: vi.fn().mockResolvedValue([]) })
    expect(await screen.findByText(/当前字典尚未定义扩展属性/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增属性' })).toBeEnabled()
    expect(screen.queryByText('属性定义加载失败，不能判断是否已配置。')).not.toBeInTheDocument()
  })

  it('preserves stored schema metadata when changing only the name', async () => {
    const schema = { format: 'existing-format', extension: { labels: ['a,b', ' padded '] } }
    const { user, updateAttribute } = setup({ definition: { ...attribute, description: '配置说明', schema } })
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByRole('textbox', { name: '属性名称' }), '新版')
    await user.click(dialog.getByRole('button', { name: '保存属性' }))
    await waitFor(() => expect(updateAttribute).toHaveBeenCalled())
    expect(updateAttribute.mock.calls[0][2]).toEqual(expect.objectContaining({ name: '渠道新版', schema }))
  })

  it('blocks definition save after a refresh failure and preserves the draft through recovery', async () => {
    const definition = { ...attribute, description: '配置说明', schema: { version: 7 } }
    const attributes = vi.fn().mockResolvedValue([definition])
    const { user, client, updateAttribute } = setup({ attributes })
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = within(screen.getByRole('dialog'))
    const name = dialog.getByRole('textbox', { name: '属性名称' })
    await user.type(name, '未保存')
    attributes.mockRejectedValue(new Error('定义接口中断'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['dictionary-attributes'] }) })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存属性' })).toBeDisabled())
    expect(name).toHaveValue('渠道未保存')
    expect(updateAttribute).not.toHaveBeenCalled()
    attributes.mockResolvedValue([definition])
    await user.click(dialog.getByRole('button', { name: '重新核实属性定义' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存属性' })).toBeEnabled())
    await user.click(dialog.getByRole('button', { name: '保存属性' }))
    await waitFor(() => expect(updateAttribute).toHaveBeenCalled())
    expect(updateAttribute.mock.calls[0][2]).toEqual(expect.objectContaining({ name: '渠道未保存', schema: { version: 7 } }))
  })

  it('does not use a newer definition revision to submit an older editing draft', async () => {
    const definition = { ...attribute, description: '配置说明' }
    const attributes = vi.fn().mockResolvedValue([definition])
    const { user, client, updateAttribute } = setup({ attributes })
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = within(screen.getByRole('dialog'))
    attributes.mockResolvedValue([{ ...definition, revision: 2 }])
    await act(async () => { await client.invalidateQueries({ queryKey: ['dictionary-attributes'] }) })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存属性' })).toBeDisabled())
    expect(dialog.getByText(/若定义已变更，请关闭并重新打开编辑/)).toBeInTheDocument()
    expect(updateAttribute).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'empty list', replacement: [] },
    { name: 'another attribute', replacement: [{ ...attribute, id: 'attribute-2', name: '其他属性' }] },
  ])('preserves the draft when the selected definition is replaced by $name', async ({ replacement }) => {
    const attributes = vi.fn().mockResolvedValue([attribute])
    const { user, client, detail, save } = setup({ attributes })
    await user.click(await screen.findByRole('button', { name: '配置' }))
    const dialog = within(screen.getByRole('dialog'))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeEnabled())
    const input = dialog.getByRole('textbox', { name: '属性值' })
    await user.clear(input)
    await user.type(input, '原属性草稿')
    const calls = detail.mock.calls.length
    attributes.mockResolvedValue(replacement)
    await act(async () => { await client.invalidateQueries({ queryKey: ['dictionary-attributes'] }) })
    expect(await dialog.findByText('所选属性定义尚未确认、已变更或已停用，请核实后明确选择属性。')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    expect(input).toHaveValue('原属性草稿')
    expect(detail).toHaveBeenCalledTimes(calls)
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps reference dictionary failure explicit instead of offering an empty list as confirmed', async () => {
    const dictionaryList = vi.fn().mockRejectedValue(new Error('引用字典查询失败'))
    const definition = { ...attribute, description: '引用说明', dataType: 'DICT_REF' as const, referenceDictionaryId: 'ref-dict' }
    const { user, updateAttribute } = setup({ definition, dictionaryList })
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: '保存属性' })).toBeDisabled()
    expect(dialog.getByRole('combobox', { name: '引用字典' })).toBeDisabled()
    dictionaryList.mockResolvedValue([{ id: 'ref-dict', name: '引用字典甲', code: 'REFERENCE' }])
    await user.click(dialog.getByRole('button', { name: '重新核实属性定义' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存属性' })).toBeEnabled())
    await user.click(dialog.getByRole('button', { name: '保存属性' }))
    await waitFor(() => expect(updateAttribute).toHaveBeenCalled())
    expect(updateAttribute.mock.calls[0][2].referenceDictionaryId).toBe('ref-dict')
  })
})

describe('dictionary attribute value fidelity', () => {
  it.each([
    { valueMode: 'UNKNOWN', values: [{ id: 'bad', valueOrder: 1, value: 'text' }] },
    { valueMode: 'OVERRIDE', values: [{ id: 'bad', valueOrder: 1 }] },
    { valueMode: 'OVERRIDE', values: [{ id: 'one', valueOrder: 1, value: 'one' }, { id: 'two', valueOrder: 2, value: 'two' }] },
  ])('does not turn an invalid source %j into an editable default', async (invalid) => {
    const source = { ...configuration.attributes[0].configured, ...invalid }
    const response = { ...configuration, attributes: [{ definition: attribute, configured: source, resolved: source, inherited: false }] }
    const { user, save } = setup({ detail: vi.fn().mockResolvedValue(response) })
    await user.click(await screen.findByRole('button', { name: '配置' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(await dialog.findByText('当前属性配置未确认，请重新加载后再保存。')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    expect(dialog.queryByRole('textbox', { name: '属性值' })).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  async function editValues(definition: DictionaryAttributeDefinition, members: Array<Record<string, unknown>>, valueMode = 'OVERRIDE') {
    const source = { ...configuration.attributes[0].configured, valueMode, values: members }
    const response = { ...configuration, attributes: [{ definition, configured: source, resolved: source, inherited: false }] }
    const detail = vi.fn().mockResolvedValue(response)
    const result = setup({ definition, detail, configurationList: vi.fn().mockResolvedValue([response]) })
    await result.user.click(await screen.findByRole('button', { name: '配置' }))
    const dialog = within(screen.getByRole('dialog'))
    await dialog.findByText('当前生效来源')
    return { ...result, dialog }
  }
  const scalar = (value: string, index = 0) => ({ id: `v-${index}`, valueOrder: index + 1, value })

  it('submits one unchanged text value containing commas and newlines', async () => {
    const text = '门诊, 急诊\n第二行'
    const { user, dialog, save } = await editValues(attribute, [scalar(text)])
    expect(dialog.getByRole('textbox', { name: '属性值' })).toHaveValue(text)
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3].values).toEqual([text])
  })

  it('edits one item without splitting or rewriting other multi-value members', async () => {
    const definition = { ...attribute, cardinality: 'MULTIPLE' as const }
    const original = ['alpha,beta', 'next\nline', 'last']
    const { user, dialog, save } = await editValues(definition, original.map(scalar))
    for (let index = 0; index < original.length; index++) {
      expect(dialog.getByRole('textbox', { name: `属性值 ${index + 1}` })).toHaveValue(original[index])
    }
    await user.type(dialog.getByRole('textbox', { name: '属性值 3' }), '-edited')
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3].values).toEqual(['alpha,beta', 'next\nline', 'last-edited'])
  })

  it('requires an explicit removal of blank multi-value inputs instead of silently filtering them out', async () => {
    const { user, dialog, save } = await editValues({ ...attribute, cardinality: 'MULTIPLE' }, [scalar('first')])
    await user.click(dialog.getByRole('button', { name: '添加属性值' }))
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    expect(dialog.getByText('请填写每一项属性值，或明确移除空项')).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: '移除属性值 2' }))
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3].values).toEqual(['first'])
  })

  it.each([
    { dataType: 'DATETIME' as const, value: '2026-10-03T08:09:10.123456789Z' },
    { dataType: 'DATETIME' as const, value: '2026-10-03T16:09:10+08:00' },
    { dataType: 'INTEGER' as const, value: '9007199254740993' },
    { dataType: 'DATE' as const, value: '1899-12-31' },
  ])('preserves the raw $dataType value $value without browser conversion', async ({ dataType, value }) => {
    const { user, dialog, save } = await editValues({ ...attribute, dataType }, [scalar(value)])
    expect(dialog.getByRole('textbox', { name: '属性值' })).toHaveValue(value)
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3].values).toEqual([value])
  })

  it('does not add an assumed timezone to a date-time entered without one', async () => {
    const { user, dialog, save } = await editValues({ ...attribute, dataType: 'DATETIME' }, [scalar('2026-10-03T08:00:00Z')])
    const input = dialog.getByRole('textbox', { name: '属性值' })
    await user.clear(input)
    await user.type(input, '2026-10-03T08:00:00')
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    expect(dialog.getByText(/日期时间必须包含时区/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('uses stable reference IDs rather than numeric-looking codes', async () => {
    const definition = { ...attribute, dataType: 'DICT_REF' as const,
      referenceOptions: [{ id: '101', code: '999', name: '引用甲', sortOrder: 1 }] }
    const { user, dialog, save } = await editValues(definition, [{ id: 'v-1', valueOrder: 1, referenceItemId: '101', referenceItemCode: '999', referenceItemName: '引用甲' }])
    expect(dialog.getByRole('radio', { name: /引用甲/ })).toBeChecked()
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3].values).toEqual(['101'])
  })

  it('keeps unavailable reference IDs visible until explicitly removed or replaced', async () => {
    const definition = { ...attribute, dataType: 'DICT_REF' as const, cardinality: 'MULTIPLE' as const,
      referenceOptions: [{ id: '101', code: 'AVAILABLE', name: '可用引用', sortOrder: 1 }] }
    const { user, dialog, save } = await editValues(definition, [{ id: 'v-1', valueOrder: 1, referenceItemId: '999' }])
    expect(dialog.getByText('原引用项已不可选（标识：999）')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    await user.click(dialog.getByRole('checkbox', { name: /可用引用/ }))
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    await user.click(dialog.getByRole('button', { name: '移除此引用项 999' }))
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3].values).toEqual(['101'])
  })

  it('preserves an explicit empty set without manufacturing a scalar value', async () => {
    const { user, dialog, save } = await editValues(attribute, [], 'EXPLICIT_EMPTY')
    expect(dialog.getByRole('checkbox', { name: /当前层显式配置为空/ })).toBeChecked()
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][3]).toEqual(expect.objectContaining({ valueMode: 'EXPLICIT_EMPTY', values: [] }))
  })

  it('rechecks reference availability after dictionary options change without a definition revision change', async () => {
    const definition = { ...attribute, dataType: 'DICT_REF' as const,
      referenceOptions: [{ id: '101', code: 'A', name: '引用甲', sortOrder: 1 }] }
    const { dialog, client, attributes, save } = await editValues(definition, [{ id: 'v-1', valueOrder: 1, referenceItemId: '101' }])
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeEnabled())
    attributes.mockResolvedValue([{ ...definition, referenceOptions: [] }])
    await act(async () => { await client.invalidateQueries({ queryKey: ['dictionary-attributes'] }) })
    expect(await dialog.findByText('原引用项已不可选（标识：101）')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '保存当前层配置' })).toBeDisabled()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('dictionary mutation confirmation', () => {
  it.each([null, { ...configuration, dictionaryItemId: 'another-item' }, configuration])(
    'does not report saving a new draft as successful for receipt %j', async (receipt) => {
      const { user, save, onChanged } = setup()
      save.mockResolvedValueOnce(receipt)
      await user.click(await screen.findByRole('button', { name: '配置' }))
      const dialog = within(screen.getByRole('dialog'))
      const input = await dialog.findByRole('textbox', { name: '属性值' })
      await user.clear(input)
      await user.type(input, '新草稿')
      await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
      expect(await dialog.findByText(/保存未确认/)).toBeInTheDocument()
      expect(onChanged).not.toHaveBeenCalled()
      expect(input).toHaveValue('新草稿')
      const requestCode = save.mock.calls[0][3].requestCode
      await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
      await waitFor(() => expect(onChanged).toHaveBeenCalledWith('已保存“现金”的渠道'))
      expect(save.mock.calls[1][3].requestCode).toBe(requestCode)
    },
  )

  it('allocates a different request code when the user changes an unconfirmed command', async () => {
    const { user, save, onChanged } = setup()
    save.mockRejectedValueOnce(new Error('连接中断'))
    await user.click(await screen.findByRole('button', { name: '配置' }))
    const dialog = within(screen.getByRole('dialog'))
    await dialog.findByRole('textbox', { name: '属性值' })
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    expect(await dialog.findByText('保存未确认：连接中断')).toBeInTheDocument()
    const previous = save.mock.calls[0][3].requestCode
    await user.type(dialog.getByRole('textbox', { name: '属性值' }), '新的修改')
    await user.click(dialog.getByRole('button', { name: '保存当前层配置' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(save.mock.calls[1][3].requestCode).not.toBe(previous)
  })

  it('confirms inheritance only when the returned target no longer has a configured value', async () => {
    const { user, inherit, onChanged } = setup()
    inherit.mockResolvedValueOnce(configuration)
    await user.click(await screen.findByRole('button', { name: '配置' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.click(await dialog.findByRole('button', { name: '恢复继承' }))
    expect(await dialog.findByText(/恢复继承未确认/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    const code = inherit.mock.calls[0][3].requestCode
    await user.click(dialog.getByRole('button', { name: '恢复继承' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('“现金”的渠道已恢复继承'))
    expect(inherit.mock.calls[1][3].requestCode).toBe(code)
  })

  it.each([null, { ...attribute, id: 'wrong', revision: 2 }, { ...attribute, revision: 2 }])(
    'keeps definition edits open when the write receipt does not confirm the submitted fields: %j', async (receipt) => {
      const { user, updateAttribute, onChanged } = setup({ definition: { ...attribute, description: '配置说明' } })
      updateAttribute.mockResolvedValueOnce(receipt)
      await user.click(await screen.findByRole('button', { name: '编辑' }))
      const dialog = within(screen.getByRole('dialog'))
      await user.type(dialog.getByRole('textbox', { name: '属性名称' }), '新版')
      await user.click(dialog.getByRole('button', { name: '保存属性' }))
      expect(await dialog.findByText(/保存未确认/)).toBeInTheDocument()
      expect(onChanged).not.toHaveBeenCalled()
      expect(dialog.getByRole('textbox', { name: '属性名称' })).toHaveValue('渠道新版')
      const code = updateAttribute.mock.calls[0][2].requestCode
      await user.click(dialog.getByRole('button', { name: '保存属性' }))
      await waitFor(() => expect(onChanged).toHaveBeenCalledWith('已更新扩展属性“渠道新版”'))
      expect(updateAttribute.mock.calls[1][2].requestCode).toBe(code)
    },
  )

  it('does not claim a status change from an unchanged receipt and reuses the request on retry', async () => {
    const { user, changeAttributeStatus, onChanged } = setup()
    changeAttributeStatus.mockResolvedValueOnce(attribute)
    await user.click(await screen.findByRole('button', { name: '停用' }))
    expect(await screen.findByText(/状态变更未确认/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '停用' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(changeAttributeStatus.mock.calls[1][3].requestCode).toBe(changeAttributeStatus.mock.calls[0][3].requestCode)
  })
})
