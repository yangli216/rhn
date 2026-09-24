-- V1_82_0: Add accounting category dimension to charge items and establish accounting category dictionary (Oracle)
-- Support standard and tenant-customizable fee classification across billing, settlements, and inpatient statements.

-- 1. Add SD_ACCTG_CAT column to RHN_BIL_CHARGE_ITEM
alter table RHN_BIL_CHARGE_ITEM add (
    SD_ACCTG_CAT varchar2(64 char)
);

comment on column RHN_BIL_CHARGE_ITEM.SD_ACCTG_CAT is '费用核算归并大类(SD_ACCTG_CAT)';

create index IDX_BIL_CHARGE_ITE_ACCTG_CAT on RHN_BIL_CHARGE_ITEM (ID_TNT, SD_ACCTG_CAT, DT_OCCRD);

-- 2. Define platform dictionary for BD_ACCOUNTING_CATEGORY
insert into RHN_BD_DICT_DEF (
    ID_DICT_DEF, REVISION, SD_SCOPE_TYPE, CD_SCOPE, ID_TNT,
    CD_DICT_DEF, NA_DICT_DEF, DES_DICT_DEF, SD_STATUS,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    FG_SYS_MANAGED, ID_DICT_CAT
)
select 362387869797201, 0, 'PLATFORM', 'PLATFORM', null,
       'BD_ACCOUNTING_CATEGORY', '费用核算与归并大类',
       '医疗收费、医保结算、电子票据与住院清单共用的会计归并与核算大类，支持租户机构自定义扩展。', 'ACTIVE',
       to_timestamp_tz('2026-09-24 09:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), null,
       to_timestamp_tz('2026-09-24 09:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), null,
       0, 362387869840006
from dual
where not exists (
    select 1 from RHN_BD_DICT_DEF where CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and SD_SCOPE_TYPE = 'PLATFORM'
);

-- 3. Insert standard dictionary items for BD_ACCOUNTING_CATEGORY
insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000101, d.ID_DICT_DEF, 'REGISTRATION', '诊察挂号费', '门诊挂号、普通门诊及专家门诊诊查费', 10, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'REGISTRATION');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000102, d.ID_DICT_DEF, 'TREATMENT', '治疗处置费', '临床各科治疗、急救、清创及注射处置费用', 20, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'TREATMENT');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000103, d.ID_DICT_DEF, 'LABORATORY', '检验费', '临床检验、生物化学、免疫及微生物检验费用', 30, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'LABORATORY');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000104, d.ID_DICT_DEF, 'EXAMINATION', '检查费', '心电图、超声、内窥镜等临床功能检查费用', 40, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'EXAMINATION');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000105, d.ID_DICT_DEF, 'IMAGING', '影像检查费', 'X光片、CT、核磁共振MRI等医学影像检查费用', 50, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'IMAGING');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000106, d.ID_DICT_DEF, 'SURGERY', '手术费', '手术室操作、麻醉及术中监护费用', 60, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'SURGERY');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000107, d.ID_DICT_DEF, 'NURSING', '护理费', '分级护理、重症护理及专项专科护理费用', 70, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'NURSING');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000108, d.ID_DICT_DEF, 'BED', '床位费', '普通病房床位、急诊留观床位及重症监护床位费', 80, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'BED');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000109, d.ID_DICT_DEF, 'BLOOD', '输血费', '临床用全血、成分血及自体血液回输费用', 90, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'BLOOD');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000110, d.ID_DICT_DEF, 'MATERIAL', '材料费', '一次性卫生耗材及医用特殊高值耗材费用', 100, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'MATERIAL');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000111, d.ID_DICT_DEF, 'WESTERN_MED', '西药费', '化学制剂、生物制品及西药注射制剂费用', 110, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'WESTERN_MED');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000112, d.ID_DICT_DEF, 'CHINESE_PATENT_MED', '中成药费', '国家批准上市的中成药丸剂、胶囊及口服液制剂费用', 120, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'CHINESE_PATENT_MED');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000113, d.ID_DICT_DEF, 'HERBAL_MED', '中药饮片费', '传统中药材、中药配方颗粒及中药饮片费用', 130, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'HERBAL_MED');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000114, d.ID_DICT_DEF, 'MEDICATION', '药品费', '统括未细分药品费用', 140, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'MEDICATION');

insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS)
select 910430000000115, d.ID_DICT_DEF, 'OTHER', '其他费用', '救护车出车、特需健康管理等其他医疗服务费用', 150, 'ACTIVE'
from RHN_BD_DICT_DEF d where d.CD_DICT_DEF = 'BD_ACCOUNTING_CATEGORY' and d.SD_SCOPE_TYPE = 'PLATFORM'
and not exists (select 1 from RHN_BD_DICT_ITEM i where i.ID_DICT_DEF_DICT = d.ID_DICT_DEF and i.CD_DICT_ITEM = 'OTHER');

-- 4. Backfill existing RHN_BIL_CHARGE_ITEM records
-- 4.1 Update from RHN_BD_SVC_ITEM if catalog item is a service with SD_ACCTG_CAT
update RHN_BIL_CHARGE_ITEM c
set SD_ACCTG_CAT = (
    select s.SD_ACCTG_CAT from RHN_BD_SVC_ITEM s
    where s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.SD_ACCTG_CAT is not null
)
where c.SD_ACCTG_CAT is null
  and exists (
    select 1 from RHN_BD_SVC_ITEM s
    where s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.SD_ACCTG_CAT is not null
  );

-- 4.2 Update registration items
update RHN_BIL_CHARGE_ITEM c
set SD_ACCTG_CAT = 'REGISTRATION'
where c.SD_ACCTG_CAT is null
  and (c.SD_SRC_TYPE = 'REGISTRATION' or c.SD_SRC_TYPE like 'REGISTRATION%');

-- 4.3 Update inpatient bed day items
update RHN_BIL_CHARGE_ITEM c
set SD_ACCTG_CAT = 'BED'
where c.SD_ACCTG_CAT is null
  and c.SD_SRC_TYPE like '%BED_DAY%';

-- 4.4 Update medication items based on medication catalog item type
update RHN_BIL_CHARGE_ITEM c
set SD_ACCTG_CAT = 'WESTERN_MED'
where c.SD_ACCTG_CAT is null
  and (c.SD_SRC_TYPE like 'MEDICATION%' or c.SD_SRC_TYPE = 'MED_DISPENSE')
  and exists (
    select 1 from RHN_BD_CATALOG_ITEM ci
    where ci.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and ci.SD_ITEM_TYPE = 'MED_PRODUCT'
  );

-- 4.5 Fallback for remaining records
update RHN_BIL_CHARGE_ITEM c
set SD_ACCTG_CAT = 'TREATMENT'
where c.SD_ACCTG_CAT is null
  and (c.SD_SRC_TYPE like 'SERVICE_REQUEST%' or c.SD_SRC_TYPE = 'DIRECT_VISIT_SERVICE');

update RHN_BIL_CHARGE_ITEM c
set SD_ACCTG_CAT = 'MEDICATION'
where c.SD_ACCTG_CAT is null
  and c.SD_SRC_TYPE like 'MEDICATION%';

update RHN_BIL_CHARGE_ITEM c
set SD_ACCTG_CAT = 'OTHER'
where c.SD_ACCTG_CAT is null;
