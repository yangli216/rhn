alter table examination_services add column site_pricing_mode varchar(32) default 'SINGLE' not null;
alter table examination_services add column included_site_count integer default 1 not null;
alter table examination_services add column additional_site_price decimal(24,6);
alter table examination_services add column additional_site_item_id bigint;
alter table examination_services add column additional_site_quantity decimal(28,8) default 1 not null;
alter table examination_services add column max_chargeable_site_count integer;
alter table examination_services add constraint fk_exam_additional_item foreign key (tenant_id, additional_site_item_id) references catalog_items(tenant_id, id);
alter table examination_services add constraint ck_exam_site_pricing_mode check (site_pricing_mode in ('SINGLE', 'PER_SITE', 'BASE_PLUS_FIXED', 'BASE_PLUS_ITEM'));
alter table examination_services add constraint ck_exam_included_site_count check (included_site_count >= 1);
alter table examination_services add constraint ck_exam_additional_site_price check (additional_site_price is null or additional_site_price >= 0);
alter table examination_services add constraint ck_exam_additional_site_quantity check (additional_site_quantity > 0);
alter table examination_services add constraint ck_exam_chargeable_site_count check (max_chargeable_site_count is null or max_chargeable_site_count >= included_site_count);

update examination_services e set
    site_pricing_mode = case when (select s.multi_site_price from service_items s where s.catalog_item_id = e.catalog_item_id) is null then 'SINGLE' else 'BASE_PLUS_FIXED' end,
    included_site_count = coalesce((select s.free_site_count from service_items s where s.catalog_item_id = e.catalog_item_id), 1),
    additional_site_price = (select s.multi_site_price from service_items s where s.catalog_item_id = e.catalog_item_id),
    max_chargeable_site_count = (select s.max_body_site_count from service_items s where s.catalog_item_id = e.catalog_item_id);

create table examination_attachment_items (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    catalog_item_id bigint not null,
    attachment_catalog_item_id bigint not null,
    trigger_type varchar(32) not null,
    quantity_basis varchar(32) not null,
    quantity decimal(28,8) not null,
    required_attachment boolean default false not null,
    separately_chargeable boolean default true not null,
    sort_order integer not null,
    description varchar(1000),
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_exam_attachment_owner foreign key (tenant_id, catalog_item_id) references examination_services(tenant_id, catalog_item_id),
    constraint fk_exam_attachment_item foreign key (tenant_id, attachment_catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_exam_attachment_tenant_id unique (tenant_id, id),
    constraint uk_exam_attachment_item unique (tenant_id, catalog_item_id, attachment_catalog_item_id),
    constraint uk_exam_attachment_order unique (tenant_id, catalog_item_id, sort_order),
    constraint ck_exam_attachment_trigger check (trigger_type in ('ALWAYS', 'OPTIONAL', 'MULTI_SITE')),
    constraint ck_exam_attachment_quantity_basis check (quantity_basis in ('FIXED', 'PER_SITE', 'PER_EXTRA_SITE')),
    constraint ck_exam_attachment_quantity check (quantity > 0),
    constraint ck_exam_attachment_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_exam_attachment_lookup on examination_attachment_items (tenant_id, catalog_item_id, status, sort_order);

alter table laboratory_service_specimens add column tube_group_code varchar(64);
alter table laboratory_service_specimens add column tube_sharing_mode varchar(32) default 'SEPARATE' not null;
alter table laboratory_service_specimens add column base_tube_count integer default 1 not null;
alter table laboratory_service_specimens add column max_tests_per_tube integer;
alter table laboratory_service_specimens add column tube_charge_mode varchar(32) default 'NONE' not null;
alter table laboratory_service_specimens add column tube_charge_item_id bigint;
alter table laboratory_service_specimens add column included_tube_count integer default 0 not null;
alter table laboratory_service_specimens add column tube_charge_quantity decimal(28,8) default 1 not null;
alter table laboratory_service_specimens add constraint fk_lab_tube_charge_item foreign key (tenant_id, tube_charge_item_id) references catalog_items(tenant_id, id);
alter table laboratory_service_specimens add constraint ck_lab_tube_sharing_mode check (tube_sharing_mode in ('SEPARATE', 'SHARE', 'BY_TEST_COUNT'));
alter table laboratory_service_specimens add constraint ck_lab_base_tube_count check (base_tube_count > 0);
alter table laboratory_service_specimens add constraint ck_lab_max_tests_per_tube check (max_tests_per_tube is null or max_tests_per_tube > 0);
alter table laboratory_service_specimens add constraint ck_lab_tube_charge_mode check (tube_charge_mode in ('NONE', 'PER_TUBE', 'EXCESS_TUBE'));
alter table laboratory_service_specimens add constraint ck_lab_included_tube_count check (included_tube_count >= 0);
alter table laboratory_service_specimens add constraint ck_lab_tube_charge_quantity check (tube_charge_quantity > 0);
create index idx_lab_tube_group on laboratory_service_specimens (tenant_id, tube_group_code, status);
