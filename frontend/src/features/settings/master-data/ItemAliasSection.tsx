import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import type { ServiceAlias } from "../../../shared/api/masterDataApi";
import { Alert, Button, EmptyState, LoadingState } from "../../../shared/ui";
import { FormSection } from './masterDataShared'
import { AliasTagEditor } from './AliasTagEditor'
import { requireOperationalRows } from '../operations/operationalShared'

type AliasInput = Array<Pick<ServiceAlias, 'aliasType' | 'aliasName' | 'primaryAlias' | 'status'>>

/**
 * 别名分组：诊疗项目与药品共用，别名独立保存，不跟随主档表单提交；
 * 拼音与五笔检索码由后端按每个别名逐条生成，这里只维护名称与主次顺序（第一个为主要别名）。
 */
function AliasSection({ subject, queryKey, load, replace, invalidateKeys, description }: {
  subject: '项目' | '药品'; queryKey: readonly unknown[]; description: string
  load: () => Promise<ServiceAlias[]>; replace: (aliases: AliasInput) => Promise<unknown>
  invalidateKeys: ReadonlyArray<readonly unknown[]>
}) {
  const client = useQueryClient()
  const [names, setNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const aliases = useQuery({
    queryKey,
    queryFn: async () => requireOperationalRows(await load(), `${subject}别名`),
  })
  useEffect(() => { setNames((aliases.data ?? []).map((value) => value.aliasName)) }, [aliases.data])
  const unavailable = aliases.isPending || aliases.isError || saving
  const save = async () => {
    setSaving(true); setFeedback(''); setError('')
    try {
      await replace(names.map((aliasName, index) => ({
        aliasType: 'SYNONYM', aliasName, primaryAlias: index === 0, status: 'ACTIVE' as const,
      })))
      setFeedback(`${subject}别名已更新`)
      await Promise.all([queryKey, ...invalidateKeys].map((key) => client.invalidateQueries({ queryKey: key })))
    } catch (e) { setError(errorMessage(e)) } finally { setSaving(false) }
  }
  return <FormSection title={`${subject}别名`} description={description}
    action={<Button type="button" size="sm" disabled={unavailable} busy={saving} busyLabel="保存中" onClick={() => { void save() }}>保存别名</Button>}>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {error && <Alert>{error}</Alert>}
    {aliases.isError ? <EmptyState icon="clinical" title={`${subject}别名加载失败`} copy="尚无法确认已配置的别名，请重新加载。"
      action={<Button type="button" variant="secondary" onClick={() => { void aliases.refetch() }}>重新加载别名</Button>} />
      : aliases.isPending ? <LoadingState label={`正在加载${subject}别名…`} />
      : <AliasTagEditor names={names} onChange={setNames} disabled={saving} label={`新增${subject}别名`} />}
  </FormSection>
}

export function ServiceAliasSection({ api, serviceId }: { api: RhnApi; serviceId: string }) {
  return <AliasSection subject="项目" description="只作检索入口，不影响收费和执行；单独保存。"
    queryKey={['master-data-service-aliases', serviceId]}
    load={() => api.masterData.serviceAliases(serviceId)}
    replace={(aliases) => api.masterData.replaceServiceAliases(serviceId, aliases)}
    invalidateKeys={[['master-data-services']]} />
}

export function MedicationAliasSection({ api, medicationId }: { api: RhnApi; medicationId: string }) {
  return <AliasSection subject="药品" description="历史名称或常用简称，只作检索入口；单独保存，每个别名各自生成拼音与五笔码。"
    queryKey={['master-data-medication-aliases', medicationId]}
    load={() => api.masterData.medicationAliases(medicationId)}
    replace={(aliases) => api.masterData.replaceMedicationAliases(medicationId, aliases)}
    invalidateKeys={[['master-data-medications']]} />
}
