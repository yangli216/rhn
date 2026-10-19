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
            String correlationId, String externalPersonNo, List<InsuranceDiagnosis> diagnoses,
            String reusableVisitId) {
        /** 挂号环节医保申请没有就诊诊断，诊断摘要使用该固定标记，不得用其他内容冒充诊断。 */
        public static final String REGISTRATION_SCENE_DIGEST = "REGISTRATION-NO-DIAGNOSIS";

        public boolean registrationScene() { return REGISTRATION_SCENE_DIGEST.equals(diagnosisPayloadDigest); }

        public InsuranceInstruction(Long claimId, Long settlementId, String settlementNo, String idempotencyKey, Long patientAccountId,
                                    Long residentId, Long encounterId, Long coverageId, String regionCode, String insuranceTypeCode,
                                    String organizationCode, String departmentCode, String practitionerCode,
                                    Instant serviceStartedAt, Instant serviceEndedAt, String diagnosisPayloadDigest,
                                    List<InsuranceLine> lines, BigDecimal grossAmount, String currencyCode, String correlationId) {
            this(claimId, settlementId, settlementNo, idempotencyKey, patientAccountId, residentId, encounterId, coverageId,
                    regionCode, insuranceTypeCode, organizationCode, departmentCode, practitionerCode, serviceStartedAt,
                    serviceEndedAt, diagnosisPayloadDigest, lines, grossAmount, currencyCode, correlationId, null, List.of(), null);
        }

        public InsuranceInstruction(Long claimId, Long settlementId, String settlementNo, String idempotencyKey, Long patientAccountId,
                                    Long residentId, Long encounterId, Long coverageId, String regionCode, String insuranceTypeCode,
                                    String organizationCode, String departmentCode, String practitionerCode,
                                    Instant serviceStartedAt, Instant serviceEndedAt, String diagnosisPayloadDigest,
                                    List<InsuranceLine> lines, BigDecimal grossAmount, String currencyCode, String correlationId,
                                    String externalPersonNo, List<InsuranceDiagnosis> diagnoses) {
            this(claimId, settlementId, settlementNo, idempotencyKey, patientAccountId, residentId, encounterId, coverageId,
                    regionCode, insuranceTypeCode, organizationCode, departmentCode, practitionerCode, serviceStartedAt,
                    serviceEndedAt, diagnosisPayloadDigest, lines, grossAmount, currencyCode, correlationId, externalPersonNo,
                    diagnoses, null);
        }

        public InsuranceInstruction {
            diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
        }

        public InsuranceInstruction(Long claimId, Long settlementId, String settlementNo, String idempotencyKey, Long patientAccountId,
                                    Long residentId, Long encounterId, Long coverageId, String regionCode, String insuranceTypeCode,
                                    String organizationCode, String departmentCode, String practitionerCode,
                                    Instant serviceStartedAt, Instant serviceEndedAt, String diagnosisPayloadDigest,
                                    List<InsuranceLine> lines, BigDecimal grossAmount, String currencyCode, String correlationId,
                                    String externalPersonNo) {
            this(claimId, settlementId, settlementNo, idempotencyKey, patientAccountId, residentId, encounterId, coverageId,
                    regionCode, insuranceTypeCode, organizationCode, departmentCode, practitionerCode, serviceStartedAt,
                    serviceEndedAt, diagnosisPayloadDigest, lines, grossAmount, currencyCode, correlationId, externalPersonNo, List.of(), null);
        }
    }

    /** 已确认的本次就诊结构化诊断；类型取 PRIMARY 或其他，序号自 1 起，主诊断在前。 */
    record InsuranceDiagnosis(String diagnosisTypeCode, int sortNo, String code, String name) {}

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
            String correlationId, Long residentId, Long coverageId, String practitionerCode, String currencyCode,
            BigDecimal insuranceFundAmount, BigDecimal personalAccountAmount,
            BigDecimal patientCashAmount, BigDecimal otherFundAmount, String externalPersonNo,
            boolean registrationScene) {
        public InsuranceReversal(Long claimId, Long settlementId, String settlementNo, String idempotencyKey,
                                 String regionCode, String insuranceTypeCode,
                                 String originalExternalSettlementNo, BigDecimal amount, String reason,
                                 String correlationId, Long residentId, Long coverageId, String practitionerCode, String currencyCode,
                                 BigDecimal insuranceFundAmount, BigDecimal personalAccountAmount,
                                 BigDecimal patientCashAmount, BigDecimal otherFundAmount, String externalPersonNo) {
            this(claimId, settlementId, settlementNo, idempotencyKey, regionCode, insuranceTypeCode, originalExternalSettlementNo,
                    amount, reason, correlationId, residentId, coverageId, practitionerCode, currencyCode, insuranceFundAmount,
                    personalAccountAmount, patientCashAmount, otherFundAmount, externalPersonNo, false);
        }

        public InsuranceReversal(Long claimId, Long settlementId, String settlementNo, String idempotencyKey,
                                 String regionCode, String insuranceTypeCode,
                                 String originalExternalSettlementNo, BigDecimal amount, String reason,
                                 String correlationId, Long residentId, Long coverageId, String practitionerCode, String currencyCode,
                                 BigDecimal insuranceFundAmount, BigDecimal personalAccountAmount,
                                 BigDecimal patientCashAmount, BigDecimal otherFundAmount) {
            this(claimId, settlementId, settlementNo, idempotencyKey, regionCode, insuranceTypeCode, originalExternalSettlementNo,
                    amount, reason, correlationId, residentId, coverageId, practitionerCode, currencyCode, insuranceFundAmount,
                    personalAccountAmount, patientCashAmount, otherFundAmount, null, false);
        }
    }
}
