package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidResponse;

/**
 * 财政电子票据平台客户端端口接口 (National/Provincial Fiscal Receipt Client Port)。
 * 涵盖医疗门诊电子票据规范的核心业务交互：
 * - 电子票据开具与四要素生成 (issue)
 * - 电子票据状态与防伪查询 (query)
 * - 电子票据作废 (voidReceipt)
 * - 电子票据红字冲红 (redFlush)
 */
public interface NationalFiscalReceiptClient {

    /** 开具医疗收费电子票据 */
    FiscalIssueResponse issue(FiscalIssueRequest request);

    /** 查验/查询电子票据当前状态 */
    FiscalIssueResponse query(String receiptRequestNo, String externalReceiptNo, String correlationId);

    /** 作废电子票据 */
    FiscalVoidResponse voidReceipt(FiscalVoidRequest request);

    /** 开具红字冲红电子票据 */
    FiscalRedFlushResponse redFlush(FiscalRedFlushRequest request);
}
