package com.rhn.billing.infrastructure.insurance.chs;

/** 医保平台明确拒绝交易（infcode 非 0）。区别于超时、HTTP 异常等结果未知的情形。 */
public class ChsRejectedException extends RuntimeException {
    private final String infoCode;

    public ChsRejectedException(String infoCode, String message) {
        super(message);
        this.infoCode = infoCode;
    }

    public String infoCode() { return infoCode; }
}
