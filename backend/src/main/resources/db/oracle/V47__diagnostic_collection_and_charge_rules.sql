alter table examination_services add (
    site_pricing_mode varchar2(32 char) default 'SINGLE' not null,
    included_site_count number(10) default 1 not null,
    additional_site_price number(24,6),
    additional_site_item_id number(19),
    additional_site_quantity number(28,8) default 1 not null,
    max_chargeable_site_count number(10)
);
alter table examination_services add constraint fk_exam_additional_item foreign key (tenant_id, additional_site_item_id) references catalog_items(tenant_id, id);
alter table examination_services add constraint ck_exam_site_pricing_mode check (site_pricing_mode in ('SINGLE', 'PER_SITE', 'BASE_PLUS_FIXED', 'BASE_PLUS_ITEM'));
alter table examination_services add constraint ck_exam_included_site_count check (included_site_count >= 1);
alter table examination_services add constraint ck_exam_additional_site_price check (additional_site_price is null or additional_site_price >= 0);
alter table examination_services add constraint ck_exam_additional_site_quantity check (additional_site_quantity > 0);
alter table examination_services add constraint ck_exam_chargeable_site_count check (max_chargeable_site_count is null or max_chargeable_site_count >= included_site_count);

merge into examination_services e using service_items s on (s.catalog_item_id = e.catalog_item_id)
when matched then update set
    e.site_pricing_mode = case when s.multi_site_price is null then 'SINGLE' else 'BASE_PLUS_FIXED' end,
    e.included_site_count = nvl(s.free_site_count, 1),
    e.additional_site_price = s.multi_site_price,
    e.max_chargeable_site_count = s.max_body_site_count;

create table examination_attachment_items (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    catalog_item_id number(19) not null, attachment_catalog_item_id number(19) not null,
    trigger_type varchar2(32 char) not null, quantity_basis varchar2(32 char) not null,
    quantity number(28,8) not null, required_attachment number(1) default 0 not null,
    separately_chargeable number(1) default 1 not null, sort_order number(10) not null,
    description varchar2(1000 char), status varchar2(32 char) not null,
    created_at timestamp with time zone not null, created_by number(19) not null,
    updated_at timestamp with time zone not null, updated_by number(19) not null,
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

alter table laboratory_service_specimens add (
    tube_group_code varchar2(64 char), tube_sharing_mode varchar2(32 char) default 'SEPARATE' not null,
    base_tube_count number(10) default 1 not null, max_tests_per_tube number(10),
    tube_charge_mode varchar2(32 char) default 'NONE' not null, tube_charge_item_id number(19),
    included_tube_count number(10) default 0 not null, tube_charge_quantity number(28,8) default 1 not null
);
alter table laboratory_service_specimens add constraint fk_lab_tube_charge_item foreign key (tenant_id, tube_charge_item_id) references catalog_items(tenant_id, id);
alter table laboratory_service_specimens add constraint ck_lab_tube_sharing_mode check (tube_sharing_mode in ('SEPARATE', 'SHARE', 'BY_TEST_COUNT'));
alter table laboratory_service_specimens add constraint ck_lab_base_tube_count check (base_tube_count > 0);
alter table laboratory_service_specimens add constraint ck_lab_max_tests_per_tube check (max_tests_per_tube is null or max_tests_per_tube > 0);
alter table laboratory_service_specimens add constraint ck_lab_tube_charge_mode check (tube_charge_mode in ('NONE', 'PER_TUBE', 'EXCESS_TUBE'));
alter table laboratory_service_specimens add constraint ck_lab_included_tube_count check (included_tube_count >= 0);
alter table laboratory_service_specimens add constraint ck_lab_tube_charge_quantity check (tube_charge_quantity > 0);
create index idx_lab_tube_group on laboratory_service_specimens (tenant_id, tube_group_code, status);
