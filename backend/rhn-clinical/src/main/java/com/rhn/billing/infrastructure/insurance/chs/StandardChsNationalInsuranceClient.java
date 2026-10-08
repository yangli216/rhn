package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.infrastructure.insurance.chs.ChsModels.*;
import com.rhn.shared.api.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** 正式网关尚未接入时拒绝执行，不能以本地试算替代医保平台结果。 */
@Component
@ConditionalOnProperty(name = "rhn.billing.insurance.chs.mock-enabled", havingValue = "false", matchIfMissing = true)
public class StandardChsNationalInsuranceClient implements NationalInsuranceClient {
    static final String UNAVAILABLE_CODE = "CHS_GATEWAY_NOT_IMPLEMENTED";
    static final String UNAVAILABLE_MESSAGE = "医保正式网关尚未接入，无法查询参保信息或办理结算，请联系管理员";

    @Override
    public boolean isAvailable() { return false; }

    @Override
    public PersonInfoResponse queryPersonInfo(PersonInfoRequest request) { throw unavailable(); }

    @Override
    public PreSettleResponse preSettle(PreSettleRequest request) { throw unavailable(); }

    @Override
    public SettleResponse settle(SettleRequest request) { throw unavailable(); }

    @Override
    public ReversalResponse reverse(ReversalRequest request) { throw unavailable(); }

    private BusinessException unavailable() {
        return new BusinessException(UNAVAILABLE_CODE, UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }
}
