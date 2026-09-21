create table RHN_BD_SEARCH_ENTRY (
    ID_SEARCH_ENTRY bigint not null,
    REVISION bigint default 0 not null,
    SD_SCOPE_TYPE varchar(24) not null,
    ID_SCOPE bigint not null,
    ID_TNT bigint,
    SD_TARGET_TYPE varchar(32) not null,
    ID_TARGET bigint not null,
    SD_NAME_TYPE varchar(24) not null,
    CD_SOURCE_KEY varchar(160) not null,
    NA_SEARCH varchar(300) not null,
    CD_PINYIN varchar(128),
    CD_WUBI varchar(128),
    CD_MNEMONIC varchar(128),
    FG_PRIMARY boolean default false not null,
    CD_GEN_VER varchar(32),
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    constraint PK_BD_SEARCH_ENTRY primary key (ID_SEARCH_ENTRY),
    constraint UK_BD_SEARCH_ENTRY_SOURCE unique (
        SD_SCOPE_TYPE, ID_SCOPE, SD_TARGET_TYPE, ID_TARGET, CD_SOURCE_KEY
    ),
    constraint UK_BD_SEARCH_ENTRY_TENANT unique (ID_TNT, ID_SEARCH_ENTRY),
    constraint CK_BD_SEARCH_ENTRY_SCOPE check (SD_SCOPE_TYPE in ('PRODUCT', 'TENANT', 'ORGANIZATION')),
    constraint CK_BD_SEARCH_ENTRY_SCOPE_TNT check (
        (SD_SCOPE_TYPE = 'PRODUCT' and ID_TNT is null)
        or (SD_SCOPE_TYPE in ('TENANT', 'ORGANIZATION') and ID_TNT is not null)
    ),
    constraint CK_BD_SEARCH_ENTRY_TARGET check (
        SD_TARGET_TYPE in ('CONCEPT', 'MEDICATION', 'CATALOG_ITEM')
    ),
    constraint CK_BD_SEARCH_ENTRY_NAME_TYPE check (
        SD_NAME_TYPE in ('CANONICAL', 'SHORT_NAME', 'ALIAS', 'TRADE_NAME', 'LOCAL_NAME')
    ),
    constraint CK_BD_SEARCH_ENTRY_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create index IDX_BD_SEARCH_ENTRY_NAME on RHN_BD_SEARCH_ENTRY (
    SD_SCOPE_TYPE, ID_SCOPE, SD_TARGET_TYPE, SD_STATUS, NA_SEARCH, ID_TARGET
);
create index IDX_BD_SEARCH_ENTRY_PINYIN on RHN_BD_SEARCH_ENTRY (
    SD_SCOPE_TYPE, ID_SCOPE, SD_TARGET_TYPE, SD_STATUS, CD_PINYIN, ID_TARGET
);
create index IDX_BD_SEARCH_ENTRY_WUBI on RHN_BD_SEARCH_ENTRY (
    SD_SCOPE_TYPE, ID_SCOPE, SD_TARGET_TYPE, SD_STATUS, CD_WUBI, ID_TARGET
);
create index IDX_BD_SEARCH_ENTRY_MNEMONIC on RHN_BD_SEARCH_ENTRY (
    SD_SCOPE_TYPE, ID_SCOPE, SD_TARGET_TYPE, SD_STATUS, CD_MNEMONIC, ID_TARGET
);
create index IDX_BD_SEARCH_ENTRY_TARGET on RHN_BD_SEARCH_ENTRY (
    SD_TARGET_TYPE, ID_TARGET, SD_SCOPE_TYPE, ID_SCOPE, SD_STATUS
);

create index IDX_BD_CONCEPT_SCH_FROM on RHN_BD_CONCEPT (DA_EFFECTIVE_FROM, ID_CONCEPT);
create index IDX_BD_CONCEPT_SCH_TO on RHN_BD_CONCEPT (DA_EFFECTIVE_TO, ID_CONCEPT);
create index IDX_BD_CATALOG_SCH_FROM on RHN_BD_CATALOG_ITEM (DA_VALID_FROM, SD_ITEM_TYPE, ID_CATALOG_ITEM);
create index IDX_BD_CATALOG_SCH_TO on RHN_BD_CATALOG_ITEM (DA_VALID_TO, SD_ITEM_TYPE, ID_CATALOG_ITEM);
create index IDX_BD_ORG_CATALOG_SCH_FROM on RHN_BD_ORG_CATALOG_ITEM (
    DA_VALID_FROM, ID_TNT, ID_ORG, ID_CATALOG_ITEM
);
create index IDX_BD_ORG_CATALOG_SCH_TO on RHN_BD_ORG_CATALOG_ITEM (
    DA_VALID_TO, ID_TNT, ID_ORG, ID_CATALOG_ITEM
);

comment on table RHN_BD_SEARCH_ENTRY is '基础数据检索条目；一行代表一个标准名称、别名、商品名或机构本地名称的检索投影。';
comment on column RHN_BD_SEARCH_ENTRY.ID_SEARCH_ENTRY is '检索条目主键';
comment on column RHN_BD_SEARCH_ENTRY.SD_SCOPE_TYPE is '作用域类型：产品、租户或机构';
comment on column RHN_BD_SEARCH_ENTRY.ID_SCOPE is '作用域标识';
comment on column RHN_BD_SEARCH_ENTRY.ID_TNT is '租户标识；产品级条目为空';
comment on column RHN_BD_SEARCH_ENTRY.SD_TARGET_TYPE is '目标类型：概念、通用药品或目录项目';
comment on column RHN_BD_SEARCH_ENTRY.ID_TARGET is '目标主键';
comment on column RHN_BD_SEARCH_ENTRY.SD_NAME_TYPE is '名称类型';
comment on column RHN_BD_SEARCH_ENTRY.CD_SOURCE_KEY is '来源字段稳定键，用于幂等同步';
comment on column RHN_BD_SEARCH_ENTRY.NA_SEARCH is '标准化检索名称';
comment on column RHN_BD_SEARCH_ENTRY.CD_PINYIN is '拼音首字母简码，不保存完整拼音';
comment on column RHN_BD_SEARCH_ENTRY.CD_WUBI is '五笔简码';
comment on column RHN_BD_SEARCH_ENTRY.CD_MNEMONIC is '人工或导入助记码';
comment on column RHN_BD_SEARCH_ENTRY.FG_PRIMARY is '是否主名称';
comment on column RHN_BD_SEARCH_ENTRY.CD_GEN_VER is '检索码生成器版本';
comment on column RHN_BD_SEARCH_ENTRY.SD_STATUS is '状态';

insert into RHN_SYS_PARAM_CAT values (
    362387869794072, 362387869794001, 'MASTER_DATA_SEARCH', '基础数据检索',
    '诊断、药品、诊疗项目和供应链目录共用的检索习惯与匹配策略。',
    40, true, 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHERITANCE, FG_CACHE,
    FG_NULLABLE_VAL, SENSITIVITY, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPENDENCY_BEHAVIOR
) values (
    362387869795130, 362387869794072, 'master-data.search.input-mode', '检索输入习惯',
    '非中文输入使用的简码类型；拼音使用拼音首字母，五笔使用五笔简码，全部同时匹配两者及人工助记码。',
    'STRING', 'SELECT', '{"type":"string","enum":["PINYIN","WUBI","ALL"]}',
    '"PINYIN"', '"ALL"', null, 'MASTER_DATA_SEARCH_INPUT_MODE',
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT","USER"]', 'BUSINESS',
    true, true, false, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHERITANCE, FG_CACHE,
    FG_NULLABLE_VAL, SENSITIVITY, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPENDENCY_BEHAVIOR
) values (
    362387869795131, 362387869794072, 'master-data.search.match-mode', '检索匹配方式',
    '控制基础数据检索采用左匹配、模糊包含或相似度匹配；明确的业务编码和条码仍采用精确或左匹配。',
    'STRING', 'SELECT', '{"type":"string","enum":["PREFIX","CONTAINS","SIMILARITY"]}',
    '"PREFIX"', '"CONTAINS"', null, 'MASTER_DATA_SEARCH_MATCH_MODE',
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT","USER"]', 'BUSINESS',
    true, true, false, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHERITANCE, FG_CACHE,
    FG_NULLABLE_VAL, SENSITIVITY, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPENDENCY_BEHAVIOR
) values (
    362387869795132, 362387869794072, 'master-data.search.similarity-threshold', '相似度阈值',
    '相似度匹配模式下的最低得分，取值范围0到1。',
    'NUMBER', 'NUMBER', '{"type":"number","minimum":0.5,"maximum":1}',
    '0.75', '0.8', null, null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT","USER"]', 'BUSINESS',
    true, true, false, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222,
    'master-data.search.match-mode', '"SIMILARITY"', 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHERITANCE, FG_CACHE,
    FG_NULLABLE_VAL, SENSITIVITY, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPENDENCY_BEHAVIOR
) values (
    362387869795133, 362387869794072, 'master-data.search.result-limit', '默认检索结果数',
    '诊断、医嘱和供应链目录远程检索单次默认返回的最大结果数。',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":10,"maximum":100}',
    '30', '50', '条', null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT","USER"]', 'BUSINESS',
    true, true, false, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG values (
    362387869796130, null, 362387869795130, null, 'DEFINITION', 'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"master-data.search.input-mode","status":"ACTIVE"}',
    '初始化基础数据检索输入习惯参数', 'baseline-v160:master-data.search.input-mode',
    current_timestamp, 362387869790222
);
insert into RHN_SYS_PARAM_CHG values (
    362387869796131, null, 362387869795131, null, 'DEFINITION', 'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"master-data.search.match-mode","status":"ACTIVE"}',
    '初始化基础数据检索匹配方式参数', 'baseline-v160:master-data.search.match-mode',
    current_timestamp, 362387869790222
);
insert into RHN_SYS_PARAM_CHG values (
    362387869796132, null, 362387869795132, null, 'DEFINITION', 'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"master-data.search.similarity-threshold","status":"ACTIVE"}',
    '初始化基础数据检索相似度阈值参数', 'baseline-v160:master-data.search.similarity-threshold',
    current_timestamp, 362387869790222
);
insert into RHN_SYS_PARAM_CHG values (
    362387869796133, null, 362387869795133, null, 'DEFINITION', 'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"master-data.search.result-limit","status":"ACTIVE"}',
    '初始化基础数据检索结果数参数', 'baseline-v160:master-data.search.result-limit',
    current_timestamp, 362387869790222
);
