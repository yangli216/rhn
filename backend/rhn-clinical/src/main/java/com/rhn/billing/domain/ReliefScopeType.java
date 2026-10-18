package com.rhn.billing.domain;

/** 减免规则的费用范围类型，匹配优先级为明细、大类、来源、全部。 */
public enum ReliefScopeType {
    ALL,
    ACCOUNTING_CATEGORY,
    CATALOG_ITEM,
    SOURCE_TYPE
}
