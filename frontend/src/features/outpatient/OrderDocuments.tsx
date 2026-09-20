import { useEffect, useRef, useState } from 'react'
import type { Encounter } from '../../shared/model'
import type { OrderDocumentInfo, Prescription, ServiceRequest } from '../../shared/api/encountersApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, Select } from '../../shared/ui'

export interface OrderDocument {
  key: string
  kind: 'prescription' | 'service'
  label: string
  shortLabel: string
  value: Prescription | ServiceRequest
  items: Array<{ id: string; name: string }>
}

export function orderDocuments(prescriptions: Prescription[], services: ServiceRequest[]): OrderDocument[] {
  const sort = <T extends { authoredAt: string; id: string }>(items: T[]) => [...items].sort((a, b) =>
    a.authoredAt.localeCompare(b.authoredAt) || String(a.id).localeCompare(String(b.id)))
  const rx = sort(prescriptions).map((value, index): OrderDocument => ({
    key: `prescription:${value.id}`, kind: 'prescription', value, shortLabel: `方${index + 1}`,
    label: `${value.categoryCode === 'HERBAL' ? '草药' : value.categoryCode === 'CHINESE_PATENT' ? '中成药' : '西药'}处方${index + 1}`,
    items: value.medicationRequests.filter(item => item.status !== 'CANCELLED').map(item => ({ id: item.id, name: item.itemName || item.medicationName })),
  }))
  const counters: Record<string, number> = {}
  const svc = sort(services).filter(value => ['LABORATORY', 'EXAMINATION'].includes(value.serviceType)).map((value): OrderDocument => {
    const type = value.serviceType === 'LABORATORY' ? '检验' : '检查'
    const index = counters[type] = (counters[type] || 0) + 1
    return { key: `service:${value.id}`, kind: 'service', value, label: `${type}单${index}`, shortLabel: `${type}${index}`,
      items: [{ id: value.id, name: value.itemName }] }
  })
  return [...rx, ...svc].filter(doc => doc.value.status !== 'CANCELLED' && doc.items.length > 0)
}

export function documentMissing(doc: OrderDocument): string[] {
  if (doc.kind === 'prescription' && doc.value.status !== 'DRAFT') return []
  if (doc.kind === 'service' && (doc.value as ServiceRequest).documentInfoEditable === false) return []
  const info = doc.value.documentInfo
  return [!info?.diagnoses.length ? '关联诊断' : '',
    doc.kind === 'service' && !info?.examinationPurpose?.trim() ? '检查目的' : ''].filter(Boolean)
}

export function OrderDocumentSummary({ documents, selectedKey, onSelect }: {
  documents: OrderDocument[]; selectedKey: string | null; onSelect: (key: string) => void
}) {
  if (!documents.length) return null
  const missing = documents.filter(doc => documentMissing(doc).length > 0).length
  return <nav className="doctor-document-summary" aria-label="本次就诊单据">
    <strong>单据</strong>
    <div className="doctor-document-chips">{documents.map(doc => <button type="button" key={doc.key}
      className={`doctor-document-chip${selectedKey === doc.key ? ' is-selected' : ''}`}
      onClick={() => onSelect(doc.key)} aria-pressed={selectedKey === doc.key}
      title={`${doc.label}：${doc.items.map(item => item.name).join('、')}`}>
      {doc.label} <small>{doc.items.length}项</small>
      {doc.value.documentInfo?.externalPrescription && <em>外配</em>}
      {doc.value.documentInfo?.specialDisease && <em>特病</em>}
      {documentMissing(doc).length > 0 && <span className="doctor-document-missing" aria-label="待完善">·</span>}
    </button>)}</div>
    <Button size="sm" variant="text" onClick={() => onSelect((documents.find(doc => documentMissing(doc).length) || documents[0]).key)}>
      {missing ? `${missing}张待完善` : '单据管理'}
    </Button>
  </nav>
}

const emptyInfo = (): OrderDocumentInfo => ({ diagnoses: [], externalPrescription: false, specialDisease: '', examinationPurpose: '' })

