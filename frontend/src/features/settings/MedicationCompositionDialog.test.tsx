import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi, MedicationKnowledge } from '../../shared/rhnApi'
import { MedicationCompositionDialog } from './MedicationCompositionDialog'

const composition={revision:'9007199254740993',source:'复方说明书',components:[
  {ingredientId:'ING:A',numeratorValue:100,numeratorUnit:'mg',denominatorValue:2,denominatorUnit:'mL'}]}
function setup() {
  const masterData={medicationComposition:vi.fn().mockResolvedValue(composition),
    medicationIngredients:vi.fn().mockResolvedValue([{id:'ING:A',code:'A',display:'成分甲'}]),
    medicationSemanticHistory:vi.fn().mockResolvedValue([]),
    saveMedicationComposition:vi.fn().mockResolvedValue({...composition,revision:'9007199254740994'}),
    createMedicationIngredient:vi.fn().mockResolvedValue({id:'ING:B'})}
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
    <MedicationCompositionDialog api={{masterData} as unknown as RhnApi}
      medication={{id:'med-1',name:'复方联调',preparationUnit:'支'} as MedicationKnowledge} onClose={vi.fn()} />
  </QueryClientProvider>)
  return masterData
}
describe('medication composition editing',()=>{
  it('preserves concentration and the exact revision when retrying a failed save',async()=>{
    const api=setup()
    api.saveMedicationComposition.mockRejectedValueOnce(new Error('保存失败，请重试'))
    await screen.findByDisplayValue('复方说明书')
    fireEvent.change(screen.getByLabelText('含量值 1'),{target:{value:'120'}})
    fireEvent.click(screen.getByRole('button',{name:'保存成分与含量'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.getByLabelText('含量值 1')).toHaveValue(120)
    fireEvent.click(screen.getByRole('button',{name:'保存成分与含量'}))
    await waitFor(()=>expect(api.saveMedicationComposition).toHaveBeenCalledTimes(2))
    expect(api.saveMedicationComposition.mock.calls[1]).toEqual(['med-1',{
      ...composition,components:[{...composition.components[0],numeratorValue:120}]}])
    await screen.findByText('已保存，后续开方使用本次资料，历史医嘱保留原资料。')
  })
  it('does not invent a strength when adding an unmapped ingredient',async()=>{
    const api=setup()
    await screen.findByDisplayValue('复方说明书')
    fireEvent.click(screen.getByRole('button',{name:'添加成分'}))
    expect(screen.getByLabelText('含量值 2')).toHaveValue(null)
    expect(screen.getByLabelText('基准量 2')).toHaveValue(null)
    expect(api.saveMedicationComposition).not.toHaveBeenCalled()
  })
})
