insert into management_modules (id, tenant_id, parent_id, code, name, module_type, route_path,
    component_code, icon_code, sort_order, status, created_at, updated_at, version) values
(362387869896026, 362387869790209, 362387869896012, 'PHARMACY_ROUTE', '发药药房设置', 'MODULE',
 '/settings/dispense-routes', 'DispenseRouteSettings', 'pharmacy', 55, 'ACTIVE', current_timestamp, current_timestamp, 0);

insert into access_permissions (id, tenant_id, management_module_id, code, name,
    action_code, resource_code, status) values
(362387869896133, 362387869790209, 362387869896026, 'PHARMACY_ROUTE.READ',
 '查看发药药房路由', 'READ', 'PHARMACY_ROUTE', 'ACTIVE'),
(362387869896134, 362387869790209, 362387869896026, 'PHARMACY_ROUTE.MANAGE',
 '维护发药药房路由', 'MANAGE', 'PHARMACY_ROUTE', 'ACTIVE');

insert into role_permission_assignments (id, tenant_id, role_id, permission_id,
    valid_from, valid_to, granted_by, created_at) values
(362387869896233, 362387869790209, 362387869796001, 362387869896133,
 current_timestamp, null, 362387869790222, current_timestamp),
(362387869896234, 362387869790209, 362387869796001, 362387869896134,
 current_timestamp, null, 362387869790222, current_timestamp);

insert into dispense_routes (id, revision, tenant_id, organization_id, code, name,
    source_department_id, medication_type, target_stock_site_id, active, valid_from, valid_to,
    description, created_at, created_by, updated_at, updated_by) values
(362387869899601, 0, 362387869790209, 362387869790211, 'OUTPATIENT-HERBAL',
 '中药饮片发往中药房', null, 'HERBAL', 362387869799504, true, date '2026-01-01', null,
 '机构内中药饮片及配方颗粒统一由中药房调剂发药', current_timestamp, 362387869790222,
 current_timestamp, 362387869790222),
(362387869899602, 0, 362387869790209, 362387869790211, 'OUTPATIENT-DEFAULT',
 '门诊药品默认发药药房', null, null, 362387869799502, true, date '2026-01-01', null,
 '未命中专项规则的门诊药品统一流向门诊药房', current_timestamp, 362387869790222,
 current_timestamp, 362387869790222);
