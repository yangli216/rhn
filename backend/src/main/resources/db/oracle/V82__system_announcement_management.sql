create table system_announcements (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    scope_type varchar2(24 char) not null,
    organization_id number(19,0),
    department_id number(19,0),
    category varchar2(32 char) not null,
    priority varchar2(24 char) not null,
    title varchar2(200 char) not null,
    summary varchar2(500 char) not null,
    content_text clob not null,
    pinned number(1,0) default 0 not null,
    status varchar2(24 char) not null,
    publish_at timestamp with time zone,
    expire_at timestamp with time zone,
    created_by number(19,0) not null,
    published_by number(19,0),
    published_at timestamp with time zone,
    withdrawn_by number(19,0),
    withdrawn_at timestamp with time zone,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint fk_announcement_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_announcement_org foreign key (tenant_id,organization_id) references organizations(tenant_id,id),
    constraint fk_announcement_dept foreign key (tenant_id,organization_id,department_id)
        references departments(tenant_id,organization_id,id),
    constraint fk_announcement_creator foreign key (tenant_id,created_by) references user_accounts(tenant_id,id),
    constraint fk_announcement_publisher foreign key (tenant_id,published_by) references user_accounts(tenant_id,id),
    constraint fk_announcement_withdrawer foreign key (tenant_id,withdrawn_by) references user_accounts(tenant_id,id),
    constraint uk_announcement_tenant_id unique (tenant_id,id),
    constraint ck_announcement_scope check (
        (scope_type = 'TENANT' and organization_id is null and department_id is null) or
        (scope_type = 'ORGANIZATION' and organization_id is not null and department_id is null) or
        (scope_type = 'DEPARTMENT' and organization_id is not null and department_id is not null)),
    constraint ck_announcement_category check (category in ('GENERAL','POLICY','MAINTENANCE','EMERGENCY')),
    constraint ck_announcement_priority check (priority in ('NORMAL','IMPORTANT','URGENT')),
    constraint ck_announcement_status check (status in ('DRAFT','SCHEDULED','PUBLISHED','WITHDRAWN','EXPIRED')),
    constraint ck_announcement_pinned check (pinned in (0,1)),
    constraint ck_announcement_validity check (expire_at is null or publish_at is null or expire_at > publish_at)
);

create index idx_announcement_audience on system_announcements
    (tenant_id,status,scope_type,organization_id,department_id,publish_at);
create index idx_announcement_lifecycle on system_announcements (status,publish_at,expire_at);

create table announcement_read_receipts (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    announcement_id number(19,0) not null,
    user_id number(19,0) not null,
    read_at timestamp with time zone not null,
    constraint fk_announcement_read_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_announcement_read_item foreign key (tenant_id,announcement_id)
        references system_announcements(tenant_id,id),
    constraint fk_announcement_read_user foreign key (tenant_id,user_id) references user_accounts(tenant_id,id),
    constraint uk_announcement_read unique (tenant_id,announcement_id,user_id)
);

create index idx_announcement_read_user on announcement_read_receipts (tenant_id,user_id,read_at);
