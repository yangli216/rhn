package com.rhn.billing.api;

import java.time.Instant;
import java.util.List;

/** 医保接入向导调试控制台的接口契约。 */
public final class InsuranceDebugViews {
    private InsuranceDebugViews() {}

    public record InfnoOption(String code, String name, boolean important) {}

    public record DebugSettingsView(boolean enabled, boolean effectivelyEnabled, String scope, List<String> selectedInfnos,
                                    String retention, int keepDays, Instant enabledUntil, long revision,
                                    List<InfnoOption> knownInfnos, boolean rawAllowed) {}

    /** autoDisableHours 为空表示不自动关闭；留存级别为 RAW 时必填且不超过 24，并须 confirmRaw。 */
    public record UpdateDebugSettings(boolean enabled, String scope, List<String> selectedInfnos, String retention,
                                      Integer keepDays, Integer autoDisableHours, boolean confirmRaw, Long expectedRevision) {}

    public record ExchangeSummary(String id, String infno, String infnoName, Instant startedAt, long durationMs, Integer httpStatus,
                                  String infcode, String errMsg, String outcome, String outcomeText, String actor, String retention,
                                  String claimId, String claimNo) {}

    public record ExchangeDetail(ExchangeSummary summary, String correlationId, String request, String response, boolean rawVisible) {}

    public record ExchangePage(List<ExchangeSummary> content, long totalElements, int totalPages, int page, int size) {}

    /** 待人工处理的医保申请。canQuery/canReverse 是按当前状态给出的操作建议，真正的校验仍在服务端。 */
    public record ClaimAttentionView(String claimId, String claimNo, String settlementNo, String status, String statusText,
                                     String currentOperation, String reason, String errorCode, String errorMessage,
                                     java.math.BigDecimal grossAmount, java.math.BigDecimal insuranceFundAmount,
                                     java.math.BigDecimal personalAccountAmount, java.math.BigDecimal patientCashAmount,
                                     String externalSettlementNo, String reversalReason, boolean canQuery, boolean canReverse) {}

    /** confirmClaimNo 须与申请号一致，防止点错行；reason 写入冲正原因。 */
    public record ReverseClaimRequest(String reason, String confirmClaimNo) {}

    public record ClaimActionResult(String outcome, String message, ClaimAttentionView claim) {}
}
