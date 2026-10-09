import type { ReactNode } from 'react'
import { Dialog } from '../../../shared/ui'

export function ClinicalKnowledgePanel({ title, label = '临床知识库', onClose, children, footer }: {
  title: string
  label?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return <Dialog title={title} eyebrow={label} onClose={onClose} presentation="panel"
    className="clinical-knowledge-panel" enterNavigation={false} footer={footer}>
    <div className="clinical-knowledge-panel__body">{children}</div>
  </Dialog>
}
