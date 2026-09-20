import type { ApiClient } from './httpClient'

export type PageTemplate = 'AUTO' | 'LIST' | 'RANKING' | 'TREND' | 'COMPARISON' | 'DASHBOARD' | 'CUSTOM'
export type PageDimension = 'DAY' | 'MONTH' | 'DEPARTMENT' | 'DIAGNOSIS' | 'ITEM' | 'ORDER_TYPE' | 'STATUS'
export type PagePeriod = { kind: 'MONTH_TO_DATE' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'YEAR_TO_DATE' | 'FIXED'; startDate?: string | null; endDate?: string | null }
export type AnalysisTurn = {role:'USER'|'ASSISTANT';content:string}
export type PlanMeasure = {code:string;name:string;source:string;sourceVersion:number;aggregate:'COUNT'|'COUNT_DISTINCT'|'SUM'|'AVG';field:string;filters:{field:string;operator:'EQ'|'IN'|'CONTAINS'|'GTE'|'LTE';values:string[]}[]}
export type SourceCatalog = {code:string;version:number;name:string;grain:string;definition:string;relation:string;dimensions:PageDimension[];fields:{code:string;name:string;databaseType:string;unit:string;aggregates:string[];operators:string[];values:Record<string,string>}[]}
export type PageWidget = {title:string;type:'KPI'|'BAR'|'LINE'|'TABLE';metrics:string[]}
export type PageSpec = { title: string; template: PageTemplate; metrics: string[]; dimension: PageDimension; scope: 'CURRENT' | 'AUTHORIZED'; period: PagePeriod; limit: number; measures?: PlanMeasure[] | null; widgets?:PageWidget[]|null }
export type PageMetric = {code:string;name:string;unit:string;definition:string;dimensions:PageDimension[]}
export type PageSeries = {code:string;name:string;unit:string;definition:string;total:number;groupCount:number;points:{key:string;label:string;value:number}[]}
export type PageResult = {spec:PageSpec;startDate:string;endDate:string;scopeName:string;timezone:string;fetchedAt:string;series:PageSeries[]}
export type SavedPage = {id:string;spec:PageSpec;savedAt:string;functionId?:string;version?:number;archived?:boolean}
export function createAnalysisPagesApi(client:ApiClient){return {
  pageSources:()=>client.request<SourceCatalog[]>('/api/analytics/pages/sources'),
  pageCatalog:()=>client.request<PageMetric[]>('/api/analytics/pages/catalog'),
  generatePage:(requirement:string,template:PageTemplate,context?:{currentSpec:PageSpec|null;history:AnalysisTurn[]})=>client.request<{status:'READY'|'CLARIFY'|'UNSUPPORTED';message:string;spec:PageSpec|null}>('/api/analytics/pages/generate',{method:'POST',body:JSON.stringify({requirement,template,...context})}),
  queryPage:(spec:PageSpec)=>client.request<PageResult>('/api/analytics/pages/query',{method:'POST',body:JSON.stringify(spec)}),
  savedPages:(includeArchived=false)=>client.request<SavedPage[]>(`/api/analytics/pages/saved?includeArchived=${includeArchived}`),
  updatePage:(id:string,spec:PageSpec)=>client.request<SavedPage>(`/api/analytics/pages/saved/${id}`,{method:'PUT',body:JSON.stringify(spec)}),
  renamePage:(id:string,title:string)=>client.request<SavedPage>(`/api/analytics/pages/saved/${id}/rename`,{method:'POST',body:JSON.stringify({title})}),
  archivePage:(id:string,archived:boolean)=>client.request<SavedPage>(`/api/analytics/pages/saved/${id}/archive`,{method:'POST',body:JSON.stringify({archived})}),
  pageHistory:(id:string)=>client.request<SavedPage[]>(`/api/analytics/pages/saved/${id}/history`),
  savePage:(spec:PageSpec)=>client.request<SavedPage>('/api/analytics/pages/saved',{method:'POST',body:JSON.stringify(spec)}),
}}
