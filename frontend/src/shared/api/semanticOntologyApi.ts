import type { ApiClient } from './httpClient'

export interface OntologyNodeDto {
  id: string
  label: string
  entityCode: string
  table: string | null
  primaryKey: string
  grain: string
  description: string
  nodeType: 'FACT' | 'DIMENSION' | 'BRIDGE'
  metricCount: number
  dimensionCount: number
  attributes: string[]
}

export interface JoinCondition {
  fromField: string
  toField: string
}

export interface OntologyEdgeDto {
  id: string
  source: string
  target: string
  cardinality: string
  conditions: JoinCondition[]
  aggregationSafe: boolean
  fanoutRisk: boolean
  label: string
}

export interface DimensionAttribute {
  code: string
  name: string
  aliases: string[]
  physicalColumn: string
  valueAliases?: Record<string, string[]>
}

export interface DimensionDefinition {
  code: string
  name: string
  aliases: string[]
  entity: string
  field: string
  grain: string
  attributes?: DimensionAttribute[]
}

export interface DefaultFilter {
  field: string
  op: string
  values: string[]
}

export interface MetricDefinition {
  code: string
  name: string
  aliases: string[]
  description: string
  domain: string
  source: string
  field: string
  aggregate: string
  grain: string
  defaultFilters: DefaultFilter[]
  timeDimension: string
  supportedDimensions: string[]
  forbiddenMeanings: string[]
}

export interface OntologyGraphDto {
  version: string
  domain: string
  nodes: OntologyNodeDto[]
  edges: OntologyEdgeDto[]
  dimensions: DimensionDefinition[]
  metrics: MetricDefinition[]
  statistics: {
    entityCount: number
    relationshipCount: number
    dimensionCount: number
    metricCount: number
    fanoutRiskCount: number
    assetPath: string
  }
}

export interface CopilotSuggestRequest {
  prompt: string
  targetEntity?: string
}

export interface CopilotSuggestResponse {
  status: string
  rationale: string
  suggestedYamlDiff?: string
  suggestedRules?: Record<string, any>
}

export interface SemanticExecutionResult {
  planId: string | null
  status: 'READY' | 'CLARIFY' | 'UNSUPPORTED'
  explanation: string
  columns: Array<{ code: string; name: string; alias: string; type: 'DIMENSION' | 'MEASURE' }>
  rows: Array<Record<string, any>>
  totalRows: number
  executionTimeMs: number
  compiledSql?: string
  parameters?: Record<string, any>
  summary?: Record<string, any>
  clarification?: {
    code: string
    message: string
    options: Array<{ code: string; name: string; description: string }>
  }
}

export function createSemanticOntologyApi(client: ApiClient) {
  return {
    ontologyGraph: () => client.request<OntologyGraphDto>('/api/analytics/v2/ontology/graph'),
    copilotSuggest: (request: CopilotSuggestRequest) =>
      client.request<CopilotSuggestResponse>('/api/analytics/v2/ontology/copilot/suggest', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    executeV2: (request: { text?: string; query?: any; scope?: any }) =>
      client.request<SemanticExecutionResult>('/api/analytics/v2/execute', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
  }
}
