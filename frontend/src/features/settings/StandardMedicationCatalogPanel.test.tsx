import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { StandardMedicationCatalogPanel } from './StandardMedicationCatalogPanel'

const source = {title:'用户提供目录',claimedEdition:'2026',sha256:'source-hash',verificationStatus:'UNVERIFIED',note:'待核实'}
const entry = {id:'GEN-AMIKACIN',name:'阿米卡星',innName:'Amikacin',legacyCode:'MED-2026-W016',
  sourceLocations:['table:1/row:16'],
  pdfLocations:[{location:'table:1/row:16',page:15,printPage:3}],
  categories:[{major:'抗微生物药',sub:'氨基糖苷类',function:''}],
  entryType:'MEDICATION',medicationType:'WESTERN',specificationCount:1,issueCount:0}
function setup(error = false, blocked = false) {
  const api = {masterData:{
    standardMedicationSummary: vi.fn().mockResolvedValue({catalogVersion:'1.0.0',source,
      statistics:{entries:794,specifications:2078,scopeEntries:7,issues:143}}),
    standardMedications: error ? vi.fn().mockRejectedValue(new Error('目录暂不可用')) : vi.fn().mockResolvedValue({
      content:[entry],totalElements:1,totalPages:1,page:0,size:20}),
    standardMedicationDetail:vi.fn().mockResolvedValue({...entry,source,sourceSpecification:'注射液：1ml:0.1g',
      specifications:[{identityIssues: blocked ? ['STANDARD_SPECIFICATION_INCOMPLETE'] : [], id:'STD-AMIKACIN',doseFormName:'注射液',specification:'1ml:0.1g',substanceQualifier:'',
        strength:{kind:'CONCENTRATION',numerator:{value:'0.1',unit:'g'},denominator:{value:'1',unit:'mL'},components:[],computable:true}}],issues:[]}),
    standardCatalogSourceDocumentUrl: vi.fn((page?: number) => page ? `/mock-pdf#page=${page}&view=FitH` : '/mock-pdf'),
    downloadStandardCatalogSourceDocument: vi.fn().mockResolvedValue(new Blob(['pdf'], {type: 'application/pdf'})),
  }} as unknown as RhnApi
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><StandardMedicationCatalogPanel api={api} onSetup={blocked ? vi.fn() : undefined} /></QueryClientProvider>)
  return api
}
describe('Standard medication catalog', () => {
  it('shows provenance and concentration without offering direct prescribing', async () => {
    setup()
    // 点击药品行触发查看，无需操作列按钮
    await userEvent.click(await screen.findByText('阿米卡星'))
    expect(await screen.findByText('0.1 g / 1 mL')).toBeInTheDocument()
    expect(screen.getByText(/已通过目录准入核对/)).toBeInTheDocument()
    expect(screen.getByText('table:1/row:16')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开药' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '操作' })).not.toBeInTheDocument()
  })
  it('does not query while typing and searches on enter or query button click', async () => {
    const api = setup()
    const input = screen.getByRole('searchbox')
    // 输入文本但未回车或点击查询时，不应以新文本发起查询
    await userEvent.type(input, '维生素B12')
    expect(api.masterData.standardMedications).not.toHaveBeenLastCalledWith('维生素B12', '', '', 0, 20)

    // 回车触发
    await userEvent.type(input, '{enter}')
    expect(api.masterData.standardMedications).toHaveBeenLastCalledWith('维生素B12', '', '', 0, 20)

    // 清空并点击查询按钮触发
    await userEvent.clear(input)
    await userEvent.type(input, '青霉素')
    await userEvent.click(screen.getByRole('button', { name: '查询标准药品' }))
    expect(api.masterData.standardMedications).toHaveBeenLastCalledWith('青霉素', '', '', 0, 20)
  })
  it('triggers detail view upon clicking the table row directly', async () => {
    setup()
    // 点击行内药品名称文本，而非特意点击查看按钮
    await userEvent.click(await screen.findByText('阿米卡星'))
    expect(await screen.findByText('0.1 g / 1 mL')).toBeInTheDocument()
    expect(screen.getByText('GEN-AMIKACIN')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '剂型形态' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '规格说明' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '强度语义' })).toBeInTheDocument()
  })
  it('shows the source identity defect and disables onboarding an incomplete specification', async () => {
    setup(false, true)
    await userEvent.click(await screen.findByText('阿米卡星'))
    expect(await screen.findByText('标准规格不完整，不能作为具体药品身份')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: '建立本院药品 注射液 1ml:0.1g'})).toBeDisabled()
  })
  it('shows a failed request instead of presenting it as an empty verified catalog', async () => {
    setup(true)
    expect(await screen.findByText('目录暂不可用')).toBeInTheDocument()
  })
  it('opens offline official PDF dialog with target page upon clicking view original button', async () => {
    setup()
    await userEvent.click(await screen.findByText('阿米卡星'))
    const jumpBtn = await screen.findByRole('button', { name: /查看原件.*第 15 页/ })
    expect(jumpBtn).toBeInTheDocument()
    await userEvent.click(jumpBtn)
    expect(screen.getByText('《国家基本药物目录（2026年版）》官方原件核验')).toBeInTheDocument()
    expect(screen.getByTitle(/国家基本药物目录官方原件 - 第 15 页/)).toBeInTheDocument()
  })
  it('opens official PDF dialog from toolbar notice button', async () => {
    setup()
    const toolbarBtn = await screen.findByRole('button', { name: '官方原件 PDF' })
    expect(toolbarBtn).toBeInTheDocument()
    await userEvent.click(toolbarBtn)
    expect(screen.getByText('《国家基本药物目录（2026年版）》官方原件核验')).toBeInTheDocument()
  })
})
