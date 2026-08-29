package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Outbound port for an authenticated regional insurance adapter. The billing core only exchanges
 * normalized claim lines and fund allocations; protocol codes, certificates and signatures stay in
 * the adapter implementation.
 */
public interface InsuranceSettlementAdapter {
    boolean supports(String regionCode, String insuranceTypeCode);

    InsuranceResult preSettle(InsuranceInstruction instruction);

    InsuranceResult settle(InsuranceInstruction instruction, String preSettlementNo);

    InsuranceResult query(InsuranceQuery instruction);

    InsuranceResult reverse(InsuranceReversal instruction);

    record InsuranceInstruction(
            Long claimId, Long settlementId, String settlementNo, String idempotencyKey, Long patientAccountId,
            Long residentId, Long encounterId, Long coverageId, String regionCode, String insuranceTypeCode,
            String organizationCode, String departmentCode, String practitionerCode,
            Instant serviceStartedAt, Instant serviceEndedAt, String diagnosisPayloadDigest,
            List<InsuranceLine> lines, BigDecimal grossAmount, String currencyCode,
            String correlationId) {}

    record InsuranceQuery(Long claimId, String claimNo, String operation, String regionCode,
                          String insuranceTypeCode, String externalPreSettlementNo,
                          String externalSettlementNo, String correlationId) {}

    record InsuranceLine(
            Long settlementLineId, Long chargeItemId, String itemCode, String insuranceItemCode,
            String itemName, BigDecimal quantity, BigDecimal unitPrice, BigDecimal amount,
            String categoryCode, Map<String, String> traceAttributes) {}

    record InsuranceResult(
            Outcome outcome, String externalSettlementNo, String externalMessageBusinessId,
            BigDecimal insuranceFundAmount, BigDecimal personalAccountAmount,
            BigDecimal patientCashAmount, BigDecimal otherFundAmount, String currencyCode,
            String errorCode, String errorMessage, Object sanitizedPayload) {
        public enum Outcome { SUCCEEDED, PENDING, FAILED }
    }

    record InsuranceReversal(
            Long claimId, Long settlementId, String settlementNo, String idempotencyKey,
            String regionCode, String insuranceTypeCode,
            String originalExternalSettlementNo, BigDecimal amount, String reason,
            String correlationId) {}
}
