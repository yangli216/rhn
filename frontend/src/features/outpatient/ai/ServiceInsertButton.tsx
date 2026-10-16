import { IconButton } from '../../../shared/ui'
import type { MedicalInsertTarget } from './MedicalInsertViewerModal'
import { serviceInsertLabel, serviceInsertTarget } from './medicalInsertTargets'

/** Opens the clinical-knowledge insert for a laboratory or examination item; renders nothing for other items. */
export function ServiceInsertButton({ name, serviceType, onView }: {
  name?: string | null
  serviceType?: string | null
  onView?: (target: MedicalInsertTarget) => void
}) {
  const target = serviceInsertTarget(name, serviceType)
  if (!onView || !target) return null
  return <IconButton icon="file-text" label="说明书"
    title={`在临床知识库中查阅《${target.name}》${serviceInsertLabel[target.type as 'laboratory' | 'examination']}项目说明`}
    onClick={(event) => {
      event.stopPropagation()
      onView(target)
    }} />
}
