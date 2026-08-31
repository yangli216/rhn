-- First inpatient vertical slice: organization-owned locations, care episode, shared encounter
-- classification, deterministic bed occupancy and append-only command facts.
create table service_locations (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint,
    parent_id bigint,
    code varchar(64) not null,
    name varchar(200) not null,
    location_type varchar(32) not null,
    sort_order integer default 0 not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_srv_loc_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_srv_loc_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_srv_loc_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint uk_srv_loc_tenant_id unique (tenant_id, id),
    constraint uk_srv_loc_code unique (tenant_id, organization_id, code),
    constraint ck_srv_loc_type check (location_type in ('WARD', 'ROOM', 'BED')),
    constraint ck_srv_loc_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_srv_loc_period check (valid_to is null or valid_to >= valid_from)
);

alter table service_locations add constraint fk_srv_loc_parent
    foreign key (tenant_id, parent_id) references service_locations(tenant_id, id);
create index idx_srv_loc_tree on service_locations
    (tenant_id, organization_id, department_id, parent_id, location_type, sort_order);

create table inpatient_bed_profiles (
    bed_location_id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    bed_type varchar(32) not null,
    gender_restriction varchar(16) not null,
    operational_status varchar(32) not null,
    nursing_group_code varchar(64),
    responsible_nurse_id bigint,
    daily_bed_rate decimal(18,2),
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_inp_bed_loc foreign key (tenant_id, bed_location_id)
        references service_locations(tenant_id, id),
    constraint uk_inp_bed_tenant_id unique (tenant_id, bed_location_id),
    constraint ck_inp_bed_type check (bed_type in ('PHYSICAL', 'EXTRA', 'VIRTUAL', 'HOME')),
    constraint ck_inp_bed_gender check (gender_restriction in ('ANY', 'MALE', 'FEMALE')),
    constraint ck_inp_bed_status check (operational_status in ('AVAILABLE', 'CLEANING', 'BLOCKED', 'MAINTENANCE')),
    constraint ck_inp_bed_rate check (daily_bed_rate is null or daily_bed_rate >= 0)
);

create index idx_inp_bed_status on inpatient_bed_profiles
    (tenant_id, operational_status, bed_type);

create table care_episodes (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    organization_id bigint not null,
    episode_no varchar(32) not null,
    episode_type varchar(32) not null,
    status varchar(32) not null,
    start_at timestamp with time zone not null,
    end_at timestamp with time zone,
    primary_practitioner_id bigint,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_care_ep_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_care_ep_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_care_ep_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint uk_care_ep_tenant_id unique (tenant_id, id),
    constraint uk_care_ep_no unique (tenant_id, episode_no),
    constraint ck_care_ep_type check (episode_type in ('INPATIENT', 'HOME_BED', 'CHRONIC_CARE', 'OTHER')),
    constraint ck_care_ep_status check (status in (
        'PLANNED', 'PENDING_BED', 'ADMITTED', 'ON_LEAVE', 'DISCHARGE_PENDING', 'DISCHARGED', 'CANCELLED'
    )),
    constraint ck_care_ep_period check (end_at is null or end_at >= start_at)
);

create index idx_care_ep_resident on care_episodes (tenant_id, resident_id, status, start_at);

create table inpatient_episode_details (
    episode_id bigint primary key,
    tenant_id bigint not null,
    admission_type_code varchar(64),
    admission_source_code varchar(64),
    admission_location_id bigint,
    admission_reason varchar(1000),
    discharge_disposition_code varchar(64),
    discharge_location_id bigint,
    discharge_note varchar(2000),
    nursing_level_code varchar(64),
    diet_code varchar(64),
    bed_no_snapshot varchar(64),
    responsible_nurse_id bigint,
    constraint fk_inp_ep_detail foreign key (tenant_id, episode_id)
        references care_episodes(tenant_id, id),
    constraint fk_inp_ep_adm_loc foreign key (tenant_id, admission_location_id)
        references service_locations(tenant_id, id),
    constraint fk_inp_ep_dis_loc foreign key (tenant_id, discharge_location_id)
        references service_locations(tenant_id, id),
    constraint uk_inp_ep_detail unique (tenant_id, episode_id)
);

