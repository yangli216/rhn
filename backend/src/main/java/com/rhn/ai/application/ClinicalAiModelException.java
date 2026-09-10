package com.rhn.ai.application;

public final class ClinicalAiModelException extends RuntimeException {
    public enum Reason {
        UNKNOWN, CONFIGURATION, AUTHENTICATION, RATE_LIMIT, PROVIDER_REJECTED,
        TIMEOUT, CONNECTION, INTERRUPTED, OUTPUT_LIMIT, INVALID_RESPONSE
    }

    private final Reason reason;
    private final Integer providerStatus;

    public ClinicalAiModelException(String message) {
        this(Reason.UNKNOWN, null, message, null);
    }

    public ClinicalAiModelException(String message, Throwable cause) {
        this(Reason.UNKNOWN, null, message, cause);
    }

    public ClinicalAiModelException(Reason reason, Integer providerStatus, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
        this.providerStatus = providerStatus;
    }

    public Reason reason() { return reason; }
    public Integer providerStatus() { return providerStatus; }

    public String userMessage() {
        return switch (reason) {
            case CONFIGURATION -> "模型服务配置不完整，请联系管理员核对。";
            case AUTHENTICATION -> "模型服务鉴权失败，请联系管理员核对 API Key 和模型访问权限。";
            case RATE_LIMIT -> "模型服务请求受限，请稍后重试；如持续出现，请管理员核对调用额度。";
            case PROVIDER_REJECTED -> "模型服务拒绝请求（HTTP " + providerStatus + "），请联系管理员核对模型及接口参数。";
            case TIMEOUT -> "模型生成超时，请重试；如持续出现，请管理员核对服务响应时间和超时配置。";
            case CONNECTION -> "无法连接模型服务，请联系管理员检查网络和服务地址。";
            case INTERRUPTED -> "模型请求已中断，请重试。";
            case OUTPUT_LIMIT -> "模型输出达到长度上限，未生成完整结果；请精简输入或联系管理员调整输出上限。";
            case INVALID_RESPONSE -> "模型返回的病历结果格式不符合要求，请重试；如持续出现，请联系管理员。";
            case UNKNOWN -> "模型辅助暂时不可用，请稍后重试；医生站其他功能不受影响。";
        };
    }
}
