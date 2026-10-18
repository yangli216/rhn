package com.rhn.billing.domain;

/** 减免时机：医保前减免降低结算净额，医保后减免冲抵剩余个人自付。 */
public enum ReliefTiming {
    PRE_INSURANCE,
    POST_INSURANCE
}
