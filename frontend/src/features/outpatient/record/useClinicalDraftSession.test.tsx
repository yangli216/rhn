import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import type { RecordForm } from './clinicalRecordDraft'
import { useClinicalDraftSession } from './useClinicalDraftSession'

function setup() {
  const initialProps = { api: {}, identity: 'enc-1', enabled: true, related: { diagnoses: ['R05'], quantity: 1 } }
  return { initialProps, ...renderHook(props => {
    const form = useForm<RecordForm>({ defaultValues: { chiefComplaint: '复诊' } })
    const capture = useClinicalDraftSession(props.api, props.identity, props.enabled, form, props.related)
    return { form, capture }
  }, { initialProps }) }
}

describe('clinical draft save session', () => {
  it('rejects an edited then restored form even when its final text matches', () => {
    const { result } = setup()
    const session = result.current.capture()
    act(() => {
      result.current.form.setValue('chiefComplaint', '新内容')
      result.current.form.setValue('chiefComplaint', '复诊')
    })
    expect(session.assertUnchanged).toThrow('保存期间内容已变化')
    expect(session.assertCurrent).not.toThrow()
    expect(result.current.capture().assertUnchanged).not.toThrow()
  })
  it.each(['diagnoses', 'orders'] as const)('rejects changed %s and preserves the latest values', change => {
    const { result, rerender, initialProps } = setup()
    const session = result.current.capture()
    rerender({ ...initialProps, related: { diagnoses: change === 'diagnoses' ? ['R06'] : ['R05'], quantity: change === 'orders' ? 2 : 1 } })
    expect(session.assertUnchanged).toThrow('保存期间内容已变化')
    rerender(initialProps)
    expect(session.assertUnchanged).toThrow('保存期间内容已变化')
  })
  it('detects in-place draft mutations as well as React state replacements', () => {
    const { result, initialProps } = setup()
    const session = result.current.capture()
    initialProps.related.quantity = 9
    expect(session.assertUnchanged).toThrow('保存期间内容已变化')
  })
  it.each(['api', 'patient', 'permission', 'unmount'] as const)('does not consider a %s change current', change => {
    const { result, rerender, unmount, initialProps } = setup()
    const session = result.current.capture()
    if (change === 'unmount') unmount()
    else rerender({ ...initialProps, api: change === 'api' ? {} : initialProps.api,
      identity: change === 'patient' ? 'enc-2' : 'enc-1', enabled: change !== 'permission' })
    expect(session.isCurrent()).toBe(false)
    expect(session.assertUnchanged).toThrow('工作上下文或操作权限已变化')
  })
})
