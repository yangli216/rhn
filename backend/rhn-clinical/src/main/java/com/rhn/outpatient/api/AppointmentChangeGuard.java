package com.rhn.outpatient.api;

/**
 * 预约取消/改约前的跨域检查点：收费域实现，用于判断预约是否仍有进行中的挂号收费办理，
 * 避免患者正在付款时号源被释放。门诊域只依赖本接口，不直接依赖收费域。
 */
public interface AppointmentChangeGuard {
    boolean registrationInProgress(Long tenantId, Long appointmentId);
}
