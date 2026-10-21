import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import type { Resident } from '../../../shared/model'
import type { ReliefRosterEntry, ReliefRosterFilter, ReliefRosterImportResult } from '../../../shared/api/reliefApi'
import { reliefStatusTone } from '../../../shared/presentation'
import { formatTime } from '../../../shared/format'
import {
  Alert, Button, DataTable, DatePicker, Dialog, DictionarySelect, EmptyState, FormField, LoadingState, Pagination,
  PatientIdentitySearch, Select, StatusBadge, tableCellClass,
} from '../../../shared/ui'
import { ListPage } from '../../../shared/ui/templates/PageTemplates'
import { useSystemEnum } from '../../../shared/ui/useSystemEnum'
import { QUALIFICATION_TYPE_DICTIONARY } from './ReliefPolicyEditor'
import { parseRosterText, ROSTER_IMPORT_LIMIT, ROSTER_TEMPLATE } from './rosterImport'
import './billing-relief.css'
import { formatDateKey } from '../../../shared/utils/dateRange'

const PAGE_SIZE = 50
type Feedback = { tone: 'success' | 'error'; text: string } | null
type DialogState = { kind: 'add' } | { kind: 'edit' | 'revoke'; entry: ReliefRosterEntry } | { kind: 'import' } | null

function today() {
  return formatDateKey(new Date(), 'Asia/Shanghai')
}

export function ReliefRosterManagement({ api, canEdit }: { api: RhnApi; canEdit: boolean }) {
  const rosterStatus = useSystemEnum(api.dictionaries, 'BIL_RELIEF_ROSTER_STATUS')
  const [draft, setDraft] = useState<ReliefRosterFilter>({ status: 'ACTIVE' })
  const [filter, setFilter] = useState<ReliefRosterFilter>({ status: 'ACTIVE' })
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const roster = useQuery({ queryKey: ['relief-roster', filter], queryFn: () => api.relief.roster(filter) })
  const rows = useMemo(() => {
    const text = keyword.trim()
    return (roster.data ?? []).filter((entry) => !text || (entry.residentName ?? '').includes(text)
      || (entry.evidenceNo ?? '').includes(text))
  }, [roster.data, keyword])
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const expiringBefore = useMemo(() => {
    const date = new Date(); date.setDate(date.getDate() + 30)
    return date.toISOString().slice(0, 10)
  }, [])
  const done = (text: string) => { setDialog(null); setFeedback({ tone: 'success', text }) }

  return <div className="relief-page">
    <ListPage title="惠民资格名单" description="维护签约居民、低保、特困等资格名单；结算时按业务日期判定是否有效。"
      actions={canEdit ? <>
        <Button variant="secondary" onClick={() => setDialog({ kind: 'import' })}>批量导入</Button>
        <Button onClick={() => setDialog({ kind: 'add' })}>新增名单</Button>
      </> : undefined}
      feedback={feedback && <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}
      resetScrollKey={`${JSON.stringify(filter)}:${keyword}:${currentPage}`}
      filters={<>
        <FormField label="姓名或依据编号" className="ui-query-filter--keyword">
          <input value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(0) }} placeholder="在结果中筛选" />
        </FormField>
        <FormField label="资格类别" className="ui-query-filter--wide">
          <DictionarySelect api={api.dictionaries} dictionaryCode={QUALIFICATION_TYPE_DICTIONARY} placeholder="全部类别"
            value={draft.qualificationType ?? ''} onChange={(value) => setDraft({ ...draft, qualificationType: value || undefined })} />
        </FormField>
        <FormField label="状态">
          <Select value={draft.status ?? ''} options={rosterStatus.options} placeholder="全部状态"
            onChange={(value) => setDraft({ ...draft, status: (value || undefined) as ReliefRosterFilter['status'] })} />
        </FormField>
        <FormField label="导入批次">
          <input value={draft.importBatch ?? ''} onChange={(event) => setDraft({ ...draft, importBatch: event.target.value.trim() || undefined })} />
        </FormField>
        <div className="ui-query-filters__actions">
          <Button onClick={() => { setFilter(draft); setPage(0) }}>查询</Button>
          <Button variant="secondary" onClick={() => {
            const reset = { status: 'ACTIVE' as const }; setDraft(reset); setFilter(reset); setKeyword(''); setPage(0)
          }}>重置</Button>
        </div>
      </>}
      footer={roster.data && <Pagination label="名单分页" page={currentPage} totalPages={totalPages} total={rows.length}
        onChange={setPage} />}>
      {roster.isPending ? <LoadingState label="正在加载名单" />
        : roster.isError ? <Alert placement="inline" duration={null}>{errorMessage(roster.error)}</Alert>
          : !rows.length ? <EmptyState icon="residents" title="没有符合条件的名单"
            copy={canEdit ? '可新增名单或通过批量导入维护。' : '调整查询条件后重试。'} />
            : <DataTable aria-label="资格名单">
              <thead><tr>
                <th>姓名</th>
                <th>资格类别</th>
                <th>有效期</th>
                <th>依据编号</th>
                <th>依据说明</th>
                <th>导入批次</th>
                <th className={tableCellClass('status')}>状态</th>
                <th>更新时间</th>
                {canEdit && <th className={tableCellClass('actions')}>操作</th>}
              </tr></thead>
              <tbody>{visible.map((entry) => {
                const expiring = entry.status === 'ACTIVE' && entry.effectiveTo && entry.effectiveTo <= expiringBefore
                return <tr key={entry.id}>
                  <td>{entry.residentName ?? entry.residentId}</td>
                  <td>{entry.qualificationTypeText ?? entry.qualificationType}</td>
                  <td>
                    {entry.effectiveFrom}{entry.effectiveTo ? ` 至 ${entry.effectiveTo}` : ' 起长期'}
                    {expiring && <> <StatusBadge tone="warning">即将到期</StatusBadge></>}
                  </td>
                  <td>{entry.evidenceNo || '—'}</td>
                  <td>{entry.evidence || '—'}</td>
                  <td>{entry.importBatch || '手工'}</td>
                  <td className={tableCellClass('status')}>
                    <StatusBadge tone={reliefStatusTone(entry.status)}>{entry.statusText ?? entry.status}</StatusBadge>
                  </td>
                  <td>{formatTime(entry.updatedAt) || '—'}</td>
                  {canEdit && <td className={tableCellClass('actions')}>
                    {entry.status === 'ACTIVE' && <span className="relief-roster-actions">
                      <Button size="sm" variant="text" onClick={() => setDialog({ kind: 'edit', entry })}>修改</Button>
                      <Button size="sm" variant="text" onClick={() => setDialog({ kind: 'revoke', entry })}>停用</Button>
                    </span>}
                  </td>}
                </tr>
              })}</tbody>
            </DataTable>}
    </ListPage>
    {dialog?.kind === 'add' && <AddRosterDialog api={api} onClose={() => setDialog(null)}
      onDone={(entry) => done(`已将 ${entry.residentName ?? ''} 加入名单`)} />}
    {dialog?.kind === 'edit' && <EditRosterDialog api={api} entry={dialog.entry} onClose={() => setDialog(null)}
      onDone={() => done('名单有效期已更新')} />}
    {dialog?.kind === 'revoke' && <RevokeRosterDialog api={api} entry={dialog.entry} onClose={() => setDialog(null)}
      onDone={() => done('名单已停用，之后的结算不再按该资格减免')} />}
    {dialog?.kind === 'import' && <ImportRosterDialog api={api} onClose={() => setDialog(null)}
      onDone={(result) => done(`批次 ${result.batchCode} 已导入 ${result.importedRows ?? 0} 条`)} />}
  </div>
}

