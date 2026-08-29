-- The local/test Basic Auth identity is backed by a stable account id so audit foreign keys
-- have the same semantics as production authentication. The hash is deliberately unusable;
-- local authentication still uses the profile-configured in-memory password.
insert into user_accounts (
    id, tenant_id, practitioner_id, username, password_hash, status,
    password_changed_at, last_login_at, created_at, updated_at, version
) values (
    '362387869790222', '362387869790209', null, 'doctor', '{noop}not-used', 'ACTIVE',
    current_timestamp, null, current_timestamp, current_timestamp, 0
);
