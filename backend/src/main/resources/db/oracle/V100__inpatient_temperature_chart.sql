-- Oracle form of append-only inpatient vital-sign facts and temperature-chart events.
create table inpatient_observation_groups (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    episode_id number(19,0) not null,
    encounter_id number(19,0) not null,
    measured_at timestamp with time zone not null,
    source_type varchar2(32 char) not null,
    command_code varchar2(128 char) not null,
    note varchar2(1000 char),
    recorded_by number(19,0) not null,
    recorded_at timestamp with time zone not null,
    constraint fk_inp_obs_grp_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_obs_grp_ep foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id),
    constraint fk_inp_obs_grp_enc foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
    constraint uk_inp_obs_grp_id unique (tenant_id,id),
    constraint uk_inp_obs_grp_cmd unique (tenant_id,command_code),
    constraint ck_inp_obs_grp_source check (source_type in ('MANUAL','DEVICE','IMPORTED'))
);
create index idx_inp_obs_grp_week on inpatient_observation_groups (tenant_id,episode_id,measured_at,id);

create table inpatient_observations (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    observation_group_id number(19,0) not null,
    observation_code varchar2(64 char) not null,
    observed_at timestamp with time zone not null,
    value_number number(18,4) not null,
    unit_code varchar2(32 char) not null,
    body_site_code varchar2(32 char),
    constraint fk_inp_obs_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_obs_group foreign key (tenant_id,observation_group_id) references inpatient_observation_groups(tenant_id,id),
    constraint uk_inp_obs_id unique (tenant_id,id),
    constraint uk_inp_obs_code unique (tenant_id,observation_group_id,observation_code),
    constraint ck_inp_obs_type check (observation_code in (
        'BODY_TEMPERATURE','COOLING_TEMPERATURE','PULSE_RATE','RESPIRATORY_RATE',
        'SYSTOLIC_BLOOD_PRESSURE','DIASTOLIC_BLOOD_PRESSURE',
        'OXYGEN_SATURATION','BODY_WEIGHT','FLUID_INTAKE','FLUID_OUTPUT'
    )),
    constraint ck_inp_obs_value check (value_number >= 0)
);
create table inpatient_chart_events (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    episode_id number(19,0) not null,
    encounter_id number(19,0) not null,
    event_type varchar2(32 char) not null,
    source_location_id number(19,0),
    source_location_name varchar2(200 char),
    target_location_id number(19,0),
    target_location_name varchar2(200 char),
    command_code varchar2(128 char) not null,
    display_text varchar2(200 char) not null,
    note varchar2(1000 char),
    occurred_at timestamp with time zone not null,
    recorded_by number(19,0) not null,
    recorded_at timestamp with time zone not null,
    constraint fk_inp_chart_evt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_chart_evt_ep foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id),
    constraint fk_inp_chart_evt_enc foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
    constraint fk_inp_chart_evt_src foreign key (tenant_id,source_location_id) references service_locations(tenant_id,id),
    constraint fk_inp_chart_evt_dst foreign key (tenant_id,target_location_id) references service_locations(tenant_id,id),
    constraint uk_inp_chart_evt_id unique (tenant_id,id),
    constraint uk_inp_chart_evt_cmd unique (tenant_id,command_code),
    constraint ck_inp_chart_evt_type check (event_type in (
        'ADMISSION','TRANSFER_IN','TRANSFER_OUT','BED_TRANSFER','WARD_TRANSFER',
        'LEAVE','RETURN','SURGERY','DELIVERY','DISCHARGE','DEATH','OTHER'
    ))
);
create index idx_inp_chart_evt_week on inpatient_chart_events (tenant_id,episode_id,occurred_at,id);
