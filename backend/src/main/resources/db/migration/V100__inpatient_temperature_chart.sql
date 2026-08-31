-- Append-only inpatient vital-sign facts and structured temperature-chart events.
create table inpatient_observation_groups (
    id bigint primary key,
    tenant_id bigint not null,
    episode_id bigint not null,
    encounter_id bigint not null,
    measured_at timestamp with time zone not null,
    source_type varchar(32) not null,
    command_code varchar(128) not null,
    note varchar(1000),
    recorded_by bigint not null,
    recorded_at timestamp with time zone not null,
    constraint fk_inp_obs_grp_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_obs_grp_ep foreign key (tenant_id, episode_id)
        references care_episodes(tenant_id, id),
    constraint fk_inp_obs_grp_enc foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint uk_inp_obs_grp_id unique (tenant_id, id),
    constraint uk_inp_obs_grp_cmd unique (tenant_id, command_code),
    constraint ck_inp_obs_grp_source check (source_type in ('MANUAL', 'DEVICE', 'IMPORTED'))
);

create index idx_inp_obs_grp_week on inpatient_observation_groups
    (tenant_id, episode_id, measured_at, id);

create table inpatient_observations (
    id bigint primary key,
    tenant_id bigint not null,
    observation_group_id bigint not null,
    observation_code varchar(64) not null,
    observed_at timestamp with time zone not null,
    value_number decimal(18,4) not null,
    unit_code varchar(32) not null,
    body_site_code varchar(32),
    constraint fk_inp_obs_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_obs_group foreign key (tenant_id, observation_group_id)
        references inpatient_observation_groups(tenant_id, id),
    constraint uk_inp_obs_id unique (tenant_id, id),
    constraint uk_inp_obs_code unique (tenant_id, observation_group_id, observation_code),
    constraint ck_inp_obs_type check (observation_code in (
        'BODY_TEMPERATURE', 'COOLING_TEMPERATURE', 'PULSE_RATE', 'RESPIRATORY_RATE',
        'SYSTOLIC_BLOOD_PRESSURE', 'DIASTOLIC_BLOOD_PRESSURE',
        'OXYGEN_SATURATION', 'BODY_WEIGHT', 'FLUID_INTAKE', 'FLUID_OUTPUT'
    )),
    constraint ck_inp_obs_value check (value_number >= 0)
);

create table inpatient_chart_events (
    id bigint primary key,
    tenant_id bigint not null,
    episode_id bigint not null,
    encounter_id bigint not null,
    event_type varchar(32) not null,
    source_location_id bigint,
    source_location_name varchar(200),
    target_location_id bigint,
    target_location_name varchar(200),
    command_code varchar(128) not null,
    display_text varchar(200) not null,
    note varchar(1000),
    occurred_at timestamp with time zone not null,
    recorded_by bigint not null,
    recorded_at timestamp with time zone not null,
    constraint fk_inp_chart_evt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_chart_evt_ep foreign key (tenant_id, episode_id)
        references care_episodes(tenant_id, id),
    constraint fk_inp_chart_evt_enc foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint fk_inp_chart_evt_src foreign key (tenant_id, source_location_id)
        references service_locations(tenant_id, id),
    constraint fk_inp_chart_evt_dst foreign key (tenant_id, target_location_id)
        references service_locations(tenant_id, id),
    constraint uk_inp_chart_evt_id unique (tenant_id, id),
    constraint uk_inp_chart_evt_cmd unique (tenant_id, command_code),
    constraint ck_inp_chart_evt_type check (event_type in (
        'ADMISSION', 'TRANSFER_IN', 'TRANSFER_OUT', 'BED_TRANSFER', 'WARD_TRANSFER',
        'LEAVE', 'RETURN', 'SURGERY', 'DELIVERY', 'DISCHARGE', 'DEATH', 'OTHER'
    ))
);

create index idx_inp_chart_evt_week on inpatient_chart_events
    (tenant_id, episode_id, occurred_at, id);
