import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttributeLivePreview } from './AttributeLivePreview'
import type { ItemAttributeConfiguration } from '../../../shared/rhnApi'

describe('AttributeLivePreview', () => {
  const mockConfig: ItemAttributeConfiguration = {
    tenantNamespace: 'test',
    itemTypes: [
      { id: 'type-med', code: 'MEDICATION.ORAL', name: '口服药品', subjectType: 'MEDICATION', scopeType: 'TENANT', sortOrder: 1 },
    ],
    definitions: [
      {
        revision: 1, overridePolicy: 'NO_OVERRIDE',
        id: 'def-skin-test',
        code: 'MED.SKIN_TEST.SOLUTION_MODE',
        name: '皮试液配置方式',
        description: '皮试液的配置工艺与试验方法',
        dataType: 'ENUM',
        cardinality: 'SINGLE',
        variability: 'BASE_ONLY',
        contextBasis: 'NONE',
        sensitivity: 'NORMAL',
        status: 'ACTIVE',
        scopeType: 'TENANT',
        allowedScopes: [],
        storageMode: 'EXTENSION',
        editable: true,
        defaultValue: 'ORIGINAL_SOLUTION',
        schema: {
          type: 'string',
          enum: ['ORIGINAL_SOLUTION', 'DILUTED_SOLUTION'],
          'x-enumLabels': {
            ORIGINAL_SOLUTION: '原液直接试验',
            DILUTED_SOLUTION: '稀释配制皮试液',
          },
        },
      },
      {
        revision: 1, overridePolicy: 'NO_OVERRIDE',
        id: 'def-switch',
        code: 'MED.REQUIRES_DOUBLE_CHECK',
        name: '双人核对要求',
        dataType: 'BOOLEAN',
        cardinality: 'SINGLE',
        variability: 'BASE_ONLY',
        contextBasis: 'NONE',
        sensitivity: 'NORMAL',
        status: 'ACTIVE',
        scopeType: 'TENANT',
        allowedScopes: [],
        storageMode: 'EXTENSION',
        editable: true,
        defaultValue: false, description: '', schema: { type: 'boolean' },
      },
    ],
    assignments: [
      {
        revision: 1, searchable: false, listDisplay: false, editable: true,
        id: 'assign-1',
        itemTypeId: 'type-med',
        definitionId: 'def-skin-test',
        required: true,
        widgetType: 'RADIO',
        groupName: '用药安全',
        groupSortOrder: 10,
        attributeSortOrder: 1,
        status: 'ACTIVE',
      },
      {
        revision: 1, searchable: false, listDisplay: false, editable: true,
        id: 'assign-2',
        itemTypeId: 'type-med',
        definitionId: 'def-switch',
        required: false,
        widgetType: 'SWITCH',
        groupName: '用药安全',
        groupSortOrder: 10,
        attributeSortOrder: 2,
        status: 'ACTIVE',
      },
    ],
  }

  it('renders radio group with human-readable labels instead of plain input', () => {
    render(
      <AttributeLivePreview
        configuration={mockConfig}
        selectedItemTypeId="type-med"
      />
    )

    // Header and Group
    expect(screen.getByText('口服药品 · 扩展表单预览')).toBeInTheDocument()
    expect(screen.getByText('用药安全')).toBeInTheDocument()

    // 字段标签和控件提示
    expect(screen.getByText('皮试液配置方式')).toBeInTheDocument()
    expect(screen.getByText('单选组')).toBeInTheDocument()

    // 验证渲染的不是普通 input type=text，而是单选组 radio buttons
    const radioGroup = screen.getByRole('radiogroup', { name: '皮试液配置方式' })
    expect(radioGroup).toBeInTheDocument()

    const optOriginal = screen.getByRole('radio', { name: '原液直接试验' }) as HTMLInputElement
    const optDiluted = screen.getByRole('radio', { name: '稀释配制皮试液' }) as HTMLInputElement

    expect(optOriginal).toBeInTheDocument()
    expect(optDiluted).toBeInTheDocument()

    // 默认值 ORIGINAL_SOLUTION 应该被选中
    expect(optOriginal.checked).toBe(true)
    expect(optDiluted.checked).toBe(false)

    // 点击切换
    fireEvent.click(optDiluted)
    expect(optDiluted.checked).toBe(true)
    expect(optOriginal.checked).toBe(false)
  })

  it('renders switch toggle control properly', () => {
    render(
      <AttributeLivePreview
        configuration={mockConfig}
        selectedItemTypeId="type-med"
      />
    )

    expect(screen.getByText('双人核对要求')).toBeInTheDocument()
    expect(screen.getByText('未开启 / 否')).toBeInTheDocument()

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(screen.getByText('已启用 / 是')).toBeInTheDocument()
  })
})
