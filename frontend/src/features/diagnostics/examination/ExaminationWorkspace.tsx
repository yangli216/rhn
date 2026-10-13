import { DiagnosticWorkbench, type DiagnosticWorkbenchProps } from '../shared/DiagnosticWorkbench'
export function ExaminationWorkspace(props: DiagnosticWorkbenchProps) {
  return <DiagnosticWorkbench {...props} requestType="EXAMINATION" />
}
