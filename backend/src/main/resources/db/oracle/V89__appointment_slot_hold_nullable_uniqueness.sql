-- Oracle indexes the non-null tenant portion of (tenant_id, slot_hold_id), so a
-- regular composite unique constraint permits only one appointment without a
-- slot hold per tenant. Independent appointments intentionally have no hold.

alter table appointments drop constraint uk_appointment_slot_hold;

create unique index uk_appt_slot_hold_nonnull on appointments (
    case when slot_hold_id is not null then tenant_id end,
    case when slot_hold_id is not null then slot_hold_id end
);
