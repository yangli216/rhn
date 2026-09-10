import { describe, expect, it, vi } from 'vitest'
import { clinicalAiPreview, consumeClinicalAiStream } from './clinicalAiStream'

describe('clinical AI streaming', () => {
  it('previews partial escaped strings without mistaking quoted JSON for a field', () => {
    const preview = clinicalAiPreview('{"summary":"问诊\\n待核对","recordDraft":{"chiefComplaint":"发热\\u4e09天","presentIllness":"患者描述仍在生成')
    expect(preview).toEqual({ summary: '问诊\n待核对', recordDraft: { chiefComplaint: '发热三天', presentIllness: '患者描述仍在生成' } })
    expect(clinicalAiPreview(JSON.stringify({ summary: '嵌入 \"recordDraft\":{\"chiefComplaint\":\"伪字段\"}' })).recordDraft).toEqual({})
    expect(clinicalAiPreview('{"recordDraft":{"chiefComplaint":"待补充\\u4e')).toEqual({ recordDraft: { chiefComplaint: '待补充' } })
  })

  it('delivers deltas before completion and handles split UTF-8 and CRLF', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const response = new Response(new ReadableStream({ start(controller) { stream = controller } }))
    const delta = vi.fn(), completed = vi.fn()
    const promise = consumeClinicalAiStream(response, delta).then(completed)
    const bytes = new TextEncoder().encode('event: delta\r\ndata: {"text":"摘要"}\r\n\r\n')
    for (const byte of bytes) stream.enqueue(new Uint8Array([byte]))
    await vi.waitFor(() => expect(delta).toHaveBeenCalledWith('摘要'))
    expect(completed).not.toHaveBeenCalled()
    stream.enqueue(new TextEncoder().encode('event: complete\ndata: {"id":"s1","clientContextFingerprint":"f1","recordDraft":{}}\n\n'))
    await promise
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })

  it('rejects an interrupted stream instead of adopting its preview', async () => {
    const response = new Response('event: delta\ndata: {"text":"{\\"summary\\":\\"半成品"}\n\n')
    await expect(consumeClinicalAiStream(response, vi.fn())).rejects.toThrow('连接已中断')
    await expect(consumeClinicalAiStream(new Response('event: error\ndata: {"code":"AI_MODEL_UNAVAILABLE","message":"超时"}\n\n'), vi.fn()))
      .rejects.toMatchObject({ code: 'AI_MODEL_UNAVAILABLE', message: '超时' })
  })
})
