insert into access_roles (id, tenant_id, code, name, role_type, status, created_at, updated_at, version)
values (362387869796001, 362387869790209, 'PORTAL_OPERATOR', '门户操作员', 'BUSINESS', 'ACTIVE', current_timestamp, current_timestamp, 0);

insert into management_modules (id, tenant_id, parent_id, code, name, module_type, route_path, component_code, icon_code, sort_order, status, created_at, updated_at, version)
values (362387869796002, 362387869790209, null, 'PORTAL', '工作门户', 'MODULE', '/', 'Portal', 'home', 10, 'ACTIVE', current_timestamp, current_timestamp, 0);

insert into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869796003, 362387869790209, 362387869796002, 'PORTAL.ACCESS', '访问工作门户', 'ACCESS', 'PORTAL', 'ACTIVE');
insert into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869796004, 362387869790209, 362387869796002, 'TASK.READ', '查看任务', 'READ', 'TASK', 'ACTIVE');
insert into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869796005, 362387869790209, 362387869796002, 'TASK.MANAGE', '处理任务', 'MANAGE', 'TASK', 'ACTIVE');
insert into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869796006, 362387869790209, 362387869796002, 'NOTIFICATION.READ', '查看通知', 'READ', 'NOTIFICATION', 'ACTIVE');

insert into user_role_assignments (id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type, valid_from, valid_to, granted_by, created_at)
values (362387869796007, 362387869790209, 362387869790222, 362387869796001, 362387869790211, 362387869790212, 'DEPARTMENT', current_timestamp, null, 362387869790222, current_timestamp);

insert into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869796008, 362387869790209, 362387869796001, 362387869796003, current_timestamp, null, 362387869790222, current_timestamp);
insert into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869796009, 362387869790209, 362387869796001, 362387869796004, current_timestamp, null, 362387869790222, current_timestamp);
insert into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869796010, 362387869790209, 362387869796001, 362387869796005, current_timestamp, null, 362387869790222, current_timestamp);
insert into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869796011, 362387869790209, 362387869796001, 362387869796006, current_timestamp, null, 362387869790222, current_timestamp);
