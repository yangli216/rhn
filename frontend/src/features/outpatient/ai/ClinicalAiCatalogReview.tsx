import { useEffect, useRef, useState } from 'react'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiTreatmentMatch, ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import { Button, FormField, Select } from '../../../shared/ui'

/** Review unresolved source intents; selecting a catalog item only prepares the ordinary order review. */
export function ClinicalAiCatalogReview({ matches, api, encounterId, disabled, onResolved }: {
  matches: ClinicalAiTreatmentMatch[]
  api: RhnApi
  encounterId: string
  disabled: boolean
  onResolved: (keys: string[], items: ClinicalAiTreatmentRecommendation[]) => void
}) {
  const [retries, setRetries] = useState<Record<string, ClinicalAiTreatmentMatch[]>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const epoch = useRef(0)
  const current = useRef({ disabled, encounterId })
  current.current = { disabled, encounterId }
  useEffect(() => { epoch.current += 1; setBusy(undefined); return () => { epoch.current += 1 } }, [encounterId, disabled])
  useEffect(() => {
    epoch.current += 1
    setRetries({}); setNames({}); setChoices({}); setError(''); setBusy(undefined)
    return () => { epoch.current += 1 }
  }, [encounterId, api])
  const rows = matches.flatMap(match => (retries[match.key] ?? [match]).map(value => ({ ...value, sourceKey: match.key })))
  const retry = async (match: ClinicalAiTreatmentMatch) => {
    if (disabled || busy) return
    const requestEpoch = epoch.current
    setBusy(match.key); setError('')
    try {
      const resolved = await api.clinicalAi.resolveTreatments(encounterId, [{ ...match.intent, name: names[match.key] ?? match.intent.name }])
      if (epoch.current !== requestEpoch || current.current.disabled || current.current.encounterId !== encounterId) return
      setRetries(previous => ({ ...previous, [match.key]: resolved }))
      setChoices({})
    } catch (err) {
      if (epoch.current === requestEpoch) setError(err instanceof Error ? err.message : '目录读取失败，请重试。')
    } finally { if (epoch.current === requestEpoch) setBusy(undefined) }
  }
  if (!matches.length) return null
  return <div className="doctor-ai-catalog-review" aria-label="AI 医嘱目录待核对">
    {rows.map(match => {
      const candidate = match.status === 'MATCHED' ? match.candidates[0]
        : match.candidates.find(item => `${item.type}:${item.catalogItemId}` === choices[match.key])
      return <div key={match.key} className="doctor-ai-catalog-review__row">
        <div><strong>{match.intent.name}</strong>{match.intent.specification && <small>建议规格：{match.intent.specification}</small>}
          <small>{match.reason}</small></div>
        <div className="doctor-ai-catalog-review__choice">
          {match.candidates.length > 0 ? <FormField label={`院内项目：${match.intent.name}`}>
            <Select aria-label={`匹配 ${match.intent.name}`} disabled={disabled || Boolean(busy)}
              value={candidate ? `${candidate.type}:${candidate.catalogItemId}` : ''} placeholder="请选择院内项目"
              options={match.candidates.map(item => ({ value: `${item.type}:${item.catalogItemId}`,
                label: [item.name, item.type === 'MEDICATION' ? item.specification : undefined].filter(Boolean).join(' · ') }))}
              onChange={value => setChoices(previous => ({ ...previous, [match.key]: value }))} />
          </FormField> : <FormField label={`检索名称：${match.intent.name}`}>
            <input aria-label={`检索 ${match.intent.name}`} value={names[match.sourceKey] ?? match.intent.name}
              maxLength={100} disabled={disabled || Boolean(busy)}
              onChange={event => setNames(previous => ({ ...previous, [match.sourceKey]: event.target.value }))} />
          </FormField>}
          <Button size="sm" variant="text" disabled={disabled || Boolean(busy)} onClick={() => void retry(matches.find(item => item.key === match.sourceKey)!)}>重新匹配</Button>
          <Button size="sm" disabled={disabled || Boolean(busy) || !candidate}
            onClick={() => {
              if (!candidate) return
              // A split retry must be reviewed as a complete source group.
              const group = rows.filter(item => item.sourceKey === match.sourceKey)
              const selected = group.map(item => item.status === 'MATCHED' ? item.candidates[0]
                : item.candidates.find(value => `${value.type}:${value.catalogItemId}` === choices[item.key]))
              if (selected.some(item => !item)) { setError('请为拆分后的每个项目选择院内目录。'); return }
              setError(''); onResolved([match.sourceKey], selected as ClinicalAiTreatmentRecommendation[])
            }}>核对用法</Button>
        </div>
      </div>
    })}
    {error && <div role="alert">{error}</div>}
  </div>
}
