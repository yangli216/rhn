package com.rhn.billing.domain;

import java.math.BigDecimal;

/**
 * 减免规则内容。范围：全部、会计大类（scopeValue）、收费项目（catalogItemId）或收费来源（scopeValue）。
 * 方式参数：RATIO 用 ratio；FIXED_AMOUNT 为本次固定减免额；UNIT_AMOUNT 为每计费单位减免额；
 * PRICE_CAP 为每计费单位个人最高负担；MANUAL 由收费员录入，可设 manualMaxAmount 上限。
 */
public record ReliefRuleTerms(ReliefScopeType scopeType, String scopeValue, Long catalogItemId, String scopeName,
                              boolean excluded, ReliefMethod method, BigDecimal ratio, BigDecimal amount,
                              BigDecimal manualMaxAmount, Integer periodMaxCount) {

    public static ReliefRuleTerms include(ReliefScopeType scopeType, String scopeValue, Long catalogItemId,
                                          ReliefMethod method, BigDecimal ratio, BigDecimal amount) {
        return new ReliefRuleTerms(scopeType, scopeValue, catalogItemId, null, false, method, ratio, amount, null, null);
    }

    public static ReliefRuleTerms exclude(ReliefScopeType scopeType, String scopeValue, Long catalogItemId) {
        return new ReliefRuleTerms(scopeType, scopeValue, catalogItemId, null, true, null, null, null, null, null);
    }

    public ReliefRuleTerms withPeriodMaxCount(Integer count) {
        return new ReliefRuleTerms(scopeType, scopeValue, catalogItemId, scopeName, excluded, method, ratio, amount,
                manualMaxAmount, count);
    }

    public ReliefRuleTerms withManualMaxAmount(BigDecimal max) {
        return new ReliefRuleTerms(scopeType, scopeValue, catalogItemId, scopeName, excluded, method, ratio, amount,
                max, periodMaxCount);
    }

    public void validate() {
        if (scopeType == null) throw new IllegalArgumentException("减免规则必须指定费用范围");
        switch (scopeType) {
            case ALL -> require(scopeValue == null && catalogItemId == null && !excluded, "全部费用范围不能带范围值或作为排除项");
            case ACCOUNTING_CATEGORY, SOURCE_TYPE -> require(scopeValue != null && !scopeValue.isBlank()
                    && catalogItemId == null, "会计大类或收费来源范围必须指定编码");
            case CATALOG_ITEM -> require(catalogItemId != null && scopeValue == null, "收费项目范围必须指定项目");
        }
        if (excluded) {
            require(method == null && ratio == null && amount == null && manualMaxAmount == null && periodMaxCount == null,
                    "排除范围不能设置减免方式或限额");
            return;
        }
        if (method == null) throw new IllegalArgumentException("减免规则必须指定减免方式");
        switch (method) {
            case RATIO -> require(ratio != null && ratio.signum() > 0 && ratio.compareTo(BigDecimal.ONE) <= 0
                    && amount == null, "按比例减免的比例必须大于 0 且不超过 1");
            case FREE -> require(ratio == null && amount == null, "全免不能设置比例或金额");
            case FIXED_AMOUNT, UNIT_AMOUNT -> require(ratio == null && amount != null && amount.signum() > 0,
                    "固定或单位减免金额必须大于零");
            case PRICE_CAP -> require(ratio == null && amount != null && amount.signum() >= 0,
                    "个人限价不能为负");
            case MANUAL -> require(ratio == null && amount == null, "人工核准不能预设比例或金额");
        }
        require(method == ReliefMethod.MANUAL || manualMaxAmount == null, "仅人工核准可设置核准上限");
        require(manualMaxAmount == null || manualMaxAmount.signum() > 0, "人工核准上限必须大于零");
        require(periodMaxCount == null || periodMaxCount > 0, "项目周期次数必须大于零");
    }

    /** 范围精确度：明细 > 大类 > 来源 > 全部，同一政策内一条收费行只命中最精确的规则。 */
    public int specificity() {
        return switch (scopeType) {
            case CATALOG_ITEM -> 3;
            case ACCOUNTING_CATEGORY -> 2;
            case SOURCE_TYPE -> 1;
            case ALL -> 0;
        };
    }

    public boolean matches(Long itemId, String accountingCategory, String sourceType) {
        return switch (scopeType) {
            case ALL -> true;
            case CATALOG_ITEM -> catalogItemId.equals(itemId);
            case ACCOUNTING_CATEGORY -> scopeValue.equals(accountingCategory);
            case SOURCE_TYPE -> scopeValue.equals(sourceType);
        };
    }

    /** 规则范围键，用于项目级周期次数额度；跨版本保持一致。 */
    public String scopeKey() {
        return switch (scopeType) {
            case ALL -> "ALL";
            case CATALOG_ITEM -> "CATALOG_ITEM:" + catalogItemId;
            case ACCOUNTING_CATEGORY, SOURCE_TYPE -> scopeType.name() + ":" + scopeValue;
        };
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }
}
