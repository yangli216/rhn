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

    /** 1101 人员信息与参保状态鉴权获取 */
    PersonInfoResponse queryPersonInfo(PersonInfoRequest request);

    /** 2206 门诊费用预结算试算与基金/个账/自付分解 */
    PreSettleResponse preSettle(PreSettleRequest request);

    /** 2207 门诊费用正式结算（基金记账与个账划扣） */
    SettleResponse settle(SettleRequest request);

    /** 2208 门诊结算撤销 */
    ReversalResponse reverse(ReversalRequest request);
}
