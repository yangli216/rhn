insert into management_modules (id, tenant_id, parent_id, code, name, module_type, route_path, component_code, icon_code, sort_order, status, created_at, updated_at, version) values
(362387869896022, 362387869790209, 362387869896001, 'DIAGNOSTIC_EXECUTION', '医技执行', 'MODULE', '/diagnostics', 'DiagnosticWorkspace', 'clinical', 24, 'ACTIVE', current_timestamp, current_timestamp, 0);

update management_modules set sort_order = 25 where tenant_id = 362387869790209 and code = 'BILLING';

insert into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values
(362387869896125, 362387869790209, 362387869896022, 'DIAGNOSTICS.ACCESS', '访问医技执行工作台', 'ACCESS', 'DIAGNOSTIC_EXECUTION', 'ACTIVE');

insert into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values
(362387869896225, 362387869790209, 362387869796001, 362387869896125, current_timestamp, null, 362387869790222, current_timestamp);
