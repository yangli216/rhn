-- Service subtype (RHN_BD_SVC_ITEM.SD_SVC_SUBTYPE) is a code: the UI labels it (SERVICE_SUBTYPE_MAP) and rules depend on it
-- (outpatient scheduling requires OUTPATIENT_VISIT). The 1.80 primary-care catalog wrote the price list's Chinese categories
-- into it instead. Map the categories that have a code, and fill the examination type used for execution-department routing.
-- Categories without a code (e.g. 导尿, 护理费, 挂号费 and surcharges) keep their text until the vocabulary is decided.

-- Laboratory: price-list categories -> laboratory discipline codes.
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'HEMATOLOGY' where SD_SVC_TYPE = 'LABORATORY'
  and SD_SVC_SUBTYPE in ('血液一般', '凝血检查', '血型与配血', '尿液检查', '粪便检查', '体液分泌物', '寄生虫检查');
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'BIOCHEMISTRY' where SD_SVC_TYPE = 'LABORATORY'
  and SD_SVC_SUBTYPE in ('肝功能', '肾功能', '电解质', '血脂检查', '糖代谢', '心肌酶/心脏标志物', '其他血清酶', '蛋白质测定');
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'IMMUNOASSAY' where SD_SVC_TYPE = 'LABORATORY'
  and SD_SVC_SUBTYPE in ('感染免疫', '免疫功能', '自身免疫', '肿瘤标志物', '激素检查', '维生素/叶酸');
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'MICROBIOLOGY' where SD_SVC_TYPE = 'LABORATORY'
  and SD_SVC_SUBTYPE in ('微生物镜检/培养', '药敏试验');
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'MOLECULAR' where SD_SVC_TYPE = 'LABORATORY' and SD_SVC_SUBTYPE = '分子生物学';

-- Examination: modality codes, shared with the BD_EXAM_TYPE dictionary.
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'RADIOGRAPHY' where SD_SVC_TYPE = 'EXAMINATION'
  and SD_SVC_SUBTYPE in ('X线摄影', 'X线透视', 'X线造影');
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'CT' where SD_SVC_TYPE = 'EXAMINATION' and SD_SVC_SUBTYPE = 'CT扫描';
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'MRI' where SD_SVC_TYPE = 'EXAMINATION' and SD_SVC_SUBTYPE = '磁共振MRI';
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'ULTRASOUND' where SD_SVC_TYPE = 'EXAMINATION'
  and SD_SVC_SUBTYPE in ('B超检查', '彩超检查', '心脏超声', 'A超', '多普勒(TCD)');
update RHN_BD_SVC_ITEM set SD_EXAM_TYPE = SD_SVC_SUBTYPE where SD_SVC_TYPE = 'EXAMINATION' and SD_EXAM_TYPE is null
  and SD_SVC_SUBTYPE in ('RADIOGRAPHY', 'CT', 'MRI', 'ULTRASOUND');

-- Visit fees: only the base outpatient/inpatient consultation fees, never surcharges (加收) or observation fees.
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'OUTPATIENT_VISIT' where SD_SVC_TYPE = 'PROCEDURE' and SD_SVC_SUBTYPE = '诊查费'
  and ID_CATALOG_ITEM in (select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM
                          where CD_CATALOG_ITEM in ('11020000100', '11020000111', '11020000102', '11020000103'));
-- Inpatient consultation fees were generated with outpatient usage.
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'INPATIENT_VISIT', SD_USAGE_TYPE = 'INPATIENT' where SD_SVC_TYPE = 'PROCEDURE'
  and SD_SVC_SUBTYPE = '诊查费'
  and ID_CATALOG_ITEM in (select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM
                          where CD_CATALOG_ITEM in ('11020000501', '11020000502', '11020000503', '11020000504'));

-- Treatment and bed categories that already have a code.
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'INJECTION' where SD_SVC_TYPE = 'TREATMENT' and SD_SVC_SUBTYPE = '注射';
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'NEBULIZATION' where SD_SVC_TYPE = 'TREATMENT' and SD_SVC_SUBTYPE = '雾化吸入';
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'DRESSING' where SD_SVC_TYPE = 'TREATMENT'
  and SD_SVC_SUBTYPE = '换药（包括拆线、术后清创换药）';
update RHN_BD_SVC_ITEM set SD_SVC_SUBTYPE = 'BED_DAY' where SD_SVC_TYPE = 'OTHER' and SD_SVC_SUBTYPE = '床位费';
