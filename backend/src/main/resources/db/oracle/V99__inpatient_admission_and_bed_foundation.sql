-- Oracle form of the first inpatient admission and bed-management vertical slice.
create table service_locations (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    department_id number(19,0),
    parent_id number(19,0),
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    location_type varchar2(32 char) not null,
    sort_order number(10,0) default 0 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    constraint fk_srv_loc_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_srv_loc_org foreign key (tenant_id,organization_id) references organizations(tenant_id,id),
    constraint fk_srv_loc_dept foreign key (tenant_id,organization_id,department_id) references departments(tenant_id,organization_id,id),
    constraint uk_srv_loc_tenant_id unique (tenant_id,id),
    constraint uk_srv_loc_code unique (tenant_id,organization_id,code),
    constraint ck_srv_loc_type check (location_type in ('WARD','ROOM','BED')),
    constraint ck_srv_loc_status check (status in ('ACTIVE','INACTIVE')),
    constraint ck_srv_loc_period check (valid_to is null or valid_to >= valid_from)
);
alter table service_locations add constraint fk_srv_loc_parent
    foreign key (tenant_id,parent_id) references service_locations(tenant_id,id);
create index idx_srv_loc_tree on service_locations
    (tenant_id,organization_id,department_id,parent_id,location_type,sort_order);

create table inpatient_bed_profiles (
    bed_location_id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    bed_type varchar2(32 char) not null,
    gender_restriction varchar2(16 char) not null,
    operational_status varchar2(32 char) not null,
    nursing_group_code varchar2(64 char),
    responsible_nurse_id number(19,0),
    daily_bed_rate number(18,2),
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    constraint fk_inp_bed_loc foreign key (tenant_id,bed_location_id) references service_locations(tenant_id,id),
    constraint uk_inp_bed_tenant_id unique (tenant_id,bed_location_id),
    constraint ck_inp_bed_type check (bed_type in ('PHYSICAL','EXTRA','VIRTUAL','HOME')),
    constraint ck_inp_bed_gender check (gender_restriction in ('ANY','MALE','FEMALE')),
    constraint ck_inp_bed_status check (operational_status in ('AVAILABLE','CLEANING','BLOCKED','MAINTENANCE')),
    constraint ck_inp_bed_rate check (daily_bed_rate is null or daily_bed_rate >= 0)
);
create index idx_inp_bed_status on inpatient_bed_profiles (tenant_id,operational_status,bed_type);

create table care_episodes (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    resident_id number(19,0) not null,
    organization_id number(19,0) not null,
    episode_no varchar2(32 char) not null,
    episode_type varchar2(32 char) not null,
    status varchar2(32 char) not null,
    start_at timestamp with time zone not null,
    end_at timestamp with time zone,
    primary_practitioner_id number(19,0),
    created_at timestamp with time zone not null,
    created_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    constraint fk_care_ep_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_care_ep_resident foreign key (tenant_id,resident_id) references residents(tenant_id,id),
    constraint fk_care_ep_org foreign key (tenant_id,organization_id) references organizations(tenant_id,id),
    constraint uk_care_ep_tenant_id unique (tenant_id,id),
    constraint uk_care_ep_no unique (tenant_id,episode_no),
    constraint ck_care_ep_type check (episode_type in ('INPATIENT','HOME_BED','CHRONIC_CARE','OTHER')),
    constraint ck_care_ep_status check (status in (
        'PLANNED','PENDING_BED','ADMITTED','ON_LEAVE','DISCHARGE_PENDING','DISCHARGED','CANCELLED'
    )),
    constraint ck_care_ep_period check (end_at is null or end_at >= start_at)
);
create index idx_care_ep_resident on care_episodes (tenant_id,resident_id,status,start_at);

create table inpatient_episode_details (
    episode_id number(19,0) primary key,
    tenant_id number(19,0) not null,
    admission_type_code varchar2(64 char),
    admission_source_code varchar2(64 char),
    admission_location_id number(19,0),
    admission_reason varchar2(1000 char),
    discharge_disposition_code varchar2(64 char),
    discharge_location_id number(19,0),
    discharge_note varchar2(2000 char),
    nursing_level_code varchar2(64 char),
    diet_code varchar2(64 char),
    bed_no_snapshot varchar2(64 char),
    responsible_nurse_id number(19,0),
    constraint fk_inp_ep_detail foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id),
    constraint fk_inp_ep_adm_loc foreign key (tenant_id,admission_location_id) references service_locations(tenant_id,id),
    constraint fk_inp_ep_dis_loc foreign key (tenant_id,discharge_location_id) references service_locations(tenant_id,id),
    constraint uk_inp_ep_detail unique (tenant_id,episode_id)
);

