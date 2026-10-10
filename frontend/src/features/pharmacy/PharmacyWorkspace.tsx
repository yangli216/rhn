import './workspace/pharmacy-content.css'
import type { ClinicalContext } from "../../shared/clinical/workContext";
import type { RhnApi } from "../../shared/rhnApi";
import './pharmacy-dispense-workbench.css'
import '../../styles/features/pharmacy-warehouse.css'
import { type PharmacyWorkspaceMode } from './workspace/pharmacyShared'
import { usePharmacyWorkspace } from './workspace/usePharmacyWorkspace'
import { PharmacyQueryPanel } from './workspace/PharmacyQueryPanel'
import { PharmacyDispensingPanel } from './workspace/PharmacyDispensingPanel'
import { PharmacyOperationsPanel } from './workspace/PharmacyOperationsPanel'
export { parseTraceCodeBatch } from './workspace/pharmacyShared'
export { groupTraceCodesByPrefix } from './workspace/pharmacyShared'
export { usePharmacyWorkspace } from './workspace/usePharmacyWorkspace'
export { PharmacyQueryPanel } from './workspace/PharmacyQueryPanel'
export { PharmacyOperationsPanel } from './workspace/PharmacyOperationsPanel'
export { PharmacyDispensingPanel } from './workspace/PharmacyDispensingPanel'

export function PharmacyWorkspace({ api, clinicalContext, mode = 'dispensing' }: {
  api: RhnApi; clinicalContext: ClinicalContext; mode?: PharmacyWorkspaceMode
}) {
 const model = usePharmacyWorkspace({ api, clinicalContext, mode })
 return mode === 'query' ? <PharmacyQueryPanel model={model} />
   : mode === 'dispensing' ? <PharmacyDispensingPanel model={model} /> : <PharmacyOperationsPanel model={model} />
}
