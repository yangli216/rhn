package com.rhn.billing.infrastructure.insurance.chs;

/** 网关传输层失败（超时、连接、非 2xx、回执非 JSON）：交易结果未知，区别于平台明确拒绝的 {@link ChsRejectedException}。 */
public class ChsTransportException extends IllegalStateException {
    private final ChsExchange.Outcome kind;
    private final Integer httpStatus;
    private final String body;

    ChsTransportException(ChsExchange.Outcome kind, Integer httpStatus, String body, String message, Throwable cause) {
        super(message, cause);
        this.kind = kind; this.httpStatus = httpStatus; this.body = body;
    }

    public ChsExchange.Outcome kind() { return kind; }
    Integer httpStatus() { return httpStatus; }
    String body() { return body; }
}
