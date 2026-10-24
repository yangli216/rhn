-- Sourced routine biochemical intervals and explicit clinical decision guidance.
-- Only promote untouched system V1 presets; preserve every previous version and custom publication.
-- No prices, specimens, historical drafts/reports or critical thresholds are changed.

-- 25030100100 血清总蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012000, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.2-2012 表1；中国成人参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"TP","name":"血清总蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4042_TP","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":65,"referenceHigh":85}],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010029 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"TP","name":"血清总蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030100200 血清白蛋白测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012001, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.2-2012 表1；中国成人参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"ALB","name":"血清白蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4042_ALB","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":40,"referenceHigh":55}],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010030 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"ALB","name":"血清白蛋白测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"g/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030200100 葡萄糖测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012002, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  '空腹血清/血浆葡萄糖常用参考3.9～6.1 mmol/L；国家卫健委2025-11-06发布会；需确认空腹≥8小时且非妊娠；非糖尿病诊断或治疗目标', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"GLU","name":"葡萄糖测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"NHC2025_GLU_FASTING","minimumAgeDays":6570,"criticalCodes":[],"referenceLow":3.9,"referenceHigh":6.1,"populationCode":"FASTING8H_NONPREGNANT"}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010034 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"GLU","name":"葡萄糖测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030300100 血清总胆固醇测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012003, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  '中国血脂管理指南（2023年）表3；合适水平＜5.2 mmol/L；限ASCVD一级预防低危、非糖尿病且空腹12小时人群；临床决策参考，不能自动判正常', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"TC","name":"血清总胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"CMA2023_TC_GUIDANCE","minimumAgeDays":6570,"criticalCodes":[],"populationCode":"ASCVD_LOW_RISK_FASTING12H"}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010036 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"TC","name":"血清总胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030300200 血清甘油三酯测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012004, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  '中国血脂管理指南（2023年）表3；合适水平＜1.7 mmol/L；限ASCVD一级预防低危、非糖尿病且空腹12小时人群；临床决策参考，不能自动判正常', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"TG","name":"血清甘油三酯测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"CMA2023_TG_GUIDANCE","minimumAgeDays":6570,"criticalCodes":[],"populationCode":"ASCVD_LOW_RISK_FASTING12H"}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010037 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"TG","name":"血清甘油三酯测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030300400 血清高密度脂蛋白胆固醇测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012005, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  '中国血脂管理指南（2023年）表3；降低界限＜1.0 mmol/L；无统一正常上限；限ASCVD一级预防低危、非糖尿病且空腹12小时人群；临床决策参考，不能自动判正常', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"HDL_C","name":"血清高密度脂蛋白胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"CMA2023_HDL_C_GUIDANCE","minimumAgeDays":6570,"criticalCodes":[],"populationCode":"ASCVD_LOW_RISK_FASTING12H"}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010038 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"HDL_C","name":"血清高密度脂蛋白胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030300500 血清低密度脂蛋白胆固醇测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012006, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  '中国血脂管理指南（2023年）表3；合适水平＜3.4 mmol/L；个体治疗目标需按风险分层；限ASCVD一级预防低危、非糖尿病且空腹12小时人群；临床决策参考，不能自动判正常', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"LDL_C","name":"血清低密度脂蛋白胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"CMA2023_LDL_C_GUIDANCE","minimumAgeDays":6570,"criticalCodes":[],"populationCode":"ASCVD_LOW_RISK_FASTING12H"}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010039 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"LDL_C","name":"血清低密度脂蛋白胆固醇测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030400101 钾测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012007, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.3-2012 表1；中国成人血清参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"K","name":"钾测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4043_K","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":3.5,"referenceHigh":5.3}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010042 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"K","name":"钾测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030400201 钠测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012008, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.3-2012 表1；中国成人血清参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"NA","name":"钠测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4043_NA","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":137,"referenceHigh":147}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010043 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"NA","name":"钠测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030400301 氯测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012009, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.3-2012 表1；中国成人血清参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"CL","name":"氯测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4043_CL","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":99,"referenceHigh":110}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010044 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"CL","name":"氯测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030400401 钙测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012010, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.6-2015 表1；20～79岁；血清参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"CA","name":"钙测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4046_CA","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":2.11,"referenceHigh":2.52}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010045 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"CA","name":"钙测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030400500 无机磷测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012011, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.6-2015 表1；20～79岁；血清参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"P","name":"无机磷测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4046_P","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":0.85,"referenceHigh":1.51}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010046 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"P","name":"无机磷测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030400600 镁测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012012, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.6-2015 表1；20～79岁；血清参考区间', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"MG","name":"镁测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4046_MG","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":0.75,"referenceHigh":1.02}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010047 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"MG","name":"镁测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030400700 铁测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012013, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.6-2015 表1；20～79岁；血清铁', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"FE","name":"铁测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4046_FE_M","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":10.6,"referenceHigh":36.7,"gender":"1"},{"code":"WST4046_FE_F","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":7.8,"referenceHigh":32.2,"gender":"2"}],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010048 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"FE","name":"铁测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030500100 血清总胆红素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012014, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.4-2018 表1；20～79岁；采用性别分组上限（非26/21与23的重叠规则）', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"TBIL","name":"血清总胆红素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4044_TBIL_M","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceHigh":26,"gender":"1"},{"code":"WST4044_TBIL_F","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceHigh":21,"gender":"2"}],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010049 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"TBIL","name":"血清总胆红素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030500200 血清直接胆红素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012015, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.4-2018 表1；20～79岁；重氮法指定分析系统；其他系统不得直接套用', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"DBIL","name":"血清直接胆红素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4044_DBIL_ROCHE","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceHigh":8,"instrumentCode":"ROCHE_DIAZO"},{"code":"WST4044_DBIL_DXC","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceHigh":4,"instrumentCode":"BECKMAN_DXC_DIAZO"},{"code":"WST4044_DBIL_AU","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceHigh":4,"instrumentCode":"BECKMAN_AU_DIAZO"}],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010050 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"DBIL","name":"血清直接胆红素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030500700 血清丙氨酸氨基转移酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012016, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.1-2012 表1；20～79岁；按试剂是否含磷酸吡哆醛选择分析条件', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"ALT","name":"血清丙氨酸氨基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4041_ALT_IFCC_NO_P5P_1","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":9,"referenceHigh":50,"gender":"1","instrumentCode":"IFCC_NO_P5P"},{"code":"WST4041_ALT_IFCC_NO_P5P_2","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":7,"referenceHigh":40,"gender":"2","instrumentCode":"IFCC_NO_P5P"},{"code":"WST4041_ALT_IFCC_P5P_1","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":9,"referenceHigh":60,"gender":"1","instrumentCode":"IFCC_P5P"},{"code":"WST4041_ALT_IFCC_P5P_2","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":7,"referenceHigh":45,"gender":"2","instrumentCode":"IFCC_P5P"}],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010052 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"ALT","name":"血清丙氨酸氨基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030500800 血清天门冬氨酸氨基转移酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012017, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.1-2012 表1；20～79岁；按试剂是否含磷酸吡哆醛选择分析条件', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"AST","name":"血清天门冬氨酸氨基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4041_AST_IFCC_NO_P5P_1","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":15,"referenceHigh":40,"gender":"1","instrumentCode":"IFCC_NO_P5P"},{"code":"WST4041_AST_IFCC_NO_P5P_2","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":13,"referenceHigh":35,"gender":"2","instrumentCode":"IFCC_NO_P5P"},{"code":"WST4041_AST_IFCC_P5P_1","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":15,"referenceHigh":45,"gender":"1","instrumentCode":"IFCC_P5P"},{"code":"WST4041_AST_IFCC_P5P_2","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":13,"referenceHigh":40,"gender":"2","instrumentCode":"IFCC_P5P"}],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010053 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"AST","name":"血清天门冬氨酸氨基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030500900 血清γ-谷氨酰基转移酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012018, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.1-2012 表1；20～79岁', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"GGT","name":"血清γ-谷氨酰基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4041_GGT_M","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":10,"referenceHigh":60,"gender":"1"},{"code":"WST4041_GGT_F","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":7,"referenceHigh":45,"gender":"2"}],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010054 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"GGT","name":"血清γ-谷氨酰基转移酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030501100 血清碱性磷酸酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012019, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.1-2012 表1；20～79岁；女性按50岁分段', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"ALP","name":"血清碱性磷酸酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4041_ALP_M","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":45,"referenceHigh":125,"gender":"1"},{"code":"WST4041_ALP_F20","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":18250,"referenceLow":35,"referenceHigh":100,"gender":"2"},{"code":"WST4041_ALP_F50","minimumAgeDays":18250,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":50,"referenceHigh":135,"gender":"2"}],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010055 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"ALP","name":"血清碱性磷酸酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030600100 血清肌酸激酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012020, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.7-2015 表1；20～79岁', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"CK","name":"血清肌酸激酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4047_CK_M","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":50,"referenceHigh":310,"gender":"1"},{"code":"WST4047_CK_F","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":40,"referenceHigh":200,"gender":"2"}],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010058 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"CK","name":"血清肌酸激酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030600500 乳酸脱氢酶测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012021, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.7-2015 表1；20～79岁', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"LDH","name":"乳酸脱氢酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4047_LDH","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":120,"referenceHigh":250}],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010060 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"LDH","name":"乳酸脱氢酶测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"U/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030700100 尿素测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012022, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.5-2015 表1；血清尿素；20～79岁，按60岁与性别分组', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"UREA","name":"尿素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4045_UREA_120","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":21900,"referenceLow":3.1,"referenceHigh":8,"gender":"1"},{"code":"WST4045_UREA_160","minimumAgeDays":21900,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":3.6,"referenceHigh":9.5,"gender":"1"},{"code":"WST4045_UREA_220","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":21900,"referenceLow":2.6,"referenceHigh":7.5,"gender":"2"},{"code":"WST4045_UREA_260","minimumAgeDays":21900,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":3.1,"referenceHigh":8.8,"gender":"2"}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010066 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"UREA","name":"尿素测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030700102 尿素氮测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012023, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.5-2015 表1；尿素氮以mmol/L尿素当量报告；20～79岁；非mg/dL氮质量单位', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"BUN","name":"尿素氮测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4045_BUN_EQUIV_120","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":21900,"referenceLow":3.1,"referenceHigh":8,"gender":"1"},{"code":"WST4045_BUN_EQUIV_160","minimumAgeDays":21900,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":3.6,"referenceHigh":9.5,"gender":"1"},{"code":"WST4045_BUN_EQUIV_220","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":21900,"referenceLow":2.6,"referenceHigh":7.5,"gender":"2"},{"code":"WST4045_BUN_EQUIV_260","minimumAgeDays":21900,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":3.1,"referenceHigh":8.8,"gender":"2"}],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010067 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"BUN","name":"尿素氮测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"mmol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030700200 肌酐测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012024, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  'WS/T 404.5-2015 表1；20～79岁；仅适用可溯源至ID-MS的肌酐检测结果', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"CREA","name":"肌酐测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"WST4045_CREA_120","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":21900,"referenceLow":57,"referenceHigh":97,"gender":"1","instrumentCode":"IDMS_TRACEABLE"},{"code":"WST4045_CREA_160","minimumAgeDays":21900,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":57,"referenceHigh":111,"gender":"1","instrumentCode":"IDMS_TRACEABLE"},{"code":"WST4045_CREA_220","minimumAgeDays":7300,"criticalCodes":[],"maximumAgeDays":21900,"referenceLow":41,"referenceHigh":73,"gender":"2","instrumentCode":"IDMS_TRACEABLE"},{"code":"WST4045_CREA_260","minimumAgeDays":21900,"criticalCodes":[],"maximumAgeDays":29200,"referenceLow":41,"referenceHigh":81,"gender":"2","instrumentCode":"IDMS_TRACEABLE"}],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010068 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"CREA","name":"肌酐测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);

