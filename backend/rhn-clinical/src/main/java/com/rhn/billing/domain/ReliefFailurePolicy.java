package com.rhn.billing.domain;

/** 外部资格查询失败时的处理方式。 */
public enum ReliefFailurePolicy {
    BLOCK,
    INELIGIBLE,
    MANUAL_CONFIRM
}
