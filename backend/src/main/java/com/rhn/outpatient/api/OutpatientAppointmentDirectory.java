package com.rhn.outpatient.api;

/** Public boundary used when a confirmed appointment is converted into a registration. */
public interface OutpatientAppointmentDirectory {
    BookingSnapshot prepareRegistration(Long appointmentId, Long residentId,
                                        Long organizationId, Long departmentId);

    record BookingSnapshot(Long appointmentId, Long residentId, Long scheduleId,
                           Long catalogItemId, String serviceCode, String serviceName) {}
}
