create table medication_requests (
    request_id bigint primary key,
    tenant_id bigint not null,
    medication_id bigint not null,
    dose_value decimal(28,8),
    dose_unit varchar(64),
    route_code varchar(64),
    frequency_code varchar(64),
    duration_value decimal(12,3),
    duration_unit varchar(32),
    quantity decimal(28,8) not null,
    quantity_unit varchar(64) not null,
    base_quantity decimal(28,8) not null,
    base_unit varchar(64) not null,
    package_factor_snapshot decimal(28,8) not null,
    package_unit_name_snapshot varchar(160),
    package_spec_snapshot varchar(300),
    price_quantity_snapshot decimal(28,8),
    substitution_allowed boolean not null,
    self_provided boolean not null,
    medication_instruction varchar(1000),
    medication_code_snapshot varchar(128) not null,
    medication_name_snapshot varchar(300) not null,
    medication_type_snapshot varchar(32) not null,
    dose_form_snapshot varchar(64),
    preparation_spec_snapshot varchar(300),
    preparation_unit_snapshot varchar(64),
    skin_test_required_snapshot boolean not null,
    antimicrobial_snapshot boolean not null,
    antimicrobial_level_snapshot varchar(64),
    medication_snapshot text not null,
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
