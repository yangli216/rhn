insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status) values
(362387869799001, 362387869791111, 'MED_PHARMACY_WAREHOUSE', '药库', '承担药品验收、储存、养护和向药房配送等库存管理职责', 3221, 'ACTIVE'),
(362387869799002, 362387869791111, 'MED_PHARMACY_OUTPATIENT', '门诊药房', '承担门诊处方调剂、审核和发药职责', 3222, 'ACTIVE'),
(362387869799003, 362387869791111, 'MED_PHARMACY_INPATIENT', '住院药房', '承担住院医嘱调剂、摆药和发药职责', 3223, 'ACTIVE'),
(362387869799004, 362387869791111, 'MED_PHARMACY_EMERGENCY', '急诊药房', '承担急诊处方调剂和应急药品保障职责', 3224, 'ACTIVE'),
(362387869799005, 362387869791111, 'MED_PHARMACY_TCM', '中药房', '承担中药饮片审方、调剂和发药职责', 3225, 'ACTIVE'),
(362387869799006, 362387869791111, 'MED_PHARMACY_PREPARATION', '制剂室', '承担医疗机构制剂配制、检验和质量管理职责', 3226, 'ACTIVE');

alter table stock_sites add constraint ck_stock_site_department_required
    check (site_type = 'VIRTUAL' or department_id is not null);
