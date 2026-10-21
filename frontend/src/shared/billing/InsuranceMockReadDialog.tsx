import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ChsPersonInfoResponse, InsuranceSimulatorPersona } from '../api/billingApi'
import type { Resident } from '../model'
import { errorMessage, type RhnApi } from '../rhnApi'
import { Alert, Button, Dialog, Icon, StatusBadge } from '../ui'
import './insurance-credential-dialog.css'

/** 医保介质：社保卡读卡（证件类型 06）与医保电子凭证扫码（02）。 */
export type InsuranceMedia = 'CARD' | 'CODE'

export const INSURANCE_MEDIA = {
  CARD: { certType: '06', label: '读社保卡', action: '读卡', icon: 'card' as const },
  CODE: { certType: '02', label: '医保码', action: '扫码', icon: 'credential' as const },
}

export const insuranceMediaOfCertType = (certType: string): InsuranceMedia | undefined =>
  (Object.keys(INSURANCE_MEDIA) as InsuranceMedia[]).find((media) => INSURANCE_MEDIA[media].certType === certType)

/** 读证（1101）并定位到患者档案的结果；正式读卡与 mock 人员读取返回同一结构。 */
export interface InsuranceMediaRead {
  media: InsuranceMedia
  person: ChsPersonInfoResponse
  resident: Resident
}

/** 返回错误文案时留在弹窗内展示；返回空表示调用方已接收，弹窗关闭。 */
export type InsuranceReadHandler = (read: InsuranceMediaRead) => string | undefined

/**
 * 当前启用的是否为医保 mock 服务（后端 simulator 开关打开，且医保客户端是 mock 或本机 mock 网关）。
 * 读取失败或正式接入时 enabled 为 false，读卡入口走正式读证。
 */
export function useInsuranceSimulator(api: RhnApi) {
  return useQuery({
    queryKey: ['insurance-simulator'],
    queryFn: () => api.billing.insuranceSimulator(),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/**
 * mock 医保服务的读卡面板：选择 thirdparty-mock-server 预置的测试人员代替读卡器/扫码枪，
 * 按所选介质的证件类型走真实 1101 读证；需要调入患者时再定位本地演示库中对应的模拟患者。
 */
export function InsuranceMockReadDialog({ api, media, locateResident = false, onRead, onCancel }: {
  api: RhnApi
  media: InsuranceMedia
  /** 读证后按人员预置的档案号定位患者（调入患者）；否则只刷新鉴权凭证（resident 为空）。 */
  locateResident?: boolean
  onRead: (read: { media: InsuranceMedia; person: ChsPersonInfoResponse; resident?: Resident }) => string | undefined
  onCancel: () => void
}) {
  const simulator = useInsuranceSimulator(api)
  const personas = simulator.data?.personas ?? []
  const [personaId, setPersonaId] = useState('')
  const [handoffError, setHandoffError] = useState('')
  const persona = personas.find((item) => item.id === personaId) ?? personas[0]
  const meta = INSURANCE_MEDIA[media]

  const read = useMutation({
    mutationFn: async (target: InsuranceSimulatorPersona) => {
      const person = await api.billing.queryInsurancePerson({ psnCertType: meta.certType, certno: target.certNo, psnName: undefined })
      if (!locateResident) return { media, person }
      const candidates = await api.residents.search(target.residentKeyword)
      const resident = candidates.find((item) => item.healthRecordNo === target.residentKeyword) ?? candidates[0]
      if (!resident) throw new Error(`未找到模拟患者 ${target.residentKeyword}：请确认本地库已执行 V1_129_25 演示数据迁移`)
      return { media, person, resident }
    },
    onMutate: () => setHandoffError(''),
    onSuccess: (value) => setHandoffError(onRead(value) ?? ''),
  })
  const submit = (target = persona) => { if (target && !read.isPending) read.mutate(target) }

  return <Dialog title={`选择 Mock 参保人员${meta.action}`} size="wide" className="insurance-mock-read-modal"
    onClose={() => { if (!read.isPending) onCancel() }}
    actions={simulator.data?.consoleUrl
      ? <a className="insurance-mock-read__console" href={simulator.data.consoleUrl} target="_blank" rel="noreferrer">打开 Mock 控制台</a>
      : undefined}
    footer={<>
      <Button variant="secondary" onClick={onCancel} disabled={read.isPending}>取消</Button>
      <Button busy={read.isPending} disabled={!persona} onClick={() => submit()}>
        <Icon name={meta.icon} /><span>{meta.action}</span>
      </Button>
    </>}>
    <div className="insurance-mock-read">
      <p className="insurance-mock-read__intro">
        <StatusBadge tone="warning">MOCK</StatusBadge>
        <span>当前启用医保 Mock 服务，选择预置测试人员代替{media === 'CARD' ? '读卡器' : '扫码枪'}，按正式读证流程继续。</span>
      </p>
      {simulator.isPending ? <p className="insurance-mock-read__intro">正在加载 Mock 人员…</p>
        : <div className="insurance-mock-read__list" role="listbox" aria-label="Mock 参保人员">
          {personas.map((item) =>
            <Button key={item.id} variant="secondary" role="option" aria-selected={item.id === persona?.id}
              className="insurance-mock-read__persona" disabled={read.isPending}
              onClick={() => setPersonaId(item.id)} onDoubleClick={() => submit(item)}>
              <strong>{item.label}</strong>
              <code>{item.certNo}</code>
              <small>{item.expectation}</small>
            </Button>)}
        </div>}
      {read.error && <Alert tone="error">{errorMessage(read.error)}</Alert>}
      {handoffError && <Alert tone="error">{handoffError}</Alert>}
    </div>
  </Dialog>
}
