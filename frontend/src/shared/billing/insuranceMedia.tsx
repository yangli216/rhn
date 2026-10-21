import { useState, type ReactNode } from 'react'
import { type RhnApi } from '../rhnApi'
import { Button, Icon } from '../ui'
import { InsuranceCredentialDialog } from './InsuranceCredentialDialog'
import { INSURANCE_MEDIA, InsuranceMockReadDialog, useInsuranceSimulator, type InsuranceMedia, type InsuranceReadHandler } from './InsuranceMockReadDialog'

export { INSURANCE_MEDIA, InsuranceMockReadDialog, useInsuranceSimulator } from './InsuranceMockReadDialog'
export type { InsuranceMedia, InsuranceMediaRead, InsuranceReadHandler } from './InsuranceMockReadDialog'

/** 挂号、收费共用的医保读卡入口；正式服务与 mock 服务的按钮完全一致，差异只在点击后的读取方式。 */
export function InsuranceMediaButtons({ disabled, onRead }: { disabled?: boolean; onRead: (media: InsuranceMedia) => void }) {
  return <div className="insurance-media-buttons" role="group" aria-label="医保凭证读取">
    {(Object.keys(INSURANCE_MEDIA) as InsuranceMedia[]).map((media) =>
      <Button key={media} variant="secondary" disabled={disabled} onClick={() => onRead(media)}>
        <Icon name={INSURANCE_MEDIA[media].icon} /><span>{INSURANCE_MEDIA[media].label}</span>
      </Button>)}
  </div>
}

/**
 * 读卡入口的弹窗编排：mock 服务弹出预置人员选择面板，正式服务弹出读证面板（扫码枪/读卡器输入或手工录入）。
 * 两者都先走 1101 读证（凭证短时保存在后端，后续结算要用）再定位患者档案，结果经 onRead 交给页面。
 */
export function useInsuranceMediaReader(api: RhnApi, onRead: InsuranceReadHandler) {
  const simulator = useInsuranceSimulator(api)
  const [request, setRequest] = useState<{ media: InsuranceMedia; certNo?: string; mock: boolean } | null>(null)
  const close = () => setRequest(null)
  const deliver: InsuranceReadHandler = (read) => {
    const error = onRead(read)
    if (!error) close()
    return error
  }
  /** certNo：扫码枪已读到的凭证码，直接预填正式读证面板。 */
  const open = (media: InsuranceMedia, certNo?: string) =>
    setRequest({ media, certNo, mock: Boolean(simulator.data?.enabled && !certNo) })

  const dialog: ReactNode = !request ? null
    : request.mock
      ? <InsuranceMockReadDialog api={api} media={request.media} locateResident onCancel={close}
        onRead={({ resident, ...read }) => resident ? deliver({ ...read, resident }) : '未定位到模拟患者档案'} />
      : <InsuranceCredentialDialog api={api} lookupMode initialCertType={INSURANCE_MEDIA[request.media].certType}
        initialCertNo={request.certNo} onResident={(resident, person) => deliver({ media: request.media, person, resident })}
        onCancel={close} />
  return { open, dialog }
}

