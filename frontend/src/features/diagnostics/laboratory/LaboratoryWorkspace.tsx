import { DiagnosticWorkbench, type DiagnosticWorkbenchProps } from '../shared/DiagnosticWorkbench'
export function LaboratoryWorkspace(props: DiagnosticWorkbenchProps) {
  return <DiagnosticWorkbench {...props} requestType="LABORATORY" />
}
