package com.rhn.billing.infrastructure.fiscal;

/** 财政网关传输层失败或回执不可信（超时、连接、非 2xx、非 JSON、缺关键字段）：交易结果未知，调用方须保持待确认。 */
public class FiscalGatewayException extends IllegalStateException {
    public FiscalGatewayException(String message) { super(message); }
    public FiscalGatewayException(String message, Throwable cause) { super(message, cause); }
}
