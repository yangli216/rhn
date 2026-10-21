import type { RhnApi } from '../../../shared/rhnApi'

export type UnpaidSettlementApi = Pick<RhnApi['billing'], 'cancelUnpaidSettlements'>

/** 医嘱所在结算单尚未付款时，后端以此编码拒绝修改或取消签署，提示先取消结算单。 */
export const UNPAID_SETTLEMENT_BLOCK = 'ORDER_SETTLEMENT_UNPAID'

/**
 * 修改或取消签署被未付款结算单挡住时，先取消本就诊的未付款结算单（收费回到待结算），再重试一次。
 * 结算单已发起支付、医保撤销失败等情况由取消接口给出原因，原样提示医生。
 */
export async function retryAfterReleasingUnpaidSettlements<T>(billing: UnpaidSettlementApi | undefined,
  encounterId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!billing || (error as { code?: string } | null)?.code !== UNPAID_SETTLEMENT_BLOCK) throw error
    await billing.cancelUnpaidSettlements(encounterId, '医生修改医嘱，取消未付款结算单')
    return run()
  }
}
