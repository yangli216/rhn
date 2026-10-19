package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * 医保联通探测的请求与结果视图。结果中的报文均已脱敏；请求里的证件号、token 只在服务端内存中使用，不会回显。
 */
public final class InsuranceProbeViews {
    private InsuranceProbeViews() {}

    /**
     * @param available 能否探测；否则 {@code reason} 说明原因
     * @param mode GATEWAY 正式网关（含指向 mock 服务的地址）、MOCK 进程内模拟客户端、UNAVAILABLE 未接入
     * @param settlementAllowed 部署配置是否允许执行 2207/2208 结算探测
     */
    public record ProbeCapability(boolean available, String mode, String modeText, String reason,
                                  boolean signInRequired, boolean settlementAllowed, String settlementReason) {}

    public record ProbePersonInput(String certType, String certNo, String personName) {
        @Override public String toString() { return "ProbePersonInput[REDACTED]"; }
    }

    public record ProbeLineInput(String itemCode, String insuranceItemCode, String itemName, BigDecimal quantity, BigDecimal unitPrice) {}

    public record ProbePreSettleInput(String departmentCode, String practitionerCode, String diagnosisCode, String diagnosisName,
                                 List<ProbeLineInput> lines) {}

    /** @param confirmed 已勾选“执行真实结算并自动撤销”；@param confirmation 须逐字输入上一步预结算的探测单号 */
    public record ProbeSettleInput(boolean confirmed, String confirmation) {}

    public record ProbeRequest(ProbePersonInput person, ProbePreSettleInput preSettle, ProbeSettleInput settle) {}

    public record ProbeFact(String label, String value) {}

    /** 一次与医保网关的报文往返；request/response 为脱敏后的 JSON 文本。 */
    public record ProbeExchange(String infno, String infnoText, Instant startedAt, long durationMs, Integer httpStatus,
                                String infcode, String errMsg, String outcome, String outcomeText, String hint,
                                String request, String response) {}

    /**
     * @param status PASS 通过、FAIL 失败、SKIPPED 已跳过（如配置无需签到）、BLOCKED 前置条件不满足未发出任何交易
     * @param hint 失败时的原因判断与修复提示
     */
    public record ProbeStepResult(String step, String stepText, String status, String statusText, String summary, String hint,
                                  Instant startedAt, long durationMs, List<ProbeFact> facts, List<ProbeExchange> exchanges) {}
}
