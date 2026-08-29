create table care_requests (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    encounter_id number(19) not null,
    request_no varchar2(64 char) not null,
    request_kind varchar2(32 char) not null,
    status varchar2(32 char) not null,
    intent_code varchar2(32 char) not null,
    priority_code varchar2(32 char) not null,
    catalog_item_id number(19) not null,
    package_id number(19),
    performer_organization_id number(19) not null,
    performer_department_id number(19) not null,
    business_date date not null,
    authored_at timestamp with time zone not null,
    authored_by number(19) not null,
    reason_text varchar2(1000 char),
    cancelled_at timestamp with time zone,
    cancelled_by number(19),
    cancel_reason varchar2(1000 char),
    item_code_snapshot varchar2(128 char) not null,
    item_name_snapshot varchar2(300 char) not null,
    unit_code_snapshot varchar2(64 char) not null,
    local_code_snapshot varchar2(64 char),
    local_name_snapshot varchar2(300 char),
    adoption_id number(19) not null,
    adoption_revision number(19) not null,
    price_id number(19),
    price_revision number(19),
    price_type varchar2(32 char),
    unit_price number(24,6),
    total_amount number(24,6),
    currency_code varchar2(16 char),
    item_attribute_snapshot clob not null,
    item_attribute_hash varchar2(64 char) not null,
    item_attribute_resolved_at timestamp with time zone not null,
    standard_mapping_snapshot clob not null,
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
    request_id number(19) primary key,
    tenant_id number(19) not null,
    quantity number(28,8) not null,
    clinical_description varchar2(2000 char),
    constraint fk_service_request_care foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint uk_service_request_tenant_id unique (tenant_id, request_id),
    constraint ck_service_request_quantity check (quantity > 0)
);
