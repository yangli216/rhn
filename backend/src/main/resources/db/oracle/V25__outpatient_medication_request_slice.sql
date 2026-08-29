create table medication_requests (
    request_id number(19) primary key,
    tenant_id number(19) not null,
    medication_id number(19) not null,
    dose_value number(28,8),
    dose_unit varchar2(64 char),
    route_code varchar2(64 char),
    frequency_code varchar2(64 char),
    duration_value number(12,3),
    duration_unit varchar2(32 char),
    quantity number(28,8) not null,
    quantity_unit varchar2(64 char) not null,
    base_quantity number(28,8) not null,
    base_unit varchar2(64 char) not null,
    package_factor_snapshot number(28,8) not null,
    package_unit_name_snapshot varchar2(160 char),
    package_spec_snapshot varchar2(300 char),
    price_quantity_snapshot number(28,8),
    substitution_allowed number(1) not null,
    self_provided number(1) not null,
    medication_instruction varchar2(1000 char),
    medication_code_snapshot varchar2(128 char) not null,
    medication_name_snapshot varchar2(300 char) not null,
    medication_type_snapshot varchar2(32 char) not null,
    dose_form_snapshot varchar2(64 char),
    preparation_spec_snapshot varchar2(300 char),
    preparation_unit_snapshot varchar2(64 char),
    skin_test_required_snapshot number(1) not null,
    antimicrobial_snapshot number(1) not null,
    antimicrobial_level_snapshot varchar2(64 char),
    medication_snapshot clob not null,
    constraint fk_med_request_care foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint fk_med_request_medication foreign key (tenant_id, medication_id) references medications(tenant_id, id),
    constraint uk_med_request_tenant_id unique (tenant_id, request_id),
    constraint ck_med_request_dose check (
        (dose_value is null and dose_unit is null) or (dose_value > 0 and dose_unit is not null)
    ),
    constraint ck_med_request_duration check (
        (duration_value is null and duration_unit is null) or (duration_value > 0 and duration_unit is not null)
    ),
    constraint ck_med_request_quantity check (quantity > 0 and base_quantity > 0 and package_factor_snapshot > 0),
    constraint ck_med_request_price_quantity check (price_quantity_snapshot is null or price_quantity_snapshot > 0)
);
create index idx_med_request_medication on medication_requests (tenant_id, medication_id);
