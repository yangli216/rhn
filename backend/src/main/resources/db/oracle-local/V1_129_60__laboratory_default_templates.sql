-- Maintain the preset units in the existing tenant unit directory.
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009000, 0, 362387869790209, '%', '%', '%', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = '%');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009001, 0, 362387869790209, '10^12/L', '10^12/L', '10^12/L', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = '10^12/L');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009002, 0, 362387869790209, '10^9/L', '10^9/L', '10^9/L', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = '10^9/L');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009003, 0, 362387869790209, 'U/L', 'U/L', 'U/L', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'U/L');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009004, 0, 362387869790209, 'fL', 'fL', 'fL', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'fL');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009005, 0, 362387869790209, 'g/L', 'g/L', 'g/L', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'g/L');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009006, 0, 362387869790209, 'mg/L', 'mg/L', 'mg/L', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'mg/L');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009007, 0, 362387869790209, 'mm/h', 'mm/h', 'mm/h', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'mm/h');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009008, 0, 362387869790209, 'mmHg', 'mmHg', 'mmHg', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'mmHg');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009009, 0, 362387869790209, 'mmol/L', 'mmol/L', 'mmol/L', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'mmol/L');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009010, 0, 362387869790209, 'pg', 'pg', 'pg', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'pg');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009011, 0, 362387869790209, 's', 's', 's', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 's');
insert into RHN_BD_UNIT_DEF (ID_UNIT_DEF, REVISION, ID_TNT, CD_UNIT_DEF, NA_UNIT_DEF, SYMBOL, DIM, DECIMAL_SCALE, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387896009012, 0, 362387869790209, 'umol/L', 'umol/L', 'umol/L', 'OTHER', 8, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222 from dual where not exists (select 1 from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = 'umol/L');

-- Default result structures for the existing development hospital laboratory catalog.
-- No reference/critical ranges are asserted. Existing organization versions always win.
-- 26000000000 is a billing add-on and intentionally has no independent result template.

-- 25010100100 血红蛋白测定（Hb）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010000, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"HGB","name":"血红蛋白测定（Hb）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010100100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010100200 红细胞计数（RBC）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010001, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RBC","name":"红细胞计数（RBC）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^12/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010100200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010100300 红细胞比积测定（HCT）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010002, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"HCT","name":"红细胞比积测定（HCT）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010100300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010100800 红细胞沉降率测定（ESR）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010003, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ESR","name":"红细胞沉降率测定（ESR）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mm/h"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010100800'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010100900 白细胞计数（WBC）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010004, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"WBC","name":"白细胞计数（WBC）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010100900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010101000 白细胞分类计数（DC）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010005, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"DC","name":"白细胞分类结果（注明分类方法及各类比例）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010101000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010101400 血小板计数
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010006, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"PLT","name":"血小板计数","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010101400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010101500 血常规（五分类）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010007, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"WBC","name":"白细胞计数","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"RBC","name":"红细胞计数","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^12/L"},{"code":"HGB","name":"血红蛋白","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"},{"code":"HCT","name":"红细胞比容","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"MCV","name":"平均红细胞体积","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"fL"},{"code":"MCH","name":"平均红细胞血红蛋白量","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"pg"},{"code":"MCHC","name":"平均红细胞血红蛋白浓度","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"},{"code":"RDW_CV","name":"红细胞分布宽度变异系数","valueType":"NUMBER","required":false,"a') || to_clob('llowedCodes":[],"rules":[],"unitCode":"%"},{"code":"RDW_SD","name":"红细胞分布宽度标准差","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"fL"},{"code":"PLT","name":"血小板计数","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"MPV","name":"平均血小板体积","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"fL"},{"code":"PDW","name":"血小板分布宽度","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"PCT","name":"血小板压积","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"NEUT_NUM","name":"中性粒细胞绝对值","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"LYMPH_NUM","name":"淋巴细胞绝对值","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"MONO_NUM","name":"单核细胞') || to_clob('绝对值","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"EO_NUM","name":"嗜酸性粒细胞绝对值","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"BASO_NUM","name":"嗜碱性粒细胞绝对值","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"NEUT_PCT","name":"中性粒细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"LYMPH_PCT","name":"淋巴细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"MONO_PCT","name":"单核细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"EO_PCT","name":"嗜酸性粒细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"BASO_PCT","name":"嗜碱性粒细胞百分比","valueType":"NUMBER","required":true,"allowedCod') || to_clob('es":[],"rules":[],"unitCode":"%"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010101500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010101501 血常规（三分类）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010008, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"WBC","name":"白细胞计数","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"RBC","name":"红细胞计数","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^12/L"},{"code":"HGB","name":"血红蛋白","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"},{"code":"HCT","name":"红细胞比容","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"MCV","name":"平均红细胞体积","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"fL"},{"code":"MCH","name":"平均红细胞血红蛋白量","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"pg"},{"code":"MCHC","name":"平均红细胞血红蛋白浓度","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"},{"code":"RDW_CV","name":"红细胞分布宽度变异系数","valueType":"NUMBER","required":false,"a') || to_clob('llowedCodes":[],"rules":[],"unitCode":"%"},{"code":"RDW_SD","name":"红细胞分布宽度标准差","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"fL"},{"code":"PLT","name":"血小板计数","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"MPV","name":"平均血小板体积","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"fL"},{"code":"PDW","name":"血小板分布宽度","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"PCT","name":"血小板压积","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"LYMPH_NUM","name":"淋巴细胞绝对值","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"MID_NUM","name":"中间细胞绝对值","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"GRAN_NUM","name":"粒细胞绝对值') || to_clob('","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"},{"code":"LYMPH_PCT","name":"淋巴细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"MID_PCT","name":"中间细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"GRAN_PCT","name":"粒细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010101501'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010100500 网织红细胞计数（Ret）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010009, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RET_PCT","name":"网织红细胞百分比","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"RET_NUM","name":"网织红细胞绝对值","valueType":"NUMBER","required":false,"allowedCodes":[],"rules":[],"unitCode":"10^9/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010100500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010190100 血气分析
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010010, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"PH","name":"pH","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[]},{"code":"PCO2","name":"二氧化碳分压","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmHg"},{"code":"PO2","name":"氧分压","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmHg"},{"code":"HCO3","name":"碳酸氢根","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"},{"code":"BE","name":"碱剩余","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"},{"code":"SO2","name":"氧饱和度","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"},{"code":"BLOOD_SOURCE","name":"标本来源及吸氧条件","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010190100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010200100 尿常规
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010011, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"COLOR","name":"尿液颜色","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"CLARITY","name":"尿液透明度","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"SG","name":"尿比重","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[]},{"code":"PH","name":"尿pH","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[]},{"code":"LEU","name":"白细胞酯酶","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"NIT","name":"亚硝酸盐","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"PRO","name":"尿蛋白","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"GLU_U","name":"尿糖","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"KET","name":"尿酮体","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"BLD","name":"尿隐血","') || to_clob('valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"BIL","name":"尿胆红素","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"UBG","name":"尿胆原（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"URINE_SEDIMENT","name":"尿沉渣镜检结果及计数单位","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010200100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010200500 尿蛋白定性
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010012, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25010200500","name":"尿蛋白定性（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010200500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010200600 尿蛋白定量
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010013, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25010200600","name":"尿蛋白定量（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010200600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010202100 尿妊娠试验
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010014, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25010202100","name":"尿妊娠试验（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010202100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010203400 尿红细胞位相
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010015, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25010203400","name":"尿红细胞位相（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010203400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010300100 粪便常规
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010016, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"COLOR","name":"粪便颜色","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"CONSISTENCY","name":"粪便性状","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"WBC","name":"白细胞（含镜检计数单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"RBC","name":"红细胞（含镜检计数单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"PARASITE","name":"寄生虫及虫卵","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"OTHER","name":"其他镜检所见","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010300100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010300200 粪便隐血试验（OB）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010017, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25010300200","name":"粪便隐血试验（OB）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010300200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010400100 胸腹水常规检查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010018, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"APPEARANCE","name":"外观","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"CELL_COUNT","name":"细胞计数（含单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"CELL_DIFF","name":"细胞分类","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"RIVALTA","name":"李凡他试验","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"MICROSCOPY","name":"镜检所见","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010400100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010400300 脑脊液检查（CSF）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010019, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"APPEARANCE","name":"脑脊液外观","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"CELL_COUNT","name":"细胞计数（含单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"CELL_DIFF","name":"细胞分类","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"PROTEIN","name":"蛋白结果（含单位）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"MICROSCOPY","name":"镜检所见","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010400300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010401300 前列腺液检查含外观和镜检
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010020, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"APPEARANCE","name":"外观","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"WBC","name":"白细胞（含镜检计数单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"RBC","name":"红细胞（含镜检计数单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"LECITHIN","name":"卵磷脂小体","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"OTHER","name":"其他所见","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010401300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010401400 阴道分泌物检查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010021, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CLEANLINESS","name":"清洁度","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"WBC","name":"白细胞（含镜检计数单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"EPITHELIAL","name":"上皮细胞","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"TRICHOMONAS","name":"滴虫","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"FUNGUS","name":"真菌","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"CLUE_CELL","name":"线索细胞","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010401400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25010401800 痰液检查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010022, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"APPEARANCE","name":"痰液外观","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"MICROSCOPY","name":"镜检所见","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25010401800'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25020302000 血浆凝血酶原时间测定（PT）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010023, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"PT","name":"血浆凝血酶原时间测定（PT）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"s"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25020302000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25020302500 活化部分凝血活酶时间测定（APTT）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010024, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"APTT","name":"活化部分凝血活酶时间测定（APTT）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"s"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25020302500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25020303000 血浆纤维蛋白原测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010025, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"FIB","name":"血浆纤维蛋白原测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25020303000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25020303500 凝血酶时间测定（TT）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010026, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"TT","name":"凝血酶时间测定（TT）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"s"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25020303500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25020306500 纤维蛋白（原）降解产物测定（FDP）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010027, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25020306500","name":"纤维蛋白（原）降解产物测定（FDP）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25020306500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25020306600 血浆D-二聚体测定（D-Dimer）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010028, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25020306600","name":"血浆D-二聚体测定（D-Dimer）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25020306600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030100100 血清总蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010029, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"TP","name":"血清总蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030100100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030100200 血清白蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010030, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ALB","name":"血清白蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030100200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030100600 血清前白蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010031, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"PA","name":"血清前白蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mg/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030100600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030101700 超敏C反应蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010032, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"HS_CRP","name":"超敏C反应蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mg/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030101700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040102500 C-反应蛋白测定（CRP）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010033, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CRP","name":"C-反应蛋白测定（CRP）","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mg/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040102500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030200100 葡萄糖测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010034, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"GLU","name":"葡萄糖测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030200100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030200300 糖化血红蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010035, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"HBA1C","name":"糖化血红蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"%"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030200300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030300100 血清总胆固醇测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010036, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"TC","name":"血清总胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030300100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030300200 血清甘油三酯测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010037, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"TG","name":"血清甘油三酯测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030300200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030300400 血清高密度脂蛋白胆固醇测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010038, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"HDL_C","name":"血清高密度脂蛋白胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030300400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030300500 血清低密度脂蛋白胆固醇测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010039, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"LDL_C","name":"血清低密度脂蛋白胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030300500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030300700 血清载脂蛋白AⅠ测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010040, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"APO_A1","name":"血清载脂蛋白AⅠ测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030300700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030300900 血清载脂蛋白B测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010041, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"APO_B","name":"血清载脂蛋白B测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030300900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030400101 钾测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010042, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"K","name":"钾测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030400101'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030400201 钠测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010043, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"NA","name":"钠测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030400201'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030400301 氯测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010044, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CL","name":"氯测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030400301'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030400401 钙测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010045, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CA","name":"钙测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030400401'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030400500 无机磷测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010046, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"P","name":"无机磷测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030400500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030400600 镁测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010047, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"MG","name":"镁测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030400600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030400700 铁测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010048, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"FE","name":"铁测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030400700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030500100 血清总胆红素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010049, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"TBIL","name":"血清总胆红素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030500100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030500200 血清直接胆红素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010050, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"DBIL","name":"血清直接胆红素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030500200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030500500 血清总胆汁酸测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010051, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"TBA","name":"血清总胆汁酸测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030500500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030500700 血清丙氨酸氨基转移酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010052, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ALT","name":"血清丙氨酸氨基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030500700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030500800 血清天门冬氨酸氨基转移酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010053, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"AST","name":"血清天门冬氨酸氨基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030500800'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030500900 血清γ-谷氨酰基转移酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010054, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"GGT","name":"血清γ-谷氨酰基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030500900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030501100 血清碱性磷酸酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010055, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ALP","name":"血清碱性磷酸酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030501100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030501400 血清胆碱脂酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010056, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CHE","name":"血清胆碱脂酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030501400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030502300 腺苷脱氨酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010057, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ADA","name":"腺苷脱氨酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030502300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030600100 血清肌酸激酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010058, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CK","name":"血清肌酸激酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030600100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030600200 血清肌酸激酶-MB同工酶活性测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010059, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CK_MB","name":"血清肌酸激酶-MB同工酶活性测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030600200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030600500 乳酸脱氢酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010060, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"LDH","name":"乳酸脱氢酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030600500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030600800 血清肌钙蛋白T测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010061, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25030600800","name":"血清肌钙蛋白T测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030600800'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030600900 血清肌钙蛋白Ⅰ测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010062, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25030600900","name":"血清肌钙蛋白Ⅰ测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030600900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030601000 血清肌红蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010063, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25030601000","name":"血清肌红蛋白测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030601000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030601100 血同型半胱氨酸测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010064, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"HCY","name":"血同型半胱氨酸测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030601100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030690200 B型纳尿肽定量测定（BNP）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010065, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25030690200","name":"B型纳尿肽定量测定（BNP）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030690200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030700100 尿素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010066, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"UREA","name":"尿素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030700100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030700102 尿素氮测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010067, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"BUN","name":"尿素氮测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030700102'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030700200 肌酐测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010068, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CREA","name":"肌酐测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030700200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030700500 血清尿酸测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010069, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"UA","name":"血清尿酸测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030700500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030700600 尿微量白蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010070, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"U_MALB","name":"尿微量白蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mg/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030700600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030702800 血清胱抑素（CystatinC）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010071, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CYS_C","name":"血清胱抑素（CystatinC）测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mg/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030702800'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030800400 淀粉酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010072, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"AMY","name":"淀粉酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030800400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030800600 血清脂肪酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010073, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"LIP","name":"血清脂肪酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030800600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030900100 25羟维生素D测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010074, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25030900100","name":"25羟维生素D测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030900100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25030900300 叶酸测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010075, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25030900300","name":"叶酸测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25030900300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031000100 血清促甲状腺激素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010076, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031000100","name":"血清促甲状腺激素测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031000100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031001000 血清甲状腺素（T4）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010077, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031001000","name":"血清甲状腺素（T4）测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031001000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031001100 血清三碘甲状原氨酸（T3）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010078, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031001100","name":"血清三碘甲状原氨酸（T3）测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031001100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031001300 血清游离甲状腺素（FT4）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010079, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031001300","name":"血清游离甲状腺素（FT4）测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031001300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031001400 血清游离三碘甲状原氨酸（FT3）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010080, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031001400","name":"血清游离三碘甲状原氨酸（FT3）测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031001400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031003600 雌二醇测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010081, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031003600","name":"雌二醇测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031003600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031003700 孕酮测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010082, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031003700","name":"孕酮测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031003700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031003800 血清人绒毛膜促性腺激素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010083, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031003800","name":"血清人绒毛膜促性腺激素测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031003800'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031003900 血清胰岛素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010084, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031003900","name":"血清胰岛素测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031003900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031004100 血清C肽测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010085, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25031004100","name":"血清C肽测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031004100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040102004 补体C3测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010086, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"C3","name":"补体C3测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040102004'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040102005 补体C4测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010087, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"C4","name":"补体C4测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040102005'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040102300 免疫球蛋白IgA定量测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010088, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"IGA","name":"免疫球蛋白IgA定量测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040102300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040102301 免疫球蛋白IgG定量测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010089, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"IGG","name":"免疫球蛋白IgG定量测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040102301'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040102302 免疫球蛋白IgM定量测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010090, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"IGM","name":"免疫球蛋白IgM定量测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040102302'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040200200 抗核抗体测定（ANA）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010091, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040200200","name":"抗核抗体测定（ANA）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040200200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040200300 抗核提取物抗体测定（抗ENA抗体）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010092, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040200300","name":"抗核提取物抗体测定（抗ENA抗体）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040200300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040201700 抗甲状腺球蛋白抗体测定（TGAb）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010093, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040201700","name":"抗甲状腺球蛋白抗体测定（TGAb）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040201700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040201703 抗甲状腺过氧化物酶抗体测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010094, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040201703","name":"抗甲状腺过氧化物酶抗体测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040201703'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040203500 类风湿因子（RF）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010095, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040203500","name":"类风湿因子（RF）测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040203500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040300400 乙肝表面抗原测定（HBsAg）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010096, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040300400","name":"乙肝表面抗原测定（HBsAg）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040300400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040300500 乙肝表面抗体测定（Anti-HBs）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010097, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040300500","name":"乙肝表面抗体测定（Anti-HBs）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040300500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040300600 乙肝e抗原测定（HBeAg）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010098, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040300600","name":"乙肝e抗原测定（HBeAg）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040300600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040300700 乙肝e抗体测定（Anti-HBe）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010099, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040300700","name":"乙肝e抗体测定（Anti-HBe）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040300700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040300900 乙肝核心抗体测定（Anti-HBc）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010100, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040300900","name":"乙肝核心抗体测定（Anti-HBc）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040300900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040301000 乙肝核心IgM抗体测定（Anti-HBcIgM）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010101, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040301000","name":"乙肝核心IgM抗体测定（Anti-HBcIgM）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040301000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040301300 丙型肝炎RNA测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010102, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040301300","name":"丙型肝炎RNA测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040301300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040301400 丙型肝炎抗体（IgM）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010103, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040301400","name":"丙型肝炎抗体（IgM）测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040301400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040301401 丙型肝炎抗体（IgG）测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010104, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040301401","name":"丙型肝炎抗体（IgG）测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040301401'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040301900 人免疫缺陷病毒抗体测定（Anti-HIV）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010105, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040301900","name":"人免疫缺陷病毒抗体测定（Anti-HIV）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040301900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040391000 人免疫缺陷病毒（HIV）抗原抗体联合检测
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010106, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040391000","name":"人免疫缺陷病毒（HIV）抗原抗体联合检测（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040391000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040304300 抗链球菌溶血素O测定（ASO）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010107, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040304300","name":"抗链球菌溶血素O测定（ASO）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040304300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040305000 肺炎支原体血清学试验
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010108, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040305000","name":"肺炎支原体血清学试验（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040305000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040305300 梅毒螺旋体特异抗体测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010109, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040305300","name":"梅毒螺旋体特异抗体测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040305300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040305400 快速血浆反应素试验（RPR）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010110, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040305400","name":"快速血浆反应素试验（RPR）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040305400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040304205 幽门螺杆菌抗体测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010111, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040304205","name":"幽门螺杆菌抗体测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040304205'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040306600 人乳头瘤病毒（HPV）核酸检测
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010112, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040306600","name":"人乳头瘤病毒（HPV）核酸检测（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040306600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040392000 新型冠状病毒抗原检测
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010113, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040392000","name":"新型冠状病毒抗原检测（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040392000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25070001202 新型冠状病毒核酸检测
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010114, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25070001202","name":"新型冠状病毒核酸检测（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25070001202'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040400100 癌胚抗原测定（CEA）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010115, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040400100","name":"癌胚抗原测定（CEA）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040400100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040400200 甲胎蛋白测定（AFP）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010116, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040400200","name":"甲胎蛋白测定（AFP）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040400200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040400500 总前列腺特异性抗原测定（TPSA）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010117, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040400500","name":"总前列腺特异性抗原测定（TPSA）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040400500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040400600 游离前列腺特异性抗原测定（FPSA）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010118, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040400600","name":"游离前列腺特异性抗原测定（FPSA）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040400600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040400900 神经元特异性烯醇化酶测定（NSE）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010119, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040400900","name":"神经元特异性烯醇化酶测定（NSE）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040400900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040401000 细胞角蛋白19片段测定（CYFRA21-1）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010120, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040401000","name":"细胞角蛋白19片段测定（CYFRA21-1）（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040401000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040401103 糖类抗原CA15-3测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010121, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040401103","name":"糖类抗原CA15-3测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040401103'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040401105 糖类抗原CA19-9测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010122, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040401105","name":"糖类抗原CA19-9测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040401105'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040401107 糖类抗原CA-125测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010123, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040401107","name":"糖类抗原CA-125测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040401107'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25040401500 铁蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010124, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25040401500","name":"铁蛋白测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25040401500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050100100 一般细菌涂片检查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010125, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25050100100","name":"一般细菌涂片检查（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050100100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050100900 一般细菌培养及鉴定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010126, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CULTURE","name":"培养结果","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"ORGANISM","name":"菌种鉴定（含多菌种描述）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"COUNT","name":"菌落计数及单位","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"SUSCEPTIBILITY","name":"药敏结果（注明菌株、药物、结果、单位及判定依据）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050100900'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050101000 尿培养加菌落计数
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010127, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CULTURE","name":"培养结果","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"ORGANISM","name":"菌种鉴定（含多菌种描述）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"COUNT","name":"菌落计数及单位","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"SUSCEPTIBILITY","name":"药敏结果（注明菌株、药物、结果、单位及判定依据）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050101000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050101100 血培养及鉴定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010128, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CULTURE","name":"培养结果","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"ORGANISM","name":"菌种鉴定（含多菌种描述）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"COUNT","name":"菌落计数及单位","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"SUSCEPTIBILITY","name":"药敏结果（注明菌株、药物、结果、单位及判定依据）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050101100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050101300 结核菌培养及鉴定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010129, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CULTURE","name":"培养结果","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"ORGANISM","name":"菌种鉴定（含多菌种描述）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"COUNT","name":"菌落计数及单位","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"SUSCEPTIBILITY","name":"药敏结果（注明菌株、药物、结果、单位及判定依据）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050101300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050102600 真菌涂片检查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010130, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25050102600","name":"真菌涂片检查（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050102600'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050102700 真菌培养及鉴定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010131, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CULTURE","name":"培养结果","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"ORGANISM","name":"菌种鉴定（含多菌种描述）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"COUNT","name":"菌落计数及单位","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"SUSCEPTIBILITY","name":"药敏结果（注明菌株、药物、结果、单位及判定依据）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050102700'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050103100 衣原体检查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010132, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25050103100","name":"衣原体检查（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050103100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050103400 支原体培养及药敏
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010133, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"CULTURE","name":"培养结果","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"ORGANISM","name":"菌种鉴定（含多菌种描述）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"COUNT","name":"菌落计数及单位","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"SUSCEPTIBILITY","name":"药敏结果（注明菌株、药物、结果、单位及判定依据）","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050103400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050103500 轮状病毒检测
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010134, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25050103500","name":"轮状病毒检测（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050103500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050200100 常规药敏定性试验
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010135, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ORGANISM","name":"菌株标识及名称","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"DRUG_RESULTS","name":"逐药结果（注明药名、测定值、单位和S/I/R判定）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"METHOD","name":"方法及判读标准版本","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050200100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25050200200 常规药敏定量试验（MIC）
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010136, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ORGANISM","name":"菌株标识及名称","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"DRUG_RESULTS","name":"逐药结果（注明药名、测定值、单位和S/I/R判定）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"METHOD","name":"方法及判读标准版本","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25050200200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25060100100 粪寄生虫镜检
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010137, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25060100100","name":"粪寄生虫镜检（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25060100100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25060100500 血液疟原虫检查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010138, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25060100500","name":"血液疟原虫检查（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25060100500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25070100100 乙型肝炎病毒脱氧核糖核酸扩增定量检测
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010139, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RESULT_25070100100","name":"乙型肝炎病毒脱氧核糖核酸扩增定量检测（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25070100100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25070001000 唐氏综合症产前筛查
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010140, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ANALYTES","name":"检测指标及结果（含单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"RISK","name":"筛查结论／风险值","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"METHOD","name":"检测方法及解释","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25070001000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25070090300 新生儿疾病筛查2项检测
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010141, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ANALYTES","name":"检测指标及结果（含单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"RISK","name":"筛查结论／风险值","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"METHOD","name":"检测方法及解释","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25070090300'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 26000000100 ABO红细胞定型
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010142, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ABO_FORWARD","name":"ABO正定型","valueType":"CODE","required":true,"allowedCodes":["A","B","AB","O","待复核"],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '26000000100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 26000000200 ABO血型鉴定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010143, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"ABO","name":"ABO血型","valueType":"CODE","required":true,"allowedCodes":["A","B","AB","O","待复核"],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '26000000200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 26000000400 Rh血型鉴定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010144, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"RH_D","name":"Rh(D)血型","valueType":"CODE","required":true,"allowedCodes":["阳性","阴性","待复核"],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '26000000400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 26000001100 盐水介质交叉配血
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896010145, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, to_clob('{"indicators":[{"code":"DONOR_ID","name":"献血者／血袋标识","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"MAJOR","name":"主侧配血结果","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]},{"code":"MINOR","name":"次侧配血结果","valueType":"STRING","required":false,"allowedCodes":[],"rules":[]},{"code":"CROSSMATCH","name":"配血结论","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}')
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '26000001100'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);
