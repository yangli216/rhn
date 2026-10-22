package com.rhn.platform.printing.domain;

public enum PrintDeliveryStatus {
    GENERATED,
    QUEUED,
    /** 已交给 RHN Link 工作站执行，等待页面回报结果。 */
    DISPATCHED,
    SENT,
    /** 工作站调用结果不确定（可能已进入系统打印队列），须人工核对纸面结果后才能重新下发。 */
    UNCERTAIN,
    DEVICE_CONFIRMED,
    FAILED
}
