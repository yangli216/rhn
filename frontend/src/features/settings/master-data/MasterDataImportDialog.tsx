import { DataTable as UiDataTable } from '../../../shared/ui'
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage, type RhnApi, type MasterDataImportBatch, type MasterDataImportRow, type MasterDataImportType } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, FormField, StatusBadge } from "../../../shared/ui";

export function MasterDataImportDialog({ api, importType, onClose, onCompleted }: {
  api: RhnApi; importType: MasterDataImportType; onClose: () => void; onCompleted: () => Promise<void>
}) {
  const [file, setFile] = useState<File>()
  const [batch, setBatch] = useState<MasterDataImportBatch>()
  const [editingRow, setEditingRow] = useState<MasterDataImportRow>()
  const [busyAction, setBusyAction] = useState('')
  const [operationError, setOperationError] = useState('')
  const recent = useQuery({ queryKey: ['master-data-import-batches'], queryFn: api.masterData.importBatches })
  const execute = async (action: string, task: () => Promise<MasterDataImportBatch>) => {
    setBusyAction(action); setOperationError('')
    try { const value = await task(); setBatch(value); await recent.refetch(); return value }
    catch (error) { setOperationError(errorMessage(error)); return undefined }
    finally { setBusyAction('') }
  }
  const download = async (name: string, task: () => Promise<Blob>) => {
    setBusyAction(name); setOperationError('')
    try { downloadBlob(await task(), name) } catch (error) { setOperationError(errorMessage(error)) }
    finally { setBusyAction('') }
  }
  const label = importType === 'SERVICE' ? '诊疗项目' : '药品知识'
  const mutable = batch && !['COMPLETED', 'CANCELLED', 'IMPORTING'].includes(batch.status)
  return <Dialog title={`${label}批量导入`} eyebrow="基础数据 · 可恢复导入批次" size="xwide" onClose={onClose}
    description="先预检、再提交；错误行可在当前批次修正，已成功行不会因后续重试重复写入。">
    <div className="master-data-import-dialog">
      <section className="master-data-import-start">
        <div><strong>1. 下载标准模板</strong><small>支持 XLSX 与 UTF-8 CSV，单批最多 2,000 行、5 MB。</small></div>
        <div className="master-data-import-actions">
          <Button variant="text" busy={busyAction === `${label}导入模板.xlsx`} onClick={() => download(
            `${label}导入模板.xlsx`, () => api.masterData.downloadImportTemplate(importType, 'XLSX'))}>下载 XLSX 模板</Button>
          <Button variant="text" busy={busyAction === `${label}导入模板.csv`} onClick={() => download(
            `${label}导入模板.csv`, () => api.masterData.downloadImportTemplate(importType, 'CSV'))}>下载 CSV 模板</Button>
        </div>
        <div><strong>2. 选择文件并预检</strong><small>预检不会写入正式基础数据，可安全重复查看和修正。</small></div>
        <div className="master-data-import-file">
          <input type="file" accept=".xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0])} />
          <Button disabled={!file} busy={busyAction === 'preflight'} onClick={() => file && execute('preflight',
            () => api.masterData.preflightImport(importType, file))}>开始预检</Button>
        </div>
      </section>
      {operationError && <Alert>{operationError}</Alert>}
      {batch && <>
        <div className="master-data-import-summary">
          <div><span>批次状态</span><ImportStatus value={batch.status} /></div>
          <div><span>总行数</span><strong>{batch.totalRows}</strong></div>
          <div><span>可导入</span><strong>{batch.readyRows}</strong></div>
          <div><span>错误</span><strong className={batch.invalidRows || batch.failedRows ? 'is-error' : ''}>{batch.invalidRows + batch.failedRows}</strong></div>
          <div><span>已导入</span><strong>{batch.importedRows}</strong></div>
        </div>
        <div className="master-data-import-batch-meta"><span>{batch.fileName}</span><code>批次 {batch.id}</code>
          <span>更新时间 {new Date(batch.updatedAt).toLocaleString()}</span></div>
        <div className="master-data-import-table-wrap"><UiDataTable className="master-data-import-table"><thead><tr>
          <th>行</th><th>编码 / 名称</th><th>预检结果</th><th>错误明细</th><th>目标记录</th><th>操作</th>
        </tr></thead><tbody>{batch.rows.map((row) => <tr key={`${row.id}-${row.revision}`}>
          <td>{row.rowNumber}</td><td><strong>{String(row.source['名称'] || row.normalized.name || '—')}</strong>
            <code>{row.sourceKey || '未识别编码'}</code></td><td><ImportStatus value={row.status} /></td>
          <td>{row.errors.length ? <ul>{row.errors.map((error, index) => <li key={`${error.code}-${index}`}>
            <code>{error.field}</code>{error.message}</li>)}</ul> : <span className="master-data-import-ok">校验通过</span>}</td>
          <td>{row.targetId ? <code>{row.targetId}</code> : '—'}</td><td>{mutable && row.status !== 'IMPORTED'
            ? <Button size="sm" variant="text" onClick={() => setEditingRow(row)}>修正</Button> : '—'}</td>
        </tr>)}</tbody></UiDataTable></div>
        <div className="ui-form-actions master-data-import-footer">
          {(batch.invalidRows > 0 || batch.failedRows > 0) && <Button variant="text" onClick={() => download(
            `基础数据导入错误-${batch.id}.csv`, () => api.masterData.downloadImportErrors(batch.id))}>下载错误回执</Button>}
          {mutable && <Button variant="secondary" busy={busyAction === 'cancel'} onClick={() => execute('cancel',
            () => api.masterData.cancelImport(batch.id))}>取消批次</Button>}
          <Button disabled={!mutable || batch.invalidRows > 0 || batch.readyRows === 0} busy={busyAction === 'commit'}
            onClick={async () => { const value = await execute('commit', () => api.masterData.commitImport(batch.id));
              if (value?.status === 'COMPLETED') await onCompleted() }}>提交导入</Button>
        </div>
      </>}
      {!batch && recent.data?.length ? <section className="master-data-import-recent"><h3>最近导入批次</h3>
        <div>{recent.data.filter((item) => item.importType === importType).slice(0, 5).map((item) => <Button key={item.id}
          type="button" onClick={() => execute('open', () => api.masterData.importBatch(item.id))} variant="text" size="sm">
          <span><strong>{item.fileName}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
          <span><ImportStatus value={item.status} /><small>{item.importedRows}/{item.totalRows} 已导入</small></span>
        </Button>)}</div></section> : null}
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </div>
    {editingRow && batch && <ImportRowCorrectionDialog row={editingRow} onClose={() => setEditingRow(undefined)}
      onSave={async (values) => { const value = await execute('correct', () => api.masterData.correctImportRow(
        batch.id, editingRow, values)); if (value) setEditingRow(undefined) }} busy={busyAction === 'correct'} />}
  </Dialog>
}

