package com.rhn.billing.application;

/** 正向支付指令进入失败/取消/过期终态（同事务内同步发布，供业务场景收口占用的资源）。 */
record PaymentOrderFailedEvent(Long tenantId, Long paymentOrderId, String businessScene) {}
