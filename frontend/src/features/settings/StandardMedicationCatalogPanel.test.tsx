import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { StandardMedicationCatalogPanel } from './StandardMedicationCatalogPanel'

const source = {title:'用户提供目录',claimedEdition:'2026',sha256:'source-hash',verificationStatus:'UNVERIFIED',note:'待核实'}
const entry = {id:'GEN-AMIKACIN',name:'阿米卡星',innName:'Amikacin',legacyCode:'MED-2026-W016',
  sourceLocations:['table:1/row:16'],categories:[{major:'抗微生物药',sub:'氨基糖苷类',function:''}],
  entryType:'MEDICATION',medicationType:'WESTERN',specificationCount:1,issueCount:0}
function setup(error = false) {
  const api = {masterData:{
    standardMedicationSummary: vi.fn().mockResolvedValue({catalogVersion:'1.0.0',source,
      statistics:{entries:794,specifications:2078,scopeEntries:7,issues:143}}),
    standardMedications: error ? vi.fn().mockRejectedValue(new Error('目录暂不可用')) : vi.fn().mockResolvedValue({
      content:[entry],totalElements:1,totalPages:1,page:0,size:20}),
    standardMedicationDetail:vi.fn().mockResolvedValue({...entry,source,sourceSpecification:'注射液：1ml:0.1g',
      specifications:[{id:'STD-AMIKACIN',doseFormName:'注射液',specification:'1ml:0.1g',substanceQualifier:'',
        strength:{kind:'CONCENTRATION',numerator:{value:'0.1',unit:'g'},denominator:{value:'1',unit:'mL'},components:[],computable:true}}],issues:[]}),
  }} as unknown as RhnApi
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><StandardMedicationCatalogPanel api={api} /></QueryClientProvider>)
  return api
}
describe('Standard medication catalog', () => {
  it('shows provenance and concentration without offering direct prescribing', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button',{name:'查看阿米卡星标准规格'}))
    expect(await screen.findByText('0.1 g / 1 mL')).toBeInTheDocument()
    expect(screen.getByText(/官方发布信息待核实/)).toBeInTheDocument()
    expect(screen.getByText('table:1/row:16')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'开药'})).not.toBeInTheDocument()
  })
  it('searches the reference catalog with the entered term', async () => {
    const api = setup()
    await userEvent.type(screen.getByRole('searchbox'), '维生素B12')
    expect(api.masterData.standardMedications).toHaveBeenLastCalledWith('维生素B12','','',0,20)
  })
  it('shows a failed request instead of presenting it as an empty verified catalog', async () => {
    setup(true)
    expect(await screen.findByText('目录暂不可用')).toBeInTheDocument()
  })
})
