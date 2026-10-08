import type { ClinicalDocument, ClinicalDocumentVersion } from '../../../shared/api/clinicalDocumentsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/api/httpClient'

type DocumentApi = Pick<RhnApi['clinicalDocuments'], 'byEncounter' | 'sign' | 'amend' | 'updateDraft'>
type CurrentCheck = () => void
type Change = { content: ClinicalDocument['content']; reason: string; type: 'AMENDMENT' | 'UPDATE' }
const identityFields = ['id', 'residentId', 'encounterId', 'organizationId', 'departmentId', 'documentType',
  'instanceKey', 'title', 'contentSchema', 'createdBy', 'createdAt'] as const

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) }
function requireFact(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`文书操作未确认：${detail}。后续操作已停止，远端可能已完成部分操作，请核实后重试`)
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => [key, canonical(value[key])]))
  return value
}
function same(left: unknown, right: unknown) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)) }
function snapshot<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function requireNote(value: unknown): ClinicalDocument {
  requireFact(object(value) && identityFields.every(key => text(value[key]))
    && value.documentType === 'OUTPATIENT_NOTE' && value.instanceKey === 'DEFAULT'
    && Number.isSafeInteger(value.currentVersion) && Number(value.currentVersion) > 0
    && object(value.content) && Array.isArray(value.history), '门诊文书身份、内容或版本不完整')
  const note = value as unknown as ClinicalDocument
  const versions = new Set<number>()
  requireFact(note.history.length === note.currentVersion && note.history.every(version => object(version) && Number.isSafeInteger(version.version)
    && version.version > 0 && version.version <= note.currentVersion && !versions.has(version.version)
    && Boolean(versions.add(version.version))), '文书版本历史缺失或重复')
  currentVersion(note)
  return note
}
function currentVersion(note: ClinicalDocument): ClinicalDocumentVersion {
  const version = note.history.find(item => item.version === note.currentVersion)
  requireFact(version && text(version.createdBy) && text(version.createdAt) && Number.isFinite(Date.parse(version.createdAt))
    && text(version.changeType) && text(version.changeReason) && text(version.integrityEvidenceId)
    && text(version.contentDigestAlgorithm) && text(version.contentDigest), '当前版本缺少完整性证据')
  return version
}
function requireIdentity(before: ClinicalDocument, after: ClinicalDocument) {
  requireFact(identityFields.every(key => before[key] === after[key]), '返回了不同归属或不同内容契约的文书')
}
function requireSameVersion(before: ClinicalDocument, value: unknown): ClinicalDocument {
  const after = requireNote(value)
  requireIdentity(before, after)
  requireFact(after.currentVersion === before.currentVersion && same(after.content, before.content), '文书版本或正文已变化')
  const old = currentVersion(before), current = currentVersion(after)
  requireFact(['version', 'changeType', 'changeReason', 'createdBy', 'createdAt', 'contentDigestAlgorithm',
    'contentDigest', 'integrityEvidenceId'].every(key => same(old[key as keyof ClinicalDocumentVersion],
    current[key as keyof ClinicalDocumentVersion])), '签署前后的版本证据不一致')
  requireFact(before.history.filter(item => item.version !== before.currentVersion)
    .every(oldVersion => same(after.history.find(item => item.version === oldVersion.version), oldVersion)), '历史版本证据发生变化')
  return after
}
export function requireSignedClinicalDocument(before: ClinicalDocument, value: unknown): ClinicalDocument {
  requireNote(before)
  const after = requireSameVersion(before, value)
  const version = currentVersion(after)
  requireFact(after.status === 'SIGNED' && text(version.signedBy) && text(version.signedAt)
    && Number.isFinite(Date.parse(version.signedAt)) && version.signatureMeaning === 'AUTHOR'
    && text(version.signatureEvidenceId), '当前版本尚未取得完整签署回执')
  if (before.status === 'SIGNED') {
    const prior = currentVersion(before)
    requireFact(['signedBy', 'signedAt', 'signatureMeaning', 'signatureEvidenceId']
      .every(key => prior[key as keyof ClinicalDocumentVersion] === version[key as keyof ClinicalDocumentVersion]), '既有签署证据发生变化')
  }
  return after
}
function requireChangedDocument(before: ClinicalDocument, change: Change, value: unknown): ClinicalDocument {
  const after = requireNote(value)
  requireIdentity(before, after)
  requireFact(after.currentVersion === before.currentVersion + 1 && same(after.content, change.content), '更正版版本或正文与提交不一致')
  requireFact(before.history.every(old => same(after.history.find(item => item.version === old.version), old)), '原版本或签署证据未完整保留')
  const version = currentVersion(after)
  requireFact(version.changeType === change.type && version.changeReason === change.reason, '更正类型或原因不一致')
  requireFact(after.status === 'AMENDMENT_IN_PROGRESS' || after.status === 'SIGNED', '更正版状态不一致')
  if (after.status === 'SIGNED') return requireSignedClinicalDocument(after, after)
  requireFact(!version.signedAt && !version.signedBy && !version.signatureEvidenceId, '未签署更正版包含矛盾的签署信息')
  return after
}
async function readCurrent(api: DocumentApi, before: ClinicalDocument, assertCurrent: CurrentCheck) {
  assertCurrent()
  const notes: unknown = await api.byEncounter(before.encounterId!)
  assertCurrent()
  requireFact(Array.isArray(notes) && notes.every(object), '读取文书列表失败或返回不完整')
  const matches = notes.filter(note => note.documentType === 'OUTPATIENT_NOTE' && note.instanceKey === 'DEFAULT')
  requireFact(matches.length === 1, '未找到唯一的本次门诊病历')
  const current = requireNote(matches[0])
  requireIdentity(before, current)
  return current
}

