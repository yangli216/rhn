create table item_types (
    id bigint primary key,
    revision bigint default 0 not null,
    scope_type varchar(16) not null,
    scope_code varchar(80) not null,
    tenant_id bigint,
    parent_id bigint,
    code varchar(128) not null,
    name varchar(200) not null,
    description varchar(1000),
    subject_type varchar(32) not null,
    sort_order integer not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_item_type_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_type_parent foreign key (parent_id) references item_types(id),
    constraint uk_item_type_scope_code unique (scope_code, code),
    constraint uk_item_type_tenant_id unique (tenant_id, id),
    constraint ck_item_type_scope check (
        (scope_type = 'PLATFORM' and scope_code = 'PLATFORM' and tenant_id is null) or
        (scope_type = 'TENANT' and tenant_id is not null)
    ),
    constraint ck_item_type_subject check (subject_type in ('MEDICATION', 'CATALOG_ITEM'))
);
create index idx_item_type_parent on item_types (parent_id, sort_order);
create index idx_item_type_subject on item_types (subject_type, status, sort_order);

insert into item_types values
    (362387869797001, 0, 'PLATFORM', 'PLATFORM', null, null, 'CATALOG_ITEM', '统一目录项', '诊疗服务、药品产品、耗材和资产等可经营目录项的类型根。', 'CATALOG_ITEM', 10, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797002, 0, 'PLATFORM', 'PLATFORM', null, 362387869797001, 'SERVICE', '诊疗服务', null, 'CATALOG_ITEM', 10, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797003, 0, 'PLATFORM', 'PLATFORM', null, 362387869797002, 'SERVICE.LAB_TEST', '检验项目', null, 'CATALOG_ITEM', 10, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797004, 0, 'PLATFORM', 'PLATFORM', null, 362387869797002, 'SERVICE.EXAMINATION', '检查项目', null, 'CATALOG_ITEM', 20, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797005, 0, 'PLATFORM', 'PLATFORM', null, 362387869797002, 'SERVICE.PROCEDURE', '处置操作', null, 'CATALOG_ITEM', 30, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797006, 0, 'PLATFORM', 'PLATFORM', null, 362387869797002, 'SERVICE.TREATMENT', '治疗项目', null, 'CATALOG_ITEM', 40, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797007, 0, 'PLATFORM', 'PLATFORM', null, 362387869797001, 'MEDICATION_PRODUCT', '药品产品', null, 'CATALOG_ITEM', 20, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797011, 0, 'PLATFORM', 'PLATFORM', null, null, 'MEDICATION', '药品', '通用药品知识的类型根。', 'MEDICATION', 20, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797012, 0, 'PLATFORM', 'PLATFORM', null, 362387869797011, 'MEDICATION.WESTERN', '西药和化学药', null, 'MEDICATION', 10, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797013, 0, 'PLATFORM', 'PLATFORM', null, 362387869797011, 'MEDICATION.CHINESE_PATENT', '中成药', null, 'MEDICATION', 20, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797014, 0, 'PLATFORM', 'PLATFORM', null, 362387869797011, 'MEDICATION.HERBAL', '草药饮片', null, 'MEDICATION', 30, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797015, 0, 'PLATFORM', 'PLATFORM', null, 362387869797011, 'MEDICATION.VACCINE', '疫苗', null, 'MEDICATION', 40, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797016, 0, 'PLATFORM', 'PLATFORM', null, 362387869797011, 'MEDICATION.ETHNIC', '民族药', null, 'MEDICATION', 50, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797017, 0, 'PLATFORM', 'PLATFORM', null, 362387869797011, 'MEDICATION.IN_HOUSE', '院内制剂', null, 'MEDICATION', 60, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values
    (362387869797101, 0, 'PLATFORM', 'PLATFORM', null, 'BD_SPECIMEN_TYPE', '检验标本类型', '检验项目允许采集的标本类型。', true, 'ACTIVE', current_timestamp, null, current_timestamp, null, 362387869796000),
    (362387869797102, 0, 'PLATFORM', 'PLATFORM', null, 'BD_SPECIMEN_CONTAINER', '标本容器类型', '采集和送检标本使用的容器。', true, 'ACTIVE', current_timestamp, null, current_timestamp, null, 362387869796000),
    (362387869797103, 0, 'PLATFORM', 'PLATFORM', null, 'BD_LAB_METHOD', '检验方法', '检验项目的主要检测方法。', true, 'ACTIVE', current_timestamp, null, current_timestamp, null, 362387869796000),
    (362387869797104, 0, 'PLATFORM', 'PLATFORM', null, 'BD_EXAM_TYPE', '检查类型', '影像和功能检查的主要类型。', true, 'ACTIVE', current_timestamp, null, current_timestamp, null, 362387869796000),
    (362387869797105, 0, 'PLATFORM', 'PLATFORM', null, 'BD_SERVICE_VARIANT_METHOD', '检查变体方式', '检查部位与实施方式组合使用的方法分类。', true, 'ACTIVE', current_timestamp, null, current_timestamp, null, 362387869796000);

insert into dictionary_items values
    (362387869797111, 362387869797101, 'WHOLE_BLOOD', '全血', null, 10, 'ACTIVE'),
    (362387869797112, 362387869797101, 'SERUM', '血清', null, 20, 'ACTIVE'),
    (362387869797113, 362387869797101, 'PLASMA', '血浆', null, 30, 'ACTIVE'),
    (362387869797114, 362387869797101, 'URINE', '尿液', null, 40, 'ACTIVE'),
    (362387869797115, 362387869797101, 'STOOL', '粪便', null, 50, 'ACTIVE'),
    (362387869797121, 362387869797102, 'EDTA_TUBE', 'EDTA 抗凝管', null, 10, 'ACTIVE'),
    (362387869797122, 362387869797102, 'SERUM_TUBE', '血清分离管', null, 20, 'ACTIVE'),
    (362387869797123, 362387869797102, 'STERILE_CONTAINER', '无菌容器', null, 30, 'ACTIVE'),
    (362387869797131, 362387869797103, 'HEMATOLOGY', '血液学检测', null, 10, 'ACTIVE'),
    (362387869797132, 362387869797103, 'BIOCHEMISTRY', '生化检测', null, 20, 'ACTIVE'),
    (362387869797133, 362387869797103, 'IMMUNOASSAY', '免疫检测', null, 30, 'ACTIVE'),
    (362387869797141, 362387869797104, 'ULTRASOUND', '超声检查', null, 10, 'ACTIVE'),
    (362387869797142, 362387869797104, 'RADIOGRAPHY', 'X 线检查', null, 20, 'ACTIVE'),
    (362387869797143, 362387869797104, 'CT', 'CT 检查', null, 30, 'ACTIVE'),
    (362387869797144, 362387869797104, 'MRI', 'MRI 检查', null, 40, 'ACTIVE'),
    (362387869797151, 362387869797105, 'STANDARD', '常规方式', null, 10, 'ACTIVE'),
    (362387869797152, 362387869797105, 'ENHANCED', '增强方式', null, 20, 'ACTIVE');

create table item_masters (
    id bigint primary key,
    revision bigint default 0 not null,
    item_type_id bigint not null,
    code varchar(128) not null,
    name varchar(300) not null,
    subject_type varchar(32) not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_item_master_type foreign key (item_type_id) references item_types(id),
    constraint uk_item_master_code_period unique (code, valid_from),
    constraint ck_item_master_subject check (subject_type in ('MEDICATION', 'CATALOG_ITEM')),
    constraint ck_item_master_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_item_master_lookup on item_masters (item_type_id, status, name);

alter table catalog_items add column item_type_id bigint;
alter table catalog_items add column item_master_id bigint;
update catalog_items set item_type_id = 362387869797001;
update catalog_items set item_type_id = 362387869797007 where item_type = 'MED_PRODUCT';
update catalog_items set item_type_id = 362387869797002 where item_type = 'SERVICE';
update catalog_items set item_type_id = 362387869797003 where id in (
    select catalog_item_id from service_items where service_type = 'LABORATORY'
);
update catalog_items set item_type_id = 362387869797004 where id in (
    select catalog_item_id from service_items where service_type = 'EXAMINATION'
);
update catalog_items set item_type_id = 362387869797005 where id in (
    select catalog_item_id from service_items where service_type = 'PROCEDURE'
);
update catalog_items set item_type_id = 362387869797006 where id in (
    select catalog_item_id from service_items where service_type = 'TREATMENT'
);
alter table catalog_items alter column item_type_id set not null;
alter table catalog_items add constraint fk_catalog_item_type foreign key (item_type_id) references item_types(id);
alter table catalog_items add constraint fk_catalog_item_master foreign key (item_master_id) references item_masters(id);
create index idx_catalog_item_config_type on catalog_items (tenant_id, item_type_id, status, name);

alter table medications add column item_type_id bigint;
alter table medications add column item_master_id bigint;
update medications set item_type_id = case medication_type
    when 'WESTERN' then 362387869797012
    when 'CHINESE_PATENT' then 362387869797013
    when 'HERBAL' then 362387869797014
    when 'VACCINE' then 362387869797015
    when 'ETHNIC' then 362387869797016
    when 'IN_HOUSE' then 362387869797017
    else 362387869797011 end;
alter table medications alter column item_type_id set not null;
alter table medications add constraint fk_medication_item_type foreign key (item_type_id) references item_types(id);
alter table medications add constraint fk_medication_item_master foreign key (item_master_id) references item_masters(id);
create index idx_medication_config_type on medications (tenant_id, item_type_id, status, name);

create table medication_western (
    medication_id bigint primary key,
    tenant_id bigint not null,
    active_ingredient varchar(2000),
    therapeutic_class varchar(64),
    biologic boolean default false not null,
    biosimilar boolean default false not null,
    constraint fk_med_western_med foreign key (tenant_id, medication_id) references medications(tenant_id, id)
);
create index idx_med_western_class on medication_western (tenant_id, therapeutic_class);

create table medication_herbal (
    medication_id bigint primary key,
    tenant_id bigint not null,
    medicinal_part_item_id bigint,
    processing_method varchar(64),
    nature_type varchar(64),
    flavor_description varchar(500),
    meridian_description varchar(500),
    decoction_description varchar(1000),
    separate_decoction boolean default false not null,
    constraint fk_med_herbal_med foreign key (tenant_id, medication_id) references medications(tenant_id, id),
    constraint fk_med_herbal_part foreign key (medicinal_part_item_id) references dictionary_items(id)
);
create index idx_med_herbal_part on medication_herbal (tenant_id, medicinal_part_item_id, processing_method);

create table medication_vaccine (
    medication_id bigint primary key,
    tenant_id bigint not null,
    vaccine_type varchar(64),
    dose_series_count integer,
    min_age decimal(12,3),
    max_age decimal(12,3),
    age_unit varchar(32),
    recommended_route varchar(64),
    cold_chain_required boolean default false not null,
    min_temperature decimal(8,3),
    max_temperature decimal(8,3),
    immunization_schedule varchar(2000),
    constraint fk_med_vaccine_med foreign key (tenant_id, medication_id) references medications(tenant_id, id),
    constraint ck_med_vaccine_age check (max_age is null or (min_age is not null and max_age >= min_age)),
    constraint ck_med_vaccine_temp check (max_temperature is null or (min_temperature is not null and max_temperature >= min_temperature))
);
create index idx_med_vaccine_type on medication_vaccine (tenant_id, vaccine_type);

insert into medication_western (medication_id, tenant_id)
select id, tenant_id from medications where medication_type in ('WESTERN', 'CHINESE_PATENT');

create table laboratory_services (
    catalog_item_id bigint primary key,
    tenant_id bigint not null,
    laboratory_method varchar(64),
    report_duration decimal(12,3),
    report_duration_unit varchar(32),
    fasting_required boolean default false not null,
    point_of_care boolean default false not null,
    collection_description varchar(2000),
    constraint fk_lab_service_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_lab_service_tenant_id unique (tenant_id, catalog_item_id),
    constraint ck_lab_report_duration check (report_duration is null or report_duration > 0)
);
create index idx_lab_service_method on laboratory_services (tenant_id, laboratory_method, point_of_care);

insert into laboratory_services (catalog_item_id, tenant_id, collection_description)
select catalog_item_id, tenant_id, attention from service_items where service_type = 'LABORATORY';

create table laboratory_service_specimens (
    id bigint primary key,
    tenant_id bigint not null,
    catalog_item_id bigint not null,
    specimen_item_id bigint not null,
    container_item_id bigint,
    minimum_quantity decimal(28,8),
    minimum_quantity_unit varchar(64),
    default_specimen boolean default false not null,
    required_specimen boolean default true not null,
    sort_order integer not null,
    collection_description varchar(2000),
    status varchar(32) not null,
    constraint fk_lab_spec_item foreign key (tenant_id, catalog_item_id) references laboratory_services(tenant_id, catalog_item_id),
    constraint fk_lab_spec_specimen foreign key (specimen_item_id) references dictionary_items(id),
    constraint fk_lab_spec_container foreign key (container_item_id) references dictionary_items(id),
    constraint uk_lab_specimen unique (tenant_id, catalog_item_id, specimen_item_id),
    constraint uk_lab_specimen_order unique (tenant_id, catalog_item_id, sort_order),
    constraint ck_lab_specimen_quantity check (minimum_quantity is null or minimum_quantity > 0)
);
create index idx_lab_specimen_lookup on laboratory_service_specimens (tenant_id, specimen_item_id, status);

create table examination_services (
    catalog_item_id bigint primary key,
    tenant_id bigint not null,
    examination_type varchar(64),
    body_site_required boolean default false not null,
    multi_body_site boolean default false not null,
    max_body_site_count integer,
    preparation_description varchar(2000),
    constraint fk_exam_service_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_exam_service_tenant_id unique (tenant_id, catalog_item_id),
    constraint ck_exam_body_site_count check (
        max_body_site_count is null or
        (max_body_site_count = 1 and multi_body_site = false) or
        (max_body_site_count > 1 and multi_body_site = true)
    )
);
create index idx_exam_service_type on examination_services (tenant_id, examination_type, body_site_required);

insert into examination_services (
    catalog_item_id, tenant_id, examination_type, body_site_required, multi_body_site,
    max_body_site_count, preparation_description
)
select catalog_item_id, tenant_id, examination_type, false,
       case when max_body_site_count is not null and max_body_site_count > 1 then true else false end,
       max_body_site_count, attention
from service_items where service_type = 'EXAMINATION';

create table service_variants (
    id bigint primary key,
    tenant_id bigint not null,
    catalog_item_id bigint not null,
    body_site_concept_id bigint,
    code varchar(128) not null,
    name varchar(300) not null,
    method_type varchar(64),
    body_site_required boolean default false not null,
    mutual_recognition_code varchar(128),
    sort_order integer not null,
    status varchar(32) not null,
    constraint fk_service_variant_item foreign key (tenant_id, catalog_item_id) references examination_services(tenant_id, catalog_item_id),
    constraint fk_service_variant_body_site foreign key (body_site_concept_id) references concepts(id),
    constraint uk_service_variant_code unique (tenant_id, catalog_item_id, code)
);
create index idx_service_variant_lookup on service_variants (tenant_id, body_site_concept_id, method_type, status);
