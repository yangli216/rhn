-- Outpatient orders are charged when they become effective so they can be settled
-- before diagnostic execution or pharmacy fulfillment. Execution facts remain the
-- reconciliation source and must not create a second patient charge.
alter table charge_items drop constraint ck_charge_source;
alter table charge_items add constraint ck_charge_source check (source_type in (
    'REGISTRATION',
    'SERVICE_REQUEST', 'SERVICE_REQUEST_REVERSAL',
    'MEDICATION_REQUEST', 'MEDICATION_REQUEST_REVERSAL',
    'MEDICATION_DISPENSE', 'MEDICATION_RETURN'
));

alter table charge_items drop constraint ck_charge_sign;
alter table charge_items add constraint ck_charge_sign check (
       (source_type in ('REGISTRATION', 'SERVICE_REQUEST', 'MEDICATION_REQUEST', 'MEDICATION_DISPENSE')
            and quantity > 0 and total_amount >= 0 and reverses_charge_item_id is null)
    or (source_type in ('SERVICE_REQUEST_REVERSAL', 'MEDICATION_REQUEST_REVERSAL', 'MEDICATION_RETURN')
            and quantity < 0 and total_amount <= 0 and reverses_charge_item_id is not null)
);
