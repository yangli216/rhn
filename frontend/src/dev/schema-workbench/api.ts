import type { OntologyGraphDto } from '../../shared/api/semanticOntologyApi'

export type Column = { physical: string; logical: string; type?: string; size?: number; scale?: number | null; nullable?: boolean; defaultValue?: string | null; comment: string; catalogComment?: string }
export type Relation = { id: string; sourceTable: string; sourceColumns: string[]; targetTable: string; targetColumns: string[];
  kind: 'foreign-key' | 'logical' | 'candidate'; reviewState: 'database' | 'draft' | 'reviewed'; cardinality: string; evidence: string; description: string; deleteRule?: string }
export type Annotation = { revision: number; owner: string; purpose: string; grain: string; lifecycle: string; writeEntry: string; notes: string;
  reviewState: 'draft' | 'reviewed'; reviewer: string; reviewedAt: string | null; relations: Relation[]; fieldNotes: { column: string; meaning: string; dictionary: string }[] }
export type Table = { physical: string; logical: string; legacy: string; domain: string; comment: string; catalogComment: string; structureAvailable: boolean;
  columns: Column[]; primaryKey: string[]; uniqueKeys: { name: string; columns: string[] }[];
  indexes: { name: string; unique: boolean; columns: { name: string; direction: string | null }[] }[];
  checks: { name: string; expression: string }[]; annotation: Annotation; codeReferences: { path: string; line: number }[] }
export type Job = { status: 'idle' | 'running' | 'complete' | 'failed'; message: string; startedAt: string | null; finishedAt: string | null }
export type Snapshot = { capturedAt: string; database: string; profile: string; inputFingerprint: string; tableCount: number; relationCount: number;
  migrations: { version: string; script: string; success: boolean }[] }
export type Change = { table: string; subject: string; kind: 'added' | 'removed' | 'changed'; before: string; after: string }
export type Issue = { table: string; rule: string; message: string; severity: 'info' | 'warning' | 'error' }
export type DocumentInfo = { id: string; title: string; path: string; scope: string; content?: string }
export type Proposal = { id: string; entity: string; table: string; prompt: string; rationale: string; suggestedYamlDiff: string;
  status: 'draft' | 'reviewed' | 'rejected'; reviewer: string; reviewNote: string; revision: number; source: string; createdAt: string }
export type Catalog = { tables: Table[]; relations: Relation[]; semantic: OntologyGraphDto;
  domains: { code: string; name: string; count: number }[]; expected: Snapshot | null; oracle: Snapshot | null; previousOracle: Snapshot | null;
  fingerprint: string; stale: boolean; drift: Change[]; changes: Change[]; issues: Issue[]; documents: DocumentInfo[]; proposals: Proposal[]; job: Job }

export class WorkbenchError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function request<T>(route: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/__dev/schema/${route}`, { method, headers: { 'X-RHN-Dev-Workbench': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new WorkbenchError(data.message || '工作台请求失败', response.status)
  return data as T
}
export function typeLabel(column: Column) {
  if (!column.type) return '未采集'
  if (/CHAR|VARCHAR|NUMBER|NUMERIC|DECIMAL/.test(column.type) && !/LARGE/.test(column.type)) return `${column.type}(${column.size}${column.scale == null ? '' : `,${column.scale}`})`
  return column.type
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试'
export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
