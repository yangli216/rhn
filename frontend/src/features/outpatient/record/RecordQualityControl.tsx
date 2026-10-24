import { useState } from 'react'
import { IconChecklist, IconX } from '@tabler/icons-react'
import { AnchoredPanel, Button, IconActionButton } from '../../../shared/ui'
import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { useRecordQualityDecision } from './useRecordQualityDecision'
import { RecordQualityReview } from './RecordQualityReview'

export function RecordQualityControl({ decision, disabled, document, onLocate }: {
  decision: ReturnType<typeof useRecordQualityDecision>; disabled: boolean; document?: ClinicalDocument
  onLocate: (field: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const hasResult = Boolean(decision.assessment || decision.error || decision.retryPending)
  const count = (decision.assessment?.findings ?? []).filter(finding =>
    !['DISMISSED', 'MODIFIED', 'UNCHANGED'].includes(decision.latest.get(finding.code)?.action ?? '')).length
  const canAssess = !disabled && decision.hasContent && !decision.pendingAdoption && !decision.retryPending
  const close = () => { setOpen(false); anchor?.focus() }
  return <>
    <IconActionButton label="核查当前病历" icon={<IconChecklist />} count={count} busy={decision.busy}
      aria-haspopup="dialog" aria-expanded={open} aria-description={count ? `${count} 项待处理` : undefined}
      disabled={disabled || (!hasResult && !canAssess)}
      title={hasResult ? `查看病历核查结果，${count} 项待处理` : !decision.hasContent ? '请先书写病历后再核查' : '核查病历完整性与文字矛盾'}
      onClick={event => {
        setAnchor(event.currentTarget)
        if (hasResult) setOpen(value => !value)
        else if (canAssess) void decision.assess()
      }} />
    {open && <AnchoredPanel label="病历核查结果" anchorRect={anchor?.getBoundingClientRect() ?? null}
      anchorElement={anchor} onClose={close} className="record-quality-popover">
      <header className="record-quality-popover__header">
        <strong>病历核查结果</strong>
        <Button size="sm" variant="text" disabled={!canAssess || decision.busy}
          onClick={() => { setOpen(false); void decision.assess() }}>重新核查</Button>
        <IconActionButton label="关闭病历核查结果" icon={<IconX />} onClick={close} />
      </header>
      <div className="record-quality-popover__body">
        <RecordQualityReview decision={decision} disabled={disabled} document={document}
          onLocate={field => { setOpen(false); onLocate(field) }} />
      </div>
    </AnchoredPanel>}
  </>
}
