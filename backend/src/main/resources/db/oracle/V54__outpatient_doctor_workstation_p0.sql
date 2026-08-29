alter table encounter_diagnoses add (revision number(19,0) default 0 not null);
alter table encounter_diagnoses add (business_version_no number(10,0) default 1 not null);
alter table encounter_diagnoses add (verification_status varchar2(32 char) default 'CONFIRMED' not null);
alter table encounter_diagnoses add (diagnosis_status varchar2(32 char) default 'ACTIVE' not null);
alter table encounter_diagnoses add (clinical_note varchar2(1000 char));
alter table encounter_diagnoses add (updated_at timestamp with time zone);
alter table encounter_diagnoses add (updated_by number(19,0));
alter table encounter_diagnoses add constraint fk_enc_diag_updated_user foreign key (tenant_id,updated_by) references user_accounts(tenant_id,id);
alter table encounter_diagnoses add constraint ck_enc_diag_verification check (verification_status in ('PROVISIONAL','CONFIRMED','REFUTED'));
alter table encounter_diagnoses add constraint ck_enc_diag_status check (diagnosis_status in ('ACTIVE','EXCLUDED','ENTERED_IN_ERROR'));
create index idx_enc_diag_current on encounter_diagnoses(tenant_id,encounter_id,diagnosis_status,diagnosis_type,recorded_at);

create table encounter_identity_checks (
 id number(19,0) primary key, tenant_id number(19,0) not null, resident_id number(19,0) not null,
 encounter_id number(19,0) not null, check_scenario varchar2(32 char) not null, factor_results_json clob not null,
 result varchar2(16 char) not null, practitioner_id number(19,0), user_id number(19,0), terminal_code varchar2(128 char),
 command_code varchar2(128 char) not null, occurred_at timestamp with time zone not null,
 constraint fk_enc_id_check_tenant foreign key (tenant_id) references tenants(id),
 constraint fk_enc_id_check_resident foreign key (tenant_id,resident_id) references residents(tenant_id,id),
 constraint fk_enc_id_check_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
 constraint fk_enc_id_check_pract foreign key (tenant_id,practitioner_id) references practitioners(tenant_id,id),
 constraint fk_enc_id_check_user foreign key (tenant_id,user_id) references user_accounts(tenant_id,id),
 constraint uk_enc_id_check_command unique (tenant_id,encounter_id,command_code),
 constraint ck_enc_id_check_scenario check (check_scenario in ('START','RESUME','PATIENT_SWITCH','HIGH_RISK')),
 constraint ck_enc_id_check_result check (result in ('PASS','FAIL'))
);
create index idx_enc_id_check_time on encounter_identity_checks(tenant_id,encounter_id,occurred_at);

create table encounter_status_events (
 id number(19,0) primary key, tenant_id number(19,0) not null, encounter_id number(19,0) not null,
 status_from varchar2(32 char), status_to varchar2(32 char) not null, expected_revision number(19,0) not null,
 practitioner_id number(19,0), user_id number(19,0), organization_id number(19,0) not null,
 department_id number(19,0) not null, command_code varchar2(128 char) not null, reason varchar2(1000 char),
 occurred_at timestamp with time zone not null,
 constraint fk_enc_status_evt_tenant foreign key (tenant_id) references tenants(id),
 constraint fk_enc_status_evt_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
 constraint fk_enc_status_evt_pract foreign key (tenant_id,practitioner_id) references practitioners(tenant_id,id),
 constraint fk_enc_status_evt_user foreign key (tenant_id,user_id) references user_accounts(tenant_id,id),
 constraint fk_enc_status_evt_org foreign key (tenant_id,organization_id) references organizations(tenant_id,id),
 constraint fk_enc_status_evt_dept foreign key (tenant_id,organization_id,department_id) references departments(tenant_id,organization_id,id),
 constraint uk_enc_status_evt_command unique (tenant_id,encounter_id,command_code)
);
create index idx_enc_status_evt_time on encounter_status_events(tenant_id,encounter_id,occurred_at);

