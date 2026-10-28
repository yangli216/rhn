package com.rhn.billing.infrastructure.insurance.chs;

/**
 * 医保网关往返的常驻记录入口（调试控制台使用）。在发起交易的线程内同步调用，实现必须快速返回且不得抛出异常，
 * 不得影响真实交易；收到的 {@link ChsExchange} 含未脱敏报文，实现须按留存级别脱敏后才能持久化。
 */
public interface ChsExchangeRecorder {
    void record(ChsExchange exchange);
}
