package com.rhn.outpatient.api;

/**
 * 医嘱的收费进度，由 billing 提供。医嘱一旦被收费处调入结算单（含仅划价），金额即以结算单为准：
 * 结算单未付款时可先取消结算单再修改；已发起支付或已结算的，医生只能撤销后由收费处按冲销处理。
 */
public interface OrderPaymentDirectory {
    /**
     * @param forUpdate 锁定原收费记录，避免判断后、事务结束前被收费处调入结算
     */
    SettlementLock settlementLock(OrderFulfillmentGuard.OrderRef order, boolean forUpdate);

    enum SettlementLock {
        /** 未进结算单 */
        NONE,
        /** 只在未付款、可取消的结算单中：取消结算单后即可修改 */
        UNPAID,
        /** 已发起支付、已结算或医保结算处理中 */
        LOCKED
    }
}
