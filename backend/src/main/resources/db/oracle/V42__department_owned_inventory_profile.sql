update stock_sites s
set (code, name, valid_from, valid_to) = (
    select d.code, d.name, d.valid_from, d.valid_to
    from departments d
    where d.tenant_id = s.tenant_id and d.id = s.department_id
)
where s.department_id is not null;

alter table stock_sites add constraint uk_stock_site_department
    unique (tenant_id, organization_id, department_id);
