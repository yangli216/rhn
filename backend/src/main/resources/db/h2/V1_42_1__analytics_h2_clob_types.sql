-- H2 alone needs CLOB instead of PostgreSQL TEXT for Hibernate LONG32VARCHAR validation.
alter table RHN_AN_CATALOG_VER alter column JSON_DEFINITION clob;
alter table RHN_AN_DRAFT_VER alter column JSON_SPEC clob;
