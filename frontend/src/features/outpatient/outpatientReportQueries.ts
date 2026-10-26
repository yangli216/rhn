import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import { requireDiagnosticReports } from '../../shared/clinical/diagnosticResults'
import { recentReportEncounters } from './ai/receptionSceneAssessment'

/** The scene hint and report drawer must use the same encounters and validated cache entries. */
export function outpatientReportQueries(api: RhnApi, encounter: Encounter, history: Encounter[]) {
  return [encounter, ...recentReportEncounters(encounter, history)].map((source) => ({
    source,
    queryKey: ['doctor-reports', source.id, source.residentId],
    queryFn: async () => requireDiagnosticReports(await api.diagnostics.reportsByEncounter(source.id), {
      encounterId: source.id, residentId: source.residentId,
    }),
    staleTime: 60_000,
  }))
}
