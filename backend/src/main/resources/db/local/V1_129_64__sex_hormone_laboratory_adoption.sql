-- 开发医院采用新增的性激素单项，并提供与 V1_129_60 一致的默认录入结构（不预置参考区间/危急值）。

-- 25031000200 血清泌乳素测定
insert into RHN_BD_ORG_CATALOG_ITEM select 362387892000410, 0, 362387869790209, 362387869790211, 362387890000410, 362387869790212, '25031000200', '血清泌乳素测定', true, true, true, false, false, false, false, 'ACTIVE', date '2024-01-01', null, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, null where exists (select 1 from RHN_BD_CATALOG_ITEM where ID_CATALOG_ITEM = 362387890000410) and not exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000410);
insert into RHN_BD_SEARCH_ENTRY select 362387894000410, 0, 'ORGANIZATION', 362387869790211, 362387869790209, 'CATALOG_ITEM', 362387890000410, 'LOCAL_NAME', 'adoption:local', '血清泌乳素测定', 'XQMRSCD', null, null, true, 'search-code-v1', 'ACTIVE', timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222 where exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000410) and not exists (select 1 from RHN_BD_SEARCH_ENTRY where ID_SEARCH_ENTRY = 362387894000410);
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012100, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, '{"indicators":[{"code":"RESULT_25031000200","name":"血清泌乳素测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031000200'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031000400 血清促卵泡刺激素测定
insert into RHN_BD_ORG_CATALOG_ITEM select 362387892000411, 0, 362387869790209, 362387869790211, 362387890000411, 362387869790212, '25031000400', '血清促卵泡刺激素测定', true, true, true, false, false, false, false, 'ACTIVE', date '2024-01-01', null, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, null where exists (select 1 from RHN_BD_CATALOG_ITEM where ID_CATALOG_ITEM = 362387890000411) and not exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000411);
insert into RHN_BD_SEARCH_ENTRY select 362387894000411, 0, 'ORGANIZATION', 362387869790211, 362387869790209, 'CATALOG_ITEM', 362387890000411, 'LOCAL_NAME', 'adoption:local', '血清促卵泡刺激素测定', 'XQCLPCJSCD', null, null, true, 'search-code-v1', 'ACTIVE', timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222 where exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000411) and not exists (select 1 from RHN_BD_SEARCH_ENTRY where ID_SEARCH_ENTRY = 362387894000411);
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012101, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, '{"indicators":[{"code":"RESULT_25031000400","name":"血清促卵泡刺激素测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031000400'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031000500 血清促黄体生成素测定
insert into RHN_BD_ORG_CATALOG_ITEM select 362387892000412, 0, 362387869790209, 362387869790211, 362387890000412, 362387869790212, '25031000500', '血清促黄体生成素测定', true, true, true, false, false, false, false, 'ACTIVE', date '2024-01-01', null, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, null where exists (select 1 from RHN_BD_CATALOG_ITEM where ID_CATALOG_ITEM = 362387890000412) and not exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000412);
insert into RHN_BD_SEARCH_ENTRY select 362387894000412, 0, 'ORGANIZATION', 362387869790211, 362387869790209, 'CATALOG_ITEM', 362387890000412, 'LOCAL_NAME', 'adoption:local', '血清促黄体生成素测定', 'XQCHTSCSCD', null, null, true, 'search-code-v1', 'ACTIVE', timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222 where exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000412) and not exists (select 1 from RHN_BD_SEARCH_ENTRY where ID_SEARCH_ENTRY = 362387894000412);
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012102, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, '{"indicators":[{"code":"RESULT_25031000500","name":"血清促黄体生成素测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031000500'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);

-- 25031003000 睾酮测定
insert into RHN_BD_ORG_CATALOG_ITEM select 362387892000413, 0, 362387869790209, 362387869790211, 362387890000413, 362387869790212, '25031003000', '睾酮测定', true, true, true, false, false, false, false, 'ACTIVE', date '2024-01-01', null, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, null where exists (select 1 from RHN_BD_CATALOG_ITEM where ID_CATALOG_ITEM = 362387890000413) and not exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000413);
insert into RHN_BD_SEARCH_ENTRY select 362387894000413, 0, 'ORGANIZATION', 362387869790211, 362387869790209, 'CATALOG_ITEM', 362387890000413, 'LOCAL_NAME', 'adoption:local', '睾酮测定', 'GTCD', null, null, true, 'search-code-v1', 'ACTIVE', timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222, timestamp with time zone '2024-01-01 00:00:00+08', 362387869790222 where exists (select 1 from RHN_BD_ORG_CATALOG_ITEM where ID_ORG_CATALOG_ITEM = 362387892000413) and not exists (select 1 from RHN_BD_SEARCH_ENTRY where ID_SEARCH_ENTRY = 362387894000413);
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012103, c.ID_TNT, o.ID_ORG, c.ID_CATALOG_ITEM, 1, 'LABORATORY', date '2026-01-01',
  '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认', 362387869790222, current_timestamp, '{"indicators":[{"code":"RESULT_25031003000","name":"睾酮测定（按方法填写结果及单位）","valueType":"STRING","required":true,"allowedCodes":[],"rules":[]}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_CATALOG_ITEM c join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and o.ID_TNT = c.ID_TNT
join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and s.ID_TNT = c.ID_TNT
where c.ID_TNT = 362387869790209 and o.ID_ORG = 362387869790211 and c.CD_CATALOG_ITEM = '25031003000'
  and c.SD_STATUS = 'ACTIVE' and o.SD_STATUS = 'ACTIVE' and s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (select 1 from RHN_BD_DIAG_TPL t where t.ID_TNT = c.ID_TNT and t.ID_ORG = o.ID_ORG and t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM);
