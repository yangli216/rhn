-- Product baseline ordinary dictionaries. Flyway is the provenance for initial values.

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791100, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_PROPERTY', '机构性质', '医疗机构举办和运营性质',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793000, 362387869791100, 'PUBLIC_NON_PROFIT', '公立非营利', '机构性质', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793001, 362387869791100, 'NON_PUBLIC_NON_PROFIT', '非公立非营利', '机构性质', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793002, 362387869791100, 'FOR_PROFIT', '营利性', '机构性质', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793003, 362387869791100, 'GOVERNMENT_AGENCY', '行政机构', '机构性质', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793004, 362387869791100, 'OTHER', '其他', '机构性质', 50, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791101, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_DEPARTMENT_TYPE', '科室类型', '国家诊疗科目完整基线及医疗机构常见行政、医辅、护理和跨学科科室；允许按租户扩展',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793005, 362387869791101, '01', '预防保健科', '国家医疗机构诊疗科目基线', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793006, 362387869791101, '02', '全科医疗科', '国家医疗机构诊疗科目基线', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793007, 362387869791101, '03', '内科', '国家医疗机构诊疗科目基线', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793008, 362387869791101, '03.01', '呼吸内科专业', '国家医疗机构诊疗科目基线', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793009, 362387869791101, '03.02', '消化内科专业', '国家医疗机构诊疗科目基线', 50, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793010, 362387869791101, '03.03', '神经内科专业', '国家医疗机构诊疗科目基线', 60, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793011, 362387869791101, '03.04', '心血管内科专业', '国家医疗机构诊疗科目基线', 70, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793012, 362387869791101, '03.05', '血液内科专业', '国家医疗机构诊疗科目基线', 80, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793013, 362387869791101, '03.06', '肾病学专业', '国家医疗机构诊疗科目基线', 90, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793014, 362387869791101, '03.07', '内分泌专业', '国家医疗机构诊疗科目基线', 100, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793015, 362387869791101, '03.08', '免疫学专业', '国家医疗机构诊疗科目基线', 110, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793016, 362387869791101, '03.09', '变态反应专业', '国家医疗机构诊疗科目基线', 120, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793017, 362387869791101, '03.10', '老年病专业', '国家医疗机构诊疗科目基线', 130, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793018, 362387869791101, '03.11', '内科其他专业', '国家医疗机构诊疗科目基线', 140, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793019, 362387869791101, '04', '外科', '国家医疗机构诊疗科目基线', 150, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793020, 362387869791101, '04.01', '普通外科专业', '国家医疗机构诊疗科目基线', 160, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793021, 362387869791101, '04.02', '神经外科专业', '国家医疗机构诊疗科目基线', 170, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793022, 362387869791101, '04.03', '骨科专业', '国家医疗机构诊疗科目基线', 180, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793023, 362387869791101, '04.04', '泌尿外科专业', '国家医疗机构诊疗科目基线', 190, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793024, 362387869791101, '04.05', '胸外科专业', '国家医疗机构诊疗科目基线', 200, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793025, 362387869791101, '04.06', '心脏大血管外科专业', '国家医疗机构诊疗科目基线', 210, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793026, 362387869791101, '04.07', '烧伤科专业', '国家医疗机构诊疗科目基线', 220, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793027, 362387869791101, '04.08', '整形外科专业', '国家医疗机构诊疗科目基线', 230, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793028, 362387869791101, '04.09', '外科其他专业', '国家医疗机构诊疗科目基线', 240, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793029, 362387869791101, '05', '妇产科', '国家医疗机构诊疗科目基线', 250, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793030, 362387869791101, '05.01', '妇科专业', '国家医疗机构诊疗科目基线', 260, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793031, 362387869791101, '05.02', '产科专业', '国家医疗机构诊疗科目基线', 270, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793032, 362387869791101, '05.03', '计划生育专业', '国家医疗机构诊疗科目基线', 280, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793033, 362387869791101, '05.04', '优生学专业', '国家医疗机构诊疗科目基线', 290, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793034, 362387869791101, '05.05', '生殖健康与不孕症专业', '国家医疗机构诊疗科目基线', 300, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793035, 362387869791101, '05.06', '妇产科其他专业', '国家医疗机构诊疗科目基线', 310, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793036, 362387869791101, '06', '妇女保健科', '国家医疗机构诊疗科目基线', 320, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793037, 362387869791101, '06.01', '青春期保健专业', '国家医疗机构诊疗科目基线', 330, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793038, 362387869791101, '06.02', '围产期保健专业', '国家医疗机构诊疗科目基线', 340, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793039, 362387869791101, '06.03', '更年期保健专业', '国家医疗机构诊疗科目基线', 350, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793040, 362387869791101, '06.04', '妇女心理卫生专业', '国家医疗机构诊疗科目基线', 360, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793041, 362387869791101, '06.05', '妇女营养专业', '国家医疗机构诊疗科目基线', 370, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793042, 362387869791101, '06.06', '妇女保健其他专业', '国家医疗机构诊疗科目基线', 380, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793043, 362387869791101, '07', '儿科', '国家医疗机构诊疗科目基线', 390, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793044, 362387869791101, '07.01', '新生儿专业', '国家医疗机构诊疗科目基线', 400, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793045, 362387869791101, '07.02', '小儿传染病专业', '国家医疗机构诊疗科目基线', 410, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793046, 362387869791101, '07.03', '小儿消化专业', '国家医疗机构诊疗科目基线', 420, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793047, 362387869791101, '07.04', '小儿呼吸专业', '国家医疗机构诊疗科目基线', 430, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793048, 362387869791101, '07.05', '小儿心脏病专业', '国家医疗机构诊疗科目基线', 440, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793049, 362387869791101, '07.06', '小儿肾病专业', '国家医疗机构诊疗科目基线', 450, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793050, 362387869791101, '07.07', '小儿血液病专业', '国家医疗机构诊疗科目基线', 460, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793051, 362387869791101, '07.08', '小儿神经病学专业', '国家医疗机构诊疗科目基线', 470, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793052, 362387869791101, '07.09', '小儿内分泌专业', '国家医疗机构诊疗科目基线', 480, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793053, 362387869791101, '07.10', '小儿遗传病专业', '国家医疗机构诊疗科目基线', 490, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793054, 362387869791101, '07.11', '小儿免疫专业', '国家医疗机构诊疗科目基线', 500, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793055, 362387869791101, '07.12', '儿科其他专业', '国家医疗机构诊疗科目基线', 510, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793056, 362387869791101, '08', '小儿外科', '国家医疗机构诊疗科目基线', 520, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793057, 362387869791101, '08.01', '小儿普通外科专业', '国家医疗机构诊疗科目基线', 530, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793058, 362387869791101, '08.02', '小儿骨科专业', '国家医疗机构诊疗科目基线', 540, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793059, 362387869791101, '08.03', '小儿泌尿外科专业', '国家医疗机构诊疗科目基线', 550, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793060, 362387869791101, '08.04', '小儿胸心外科专业', '国家医疗机构诊疗科目基线', 560, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793061, 362387869791101, '08.05', '小儿神经外科专业', '国家医疗机构诊疗科目基线', 570, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793062, 362387869791101, '08.06', '小儿外科其他专业', '国家医疗机构诊疗科目基线', 580, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793063, 362387869791101, '09', '儿童保健科', '国家医疗机构诊疗科目基线', 590, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793064, 362387869791101, '09.01', '儿童生长发育专业', '国家医疗机构诊疗科目基线', 600, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793065, 362387869791101, '09.02', '儿童营养专业', '国家医疗机构诊疗科目基线', 610, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793066, 362387869791101, '09.03', '儿童心理卫生专业', '国家医疗机构诊疗科目基线', 620, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793067, 362387869791101, '09.04', '儿童五官保健专业', '国家医疗机构诊疗科目基线', 630, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793068, 362387869791101, '09.05', '儿童康复专业', '国家医疗机构诊疗科目基线', 640, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793069, 362387869791101, '09.06', '儿童保健其他专业', '国家医疗机构诊疗科目基线', 650, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793070, 362387869791101, '10', '眼科', '国家医疗机构诊疗科目基线', 660, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793071, 362387869791101, '11', '耳鼻咽喉科', '国家医疗机构诊疗科目基线', 670, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793072, 362387869791101, '11.01', '耳科专业', '国家医疗机构诊疗科目基线', 680, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793073, 362387869791101, '11.02', '鼻科专业', '国家医疗机构诊疗科目基线', 690, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793074, 362387869791101, '11.03', '咽喉科专业', '国家医疗机构诊疗科目基线', 700, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793075, 362387869791101, '11.04', '耳鼻咽喉其他专业', '国家医疗机构诊疗科目基线', 710, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793076, 362387869791101, '12', '口腔科', '国家医疗机构诊疗科目基线', 720, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793077, 362387869791101, '12.01', '牙体牙髓病专业', '国家医疗机构诊疗科目基线', 730, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793078, 362387869791101, '12.02', '牙周病专业', '国家医疗机构诊疗科目基线', 740, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793079, 362387869791101, '12.03', '口腔黏膜病专业', '国家医疗机构诊疗科目基线', 750, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793080, 362387869791101, '12.04', '儿童口腔专业', '国家医疗机构诊疗科目基线', 760, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793081, 362387869791101, '12.05', '口腔颌面外科专业', '国家医疗机构诊疗科目基线', 770, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793082, 362387869791101, '12.06', '口腔修复专业', '国家医疗机构诊疗科目基线', 780, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793083, 362387869791101, '12.07', '口腔正畸专业', '国家医疗机构诊疗科目基线', 790, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793084, 362387869791101, '12.08', '口腔种植专业', '国家医疗机构诊疗科目基线', 800, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793085, 362387869791101, '12.09', '口腔麻醉专业', '国家医疗机构诊疗科目基线', 810, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793086, 362387869791101, '12.10', '口腔颌面医学影像专业', '国家医疗机构诊疗科目基线', 820, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793087, 362387869791101, '12.11', '口腔病理专业', '国家医疗机构诊疗科目基线', 830, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793088, 362387869791101, '12.12', '预防口腔专业', '国家医疗机构诊疗科目基线', 840, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793089, 362387869791101, '12.13', '口腔其他专业', '国家医疗机构诊疗科目基线', 850, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793090, 362387869791101, '13', '皮肤科', '国家医疗机构诊疗科目基线', 860, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793091, 362387869791101, '13.01', '皮肤病专业', '国家医疗机构诊疗科目基线', 870, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793092, 362387869791101, '13.02', '性传播疾病专业', '国家医疗机构诊疗科目基线', 880, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793093, 362387869791101, '13.03', '皮肤科其他专业', '国家医疗机构诊疗科目基线', 890, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793094, 362387869791101, '14', '医疗美容科', '国家医疗机构诊疗科目基线', 900, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793095, 362387869791101, '14.01', '美容外科', '国家医疗机构诊疗科目基线', 910, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793096, 362387869791101, '14.02', '美容牙科', '国家医疗机构诊疗科目基线', 920, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793097, 362387869791101, '14.03', '美容皮肤科', '国家医疗机构诊疗科目基线', 930, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793098, 362387869791101, '14.04', '美容中医科', '国家医疗机构诊疗科目基线', 940, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793099, 362387869791101, '15', '精神科', '国家医疗机构诊疗科目基线', 950, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793100, 362387869791101, '15.01', '精神病专业', '国家医疗机构诊疗科目基线', 960, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793101, 362387869791101, '15.02', '精神卫生专业', '国家医疗机构诊疗科目基线', 970, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793102, 362387869791101, '15.03', '药物依赖专业', '国家医疗机构诊疗科目基线', 980, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793103, 362387869791101, '15.04', '精神康复专业', '国家医疗机构诊疗科目基线', 990, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793104, 362387869791101, '15.05', '社区防治专业', '国家医疗机构诊疗科目基线', 1000, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793105, 362387869791101, '15.06', '临床心理专业', '国家医疗机构诊疗科目基线', 1010, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793106, 362387869791101, '15.07', '司法精神专业', '国家医疗机构诊疗科目基线', 1020, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793107, 362387869791101, '15.08', '精神科其他专业', '国家医疗机构诊疗科目基线', 1030, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793108, 362387869791101, '16', '传染科', '国家医疗机构诊疗科目基线', 1040, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793109, 362387869791101, '16.01', '肠道传染病专业', '国家医疗机构诊疗科目基线', 1050, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793110, 362387869791101, '16.02', '呼吸道传染病专业', '国家医疗机构诊疗科目基线', 1060, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793111, 362387869791101, '16.03', '肝炎专业', '国家医疗机构诊疗科目基线', 1070, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793112, 362387869791101, '16.04', '虫媒传染病专业', '国家医疗机构诊疗科目基线', 1080, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793113, 362387869791101, '16.05', '动物源性传染病专业', '国家医疗机构诊疗科目基线', 1090, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793114, 362387869791101, '16.06', '蠕虫病专业', '国家医疗机构诊疗科目基线', 1100, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793115, 362387869791101, '16.07', '传染科其他专业', '国家医疗机构诊疗科目基线', 1110, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793116, 362387869791101, '17', '结核病科', '国家医疗机构诊疗科目基线', 1120, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793117, 362387869791101, '18', '地方病科', '国家医疗机构诊疗科目基线', 1130, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793118, 362387869791101, '19', '肿瘤科', '国家医疗机构诊疗科目基线', 1140, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793119, 362387869791101, '20', '急诊医学科', '国家医疗机构诊疗科目基线', 1150, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793120, 362387869791101, '21', '康复医学科', '国家医疗机构诊疗科目基线', 1160, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793121, 362387869791101, '22', '运动医学科', '国家医疗机构诊疗科目基线', 1170, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793122, 362387869791101, '23', '职业病科', '国家医疗机构诊疗科目基线', 1180, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793123, 362387869791101, '23.01', '职业中毒专业', '国家医疗机构诊疗科目基线', 1190, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793124, 362387869791101, '23.02', '尘肺专业', '国家医疗机构诊疗科目基线', 1200, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793125, 362387869791101, '23.03', '放射病专业', '国家医疗机构诊疗科目基线', 1210, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793126, 362387869791101, '23.04', '物理因素损伤专业', '国家医疗机构诊疗科目基线', 1220, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793127, 362387869791101, '23.05', '职业健康监护专业', '国家医疗机构诊疗科目基线', 1230, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793128, 362387869791101, '23.06', '职业病其他专业', '国家医疗机构诊疗科目基线', 1240, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793129, 362387869791101, '24', '临终关怀科', '国家医疗机构诊疗科目基线', 1250, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793130, 362387869791101, '25', '特种医学与军事医学科', '国家医疗机构诊疗科目基线', 1260, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793131, 362387869791101, '26', '麻醉科', '国家医疗机构诊疗科目基线', 1270, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793132, 362387869791101, '27', '疼痛科', '国家医疗机构诊疗科目基线', 1280, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793133, 362387869791101, '28', '重症医学科', '国家医疗机构诊疗科目基线', 1290, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793134, 362387869791101, '30', '医学检验科', '国家医疗机构诊疗科目基线', 1300, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793135, 362387869791101, '30.01', '临床体液、血液专业', '国家医疗机构诊疗科目基线', 1310, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793136, 362387869791101, '30.02', '临床微生物学专业', '国家医疗机构诊疗科目基线', 1320, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793137, 362387869791101, '30.03', '临床化学检验专业', '国家医疗机构诊疗科目基线', 1330, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793138, 362387869791101, '30.04', '临床免疫、血清学专业', '国家医疗机构诊疗科目基线', 1340, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793139, 362387869791101, '30.05', '临床细胞分子遗传学专业', '国家医疗机构诊疗科目基线', 1350, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793140, 362387869791101, '30.06', '医学检验其他专业', '国家医疗机构诊疗科目基线', 1360, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793141, 362387869791101, '31', '病理科', '国家医疗机构诊疗科目基线', 1370, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793142, 362387869791101, '32', '医学影像科', '国家医疗机构诊疗科目基线', 1380, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793143, 362387869791101, '32.01', 'X线诊断专业', '国家医疗机构诊疗科目基线', 1390, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793144, 362387869791101, '32.02', 'CT诊断专业', '国家医疗机构诊疗科目基线', 1400, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793145, 362387869791101, '32.03', '磁共振成像诊断专业', '国家医疗机构诊疗科目基线', 1410, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793146, 362387869791101, '32.04', '核医学专业', '国家医疗机构诊疗科目基线', 1420, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793147, 362387869791101, '32.05', '超声诊断专业', '国家医疗机构诊疗科目基线', 1430, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793148, 362387869791101, '32.06', '心电诊断专业', '国家医疗机构诊疗科目基线', 1440, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793149, 362387869791101, '32.07', '脑电及脑血流图诊断专业', '国家医疗机构诊疗科目基线', 1450, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793150, 362387869791101, '32.08', '神经肌肉电图专业', '国家医疗机构诊疗科目基线', 1460, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793151, 362387869791101, '32.09', '介入放射学专业', '国家医疗机构诊疗科目基线', 1470, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793152, 362387869791101, '32.10', '放射治疗专业', '国家医疗机构诊疗科目基线', 1480, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793153, 362387869791101, '32.11', '医学影像其他专业', '国家医疗机构诊疗科目基线', 1490, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793154, 362387869791101, '50', '中医科', '国家医疗机构诊疗科目基线', 1500, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793155, 362387869791101, '50.01', '中医内科专业', '国家医疗机构诊疗科目基线', 1510, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793156, 362387869791101, '50.02', '中医外科专业', '国家医疗机构诊疗科目基线', 1520, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793157, 362387869791101, '50.03', '中医妇产科专业', '国家医疗机构诊疗科目基线', 1530, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793158, 362387869791101, '50.04', '中医儿科专业', '国家医疗机构诊疗科目基线', 1540, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793159, 362387869791101, '50.05', '中医皮肤科专业', '国家医疗机构诊疗科目基线', 1550, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793160, 362387869791101, '50.06', '中医眼科专业', '国家医疗机构诊疗科目基线', 1560, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793161, 362387869791101, '50.07', '中医耳鼻咽喉科专业', '国家医疗机构诊疗科目基线', 1570, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793162, 362387869791101, '50.08', '中医口腔科专业', '国家医疗机构诊疗科目基线', 1580, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793163, 362387869791101, '50.09', '中医肿瘤科专业', '国家医疗机构诊疗科目基线', 1590, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793164, 362387869791101, '50.10', '骨伤科专业', '国家医疗机构诊疗科目基线', 1600, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793165, 362387869791101, '50.11', '肛肠科专业', '国家医疗机构诊疗科目基线', 1610, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793166, 362387869791101, '50.12', '中医老年病科专业', '国家医疗机构诊疗科目基线', 1620, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793167, 362387869791101, '50.13', '针灸科专业', '国家医疗机构诊疗科目基线', 1630, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793168, 362387869791101, '50.14', '推拿科专业', '国家医疗机构诊疗科目基线', 1640, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793169, 362387869791101, '50.15', '中医康复医学专业', '国家医疗机构诊疗科目基线', 1650, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793170, 362387869791101, '50.16', '中医急诊科专业', '国家医疗机构诊疗科目基线', 1660, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793171, 362387869791101, '50.17', '中医预防保健科专业', '国家医疗机构诊疗科目基线', 1670, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793172, 362387869791101, '50.18', '中医其他专业', '国家医疗机构诊疗科目基线', 1680, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793173, 362387869791101, '51', '民族医学科', '国家医疗机构诊疗科目基线', 1690, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793174, 362387869791101, '51.01', '维吾尔医学', '国家医疗机构诊疗科目基线', 1700, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793175, 362387869791101, '51.02', '藏医学', '国家医疗机构诊疗科目基线', 1710, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793176, 362387869791101, '51.03', '蒙医学', '国家医疗机构诊疗科目基线', 1720, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793177, 362387869791101, '51.04', '彝医学', '国家医疗机构诊疗科目基线', 1730, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793178, 362387869791101, '51.05', '傣医学', '国家医疗机构诊疗科目基线', 1740, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793179, 362387869791101, '51.06', '民族医学其他专业', '国家医疗机构诊疗科目基线', 1750, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793180, 362387869791101, '52', '中西医结合科', '国家医疗机构诊疗科目基线', 1760, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793181, 362387869791101, 'ADM_PRESIDENT_OFFICE', '院长办公室', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3000, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793182, 362387869791101, 'ADM_PARTY_OFFICE', '党委办公室', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3010, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793183, 362387869791101, 'ADM_MEDICAL_AFFAIRS', '医务部（医务科）', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3020, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793184, 362387869791101, 'ADM_NURSING', '护理部', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3030, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793185, 362387869791101, 'ADM_HUMAN_RESOURCES', '人力资源部（人事科）', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3040, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793186, 362387869791101, 'ADM_FINANCE', '财务部（财务科）', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3050, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793187, 362387869791101, 'ADM_OPERATIONS', '运营管理部', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3060, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793188, 362387869791101, 'ADM_QUALITY_CONTROL', '质量管理部', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3070, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793189, 362387869791101, 'ADM_INFECTION_CONTROL', '医院感染管理科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3080, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793190, 362387869791101, 'ADM_PUBLIC_HEALTH', '公共卫生管理科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3090, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793191, 362387869791101, 'ADM_INFORMATION', '信息中心（信息科）', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3100, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793192, 362387869791101, 'ADM_MEDICAL_INSURANCE', '医疗保险管理科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3110, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793193, 362387869791101, 'ADM_PROCUREMENT', '采购管理部', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3120, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793194, 362387869791101, 'ADM_LOGISTICS', '后勤保障部', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3130, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793195, 362387869791101, 'ADM_SECURITY', '保卫科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3140, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793196, 362387869791101, 'ADM_AUDIT', '审计科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3150, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793197, 362387869791101, 'ADM_DISCIPLINE', '纪检监察部门', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3160, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793198, 362387869791101, 'ADM_RESEARCH', '科研管理部门', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3170, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793199, 362387869791101, 'ADM_EDUCATION', '教学管理部门', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3180, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793200, 362387869791101, 'ADM_MEDICAL_RECORDS', '病案管理科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3190, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793201, 362387869791101, 'ADM_CUSTOMER_SERVICE', '患者服务中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3200, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793202, 362387869791101, 'ADM_DEVELOPMENT', '学科建设与发展部门', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3210, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793203, 362387869791101, 'MED_PHARMACY', '药学部（药剂科）', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3220, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793204, 362387869791101, 'MED_TRANSFUSION', '输血科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3230, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793205, 362387869791101, 'MED_CLINICAL_NUTRITION', '临床营养科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3240, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793206, 362387869791101, 'MED_CSSD', '消毒供应中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3250, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793207, 362387869791101, 'MED_HEALTH_INFORMATION', '健康信息管理部门', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3260, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793208, 362387869791101, 'MED_ENDOSCOPY', '内镜中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3270, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793209, 362387869791101, 'MED_HEMODIALYSIS', '血液透析中心（室）', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3280, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793210, 362387869791101, 'MED_HYPERBARIC_OXYGEN', '高压氧科', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3290, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793211, 362387869791101, 'MED_HEALTH_EXAMINATION', '健康体检中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3300, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793212, 362387869791101, 'MED_CLINICAL_TRIAL', '临床试验机构办公室', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3310, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793213, 362387869791101, 'MED_SOCIAL_WORK', '医务社会工作部', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3320, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793214, 362387869791101, 'MED_INTERNET_HOSPITAL', '互联网医院办公室', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3330, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793215, 362387869791101, 'MED_DAY_SURGERY', '日间手术中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3340, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793216, 362387869791101, 'MED_INTERVENTION_CENTER', '介入诊疗中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3350, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793217, 362387869791101, 'MED_REPRODUCTIVE_CENTER', '生殖医学中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3360, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793218, 362387869791101, 'NUR_OUTPATIENT', '门诊护理单元', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3370, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793219, 362387869791101, 'NUR_EMERGENCY', '急诊护理单元', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3380, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793220, 362387869791101, 'NUR_INPATIENT_WARD', '住院护理单元（病区）', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3390, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793221, 362387869791101, 'NUR_OPERATING_ROOM', '手术室护理单元', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3400, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793222, 362387869791101, 'NUR_ICU', '重症监护护理单元', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3410, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793223, 362387869791101, 'NUR_DELIVERY_ROOM', '产房护理单元', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3420, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793224, 362387869791101, 'NUR_NEONATAL', '新生儿护理单元', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3430, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793225, 362387869791101, 'NUR_CSSD', '消毒供应护理单元', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3440, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793226, 362387869791101, 'CROSS_MDT', '多学科诊疗中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3450, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793227, 362387869791101, 'CROSS_DISEASE_CENTER', '疾病诊疗中心', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3460, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793228, 362387869791101, 'CROSS_SPECIALTY_CLINIC', '专病（专科）门诊', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3470, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793229, 362387869791101, 'CUSTOM_OTHER', '其他自定义科室', '医疗机构常见行政、医辅、护理或跨学科组织单元', 3480, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791102, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_IDENTIFIER_TYPE', '机构标识类型', '机构代码、许可证和外围系统标识的类型',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793230, 362387869791102, 'NATIONAL_HEALTH_ORG_CODE', '国家卫生机构代码', '机构标识类型', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793231, 362387869791102, 'UNIFIED_SOCIAL_CREDIT_CODE', '统一社会信用代码', '机构标识类型', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793232, 362387869791102, 'MEDICAL_INSTITUTION_LICENSE', '医疗机构执业许可证号', '机构标识类型', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793233, 362387869791102, 'ORGANIZATION_INTERNAL_CODE', '机构内部代码', '机构标识类型', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793234, 362387869791102, 'EXTERNAL_SYSTEM_CODE', '外围系统代码', '机构标识类型', 50, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791103, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_CONTACT_TYPE', '机构联系方式类型', '机构联系方式的媒介类型',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793235, 362387869791103, 'PHONE', '固定电话', '机构联系方式类型', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793236, 362387869791103, 'MOBILE', '移动电话', '机构联系方式类型', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793237, 362387869791103, 'FAX', '传真', '机构联系方式类型', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793238, 362387869791103, 'EMAIL', '电子邮箱', '机构联系方式类型', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793239, 362387869791103, 'WEBSITE', '网站', '机构联系方式类型', 50, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793240, 362387869791103, 'HOTLINE', '服务热线', '机构联系方式类型', 60, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791104, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_CONTACT_USE', '机构联系方式用途', '机构联系方式的使用场景',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793241, 362387869791104, 'OFFICE', '办公', '机构联系方式用途', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793242, 362387869791104, 'BUSINESS', '业务', '机构联系方式用途', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793243, 362387869791104, 'EMERGENCY', '应急', '机构联系方式用途', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793244, 362387869791104, 'PUBLIC', '公众服务', '机构联系方式用途', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793245, 362387869791104, 'OTHER', '其他', '机构联系方式用途', 50, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791105, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_ADDRESS_TYPE', '机构地址类型', '机构地址的业务用途',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793246, 362387869791105, 'REGISTERED', '注册地址', '机构地址类型', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793247, 362387869791105, 'PRACTICE', '执业地址', '机构地址类型', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793248, 362387869791105, 'SERVICE', '服务地址', '机构地址类型', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793249, 362387869791105, 'MAILING', '通信地址', '机构地址类型', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793250, 362387869791105, 'OTHER', '其他', '机构地址类型', 50, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791106, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_RELATION_TYPE', '组织关系类型', '不改变权威父树的组织协作关系',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793251, 362387869791106, 'ADMINISTRATIVE', '行政隶属', '组织关系类型', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793252, 362387869791106, 'BUSINESS_MANAGEMENT', '业务管理', '组织关系类型', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793253, 362387869791106, 'MEDICAL_ALLIANCE', '医联体', '组织关系类型', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793254, 362387869791106, 'COLLABORATION', '协作', '组织关系类型', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793255, 362387869791106, 'REFERRAL', '转诊', '组织关系类型', 50, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791107, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_CAPABILITY_TYPE', '组织服务能力类型', '组织可对外或对内提供的主要服务能力',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793256, 362387869791107, 'OUTPATIENT', '门诊', '组织服务能力', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793257, 362387869791107, 'EMERGENCY', '急诊', '组织服务能力', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793258, 362387869791107, 'INPATIENT', '住院', '组织服务能力', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793259, 362387869791107, 'SURGERY', '手术', '组织服务能力', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793260, 362387869791107, 'CRITICAL_CARE', '重症监护', '组织服务能力', 50, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793261, 362387869791107, 'NURSING', '护理', '组织服务能力', 60, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793262, 362387869791107, 'PHARMACY', '药学', '组织服务能力', 70, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793263, 362387869791107, 'LABORATORY', '检验', '组织服务能力', 80, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793264, 362387869791107, 'IMAGING', '影像', '组织服务能力', 90, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793265, 362387869791107, 'PATHOLOGY', '病理', '组织服务能力', 100, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793266, 362387869791107, 'REHABILITATION', '康复', '组织服务能力', 110, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793267, 362387869791107, 'PUBLIC_HEALTH', '公共卫生', '组织服务能力', 120, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793268, 362387869791107, 'MATERNAL_CHILD', '妇幼保健', '组织服务能力', 130, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793269, 362387869791107, 'HEALTH_EXAMINATION', '健康体检', '组织服务能力', 140, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793270, 362387869791107, 'INTERNET_DIAGNOSIS', '互联网诊疗', '组织服务能力', 150, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793271, 362387869791107, 'HEMODIALYSIS', '血液透析', '组织服务能力', 160, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793272, 362387869791107, 'TEACHING', '教学', '组织服务能力', 170, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793273, 362387869791107, 'RESEARCH', '科研', '组织服务能力', 180, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793274, 362387869791107, 'OTHER', '其他', '组织服务能力', 190, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791108, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_RESPONSIBILITY_TYPE', '组织负责人类型', '机构和科室负责人职责类型',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793275, 362387869791108, 'LEGAL_REPRESENTATIVE', '法定代表人', '组织负责人类型', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793276, 362387869791108, 'DIRECTOR', '主任（负责人）', '组织负责人类型', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793277, 362387869791108, 'NURSE_MANAGER', '护士长', '组织负责人类型', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793278, 362387869791108, 'BUSINESS_OWNER', '业务负责人', '组织负责人类型', 40, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793279, 362387869791108, 'SAFETY_OWNER', '安全责任人', '组织负责人类型', 50, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791109, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_VERIFY_STATUS', '组织资料核验状态', '机构标识和服务能力的核验状态',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793280, 362387869791109, 'UNVERIFIED', '未核验', '组织资料核验状态', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793281, 362387869791109, 'PENDING', '待核验', '组织资料核验状态', 20, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793282, 362387869791109, 'VERIFIED', '已核验', '组织资料核验状态', 30, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793283, 362387869791109, 'REJECTED', '未通过', '组织资料核验状态', 40, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791110, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_DETAIL_STATUS', '组织组成信息状态', '机构组成信息的当前状态',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793284, 362387869791110, 'ACTIVE', '已启用', '组织组成信息状态', 10, 'ACTIVE');

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
values (362387869793285, 362387869791110, 'INACTIVE', '已停用', '组织组成信息状态', 20, 'ACTIVE');

