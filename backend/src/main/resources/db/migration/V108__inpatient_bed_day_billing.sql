alter table inpatient_bed_profiles add column charge_catalog_item_id bigint;
alter table inpatient_bed_profiles add constraint fk_ip_bed_charge_item
    foreign key (tenant_id, charge_catalog_item_id) references catalog_items(tenant_id, id);

create table inpatient_bed_day_facts (
    id bigint primary key,
    tenant_id bigint not null,
    episode_id bigint not null,
    encounter_id bigint not null,
    location_history_id bigint not null,
    bed_location_id bigint not null,
    business_date date not null,
    command_code varchar(128) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    constraint fk_ip_bday_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ip_bday_episode foreign key (tenant_id, episode_id)
        references care_episodes(tenant_id, id),
    constraint fk_ip_bday_encounter foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint fk_ip_bday_history foreign key (tenant_id, location_history_id)
        references encounter_location_histories(tenant_id, id),
    constraint fk_ip_bday_bed foreign key (tenant_id, bed_location_id)
        references inpatient_bed_profiles(tenant_id, bed_location_id),
    constraint uk_ip_bday_tenant_id unique (tenant_id, id),
    constraint uk_ip_bday_episode_date unique (tenant_id, episode_id, business_date),
    constraint uk_ip_bday_command unique (tenant_id, command_code)
);
create index idx_ip_bday_enc_date on inpatient_bed_day_facts
    (tenant_id, encounter_id, business_date);

alter table charge_items drop constraint ck_charge_source;
alter table charge_items add constraint ck_charge_source check (source_type in (
    'REGISTRATION', 'REGISTRATION_REVERSAL',
    'SERVICE_REQUEST', 'SERVICE_REQUEST_REVERSAL',
    'MEDICATION_REQUEST', 'MEDICATION_REQUEST_REVERSAL',
    'MEDICATION_DISPENSE', 'MEDICATION_RETURN',
    'INPATIENT_ORDER_TASK', 'INPATIENT_BED_DAY', 'INPATIENT_BED_DAY_REVERSAL'
));

alter table charge_items drop constraint ck_charge_sign;
alter table charge_items add constraint ck_charge_sign check (
       (source_type in ('REGISTRATION', 'SERVICE_REQUEST', 'MEDICATION_REQUEST',
                        'MEDICATION_DISPENSE', 'INPATIENT_ORDER_TASK', 'INPATIENT_BED_DAY')
            and quantity > 0 and total_amount >= 0 and reverses_charge_item_id is null)
    or (source_type in ('REGISTRATION_REVERSAL', 'SERVICE_REQUEST_REVERSAL',
                       'MEDICATION_REQUEST_REVERSAL', 'MEDICATION_RETURN', 'INPATIENT_BED_DAY_REVERSAL')
            and quantity < 0 and total_amount <= 0 and reverses_charge_item_id is not null)
);
