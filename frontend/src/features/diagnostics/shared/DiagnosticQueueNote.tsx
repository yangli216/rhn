import { Button } from '../../../shared/ui'

/** 队列范围说明与历史报告入口，并入查询栏同一行，避免单独占一行。 */
export function DiagnosticQueueNote({ reportPath, onNavigate }: { reportPath: string; onNavigate: (path: string) => void }) {
  return <p className="diagnostic-query__note">
    <span>队列含全部未完成任务及近7天已完成、取消记录</span>
    <Button variant="text" onClick={() => onNavigate(reportPath)}>查询历史报告</Button>
  </p>
}