alter table encounters add column encounter_class varchar(32) default 'OUTPATIENT' not null;
alter table encounters add column episode_id bigint;
alter table encounters add column service_location_id bigint;
alter table encounters add constraint fk_enc_care_episode
    foreign key (tenant_id, episode_id) references care_episodes(tenant_id, id);
alter table encounters add constraint fk_enc_service_location
    foreign key (tenant_id, service_location_id) references service_locations(tenant_id, id);
create index idx_encounter_episode on encounters (tenant_id, episode_id, status);
create index idx_encounter_class_worklist on encounters
    (tenant_id, organization_id, encounter_class, status, registered_at);

create table encounter_location_histories (
    id bigint primary key,
    tenant_id bigint not null,
    encounter_id bigint not null,
    location_id bigint not null,
    status varchar(32) not null,
    start_at timestamp with time zone not null,
    end_at timestamp with time zone,
    change_reason varchar(1000),
    changed_by bigint not null,
    constraint fk_enc_loc_hist_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_loc_hist_enc foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint fk_enc_loc_hist_loc foreign key (tenant_id, location_id)
        references service_locations(tenant_id, id),
    constraint uk_enc_loc_hist_tenant_id unique (tenant_id, id),
    constraint ck_enc_loc_hist_status check (status in ('ACTIVE', 'COMPLETED')),
    constraint ck_enc_loc_hist_period check (end_at is null or end_at >= start_at)
);

create index idx_enc_loc_hist_enc on encounter_location_histories
    (tenant_id, encounter_id, start_at);
create index idx_enc_loc_hist_loc on encounter_location_histories
    (tenant_id, location_id, status, start_at);

create table inpatient_bed_occupancies (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    bed_location_id bigint not null,
    episode_id bigint not null,
    encounter_id bigint not null,
    resident_id bigint not null,
    started_at timestamp with time zone not null,
    constraint fk_inp_occ_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_occ_bed foreign key (tenant_id, bed_location_id)
        references inpatient_bed_profiles(tenant_id, bed_location_id),
    constraint fk_inp_occ_episode foreign key (tenant_id, episode_id)
        references care_episodes(tenant_id, id),
    constraint fk_inp_occ_encounter foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint fk_inp_occ_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint uk_inp_occ_tenant_id unique (tenant_id, id),
    constraint uk_inp_occ_bed unique (tenant_id, bed_location_id),
    constraint uk_inp_occ_episode unique (tenant_id, episode_id),
    constraint uk_inp_occ_encounter unique (tenant_id, encounter_id),
    constraint uk_inp_occ_resident unique (tenant_id, resident_id)
);

create table inpatient_events (
    id bigint primary key,
    tenant_id bigint not null,
    episode_id bigint,
    encounter_id bigint,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    source_location_id bigint,
    target_location_id bigint,
    command_code varchar(128) not null,
    reason varchar(1000),
    actor_id bigint not null,
    occurred_at timestamp with time zone not null,
    constraint fk_inp_evt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_evt_episode foreign key (tenant_id, episode_id)
        references care_episodes(tenant_id, id),
    constraint fk_inp_evt_encounter foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint fk_inp_evt_source_loc foreign key (tenant_id, source_location_id)
        references service_locations(tenant_id, id),
    constraint fk_inp_evt_target_loc foreign key (tenant_id, target_location_id)
        references service_locations(tenant_id, id),
    constraint uk_inp_evt_tenant_id unique (tenant_id, id),
    constraint uk_inp_evt_command unique (tenant_id, command_code),
    constraint ck_inp_evt_type check (event_type in ('ADMITTED', 'TRANSFERRED', 'DISCHARGED', 'BED_STATUS_CHANGED'))
);

create index idx_inp_evt_episode on inpatient_events (tenant_id, episode_id, occurred_at);
