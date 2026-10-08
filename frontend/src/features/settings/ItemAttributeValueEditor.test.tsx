import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ItemAttributeSchema } from '../../shared/api/masterDataApi'
import type { RhnApi } from '../../shared/rhnApi'
import { ItemAttributeValueEditor, parseAttributeRaw } from './ItemAttributeValueEditor'

const attribute: ItemAttributeSchema = {
  assignmentId: 'assignment-1', definitionId: 'definition-1', definitionRevision: 1, code: 'TEST_ATTRIBUTE',
  name: '测试属性', dataType: 'ENUM', cardinality: 'MULTIPLE', schema: { items: { enum: ['A', 'B'] } },
  variability: 'SCOPE_OVERRIDE', overridePolicy: 'ANY', allowedScopes: ['ORGANIZATION'], contextBasis: 'CURRENT',
  storageMode: 'EXTENSION', sensitivity: 'NORMAL', required: false, widgetType: 'AUTO',
  groupSortOrder: 0, attributeSortOrder: 0, searchable: false, listDisplay: false,
}
function setup(value: string, schema = attribute, get = vi.fn().mockResolvedValue({ items: [] })) {
  const api = { dictionaries: { get } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Harness() {
    const [current, setCurrent] = useState(value)
    return <><ItemAttributeValueEditor api={api} attribute={schema} value={current} onChange={setCurrent}
      actions={(editable) => <button disabled={!editable}>保存属性</button>} /><output aria-label="实际值">{current}</output></>
  }
  render(<Harness />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

describe('attribute value truthfulness', () => {
  it.each(['broken JSON', '{"A":true}', '[{"code":"A"}]'])('preserves invalid multi-value input instead of showing empty selection: %s', (value) => {
    setup(value)
    expect(screen.getByRole('textbox', { name: '测试属性' })).toHaveValue(value)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存属性' })).toBeDisabled()
  })

  it('preserves codes missing from current options and requires an explicit correction', () => {
    setup('["OLD"]')
    expect(screen.getByRole('combobox', { name: '测试属性' })).toHaveTextContent('OLD（未匹配可选项）')
    expect(screen.getByLabelText('实际值')).toHaveTextContent('["OLD"]')
    expect(screen.getByRole('button', { name: '保存属性' })).toBeDisabled()
  })

  it('shows dictionary failure, retains original data and retries without switching to free text', async () => {
    const user = userEvent.setup()
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ items: [
      { code: 'A', name: '实际字典名称', sdDictItemStatus: 'ACTIVE' },
    ] })
    setup('["A"]', { ...attribute, dataType: 'DICT_REF', dictionaryId: 'dict-1' }, get)
    expect(await screen.findByText('属性字典加载失败，原值已保留')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '测试属性' })).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: '测试属性' })).toHaveValue('["A"]')
    expect(screen.getByRole('button', { name: '保存属性' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '重试属性字典' }))
    expect(await screen.findByRole('combobox', { name: '测试属性' })).toHaveTextContent('实际字典名称')
    expect(screen.getByRole('button', { name: '保存属性' })).toBeEnabled()
  })

  it('retains numeric types when selecting enumerated multi-values', async () => {
    const user = userEvent.setup()
    setup('[1]', { ...attribute, dataType: 'INTEGER', schema: { items: { enum: [1, 2] } } })
    await user.click(screen.getByRole('combobox', { name: '测试属性' }))
    await user.click(screen.getByRole('option', { name: '2' }))
    expect(screen.getByLabelText('实际值')).toHaveTextContent('[1,2]')
  })

  it.each([
    ['BOOLEAN', 'unknown'], ['INTEGER', '1.5'], ['INTEGER', '123x'], ['INTEGER', '9007199254740993'], ['DECIMAL', 'Infinity'],
    ['INTEGER', '0x10'], ['DECIMAL', '0b11'],
  ])('rejects invalid %s rather than coercing %s', (dataType, value) => {
    expect(() => parseAttributeRaw(value, { ...attribute, dataType, cardinality: 'SINGLE' })).toThrow()
  })

  it('preserves explicit false and numeric zero', () => {
    expect(parseAttributeRaw('false', { ...attribute, dataType: 'BOOLEAN', cardinality: 'SINGLE' })).toBe(false)
    expect(parseAttributeRaw('0', { ...attribute, dataType: 'INTEGER', cardinality: 'SINGLE' })).toBe(0)
  })
})
