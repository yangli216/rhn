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
                "receipt-object:" + instruction.receiptId(), Instant.now(), null, null, null);
    }

    @Override
    public ReceiptResult query(String receiptRequestNo, String externalReceiptNo, String correlationId) {
        return new ReceiptResult(ReceiptResult.Outcome.ISSUED, externalReceiptNo, "LOCAL", receiptRequestNo,
                null, null, Instant.now(), null, null, null);
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
