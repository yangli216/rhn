package com.rhn.billing.api;

import java.math.BigDecimal;

/** Inbound insurance boundary invoked only after the adapter verifies identity and message integrity. */
public interface InsuranceResultDirectory {
    InsuranceSettlementView accept(VerifiedInsuranceResult result);

    record VerifiedInsuranceResult(
            String regionCode, String externalMessageBusinessId, String commandCode,
            String settlementNo, Operation operation, String externalSettlementNo, ResultStatus status,
            BigDecimal insuranceFundAmount, BigDecimal personalAccountAmount,
            BigDecimal patientCashAmount, BigDecimal otherFundAmount,
            String errorCode, String errorMessage, Object sanitizedPayload) {
        public enum ResultStatus { SUCCEEDED, PENDING, FAILED }
        public enum Operation { PRE_SETTLE, SETTLE, REVERSE }
    }

    record InsuranceSettlementView(
            Long claimId, long revision, Long settlementId, Long patientAccountId, Long coverageId,
            String claimNo, String settlementNo, String status, String currentOperation,
            String regionCode, String insuranceTypeCode, String externalPreSettlementNo,
            String externalSettlementNo, BigDecimal grossAmount,
            BigDecimal insuranceFundAmount, BigDecimal personalAccountAmount,
            BigDecimal patientCashAmount, BigDecimal otherFundAmount, String currencyCode,
            String reversalReason, java.time.Instant reversedAt,
            String errorCode, String errorMessage, boolean duplicate,
            java.util.List<InsuranceClaimLineView> lines,
            java.util.List<InsuranceClaimResponseView> responses) {}

    record InsuranceClaimLineView(Long id, Long settlementLineId, int lineNo, String itemCode,
                                  String insuranceItemCode, String itemName, String categoryCode,
                                  BigDecimal quantity, BigDecimal unitPrice, BigDecimal claimedAmount,
                                  BigDecimal approvedAmount, String rejectionCode) {}

    record InsuranceClaimResponseView(Long id, Long externalMessageId, String responseNo,
                                      String commandCode, String operation, String status,
                                      String externalSettlementNo, BigDecimal insuranceFundAmount,
                                      BigDecimal personalAccountAmount, BigDecimal patientCashAmount,
                                      BigDecimal otherFundAmount, String errorCode, String errorMessage,
                                      java.time.Instant respondedAt) {}

    /** 1101 医保人员信息查询请求（对外契约，屏蔽 CHS 专网报文模型）。 */
    record PersonInfoQuery(String certType, String certNo, String personName) {}

    /** 1101 医保人员信息查询结果（对外契约，字段语义对标国家医保平台标准）。 */
    record PersonInfoView(String personNo, String certType, String certNo, String personName, String gender,
                          java.time.LocalDate birthday, String insuranceType, String insuranceTypeName,
                          BigDecimal accountBalance, String regionCode, String regionName,
                          String personCategory, String status) {}
}