-- 25030700500 血清尿酸测定
insert into RHN_BD_DIAG_TPL (ID_DIAG_TPL, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION, SD_SVC_TYPE, DA_VALID_FROM, DES_BASIS, ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON)
select 362387896012025, t.ID_TNT, t.ID_ORG, t.ID_CATALOG_ITEM, 2, t.SD_SVC_TYPE, t.DA_VALID_FROM,
  '北京市卫健委/北京小汤山医院2026-01-06生化报告解读：成人尿酸常用参考男208～428、女155～357 μmol/L；非WS/T404统一区间，需机构按方法确认', t.ID_USER_PUBLISH, current_timestamp, '{"indicators":[{"code":"UA","name":"血清尿酸测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[{"code":"BJ2026_UA_GUIDANCE","minimumAgeDays":6570,"criticalCodes":[]}],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
from RHN_BD_DIAG_TPL t
where t.ID_DIAG_TPL = 362387896010069 and t.SN_VERSION = 1
  and t.ID_TNT = 362387869790209 and t.ID_ORG = 362387869790211
  and t.DES_BASIS = '系统预置录入结构；检测方法、单位、参考区间及危急值须由机构确认'
  and t.CONTENT_JSON = '{"indicators":[{"code":"UA","name":"血清尿酸测定","valueType":"NUMBER","required":true,"allowedCodes":[],"rules":[],"unitCode":"umol/L"}],"phrases":[],"requiredChecks":[],"minimumImages":0}'
  and not exists (select 1 from RHN_BD_DIAG_TPL n where n.ID_TNT = t.ID_TNT and n.ID_ORG = t.ID_ORG and n.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM and n.SN_VERSION > 1);
