-- Keep canonical creation unique; an existing local record may share the standard identity.
-- No medication/product/order IDs or historical snapshots are rewritten.
alter table RHN_BD_MED_STD_SOURCE add CD_BINDING_CLAIM varchar(64) default 'CANONICAL' not null;
alter table RHN_BD_MED_STD_SOURCE drop constraint UK_BD_MED_STD_SOURCE;
alter table RHN_BD_MED_STD_SOURCE add constraint UK_BD_MED_STD_SOURCE unique (ID_TNT, CD_CATALOG, CATALOG_VERSION, CD_STD_SPEC, CD_BINDING_CLAIM);
comment on column RHN_BD_MED_STD_SOURCE.CD_BINDING_CLAIM is 'CANONICAL protects new standard-based creation; EXISTING:local-id preserves distinct historical local records sharing a standard identity.';
