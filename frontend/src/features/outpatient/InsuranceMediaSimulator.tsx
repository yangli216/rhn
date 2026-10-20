import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ChsPersonInfoResponse, InsuranceSimulatorPersona } from '../../shared/api/billingApi'
import type { Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Icon, Select, StatusBadge } from '../../shared/ui'

export type SimulatedMedia = 'CARD' | 'CODE'

export interface SimulatedInsuranceRead {
  persona: InsuranceSimulatorPersona
  media: SimulatedMedia
  person: ChsPersonInfoResponse
  resident: Resident
}

const MEDIA = {
  CARD: { certType: '06', label: '模拟读卡', icon: 'card' as const },
  CODE: { certType: '02', label: '模拟医保码', icon: 'credential' as const },
}

/** 医保联调模拟场景是否开启；未开启（含正式接入）时为 false，调用方不渲染任何模拟入口。 */
export function useInsuranceSimulator(api: RhnApi) {
  return useQuery({
    queryKey: ['insurance-simulator'],
    queryFn: () => api.billing.insuranceSimulator(),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/**
 * 模拟医保介质：对应联调用 mock 服务的测试人员，代替真实读卡器/医保码扫码枪。
 * 点击后依次走真实的 1101 读证（凭证短时保存在后端，后续预结算要用）并定位预置的模拟患者。
 * 仅当后端 simulator 开关打开时渲染。
 */
export function InsuranceMediaSimulator({ api, disabled, variant = 'inline', onRead, onCredentialRead }: {
  api: RhnApi
  /** card：收费页读取凭证弹窗内的紧凑卡片布局；inline：挂号页默认布局。 */
  variant?: 'inline' | 'card'
  disabled?: boolean
  /** 读证并定位预置模拟患者（挂号页）。 */
  onRead?: (value: SimulatedInsuranceRead) => void
  /** 仅刷新参保人鉴权凭证、不定位患者（收费页凭证失效重读）；提供时不查询患者档案。 */
  onCredentialRead?: (person: ChsPersonInfoResponse) => void
}) {
  const simulator = useInsuranceSimulator(api)
  const [personaId, setPersonaId] = useState('')
  const personas = simulator.data?.personas ?? []
  const persona = personas.find((item) => item.id === personaId) ?? personas[0]

  const read = useMutation({
    mutationFn: async (media: SimulatedMedia): Promise<SimulatedInsuranceRead | ChsPersonInfoResponse> => {
      if (!persona) throw new Error('没有可用的模拟人员')
      const person = await api.billing.queryInsurancePerson({
        psnCertType: MEDIA[media].certType, certno: persona.certNo, psnName: undefined,
      })
      if (onCredentialRead) return person
      const candidates = await api.residents.search(persona.residentKeyword)
      const resident = candidates.find((item) => item.healthRecordNo === persona.residentKeyword) ?? candidates[0]
      if (!resident) {
        throw new Error(`未找到模拟患者 ${persona.residentKeyword}：请确认本地库已执行 V1_129_25 演示数据迁移`)
      }
      return { persona, media, person, resident }
    },
    onSuccess: (value) => {
      if (onCredentialRead) onCredentialRead(value as ChsPersonInfoResponse)
      else onRead?.(value as SimulatedInsuranceRead)
    },
  })

  if (!simulator.data?.enabled || personas.length === 0) return null

  if (variant === 'card') {
    return <section className="insurance-media-simulator insurance-media-simulator--card" aria-label="医保 Mock 联调">
      <div className="insurance-media-simulator__head">
        <StatusBadge tone="warning">MOCK</StatusBadge>
        <strong>联调模拟</strong>
        {simulator.data.consoleUrl && <a className="insurance-media-simulator__console" href={simulator.data.consoleUrl} target="_blank" rel="noreferrer">打开 Mock 控制台</a>}
      </div>
      <Select aria-label="模拟参保人员" value={persona?.id ?? ''} disabled={disabled || read.isPending}
        options={personas.map((item) => ({ value: item.id, label: `${item.label}（${item.certNo}）` }))}
        onChange={setPersonaId} />
      <div className="insurance-media-simulator__actions">
        {(Object.keys(MEDIA) as SimulatedMedia[]).map((media) =>
          <Button key={media} size="sm" variant="secondary" busy={read.isPending && read.variables === media}
            disabled={disabled || read.isPending} onClick={() => read.mutate(media)}>
            <Icon name={MEDIA[media].icon} /><span>{MEDIA[media].label}</span>
          </Button>)}
      </div>
      {persona && <small className="insurance-media-simulator__hint">预期：{persona.expectation}</small>}
      {read.error && <Alert tone="error">{errorMessage(read.error)}</Alert>}
    </section>
  }

  return <section className="insurance-media-simulator" aria-label="医保 Mock 联调">
    <div className="insurance-media-simulator__head">
      <StatusBadge tone="warning">MOCK</StatusBadge>
      <strong>医保联调模拟</strong>
      <small>对应 thirdparty-mock-server 测试人员，仅联调环境显示</small>
      {simulator.data.consoleUrl && <a href={simulator.data.consoleUrl} target="_blank" rel="noreferrer">打开 Mock 控制台</a>}
    </div>
    <div className="insurance-media-simulator__body">
      <Select aria-label="模拟参保人员" value={persona?.id ?? ''} disabled={disabled || read.isPending}
        options={personas.map((item) => ({ value: item.id, label: `${item.label}（${item.certNo}）` }))}
        onChange={setPersonaId} />
      {(Object.keys(MEDIA) as SimulatedMedia[]).map((media) =>
        <Button key={media} size="sm" variant="secondary" busy={read.isPending && read.variables === media}
          disabled={disabled || read.isPending} onClick={() => read.mutate(media)}>
          <Icon name={MEDIA[media].icon} /><span>{MEDIA[media].label}</span>
        </Button>)}
    </div>
    {persona && <small className="insurance-media-simulator__hint">预期：{persona.expectation}</small>}
    {read.error && <Alert tone="error">{errorMessage(read.error)}</Alert>}
  </section>
}
