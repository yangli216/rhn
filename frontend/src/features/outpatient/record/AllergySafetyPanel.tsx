import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AllergenTerm, AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter, Resident } from "../../../shared/model";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, FormField, Icon, Popconfirm, Select } from "../../../shared/ui";

export function AllergySafetyPanel({ resident, encounter, allergies, loading, error, api, readOnly = false }: {
  resident: Resident; encounter: Encounter; allergies: AllergyIntolerance[]; loading: boolean; error: unknown; api: RhnApi
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<NonNullable<AllergyIntolerance['categoryCode']>>('DRUG')
  const [criticality, setCriticality] = useState<NonNullable<AllergyIntolerance['criticalityCode']>>('UNABLE_TO_ASSESS')
  const [severity, setSeverity] = useState<NonNullable<AllergyIntolerance['reactionSeverity']>>('MILD')
  const [substance, setSubstance] = useState('')
  const [selectedAllergenId, setSelectedAllergenId] = useState('')
  const [customAllergen, setCustomAllergen] = useState(false)
  const [reaction, setReaction] = useState('')
  const allergenTerms = useQuery({
    queryKey: ['allergen-terms', category],
    queryFn: () => typeof api.residents.allergenTerms === 'function'
      ? api.residents.allergenTerms(category) : Promise.resolve([] as AllergenTerm[]),
    enabled: !readOnly,
  })
  const selectedAllergen = allergenTerms.data?.find((item) => item.id === selectedAllergenId)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['doctor-allergies', resident.id] })
  const record = useMutation({
    mutationFn: () => api.residents.recordAllergy(resident.id, {
      encounterId: encounter.id, assertionType: 'ALLERGY', categoryCode: category, criticalityCode: criticality,
      reactionSeverity: severity, informationSource: 'PATIENT', allergenId: selectedAllergen?.id,
      substanceDisplay: selectedAllergen?.display ?? substance.trim(),
      substanceCodeSystemUri: selectedAllergen?.codeSystemUri,
      substanceCode: selectedAllergen?.code, reactionText: reaction.trim() || undefined,
    }),
    onSuccess: async () => { setSubstance(''); setSelectedAllergenId('');
      setCustomAllergen(false); setReaction(''); await refresh() },
  })
  const noKnown = useMutation({
    mutationFn: () => api.residents.recordAllergy(resident.id, {
      encounterId: encounter.id, assertionType: 'NO_KNOWN_DRUG_ALLERGY', informationSource: 'PATIENT',
    }), onSuccess: refresh,
  })
  const inactivate = useMutation({
    mutationFn: (value: AllergyIntolerance) => api.residents.inactivateAllergy(
      resident.id, value.id, value.revision, '医生复核后停用',
    ), onSuccess: refresh,
  })
  const actual = allergies.filter((item) => item.assertionType === 'ALLERGY')
  const noKnownAssertion = allergies.find((item) => item.assertionType !== 'ALLERGY')
  const mutationError = record.error || noKnown.error || inactivate.error

  const categoryOptions = [
    { value: 'DRUG', label: '药物' }, { value: 'FOOD', label: '食物' },
    { value: 'ENVIRONMENT', label: '环境' }, { value: 'BIOLOGIC', label: '生物制品' }, { value: 'OTHER', label: '其他' },
  ]

  return <section className={`doctor-allergy-safety ${actual.length ? 'is-risk' : noKnownAssertion ? 'is-clear' : 'is-unknown'}`}
    aria-label="患者过敏安全信息">
    <div className="doctor-allergy-overview">
      <span className="doctor-allergy-overview__icon" aria-hidden="true"><Icon name={actual.length ? 'warning' : noKnownAssertion ? 'check' : 'info'} /></span>
      <div><span>当前过敏状态</span>{loading ? <strong>正在加载</strong>
        : actual.length ? <strong>{actual.length} 项有效过敏记录</strong>
          : noKnownAssertion ? <strong>已确认无已知药物过敏</strong> : <strong>尚未核对过敏信息</strong>}
        <small>{readOnly ? '当前为阅读状态' : '变更将关联本次就诊并留痕'}</small></div>
      {!loading && !readOnly && allergies.length === 0 && <Button size="sm" variant="secondary" busy={noKnown.isPending}
        onClick={() => noKnown.mutate()}>确认无已知药物过敏</Button>}
    </div>

    <div className="doctor-allergy-records">
      <header><strong>有效记录</strong><span>{actual.length} 项</span></header>
      {actual.length > 0 ? <div className="doctor-allergy-list">{actual.map((item) => <article key={item.id}>
        <div><strong>{item.substanceDisplay}</strong>
          <small>{[allergyCategoryLabel(item.categoryCode), allergySeverityLabel(item.reactionSeverity),
            allergyCriticalityLabel(item.criticalityCode), item.reactionText].filter(Boolean).join(' · ')}</small></div>
        {!readOnly && <Popconfirm title={`停用“${item.substanceDisplay}”过敏记录？`}
          description="停用后不再参与处方过敏校验，操作会保留审计记录。" okText="确认停用"
          onConfirm={async () => { await inactivate.mutateAsync(item) }}>
          <Button size="sm" variant="text">停用</Button>
        </Popconfirm>}
      </article>)}</div> : <p className="doctor-allergy-empty">当前没有有效过敏事实。</p>}
    </div>

    {!readOnly && <form className="doctor-allergy-editor" onSubmit={(event) => { event.preventDefault(); record.mutate() }}>
      <header><div><strong>新增过敏事实</strong><small>优先选择标准过敏原，用于处方自动匹配与安全提醒。</small></div>
        <Button size="sm" variant="text" onClick={() => {
          setCustomAllergen((value) => !value); setSelectedAllergenId(''); setSubstance('')
        }}>{customAllergen ? '返回标准过敏原' : '标准库未收录？手工录入'}</Button></header>
      <div className="doctor-allergy-editor__grid">
        <FormField label="类别" required><Select value={category} searchable={false} clearable={false}
          onChange={(next) => { setCategory(next as typeof category); setSelectedAllergenId('');
            setSubstance(''); setCustomAllergen(false) }} options={categoryOptions} /></FormField>
        <FormField label="危急程度"><Select value={criticality} searchable={false} clearable={false}
          onChange={(next) => setCriticality(next as typeof criticality)} options={[
            { value: 'HIGH', label: '高危' }, { value: 'LOW', label: '低危' }, { value: 'UNABLE_TO_ASSESS', label: '无法评估' },
          ]} /></FormField>
        {!customAllergen ? <FormField className="doctor-allergy-editor__wide" label="标准过敏原" required>
          <Select value={selectedAllergenId} onChange={setSelectedAllergenId} searchable clearable
          loading={allergenTerms.isLoading} searchPlaceholder="输入名称、别名或编码"
          placeholder="搜索并选择标准过敏原" options={(allergenTerms.data ?? []).map((item) => ({
            value: item.id, label: item.display, secondaryText: item.code,
            description: allergenConceptTypeLabel(item.conceptType),
            searchKeywords: [item.code, item.aliases ?? ''],
          }))} />
        </FormField> : <FormField className="doctor-allergy-editor__wide" label="过敏原（非标准）" required>
        <input value={substance} maxLength={300} onChange={(event) => setSubstance(event.target.value)}
          placeholder="输入过敏原名称" />
      </FormField>}
      <FormField label="反应严重度"><Select value={severity} searchable={false} clearable={false}
        onChange={(next) => setSeverity(next as typeof severity)} options={[
          { value: 'MILD', label: '轻度' }, { value: 'MODERATE', label: '中度' }, { value: 'SEVERE', label: '重度' },
        ]} /></FormField>
      <FormField label="过敏反应"><input value={reaction} maxLength={1000}
        onChange={(event) => setReaction(event.target.value)} placeholder="如皮疹、呼吸困难" /></FormField>
      </div>
      <footer><Button type="submit" busy={record.isPending} disabled={!selectedAllergenId && !substance.trim()}>
        <Icon name="check" />记录过敏事实
      </Button></footer>
    </form>}
    {(error || mutationError) && <Alert>{errorMessage(error || mutationError)}</Alert>}
  </section>
}

export function allergyCategoryLabel(value?: AllergyIntolerance['categoryCode']) {
  return ({ DRUG: '药物', FOOD: '食物', ENVIRONMENT: '环境', BIOLOGIC: '生物制品', OTHER: '其他' } as const)[value ?? 'OTHER']
}

export function allergySeverityLabel(value?: AllergyIntolerance['reactionSeverity']) {
  return value ? ({ MILD: '轻度', MODERATE: '中度', SEVERE: '重度' } as const)[value] : ''
}

export function allergyCriticalityLabel(value?: AllergyIntolerance['criticalityCode']) {
  return value ? ({ LOW: '低危', HIGH: '高危', UNABLE_TO_ASSESS: '危急程度未评估' } as const)[value] : ''
}

export function allergenConceptTypeLabel(value: AllergenTerm['conceptType']) {
  return ({ DRUG_INGREDIENT: '药物成分', DRUG_CLASS: '药物类别', FOOD: '食物', ENVIRONMENT: '环境',
    BIOLOGIC: '生物制品', MATERIAL: '材料', OTHER: '其他' } as const)[value]
}
