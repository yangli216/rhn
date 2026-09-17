-- Reconcile schemas where QMED-0 had occupied versions 1.43 and 1.45.
-- Preserve Flyway history; restore the canonical comments and any missing workbench objects.
-- Complete the physical catalog for previously added tables.
comment on table RHN_AN_AUDIT_EVT is '一行代表分析审计事件';
comment on column RHN_AN_AUDIT_EVT.ID_AUDIT_EVT is '审计事件标识';
comment on column RHN_AN_AUDIT_EVT.ID_TNT is '租户标识';
comment on column RHN_AN_AUDIT_EVT.ID_RUN is '运行标识';
comment on column RHN_AN_AUDIT_EVT.ID_USER_ACTOR is '操作用户标识';
comment on column RHN_AN_AUDIT_EVT.CD_EVENT is '事件代码';
comment on column RHN_AN_AUDIT_EVT.DT_CREATED is '创建时间';
comment on table RHN_AN_CATALOG_VER is '一行代表分析目录的一个版本';
comment on column RHN_AN_CATALOG_VER.ID_CATALOG_VER is '目录版本标识';
comment on column RHN_AN_CATALOG_VER.ID_TNT is '租户标识';
comment on column RHN_AN_CATALOG_VER.CD_CATALOG is '目录代码';
comment on column RHN_AN_CATALOG_VER.NO_VERSION is '版本号';
comment on column RHN_AN_CATALOG_VER.JSON_DEFINITION is '目录定义 JSON';
comment on column RHN_AN_CATALOG_VER.DT_CREATED is '创建时间';
comment on column RHN_AN_CATALOG_VER.SD_REVIEW is '审核状态';
comment on table RHN_AN_DRAFT_VER is '一行代表分析草稿的一个版本';
comment on column RHN_AN_DRAFT_VER.ID_DRAFT_VER is '草稿版本标识';
comment on column RHN_AN_DRAFT_VER.ID_TNT is '租户标识';
comment on column RHN_AN_DRAFT_VER.ID_DRAFT is '草稿标识';
comment on column RHN_AN_DRAFT_VER.NO_VERSION is '版本号';
comment on column RHN_AN_DRAFT_VER.ID_USER_OWNER is '所属用户标识';
comment on column RHN_AN_DRAFT_VER.ID_CATALOG_VER is '目录版本标识';
comment on column RHN_AN_DRAFT_VER.JSON_SPEC is '分析定义 JSON';
comment on column RHN_AN_DRAFT_VER.DT_CREATED is '创建时间';
comment on table RHN_AN_RUN is '一行代表一次分析运行';
comment on column RHN_AN_RUN.ID_RUN is '运行标识';
comment on column RHN_AN_RUN.ID_TNT is '租户标识';
comment on column RHN_AN_RUN.ID_DRAFT_VER is '草稿版本标识';
comment on column RHN_AN_RUN.ID_USER_OWNER is '所属用户标识';
comment on column RHN_AN_RUN.DT_CREATED is '创建时间';
comment on column RHN_AN_RUN.REVISION is '乐观锁版本';
comment on column RHN_AN_RUN.SD_STATE is '运行状态';
comment on column RHN_AN_RUN.SD_DELIVERY is '结果交付状态';
comment on table RHN_BD_ALLERGEN is '一行代表一个受控过敏原概念';
comment on column RHN_BD_ALLERGEN.ID_ALLERGEN is '过敏原标识';
comment on column RHN_BD_ALLERGEN.ID_TNT is '租户标识';
comment on column RHN_BD_ALLERGEN.ID_PARENT is '父项标识';
comment on column RHN_BD_ALLERGEN.CD_CAT is '分类代码';
comment on column RHN_BD_ALLERGEN.SD_CONCEPT_TYPE is '概念类型';
comment on column RHN_BD_ALLERGEN.CD_CODE_SYS_URI is '代码系统 URI';
comment on column RHN_BD_ALLERGEN.CD_ALLERGEN is '过敏原代码';
comment on column RHN_BD_ALLERGEN.NA_ALLERGEN is '过敏原名称';
comment on column RHN_BD_ALLERGEN.NA_ALIAS is '别名';
comment on column RHN_BD_ALLERGEN.CD_SEARCH is '检索码';
comment on column RHN_BD_ALLERGEN.SD_STATUS is '状态';
comment on table RHN_BD_CLASS_CONCEPT is '一行代表分类体系中的一个概念';
comment on column RHN_BD_CLASS_CONCEPT.ID_CLASS_CONCEPT is '分类概念标识';
comment on column RHN_BD_CLASS_CONCEPT.ID_CLASS_SYSTEM is '分类体系标识';
comment on column RHN_BD_CLASS_CONCEPT.ID_PARENT is '父项标识';
comment on column RHN_BD_CLASS_CONCEPT.CD_CONCEPT is '概念代码';
comment on column RHN_BD_CLASS_CONCEPT.NA_CONCEPT is '概念名称';
comment on column RHN_BD_CLASS_CONCEPT.QTY_LEVEL is '层级深度';
comment on column RHN_BD_CLASS_CONCEPT.CLASS_PATH is '分类路径';
comment on column RHN_BD_CLASS_CONCEPT.SORT_ORDER is '排序号';
comment on column RHN_BD_CLASS_CONCEPT.SD_STATUS is '状态';
comment on table RHN_BD_CLASS_SYSTEM is '一行代表一个药品分类体系';
comment on column RHN_BD_CLASS_SYSTEM.ID_CLASS_SYSTEM is '分类体系标识';
comment on column RHN_BD_CLASS_SYSTEM.CD_CLASS_SYSTEM is '分类体系代码';
comment on column RHN_BD_CLASS_SYSTEM.NA_CLASS_SYSTEM is '分类体系名称';
comment on column RHN_BD_CLASS_SYSTEM.VERSION is '版本';
comment on column RHN_BD_CLASS_SYSTEM.SYSTEM_URI is '体系 URI';
comment on column RHN_BD_CLASS_SYSTEM.SD_CLASS_TYPE is '分类体系类型';
comment on column RHN_BD_CLASS_SYSTEM.SD_STATUS is '状态';
comment on table RHN_BD_MED_ALLERGEN_MAP is '一行代表一条药品与过敏原关联';
comment on column RHN_BD_MED_ALLERGEN_MAP.ID_MED_ALLERGEN_MAP is '药品过敏原映射标识';
comment on column RHN_BD_MED_ALLERGEN_MAP.ID_TNT is '租户标识';
comment on column RHN_BD_MED_ALLERGEN_MAP.ID_MED is '药品标识';
comment on column RHN_BD_MED_ALLERGEN_MAP.ID_ALLERGEN is '过敏原标识';
comment on column RHN_BD_MED_ALLERGEN_MAP.SD_RELATION_TYPE is '关系类型';
comment on column RHN_BD_MED_ALLERGEN_MAP.FG_PRIMARY is '是否主要关联';
comment on table RHN_BD_MED_CLASS_MAP is '一行代表一条药品与分类概念关联';
comment on column RHN_BD_MED_CLASS_MAP.ID_MED_CLASS_MAP is '药品分类映射标识';
comment on column RHN_BD_MED_CLASS_MAP.ID_TNT is '租户标识';
comment on column RHN_BD_MED_CLASS_MAP.ID_MED is '药品标识';
comment on column RHN_BD_MED_CLASS_MAP.ID_CLASS_CONCEPT is '分类概念标识';
comment on column RHN_BD_MED_CLASS_MAP.SD_MAPPING_ROLE is '映射角色';
comment on column RHN_BD_MED_CLASS_MAP.FG_PRIMARY is '是否主要关联';
comment on column RHN_BD_MED_CLASS_MAP.SOURCE_REFERENCE is '来源依据';
comment on table RHN_OP_TRIAGE_REC is '一行代表一次预检分诊';
comment on column RHN_OP_TRIAGE_REC.ID_TRIAGE_REC is '预检分诊记录标识';
comment on column RHN_OP_TRIAGE_REC.ID_TNT is '租户标识';
comment on column RHN_OP_TRIAGE_REC.ID_ORG is '机构标识';
comment on column RHN_OP_TRIAGE_REC.ID_RESIDENT is '居民标识';
comment on column RHN_OP_TRIAGE_REC.ID_ENC is '就诊标识';
comment on column RHN_OP_TRIAGE_REC.ID_PAT_REG is '挂号标识';
comment on column RHN_OP_TRIAGE_REC.CD_TRIAGE_NO is '分诊编号';
comment on column RHN_OP_TRIAGE_REC.DT_TRIAGE is '分诊时间';
comment on column RHN_OP_TRIAGE_REC.ID_TRIAGE_NURSE is '分诊护士标识';
comment on column RHN_OP_TRIAGE_REC.NA_TRIAGE_NURSE is '分诊护士姓名';
comment on column RHN_OP_TRIAGE_REC.NA_PATIENT is '患者姓名';
comment on column RHN_OP_TRIAGE_REC.SD_GENDER is '性别代码';
comment on column RHN_OP_TRIAGE_REC.AGE is '年龄';
comment on column RHN_OP_TRIAGE_REC.DT_BIRTH is '出生日期';
comment on column RHN_OP_TRIAGE_REC.NO_PHONE is '联系电话';
comment on column RHN_OP_TRIAGE_REC.NO_ID_CARD is '身份证件号码';
comment on column RHN_OP_TRIAGE_REC.NO_HEALTH_RECORD is '健康档案编号';
comment on column RHN_OP_TRIAGE_REC.SD_ARRIVAL_METHOD is '来院方式';
comment on column RHN_OP_TRIAGE_REC.SD_COMPANION_TYPE is '陪同人类型';
comment on column RHN_OP_TRIAGE_REC.DES_CHIEF_COMPLAINT is '主诉';
comment on column RHN_OP_TRIAGE_REC.TXT_SYMPTOMS is '症状描述';
comment on column RHN_OP_TRIAGE_REC.VAL_TEMP is '体温';
comment on column RHN_OP_TRIAGE_REC.VAL_PULSE is '脉搏';
comment on column RHN_OP_TRIAGE_REC.VAL_RESP is '呼吸频率';
comment on column RHN_OP_TRIAGE_REC.VAL_SBP is '收缩压';
comment on column RHN_OP_TRIAGE_REC.VAL_DBP is '舒张压';
comment on column RHN_OP_TRIAGE_REC.VAL_SPO2 is '血氧饱和度';
comment on column RHN_OP_TRIAGE_REC.VAL_GLUCOSE is '血糖';
comment on column RHN_OP_TRIAGE_REC.VAL_PAIN is '疼痛评分';
comment on column RHN_OP_TRIAGE_REC.SD_CONSCIOUSNESS is '意识状态';
comment on column RHN_OP_TRIAGE_REC.FG_FEVER is '是否发热';
comment on column RHN_OP_TRIAGE_REC.TXT_EPIDEMIC is '流行病学史';
comment on column RHN_OP_TRIAGE_REC.TXT_RISK_TAGS is '风险标签';
comment on column RHN_OP_TRIAGE_REC.SD_TRIAGE_LEVEL is '分诊级别';
comment on column RHN_OP_TRIAGE_REC.DES_TRIAGE_REASON is '分诊依据';
comment on column RHN_OP_TRIAGE_REC.ID_TARGET_DEPT is '目标科室标识';
comment on column RHN_OP_TRIAGE_REC.NA_TARGET_DEPT is '目标科室名称';
comment on column RHN_OP_TRIAGE_REC.ID_TARGET_DOC is '目标医生标识';
comment on column RHN_OP_TRIAGE_REC.NA_TARGET_DOC is '目标医生姓名';
comment on column RHN_OP_TRIAGE_REC.SD_GREEN_CHANNEL is '绿色通道状态';
comment on column RHN_OP_TRIAGE_REC.SD_DISPOSITION is '处置方式';
comment on column RHN_OP_TRIAGE_REC.SD_STATUS is '状态';
comment on column RHN_OP_TRIAGE_REC.TXT_NOTES is '备注';
comment on column RHN_OP_TRIAGE_REC.REVISION is '乐观锁版本';
comment on column RHN_OP_TRIAGE_REC.DT_CREATED is '创建时间';
comment on column RHN_OP_TRIAGE_REC.DT_UPDATED is '更新时间';
comment on table RHN_SUP_RX_INV_FREEZE is '一行代表一条处方库存冻结明细';
comment on column RHN_SUP_RX_INV_FREEZE.ID_RX_INV_FREEZE is '处方库存冻结标识';
comment on column RHN_SUP_RX_INV_FREEZE.ID_TNT is '租户标识';
comment on column RHN_SUP_RX_INV_FREEZE.ID_RX is '处方标识';
comment on column RHN_SUP_RX_INV_FREEZE.ID_CARE_REQ is '医嘱标识';
comment on column RHN_SUP_RX_INV_FREEZE.ID_STOCK_SITE is '库房标识';
comment on column RHN_SUP_RX_INV_FREEZE.ID_STOCK_BIN is '库位标识';
comment on column RHN_SUP_RX_INV_FREEZE.ID_STOCK_ITEM is '经营项目标识';
comment on column RHN_SUP_RX_INV_FREEZE.ID_STOCK_LOT is '库存批次标识';
comment on column RHN_SUP_RX_INV_FREEZE.QTY_FROZEN is '冻结数量';
comment on column RHN_SUP_RX_INV_FREEZE.CD_BASE_UNIT is '基本单位代码';
comment on column RHN_SUP_RX_INV_FREEZE.SD_STATUS is '状态';
comment on column RHN_SUP_RX_INV_FREEZE.DT_CREATED is '创建时间';
comment on column RHN_SUP_RX_INV_FREEZE.ID_USER_CREATED is '创建用户标识';
comment on column RHN_SUP_RX_INV_FREEZE.DT_RELEASED is '释放时间';
comment on column RHN_SUP_RX_INV_FREEZE.ID_USER_RELEASED is '释放用户标识';
comment on column RHN_SUP_RX_INV_FREEZE.DES_RELEASE_REASON is '释放原因';