function useRosterWrite<T, R>(write: (input: T) => Promise<R>, onDone: (value: R) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSuccess: async (value) => {
      await queryClient.invalidateQueries({ queryKey: ['relief-roster'] })
      onDone(value)
    },
  })
}

function AddRosterDialog({ api, onClose, onDone }: { api: RhnApi; onClose: () => void; onDone: (entry: ReliefRosterEntry) => void }) {
  const [resident, setResident] = useState<Resident | null>(null)
  const [qualificationType, setQualificationType] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [evidenceNo, setEvidenceNo] = useState('')
  const [evidence, setEvidence] = useState('')
  const save = useRosterWrite(() => api.relief.addRoster({ qualificationType, residentId: resident!.id, effectiveFrom,
    effectiveTo: effectiveTo || undefined, evidenceNo: evidenceNo.trim() || undefined, evidence: evidence.trim() || undefined }), onDone)
  const invalid = !resident || !qualificationType || !effectiveFrom || Boolean(effectiveTo && effectiveTo < effectiveFrom)
  return <Dialog title="新增资格名单" size="wide" onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>取消</Button>
    <Button busy={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>保存</Button>
  </>}>
    {save.isError && <Alert placement="inline" duration={null}>{errorMessage(save.error)}</Alert>}
    <PatientIdentitySearch queryKey="relief-roster" search={api.residents.search} selected={resident} compact
      onSelect={setResident} onClear={() => setResident(null)} />
    <div className="relief-dialog-fields">
      <FormField label="资格类别" required>
        <DictionarySelect api={api.dictionaries} dictionaryCode={QUALIFICATION_TYPE_DICTIONARY} value={qualificationType}
          onChange={setQualificationType} />
      </FormField>
      <FormField label="依据编号" hint="签约协议号、低保证号等">
        <input value={evidenceNo} maxLength={64} onChange={(event) => setEvidenceNo(event.target.value)} />
      </FormField>
      <FormField label="生效日期" required>
        <DatePicker value={effectiveFrom} onChange={setEffectiveFrom} />
      </FormField>
      <FormField label="失效日期" hint="不填表示长期有效" error={effectiveTo && effectiveTo < effectiveFrom ? '失效日期不能早于生效日期' : undefined}>
        <DatePicker value={effectiveTo} min={effectiveFrom} onChange={setEffectiveTo} />
      </FormField>
      <FormField label="依据说明" className="is-wide">
        <input value={evidence} maxLength={512} onChange={(event) => setEvidence(event.target.value)} />
      </FormField>
    </div>
  </Dialog>
}

