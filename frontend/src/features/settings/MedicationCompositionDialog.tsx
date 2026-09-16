import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type MedicationKnowledge } from '../../shared/rhnApi'
import type { MedicationComposition, MedicationComponent } from '../../shared/api/masterDataApi'
import { Button, Dialog, FormField, LoadingState, Select } from '../../shared/ui'
import './medication-composition.css'

export function MedicationCompositionDialog({api, medication, onClose}: {
  api: RhnApi; medication: MedicationKnowledge; onClose: () => void
}) {
  const client = useQueryClient()
  const composition = useQuery({queryKey:['medication-composition',medication.id],
    queryFn:()=>api.masterData.medicationComposition(medication.id), staleTime:0, gcTime:0, refetchOnWindowFocus:false})
  const ingredients = useQuery({queryKey:['medication-ingredients'],queryFn:()=>api.masterData.medicationIngredients()})
  const history = useQuery({queryKey:['medication-semantic-history',medication.id],queryFn:()=>api.masterData.medicationSemanticHistory(medication.id)})
  const [draft,setDraft] = useState<MedicationComposition>()
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [saving,setSaving] = useState(false)
  const pending = useRef(false)
  const current = draft ?? composition.data
  const update = (index:number, patch:Partial<MedicationComponent>) => {
    if (current) setDraft({...current,components:current.components.map((v,i)=>i===index?{...v,...patch}:v)})
  }
  const save = async (event:FormEvent) => {
    event.preventDefault()
    if (!current || pending.current) return
    pending.current=true;setSaving(true);setError('');setNotice('')
    try {
      const saved=await api.masterData.saveMedicationComposition(medication.id,current)
      setDraft(saved);client.setQueryData(['medication-composition',medication.id],saved)
      await client.invalidateQueries({queryKey:['medication-semantic-history',medication.id]})
      setNotice('已保存，后续开方使用本次资料，历史医嘱保留原资料。')
    } catch(e) {setError(errorMessage(e))}
    finally {pending.current=false;setSaving(false)}
  }
  const createIngredient = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending.current) return
    const form=event.currentTarget, data=new FormData(form)
    pending.current=true;setSaving(true);setError('');setNotice('')
    try {
      await api.masterData.createMedicationIngredient({code:String(data.get('code')),display:String(data.get('display')),
        source:String(data.get('ingredientSource')),system:'RHN.LOCAL.INGREDIENT',systemVersion:'1'})
      await client.invalidateQueries({queryKey:['medication-ingredients']});form.reset();setNotice('成分已建立，可在左侧选择。')
    } catch(e) {setError(errorMessage(e))}
    finally {pending.current=false;setSaving(false)}
  }
  return <Dialog title="成分与含量" eyebrow={medication.name} size="xwide" onClose={onClose}
    description="按实际资料维护单方或复方成分。含量可暂不填写，保存后立即用于后续开方。">
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {composition.isError || ingredients.isError ? <p role="alert">{errorMessage(composition.error ?? ingredients.error)}</p>
      : !current || ingredients.isPending ? <LoadingState label="正在读取成分资料…" />
      : <div className="med-composition-layout">
        <form onSubmit={save} className="med-composition-main">
          <h3>当前药品成分</h3>
          <p>含量填写方式：每 1 片含 5 mg，或每 2 mL 含 100 mg。基准单位可用“{medication.preparationUnit || '制剂单位'}”或临床单位。</p>
          <fieldset disabled={saving} className="med-composition-fields">
            {current.components.length===0 && <p>尚未关联成分。缺少的资料会保留为空，可在调试时逐步补充。</p>}
            {current.components.map((value,index)=><div className="med-composition-row" key={index}>
              <FormField label={`成分 ${index+1}`} required><Select aria-label={`成分 ${index+1}`} value={value.ingredientId} aria-required searchable disabled={saving}
                placeholder="选择成分" onChange={next=>update(index,{ingredientId:next})}
                options={(ingredients.data ?? []).map(v=>({value:v.id,label:v.display,secondaryText:v.code}))} /></FormField>
              <FormField label="含量值"><input aria-label={`含量值 ${index+1}`} type="number" min="0.000000001" step="any"
                value={value.numeratorValue ?? ''} onChange={e=>update(index,{numeratorValue:e.target.value===''?null:Number(e.target.value)})} /></FormField>
              <FormField label="含量单位"><input aria-label={`含量单位 ${index+1}`} placeholder="mg" value={value.numeratorUnit ?? ''}
                onChange={e=>update(index,{numeratorUnit:e.target.value || null})} /></FormField>
              <FormField label="基准量"><input aria-label={`基准量 ${index+1}`} type="number" min="0.000000001" step="any"
                value={value.denominatorValue ?? ''} onChange={e=>update(index,{denominatorValue:e.target.value===''?null:Number(e.target.value)})} /></FormField>
              <FormField label="基准单位"><input aria-label={`基准单位 ${index+1}`} placeholder={medication.preparationUnit || 'mL'}
                value={value.denominatorUnit ?? ''} onChange={e=>update(index,{denominatorUnit:e.target.value || null})} /></FormField>
              <Button variant="text" onClick={()=>setDraft({...current,components:current.components.filter((_,i)=>i!==index)})}>移除</Button>
            </div>)}
            <Button variant="secondary" onClick={()=>setDraft({...current,components:[...current.components,{ingredientId:''}]})}>添加成分</Button>
            <FormField label="资料来源" required><input aria-label="资料来源" required maxLength={256} placeholder="如厂家说明书、院内整理资料"
              value={current.source ?? ''} onChange={e=>setDraft({...current,source:e.target.value})} /></FormField>
          </fieldset>
          <div className="ui-form-actions"><Button variant="secondary" disabled={saving} onClick={onClose}>关闭</Button>
            <Button type="submit" disabled={saving}>{saving?'正在保存…':'保存成分与含量'}</Button></div>
        </form>
        <aside className="med-composition-side">
          <form onSubmit={createIngredient}><h3>建立本院成分</h3>
            <p>先查找已有成分，避免同一成分重复建档。</p>
            <fieldset disabled={saving} className="med-composition-fields">
              <FormField label="成分编码" required><input name="code" required maxLength={64} /></FormField>
              <FormField label="成分名称" required><input name="display" required maxLength={160} /></FormField>
              <FormField label="成分来源" required><input name="ingredientSource" required maxLength={256} /></FormField>
              <Button type="submit" variant="secondary">建立成分</Button>
            </fieldset>
          </form>
          <section><h3>资料变更记录</h3>{history.isError ? <p role="alert">变更记录暂时无法加载</p> :
            <ul className="med-composition-history">{history.data?.map(v=><li key={v.revision}>
              <time>{new Date(v.recordedAt).toLocaleString('zh-CN')}</time>
              <span>{v.changeType==='INITIAL_CAPTURE'?'首次记录':v.changeType==='DISPLAY_CHANGE'?'显示资料更新':'药品资料更新'}</span>
              <small>{v.source==='LOCAL_MEDICATION'?'本院药品资料':v.source}</small>
            </li>)}</ul>}</section>
        </aside>
      </div>}
  </Dialog>
}
