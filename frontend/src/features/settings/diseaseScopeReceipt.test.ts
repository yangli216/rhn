import { describe, expect, it } from 'vitest'
import { prepareDiseaseScopeSave, requireDiseaseScopeReceipt } from './diseaseScopeReceipt'
import { scopeProgram, savedScope } from './diseaseScopeReceipt.testFixtures'

describe('disease scope save receipt', () => {
  const command = () => prepareDiseaseScopeSave(scopeProgram, scopeProgram.rules, scopeProgram.members)
  it('preserves existing notes and validates real saved content independent of generated rule IDs', () => {
    expect(command().exceptions[0].note).toBe('原有例外备注')
    expect(requireDiseaseScopeReceipt(command(), savedScope()).revision).toBe(3)
  })
  it.each([
    null, {}, { ...savedScope(), id: 'another' }, { ...savedScope(), scopeId: 'another' },
    { ...savedScope(), revision: 2 }, { ...savedScope(), sdStatus: 'SUSPENDED' },
    { ...savedScope(), rules: [] }, { ...savedScope(), exceptionCount: 0 },
    { ...savedScope(), members: [{ conceptId: 'concept', inclusionMode: 'INCLUDE' }] },
    { ...savedScope(), members: [{ ...scopeProgram.members[0], note: null }] },
    { ...savedScope(), members: [{ ...scopeProgram.members[0], inclusionMode: 'EXCLUDE' }] },
    { ...savedScope(), members: [{ ...scopeProgram.members[0], conceptId: 'different' }] },
    { ...savedScope(), rules: [{ ...scopeProgram.rules[0], note: '不同备注' }] },
    { ...savedScope(), rules: [{ ...scopeProgram.rules[0], codeFrom: 'A00' }] },
    { ...savedScope(), members: [scopeProgram.members[0], scopeProgram.members[0]], exceptionCount: 2 },
  ])('rejects an unconfirmed response %#', response => {
    expect(() => requireDiseaseScopeReceipt(command(), response)).toThrow('保存未确认')
  })
  it('refuses to turn an omitted existing note into an empty one', () => {
    const before = structuredClone(scopeProgram)
    delete (before.members[0] as Partial<typeof before.members[number]>).note
    expect(() => prepareDiseaseScopeSave(before, before.rules, before.members)).toThrow('备注不完整')
  })
  it('rejects duplicate exceptions, empty rules and over-limit requests instead of truncating', () => {
    expect(() => prepareDiseaseScopeSave(scopeProgram, [], [scopeProgram.members[0], scopeProgram.members[0]])).toThrow('标识重复')
    expect(() => prepareDiseaseScopeSave(scopeProgram, [{ inclusionMode: 'INCLUDE' }], [])).toThrow('至少需要一个匹配条件')
    expect(() => prepareDiseaseScopeSave(scopeProgram, Array(101).fill(scopeProgram.rules[0]), [])).toThrow('超出上限')
  })
  it('normalizes submitted whitespace and distinguishes explicit clearing from losing a note', () => {
    const next = prepareDiseaseScopeSave(scopeProgram, [{ ...scopeProgram.rules[0], note: '  新备注  ' }],
      [{ conceptId: 'concept', inclusionMode: 'EXCLUDE', note: '' }])
    expect(next.rules[0].note).toBe('新备注'); expect(next.exceptions[0].note).toBeNull()
    const receipt = { ...savedScope(), rules: [{ ...scopeProgram.rules[0], note: '新备注' }], members: next.exceptions }
    expect(() => requireDiseaseScopeReceipt(next, receipt)).not.toThrow()
  })
})
