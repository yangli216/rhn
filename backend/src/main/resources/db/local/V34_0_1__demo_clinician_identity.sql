insert into practitioners (
    id, tenant_id, code, full_name, gender, identity_hash, status,
    created_at, created_by, updated_at, updated_by, revision
) values (
    362387869790223, 362387869790209, 'P-DEMO-DOCTOR', '示范全科医生', null, null, 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0
);

update user_accounts set practitioner_id = 362387869790223
where tenant_id = 362387869790209 and id = 362387869790222;
