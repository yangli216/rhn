package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.api.FiscalReceiptAdapter;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalItem;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidResponse;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * 省财政医疗收费电子票据适配器 (Provincial Fiscal Receipt Adapter)。
 * 桥接 RHN 领域开票服务与财政电子票据中台客户端。
 */
@Component
public class ProvincialFiscalReceiptAdapter implements FiscalReceiptAdapter {

    private static final Set<String> SUPPORTED_AUTHORITIES = Set.of(
            "PROVINCIAL_FISCAL",
            "NATIONAL_FISCAL",
            "FISCAL_E_INVOICE",
            "360000",
            "FISCAL",
            "DEFAULT"
    );

    private final NationalFiscalReceiptClient fiscalClient;

    public ProvincialFiscalReceiptAdapter(NationalFiscalReceiptClient fiscalClient) {
        this.fiscalClient = fiscalClient;
    }

    @Override
    public boolean supports(String fiscalAuthorityCode, String receiptType) {
        if ("LOCAL".equalsIgnoreCase(fiscalAuthorityCode) && !"MEDICAL_E_INVOICE".equalsIgnoreCase(receiptType)) {
            return false;
        }
        if ("MEDICAL_E_INVOICE".equalsIgnoreCase(receiptType)) {
            return true;
        }
        return fiscalAuthorityCode != null && SUPPORTED_AUTHORITIES.contains(fiscalAuthorityCode.toUpperCase());
    }

    @Override
    public ReceiptResult issue(ReceiptInstruction instruction) {
        List<FiscalItem> items = instruction.lines() == null ? Collections.emptyList() :
                instruction.lines().stream().map(line -> new FiscalItem(
                        line.lineNo(),
                        line.categoryCode(),
                        line.itemCode(),
                        line.itemName(),
                        line.quantity(),
                        line.amount()
                )).toList();

        FiscalIssueRequest request = new FiscalIssueRequest(
                instruction.receiptId(),
                instruction.settlementId(),
                instruction.receiptRequestNo(),
                instruction.idempotencyKey(),
                instruction.receiptType(),
                instruction.issueChannel(),
                instruction.fiscalAuthorityCode(),
                instruction.payerName(),
                instruction.payerIdentityDigest(),
                instruction.amount(),
                instruction.roundingAmount(),
                instruction.insuranceAmount(),
                instruction.personalAccountAmount(),
                instruction.patientAmount(),
                instruction.otherFundAmount(),
                instruction.currencyCode(),
                items,
                instruction.correlationId()
        );

        FiscalIssueResponse response = fiscalClient.issue(request);
        ReceiptResult.Outcome outcome = outcome(response);
        if (outcome != ReceiptResult.Outcome.ISSUED && outcome != ReceiptResult.Outcome.PENDING && outcome != ReceiptResult.Outcome.FAILED) {
            throw new IllegalStateException("开具接口返回了非开具阶段结果");
        }
        if (response.success()) {
            return new ReceiptResult(
                    outcome,
                    response.externalReceiptNo(),
                    response.fiscalCode(),
                    response.fiscalNumber(),
                    response.verificationCode(),
                    response.verifyUrl(),
                    response.issuedAt(),
                    null,
                    null,
                    null
            );
        } else {
            return new ReceiptResult(
                    outcome,
                    response.externalReceiptNo(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    response.errorCode(),
                    response.errorMessage(),
                    null
            );
        }
    }

    @Override
    public ReceiptResult query(String receiptRequestNo, String externalReceiptNo, String correlationId) {
        FiscalIssueResponse response = fiscalClient.query(receiptRequestNo, externalReceiptNo, correlationId);
        ReceiptResult.Outcome outcome = outcome(response);
        if (response.success()) {
            return new ReceiptResult(
                    outcome,
                    response.externalReceiptNo(),
                    response.fiscalCode(),
                    response.fiscalNumber(),
                    response.verificationCode(),
                    response.verifyUrl(),
                    response.issuedAt(),
                    null,
                    null,
                    null
            );
        } else {
            return new ReceiptResult(
                    outcome,
                    response.externalReceiptNo(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    response.errorCode(),
                    response.errorMessage(),
                    null
            );
        }
    }

    @Override
    public ReceiptResult voidReceipt(ReceiptAction instruction) {
        FiscalVoidRequest request = new FiscalVoidRequest(
                instruction.receiptId(),
                instruction.receiptRequestNo(),
                instruction.idempotencyKey(),
                instruction.externalReceiptNo(),
                instruction.reason(),
                instruction.correlationId()
        );
        FiscalVoidResponse response = fiscalClient.voidReceipt(request);
        if (response.success()) {
            return new ReceiptResult(
                    ReceiptResult.Outcome.VOIDED,
                    response.externalReceiptNo(),
                    null,
                    null,
                    null,
                    null,
                    response.voidedAt(),
                    null,
                    null,
                    null
            );
        } else {
            return new ReceiptResult(
                    ReceiptResult.Outcome.FAILED,
                    response.externalReceiptNo(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    response.errorCode(),
                    response.errorMessage(),
                    null
            );
        }
    }

    @Override
    public ReceiptResult redFlush(ReceiptAction instruction) {
        FiscalRedFlushRequest request = new FiscalRedFlushRequest(
                instruction.receiptId(),
                instruction.receiptRequestNo(),
                instruction.idempotencyKey(),
                instruction.externalReceiptNo(),
                null,
                null,
                instruction.reason(),
                instruction.correlationId()
        );
        FiscalRedFlushResponse response = fiscalClient.redFlush(request);
        if (response.success()) {
            return new ReceiptResult(
                    ReceiptResult.Outcome.RED_FLUSHED,
                    response.redExternalReceiptNo(),
                    response.redFiscalCode(),
                    response.redFiscalNumber(),
                    response.verificationCode(),
                    response.verifyUrl(),
                    response.issuedAt(),
                    null,
                    null,
                    null
            );
        } else {
            return new ReceiptResult(
                    ReceiptResult.Outcome.FAILED,
                    response.redExternalReceiptNo(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    response.errorCode(),
                    response.errorMessage(),
                    null
            );
        }
    }
    private ReceiptResult.Outcome outcome(FiscalIssueResponse response) {
        if (response == null || response.outcome() == null) throw new IllegalStateException("财政回执状态缺失");
        ReceiptResult.Outcome outcome;
        try { outcome = ReceiptResult.Outcome.valueOf(response.outcome()); }
        catch (IllegalArgumentException exception) { throw new IllegalStateException("财政回执状态无法识别", exception); }
        boolean success = outcome == ReceiptResult.Outcome.ISSUED || outcome == ReceiptResult.Outcome.VOIDED || outcome == ReceiptResult.Outcome.RED_FLUSHED;
        if (success != response.success()) throw new IllegalStateException("财政回执成功标志与业务状态不一致");
        return outcome;
    }

}
