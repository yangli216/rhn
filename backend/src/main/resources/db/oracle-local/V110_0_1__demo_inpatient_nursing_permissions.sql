insert into access_permissions (
    id,tenant_id,management_module_id,code,name,action_code,resource_code,status
) values (
    362387869896150,362387869790209,362387869896027,
    'INPATIENT.NURSING_RECORD','录入住院护理记录','RECORD','INPATIENT_NURSING','ACTIVE'
);
insert into access_permissions (
    id,tenant_id,management_module_id,code,name,action_code,resource_code,status
) values (
    362387869896151,362387869790209,362387869896027,
    'INPATIENT.SHIFT_HANDOFF','住院病区交接班','SIGN','INPATIENT_HANDOFF','ACTIVE'
);
insert into role_permission_assignments (
    id,tenant_id,role_id,permission_id,valid_from,valid_to,granted_by,created_at
) values (
    362387869896250,362387869790209,362387869796001,362387869896150,
    current_timestamp,null,362387869790222,current_timestamp
);
insert into role_permission_assignments (
    id,tenant_id,role_id,permission_id,valid_from,valid_to,granted_by,created_at
) values (
    362387869896251,362387869790209,362387869796001,362387869896151,
    current_timestamp,null,362387869790222,current_timestamp
);
