-- 「组织与人员」拆分为「机构与科室」和「人员管理」两个菜单；两者共用 ORGANIZATION 模块和 ORGANIZATION.ACCESS 权限。
update RHN_SYS_MGMT_MOD
   set NA_MGMT_MOD = '机构与人员', ROUTE_PATH = '/settings/organizations', CD_COMP = 'OrganizationsPage',
       DT_UPDATED = current_timestamp, REVISION = REVISION + 1
 where CD_MGMT_MOD = 'ORGANIZATION';

update RHN_SYS_ACC_PERM
   set NA_ACC_PERM = '访问机构与科室、人员管理'
 where CD_ACC_PERM = 'ORGANIZATION.ACCESS';
