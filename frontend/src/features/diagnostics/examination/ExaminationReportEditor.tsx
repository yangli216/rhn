import { FormField } from '../../../shared/ui'
export function ExaminationReportEditor({ findings, conclusion, onChange, disabled }: {
  findings: string; conclusion: string; onChange: (patch: { findings?: string; conclusion?: string }) => void; disabled: boolean
}) {
  return <section aria-label="检查报告录入" className="diagnostic-examination-document"><FormField label="检查所见" required><textarea rows={7} disabled={disabled}
    value={findings} onChange={(e) => onChange({ findings: e.target.value })} /></FormField>
    <FormField label="检查结论" required><textarea rows={4} disabled={disabled} value={conclusion}
      onChange={(e) => onChange({ conclusion: e.target.value })} /></FormField></section>
}
