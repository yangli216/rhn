create table care_requests (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    request_no varchar(64) not null,
    request_kind varchar(32) not null,
    status varchar(32) not null,
    intent_code varchar(32) not null,
    priority_code varchar(32) not null,
    catalog_item_id bigint not null,
    package_id bigint,
    performer_organization_id bigint not null,
    performer_department_id bigint not null,
    business_date date not null,
    authored_at timestamp with time zone not null,
    authored_by bigint not null,
    reason_text varchar(1000),
    cancelled_at timestamp with time zone,
    cancelled_by bigint,
    cancel_reason varchar(1000),
    item_code_snapshot varchar(128) not null,
    item_name_snapshot varchar(300) not null,
    unit_code_snapshot varchar(64) not null,
    local_code_snapshot varchar(64),
    local_name_snapshot varchar(300),
    adoption_id bigint not null,
    adoption_revision bigint not null,
    price_id bigint,
    price_revision bigint,
    price_type varchar(32),
    unit_price decimal(24,6),
    total_amount decimal(24,6),
    currency_code varchar(16),
    item_attribute_snapshot text not null,
    item_attribute_hash varchar(64) not null,
    item_attribute_resolved_at timestamp with time zone not null,
    standard_mapping_snapshot text not null,
    constraint fk_care_request_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_care_request_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_care_request_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_care_request_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_care_request_package foreign key (tenant_id, package_id) references item_packages(tenant_id, id),
    constraint fk_care_request_org foreign key (tenant_id, performer_organization_id) references organizations(tenant_id, id),
    constraint fk_care_request_dept foreign key (tenant_id, performer_organization_id, performer_department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_care_request_adoption foreign key (tenant_id, adoption_id) references organization_catalog_items(tenant_id, id),
    constraint fk_care_request_price foreign key (tenant_id, price_id) references catalog_prices(tenant_id, id),
    constraint uk_care_request_tenant_id unique (tenant_id, id),
    constraint uk_care_request_no unique (tenant_id, request_no),
    constraint ck_care_request_kind check (request_kind in ('SERVICE', 'MEDICATION', 'REFERRAL', 'CARE_ACTIVITY')),
    constraint ck_care_request_status check (status in ('ACTIVE', 'CANCELLED')),
    constraint ck_care_request_price check (
        (price_id is null and price_revision is null and price_type is null and unit_price is null
            and total_amount is null and currency_code is null) or
        (price_id is not null and price_revision is not null and price_type is not null and unit_price is not null
            and total_amount is not null and currency_code is not null)
    )
);
create index idx_care_request_encounter on care_requests (tenant_id, encounter_id, status, authored_at);
create index idx_care_request_catalog on care_requests (tenant_id, catalog_item_id, business_date);

create table service_requests (
    request_id bigint primary key,
    tenant_id bigint not null,
    quantity decimal(28,8) not null,
    clinical_description varchar(2000),
    constraint fk_service_request_care foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint uk_service_request_tenant_id unique (tenant_id, request_id),
    constraint ck_service_request_quantity check (quantity > 0)
);
