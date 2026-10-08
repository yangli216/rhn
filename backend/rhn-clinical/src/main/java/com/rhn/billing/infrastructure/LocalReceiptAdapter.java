package com.rhn.billing.infrastructure;

import com.rhn.billing.api.FiscalReceiptAdapter;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class LocalReceiptAdapter implements FiscalReceiptAdapter {
    @Override
    public boolean supports(String fiscalAuthorityCode, String receiptType) {
        return "LOCAL".equals(fiscalAuthorityCode) && ("RECEIPT".equals(receiptType) || "VIRTUAL".equals(receiptType));
    }

    @Override
    public ReceiptResult issue(ReceiptInstruction instruction) {
        return new ReceiptResult(ReceiptResult.Outcome.ISSUED, "LOCAL-" + instruction.receiptRequestNo(),
                "LOCAL", instruction.receiptRequestNo(), null,
                null, Instant.now(), null, null, null);
    }

    @Override
    public ReceiptResult query(String receiptRequestNo, String externalReceiptNo, String correlationId) {
        throw com.rhn.shared.api.BusinessErrors.conflict("LOCAL_RECEIPT_RESULT_UNVERIFIED",
                "本地票据查询须核实已保存的开具事实，不能仅凭申请号推定已开具");
    }

    @Override
    public ReceiptResult voidReceipt(ReceiptAction instruction) {
        return new ReceiptResult(ReceiptResult.Outcome.VOIDED, instruction.externalReceiptNo(), "LOCAL",
                instruction.receiptRequestNo(), null, null, Instant.now(), null, null, null);
    }

    @Override
    public ReceiptResult redFlush(ReceiptAction instruction) {
        return new ReceiptResult(ReceiptResult.Outcome.RED_FLUSHED, "RED-" + instruction.receiptRequestNo(), "LOCAL",
                instruction.receiptRequestNo(), null, null, Instant.now(), null, null, null);
    }
}
