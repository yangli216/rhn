package com.rhn.billing.domain;

/** 减免计算方式。 */
public enum ReliefMethod {
    RATIO,
    FREE,
    FIXED_AMOUNT,
    UNIT_AMOUNT,
    PRICE_CAP,
    MANUAL
}