function EditRosterDialog({ api, entry, onClose, onDone }: { api: RhnApi; entry: ReliefRosterEntry; onClose: () => void; onDone: () => void }) {
  const [effectiveFrom, setEffectiveFrom] = useState(entry.effectiveFrom)
  const [effectiveTo, setEffectiveTo] = useState(entry.effectiveTo ?? '')
  const [evidenceNo, setEvidenceNo] = useState(entry.evidenceNo ?? '')
  const [evidence, setEvidence] = useState(entry.evidence ?? '')
  const save = useRosterWrite(() => api.relief.updateRoster(entry.id, { expectedRevision: String(entry.revision), effectiveFrom,
    effectiveTo: effectiveTo || undefined, evidenceNo: evidenceNo.trim() || undefined, evidence: evidence.trim() || undefined }), onDone)
  const invalid = !effectiveFrom || Boolean(effectiveTo && effectiveTo < effectiveFrom)
  return <Dialog title={`修改名单：${entry.residentName ?? ''}`} description={entry.qualificationTypeText} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>取消</Button>
    <Button busy={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>保存</Button>
  </>}>
    {save.isError && <Alert placement="inline" duration={null}>{errorMessage(save.error)}</Alert>}
    <div className="relief-dialog-fields">
      <FormField label="生效日期" required><DatePicker value={effectiveFrom} onChange={setEffectiveFrom} /></FormField>
      <FormField label="失效日期" hint="不填表示长期有效"><DatePicker value={effectiveTo} min={effectiveFrom} onChange={setEffectiveTo} /></FormField>
      <FormField label="依据编号"><input value={evidenceNo} maxLength={64} onChange={(event) => setEvidenceNo(event.target.value)} /></FormField>
      <FormField label="依据说明"><input value={evidence} maxLength={512} onChange={(event) => setEvidence(event.target.value)} /></FormField>
    </div>
  </Dialog>
}

