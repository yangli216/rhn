import { describe, expect, it, vi } from 'vitest'
import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import { createClinicalAmendmentWriter, requireSignedClinicalDocument, signClinicalDocument } from './clinicalDocumentWorkflow'
import { changedFixture, signedFixture, versionFixture } from './clinicalDocumentWorkflow.testFixtures'

function fixture(status: ClinicalDocument['status'] = 'DRAFT'): ClinicalDocument {
  return { id: 'note-1', residentId: 'resident-1', encounterId: 'enc-1', organizationId: 'org-1', departmentId: 'dept-1',
    documentType: 'OUTPATIENT_NOTE', instanceKey: 'DEFAULT', title: '门诊病历', status, currentVersion: 1,
    contentSchema: 'RHN.OUTPATIENT_NOTE.V2', content: { chiefComplaint: '复诊', presentIllness: '症状已减轻',
      diagnoses: [{ code: 'R05', display: '咳嗽', type: 'PRIMARY' }], vitalSigns: { systolic: 120, diastolic: 80 } },
    createdBy: 'doctor', createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z',
    history: [versionFixture(1, status === 'SIGNED')] }
}
function setup(status: ClinicalDocument['status'] = 'DRAFT') {
  let stored = fixture(status)
  const source = structuredClone(stored)
  const api = {
    byEncounter: vi.fn(async (_encounterId: string) => [structuredClone(stored)]),
    sign: vi.fn(async (_id: string, _version: number) => { stored = signedFixture(stored); return structuredClone(stored) }),
    amend: vi.fn(async (_id: string, input: { content: Record<string, unknown>; changeReason: string }) => {
      stored = changedFixture(stored, input.content, input.changeReason); return structuredClone(stored)
    }),
    updateDraft: vi.fn(async (_id: string, input: { content: Record<string, unknown>; changeReason: string }) => {
      stored = changedFixture(stored, input.content, input.changeReason, 'UPDATE'); return structuredClone(stored)
    }),
  }
  return { api, source, writer: createClinicalAmendmentWriter(), read: () => stored,
    replace: (note: ClinicalDocument) => { stored = note }, assertCurrent: vi.fn() }
}

describe('clinical document signatures', () => {
  it('verifies the same version and content against signature receipt and persisted note', async () => {
    const { api, source, assertCurrent } = setup()
    const saved = await signClinicalDocument(api, source, assertCurrent)
    expect(saved.status).toBe('SIGNED')
    expect(api.sign).toHaveBeenCalledWith(source.id, 1)
    expect(api.byEncounter).toHaveBeenCalledTimes(2)
  })
  it.each([
    ['wrong-id', { id: 'another' }], ['wrong-patient', { residentId: 'another' }],
    ['wrong-encounter', { encounterId: 'another' }], ['wrong-organization', { organizationId: 'another' }],
    ['wrong-department', { departmentId: 'another' }], ['wrong-version', { currentVersion: 2 }],
    ['unsigned', { status: 'DRAFT' }], ['changed-content', { content: { chiefComplaint: '旧正文' } }],
    ['missing-history', { history: [] }], ['wrong-schema', { contentSchema: 'another' }],
    ['duplicate-history', { history: [versionFixture(1, true), versionFixture(1, true)] }],
  ])('rejects a nominal sign success with %s', async (_name, change) => {
    const { api, source, assertCurrent } = setup()
    api.sign.mockResolvedValueOnce({ ...signedFixture(source), ...change } as ClinicalDocument)
    await expect(signClinicalDocument(api, source, assertCurrent)).rejects.toThrow('文书操作未确认')
  })
  it.each(['signedBy', 'signedAt', 'signatureMeaning', 'signatureEvidenceId', 'integrityEvidenceId', 'contentDigestAlgorithm', 'contentDigest'] as const)(
    'rejects missing %s without replacing it with fabricated evidence', key => {
      const source = fixture(), signed = signedFixture(source)
      delete signed.history[0][key]
      expect(() => requireSignedClinicalDocument(source, signed)).toThrow('文书操作未确认')
    })
  it('does not accept a signed receipt when the persisted document remains unsigned', async () => {
    const { api, source, assertCurrent } = setup()
    api.sign.mockResolvedValueOnce(signedFixture(source))
    await expect(signClinicalDocument(api, source, assertCurrent)).rejects.toThrow('完整签署回执')
  })
  it('recovers a committed signature after a lost response without signing twice', async () => {
    const { api, source, replace, assertCurrent } = setup()
    api.sign.mockImplementationOnce(async () => { replace(signedFixture(source)); throw new Error('response lost') })
    await expect(signClinicalDocument(api, source, assertCurrent)).rejects.toThrow('远端可能已签署')
    expect((await signClinicalDocument(api, source, assertCurrent)).status).toBe('SIGNED')
    expect(api.sign).toHaveBeenCalledTimes(1)
  })
  it('refuses stale versions before writing and rejects changed existing signatures', async () => {
    const { api, source, replace, assertCurrent } = setup('SIGNED')
    replace(changedFixture(source, { chiefComplaint: '其他医生更正' }, '其他操作'))
    await expect(signClinicalDocument(api, source, assertCurrent)).rejects.toThrow('版本或正文已变化')
    expect(api.sign).not.toHaveBeenCalled()
    const altered = signedFixture(source)
    altered.history[0].signatureEvidenceId = 'another-signature'
    expect(() => requireSignedClinicalDocument(source, altered)).toThrow('既有签署证据发生变化')
  })
  it('stops before signing when context changes during the initial read', async () => {
    const { api, source } = setup()
    let active = true
    api.byEncounter.mockImplementationOnce(async () => { active = false; return [source] })
    await expect(signClinicalDocument(api, source, () => { if (!active) throw new Error('上下文变化') })).rejects.toThrow('上下文变化')
    expect(api.sign).not.toHaveBeenCalled()
  })
})

