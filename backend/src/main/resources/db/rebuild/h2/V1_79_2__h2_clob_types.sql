-- RHN H2 rebuild compatibility types
-- GENERATED FILE. H2-only CLOB conversions for the 1.78 fresh-schema package.
-- The physical column rename is already part of B1_79_0, so source identifiers are rewritten by table.

-- SOURCE backend/src/main/resources/db/h2/V1_42_2__h2_clob_types.sql sha256=3a6df5c63c999d24e98325f5f2220de1dede4179871eb96df4d745ba65a26762
-- =============================================================================
-- RHN H2 Compatibility Migration
-- Converts text columns to CLOB for Hibernate schema validation compatibility
-- Preserves column comments for RhnPhysicalSchemaGovernanceTest
-- =============================================================================

alter table RHN_AI_SUGGEST alter column JSON_CONTENT clob;
comment on column RHN_AI_SUGGEST.JSON_CONTENT is '内容JSON';
alter table RHN_AI_SUGGEST alter column JSON_EVID clob;
comment on column RHN_AI_SUGGEST.JSON_EVID is '证据JSON';
alter table RHN_AI_SUGGEST_EVT alter column JSON_ACTION clob;
comment on column RHN_AI_SUGGEST_EVT.JSON_ACTION is '操作JSON';
alter table RHN_AUD_CRYPTO_EVID alter column DES_VRFCTN_MATL clob;
comment on column RHN_AUD_CRYPTO_EVID.DES_VRFCTN_MATL is '验证material';
alter table RHN_AUD_CRYPTO_EVID alter column JSON_STMT clob;
comment on column RHN_AUD_CRYPTO_EVID.JSON_STMT is '声明JSON';
alter table RHN_AUD_CRYPTO_EVID alter column SIGNTR_VALUE clob;
comment on column RHN_AUD_CRYPTO_EVID.SIGNTR_VALUE is '签名值';
alter table RHN_AUD_CRYPTO_EVID alter column TS_TOKEN clob;
comment on column RHN_AUD_CRYPTO_EVID.TS_TOKEN is '时间戳令牌';
alter table RHN_BD_CATALOG_CHG_ROW alter column JSON_SRC clob;
comment on column RHN_BD_CATALOG_CHG_ROW.JSON_SRC is '来源JSON';
alter table RHN_BD_DICT_ATTR_DEF alter column JSON_SCHEMA clob;
comment on column RHN_BD_DICT_ATTR_DEF.JSON_SCHEMA is '模式定义JSON';
alter table RHN_BD_DICT_CHG alter column JSON_AFTER clob;
comment on column RHN_BD_DICT_CHG.JSON_AFTER is '后JSON';
alter table RHN_BD_DICT_CHG alter column JSON_BEFORE clob;
comment on column RHN_BD_DICT_CHG.JSON_BEFORE is '前JSON';
alter table RHN_BD_IMPORT_ROW alter column JSON_ERRORS clob;
comment on column RHN_BD_IMPORT_ROW.JSON_ERRORS is '错误JSON';
alter table RHN_BD_IMPORT_ROW alter column JSON_NORM clob;
comment on column RHN_BD_IMPORT_ROW.JSON_NORM is '标准化JSON';
alter table RHN_BD_IMPORT_ROW alter column JSON_SRC clob;
comment on column RHN_BD_IMPORT_ROW.JSON_SRC is '来源JSON';
alter table RHN_BD_ITEM_ATTR_CHG alter column JSON_AFTER clob;
comment on column RHN_BD_ITEM_ATTR_CHG.JSON_AFTER is '后JSON';
alter table RHN_BD_ITEM_ATTR_CHG alter column JSON_BEFORE clob;
comment on column RHN_BD_ITEM_ATTR_CHG.JSON_BEFORE is '前JSON';
alter table RHN_BD_ITEM_ATTR_DEF alter column JSON_ALLOWED_SCOPE clob;
comment on column RHN_BD_ITEM_ATTR_DEF.JSON_ALLOWED_SCOPE is '允许范围JSON';
alter table RHN_BD_ITEM_ATTR_DEF alter column JSON_DEFAULT clob;
comment on column RHN_BD_ITEM_ATTR_DEF.JSON_DEFAULT is '默认JSON';
alter table RHN_BD_ITEM_ATTR_DEF alter column JSON_SCHEMA clob;
comment on column RHN_BD_ITEM_ATTR_DEF.JSON_SCHEMA is '模式定义JSON';
alter table RHN_BD_ITEM_ATTR_OVRD alter column JSON_VAL clob;
comment on column RHN_BD_ITEM_ATTR_OVRD.JSON_VAL is '值JSON';
alter table RHN_BD_ITEM_ATTR_VAL alter column JSON_VAL clob;
comment on column RHN_BD_ITEM_ATTR_VAL.JSON_VAL is '值JSON';
alter table RHN_BD_ITEM_TYPE_ATTR alter column JSON_DEFAULT clob;
comment on column RHN_BD_ITEM_TYPE_ATTR.JSON_DEFAULT is '默认JSON';
alter table RHN_BD_ITEM_TYPE_ATTR alter column JSON_RQD_COND clob;
comment on column RHN_BD_ITEM_TYPE_ATTR.JSON_RQD_COND is '应需健康问题JSON';
alter table RHN_BD_ITEM_TYPE_ATTR alter column JSON_VISIBLE_COND clob;
comment on column RHN_BD_ITEM_TYPE_ATTR.JSON_VISIBLE_COND is 'visible健康问题JSON';
alter table RHN_EX_CARE_REQ alter column JSON_ITEM_ATTR_SNAP clob;
comment on column RHN_EX_CARE_REQ.JSON_ITEM_ATTR_SNAP is '项目属性快照';
alter table RHN_EX_CARE_REQ alter column JSON_STD_MAP_SNAP clob;
comment on column RHN_EX_CARE_REQ.JSON_STD_MAP_SNAP is 'standard映射快照';
alter table RHN_EX_DIAG_REPORT alter column DES_CONCL clob;
comment on column RHN_EX_DIAG_REPORT.DES_CONCL is '结论';
alter table RHN_EX_MED_REQ alter column FREQ_RULE_SNAP clob;
comment on column RHN_EX_MED_REQ.FREQ_RULE_SNAP is '频次规则快照';
alter table RHN_EX_MED_REQ alter column MED_SNAP clob;
comment on column RHN_EX_MED_REQ.MED_SNAP is '药品快照';
alter table RHN_EX_TREAT_EXEC_ITEM alter column FREQ_RULE_SNAP clob;
comment on column RHN_EX_TREAT_EXEC_ITEM.FREQ_RULE_SNAP is '频次规则快照';
alter table RHN_HPL_CARE_TASK_EVT alter column JSON_EVID clob;
comment on column RHN_HPL_CARE_TASK_EVT.JSON_EVID is '证据JSON';
alter table RHN_INT_EXT_MSG alter column JSON_PAYLOAD clob;
comment on column RHN_INT_EXT_MSG.JSON_PAYLOAD is '载荷JSON';
alter table RHN_INT_IDEMP_RECORD alter column JSON_RESP clob;
comment on column RHN_INT_IDEMP_RECORD.JSON_RESP is '响应JSON';
alter table RHN_INT_OUTBOX_EVT alter column JSON_PAYLOAD clob;
comment on column RHN_INT_OUTBOX_EVT.JSON_PAYLOAD is '载荷JSON';
alter table RHN_META_OP_NOTE_FORM_VER alter column JSON_DEF clob;
comment on column RHN_META_OP_NOTE_FORM_VER.JSON_DEF is '定义JSON';
alter table RHN_META_OP_NOTE_TMPL alter column JSON_CONTENT clob;
comment on column RHN_META_OP_NOTE_TMPL.JSON_CONTENT is '内容JSON';
alter table RHN_META_PRINT_TMPL_VER alter column JSON_CONFIG clob;
comment on column RHN_META_PRINT_TMPL_VER.JSON_CONFIG is '配置JSON';
alter table RHN_PI_PAT_MATCH_CAND alter column JSON_REASONS clob;
comment on column RHN_PI_PAT_MATCH_CAND.JSON_REASONS is '原因JSON';
alter table RHN_PI_PAT_MERGE_HIST alter column MOVED_IDENT_IDS clob;
comment on column RHN_PI_PAT_MERGE_HIST.MOVED_IDENT_IDS is 'moved标识ids';
alter table RHN_PI_PAT_MERGE_HIST alter column MOVED_SOURCE_RECORD_IDS clob;
comment on column RHN_PI_PAT_MERGE_HIST.MOVED_SOURCE_RECORD_IDS is 'moved来源记录ids';
alter table RHN_PI_PAT_SPLIT_HIST alter column RSTRD_IDENT_IDS clob;
comment on column RHN_PI_PAT_SPLIT_HIST.RSTRD_IDENT_IDS is 'restored标识ids';
alter table RHN_PI_PAT_SRC_RECORD alter column JSON_RAW_PAYLOAD clob;
comment on column RHN_PI_PAT_SRC_RECORD.JSON_RAW_PAYLOAD is 'raw载荷JSON';
alter table RHN_SC_SCHED_GEN_RUN alter column JSON_REQ clob;
comment on column RHN_SC_SCHED_GEN_RUN.JSON_REQ is '请求JSON';
alter table RHN_SUP_DISP_TASK_LINE alter column JSON_ITEM_ATTR_SNAP clob;
comment on column RHN_SUP_DISP_TASK_LINE.JSON_ITEM_ATTR_SNAP is '项目属性快照';
alter table RHN_SYS_ANN alter column DES_CONTENT clob;
comment on column RHN_SYS_ANN.DES_CONTENT is '内容文本';
alter table RHN_SYS_PARAM_CHG alter column JSON_AFTER clob;
comment on column RHN_SYS_PARAM_CHG.JSON_AFTER is '后JSON';
alter table RHN_SYS_PARAM_CHG alter column JSON_BEFORE clob;
comment on column RHN_SYS_PARAM_CHG.JSON_BEFORE is '前JSON';
alter table RHN_SYS_PARAM_DEF alter column JSON_DEFAULT_VAL clob;
comment on column RHN_SYS_PARAM_DEF.JSON_DEFAULT_VAL is '默认值JSON';
alter table RHN_SYS_PARAM_DEF alter column JSON_EXAMPLE_VAL clob;
comment on column RHN_SYS_PARAM_DEF.JSON_EXAMPLE_VAL is 'example值JSON';
alter table RHN_SYS_PARAM_DEF alter column JSON_SCHEMA clob;
comment on column RHN_SYS_PARAM_DEF.JSON_SCHEMA is 'JSON模式定义';
alter table RHN_SYS_PARAM_DEF alter column JSON_SCOPE clob;
comment on column RHN_SYS_PARAM_DEF.JSON_SCOPE is '范围JSON';
alter table RHN_SYS_PARAM_VAL alter column JSON_VAL clob;
comment on column RHN_SYS_PARAM_VAL.JSON_VAL is '值JSON';
alter table RHN_SYS_PORTAL_USER_WKSPACE alter column JSON_FAVS clob;
comment on column RHN_SYS_PORTAL_USER_WKSPACE.JSON_FAVS is '收藏JSON';
alter table RHN_SYS_PORTAL_USER_WKSPACE alter column JSON_LAYOUT clob;
comment on column RHN_SYS_PORTAL_USER_WKSPACE.JSON_LAYOUT is '布局JSON';
alter table RHN_SYS_PORTAL_USER_WKSPACE alter column JSON_TABS clob;
comment on column RHN_SYS_PORTAL_USER_WKSPACE.JSON_TABS is '标签页JSON';
alter table RHN_SYS_PRINT_OUTPUT alter column CONTENT_BASE64 clob;
comment on column RHN_SYS_PRINT_OUTPUT.CONTENT_BASE64 is '内容base64';
alter table RHN_SYS_PRINT_OUTPUT alter column JSON_SNAP clob;
comment on column RHN_SYS_PRINT_OUTPUT.JSON_SNAP is '快照JSON';
alter table RHN_VIS_CLIN_DOC_VER alter column JSON_CONTENT clob;
comment on column RHN_VIS_CLIN_DOC_VER.JSON_CONTENT is '内容JSON';
alter table RHN_VIS_ENC_IDENT_CHECK alter column JSON_FACTOR_RESULT clob;
comment on column RHN_VIS_ENC_IDENT_CHECK.JSON_FACTOR_RESULT is '换算系数resultsJSON';
alter table RHN_VIS_HEALTH_EVT alter column JSON_PAYLOAD clob;
comment on column RHN_VIS_HEALTH_EVT.JSON_PAYLOAD is '载荷JSON';
alter table RHN_VIS_INP_NURS_RECORD alter column JSON_ASSMT clob;
comment on column RHN_VIS_INP_NURS_RECORD.JSON_ASSMT is '评估JSON';
alter table RHN_VIS_INP_NURS_RECORD alter column JSON_CONTENT clob;
comment on column RHN_VIS_INP_NURS_RECORD.JSON_CONTENT is '内容JSON';
alter table RHN_VIS_INP_NURS_RECORD alter column JSON_OBS_SUM clob;
comment on column RHN_VIS_INP_NURS_RECORD.JSON_OBS_SUM is '观察汇总JSON';
alter table RHN_VIS_INP_SHIFT_HANDOFF alter column JSON_GENERAL_ITEM clob;
comment on column RHN_VIS_INP_SHIFT_HANDOFF.JSON_GENERAL_ITEM is '通用itemsJSON';
alter table RHN_VIS_INP_SHIFT_HANDOFF_ITEM alter column JSON_PENDING_ACTIONS clob;
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.JSON_PENDING_ACTIONS is '待办操作JSON';
alter table RHN_VIS_INP_SHIFT_HANDOFF_ITEM alter column JSON_RISK_FLAGS clob;
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.JSON_RISK_FLAGS is 'risk标志JSON';

