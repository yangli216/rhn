-- Oracle composite unique constraints treat (tenant_id, NULL) as a duplicate
-- for the same tenant. Preserve uniqueness only when the optional reference is
-- present. Every step is conditional because Oracle DDL auto-commits and a
-- retry may observe a partially applied migration.

declare
    v_count number;
begin
    select count(*) into v_count from user_constraints where constraint_name = 'UK_REG_BILL_HOLD';
    if v_count > 0 then
        execute immediate 'alter table registration_billing_intents drop constraint uk_reg_bill_hold';
    end if;
    select count(*) into v_count from user_indexes where index_name = 'UK_REG_BILL_HOLD_NONNULL';
    if v_count = 0 then
        execute immediate 'create unique index uk_reg_bill_hold_nonnull on registration_billing_intents (
            case when slot_hold_id is not null then tenant_id end,
            case when slot_hold_id is not null then slot_hold_id end
        )';
    end if;
end;
/

declare
    v_count number;
begin
    select count(*) into v_count from user_constraints where constraint_name = 'UK_REG_BILL_ACCOUNT';
    if v_count > 0 then
        execute immediate 'alter table registration_billing_intents drop constraint uk_reg_bill_account';
    end if;
    select count(*) into v_count from user_indexes where index_name = 'UK_REG_BILL_ACCT_NONNULL';
    if v_count = 0 then
        execute immediate 'create unique index uk_reg_bill_acct_nonnull on registration_billing_intents (
            case when patient_account_id is not null then tenant_id end,
            case when patient_account_id is not null then patient_account_id end
        )';
    end if;
end;
/

declare
    v_count number;
begin
    select count(*) into v_count from user_constraints where constraint_name = 'UK_REG_BILL_SETTLEMENT';
    if v_count > 0 then
        execute immediate 'alter table registration_billing_intents drop constraint uk_reg_bill_settlement';
    end if;
    select count(*) into v_count from user_indexes where index_name = 'UK_REG_BILL_STL_NONNULL';
    if v_count = 0 then
        execute immediate 'create unique index uk_reg_bill_stl_nonnull on registration_billing_intents (
            case when settlement_id is not null then tenant_id end,
            case when settlement_id is not null then settlement_id end
        )';
    end if;
end;
/

declare
    v_count number;
begin
    select count(*) into v_count from user_constraints where constraint_name = 'UK_REG_BILL_PAYMENT';
    if v_count > 0 then
        execute immediate 'alter table registration_billing_intents drop constraint uk_reg_bill_payment';
    end if;
    select count(*) into v_count from user_indexes where index_name = 'UK_REG_BILL_PAY_NONNULL';
    if v_count = 0 then
        execute immediate 'create unique index uk_reg_bill_pay_nonnull on registration_billing_intents (
            case when payment_order_id is not null then tenant_id end,
            case when payment_order_id is not null then payment_order_id end
        )';
    end if;
end;
/

declare
    v_count number;
begin
    select count(*) into v_count from user_constraints where constraint_name = 'UK_REG_BILL_ENCOUNTER';
    if v_count > 0 then
        execute immediate 'alter table registration_billing_intents drop constraint uk_reg_bill_encounter';
    end if;
    select count(*) into v_count from user_indexes where index_name = 'UK_REG_BILL_ENC_NONNULL';
    if v_count = 0 then
        execute immediate 'create unique index uk_reg_bill_enc_nonnull on registration_billing_intents (
            case when encounter_id is not null then tenant_id end,
            case when encounter_id is not null then encounter_id end
        )';
    end if;
end;
/