create table encounter_work_sessions (
 id number(19,0) primary key, revision number(19,0) default 0 not null, tenant_id number(19,0) not null,
 encounter_id number(19,0) not null, practitioner_id number(19,0), user_id number(19,0), terminal_code varchar2(128 char),
 status varchar2(16 char) not null, started_at timestamp with time zone not null, heartbeat_at timestamp with time zone not null,
 closed_at timestamp with time zone, close_reason varchar2(32 char),
 constraint fk_enc_work_session_tenant foreign key (tenant_id) references tenants(id),
 constraint fk_enc_work_session_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
 constraint fk_enc_work_session_pract foreign key (tenant_id,practitioner_id) references practitioners(tenant_id,id),
 constraint fk_enc_work_session_user foreign key (tenant_id,user_id) references user_accounts(tenant_id,id),
 constraint ck_enc_work_session_status check (status in ('ACTIVE','CLOSED','EXPIRED')),
 constraint ck_enc_work_session_close check ((status='ACTIVE' and closed_at is null and close_reason is null) or (status in ('CLOSED','EXPIRED') and closed_at is not null and close_reason is not null))
);
create index idx_enc_work_session_current on encounter_work_sessions(tenant_id,encounter_id,status,heartbeat_at);

create table encounter_diagnosis_revisions (
 id number(19,0) primary key, tenant_id number(19,0) not null, encounter_diagnosis_id number(19,0) not null,
 encounter_id number(19,0) not null, business_version_no number(10,0) not null, change_type varchar2(24 char) not null,
 diagnosis_type varchar2(24 char) not null, verification_status varchar2(32 char) not null,
 diagnosis_status varchar2(32 char) not null, code_snapshot varchar2(64 char) not null,
 display_snapshot varchar2(200 char) not null, clinical_note varchar2(1000 char), change_reason varchar2(1000 char) not null,
 practitioner_id number(19,0), user_id number(19,0), occurred_at timestamp with time zone not null,
 constraint fk_enc_diag_rev_tenant foreign key (tenant_id) references tenants(id),
 constraint fk_enc_diag_rev_diag foreign key (tenant_id,encounter_diagnosis_id) references encounter_diagnoses(tenant_id,id),
 constraint fk_enc_diag_rev_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
 constraint fk_enc_diag_rev_pract foreign key (tenant_id,practitioner_id) references practitioners(tenant_id,id),
 constraint fk_enc_diag_rev_user foreign key (tenant_id,user_id) references user_accounts(tenant_id,id),
 constraint uk_enc_diag_rev_version unique (tenant_id,encounter_diagnosis_id,business_version_no),
 constraint ck_enc_diag_rev_change check (change_type in ('ADDED','UPDATED','REORDERED','EXCLUDED','RESTORED'))
);
create index idx_enc_diag_rev_history on encounter_diagnosis_revisions(tenant_id,encounter_id,occurred_at);

create table encounter_completion_checks (
 id number(19,0) primary key, tenant_id number(19,0) not null, encounter_id number(19,0) not null,
 expected_revision number(19,0) not null, result varchar2(16 char) not null, command_code varchar2(128 char) not null,
 practitioner_id number(19,0), user_id number(19,0), checked_at timestamp with time zone not null,
 constraint fk_enc_completion_tenant foreign key (tenant_id) references tenants(id),
 constraint fk_enc_completion_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
 constraint fk_enc_completion_pract foreign key (tenant_id,practitioner_id) references practitioners(tenant_id,id),
 constraint fk_enc_completion_user foreign key (tenant_id,user_id) references user_accounts(tenant_id,id),
 constraint uk_enc_completion_tenant_id unique (tenant_id,id),
 constraint uk_enc_completion_command unique (tenant_id,encounter_id,command_code),
 constraint ck_enc_completion_result check (result in ('PASS','BLOCKED'))
);
create index idx_enc_completion_latest on encounter_completion_checks(tenant_id,encounter_id,checked_at);

create table encounter_completion_issues (
 id number(19,0) primary key, tenant_id number(19,0) not null, completion_check_id number(19,0) not null,
 issue_code varchar2(64 char) not null, severity varchar2(16 char) not null, description varchar2(1000 char) not null,
 constraint fk_enc_completion_issue_tenant foreign key (tenant_id) references tenants(id),
 constraint fk_enc_completion_issue_check foreign key (tenant_id,completion_check_id) references encounter_completion_checks(tenant_id,id),
 constraint uk_enc_completion_issue unique (tenant_id,completion_check_id,issue_code),
 constraint ck_enc_completion_severity check (severity in ('BLOCKER','WARNING'))
);
