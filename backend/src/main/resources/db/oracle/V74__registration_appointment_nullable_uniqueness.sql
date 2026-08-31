alter table patient_registrations drop constraint uk_registration_appointment;

create unique index uk_reg_appt_nonnull on patient_registrations (
    case when appointment_id is not null then tenant_id end,
    case when appointment_id is not null then appointment_id end
);
