alter table configuration_definitions
    add configuration_category varchar2(24 char) default 'BUSINESS' not null;
alter table configuration_definitions
    add inheritance_enabled number(1,0) default 1 not null;
alter table configuration_definitions
    add cache_enabled number(1,0) default 1 not null;

update configuration_definitions
   set allowed_scopes = replace(allowed_scopes, 'PRODUCT', 'GLOBAL');
update configuration_revisions
   set scope_type = 'GLOBAL'
 where scope_type = 'PRODUCT';

alter table configuration_revisions add tenant_id number(19,0);

update configuration_revisions
   set tenant_id = scope_id
 where scope_type = 'TENANT';

update configuration_revisions r
   set tenant_id = (select o.tenant_id from organizations o where o.id = r.scope_id)
 where r.scope_type = 'ORGANIZATION';

update configuration_revisions r
   set tenant_id = (select d.tenant_id from organizations d where d.id = r.scope_id)
 where r.scope_type = 'DEPARTMENT';

alter table configuration_revisions add constraint fk_configuration_revision_tenant
    foreign key (tenant_id) references tenants(id);
alter table configuration_revisions add constraint ck_configuration_revision_scope_tenant
    check ((scope_type = 'GLOBAL' and tenant_id is null)
        or (scope_type in ('TENANT', 'ORGANIZATION', 'DEPARTMENT', 'USER') and tenant_id is not null));
alter table configuration_definitions add constraint ck_configuration_category
    check (configuration_category in ('SYSTEM', 'BUSINESS'));

create index idx_configuration_tenant_resolve on configuration_revisions
    (tenant_id, definition_id, scope_type, scope_id, status, effective_from);
