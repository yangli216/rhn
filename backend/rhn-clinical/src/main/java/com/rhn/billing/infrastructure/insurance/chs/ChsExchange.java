package com.rhn.billing.infrastructure.insurance.chs;

import java.time.Instant;

/**
 * 一次与医保网关的报文往返，仅供联通探测在当前线程内观察。{@code request}/{@code response} 是未脱敏的原始报文
 * （含证件号、token 等），调用方必须脱敏后才能离开服务端；本类 {@code toString} 不输出报文，避免误入日志。
 */
public record ChsExchange(String infno, Instant startedAt, long durationMs, Integer httpStatus, String infcode, String errMsg,
                          Outcome outcome, String request, String response) {
    public enum Outcome { OK, REJECTED, TIMEOUT, NETWORK, HTTP_STATUS, BAD_JSON, INCOMPLETE }

    @Override public String toString() {
        return "ChsExchange[infno=" + infno + ", outcome=" + outcome + ", httpStatus=" + httpStatus + ", infcode=" + infcode + "]";
    }
}
