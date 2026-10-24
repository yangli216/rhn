package com.rhn.treatment.domain;

public enum TreatmentExecutionTaskStatus {
    WAITING_SETTLEMENT,
    WAITING_DISPENSE,
    WAITING_SKIN_TEST,
    READY,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED,
    EXCEPTION,
    /** 异常已由人工处置并关闭（终态）；SD_STATUS 无数据库检查约束，新增取值不需要迁移。 */
    CLOSED;

    public boolean terminal() {
        return this == COMPLETED || this == CANCELLED || this == CLOSED;
    }
}