declare
    object_count number;
begin
    select count(*) into object_count from user_tables where table_name = 'RHN_AUD_MED_CAND';
    if object_count = 0 then
        execute immediate 'create table RHN_AUD_MED_CAND (
    ID_CAND number(19) not null primary key,
    ID_TNT number(19) not null,
    ID_USER_ACTOR number(19) not null,
    JSON_CONTENT clob not null,
    constraint UK_QMED_CAND_TNT unique (ID_TNT, ID_CAND)
)';
    end if;
end;
/
declare
    object_count number;
begin
    select count(*) into object_count from user_tables where table_name = 'RHN_AUD_MED_TRIAL';
    if object_count = 0 then
        execute immediate 'create table RHN_AUD_MED_TRIAL (
    ID_TRIAL number(19) not null primary key,
    ID_TNT number(19) not null,
    ID_CAND number(19) not null,
    ID_USER_ACTOR number(19) not null,
    JSON_INPUT clob not null,
    JSON_RESULT clob not null,
    constraint FK_QMED_TRIAL_CAND foreign key (ID_TNT, ID_CAND) references RHN_AUD_MED_CAND (ID_TNT, ID_CAND)
)';
    end if;
end;
/
declare
    object_count number;
begin
    select count(*) into object_count from user_indexes where index_name = 'IX_QMED_TRIAL_CAND';
    if object_count = 0 then
        execute immediate 'create index IX_QMED_TRIAL_CAND on RHN_AUD_MED_TRIAL (ID_TNT, ID_CAND, ID_TRIAL)';
    end if;
end;
/
comment on table RHN_AUD_MED_CAND is '合理用药候选规则，一行代表一次不可变的 AI 生成版本';
comment on column RHN_AUD_MED_CAND.ID_CAND is '候选规则标识';
comment on column RHN_AUD_MED_CAND.ID_TNT is '租户标识';
comment on column RHN_AUD_MED_CAND.ID_USER_ACTOR is '创建用户标识';
comment on column RHN_AUD_MED_CAND.JSON_CONTENT is '规则定义、来源、模型和药品主数据快照';
comment on table RHN_AUD_MED_TRIAL is '合理用药试跑，一行代表一次模拟或旁路执行';
comment on column RHN_AUD_MED_TRIAL.ID_TRIAL is '试跑标识';
comment on column RHN_AUD_MED_TRIAL.ID_TNT is '租户标识';
comment on column RHN_AUD_MED_TRIAL.ID_CAND is '候选规则标识';
comment on column RHN_AUD_MED_TRIAL.ID_USER_ACTOR is '操作用户标识';
comment on column RHN_AUD_MED_TRIAL.JSON_INPUT is '完整试跑输入快照';
comment on column RHN_AUD_MED_TRIAL.JSON_RESULT is '试跑结果快照';
