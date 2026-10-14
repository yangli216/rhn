-- Development demo services that duplicate the national catalog are retired so names resolve to one standard item
-- (exact matching, AI catalog review and doctor search). Retirement follows the catalog lifecycle instead of deletion,
-- so the script is safe on databases that already hold orders for them.
--   SRV-GLU 葡萄糖测定          -> 25030200100 葡萄糖测定
--   DEMO-LAB-URINE 尿常规检查   -> 25010200100 尿常规
--   DEMO-EXAM-HEAD-CT 头颅CT平扫 -> 21030000100 CT平扫（一个部位）
--   DEMO-TREAT-NEB 雾化吸入治疗 -> 12070000100 雾化吸入

-- 1. Order-set members follow the standard item; a set that already lists it just drops the demo member.
update RHN_BD_ITEM_GRP_MEMBER g set ID_CATALOG_ITEM = 362387890000297 where g.ID_CATALOG_ITEM = 362387869795102
  and not exists (select 1 from RHN_BD_ITEM_GRP_MEMBER m where m.ID_ITEM_GRP = g.ID_ITEM_GRP and m.ID_CATALOG_ITEM = 362387890000297);
update RHN_BD_ITEM_GRP_MEMBER g set ID_CATALOG_ITEM = 362387890000274 where g.ID_CATALOG_ITEM = 362387871000202
  and not exists (select 1 from RHN_BD_ITEM_GRP_MEMBER m where m.ID_ITEM_GRP = g.ID_ITEM_GRP and m.ID_CATALOG_ITEM = 362387890000274);
update RHN_BD_ITEM_GRP_MEMBER g set ID_CATALOG_ITEM = 362387890000234 where g.ID_CATALOG_ITEM = 362387871000204
  and not exists (select 1 from RHN_BD_ITEM_GRP_MEMBER m where m.ID_ITEM_GRP = g.ID_ITEM_GRP and m.ID_CATALOG_ITEM = 362387890000234);
update RHN_BD_ITEM_GRP_MEMBER g set ID_CATALOG_ITEM = 362387890000144 where g.ID_CATALOG_ITEM = 362387871000205
  and not exists (select 1 from RHN_BD_ITEM_GRP_MEMBER m where m.ID_ITEM_GRP = g.ID_ITEM_GRP and m.ID_CATALOG_ITEM = 362387890000144);
delete from RHN_BD_ITEM_GRP_MEMBER where ID_CATALOG_ITEM in (362387869795102, 362387871000202, 362387871000204, 362387871000205);

-- 2. Specimen collection rules move to the standard laboratory items, which had none.
update RHN_EX_LAB_SVC_SPEC s set ID_CATALOG_ITEM = 362387890000297 where s.ID_CATALOG_ITEM = 362387869795102
  and not exists (select 1 from RHN_EX_LAB_SVC_SPEC x where x.ID_CATALOG_ITEM = 362387890000297);
update RHN_EX_LAB_SVC_SPEC s set ID_CATALOG_ITEM = 362387890000274 where s.ID_CATALOG_ITEM = 362387871000202
  and not exists (select 1 from RHN_EX_LAB_SVC_SPEC x where x.ID_CATALOG_ITEM = 362387890000274);
update RHN_BD_SVC_ITEM set SD_SPEC_TYPE = 'SERUM' where ID_CATALOG_ITEM = 362387890000297 and SD_SPEC_TYPE is null;
update RHN_BD_SVC_ITEM set SD_SPEC_TYPE = 'URINE' where ID_CATALOG_ITEM = 362387890000274 and SD_SPEC_TYPE is null;

-- 3. Retire the demo items, their adoptions, remaining specimen rules and variants; hide them from search.
update RHN_BD_CATALOG_ITEM set SD_STATUS = 'RETIRED', DA_VALID_TO = date '2026-10-14', REVISION = REVISION + 1
  where ID_CATALOG_ITEM in (362387869795102, 362387871000202, 362387871000204, 362387871000205) and SD_STATUS <> 'RETIRED';
update RHN_BD_ORG_CATALOG_ITEM set SD_STATUS = 'RETIRED', DA_VALID_TO = date '2026-10-14', REVISION = REVISION + 1
  where ID_CATALOG_ITEM in (362387869795102, 362387871000202, 362387871000204, 362387871000205) and SD_STATUS = 'ACTIVE';
update RHN_EX_LAB_SVC_SPEC set SD_STATUS = 'RETIRED', REVISION = REVISION + 1
  where ID_CATALOG_ITEM in (362387869795102, 362387871000202) and SD_STATUS = 'ACTIVE';
update RHN_BD_SVC_VAR set SD_STATUS = 'RETIRED', REVISION = REVISION + 1
  where ID_CATALOG_ITEM in (362387871000204, 362387871000205) and SD_STATUS = 'ACTIVE';
update RHN_BD_SEARCH_ENTRY set SD_STATUS = 'INACTIVE', REVISION = REVISION + 1 where SD_TARGET_TYPE = 'CATALOG_ITEM'
  and ID_TARGET in (362387869795102, 362387871000202, 362387871000204, 362387871000205) and SD_STATUS = 'ACTIVE';
