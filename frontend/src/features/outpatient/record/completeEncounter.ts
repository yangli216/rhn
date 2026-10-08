import type { CompleteEncounterInput } from '../../../shared/api/encountersApi'
import { errorMessage } from '../../../shared/api/httpClient'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'

type CompletionApi = Pick<RhnApi['encounters'], 'complete' | 'get'>
const identityFields = ['id', 'residentId', 'organizationId', 'departmentId', 'encounterNo'] as const

function requireCompleted(target: Encounter, value: unknown): Encounter {
  const completed = value as Encounter | null | undefined
  if (!completed || !identityFields.every(key => typeof target[key] === 'string' && target[key].trim()
    && completed[key] === target[key]) || completed.status !== 'COMPLETED'
    || typeof completed.completedAt !== 'string' || !Number.isFinite(Date.parse(completed.completedAt))
    || Date.parse(completed.completedAt) < Date.parse(target.registeredAt)
    || (target.startedAt && Date.parse(completed.completedAt) < Date.parse(target.startedAt))) {
    throw new Error('诊毕结果未确认：就诊归属、完成状态或完成时间不一致。当前接诊界面已保留，远端可能已诊毕，请核实后使用原请求重试')
  }
  return completed
}

/** The same command is retained by the completion dialog on failure; never replace its result with local state. */
export async function completeEncounter(api: CompletionApi, encounter: Encounter, input: CompleteEncounterInput,
  assertCurrent: () => void): Promise<Encounter> {
  const target = structuredClone(encounter), command = structuredClone(input)
  try {
    assertCurrent()
    if (!command.commandCode?.trim()) throw new Error('诊毕请求缺少命令标识')
    const receipt = await api.complete(target.id, command)
    assertCurrent()
    const confirmed = requireCompleted(target, receipt)
    const persisted = await api.get(target.id)
    assertCurrent()
    const completed = requireCompleted(target, persisted)
    if (completed.completedAt !== confirmed.completedAt) throw new Error('读取的诊毕时间与操作回执不一致')
    return completed
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('诊毕结果未确认') || error.message.startsWith('文书操作未确认'))) throw error
    throw new Error(`诊毕结果未确认：${errorMessage(error)}。当前接诊界面已保留，远端可能已诊毕，请核实后使用原请求重试`)
  }
}
