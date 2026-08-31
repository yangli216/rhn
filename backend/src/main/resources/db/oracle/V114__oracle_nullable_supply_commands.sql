-- Preserve tenant-scoped uniqueness only when the optional lifecycle command exists.
-- Both virtual-key columns stay null for draft/not-cancelled batches, so Oracle omits
-- those entries from the unique indexes.

alter table inpatient_med_supply_batches drop constraint uk_ipmsb_submit_cmd;
alter table inpatient_med_supply_batches drop constraint uk_ipmsb_cancel_cmd;

alter table inpatient_med_supply_batches add (
    submit_cmd_scope_key generated always as (
        case when submit_command_code is null then null else tenant_id end
    ) virtual,
    cancel_cmd_scope_key generated always as (
        case when cancel_command_code is null then null else tenant_id end
    ) virtual
);

alter table inpatient_med_supply_batches add constraint uk_ipmsb_submit_cmd
    unique (submit_cmd_scope_key, submit_command_code);
alter table inpatient_med_supply_batches add constraint uk_ipmsb_cancel_cmd
    unique (cancel_cmd_scope_key, cancel_command_code);
