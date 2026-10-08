import type { ClinicalDocument, ClinicalDocumentVersion } from '../../../shared/api/clinicalDocumentsApi'

/** Explicit synthetic integrity/signature receipts for tests; not used by application code. */
export function versionFixture(version: number, signed: boolean, changeType = 'CREATE', changeReason = '创建文书'): ClinicalDocumentVersion {
  return { version, changeType, changeReason, createdBy: 'doctor', createdAt: '2026-10-04T00:00:00Z',
    contentDigestAlgorithm: 'SHA-256', contentDigest: `test-digest-${version}`, integrityEvidenceId: `integrity-${version}`,
    ...(signed ? { signedBy: 'doctor', signedAt: '2026-10-04T00:01:00Z', signatureMeaning: 'AUTHOR',
      signatureEvidenceId: `signature-${version}` } : {}) }
}
export function signedFixture(note: ClinicalDocument): ClinicalDocument {
  return { ...note, status: 'SIGNED', history: note.history.map(version => version.version === note.currentVersion
    ? { ...version, signedBy: 'doctor', signedAt: '2026-10-04T00:01:00Z', signatureMeaning: 'AUTHOR',
      signatureEvidenceId: `signature-${version.version}` } : version) }
}
export function changedFixture(note: ClinicalDocument, content: ClinicalDocument['content'], reason: string,
  type = 'AMENDMENT'): ClinicalDocument {
  const currentVersion = note.currentVersion + 1
  return { ...note, status: 'AMENDMENT_IN_PROGRESS', currentVersion, content,
    history: [versionFixture(currentVersion, false, type, reason), ...note.history] }
}
