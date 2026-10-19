package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 医保标准目录对照覆盖率视图。 */
public final class InsuranceCoverageViews {
    private InsuranceCoverageViews() {}

    /** @param category DRUG 药品、SERVICE 诊疗、SUPPLY 耗材；coverageRate 为百分比（一位小数），无目录项时为空 */
    public record CategorySummary(String category, String categoryText, int total, int mapped, int unmapped, int ambiguous, int expired,
                                  BigDecimal coverageRate) {}

    /** @param status MAPPED 唯一有效、UNMAPPED 未映射、AMBIGUOUS 多个有效映射、EXPIRED 仅有已过期或停用的映射 */
    public record CoverageItem(Long catalogItemId, String category, String categoryText, String code, String name, String status,
                               String statusText, String detail, List<String> termCodes) {}

    public record CoverageReport(LocalDate businessDate, String systemCode, List<CategorySummary> summary,
                                 List<CoverageItem> items, int page, int size, long total) {}
}
