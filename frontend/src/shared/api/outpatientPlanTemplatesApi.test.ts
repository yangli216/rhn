import { describe, expect, it, vi } from 'vitest'
import { consumePlanTextDraftStream, planTextStreamPreview } from './outpatientPlanTemplatesApi'

describe('outpatient plan text streaming', () => {
  it('previews the top-level plan name and narrative while JSON is incomplete', () => {
    expect(planTextStreamPreview('{"name":"成人上感方案","description":"含有 \\"narrative\\" 字样","narrative":"先核对诊断\\n再核对医嘱')).toEqual({
      name: '成人上感方案',
      narrative: '先核对诊断\n再核对医嘱',
      items: [],
    })
  })

  it('delivers model deltas before accepting the completed clinical review items', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const response = new Response(new ReadableStream({ start(controller) { stream = controller } }))
    const delta = vi.fn()
    const completed = vi.fn()
    const promise = consumePlanTextDraftStream(response, delta).then(completed)
    stream.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"{\\"name\\":\\"上感方案\\"}"}\n\n'))
    await vi.waitFor(() => expect(delta).toHaveBeenCalled())
    expect(completed).not.toHaveBeenCalled()
    stream.enqueue(new TextEncoder().encode('event: complete\ndata: {"scopeType":"PERSONAL","name":"上感方案","narrative":"门诊方案","reviewItems":[]}\n\n'))
    await promise
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ name: '上感方案', reviewItems: [] }))
  })

  it('rejects a disconnected or incomplete stream', async () => {
    await expect(consumePlanTextDraftStream(new Response(
      'event: delta\ndata: {"text":"半成品"}\n\n'), vi.fn())).rejects.toThrow('连接已中断')
  })
})


it('previews partial note strings with escapes and ignores nested or quoted lookalike fields', () => {
  const source = JSON.stringify({ name: '测试方案', description: '"noteTemplateContent":{"chiefComplaint":"伪字段"}',
    items: [{ kind: 'CONDITION', name: '条件', noteTemplateContent: { chiefComplaint: '不应显示' } }],
    noteTemplateContent: { chiefComplaint: '[主要不适]，[持续时间]', presentIllness: '需询问起病\n伴随"症状"',
      treatmentPlan: '禁止进入病历' } })
  const cut = source.indexOf('伴随') + 2
  expect(planTextStreamPreview(source.slice(0, cut)).noteTemplateContent).toEqual({
    chiefComplaint: '[主要不适]，[持续时间]', presentIllness: '需询问起病\n伴随',
  })
  expect(planTextStreamPreview(source).noteTemplateContent).toEqual({
    chiefComplaint: '[主要不适]，[持续时间]', presentIllness: '需询问起病\n伴随"症状"',
  })
  expect(planTextStreamPreview('{"noteTemplateContent":{"chiefComplaint":"待\\u8be').noteTemplateContent)
    .toEqual({ chiefComplaint: '待' })
})