alter table encounters add (encounter_class varchar2(32 char) default 'OUTPATIENT' not null);
alter table encounters add (episode_id number(19,0));
alter table encounters add (service_location_id number(19,0));
alter table encounters add constraint fk_enc_care_episode foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id);
alter table encounters add constraint fk_enc_service_location foreign key (tenant_id,service_location_id) references service_locations(tenant_id,id);
create index idx_encounter_episode on encounters (tenant_id,episode_id,status);
create index idx_encounter_class_worklist on encounters (tenant_id,organization_id,encounter_class,status,registered_at);

create table encounter_location_histories (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    encounter_id number(19,0) not null,
    location_id number(19,0) not null,
    status varchar2(32 char) not null,
    start_at timestamp with time zone not null,
    end_at timestamp with time zone,
    change_reason varchar2(1000 char),
    changed_by number(19,0) not null,
    constraint fk_enc_loc_hist_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_loc_hist_enc foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
    constraint fk_enc_loc_hist_loc foreign key (tenant_id,location_id) references service_locations(tenant_id,id),
    constraint uk_enc_loc_hist_tenant_id unique (tenant_id,id),
    constraint ck_enc_loc_hist_status check (status in ('ACTIVE','COMPLETED')),
    constraint ck_enc_loc_hist_period check (end_at is null or end_at >= start_at)
);
create index idx_enc_loc_hist_enc on encounter_location_histories (tenant_id,encounter_id,start_at);
create index idx_enc_loc_hist_loc on encounter_location_histories (tenant_id,location_id,status,start_at);

create table inpatient_bed_occupancies (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    bed_location_id number(19,0) not null,
    episode_id number(19,0) not null,
    encounter_id number(19,0) not null,
    resident_id number(19,0) not null,
    started_at timestamp with time zone not null,
    constraint fk_inp_occ_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_occ_bed foreign key (tenant_id,bed_location_id) references inpatient_bed_profiles(tenant_id,bed_location_id),
    constraint fk_inp_occ_episode foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id),
    constraint fk_inp_occ_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
    constraint fk_inp_occ_resident foreign key (tenant_id,resident_id) references residents(tenant_id,id),
    constraint uk_inp_occ_tenant_id unique (tenant_id,id),
    constraint uk_inp_occ_bed unique (tenant_id,bed_location_id),
    constraint uk_inp_occ_episode unique (tenant_id,episode_id),
    constraint uk_inp_occ_encounter unique (tenant_id,encounter_id),
    constraint uk_inp_occ_resident unique (tenant_id,resident_id)
);

create table inpatient_events (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    episode_id number(19,0),
    encounter_id number(19,0),
    event_type varchar2(32 char) not null,
    status_from varchar2(32 char),
    status_to varchar2(32 char) not null,
    source_location_id number(19,0),
    target_location_id number(19,0),
    command_code varchar2(128 char) not null,
    reason varchar2(1000 char),
    actor_id number(19,0) not null,
    occurred_at timestamp with time zone not null,
    constraint fk_inp_evt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inp_evt_episode foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id),
    constraint fk_inp_evt_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
    constraint fk_inp_evt_source_loc foreign key (tenant_id,source_location_id) references service_locations(tenant_id,id),
    constraint fk_inp_evt_target_loc foreign key (tenant_id,target_location_id) references service_locations(tenant_id,id),
    constraint uk_inp_evt_tenant_id unique (tenant_id,id),
    constraint uk_inp_evt_command unique (tenant_id,command_code),
    constraint ck_inp_evt_type check (event_type in ('ADMITTED','TRANSFERRED','DISCHARGED','BED_STATUS_CHANGED'))
);
create index idx_inp_evt_episode on inpatient_events (tenant_id,episode_id,occurred_at);
