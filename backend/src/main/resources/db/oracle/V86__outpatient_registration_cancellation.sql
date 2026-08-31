-- Unserved registration cancellation coordinates the encounter, queue, appointment,
-- slot inventory and registration billing reversal.

alter table registration_billing_intents drop constraint ck_reg_bill_status;
alter table registration_billing_intents add constraint ck_reg_bill_status check (status in (
    'PAYMENT_PENDING', 'PAID', 'COMPLETING', 'COMPLETED', 'COMPLETION_FAILED',
    'CANCELLATION_PENDING', 'CANCELLATION_FAILED', 'CANCELLED', 'EXPIRED'
));

alter table charge_items drop constraint ck_charge_source;
alter table charge_items add constraint ck_charge_source check (source_type in (
    'REGISTRATION', 'REGISTRATION_REVERSAL',
    'SERVICE_REQUEST', 'SERVICE_REQUEST_REVERSAL',
    'MEDICATION_REQUEST', 'MEDICATION_REQUEST_REVERSAL',
    'MEDICATION_DISPENSE', 'MEDICATION_RETURN'
));

alter table charge_items drop constraint ck_charge_sign;
alter table charge_items add constraint ck_charge_sign check (
       (source_type in ('REGISTRATION', 'SERVICE_REQUEST', 'MEDICATION_REQUEST', 'MEDICATION_DISPENSE')
            and quantity > 0 and total_amount >= 0 and reverses_charge_item_id is null)
    or (source_type in ('REGISTRATION_REVERSAL', 'SERVICE_REQUEST_REVERSAL',
                       'MEDICATION_REQUEST_REVERSAL', 'MEDICATION_RETURN')
            and quantity < 0 and total_amount <= 0 and reverses_charge_item_id is not null)
);
