insert all
  into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869896118, 362387869790209, 362387869896011, 'PHARMACY_WAREHOUSE.READ', '查看库房数据', 'READ', 'PHARMACY_WAREHOUSE', 'ACTIVE')
  into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869896119, 362387869790209, 362387869896011, 'PHARMACY_WAREHOUSE.RECEIVE', '办理采购与入库', 'RECEIVE', 'PHARMACY_WAREHOUSE', 'ACTIVE')
  into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869896120, 362387869790209, 362387869896011, 'PHARMACY_WAREHOUSE.ISSUE', '办理请领与出库', 'ISSUE', 'PHARMACY_WAREHOUSE', 'ACTIVE')
  into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869896121, 362387869790209, 362387869896011, 'PHARMACY_WAREHOUSE.TRANSFER', '办理库存调拨', 'TRANSFER', 'PHARMACY_WAREHOUSE', 'ACTIVE')
  into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869896122, 362387869790209, 362387869896011, 'PHARMACY_WAREHOUSE.COUNT', '办理库存盘点', 'COUNT', 'PHARMACY_WAREHOUSE', 'ACTIVE')
  into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869896123, 362387869790209, 362387869896011, 'PHARMACY_WAREHOUSE.ADJUST', '维护库存及追溯数据', 'ADJUST', 'PHARMACY_WAREHOUSE', 'ACTIVE')
  into access_permissions (id, tenant_id, management_module_id, code, name, action_code, resource_code, status) values (362387869896124, 362387869790209, 362387869896010, 'PHARMACY.DISPENSE', '办理审方、配药、发退药', 'DISPENSE', 'PHARMACY', 'ACTIVE')
select 1 from dual
/

insert all
  into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869896218, 362387869790209, 362387869796001, 362387869896118, current_timestamp, null, 362387869790222, current_timestamp)
  into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869896219, 362387869790209, 362387869796001, 362387869896119, current_timestamp, null, 362387869790222, current_timestamp)
  into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869896220, 362387869790209, 362387869796001, 362387869896120, current_timestamp, null, 362387869790222, current_timestamp)
  into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869896221, 362387869790209, 362387869796001, 362387869896121, current_timestamp, null, 362387869790222, current_timestamp)
  into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869896222, 362387869790209, 362387869796001, 362387869896122, current_timestamp, null, 362387869790222, current_timestamp)
  into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869896223, 362387869790209, 362387869796001, 362387869896123, current_timestamp, null, 362387869790222, current_timestamp)
  into role_permission_assignments (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at) values (362387869896224, 362387869790209, 362387869796001, 362387869896124, current_timestamp, null, 362387869790222, current_timestamp)
select 1 from dual
/
