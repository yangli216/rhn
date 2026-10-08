package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PreSettleRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PreSettleResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.ReversalRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.ReversalResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.SettleRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.SettleResponse;

/**
 * Port interface for National Healthcare Security Administration (CHS) Platform.
 * 覆盖国家医保规范业务交互：
 * - 1101 人员信息获取 (queryPersonInfo)
 * - 2206 门诊预结算试算分解 (preSettle)
 * - 2207 门诊正式结算确认 (settle)
 * - 2208 门诊结算撤销 (reverse)
 */
public interface NationalInsuranceClient {

    /** 是否具备执行交易的能力；未接入的正式客户端必须返回 false。 */
    default boolean isAvailable() { return true; }

    /**
     * Build protocol requests from verified external identity, operator and catalog metadata.
     * The default refuses to invent that context. Only the explicitly enabled mock client may
     * synthesize protocol fixtures; implementing network calls alone does not enable this step.
     */
    default PreSettleRequest preparePreSettle(com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction input) {
        throw com.rhn.shared.api.BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "医保人员标识和费用分类映射尚未接入");
    }
    default SettleRequest prepareSettle(com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction input, String preSettlementNo) {
        throw com.rhn.shared.api.BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "医保人员及操作员标识尚未接入");
    }
    default ReversalRequest prepareReversal(com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceReversal input) {
        throw com.rhn.shared.api.BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "医保冲正的原人员及操作员标识尚未接入");
    }

    /** 1101 人员信息与参保状态鉴权获取 */
    PersonInfoResponse queryPersonInfo(PersonInfoRequest request);

    /** 2206 门诊费用预结算试算与基金/个账/自付分解 */
    PreSettleResponse preSettle(PreSettleRequest request);

    /** 2207 门诊费用正式结算（基金记账与个账划扣） */
    SettleResponse settle(SettleRequest request);

    /** 2208 门诊结算撤销 */
    ReversalResponse reverse(ReversalRequest request);
}
