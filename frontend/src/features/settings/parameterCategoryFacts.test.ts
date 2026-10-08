import { describe, expect, it } from 'vitest'
import type { ParameterCategory, ParameterCategoryInput, ParameterCategoryOrder, ParameterCategoryUpdate } from '../../shared/api/configurationApi'
import { mergeConfirmedCategories, requireCreatedCategory, requireParameterCategories, requireReorderedCategories, requireUpdatedCategory } from './parameterCategoryFacts'

const root: ParameterCategory = { id: 'root', code: 'ROOT', name: '根分类', sortOrder: 0, revision: 0, sdParamStatus: 'ACTIVE', sdParamStatusText: '启用' }
const child: ParameterCategory = { ...root, id: 'child', code: 'CHILD', name: '子分类', parentId: 'root', sortOrder: 10, revision: 2 }
const input: ParameterCategoryInput = { code: ' new ', name: ' 新分类 ', description: ' 说明 ', parentId: 'root', sortOrder: 20 }
const created: ParameterCategory = { ...root, id: 'new', code: 'NEW', name: '新分类', description: '说明', parentId: 'root', sortOrder: 20 }
const update: ParameterCategoryUpdate = { expectedRevision: 2, name: '改名', description: '新说明', sortOrder: 30, active: false }
const updated: ParameterCategory = { ...child, parentId: undefined, name: '改名', description: '新说明', sortOrder: 30, sdParamStatus: 'INACTIVE', revision: 3 }
const orders: ParameterCategoryOrder[] = [{ id: child.id, expectedRevision: 2, sortOrder: 0 }]
const reordered = [root, { ...child, parentId: undefined, sortOrder: 0, revision: 3 }]

describe('parameter category facts', () => {
  it('keeps explicit empty, zero and inactive facts without filling missing fields', () => {
    const empty: ParameterCategory[] = []
    expect(requireParameterCategories(empty)).toBe(empty)
    const list = [root, { ...child, sdParamStatus: 'INACTIVE' }]
    expect(requireParameterCategories(list)).toBe(list)
  })

  it.each([undefined, null, {}, [null], [{ ...root, id: '' }], [{ ...root, name: ' ' }],
    [{ ...root, code: undefined }], [{ ...root, revision: '0' }], [{ ...root, revision: -1 }],
    [{ ...root, sortOrder: 0.5 }], [{ ...root, sortOrder: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...root, sdParamStatus: undefined }], [{ ...root, sdParamStatus: 'UNKNOWN' }],
    [{ ...root, parentId: '' }], [{ ...root, description: false }], [root, root],
    [root, { ...child, code: root.code }], [child], [{ ...root, parentId: root.id }],
    [{ ...root, parentId: child.id }, child],
  ])('rejects incomplete or disconnected category trees %j', source => {
    expect(() => requireParameterCategories(source)).toThrow(/参数分类未确认/)
  })

  it('accepts a complete hierarchy independent of response ordering', () => {
    const list = [child, root]
    expect(requireParameterCategories(list)).toBe(list)
  })

  it('confirms a new category against normalized submitted fields', () => {
    expect(requireCreatedCategory(created, input, [root, child])).toBe(created)
    expect(requireCreatedCategory({ ...created, description: undefined }, { ...input, description: ' ' }, [root])).toEqual({ ...created, description: undefined })
  })

  it.each([null, { ...created, id: root.id }, { ...created, code: root.code }, { ...created, name: '旧名称' },
    { ...created, description: undefined }, { ...created, parentId: undefined }, { ...created, sortOrder: 0 },
    { ...created, sdParamStatus: 'INACTIVE' }, { ...created, revision: undefined },
  ])('does not treat a mismatched create response as saved %j', source => {
    expect(() => requireCreatedCategory(source, input, [root, child])).toThrow(/参数分类未确认/)
  })

  it('confirms explicit deactivation, clearing parent and content changes', () => {
    expect(requireUpdatedCategory(updated, child, update)).toBe(updated)
  })

  it.each([child, { ...updated, id: root.id }, { ...updated, code: root.code }, { ...updated, revision: 2 },
    { ...updated, revision: 1 }, { ...updated, name: child.name }, { ...updated, description: child.description },
    { ...updated, parentId: root.id }, { ...updated, sortOrder: child.sortOrder }, { ...updated, sdParamStatus: 'ACTIVE' },
  ])('rejects stale or mismatched updates %j', source => {
    expect(() => requireUpdatedCategory(source, child, update)).toThrow(/参数分类未确认/)
  })

  it('requires all original categories and submitted hierarchy and order in the reorder result', () => {
    expect(requireReorderedCategories(reordered, [root, child], orders)).toBe(reordered)
    expect(() => requireReorderedCategories([root], [root, child], orders)).toThrow()
    expect(() => requireReorderedCategories([root, child], [root, child], orders)).toThrow()
    for (const patch of [{ parentId: root.id }, { sortOrder: 10 }, { name: '其他名称' }, { sdParamStatus: 'INACTIVE' }]) {
      expect(() => requireReorderedCategories([root, { ...reordered[1], ...patch }], [root, child], orders)).toThrow()
    }
    expect(() => requireReorderedCategories([{ ...root, revision: 1 }, reordered[1]], [root, child], orders)).toThrow()
    expect(() => requireReorderedCategories(reordered, [root, child], [...orders, ...orders])).toThrow()
    expect(() => requireReorderedCategories(reordered, [root, child], [{ ...orders[0], id: 'missing' }])).toThrow()
  })

  it('preserves concurrent additions and newer revisions when publishing a confirmed result', () => {
    const newer = { ...updated, revision: 4, name: '其他用户的新修改' }
    expect(mergeConfirmedCategories([root, newer, created], [updated])).toEqual([root, newer, created])
    expect(mergeConfirmedCategories([root, created], [created])).toEqual([root, created])
    expect(mergeConfirmedCategories([root, child], [updated])).toEqual([root, updated])
  })

  it('does not publish contradictory revisions, duplicate codes or orphaned cached trees', () => {
    expect(() => mergeConfirmedCategories([root, child], [{ ...child, name: '同版本不同内容' }])).toThrow(/同一修订/)
    expect(() => mergeConfirmedCategories([root], [{ ...created, code: root.code }])).toThrow(/编码重复/)
    expect(() => mergeConfirmedCategories(undefined, [created])).toThrow(/列表不完整/)
    expect(() => mergeConfirmedCategories([root], [child, { ...root, revision: 1, parentId: child.id }])).toThrow(/循环/)
  })
})
