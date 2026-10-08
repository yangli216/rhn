import { describe, expect, it } from 'vitest'
import type { GridAddressNode } from '../../shared/api/gridAddressApi'
import { requireGridAddressNodes, requireSavedGridAddress, type GridAddressCommand } from '../../shared/validation/gridAddressFacts'

const province: GridAddressNode = { id: 'province', revision: 1, level: 'PROVINCE', levelName: '省级', depth: 1,
  code: '110000000000', name: '测试省', pinyinCode: 'CSS', fullPath: '测试省', sortOrder: 0,
  status: 'ACTIVE', systemManaged: true, updatedAt: '2026-10-03T00:00:00Z' }
const city: GridAddressNode = { ...province, id: 'city', parentId: province.id, level: 'CITY', levelName: '市级', depth: 2,
  code: '110100000000', name: '测试市', pinyinCode: 'CS', fullPath: '测试省/测试市', sortOrder: 10, systemManaged: false }
const create: GridAddressCommand = { kind: 'create', input: { parentId: province.id, level: 'CITY', code: city.code,
  name: ' 测试市 ', pinyinCode: ' c-s ', sortOrder: 10 } }
const update: GridAddressCommand = { kind: 'update', before: city, input: { parentId: province.id,
  name: '新市', shortName: '简称', pinyinCode: 'xs', sortOrder: 20 } }
const updated = { ...city, revision: 2, name: '新市', shortName: '简称', pinyinCode: 'XS', sortOrder: 20, fullPath: '测试省/新市' }

describe('grid address facts', () => {
  it('accepts explicit empty, zero, inactive and complete unordered hierarchies without filling fields', () => {
    const empty: GridAddressNode[] = []
    expect(requireGridAddressNodes(empty)).toBe(empty)
    const list = [{ ...city, status: 'INACTIVE' }, province]
    expect(requireGridAddressNodes(list)).toBe(list)
  })

  it.each([null, {}, [null], [{ ...province, id: '' }], [{ ...province, revision: undefined }],
    [{ ...province, revision: '1' }], [{ ...province, sortOrder: -1 }], [{ ...province, sortOrder: 0.5 }],
    [{ ...province, level: 'UNKNOWN' }], [{ ...province, depth: 2 }], [{ ...province, levelName: undefined }],
    [{ ...province, code: '110000' }], [{ ...province, name: ' ' }], [{ ...province, pinyinCode: '' }],
    [{ ...province, fullPath: '其他路径' }], [{ ...province, status: undefined }], [{ ...province, status: 'UNKNOWN' }],
    [{ ...province, systemManaged: 'false' }], [{ ...province, updatedAt: '2026-02-30T00:00:00Z' }],
    [{ ...province, shortName: false }], [{ ...province, parentId: province.id }], [city],
    [province, { ...city, parentId: undefined }], [province, { ...city, parentId: city.id }],
    [province, { ...city, fullPath: '旧省/测试市' }], [province, province], [province, { ...city, code: province.code }],
  ])('rejects unverified catalog facts %j', source => expect(() => requireGridAddressNodes(source)).toThrow(/网格地址未确认/))

  it('confirms normalized creates without inventing an existing target', () => {
    const result = { ...city, revision: 0 }
    expect(requireSavedGridAddress(result, create, [province])).toBe(result)
    expect(() => requireSavedGridAddress(result, create, [province, city])).toThrow(/已有网格/)
    for (const patch of [{ status: 'INACTIVE' }, { code: '110200000000' }, { systemManaged: true }, { parentId: 'missing' }]) {
      expect(() => requireSavedGridAddress({ ...result, ...patch }, create, [province])).toThrow()
    }
  })

  it('confirms exact updates and explicit optional-field clearing', () => {
    expect(requireSavedGridAddress(updated, update, [province, city])).toBe(updated)
    const clear: GridAddressCommand = { ...update, input: { ...update.input, shortName: undefined } }
    expect(requireSavedGridAddress({ ...updated, shortName: undefined }, clear, [province, city]).shortName).toBeUndefined()
    expect(() => requireSavedGridAddress(updated, clear, [province, city])).toThrow(/内容/)
  })

  it.each([null, city, { ...updated, revision: 1 }, { ...updated, id: 'other' }, { ...updated, code: '110200000000' },
    { ...updated, systemManaged: true }, { ...updated, name: city.name }, { ...updated, shortName: undefined },
    { ...updated, pinyinCode: city.pinyinCode }, { ...updated, fullPath: city.fullPath }, { ...updated, sortOrder: 0 },
    { ...updated, status: 'INACTIVE' },
  ])('rejects stale or different write results %j', source => expect(() => requireSavedGridAddress(source, update, [province, city])).toThrow(/未确认/))

  it('checks the requested status and preserves all other fields', () => {
    const command: GridAddressCommand = { kind: 'status', before: city, status: 'INACTIVE' }
    const result = { ...city, revision: 2, status: 'INACTIVE' }
    expect(requireSavedGridAddress(result, command, [province, city])).toBe(result)
    expect(() => requireSavedGridAddress({ ...result, status: 'ACTIVE' }, command, [province, city])).toThrow(/状态/)
    expect(() => requireSavedGridAddress({ ...result, sortOrder: 20 }, command, [province, city])).toThrow(/内容/)
    expect(() => requireSavedGridAddress(result, command, [province])).toThrow(/目标/)
  })
})
