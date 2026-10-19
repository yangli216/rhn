package com.rhn.billing.api;

import java.time.Instant;
import java.util.List;

/** 医保接入就绪体检的只读视图。敏感值只表达“已配置/未配置”，不回显任何配置内容。 */
public final class InsuranceReadinessViews {
    private InsuranceReadinessViews() {}

    /** @param status PASS 通过，WARN 警告（可上线但需确认），BLOCK 阻断（不满足上线条件） */
    public record ReadinessCheck(String code, String title, String status, String statusText, String detail, String fix) {
        public ReadinessCheck(String code, String title, String status, String detail, String fix) {
            this(code, title, status, switch (status) { case "PASS" -> "通过"; case "WARN" -> "警告"; default -> "阻断"; }, detail, fix);
        }
    }

    public record ReadinessSection(String code, String title, List<ReadinessCheck> checks) {}

    public record ReadinessSummary(int pass, int warn, int block) {}

    /**
     * @param clientMode GATEWAY 正式网关、MOCK 模拟客户端、UNAVAILABLE 未接入占位
     * @param overall 任一阻断为 BLOCK，否则有警告为 WARN，否则 PASS
     * @param insuranceSystemCodes 当前机构注册资料中登记的医保目录体系编码，供目录对照覆盖率筛选
     */
    public record ReadinessReport(Instant checkedAt, String clientMode, String clientModeText, String overall, String overallText,
                                  ReadinessSummary summary,
                         List<ReadinessSection> sections, List<String> insuranceSystemCodes) {}
}
