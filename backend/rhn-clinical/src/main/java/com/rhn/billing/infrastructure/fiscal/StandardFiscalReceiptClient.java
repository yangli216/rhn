package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.infrastructure.fiscal.FiscalModels.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** 正式财政网关尚未接入时明确失败，不生成虚假票据或成功回执。 */
@Component
@ConditionalOnProperty(name = "rhn.billing.fiscal.mock-enabled", havingValue = "false", matchIfMissing = true)
public class StandardFiscalReceiptClient implements NationalFiscalReceiptClient {
    private static final String CODE = "FISCAL_GATEWAY_NOT_IMPLEMENTED";
    private static final String MESSAGE = "财政正式网关尚未接入，无法办理或确认电子票据，请联系管理员";

    @Override
    public FiscalIssueResponse issue(FiscalIssueRequest request) {
        return FiscalIssueResponse.failed(CODE, MESSAGE);
    }

    @Override
    public FiscalIssueResponse query(String receiptRequestNo, String externalReceiptNo, String correlationId) {
        // 无法查询时不能推定原交易失败，以免触发重复开票。
        return FiscalIssueResponse.pending(externalReceiptNo, CODE, MESSAGE);
    }

    @Override
    public FiscalVoidResponse voidReceipt(FiscalVoidRequest request) {
        return FiscalVoidResponse.failed(CODE, MESSAGE);
    }

    @Override
    public FiscalRedFlushResponse redFlush(FiscalRedFlushRequest request) {
        return FiscalRedFlushResponse.failed(CODE, MESSAGE);
    }
}
