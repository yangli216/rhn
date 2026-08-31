-- Inpatient service orders are charged per successful execution occurrence. Medication
-- remains charged from the pharmacy dispense fact to avoid duplicate patient charges.
alter table charge_items drop constraint ck_charge_source;
alter table charge_items add constraint ck_charge_source check (source_type in (
    'REGISTRATION', 'REGISTRATION_REVERSAL',
    'SERVICE_REQUEST', 'SERVICE_REQUEST_REVERSAL',
    'MEDICATION_REQUEST', 'MEDICATION_REQUEST_REVERSAL',
    'MEDICATION_DISPENSE', 'MEDICATION_RETURN',
    'INPATIENT_ORDER_TASK'
));

alter table charge_items drop constraint ck_charge_sign;
alter table charge_items add constraint ck_charge_sign check (
       (source_type in ('REGISTRATION', 'SERVICE_REQUEST', 'MEDICATION_REQUEST',
                        'MEDICATION_DISPENSE', 'INPATIENT_ORDER_TASK')
            and quantity > 0 and total_amount >= 0 and reverses_charge_item_id is null)
    or (source_type in ('REGISTRATION_REVERSAL', 'SERVICE_REQUEST_REVERSAL',
                       'MEDICATION_REQUEST_REVERSAL', 'MEDICATION_RETURN')
            and quantity < 0 and total_amount <= 0 and reverses_charge_item_id is not null)
);