export function ImportRowCorrectionDialog({ row, onClose, onSave, busy }: { row: MasterDataImportRow; onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>; busy: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(row.source).map(([key, value]) => [key, String(value ?? '')])))
  return <Dialog title={`修正第 ${row.rowNumber} 行`} eyebrow="导入预检 · 行级修正" size="wide" onClose={onClose}
    description="保存后会重新执行格式、字典、领域规则、租户存量及文件内重复校验。">
    <form onSubmit={(event) => { event.preventDefault(); void onSave(values) }}>
      <div className="master-data-import-correction">{Object.entries(values).map(([key, value]) => <FormField key={key} label={key}>
        <input value={value} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
      </FormField>)}</div>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>取消</Button>
        <Button type="submit" busy={busy}>保存并重新预检</Button></div>
    </form>
  </Dialog>
}

export function ImportStatus({ value }: { value: string }) {
  const labels: Record<string, string> = { PREFLIGHTING: '预检中', READY: '可提交', INVALID: '有错误',
    IMPORTING: '导入中', PARTIAL: '部分完成', COMPLETED: '已完成', CANCELLED: '已取消',
    IMPORTED: '已导入', FAILED: '失败' }
  const tone = ['READY', 'COMPLETED', 'IMPORTED'].includes(value) ? 'success'
    : ['INVALID', 'FAILED'].includes(value) ? 'danger' : 'neutral'
  return <StatusBadge tone={tone}>{labels[value] || value}</StatusBadge>
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