/** A retry reads first: an already committed signature is verified, never blindly signed again. */
export async function signClinicalDocument(api: DocumentApi, source: ClinicalDocument, assertCurrent: CurrentCheck) {
  try {
    const before = snapshot(requireNote(source))
    const current = requireSameVersion(before, await readCurrent(api, before, assertCurrent))
    if (current.status === 'SIGNED' || before.status === 'SIGNED') return requireSignedClinicalDocument(before, current)
    requireFact(current.status === 'DRAFT' || current.status === 'AMENDMENT_IN_PROGRESS', '当前状态不允许签署')
    assertCurrent()
    const receipt = await api.sign(current.id, current.currentVersion)
    assertCurrent()
    const confirmed = requireSignedClinicalDocument(current, receipt)
    return requireSignedClinicalDocument(confirmed, await readCurrent(api, confirmed, assertCurrent))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('文书操作未确认')) throw error
    throw new Error(`文书操作未确认：${errorMessage(error)}。后续操作已停止，远端可能已签署；重试将先核实当前版本`)
  }
}

/** One editor session. Remember attempted writes so an uncertain response can be reconciled on explicit retry. */
export function createClinicalAmendmentWriter() {
  let pending: { api: DocumentApi; origin: ClinicalDocument; before: ClinicalDocument; change: Change } | undefined
  let busy = false
  return {
    async save(api: DocumentApi, source: ClinicalDocument, content: ClinicalDocument['content'], reason: string,
      assertCurrent: CurrentCheck): Promise<ClinicalDocument> {
      requireFact(!busy, '更正正在处理中，请等待当前操作')
      busy = true
      try {
        const origin = snapshot(requireNote(source))
        const requested = snapshot(content), changeReason = reason.trim()
        requireFact(changeReason && object(requested), '请填写更正内容和原因')
        assertCurrent()
        if (pending) requireFact(pending.api === api && pending.origin.id === origin.id
          && pending.origin.currentVersion === origin.currentVersion && same(pending.origin.content, origin.content),
        '上次更正尚未核实，请先确认原操作所在的文书与工作上下文')
        let current = await readCurrent(api, origin, assertCurrent)
        if (pending) {
          if (current.currentVersion === pending.before.currentVersion) {
            current = requireSameVersion(pending.before, current)
          } else current = requireChangedDocument(pending.before, pending.change, current)
        } else {
          current = requireSameVersion(origin, current)
          requireSignedClinicalDocument(origin, current)
        }
        const desiredAlreadySaved = pending && same(current.content, requested)
          && currentVersion(current).changeReason === changeReason
          && current.currentVersion > origin.currentVersion
        if (!desiredAlreadySaved) {
          // A signed result of a previous uncertain attempt must be reviewed before another amendment.
          requireFact(current.currentVersion === origin.currentVersion || current.status === 'AMENDMENT_IN_PROGRESS',
            '上次更正版已签署，请重新加载后再发起新的更正')
          const change: Change = { content: requested, reason: changeReason,
            type: current.currentVersion === origin.currentVersion ? 'AMENDMENT' : 'UPDATE' }
          const previousAttempt = pending
          pending = { api, origin, before: snapshot(current), change }
          assertCurrent()
          const input = { expectedCurrentVersion: current.currentVersion, contentSchema: current.contentSchema,
            content: requested, changeReason }
          let receipt: ClinicalDocument
          try {
            receipt = change.type === 'AMENDMENT' ? await api.amend(current.id, input) : await api.updateDraft(current.id, input)
          } catch (error) {
            // These server precondition failures prove this write was rejected, not merely unobserved.
            if (object(error) && ['DOCUMENT_VERSION_CONFLICT', 'DOCUMENT_NOT_SIGNED', 'DOCUMENT_NOT_EDITABLE']
              .includes(String(error.code))) pending = previousAttempt
            throw error
          }
          assertCurrent()
          current = requireChangedDocument(current, change, receipt)
          requireFact(current.status === 'AMENDMENT_IN_PROGRESS', '更正写入回执未返回待签署版本')
        }
        const signed = await signClinicalDocument(api, current, assertCurrent)
        assertCurrent()
        pending = undefined
        return signed
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('文书操作未确认')) throw error
        throw new Error(`文书操作未确认：${errorMessage(error)}。内容已保留，远端可能已保存更正版；重试将先核实同一份文书`)
      } finally { busy = false }
    },
  }
}
