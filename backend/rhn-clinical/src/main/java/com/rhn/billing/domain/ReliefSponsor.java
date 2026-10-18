package com.rhn.billing.domain;

/** 减免承担主体，决定医保后减免记入的结算支付类别。 */
public enum ReliefSponsor {
    HOSPITAL,
    GOVERNMENT,
    CHARITY,
    OTHER
}
