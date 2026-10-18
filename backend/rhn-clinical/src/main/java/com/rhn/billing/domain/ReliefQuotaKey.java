package com.rhn.billing.domain;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Set;

/**
 * 额度累计键：政策 + 居民 + 周期 + 共享范围 + 额度对象。
 * 周期键随结算业务日期计算；不设周期或按政策期计算时整个政策期共用一个键。
 * 不共享时，挂号、门诊、药房归入门诊，住院与家庭病床归入住院；机构不共享时按结算机构区分。
 */
public record ReliefQuotaKey(Long policyId, Long residentId, String periodKey, String shareKey, String scopeKey) {
    public static final String POLICY_SCOPE = "POLICY";
    private static final Set<String> INPATIENT_SCENES = Set.of("INPATIENT", "HOME_BED");

    public static ReliefQuotaKey of(Long policyId, Long residentId, ReliefQuotaPeriod period, LocalDate businessDate,
                                    boolean shareAcrossScenes, boolean shareAcrossOrganizations,
                                    String settlementScene, Long organizationId, String scopeKey) {
        return new ReliefQuotaKey(policyId, residentId, periodKey(period, businessDate),
                shareKey(shareAcrossScenes, shareAcrossOrganizations, settlementScene, organizationId), scopeKey);
    }

    static String periodKey(ReliefQuotaPeriod period, LocalDate date) {
        return switch (period) {
            case NONE, POLICY_TERM -> "TERM";
            case DAY -> date.toString();
            case MONTH -> date.format(DateTimeFormatter.ofPattern("yyyy-MM"));
            case QUARTER -> date.getYear() + "-Q" + ((date.getMonthValue() - 1) / 3 + 1);
            case YEAR -> String.valueOf(date.getYear());
        };
    }

    static String shareKey(boolean shareAcrossScenes, boolean shareAcrossOrganizations, String scene, Long organizationId) {
        String scenePart = shareAcrossScenes ? "ANY" : INPATIENT_SCENES.contains(scene) ? "INPATIENT" : "OUTPATIENT";
        String organizationPart = shareAcrossOrganizations ? "ANY" : "ORG:" + organizationId;
        return scenePart + "|" + organizationPart;
    }
}
