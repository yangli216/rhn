alter table settlement_lines add constraint uk_stl_line_tenant_id unique (tenant_id, id);

create table insurance_claims (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    settlement_id number(19) not null,
    patient_account_id number(19) not null,
    coverage_id number(19) not null,
    claim_no varchar2(128 char) not null,
    command_code varchar2(128 char) not null,
    claim_type varchar2(32 char) not null,
    status varchar2(32 char) not null,
    current_operation varchar2(32 char) not null,
    region_code varchar2(64 char) not null,
    insurance_type_code varchar2(64 char) not null,
    payer_name_snapshot varchar2(300 char) not null,
    organization_code varchar2(128 char) not null,
    department_code varchar2(128 char) not null,
    practitioner_code varchar2(128 char) not null,
    diagnosis_payload_digest varchar2(128 char) not null,
    service_started_at timestamp with time zone not null,
    service_ended_at timestamp with time zone,
    external_pre_settlement_no varchar2(128 char),
    external_settlement_no varchar2(128 char),
    gross_amount number(24,6) not null,
    insurance_fund_amount number(24,6) not null,
    personal_account_amount number(24,6) not null,
    patient_cash_amount number(24,6) not null,
    other_fund_amount number(24,6) not null,
    currency_code varchar2(3 char) not null,
    correlation_id varchar2(128 char),
    created_by number(19) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    error_code varchar2(64 char),
    error_message varchar2(2000 char),
    constraint fk_ins_claim_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ins_claim_settlement foreign key (tenant_id, settlement_id) references settlements(tenant_id, id),
    constraint fk_ins_claim_account foreign key (tenant_id, patient_account_id) references patient_accounts(tenant_id, id),
    constraint fk_ins_claim_coverage foreign key (tenant_id, coverage_id) references resident_coverages(tenant_id, id),
    constraint uk_ins_claim_tenant_id unique (tenant_id, id),
    constraint uk_ins_claim_no unique (tenant_id, claim_no),
    constraint uk_ins_claim_command unique (tenant_id, command_code),
    constraint uk_ins_claim_settlement unique (tenant_id, settlement_id),
    constraint ck_ins_claim_type check (claim_type in ('NORMAL', 'REVERSAL')),
    constraint ck_ins_claim_status check (status in ('PRE_SETTLEMENT_PENDING', 'PRE_SETTLED', 'SETTLEMENT_PENDING', 'SETTLED', 'FAILED', 'REVERSAL_PENDING', 'REVERSED')),
    constraint ck_ins_claim_operation check (current_operation in ('PRE_SETTLE', 'SETTLE', 'REVERSE')),
    constraint ck_ins_claim_amounts check (gross_amount > 0 and insurance_fund_amount >= 0 and personal_account_amount >= 0 and patient_cash_amount >= 0 and other_fund_amount >= 0)
);
create index idx_ins_claim_worklist on insurance_claims (tenant_id, status, updated_at, id);
create index idx_ins_claim_coverage on insurance_claims (tenant_id, coverage_id, status);
create unique index uk_ins_claim_external on insurance_claims (tenant_id, region_code, external_settlement_no);

create table insurance_claim_lines (
    id number(19) primary key,
    tenant_id number(19) not null,
    claim_id number(19) not null,
    settlement_line_id number(19) not null,
    line_no number(10) not null,
    item_code varchar2(128 char) not null,
    insurance_item_code varchar2(128 char) not null,
    item_name_snapshot varchar2(300 char) not null,
    category_code varchar2(64 char) not null,
    quantity number(28,8) not null,
    unit_price number(24,6) not null,
    claimed_amount number(24,6) not null,
    approved_amount number(24,6),
    rejection_code varchar2(64 char),
    trace_attributes_json clob,
    constraint fk_ins_claim_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ins_claim_line_claim foreign key (tenant_id, claim_id) references insurance_claims(tenant_id, id),
    constraint fk_ins_claim_line_settlement foreign key (tenant_id, settlement_line_id) references settlement_lines(tenant_id, id),
    constraint uk_ins_claim_line_order unique (tenant_id, claim_id, line_no),
    constraint uk_ins_claim_line_settlement unique (tenant_id, claim_id, settlement_line_id),
    constraint ck_ins_claim_line_amount check (quantity <> 0 and claimed_amount > 0)
);
create index idx_ins_claim_line_settlement on insurance_claim_lines (tenant_id, settlement_line_id);

create table insurance_claim_responses (
    id number(19) primary key,
    tenant_id number(19) not null,
    claim_id number(19) not null,
    external_message_id number(19),
    response_no varchar2(128 char) not null,
    command_code varchar2(128 char) not null,
    operation varchar2(32 char) not null,
    status varchar2(32 char) not null,
    external_settlement_no varchar2(128 char),
    insurance_fund_amount number(24,6) not null,
    personal_account_amount number(24,6) not null,
    patient_cash_amount number(24,6) not null,
    other_fund_amount number(24,6) not null,
    error_code varchar2(64 char),
    error_message varchar2(2000 char),
    responded_at timestamp with time zone not null,
    constraint fk_ins_resp_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ins_resp_claim foreign key (tenant_id, claim_id) references insurance_claims(tenant_id, id),
    constraint fk_ins_resp_message foreign key (tenant_id, external_message_id) references external_messages(tenant_id, id),
    constraint uk_ins_resp_tenant_id unique (tenant_id, id),
    constraint uk_ins_resp_command unique (tenant_id, claim_id, command_code),
    constraint uk_ins_resp_no unique (tenant_id, claim_id, response_no),
    constraint ck_ins_resp_operation check (operation in ('PRE_SETTLE', 'SETTLE', 'REVERSE', 'QUERY')),
    constraint ck_ins_resp_status check (status in ('SUCCEEDED', 'PENDING', 'FAILED'))
);
create index idx_ins_resp_claim_time on insurance_claim_responses (tenant_id, claim_id, responded_at, id);
create index idx_ins_resp_message on insurance_claim_responses (tenant_id, external_message_id);

alter table settlement_tenders add constraint fk_stl_tender_claim_response
    foreign key (tenant_id, claim_response_id) references insurance_claim_responses(tenant_id, id);