describe('amend then sign coordination', () => {
  const content = { ...fixture().content, presentIllness: '医生核实后的更正内容' }
  const reason = '更正记录错误'
  it('preserves original signed evidence and returns only the signed new version', async () => {
    const { api, writer, source, assertCurrent } = setup('SIGNED')
    const saved = await writer.save(api, source, content, reason, assertCurrent)
    expect(saved.currentVersion).toBe(2)
    expect(saved.status).toBe('SIGNED')
    expect(saved.history.find(item => item.version === 1)).toEqual(source.history[0])
    expect(api.amend).toHaveBeenCalledTimes(1)
    expect(api.sign).toHaveBeenCalledWith('note-1', 2)
  })
  it.each(['wrong-id', 'wrong-content', 'lost-history', 'wrong-reason', 'wrong-status'] as const)(
    'does not sign an unconfirmed amendment: %s', async failure => {
      const { api, writer, source, assertCurrent } = setup('SIGNED')
      const bad = changedFixture(source, content, reason)
      if (failure === 'wrong-id') bad.id = 'another'
      if (failure === 'wrong-content') bad.content = source.content
      if (failure === 'lost-history') bad.history = [bad.history[0]]
      if (failure === 'wrong-reason') bad.history[0].changeReason = '别的原因'
      if (failure === 'wrong-status') bad.status = 'SIGNED'
      api.amend.mockResolvedValueOnce(bad)
      await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow('文书操作未确认')
      expect(api.sign).not.toHaveBeenCalled()
    })
  it('resumes the same amendment when signing fails', async () => {
    const { api, writer, source, assertCurrent } = setup('SIGNED')
    api.sign.mockRejectedValueOnce(new Error('签署暂时失败'))
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow('签署暂时失败')
    expect((await writer.save(api, source, content, reason, assertCurrent)).currentVersion).toBe(2)
    expect(api.amend).toHaveBeenCalledTimes(1)
    expect(api.updateDraft).not.toHaveBeenCalled()
    expect(api.sign.mock.calls.map(call => call[1])).toEqual([2, 2])
  })
  it('reconciles a lost amendment response and signs the persisted attempt', async () => {
    const { api, writer, source, replace, assertCurrent } = setup('SIGNED')
    api.amend.mockImplementationOnce(async () => { replace(changedFixture(source, content, reason)); throw new Error('response lost') })
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow('远端可能已保存更正版')
    await writer.save(api, source, content, reason, assertCurrent)
    expect(api.amend).toHaveBeenCalledTimes(1)
    expect(api.sign).toHaveBeenCalledTimes(1)
  })
  it('updates the existing unsigned amendment after an edit instead of creating another amendment', async () => {
    const { api, writer, source, assertCurrent } = setup('SIGNED')
    api.sign.mockRejectedValueOnce(new Error('签署失败'))
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow()
    const edited = { ...content, presentIllness: '再次核实的正文' }
    const saved = await writer.save(api, source, edited, '补充更正原因', assertCurrent)
    expect(api.amend).toHaveBeenCalledTimes(1)
    expect(api.updateDraft).toHaveBeenCalledWith('note-1', expect.objectContaining({ expectedCurrentVersion: 2, content: edited }))
    expect(saved.content).toEqual(edited)
    expect(saved.currentVersion).toBe(3)
  })
  it('reconciles a lost final signature without recreating or signing the amendment again', async () => {
    const { api, writer, source, read, replace, assertCurrent } = setup('SIGNED')
    api.sign.mockImplementationOnce(async () => { replace(signedFixture(read())); throw new Error('response lost') })
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow()
    const saved = await writer.save(api, source, content, reason, assertCurrent)
    expect(saved.status).toBe('SIGNED')
    expect(api.amend).toHaveBeenCalledTimes(1)
    expect(api.sign).toHaveBeenCalledTimes(1)
  })
  it('reconciles a committed amendment edit after its response is lost', async () => {
    const { api, writer, source, read, replace, assertCurrent } = setup('SIGNED')
    api.sign.mockRejectedValueOnce(new Error('签署失败'))
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow()
    const edited = { ...content, presentIllness: '已重新核实' }
    api.updateDraft.mockImplementationOnce(async () => {
      replace(changedFixture(read(), edited, reason, 'UPDATE')); throw new Error('response lost')
    })
    await expect(writer.save(api, source, edited, reason, assertCurrent)).rejects.toThrow('远端可能已保存更正版')
    expect((await writer.save(api, source, edited, reason, assertCurrent)).currentVersion).toBe(3)
    expect(api.amend).toHaveBeenCalledTimes(1)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    expect(api.sign.mock.calls.map(call => call[1])).toEqual([2, 3])
  })
  it('refuses a concurrent duplicate attempt while keeping the first operation intact', async () => {
    const { api, writer, source, assertCurrent } = setup('SIGNED')
    let finish!: (notes: ClinicalDocument[]) => void
    api.byEncounter.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const first = writer.save(api, source, content, reason, assertCurrent)
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow('更正正在处理中')
    finish([source])
    expect((await first).status).toBe('SIGNED')
    expect(api.amend).toHaveBeenCalledTimes(1)
  })
  it('does not adopt an unrelated concurrent amendment', async () => {
    const { api, writer, source, replace, assertCurrent } = setup('SIGNED')
    replace(changedFixture(source, content, reason))
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow('版本或正文已变化')
    expect(api.amend).not.toHaveBeenCalled()
    expect(api.sign).not.toHaveBeenCalled()
  })
  it('does not mistake an explicitly rejected write for its own committed amendment on retry', async () => {
    const { api, writer, source, replace, assertCurrent } = setup('SIGNED')
    api.amend.mockImplementationOnce(async () => {
      replace(changedFixture(source, content, reason))
      throw { code: 'DOCUMENT_VERSION_CONFLICT', message: '其他医生已更新文书' }
    })
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow('其他医生已更新文书')
    await expect(writer.save(api, source, content, reason, assertCurrent)).rejects.toThrow('版本或正文已变化')
    expect(api.sign).not.toHaveBeenCalled()
    expect(api.amend).toHaveBeenCalledTimes(1)
  })
  it('stops after a committed amendment when the caller context is no longer current', async () => {
    const { api, writer, source, replace } = setup('SIGNED')
    let active = true
    api.amend.mockImplementationOnce(async () => {
      const changed = changedFixture(source, content, reason); replace(changed); active = false; return changed
    })
    await expect(writer.save(api, source, content, reason, () => { if (!active) throw new Error('上下文变化') })).rejects.toThrow('上下文变化')
    expect(api.sign).not.toHaveBeenCalled()
  })
})
