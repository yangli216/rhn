import type { ApiClient } from './httpClient'

export interface VitalSignRule {
  code: 'temperature' | 'pulse' | 'respiratory-rate' | 'systolic-pressure' | 'diastolic-pressure'
    | 'oxygen-saturation' | 'height' | 'weight' | 'intake-volume' | 'output-volume'
  name: string
  unit: string
  hardMinimum: number
  hardMaximum: number
  warningMinimum?: number | null
  warningMaximum?: number | null
}

export interface VitalValidationProfile {
  rules: VitalSignRule[]
}

export function createClinicalSafetyApi(client: ApiClient) {
  return {
    vitalSignRules: () => client.request<VitalValidationProfile>('/api/clinical-safety/vital-sign-rules'),
  }
}