-- H2 alone needs CLOB instead of PostgreSQL TEXT for Hibernate LONG32VARCHAR validation.
alter table RHN_AN_CATALOG_VER alter column JSON_DEF clob;
alter table RHN_AN_DRAFT_VER alter column JSON_SPEC clob;

alter table RHN_META_PRINT_DRAFT alter column JSON_CONFIG clob;
comment on column RHN_META_PRINT_DRAFT.JSON_CONFIG is '可视化布局配置';

alter table RHN_META_PRINT_DEVICE alter column JSON_CAPS clob;
comment on column RHN_META_PRINT_DEVICE.JSON_CAPS is '设备能力JSON';

alter table RHN_SYS_PRINT_BATCH alter column JSON_SELCTN clob;
comment on column RHN_SYS_PRINT_BATCH.JSON_SELCTN is '选择条件快照JSON';

alter table RHN_SYS_PRINT_BATCH_ITEM alter column JSON_SNAP clob;
comment on column RHN_SYS_PRINT_BATCH_ITEM.JSON_SNAP is '不可变打印快照JSON';

alter table RHN_META_PRINT_TASK_DEF alter column JSON_PURPS clob;
comment on column RHN_META_PRINT_TASK_DEF.JSON_PURPS is '允许的打印用途集合';

alter table RHN_META_PRINT_IMPL alter column JSON_CONFIG clob;
comment on column RHN_META_PRINT_IMPL.JSON_CONFIG is '实现扩展配置';

-- SOURCE backend/src/main/resources/db/h2/V1_57_1__outpatient_document_info_clob.sql sha256=c6ea49dffb3733d5aa6475870828e92f5c73b9f59fe4446e41697bec724f72d4
ALTER TABLE RHN_EX_REQ_GRP ALTER COLUMN JSON_DOC_INFO CLOB;
COMMENT ON COLUMN RHN_EX_REQ_GRP.JSON_DOC_INFO IS '处方单据信息JSON';
ALTER TABLE RHN_EX_CARE_REQ ALTER COLUMN JSON_DOC_INFO CLOB;
COMMENT ON COLUMN RHN_EX_CARE_REQ.JSON_DOC_INFO IS '诊疗申请单据信息JSON';

-- SOURCE backend/src/main/resources/db/h2/V1_74_1__prescription_medication_safety_clob.sql sha256=e4d4b29205ca354b90d8ddbebe35df21ddef6121873ca9319115ff48982b1773
alter table RHN_EX_REQ_GRP alter column JSON_SAFETY_REVIEW clob;
comment on column RHN_EX_REQ_GRP.JSON_SAFETY_REVIEW is '处方提交时合理用药提示、涉及药品及医生处理理由，供药师审方核对';
