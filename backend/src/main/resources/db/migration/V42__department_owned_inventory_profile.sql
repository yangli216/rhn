update stock_sites s
set code = (select d.code from departments d where d.tenant_id = s.tenant_id and d.id = s.department_id),
    name = (select d.name from departments d where d.tenant_id = s.tenant_id and d.id = s.department_id),
    valid_from = (select d.valid_from from departments d where d.tenant_id = s.tenant_id and d.id = s.department_id),
    valid_to = (select d.valid_to from departments d where d.tenant_id = s.tenant_id and d.id = s.department_id)
where s.department_id is not null;

alter table stock_sites add constraint uk_stock_site_department
    unique (tenant_id, organization_id, department_id);