export function OrderDocumentInlineEditor({ document: doc, encounter, api, readOnly, onSaved, onClose, onDirtyChange }: {
  document: OrderDocument; encounter: Encounter; api: RhnApi; readOnly: boolean
  onSaved: () => Promise<unknown>; onClose: () => void; onDirtyChange?: (dirty: boolean) => void
}) {
  const [info, setInfo] = useState<OrderDocumentInfo>(() => ({ ...emptyInfo(), ...doc.value.documentInfo }))
  const [baseline, setBaseline] = useState(() => JSON.stringify({ ...emptyInfo(), ...doc.value.documentInfo }))
  const [revision, setRevision] = useState(doc.value.revision)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(info) !== baseline
  const editable = !readOnly && (doc.kind === 'prescription'
    ? doc.value.status === 'DRAFT'
    : doc.value.status === 'ACTIVE' && (doc.value as ServiceRequest).documentInfoEditable !== false)

  useEffect(() => {
    onDirtyChange?.(dirty || saving)
    return () => onDirtyChange?.(false)
  }, [dirty, saving, onDirtyChange])

  const change = (next: Partial<OrderDocumentInfo>) => {
    setInfo(current => ({ ...current, ...next }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const result = doc.kind === 'prescription'
        ? await api.encounters.updatePrescriptionDocumentInfo(encounter.id, doc.value.id, revision, info)
        : await api.encounters.updateServiceDocumentInfo(encounter.id, doc.value.id, revision, info)
      const persisted = { ...emptyInfo(), ...result.documentInfo }
      setInfo(persisted)
      setBaseline(JSON.stringify(persisted))
      setRevision(result.revision)
      setSaved(true)
      await onSaved()
      onClose()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const diagnoses = [...new Map([...encounter.diagnoses, ...info.diagnoses].map(value => [value.code, value])).values()]

  return <div className="doctor-order-inline-strip" role="region" aria-label={`编辑${doc.label}单据属性`}>
    <div className="doctor-order-inline-strip-body">
      <div className="doctor-order-inline-col">
        <div className="doctor-order-inline-label">
          <strong>关联诊断</strong>
          {encounter.diagnoses.length > 0 && info.diagnoses.length === 0 && (
            <Button size="sm" variant="text" onClick={() => {
              const primary = encounter.diagnoses.find(item => item.type === 'PRIMARY') || encounter.diagnoses[0]
              change({ diagnoses: [{ code: primary.code, display: primary.display, primary: true }] })
            }}>带入本次主要诊断</Button>
          )}
        </div>
        {diagnoses.length === 0 ? (
          <p className="doctor-order-inline-hint">请先在病历中保存本次就诊诊断</p>
        ) : (
          <div className="doctor-order-inline-diagnoses">
            {diagnoses.map(diagnosis => {
              const link = info.diagnoses.find(item => item.code === diagnosis.code)
              const stale = !encounter.diagnoses.some(item => item.code === diagnosis.code)
              return <div className="doctor-document-diagnosis" key={diagnosis.code}>
                <label>
                  <input
                    type="checkbox"
                    disabled={!editable || saving}
                    checked={Boolean(link)}
                    onChange={event => {
                      const next = event.target.checked
                        ? [...info.diagnoses, { code: diagnosis.code, display: diagnosis.display, primary: info.diagnoses.length === 0 }]
                        : info.diagnoses.filter(item => item.code !== diagnosis.code)
                      if (next.length && !next.some(item => item.primary)) next[0] = { ...next[0], primary: true }
                      change({ diagnoses: next })
                    }}
                  />
                  <span>{diagnosis.display}</span>
                  {stale && <small className="doctor-document-stale">（已不在诊断中）</small>}
                </label>
                {link && (
                  <label className="doctor-document-primary">
                    <input
                      type="radio"
                      name={`inline-primary-${doc.key}`}
                      disabled={!editable || saving}
                      checked={link.primary}
                      onChange={() => change({ diagnoses: info.diagnoses.map(item => ({ ...item, primary: item.code === diagnosis.code })) })}
                    />主要
                  </label>
                )}
              </div>
            })}
          </div>
        )}
      </div>

      <div className="doctor-order-inline-col">
        <span className="doctor-order-inline-label"><strong>整单属性</strong></span>
        {doc.kind === 'prescription' && (
          <div className="doctor-order-inline-form-row">
            <label className="doctor-document-check">
              <input
                type="checkbox"
                disabled={!editable || saving}
                checked={info.externalPrescription}
                onChange={event => change({ externalPrescription: event.target.checked })}
              />
              外配处方标记（本方全部药品）
            </label>
            <label className="doctor-order-inline-field">
              <span>门诊特病病种</span>
              <input
                type="text"
                disabled={!editable || saving}
                value={info.specialDisease || ''}
                maxLength={120}
                placeholder="填写已确认的特病病种，无则留空"
                onChange={event => change({ specialDisease: event.target.value })}
              />
            </label>
          </div>
        )}

        {doc.kind === 'service' && (
          <div className="doctor-order-inline-form-row">
            <label className="doctor-order-inline-field">
              <span>检查目的</span>
              <input
                type="text"
                disabled={!editable || saving}
                value={info.examinationPurpose || ''}
                maxLength={500}
                placeholder="说明需要明确或排除的临床问题"
                onChange={event => change({ examinationPurpose: event.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    </div>

    {error && <Alert>{error}</Alert>}
    {saved && <p role="status">单据信息已保存</p>}

    <div className="doctor-order-inline-strip-footer">
      <small className="doctor-order-inline-hint">{dirty ? '有未保存修改' : '修改作用于本单全部项目'}</small>
      <div className="doctor-order-inline-actions">
        <Button size="sm" variant="secondary" disabled={saving} onClick={onClose}>收起</Button>
        <Button size="sm" disabled={!editable || !dirty} busy={saving} onClick={() => void save()}>保存单据属性</Button>
      </div>
    </div>
  </div>
}

export function OrderDocumentEditor({ document: doc, documents, encounter, api, readOnly, onSaved, onClose, onSelect, onDirtyChange, navigationRef }: {
  document: OrderDocument; documents: OrderDocument[]; encounter: Encounter; api: RhnApi; readOnly: boolean
  navigationRef: React.MutableRefObject<((key: string | null) => void) | null>
  onSaved: () => Promise<unknown>; onClose: () => void; onSelect: (key: string) => void; onDirtyChange: (dirty: boolean) => void
}) {
  const [info, setInfo] = useState<OrderDocumentInfo>(() => ({ ...emptyInfo(), ...doc.value.documentInfo }))
  const [baseline, setBaseline] = useState(() => JSON.stringify({ ...emptyInfo(), ...doc.value.documentInfo }))
  const [revision, setRevision] = useState(doc.value.revision)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState<string | null | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)
  const dirty = JSON.stringify(info) !== baseline
  const editable = !readOnly && (doc.kind === 'prescription' ? doc.value.status === 'DRAFT' : doc.value.status === 'ACTIVE' && (doc.value as ServiceRequest).documentInfoEditable !== false)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => { onDirtyChange(dirty || saving); return () => onDirtyChange(false) }, [dirty, saving, onDirtyChange])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const change = (next: Partial<OrderDocumentInfo>) => { setInfo(current => ({ ...current, ...next })); setSaved(false) }
  const navigate = (key: string | null) => {
    if (saving) return
    if (dirty) { setPending(key); return }
    if (key === null) onClose(); else onSelect(key)
  }
  useEffect(() => { navigationRef.current = navigate; return () => { navigationRef.current = null } })
  const proceed = (key: string | null) => { setPending(undefined); if (key === null) onClose(); else onSelect(key) }
  const save = async (next?: string | null) => {
    setSaving(true); setError('')
    try {
      const result = doc.kind === 'prescription'
        ? await api.encounters.updatePrescriptionDocumentInfo(encounter.id, doc.value.id, revision, info)
        : await api.encounters.updateServiceDocumentInfo(encounter.id, doc.value.id, revision, info)
      const persisted = { ...emptyInfo(), ...result.documentInfo }
      setInfo(persisted); setBaseline(JSON.stringify(persisted)); setRevision(result.revision); setSaved(true)
      await onSaved()
      if (next !== undefined) proceed(next)
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }
  const diagnoses = [...new Map([...encounter.diagnoses, ...info.diagnoses].map(value => [value.code, value])).values()]
  return <aside className="doctor-document-editor" aria-label="单据信息" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (pending === undefined) navigate(null) }
  }}>
    <header><div><h3 tabIndex={-1} ref={heading}>{doc.label}</h3>
      <small>{'prescriptionNo' in doc.value ? doc.value.prescriptionNo : doc.value.requestNo} · 共{doc.items.length}项</small></div>
      <Button size="sm" variant="text" disabled={saving} onClick={() => navigate(null)}>关闭</Button></header>
    <div className="doctor-document-body">
      <label>切换单据<Select value={doc.key} disabled={saving} clearable={false}
        options={documents.map(item => ({ value: item.key, label: item.label }))} onChange={navigate} /></label>
      <div className="doctor-document-members" aria-label="本单包含的医嘱">{doc.items.map(item =>
        <button type="button" key={item.id} onClick={() => document.getElementById(`order-${item.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>{item.name}</button>)}</div>
      {!editable && <Alert tone="warning">本单已提交、开始执行或当前就诊状态不允许直接修改，请按更正流程处理。</Alert>}
      {doc.kind === 'service' && editable && <p className="doctor-document-hint">已采集或开始执行的申请单不能直接修改。</p>}
      <fieldset disabled={!editable || saving}>
        <legend>关联诊断</legend>
        {diagnoses.length === 0 && <p>请先在病历中保存本次就诊诊断。</p>}
        {diagnoses.map(diagnosis => {
          const link = info.diagnoses.find(item => item.code === diagnosis.code)
          const stale = !encounter.diagnoses.some(item => item.code === diagnosis.code)
          return <div className="doctor-document-diagnosis" key={diagnosis.code}>
            <label><input type="checkbox" checked={Boolean(link)} onChange={event => {
              const next = event.target.checked
                ? [...info.diagnoses, { code: diagnosis.code, display: diagnosis.display, primary: info.diagnoses.length === 0 }]
                : info.diagnoses.filter(item => item.code !== diagnosis.code)
              if (next.length && !next.some(item => item.primary)) next[0] = { ...next[0], primary: true }
              change({ diagnoses: next })
            }} />{diagnosis.display}{stale ? '（已不在本次诊断中，请重新选择）' : ''}</label>
            {link && <label className="doctor-document-primary"><input type="radio" name="document-primary-diagnosis"
              checked={link.primary} onChange={() => change({ diagnoses: info.diagnoses.map(item => ({ ...item, primary: item.code === diagnosis.code })) })} />主要</label>}
          </div>
        })}
        {encounter.diagnoses.length > 0 && info.diagnoses.length === 0 && <Button size="sm" variant="text" onClick={() => {
          const primary = encounter.diagnoses.find(item => item.type === 'PRIMARY') || encounter.diagnoses[0]
          change({ diagnoses: [{ code: primary.code, display: primary.display, primary: true }] })
        }}>带入本次主要诊断</Button>}
      </fieldset>
      <fieldset disabled={!editable || saving}>
        <legend>整单属性</legend>
        {doc.kind === 'prescription' && <label className="doctor-document-check"><input type="checkbox"
          checked={info.externalPrescription} onChange={event => change({ externalPrescription: event.target.checked })} />外配处方标记（本方全部药品）</label>}
        <label>门诊特病病种<input value={info.specialDisease || ''} maxLength={120}
          placeholder="填写已确认的特病病种，无则留空" onChange={event => change({ specialDisease: event.target.value })} /></label>
        <p className="doctor-document-hint">外配和特病为单据标记；收费、药房发药和医保待遇仍按现有流程办理。</p>
        {doc.kind === 'service' && <label>检查目的<textarea rows={4} value={info.examinationPurpose || ''} maxLength={2000}
          placeholder="说明需要明确或排除的问题，与项目部位、标本及临床说明分开记录"
          onChange={event => change({ examinationPurpose: event.target.value })} /></label>}
      </fieldset>
      {error && <Alert>{error}</Alert>}
      {saved && <p role="status">单据信息已保存</p>}
    </div>
    <footer><small>{dirty ? '有未保存修改' : '修改作用于本单全部项目'}</small>
      <Button size="sm" disabled={!editable || !dirty} busy={saving} onClick={() => void save()}>保存单据信息</Button></footer>
    {pending !== undefined && <Dialog title="单据信息尚未保存" onClose={() => setPending(undefined)}
      footer={<><Button variant="secondary" disabled={saving} onClick={() => setPending(undefined)}>继续编辑</Button>
        <Button variant="text" disabled={saving} onClick={() => proceed(pending)}>放弃修改</Button>
        <Button busy={saving} onClick={() => void save(pending)}>保存并继续</Button></>}>
      当前单据的修改尚未保存，请选择如何处理。</Dialog>}
  </aside>
}
