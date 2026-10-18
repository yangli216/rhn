package com.rhn.billing.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** 结算惠民减免的对外视图。 */
public final class ReliefViews {
    private ReliefViews() {}

    /** 一项政策在本次计算中的结果：已减免、不适用（附原因）或待人工核准。 */
    public record ReliefOutcomeView(Long policyId, String policyName,
                                    @DictionaryBinding("BIL_RELIEF_TIMING") String timing,
                                    @DictionaryBinding("BIL_RELIEF_OUTCOME_STATUS") String status, String message,
                                    BigDecimal baseAmount, BigDecimal reliefAmount) {}

    public record ReliefApplicationLineView(Long settlementLineId, Long chargeItemId, BigDecimal baseAmount,
                                            BigDecimal reliefAmount) {}

    public record ReliefApplicationView(Long id, Long policyId, String policyName, Long policyVersionId,
                                        @DictionaryBinding("BIL_RELIEF_TIMING") String timing,
                                        @DictionaryBinding("BIL_RELIEF_SPONSOR") String sponsor,
                                        BigDecimal baseAmount, BigDecimal reliefAmount,
                                        @DictionaryBinding("BIL_RELIEF_APPLICATION_STATUS") String status,
                                        String manualReason, Long approvedBy, Instant createdAt,
                                        List<ReliefApplicationLineView> lines) {}

    /** 结算减免概况：已落账的减免，以及当前仍可执行的医保后政策预览。 */
    public record SettlementReliefView(Long settlementId, BigDecimal discountAmount, BigDecimal reliefAmount,
                                       BigDecimal outstandingAmount, List<ReliefApplicationView> applications,
                                       List<ReliefOutcomeView> pending) {}
}