function RevokeRosterDialog({ api, entry, onClose, onDone }: { api: RhnApi; entry: ReliefRosterEntry; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const save = useRosterWrite(() => api.relief.revokeRoster(entry.id, { expectedRevision: String(entry.revision), reason: reason.trim() }), onDone)
  return <Dialog title={`停用名单：${entry.residentName ?? ''}`} description={entry.qualificationTypeText} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>取消</Button>
    <Button variant="danger" busy={save.isPending} disabled={!reason.trim()} onClick={() => save.mutate(undefined)}>确认停用</Button>
  </>}>
    {save.isError && <Alert placement="inline" duration={null}>{errorMessage(save.error)}</Alert>}
    <Alert tone="warning" placement="inline">停用后不再享受该资格的惠民减免；已完成的结算不受影响。</Alert>
    <FormField label="停用原因" required>
      <input value={reason} maxLength={256} onChange={(event) => setReason(event.target.value)} placeholder="如：签约解除、资格到期" />
    </FormField>
  </Dialog>
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob(['﻿', ROSTER_TEMPLATE], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = '惠民资格名单导入模板.csv'; link.click()
  URL.revokeObjectURL(url)
}

function ImportRosterDialog({ api, onClose, onDone }: { api: RhnApi; onClose: () => void; onDone: (result: ReliefRosterImportResult) => void }) {
  const [qualificationType, setQualificationType] = useState('')
  const [batchCode, setBatchCode] = useState(() => `ROSTER-${today().replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ReliefRosterImportResult | null>(null)
  const parsed = useMemo(() => text.trim() ? parseRosterText(text, today()) : null, [text])
  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.relief.importRoster({ batchCode: batchCode.trim(), qualificationType, dryRun, rows: parsed!.rows }),
  })
  const queryClient = useQueryClient()
  const ready = Boolean(qualificationType && batchCode.trim() && parsed && parsed.rows.length && !parsed.errors.length)
  const reset = () => { setPreview(null); run.reset() }
  // 失败原因由 run.error 展示，此处只吞掉已呈现的拒绝。
  const check = async () => {
    reset()
    try { setPreview(await run.mutateAsync(true)) } catch { /* shown via run.error */ }
  }
  const commit = async () => {
    let result: ReliefRosterImportResult
    try { result = await run.mutateAsync(false) } catch { return }
    await queryClient.invalidateQueries({ queryKey: ['relief-roster'] })
    onDone(result)
  }
  return <Dialog title="批量导入资格名单" size="xwide" onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>取消</Button>
    <Button variant="secondary" busy={run.isPending && run.variables === true} disabled={!ready || run.isPending} onClick={() => void check()}>预检</Button>
    <Button busy={run.isPending && run.variables === false}
      disabled={!ready || run.isPending || !preview || !preview.acceptedRows}
      onClick={() => void commit()}>导入 {preview?.acceptedRows ?? 0} 条有效记录</Button>
  </>}>
    <Alert tone="info" placement="inline">
      按证件号码匹配居民主索引，姓名不一致、有效期与已有名单重叠的行会被拒绝。单次最多 {ROSTER_IMPORT_LIMIT} 行，
      支持 CSV 文件（可由 Excel 另存为“CSV UTF-8”）或直接粘贴表格内容。先预检，确认结果后再导入；导入只写入通过的行。
    </Alert>
    {run.isError && <Alert placement="inline" duration={null}>{errorMessage(run.error)}</Alert>}
    <div className="relief-dialog-fields">
      <FormField label="资格类别" required>
        <DictionarySelect api={api.dictionaries} dictionaryCode={QUALIFICATION_TYPE_DICTIONARY} value={qualificationType}
          onChange={(value) => { setQualificationType(value); reset() }} />
      </FormField>
      <FormField label="导入批次号" required hint="同一批次只能正式导入一次">
        <input value={batchCode} maxLength={64} onChange={(event) => { setBatchCode(event.target.value); reset() }} />
      </FormField>
      <FormField label="名单文件" hint={fileName || '选择 CSV 文件，或在下方粘贴'}>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          setFileName(file.name); reset()
          void file.text().then(setText)
        }} />
      </FormField>
      <div className="ui-field"><Button variant="text" size="sm" onClick={downloadTemplate}>下载导入模板</Button></div>
      <FormField label="名单内容" className="is-wide" hint="首行可为表头：证件类型,证件号码,姓名,生效日期,失效日期,依据编号,依据说明">
        <textarea rows={6} value={text} onChange={(event) => { setText(event.target.value); setFileName(''); reset() }} />
      </FormField>
    </div>
    {parsed && parsed.errors.length > 0 && <Alert tone="warning" placement="inline">
      <ul className="relief-editor__errors">{parsed.errors.slice(0, 10).map((value) => <li key={value}>{value}</li>)}</ul>
    </Alert>}
    {parsed && !parsed.errors.length && !preview && <p className="relief-editor__note">已读取 {parsed.rows.length} 行，请预检。</p>}
    {preview && <>
      <div className="relief-import-summary" role="status">
        <span>共 {preview.totalRows ?? 0} 行</span>
        <StatusBadge tone="success">通过 {preview.acceptedRows ?? 0}</StatusBadge>
        <StatusBadge tone={preview.rejectedRows ? 'danger' : 'neutral'}>拒绝 {preview.rejectedRows ?? 0}</StatusBadge>
      </div>
      {(preview.rows ?? []).some((row) => row.status === 'REJECTED') && <div className="relief-import-table">
        <DataTable aria-label="预检拒绝明细">
          <thead><tr><th className={tableCellClass('numeric')}>行号</th><th>姓名</th><th>原因</th></tr></thead>
          <tbody>{(preview.rows ?? []).filter((row) => row.status === 'REJECTED').map((row) => <tr key={row.rowNo}>
            <td className={tableCellClass('numeric')}>{row.rowNo}</td>
            <td>{row.residentName || '—'}</td>
            <td>{row.message}</td>
          </tr>)}</tbody>
        </DataTable>
      </div>}
    </>}
  </Dialog>
}
