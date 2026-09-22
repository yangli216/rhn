import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Organization } from '../../shared/model'
import type { Manufacturer, MedicationKnowledge, RhnApi, StandardMedicationDetail, StandardMedicationSpecification } from '../../shared/rhnApi'
import { StandardMedicationSetupDialog, standardMedicationDraft, type DictionaryMap } from './BasicDataManagement'

const spec = {id:'STD-TABLET-5',sourceBlock:'片剂：5mg',orderable:false,doseForm:'TABLET',doseFormName:'片剂',specification:'5mg',presentationUnit:'片',
  substanceQualifier:'',strength:{kind:'AMOUNT_PER_PRESENTATION',computable:true,numerator:{value:'5',unit:'mg'},denominator:null,components:[]}} as StandardMedicationSpecification
const entry = {name:'氨氯地平',innName:'Amlodipine',medicationType:'WESTERN',entryType:'MEDICATION'} as StandardMedicationDetail
const dicts = Object.fromEntries(['BD_MEDICATION_TYPE','BD_DOSE_FORM','BD_STORAGE_TYPE','BD_ANTIMICROBIAL_LEVEL',
  'BD_PRODUCT_MARKET_STATUS','BD_PRODUCTION_PLACE','BD_SHELF_LIFE_UNIT'].map(code => [code,
    code === 'BD_MEDICATION_TYPE' ? [{code:'WESTERN',name:'西药'}] : code === 'BD_DOSE_FORM' ? [{code:'TABLET',name:'片剂'}] : []])) as DictionaryMap
const saved = {id:'med-1',revision:1,code:spec.id,name:entry.name,sdMedicationType:'WESTERN',sdDoseForm:'TABLET',
  preparationUnit:'片',preparationSpec:'5mg',strengthValue:5,strengthUnit:'mg',sdStatus:'ACTIVE',products:[],
  itemTypeId:'type-1',sdMedicationTypeText:'西药',prescriptionDrug:true,essentialDrug:false,antimicrobial:false,
  antimicrobialOutpatientAllowed:false,antimicrobialConsultationRequired:false,antimicrobialEmergencyAllowed:false,
  skinTestRequired:false,chronicDiseaseDrug:false,singleOrder:true,sdStatusText:'有效',classifications:[],allergenConceptIds:[]} as MedicationKnowledge
function setup(prior: boolean | MedicationKnowledge[] = false) {
  const masterData = {standardMedicationCandidates:vi.fn().mockResolvedValue(Array.isArray(prior) ? prior : prior ? [saved] : []),
    saveStandardMedication:vi.fn().mockResolvedValue(saved),
    createProductSetup:vi.fn().mockRejectedValueOnce(new Error('产品编码已存在')).mockResolvedValue({id:'product-1'})}
  const onComplete=vi.fn()
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})
  render(<QueryClientProvider client={client}><StandardMedicationSetupDialog api={{masterData} as unknown as RhnApi}
    entry={entry} spec={spec} organization={{id:'org-1',name:'本院'} as Organization} dictionaries={dicts}
    manufacturers={[{id:'mfr-1',name:'调试厂家'} as Manufacturer]} frequencies={[]} routes={[]}
    onClose={vi.fn()} onComplete={onComplete} /></QueryClientProvider>)
  return {masterData,onComplete}
}
function fill(name:string,value:string) { fireEvent.change(document.querySelector(`input[name="${name}"]`)!,{target:{value}}) }
function submit() { fireEvent.submit(document.querySelector('form')!) }

describe('standard medication operational setup', () => {
  it('preserves the source salt in the proposed medication name', () => {
    const levamlodipine = {...entry, name: '左氨氯地平'}
    expect(standardMedicationDraft(levamlodipine, {...spec, substanceQualifier: '苯磺酸盐'}).name).toBe('左氨氯地平（苯磺酸盐）')
    expect(standardMedicationDraft(levamlodipine, {...spec, substanceQualifier: '马来酸盐'}).name).toBe('左氨氯地平（马来酸盐）')
  })
  it('prefills amount per presentation but does not flatten concentration or guess directions', () => {
    expect(standardMedicationDraft(entry,spec)).toMatchObject({code:spec.id,strengthValue:5,strengthUnit:'mg',preparationUnit:'片'})
    const concentration={...spec,presentationUnit:null,strength:{...spec.strength,kind:'CONCENTRATION',denominator:{value:'2',unit:'mL'}}}
    const input=standardMedicationDraft(entry,concentration)
    expect(input.strengthValue).toBeUndefined()
    expect(input.defaultRoute).toBeUndefined()
    expect(input.skinTestRequired).toBeUndefined()
  })
  it('keeps the created medication on product failure and retries only product setup', async () => {
    const {masterData,onComplete}=setup()
    expect(await screen.findByDisplayValue(spec.id)).toHaveAttribute('readonly')
    expect(document.querySelector('input[name="preparationSpec"]')).toHaveAttribute('readonly')
    expect(document.querySelector('input[name="strengthValue"]')).toHaveAttribute('readonly')
    expect(document.querySelector('input[name="strengthUnit"]')).toHaveAttribute('readonly')
    submit()
    await screen.findByText('新增药品产品')
    expect(masterData.saveStandardMedication.mock.calls[0][1]).toMatchObject({standardSpecificationId:spec.id,code:spec.id,preparationUnit:'片',strengthValue:5})
    expect(masterData.saveStandardMedication.mock.calls[0][1].defaultDoseUnit).toBeUndefined()
    fill('code','PROD-TEST');fill('quantityFactor','14');fill('purchasePrice','8.4');fill('salePrice','18.6')
    submit()
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('产品编码已存在')
    expect(onComplete).not.toHaveBeenCalled()
    fill('code','PROD-RETRY');submit()
    await waitFor(()=>expect(onComplete).toHaveBeenCalledWith(saved))
    expect(masterData.saveStandardMedication).toHaveBeenCalledTimes(1)
    expect(masterData.createProductSetup).toHaveBeenCalledTimes(2)
    expect(masterData.createProductSetup.mock.calls[1][0]).toMatchObject({
      product:{medicationId:saved.id,code:'PROD-RETRY'},packaging:{quantityFactor:14},organization:{organizationId:'org-1'},salePrice:18.6})
  })
  it('reuses the existing standard specification and preserves its code when saving edits', async () => {
    const {masterData}=setup(true)
    await screen.findByDisplayValue(spec.id)
    submit()
    await screen.findByText('新增药品产品')
    expect(masterData.saveStandardMedication).toHaveBeenCalledWith(spec.id,expect.objectContaining({code:spec.id}),'org-1',saved)
  })
  it('requires choosing between equivalent legacy records and locks a referenced minimum unit', async () => {
    const used = {...saved, code:'DRUG-LEGACY', products:[{id:'product-used'}]} as MedicationKnowledge
    const {masterData} = setup([used, {...saved,id:'other',code:'MED-2026-LEGACY'}])
    await screen.findByRole('dialog', {name:'关联已有药品档案'})
    expect(masterData.saveStandardMedication).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', {name:/DRUG-LEGACY/}))
    expect(await screen.findByDisplayValue('DRUG-LEGACY')).toHaveAttribute('readonly')
    expect(document.querySelector('input[name="preparationUnit"]')).toHaveAttribute('readonly')
    submit()
    await screen.findByText('新增药品产品')
    expect(masterData.saveStandardMedication).toHaveBeenCalledWith(spec.id,expect.anything(),'org-1',used)
  })

})
