alter table organization_identifiers add constraint fk_org_ident_tenant
    foreign key (tenant_id) references tenants(id);
alter table organization_identifiers add constraint uk_org_ident_tenant_id unique (tenant_id, id);

alter table organization_contacts add constraint fk_org_contact_tenant
    foreign key (tenant_id) references tenants(id);
alter table organization_contacts add constraint uk_org_contact_tenant_id unique (tenant_id, id);

alter table organization_addresses add constraint fk_org_address_tenant
    foreign key (tenant_id) references tenants(id);
alter table organization_addresses add constraint uk_org_address_tenant_id unique (tenant_id, id);

alter table organization_relations add constraint fk_org_relation_tenant
    foreign key (tenant_id) references tenants(id);
alter table organization_relations add constraint uk_org_relation_tenant_id unique (tenant_id, id);

alter table organization_capabilities add constraint fk_org_cap_tenant
    foreign key (tenant_id) references tenants(id);
alter table organization_capabilities add constraint uk_org_cap_tenant_id unique (tenant_id, id);

alter table organization_responsibilities add constraint fk_org_resp_tenant
    foreign key (tenant_id) references tenants(id);
alter table organization_responsibilities add constraint uk_org_resp_tenant_id unique (tenant_id, id);
alter table organization_responsibilities add constraint uk_org_resp_assignment_period
    unique (tenant_id, organization_id, responsibility_type, assignment_id, valid_from);
