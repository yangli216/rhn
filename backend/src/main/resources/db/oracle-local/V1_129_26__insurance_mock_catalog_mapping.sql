-- 医保 Mock 联调：为演示库已有的诊疗目录项目与药品建立“医保目录对照”（联调目录 MOCK-CATALOG，授权类型 INSURANCE）。
-- 编码仅用于对接 thirdparty-mock-server，不代表任何真实医保目录；新增项目请在“标准映射管理”中另行对照。
-- 配套 application-insurance-mock.yml 的 insurance-system-code=MOCK-CATALOG。仅位于 db/oracle-local。
insert into RHN_BD_CODE_SYSTEM values (362387869900801, 'PRODUCT', 0, 'MOCK-CATALOG', '医保 Mock 联调目录', 'urn:rhn:codesystem:insurance-mock', '2026.01', 'ACTIVE', date '2026-01-01', null, systimestamp, 'COMMON', 'thirdparty-mock-server', '联调专用医保目录，编码为占位值，不代表真实医保政策', 'MANUAL', 0, systimestamp, 'INSURANCE', null, null, null);

insert into RHN_BD_CONCEPT (ID_CONCEPT, ID_CODE_SYSTEM, CD_CONCEPT, NA_DISPLAY, SD_STATUS, DA_EFFECTIVE_FROM, DT_CREATED, SD_CONCEPT_TYPE, SD_SRC_TYPE, REVISION, DT_UPDATED)
select s.ID_ITEM_ATTR_SUBJECT + 200000000, 362387869900801, 'MOCKYB' || substr(to_char(s.ID_ITEM_ATTR_SUBJECT), -7),
       coalesce(ci.NA_CATALOG_ITEM, m.NA_MED), 'ACTIVE', date '2026-01-01', systimestamp, 'CONCEPT', 'MANUAL', 0, systimestamp
from RHN_BD_ITEM_ATTR_SUBJECT s
left join RHN_BD_CATALOG_ITEM ci on ci.ID_CATALOG_ITEM = s.ID_CATALOG_ITEM
left join RHN_BD_MED m on m.ID_MED = s.ID_MED
where s.ID_TNT = 362387869790209 and s.SD_SUBJECT_TYPE in ('CATALOG_ITEM', 'MEDICATION')
  and coalesce(ci.NA_CATALOG_ITEM, m.NA_MED) is not null;

insert into RHN_BD_ITEM_TERM_MAP (ID_ITEM_TERM_MAP, REVISION, ID_TNT, ID_ITEM_ATTR_SUBJECT, ID_CONCEPT, SD_MAP_TYPE, SD_EQUIVALENCE, FG_PRIMARY_MAP, DES_LIMITATION, DA_VALID_FROM, DA_VALID_TO, SD_STATUS, ID_ITEM_TERM_MAP_REPLACES, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select s.ID_ITEM_ATTR_SUBJECT + 300000000, 0, 362387869790209, s.ID_ITEM_ATTR_SUBJECT, s.ID_ITEM_ATTR_SUBJECT + 200000000,
       'INSURANCE', 'EXACT', 1, null, date '2026-01-01', null, 'ACTIVE', null, systimestamp, 362387869790222, systimestamp, 362387869790222
from RHN_BD_ITEM_ATTR_SUBJECT s
where s.ID_TNT = 362387869790209 and exists (select 1 from RHN_BD_CONCEPT c where c.ID_CONCEPT = s.ID_ITEM_ATTR_SUBJECT + 200000000);
