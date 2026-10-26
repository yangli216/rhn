import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, EmptyState, LoadingState } from "../../../shared/ui";
import { requireOperationalRows } from '../operations/operationalShared'

/** 项目别名：只是检索入口，随诊疗项目主档维护，与执行、收费配置无关；独立保存，不跟随主档表单提交。 */
export function ServiceAliasSection({ api, serviceId }: { api: RhnApi; serviceId: string }) {
  const client = useQueryClient()
  const [names, setNames] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const aliases = useQuery({
    queryKey: ['master-data-service-aliases', serviceId],
    queryFn: async () => requireOperationalRows(await api.masterData.serviceAliases(serviceId), '项目别名'),
  })
  useEffect(() => { setNames((aliases.data ?? []).map((value) => value.aliasName)) }, [aliases.data])
  const unavailable = aliases.isPending || aliases.isError || saving
  const add = () => {
    const additions = input.split(/[,，、]/).map((value) => value.trim()).filter(Boolean)
    if (!additions.length) return
    setNames((current) => [...new Set([...current, ...additions])])
    setInput('')
  }
  const save = async () => {
    setSaving(true); setFeedback(''); setError('')
    try {
      await api.masterData.replaceServiceAliases(serviceId, names.map((aliasName, index) => ({
        aliasType: 'SYNONYM', aliasName, primaryAlias: index === 0, status: 'ACTIVE',
      })))
      setFeedback('项目别名已更新')
      await client.invalidateQueries({ queryKey: ['master-data-service-aliases', serviceId] })
      await client.invalidateQueries({ queryKey: ['master-data-services'] })
    } catch (e) { setError(errorMessage(e)) } finally { setSaving(false) }
  }
  return <section className="clinical-configuration__section clinical-project-aliases" aria-label="项目别名维护">
    <div className="section-heading">
      <div><h4>项目别名</h4><p>只作为检索入口，命中后仍归到当前项目，不影响收费和执行；单独保存，无需提交主档。</p></div>
      <Button type="button" size="sm" disabled={unavailable} busy={saving} busyLabel="保存中" onClick={() => { void save() }}>保存别名</Button>
    </div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {error && <Alert>{error}</Alert>}
    <div className="clinical-project-aliases__body">
      <div className="clinical-project-aliases__add">
        <input value={input} disabled={unavailable} aria-label="新增项目别名" placeholder="输入别名，多个用逗号分隔"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
        <Button type="button" size="sm" variant="secondary" disabled={unavailable || !input.trim()} onClick={add}>加入列表</Button>
      </div>
      <div className="clinical-project-aliases__list">
        {aliases.isError ? <EmptyState icon="clinical" title="项目别名加载失败" copy="尚无法确认已配置的别名，请重新加载。"
          action={<Button type="button" variant="secondary" onClick={() => { void aliases.refetch() }}>重新加载别名</Button>} />
          : aliases.isPending ? <LoadingState label="正在加载项目别名…" /> : names.length === 0
          ? <span className="muted">暂未配置别名</span>
          : names.map((name) => <span className="clinical-project-aliases__item" key={name}>
            {name}<Button type="button" size="sm" variant="text" aria-label={`移除别名${name}`} disabled={saving}
              onClick={() => setNames((current) => current.filter((value) => value !== name))}>×</Button>
          </span>)}
      </div>
    </div>
  </section>
}
