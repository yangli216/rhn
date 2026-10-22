import { useState } from 'react'
import { errorMessage } from '../rhnApi'
import { Alert, Button, FormField, StatusBadge } from '../ui'
import type { ReceiptPrintResult } from './desktopPrintDelivery'

const NOT_EXECUTED_REASONS: Record<string, string> = {
  'printer-not-found': '工作站未找到绑定的打印机，请核对打印设备配置中的打印机名称',
  'printer-unavailable': '打印机暂不可用（脱机、无权限或驱动异常）',
  'document-digest-mismatch': '文件完整性校验未通过，已拒绝打印',
  'local-digest-mismatch': '文件完整性校验未通过，已拒绝打印',
  'document-invalid': 'PDF 文件无效或页数超出工作站限制',
  'invalid-request': '打印参数无效',
  'unsupported-platform': '当前工作站系统不支持打印插件',
  'output-buffer-too-small': '工作站打印机过多，请联系实施人员',
  'control-32001': '工作站繁忙，请稍后重试',
  'control-32003': '工作站繁忙，请稍后重试',
  'control-32002': '工作站正在退出或更新，请重启客户端后重试',
  'control-32004': '工作站打印插件版本不匹配，请联系实施人员',
  'control-32010': '工作站打印插件正在维护，请稍后重试',
}

const UNCERTAIN_REASONS: Record<string, string> = {
  'job-aborted': '打印作业在提交过程中中止',
  'internal-error': '打印插件内部异常',
  'host-error': '打印插件宿主异常或超时',
  indeterminate: '工作站在执行过程中中断',
  'completed-without-result': '工作站在执行过程中中断',
  'pending-timeout': '等待工作站结果超时',
}

/** 工作站打印结果与人工核对。浏览器打印和本地打印桥沿用各页面原有提示，这里不重复展示。 */
export function ReceiptPrintStatus({ result, reconciling, onReconcile }: {
  result: ReceiptPrintResult | null
  reconciling: boolean
  onReconcile: (printed: boolean, note?: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  if (result?.kind === 'browser-fallback') {
    return <Alert placement="inline" tone="info">当前不在 RHN Link 工作站中，已改用浏览器打印预览。</Alert>
  }
  if (result?.kind !== 'desktop') return null
  const { delivery, settlement, printerName } = result
  const submit = (printed: boolean) => {
    setError('')
    onReconcile(printed, printed ? undefined : note.trim()).catch((value: unknown) => setError(errorMessage(value)))
  }

  if (delivery.status === 'DEVICE_CONFIRMED') {
    return <Alert placement="inline" tone="success">已确认 {printerName} 出纸。</Alert>
  }
  if (delivery.status === 'FAILED') {
    const reason = settlement.kind === 'not-executed'
      ? NOT_EXECUTED_REASONS[settlement.code] ?? '工作站未执行打印' : '已核对为未出纸'
    return <Alert placement="inline" tone="warning">{reason}。修正后可再次点击打印。</Alert>
  }
  const uncertain = delivery.status === 'UNCERTAIN'
  return <section className="receipt-print-status" aria-label="工作站打印结果">
    {error && <Alert>{error}</Alert>}
    {uncertain
      ? <Alert placement="inline" tone="warning" duration={null}>
        打印结果不确定（{settlement.kind === 'uncertain' ? UNCERTAIN_REASONS[settlement.code] ?? '工作站未返回明确结果' : '工作站未返回明确结果'}），
        可能已进入 {printerName} 的打印队列。请先到打印机和系统打印队列核对，确认后再决定是否重新打印。
      </Alert>
      : <p><StatusBadge tone="success">已提交</StatusBadge>
        已进入 {printerName} 的系统打印队列{delivery.systemJobNo ? `（作业号 ${delivery.systemJobNo}）` : ''}，提交不代表已经出纸。</p>}
    <FormField label="未出纸说明" hint="判定未出纸时必填，例如“打印队列无该作业”“卡纸已取消”">
      <textarea rows={2} maxLength={500} value={note} disabled={reconciling} onChange={(event) => setNote(event.target.value)} />
    </FormField>
    <div className="receipt-print-status__actions">
      <Button size="sm" variant="secondary" busy={reconciling} onClick={() => submit(true)}>确认已出纸</Button>
      <Button size="sm" variant="text" disabled={reconciling || !note.trim()} onClick={() => submit(false)}>
        判定未出纸
      </Button>
    </div>
  </section>
}
