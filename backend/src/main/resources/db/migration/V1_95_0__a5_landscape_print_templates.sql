-- Upgrade outpatient note and prescription print templates to A5 Landscape standard profiles.

-- 1. Register A5 Landscape media profile if not present
insert into RHN_META_PRINT_MEDIA (
    ID_PRINT_MEDIA, ID_TNT, CD_MEDIA, NA_MEDIA, SD_MEDIA_KIND,
    WIDTH_MM, HEIGHT_MM, SD_ORIENT, MARGIN_TOP_MM, MARGIN_RIGHT_MM,
    MARGIN_BOTTOM_MM, MARGIN_LEFT_MM, GAP_HORIZ_MM, GAP_VERT_MM,
    QTY_COLUMNS, QTY_ROWS, QTY_DPI, SD_SENSOR_MODE, SD_STATUS,
    REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED
)
select
    270000000000208, null, 'A5_LANDSCAPE', 'A5 横向', 'SHEET',
    210.00, 148.00, 'LANDSCAPE', 10.00, 10.00,
    10.00, 10.00, 0.00, 0.00,
    1, 1, 300, 'NONE', 'ACTIVE',
    0, current_timestamp, null, current_timestamp, null
where not exists (select 1 from RHN_META_PRINT_MEDIA where ID_PRINT_MEDIA = 270000000000208 or CD_MEDIA = 'A5_LANDSCAPE');

-- 2. Upgrade platform templates to A5 Landscape standard templates
update RHN_META_PRINT_TMPL
set CD_TMPL = 'OUTPATIENT_NOTE_A5',
    NA_TMPL = '门诊病历 A5 标准模板'
where ID_PRINT_TMPL = 270000000000001;

update RHN_META_PRINT_TMPL
set CD_TMPL = 'OUTPATIENT_PRESCRIPTION_A5',
    NA_TMPL = '门诊处方 A5 标准模板'
where ID_PRINT_TMPL = 270000000000002;

-- 3. Upgrade published template versions to bind A5 Landscape media and updated layout config
update RHN_META_PRINT_TMPL_VER
set ID_PRINT_MEDIA = 270000000000208,
    JSON_CONFIG = '{"renderer":"OUTPATIENT_NOTE","paper":"A5","orientation":"LANDSCAPE","marginMm":10}',
    HASH_CONTENT = '304A0418437D622F0F80FAACE92C91D22BFFC109E40EEF6A1B94E91A40DBD722'
where ID_PRINT_TMPL_VER = 270000000000011;

update RHN_META_PRINT_TMPL_VER
set ID_PRINT_MEDIA = 270000000000208,
    JSON_CONFIG = '{"renderer":"OUTPATIENT_PRESCRIPTION","paper":"A5","orientation":"LANDSCAPE","marginMm":10}',
    HASH_CONTENT = 'D54A9E4C5B5A741719E01B0B011D799B1A2BD6542F96CB45258782B47A0D4C22'
where ID_PRINT_TMPL_VER = 270000000000012;

-- 4. Re-route device bindings for outpatient note and prescription to A5 Landscape
update RHN_META_PRINT_DEV_BIND
set ID_PRINT_MEDIA = 270000000000208
where ID_PRINT_MEDIA = 270000000000201
  and CD_DOC_TYPE in ('OUTPATIENT_NOTE', 'OUTPATIENT_PRESCRIPTION');
