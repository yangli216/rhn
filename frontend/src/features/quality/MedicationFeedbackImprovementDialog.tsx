import { useState } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import type { IntakeImprovementOrigin } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog } from '../../shared/ui'
import { MedicationRuleIntake, type IntakeSeed } from './MedicationRuleIntake'
import { MedicationKnowledgeDrafts } from './MedicationKnowledgeDrafts'

export function MedicationFeedbackImprovementDialog({ api, origin, onClose }: { api: RhnApi; origin: IntakeImprovementOrigin; onClose: () => void }) {
  const [seed, setSeed] = useState<IntakeSeed>(), [busy, setBusy] = useState(false), [leaving, setLeaving] = useState(false)
  return <Dialog title={origin.pharmacy ? "从药师审方建立知识改进需求" : "从旁路研判建立知识改进需求"} size="xwide" enterNavigation={false} onClose={() => { if (!busy) { if (seed) setLeaving(true); else onClose() } }}>
    <Alert>先分析需要核查的规则范围、标准或事实缺口。进入知识编辑时读取当前最新版本，保存后仍需重新验证、审核和发布。</Alert>
    {seed ? <MedicationKnowledgeDrafts api={api} initialIntake={seed} onBusy={setBusy} /> : <MedicationRuleIntake api={api} improvement={origin} onBusy={setBusy} onStartKnowledge={setSeed} />}
    {leaving && <Dialog title="关闭改进工作区" onClose={() => setLeaving(false)}><p>已保存的分析与知识版本会保留；尚未保存的知识编辑将丢失。可返回编辑完成保存。</p><Button onClick={() => setLeaving(false)}>返回编辑</Button><Button variant="secondary" onClick={onClose}>关闭工作区</Button></Dialog>}
  </Dialog>
}
