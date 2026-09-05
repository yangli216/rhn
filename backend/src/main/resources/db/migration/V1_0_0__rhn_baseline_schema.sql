-- =============================================================================
-- RHN Database Baseline Schema (PostgreSQL / H2)
-- Total Tables: 271
-- Generated automatically. Do not edit manually.
-- =============================================================================

-- 1. Table Definitions
create table RHN_AI_SUGGEST (
    ID_AI_SUGGEST bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    CD_SUGGEST varchar(128) not null,
    SD_SUGGEST_TYPE varchar(64) not null,
    SD_STATUS varchar(32) not null,
    SD_RISK_LEVEL varchar(32) not null,
    CD_SCHEMA varchar(128) not null,
    CD_SCHEMA_VER varchar(64) not null,
    HASH_CLIENT_CONTEXT varchar(128) not null,
    HASH_CONTEXT varchar(128) not null,
    HASH_SERVER_CONTEXT varchar(128) not null,
    JSON_CONTENT text not null,
    JSON_EVID text not null,
    CD_PROVIDER varchar(128) not null,
    CD_MODEL varchar(128),
    CD_PROMPT_VER varchar(64) not null,
    CD_KNOWLEDGE_VER varchar(64),
    DT_DATA_CUTOFF timestamp with time zone,
    DT_GENERATED timestamp with time zone not null,
    DT_EXPIRES timestamp with time zone not null,
    DT_INVALIDATED timestamp with time zone,
    DES_INVALIDATION_REASON varchar(1000),
    ID_PRACT_REQUESTED bigint not null,
    ID_USER_REQUESTED bigint not null,
    DT_CREATED timestamp with time zone not null,
    constraint PK_AI_SUGGEST_PK primary key (ID_AI_SUGGEST),
    constraint UK_AI_SUGGEST_AI_SUGGESTION_TE unique (ID_TNT, ID_AI_SUGGEST),
    constraint UK_AI_SUGGEST_AI_SUGGESTION_CO unique (ID_TNT, CD_SUGGEST),
    constraint CK_AI_SUGGEST_AI_SUGGESTION_ST check (SD_STATUS in (
        'GENERATING', 'GENERATED', 'PARTIALLY_ADOPTED', 'ADOPTED', 'IGNORED', 'EXPIRED', 'FAILED'
    )),
    constraint CK_AI_SUGGEST_AI_SUGGESTION_RI check (SD_RISK_LEVEL in ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    constraint CK_AI_SUGGEST_AI_SUGGESTION_PE check (DT_EXPIRES > DT_GENERATED),
    constraint CK_AI_SUGGEST_AI_SUGGESTION_EX check (SD_STATUS <> 'EXPIRED' or (DT_INVALIDATED is not null and DES_INVALIDATION_REASON is not null))
);

create table RHN_AI_SUGGEST_EVT (
    ID_AI_SUGGEST_EVT bigint,
    ID_TNT bigint not null,
    ID_AI_SUGGEST bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32),
    ID_PRACT bigint not null,
    ID_USER bigint not null,
    CD_SECTION varchar(64),
    HASH_CONTEXT varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    DES_DETAIL varchar(1000),
    JSON_ACTION text not null,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_AI_SUGGEST_EVT_PK primary key (ID_AI_SUGGEST_EVT),
    constraint UK_AI_SUGGEST_EVT_AI_EVENT_TEN unique (ID_TNT, ID_AI_SUGGEST_EVT),
    constraint UK_AI_SUGGEST_EVT_AI_EVENT_COM unique (ID_TNT, ID_AI_SUGGEST, CD_COMMAND),
    constraint CK_AI_SUGGEST_EVT_AI_EVENT_TYP check (SD_EVT_TYPE in (
        'GENERATED', 'VIEWED', 'ADOPTED', 'IGNORED',
        'FEEDBACK_POSITIVE', 'FEEDBACK_NEGATIVE', 'EXPIRED', 'FAILED'
    )),
    constraint CK_AI_SUGGEST_EVT_AI_EVENT_STA check (SD_STATUS_FROM in (
        'GENERATING', 'GENERATED', 'PARTIALLY_ADOPTED', 'ADOPTED', 'IGNORED', 'EXPIRED', 'FAILED'
    )),
    constraint CK_AI_SUGGEST_EVT_AI_EVENT_S_1 check (SD_STATUS_TO in (
        'GENERATING', 'GENERATED', 'PARTIALLY_ADOPTED', 'ADOPTED', 'IGNORED', 'EXPIRED', 'FAILED'
    ))
);

create table RHN_ANL_PRES_METRIC_SAMPLE (
    ID_PRES_METRIC_SAMPLE bigint,
    ID_TNT bigint not null,
    SD_SCOPE_TYPE varchar(24) not null,
    CD_SCOPE_KEY varchar(100) not null,
    ID_ORG bigint,
    ID_DEPT bigint,
    DT_BUCKET timestamp with time zone not null,
    QTY_ONLINE_USER bigint not null,
    QTY_ACTIVE_USER bigint not null,
    QTY_ONLINE_CONTEXTS bigint not null,
    QTY_CONNECTIONS bigint not null,
    QTY_INSTANCES bigint not null,
    DT_CREATED timestamp with time zone not null,
    constraint PK_ANL_PRES_METRIC_SAMPLE_PK primary key (ID_PRES_METRIC_SAMPLE),
    constraint UK_ANL_PRES_METRI_PRESENCE_MET unique (ID_TNT, CD_SCOPE_KEY, DT_BUCKET),
    constraint CK_ANL_PRES_METRI_PRESENCE_MET check (SD_SCOPE_TYPE in ('TENANT','ORGANIZATION','DEPARTMENT')),
    constraint CK_ANL_PRES_METRI_PRESENCE_M_1 check (QTY_ONLINE_USER >= 0 and QTY_ACTIVE_USER >= 0
        and QTY_ONLINE_CONTEXTS >= 0 and QTY_CONNECTIONS >= 0 and QTY_INSTANCES >= 0)
);

create table RHN_AUD_CRYPTO_EVID (
    ID_CRYPTO_EVID bigint,
    ID_TNT bigint not null,
    SD_TARGET_TYPE varchar(128) not null,
    ID_TARGET bigint not null,
    CD_TARGET_VER_NO bigint,
    CD_OPERATION varchar(64) not null,
    SD_PROTECTION_PROF varchar(128) not null,
    SD_PROTECTION_PURPOSE varchar(32) not null,
    JSON_CONTENT_SCHEMA varchar(128) not null,
    CONTENT_DIGEST_ALGORITHM varchar(64) not null,
    HASH_CONTENT varchar(512) not null,
    SN_STATEMENT_VER integer not null,
    JSON_STATEMENT text not null,
    STATEMENT_DIGEST_ALGORITHM varchar(64) not null,
    HASH_STATEMENT varchar(512) not null,
    ID_CRYPTO_EVID_PREVIOUS bigint,
    CD_PROVIDER varchar(128) not null,
    PROVIDER_ASSURANCE varchar(64) not null,
    SD_SIGN_ALGORITHM varchar(128) not null,
    SIGNATURE_VALUE text not null,
    ID_KEY varchar(256) not null,
    SD_SIGNER_TYPE varchar(32) not null,
    ID_SIGNER_SUBJECT bigint,
    NA_SIGNER varchar(300) not null,
    DES_VERIFICATION_MATERIAL text,
    CD_CERTIFICATE_SERIAL varchar(256),
    CERTIFICATE_ISSUER varchar(500),
    DT_SIGNED timestamp with time zone not null,
    TIMESTAMP_AUTHORITY varchar(300),
    TIMESTAMP_TOKEN text,
    ID_CORRELATION varchar(64) not null,
    DT_RECORDED timestamp with time zone not null,
    constraint PK_AUD_CRYPTO_EVID_PK primary key (ID_CRYPTO_EVID),
    constraint UK_AUD_CRYPTO_EVI_CRYPTO_EVIDE unique (ID_TNT, ID_CRYPTO_EVID),
    constraint CK_AUD_CRYPTO_EVI_CRYPTO_EVIDE check (SD_PROTECTION_PURPOSE in ('INTEGRITY', 'NON_REPUDIATION')),
    constraint CK_AUD_CRYPTO_EVI_CRYPTO_EVI_1 check (SD_SIGNER_TYPE in ('PERSON', 'ORGANIZATION', 'SYSTEM'))
);

create table RHN_AUD_IAM_AUTH_EVT (
    ID_IAM_AUTH_EVT bigint,
    ID_TNT bigint not null,
    SD_EVT_TYPE varchar(64) not null,
    SD_TARGET_TYPE varchar(64) not null,
    ID_TARGET bigint not null,
    ID_USER_ACTOR bigint,
    JSON_DETAIL text,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_AUD_IAM_AUTH_EVT_PK primary key (ID_IAM_AUTH_EVT)
);

create table RHN_AUD_LOG (
    ID_AUD_LOG bigint,
    ID_TNT bigint not null,
    CD_ACTOR varchar(100) not null,
    SD_HTTP_METHOD varchar(16) not null,
    REQUEST_PATH varchar(500) not null,
    SD_RESP_STATUS integer not null,
    ID_CORRELATION varchar(64) not null,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_AUD_LOG_PK primary key (ID_AUD_LOG)
);

create table RHN_BD_CATALOG_CHG_BATCH (
    ID_CATALOG_CHG_BATCH bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    SD_BATCH_TYPE varchar(32) not null,
    SD_OPERATION_TYPE varchar(32) not null,
    ID_ORG bigint,
    CD_REQ varchar(128) not null,
    HASH_REQ varchar(64) not null,
    DA_BUSINESS date not null,
    SD_STATUS varchar(32) not null,
    QTY_TOTAL_ROW integer default 0 not null,
    QTY_SUCCEEDED_ROW integer default 0 not null,
    QTY_FAILED_ROW integer default 0 not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_CATALOG_CHG_BATCH_PK primary key (ID_CATALOG_CHG_BATCH),
    constraint UK_BD_CATALOG_CHG_CATALOG_CHAN unique (ID_TNT, CD_REQ),
    constraint UK_BD_CATALOG_CHG_CATALOG_CH_1 unique (ID_TNT, ID_CATALOG_CHG_BATCH),
    constraint CK_BD_CATALOG_CHG_CATALOG_CHAN check (SD_BATCH_TYPE in ('ADOPTION', 'PRICE')),
    constraint CK_BD_CATALOG_CHG_CATALOG_CH_1 check (SD_OPERATION_TYPE in ('ADOPT', 'RETIRE', 'PRICE_UPSERT')),
    constraint CK_BD_CATALOG_CHG_CATALOG_CH_2 check (SD_STATUS in ('PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED')),
    constraint CK_BD_CATALOG_CHG_CATALOG_CH_3 check (QTY_TOTAL_ROW >= 0 and QTY_SUCCEEDED_ROW >= 0 and QTY_FAILED_ROW >= 0 and
        QTY_SUCCEEDED_ROW + QTY_FAILED_ROW <= QTY_TOTAL_ROW)
);

create table RHN_BD_CATALOG_CHG_ROW (
    ID_CATALOG_CHG_ROW bigint,
    ID_TNT bigint not null,
    ID_CATALOG_CHG_BATCH bigint not null,
    CD_ROW_NUMBER integer not null,
    ID_CATALOG_ITEM bigint not null,
    ID_PKG bigint,
    JSON_SRC text not null,
    SD_STATUS varchar(32) not null,
    SD_TARGET_RSRC_TYPE varchar(32),
    ID_TARGET bigint,
    CD_ERROR varchar(128),
    DES_ERROR_MSG varchar(1000),
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_CATALOG_CHG_ROW_PK primary key (ID_CATALOG_CHG_ROW),
    constraint UK_BD_CATALOG_CHG_CATALOG_CH_2 unique (ID_CATALOG_CHG_BATCH, CD_ROW_NUMBER),
    constraint CK_BD_CATALOG_CHG_CATALOG_CH_4 check (SD_STATUS in ('SUCCEEDED', 'FAILED')),
    constraint CK_BD_CATALOG_CHG_CATALOG_CH_5 check ((SD_STATUS = 'SUCCEEDED' and ID_TARGET is not null and SD_TARGET_RSRC_TYPE is not null and CD_ERROR is null) or
        (SD_STATUS = 'FAILED' and ID_TARGET is null and SD_TARGET_RSRC_TYPE is null and CD_ERROR is not null))
);

create table RHN_BD_CATALOG_ITEM (
    ID_CATALOG_ITEM bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    CD_CATALOG_ITEM varchar(64) not null,
    NA_CATALOG_ITEM varchar(300) not null,
    SD_ITEM_TYPE varchar(32) not null,
    CD_UNIT varchar(64),
    FG_ORDERABLE boolean default false not null,
    FG_CHARGEABLE boolean default false not null,
    FG_STOCKED boolean default false not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    ID_ITEM_TYPE bigint not null,
    ID_ITEM_MASTER bigint,
    constraint PK_BD_CATALOG_ITEM_PK primary key (ID_CATALOG_ITEM),
    constraint UK_BD_CATALOG_ITE_CATALOG_ITEM unique (ID_TNT, ID_CATALOG_ITEM),
    constraint UK_BD_CATALOG_ITE_CATALOG_IT_1 unique (ID_TNT, CD_CATALOG_ITEM),
    constraint CK_BD_CATALOG_ITE_CATALOG_ITEM check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_CATALOG_PRICE (
    ID_CATALOG_PRICE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_ORG bigint,
    ID_ITEM_PKG bigint,
    SD_PRICE_TYPE varchar(32) not null,
    PRICE_UNIT decimal(24,6) not null,
    CD_CURRENCY varchar(16) not null,
    CD_PRICE_DOC varchar(128),
    DES_PRICE_REASON varchar(1000),
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    ID_CATALOG_PRICE_REPLACES bigint,
    constraint PK_BD_CATALOG_PRICE_PK primary key (ID_CATALOG_PRICE),
    constraint UK_BD_CATALOG_PRI_CATALOG_PRIC unique (ID_TNT, ID_CATALOG_PRICE),
    constraint UK_BD_CATALOG_PRI_CATALOG_PR_1 unique (ID_TNT, ID_CATALOG_ITEM, ID_ORG, ID_ITEM_PKG, SD_PRICE_TYPE, DA_VALID_FROM),
    constraint CK_BD_CATALOG_PRI_CATALOG_PRIC check (PRICE_UNIT >= 0),
    constraint CK_BD_CATALOG_PRI_CATALOG_PR_1 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_CODE_SYSTEM (
    ID_CODE_SYSTEM bigint,
    SD_SCOPE_TYPE varchar(24) not null,
    ID_SCOPE bigint not null,
    CD_CODE_SYSTEM varchar(100) not null,
    NA_CODE_SYSTEM varchar(200) not null,
    CD_CANONICAL_URI varchar(500),
    CD_VER varchar(64) not null,
    SD_STATUS varchar(24) not null,
    DA_EFFECTIVE_FROM date not null,
    DA_EFFECTIVE_TO date,
    DT_CREATED timestamp with time zone not null,
    SD_SYS_TYPE varchar(32) default 'COMMON' not null,
    PUBLISHER varchar(300),
    DES_CODE_SYSTEM varchar(2000),
    SD_SRC_TYPE varchar(32) default 'MANUAL' not null,
    REVISION bigint default 0 not null,
    DT_UPDATED timestamp with time zone default current_timestamp not null,
    SD_AUTHORITY_TYPE varchar(32) default 'INTERNAL' not null,
    CD_SRC_URI varchar(1000),
    HASH_CONTENT varchar(128),
    SD_DIAG_DOMAIN varchar(32),
    constraint PK_BD_CODE_SYSTEM_PK primary key (ID_CODE_SYSTEM),
    constraint UK_BD_CODE_SYSTEM_CODE_SYSTEM_ unique (SD_SCOPE_TYPE, ID_SCOPE, CD_CODE_SYSTEM, CD_VER),
    constraint CK_BD_CODE_SYSTEM_CODE_SYSTEM_ check (SD_AUTHORITY_TYPE in (
    'NATIONAL', 'INSURANCE', 'REGULATORY', 'LOCAL', 'INTERNAL', 'OTHER'
)),
    constraint CK_BD_CODE_SYSTEM_CODE_SYSTE_1 check (SD_DIAG_DOMAIN is null or SD_DIAG_DOMAIN in ('WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME'))
);

create table RHN_BD_CONCEPT (
    ID_CONCEPT bigint,
    ID_CODE_SYSTEM bigint not null,
    CD_CONCEPT varchar(100) not null,
    NA_DISPLAY varchar(300) not null,
    DES_DEF varchar(1000),
    SD_STATUS varchar(24) not null,
    DA_EFFECTIVE_FROM date not null,
    DA_EFFECTIVE_TO date,
    DT_CREATED timestamp with time zone not null,
    SD_CONCEPT_TYPE varchar(32) default 'CONCEPT' not null,
    NA_SHORT varchar(300),
    CD_CHAPTER varchar(64),
    NA_CHAPTER varchar(300),
    CD_SEARCH varchar(128),
    SD_SRC_TYPE varchar(32) default 'MANUAL' not null,
    ID_CONCEPT_REPLACEMENT bigint,
    REVISION bigint default 0 not null,
    DT_UPDATED timestamp with time zone default current_timestamp not null,
    constraint PK_BD_CONCEPT_PK primary key (ID_CONCEPT),
    constraint UK_BD_CONCEPT_CONCEPT_CODE unique (ID_CODE_SYSTEM, CD_CONCEPT)
);

create table RHN_BD_CONCEPT_ALIAS (
    ID_CONCEPT_ALIAS bigint,
    ID_CONCEPT bigint not null,
    SD_ALIAS_TYPE varchar(32) not null,
    NA_ALIAS varchar(300) not null,
    CD_SEARCH varchar(128),
    SD_STATUS varchar(32) not null,
    constraint PK_BD_CONCEPT_ALIAS_PK primary key (ID_CONCEPT_ALIAS),
    constraint UK_BD_CONCEPT_ALI_CONCEPT_ALIA unique (ID_CONCEPT, SD_ALIAS_TYPE, NA_ALIAS)
);

create table RHN_BD_CONCEPT_MAP (
    ID_CONCEPT_MAP bigint,
    ID_TNT bigint not null,
    CD_SRC_SYS varchar(100) not null,
    CD_SRC varchar(100) not null,
    ID_CONCEPT_TARGET bigint not null,
    SD_EQUIVALENCE varchar(24) not null,
    SD_STATUS varchar(24) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    constraint PK_BD_CONCEPT_MAP_PK primary key (ID_CONCEPT_MAP),
    constraint UK_BD_CONCEPT_MAP_CONCEPT_MAPP unique (ID_TNT, CD_SRC_SYS, CD_SRC, DA_VALID_FROM)
);

create table RHN_BD_DICT_ATTR_DEF (
    ID_DICT_ATTR_DEF bigint,
    REVISION bigint default 0 not null,
    ID_DICT_DEF_DICT bigint not null,
    CD_DICT_ATTR_DEF varchar(64) not null,
    NA_DICT_ATTR_DEF varchar(200) not null,
    DES_DICT_ATTR_DEF varchar(1000) not null,
    SD_DATA_TYPE varchar(32) not null,
    SD_CARDINALITY varchar(16) not null,
    ID_DICT_DEF_REFERENCE_DICT bigint,
    JSON_SCHEMA text not null,
    SD_MINIMUM_SCOPE varchar(32) not null,
    SD_OVRD_POLICY varchar(32) not null,
    FG_REQUIRED_VAL boolean not null,
    FG_SEARCHABLE boolean not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_DICT_ATTR_DEF_PK primary key (ID_DICT_ATTR_DEF),
    constraint UK_BD_DICT_ATTR_D_DICT_ATTR_CO unique (ID_DICT_DEF_DICT, CD_DICT_ATTR_DEF),
    constraint CK_BD_DICT_ATTR_D_DICT_ATTR_DA check (SD_DATA_TYPE in (
        'BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT', 'CD_DICT_ATTR_DEF', 'DATE', 'DATETIME', 'DICT_REF'
    )),
    constraint CK_BD_DICT_ATTR_D_DICT_ATTR_CA check (SD_CARDINALITY in ('SINGLE', 'MULTIPLE')),
    constraint CK_BD_DICT_ATTR_D_DICT_ATTR_RE check ((SD_DATA_TYPE = 'DICT_REF' and ID_DICT_DEF_REFERENCE_DICT is not null) or
        (SD_DATA_TYPE <> 'DICT_REF' and ID_DICT_DEF_REFERENCE_DICT is null)),
    constraint CK_BD_DICT_ATTR_D_DICT_ATTR_MI check (SD_MINIMUM_SCOPE in ('PLATFORM', 'TENANT', 'ORGANIZATION', 'DEPARTMENT')),
    constraint CK_BD_DICT_ATTR_D_DICT_ATTR_OV check (SD_OVRD_POLICY in ('ANY', 'NO_OVERRIDE')),
    constraint CK_BD_DICT_ATTR_D_DICT_ATTR_ST check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_BD_DICT_CAT (
    ID_DICT_CAT bigint,
    REVISION bigint not null default 0,
    SD_SCOPE_TYPE varchar(16) not null,
    CD_SCOPE varchar(80) not null,
    ID_TNT bigint,
    ID_DICT_CAT_PARENT bigint,
    CD_DICT_CAT varchar(64) not null,
    NA_DICT_CAT varchar(200) not null,
    DES_DICT_CAT varchar(1000),
    SN_SORT integer not null default 0,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_DICT_CAT_PK primary key (ID_DICT_CAT),
    constraint UK_BD_DICT_CAT_DICTIONARY_CATE unique (CD_SCOPE, CD_DICT_CAT),
    constraint CK_BD_DICT_CAT_DICTIONARY_CATE check ((SD_SCOPE_TYPE = 'PLATFORM' and ID_TNT is null and CD_SCOPE = 'PLATFORM') or
        (SD_SCOPE_TYPE = 'TENANT' and ID_TNT is not null and CD_SCOPE = 'TENANT:' || cast(ID_TNT as varchar))),
    constraint CK_BD_DICT_CAT_DICTIONARY_CA_1 check (ID_DICT_CAT_PARENT is null or ID_DICT_CAT_PARENT <> ID_DICT_CAT),
    constraint CK_BD_DICT_CAT_DICTIONARY_CA_2 check (SN_SORT >= 0),
    constraint CK_BD_DICT_CAT_DICTIONARY_CA_3 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_BD_DICT_CHG (
    ID_DICT_CHG bigint,
    ID_TNT bigint,
    ID_DICT_DEF_DICT bigint,
    ID_DICT_ITEM bigint,
    SD_CHG_TYPE varchar(32) not null,
    SD_TARGET_TYPE varchar(16) not null,
    JSON_BEFORE text,
    JSON_AFTER text,
    DES_REASON varchar(1000),
    CD_REQ varchar(128) not null,
    DT_CHANGED timestamp with time zone not null,
    ID_USER_CHANGED bigint not null,
    ID_DICT_CAT bigint,
    ID_DICT_ATTR_DEF bigint,
    constraint PK_BD_DICT_CHG_PK primary key (ID_DICT_CHG),
    constraint CK_BD_DICT_CHG_DICTIONARY_CHAN check (JSON_BEFORE is not null or JSON_AFTER is not null)
);

create table RHN_BD_DICT_DEF (
    ID_DICT_DEF bigint,
    REVISION bigint not null default 0,
    SD_SCOPE_TYPE varchar(16) not null,
    CD_SCOPE varchar(80) not null,
    ID_TNT bigint,
    CD_DICT_DEF varchar(64) not null,
    NA_DICT_DEF varchar(200) not null,
    DES_DICT_DEF varchar(1000),
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    FG_SYS_MANAGED boolean default false not null,
    ID_DICT_CAT bigint not null,
    constraint PK_BD_DICT_DEF_PK primary key (ID_DICT_DEF),
    constraint UK_BD_DICT_DEF_DICTIONARY_DEFI unique (CD_SCOPE, CD_DICT_DEF),
    constraint CK_BD_DICT_DEF_DICTIONARY_DEFI check ((SD_SCOPE_TYPE = 'PLATFORM' and ID_TNT is null and CD_SCOPE = 'PLATFORM') or
        (SD_SCOPE_TYPE = 'TENANT' and ID_TNT is not null)),
    constraint CK_BD_DICT_DEF_DICTIONARY_DE_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_BD_DICT_ITEM (
    ID_DICT_ITEM bigint,
    ID_DICT_DEF_DICT bigint not null,
    CD_DICT_ITEM varchar(128) not null,
    NA_DICT_ITEM varchar(300) not null,
    DES_DICT_ITEM varchar(1000),
    SN_SORT integer not null,
    SD_STATUS varchar(32) not null,
    constraint PK_BD_DICT_ITEM_PK primary key (ID_DICT_ITEM),
    constraint UK_BD_DICT_ITEM_DICTIONARY_ITE unique (ID_DICT_DEF_DICT, CD_DICT_ITEM),
    constraint CK_BD_DICT_ITEM_DICTIONARY_ITE check (SN_SORT >= 0),
    constraint CK_BD_DICT_ITEM_DICTIONARY_I_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_BD_DICT_ITEM_ATTR_VAL (
    ID_DICT_ITEM_ATTR_VAL bigint,
    ID_DICT_ITEM bigint not null,
    ID_DICT_ATTR_DEF bigint not null,
    SD_SCOPE_TYPE varchar(32) not null,
    CD_SCOPE varchar(512) not null,
    ID_TNT bigint,
    ID_ORG bigint,
    ID_DEPT bigint,
    SN_VALUE integer not null,
    SD_VAL_MODE varchar(32) not null,
    FG_BOOLEAN_VAL boolean,
    INTEGER_VALUE bigint,
    DECIMAL_VALUE decimal(28,8),
    TEXT_VALUE varchar(4000),
    CODE_VALUE varchar(256),
    DA_DATE_VAL date,
    DT_DATETIME_VAL timestamp with time zone,
    ID_DICT_ITEM_REFERENCE bigint,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_DICT_ITEM_ATTR_VAL_PK primary key (ID_DICT_ITEM_ATTR_VAL),
    constraint UK_BD_DICT_ITEM_A_DICT_ITEM_AT unique (ID_DICT_ITEM, ID_DICT_ATTR_DEF, CD_SCOPE, SN_VALUE),
    constraint CK_BD_DICT_ITEM_A_DICT_ITEM_AT check ((SD_SCOPE_TYPE = 'PLATFORM' and ID_TNT is null and ID_ORG is null and ID_DEPT is null) or
        (SD_SCOPE_TYPE = 'TENANT' and ID_TNT is not null and ID_ORG is null and ID_DEPT is null) or
        (SD_SCOPE_TYPE = 'ORGANIZATION' and ID_TNT is not null and ID_ORG is not null and ID_DEPT is null) or
        (SD_SCOPE_TYPE = 'DEPARTMENT' and ID_TNT is not null and ID_ORG is not null and ID_DEPT is not null)),
    constraint CK_BD_DICT_ITEM_A_DICT_ITEM__1 check (SN_VALUE >= 0),
    constraint CK_BD_DICT_ITEM_A_DICT_ITEM__2 check (SD_VAL_MODE in ('OVERRIDE', 'EXPLICIT_EMPTY')),
    constraint CK_BD_DICT_ITEM_A_DICT_ITEM__3 check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_BD_DICT_ITEM_A_DICT_ITEM__4 check (SD_VAL_MODE = 'OVERRIDE' or (SN_VALUE = 0 and FG_BOOLEAN_VAL is null and INTEGER_VALUE is null
        and DECIMAL_VALUE is null and TEXT_VALUE is null and CODE_VALUE is null and DA_DATE_VAL is null
        and DT_DATETIME_VAL is null and ID_DICT_ITEM_REFERENCE is null))
);

create table RHN_BD_EXAM_SVC (
    ID_CATALOG_ITEM bigint,
    ID_TNT bigint not null,
    SD_EXAM_TYPE varchar(64),
    FG_BODY_SITE_REQUIRED boolean default false not null,
    FG_MULTI_BODY_SITE boolean default false not null,
    QTY_MAX_BODY_SITE integer,
    DES_PREPARATION_DESCRIPTION varchar(2000),
    REVISION bigint default 0 not null,
    DT_CREATED timestamp with time zone default current_timestamp not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone default current_timestamp not null,
    ID_USER_UPDATED bigint,
    SD_SITE_PRICING_MODE varchar(32) default 'SINGLE' not null,
    QTY_INCLUDED_SITE integer default 1 not null,
    PRICE_ADDL_SITE decimal(24,6),
    ID_CATALOG_ITEM_ADDL_SITE bigint,
    QTY_ADDL_SITE decimal(28,8) default 1 not null,
    QTY_MAX_CHARGEABLE_SITE integer,
    constraint PK_BD_EXAM_SVC_PK primary key (ID_CATALOG_ITEM),
    constraint UK_BD_EXAM_SVC_EXAM_SERVICE_TE unique (ID_TNT, ID_CATALOG_ITEM),
    constraint CK_BD_EXAM_SVC_EXAM_BODY_SITE_ check (QTY_MAX_BODY_SITE is null or
        (QTY_MAX_BODY_SITE = 1 and FG_MULTI_BODY_SITE = false) or
        (QTY_MAX_BODY_SITE > 1 and FG_MULTI_BODY_SITE = true)),
    constraint CK_BD_EXAM_SVC_EXAM_SITE_PRICI check (SD_SITE_PRICING_MODE in ('SINGLE', 'PER_SITE', 'BASE_PLUS_FIXED', 'BASE_PLUS_ITEM')),
    constraint CK_BD_EXAM_SVC_EXAM_INCLUDED_S check (QTY_INCLUDED_SITE >= 1),
    constraint CK_BD_EXAM_SVC_EXAM_ADDITIONAL check (PRICE_ADDL_SITE is null or PRICE_ADDL_SITE >= 0),
    constraint CK_BD_EXAM_SVC_EXAM_ADDITION_1 check (QTY_ADDL_SITE > 0),
    constraint CK_BD_EXAM_SVC_EXAM_CHARGEABLE check (QTY_MAX_CHARGEABLE_SITE is null or QTY_MAX_CHARGEABLE_SITE >= QTY_INCLUDED_SITE)
);

create table RHN_BD_GRID_ADDR_NODE (
    ID_GRID_ADDR_NODE bigint,
    REVISION bigint default 0 not null,
    ID_GRID_ADDR_NODE_PARENT bigint,
    CD_LEVEL varchar(16) not null,
    CD_GRID_ADDR_NODE varchar(12) not null,
    NA_GRID_ADDR_NODE varchar(120) not null,
    NA_SHORT varchar(120),
    CD_PINYIN varchar(64) not null,
    DES_FULL_PATH varchar(500) not null,
    SN_SORT integer default 0 not null,
    SD_STATUS varchar(16) default 'ACTIVE' not null,
    FG_SYS_MANAGED boolean default false not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    constraint PK_BD_GRID_ADDR_NODE_PK primary key (ID_GRID_ADDR_NODE),
    constraint UK_BD_GRID_ADDR_N_GRID_ADDRESS unique (CD_GRID_ADDR_NODE),
    constraint UK_BD_GRID_ADDR_N_GRID_ADDRE_1 unique (ID_GRID_ADDR_NODE_PARENT, NA_GRID_ADDR_NODE),
    constraint CK_BD_GRID_ADDR_N_GRID_ADDRESS check (CD_LEVEL in ('PROVINCE', 'CITY', 'COUNTY', 'STREET', 'COMMUNITY')),
    constraint CK_BD_GRID_ADDR_N_GRID_ADDRE_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_BD_GRID_ADDR_N_GRID_ADDRE_2 check (char_length(CD_GRID_ADDR_NODE) = 12),
    constraint CK_BD_GRID_ADDR_N_GRID_ADDRE_3 check (SN_SORT >= 0),
    constraint CK_BD_GRID_ADDR_N_GRID_ADDRE_4 check (ID_GRID_ADDR_NODE_PARENT is null or ID_GRID_ADDR_NODE_PARENT <> ID_GRID_ADDR_NODE)
);

create table RHN_BD_IMPORT_BATCH (
    ID_IMPORT_BATCH bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    SD_IMPORT_TYPE varchar(32) not null,
    NA_FILE varchar(300) not null,
    HASH_FILE varchar(64) not null,
    CD_REQ varchar(128) not null,
    SD_STATUS varchar(32) not null,
    QTY_TOTAL_ROW integer default 0 not null,
    QTY_READY_ROW integer default 0 not null,
    QTY_INVALID_ROW integer default 0 not null,
    QTY_IMPORTED_ROW integer default 0 not null,
    QTY_FAILED_ROW integer default 0 not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_IMPORT_BATCH_PK primary key (ID_IMPORT_BATCH),
    constraint UK_BD_IMPORT_BATC_MD_IMPORT_BA unique (ID_TNT, CD_REQ),
    constraint UK_BD_IMPORT_BATC_MD_IMPORT__1 unique (ID_TNT, ID_IMPORT_BATCH),
    constraint CK_BD_IMPORT_BATC_MD_IMPORT_BA check (SD_IMPORT_TYPE in ('SERVICE', 'MEDICATION')),
    constraint CK_BD_IMPORT_BATC_MD_IMPORT__1 check (SD_STATUS in (
        'PREFLIGHTING', 'READY', 'INVALID', 'IMPORTING', 'PARTIAL', 'COMPLETED', 'CANCELLED'
    )),
    constraint CK_BD_IMPORT_BATC_MD_IMPORT__2 check (QTY_TOTAL_ROW >= 0 and QTY_READY_ROW >= 0 and QTY_INVALID_ROW >= 0 and
        QTY_IMPORTED_ROW >= 0 and QTY_FAILED_ROW >= 0)
);

create table RHN_BD_IMPORT_ROW (
    ID_IMPORT_ROW bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_IMPORT_BATCH bigint not null,
    CD_ROW_NUMBER integer not null,
    CD_SRC_KEY varchar(128),
    JSON_SRC text not null,
    JSON_NORMALIZED text,
    JSON_ERRORS text not null,
    SD_STATUS varchar(32) not null,
    ID_TARGET bigint,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_IMPORT_ROW_PK primary key (ID_IMPORT_ROW),
    constraint UK_BD_IMPORT_ROW_MD_IMPORT_ROW unique (ID_IMPORT_BATCH, CD_ROW_NUMBER),
    constraint CK_BD_IMPORT_ROW_MD_IMPORT_ROW check (SD_STATUS in ('READY', 'INVALID', 'IMPORTED', 'FAILED')),
    constraint CK_BD_IMPORT_ROW_MD_IMPORT_R_1 check ((SD_STATUS = 'IMPORTED' and ID_TARGET is not null) or
        (SD_STATUS <> 'IMPORTED' and ID_TARGET is null))
);

create table RHN_BD_ITEM_ALIAS (
    ID_ITEM_ALIAS bigint,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint not null,
    SD_ALIAS_TYPE varchar(32) not null,
    NA_ALIAS varchar(300) not null,
    CD_PINYIN varchar(128),
    CD_WUBI varchar(128),
    CD_MNEMONIC varchar(128),
    FG_PRIMARY_ALIAS boolean default false not null,
    SD_STATUS varchar(32) not null,
    constraint PK_BD_ITEM_ALIAS_PK primary key (ID_ITEM_ALIAS),
    constraint UK_BD_ITEM_ALIAS_ITEM_ALIAS unique (ID_TNT, ID_CATALOG_ITEM, SD_ALIAS_TYPE, NA_ALIAS)
);

create table RHN_BD_ITEM_ATTR_CHG (
    ID_ITEM_ATTR_CHG bigint,
    ID_TNT bigint,
    ID_ITEM_ATTR_DEF bigint not null,
    ID_ITEM_TYPE bigint,
    ID_ITEM_TYPE_ATTR bigint,
    ID_ITEM_ATTR_SUBJECT bigint,
    ID_ITEM_ATTR_VAL bigint,
    ID_ITEM_ATTR_OVRD bigint,
    SD_TARGET_TYPE varchar(32) not null,
    SD_CHG_TYPE varchar(32) not null,
    CD_SCOPE_KEY varchar(512),
    JSON_BEFORE text,
    JSON_AFTER text,
    DES_CHG_REASON varchar(1000) not null,
    CD_REQ varchar(128) not null,
    DT_CHANGED timestamp with time zone not null,
    ID_USER_CHANGED bigint not null,
    constraint PK_BD_ITEM_ATTR_CHG_PK primary key (ID_ITEM_ATTR_CHG),
    constraint UK_BD_ITEM_ATTR_C_ITEM_ATTR_CH unique (CD_REQ),
    constraint CK_BD_ITEM_ATTR_C_ITEM_ATTR_CH check (SD_TARGET_TYPE in ('DEFINITION', 'TYPE_ASSIGNMENT', 'BASE_VALUE', 'SCOPE_OVERRIDE')),
    constraint CK_BD_ITEM_ATTR_C_ITEM_ATTR__1 check (SD_CHG_TYPE in ('CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'RESET', 'ROLLBACK'))
);

create table RHN_BD_ITEM_ATTR_DEF (
    ID_ITEM_ATTR_DEF bigint,
    REVISION bigint default 0 not null,
    SD_SCOPE_TYPE varchar(16) not null,
    CD_SCOPE varchar(80) not null,
    ID_TNT bigint,
    CD_ITEM_ATTR_DEF varchar(128) not null,
    NA_ITEM_ATTR_DEF varchar(200) not null,
    DES_ITEM_ATTR_DEF varchar(1000) not null,
    SD_DATA_TYPE varchar(32) not null,
    SD_CARDINALITY varchar(16) not null,
    ID_DICT_DEF_DICT bigint,
    CD_UNIT varchar(64),
    JSON_SCHEMA text not null,
    JSON_DEFAULT text,
    SD_VARIABILITY varchar(32) not null,
    SD_OVRD_POLICY varchar(32) not null,
    JSON_ALLOWED_SCOPE text not null,
    SD_CONTEXT_BASIS varchar(32) not null,
    SD_STORAGE_MODE varchar(16) not null,
    PROJECTION_FIELD varchar(256),
    ID_VALIDATION_RULE bigint,
    SENSITIVITY varchar(32) not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_ATTR_DEF_PK primary key (ID_ITEM_ATTR_DEF),
    constraint UK_BD_ITEM_ATTR_D_ITEM_ATTR_DE unique (CD_SCOPE, CD_ITEM_ATTR_DEF),
    constraint UK_BD_ITEM_ATTR_D_ITEM_ATTR__1 unique (ID_TNT, ID_ITEM_ATTR_DEF),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR_DE check ((SD_SCOPE_TYPE = 'PLATFORM' and CD_SCOPE = 'PLATFORM' and ID_TNT is null) or
        (SD_SCOPE_TYPE = 'TENANT' and ID_TNT is not null)),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR__1 check (SD_DATA_TYPE in (
        'BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT', 'ENUM', 'DATE', 'DATETIME',
        'DURATION', 'DICT_REF', 'TERM_REF', 'OBJECT'
    )),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR__2 check (SD_CARDINALITY in ('SINGLE', 'MULTIPLE')),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR__3 check (SD_VARIABILITY in ('BASE_ONLY', 'SCOPE_OVERRIDE', 'LOCAL_ONLY')),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR__4 check (SD_OVRD_POLICY in ('ANY', 'RESTRICTIVE_ONLY', 'NO_OVERRIDE')),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR__5 check (SD_CONTEXT_BASIS in ('NONE', 'ORDERING', 'EXECUTING', 'DISPENSING', 'STOCKING')),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR__6 check ((SD_STORAGE_MODE = 'EXTENSION' and PROJECTION_FIELD is null) or
        (SD_STORAGE_MODE = 'PROJECTED' and PROJECTION_FIELD is not null)),
    constraint CK_BD_ITEM_ATTR_D_ITEM_ATTR__7 check ((SD_VARIABILITY = 'SCOPE_OVERRIDE' and SD_OVRD_POLICY <> 'NO_OVERRIDE') or
        (SD_VARIABILITY <> 'SCOPE_OVERRIDE' and SD_OVRD_POLICY = 'NO_OVERRIDE'))
);

create table RHN_BD_ITEM_ATTR_OVRD (
    ID_ITEM_ATTR_OVRD bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ITEM_ATTR_SUBJECT bigint not null,
    ID_ITEM_ATTR_DEF bigint not null,
    SD_SCOPE_TYPE varchar(32) not null,
    CD_SCOPE_KEY varchar(512) not null,
    ID_ORG bigint,
    ID_DEPT bigint,
    SD_VAL_MODE varchar(32) not null,
    JSON_VAL text,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_ATTR_OVRD_PK primary key (ID_ITEM_ATTR_OVRD),
    constraint UK_BD_ITEM_ATTR_O_ITEM_ATTR_OV unique (ID_TNT, ID_ITEM_ATTR_SUBJECT, ID_ITEM_ATTR_DEF, CD_SCOPE_KEY, DA_VALID_FROM),
    constraint CK_BD_ITEM_ATTR_O_ITEM_ATTR_OV check ((SD_SCOPE_TYPE = 'TENANT' and ID_ORG is null and ID_DEPT is null) or
        (SD_SCOPE_TYPE = 'ORGANIZATION' and ID_ORG is not null and ID_DEPT is null) or
        (SD_SCOPE_TYPE = 'DEPARTMENT' and ID_ORG is not null and ID_DEPT is not null)),
    constraint CK_BD_ITEM_ATTR_O_ITEM_ATTR__1 check ((SD_VAL_MODE = 'OVERRIDE' and JSON_VAL is not null) or
        (SD_VAL_MODE = 'EXPLICIT_NULL' and JSON_VAL is null)),
    constraint CK_BD_ITEM_ATTR_O_ITEM_ATTR__2 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_ITEM_ATTR_SUBJECT (
    ID_ITEM_ATTR_SUBJECT bigint,
    ID_TNT bigint,
    SD_SUBJECT_TYPE varchar(32) not null,
    CD_SUBJECT_KEY varchar(256) not null,
    ID_ITEM_MASTER bigint,
    ID_MED bigint,
    ID_CATALOG_ITEM bigint,
    ID_SVC_VAR bigint,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_BD_ITEM_ATTR_SUBJECT_PK primary key (ID_ITEM_ATTR_SUBJECT),
    constraint UK_BD_ITEM_ATTR_S_ITEM_ATTR_SU unique (CD_SUBJECT_KEY),
    constraint UK_BD_ITEM_ATTR_S_ITEM_ATTR__1 unique (ID_TNT, ID_ITEM_ATTR_SUBJECT),
    constraint CK_BD_ITEM_ATTR_S_ITEM_ATTR_SU check ((case when ID_ITEM_MASTER is null then 0 else 1 end) +
        (case when ID_MED is null then 0 else 1 end) +
        (case when ID_CATALOG_ITEM is null then 0 else 1 end) +
        (case when ID_SVC_VAR is null then 0 else 1 end) = 1),
    constraint CK_BD_ITEM_ATTR_S_ITEM_ATTR__1 check ((SD_SUBJECT_TYPE = 'ITEM_MASTER' and ID_TNT is null and ID_ITEM_MASTER is not null) or
        (SD_SUBJECT_TYPE = 'MEDICATION' and ID_TNT is not null and ID_MED is not null) or
        (SD_SUBJECT_TYPE = 'CATALOG_ITEM' and ID_TNT is not null and ID_CATALOG_ITEM is not null) or
        (SD_SUBJECT_TYPE = 'SERVICE_VARIANT' and ID_TNT is not null and ID_SVC_VAR is not null))
);

create table RHN_BD_ITEM_ATTR_VAL (
    ID_ITEM_ATTR_VAL bigint,
    REVISION bigint default 0 not null,
    SD_SCOPE_TYPE varchar(16) not null,
    CD_SCOPE varchar(80) not null,
    ID_TNT bigint,
    ID_ITEM_ATTR_SUBJECT bigint not null,
    ID_ITEM_ATTR_DEF bigint not null,
    JSON_VAL text not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_ATTR_VAL_PK primary key (ID_ITEM_ATTR_VAL),
    constraint UK_BD_ITEM_ATTR_V_ITEM_ATTR_VA unique (CD_SCOPE, ID_ITEM_ATTR_SUBJECT, ID_ITEM_ATTR_DEF, DA_VALID_FROM),
    constraint CK_BD_ITEM_ATTR_V_ITEM_ATTR_VA check ((SD_SCOPE_TYPE = 'PLATFORM' and CD_SCOPE = 'PLATFORM' and ID_TNT is null) or
        (SD_SCOPE_TYPE = 'TENANT' and ID_TNT is not null)),
    constraint CK_BD_ITEM_ATTR_V_ITEM_ATTR__1 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_ITEM_GRP (
    ID_ITEM_GRP bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint,
    ID_DEPT_EXEC bigint,
    CD_ITEM_GRP varchar(64) not null,
    NA_ITEM_GRP varchar(300) not null,
    SD_GRP_TYPE varchar(32) not null,
    SD_USAGE_TYPE varchar(32),
    FG_POINT_OF_CARE boolean default false not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_GRP_PK primary key (ID_ITEM_GRP),
    constraint UK_BD_ITEM_GRP_ITEM_GROUP_TENA unique (ID_TNT, ID_ITEM_GRP),
    constraint UK_BD_ITEM_GRP_ITEM_GROUP_CODE unique (ID_TNT, ID_ORG, CD_ITEM_GRP),
    constraint CK_BD_ITEM_GRP_ITEM_GROUP_TYPE check (SD_GRP_TYPE in ('LIS', 'PACS', 'ORDER_SET', 'PACKAGE')),
    constraint CK_BD_ITEM_GRP_ITEM_GROUP_PERI check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_ITEM_GRP_MEMBER (
    ID_ITEM_GRP_MEMBER bigint,
    ID_TNT bigint not null,
    ID_ITEM_GRP bigint not null,
    ID_CATALOG_ITEM bigint not null,
    SN_SORT integer not null,
    QTY_MEMBER decimal(28,8) not null,
    CD_UNIT varchar(64),
    FG_REQUIRED_MEMBER boolean default true not null,
    DES_MEMBER_DESCRIPTION varchar(1000),
    constraint PK_BD_ITEM_GRP_MEMBER_PK primary key (ID_ITEM_GRP_MEMBER),
    constraint UK_BD_ITEM_GRP_ME_ITEM_GROUP_M unique (ID_TNT, ID_ITEM_GRP, ID_CATALOG_ITEM),
    constraint UK_BD_ITEM_GRP_ME_ITEM_GROUP_1 unique (ID_TNT, ID_ITEM_GRP, SN_SORT),
    constraint CK_BD_ITEM_GRP_ME_ITEM_GROUP_M check (QTY_MEMBER > 0)
);

create table RHN_BD_ITEM_MASTER (
    ID_ITEM_MASTER bigint,
    REVISION bigint default 0 not null,
    ID_ITEM_TYPE bigint not null,
    CD_ITEM_MASTER varchar(128) not null,
    NA_ITEM_MASTER varchar(300) not null,
    SD_SUBJECT_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_MASTER_PK primary key (ID_ITEM_MASTER),
    constraint UK_BD_ITEM_MASTER_ITEM_MASTER_ unique (CD_ITEM_MASTER, DA_VALID_FROM),
    constraint CK_BD_ITEM_MASTER_ITEM_MASTER_ check (SD_SUBJECT_TYPE in ('MEDICATION', 'CATALOG_ITEM')),
    constraint CK_BD_ITEM_MASTER_ITEM_MASTE_1 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_ITEM_PKG (
    ID_ITEM_PKG bigint,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_ITEM_PKG_BASE bigint,
    CD_UNIT varchar(64) not null,
    NA_UNIT varchar(160) not null,
    PACKAGE_SPEC varchar(300),
    QTY_FACTOR decimal(28,8) not null,
    SD_USAGE_TYPE varchar(32),
    CD_BARCODE varchar(256),
    FG_DEFAULT_PURCH boolean default false not null,
    FG_DEFAULT_SALE boolean default false not null,
    FG_DEFAULT_DISP boolean default false not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    constraint PK_BD_ITEM_PKG_PK primary key (ID_ITEM_PKG),
    constraint UK_BD_ITEM_PKG_ITEM_PACKAGE_TE unique (ID_TNT, ID_ITEM_PKG),
    constraint UK_BD_ITEM_PKG_ITEM_PACKAGE_UN unique (ID_TNT, ID_CATALOG_ITEM, CD_UNIT, DA_VALID_FROM),
    constraint CK_BD_ITEM_PKG_ITEM_PACKAGE_FA check (QTY_FACTOR > 0),
    constraint CK_BD_ITEM_PKG_ITEM_PACKAGE_PE check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_ITEM_TERM_MAP (
    ID_ITEM_TERM_MAP bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ITEM_ATTR_SUBJECT bigint not null,
    ID_CONCEPT bigint not null,
    SD_MAP_TYPE varchar(32) not null,
    SD_EQUIVALENCE varchar(24) not null,
    FG_PRIMARY_MAP boolean default false not null,
    DES_LIMITATION varchar(2000),
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(24) not null,
    ID_ITEM_TERM_MAP_REPLACES bigint,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_TERM_MAP_PK primary key (ID_ITEM_TERM_MAP),
    constraint UK_BD_ITEM_TERM_M_ITEM_TERM_MA unique (ID_TNT, ID_ITEM_TERM_MAP),
    constraint UK_BD_ITEM_TERM_M_ITEM_TERM__1 unique (ID_TNT, ID_ITEM_ATTR_SUBJECT, ID_CONCEPT, SD_MAP_TYPE, DA_VALID_FROM),
    constraint CK_BD_ITEM_TERM_M_ITEM_TERM_MA check (SD_MAP_TYPE in (
        'CLINICAL', 'INSURANCE', 'REGULATORY', 'LOCAL'
    )),
    constraint CK_BD_ITEM_TERM_M_ITEM_TERM__1 check (SD_EQUIVALENCE in (
        'EXACT', 'EQUIVALENT', 'WIDER', 'NARROWER', 'RELATED'
    )),
    constraint CK_BD_ITEM_TERM_M_ITEM_TERM__2 check (SD_STATUS in (
        'ACTIVE', 'SUSPENDED', 'RETIRED', 'SUPERSEDED'
    )),
    constraint CK_BD_ITEM_TERM_M_ITEM_TERM__3 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_BD_ITEM_TERM_M_ITEM_TERM__4 check (ID_ITEM_TERM_MAP_REPLACES is null or ID_ITEM_TERM_MAP_REPLACES <> ID_ITEM_TERM_MAP)
);

create table RHN_BD_ITEM_TYPE (
    ID_ITEM_TYPE bigint,
    REVISION bigint default 0 not null,
    SD_SCOPE_TYPE varchar(16) not null,
    CD_SCOPE varchar(80) not null,
    ID_TNT bigint,
    ID_ITEM_TYPE_PARENT bigint,
    CD_ITEM_TYPE varchar(128) not null,
    NA_ITEM_TYPE varchar(200) not null,
    DES_ITEM_TYPE varchar(1000),
    SD_SUBJECT_TYPE varchar(32) not null,
    SN_SORT integer not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_TYPE_PK primary key (ID_ITEM_TYPE),
    constraint UK_BD_ITEM_TYPE_ITEM_TYPE_SCOP unique (CD_SCOPE, CD_ITEM_TYPE),
    constraint UK_BD_ITEM_TYPE_ITEM_TYPE_TENA unique (ID_TNT, ID_ITEM_TYPE),
    constraint CK_BD_ITEM_TYPE_ITEM_TYPE_SCOP check ((SD_SCOPE_TYPE = 'PLATFORM' and CD_SCOPE = 'PLATFORM' and ID_TNT is null) or
        (SD_SCOPE_TYPE = 'TENANT' and ID_TNT is not null)),
    constraint CK_BD_ITEM_TYPE_ITEM_TYPE_SUBJ check (SD_SUBJECT_TYPE in ('MEDICATION', 'CATALOG_ITEM'))
);

create table RHN_BD_ITEM_TYPE_ATTR (
    ID_ITEM_TYPE_ATTR bigint,
    REVISION bigint default 0 not null,
    ID_ITEM_TYPE bigint not null,
    ID_ITEM_ATTR_DEF bigint not null,
    FG_REQUIRED_VAL boolean default false not null,
    JSON_DEFAULT text,
    SD_WIDGET_TYPE varchar(32) not null,
    NA_GRP varchar(200),
    SN_GRP_SORT integer not null,
    SN_ATTR_SORT integer not null,
    JSON_VISIBLE_COND text,
    JSON_REQUIRED_COND text,
    FG_SEARCHABLE boolean default false not null,
    FG_LIST_DISPLAY boolean default false not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ITEM_TYPE_ATTR_PK primary key (ID_ITEM_TYPE_ATTR),
    constraint UK_BD_ITEM_TYPE_A_ITEM_TYPE_AT unique (ID_ITEM_TYPE, ID_ITEM_ATTR_DEF)
);

create table RHN_BD_LAB_SVC (
    ID_CATALOG_ITEM bigint,
    ID_TNT bigint not null,
    SD_LAB_METHOD varchar(64),
    QTY_REPORT_DURATION decimal(12,3),
    REPORT_DURATION_UNIT varchar(32),
    FG_FASTING_REQUIRED boolean default false not null,
    FG_POINT_OF_CARE boolean default false not null,
    DES_COLLECTION_DESCRIPTION varchar(2000),
    REVISION bigint default 0 not null,
    DT_CREATED timestamp with time zone default current_timestamp not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone default current_timestamp not null,
    ID_USER_UPDATED bigint,
    constraint PK_BD_LAB_SVC_PK primary key (ID_CATALOG_ITEM),
    constraint UK_BD_LAB_SVC_LAB_SERVICE_TENA unique (ID_TNT, ID_CATALOG_ITEM),
    constraint CK_BD_LAB_SVC_LAB_REPORT_DURAT check (QTY_REPORT_DURATION is null or QTY_REPORT_DURATION > 0)
);

create table RHN_BD_MED (
    ID_MED bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    CD_MED varchar(64) not null,
    NA_MED varchar(300) not null,
    NA_ALIAS varchar(300),
    SD_MED_TYPE varchar(32) not null,
    DOSE_FORM varchar(64),
    PREPARATION_SPEC varchar(300),
    PREPARATION_UNIT varchar(64),
    QTY_STRENGTH_VAL decimal(28,8),
    STRENGTH_UNIT varchar(64),
    SD_STORAGE_TYPE varchar(32),
    FG_PRESCRIPTION_DRUG boolean default false not null,
    FG_ESSENTIAL_DRUG boolean default false not null,
    FG_ANTIMICROBIAL boolean default false not null,
    SD_ANTIMICROBIAL_LEVEL varchar(64),
    FG_SKIN_TEST_REQUIRED boolean default false not null,
    QTY_DEFAULT_DOSE decimal(28,8),
    DEFAULT_DOSE_UNIT varchar(64),
    DEFAULT_ROUTE varchar(64),
    DEFAULT_FREQUENCY varchar(64),
    FG_CHRONIC_DISEASE_DRUG boolean default false not null,
    FG_SINGLE_ORDER boolean default true not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    ID_ITEM_TYPE bigint not null,
    ID_ITEM_MASTER bigint,
    ID_ORDER_FREQ_DEFAULT bigint,
    ID_CONCEPT_DEFAULT_ROUTE bigint,
    constraint PK_BD_MED_PK primary key (ID_MED),
    constraint UK_BD_MED_MEDICATION_TENANT_ID unique (ID_TNT, ID_MED),
    constraint UK_BD_MED_MEDICATION_CODE unique (ID_TNT, CD_MED),
    constraint CK_BD_MED_MEDICATION_DEFAULT_D check ((QTY_DEFAULT_DOSE is null and DEFAULT_DOSE_UNIT is null) or
    (QTY_DEFAULT_DOSE is not null and QTY_DEFAULT_DOSE > 0 and DEFAULT_DOSE_UNIT is not null)),
    constraint CK_BD_MED_MEDICATION_ANTIMICRO check (FG_ANTIMICROBIAL = true or SD_ANTIMICROBIAL_LEVEL is null)
);

create table RHN_BD_MED_HERBAL (
    ID_MED bigint,
    ID_TNT bigint not null,
    ID_DICT_ITEM_MEDICINAL_PART bigint,
    SD_PROCESSING_METHOD varchar(64),
    SD_NATURE_TYPE varchar(64),
    DES_FLAVOR_DESCRIPTION varchar(500),
    DES_MERIDIAN_DESCRIPTION varchar(500),
    DES_DECOCTION_DESCRIPTION varchar(1000),
    FG_SEPARATE_DECOCTION boolean default false not null,
    constraint PK_BD_MED_HERBAL_PK primary key (ID_MED)
);

create table RHN_BD_MED_PRODUCT (
    ID_CATALOG_ITEM bigint,
    ID_TNT bigint not null,
    ID_MED bigint not null,
    ID_MFR bigint not null,
    NA_TRADE varchar(300),
    CD_APPROVAL varchar(128),
    DA_APPROVAL_FROM date,
    DA_APPROVAL_TO date,
    CD_REG varchar(128),
    DA_REG_FROM date,
    DA_REG_TO date,
    CD_PURCH varchar(128),
    SD_MARKET_STATUS varchar(32),
    PRODUCTION_PLACE varchar(32),
    FG_OTC boolean default false not null,
    FG_CENTRAL_PURCH boolean default false not null,
    FG_IMPORT boolean default false not null,
    FG_TRACE_SPLIT_REQUIRED boolean default false not null,
    QTY_SHELF_LIFE_VAL decimal(12,3),
    SHELF_LIFE_UNIT varchar(32),
    DES_INDICATION varchar(4000),
    DES_INSTRUCTION text,
    CD_TRACE varchar(7),
    constraint PK_BD_MED_PRODUCT_PK primary key (ID_CATALOG_ITEM),
    constraint CK_BD_MED_PRODUCT_MED_PRODUCT_ check (DA_REG_TO is null or (DA_REG_FROM is not null and DA_REG_TO >= DA_REG_FROM)),
    constraint CK_BD_MED_PRODUCT_MED_PRODUC_1 check ((QTY_SHELF_LIFE_VAL is null and SHELF_LIFE_UNIT is null) or
    (QTY_SHELF_LIFE_VAL is not null and QTY_SHELF_LIFE_VAL > 0 and SHELF_LIFE_UNIT is not null))
);

create table RHN_BD_MED_ROUTE_PROF (
    ID_CONCEPT bigint,
    SD_EXEC_TYPE varchar(32) not null,
    constraint PK_BD_MED_ROUTE_PROF_PK primary key (ID_CONCEPT),
    constraint CK_BD_MED_ROUTE_P_MED_ROUTE_EX check (SD_EXEC_TYPE in ('NONE', 'ADMINISTRATION', 'INFUSION'))
);

create table RHN_BD_MED_VACCINE (
    ID_MED bigint,
    ID_TNT bigint not null,
    SD_VACCINE_TYPE varchar(64),
    QTY_DOSE_SERIES integer,
    QTY_MIN_AGE decimal(12,3),
    QTY_MAX_AGE decimal(12,3),
    AGE_UNIT varchar(32),
    SD_RECOMMENDED_ROUTE varchar(64),
    FG_COLD_CHAIN_REQUIRED boolean default false not null,
    QTY_MIN_TEMPERATURE decimal(8,3),
    QTY_MAX_TEMPERATURE decimal(8,3),
    IMMUNIZATION_SCHEDULE varchar(2000),
    constraint PK_BD_MED_VACCINE_PK primary key (ID_MED),
    constraint CK_BD_MED_VACCINE_MED_VACCINE_ check (QTY_MAX_AGE is null or (QTY_MIN_AGE is not null and QTY_MAX_AGE >= QTY_MIN_AGE)),
    constraint CK_BD_MED_VACCINE_MED_VACCIN_1 check (QTY_MAX_TEMPERATURE is null or (QTY_MIN_TEMPERATURE is not null and QTY_MAX_TEMPERATURE >= QTY_MIN_TEMPERATURE))
);

create table RHN_BD_MED_WESTERN (
    ID_MED bigint,
    ID_TNT bigint not null,
    ACTIVE_INGREDIENT varchar(2000),
    SD_THERAPEUTIC_CLASS varchar(64),
    FG_BIOLOGIC boolean default false not null,
    FG_BIOSIMILAR boolean default false not null,
    constraint PK_BD_MED_WESTERN_PK primary key (ID_MED)
);

create table RHN_BD_MFR (
    ID_MFR bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    CD_MFR varchar(64) not null,
    NA_MFR varchar(300) not null,
    NA_SHORT varchar(160),
    SD_MFR_TYPE varchar(32) not null,
    PRODUCTION_PLACE varchar(32),
    CD_COUNTRY varchar(32),
    DES_ADDR varchar(1000),
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    constraint PK_BD_MFR_PK primary key (ID_MFR),
    constraint UK_BD_MFR_MANUFACTURER_TENANT_ unique (ID_TNT, ID_MFR),
    constraint UK_BD_MFR_MANUFACTURER_CODE unique (ID_TNT, CD_MFR)
);

create table RHN_BD_ORDER_FREQ (
    ID_ORDER_FREQ bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    CD_ORDER_FREQ varchar(64) not null,
    NA_ORDER_FREQ varchar(160) not null,
    NA_SHORT varchar(64),
    DES_ORDER_FREQ varchar(1000),
    SD_RULE_TYPE varchar(32) not null,
    QTY_FREQ integer,
    QTY_PERIOD_VAL decimal(12,3),
    PERIOD_UNIT varchar(16),
    SD_ANCHOR_TYPE varchar(32) not null,
    DEFAULT_EXECUTION_TIMES varchar(256),
    FG_OP_APPLICABLE boolean default true not null,
    FG_INP_APPLICABLE boolean default true not null,
    FG_EMERGENCY_APPLICABLE boolean default true not null,
    FG_MED_APPLICABLE boolean default true not null,
    FG_TREAT_APPLICABLE boolean default true not null,
    FG_NURS_APPLICABLE boolean default false not null,
    FG_AUTOMATIC_TASK_GEN boolean default true not null,
    SN_SORT integer default 0 not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ORDER_FREQ_PK primary key (ID_ORDER_FREQ),
    constraint UK_BD_ORDER_FREQ_ORDER_FREQ_TE unique (ID_TNT, ID_ORDER_FREQ),
    constraint UK_BD_ORDER_FREQ_ORDER_FREQ_CO unique (ID_TNT, CD_ORDER_FREQ),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ_RU check (SD_RULE_TYPE in ('ONCE', 'TIMES_PER_PERIOD', 'FIXED_INTERVAL', 'CALENDAR', 'PRN', 'CONTINUOUS')),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ_AN check (SD_ANCHOR_TYPE in ('ORDER_START', 'STANDARD_TIME', 'CALENDAR', 'EVENT')),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ_PE check (PERIOD_UNIT is null or PERIOD_UNIT in ('MIN', 'H', 'D', 'WK', 'MO')),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ_ST check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ__1 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ_CO check (QTY_FREQ is null or QTY_FREQ > 0),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ_VA check (QTY_PERIOD_VAL is null or QTY_PERIOD_VAL > 0)
);

create table RHN_BD_ORDER_FREQ_CFG (
    ID_ORDER_FREQ_CFG bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint,
    CD_SCOPE_KEY varchar(96) not null,
    ID_ORDER_FREQ bigint not null,
    CD_LOCAL varchar(64),
    NA_LOCAL varchar(160),
    EXECUTION_TIMES varchar(256),
    SD_FIRST_DAY_POLICY varchar(32) not null,
    FG_ENABLED boolean default true not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_ORDER_FREQ_CFG_PK primary key (ID_ORDER_FREQ_CFG),
    constraint UK_BD_ORDER_FREQ_ORDER_FREQ_CF unique (ID_TNT, ID_ORDER_FREQ_CFG),
    constraint UK_BD_ORDER_FREQ_ORDER_FREQ__1 unique (ID_TNT, CD_SCOPE_KEY, ID_ORDER_FREQ, DA_VALID_FROM),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ_CF check (SD_FIRST_DAY_POLICY in ('REMAINING_SLOTS', 'FULL_SCHEDULE', 'FROM_ORDER_TIME')),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ__2 check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_BD_ORDER_FREQ_ORDER_FREQ__3 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_ORG_CATALOG_ITEM (
    ID_ORG_CATALOG_ITEM bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_DEPT_DEFAULT bigint,
    CD_LOCAL varchar(64),
    NA_LOCAL varchar(300),
    FG_ORDERABLE boolean default false not null,
    FG_EXECUTABLE boolean default false not null,
    FG_CHARGEABLE boolean default false not null,
    FG_PURCHASABLE boolean default false not null,
    FG_STOCKED boolean default false not null,
    FG_DISPENSABLE boolean default false not null,
    FG_RETURNABLE boolean default false not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    ID_ORG_CATALOG_ITEM_REPLACED bigint,
    constraint PK_BD_ORG_CATALOG_ITEM_PK primary key (ID_ORG_CATALOG_ITEM),
    constraint UK_BD_ORG_CATALOG_ORG_ITEM_TEN unique (ID_TNT, ID_ORG_CATALOG_ITEM),
    constraint UK_BD_ORG_CATALOG_ORG_ITEM_PER unique (ID_TNT, ID_ORG, ID_CATALOG_ITEM, DA_VALID_FROM),
    constraint CK_BD_ORG_CATALOG_ORG_ITEM_PER check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_ORG_CONCEPT (
    ID_ORG_CONCEPT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_CONCEPT bigint not null,
    CD_LOCAL varchar(64),
    NA_LOCAL varchar(300),
    FG_SELECTABLE boolean default true not null,
    FG_FREQUENT boolean default false not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    constraint PK_BD_ORG_CONCEPT_PK primary key (ID_ORG_CONCEPT),
    constraint UK_BD_ORG_CONCEPT_ORG_CONCEPT_ unique (ID_TNT, ID_ORG_CONCEPT),
    constraint UK_BD_ORG_CONCEPT_ORG_CONCEP_1 unique (ID_TNT, ID_ORG, ID_CONCEPT, DA_VALID_FROM),
    constraint CK_BD_ORG_CONCEPT_ORG_CONCEPT_ check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_SUPPLY_ITEM (
    ID_CATALOG_ITEM bigint,
    ID_TNT bigint not null,
    CD_UDI_DI varchar(128),
    CD_GENERIC varchar(128),
    NA_GENERIC varchar(300),
    NA_MODEL varchar(300),
    DES_SPEC varchar(500),
    SD_MATERIAL_TYPE varchar(64),
    SD_DEVICE_CLASS varchar(32),
    FG_HIGH_VAL boolean default false not null,
    FG_IMPLANT boolean default false not null,
    FG_INTERVENTION boolean default false not null,
    FG_STERILE boolean default false not null,
    FG_SINGLE_USE boolean default false not null,
    CD_REG varchar(128),
    NA_REG varchar(500),
    NA_REGISTRANT varchar(300),
    DA_REG_FROM date,
    DA_REG_TO date,
    ID_MFR bigint,
    DES_STRUCTURE_DESCRIPTION varchar(4000),
    DES_SCOPE_DESCRIPTION varchar(4000),
    DES_INSTRUCTION text,
    constraint PK_BD_SUPPLY_ITEM_PK primary key (ID_CATALOG_ITEM),
    constraint UK_BD_SUPPLY_ITEM_SUPPLY_TENAN unique (ID_TNT, ID_CATALOG_ITEM),
    constraint UK_BD_SUPPLY_ITEM_SUPPLY_UDI unique (ID_TNT, CD_UDI_DI),
    constraint CK_BD_SUPPLY_ITEM_SUPPLY_REGIS check (DA_REG_TO is null or DA_REG_FROM is null or DA_REG_TO >= DA_REG_FROM),
    constraint CK_BD_SUPPLY_ITEM_SUPPLY_DEVIC check (SD_DEVICE_CLASS is null or SD_DEVICE_CLASS in ('I', 'II', 'III'))
);

create table RHN_BD_SVC_ITEM (
    ID_CATALOG_ITEM bigint,
    ID_TNT bigint not null,
    SD_SVC_TYPE varchar(64) not null,
    SD_SVC_SUBTYPE varchar(64),
    SD_USAGE_TYPE varchar(32) not null,
    FG_MEDICAL_TECHNOLOGY boolean default false not null,
    FG_COMBINATION_ITEM boolean default false not null,
    FG_SINGLE_ORDER boolean default true not null,
    SD_SPEC_TYPE varchar(64),
    SD_EXAM_TYPE varchar(64),
    SD_ACCOUNTING_CAT varchar(64),
    SD_DUPLICATE_RULE varchar(64),
    PRICE_MULTI_SITE decimal(24,6),
    QTY_FREE_SITE integer,
    QTY_MAX_BODY_SITE integer,
    CD_MUTUAL_RECOGNITION varchar(128),
    FG_PREGNANCY_ALERT boolean default false not null,
    DES_ATTENTION varchar(2000),
    DES_EXAM_NOTE varchar(2000),
    constraint PK_BD_SVC_ITEM_PK primary key (ID_CATALOG_ITEM),
    constraint CK_BD_SVC_ITEM_SERVICE_MULTI_S check (PRICE_MULTI_SITE is null or PRICE_MULTI_SITE >= 0),
    constraint CK_BD_SVC_ITEM_SERVICE_SITE_CO check ((QTY_FREE_SITE is null or QTY_FREE_SITE >= 0) and
    (QTY_MAX_BODY_SITE is null or QTY_MAX_BODY_SITE > 0) and
    (QTY_FREE_SITE is null or QTY_MAX_BODY_SITE is null or QTY_FREE_SITE <= QTY_MAX_BODY_SITE))
);

create table RHN_BD_SVC_VAR (
    ID_SVC_VAR bigint,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_CONCEPT_BODY_SITE bigint,
    CD_SVC_VAR varchar(128) not null,
    NA_SVC_VAR varchar(300) not null,
    SD_METHOD_TYPE varchar(64),
    FG_BODY_SITE_REQUIRED boolean default false not null,
    CD_MUTUAL_RECOGNITION varchar(128),
    SN_SORT integer not null,
    SD_STATUS varchar(32) not null,
    REVISION bigint default 0 not null,
    DT_CREATED timestamp with time zone default current_timestamp not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone default current_timestamp not null,
    ID_USER_UPDATED bigint,
    constraint PK_BD_SVC_VAR_PK primary key (ID_SVC_VAR),
    constraint UK_BD_SVC_VAR_SERVICE_VARIANT_ unique (ID_TNT, ID_CATALOG_ITEM, CD_SVC_VAR),
    constraint UK_BD_SVC_VAR_SERVICE_VARIAN_1 unique (ID_TNT, ID_SVC_VAR)
);

create table RHN_BD_UNIT_CONV (
    ID_UNIT_CONV bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint,
    CD_SCOPE varchar(96) not null,
    ID_UNIT_DEF_FROM_UNIT bigint not null,
    ID_UNIT_DEF_TO_UNIT bigint not null,
    FACTOR decimal(28,12) not null,
    OFFSET_VALUE decimal(28,12) default 0 not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_UNIT_CONV_PK primary key (ID_UNIT_CONV),
    constraint UK_BD_UNIT_CONV_UNIT_CONVERSIO unique (ID_TNT, ID_UNIT_CONV),
    constraint UK_BD_UNIT_CONV_UNIT_CONVERS_1 unique (ID_TNT, CD_SCOPE, ID_UNIT_DEF_FROM_UNIT, ID_UNIT_DEF_TO_UNIT, DA_VALID_FROM),
    constraint CK_BD_UNIT_CONV_UNIT_CONVERSIO check ((ID_CATALOG_ITEM is null and CD_SCOPE = 'GLOBAL') or (ID_CATALOG_ITEM is not null and CD_SCOPE <> 'GLOBAL')),
    constraint CK_BD_UNIT_CONV_UNIT_CONVERS_1 check (FACTOR > 0),
    constraint CK_BD_UNIT_CONV_UNIT_CONVERS_2 check (ID_UNIT_DEF_FROM_UNIT <> ID_UNIT_DEF_TO_UNIT),
    constraint CK_BD_UNIT_CONV_UNIT_CONVERS_3 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_BD_UNIT_DEF (
    ID_UNIT_DEF bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    CD_UNIT_DEF varchar(64) not null,
    NA_UNIT_DEF varchar(160) not null,
    SYMBOL varchar(32),
    DIMENSION varchar(32) not null,
    DECIMAL_SCALE integer default 4 not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_BD_UNIT_DEF_PK primary key (ID_UNIT_DEF),
    constraint UK_BD_UNIT_DEF_UNIT_TENANT_ID unique (ID_TNT, ID_UNIT_DEF),
    constraint UK_BD_UNIT_DEF_UNIT_CODE unique (ID_TNT, CD_UNIT_DEF),
    constraint CK_BD_UNIT_DEF_UNIT_DIMENSION check (DIMENSION in ('COUNT', 'MASS', 'VOLUME', 'TIME', 'LENGTH', 'AREA', 'ACTIVITY', 'TEMPERATURE', 'OTHER')),
    constraint CK_BD_UNIT_DEF_UNIT_SCALE check (DECIMAL_SCALE between 0 and 12)
);

create table RHN_BD_VAL_SET (
    ID_VAL_SET bigint,
    SD_SCOPE_TYPE varchar(24) not null,
    ID_SCOPE bigint not null,
    CD_VAL_SET varchar(100) not null,
    NA_VAL_SET varchar(200) not null,
    CD_VER varchar(64) not null,
    SD_STATUS varchar(24) not null,
    DA_EFFECTIVE_FROM date not null,
    DA_EFFECTIVE_TO date,
    DT_CREATED timestamp with time zone not null,
    constraint PK_BD_VAL_SET_PK primary key (ID_VAL_SET),
    constraint UK_BD_VAL_SET_VALUE_SET_VERSIO unique (SD_SCOPE_TYPE, ID_SCOPE, CD_VAL_SET, CD_VER)
);

create table RHN_BD_VAL_SET_MEMBER (
    ID_VAL_SET_MEMBER bigint,
    ID_VAL_SET bigint not null,
    ID_CONCEPT bigint not null,
    SN_SORT integer not null,
    DT_CREATED timestamp with time zone not null,
    constraint PK_BD_VAL_SET_MEMBER_PK primary key (ID_VAL_SET_MEMBER),
    constraint UK_BD_VAL_SET_MEM_VALUE_SET_ME unique (ID_VAL_SET, ID_CONCEPT)
);

create table RHN_BIL_CASHIER_CLOSE (
    ID_CASHIER_CLOSE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_CASHIER_USER bigint not null,
    ID_CASHIER_CLOSE_REVERSES bigint,
    CD_CLOSE_NO varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    CD_TERMINAL varchar(128) not null,
    SD_STATUS varchar(32) not null,
    DT_RANGE_FROM timestamp with time zone not null,
    DT_RANGE_TO timestamp with time zone not null,
    QTY_TXN int not null,
    AMT_EXPECTED decimal(24,6) not null,
    AMT_ACTUAL decimal(24,6) not null,
    AMT_DIFFERENCE decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    DES_DIFFERENCE_REASON varchar(1000),
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CONFIRMED bigint,
    DT_CONFIRMED timestamp with time zone,
    constraint PK_BIL_CASHIER_CLOSE_PK primary key (ID_CASHIER_CLOSE),
    constraint UK_BIL_CASHIER_CL_CASH_CLOSE_T unique (ID_TNT, ID_CASHIER_CLOSE),
    constraint UK_BIL_CASHIER_CL_CASH_CLOSE_N unique (ID_TNT, CD_CLOSE_NO),
    constraint UK_BIL_CASHIER_CL_CASH_CLOSE_C unique (ID_TNT, CD_COMMAND),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_S check (SD_STATUS in ('CALCULATED', 'CONFIRMED', 'REVERSED')),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_R check (DT_RANGE_TO > DT_RANGE_FROM),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_C check (QTY_TXN >= 0),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_D check (AMT_DIFFERENCE = AMT_ACTUAL - AMT_EXPECTED)
);

create table RHN_BIL_CASHIER_CLOSE_EVT (
    ID_CASHIER_CLOSE_EVT bigint,
    ID_TNT bigint not null,
    ID_CASHIER_CLOSE bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    ID_ACTOR bigint not null,
    DES_REASON varchar(1000),
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_BIL_CASHIER_CLOSE_EVT_PK primary key (ID_CASHIER_CLOSE_EVT),
    constraint UK_BIL_CASHIER_CL_CASH_CLOSE_E unique (ID_TNT, ID_CASHIER_CLOSE, CD_COMMAND),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_E check (SD_EVT_TYPE in ('CALCULATE', 'CONFIRM', 'REVERSE'))
);

create table RHN_BIL_CASHIER_CLOSE_ITEM (
    ID_CASHIER_CLOSE_ITEM bigint,
    ID_TNT bigint not null,
    ID_CASHIER_CLOSE bigint not null,
    ID_PAY bigint not null,
    CD_ITEM_NO int not null,
    AMT_ITEM decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    constraint PK_BIL_CASHIER_CLOSE_ITEM_PK primary key (ID_CASHIER_CLOSE_ITEM),
    constraint UK_BIL_CASHIER_CL_CASH_CLOSE_I unique (ID_TNT, ID_CASHIER_CLOSE, CD_ITEM_NO),
    constraint UK_BIL_CASHIER_CL_CASH_CLOSE_P unique (ID_TNT, ID_PAY)
);

create table RHN_BIL_CASHIER_CLOSE_LINE (
    ID_CASHIER_CLOSE_LINE bigint,
    ID_TNT bigint not null,
    ID_CASHIER_CLOSE bigint not null,
    SN_LINE int not null,
    CD_PAY_METHOD varchar(128) not null,
    SD_CLOSE_LINE_TYPE varchar(32) not null,
    QTY_TXN int not null,
    AMT_EXPECTED decimal(24,6) not null,
    AMT_ACTUAL decimal(24,6) not null,
    AMT_DIFFERENCE decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    constraint PK_BIL_CASHIER_CLOSE_LINE_PK primary key (ID_CASHIER_CLOSE_LINE),
    constraint UK_BIL_CASHIER_CL_CASH_CLOSE_L unique (ID_TNT, ID_CASHIER_CLOSE, SN_LINE),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_L check (SD_CLOSE_LINE_TYPE in ('PAYMENT', 'REFUND')),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_1 check (QTY_TXN >= 0),
    constraint CK_BIL_CASHIER_CL_CASH_CLOSE_2 check (AMT_DIFFERENCE = AMT_ACTUAL - AMT_EXPECTED)
);

create table RHN_BIL_CHARGE_ITEM (
    ID_CHARGE_ITEM bigint,
    ID_TNT bigint not null,
    ID_PAT_ACCT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    ID_CARE_REQ bigint,
    ID_CARE_EVT bigint,
    ID_CATALOG_ITEM bigint not null,
    SD_SRC_TYPE varchar(32) not null,
    ID_SRC bigint not null,
    CD_REQ varchar(128) not null,
    SD_STATUS varchar(32) not null,
    QTY_CHARGE decimal(28,8) not null,
    CD_UNIT varchar(64) not null,
    PRICE_UNIT decimal(24,6) not null,
    AMT_TOTAL decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    ID_PRICE bigint,
    SN_PRICE_VER bigint,
    SD_PRICE_TYPE varchar(32),
    CD_ITEM_SNAP varchar(128) not null,
    NA_ITEM_SNAP varchar(300) not null,
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_ENTERED bigint not null,
    ID_CHARGE_ITEM_REVERSES bigint,
    constraint PK_BIL_CHARGE_ITEM_PK primary key (ID_CHARGE_ITEM),
    constraint UK_BIL_CHARGE_ITE_CHARGE_TENAN unique (ID_TNT, ID_CHARGE_ITEM),
    constraint UK_BIL_CHARGE_ITE_CHARGE_SOURC unique (ID_TNT, SD_SRC_TYPE, ID_SRC),
    constraint CK_BIL_CHARGE_ITE_CHARGE_STATU check (SD_STATUS in ('POSTED')),
    constraint CK_BIL_CHARGE_ITE_CHARGE_QUANT check (QTY_CHARGE <> 0),
    constraint CK_BIL_CHARGE_ITE_CHARGE_UNIT_ check (PRICE_UNIT >= 0)
);

create table RHN_BIL_CHARGE_ITEM_COMP (
    ID_CHARGE_ITEM_COMP bigint,
    ID_TNT bigint not null,
    ID_CHARGE_ITEM bigint not null,
    SN_LINE int not null,
    ID_CATALOG_ITEM bigint,
    CD_ITEM_SNAP varchar(128),
    NA_ITEM_SNAP varchar(300) not null,
    CD_BODY_SITE varchar(64),
    QTY_COMPONENT decimal(28,8) not null,
    CD_UNIT varchar(64),
    UNIT_FACTOR decimal(28,8),
    PRICE_UNIT decimal(24,6) not null,
    AMT_COMPONENT decimal(24,6) not null,
    constraint PK_BIL_CHARGE_ITEM_COMP_PK primary key (ID_CHARGE_ITEM_COMP),
    constraint UK_BIL_CHARGE_ITE_CHARGE_COMP_ unique (ID_TNT, ID_CHARGE_ITEM, SN_LINE),
    constraint CK_BIL_CHARGE_ITE_CHARGE_COMP_ check (QTY_COMPONENT <> 0),
    constraint CK_BIL_CHARGE_ITE_CHARGE_COM_1 check (PRICE_UNIT >= 0),
    constraint CK_BIL_CHARGE_ITE_CHARGE_COM_2 check ((QTY_COMPONENT > 0 and AMT_COMPONENT >= 0) or (QTY_COMPONENT < 0 and AMT_COMPONENT <= 0))
);

create table RHN_BIL_INVOICE (
    ID_INVOICE bigint,
    ID_TNT bigint not null,
    ID_PAT_ACCT bigint not null,
    CD_INVOICE_NO varchar(64) not null,
    SD_INVOICE_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    CD_CURRENCY varchar(3) not null,
    AMT_GROSS decimal(24,6) not null,
    AMT_DISCOUNT decimal(24,6) not null,
    AMT_NET decimal(24,6) not null,
    DT_ISSUED timestamp with time zone not null,
    ID_USER_ISSUED bigint not null,
    DT_CANCELLED timestamp with time zone,
    DES_CANCELLATION_REASON varchar(1000),
    constraint PK_BIL_INVOICE_PK primary key (ID_INVOICE),
    constraint UK_BIL_INVOICE_INVOICE_TENANT_ unique (ID_TNT, ID_INVOICE),
    constraint UK_BIL_INVOICE_INVOICE_NO unique (ID_TNT, CD_INVOICE_NO),
    constraint CK_BIL_INVOICE_INVOICE_TYPE check (SD_INVOICE_TYPE in ('STANDARD', 'CREDIT')),
    constraint CK_BIL_INVOICE_INVOICE_STATUS check (SD_STATUS in ('ISSUED', 'CANCELLED')),
    constraint CK_BIL_INVOICE_INVOICE_DISCOUN check (AMT_DISCOUNT >= 0),
    constraint CK_BIL_INVOICE_INVOICE_AMOUNT check ((SD_INVOICE_TYPE = 'STANDARD' and AMT_GROSS >= 0 and AMT_NET >= 0)
        or (SD_INVOICE_TYPE = 'CREDIT' and AMT_GROSS < 0 and AMT_NET < 0))
);

create table RHN_BIL_INVOICE_CAT_SUM (
    ID_INVOICE_CAT_SUM bigint,
    ID_TNT bigint not null,
    ID_INVOICE bigint not null,
    CD_CAT varchar(64) not null,
    NA_CAT_SNAP varchar(300),
    AMT_CATEGORY decimal(24,6) not null,
    constraint PK_BIL_INVOICE_CAT_SUM_PK primary key (ID_INVOICE_CAT_SUM),
    constraint UK_BIL_INVOICE_CA_INVOICE_CAT unique (ID_TNT, ID_INVOICE, CD_CAT),
    constraint CK_BIL_INVOICE_CA_INVOICE_CAT_ check (AMT_CATEGORY = AMT_CATEGORY)
);

create table RHN_BIL_INVOICE_LINE (
    ID_INVOICE_LINE bigint,
    ID_TNT bigint not null,
    ID_INVOICE bigint not null,
    ID_CHARGE_ITEM bigint not null,
    SN_LINE int not null,
    AMT_LINE decimal(24,6) not null,
    constraint PK_BIL_INVOICE_LINE_PK primary key (ID_INVOICE_LINE),
    constraint UK_BIL_INVOICE_LI_INVOICE_LINE unique (ID_TNT, ID_INVOICE, SN_LINE),
    constraint UK_BIL_INVOICE_LI_INVOICE_LI_1 unique (ID_TNT, ID_CHARGE_ITEM),
    constraint CK_BIL_INVOICE_LI_INVOICE_LINE check (AMT_LINE = AMT_LINE)
);

create table RHN_BIL_LEDGER_ENTRY (
    ID_LEDGER_ENTRY bigint,
    ID_TNT bigint not null,
    ID_PAT_ACCT bigint not null,
    SD_ENTRY_TYPE varchar(32) not null,
    SD_DIRECTION varchar(8) not null,
    AMT_ENTRY decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    ID_CHARGE_ITEM bigint,
    ID_INVOICE bigint,
    ID_PAY bigint,
    ID_LEDGER_ENTRY_REVERSES bigint,
    DT_OCCURRED timestamp with time zone not null,
    DT_RECORDED timestamp with time zone not null,
    ID_USER_RECORDED bigint not null,
    ID_CLAIM_RESP bigint,
    constraint PK_BIL_LEDGER_ENTRY_PK primary key (ID_LEDGER_ENTRY),
    constraint UK_BIL_LEDGER_ENT_LEDGER_TENAN unique (ID_TNT, ID_LEDGER_ENTRY),
    constraint UK_BIL_LEDGER_ENT_LEDGER_CHARG unique (ID_TNT, ID_CHARGE_ITEM),
    constraint UK_BIL_LEDGER_ENT_LEDGER_PAYME unique (ID_TNT, ID_PAY),
    constraint CK_BIL_LEDGER_ENT_LEDGER_DIREC check (SD_DIRECTION in ('DEBIT', 'CREDIT')),
    constraint CK_BIL_LEDGER_ENT_LEDGER_AMOUN check (AMT_ENTRY > 0)
);

create table RHN_BIL_PAT_ACCT (
    ID_PAT_ACCT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    SD_ACCT_TYPE varchar(32) not null,
    CD_CURRENCY varchar(3) not null,
    SD_STATUS varchar(32) not null,
    DT_OPENED timestamp with time zone not null,
    DT_CLOSED timestamp with time zone,
    constraint PK_BIL_PAT_ACCT_PK primary key (ID_PAT_ACCT),
    constraint UK_BIL_PAT_ACCT_PAT_ACCT_TENAN unique (ID_TNT, ID_PAT_ACCT),
    constraint UK_BIL_PAT_ACCT_PAT_ACCT_ENC_C unique (ID_TNT, ID_ENC, CD_CURRENCY),
    constraint CK_BIL_PAT_ACCT_PAT_ACCT_STATU check (SD_STATUS in ('OPEN', 'SETTLED', 'CLOSED'))
);

create table RHN_BIL_PAY (
    ID_PAY bigint,
    ID_TNT bigint not null,
    ID_PAT_ACCT bigint not null,
    ID_INVOICE bigint,
    CD_PAY_NO varchar(64) not null,
    SD_PAY_TYPE varchar(32) not null,
    CD_PAY_METHOD varchar(64) not null,
    SD_STATUS varchar(32) not null,
    AMT_PAYMENT decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    DT_PAID timestamp with time zone not null,
    CD_EXT_TXN_NO varchar(128),
    ID_PAY_REVERSES bigint,
    ID_USER_ENTERED bigint not null,
    DES_PAY varchar(1000),
    ID_PAY_ORDER bigint,
    CD_PAY_SCENE varchar(128),
    constraint PK_BIL_PAY_PK primary key (ID_PAY),
    constraint UK_BIL_PAY_PAYMENT_TENANT_ID unique (ID_TNT, ID_PAY),
    constraint UK_BIL_PAY_PAYMENT_NO unique (ID_TNT, CD_PAY_NO),
    constraint UK_BIL_PAY_PAYMENT_ORDER_FACT unique (ID_TNT, ID_PAY_ORDER),
    constraint CK_BIL_PAY_PAYMENT_TYPE check (SD_PAY_TYPE in ('PAYMENT', 'REFUND')),
    constraint CK_BIL_PAY_PAYMENT_STATUS check (SD_STATUS in ('COMPLETED')),
    constraint CK_BIL_PAY_PAYMENT_AMOUNT check (AMT_PAYMENT > 0),
    constraint CK_BIL_PAY_PAYMENT_REVERSAL check ((SD_PAY_TYPE = 'PAYMENT' and ID_PAY_REVERSES is null)
        or (SD_PAY_TYPE = 'REFUND' and ID_PAY_REVERSES is not null))
);

create table RHN_BIL_PAY_EVT (
    ID_PAY_EVT bigint,
    ID_TNT bigint not null,
    ID_PAY_ORDER bigint not null,
    ID_EXT_MSG bigint,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    CD_EXT_TXN_NO varchar(128),
    AMT_EVT decimal(24,6),
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    ID_ACTOR bigint,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_BIL_PAY_EVT_PK primary key (ID_PAY_EVT),
    constraint UK_BIL_PAY_EVT_PAY_EVENT_COMMA unique (ID_TNT, ID_PAY_ORDER, CD_COMMAND),
    constraint CK_BIL_PAY_EVT_PAY_EVENT_TYPE check (SD_EVT_TYPE in (
        'CREATE', 'SUBMIT', 'CALLBACK', 'QUERY', 'CAPTURE', 'PARTIAL_CAPTURE',
        'FAIL', 'CANCEL', 'EXPIRE', 'REFUND_REQUEST', 'REFUND_CALLBACK')),
    constraint CK_BIL_PAY_EVT_PAY_EVENT_AMOUN check (AMT_EVT is null or AMT_EVT > 0)
);

create table RHN_BIL_PAY_ORDER (
    ID_PAY_ORDER bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT_ACCT bigint not null,
    ID_INVOICE bigint not null,
    ID_PAY_ORIGINAL bigint,
    CD_ORDER_NO varchar(128) not null,
    CD_IDEMP_KEY varchar(128) not null,
    SD_BUSINESS_SCENE varchar(32) not null,
    CD_PAY_SCENE varchar(128) not null,
    CD_PAY_METHOD varchar(128) not null,
    NA_PAY_METHOD_SNAP varchar(300) not null,
    SD_ORDER_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    AMT_REQUESTED decimal(24,6) not null,
    AMT_CAPTURED decimal(24,6) not null,
    AMT_REFUNDED decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    CD_EXT_ORDER_NO varchar(128),
    ID_CORRELATION varchar(128),
    CD_TERMINAL varchar(128),
    DT_EXPIRES timestamp with time zone,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    constraint PK_BIL_PAY_ORDER_PK primary key (ID_PAY_ORDER),
    constraint UK_BIL_PAY_ORDER_PAY_ORDER_TEN unique (ID_TNT, ID_PAY_ORDER),
    constraint UK_BIL_PAY_ORDER_PAY_ORDER_NO unique (ID_TNT, CD_ORDER_NO),
    constraint UK_BIL_PAY_ORDER_PAY_ORDER_IDE unique (ID_TNT, CD_IDEMP_KEY),
    constraint CK_BIL_PAY_ORDER_PAY_ORDER_TYP check (SD_ORDER_TYPE in ('SETTLEMENT_PAY', 'REFUND', 'PREPAY_TOPUP', 'PREPAY_REFUND')),
    constraint CK_BIL_PAY_ORDER_PAY_ORDER_STA check (SD_STATUS in (
        'CREATED', 'PENDING', 'PROCESSING', 'PARTIAL', 'SUCCEEDED', 'FAILED',
        'CANCELLED', 'EXPIRED', 'REFUNDING', 'REFUNDED')),
    constraint CK_BIL_PAY_ORDER_PAY_ORDER_AMO check (AMT_REQUESTED > 0 and AMT_CAPTURED >= 0 and AMT_REFUNDED >= 0
        and ((SD_ORDER_TYPE <> 'REFUND' and AMT_CAPTURED <= AMT_REQUESTED and AMT_REFUNDED <= AMT_CAPTURED)
          or (SD_ORDER_TYPE = 'REFUND' and AMT_CAPTURED = 0 and AMT_REFUNDED <= AMT_REQUESTED)))
);

create table RHN_BIL_RCPT (
    ID_RCPT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STL bigint not null,
    ID_RCPT_REVERSES bigint,
    CD_RCPT_NO varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    SD_RCPT_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    CD_FISCAL_AUTHORITY varchar(128),
    CD_FISCAL varchar(128),
    CD_FISCAL_NUMBER varchar(128),
    CD_VERIFICATION varchar(256),
    CONTROLLED_OBJECT_REFERENCE varchar(512),
    AMT_RCPT decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    SD_ISSUE_CHANNEL varchar(32) not null,
    NA_PAYER_SNAP varchar(300),
    HASH_PAYER_IDENTITY varchar(256),
    ID_CORRELATION varchar(128),
    ID_USER_CREATED bigint,
    DT_CREATED timestamp with time zone not null,
    DT_ISSUED timestamp with time zone,
    DT_UPDATED timestamp with time zone not null,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    CD_EXT_RCPT_NO varchar(128),
    constraint PK_BIL_RCPT_PK primary key (ID_RCPT),
    constraint UK_BIL_RCPT_RECEIPT_TENANT_ID unique (ID_TNT, ID_RCPT),
    constraint UK_BIL_RCPT_RECEIPT_NO unique (ID_TNT, CD_RCPT_NO),
    constraint UK_BIL_RCPT_RECEIPT_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint UK_BIL_RCPT_RECEIPT_FISCAL unique (ID_TNT, CD_FISCAL_AUTHORITY, CD_FISCAL, CD_FISCAL_NUMBER),
    constraint CK_BIL_RCPT_RECEIPT_TYPE check (SD_RCPT_TYPE in ('MEDICAL_E_INVOICE', 'PAPER_INVOICE', 'RECEIPT', 'VIRTUAL')),
    constraint CK_BIL_RCPT_RECEIPT_STATUS check (SD_STATUS in ('REQUESTED', 'ISSUED', 'FAILED', 'VOIDED', 'RED_FLUSHED')),
    constraint CK_BIL_RCPT_RECEIPT_CHANNEL check (SD_ISSUE_CHANNEL in ('CASHIER', 'SELF_SERVICE', 'MOBILE', 'ONLINE'))
);

create table RHN_BIL_RCPT_EVT (
    ID_RCPT_EVT bigint,
    ID_TNT bigint not null,
    ID_RCPT bigint not null,
    ID_EXT_MSG bigint,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    ID_ACTOR bigint,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    DT_OCCURRED timestamp with time zone not null,
    DES_ACTION_REASON varchar(500),
    constraint PK_BIL_RCPT_EVT_PK primary key (ID_RCPT_EVT),
    constraint UK_BIL_RCPT_EVT_RECEIPT_EVENT_ unique (ID_TNT, ID_RCPT, CD_COMMAND),
    constraint CK_BIL_RCPT_EVT_RECEIPT_EVENT_ check (SD_EVT_TYPE in ('REQUEST', 'ISSUE', 'PRINT', 'DELIVER', 'FAIL', 'VOID', 'RED_FLUSH'))
);

create table RHN_BIL_RECON_BATCH (
    ID_RECON_BATCH bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_EXT_MSG bigint,
    CD_BATCH_NO varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    SD_RECON_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    CD_SRC varchar(128) not null,
    CD_PAY_METHOD varchar(128),
    CD_EXT_BATCH_NO varchar(128),
    DA_BUSINESS date not null,
    QTY_LOCAL int not null,
    QTY_EXT int not null,
    QTY_DIFFERENCE int not null,
    AMT_LOCAL decimal(24,6) not null,
    AMT_EXT decimal(24,6) not null,
    AMT_DIFFERENCE decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_COMPLETED bigint,
    DT_COMPLETED timestamp with time zone,
    constraint PK_BIL_RECON_BATCH_PK primary key (ID_RECON_BATCH),
    constraint UK_BIL_RECON_BATC_RECON_BATCH_ unique (ID_TNT, ID_RECON_BATCH),
    constraint UK_BIL_RECON_BATC_RECON_BATC_1 unique (ID_TNT, CD_BATCH_NO),
    constraint UK_BIL_RECON_BATC_RECON_BATC_2 unique (ID_TNT, CD_COMMAND),
    constraint UK_BIL_RECON_BATC_RECON_BATC_3 unique (ID_TNT, ID_ORG, SD_RECON_TYPE, CD_SRC, DA_BUSINESS, CD_CURRENCY),
    constraint CK_BIL_RECON_BATC_RECON_BATCH_ check (SD_RECON_TYPE in ('PAYMENT_CHANNEL', 'CASHIER_CLOSE', 'FINANCIAL_RECEIPT')),
    constraint CK_BIL_RECON_BATC_RECON_BATC_1 check (SD_STATUS in ('IMPORTED', 'MATCHED', 'DIFFERENCE', 'RESOLVED', 'FAILED')),
    constraint CK_BIL_RECON_BATC_RECON_BATC_2 check (QTY_LOCAL >= 0 and QTY_EXT >= 0 and QTY_DIFFERENCE >= 0)
);

create table RHN_BIL_RECON_ITEM (
    ID_RECON_ITEM bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_RECON_BATCH bigint not null,
    ID_PAY bigint,
    ID_CASHIER_CLOSE bigint,
    ID_RCPT bigint,
    CD_EXT_TXN_NO varchar(128),
    SD_MATCH_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    AMT_LOCAL decimal(24,6) not null,
    AMT_EXT decimal(24,6) not null,
    AMT_DIFFERENCE decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    ID_OWNER bigint,
    ID_USER_RESOLVED bigint,
    DT_RESOLVED timestamp with time zone,
    DES_RESOLUTION varchar(2000),
    constraint PK_BIL_RECON_ITEM_PK primary key (ID_RECON_ITEM),
    constraint UK_BIL_RECON_ITEM_RECON_ITEM_T unique (ID_TNT, ID_RECON_ITEM),
    constraint CK_BIL_RECON_ITEM_RECON_ITEM_M check (SD_MATCH_TYPE in ('MATCHED', 'LOCAL_ONLY', 'EXTERNAL_ONLY', 'AMOUNT_DIFFERENCE', 'STATUS_DIFFERENCE', 'DUPLICATE')),
    constraint CK_BIL_RECON_ITEM_RECON_ITEM_S check (SD_STATUS in ('OPEN', 'RESOLVED', 'IGNORED')),
    constraint CK_BIL_RECON_ITEM_RECON_ITEM_D check (AMT_DIFFERENCE = AMT_EXT - AMT_LOCAL)
);

create table RHN_BIL_RECON_ITEM_EVT (
    ID_RECON_ITEM_EVT bigint,
    ID_TNT bigint not null,
    ID_RECON_ITEM bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    ID_ACTOR bigint,
    DES_REASON varchar(2000),
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_BIL_RECON_ITEM_EVT_PK primary key (ID_RECON_ITEM_EVT),
    constraint UK_BIL_RECON_ITEM_RECON_EVENT_ unique (ID_TNT, ID_RECON_ITEM, CD_COMMAND),
    constraint CK_BIL_RECON_ITEM_RECON_EVENT_ check (SD_EVT_TYPE in ('DETECT', 'RESOLVE', 'IGNORE', 'REOPEN'))
);

create table RHN_BIL_REG_BIL_INTENT (
    ID_REG_BIL_INTENT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_SVC_SCHED bigint,
    ID_CATALOG_ITEM bigint,
    ID_SCHED_SLOT_HOLD bigint,
    ID_PAT_ACCT bigint,
    ID_STL bigint,
    ID_PAY_ORDER bigint,
    ID_ENC bigint,
    CD_IDEMP varchar(128) not null,
    SD_REG_SRC varchar(32) not null,
    SD_VISIT_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    AMT_FEE decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    CD_ITEM_SNAP varchar(128),
    NA_ITEM_SNAP varchar(300),
    DT_EXPIRES timestamp with time zone,
    QTY_COMP_ATTEMPTS integer default 0 not null,
    CD_LAST_ERROR varchar(64),
    DES_LAST_ERROR_MSG varchar(2000),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    DT_COMPLETED timestamp with time zone,
    ID_APPT bigint,
    SD_STL_MODE varchar(32) default 'SELF_PAY' not null,
    ID_PAT_COVER bigint,
    CD_COVER_TYPE_SNAP varchar(64),
    NA_COVER_PAYER_SNAP varchar(200),
    constraint PK_BIL_REG_BIL_INTENT_PK primary key (ID_REG_BIL_INTENT),
    constraint UK_BIL_REG_BIL_IN_REG_BILL_TEN unique (ID_TNT, ID_REG_BIL_INTENT),
    constraint UK_BIL_REG_BIL_IN_REG_BILL_COM unique (ID_TNT, CD_IDEMP),
    constraint UK_BIL_REG_BIL_IN_REG_BILL_HOL unique (ID_TNT, ID_SCHED_SLOT_HOLD),
    constraint UK_BIL_REG_BIL_IN_REG_BILL_ACC unique (ID_TNT, ID_PAT_ACCT),
    constraint UK_BIL_REG_BIL_IN_REG_BILL_SET unique (ID_TNT, ID_STL),
    constraint UK_BIL_REG_BIL_IN_REG_BILL_PAY unique (ID_TNT, ID_PAY_ORDER),
    constraint CK_BIL_REG_BIL_IN_REG_BILL_SOU check (SD_REG_SRC in ('WINDOW', 'WALK_IN', 'DIRECT', 'EMERGENCY')),
    constraint CK_BIL_REG_BIL_IN_REG_BILL_VIS check (SD_VISIT_TYPE in ('GENERAL', 'FOLLOW_UP', 'EMERGENCY')),
    constraint CK_BIL_REG_BIL_IN_REG_BILL_FEE check (AMT_FEE >= 0),
    constraint CK_BIL_REG_BIL_IN_REG_BILL_ATT check (QTY_COMP_ATTEMPTS >= 0),
    constraint CK_BIL_REG_BIL_IN_REG_BILL_FIN check ((AMT_FEE = 0 and ID_PAT_ACCT is null and ID_STL is null)
        or (AMT_FEE > 0 and ID_PAT_ACCT is not null and ID_STL is not null)),
    constraint CK_BIL_REG_BIL_IN_REG_BILL_SET check (SD_STL_MODE in ('SELF_PAY', 'MEDICAL_INSURANCE')),
    constraint CK_BIL_REG_BIL_IN_REG_BILL_COV check ((SD_STL_MODE = 'SELF_PAY' and ID_PAT_COVER is null
        and CD_COVER_TYPE_SNAP is null and NA_COVER_PAYER_SNAP is null)
    or (SD_STL_MODE = 'MEDICAL_INSURANCE' and ID_PAT_COVER is not null
        and CD_COVER_TYPE_SNAP is not null and NA_COVER_PAYER_SNAP is not null))
);

create table RHN_BIL_STL (
    ID_STL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT_ACCT bigint not null,
    ID_STL_REVERSES bigint,
    ID_INVOICE_LEGACY bigint,
    CD_STL_NO varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    SD_STL_TYPE varchar(32) not null,
    SD_STL_SCENE varchar(32) not null,
    SD_TERMINAL_SCENE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    AMT_GROSS decimal(24,6) not null,
    AMT_DISCOUNT decimal(24,6) not null,
    AMT_INS decimal(24,6) not null,
    AMT_PAT decimal(24,6) not null,
    AMT_OTHER decimal(24,6) not null,
    AMT_ROUNDING decimal(24,6) not null,
    AMT_NET decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    CD_TERMINAL varchar(128),
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_FINALIZED bigint,
    DT_FINALIZED timestamp with time zone,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    constraint PK_BIL_STL_PK primary key (ID_STL),
    constraint UK_BIL_STL_SETTLEMENT_TENANT_I unique (ID_TNT, ID_STL),
    constraint UK_BIL_STL_SETTLEMENT_NO unique (ID_TNT, CD_STL_NO),
    constraint UK_BIL_STL_SETTLEMENT_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint UK_BIL_STL_SETTLEMENT_INVOICE unique (ID_TNT, ID_INVOICE_LEGACY),
    constraint CK_BIL_STL_SETTLEMENT_TYPE check (SD_STL_TYPE in ('NORMAL', 'REVERSAL', 'SUPPLEMENT')),
    constraint CK_BIL_STL_SETTLEMENT_SCENE check (SD_STL_SCENE in ('REGISTRATION', 'OUTPATIENT', 'INPATIENT', 'HOME_BED', 'PHARMACY')),
    constraint CK_BIL_STL_SETTLEMENT_TERMINAL check (SD_TERMINAL_SCENE in ('CASHIER', 'DOCTOR_STATION', 'SELF_SERVICE', 'MOBILE', 'ONLINE')),
    constraint CK_BIL_STL_SETTLEMENT_STATUS check (SD_STATUS in ('DRAFT', 'PRICED', 'PAYMENT_PENDING', 'PARTIAL', 'SETTLED', 'REVERSING', 'REVERSED', 'FAILED')),
    constraint CK_BIL_STL_SETTLEMENT_AMOUNTS check (AMT_DISCOUNT >= 0 and AMT_INS >= 0 and AMT_PAT >= 0 and AMT_OTHER >= 0
        and ((SD_STL_TYPE <> 'REVERSAL' and AMT_GROSS >= 0 and AMT_NET >= 0)
          or (SD_STL_TYPE = 'REVERSAL' and AMT_GROSS <= 0 and AMT_NET <= 0)))
);

create table RHN_BIL_STL_CAT_SUM (
    ID_STL_CAT_SUM bigint,
    ID_TNT bigint not null,
    ID_STL bigint not null,
    CD_CAT varchar(64) not null,
    NA_CAT_SNAP varchar(300),
    AMT_CAT decimal(24,6) not null,
    DT_AS_OF timestamp with time zone not null,
    constraint PK_BIL_STL_CAT_SUM_PK primary key (ID_STL_CAT_SUM),
    constraint UK_BIL_STL_CAT_SUM_STL_CAT unique (ID_TNT, ID_STL, CD_CAT)
);

create table RHN_BIL_STL_EVT (
    ID_STL_EVT bigint,
    ID_TNT bigint not null,
    ID_STL bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    ID_ACTOR bigint,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_BIL_STL_EVT_PK primary key (ID_STL_EVT),
    constraint UK_BIL_STL_EVT_STL_EVENT_COMMA unique (ID_TNT, ID_STL, CD_COMMAND),
    constraint CK_BIL_STL_EVT_STL_EVENT_TYPE check (SD_EVT_TYPE in ('CREATE', 'PRICE', 'REQUEST_PAYMENT', 'PARTIAL_PAY', 'FINALIZE', 'REVERSE_REQUEST', 'REVERSE_COMPLETE', 'FAIL'))
);

create table RHN_BIL_STL_LINE (
    ID_STL_LINE bigint,
    ID_TNT bigint not null,
    ID_STL bigint not null,
    ID_CHARGE_ITEM bigint not null,
    ID_INVOICE_LINE_LEGACY bigint,
    SN_LINE integer not null,
    QTY_SETTLED decimal(28,8) not null,
    AMT_GROSS decimal(24,6) not null,
    AMT_DISCOUNT decimal(24,6) not null,
    AMT_INS decimal(24,6) not null,
    AMT_PAT decimal(24,6) not null,
    AMT_OTHER decimal(24,6) not null,
    AMT_NET decimal(24,6) not null,
    constraint PK_BIL_STL_LINE_PK primary key (ID_STL_LINE),
    constraint UK_BIL_STL_LINE_STL_LINE_ORDER unique (ID_TNT, ID_STL, SN_LINE),
    constraint UK_BIL_STL_LINE_STL_LINE_CHARG unique (ID_TNT, ID_STL, ID_CHARGE_ITEM),
    constraint UK_BIL_STL_LINE_STL_LINE_INVOI unique (ID_INVOICE_LINE_LEGACY),
    constraint UK_BIL_STL_LINE_STL_LINE_TENAN unique (ID_TNT, ID_STL_LINE),
    constraint CK_BIL_STL_LINE_STL_LINE_QUANT check (QTY_SETTLED <> 0)
);

create table RHN_BIL_STL_TENDER (
    ID_STL_TENDER bigint,
    ID_TNT bigint not null,
    ID_STL bigint not null,
    ID_PAY bigint,
    ID_CLAIM_RESP bigint,
    SN_LINE integer not null,
    SD_TENDER_TYPE varchar(32) not null,
    CD_PAYER varchar(128),
    NA_PAYER_SNAP varchar(300),
    AMT_TENDER decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    constraint PK_BIL_STL_TENDER_PK primary key (ID_STL_TENDER),
    constraint UK_BIL_STL_TENDER_STL_TENDER_O unique (ID_TNT, ID_STL, SN_LINE),
    constraint UK_BIL_STL_TENDER_STL_TENDER_P unique (ID_TNT, ID_PAY),
    constraint CK_BIL_STL_TENDER_STL_TENDER_T check (SD_TENDER_TYPE in ('CASH', 'BANK_CARD', 'DIGITAL', 'INSURANCE_FUND', 'PERSONAL_ACCOUNT', 'COMMERCIAL_INSURANCE', 'PREPAYMENT', 'HOSPITAL_DISCOUNT', 'SUBSIDY', 'ROUNDING')),
    constraint CK_BIL_STL_TENDER_STL_TENDER_A check (AMT_TENDER <> 0)
);

create table RHN_EX_CARE_REQ (
    ID_CARE_REQ bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    CD_REQ_NO varchar(64) not null,
    SD_REQ_KIND varchar(32) not null,
    SD_STATUS varchar(32) not null,
    CD_INTENT varchar(32) not null,
    CD_PRIORITY varchar(32) not null,
    ID_CATALOG_ITEM bigint,
    ID_ITEM_PKG bigint,
    ID_ORG_PERFORMER bigint not null,
    ID_DEPT_PERFORMER bigint not null,
    DA_BUSINESS date not null,
    DT_AUTHORED timestamp with time zone not null,
    ID_USER_AUTHORED bigint not null,
    DES_REASON varchar(1000),
    DT_CANCELLED timestamp with time zone,
    ID_USER_CANCELLED bigint,
    DES_CANCEL_REASON varchar(1000),
    CD_ITEM_SNAP varchar(128) not null,
    NA_ITEM_SNAP varchar(300) not null,
    CD_UNIT_SNAP varchar(64) not null,
    CD_LOCAL_SNAP varchar(64),
    NA_LOCAL_SNAP varchar(300),
    ID_ORG_CATALOG_ITEM_ADOPTION bigint,
    SN_ADOPTION_VER bigint,
    ID_CATALOG_PRICE bigint,
    SN_PRICE_VER bigint,
    SD_PRICE_TYPE varchar(32),
    PRICE_UNIT decimal(24,6),
    AMT_TOTAL decimal(24,6),
    CD_CURRENCY varchar(16),
    JSON_ITEM_ATTR_SNAP text not null,
    HASH_ITEM_ATTR varchar(64) not null,
    DT_ITEM_ATTR_RESOLVED timestamp with time zone not null,
    JSON_STD_MAP_SNAP text not null,
    ID_REQ_GRP bigint,
    ID_CARE_REQ_PARENT bigint,
    constraint PK_EX_CARE_REQ_PK primary key (ID_CARE_REQ),
    constraint UK_EX_CARE_REQ_CARE_REQUEST_TE unique (ID_TNT, ID_CARE_REQ),
    constraint UK_EX_CARE_REQ_CARE_REQUEST_NO unique (ID_TNT, CD_REQ_NO),
    constraint CK_EX_CARE_REQ_CARE_REQUEST_KI check (SD_REQ_KIND in ('SERVICE', 'MEDICATION', 'REFERRAL', 'CARE_ACTIVITY')),
    constraint CK_EX_CARE_REQ_CARE_REQUEST_PR check ((ID_CATALOG_PRICE is null and SN_PRICE_VER is null and SD_PRICE_TYPE is null and PRICE_UNIT is null
            and AMT_TOTAL is null and CD_CURRENCY is null) or
        (ID_CATALOG_PRICE is not null and SN_PRICE_VER is not null and SD_PRICE_TYPE is not null and PRICE_UNIT is not null
            and AMT_TOTAL is not null and CD_CURRENCY is not null)),
    constraint CK_EX_CARE_REQ_CARE_REQ_STATUS check (SD_STATUS in ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'))
);

create table RHN_EX_DIAG_EXEC_TASK (
    ID_DIAG_EXEC_TASK bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_CARE_REQ bigint not null,
    ID_STL bigint,
    ID_DIAG_REPORT bigint,
    CD_TASK_NO varchar(64) not null,
    SD_REQ_TYPE varchar(32) not null,
    CD_ITEM_SNAP varchar(128) not null,
    NA_ITEM_SNAP varchar(300) not null,
    SD_SPEC_TYPE_SNAP varchar(64),
    SD_EXAM_TYPE_SNAP varchar(64),
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    DT_COLLECTED timestamp with time zone,
    ID_USER_COLLECTED bigint,
    CD_SPEC_NO varchar(64),
    DES_COLLECTION_NOTE varchar(1000),
    DT_STARTED timestamp with time zone,
    ID_USER_STARTED bigint,
    DT_COMPLETED timestamp with time zone,
    ID_USER_COMPLETED bigint,
    DES_COMP_NOTE varchar(1000),
    DT_CANCELLED timestamp with time zone,
    DES_EXCEPT_NOTE varchar(1000),
    constraint PK_EX_DIAG_EXEC_TASK_PK primary key (ID_DIAG_EXEC_TASK),
    constraint UK_EX_DIAG_EXEC_T_DIAG_TASK_TE unique (ID_TNT, ID_DIAG_EXEC_TASK),
    constraint UK_EX_DIAG_EXEC_T_DIAG_TASK_RE unique (ID_TNT, ID_CARE_REQ),
    constraint UK_EX_DIAG_EXEC_T_DIAG_TASK_NO unique (ID_TNT, CD_TASK_NO),
    constraint CK_EX_DIAG_EXEC_T_DIAG_TASK_TY check (SD_REQ_TYPE in ('LABORATORY', 'EXAMINATION')),
    constraint CK_EX_DIAG_EXEC_T_DIAG_TASK_ST check (SD_STATUS in (
        'WAITING_SETTLEMENT', 'READY', 'COLLECTED', 'IN_PROGRESS',
        'COMPLETED', 'CANCELLED', 'EXCEPTION'
    )),
    constraint CK_EX_DIAG_EXEC_T_DIAG_TASK_CO check ((DT_COLLECTED is null and ID_USER_COLLECTED is null and CD_SPEC_NO is null) or
        (SD_REQ_TYPE = 'LABORATORY' and DT_COLLECTED is not null and ID_USER_COLLECTED is not null and CD_SPEC_NO is not null))
);

create table RHN_EX_DIAG_REPORT (
    ID_DIAG_REPORT bigint,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_CARE_REQ bigint not null,
    CD_ENDPOINT varchar(64) not null,
    ID_EXT_REPORT varchar(128) not null,
    SN_REPORT_VER int not null,
    ID_DIAG_REPORT_REPLACES bigint,
    SD_REPORT_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    CD_REPORT varchar(128) not null,
    NA_REPORT varchar(300) not null,
    DT_ISSUED timestamp with time zone not null,
    DT_RECEIVED timestamp with time zone not null,
    DES_CONCLUSION text,
    CD_AUTHOR varchar(64),
    NA_AUTHOR varchar(100),
    CONTENT_DIGEST_ALGORITHM varchar(32) not null,
    HASH_CONTENT varchar(128) not null,
    ID_EXT_MSG_INBOUND bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_EX_DIAG_REPORT_PK primary key (ID_DIAG_REPORT),
    constraint UK_EX_DIAG_REPORT_DIAGNOSTIC_R unique (ID_TNT, ID_DIAG_REPORT),
    constraint UK_EX_DIAG_REPORT_DIAGNOSTIC_1 unique (ID_TNT, CD_ENDPOINT, ID_EXT_REPORT, SN_REPORT_VER),
    constraint CK_EX_DIAG_REPORT_DIAGNOSTIC_R check (SN_REPORT_VER > 0),
    constraint CK_EX_DIAG_REPORT_DIAGNOSTIC_1 check (SD_REPORT_TYPE in ('LABORATORY', 'IMAGING')),
    constraint CK_EX_DIAG_REPORT_DIAGNOSTIC_2 check (SD_STATUS in ('PRELIMINARY', 'FINAL', 'CORRECTED', 'CANCELLED')),
    constraint CK_EX_DIAG_REPORT_DIAGNOSTIC_3 check ((SN_REPORT_VER = 1 and ID_DIAG_REPORT_REPLACES is null) or
        (SN_REPORT_VER > 1 and ID_DIAG_REPORT_REPLACES is not null))
);

create table RHN_EX_DIAG_REPORT_RESULT (
    ID_TNT bigint not null,
    ID_DIAG_REPORT bigint not null,
    ID_OBS bigint not null,
    SN_SORT int not null,
    constraint PK_EX_DIAG_REPORT_RESULT_PK primary key (ID_TNT, ID_DIAG_REPORT, ID_OBS),
    constraint UK_EX_DIAG_REPORT_REPORT_RESUL unique (ID_TNT, ID_DIAG_REPORT, SN_SORT),
    constraint CK_EX_DIAG_REPORT_REPORT_RESUL check (SN_SORT > 0)
);

create table RHN_EX_EXAM_ATTACH_ITEM (
    ID_EXAM_ATTACH_ITEM bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_CATALOG_ITEM_ATTACH bigint not null,
    SD_TRIGGER_TYPE varchar(32) not null,
    QTY_BASIS varchar(32) not null,
    QTY_ATTACH decimal(28,8) not null,
    FG_REQUIRED_ATTACH boolean default false not null,
    FG_SEPARATELY_CHARGEABLE boolean default true not null,
    SN_SORT integer not null,
    DES_EXAM_ATTACH_ITEM varchar(1000),
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_EX_EXAM_ATTACH_ITEM_PK primary key (ID_EXAM_ATTACH_ITEM),
    constraint UK_EX_EXAM_ATTACH_EXAM_ATTACHM unique (ID_TNT, ID_EXAM_ATTACH_ITEM),
    constraint UK_EX_EXAM_ATTACH_EXAM_ATTAC_1 unique (ID_TNT, ID_CATALOG_ITEM, ID_CATALOG_ITEM_ATTACH),
    constraint UK_EX_EXAM_ATTACH_EXAM_ATTAC_2 unique (ID_TNT, ID_CATALOG_ITEM, SN_SORT),
    constraint CK_EX_EXAM_ATTACH_EXAM_ATTACHM check (SD_TRIGGER_TYPE in ('ALWAYS', 'OPTIONAL', 'MULTI_SITE')),
    constraint CK_EX_EXAM_ATTACH_EXAM_ATTAC_1 check (QTY_BASIS in ('FIXED', 'PER_SITE', 'PER_EXTRA_SITE')),
    constraint CK_EX_EXAM_ATTACH_EXAM_ATTAC_2 check (QTY_ATTACH > 0),
    constraint CK_EX_EXAM_ATTACH_EXAM_ATTAC_3 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_EX_INP_ORDER_EVT (
    ID_INP_ORDER_EVT bigint,
    ID_TNT bigint not null,
    ID_CARE_REQ bigint not null,
    ID_INP_ORDER_TASK bigint,
    SD_EVT_TYPE varchar(32) not null,
    SD_ORDER_STATUS_FROM varchar(32),
    SD_ORDER_STATUS_TO varchar(32),
    SD_TASK_STATUS_FROM varchar(32),
    SD_TASK_STATUS_TO varchar(32),
    CD_COMMAND varchar(128) not null,
    DES_REASON varchar(1000),
    ID_ACTOR bigint not null,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_EX_INP_ORDER_EVT_PK primary key (ID_INP_ORDER_EVT),
    constraint UK_EX_INP_ORDER_E_IP_EVT_TENAN unique (ID_TNT, ID_INP_ORDER_EVT),
    constraint UK_EX_INP_ORDER_E_IP_EVT_COMMA unique (ID_TNT, CD_COMMAND),
    constraint CK_EX_INP_ORDER_E_IP_EVT_TYPE check (SD_EVT_TYPE in (
        'ORDER_CREATED', 'ORDER_SIGNED', 'ORDER_VERIFIED', 'TASKS_PLANNED',
        'TASK_EXECUTED', 'TASK_SKIPPED', 'ORDER_STOPPED'
    ))
);

create table RHN_EX_INP_ORDER_TASK (
    ID_INP_ORDER_TASK bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_CARE_REQ bigint not null,
    CD_OCCURRENCE_NO integer not null,
    DT_SCHEDULED timestamp with time zone not null,
    SD_STATUS varchar(32) not null,
    CD_OUTCOME varchar(64),
    DES_EXEC_NOTE varchar(1000),
    DT_COMPLETED timestamp with time zone,
    ID_USER_COMPLETED bigint,
    DT_CANCELLED timestamp with time zone,
    DES_CANCEL_REASON varchar(1000),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_EX_INP_ORDER_TASK_PK primary key (ID_INP_ORDER_TASK),
    constraint UK_EX_INP_ORDER_T_IP_TASK_TENA unique (ID_TNT, ID_INP_ORDER_TASK),
    constraint UK_EX_INP_ORDER_T_IP_TASK_OCCU unique (ID_TNT, ID_CARE_REQ, CD_OCCURRENCE_NO),
    constraint UK_EX_INP_ORDER_T_IP_TASK_SCHE unique (ID_TNT, ID_CARE_REQ, DT_SCHEDULED),
    constraint UK_EX_INP_ORDER_T_IP_TASK_ID_R unique (ID_TNT, ID_INP_ORDER_TASK, ID_CARE_REQ),
    constraint CK_EX_INP_ORDER_T_IP_TASK_OCCU check (CD_OCCURRENCE_NO > 0),
    constraint CK_EX_INP_ORDER_T_IP_TASK_STAT check (SD_STATUS in ('PLANNED', 'EXECUTED', 'SKIPPED', 'CANCELLED'))
);

create table RHN_EX_INP_ORDER_WF (
    ID_CARE_REQ bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_CARE_EPISODE bigint not null,
    SD_DURATION_TYPE varchar(32) not null,
    SD_WF_STATUS varchar(32) not null,
    ID_AUTHORED_PRACT bigint,
    ID_USER_SIGNED bigint,
    DT_SIGNED timestamp with time zone,
    ID_USER_VERIFIED bigint,
    DT_VERIFIED timestamp with time zone,
    ID_USER_STOPPED bigint,
    DT_STOPPED timestamp with time zone,
    DES_STOP_REASON varchar(1000),
    ID_USER_UPDATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    QTY_MED_PER_OCC decimal(28,8),
    MEDICATION_QUANTITY_UNIT varchar(64),
    QTY_MED_BASE_PER_OCC decimal(28,8),
    MEDICATION_BASE_UNIT varchar(64),
    constraint PK_EX_INP_ORDER_WF_PK primary key (ID_CARE_REQ),
    constraint UK_EX_INP_ORDER_W_IP_WF_TENANT unique (ID_TNT, ID_CARE_REQ),
    constraint CK_EX_INP_ORDER_W_IP_WF_DURATI check (SD_DURATION_TYPE in ('LONG_TERM', 'TEMPORARY')),
    constraint CK_EX_INP_ORDER_W_IP_WF_STATUS check (SD_WF_STATUS in ('DRAFT', 'SIGNED', 'ACTIVE', 'COMPLETED', 'STOPPED')),
    constraint CK_EX_INP_ORDER_W_IP_WF_MED_SU check ((QTY_MED_PER_OCC is null and MEDICATION_QUANTITY_UNIT is null
        and QTY_MED_BASE_PER_OCC is null and MEDICATION_BASE_UNIT is null)
    or (QTY_MED_PER_OCC > 0 and MEDICATION_QUANTITY_UNIT is not null
        and QTY_MED_BASE_PER_OCC > 0 and MEDICATION_BASE_UNIT is not null))
);

create table RHN_EX_LAB_SVC_SPEC (
    ID_LAB_SVC_SPEC bigint,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_DICT_ITEM_SPEC bigint not null,
    ID_DICT_ITEM_CONTAINER bigint,
    QTY_MINIMUM decimal(28,8),
    MINIMUM_QUANTITY_UNIT varchar(64),
    FG_DEFAULT_SPEC boolean default false not null,
    FG_REQUIRED_SPEC boolean default true not null,
    SN_SORT integer not null,
    DES_COLLECTION_DESCRIPTION varchar(2000),
    SD_STATUS varchar(32) not null,
    REVISION bigint default 0 not null,
    DT_CREATED timestamp with time zone default current_timestamp not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone default current_timestamp not null,
    ID_USER_UPDATED bigint,
    CD_TUBE_GRP varchar(64),
    SD_TUBE_SHARING_MODE varchar(32) default 'SEPARATE' not null,
    QTY_BASE_TUBE integer default 1 not null,
    QTY_MAX_TEST_PER_TUBE integer,
    SD_TUBE_CHARGE_MODE varchar(32) default 'NONE' not null,
    ID_CATALOG_ITEM_TUBE_CHARGE bigint,
    QTY_INCLUDED_TUBE integer default 0 not null,
    QTY_TUBE_CHARGE decimal(28,8) default 1 not null,
    constraint PK_EX_LAB_SVC_SPEC_PK primary key (ID_LAB_SVC_SPEC),
    constraint UK_EX_LAB_SVC_SPE_LAB_SPECIMEN unique (ID_TNT, ID_CATALOG_ITEM, ID_DICT_ITEM_SPEC),
    constraint UK_EX_LAB_SVC_SPE_LAB_SPECIM_1 unique (ID_TNT, ID_CATALOG_ITEM, SN_SORT),
    constraint CK_EX_LAB_SVC_SPE_LAB_SPECIMEN check (QTY_MINIMUM is null or QTY_MINIMUM > 0),
    constraint CK_EX_LAB_SVC_SPE_LAB_TUBE_SHA check (SD_TUBE_SHARING_MODE in ('SEPARATE', 'SHARE', 'BY_TEST_COUNT')),
    constraint CK_EX_LAB_SVC_SPE_LAB_BASE_TUB check (QTY_BASE_TUBE > 0),
    constraint CK_EX_LAB_SVC_SPE_LAB_MAX_TEST check (QTY_MAX_TEST_PER_TUBE is null or QTY_MAX_TEST_PER_TUBE > 0),
    constraint CK_EX_LAB_SVC_SPE_LAB_TUBE_CHA check (SD_TUBE_CHARGE_MODE in ('NONE', 'PER_TUBE', 'EXCESS_TUBE')),
    constraint CK_EX_LAB_SVC_SPE_LAB_INCLUDED check (QTY_INCLUDED_TUBE >= 0),
    constraint CK_EX_LAB_SVC_SPE_LAB_TUBE_C_1 check (QTY_TUBE_CHARGE > 0)
);

create table RHN_EX_MED_REQ (
    ID_CARE_REQ bigint,
    ID_TNT bigint not null,
    ID_MED bigint not null,
    QTY_DOSE_VAL decimal(28,8),
    DOSE_UNIT varchar(64),
    CD_ROUTE varchar(64),
    CD_FREQ varchar(64),
    QTY_DURATION_VAL decimal(12,3),
    DURATION_UNIT varchar(32),
    QTY_ORDERED decimal(28,8) not null,
    QTY_UNIT varchar(64) not null,
    QTY_BASE decimal(28,8) not null,
    BASE_UNIT varchar(64) not null,
    PACKAGE_FACTOR_SNAPSHOT decimal(28,8) not null,
    NA_PKG_UNIT_SNAP varchar(160),
    PACKAGE_SPEC_SNAPSHOT varchar(300),
    PRICE_QUANTITY_SNAP decimal(28,8),
    FG_SUBSTITUTION boolean not null,
    FG_SELF_PROVIDED boolean not null,
    DES_MED_INSTRUCTION varchar(1000),
    CD_MED_SNAP varchar(128) not null,
    NA_MED_SNAP varchar(300) not null,
    SD_MED_TYPE_SNAP varchar(32) not null,
    DOSE_FORM_SNAPSHOT varchar(64),
    PREPARATION_SPEC_SNAPSHOT varchar(300),
    PREPARATION_UNIT_SNAPSHOT varchar(64),
    FG_SKIN_TEST_REQUIRED_SNAP boolean not null,
    FG_ANTIMICROBIAL_SNAP boolean not null,
    SD_ANTIMICROBIAL_LEVEL_SNAP varchar(64),
    MEDICATION_SNAPSHOT text not null,
    CD_ADMIN_GRP_NO varchar(64),
    ID_ORDER_FREQ bigint,
    NA_FREQ_SNAP varchar(160),
    FREQUENCY_RULE_SNAPSHOT text,
    ID_CONCEPT_ROUTE bigint,
    NA_ROUTE_SNAP varchar(300),
    SD_ROUTE_EXEC_TYPE_SNAP varchar(32),
    SD_ROUTE_RESOLUTION_STATUS varchar(16) default 'UNMAPPED' not null,
    constraint PK_EX_MED_REQ_PK primary key (ID_CARE_REQ),
    constraint UK_EX_MED_REQ_MED_REQUEST_TENA unique (ID_TNT, ID_CARE_REQ),
    constraint CK_EX_MED_REQ_MED_REQUEST_DOSE check ((QTY_DOSE_VAL is null and DOSE_UNIT is null) or (QTY_DOSE_VAL > 0 and DOSE_UNIT is not null)),
    constraint CK_EX_MED_REQ_MED_REQUEST_DURA check ((QTY_DURATION_VAL is null and DURATION_UNIT is null) or (QTY_DURATION_VAL > 0 and DURATION_UNIT is not null)),
    constraint CK_EX_MED_REQ_MED_REQUEST_QUAN check (QTY_ORDERED > 0 and QTY_BASE > 0 and PACKAGE_FACTOR_SNAPSHOT > 0),
    constraint CK_EX_MED_REQ_MED_REQUEST_PRIC check (PRICE_QUANTITY_SNAP is null or PRICE_QUANTITY_SNAP > 0),
    constraint CK_EX_MED_REQ_MED_REQ_SUBST_BO check (FG_SUBSTITUTION in (false, true)),
    constraint CK_EX_MED_REQ_MED_REQ_SELF_BOO check (FG_SELF_PROVIDED in (false, true)),
    constraint CK_EX_MED_REQ_MED_REQ_SKIN_BOO check (FG_SKIN_TEST_REQUIRED_SNAP in (false, true)),
    constraint CK_EX_MED_REQ_MED_REQ_ANTIMIC_ check (FG_ANTIMICROBIAL_SNAP in (false, true)),
    constraint CK_EX_MED_REQ_MEDICATION_ROUTE check (SD_ROUTE_RESOLUTION_STATUS in ('RESOLVED', 'UNMAPPED'))
);

create table RHN_EX_OP_REFER_EVT (
    ID_OP_REFER_EVT bigint,
    ID_TNT bigint not null,
    ID_OP_REFER_REQ bigint not null,
    SD_STATUS_FROM varchar(24),
    SD_STATUS_TO varchar(24) not null,
    CD_ACTION varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    ID_ACTOR bigint not null,
    DES_REASON varchar(1000),
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_EX_OP_REFER_EVT_PK primary key (ID_OP_REFER_EVT),
    constraint UK_EX_OP_REFER_EV_REF_EVT_COMM unique (ID_TNT, ID_OP_REFER_REQ, CD_COMMAND),
    constraint CK_EX_OP_REFER_EV_REF_EVT_STAT check (SD_STATUS_TO in ('REQUESTED', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    constraint CK_EX_OP_REFER_EV_REF_EVT_ACTI check (CD_ACTION in ('CREATE', 'ACCEPT', 'COMPLETE', 'REJECT', 'CANCEL'))
);

create table RHN_EX_OP_REFER_REQ (
    ID_OP_REFER_REQ bigint,
    REVISION bigint not null default 0,
    ID_TNT bigint not null,
    ID_ENC bigint not null,
    ID_PAT bigint not null,
    CD_REQ_NO varchar(64) not null,
    SD_REFER_TYPE varchar(32) not null,
    ID_ORG_TARGET bigint not null,
    ID_DEPT_TARGET bigint not null,
    ID_PRACT_TARGET bigint,
    SD_URGENCY varchar(32) not null,
    DES_REFER_REASON varchar(2000) not null,
    DES_CLIN_SUM varchar(4000) not null,
    DT_EXPECTED timestamp with time zone,
    SD_STATUS varchar(24) not null,
    ID_PAT_REG_TARGET bigint,
    ID_ENC_TARGET bigint,
    ID_USER_REQUESTED bigint not null,
    DT_REQUESTED timestamp with time zone not null,
    ID_USER_ACCEPTED bigint,
    DT_ACCEPTED timestamp with time zone,
    ID_USER_COMPLETED bigint,
    DT_COMPLETED timestamp with time zone,
    DES_OUTCOME varchar(4000),
    DES_REJECTION_REASON varchar(1000),
    CD_CREATE_COMMAND varchar(128) not null,
    constraint PK_EX_OP_REFER_REQ_PK primary key (ID_OP_REFER_REQ),
    constraint UK_EX_OP_REFER_RE_REF_REQ_TENA unique (ID_TNT, ID_OP_REFER_REQ),
    constraint UK_EX_OP_REFER_REQ_REF_REQ_NO unique (ID_TNT, CD_REQ_NO),
    constraint UK_EX_OP_REFER_RE_REF_REQ_COMM unique (ID_TNT, CD_CREATE_COMMAND),
    constraint CK_EX_OP_REFER_RE_REF_REQ_TYPE check (SD_REFER_TYPE in ('INTERNAL_CONSULT', 'DEPARTMENT_TRANSFER')),
    constraint CK_EX_OP_REFER_RE_REF_REQ_URGE check (SD_URGENCY in ('ROUTINE', 'URGENT')),
    constraint CK_EX_OP_REFER_RE_REF_REQ_STAT check (SD_STATUS in ('REQUESTED', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED'))
);

create table RHN_EX_REQ_GRP (
    ID_REQ_GRP bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    CD_GRP_NO varchar(64) not null,
    SD_GRP_TYPE varchar(32) not null,
    CD_CAT varchar(64),
    SD_STATUS varchar(32) not null,
    ID_ORG_PERFORMER bigint not null,
    ID_DEPT_PERFORMER bigint not null,
    DT_AUTHORED timestamp with time zone not null,
    ID_USER_AUTHORED bigint not null,
    DT_SUBMITTED timestamp with time zone,
    ID_USER_SUBMITTED bigint,
    DT_CANCELLED timestamp with time zone,
    ID_USER_CANCELLED bigint,
    DES_CANCEL_REASON varchar(1000),
    DES_NOTE varchar(2000),
    constraint PK_EX_REQ_GRP_PK primary key (ID_REQ_GRP),
    constraint UK_EX_REQ_GRP_REQUEST_GROUP_TE unique (ID_TNT, ID_REQ_GRP),
    constraint UK_EX_REQ_GRP_REQUEST_GROUP_NO unique (ID_TNT, CD_GRP_NO),
    constraint CK_EX_REQ_GRP_REQUEST_GROUP_TY check (SD_GRP_TYPE in ('ORDER_SET', 'PRESCRIPTION', 'HERBAL_PRESCRIPTION')),
    constraint CK_EX_REQ_GRP_REQUEST_GROUP_ST check (SD_STATUS in ('DRAFT', 'ACTIVE', 'CANCELLED')),
    constraint CK_EX_REQ_GRP_REQUEST_GROUP_SU check ((SD_STATUS = 'DRAFT' and DT_SUBMITTED is null and ID_USER_SUBMITTED is null and DT_CANCELLED is null and ID_USER_CANCELLED is null)
        or (SD_STATUS = 'ACTIVE' and DT_SUBMITTED is not null and ID_USER_SUBMITTED is not null and DT_CANCELLED is null and ID_USER_CANCELLED is null)
        or (SD_STATUS = 'CANCELLED' and DT_CANCELLED is not null and ID_USER_CANCELLED is not null))
);

create table RHN_EX_SKIN_TEST_EVT (
    ID_SKIN_TEST_EVT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_CARE_REQ_MED bigint not null,
    ID_MED bigint not null,
    SN_ATTEMPT integer not null,
    CD_MED_SNAP varchar(128) not null,
    NA_MED_SNAP varchar(300) not null,
    SD_STATUS varchar(32) not null,
    SD_TEST_METHOD varchar(32) not null,
    FG_ORIGINAL_SOLUTION boolean default false not null,
    ID_CATALOG_ITEM_SOLUTION bigint,
    NA_SOLUTION_SNAP varchar(300),
    ID_STOCK_LOT bigint,
    CD_LOT_SNAP varchar(128),
    CONCENTRATION numeric(28,8),
    CONCENTRATION_UNIT varchar(64),
    BODY_SITE varchar(128),
    SD_VERIFICATION_METHOD varchar(32) not null,
    QTY_OBS_MINUTES integer not null,
    DT_STARTED timestamp with time zone not null,
    DT_COMPLETED timestamp with time zone,
    SD_RESULT varchar(32),
    QTY_WHEAL_DIAMETER_MM numeric(8,2),
    QTY_FLARE_DIAMETER_MM numeric(8,2),
    DES_REACTION_DESCRIPTION varchar(1000),
    DES_EARLY_READ_REASON varchar(1000),
    ID_USER_PERFORMED bigint not null,
    ID_PRACT_PERFORMED bigint,
    ID_USER_READ bigint,
    ID_PRACT_READ bigint,
    DT_CANCELLED timestamp with time zone,
    ID_USER_CANCELLED bigint,
    DES_CANCEL_REASON varchar(1000),
    DT_CREATED timestamp with time zone not null,
    constraint PK_EX_SKIN_TEST_EVT_PK primary key (ID_SKIN_TEST_EVT),
    constraint UK_EX_SKIN_TEST_E_SKIN_TEST_TE unique (ID_TNT, ID_SKIN_TEST_EVT),
    constraint UK_EX_SKIN_TEST_E_SKIN_TEST_AT unique (ID_TNT, ID_CARE_REQ_MED, SN_ATTEMPT),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_ST check (SD_STATUS in ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_ME check (SD_TEST_METHOD in ('INTRADERMAL', 'PRICK', 'OTHER')),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_VE check (SD_VERIFICATION_METHOD in ('NAME_AND_IDENTIFIER', 'CARD', 'MANUAL')),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_RE check (SD_RESULT is null or SD_RESULT in ('NEGATIVE', 'POSITIVE', 'UNCERTAIN', 'INVALID')),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_CO check ((CONCENTRATION is null and CONCENTRATION_UNIT is null)
        or (CONCENTRATION > 0 and CONCENTRATION_UNIT is not null)),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_OB check (QTY_OBS_MINUTES between 1 and 120),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST__1 check ((QTY_WHEAL_DIAMETER_MM is null or QTY_WHEAL_DIAMETER_MM >= 0)
        and (QTY_FLARE_DIAMETER_MM is null or QTY_FLARE_DIAMETER_MM >= 0)),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_LI check ((SD_STATUS = 'IN_PROGRESS' and DT_COMPLETED is null and SD_RESULT is null and DT_CANCELLED is null)
        or (SD_STATUS = 'COMPLETED' and DT_COMPLETED is not null and SD_RESULT is not null and DT_CANCELLED is null)
        or (SD_STATUS = 'CANCELLED' and DT_COMPLETED is null and SD_RESULT is null and DT_CANCELLED is not null
            and DES_CANCEL_REASON is not null)),
    constraint CK_EX_SKIN_TEST_E_SKIN_TEST_PO check (SD_RESULT <> 'POSITIVE' or DES_REACTION_DESCRIPTION is not null)
);

create table RHN_EX_SVC_REQ (
    ID_CARE_REQ bigint,
    ID_TNT bigint not null,
    QTY_ORDERED decimal(28,8) not null,
    DES_CLIN_DESCRIPTION varchar(2000),
    SD_SVC_TYPE_SNAP varchar(32) not null,
    SD_SPEC_TYPE_SNAP varchar(64),
    SD_EXAM_TYPE_SNAP varchar(64),
    constraint PK_EX_SVC_REQ_PK primary key (ID_CARE_REQ),
    constraint UK_EX_SVC_REQ_SERVICE_REQUEST_ unique (ID_TNT, ID_CARE_REQ),
    constraint CK_EX_SVC_REQ_SERVICE_REQUEST_ check (QTY_ORDERED > 0)
);

create table RHN_EX_TREAT_EXEC_ITEM (
    ID_TREAT_EXEC_ITEM bigint,
    ID_TNT bigint not null,
    ID_TREAT_EXEC_TASK bigint not null,
    SD_SRC_TYPE varchar(32) not null,
    ID_CARE_REQ_SRC bigint not null,
    ID_CARE_REQ_PARENT_SRC bigint,
    CD_REQ_NO varchar(64) not null,
    CD_ITEM_SNAP varchar(128) not null,
    NA_ITEM_SNAP varchar(300) not null,
    QTY_DOSE_VAL numeric(28,8),
    DOSE_UNIT varchar(64),
    CD_ROUTE varchar(64),
    CD_FREQ varchar(64),
    QTY_DURATION_VAL numeric(12,3),
    DURATION_UNIT varchar(32),
    FG_SKIN_TEST_REQUIRED boolean default false not null,
    FG_STL_REQUIRED boolean default false not null,
    ID_STL bigint,
    FG_FULFILL_REQUIRED boolean default false not null,
    ID_FULFILL bigint,
    SD_FULFILL_STATUS varchar(32),
    DT_CANCELLED timestamp with time zone,
    DT_CREATED timestamp with time zone not null,
    ID_ORDER_FREQ bigint,
    NA_FREQ_SNAP varchar(160),
    FREQUENCY_RULE_SNAPSHOT text,
    constraint PK_EX_TREAT_EXEC_ITEM_PK primary key (ID_TREAT_EXEC_ITEM),
    constraint UK_EX_TREAT_EXEC_TREAT_ITEM_TE unique (ID_TNT, ID_TREAT_EXEC_ITEM),
    constraint UK_EX_TREAT_EXEC_TREAT_ITEM_SO unique (ID_TNT, SD_SRC_TYPE, ID_CARE_REQ_SRC),
    constraint CK_EX_TREAT_EXEC_TREAT_ITEM_SO check (SD_SRC_TYPE in ('SERVICE_REQUEST', 'MEDICATION_REQUEST')),
    constraint CK_EX_TREAT_EXEC_TREAT_ITEM_SE check (FG_STL_REQUIRED = true or ID_STL is null),
    constraint CK_EX_TREAT_EXEC_TREAT_ITEM_FU check (FG_FULFILL_REQUIRED = true or ID_FULFILL is null)
);

create table RHN_EX_TREAT_EXEC_TASK (
    ID_TREAT_EXEC_TASK bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_CARE_REQ_SRC_GRP bigint not null,
    CD_TASK_NO varchar(64) not null,
    SD_TASK_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    DT_STARTED timestamp with time zone,
    ID_USER_STARTED bigint,
    SD_VERIFICATION_METHOD varchar(32),
    SD_EXEC_SITE varchar(128),
    DES_START_NOTE varchar(1000),
    DT_COMPLETED timestamp with time zone,
    ID_USER_COMPLETED bigint,
    CD_RESULT varchar(32),
    DES_COMP_NOTE varchar(2000),
    FG_ADVERSE_REACTION boolean default false not null,
    DES_ADVERSE_REACTION_DETAIL varchar(2000),
    DES_EXCEPT_NOTE varchar(1000),
    constraint PK_EX_TREAT_EXEC_TASK_PK primary key (ID_TREAT_EXEC_TASK),
    constraint UK_EX_TREAT_EXEC_TREAT_TASK_TE unique (ID_TNT, ID_TREAT_EXEC_TASK),
    constraint UK_EX_TREAT_EXEC_TREAT_TASK_GR unique (ID_TNT, SD_TASK_TYPE, ID_CARE_REQ_SRC_GRP),
    constraint UK_EX_TREAT_EXEC_TREAT_TASK_NO unique (ID_TNT, CD_TASK_NO),
    constraint CK_EX_TREAT_EXEC_TREAT_TASK_TY check (SD_TASK_TYPE in ('SERVICE', 'MEDICATION')),
    constraint CK_EX_TREAT_EXEC_TREAT_TASK_RE check (CD_RESULT is null or CD_RESULT in (
        'COMPLETED', 'INTERRUPTED', 'NOT_COMPLETED'
    )),
    constraint CK_EX_TREAT_EXEC_TREAT_TASK__1 check (FG_ADVERSE_REACTION = false or DES_ADVERSE_REACTION_DETAIL is not null)
);

create table RHN_HPL_CARE_TASK (
    ID_CARE_TASK bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    ID_CARE_PLAN bigint,
    ID_CARE_REQ bigint,
    ID_REPORT_EVT bigint,
    ID_COND bigint,
    CD_TASK varchar(128) not null,
    SD_TASK_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    SD_PRIORITY varchar(32) not null,
    ID_PRACT_OWNER bigint,
    ID_ORG_OWNER bigint,
    ID_DEPT_OWNER bigint,
    DT_DUE timestamp with time zone,
    CD_ESCALATION_RULE varchar(128),
    NA_TITLE varchar(300) not null,
    DES_CARE_TASK varchar(2000),
    DT_CREATED timestamp with time zone not null,
    ID_PRACT_CREATOR bigint not null,
    ID_USER_CREATOR bigint not null,
    constraint PK_HPL_CARE_TASK_PK primary key (ID_CARE_TASK),
    constraint UK_HPL_CARE_TASK_CARE_TASK_TEN unique (ID_TNT, ID_CARE_TASK),
    constraint UK_HPL_CARE_TASK_CARE_TASK_COD unique (ID_TNT, CD_TASK),
    constraint CK_HPL_CARE_TASK_CARE_TASK_TYP check (SD_TASK_TYPE in ('FOLLOWUP', 'RECHECK', 'REFERRAL_RETURN', 'PUBLIC_HEALTH_REPORT', 'EDUCATION', 'PATIENT_COMMUNICATION', 'CRITICAL_VALUE')),
    constraint CK_HPL_CARE_TASK_CARE_TASK_STA check (SD_STATUS in ('PLANNED', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ESCALATED')),
    constraint CK_HPL_CARE_TASK_CARE_TASK_PRI check (SD_PRIORITY in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    constraint CK_HPL_CARE_TASK_CARE_TASK_OWN check ((ID_DEPT_OWNER is null) or (ID_ORG_OWNER is not null))
);

create table RHN_HPL_CARE_TASK_EVT (
    ID_CARE_TASK_EVT bigint,
    ID_TNT bigint not null,
    ID_CARE_TASK bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    ID_PRACT_ACTOR bigint,
    ID_USER_ACTOR bigint,
    CD_COMMAND varchar(128) not null,
    DES_RESULT_DESCRIPTION varchar(2000),
    CD_RULE varchar(128),
    CD_RULE_VER varchar(64),
    JSON_EVID text,
    HASH_EVID varchar(64),
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_HPL_CARE_TASK_EVT_PK primary key (ID_CARE_TASK_EVT),
    constraint UK_HPL_CARE_TASK_CARE_TASK_EVE unique (ID_TNT, ID_CARE_TASK, CD_COMMAND),
    constraint CK_HPL_CARE_TASK_CARE_TASK_EVE check (SD_STATUS_TO in ('PLANNED', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ESCALATED')),
    constraint CK_HPL_CARE_TASK_CARE_TASK_E_1 check (ID_PRACT_ACTOR is not null or ID_USER_ACTOR is not null),
    constraint CK_HPL_CARE_TASK_CARE_TASK_E_2 check ((JSON_EVID is null and HASH_EVID is null) or
        (JSON_EVID is not null and HASH_EVID is not null and CD_RULE is not null and CD_RULE_VER is not null))
);

create table RHN_HPL_COND (
    ID_COND bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_CONCEPT_TERM bigint,
    CD_COND_KEY varchar(240) not null,
    CODE_SYSTEM_URI varchar(300) not null,
    CD_CODE_RELEASE varchar(64),
    CD_COND varchar(128) not null,
    NA_COND varchar(300) not null,
    SD_CLIN_STATUS varchar(32) not null,
    SD_VERIFICATION_STATUS varchar(32) not null,
    DT_ONSET timestamp with time zone,
    DT_ABATEMENT timestamp with time zone,
    DT_RECORDED timestamp with time zone not null,
    ID_PRACT_RECORDER bigint not null,
    ID_USER_RECORDER bigint not null,
    constraint PK_HPL_COND_PK primary key (ID_COND),
    constraint UK_HPL_COND_CONDITION_TENANT_I unique (ID_TNT, ID_COND),
    constraint UK_HPL_COND_CONDITION_KEY unique (ID_TNT, CD_COND_KEY),
    constraint CK_HPL_COND_CONDITION_CLINICAL check (SD_CLIN_STATUS in ('ACTIVE', 'RECURRENCE', 'RELAPSE', 'INACTIVE', 'REMISSION', 'RESOLVED')),
    constraint CK_HPL_COND_CONDITION_VERIFICA check (SD_VERIFICATION_STATUS in ('UNCONFIRMED', 'SUSPECTED', 'PROVISIONAL', 'DIFFERENTIAL', 'CONFIRMED', 'REFUTED', 'ENTERED_IN_ERROR')),
    constraint CK_HPL_COND_CONDITION_PERIOD check (DT_ABATEMENT is null or DT_ONSET is null or DT_ABATEMENT >= DT_ONSET)
);

create table RHN_HPL_DISEASE_MGMT_MEMBER (
    ID_DISEASE_MGMT_MEMBER bigint,
    ID_DISEASE_MGMT_PROG bigint not null,
    ID_CONCEPT bigint not null,
    SD_STATUS varchar(24) not null,
    DA_EFFECTIVE_FROM date not null,
    DA_EFFECTIVE_TO date,
    DES_NOTE varchar(500),
    DT_CREATED timestamp with time zone not null,
    SD_INCLUSION_MODE varchar(16) default 'INCLUDE' not null,
    constraint PK_HPL_DISEASE_MGMT_MEMBER_PK primary key (ID_DISEASE_MGMT_MEMBER),
    constraint UK_HPL_DISEASE_MG_DISEASE_MANA unique (ID_DISEASE_MGMT_PROG, ID_CONCEPT),
    constraint CK_HPL_DISEASE_MG_DISEASE_MANA check (SD_INCLUSION_MODE in ('INCLUDE', 'EXCLUDE'))
);

create table RHN_HPL_DISEASE_MGMT_PROG (
    ID_DISEASE_MGMT_PROG bigint,
    REVISION bigint default 0 not null,
    SD_SCOPE_TYPE varchar(24) not null,
    ID_SCOPE bigint not null,
    CD_DISEASE_MGMT_PROG varchar(64) not null,
    NA_DISEASE_MGMT_PROG varchar(200) not null,
    SD_MGMT_TYPE varchar(32) not null,
    SD_TRIGGER_ACTION varchar(32) not null,
    DES_DISEASE_MGMT_PROG varchar(1000),
    SD_REPORT_CARD_TYPE varchar(64),
    QTY_REPORT_DEADLINE_HOURS integer,
    SD_STATUS varchar(24) not null,
    DA_EFFECTIVE_FROM date not null,
    DA_EFFECTIVE_TO date,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_HPL_DISEASE_MGMT_PROG_PK primary key (ID_DISEASE_MGMT_PROG),
    constraint UK_HPL_DISEASE_MG_DISEASE_MA_1 unique (SD_SCOPE_TYPE, ID_SCOPE, CD_DISEASE_MGMT_PROG),
    constraint CK_HPL_DISEASE_MG_DISEASE_MA_1 check (SD_SCOPE_TYPE in ('PRODUCT', 'TENANT')),
    constraint CK_HPL_DISEASE_MG_DISEASE_MA_2 check (SD_MGMT_TYPE in ('CHRONIC_CARE', 'DISEASE_REPORT', 'SPECIAL_REGISTRY')),
    constraint CK_HPL_DISEASE_MG_DISEASE_MA_3 check (SD_TRIGGER_ACTION in ('PROMPT_CONFIRMATION', 'CREATE_FOLLOW_UP_TASK', 'CREATE_REPORT_DRAFT')),
    constraint CK_HPL_DISEASE_MG_DISEASE_MA_4 check (QTY_REPORT_DEADLINE_HOURS is null or QTY_REPORT_DEADLINE_HOURS > 0)
);

create table RHN_HPL_DISEASE_MGMT_RULE (
    ID_DISEASE_MGMT_RULE bigint,
    ID_DISEASE_MGMT_PROG bigint not null,
    SD_INCLUSION_MODE varchar(16) not null,
    SD_DIAG_DOMAIN varchar(32),
    ID_CODE_SYSTEM bigint,
    SD_CONCEPT_TYPE varchar(32),
    CD_CHAPTER varchar(64),
    CD_CODE_FROM varchar(100),
    CD_CODE_TO varchar(100),
    DES_NOTE varchar(500),
    DT_CREATED timestamp with time zone not null,
    constraint PK_HPL_DISEASE_MGMT_RULE_PK primary key (ID_DISEASE_MGMT_RULE),
    constraint CK_HPL_DISEASE_MG_DISEASE_MA_5 check (SD_INCLUSION_MODE in ('INCLUDE', 'EXCLUDE')),
    constraint CK_HPL_DISEASE_MG_DISEASE_MA_6 check (SD_DIAG_DOMAIN is null or SD_DIAG_DOMAIN in ('WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME')),
    constraint CK_HPL_DISEASE_MG_DISEASE_MA_7 check (SD_DIAG_DOMAIN is not null or ID_CODE_SYSTEM is not null or SD_CONCEPT_TYPE is not null
        or CD_CHAPTER is not null or CD_CODE_FROM is not null or CD_CODE_TO is not null)
);

create table RHN_INS_CLAIM (
    ID_INS_CLAIM bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STL bigint not null,
    ID_PAT_ACCT bigint not null,
    ID_PAT_COVER bigint not null,
    CD_CLAIM_NO varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    SD_CLAIM_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    SD_CURRENT_OPERATION varchar(32) not null,
    CD_REGION varchar(64) not null,
    CD_INS_TYPE varchar(64) not null,
    NA_PAYER_SNAP varchar(300) not null,
    CD_ORG varchar(128) not null,
    CD_DEPT varchar(128) not null,
    CD_PRACT varchar(128) not null,
    HASH_DIAG_PAYLOAD varchar(128) not null,
    DT_SVC_STARTED timestamp with time zone not null,
    DT_SVC_ENDED timestamp with time zone,
    CD_EXT_PRE_STL_NO varchar(128),
    CD_EXT_STL_NO varchar(128),
    AMT_GROSS decimal(24,6) not null,
    AMT_INS_FUND decimal(24,6) not null,
    AMT_PERSONAL_ACCT decimal(24,6) not null,
    AMT_PAT_CASH decimal(24,6) not null,
    AMT_OTHER_FUND decimal(24,6) not null,
    CD_CURRENCY varchar(3) not null,
    ID_CORRELATION varchar(128),
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    DES_REVERSAL_REASON varchar(500),
    DT_REVERSED timestamp with time zone,
    constraint PK_INS_CLAIM_PK primary key (ID_INS_CLAIM),
    constraint UK_INS_CLAIM_INS_CLAIM_TENANT_ unique (ID_TNT, ID_INS_CLAIM),
    constraint UK_INS_CLAIM_INS_CLAIM_NO unique (ID_TNT, CD_CLAIM_NO),
    constraint UK_INS_CLAIM_INS_CLAIM_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint UK_INS_CLAIM_INS_CLAIM_SETTLEM unique (ID_TNT, ID_STL),
    constraint CK_INS_CLAIM_INS_CLAIM_TYPE check (SD_CLAIM_TYPE in ('NORMAL', 'REVERSAL')),
    constraint CK_INS_CLAIM_INS_CLAIM_STATUS check (SD_STATUS in ('PRE_SETTLEMENT_PENDING', 'PRE_SETTLED', 'SETTLEMENT_PENDING', 'SETTLED', 'FAILED', 'REVERSAL_PENDING', 'REVERSED')),
    constraint CK_INS_CLAIM_INS_CLAIM_OPERATI check (SD_CURRENT_OPERATION in ('PRE_SETTLE', 'SETTLE', 'REVERSE')),
    constraint CK_INS_CLAIM_INS_CLAIM_AMOUNTS check (AMT_GROSS > 0 and AMT_INS_FUND >= 0 and AMT_PERSONAL_ACCT >= 0 and AMT_PAT_CASH >= 0 and AMT_OTHER_FUND >= 0),
    constraint CK_INS_CLAIM_INS_CLAIM_REVERSA check ((SD_STATUS = 'REVERSED' and DES_REVERSAL_REASON is not null and DT_REVERSED is not null)
 or (SD_STATUS = 'REVERSAL_PENDING' and DES_REVERSAL_REASON is not null and DT_REVERSED is null)
 or (SD_STATUS not in ('REVERSAL_PENDING', 'REVERSED') and DT_REVERSED is null))
);

create table RHN_INS_CLAIM_LINE (
    ID_INS_CLAIM_LINE bigint,
    ID_TNT bigint not null,
    ID_INS_CLAIM bigint not null,
    ID_STL_LINE bigint not null,
    SN_LINE integer not null,
    CD_ITEM varchar(128) not null,
    CD_INS_ITEM varchar(128) not null,
    NA_ITEM_SNAP varchar(300) not null,
    CD_CAT varchar(64) not null,
    QTY_CLAIM decimal(28,8) not null,
    PRICE_UNIT decimal(24,6) not null,
    AMT_CLAIMED decimal(24,6) not null,
    AMT_APPROVED decimal(24,6),
    CD_REJECTION varchar(64),
    JSON_TRACE_ATTR text,
    constraint PK_INS_CLAIM_LINE_PK primary key (ID_INS_CLAIM_LINE),
    constraint UK_INS_CLAIM_LINE_INS_CLAIM_LI unique (ID_TNT, ID_INS_CLAIM, SN_LINE),
    constraint UK_INS_CLAIM_LINE_INS_CLAIM__1 unique (ID_TNT, ID_INS_CLAIM, ID_STL_LINE),
    constraint CK_INS_CLAIM_LINE_INS_CLAIM_LI check (QTY_CLAIM <> 0 and AMT_CLAIMED > 0)
);

create table RHN_INS_CLAIM_RESP (
    ID_CLAIM_RESP bigint,
    ID_TNT bigint not null,
    ID_INS_CLAIM bigint not null,
    ID_EXT_MSG bigint,
    CD_RESP_NO varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    SD_OPERATION varchar(32) not null,
    SD_STATUS varchar(32) not null,
    CD_EXT_STL_NO varchar(128),
    AMT_INS_FUND decimal(24,6) not null,
    AMT_PERSONAL_ACCT decimal(24,6) not null,
    AMT_PAT_CASH decimal(24,6) not null,
    AMT_OTHER_FUND decimal(24,6) not null,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(2000),
    DT_RESPONDED timestamp with time zone not null,
    constraint PK_INS_CLAIM_RESP_PK primary key (ID_CLAIM_RESP),
    constraint UK_INS_CLAIM_RESP_INS_RESP_TEN unique (ID_TNT, ID_CLAIM_RESP),
    constraint UK_INS_CLAIM_RESP_INS_RESP_COM unique (ID_TNT, ID_INS_CLAIM, CD_COMMAND),
    constraint UK_INS_CLAIM_RESP_INS_RESP_NO unique (ID_TNT, ID_INS_CLAIM, CD_RESP_NO),
    constraint CK_INS_CLAIM_RESP_INS_RESP_OPE check (SD_OPERATION in ('PRE_SETTLE', 'SETTLE', 'REVERSE', 'QUERY')),
    constraint CK_INS_CLAIM_RESP_INS_RESP_STA check (SD_STATUS in ('SUCCEEDED', 'PENDING', 'FAILED'))
);

create table RHN_INS_PAT_COVER (
    ID_PAT_COVER bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    CD_COVER_TYPE varchar(32) not null,
    NA_PAYER varchar(200) not null,
    CD_MEMBER_NO varchar(100),
    FG_PRIMARY_FLAG boolean default false not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED varchar(100) not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED varchar(100) not null,
    constraint PK_INS_PAT_COVER_PK primary key (ID_PAT_COVER),
    constraint UK_INS_PAT_COVER_RESIDENT_COVE unique (ID_TNT, ID_PAT_COVER),
    constraint CK_INS_PAT_COVER_RESIDENT_COVE check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_INS_PAT_COVER_RESIDENT_CO_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_INT_EVT_CONSUME (
    ID_EVT_CONSUME bigint,
    ID_TNT bigint not null,
    NA_CONSUMER varchar(128) not null,
    ID_EVT bigint not null,
    SD_STATUS varchar(24) not null,
    DT_PROCESSED timestamp with time zone not null,
    DES_LAST_ERROR varchar(1000),
    constraint PK_INT_EVT_CONSUME_PK primary key (ID_EVT_CONSUME),
    constraint UK_INT_EVT_CONSUM_EVENT_CONSUM unique (NA_CONSUMER, ID_EVT)
);

create table RHN_INT_EXT_MSG (
    ID_EXT_MSG bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    CD_ENDPOINT varchar(64) not null,
    SD_DIRECTION varchar(8) not null,
    SD_MSG_TYPE varchar(64) not null,
    ID_BUSINESS_MSG varchar(128) not null,
    ID_CORRELATION varchar(128),
    SD_STATUS varchar(32) not null,
    JSON_PAYLOAD text not null,
    PAYLOAD_DIGEST_ALGORITHM varchar(32) not null,
    HASH_PAYLOAD varchar(128) not null,
    SD_RELATED_RSRC_TYPE varchar(80),
    ID_RELATED_RSRC bigint,
    SN_RELATED_RSRC_VER bigint,
    DT_CREATED timestamp with time zone not null,
    DT_SENT timestamp with time zone,
    DT_RECEIVED timestamp with time zone,
    DT_PROCESSED timestamp with time zone,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(1000),
    constraint PK_INT_EXT_MSG_PK primary key (ID_EXT_MSG),
    constraint UK_INT_EXT_MSG_EXTERNAL_MESSAG unique (ID_TNT, ID_EXT_MSG),
    constraint UK_INT_EXT_MSG_EXTERNAL_MESS_1 unique (ID_TNT, CD_ENDPOINT, SD_DIRECTION, ID_BUSINESS_MSG),
    constraint CK_INT_EXT_MSG_EXTERNAL_MESSAG check (SD_DIRECTION in ('INBOUND', 'OUTBOUND')),
    constraint CK_INT_EXT_MSG_EXTERNAL_MESS_1 check (SD_STATUS in (
        'PENDING', 'SENT', 'FAILED', 'ACKNOWLEDGED', 'REJECTED', 'RECEIVED', 'PROCESSED')),
    constraint CK_INT_EXT_MSG_EXTERNAL_MESS_2 check ((SD_RELATED_RSRC_TYPE is null and ID_RELATED_RSRC is null and SN_RELATED_RSRC_VER is null) or
        (SD_RELATED_RSRC_TYPE is not null and ID_RELATED_RSRC is not null and SN_RELATED_RSRC_VER is not null))
);

create table RHN_INT_IDEMP_RECORD (
    ID_IDEMP_RECORD bigint,
    ID_TNT bigint not null,
    CD_OPERATION varchar(128) not null,
    CD_IDEMP_KEY varchar(200) not null,
    HASH_REQ varchar(128) not null,
    SD_RSRC_TYPE varchar(128),
    ID_RSRC bigint,
    SD_STATUS varchar(24) not null,
    SD_RESP_STATUS integer,
    JSON_RESP text,
    DT_CREATED timestamp with time zone not null,
    DT_COMPLETED timestamp with time zone,
    DT_EXPIRES timestamp with time zone not null,
    constraint PK_INT_IDEMP_RECORD_PK primary key (ID_IDEMP_RECORD),
    constraint UK_INT_IDEMP_RECO_IDEMPOTENCY_ unique (ID_TNT, CD_OPERATION, CD_IDEMP_KEY)
);

create table RHN_INT_OUTBOX_EVT (
    ID_EVT bigint,
    ID_TNT bigint not null,
    ID_ORG bigint,
    SD_EVT_TYPE varchar(160) not null,
    SN_EVT_VER integer not null,
    SD_AGGREGATE_TYPE varchar(100) not null,
    ID_AGGREGATE bigint not null,
    SN_AGGREGATE_VER bigint not null,
    ID_SUBJECT bigint,
    DT_OCCURRED timestamp with time zone not null,
    DT_RECORDED timestamp with time zone not null,
    CD_ACTOR varchar(100) not null,
    SOURCE varchar(100) not null,
    ID_CORRELATION varchar(64) not null,
    ID_CAUSATION bigint,
    JSON_PAYLOAD text not null,
    SN_SCHEMA_VER integer not null,
    SD_PUBLICATION_STATUS varchar(24) not null,
    DT_PUBLISD timestamp with time zone,
    QTY_ATTEMPT integer not null default 0,
    DES_LAST_ERROR varchar(1000),
    DT_NEXT_ATTEMPT timestamp with time zone not null,
    ID_USER_CLAIMED varchar(100),
    DT_CLAIMED_UNTIL timestamp with time zone,
    constraint PK_INT_OUTBOX_EVT_PK primary key (ID_EVT)
);

create table RHN_META_OP_NOTE_FORM_VER (
    ID_OP_NOTE_FORM_VER bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    CD_FORM varchar(64) not null,
    CD_VER_NUMBER integer not null,
    CD_SPECIALTY varchar(64) not null,
    NA_FORM varchar(100) not null,
    DES_OP_NOTE_FORM_VER varchar(500),
    JSON_DEF_SCHEMA varchar(100) not null,
    JSON_DEF clob not null,
    SD_STATUS varchar(16) not null,
    ID_USER_PUBLISD bigint not null,
    DT_PUBLISD timestamp with time zone not null,
    DT_RETIRED timestamp with time zone,
    constraint PK_META_OP_NOTE_FORM_VER_PK primary key (ID_OP_NOTE_FORM_VER),
    constraint UK_META_OP_NOTE_F_ONFV_TENANT_ unique (ID_TNT, ID_OP_NOTE_FORM_VER),
    constraint UK_META_OP_NOTE_F_ONFV_FORM_VE unique (ID_TNT, ID_ORG, ID_DEPT, CD_FORM, CD_VER_NUMBER),
    constraint CK_META_OP_NOTE_F_ONFV_VERSION check (CD_VER_NUMBER > 0),
    constraint CK_META_OP_NOTE_F_ONFV_STATUS check (SD_STATUS in ('PUBLISHED', 'RETIRED'))
);

create table RHN_META_OP_NOTE_TMPL (
    ID_OP_NOTE_TMPL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    SD_SCOPE_TYPE varchar(16) not null,
    ID_OWNER bigint not null,
    CD_SPECIALTY varchar(64) not null,
    SD_DOC_TYPE varchar(64) not null,
    JSON_CONTENT_SCHEMA varchar(100) not null,
    NA_TMPL varchar(100) not null,
    DES_OP_NOTE_TMPL varchar(500),
    JSON_CONTENT clob not null,
    SD_STATUS varchar(16) not null,
    SN_SORT integer default 0 not null,
    QTY_USE bigint default 0 not null,
    DT_LAST_USED timestamp with time zone,
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_META_OP_NOTE_TMPL_PK primary key (ID_OP_NOTE_TMPL),
    constraint UK_META_OP_NOTE_T_ONT_TENANT_I unique (ID_TNT, ID_OP_NOTE_TMPL),
    constraint UK_META_OP_NOTE_T_ONT_OWNER_NA unique (ID_TNT, ID_ORG, SD_SCOPE_TYPE, ID_OWNER, CD_SPECIALTY, SD_DOC_TYPE, NA_TMPL),
    constraint CK_META_OP_NOTE_TMPL_ONT_SCOPE check (SD_SCOPE_TYPE in ('PERSONAL', 'DEPARTMENT')),
    constraint CK_META_OP_NOTE_T_ONT_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_META_OP_PLAN_DIAG (
    ID_OP_PLAN_DIAG bigint,
    ID_TNT bigint not null,
    ID_OP_PLAN_TMPL bigint not null,
    SN_LINE integer not null,
    CD_DIAG varchar(64) not null,
    NA_DIAG varchar(200) not null,
    SD_DIAG_TYPE varchar(24) not null,
    constraint PK_META_OP_PLAN_DIAG_PK primary key (ID_OP_PLAN_DIAG),
    constraint UK_META_OP_PLAN_DIAG_OPD_LINE unique (ID_TNT, ID_OP_PLAN_TMPL, SN_LINE),
    constraint CK_META_OP_PLAN_DIAG_OPD_TYPE check (SD_DIAG_TYPE in ('PRIMARY', 'SECONDARY'))
);

create table RHN_META_OP_PLAN_MED (
    ID_OP_PLAN_MED bigint,
    ID_TNT bigint not null,
    ID_OP_PLAN_TMPL bigint not null,
    SN_LINE integer not null,
    ID_MED bigint not null,
    ID_CATALOG_ITEM bigint,
    ID_PKG bigint,
    CD_CAT varchar(32) not null,
    CD_MED varchar(64) not null,
    NA_MED varchar(200) not null,
    PREPARATION_SPEC varchar(200),
    NA_PRODUCT varchar(200),
    QTY_DOSE_VAL decimal(18,6),
    DOSE_UNIT varchar(64),
    CD_ROUTE varchar(64),
    CD_FREQ varchar(64),
    QTY_DURATION_VAL decimal(18,6),
    DURATION_UNIT varchar(32),
    QTY_ORDERED decimal(18,6) not null,
    QTY_UNIT varchar(64),
    FG_SUBSTITUTION boolean not null,
    FG_SELF_PROVIDED boolean not null,
    DES_MED_INSTRUCTION varchar(1000),
    SD_PRICE_TYPE varchar(32),
    FG_PRICING_REQUIRED boolean not null,
    DES_REASON varchar(1000),
    constraint PK_META_OP_PLAN_MED_PK primary key (ID_OP_PLAN_MED),
    constraint UK_META_OP_PLAN_MED_OPM_LINE unique (ID_TNT, ID_OP_PLAN_TMPL, SN_LINE)
);

create table RHN_META_OP_PLAN_SVC (
    ID_OP_PLAN_SVC bigint,
    ID_TNT bigint not null,
    ID_OP_PLAN_TMPL bigint not null,
    SN_LINE integer not null,
    ID_CATALOG_ITEM bigint not null,
    CD_ITEM varchar(64) not null,
    NA_ITEM varchar(200) not null,
    SD_SVC_TYPE varchar(32) not null,
    QTY_ORDERED decimal(18,6) not null,
    CD_UNIT varchar(64),
    SD_PRICE_TYPE varchar(32),
    FG_PRICING_REQUIRED boolean not null,
    DES_REASON varchar(1000),
    DES_CLIN_DESCRIPTION varchar(2000),
    constraint PK_META_OP_PLAN_SVC_PK primary key (ID_OP_PLAN_SVC),
    constraint UK_META_OP_PLAN_SVC_OPS_LINE unique (ID_TNT, ID_OP_PLAN_TMPL, SN_LINE)
);

create table RHN_META_OP_PLAN_TMPL (
    ID_OP_PLAN_TMPL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    SD_SCOPE_TYPE varchar(16) not null,
    ID_OWNER bigint not null,
    NA_TMPL varchar(100) not null,
    DES_OP_PLAN_TMPL varchar(500),
    SD_STATUS varchar(16) not null,
    SN_SORT integer default 0 not null,
    QTY_USE bigint default 0 not null,
    DT_LAST_USED timestamp with time zone,
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_META_OP_PLAN_TMPL_PK primary key (ID_OP_PLAN_TMPL),
    constraint UK_META_OP_PLAN_T_OPT_TENANT_I unique (ID_TNT, ID_OP_PLAN_TMPL),
    constraint UK_META_OP_PLAN_T_OPT_OWNER_NA unique (ID_TNT, ID_ORG, SD_SCOPE_TYPE, ID_OWNER, NA_TMPL),
    constraint CK_META_OP_PLAN_TMPL_OPT_SCOPE check (SD_SCOPE_TYPE in ('PERSONAL', 'DEPARTMENT')),
    constraint CK_META_OP_PLAN_T_OPT_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_META_PRINT_TMPL (
    ID_PRINT_TMPL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint,
    CD_TMPL varchar(100) not null,
    NA_TMPL varchar(200) not null,
    SD_DOC_TYPE varchar(80) not null,
    SD_STATUS varchar(24) not null,
    SN_CURRENT_VER integer not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    constraint PK_META_PRINT_TMPL_PK primary key (ID_PRINT_TMPL),
    constraint UK_META_PRINT_TMP_PRINT_TEMPLA unique (ID_TNT, CD_TMPL),
    constraint CK_META_PRINT_TMP_PRINT_TEMPLA check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_META_PRINT_TMP_PRINT_TEMP_1 check (SN_CURRENT_VER > 0)
);

create table RHN_META_PRINT_TMPL_VER (
    ID_PRINT_TMPL_VER bigint,
    ID_PRINT_TMPL bigint not null,
    CD_VER_NO integer not null,
    JSON_LAYOUT_SCHEMA varchar(80) not null,
    JSON_CONFIG text not null,
    CONTENT_DIGEST_ALGORITHM varchar(32) not null,
    HASH_CONTENT varchar(256) not null,
    DT_PUBLISD timestamp with time zone not null,
    ID_USER_PUBLISD bigint,
    constraint PK_META_PRINT_TMPL_VER_PK primary key (ID_PRINT_TMPL_VER),
    constraint UK_META_PRINT_TMP_PRINT_TEMP_1 unique (ID_PRINT_TMPL, CD_VER_NO),
    constraint CK_META_PRINT_TMP_PRINT_TEMP_2 check (CD_VER_NO > 0)
);

create table RHN_PI_PAT (
    ID_PAT bigint,
    ID_TNT bigint not null,
    CD_HEALTH_RECORD_NO varchar(32) not null,
    NA_FULL varchar(100) not null,
    ID_NATIONAL varchar(32),
    SD_GENDER varchar(16) not null,
    DA_BIRTH date not null,
    CD_PHONE varchar(32),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED varchar(100) not null,
    SD_STATUS varchar(24) not null default 'ACTIVE',
    ID_PAT_MERGED_INTO bigint,
    DT_UPDATED timestamp with time zone not null default current_timestamp,
    REVISION bigint not null default 0,
    FG_DECEASED boolean default false not null,
    DT_DECEASED timestamp with time zone,
    ID_USER_UPDATED varchar(100) default 'system' not null,
    constraint PK_PI_PAT_PK primary key (ID_PAT),
    constraint UK_PI_PAT_RESIDENT_RECORD_NO unique (ID_TNT, CD_HEALTH_RECORD_NO),
    constraint UK_PI_PAT_RESIDENT_TENANT_ID unique (ID_TNT, ID_PAT),
    constraint CK_PI_PAT_RESIDENT_DECEASED_TI check (FG_DECEASED = true or DT_DECEASED is null)
);

create table RHN_PI_PAT_ADDR (
    ID_PAT_ADDR bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    CD_USE varchar(32) not null,
    CD_PROVINCE varchar(32),
    CD_CITY varchar(32),
    CD_DISTRICT varchar(32),
    CD_STREET varchar(32),
    DES_ADDRESS varchar(1000) not null,
    CD_POSTAL varchar(16),
    FG_PRIMARY_FLAG boolean default false not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED varchar(100) not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED varchar(100) not null,
    CD_COMMUNITY varchar(12),
    constraint PK_PI_PAT_ADDR_PK primary key (ID_PAT_ADDR),
    constraint UK_PI_PAT_ADDR_RESIDENT_ADDRES unique (ID_TNT, ID_PAT_ADDR),
    constraint CK_PI_PAT_ADDR_RESIDENT_ADDRES check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_PI_PAT_ADDR_RESIDENT_ADDR_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_PI_PAT_DEMO_PROF (
    ID_PAT bigint,
    ID_TNT bigint not null,
    CD_NATIONALITY varchar(32),
    CD_ETHNICITY varchar(32),
    CD_MARITAL_STATUS varchar(32),
    CD_EDUCATION varchar(32),
    CD_OCCUPATION varchar(64),
    CD_BLOOD_TYPE varchar(16),
    CD_RH_TYPE varchar(16),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED varchar(100) not null,
    CD_RESIDENCY_TYPE varchar(32),
    constraint PK_PI_PAT_DEMO_PROF_PK primary key (ID_PAT)
);

create table RHN_PI_PAT_EMPL (
    ID_PAT_EMPL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    NA_EMPLOYER varchar(200) not null,
    CD_OCCUPATION varchar(64),
    CD_PHONE varchar(32),
    CD_POSTAL varchar(16),
    DES_ADDRESS varchar(1000),
    FG_PRIMARY_FLAG boolean default false not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED varchar(100) not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED varchar(100) not null,
    constraint PK_PI_PAT_EMPL_PK primary key (ID_PAT_EMPL),
    constraint UK_PI_PAT_EMPL_RESIDENT_EMPLOY unique (ID_TNT, ID_PAT_EMPL),
    constraint CK_PI_PAT_EMPL_RESIDENT_EMPLOY check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_PI_PAT_EMPL_RESIDENT_EMPL_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_PI_PAT_IDENT (
    ID_PAT_IDENT bigint,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    CD_IDENT_SYS varchar(100) not null,
    CD_IDENT_VAL varchar(200) not null,
    NORMALIZED_VALUE varchar(200) not null,
    SD_USE_TYPE varchar(24) not null,
    SD_STATUS varchar(24) not null,
    ID_ORG_SRC bigint,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    constraint PK_PI_PAT_IDENT_PK primary key (ID_PAT_IDENT),
    constraint UK_PI_PAT_IDENT_RESIDENT_IDENT unique (ID_TNT, CD_IDENT_SYS, NORMALIZED_VALUE),
    constraint UK_PI_PAT_IDENT_RESIDENT_IDE_1 unique (ID_TNT, ID_PAT_IDENT)
);

create table RHN_PI_PAT_MATCH_CAND (
    ID_PAT_MATCH_CAND bigint,
    ID_TNT bigint not null,
    ID_PAT_SRC_RECORD bigint not null,
    ID_PAT_CAND bigint not null,
    MATCH_SCORE decimal(5,4) not null,
    JSON_REASONS text not null,
    SD_DECISION varchar(24) not null,
    ID_USER_REVIEWED varchar(100),
    DT_REVIEWED timestamp with time zone,
    constraint PK_PI_PAT_MATCH_CAND_PK primary key (ID_PAT_MATCH_CAND),
    constraint UK_PI_PAT_MATCH_C_MATCH_CANDID unique (ID_PAT_SRC_RECORD, ID_PAT_CAND),
    constraint UK_PI_PAT_MATCH_C_RESIDENT_CAN unique (ID_TNT, ID_PAT_MATCH_CAND)
);

create table RHN_PI_PAT_MERGE_HIST (
    ID_PAT_MERGE_HIST bigint,
    ID_TNT bigint not null,
    ID_PAT_SURVIVING bigint not null,
    ID_PAT_MERGED bigint not null,
    MOVED_IDENTIFIER_IDS text not null,
    MOVED_SOURCE_RECORD_IDS text not null,
    DES_REASON varchar(500) not null,
    ID_USER_MERGED varchar(100) not null,
    DT_MERGED timestamp with time zone not null,
    DT_SPLIT timestamp with time zone,
    constraint PK_PI_PAT_MERGE_HIST_PK primary key (ID_PAT_MERGE_HIST),
    constraint UK_PI_PAT_MERGE_H_RESIDENT_MER unique (ID_TNT, ID_PAT_MERGE_HIST)
);

create table RHN_PI_PAT_RELATED_PERSON (
    ID_PAT_RELATED_PERSON bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    NA_FULL varchar(100) not null,
    CD_RELATIONSHIP varchar(32) not null,
    CD_PHONE varchar(32),
    DES_ADDRESS varchar(1000),
    FG_GUARDIAN_FLAG boolean default false not null,
    FG_EMERGENCY_CONTACT_FLAG boolean default false not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED varchar(100) not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED varchar(100) not null,
    constraint PK_PI_PAT_RELATED_PERSON_PK primary key (ID_PAT_RELATED_PERSON),
    constraint UK_PI_PAT_RELATED_RESIDENT_REL unique (ID_TNT, ID_PAT_RELATED_PERSON),
    constraint CK_PI_PAT_RELATED_RESIDENT_REL check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_PI_PAT_RELATED_RESIDENT_R_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_PI_PAT_SPLIT_HIST (
    ID_PAT_SPLIT_HIST bigint,
    ID_TNT bigint not null,
    ID_PAT_MERGE_HIST bigint not null,
    ID_PAT_RESTORED bigint not null,
    RESTORED_IDENTIFIER_IDS text not null,
    DES_REASON varchar(500) not null,
    ID_USER_SPLIT varchar(100) not null,
    DT_SPLIT timestamp with time zone not null,
    constraint PK_PI_PAT_SPLIT_HIST_PK primary key (ID_PAT_SPLIT_HIST),
    constraint UK_PI_PAT_SPLIT_H_SPLIT_MERGE unique (ID_PAT_MERGE_HIST),
    constraint UK_PI_PAT_SPLIT_H_RESIDENT_SPL unique (ID_TNT, ID_PAT_SPLIT_HIST)
);

create table RHN_PI_PAT_SRC_RECORD (
    ID_PAT_SRC_RECORD bigint,
    ID_TNT bigint not null,
    ID_ORG_SRC bigint not null,
    CD_SRC_SYS varchar(100) not null,
    ID_SRC_RECORD varchar(200) not null,
    ID_PAT bigint,
    SD_MATCH_STATUS varchar(24) not null,
    JSON_RAW_PAYLOAD text not null,
    DT_LAST_SEEN timestamp with time zone not null,
    ID_USER_LINKED varchar(100),
    DT_LINKED timestamp with time zone,
    DES_LINK_REASON varchar(500),
    REVISION bigint not null default 0,
    constraint PK_PI_PAT_SRC_RECORD_PK primary key (ID_PAT_SRC_RECORD),
    constraint UK_PI_PAT_SRC_REC_RESIDENT_SOU unique (ID_TNT, CD_SRC_SYS, ID_SRC_RECORD),
    constraint UK_PI_PAT_SRC_REC_RESIDENT_S_1 unique (ID_TNT, ID_PAT_SRC_RECORD)
);

create table RHN_SC_APPT (
    ID_APPT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SVC_SCHED bigint not null,
    ID_SCHED_SLOT_POOL bigint not null,
    ID_PAT bigint not null,
    CD_APPT_NO varchar(32) not null,
    CD_IDEMP varchar(128) not null,
    SD_STATUS varchar(24) not null,
    CD_SVC varchar(64) not null,
    NA_SVC_SNAP varchar(300) not null,
    ID_PRACT bigint,
    NA_PRACT_SNAP varchar(100),
    DT_START timestamp with time zone not null,
    DT_END timestamp with time zone not null,
    QTY_APPT integer default 1 not null,
    DT_CONFIRMED timestamp with time zone not null,
    DT_CHECKED_IN timestamp with time zone,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    ID_SCHED_SLOT_HOLD bigint,
    SD_BOOKING_SRC varchar(24) default 'WINDOW' not null,
    DT_CANCELLED timestamp with time zone,
    DES_CANCELLATION_REASON varchar(500),
    ID_APPT_RESCHEDULED_FROM bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SC_APPT_PK primary key (ID_APPT),
    constraint UK_SC_APPT_APPOINTMENT_TENANT_ unique (ID_TNT, ID_APPT),
    constraint UK_SC_APPT_APPOINTMENT_NO unique (ID_TNT, CD_APPT_NO),
    constraint UK_SC_APPT_APPOINTMENT_IDEMPOT unique (ID_TNT, CD_IDEMP),
    constraint UK_SC_APPT_APPOINTMENT_SLOT_HO unique (ID_TNT, ID_SCHED_SLOT_HOLD),
    constraint UK_SC_APPT_APPT_RESCHEDULED_FR unique (ID_TNT, ID_APPT_RESCHEDULED_FROM),
    constraint CK_SC_APPT_APPOINTMENT_TIME check (DT_END > DT_START),
    constraint CK_SC_APPT_APPOINTMENT_QUANTIT check (QTY_APPT > 0),
    constraint CK_SC_APPT_APPT_BOOKING_SOURCE check (SD_BOOKING_SRC in ('WINDOW', 'PHONE', 'INTERNAL', 'PATIENT_APP', 'WECHAT', 'THIRD_PARTY'))
);

create table RHN_SC_APPT_EVT (
    ID_APPT_EVT bigint,
    ID_TNT bigint not null,
    ID_APPT bigint not null,
    ID_APPT_REPLACEMENT bigint,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(24),
    SD_STATUS_TO varchar(24) not null,
    CD_COMMAND varchar(128) not null,
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_OCCURRED bigint not null,
    DES_APPT_EVT varchar(1000),
    constraint PK_SC_APPT_EVT_PK primary key (ID_APPT_EVT),
    constraint UK_SC_APPT_EVT_APPT_EVT_TENANT unique (ID_TNT, ID_APPT_EVT),
    constraint UK_SC_APPT_EVT_APPT_EVT_COMMAN unique (ID_TNT, ID_APPT, CD_COMMAND),
    constraint CK_SC_APPT_EVT_APPT_EVT_TYPE check (SD_EVT_TYPE in (
        'BOOKED', 'CANCELLED', 'RESCHEDULED', 'REGISTERED', 'VISITED', 'NO_SHOW'
    )),
    constraint CK_SC_APPT_EVT_APPT_EVT_STATUS check (SD_STATUS_TO in (
        'BOOKED', 'REGISTERED', 'VISITED', 'CANCELLED', 'NO_SHOW'
    ))
);

create table RHN_SC_PAT_REG (
    ID_PAT_REG bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_APPT bigint,
    ID_SVC_SCHED bigint,
    ID_PAT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_ENC bigint not null,
    CD_REG_NO varchar(32) not null,
    CD_IDEMP varchar(128) not null,
    SD_REG_SRC varchar(24) not null,
    SD_VISIT_TYPE varchar(24) not null,
    SD_STATUS varchar(24) not null,
    DT_REGISTERED timestamp with time zone not null,
    ID_USER_REGISTERED bigint not null,
    DT_STARTED timestamp with time zone,
    DT_COMPLETED timestamp with time zone,
    constraint PK_SC_PAT_REG_PK primary key (ID_PAT_REG),
    constraint UK_SC_PAT_REG_REGISTRATION_TEN unique (ID_TNT, ID_PAT_REG),
    constraint UK_SC_PAT_REG_REGISTRATION_NO unique (ID_TNT, CD_REG_NO),
    constraint UK_SC_PAT_REG_REGISTRATION_IDE unique (ID_TNT, CD_IDEMP),
    constraint UK_SC_PAT_REG_REGISTRATION_ENC unique (ID_TNT, ID_ENC),
    constraint UK_SC_PAT_REG_REGISTRATION_APP unique (ID_TNT, ID_APPT)
);

create table RHN_SC_SVC_QUEUE (
    ID_SVC_QUEUE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_SVC_LOC_WAITING bigint,
    CD_SVC_QUEUE varchar(64) not null,
    NA_SVC_QUEUE varchar(100) not null,
    SD_SCENE varchar(32) not null,
    CD_TICKET_PREFIX varchar(8) not null,
    FG_ACTIVE boolean default true not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SC_SVC_QUEUE primary key (ID_SVC_QUEUE),
    constraint UK_SC_SVC_QUEUE_ID unique (ID_TNT, ID_SVC_QUEUE),
    constraint UK_SC_SVC_QUEUE_CODE unique (ID_TNT, CD_SVC_QUEUE),
    constraint CK_SC_SVC_QUEUE_SCENE check (SD_SCENE in ('OUTPATIENT','PHARMACY','LAB_COLLECTION','EXAMINATION'))
);

create table RHN_SC_QUEUE_COUNT (
    ID_QUEUE_COUNT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SVC_QUEUE bigint not null,
    DA_BUSINESS date not null,
    SN_NEXT integer default 1 not null,
    constraint PK_SC_QUEUE_COUNT primary key (ID_QUEUE_COUNT),
    constraint UK_SC_QUEUE_COUNT_BUSINESS unique (ID_TNT, ID_SVC_QUEUE, DA_BUSINESS),
    constraint CK_SC_QUEUE_COUNT_NEXT check (SN_NEXT > 0)
);

create table RHN_SC_QUEUE_TICKET (
    ID_QUEUE_TICKET bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SVC_QUEUE bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    SD_SOURCE_TYPE varchar(24) not null,
    ID_SOURCE bigint not null,
    CD_IDEMP varchar(128) not null,
    DA_BUSINESS date not null,
    CD_TICKET varchar(32) not null,
    SN_SEQUENCE integer not null,
    SN_PRIORITY integer default 0 not null,
    SD_STATUS varchar(24) not null,
    DT_CHECKED_IN timestamp with time zone not null,
    DT_READY timestamp with time zone,
    DT_CALLED timestamp with time zone,
    DT_STARTED timestamp with time zone,
    DT_COMPLETED timestamp with time zone,
    QTY_CALL integer default 0 not null,
    QTY_MISSED integer default 0 not null,
    ID_SVC_LOC_CURRENT bigint,
    constraint PK_SC_QUEUE_TICKET primary key (ID_QUEUE_TICKET),
    constraint UK_SC_QUEUE_TICKET_ID unique (ID_TNT, ID_QUEUE_TICKET),
    constraint UK_SC_QUEUE_TICKET_SOURCE unique (ID_TNT, SD_SOURCE_TYPE, ID_SOURCE),
    constraint UK_SC_QUEUE_TICKET_IDEMP unique (ID_TNT, CD_IDEMP),
    constraint UK_SC_QUEUE_TICKET_SEQ unique (ID_TNT, ID_SVC_QUEUE, DA_BUSINESS, SN_SEQUENCE),
    constraint UK_SC_QUEUE_TICKET_CODE unique (ID_TNT, ID_SVC_QUEUE, DA_BUSINESS, CD_TICKET),
    constraint CK_SC_QUEUE_TICKET_SOURCE check (SD_SOURCE_TYPE in ('PAT_REG','DISP_TASK','DIAG_TASK')),
    constraint CK_SC_QUEUE_TICKET_STATUS check (SD_STATUS in ('WAITING','CALLED','SERVING','SUSPENDED','MISSED','COMPLETED','CANCELLED')),
    constraint CK_SC_QUEUE_TICKET_PRIORITY check (SN_PRIORITY >= 0),
    constraint CK_SC_QUEUE_TICKET_COUNTS check (QTY_CALL >= 0 and QTY_MISSED >= 0)
);

create table RHN_SC_QUEUE_TICKET_EVT (
    ID_QUEUE_TICKET_EVT bigint,
    ID_TNT bigint not null,
    ID_QUEUE_TICKET bigint not null,
    SD_EVT_TYPE varchar(24) not null,
    SD_STATUS_FROM varchar(24),
    SD_STATUS_TO varchar(24) not null,
    CD_COMMAND varchar(128) not null,
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_OCCURRED bigint not null,
    ID_SVC_LOC bigint,
    DES_QUEUE_TICKET_EVT varchar(500),
    constraint PK_SC_QUEUE_TICKET_EVT primary key (ID_QUEUE_TICKET_EVT),
    constraint UK_SC_QUEUE_TICKET_EVT_CMD unique (ID_TNT, CD_COMMAND)
);

create table RHN_SC_SCHED_EXCEPT (
    ID_SCHED_EXCEPT bigint,
    ID_TNT bigint not null,
    ID_SCHED_TMPL bigint not null,
    DA_EXCEPT date not null,
    SD_EXCEPT_TYPE varchar(32) not null,
    QTY_MINUTE_START integer,
    QTY_MINUTE_END integer,
    QTY_CAPACITY integer,
    QTY_SLOT_MINUTES integer,
    DES_REASON varchar(500) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_SC_SCHED_EXCEPT_PK primary key (ID_SCHED_EXCEPT),
    constraint UK_SC_SCHED_EXCEP_SCHED_EXCEPT unique (ID_TNT, ID_SCHED_EXCEPT),
    constraint UK_SC_SCHED_EXCEP_SCHED_EXCE_1 unique (ID_TNT, ID_SCHED_TMPL, DA_EXCEPT),
    constraint CK_SC_SCHED_EXCEP_SCHED_EXCEPT check (SD_EXCEPT_TYPE in ('CLOSED', 'OVERRIDE')),
    constraint CK_SC_SCHED_EXCEP_SCHED_EXCE_1 check ((SD_EXCEPT_TYPE = 'CLOSED' and QTY_MINUTE_START is null and QTY_MINUTE_END is null
            and QTY_CAPACITY is null and QTY_SLOT_MINUTES is null)
        or (SD_EXCEPT_TYPE = 'OVERRIDE' and QTY_MINUTE_START between 0 and 1439
            and QTY_MINUTE_END between 1 and 1439 and QTY_MINUTE_END > QTY_MINUTE_START
            and QTY_CAPACITY between 1 and 500
            and (QTY_SLOT_MINUTES is null or QTY_SLOT_MINUTES between 5 and 120)))
);

create table RHN_SC_SCHED_GEN_RUN (
    ID_SCHED_GEN_RUN bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SCHED_TMPL bigint not null,
    CD_IDEMP varchar(128) not null,
    DA_DATE_FROM date not null,
    DA_DATE_TO date not null,
    SD_TRIGGER_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    QTY_GENERATED integer default 0 not null,
    QTY_SKIPPED integer default 0 not null,
    JSON_REQ text not null,
    DT_STARTED timestamp with time zone not null,
    DT_COMPLETED timestamp with time zone,
    DES_ERROR_MSG varchar(1000),
    ID_USER_TRIGGERED bigint not null,
    constraint PK_SC_SCHED_GEN_RUN_PK primary key (ID_SCHED_GEN_RUN),
    constraint UK_SC_SCHED_GEN_R_SCHED_RUN_TE unique (ID_TNT, ID_SCHED_GEN_RUN),
    constraint UK_SC_SCHED_GEN_R_SCHED_RUN_RE unique (ID_TNT, CD_IDEMP),
    constraint CK_SC_SCHED_GEN_R_SCHED_RUN_PE check (DA_DATE_TO >= DA_DATE_FROM),
    constraint CK_SC_SCHED_GEN_R_SCHED_RUN_TR check (SD_TRIGGER_TYPE in ('QUICK_CREATE', 'MANUAL', 'AUTOMATIC')),
    constraint CK_SC_SCHED_GEN_R_SCHED_RUN_ST check (SD_STATUS in ('RUNNING', 'COMPLETED', 'FAILED')),
    constraint CK_SC_SCHED_GEN_R_SCHED_RUN_CO check (QTY_GENERATED >= 0 and QTY_SKIPPED >= 0)
);

create table RHN_SC_SCHED_SLOT_HOLD (
    ID_SCHED_SLOT_HOLD bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SCHED_SLOT_POOL bigint not null,
    ID_SVC_SCHED bigint not null,
    ID_PAT bigint not null,
    CD_IDEMP varchar(128) not null,
    QTY_HELD integer default 1 not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    DT_EXPIRES timestamp with time zone not null,
    DT_CLOSED timestamp with time zone,
    ID_PAT_REG_CONSUMED bigint,
    constraint PK_SC_SCHED_SLOT_HOLD_PK primary key (ID_SCHED_SLOT_HOLD),
    constraint UK_SC_SCHED_SLOT_SLOT_HOLD_TEN unique (ID_TNT, ID_SCHED_SLOT_HOLD),
    constraint UK_SC_SCHED_SLOT_SLOT_HOLD_COM unique (ID_TNT, CD_IDEMP),
    constraint CK_SC_SCHED_SLOT_SLOT_HOLD_QUA check (QTY_HELD = 1),
    constraint CK_SC_SCHED_SLOT_SLOT_HOLD_STA check (SD_STATUS in ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
    constraint CK_SC_SCHED_SLOT_SLOT_HOLD_EXP check (DT_EXPIRES > DT_CREATED)
);

create table RHN_SC_SCHED_SLOT_POOL (
    ID_SCHED_SLOT_POOL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SVC_SCHED bigint not null,
    CD_POOL varchar(128) not null,
    SD_SLOT_MODE varchar(32) not null,
    SD_QUOTA_MODE varchar(32) not null,
    QTY_TOTAL integer not null,
    QTY_HELD integer default 0 not null,
    QTY_OCCUPIED integer default 0 not null,
    QTY_FROZEN integer default 0 not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_SC_SCHED_SLOT_POOL_PK primary key (ID_SCHED_SLOT_POOL),
    constraint UK_SC_SCHED_SLOT_SCHED_POOL_TE unique (ID_TNT, ID_SCHED_SLOT_POOL),
    constraint UK_SC_SCHED_SLOT_SCHED_POOL_SC unique (ID_TNT, ID_SVC_SCHED),
    constraint UK_SC_SCHED_SLOT_SCHED_POOL_CO unique (ID_TNT, CD_POOL),
    constraint CK_SC_SCHED_SLOT_SCHED_POOL_SL check (SD_SLOT_MODE in ('POOL', 'TIMED')),
    constraint CK_SC_SCHED_SLOT_SCHED_POOL_QU check (SD_QUOTA_MODE in ('SHARED', 'CHANNEL_QUOTA')),
    constraint CK_SC_SCHED_SLOT_SCHED_POOL_CO check (QTY_TOTAL > 0 and QTY_HELD >= 0 and QTY_OCCUPIED >= 0 and QTY_FROZEN >= 0
        and QTY_HELD + QTY_OCCUPIED + QTY_FROZEN <= QTY_TOTAL),
    constraint CK_SC_SCHED_SLOT_SCHED_POOL_ST check (SD_STATUS in ('ACTIVE', 'FROZEN', 'CLOSED'))
);

create table RHN_SC_SCHED_TMPL (
    ID_SCHED_TMPL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SVC_RSRC bigint not null,
    CD_TMPL varchar(128) not null,
    NA_TMPL varchar(300) not null,
    SD_MGMT_MODE varchar(32) not null,
    CD_TIMEZONE varchar(64) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SC_SCHED_TMPL_PK primary key (ID_SCHED_TMPL),
    constraint UK_SC_SCHED_TMPL_SCHED_TEMPLAT unique (ID_TNT, ID_SCHED_TMPL),
    constraint UK_SC_SCHED_TMPL_SCHED_TEMPL_1 unique (ID_TNT, CD_TMPL),
    constraint CK_SC_SCHED_TMPL_SCHED_TEMPLAT check (SD_MGMT_MODE in ('SIMPLE', 'PROFESSIONAL')),
    constraint CK_SC_SCHED_TMPL_SCHED_TEMPL_1 check (SD_STATUS in ('DRAFT', 'ACTIVE', 'INACTIVE')),
    constraint CK_SC_SCHED_TMPL_SCHED_TEMPL_2 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SC_SCHED_TMPL_PERIOD (
    ID_SCHED_TMPL_PERIOD bigint,
    ID_TNT bigint not null,
    ID_SCHED_TMPL bigint not null,
    SD_DAY_OF_WEEK integer not null,
    SD_DAY_PART varchar(32) not null,
    QTY_MINUTE_START integer not null,
    QTY_MINUTE_END integer not null,
    QTY_DEFAULT_CAPACITY integer not null,
    SD_SLOT_MODE varchar(32) not null,
    FG_ACTIVE boolean default true not null,
    QTY_SLOT_MINUTES integer,
    constraint PK_SC_SCHED_TMPL_PERIOD_PK primary key (ID_SCHED_TMPL_PERIOD),
    constraint UK_SC_SCHED_TMPL_SCHED_PERIOD_ unique (ID_TNT, ID_SCHED_TMPL_PERIOD),
    constraint UK_SC_SCHED_TMPL_SCHED_PERIO_1 unique (ID_TNT, ID_SCHED_TMPL, SD_DAY_OF_WEEK, SD_DAY_PART),
    constraint CK_SC_SCHED_TMPL_SCHED_PERIOD_ check (SD_DAY_OF_WEEK between 1 and 7),
    constraint CK_SC_SCHED_TMPL_SCHED_PERIO_1 check (SD_DAY_PART in ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM')),
    constraint CK_SC_SCHED_TMPL_SCHED_PERIO_2 check (QTY_MINUTE_START between 0 and 1439 and QTY_MINUTE_END between 1 and 1440 and QTY_MINUTE_END > QTY_MINUTE_START),
    constraint CK_SC_SCHED_TMPL_SCHED_PERIO_3 check (QTY_DEFAULT_CAPACITY > 0),
    constraint CK_SC_SCHED_TMPL_SCHED_PERIO_4 check (SD_SLOT_MODE in ('POOL', 'TIMED')),
    constraint CK_SC_SCHED_TMPL_SCHED_PERIO_5 check (QTY_SLOT_MINUTES is null or QTY_SLOT_MINUTES between 5 and 120)
);

create table RHN_SC_SLOT_EVT (
    ID_SLOT_EVT bigint,
    ID_TNT bigint not null,
    ID_SCHED_SLOT_POOL bigint not null,
    ID_SVC_SCHED bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SN_SEQUENCE integer not null,
    QTY_TOTAL_DELTA integer default 0 not null,
    QTY_HELD_DELTA integer default 0 not null,
    QTY_OCCUPIED_DELTA integer default 0 not null,
    QTY_FROZEN_DELTA integer default 0 not null,
    CD_COMMAND varchar(128) not null,
    ID_USER_ACTOR bigint not null,
    DT_OCCURRED timestamp with time zone not null,
    DES_SLOT_EVT varchar(1000),
    constraint PK_SC_SLOT_EVT_PK primary key (ID_SLOT_EVT),
    constraint UK_SC_SLOT_EVT_SLOT_EVENT_SEQU unique (ID_TNT, ID_SCHED_SLOT_POOL, SN_SEQUENCE),
    constraint UK_SC_SLOT_EVT_SLOT_EVENT_COMM unique (ID_TNT, ID_SCHED_SLOT_POOL, CD_COMMAND),
    constraint CK_SC_SLOT_EVT_SLOT_EVENT_TYPE check (SD_EVT_TYPE in ('INITIALIZED', 'CAPACITY_CHANGED', 'HELD', 'RELEASED', 'OCCUPIED', 'CANCELLED', 'FROZEN', 'UNFROZEN'))
);

create table RHN_SC_SVC_SCHED (
    ID_SVC_SCHED bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SVC_RSRC bigint not null,
    ID_SCHED_TMPL bigint not null,
    ID_SCHED_TMPL_PERIOD bigint not null,
    ID_SCHED_GEN_RUN bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_PRACT bigint,
    ID_STAFF_ASSIGN bigint,
    ID_CATALOG_ITEM bigint not null,
    CD_SCHED varchar(128) not null,
    SD_MGMT_MODE varchar(32) not null,
    SD_SCHED_TYPE varchar(32) not null,
    SD_BOOKING_POLICY varchar(32) not null,
    SD_DAY_PART varchar(32) not null,
    NA_PRACT_SNAP varchar(100),
    CD_SVC_SNAP varchar(64) not null,
    NA_SVC_SNAP varchar(300) not null,
    NA_LOC varchar(200),
    CD_TIMEZONE varchar(64) not null,
    DA_SVC date not null,
    DT_START timestamp with time zone not null,
    DT_END timestamp with time zone not null,
    QTY_TOTAL_CAPACITY integer not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    SD_REG_SCOPE varchar(24) default 'PRACTITIONER' not null,
    constraint PK_SC_SVC_SCHED_PK primary key (ID_SVC_SCHED),
    constraint UK_SC_SVC_SCHED_SERVICE_SCHEDU unique (ID_TNT, ID_SVC_SCHED),
    constraint UK_SC_SVC_SCHED_SERVICE_SCHE_1 unique (ID_TNT, CD_SCHED),
    constraint UK_SC_SVC_SCHED_SERVICE_SCHE_2 unique (ID_TNT, ID_SVC_RSRC, DT_START, DT_END),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHEDU check (SD_MGMT_MODE in ('SIMPLE', 'PROFESSIONAL')),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_1 check (SD_SCHED_TYPE in ('OUTPATIENT', 'HOME_VISIT', 'REMOTE')),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_2 check (SD_BOOKING_POLICY in ('SHARED', 'CHANNEL_QUOTA')),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_3 check (SD_DAY_PART in ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM')),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_4 check (DT_END > DT_START),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_5 check (QTY_TOTAL_CAPACITY > 0),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_6 check (SD_STATUS in ('PUBLISHED', 'SUSPENDED', 'CANCELLED', 'COMPLETED')),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_7 check (SD_REG_SCOPE in ('PRACTITIONER', 'DEPARTMENT')),
    constraint CK_SC_SVC_SCHED_SERVICE_SCHE_8 check ((SD_REG_SCOPE = 'PRACTITIONER' and ID_PRACT is not null and ID_STAFF_ASSIGN is not null
            and NA_PRACT_SNAP is not null)
        or (SD_REG_SCOPE = 'DEPARTMENT' and ID_PRACT is null and ID_STAFF_ASSIGN is null
            and NA_PRACT_SNAP is null))
);

create table RHN_SC_SVC_SCHED_EVT (
    ID_SVC_SCHED_EVT bigint,
    ID_TNT bigint not null,
    ID_SVC_SCHED bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    ID_USER_ACTOR bigint not null,
    DT_OCCURRED timestamp with time zone not null,
    DES_SVC_SCHED_EVT varchar(1000),
    constraint PK_SC_SVC_SCHED_EVT_PK primary key (ID_SVC_SCHED_EVT),
    constraint UK_SC_SVC_SCHED_E_SCHED_EVENT_ unique (ID_TNT, ID_SVC_SCHED, CD_COMMAND)
);

create table RHN_SUP_DISP_ROUTE (
    ID_DISP_ROUTE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    CD_DISP_ROUTE varchar(64) not null,
    NA_DISP_ROUTE varchar(200) not null,
    ID_DEPT_SRC bigint,
    SD_MED_TYPE varchar(32),
    ID_STOCK_SITE_TARGET bigint not null,
    FG_ACTIVE boolean not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DES_DISP_ROUTE varchar(1000),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    SD_CARE_SETTING varchar(32) not null,
    constraint PK_SUP_DISP_ROUTE_PK primary key (ID_DISP_ROUTE),
    constraint UK_SUP_DISP_ROUTE_DISPENSE_ROU unique (ID_TNT, ID_DISP_ROUTE),
    constraint UK_SUP_DISP_ROUTE_DISPENSE_R_1 unique (ID_TNT, ID_ORG, CD_DISP_ROUTE),
    constraint CK_SUP_DISP_ROUTE_DISPENSE_ROU check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_SUP_DISP_ROUTE_DISP_ROUTE_C check (SD_CARE_SETTING in ('OUTPATIENT', 'EMERGENCY', 'INPATIENT', 'HOME_CARE'))
);

create table RHN_SUP_DISP_TASK (
    ID_DISP_TASK bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_PHARM_REVIEW_LATEST bigint,
    CD_TASK_NO varchar(64) not null,
    SD_TASK_TYPE varchar(32) not null,
    SD_PRIORITY varchar(32) not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    DT_DUE timestamp with time zone,
    DT_PICKED timestamp with time zone,
    ID_ASSIGNED_PRACT bigint,
    DES_DISP_TASK varchar(1000),
    ID_PICKED_BY_USER bigint,
    ID_PICKED_ASSIGN bigint,
    DES_PICK_DESCRIPTION varchar(1000),
    constraint PK_SUP_DISP_TASK_PK primary key (ID_DISP_TASK),
    constraint UK_SUP_DISP_TASK_DISPENSE_TASK unique (ID_TNT, ID_DISP_TASK),
    constraint UK_SUP_DISP_TASK_DISPENSE_TA_1 unique (ID_TNT, CD_TASK_NO),
    constraint CK_SUP_DISP_TASK_DISPENSE_TASK check (SD_TASK_TYPE in ('OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'DELIVERY')),
    constraint CK_SUP_DISP_TASK_DISPENSE_TA_1 check (SD_PRIORITY in ('ROUTINE', 'URGENT', 'STAT'))
);

create table RHN_SUP_DISP_TASK_LINE (
    ID_DISP_TASK_LINE bigint,
    ID_TNT bigint not null,
    ID_DISP_TASK bigint not null,
    ID_CARE_REQ bigint not null,
    SN_SORT int not null,
    ID_STOCK_ITEM bigint not null,
    ID_ITEM_PKG bigint not null,
    QTY_REQUESTED decimal(28,8) not null,
    QTY_PLANNED decimal(28,8) not null,
    QTY_DISPENSED decimal(28,8) default 0 not null,
    QTY_RETURNED decimal(28,8) default 0 not null,
    CD_DISP_UNIT varchar(64) not null,
    BASE_QUANTITY_FACTOR decimal(28,8) not null,
    FG_SPLIT boolean not null,
    FG_TRACE_REQUIRED boolean not null,
    SD_STATUS varchar(32) not null,
    CD_PRODUCT_SNAP varchar(64) not null,
    NA_PRODUCT_SNAP varchar(300) not null,
    PACKAGE_SPEC_SNAPSHOT varchar(300),
    JSON_ITEM_ATTR_SNAP text not null,
    HASH_ITEM_ATTR varchar(64) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    SD_FULFILL_SRC_TYPE varchar(32) not null,
    ID_FULFILL_SRC bigint not null,
    constraint PK_SUP_DISP_TASK_LINE_PK primary key (ID_DISP_TASK_LINE),
    constraint UK_SUP_DISP_TASK_DISPENSE_LINE unique (ID_TNT, ID_DISP_TASK_LINE),
    constraint UK_SUP_DISP_TASK_DISPENSE_LI_1 unique (ID_TNT, ID_DISP_TASK, SN_SORT),
    constraint UK_SUP_DISP_TASK_DISP_LINE_ID_ unique (ID_TNT, ID_DISP_TASK_LINE, ID_CARE_REQ),
    constraint UK_SUP_DISP_TASK_DTL_FULFILL_S unique (ID_TNT, SD_FULFILL_SRC_TYPE, ID_FULFILL_SRC),
    constraint CK_SUP_DISP_TASK_DISPENSE_LINE check (QTY_REQUESTED > 0 and QTY_PLANNED > 0 and QTY_DISPENSED >= 0 and QTY_RETURNED >= 0),
    constraint CK_SUP_DISP_TASK_DISPENSE_LI_1 check (BASE_QUANTITY_FACTOR > 0),
    constraint CK_SUP_DISP_TASK_DTL_FULFILL_S check (SD_FULFILL_SRC_TYPE in ('MEDICATION_REQUEST', 'INPATIENT_SUPPLY_LINE'))
);

create table RHN_SUP_GOOD_RCPT (
    ID_GOOD_RCPT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_PURCH_ORDER bigint not null,
    ID_SUPPL bigint not null,
    CD_RCPT_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    CD_DELIV_NOTE_NO varchar(128),
    SD_STATUS varchar(32) not null,
    DT_RECEIVED timestamp with time zone not null,
    ID_USER_RECEIVED bigint not null,
    DT_INSPECTED timestamp with time zone,
    ID_USER_INSPECTED bigint,
    DT_POSTED timestamp with time zone,
    ID_USER_POSTED bigint,
    DES_GOOD_RCPT varchar(1000),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_GOOD_RCPT_PK primary key (ID_GOOD_RCPT),
    constraint UK_SUP_GOOD_RCPT_GR_TENANT_ID unique (ID_TNT, ID_GOOD_RCPT),
    constraint UK_SUP_GOOD_RCPT_GR_NO unique (ID_TNT, CD_RCPT_NO),
    constraint UK_SUP_GOOD_RCPT_GR_REQUEST unique (ID_TNT, CD_REQ),
    constraint CK_SUP_GOOD_RCPT_GR_STATUS check (SD_STATUS in ('RECEIVED', 'INSPECTING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'POSTED', 'CANCELLED'))
);

create table RHN_SUP_GOOD_RCPT_LINE (
    ID_GOOD_RCPT_LINE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_GOOD_RCPT bigint not null,
    ID_PURCH_ORDER_LINE bigint not null,
    SN_SORT int not null,
    ID_STOCK_ITEM bigint not null,
    ID_ITEM_PKG bigint not null,
    ID_STOCK_BIN_DESTINATION bigint not null,
    CD_LOT_NO varchar(128) not null,
    DA_PRODUCTION date,
    DA_EXPIRY date,
    QTY_DELIVERED decimal(28,8) not null,
    QTY_ACCEPTED decimal(28,8),
    QTY_REJECTED decimal(28,8),
    PRICE_UNIT_COST decimal(24,6) not null,
    SD_QUALITY_STATUS varchar(32) not null,
    DES_REJECTION_REASON varchar(1000),
    ID_STOCK_LOT bigint,
    ID_INV_TXN bigint,
    constraint PK_SUP_GOOD_RCPT_LINE_PK primary key (ID_GOOD_RCPT_LINE),
    constraint UK_SUP_GOOD_RCPT_GR_LINE_TENAN unique (ID_TNT, ID_GOOD_RCPT_LINE),
    constraint UK_SUP_GOOD_RCPT_GR_LINE_ORDER unique (ID_TNT, ID_GOOD_RCPT, SN_SORT),
    constraint CK_SUP_GOOD_RCPT_GR_LINE_QUANT check (QTY_DELIVERED > 0 and (QTY_ACCEPTED is null or QTY_ACCEPTED >= 0) and (QTY_REJECTED is null or QTY_REJECTED >= 0)),
    constraint CK_SUP_GOOD_RCPT_GR_LINE_COST check (PRICE_UNIT_COST >= 0),
    constraint CK_SUP_GOOD_RCPT_GR_LINE_DATES check (DA_EXPIRY is null or DA_PRODUCTION is null or DA_EXPIRY >= DA_PRODUCTION),
    constraint CK_SUP_GOOD_RCPT_GR_LINE_QUALI check (SD_QUALITY_STATUS in ('PENDING', 'QUALIFIED', 'REJECTED', 'QUARANTINE'))
);

create table RHN_SUP_INP_MED_CONSUME (
    ID_INP_MED_CONSUME bigint,
    ID_TNT bigint not null,
    ID_CARE_REQ bigint not null,
    SD_CONSUMER_TYPE varchar(32) not null,
    ID_INP_ORDER_TASK bigint not null,
    ID_DISP_TASK_LINE_DISP bigint not null,
    ID_MED_DISP bigint not null,
    ID_MED_DISP_LINE bigint not null,
    QTY_CONSUMED decimal(28,8) not null,
    CD_DISP_UNIT varchar(64) not null,
    QTY_CONSUMED_BASE decimal(28,8) not null,
    CD_BASE_UNIT varchar(64) not null,
    CD_COMMAND varchar(128) not null,
    DT_CONSUMED timestamp with time zone not null,
    ID_USER_CONSUMED bigint not null,
    constraint PK_SUP_INP_MED_CONSUME_PK primary key (ID_INP_MED_CONSUME),
    constraint UK_SUP_INP_MED_CO_MED_CONS_TEN unique (ID_TNT, ID_INP_MED_CONSUME),
    constraint UK_SUP_INP_MED_CO_MED_CONS_CON unique (ID_TNT, SD_CONSUMER_TYPE, ID_INP_ORDER_TASK, ID_MED_DISP_LINE),
    constraint UK_SUP_INP_MED_CO_MED_CONS_COM unique (ID_TNT, CD_COMMAND, ID_MED_DISP_LINE),
    constraint CK_SUP_INP_MED_CO_MED_CONSUMER check (SD_CONSUMER_TYPE in ('INPATIENT_ORDER_TASK')),
    constraint CK_SUP_INP_MED_CO_MED_CONS_QUA check (QTY_CONSUMED > 0 and QTY_CONSUMED_BASE > 0)
);

create table RHN_SUP_INP_MED_SUPPLY_BATCH (
    ID_INP_MED_SUPPLY_BATCH bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_DEPT_NURS_UNIT bigint not null,
    CD_BATCH_NO varchar(64) not null,
    SD_BATCH_TYPE varchar(32) not null,
    SD_SUPPLY_MODE varchar(32) not null,
    DT_WINDOW_START timestamp with time zone not null,
    DT_WINDOW_END timestamp with time zone not null,
    DT_CUTOFF timestamp with time zone not null,
    SD_STATUS varchar(32) not null,
    CD_GEN_COMMAND varchar(128) not null,
    HASH_GEN_PAYLOAD varchar(64) not null,
    CD_SUBMIT_COMMAND varchar(128),
    HASH_SUBMIT_PAYLOAD varchar(64),
    CD_CANCEL_COMMAND varchar(128),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_SUBMITTED timestamp with time zone,
    ID_USER_SUBMITTED bigint,
    DT_CANCELLED timestamp with time zone,
    ID_USER_CANCELLED bigint,
    DES_CANCEL_REASON varchar(1000),
    DT_CLOSED timestamp with time zone,
    ID_USER_CLOSED bigint,
    SD_GEN_TRIGGER varchar(16) default 'MANUAL' not null,
    ID_DISP_ROUTE bigint,
    SN_DISP_ROUTE_VER bigint,
    SD_MED_TYPE_SNAP varchar(32),
    constraint PK_SUP_INP_MED_SUPPLY_BATCH_PK primary key (ID_INP_MED_SUPPLY_BATCH),
    constraint UK_SUP_INP_MED_SU_IPMSB_TENANT unique (ID_TNT, ID_INP_MED_SUPPLY_BATCH),
    constraint UK_SUP_INP_MED_SU_IPMSB_BATCH_ unique (ID_TNT, CD_BATCH_NO),
    constraint UK_SUP_INP_MED_SU_IPMSB_GEN_CM unique (ID_TNT, CD_GEN_COMMAND),
    constraint UK_SUP_INP_MED_SU_IPMSB_SUBMIT unique (ID_TNT, CD_SUBMIT_COMMAND),
    constraint UK_SUP_INP_MED_SU_IPMSB_CANCEL unique (ID_TNT, CD_CANCEL_COMMAND),
    constraint UK_SUP_INP_MED_SU_IPMSB_WINDOW unique (ID_TNT, HASH_GEN_PAYLOAD),
    constraint CK_SUP_INP_MED_SU_IPMSB_TYPE check (SD_BATCH_TYPE in ('DAILY', 'AD_HOC')),
    constraint CK_SUP_INP_MED_SU_IPMSB_MODE check (SD_SUPPLY_MODE in ('UNIT_DOSE', 'WHOLE_PACKAGE', 'WARD_STOCK')),
    constraint CK_SUP_INP_MED_SU_IPMSB_STATUS check (SD_STATUS in ('DRAFT', 'SUBMITTED', 'CANCELLED', 'CLOSED')),
    constraint CK_SUP_INP_MED_SU_IPMSB_WINDOW check (DT_WINDOW_END > DT_WINDOW_START and DT_CUTOFF <= DT_WINDOW_END),
    constraint CK_SUP_INP_MED_SU_IPMSB_CANCEL check ((SD_STATUS <> 'CANCELLED' and DT_CANCELLED is null and ID_USER_CANCELLED is null
            and CD_CANCEL_COMMAND is null and DES_CANCEL_REASON is null)
        or (SD_STATUS = 'CANCELLED' and DT_CANCELLED is not null and ID_USER_CANCELLED is not null
            and CD_CANCEL_COMMAND is not null and DES_CANCEL_REASON is not null)),
    constraint CK_SUP_INP_MED_SU_IPMSB_CLOSE check ((SD_STATUS <> 'CLOSED' and DT_CLOSED is null and ID_USER_CLOSED is null)
        or (SD_STATUS = 'CLOSED' and DT_CLOSED is not null and ID_USER_CLOSED is not null)),
    constraint CK_SUP_INP_MED_SU_IPMSB_TRIGGE check (SD_GEN_TRIGGER in ('MANUAL', 'AUTO')),
    constraint CK_SUP_INP_MED_SU_IPMSB_ACTOR check ((SD_GEN_TRIGGER = 'MANUAL' and ID_USER_CREATED is not null)
        or (SD_GEN_TRIGGER = 'AUTO' and ID_USER_CREATED is null)),
    constraint CK_SUP_INP_MED_SU_IPMSB_ROUTE_ check ((ID_DISP_ROUTE is null and SN_DISP_ROUTE_VER is null and SD_MED_TYPE_SNAP is null
        and SD_GEN_TRIGGER = 'MANUAL')
    or (ID_DISP_ROUTE is not null and SN_DISP_ROUTE_VER is not null
        and SD_MED_TYPE_SNAP is not null))
);

create table RHN_SUP_INP_MED_SUPPLY_GEN_RUN (
    ID_INP_MED_SUPPLY_GEN_RUN bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint,
    ID_DEPT_NURS_UNIT bigint not null,
    ID_DISP_ROUTE bigint,
    SN_DISP_ROUTE_VER bigint,
    DA_BUSINESS date not null,
    CD_SHIFT varchar(16) not null,
    DT_WINDOW_START timestamp with time zone not null,
    DT_WINDOW_END timestamp with time zone not null,
    CD_JOB_KEY varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    SD_TRIGGER_TYPE varchar(16) not null,
    SD_STATUS varchar(16) not null,
    QTY_ATTEMPT integer default 0 not null,
    DT_NEXT_ATTEMPT timestamp with time zone not null,
    ID_USER_CLAIMED varchar(100),
    DT_CLAIMED_UNTIL timestamp with time zone,
    ID_INP_MED_SUPPLY_BATCH bigint,
    DES_LAST_ERROR varchar(1000),
    DT_CREATED timestamp with time zone not null,
    DT_STARTED timestamp with time zone,
    DT_COMPLETED timestamp with time zone,
    DT_UPDATED timestamp with time zone not null,
    SD_MED_TYPE_SNAP varchar(32) default '*' not null,
    CD_LAST_ERROR varchar(64),
    constraint PK_SUP_INP_MED_SU_PK primary key (ID_INP_MED_SUPPLY_GEN_RUN),
    constraint UK_SUP_INP_MED_SU_IPMSGR_TENAN unique (ID_TNT, ID_INP_MED_SUPPLY_GEN_RUN),
    constraint UK_SUP_INP_MED_SU_IPMSGR_JOB unique (ID_TNT, CD_JOB_KEY),
    constraint UK_SUP_INP_MED_SU_IPMSGR_COMMA unique (ID_TNT, CD_COMMAND),
    constraint CK_SUP_INP_MED_SU_IPMSGR_SHIFT check (CD_SHIFT in ('NIGHT', 'DAY', 'EVENING')),
    constraint CK_SUP_INP_MED_SU_IPMSGR_TRIGG check (SD_TRIGGER_TYPE in ('AUTO')),
    constraint CK_SUP_INP_MED_SU_IPMSGR_WINDO check (DT_WINDOW_END > DT_WINDOW_START),
    constraint CK_SUP_INP_MED_SU_IPMSGR_ROUTE check ((SD_STATUS = 'ROUTING_BLOCKED' and ID_STOCK_SITE is null and ID_DISP_ROUTE is null
        and SN_DISP_ROUTE_VER is null and CD_LAST_ERROR is not null)
    or (SD_STATUS <> 'ROUTING_BLOCKED' and ID_STOCK_SITE is not null and ID_DISP_ROUTE is not null
        and SN_DISP_ROUTE_VER is not null))
);

create table RHN_SUP_INP_MED_SUPPLY_LINE (
    ID_INP_MED_SUPPLY_LINE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_INP_MED_SUPPLY_BATCH bigint not null,
    ID_CARE_REQ bigint not null,
    ID_ENC bigint not null,
    ID_PAT bigint not null,
    CD_BED_SNAP varchar(64) not null,
    NA_PAT_SNAP varchar(200) not null,
    CD_MED_SNAP varchar(128) not null,
    NA_MED_SNAP varchar(500) not null,
    QTY_REQUESTED decimal(28,8) not null,
    CD_QUANTITY_UNIT varchar(64) not null,
    QTY_REQUESTED_BASE decimal(28,8) not null,
    CD_BASE_UNIT varchar(64) not null,
    QTY_OCCURRENCE integer not null,
    SD_STATUS varchar(32) not null,
    ID_DISP_TASK_LINE bigint,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_SUBMITTED timestamp with time zone,
    ID_USER_SUBMITTED bigint,
    DT_TAKEN timestamp with time zone,
    ID_USER_TAKEN bigint,
    DT_CANCELLED timestamp with time zone,
    ID_USER_CANCELLED bigint,
    DES_CANCEL_REASON varchar(1000),
    constraint PK_SUP_INP_MED_SUPPLY_LINE_PK primary key (ID_INP_MED_SUPPLY_LINE),
    constraint UK_SUP_INP_MED_SU_IPMSL_TENANT unique (ID_TNT, ID_INP_MED_SUPPLY_LINE),
    constraint UK_SUP_INP_MED_SU_IPMSL_ID_REQ unique (ID_TNT, ID_INP_MED_SUPPLY_LINE, ID_CARE_REQ),
    constraint UK_SUP_INP_MED_SU_IPMSL_BATCH_ unique (ID_TNT, ID_INP_MED_SUPPLY_BATCH, ID_CARE_REQ),
    constraint UK_SUP_INP_MED_SU_IPMSL_DISP_L unique (ID_TNT, ID_DISP_TASK_LINE),
    constraint CK_SUP_INP_MED_SU_IPMSL_QUANTI check (QTY_REQUESTED > 0 and QTY_REQUESTED_BASE > 0 and QTY_OCCURRENCE > 0),
    constraint CK_SUP_INP_MED_SU_IPMSL_STATUS check (SD_STATUS in ('DRAFT', 'SUBMITTED', 'INTAKEN', 'CANCELLED')),
    constraint CK_SUP_INP_MED_SU_IPMSL_INTAKE check ((SD_STATUS <> 'INTAKEN' and ID_DISP_TASK_LINE is null and DT_TAKEN is null and ID_USER_TAKEN is null)
        or (SD_STATUS = 'INTAKEN' and ID_DISP_TASK_LINE is not null and DT_TAKEN is not null
            and ID_USER_TAKEN is not null)),
    constraint CK_SUP_INP_MED_SU_IPMSL_CANCEL check ((SD_STATUS <> 'CANCELLED' and DT_CANCELLED is null and ID_USER_CANCELLED is null and DES_CANCEL_REASON is null)
        or (SD_STATUS = 'CANCELLED' and DT_CANCELLED is not null and ID_USER_CANCELLED is not null
            and DES_CANCEL_REASON is not null))
);

create table RHN_SUP_INP_MED_SUPPLY_TASK (
    ID_INP_MED_SUPPLY_TASK bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_INP_MED_SUPPLY_LINE bigint not null,
    ID_CARE_REQ bigint not null,
    ID_INP_ORDER_TASK bigint not null,
    DT_SCHEDULED timestamp with time zone not null,
    QTY_REQUIRED decimal(28,8) not null,
    CD_QUANTITY_UNIT varchar(64) not null,
    QTY_REQUIRED_BASE decimal(28,8) not null,
    CD_BASE_UNIT varchar(64) not null,
    SD_STATUS varchar(32) not null,
    ACTIVE_SLOT smallint,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_CANCELLED timestamp with time zone,
    ID_USER_CANCELLED bigint,
    DES_CANCEL_REASON varchar(1000),
    constraint PK_SUP_INP_MED_SUPPLY_TASK_PK primary key (ID_INP_MED_SUPPLY_TASK),
    constraint UK_SUP_INP_MED_SU_IPMST_TENANT unique (ID_TNT, ID_INP_MED_SUPPLY_TASK),
    constraint UK_SUP_INP_MED_SU_IPMST_LINE_T unique (ID_TNT, ID_INP_MED_SUPPLY_LINE, ID_INP_ORDER_TASK),
    constraint UK_SUP_INP_MED_SU_IPMST_ACTIVE unique (ID_TNT, ID_INP_ORDER_TASK, ACTIVE_SLOT),
    constraint CK_SUP_INP_MED_SU_IPMST_QUANTI check (QTY_REQUIRED > 0 and QTY_REQUIRED_BASE > 0),
    constraint CK_SUP_INP_MED_SU_IPMST_STATUS check (SD_STATUS in ('ACTIVE', 'CANCELLED')),
    constraint CK_SUP_INP_MED_SU_IPMST_ACTIVE check ((SD_STATUS = 'ACTIVE' and ACTIVE_SLOT = 1 and DT_CANCELLED is null and ID_USER_CANCELLED is null
            and DES_CANCEL_REASON is null)
        or (SD_STATUS = 'CANCELLED' and ACTIVE_SLOT is null and DT_CANCELLED is not null
            and ID_USER_CANCELLED is not null and DES_CANCEL_REASON is not null))
);

create table RHN_SUP_INV_BAL (
    ID_INV_BAL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    CD_BASE_UNIT varchar(64) not null,
    QTY_ON_HAND decimal(28,8) not null,
    QTY_RESERVED decimal(28,8) not null,
    QTY_FROZEN decimal(28,8) not null,
    QTY_AVAILABLE decimal(28,8) not null,
    PRICE_AVERAGE_UNIT_COST decimal(24,6),
    DT_PROJECTED timestamp with time zone not null,
    constraint PK_SUP_INV_BAL_PK primary key (ID_INV_BAL),
    constraint UK_SUP_INV_BAL_INV_BAL_TENANT_ unique (ID_TNT, ID_INV_BAL),
    constraint UK_SUP_INV_BAL_INV_BAL_DIMENSI unique (ID_TNT, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STOCK_STATUS),
    constraint CK_SUP_INV_BAL_INV_BAL_STATUS check (SD_STOCK_STATUS in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint CK_SUP_INV_BAL_INV_BAL_QUANTIT check (QTY_ON_HAND >= 0 and QTY_RESERVED >= 0 and QTY_FROZEN >= 0
        and QTY_AVAILABLE = QTY_ON_HAND - QTY_RESERVED - QTY_FROZEN and QTY_AVAILABLE >= 0)
);

create table RHN_SUP_INV_DOC_EVT (
    ID_INV_DOC_EVT bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    SD_DOC_TYPE varchar(32) not null,
    ID_DOC bigint not null,
    CD_DOC_NO varchar(64) not null,
    SD_EVT_TYPE varchar(64) not null,
    SD_FROM_STATUS varchar(32),
    SD_TO_STATUS varchar(32) not null,
    DES_REASON varchar(1000),
    ID_CORRELATION varchar(128),
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_OCCURRED bigint not null,
    constraint PK_SUP_INV_DOC_EVT_PK primary key (ID_INV_DOC_EVT),
    constraint UK_SUP_INV_DOC_EV_INV_DOC_EVEN unique (ID_TNT, ID_INV_DOC_EVT),
    constraint CK_SUP_INV_DOC_EV_INV_DOC_EVEN check (SD_DOC_TYPE in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'REQUISITION', 'TRANSFER', 'COUNT'))
);

create table RHN_SUP_INV_OPEN_PKG (
    ID_INV_OPEN_PKG bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    ID_ITEM_PKG bigint not null,
    ID_INV_TRACE_CODE bigint,
    CD_REQ varchar(128) not null,
    CD_SRC_UNIT varchar(64) not null,
    CD_BASE_UNIT varchar(64) not null,
    PACKAGE_FACTOR decimal(28,8) not null,
    QTY_OPENED_BASE decimal(28,8) not null,
    QTY_REMAINING_BASE decimal(28,8) not null,
    SD_STATUS varchar(32) not null,
    DT_OPENED timestamp with time zone not null,
    ID_USER_OPENED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    DT_CLOSED timestamp with time zone,
    constraint PK_SUP_INV_OPEN_PKG_PK primary key (ID_INV_OPEN_PKG),
    constraint UK_SUP_INV_OPEN_P_OPEN_PKG_TEN unique (ID_TNT, ID_INV_OPEN_PKG),
    constraint UK_SUP_INV_OPEN_P_OPEN_PKG_REQ unique (ID_TNT, CD_REQ),
    constraint UK_SUP_INV_OPEN_P_OPEN_PKG_TRA unique (ID_TNT, ID_INV_TRACE_CODE),
    constraint CK_SUP_INV_OPEN_P_OPEN_PKG_QUA check (PACKAGE_FACTOR > 0 and QTY_OPENED_BASE > 0
        and QTY_REMAINING_BASE >= 0 and QTY_REMAINING_BASE <= QTY_OPENED_BASE),
    constraint CK_SUP_INV_OPEN_P_OPEN_PKG_STA check (SD_STATUS in ('OPEN', 'CONSUMED', 'VOID'))
);

create table RHN_SUP_INV_PERIOD (
    ID_INV_PERIOD bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_SITE bigint not null,
    CD_PERIOD varchar(32) not null,
    DA_PERIOD_FROM date not null,
    DA_PERIOD_TO date not null,
    SD_STATUS varchar(32) not null,
    DT_CLOSED timestamp with time zone,
    ID_USER_CLOSED bigint,
    DES_INV_PERIOD varchar(1000),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    ID_INV_PERIOD_PREVIOUS bigint,
    ID_INV_PERIOD_CLOSE_RUN_CLOSE bigint,
    constraint PK_SUP_INV_PERIOD_PK primary key (ID_INV_PERIOD),
    constraint UK_SUP_INV_PERIOD_INV_PERIOD_T unique (ID_TNT, ID_INV_PERIOD),
    constraint UK_SUP_INV_PERIOD_INV_PERIOD_C unique (ID_TNT, ID_STOCK_SITE, CD_PERIOD),
    constraint UK_SUP_INV_PERIOD_INV_PERIOD_S unique (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD),
    constraint CK_SUP_INV_PERIOD_INV_PERIOD_S check (SD_STATUS in ('OPEN', 'CLOSING', 'CLOSED')),
    constraint CK_SUP_INV_PERIOD_INV_PERIOD_D check (DA_PERIOD_TO >= DA_PERIOD_FROM),
    constraint CK_SUP_INV_PERIOD_INV_PERIOD_P check (ID_INV_PERIOD_PREVIOUS is null or ID_INV_PERIOD_PREVIOUS <> ID_INV_PERIOD)
);

create table RHN_SUP_INV_PERIOD_BAL_SNAP (
    ID_INV_PERIOD_BAL_SNAP bigint,
    ID_TNT bigint not null,
    ID_INV_PERIOD_CLOSE_RUN bigint not null,
    ID_INV_PERIOD bigint not null,
    ID_INV_PERIOD_BAL_SNAP_OPENING bigint,
    ID_INV_BAL bigint not null,
    SN_INV_BAL_VER bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    CD_BASE_UNIT varchar(64) not null,
    QTY_OPENING decimal(28,8) default 0 not null,
    QTY_MOVEMENT decimal(28,8) default 0 not null,
    QTY_CLOSE decimal(28,8) default 0 not null,
    QTY_BAL decimal(28,8) default 0 not null,
    QTY_DIFFERENCE decimal(28,8) default 0 not null,
    SD_SNAP_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_SUP_INV_PERIOD_BAL_SNAP_PK primary key (ID_INV_PERIOD_BAL_SNAP),
    constraint UK_SUP_INV_PERIOD_INV_SNAP_TEN unique (ID_TNT, ID_INV_PERIOD_BAL_SNAP),
    constraint UK_SUP_INV_PERIOD_INV_SNAP_DIM unique (ID_TNT, ID_INV_PERIOD_CLOSE_RUN, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STOCK_STATUS),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_STA check (SD_STOCK_STATUS in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_RES check (SD_SNAP_STATUS in ('RECONCILED', 'DIFFERENCE')),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_QUA check (QTY_CLOSE = QTY_OPENING + QTY_MOVEMENT
        and QTY_DIFFERENCE = QTY_BAL - QTY_CLOSE),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_REC check ((SD_SNAP_STATUS = 'RECONCILED' and QTY_DIFFERENCE = 0)
        or SD_SNAP_STATUS = 'DIFFERENCE')
);

create table RHN_SUP_INV_PERIOD_BAL_VAL (
    ID_INV_PERIOD_BAL_VAL bigint,
    ID_TNT bigint not null,
    ID_INV_PERIOD_BAL_SNAP bigint not null,
    SD_VALUAT_BASIS varchar(32) not null,
    CD_CURRENCY varchar(16) not null,
    PRICE_OPENING decimal(24,6),
    PRICE_CLOSE decimal(24,6),
    AMT_OPENING decimal(30,6) default 0 not null,
    AMT_MOVEMENT decimal(30,6) default 0 not null,
    AMT_VALUAT_ADJ decimal(30,6) default 0 not null,
    AMT_ROUNDING_ADJ decimal(30,6) default 0 not null,
    AMT_CLOSE decimal(30,6) default 0 not null,
    AMT_BAL decimal(30,6) default 0 not null,
    AMT_VAL_DIFFERENCE decimal(30,6) default 0 not null,
    SD_VAL_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    constraint PK_SUP_INV_PERIOD_BAL_VAL_PK primary key (ID_INV_PERIOD_BAL_VAL),
    constraint UK_SUP_INV_PERIOD_INV_SNAP_VAL unique (ID_TNT, ID_INV_PERIOD_BAL_VAL),
    constraint UK_SUP_INV_PERIOD_INV_SNAP_V_1 unique (ID_TNT, ID_INV_PERIOD_BAL_SNAP, SD_VALUAT_BASIS, CD_CURRENCY),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_VAL check (SD_VALUAT_BASIS in ('COST', 'RETAIL')),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_V_1 check (SD_VAL_STATUS in ('RECONCILED', 'DIFFERENCE')),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_V_2 check ((PRICE_OPENING is null or PRICE_OPENING >= 0)
        and (PRICE_CLOSE is null or PRICE_CLOSE >= 0)),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_V_3 check (AMT_CLOSE = AMT_OPENING + AMT_MOVEMENT + AMT_VALUAT_ADJ + AMT_ROUNDING_ADJ
        and AMT_VAL_DIFFERENCE = AMT_BAL - AMT_CLOSE),
    constraint CK_SUP_INV_PERIOD_INV_SNAP_V_4 check ((SD_VAL_STATUS = 'RECONCILED' and AMT_VAL_DIFFERENCE = 0)
        or SD_VAL_STATUS = 'DIFFERENCE')
);

create table RHN_SUP_INV_PERIOD_CLOSE_RUN (
    ID_INV_PERIOD_CLOSE_RUN bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_INV_PERIOD bigint not null,
    ID_INV_PERIOD_PREVIOUS bigint,
    ID_INV_RECON_RUN bigint,
    CD_RUN_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    HASH_REQ varchar(64) not null,
    SD_STATUS varchar(32) not null,
    QTY_DIMENSION integer default 0 not null,
    QTY_DIFFERENCE integer default 0 not null,
    DT_STARTED timestamp with time zone not null,
    ID_USER_STARTED bigint not null,
    DT_VALIDATED timestamp with time zone,
    ID_USER_VALIDATED bigint,
    DT_POSTED timestamp with time zone,
    ID_USER_POSTED bigint,
    DT_COMPLETED timestamp with time zone,
    CD_FAILURE varchar(128),
    DES_FAILURE_MSG varchar(1000),
    constraint PK_SUP_INV_PERIOD_CLOSE_RUN_PK primary key (ID_INV_PERIOD_CLOSE_RUN),
    constraint UK_SUP_INV_PERIOD_INV_CLOSE_TE unique (ID_TNT, ID_INV_PERIOD_CLOSE_RUN),
    constraint UK_SUP_INV_PERIOD_INV_CLOSE_PE unique (ID_TNT, ID_INV_PERIOD, ID_INV_PERIOD_CLOSE_RUN),
    constraint UK_SUP_INV_PERIOD_INV_CLOSE_NO unique (ID_TNT, CD_RUN_NO),
    constraint UK_SUP_INV_PERIOD_INV_CLOSE_RE unique (ID_TNT, CD_REQ),
    constraint CK_SUP_INV_PERIOD_INV_CLOSE_ST check (SD_STATUS in ('RUNNING', 'VALIDATED', 'POSTED', 'FAILED', 'VOID')),
    constraint CK_SUP_INV_PERIOD_INV_CLOSE_PR check (ID_INV_PERIOD_PREVIOUS is null or ID_INV_PERIOD_PREVIOUS <> ID_INV_PERIOD),
    constraint CK_SUP_INV_PERIOD_INV_CLOSE_CO check (QTY_DIMENSION >= 0 and QTY_DIFFERENCE >= 0 and QTY_DIFFERENCE <= QTY_DIMENSION),
    constraint CK_SUP_INV_PERIOD_INV_CLOSE_RE check ((SD_STATUS = 'POSTED' and QTY_DIFFERENCE = 0 and DT_POSTED is not null and ID_USER_POSTED is not null)
        or SD_STATUS <> 'POSTED')
);

create table RHN_SUP_INV_PERIOD_CLOSE_TOTAL (
    ID_INV_PERIOD_CLOSE_TOTAL bigint,
    ID_TNT bigint not null,
    ID_INV_PERIOD_CLOSE_RUN bigint not null,
    SD_VALUAT_BASIS varchar(32) not null,
    CD_CURRENCY varchar(16) not null,
    AMT_OPENING decimal(30,6) default 0 not null,
    AMT_MOVEMENT decimal(30,6) default 0 not null,
    AMT_VALUAT_ADJ decimal(30,6) default 0 not null,
    AMT_ROUNDING_ADJ decimal(30,6) default 0 not null,
    AMT_CLOSE decimal(30,6) default 0 not null,
    AMT_BAL decimal(30,6) default 0 not null,
    AMT_VAL_DIFFERENCE decimal(30,6) default 0 not null,
    DT_CREATED timestamp with time zone not null,
    constraint PK_SUP_INV_PERIOD_PK_1 primary key (ID_INV_PERIOD_CLOSE_TOTAL),
    constraint UK_SUP_INV_PERIOD_INV_CLOSE_TO unique (ID_TNT, ID_INV_PERIOD_CLOSE_TOTAL),
    constraint UK_SUP_INV_PERIOD_INV_CLOSE__1 unique (ID_TNT, ID_INV_PERIOD_CLOSE_RUN, SD_VALUAT_BASIS, CD_CURRENCY),
    constraint CK_SUP_INV_PERIOD_INV_CLOSE_TO check (SD_VALUAT_BASIS in ('COST', 'RETAIL')),
    constraint CK_SUP_INV_PERIOD_INV_CLOSE__1 check (AMT_CLOSE = AMT_OPENING + AMT_MOVEMENT + AMT_VALUAT_ADJ + AMT_ROUNDING_ADJ
        and AMT_VAL_DIFFERENCE = AMT_BAL - AMT_CLOSE)
);

create table RHN_SUP_INV_PRICE_ADJ (
    ID_INV_PRICE_ADJ bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_INV_PERIOD bigint,
    ID_CATALOG_CHG_BATCH bigint,
    ID_INV_PRICE_ADJ_REVERSAL_OF bigint,
    CD_ADJ_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    HASH_REQ varchar(64) not null,
    SD_ADJ_TYPE varchar(32) not null,
    SD_PRICE_TYPE varchar(32),
    DA_BUSINESS date not null,
    CD_CURRENCY varchar(16) not null,
    CD_PRICE_DOC varchar(128),
    DES_REASON varchar(1000) not null,
    SD_STATUS varchar(32) not null,
    QTY_LINE integer default 0 not null,
    AMT_TOTAL_VAL_BEFORE decimal(30,6) default 0 not null,
    AMT_TOTAL_VAL_AFTER decimal(30,6) default 0 not null,
    AMT_TOTAL_ADJ decimal(30,6) default 0 not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    DT_SUBMITTED timestamp with time zone,
    ID_USER_SUBMITTED bigint,
    DT_APPROVED timestamp with time zone,
    ID_USER_APPROVED bigint,
    DT_POSTED timestamp with time zone,
    ID_USER_POSTED bigint,
    DT_REVERSED timestamp with time zone,
    ID_USER_REVERSED bigint,
    DT_CANCELLED timestamp with time zone,
    ID_USER_CANCELLED bigint,
    constraint PK_SUP_INV_PRICE_ADJ_PK primary key (ID_INV_PRICE_ADJ),
    constraint UK_SUP_INV_PRICE_INV_PRICE_TEN unique (ID_TNT, ID_INV_PRICE_ADJ),
    constraint UK_SUP_INV_PRICE_INV_PRICE_NO unique (ID_TNT, CD_ADJ_NO),
    constraint UK_SUP_INV_PRICE_INV_PRICE_REQ unique (ID_TNT, CD_REQ),
    constraint CK_SUP_INV_PRICE_INV_PRICE_TYP check (SD_ADJ_TYPE in ('SALE_PRICE', 'COST_REVALUE', 'SALE_AND_COST')),
    constraint CK_SUP_INV_PRICE_INV_PRICE_REV check (ID_INV_PRICE_ADJ_REVERSAL_OF is null or ID_INV_PRICE_ADJ_REVERSAL_OF <> ID_INV_PRICE_ADJ),
    constraint CK_SUP_INV_PRICE_INV_PRICE_SCO check (SD_ADJ_TYPE = 'COST_REVALUE' or SD_PRICE_TYPE is not null),
    constraint CK_SUP_INV_PRICE_INV_PRICE_STA check (SD_STATUS in ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTING', 'POSTED', 'REVERSED', 'CANCELLED', 'FAILED')),
    constraint CK_SUP_INV_PRICE_INV_PRICE_COU check (QTY_LINE >= 0),
    constraint CK_SUP_INV_PRICE_INV_PRICE_EQU check (AMT_TOTAL_ADJ = AMT_TOTAL_VAL_AFTER - AMT_TOTAL_VAL_BEFORE),
    constraint CK_SUP_INV_PRICE_INV_PRICE_POS check ((SD_STATUS in ('POSTED', 'REVERSED') and ID_INV_PERIOD is not null and DT_POSTED is not null and ID_USER_POSTED is not null)
        or SD_STATUS not in ('POSTED', 'REVERSED'))
);

create table RHN_SUP_INV_PRICE_ADJ_DETAIL (
    ID_INV_PRICE_ADJ_DETAIL bigint,
    ID_TNT bigint not null,
    ID_INV_PRICE_ADJ_LINE bigint not null,
    ID_INV_BAL bigint not null,
    SN_INV_BAL_VER bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_LOT bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    QTY_SNAP decimal(28,8) not null,
    PRICE_UNIT_PRICE_BEFORE decimal(24,6) not null,
    PRICE_UNIT_PRICE_AFTER decimal(24,6) not null,
    AMT_VAL_BEFORE decimal(30,6) not null,
    AMT_VAL_AFTER decimal(30,6) not null,
    AMT_ADJ decimal(30,6) not null,
    AMT_ROUNDING decimal(30,6) default 0 not null,
    ID_INV_VALUAT_ENTRY bigint,
    DT_CREATED timestamp with time zone not null,
    constraint PK_SUP_INV_PRICE_ADJ_DETAIL_PK primary key (ID_INV_PRICE_ADJ_DETAIL),
    constraint UK_SUP_INV_PRICE_INV_PRICE_DET unique (ID_TNT, ID_INV_PRICE_ADJ_DETAIL),
    constraint UK_SUP_INV_PRICE_INV_PRICE_D_1 unique (ID_TNT, ID_INV_PRICE_ADJ_LINE, ID_INV_BAL),
    constraint UK_SUP_INV_PRICE_INV_PRICE_D_2 unique (ID_TNT, ID_INV_VALUAT_ENTRY),
    constraint CK_SUP_INV_PRICE_INV_PRICE_DET check (SD_STOCK_STATUS in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint CK_SUP_INV_PRICE_INV_PRICE_D_1 check (QTY_SNAP >= 0 and PRICE_UNIT_PRICE_BEFORE >= 0 and PRICE_UNIT_PRICE_AFTER >= 0
        and AMT_ADJ = AMT_VAL_AFTER - AMT_VAL_BEFORE)
);

create table RHN_SUP_INV_PRICE_ADJ_LINE (
    ID_INV_PRICE_ADJ_LINE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_INV_PRICE_ADJ bigint not null,
    SN_LINE integer not null,
    ID_STOCK_ITEM bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_ITEM_PKG bigint not null,
    ID_CATALOG_PRICE_OLD bigint,
    SN_OLD_CATALOG_PRICE_VER bigint,
    ID_CATALOG_PRICE_NEW bigint,
    SN_NEW_CATALOG_PRICE_VER bigint,
    PRICE_OLD_SALE decimal(24,6),
    PRICE_NEW_SALE decimal(24,6),
    PRICE_OLD_UNIT_COST decimal(24,6),
    PRICE_NEW_UNIT_COST decimal(24,6),
    QTY_SNAP decimal(28,8) default 0 not null,
    AMT_VAL_BEFORE decimal(30,6) default 0 not null,
    AMT_VAL_AFTER decimal(30,6) default 0 not null,
    AMT_ADJ decimal(30,6) default 0 not null,
    AMT_ROUNDING decimal(30,6) default 0 not null,
    SD_LINE_STATUS varchar(32) not null,
    CD_ERROR varchar(128),
    DES_ERROR_MSG varchar(1000),
    constraint PK_SUP_INV_PRICE_ADJ_LINE_PK primary key (ID_INV_PRICE_ADJ_LINE),
    constraint UK_SUP_INV_PRICE_INV_PRICE_LIN unique (ID_TNT, ID_INV_PRICE_ADJ_LINE),
    constraint UK_SUP_INV_PRICE_INV_PRICE_L_1 unique (ID_TNT, ID_INV_PRICE_ADJ, SN_LINE),
    constraint UK_SUP_INV_PRICE_INV_PRICE_L_2 unique (ID_TNT, ID_INV_PRICE_ADJ, ID_STOCK_ITEM),
    constraint CK_SUP_INV_PRICE_INV_PRICE_LIN check (QTY_SNAP >= 0
        and (PRICE_OLD_SALE is null or PRICE_OLD_SALE >= 0)
        and (PRICE_NEW_SALE is null or PRICE_NEW_SALE >= 0)
        and (PRICE_OLD_UNIT_COST is null or PRICE_OLD_UNIT_COST >= 0)
        and (PRICE_NEW_UNIT_COST is null or PRICE_NEW_UNIT_COST >= 0)
        and AMT_ADJ = AMT_VAL_AFTER - AMT_VAL_BEFORE),
    constraint CK_SUP_INV_PRICE_INV_PRICE_L_1 check (SD_LINE_STATUS in ('PENDING', 'READY', 'POSTED', 'FAILED', 'REVERSED'))
);

create table RHN_SUP_INV_RECON_LINE (
    ID_INV_RECON_LINE bigint,
    ID_TNT bigint not null,
    ID_INV_RECON_RUN bigint not null,
    ID_STOCK_BIN bigint,
    ID_STOCK_ITEM bigint,
    ID_STOCK_LOT bigint,
    SD_STOCK_STATUS varchar(32),
    SD_ISSUE_TYPE varchar(32) not null,
    QTY_EXPECTED decimal(28,8) not null,
    QTY_ACTUAL decimal(28,8) not null,
    QTY_DIFFERENCE decimal(28,8) not null,
    SD_SEVERITY varchar(16) not null,
    DES_INV_RECON_LINE varchar(1000) not null,
    SD_VALUAT_BASIS varchar(32),
    CD_CURRENCY varchar(16),
    AMT_EXPECTED decimal(30,6),
    AMT_ACTUAL decimal(30,6),
    AMT_DIFFERENCE decimal(30,6),
    constraint PK_SUP_INV_RECON_LINE_PK primary key (ID_INV_RECON_LINE),
    constraint UK_SUP_INV_RECON_INV_REC_LINE_ unique (ID_TNT, ID_INV_RECON_LINE),
    constraint CK_SUP_INV_RECON_INV_REC_LINE_ check (SD_SEVERITY in ('WARNING', 'ERROR')),
    constraint CK_SUP_INV_RECON_INV_REC_LIN_1 check ((SD_ISSUE_TYPE in ('PERIOD_VALUE', 'VALUATION_LEDGER')
            and SD_VALUAT_BASIS in ('COST', 'RETAIL') and CD_CURRENCY is not null
            and AMT_EXPECTED is not null and AMT_ACTUAL is not null and AMT_DIFFERENCE is not null
            and AMT_DIFFERENCE = AMT_ACTUAL - AMT_EXPECTED)
        or (SD_ISSUE_TYPE not in ('PERIOD_VALUE', 'VALUATION_LEDGER')
            and SD_VALUAT_BASIS is null and CD_CURRENCY is null
            and AMT_EXPECTED is null and AMT_ACTUAL is null and AMT_DIFFERENCE is null))
);

create table RHN_SUP_INV_RECON_RUN (
    ID_INV_RECON_RUN bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    CD_RUN_NO varchar(64) not null,
    SD_RUN_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    DA_BUSINESS date not null,
    DT_STARTED timestamp with time zone not null,
    DT_COMPLETED timestamp with time zone,
    ID_USER_RUN bigint,
    QTY_DIMENSION integer default 0 not null,
    QTY_ISSUE integer default 0 not null,
    constraint PK_SUP_INV_RECON_RUN_PK primary key (ID_INV_RECON_RUN),
    constraint UK_SUP_INV_RECON_INV_REC_TENAN unique (ID_TNT, ID_INV_RECON_RUN),
    constraint UK_SUP_INV_RECON_INV_REC_NO unique (ID_TNT, CD_RUN_NO),
    constraint CK_SUP_INV_RECON_INV_REC_STATU check (SD_STATUS in ('RUNNING', 'PASSED', 'ISSUES', 'FAILED')),
    constraint CK_SUP_INV_RECON_INV_REC_COUNT check (QTY_DIMENSION >= 0 and QTY_ISSUE >= 0)
);

create table RHN_SUP_INV_RESV (
    ID_INV_RESV bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    ID_CARE_REQ bigint not null,
    CD_RESV_GRP varchar(128) not null,
    SD_RESV_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    QTY_RESERVED decimal(28,8) not null,
    QTY_CONSUMED decimal(28,8) not null,
    CD_BASE_UNIT varchar(64) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_EXPIRES timestamp with time zone,
    DT_CONSUMED timestamp with time zone,
    ID_USER_CONSUMED bigint,
    DT_RELEASED timestamp with time zone,
    ID_USER_RELEASED bigint,
    DES_RELEASE_REASON varchar(1000),
    ID_DISP_TASK_LINE bigint not null,
    constraint PK_SUP_INV_RESV_PK primary key (ID_INV_RESV),
    constraint UK_SUP_INV_RESV_INV_RSV_TENANT unique (ID_TNT, ID_INV_RESV),
    constraint UK_SUP_INV_RESV_INV_RSV_LINE_D unique (ID_TNT, ID_DISP_TASK_LINE, CD_RESV_GRP, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT),
    constraint CK_SUP_INV_RESV_INV_RSV_TYPE check (SD_RESV_TYPE in ('ORDER', 'DISPENSE', 'TRANSFER', 'OTHER')),
    constraint CK_SUP_INV_RESV_INV_RSV_STATUS check (SD_STATUS in ('ACTIVE', 'PARTIAL', 'CONSUMED', 'RELEASED', 'EXPIRED')),
    constraint CK_SUP_INV_RESV_INV_RSV_QUANTI check (QTY_RESERVED > 0 and QTY_CONSUMED >= 0 and QTY_CONSUMED <= QTY_RESERVED)
);

create table RHN_SUP_INV_SPLIT_EVT (
    ID_INV_SPLIT_EVT bigint,
    ID_TNT bigint not null,
    ID_INV_OPEN_PKG bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_SRC_TYPE varchar(64) not null,
    ID_SRC bigint,
    CD_SRC_NO varchar(128) not null,
    QTY_DELTA decimal(28,8) not null,
    BALANCE_AFTER decimal(28,8) not null,
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_OCCURRED bigint not null,
    DES_INV_SPLIT_EVT varchar(1000),
    constraint PK_SUP_INV_SPLIT_EVT_PK primary key (ID_INV_SPLIT_EVT),
    constraint UK_SUP_INV_SPLIT_SPLIT_EVT_TEN unique (ID_TNT, ID_INV_SPLIT_EVT),
    constraint CK_SUP_INV_SPLIT_SPLIT_EVT_TYP check (SD_EVT_TYPE in ('OPEN', 'CONSUME', 'RETURN', 'ADJUST', 'VOID')),
    constraint CK_SUP_INV_SPLIT_SPLIT_EVT_QUA check (QTY_DELTA <> 0 and BALANCE_AFTER >= 0)
);

create table RHN_SUP_INV_TRACE_CODE (
    ID_INV_TRACE_CODE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint,
    ID_GOOD_RCPT_LINE bigint,
    CD_TRACE varchar(256) not null,
    CD_NORMALIZED varchar(256) not null,
    CD_PRODUCT_SNAP varchar(128) not null,
    NA_PRODUCT_SNAP varchar(300) not null,
    CD_LOT_SNAP varchar(128) not null,
    QTY_PKG decimal(28,8) not null,
    QTY_BASE decimal(28,8) not null,
    SD_STATUS varchar(32) not null,
    SD_CURRENT_DOC_TYPE varchar(64),
    ID_CURRENT_DOC bigint,
    CD_CURRENT_DOC_NO varchar(128),
    DT_RECEIVED timestamp with time zone,
    DT_ISSUED timestamp with time zone,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    QTY_REMAINING_BASE decimal(28,8) default 0 not null,
    constraint PK_SUP_INV_TRACE_CODE_PK primary key (ID_INV_TRACE_CODE),
    constraint UK_SUP_INV_TRACE_TRACE_TENANT_ unique (ID_TNT, ID_INV_TRACE_CODE),
    constraint UK_SUP_INV_TRACE_TRACE_CODE unique (ID_TNT, CD_NORMALIZED)
);

create table RHN_SUP_INV_TRACE_EVT (
    ID_INV_TRACE_EVT bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_INV_TRACE_CODE bigint not null,
    SD_EVT_TYPE varchar(64) not null,
    SD_FROM_STATUS varchar(32),
    SD_TO_STATUS varchar(32) not null,
    ID_STOCK_SITE_FROM bigint,
    ID_STOCK_SITE_TO bigint,
    ID_STOCK_BIN_FROM bigint,
    ID_STOCK_BIN_TO bigint,
    SD_DOC_TYPE varchar(64) not null,
    ID_DOC bigint not null,
    CD_DOC_NO varchar(128) not null,
    DES_REASON varchar(1000),
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_OCCURRED bigint not null,
    QTY_DELTA decimal(28,8) default 0 not null,
    BALANCE_AFTER decimal(28,8) default 0 not null,
    constraint PK_SUP_INV_TRACE_EVT_PK primary key (ID_INV_TRACE_EVT),
    constraint UK_SUP_INV_TRACE_TRACE_EVT_TEN unique (ID_TNT, ID_INV_TRACE_EVT),
    constraint CK_SUP_INV_TRACE_TRACE_EVT_QUA check (BALANCE_AFTER >= 0)
);

create table RHN_SUP_INV_TXN (
    ID_INV_TXN bigint,
    ID_TNT bigint not null,
    ID_INV_PERIOD bigint not null,
    ID_INV_TXN_REVERSES bigint,
    CD_TXN_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    SD_TXN_TYPE varchar(32) not null,
    SD_SRC_TYPE varchar(32) not null,
    CD_SRC varchar(128) not null,
    DT_OCCURRED timestamp with time zone not null,
    DT_POSTED timestamp with time zone not null,
    ID_USER_POSTED bigint not null,
    DES_INV_TXN varchar(1000),
    constraint PK_SUP_INV_TXN_PK primary key (ID_INV_TXN),
    constraint UK_SUP_INV_TXN_INV_TXN_TENANT_ unique (ID_TNT, ID_INV_TXN),
    constraint UK_SUP_INV_TXN_INV_TXN_NO unique (ID_TNT, CD_TXN_NO),
    constraint UK_SUP_INV_TXN_INV_TXN_REQUEST unique (ID_TNT, CD_REQ),
    constraint CK_SUP_INV_TXN_INV_TXN_TYPE check (SD_TXN_TYPE in ('RECEIPT', 'ISSUE', 'TRANSFER', 'COUNT', 'DISPENSE', 'RETURN', 'QUALITY', 'REVERSAL'))
);

create table RHN_SUP_INV_TXN_LINE (
    ID_INV_TXN_LINE bigint,
    ID_TNT bigint not null,
    ID_INV_TXN bigint not null,
    SN_SORT int not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    ID_ITEM_PKG bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    QTY_OPERATION decimal(28,8) not null,
    CD_OPERATION_UNIT varchar(64) not null,
    BASE_QUANTITY_FACTOR decimal(28,8) not null,
    QTY_DELTA decimal(28,8) not null,
    PRICE_UNIT_COST decimal(24,6),
    AMT_DELTA decimal(24,6),
    constraint PK_SUP_INV_TXN_LINE_PK primary key (ID_INV_TXN_LINE),
    constraint UK_SUP_INV_TXN_LI_INV_LINE_TEN unique (ID_TNT, ID_INV_TXN_LINE),
    constraint UK_SUP_INV_TXN_LI_INV_LINE_ORD unique (ID_TNT, ID_INV_TXN, SN_SORT),
    constraint CK_SUP_INV_TXN_LI_INV_LINE_STA check (SD_STOCK_STATUS in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint CK_SUP_INV_TXN_LI_INV_LINE_QUA check (QTY_OPERATION > 0 and BASE_QUANTITY_FACTOR > 0 and QTY_DELTA <> 0)
);

create table RHN_SUP_INV_VALUAT_ENTRY (
    ID_INV_VALUAT_ENTRY bigint,
    ID_TNT bigint not null,
    ID_INV_PERIOD bigint not null,
    ID_INV_BAL bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    SD_VALUAT_BASIS varchar(32) not null,
    SD_ENTRY_TYPE varchar(32) not null,
    SD_SRC_TYPE varchar(64) not null,
    ID_SRC bigint,
    CD_SRC_NO varchar(128) not null,
    CD_REQ varchar(128) not null,
    ID_INV_VALUAT_ENTRY_REVERSES bigint,
    QTY_SNAP decimal(28,8) not null,
    PRICE_UNIT_PRICE_BEFORE decimal(24,6) not null,
    PRICE_UNIT_PRICE_AFTER decimal(24,6) not null,
    AMT_VAL_BEFORE decimal(30,6) not null,
    AMT_VAL_AFTER decimal(30,6) not null,
    AMT_DELTA decimal(30,6) not null,
    CD_CURRENCY varchar(16) not null,
    DT_OCCURRED timestamp with time zone not null,
    DT_POSTED timestamp with time zone not null,
    ID_USER_POSTED bigint not null,
    DES_INV_VALUAT_ENTRY varchar(1000),
    constraint PK_SUP_INV_VALUAT_ENTRY_PK primary key (ID_INV_VALUAT_ENTRY),
    constraint UK_SUP_INV_VALUAT_INV_VAL_TENA unique (ID_TNT, ID_INV_VALUAT_ENTRY),
    constraint UK_SUP_INV_VALUAT_INV_VAL_REQU unique (ID_TNT, CD_REQ),
    constraint CK_SUP_INV_VALUAT_INV_VAL_STAT check (SD_STOCK_STATUS in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint CK_SUP_INV_VALUAT_INV_VAL_BASI check (SD_VALUAT_BASIS in ('COST', 'RETAIL')),
    constraint CK_SUP_INV_VALUAT_INV_VAL_TYPE check (SD_ENTRY_TYPE in ('PRICE_ADJUSTMENT', 'COST_REVALUE', 'ROUNDING', 'REVERSAL')),
    constraint CK_SUP_INV_VALUAT_INV_VAL_REVE check (ID_INV_VALUAT_ENTRY_REVERSES is null or ID_INV_VALUAT_ENTRY_REVERSES <> ID_INV_VALUAT_ENTRY),
    constraint CK_SUP_INV_VALUAT_INV_VAL_QUAN check (QTY_SNAP >= 0),
    constraint CK_SUP_INV_VALUAT_INV_VAL_PRIC check (PRICE_UNIT_PRICE_BEFORE >= 0 and PRICE_UNIT_PRICE_AFTER >= 0),
    constraint CK_SUP_INV_VALUAT_INV_VAL_EQUA check (AMT_DELTA = AMT_VAL_AFTER - AMT_VAL_BEFORE)
);

create table RHN_SUP_MED_DISP (
    ID_MED_DISP bigint,
    ID_TNT bigint not null,
    ID_DISP_TASK bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_MED_DISP_ORIGINAL bigint,
    CD_DISP_NO varchar(64) not null,
    SD_DISP_TYPE varchar(32) not null,
    DT_OCCURRED timestamp with time zone not null,
    ID_DISPENSER_PRACT bigint not null,
    ID_DISPENSER_USER bigint not null,
    ID_DISPENSER_ASSIGN bigint not null,
    ID_CHECKER_PRACT bigint,
    ID_CHECKER_USER bigint,
    ID_CHECKER_ASSIGN bigint,
    DT_CHECKED timestamp with time zone,
    QTY_OPERATION decimal(28,8) not null,
    CD_OPERATION_UNIT varchar(64) not null,
    DES_MED_DISP varchar(1000),
    constraint PK_SUP_MED_DISP_PK primary key (ID_MED_DISP),
    constraint UK_SUP_MED_DISP_MED_DISP_TENAN unique (ID_TNT, ID_MED_DISP),
    constraint UK_SUP_MED_DISP_MED_DISP_NO unique (ID_TNT, CD_DISP_NO),
    constraint CK_SUP_MED_DISP_MED_DISP_TYPE check (SD_DISP_TYPE in ('DISPENSE', 'RETURN', 'REDISPENSE')),
    constraint CK_SUP_MED_DISP_MED_DISP_QUANT check (QTY_OPERATION > 0),
    constraint CK_SUP_MED_DISP_MED_DISP_CHECK check ((ID_CHECKER_PRACT is null and ID_CHECKER_USER is null and ID_CHECKER_ASSIGN is null and DT_CHECKED is null)
        or (ID_CHECKER_PRACT is not null and ID_CHECKER_USER is not null and ID_CHECKER_ASSIGN is not null and DT_CHECKED is not null))
);

create table RHN_SUP_MED_DISP_LINE (
    ID_MED_DISP_LINE bigint,
    ID_TNT bigint not null,
    ID_MED_DISP bigint not null,
    ID_DISP_TASK_LINE bigint not null,
    ID_MED_DISP_LINE_ORIGINAL bigint,
    SN_SORT int not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    ID_INV_TXN_LINE bigint not null,
    QTY_DISPENSED decimal(28,8) not null,
    CD_DISP_UNIT varchar(64) not null,
    BASE_QUANTITY_FACTOR decimal(28,8) not null,
    constraint PK_SUP_MED_DISP_LINE_PK primary key (ID_MED_DISP_LINE),
    constraint UK_SUP_MED_DISP_L_MED_DISP_LIN unique (ID_TNT, ID_MED_DISP_LINE),
    constraint UK_SUP_MED_DISP_L_MED_DISP_L_1 unique (ID_TNT, ID_MED_DISP, SN_SORT),
    constraint UK_SUP_MED_DISP_L_MED_DISP_L_2 unique (ID_TNT, ID_INV_TXN_LINE),
    constraint UK_SUP_MED_DISP_L_MED_DISP_L_3 unique (ID_TNT, ID_MED_DISP_LINE, ID_DISP_TASK_LINE),
    constraint CK_SUP_MED_DISP_L_MED_DISP_LIN check (QTY_DISPENSED > 0 and BASE_QUANTITY_FACTOR > 0)
);

create table RHN_SUP_PHARM_FULFILL_AUTH (
    ID_PHARM_FULFILL_AUTH bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint,
    ID_CARE_REQ_MED bigint not null,
    ID_STL bigint not null,
    SD_STATUS varchar(32) not null,
    DT_READY timestamp with time zone not null,
    DT_INTAKE_STARTED timestamp with time zone,
    DT_REVOKED timestamp with time zone,
    DT_UPDATED timestamp with time zone not null,
    ID_DISP_ROUTE bigint,
    SN_DISP_ROUTE_VER bigint,
    ID_STOCK_SITE_ROUTED bigint,
    DT_ROUTED timestamp with time zone,
    constraint PK_SUP_PHARM_FULFILL_AUTH_PK primary key (ID_PHARM_FULFILL_AUTH),
    constraint UK_SUP_PHARM_FULF_PHARM_AUTH_R unique (ID_TNT, ID_CARE_REQ_MED, ID_STL),
    constraint CK_SUP_PHARM_FULF_PHARM_AUTH_S check (SD_STATUS in (
        'READY_FOR_INTAKE', 'INTAKE_STARTED', 'REVOKED', 'EXCEPTION')),
    constraint CK_SUP_PHARM_FULF_PHARM_AUTH_R check ((ID_DISP_ROUTE is null and SN_DISP_ROUTE_VER is null
            and ID_STOCK_SITE_ROUTED is null and DT_ROUTED is null)
        or
        (ID_DISP_ROUTE is not null and SN_DISP_ROUTE_VER is not null
            and ID_STOCK_SITE_ROUTED is not null and DT_ROUTED is not null))
);

create table RHN_SUP_PHARM_REVIEW (
    ID_PHARM_REVIEW bigint,
    ID_TNT bigint not null,
    ID_CARE_REQ bigint not null,
    ID_DISP_TASK bigint not null,
    CD_REVIEW_NO varchar(64) not null,
    SD_RESULT varchar(32) not null,
    CD_REASON varchar(64),
    DES_PHARM_REVIEW varchar(2000),
    ID_PHARMACIST_PRACT bigint not null,
    ID_REVIEWER_USER bigint not null,
    ID_REVIEWER_ASSIGN bigint not null,
    DT_REVIEWED timestamp with time zone not null,
    constraint PK_SUP_PHARM_REVIEW_PK primary key (ID_PHARM_REVIEW),
    constraint UK_SUP_PHARM_REVI_PHARMACY_REV unique (ID_TNT, ID_PHARM_REVIEW),
    constraint UK_SUP_PHARM_REVI_PHARMACY_R_1 unique (ID_TNT, CD_REVIEW_NO),
    constraint CK_SUP_PHARM_REVI_PHARMACY_REV check (SD_RESULT in ('PASS', 'REJECT', 'INTERVENE', 'OVERRIDE')),
    constraint CK_SUP_PHARM_REVI_PHARMACY_R_1 check ((SD_RESULT = 'PASS') or (CD_REASON is not null and DES_PHARM_REVIEW is not null))
);

create table RHN_SUP_PURCH_ORDER (
    ID_PURCH_ORDER bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_SUPPL bigint not null,
    CD_ORDER_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    SD_STATUS varchar(32) not null,
    DA_ORDER date not null,
    DA_EXPECTED date,
    DT_SUBMITTED timestamp with time zone,
    ID_USER_SUBMITTED bigint,
    DT_APPROVED timestamp with time zone,
    ID_USER_APPROVED bigint,
    DES_APPROVAL_REASON varchar(1000),
    DES_PURCH_ORDER varchar(1000),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_PURCH_ORDER_PK primary key (ID_PURCH_ORDER),
    constraint UK_SUP_PURCH_ORDE_PO_TENANT_ID unique (ID_TNT, ID_PURCH_ORDER),
    constraint UK_SUP_PURCH_ORDER_PO_NO unique (ID_TNT, CD_ORDER_NO),
    constraint UK_SUP_PURCH_ORDER_PO_REQUEST unique (ID_TNT, CD_REQ),
    constraint CK_SUP_PURCH_ORDER_PO_STATUS check (SD_STATUS in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    constraint CK_SUP_PURCH_ORDER_PO_DATES check (DA_EXPECTED is null or DA_EXPECTED >= DA_ORDER)
);

create table RHN_SUP_PURCH_ORDER_LINE (
    ID_PURCH_ORDER_LINE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PURCH_ORDER bigint not null,
    SN_SORT int not null,
    ID_STOCK_ITEM bigint not null,
    ID_ITEM_PKG bigint not null,
    QTY_ORDERED decimal(28,8) not null,
    QTY_RECEIVED decimal(28,8) default 0 not null,
    PRICE_UNIT decimal(24,6) not null,
    TAX_RATE decimal(9,6),
    SD_LINE_STATUS varchar(32) not null,
    DES_PURCH_ORDER_LINE varchar(1000),
    constraint PK_SUP_PURCH_ORDER_LINE_PK primary key (ID_PURCH_ORDER_LINE),
    constraint UK_SUP_PURCH_ORDE_PO_LINE_TENA unique (ID_TNT, ID_PURCH_ORDER_LINE),
    constraint UK_SUP_PURCH_ORDE_PO_LINE_ORDE unique (ID_TNT, ID_PURCH_ORDER, SN_SORT),
    constraint UK_SUP_PURCH_ORDE_PO_LINE_ITEM unique (ID_TNT, ID_PURCH_ORDER, ID_STOCK_ITEM),
    constraint CK_SUP_PURCH_ORDE_PO_LINE_QUAN check (QTY_ORDERED > 0 and QTY_RECEIVED >= 0 and QTY_RECEIVED <= QTY_ORDERED),
    constraint CK_SUP_PURCH_ORDE_PO_LINE_PRIC check (PRICE_UNIT >= 0),
    constraint CK_SUP_PURCH_ORDE_PO_LINE_TAX check (TAX_RATE is null or (TAX_RATE >= 0 and TAX_RATE <= 1)),
    constraint CK_SUP_PURCH_ORDE_PO_LINE_STAT check (SD_LINE_STATUS in ('OPEN', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'))
);

create table RHN_SUP_STOCK_BIN (
    ID_STOCK_BIN bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN_PARENT bigint,
    CD_STOCK_BIN varchar(64) not null,
    NA_STOCK_BIN varchar(200) not null,
    SD_BIN_TYPE varchar(32) not null,
    SD_STOCK_DEFAULT varchar(32) not null,
    FG_RECEIVE boolean not null,
    FG_PICK boolean not null,
    FG_COUNT boolean not null,
    SN_SORT int not null,
    FG_ACTIVE boolean not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_SUP_STOCK_BIN_PK primary key (ID_STOCK_BIN),
    constraint UK_SUP_STOCK_BIN_STOCK_BIN_TEN unique (ID_TNT, ID_STOCK_BIN),
    constraint UK_SUP_STOCK_BIN_STOCK_BIN_COD unique (ID_TNT, ID_STOCK_SITE, CD_STOCK_BIN),
    constraint CK_SUP_STOCK_BIN_STOCK_BIN_TYP check (SD_BIN_TYPE in ('ZONE', 'RACK', 'BIN', 'COUNTER', 'TRANSIT')),
    constraint CK_SUP_STOCK_BIN_STOCK_BIN_DEF check (SD_STOCK_DEFAULT in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED'))
);

create table RHN_SUP_STOCK_COUNT (
    ID_STOCK_COUNT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint,
    CD_COUNT_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    SD_COUNT_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    DT_SNAP timestamp with time zone not null,
    DT_STARTED timestamp with time zone,
    ID_USER_STARTED bigint,
    DT_SUBMITTED timestamp with time zone,
    ID_USER_SUBMITTED bigint,
    DT_APPROVED timestamp with time zone,
    ID_USER_APPROVED bigint,
    DT_POSTED timestamp with time zone,
    ID_USER_POSTED bigint,
    DES_REASON varchar(1000),
    DES_STOCK_COUNT varchar(1000),
    ID_INV_TXN bigint,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_STOCK_COUNT_PK primary key (ID_STOCK_COUNT),
    constraint UK_SUP_STOCK_COUN_COUNT_TENANT unique (ID_TNT, ID_STOCK_COUNT),
    constraint UK_SUP_STOCK_COUNT_COUNT_NO unique (ID_TNT, CD_COUNT_NO),
    constraint UK_SUP_STOCK_COUN_COUNT_REQUES unique (ID_TNT, CD_REQ),
    constraint CK_SUP_STOCK_COUNT_COUNT_TYPE check (SD_COUNT_TYPE in ('FULL', 'BIN', 'ITEM', 'CYCLE')),
    constraint CK_SUP_STOCK_COUN_COUNT_STATUS check (SD_STATUS in ('DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED'))
);

create table RHN_SUP_STOCK_COUNT_LINE (
    ID_STOCK_COUNT_LINE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_COUNT bigint not null,
    SN_SORT int not null,
    ID_INV_BAL bigint not null,
    SN_INV_BAL_VER bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    QTY_BOOK decimal(28,8) not null,
    QTY_COUNTED decimal(28,8),
    QTY_VARIANCE decimal(28,8),
    SD_COUNT_RESULT varchar(32),
    DT_COUNTED timestamp with time zone,
    ID_USER_COUNTED bigint,
    DES_VARIANCE_REASON varchar(1000),
    constraint PK_SUP_STOCK_COUNT_LINE_PK primary key (ID_STOCK_COUNT_LINE),
    constraint UK_SUP_STOCK_COUN_COUNT_LINE_T unique (ID_TNT, ID_STOCK_COUNT_LINE),
    constraint UK_SUP_STOCK_COUN_COUNT_LINE_O unique (ID_TNT, ID_STOCK_COUNT, SN_SORT),
    constraint UK_SUP_STOCK_COUN_COUNT_LINE_B unique (ID_TNT, ID_STOCK_COUNT, ID_INV_BAL),
    constraint CK_SUP_STOCK_COUN_COUNT_LINE_Q check (QTY_BOOK >= 0 and (QTY_COUNTED is null or QTY_COUNTED >= 0)),
    constraint CK_SUP_STOCK_COUN_COUNT_LINE_R check (SD_COUNT_RESULT is null or SD_COUNT_RESULT in ('MATCHED', 'SURPLUS', 'SHORTAGE'))
);

create table RHN_SUP_STOCK_ITEM (
    ID_STOCK_ITEM bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_ITEM_PKG_BASE bigint not null,
    CD_BASE_UNIT varchar(64) not null,
    SD_ISSUE_POLICY varchar(32) not null,
    FG_NEGATIVE boolean not null,
    FG_LOT_REQUIRED boolean not null,
    FG_TRACE_REQUIRED boolean not null,
    FG_SPLIT boolean not null,
    FG_COLD_CHAIN boolean not null,
    FG_CONTROLLED boolean not null,
    SD_CONTROL_LEVEL varchar(32),
    FG_HIGH_ALERT boolean not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_STOCK_ITEM_PK primary key (ID_STOCK_ITEM),
    constraint UK_SUP_STOCK_ITEM_STOCK_ITEM_T unique (ID_TNT, ID_STOCK_ITEM),
    constraint UK_SUP_STOCK_ITEM_STOCK_ITEM_S unique (ID_TNT, ID_STOCK_SITE, ID_CATALOG_ITEM),
    constraint CK_SUP_STOCK_ITEM_STOCK_ITEM_I check (SD_ISSUE_POLICY in ('FEFO', 'FIFO', 'MANUAL')),
    constraint CK_SUP_STOCK_ITEM_STOCK_ITEM_S check (SD_STATUS in ('ACTIVE', 'SUSPENDED', 'RETIRED')),
    constraint CK_SUP_STOCK_ITEM_STOCK_ITEM_C check (FG_CONTROLLED or SD_CONTROL_LEVEL is null)
);

create table RHN_SUP_STOCK_LOT (
    ID_STOCK_LOT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_ITEM_PKG bigint not null,
    CD_LOT_NO varchar(128) not null,
    DA_PRODUCTION date,
    DA_EXPIRY date,
    CD_APPROVAL_SNAP varchar(128),
    NA_MFR_SNAP varchar(300),
    SD_QUALITY_STATUS varchar(32) not null,
    DT_QUALITY timestamp with time zone not null,
    ID_QUALITY_USER bigint not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_SUP_STOCK_LOT_PK primary key (ID_STOCK_LOT),
    constraint UK_SUP_STOCK_LOT_STOCK_LOT_TEN unique (ID_TNT, ID_STOCK_LOT),
    constraint UK_SUP_STOCK_LOT_STOCK_LOT_BUS unique (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG, CD_LOT_NO),
    constraint CK_SUP_STOCK_LOT_STOCK_LOT_QUA check (SD_QUALITY_STATUS in ('PENDING', 'QUALIFIED', 'QUARANTINE', 'REJECTED', 'RECALLED')),
    constraint CK_SUP_STOCK_LOT_STOCK_LOT_STA check (SD_STATUS in ('ACTIVE', 'CLOSED', 'RETIRED')),
    constraint CK_SUP_STOCK_LOT_STOCK_LOT_DAT check (DA_EXPIRY is null or DA_PRODUCTION is null or DA_EXPIRY >= DA_PRODUCTION)
);

create table RHN_SUP_STOCK_REQ (
    ID_STOCK_REQ bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE_SRC bigint not null,
    ID_DEPT_REQUESTING bigint not null,
    ID_STOCK_SITE_DESTINATION bigint,
    CD_REQ_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    SD_STATUS varchar(32) not null,
    DT_REQUESTED timestamp with time zone not null,
    ID_USER_REQUESTED bigint not null,
    DT_APPROVED timestamp with time zone,
    ID_USER_APPROVED bigint,
    DT_PICKED timestamp with time zone,
    ID_USER_PICKED bigint,
    DT_ISSUED timestamp with time zone,
    ID_USER_ISSUED bigint,
    DES_REASON varchar(1000),
    DES_STOCK_REQ varchar(1000),
    ID_INV_TXN bigint,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_STOCK_REQ_PK primary key (ID_STOCK_REQ),
    constraint UK_SUP_STOCK_REQ_REQ_TENANT_ID unique (ID_TNT, ID_STOCK_REQ),
    constraint UK_SUP_STOCK_REQ_REQ_NO unique (ID_TNT, CD_REQ_NO),
    constraint UK_SUP_STOCK_REQ_REQ_REQUEST unique (ID_TNT, CD_REQ),
    constraint CK_SUP_STOCK_REQ_REQ_STATUS check (SD_STATUS in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PICKING', 'ISSUED', 'REJECTED', 'CANCELLED'))
);

create table RHN_SUP_STOCK_REQ_ALLOC (
    ID_STOCK_REQ_ALLOC bigint,
    ID_TNT bigint not null,
    ID_STOCK_REQ_LINE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_LOT bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    QTY_ALLOCATED decimal(28,8) not null,
    QTY_ISSUED decimal(28,8) default 0 not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_SUP_STOCK_REQ_ALLOC_PK primary key (ID_STOCK_REQ_ALLOC),
    constraint UK_SUP_STOCK_REQ_REQ_ALLOC_TEN unique (ID_TNT, ID_STOCK_REQ_ALLOC),
    constraint UK_SUP_STOCK_REQ_REQ_ALLOC_DIM unique (ID_TNT, ID_STOCK_REQ_LINE, ID_STOCK_BIN, ID_STOCK_LOT, SD_STOCK_STATUS),
    constraint CK_SUP_STOCK_REQ_REQ_ALLOC_QUA check (QTY_ALLOCATED > 0 and QTY_ISSUED >= 0 and QTY_ISSUED <= QTY_ALLOCATED),
    constraint CK_SUP_STOCK_REQ_REQ_ALLOC_STA check (SD_STATUS in ('ALLOCATED', 'ISSUED', 'RELEASED'))
);

create table RHN_SUP_STOCK_REQ_LINE (
    ID_STOCK_REQ_LINE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_REQ bigint not null,
    SN_SORT int not null,
    ID_STOCK_ITEM bigint not null,
    QTY_REQUESTED decimal(28,8) not null,
    QTY_APPROVED decimal(28,8),
    QTY_ISSUED decimal(28,8) default 0 not null,
    CD_BASE_UNIT varchar(64) not null,
    SD_LINE_STATUS varchar(32) not null,
    DES_STOCK_REQ_LINE varchar(1000),
    constraint PK_SUP_STOCK_REQ_LINE_PK primary key (ID_STOCK_REQ_LINE),
    constraint UK_SUP_STOCK_REQ_REQ_LINE_TENA unique (ID_TNT, ID_STOCK_REQ_LINE),
    constraint UK_SUP_STOCK_REQ_REQ_LINE_ORDE unique (ID_TNT, ID_STOCK_REQ, SN_SORT),
    constraint UK_SUP_STOCK_REQ_REQ_LINE_ITEM unique (ID_TNT, ID_STOCK_REQ, ID_STOCK_ITEM),
    constraint CK_SUP_STOCK_REQ_REQ_LINE_QUAN check (QTY_REQUESTED > 0 and (QTY_APPROVED is null or (QTY_APPROVED >= 0 and QTY_APPROVED <= QTY_REQUESTED)) and QTY_ISSUED >= 0),
    constraint CK_SUP_STOCK_REQ_REQ_LINE_STAT check (SD_LINE_STATUS in ('REQUESTED', 'APPROVED', 'PICKING', 'ISSUED', 'REJECTED', 'CANCELLED'))
);

create table RHN_SUP_STOCK_RETURN (
    ID_STOCK_RETURN bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_PAT bigint not null,
    ID_MED_DISP_ORIGINAL bigint not null,
    ID_MED_DISP_RETURN bigint not null,
    CD_RETURN_NO varchar(64) not null,
    SD_RETURN_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    CD_REASON varchar(64) not null,
    DT_REQUESTED timestamp with time zone not null,
    ID_USER_REQUESTED bigint not null,
    DT_CONFIRMED timestamp with time zone not null,
    ID_USER_CONFIRMED bigint not null,
    DES_STOCK_RETURN varchar(1000),
    constraint PK_SUP_STOCK_RETURN_PK primary key (ID_STOCK_RETURN),
    constraint UK_SUP_STOCK_RETU_STOCK_RET_TE unique (ID_TNT, ID_STOCK_RETURN),
    constraint UK_SUP_STOCK_RETU_STOCK_RET_NO unique (ID_TNT, CD_RETURN_NO),
    constraint UK_SUP_STOCK_RETU_STOCK_RET_EV unique (ID_TNT, ID_MED_DISP_RETURN),
    constraint CK_SUP_STOCK_RETU_STOCK_RET_TY check (SD_RETURN_TYPE in ('PATIENT', 'SUPPLIER')),
    constraint CK_SUP_STOCK_RETU_STOCK_RET_ST check (SD_STATUS in ('REQUESTED', 'CONFIRMED', 'REJECTED', 'CANCELLED'))
);

create table RHN_SUP_STOCK_RETURN_LINE (
    ID_STOCK_RETURN_LINE bigint,
    ID_TNT bigint not null,
    ID_STOCK_RETURN bigint not null,
    ID_MED_DISP_LINE_ORIGINAL bigint not null,
    SN_SORT int not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    ID_INV_TXN_LINE bigint not null,
    QTY_REQUESTED decimal(28,8) not null,
    QTY_ACCEPTED decimal(28,8) not null,
    CD_RETURN_UNIT varchar(64) not null,
    BASE_QUANTITY_FACTOR decimal(28,8) not null,
    SD_DISPOSITION varchar(32) not null,
    DES_EXCEPT_DESCRIPTION varchar(1000),
    constraint PK_SUP_STOCK_RETURN_LINE_PK primary key (ID_STOCK_RETURN_LINE),
    constraint UK_SUP_STOCK_RETU_STOCK_RET_LI unique (ID_TNT, ID_STOCK_RETURN_LINE),
    constraint UK_SUP_STOCK_RETU_STOCK_RET__1 unique (ID_TNT, ID_STOCK_RETURN, SN_SORT),
    constraint UK_SUP_STOCK_RETU_STOCK_RET__2 unique (ID_TNT, ID_INV_TXN_LINE),
    constraint CK_SUP_STOCK_RETU_STOCK_RET_LI check (QTY_REQUESTED > 0 and QTY_ACCEPTED > 0 and QTY_ACCEPTED <= QTY_REQUESTED and BASE_QUANTITY_FACTOR > 0),
    constraint CK_SUP_STOCK_RETU_STOCK_RET__1 check (SD_DISPOSITION in ('RESTOCK', 'QUARANTINE', 'DESTROY', 'RETURN_SUPPLIER'))
);

create table RHN_SUP_STOCK_SITE (
    ID_STOCK_SITE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint,
    CD_STOCK_SITE varchar(64) not null,
    NA_STOCK_SITE varchar(200) not null,
    SD_SITE_TYPE varchar(32) not null,
    SD_SVC_SCOPE varchar(32) not null,
    FG_ACTIVE boolean not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_STOCK_SITE_PK primary key (ID_STOCK_SITE),
    constraint UK_SUP_STOCK_SITE_STOCK_SITE_T unique (ID_TNT, ID_STOCK_SITE),
    constraint UK_SUP_STOCK_SITE_STOCK_SITE_C unique (ID_TNT, ID_ORG, CD_STOCK_SITE),
    constraint UK_SUP_STOCK_SITE_STOCK_SITE_D unique (ID_TNT, ID_ORG, ID_DEPT),
    constraint CK_SUP_STOCK_SITE_STOCK_SITE_T check (SD_SITE_TYPE in ('WAREHOUSE', 'PHARMACY', 'DEPARTMENT_STORE', 'VIRTUAL')),
    constraint CK_SUP_STOCK_SITE_STOCK_SITE_S check (SD_SVC_SCOPE in ('OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'COMMUNITY', 'MIXED')),
    constraint CK_SUP_STOCK_SITE_STOCK_SITE_V check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_SUP_STOCK_SITE_STOCK_SITE_D check (SD_SITE_TYPE = 'VIRTUAL' or ID_DEPT is not null)
);

create table RHN_SUP_STOCK_XFER (
    ID_STOCK_XFER bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE_SRC bigint not null,
    ID_STOCK_SITE_DESTINATION bigint not null,
    CD_XFER_NO varchar(64) not null,
    CD_REQ varchar(128) not null,
    SD_STATUS varchar(32) not null,
    DT_REQUESTED timestamp with time zone not null,
    ID_USER_REQUESTED bigint not null,
    DT_APPROVED timestamp with time zone,
    ID_USER_APPROVED bigint,
    DT_DISPATCHED timestamp with time zone,
    ID_USER_DISPATCHED bigint,
    DT_RECEIVED timestamp with time zone,
    ID_USER_RECEIVED bigint,
    DES_REASON varchar(1000),
    DES_STOCK_XFER varchar(1000),
    ID_INV_TXN_OUTBOUND bigint,
    ID_INV_TXN_INBOUND bigint,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_STOCK_XFER_PK primary key (ID_STOCK_XFER),
    constraint UK_SUP_STOCK_XFER_TRANSFER_TEN unique (ID_TNT, ID_STOCK_XFER),
    constraint UK_SUP_STOCK_XFER_TRANSFER_NO unique (ID_TNT, CD_XFER_NO),
    constraint UK_SUP_STOCK_XFER_TRANSFER_REQ unique (ID_TNT, CD_REQ),
    constraint CK_SUP_STOCK_XFER_TRANSFER_SIT check (ID_STOCK_SITE_SRC <> ID_STOCK_SITE_DESTINATION),
    constraint CK_SUP_STOCK_XFER_TRANSFER_STA check (SD_STATUS in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PICKING', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED'))
);

create table RHN_SUP_STOCK_XFER_ALLOC (
    ID_STOCK_XFER_ALLOC bigint,
    ID_TNT bigint not null,
    ID_STOCK_XFER_LINE bigint not null,
    ID_STOCK_BIN_SRC bigint not null,
    ID_STOCK_BIN_DESTINATION bigint,
    ID_STOCK_LOT bigint not null,
    SD_STOCK_STATUS varchar(32) not null,
    QTY_DISPATCHED decimal(28,8) not null,
    QTY_RECEIVED decimal(28,8) default 0 not null,
    QTY_DAMAGED decimal(28,8) default 0 not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_SUP_STOCK_XFER_ALLOC_PK primary key (ID_STOCK_XFER_ALLOC),
    constraint UK_SUP_STOCK_XFER_TRANSFER_ALL unique (ID_TNT, ID_STOCK_XFER_ALLOC),
    constraint UK_SUP_STOCK_XFER_TRANSFER_A_1 unique (ID_TNT, ID_STOCK_XFER_LINE, ID_STOCK_BIN_SRC, ID_STOCK_LOT, SD_STOCK_STATUS),
    constraint CK_SUP_STOCK_XFER_TRANSFER_ALL check (QTY_DISPATCHED > 0 and QTY_RECEIVED >= 0 and QTY_DAMAGED >= 0 and QTY_RECEIVED + QTY_DAMAGED <= QTY_DISPATCHED),
    constraint CK_SUP_STOCK_XFER_TRANSFER_A_1 check (SD_STATUS in ('ALLOCATED', 'IN_TRANSIT', 'RECEIVED', 'DISCREPANCY'))
);

create table RHN_SUP_STOCK_XFER_LINE (
    ID_STOCK_XFER_LINE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_STOCK_XFER bigint not null,
    SN_SORT int not null,
    ID_STOCK_ITEM_SRC bigint not null,
    ID_STOCK_ITEM_DESTINATION bigint not null,
    QTY_REQUESTED decimal(28,8) not null,
    QTY_APPROVED decimal(28,8),
    QTY_DISPATCHED decimal(28,8) default 0 not null,
    QTY_RECEIVED decimal(28,8) default 0 not null,
    QTY_DAMAGED decimal(28,8) default 0 not null,
    CD_BASE_UNIT varchar(64) not null,
    SD_LINE_STATUS varchar(32) not null,
    DES_DISCREPANCY_REASON varchar(1000),
    QTY_REQUESTED_OPERATION decimal(28,8) not null,
    CD_OPERATION_UNIT varchar(64) not null,
    BASE_QUANTITY_FACTOR decimal(28,8) not null,
    constraint PK_SUP_STOCK_XFER_LINE_PK primary key (ID_STOCK_XFER_LINE),
    constraint UK_SUP_STOCK_XFER_TRANSFER_LIN unique (ID_TNT, ID_STOCK_XFER_LINE),
    constraint UK_SUP_STOCK_XFER_TRANSFER_L_1 unique (ID_TNT, ID_STOCK_XFER, SN_SORT),
    constraint UK_SUP_STOCK_XFER_TRANSFER_L_2 unique (ID_TNT, ID_STOCK_XFER, ID_STOCK_ITEM_SRC),
    constraint CK_SUP_STOCK_XFER_TRANSFER_LIN check (QTY_REQUESTED > 0 and (QTY_APPROVED is null or (QTY_APPROVED >= 0 and QTY_APPROVED <= QTY_REQUESTED)) and QTY_DISPATCHED >= 0 and QTY_RECEIVED >= 0 and QTY_DAMAGED >= 0),
    constraint CK_SUP_STOCK_XFER_TRANSFER_L_1 check (SD_LINE_STATUS in ('REQUESTED', 'APPROVED', 'PICKING', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    constraint CK_SUP_STOCK_XFER_TRANSFER_L_2 check (QTY_REQUESTED_OPERATION > 0 and BASE_QUANTITY_FACTOR > 0
        and QTY_REQUESTED = QTY_REQUESTED_OPERATION * BASE_QUANTITY_FACTOR)
);

create table RHN_SUP_SUPPL (
    ID_SUPPL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    CD_SUPPL varchar(64) not null,
    NA_SUPPL varchar(300) not null,
    CD_UNIFIED_CREDIT varchar(64),
    CD_LICENSE_NO varchar(128),
    DA_LICENSE_VALID_TO date,
    NA_CONTACT varchar(100),
    CONTACT_PHONE varchar(64),
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_SUPPL_PK primary key (ID_SUPPL),
    constraint UK_SUP_SUPPL_SUPPLIER_TENANT_I unique (ID_TNT, ID_SUPPL),
    constraint UK_SUP_SUPPL_SUPPLIER_CODE unique (ID_TNT, ID_ORG, CD_SUPPL),
    constraint CK_SUP_SUPPL_SUPPLIER_STATUS check (SD_STATUS in ('ACTIVE', 'SUSPENDED', 'RETIRED')),
    constraint CK_SUP_SUPPL_SUPPLIER_VALIDITY check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SUP_SUPPL_SUPPLY_ITEM (
    ID_SUPPL_SUPPLY_ITEM bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_SUPPL bigint not null,
    ID_CATALOG_ITEM bigint not null,
    ID_ITEM_PKG bigint not null,
    PRICE_AGREEMENT decimal(24,6),
    TAX_RATE decimal(9,6),
    FG_PURCH boolean not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SUP_SUPPL_SUPPLY_ITEM_PK primary key (ID_SUPPL_SUPPLY_ITEM),
    constraint UK_SUP_SUPPL_SUPP_SUPPLIER_ITE unique (ID_TNT, ID_SUPPL_SUPPLY_ITEM),
    constraint UK_SUP_SUPPL_SUPP_SUPPLIER_I_1 unique (ID_TNT, ID_SUPPL, ID_CATALOG_ITEM, ID_ITEM_PKG),
    constraint CK_SUP_SUPPL_SUPP_SUPPLIER_ITE check (PRICE_AGREEMENT is null or PRICE_AGREEMENT >= 0),
    constraint CK_SUP_SUPPL_SUPP_SUPPLIER_I_1 check (TAX_RATE is null or (TAX_RATE >= 0 and TAX_RATE <= 1)),
    constraint CK_SUP_SUPPL_SUPP_SUPPLIER_I_2 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SUP_WARD_DELIV (
    ID_WARD_DELIV bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_DEPT_NURS_UNIT bigint not null,
    CD_DELIV_NO varchar(64) not null,
    SD_STATUS varchar(32) not null,
    NA_STOCK_SITE_SNAP varchar(200) not null,
    NA_NURS_UNIT_SNAP varchar(200) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_DISPATCHED timestamp with time zone,
    ID_USER_DISPATCHED bigint,
    DES_DISPATCH_NOTE varchar(1000),
    DT_RECEIVED timestamp with time zone,
    ID_USER_RECEIVED bigint,
    DES_RCPT_NOTE varchar(1000),
    DES_DISCREPANCY_NOTE varchar(1000),
    DT_RESOLVED timestamp with time zone,
    ID_USER_RESOLVED bigint,
    CD_RESOLUTION varchar(32),
    DES_RESOLUTION_NOTE varchar(1000),
    constraint PK_SUP_WARD_DELIV_PK primary key (ID_WARD_DELIV),
    constraint UK_SUP_WARD_DELIV_WD_TENANT_ID unique (ID_TNT, ID_WARD_DELIV),
    constraint UK_SUP_WARD_DELIV_WD_NO unique (ID_TNT, CD_DELIV_NO),
    constraint CK_SUP_WARD_DELIV_WD_STATUS check (SD_STATUS in (
        'PENDING_DISPATCH', 'IN_TRANSIT', 'RECEIVED', 'DISCREPANCY', 'RESOLVED'
    )),
    constraint CK_SUP_WARD_DELIV_WD_DISPATCH check ((SD_STATUS = 'PENDING_DISPATCH' and DT_DISPATCHED is null and ID_USER_DISPATCHED is null)
        or (SD_STATUS <> 'PENDING_DISPATCH' and DT_DISPATCHED is not null and ID_USER_DISPATCHED is not null)),
    constraint CK_SUP_WARD_DELIV_WD_RECEIVE check ((SD_STATUS in ('PENDING_DISPATCH', 'IN_TRANSIT') and DT_RECEIVED is null and ID_USER_RECEIVED is null)
        or (SD_STATUS in ('RECEIVED', 'DISCREPANCY', 'RESOLVED') and DT_RECEIVED is not null and ID_USER_RECEIVED is not null)),
    constraint CK_SUP_WARD_DELIV_WD_RESOLVE check ((SD_STATUS <> 'RESOLVED' and DT_RESOLVED is null and ID_USER_RESOLVED is null and CD_RESOLUTION is null)
        or (SD_STATUS = 'RESOLVED' and DT_RESOLVED is not null and ID_USER_RESOLVED is not null and CD_RESOLUTION is not null))
);

create table RHN_SUP_WARD_DELIV_EVT (
    ID_WARD_DELIV_EVT bigint,
    ID_TNT bigint not null,
    ID_WARD_DELIV bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_FROM_STATUS varchar(32),
    SD_TO_STATUS varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_OCCURRED bigint not null,
    DES_NOTE varchar(1000),
    constraint PK_SUP_WARD_DELIV_EVT_PK primary key (ID_WARD_DELIV_EVT),
    constraint UK_SUP_WARD_DELIV_WDE_TENANT_I unique (ID_TNT, ID_WARD_DELIV_EVT),
    constraint UK_SUP_WARD_DELIV_WDE_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint CK_SUP_WARD_DELIV_EVT_WDE_TYPE check (SD_EVT_TYPE in (
        'CREATED', 'DISPATCHED', 'RECEIVED', 'DISCREPANCY_RECORDED', 'RESOLVED'
    ))
);

create table RHN_SUP_WARD_DELIV_LINE (
    ID_WARD_DELIV_LINE bigint,
    ID_TNT bigint not null,
    ID_WARD_DELIV bigint not null,
    ID_MED_DISP bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    NA_PAT_SNAP varchar(100) not null,
    NA_MED_SNAP varchar(300) not null,
    QTY_EXPECTED decimal(28,8) not null,
    QTY_RECEIVED decimal(28,8) default 0 not null,
    CD_UNIT varchar(64) not null,
    SD_STATUS varchar(32) not null,
    CD_DISCREPANCY varchar(32),
    DES_DISCREPANCY_NOTE varchar(1000),
    constraint PK_SUP_WARD_DELIV_LINE_PK primary key (ID_WARD_DELIV_LINE),
    constraint UK_SUP_WARD_DELIV_WDL_TENANT_I unique (ID_TNT, ID_WARD_DELIV_LINE),
    constraint UK_SUP_WARD_DELIV_WDL_DISPENSE unique (ID_TNT, ID_MED_DISP),
    constraint CK_SUP_WARD_DELIV_WDL_STATUS check (SD_STATUS in ('PENDING', 'MATCHED', 'SHORTAGE', 'REJECTED')),
    constraint CK_SUP_WARD_DELIV_WDL_QUANTITY check (QTY_EXPECTED > 0 and QTY_RECEIVED >= 0 and QTY_RECEIVED <= QTY_EXPECTED)
);

create table RHN_SUP_WARD_MED_RETURN_EVT (
    ID_WARD_MED_RETURN_EVT bigint,
    ID_TNT bigint not null,
    ID_WARD_MED_RETURN_REQ bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_FROM_STATUS varchar(32),
    SD_TO_STATUS varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    HASH_PAYLOAD varchar(64) not null,
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_OCCURRED bigint not null,
    DES_NOTE varchar(1000),
    constraint PK_SUP_WARD_MED_RETURN_EVT_PK primary key (ID_WARD_MED_RETURN_EVT),
    constraint UK_SUP_WARD_MED_R_WMRE_TENANT_ unique (ID_TNT, ID_WARD_MED_RETURN_EVT),
    constraint UK_SUP_WARD_MED_R_WMRE_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint CK_SUP_WARD_MED_R_WMRE_TYPE check (SD_EVT_TYPE in ('CREATED', 'HANDED_OVER', 'RECEIVED'))
);

create table RHN_SUP_WARD_MED_RETURN_LINE (
    ID_WARD_MED_RETURN_LINE bigint,
    ID_TNT bigint not null,
    ID_WARD_MED_RETURN_REQ bigint not null,
    ID_CARE_REQ bigint not null,
    ID_MED_DISP_ORIGINAL bigint not null,
    ID_MED_DISP_LINE_ORIGINAL bigint not null,
    ID_DISP_TASK_LINE bigint not null,
    NA_MED_SNAP varchar(300) not null,
    QTY_REQUESTED decimal(28,8) not null,
    CD_UNIT varchar(64) not null,
    QTY_REQUESTED_BASE decimal(28,8) not null,
    CD_BASE_UNIT varchar(64) not null,
    SD_DISPOSITION varchar(32),
    ID_STOCK_RETURN bigint,
    ID_MED_DISP_RETURN bigint,
    constraint PK_SUP_WARD_MED_RETURN_LINE_PK primary key (ID_WARD_MED_RETURN_LINE),
    constraint UK_SUP_WARD_MED_R_WMRL_TENANT_ unique (ID_TNT, ID_WARD_MED_RETURN_LINE),
    constraint UK_SUP_WARD_MED_R_WMRL_REQUEST unique (ID_TNT, ID_WARD_MED_RETURN_REQ, ID_MED_DISP_LINE_ORIGINAL),
    constraint CK_SUP_WARD_MED_R_WMRL_QUANTIT check (QTY_REQUESTED > 0 and QTY_REQUESTED_BASE > 0),
    constraint CK_SUP_WARD_MED_R_WMRL_DISPOSI check (SD_DISPOSITION is null or SD_DISPOSITION in ('RESTOCK', 'QUARANTINE', 'DESTROY')),
    constraint CK_SUP_WARD_MED_R_WMRL_RESULT check ((ID_STOCK_RETURN is null and ID_MED_DISP_RETURN is null and SD_DISPOSITION is null)
        or (ID_STOCK_RETURN is not null and ID_MED_DISP_RETURN is not null and SD_DISPOSITION is not null))
);

create table RHN_SUP_WARD_MED_RETURN_REQ (
    ID_WARD_MED_RETURN_REQ bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_DEPT_NURS_UNIT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    CD_REQ_NO varchar(64) not null,
    SD_STATUS varchar(32) not null,
    DT_REQUESTED timestamp with time zone not null,
    ID_USER_REQUESTED bigint not null,
    DES_REQ_NOTE varchar(1000),
    DT_HANDED_OVER timestamp with time zone,
    ID_USER_HANDED_OVER bigint,
    DES_HANDOVER_NOTE varchar(1000),
    DT_RECEIVED timestamp with time zone,
    ID_USER_RECEIVED bigint,
    ID_PROCESSOR_PRACT bigint,
    ID_PROCESSOR_ASSIGN bigint,
    DES_RCPT_NOTE varchar(1000),
    constraint PK_SUP_WARD_MED_RETURN_REQ_PK primary key (ID_WARD_MED_RETURN_REQ),
    constraint UK_SUP_WARD_MED_R_WMR_TENANT_I unique (ID_TNT, ID_WARD_MED_RETURN_REQ),
    constraint UK_SUP_WARD_MED_R_WMR_NO unique (ID_TNT, CD_REQ_NO),
    constraint CK_SUP_WARD_MED_R_WMR_STATUS check (SD_STATUS in ('REQUESTED', 'IN_TRANSIT', 'RECEIVED')),
    constraint CK_SUP_WARD_MED_R_WMR_HANDOVER check ((SD_STATUS = 'REQUESTED' and DT_HANDED_OVER is null and ID_USER_HANDED_OVER is null)
        or (SD_STATUS in ('IN_TRANSIT', 'RECEIVED') and DT_HANDED_OVER is not null and ID_USER_HANDED_OVER is not null)),
    constraint CK_SUP_WARD_MED_R_WMR_RECEIVE check ((SD_STATUS in ('REQUESTED', 'IN_TRANSIT') and DT_RECEIVED is null and ID_USER_RECEIVED is null
            and ID_PROCESSOR_PRACT is null and ID_PROCESSOR_ASSIGN is null)
        or (SD_STATUS = 'RECEIVED' and DT_RECEIVED is not null and ID_USER_RECEIVED is not null
            and ID_PROCESSOR_PRACT is not null and ID_PROCESSOR_ASSIGN is not null))
);

create table RHN_SYS_ACC_PERM (
    ID_ACC_PERM bigint,
    ID_TNT bigint not null,
    ID_MGMT_MOD bigint,
    CD_ACC_PERM varchar(128) not null,
    NA_ACC_PERM varchar(128) not null,
    CD_ACTION varchar(64) not null,
    CD_RSRC varchar(128) not null,
    SD_STATUS varchar(24) not null,
    constraint PK_SYS_ACC_PERM_PK primary key (ID_ACC_PERM),
    constraint UK_SYS_ACC_PERM_ACCESS_PERMISS unique (ID_TNT, ID_ACC_PERM),
    constraint UK_SYS_ACC_PERM_ACCESS_PERMI_1 unique (ID_TNT, CD_ACC_PERM),
    constraint UK_SYS_ACC_PERM_ACCESS_PERMI_2 unique (ID_TNT, CD_RSRC, CD_ACTION)
);

create table RHN_SYS_ACC_ROLE (
    ID_ACC_ROLE bigint,
    ID_TNT bigint not null,
    CD_ACC_ROLE varchar(64) not null,
    NA_ACC_ROLE varchar(128) not null,
    SD_ROLE_TYPE varchar(24) not null,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    REVISION bigint not null default 0,
    constraint PK_SYS_ACC_ROLE_PK primary key (ID_ACC_ROLE),
    constraint UK_SYS_ACC_ROLE_ACCESS_ROLE_TE unique (ID_TNT, ID_ACC_ROLE),
    constraint UK_SYS_ACC_ROLE_ACCESS_ROLE_CO unique (ID_TNT, CD_ACC_ROLE)
);

create table RHN_SYS_ANN (
    ID_SYS_ANN bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    SD_SCOPE_TYPE varchar(24) not null,
    ID_ORG bigint,
    ID_DEPT bigint,
    SD_CAT varchar(32) not null,
    SD_PRIORITY varchar(24) not null,
    NA_TITLE varchar(200) not null,
    DES_SUM varchar(500) not null,
    DES_CONTENT text not null,
    FG_PINNED boolean default false not null,
    SD_STATUS varchar(24) not null,
    DT_PUBLISH timestamp with time zone,
    DT_EXPIRE timestamp with time zone,
    ID_USER_CREATED bigint not null,
    ID_USER_PUBLISD bigint,
    DT_PUBLISD timestamp with time zone,
    ID_USER_WITHDRAWN bigint,
    DT_WITHDRAWN timestamp with time zone,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_SYS_ANN_PK primary key (ID_SYS_ANN),
    constraint UK_SYS_ANN_ANNOUNCEMENT_TENANT unique (ID_TNT, ID_SYS_ANN),
    constraint CK_SYS_ANN_ANNOUNCEMENT_SCOPE check ((SD_SCOPE_TYPE = 'TENANT' and ID_ORG is null and ID_DEPT is null) or
        (SD_SCOPE_TYPE = 'ORGANIZATION' and ID_ORG is not null and ID_DEPT is null) or
        (SD_SCOPE_TYPE = 'DEPARTMENT' and ID_ORG is not null and ID_DEPT is not null)),
    constraint CK_SYS_ANN_ANNOUNCEMENT_CATEGO check (SD_CAT in ('GENERAL','POLICY','MAINTENANCE','EMERGENCY')),
    constraint CK_SYS_ANN_ANNOUNCEMENT_PRIORI check (SD_PRIORITY in ('NORMAL','IMPORTANT','URGENT')),
    constraint CK_SYS_ANN_ANNOUNCEMENT_STATUS check (SD_STATUS in ('DRAFT','SCHEDULED','PUBLISHED','WITHDRAWN','EXPIRED')),
    constraint CK_SYS_ANN_ANNOUNCEMENT_VALIDI check (DT_EXPIRE is null or DT_PUBLISH is null or DT_EXPIRE > DT_PUBLISH)
);

create table RHN_SYS_ANN_READ_RCPT (
    ID_ANN_READ_RCPT bigint,
    ID_TNT bigint not null,
    ID_SYS_ANN bigint not null,
    ID_USER bigint not null,
    DT_READ timestamp with time zone not null,
    constraint PK_SYS_ANN_READ_RCPT_PK primary key (ID_ANN_READ_RCPT),
    constraint UK_SYS_ANN_READ_R_ANNOUNCEMENT unique (ID_TNT, ID_SYS_ANN, ID_USER)
);

create table RHN_SYS_CFG_DEF (
    ID_CFG_DEF bigint,
    CD_CONFIG_KEY varchar(160) not null,
    NA_CFG_DEF varchar(200) not null,
    DES_CFG_DEF varchar(1000),
    SD_VAL_TYPE varchar(24) not null,
    JSON_DEFAULT_VAL text,
    ALLOWED_SCOPES varchar(200) not null,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    SD_CFG_CAT varchar(24) not null default 'BUSINESS',
    FG_INHERITANCE boolean not null default true,
    FG_CACHE boolean not null default true,
    constraint PK_SYS_CFG_DEF_PK primary key (ID_CFG_DEF),
    constraint UK_SYS_CFG_DEF_CONFIGURATION_K unique (CD_CONFIG_KEY),
    constraint CK_SYS_CFG_DEF_CONFIGURATION_C check (SD_CFG_CAT in ('SYSTEM', 'BUSINESS'))
);

create table RHN_SYS_CFG_REV (
    ID_CFG_REV bigint,
    ID_CFG_DEF bigint not null,
    SD_SCOPE_TYPE varchar(24) not null,
    ID_SCOPE bigint not null,
    REVISION integer not null,
    JSON_VAL text not null,
    SD_STATUS varchar(24) not null,
    DT_EFFECTIVE_FROM timestamp with time zone,
    DT_EFFECTIVE_TO timestamp with time zone,
    DES_CHG_REASON varchar(500) not null,
    ID_USER_CREATED varchar(100) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_PUBLISD varchar(100),
    DT_PUBLISD timestamp with time zone,
    ID_TNT bigint,
    constraint PK_SYS_CFG_REV_PK primary key (ID_CFG_REV),
    constraint UK_SYS_CFG_REV_CONFIGURATION_R unique (ID_CFG_DEF, SD_SCOPE_TYPE, ID_SCOPE, REVISION),
    constraint CK_SYS_CFG_REV_CONFIGURATION_R check ((SD_SCOPE_TYPE = 'GLOBAL' and ID_TNT is null)
        or (SD_SCOPE_TYPE in ('TENANT', 'ORGANIZATION', 'DEPARTMENT', 'USER') and ID_TNT is not null))
);

create table RHN_SYS_DEPT (
    ID_DEPT bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT_PARENT bigint,
    ID_DEPT_MERGED_TO bigint,
    CD_DEPT varchar(64) not null,
    NA_DEPT varchar(200) not null,
    NA_SHORT varchar(100),
    DES_DEPT varchar(1000),
    SD_DEPT_TYPE varchar(128) not null,
    SD_DEPT_PROPERTY varchar(32),
    FG_VIRTUAL boolean default false not null,
    SN_SORT integer default 0 not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    REVISION bigint default 0 not null,
    constraint PK_SYS_DEPT_PK primary key (ID_DEPT),
    constraint UK_SYS_DEPT_DEPARTMENT_TENANT_ unique (ID_TNT, ID_DEPT),
    constraint UK_SYS_DEPT_DEPARTMENT_ORG_ID unique (ID_TNT, ID_ORG, ID_DEPT),
    constraint UK_SYS_DEPT_DEPARTMENT_CODE unique (ID_TNT, ID_ORG, CD_DEPT),
    constraint CK_SYS_DEPT_DEPARTMENT_PERIOD check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM),
    constraint CK_SYS_DEPT_DEPARTMENT_PARENT_ check (ID_DEPT_PARENT is null or ID_DEPT_PARENT <> ID_DEPT),
    constraint CK_SYS_DEPT_DEPARTMENT_MERGE_S check (ID_DEPT_MERGED_TO is null or ID_DEPT_MERGED_TO <> ID_DEPT)
);

create table RHN_SYS_DEPT_CAP (
    ID_DEPT_CAP bigint,
    ID_TNT bigint not null,
    ID_DEPT bigint not null,
    SD_CAP_TYPE varchar(64) not null,
    CD_QUALIFICATION_BASIS varchar(128),
    SD_CAP_SCOPE varchar(1000),
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_VERIFY_STATUS varchar(32) not null,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_DEPT_CAP_PK primary key (ID_DEPT_CAP),
    constraint UK_SYS_DEPT_CAP_DEPT_CAP_TENAN unique (ID_TNT, ID_DEPT_CAP),
    constraint UK_SYS_DEPT_CAP_DEPT_CAPABILIT unique (ID_TNT, ID_DEPT, SD_CAP_TYPE, DA_VALID_FROM),
    constraint CK_SYS_DEPT_CAP_DEPT_CAPABILIT check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_DEPT_CONTACT (
    ID_DEPT_CONTACT bigint,
    ID_TNT bigint not null,
    ID_DEPT bigint not null,
    SD_CONTACT_TYPE varchar(32) not null,
    CONTACT_VALUE varchar(300) not null,
    CONTACT_USE varchar(32) not null,
    FG_PRIMARY_CONTACT boolean default false not null,
    SN_SORT integer default 0 not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_DEPT_CONTACT_PK primary key (ID_DEPT_CONTACT),
    constraint UK_SYS_DEPT_CONTA_DEPT_CONTACT unique (ID_TNT, ID_DEPT_CONTACT),
    constraint UK_SYS_DEPT_CONTA_DEPT_CONTA_1 unique (ID_TNT, ID_DEPT, SD_CONTACT_TYPE, CONTACT_VALUE),
    constraint CK_SYS_DEPT_CONTA_DEPT_CONTACT check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_DEPT_REL (
    ID_DEPT_REL bigint,
    ID_TNT bigint not null,
    ID_DEPT_SRC bigint not null,
    ID_DEPT_TARGET bigint not null,
    SD_REL_TYPE varchar(32) not null,
    FG_PRIMARY_REL boolean default false not null,
    DES_DEPT_REL varchar(500),
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_DEPT_REL_PK primary key (ID_DEPT_REL),
    constraint UK_SYS_DEPT_REL_DEPT_REL_TENAN unique (ID_TNT, ID_DEPT_REL),
    constraint UK_SYS_DEPT_REL_DEPT_RELATION unique (ID_TNT, ID_DEPT_SRC, ID_DEPT_TARGET, SD_REL_TYPE, DA_VALID_FROM),
    constraint CK_SYS_DEPT_REL_DEPT_RELATION_ check (ID_DEPT_SRC <> ID_DEPT_TARGET),
    constraint CK_SYS_DEPT_REL_DEPT_RELATIO_1 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_DEPT_RESP (
    ID_DEPT_RESP bigint,
    ID_TNT bigint not null,
    ID_DEPT bigint not null,
    ID_STAFF_ASSIGN bigint,
    NA_EXT_RESPONSIBLE varchar(100),
    SD_RESP_TYPE varchar(32) not null,
    FG_PRIMARY_RESP boolean default false not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_DEPT_RESP_PK primary key (ID_DEPT_RESP),
    constraint UK_SYS_DEPT_RESP_DEPT_RESP_TEN unique (ID_TNT, ID_DEPT_RESP),
    constraint UK_SYS_DEPT_RESP_DEPT_RESP_ASS unique (ID_TNT, ID_DEPT, SD_RESP_TYPE, ID_STAFF_ASSIGN, DA_VALID_FROM),
    constraint CK_SYS_DEPT_RESP_DEPT_RESP_SUB check ((ID_STAFF_ASSIGN is not null and NA_EXT_RESPONSIBLE is null) or
        (ID_STAFF_ASSIGN is null and NA_EXT_RESPONSIBLE is not null)),
    constraint CK_SYS_DEPT_RESP_DEPT_RESP_PER check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_EMPL (
    ID_EMPL bigint,
    ID_TNT bigint not null,
    ID_PRACT bigint not null,
    ID_ORG bigint not null,
    CD_EMPL varchar(64) not null,
    SD_EMPL_TYPE varchar(32) not null,
    FG_PRIMARY_EMPL boolean not null,
    DA_HIRE date not null,
    DA_LEAVE date,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    REVISION bigint not null default 0,
    constraint PK_SYS_EMPL_PK primary key (ID_EMPL),
    constraint UK_SYS_EMPL_EMPLOYMENT_TENANT_ unique (ID_TNT, ID_EMPL),
    constraint UK_SYS_EMPL_EMPLOYMENT_CODE unique (ID_TNT, CD_EMPL),
    constraint UK_SYS_EMPL_EMPLOYMENT_PERIOD unique (ID_TNT, ID_PRACT, ID_ORG, DA_HIRE)
);

create table RHN_SYS_MGMT_MOD (
    ID_MGMT_MOD bigint,
    ID_TNT bigint not null,
    ID_MGMT_MOD_PARENT bigint,
    CD_MGMT_MOD varchar(64) not null,
    NA_MGMT_MOD varchar(128) not null,
    SD_MOD_TYPE varchar(24) not null,
    ROUTE_PATH varchar(300),
    CD_COMP varchar(128),
    CD_ICON varchar(64),
    SN_SORT integer not null,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    REVISION bigint not null default 0,
    constraint PK_SYS_MGMT_MOD_PK primary key (ID_MGMT_MOD),
    constraint UK_SYS_MGMT_MOD_MANAGEMENT_MOD unique (ID_TNT, ID_MGMT_MOD),
    constraint UK_SYS_MGMT_MOD_MANAGEMENT_M_1 unique (ID_TNT, CD_MGMT_MOD)
);

create table RHN_SYS_ORG (
    ID_ORG bigint,
    ID_TNT bigint not null,
    ID_ORG_PARENT bigint,
    ID_ORG_MERGED_TO bigint,
    CD_ORG varchar(64) not null,
    NA_ORG varchar(200) not null,
    SD_ORG_KIND varchar(32) not null,
    SD_ORG_TYPE varchar(64) not null,
    SD_STATUS varchar(24) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    REVISION bigint not null default 0,
    NA_SHORT varchar(100),
    DES_ORG varchar(1000),
    SD_ORG_PROPERTY varchar(32),
    FG_VIRTUAL boolean default false not null,
    SN_SORT integer default 0 not null,
    CD_TIMEZONE varchar(64),
    CD_DEPT_TYPE varchar(128),
    constraint PK_SYS_ORG_PK primary key (ID_ORG),
    constraint UK_SYS_ORG_ORGANIZATION_TENANT unique (ID_TNT, ID_ORG),
    constraint UK_SYS_ORG_ORGANIZATION_CODE unique (ID_TNT, CD_ORG)
);

create table RHN_SYS_ORG_ADDR (
    ID_ORG_ADDR bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    SD_ADDR_TYPE varchar(32) not null,
    CD_COUNTRY varchar(32) not null,
    CD_PROVINCE varchar(32),
    CD_CITY varchar(32),
    CD_DISTRICT varchar(32),
    DES_STREET_ADDR varchar(500) not null,
    CD_POSTAL varchar(32),
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_ORG_ADDR_PK primary key (ID_ORG_ADDR),
    constraint UK_SYS_ORG_ADDR_ORG_ADDRESS_TY unique (ID_TNT, ID_ORG, SD_ADDR_TYPE, DA_VALID_FROM),
    constraint CK_SYS_ORG_ADDR_ORG_ADDRESS_PE check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_ORG_CAP (
    ID_ORG_CAP bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    SD_CAP_TYPE varchar(64) not null,
    CD_QUALIFICATION_BASIS varchar(128),
    SD_CAP_SCOPE varchar(1000),
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_VERIFY_STATUS varchar(32) not null,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_ORG_CAP_PK primary key (ID_ORG_CAP),
    constraint UK_SYS_ORG_CAP_ORG_CAPABILITY unique (ID_TNT, ID_ORG, SD_CAP_TYPE, DA_VALID_FROM),
    constraint CK_SYS_ORG_CAP_ORG_CAPABILITY_ check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_ORG_CONTACT (
    ID_ORG_CONTACT bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    SD_CONTACT_TYPE varchar(32) not null,
    CONTACT_VALUE varchar(300) not null,
    CONTACT_USE varchar(32) not null,
    FG_PRIMARY_CONTACT boolean default false not null,
    SN_SORT integer default 0 not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_ORG_CONTACT_PK primary key (ID_ORG_CONTACT),
    constraint UK_SYS_ORG_CONTAC_ORG_CONTACT_ unique (ID_TNT, ID_ORG, SD_CONTACT_TYPE, CONTACT_VALUE),
    constraint CK_SYS_ORG_CONTAC_ORG_CONTACT_ check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_ORG_IDENT (
    ID_ORG_IDENT bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    CD_IDENT_SYS varchar(300) not null,
    CD_IDENT varchar(128) not null,
    SD_IDENT_TYPE varchar(64) not null,
    ID_ORG_ISSUER bigint,
    FG_PRIMARY_IDENT boolean default false not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_VERIFY_STATUS varchar(32) not null,
    DT_VERIFIED timestamp with time zone,
    ID_USER_VERIFIED bigint,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_ORG_IDENT_PK primary key (ID_ORG_IDENT),
    constraint UK_SYS_ORG_IDENT_ORG_IDENT_SYS unique (ID_TNT, CD_IDENT_SYS, CD_IDENT),
    constraint CK_SYS_ORG_IDENT_ORG_IDENT_PER check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_ORG_REL (
    ID_ORG_REL bigint,
    ID_TNT bigint not null,
    ID_ORG_SRC bigint not null,
    ID_ORG_TARGET bigint not null,
    SD_REL_TYPE varchar(32) not null,
    FG_PRIMARY_REL boolean default false not null,
    DES_ORG_REL varchar(500),
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_ORG_REL_PK primary key (ID_ORG_REL),
    constraint UK_SYS_ORG_REL_ORG_RELATION unique (ID_TNT, ID_ORG_SRC, ID_ORG_TARGET, SD_REL_TYPE, DA_VALID_FROM),
    constraint CK_SYS_ORG_REL_ORG_RELATION_SE check (ID_ORG_SRC <> ID_ORG_TARGET),
    constraint CK_SYS_ORG_REL_ORG_RELATION_PE check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_ORG_RESP (
    ID_ORG_RESP bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STAFF_ASSIGN bigint,
    NA_EXT_RESPONSIBLE varchar(100),
    SD_RESP_TYPE varchar(32) not null,
    FG_PRIMARY_RESP boolean default false not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    SD_STATUS varchar(32) not null,
    constraint PK_SYS_ORG_RESP_PK primary key (ID_ORG_RESP),
    constraint CK_SYS_ORG_RESP_ORG_RESPONSIBI check ((ID_STAFF_ASSIGN is not null and NA_EXT_RESPONSIBLE is null) or
        (ID_STAFF_ASSIGN is null and NA_EXT_RESPONSIBLE is not null)),
    constraint CK_SYS_ORG_RESP_ORG_RESPONSI_1 check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

create table RHN_SYS_PARAM_CAT (
    ID_PARAM_CAT bigint,
    ID_PARAM_CAT_PARENT bigint,
    CD_PARAM_CAT varchar(64) not null,
    NA_PARAM_CAT varchar(200) not null,
    DES_PARAM_CAT varchar(1000),
    SN_SORT integer not null default 0,
    FG_ACTIVE boolean not null default true,
    REVISION bigint not null default 0,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SYS_PARAM_CAT_PK primary key (ID_PARAM_CAT),
    constraint UK_SYS_PARAM_CAT_PARAMETER_CAT unique (CD_PARAM_CAT),
    constraint CK_SYS_PARAM_CAT_PARAMETER_CAT check (ID_PARAM_CAT_PARENT is null or ID_PARAM_CAT_PARENT <> ID_PARAM_CAT),
    constraint CK_SYS_PARAM_CAT_PARAMETER_C_1 check (SN_SORT >= 0)
);

create table RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG bigint,
    ID_TNT bigint,
    ID_PARAM_DEF bigint not null,
    ID_PARAM_VAL bigint,
    SD_TARGET_TYPE varchar(24) not null,
    SD_CHG_TYPE varchar(24) not null,
    JSON_BEFORE text,
    JSON_AFTER text,
    DES_CHG_REASON varchar(1000),
    CD_REQ varchar(128) not null,
    DT_CHANGED timestamp with time zone not null,
    ID_USER_CHANGED bigint not null,
    constraint PK_SYS_PARAM_CHG_PK primary key (ID_PARAM_CHG),
    constraint UK_SYS_PARAM_CHG_PARAMETER_CHA unique (CD_REQ),
    constraint CK_SYS_PARAM_CHG_PARAMETER_CHA check (SD_TARGET_TYPE in ('DEFINITION', 'VALUE')),
    constraint CK_SYS_PARAM_CHG_PARAMETER_C_1 check (SD_CHG_TYPE in ('CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'RESET', 'ROLLBACK')),
    constraint CK_SYS_PARAM_CHG_PARAMETER_C_2 check (JSON_BEFORE is not null or JSON_AFTER is not null),
    constraint CK_SYS_PARAM_CHG_PARAMETER_C_3 check ((SD_TARGET_TYPE = 'DEFINITION' and ID_PARAM_VAL is null)
        or (SD_TARGET_TYPE = 'VALUE' and ID_PARAM_VAL is not null))
);

create table RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF bigint,
    ID_PARAM_CAT bigint not null,
    CD_PARAM_KEY varchar(160) not null,
    NA_PARAM_DEF varchar(200) not null,
    DES_PARAM_DEF varchar(1000),
    SD_VAL_TYPE varchar(24) not null,
    SD_CONTROL_TYPE varchar(32) not null,
    JSON_SCHEMA text,
    JSON_DEFAULT_VAL text,
    JSON_EXAMPLE_VAL text,
    UNIT varchar(32),
    CD_DICT varchar(64),
    JSON_SCOPE text not null,
    SD_PARAM_CAT varchar(24) not null,
    FG_INHERITANCE boolean not null default true,
    FG_CACHE boolean not null default true,
    FG_NULLABLE_VAL boolean not null default false,
    SENSITIVITY varchar(24) not null,
    SD_DISPLAY_POLICY varchar(24) not null,
    SD_STATUS varchar(16) not null,
    REVISION bigint not null default 0,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SYS_PARAM_DEF_PK primary key (ID_PARAM_DEF),
    constraint UK_SYS_PARAM_DEF_PARAMETER_DEF unique (CD_PARAM_KEY),
    constraint CK_SYS_PARAM_DEF_PARAMETER_DEF check (SD_PARAM_CAT in ('SYSTEM', 'BUSINESS')),
    constraint CK_SYS_PARAM_DEF_PARAMETER_D_1 check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_SYS_PARAM_DEF_PARAMETER_D_2 check (SENSITIVITY in ('NORMAL', 'SENSITIVE', 'SECRET')),
    constraint CK_SYS_PARAM_DEF_PARAMETER_D_3 check (SD_DISPLAY_POLICY in ('PLAIN', 'MASKED', 'HIDDEN'))
);

create table RHN_SYS_PARAM_VAL (
    ID_PARAM_VAL bigint,
    ID_PARAM_DEF bigint not null,
    ID_TNT bigint,
    SD_SCOPE_TYPE varchar(24) not null,
    ID_SCOPE bigint,
    SCOPE_REFERENCE varchar(128),
    CD_SCOPE varchar(200) not null,
    SD_VAL_MODE varchar(24) not null,
    JSON_VAL text,
    SECRET_REF varchar(500),
    FG_ACTIVE boolean not null default true,
    REVISION bigint not null default 0,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_SYS_PARAM_VAL_PK primary key (ID_PARAM_VAL),
    constraint UK_SYS_PARAM_VAL_PARAMETER_VAL unique (ID_PARAM_DEF, CD_SCOPE),
    constraint CK_SYS_PARAM_VAL_PARAMETER_VAL check (SD_VAL_MODE in ('INHERIT', 'OVERRIDE', 'RESET_DEFAULT', 'EXPLICIT_NULL')),
    constraint CK_SYS_PARAM_VAL_PARAMETER_V_1 check ((SD_SCOPE_TYPE = 'PLATFORM' and ID_TNT is null)
        or (SD_SCOPE_TYPE in ('TENANT', 'ORGANIZATION', 'DEPARTMENT', 'USER', 'PRODUCT', 'MODULE', 'ENVIRONMENT')
            and ID_TNT is not null)),
    constraint CK_SYS_PARAM_VAL_PARAMETER_V_2 check ((SD_SCOPE_TYPE = 'PLATFORM' and ID_SCOPE is null and SCOPE_REFERENCE is null)
        or (SD_SCOPE_TYPE in ('TENANT', 'ORGANIZATION', 'DEPARTMENT', 'USER') and ID_SCOPE is not null and SCOPE_REFERENCE is null)
        or (SD_SCOPE_TYPE in ('PRODUCT', 'MODULE', 'ENVIRONMENT') and ID_SCOPE is null and SCOPE_REFERENCE is not null)),
    constraint CK_SYS_PARAM_VAL_PARAMETER_V_3 check ((SD_VAL_MODE = 'OVERRIDE' and ((JSON_VAL is not null and SECRET_REF is null)
            or (JSON_VAL is null and SECRET_REF is not null)))
        or (SD_VAL_MODE <> 'OVERRIDE' and JSON_VAL is null and SECRET_REF is null))
);

create table RHN_SYS_PORTAL_NOTIFY (
    ID_PORTAL_NOTIFY bigint,
    ID_TNT bigint not null,
    ID_ORG bigint,
    ID_DEPT bigint,
    ID_USER_RECIPIENT bigint,
    SD_CAT varchar(40) not null,
    SD_SEVERITY varchar(24) not null,
    NA_TITLE varchar(200) not null,
    DES_MSG varchar(1000) not null,
    SD_STATUS varchar(24) not null,
    ROUTE_PATH varchar(500),
    SD_SRC_TYPE varchar(80) not null,
    ID_SRC bigint not null,
    CD_DEDUP_KEY varchar(240) not null,
    DT_CREATED timestamp with time zone not null,
    DT_READ timestamp with time zone,
    DT_ARCHIVED timestamp with time zone,
    REVISION bigint not null default 0,
    constraint PK_SYS_PORTAL_NOTIFY_PK primary key (ID_PORTAL_NOTIFY),
    constraint UK_SYS_PORTAL_NOT_PORTAL_NOTIF unique (ID_TNT, CD_DEDUP_KEY)
);

create table RHN_SYS_PORTAL_USER_WKSPACE (
    ID_PORTAL_USER_WKSPACE bigint,
    ID_TNT bigint not null,
    ID_USER bigint not null,
    ID_ORG_DEFAULT bigint,
    ID_DEPT_DEFAULT bigint,
    JSON_FAVORITES text not null,
    JSON_TABS text not null,
    JSON_LAYOUT text not null,
    DT_UPDATED timestamp with time zone not null,
    REVISION bigint not null default 0,
    constraint PK_SYS_PORTAL_USER_WKSPACE_PK primary key (ID_PORTAL_USER_WKSPACE),
    constraint UK_SYS_PORTAL_USE_PORTAL_WORKS unique (ID_TNT, ID_USER)
);

create table RHN_SYS_POS (
    ID_POS bigint,
    ID_TNT bigint not null,
    CD_POS varchar(64) not null,
    NA_POS varchar(128) not null,
    SD_POS_TYPE varchar(32) not null,
    DES_DUTY_DESCRIPTION varchar(1000),
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    REVISION bigint not null default 0,
    constraint PK_SYS_POS_PK primary key (ID_POS),
    constraint UK_SYS_POS_POSITION_TENANT_ID unique (ID_TNT, ID_POS),
    constraint UK_SYS_POS_POSITION_CODE unique (ID_TNT, CD_POS)
);

create table RHN_SYS_PRACT (
    ID_PRACT bigint,
    ID_TNT bigint not null,
    CD_PRACT varchar(64) not null,
    NA_FULL varchar(100) not null,
    SD_GENDER varchar(32),
    HASH_IDENT varchar(128),
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    REVISION bigint not null default 0,
    constraint PK_SYS_PRACT_PK primary key (ID_PRACT),
    constraint UK_SYS_PRACT_PRACTITIONER_TENA unique (ID_TNT, ID_PRACT),
    constraint UK_SYS_PRACT_PRACTITIONER_CODE unique (ID_TNT, CD_PRACT)
);

create table RHN_SYS_PRINT_JOB (
    ID_PRINT_JOB bigint,
    ID_TNT bigint not null,
    ID_PRINT_OUTPUT bigint not null,
    ID_PRINT_JOB_ORIGINAL bigint,
    SD_REQ_TYPE varchar(24) not null,
    QTY_COPIES integer not null,
    SD_STATUS varchar(24) not null,
    DT_REQUESTED timestamp with time zone not null,
    ID_USER_REQUESTED bigint not null,
    ID_CORRELATION varchar(64) not null,
    constraint PK_SYS_PRINT_JOB_PK primary key (ID_PRINT_JOB),
    constraint UK_SYS_PRINT_JOB_PRINT_JOB_TEN unique (ID_TNT, ID_PRINT_JOB),
    constraint CK_SYS_PRINT_JOB_PRINT_JOB_TYP check (SD_REQ_TYPE in ('ORIGINAL', 'REPRINT')),
    constraint CK_SYS_PRINT_JOB_PRINT_JOB_COP check (QTY_COPIES between 1 and 10),
    constraint CK_SYS_PRINT_JOB_PRINT_JOB_STA check (SD_STATUS in ('GENERATED', 'FAILED'))
);

create table RHN_SYS_PRINT_OUTPUT (
    ID_PRINT_OUTPUT bigint,
    ID_TNT bigint not null,
    ID_PRINT_TMPL bigint not null,
    ID_PRINT_TMPL_VER bigint not null,
    SD_SRC_TYPE varchar(80) not null,
    ID_SRC bigint not null,
    SN_SRC_VER bigint not null,
    SD_DOC_TYPE varchar(80) not null,
    ID_PAT bigint,
    ID_ENC bigint,
    ID_ORG bigint,
    ID_DEPT bigint,
    SD_PURPOSE varchar(40) not null,
    JSON_SNAP text not null,
    NA_FILE varchar(300) not null,
    SD_MEDIA_TYPE varchar(100) not null,
    CONTENT_BASE64 text not null,
    CONTENT_DIGEST_ALGORITHM varchar(32) not null,
    HASH_CONTENT varchar(256) not null,
    DT_GENERATED timestamp with time zone not null,
    ID_USER_GENERATED bigint not null,
    constraint PK_SYS_PRINT_OUTPUT_PK primary key (ID_PRINT_OUTPUT),
    constraint UK_SYS_PRINT_OUTP_PRINT_OUTPUT unique (ID_TNT, ID_PRINT_OUTPUT),
    constraint CK_SYS_PRINT_OUTP_PRINT_OUTPUT check (SN_SRC_VER > 0),
    constraint CK_SYS_PRINT_OUTP_PRINT_OUTP_1 check (SD_PURPOSE in ('CLINICAL_USE', 'PATIENT_COPY', 'ARCHIVE_COPY'))
);

create table RHN_SYS_ROLE_PERM_ASSIGN (
    ID_ROLE_PERM_ASSIGN bigint,
    ID_TNT bigint not null,
    ID_ACC_ROLE bigint not null,
    ID_ACC_PERM bigint not null,
    DT_VALID_FROM timestamp with time zone not null,
    DT_VALID_TO timestamp with time zone,
    ID_USER_GRANTED bigint,
    DT_CREATED timestamp with time zone not null,
    constraint PK_SYS_ROLE_PERM_ASSIGN_PK primary key (ID_ROLE_PERM_ASSIGN),
    constraint UK_SYS_ROLE_PERM_ROLE_PERMISSI unique (ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM)
);

create table RHN_SYS_STAFF_ASSIGN (
    ID_STAFF_ASSIGN bigint,
    ID_TNT bigint not null,
    ID_EMPL bigint not null,
    ID_ORG bigint not null,
    ID_POS bigint not null,
    CD_STAFF_ASSIGN varchar(64) not null,
    SD_ASSIGN_TYPE varchar(32) not null,
    CD_SPECIALTY varchar(64),
    FG_PRIMARY_ASSIGN boolean not null,
    WORKLOAD_PERCENT decimal(5,2),
    SD_STATUS varchar(24) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    REVISION bigint not null default 0,
    ID_DEPT bigint not null,
    constraint PK_SYS_STAFF_ASSIGN_PK primary key (ID_STAFF_ASSIGN),
    constraint UK_SYS_STAFF_ASSI_STAFF_ASSIGN unique (ID_TNT, ID_STAFF_ASSIGN),
    constraint UK_SYS_STAFF_ASSI_ASSIGNMENT_C unique (ID_TNT, CD_STAFF_ASSIGN),
    constraint CK_SYS_STAFF_ASSI_ASSIGNMENT_W check (WORKLOAD_PERCENT is null or (WORKLOAD_PERCENT >= 0 and WORKLOAD_PERCENT <= 100))
);

create table RHN_SYS_SVC_RSRC (
    ID_SVC_RSRC bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_PRACT bigint,
    ID_STAFF_ASSIGN bigint,
    ID_CATALOG_ITEM bigint not null,
    CD_RSRC varchar(128) not null,
    NA_RSRC varchar(300) not null,
    CD_SVC_SNAP varchar(64) not null,
    NA_SVC_SNAP varchar(300) not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    SD_RSRC_TYPE varchar(24) default 'PRACTITIONER' not null,
    CD_RSRC_KEY varchar(128) not null,
    constraint PK_SYS_SVC_RSRC_PK primary key (ID_SVC_RSRC),
    constraint UK_SYS_SVC_RSRC_SCHED_RESOURCE unique (ID_TNT, ID_SVC_RSRC),
    constraint UK_SYS_SVC_RSRC_SCHED_RESOUR_1 unique (ID_TNT, CD_RSRC),
    constraint UK_SYS_SVC_RSRC_SCHED_RESOUR_2 unique (ID_TNT, ID_ORG, ID_DEPT, ID_PRACT, ID_CATALOG_ITEM),
    constraint UK_SYS_SVC_RSRC_SCHED_RESOUR_3 unique (ID_TNT, ID_ORG, ID_DEPT, CD_RSRC_KEY, ID_CATALOG_ITEM),
    constraint CK_SYS_SVC_RSRC_SCHED_RESOURCE check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_SYS_SVC_RSRC_SCHED_RESOUR_1 check (SD_RSRC_TYPE in ('PRACTITIONER', 'DEPARTMENT')),
    constraint CK_SYS_SVC_RSRC_SCHED_RESOUR_2 check ((SD_RSRC_TYPE = 'PRACTITIONER' and ID_PRACT is not null and ID_STAFF_ASSIGN is not null)
        or (SD_RSRC_TYPE = 'DEPARTMENT' and ID_PRACT is null and ID_STAFF_ASSIGN is null))
);

create table RHN_SYS_TNT (
    ID_TNT bigint,
    CD_TNT varchar(64) not null,
    NA_TNT varchar(200) not null,
    CD_TIMEZONE varchar(64) not null default 'Asia/Shanghai',
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    REVISION bigint not null default 0,
    constraint PK_SYS_TNT_PK primary key (ID_TNT),
    constraint UK_SYS_TNT_TENANT_CODE unique (CD_TNT)
);

create table RHN_SYS_USER_ACCT (
    ID_USER bigint,
    ID_TNT bigint not null,
    ID_PRACT bigint,
    CD_USERNAME varchar(128) not null,
    HASH_PASSWORD varchar(512) not null,
    SD_STATUS varchar(24) not null,
    DT_PASSWORD_CHANGED timestamp with time zone,
    DT_LAST_LOGIN timestamp with time zone,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    REVISION bigint not null default 0,
    constraint PK_SYS_USER_ACCT_PK primary key (ID_USER),
    constraint UK_SYS_USER_ACCT_USER_ACCOUNT_ unique (ID_TNT, ID_USER),
    constraint UK_SYS_USER_ACCT_USER_ACCOUN_1 unique (ID_TNT, CD_USERNAME)
);

create table RHN_SYS_USER_ROLE_ASSIGN (
    ID_USER_ROLE_ASSIGN bigint,
    ID_TNT bigint not null,
    ID_USER bigint not null,
    ID_ACC_ROLE bigint not null,
    ID_ORG bigint,
    ID_DEPT bigint,
    SD_DATA_SCOPE_TYPE varchar(24) not null,
    DT_VALID_FROM timestamp with time zone not null,
    DT_VALID_TO timestamp with time zone,
    ID_USER_GRANTED bigint,
    DT_CREATED timestamp with time zone not null,
    constraint PK_SYS_USER_ROLE_ASSIGN_PK primary key (ID_USER_ROLE_ASSIGN),
    constraint UK_SYS_USER_ROLE_USER_ROLE_PER unique (ID_TNT, ID_USER, ID_ACC_ROLE, ID_ORG, ID_DEPT, DT_VALID_FROM),
    constraint CK_SYS_USER_ROLE_USER_ROLE_DEP check (ID_DEPT is null or ID_ORG is not null),
    constraint CK_SYS_USER_ROLE_USER_ROLE_DAT check ((SD_DATA_SCOPE_TYPE = 'TENANT' and ID_ORG is null and ID_DEPT is null) or
        (SD_DATA_SCOPE_TYPE = 'ORGANIZATION' and ID_ORG is not null and ID_DEPT is null) or
        (SD_DATA_SCOPE_TYPE = 'DEPARTMENT' and ID_ORG is not null and ID_DEPT is not null))
);

create table RHN_SYS_WORK_TASK (
    ID_WORK_TASK bigint,
    ID_TNT bigint not null,
    ID_ORG bigint,
    ID_DEPT bigint,
    SD_TASK_TYPE varchar(64) not null,
    NA_TITLE varchar(200) not null,
    DES_SUM varchar(1000),
    SD_PRIORITY varchar(24) not null,
    SD_STATUS varchar(24) not null,
    SD_ASSIGNEE_TYPE varchar(24) not null,
    ID_USER_ASSIGNEE bigint,
    ID_PAT bigint,
    ID_ENC bigint,
    SD_SRC_TYPE varchar(80) not null,
    ID_SRC bigint not null,
    ROUTE_PATH varchar(500),
    CD_DEDUP_KEY varchar(240) not null,
    DT_DUE timestamp with time zone,
    ID_USER_CLAIMED bigint,
    DT_CLAIMED timestamp with time zone,
    ID_USER_COMPLETED bigint,
    DT_COMPLETED timestamp with time zone,
    ID_USER_CREATED bigint,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    REVISION bigint not null default 0,
    constraint PK_SYS_WORK_TASK_PK primary key (ID_WORK_TASK),
    constraint UK_SYS_WORK_TASK_WORK_TASK_TEN unique (ID_TNT, ID_WORK_TASK),
    constraint UK_SYS_WORK_TASK_WORK_TASK_DED unique (ID_TNT, CD_DEDUP_KEY)
);

create table RHN_SYS_WORK_TASK_HIST (
    ID_WORK_TASK_HIST bigint,
    ID_TNT bigint not null,
    ID_WORK_TASK bigint not null,
    SD_ACTION varchar(32) not null,
    SD_FROM_STATUS varchar(24),
    SD_TO_STATUS varchar(24) not null,
    ID_USER_ACTOR bigint,
    DES_COMMENT varchar(1000),
    ID_CORRELATION varchar(64) not null,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_SYS_WORK_TASK_HIST_PK primary key (ID_WORK_TASK_HIST)
);

create table RHN_VIS_ALLERGY_INTOL (
    ID_ALLERGY_INTOL bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    SD_ASSERTION_TYPE varchar(32) not null,
    CD_CAT varchar(32),
    SD_CLIN_STATUS varchar(32) not null,
    SD_VERIFICATION_STATUS varchar(32) not null,
    CD_CRITICALITY varchar(32),
    SD_REACTION_SEVERITY varchar(32),
    SD_INFORMATION_SRC varchar(32) not null,
    CD_SUBSTANCE_CODE_SYS_URI varchar(300),
    CD_SUBSTANCE varchar(128),
    NA_SUBSTANCE varchar(300),
    DES_REACTION varchar(1000),
    DT_ONSET timestamp with time zone,
    DT_RECORDED timestamp with time zone not null,
    ID_PRACT_RECORDER bigint,
    ID_USER_RECORDER bigint not null,
    DT_VERIFIED timestamp with time zone,
    ID_PRACT_VERIFIER bigint,
    DT_INACTIVATED timestamp with time zone,
    ID_USER_INACTIVATED bigint,
    DES_INACTIVATION_REASON varchar(1000),
    constraint PK_VIS_ALLERGY_INTOL_PK primary key (ID_ALLERGY_INTOL),
    constraint UK_VIS_ALLERGY_IN_ALLERGY_TENA unique (ID_TNT, ID_ALLERGY_INTOL),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_ASSE check (SD_ASSERTION_TYPE in ('ALLERGY', 'NO_KNOWN_ALLERGY', 'NO_KNOWN_DRUG_ALLERGY')),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_CATE check (CD_CAT is null or CD_CAT in ('DRUG', 'FOOD', 'ENVIRONMENT', 'BIOLOGIC', 'OTHER')),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_CLIN check (SD_CLIN_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_VERI check (SD_VERIFICATION_STATUS in ('UNCONFIRMED', 'CONFIRMED', 'REFUTED', 'ENTERED_IN_ERROR')),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_CRIT check (CD_CRITICALITY is null or CD_CRITICALITY in ('LOW', 'HIGH', 'UNABLE_TO_ASSESS')),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_SEVE check (SD_REACTION_SEVERITY is null or SD_REACTION_SEVERITY in ('MILD', 'MODERATE', 'SEVERE')),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_SOUR check (SD_INFORMATION_SRC in ('PATIENT', 'FAMILY', 'MEDICAL_RECORD', 'CLINICIAN')),
    constraint CK_VIS_ALLERGY_IN_ALLERGY_ACTI check ((SD_CLIN_STATUS = 'ACTIVE' and DT_INACTIVATED is null and ID_USER_INACTIVATED is null and DES_INACTIVATION_REASON is null) or
        (SD_CLIN_STATUS = 'INACTIVE' and DT_INACTIVATED is not null and ID_USER_INACTIVATED is not null and DES_INACTIVATION_REASON is not null))
);

create table RHN_VIS_CARE_EPISODE (
    ID_CARE_EPISODE bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ORG bigint not null,
    CD_EPISODE_NO varchar(32) not null,
    SD_EPISODE_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    DT_START timestamp with time zone not null,
    DT_END timestamp with time zone,
    ID_PRIMARY_PRACT bigint,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_VIS_CARE_EPISODE_PK primary key (ID_CARE_EPISODE),
    constraint UK_VIS_CARE_EPISO_CARE_EP_TENA unique (ID_TNT, ID_CARE_EPISODE),
    constraint UK_VIS_CARE_EPISODE_CARE_EP_NO unique (ID_TNT, CD_EPISODE_NO),
    constraint CK_VIS_CARE_EPISO_CARE_EP_TYPE check (SD_EPISODE_TYPE in ('INPATIENT', 'HOME_BED', 'CHRONIC_CARE', 'OTHER')),
    constraint CK_VIS_CARE_EPISO_CARE_EP_STAT check (SD_STATUS in (
        'PLANNED', 'PENDING_BED', 'ADMITTED', 'ON_LEAVE', 'DISCHARGE_PENDING', 'DISCHARGED', 'CANCELLED'
    )),
    constraint CK_VIS_CARE_EPISO_CARE_EP_PERI check (DT_END is null or DT_END >= DT_START)
);

create table RHN_VIS_CLIN_DOC (
    ID_CLIN_DOC bigint,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    ID_ORG bigint,
    ID_DEPT bigint,
    SD_DOC_TYPE varchar(100) not null,
    NA_TITLE varchar(300) not null,
    SD_STATUS varchar(32) not null,
    SN_CURRENT_VER integer not null,
    ID_USER_CREATED varchar(100) not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    REVISION bigint not null default 0,
    CD_INSTANCE_KEY varchar(100) default 'DEFAULT' not null,
    constraint PK_VIS_CLIN_DOC_PK primary key (ID_CLIN_DOC),
    constraint UK_VIS_CLIN_DOC_CLINICAL_DOCUM unique (ID_TNT, ID_CLIN_DOC),
    constraint UK_VIS_CLIN_DOC_ENCOUNTER_DOCU unique (ID_TNT, ID_ENC, SD_DOC_TYPE, CD_INSTANCE_KEY),
    constraint CK_VIS_CLIN_DOC_CLINICAL_DOCUM check (ID_DEPT is null or ID_ORG is not null)
);

create table RHN_VIS_CLIN_DOC_VER (
    ID_CLIN_DOC_VER bigint,
    ID_TNT bigint not null,
    ID_CLIN_DOC bigint not null,
    CD_VER_NUMBER integer not null,
    JSON_CONTENT text not null,
    JSON_CONTENT_SCHEMA varchar(100) not null,
    SD_CHG_TYPE varchar(32) not null,
    DES_CHG_REASON varchar(500) not null,
    ID_USER_CREATED varchar(100) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_SIGNED varchar(100),
    DT_SIGNED timestamp with time zone,
    SD_SIGN_MEANING varchar(100),
    CONTENT_DIGEST_ALGORITHM varchar(64),
    HASH_CONTENT varchar(512),
    ID_CRYPTO_EVID_INTEGRITY bigint,
    ID_CRYPTO_EVID_SIGN bigint,
    constraint PK_VIS_CLIN_DOC_VER_PK primary key (ID_CLIN_DOC_VER),
    constraint UK_VIS_CLIN_DOC_V_DOCUMENT_VER unique (ID_CLIN_DOC, CD_VER_NUMBER),
    constraint UK_VIS_CLIN_DOC_V_CLINICAL_DOC unique (ID_TNT, ID_CLIN_DOC_VER)
);

create table RHN_VIS_CRIT_VAL_ALERT (
    ID_CRIT_VAL_ALERT bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_DIAG_REPORT bigint not null,
    ID_OBS bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    ID_CARE_REQ bigint not null,
    ID_USER_RECIPIENT bigint not null,
    SD_SEVERITY varchar(24) not null,
    CD_RULE varchar(128) not null,
    SN_RULE_VER int not null,
    CD_OBS varchar(128) not null,
    NA_OBS varchar(300) not null,
    DES_TRIGGER_EVID varchar(1000) not null,
    SD_STATUS varchar(32) not null,
    DT_DETECTED timestamp with time zone not null,
    DT_ACKNOWLEDGE_DEADLINE timestamp with time zone not null,
    ID_USER_ACKNOWLEDGED bigint,
    DT_ACKNOWLEDGED timestamp with time zone,
    DES_ACKNOWLEDGE_NOTE varchar(1000),
    ID_USER_CLOSED bigint,
    DT_CLOSED timestamp with time zone,
    CD_DISPOSITION varchar(64),
    DES_CLOSE_NOTE varchar(1000),
    ID_DIAG_REPORT_SUPERSEDED bigint,
    SD_ESCALATION_LEVEL int default 0 not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_VIS_CRIT_VAL_ALERT_PK primary key (ID_CRIT_VAL_ALERT),
    constraint UK_VIS_CRIT_VAL_A_CRITICAL_ALE unique (ID_TNT, ID_DIAG_REPORT, ID_OBS),
    constraint UK_VIS_CRIT_VAL_A_CRITICAL_A_1 unique (ID_TNT, ID_CRIT_VAL_ALERT),
    constraint CK_VIS_CRIT_VAL_A_CRITICAL_ALE check (SD_STATUS in ('OPEN', 'ACKNOWLEDGED', 'CLOSED', 'ESCALATED', 'SUPERSEDED')),
    constraint CK_VIS_CRIT_VAL_A_CRITICAL_A_1 check (SD_ESCALATION_LEVEL >= 0)
);

create table RHN_VIS_CRIT_VAL_ALERT_EVT (
    ID_CRIT_VAL_ALERT_EVT bigint,
    ID_TNT bigint not null,
    ID_CRIT_VAL_ALERT bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    ID_USER_ACTOR bigint,
    DES_NOTE varchar(1000),
    ID_CORRELATION varchar(128) not null,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_VIS_CRIT_VAL_ALERT_EVT_PK primary key (ID_CRIT_VAL_ALERT_EVT)
);

create table RHN_VIS_ENC (
    ID_ENC bigint,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    CD_ENC_NO varchar(32) not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_CLINICIAN varchar(100),
    SD_STATUS varchar(24) not null,
    DES_CHIEF_COMPLAINT varchar(1000),
    SYSTOLIC integer,
    DIASTOLIC integer,
    DT_REGISTERED timestamp with time zone not null,
    DT_STARTED timestamp with time zone,
    DT_COMPLETED timestamp with time zone,
    REVISION bigint not null default 0,
    ID_PAT_REG bigint,
    ID_SVC_SCHED bigint,
    ID_APPT bigint,
    SD_REG_SRC varchar(24),
    SD_VISIT_TYPE varchar(24),
    CD_TERMINATION varchar(32),
    DES_TERMINATION_REASON varchar(500),
    DT_TERMINATED timestamp with time zone,
    ID_USER_TERMINATED bigint,
    SD_ENC_CLASS varchar(32) default 'OUTPATIENT' not null,
    ID_CARE_EPISODE bigint,
    ID_SVC_LOC bigint,
    constraint PK_VIS_ENC_PK primary key (ID_ENC),
    constraint UK_VIS_ENC_ENCOUNTER_NO unique (ID_TNT, CD_ENC_NO),
    constraint UK_VIS_ENC_ENCOUNTER_TENANT_ID unique (ID_TNT, ID_ENC),
    constraint UK_VIS_ENC_ENCOUNTER_TENANT_RE unique (ID_TNT, ID_PAT, ID_ENC)
);

create table RHN_VIS_ENC_COMP_CHECK (
    ID_ENC_COMP_CHECK bigint,
    ID_TNT bigint not null,
    ID_ENC bigint not null,
    SN_EXPECTED_VER bigint not null,
    SD_RESULT varchar(16) not null,
    CD_COMMAND varchar(128) not null,
    ID_PRACT bigint,
    ID_USER bigint,
    DT_CHECKED timestamp with time zone not null,
    constraint PK_VIS_ENC_COMP_CHECK_PK primary key (ID_ENC_COMP_CHECK),
    constraint UK_VIS_ENC_COMP_C_ENC_COMPLETI unique (ID_TNT, ID_ENC_COMP_CHECK),
    constraint UK_VIS_ENC_COMP_C_ENC_COMPLE_1 unique (ID_TNT, ID_ENC, CD_COMMAND),
    constraint CK_VIS_ENC_COMP_C_ENC_COMPLETI check (SD_RESULT in ('PASS', 'BLOCKED'))
);

create table RHN_VIS_ENC_COMP_ISSUE (
    ID_ENC_COMP_ISSUE bigint,
    ID_TNT bigint not null,
    ID_ENC_COMP_CHECK bigint not null,
    CD_ISSUE varchar(64) not null,
    SD_SEVERITY varchar(16) not null,
    DES_ENC_COMP_ISSUE varchar(1000) not null,
    constraint PK_VIS_ENC_COMP_ISSUE_PK primary key (ID_ENC_COMP_ISSUE),
    constraint UK_VIS_ENC_COMP_I_ENC_COMPLETI unique (ID_TNT, ID_ENC_COMP_CHECK, CD_ISSUE),
    constraint CK_VIS_ENC_COMP_I_ENC_COMPLETI check (SD_SEVERITY in ('BLOCKER', 'WARNING'))
);

create table RHN_VIS_ENC_DIAG (
    ID_ENC_DIAG bigint,
    ID_TNT bigint not null,
    ID_ENC bigint not null,
    CD_ENC_DIAG varchar(64) not null,
    NA_DISPLAY varchar(200) not null,
    SD_DIAG_TYPE varchar(24) not null,
    DT_RECORDED timestamp with time zone not null,
    REVISION bigint default 0 not null,
    CD_BUSINESS_VER_NO integer default 1 not null,
    SD_VERIFICATION_STATUS varchar(32) default 'CONFIRMED' not null,
    SD_DIAG_STATUS varchar(32) default 'ACTIVE' not null,
    DES_CLIN_NOTE varchar(1000),
    DT_UPDATED timestamp with time zone,
    ID_USER_UPDATED bigint,
    SD_DIAG_STAGE varchar(32) default 'ENCOUNTER' not null,
    ID_CONCEPT bigint,
    CD_CODE_SYS_SNAP varchar(100),
    CODE_SYSTEM_VERSION_SNAPSHOT varchar(64),
    SD_DIAG_DOMAIN varchar(32) default 'WESTERN_MEDICINE' not null,
    ID_DIAG_GRP varchar(64),
    JSON_MGMT_SNAP text,
    constraint PK_VIS_ENC_DIAG_PK primary key (ID_ENC_DIAG),
    constraint UK_VIS_ENC_DIAG_ENCOUNTER_DIAG unique (ID_TNT, ID_ENC_DIAG),
    constraint CK_VIS_ENC_DIAG_ENC_DIAG_VERIF check (SD_VERIFICATION_STATUS in ('PROVISIONAL', 'CONFIRMED', 'REFUTED')),
    constraint CK_VIS_ENC_DIAG_ENC_DIAG_STATU check (SD_DIAG_STATUS in ('ACTIVE', 'EXCLUDED', 'ENTERED_IN_ERROR')),
    constraint CK_VIS_ENC_DIAG_ENC_DIAG_STAGE check (SD_DIAG_STAGE in ('ENCOUNTER', 'ADMISSION', 'DISCHARGE')),
    constraint CK_VIS_ENC_DIAG_ENC_DIAG_DOMAI check (SD_DIAG_DOMAIN in ('WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME'))
);

create table RHN_VIS_ENC_DIAG_REV (
    ID_ENC_DIAG_REV bigint,
    ID_TNT bigint not null,
    ID_ENC_DIAG bigint not null,
    ID_ENC bigint not null,
    CD_BUSINESS_VER_NO integer not null,
    SD_CHG_TYPE varchar(24) not null,
    SD_DIAG_TYPE varchar(24) not null,
    SD_VERIFICATION_STATUS varchar(32) not null,
    SD_DIAG_STATUS varchar(32) not null,
    CD_CODE_SNAP varchar(64) not null,
    NA_DISPLAY_SNAP varchar(200) not null,
    DES_CLIN_NOTE varchar(1000),
    DES_CHG_REASON varchar(1000) not null,
    ID_PRACT bigint,
    ID_USER bigint,
    DT_OCCURRED timestamp with time zone not null,
    SD_DIAG_STAGE varchar(32) default 'ENCOUNTER' not null,
    ID_CONCEPT bigint,
    CD_CODE_SYS_SNAP varchar(100),
    CODE_SYSTEM_VERSION_SNAPSHOT varchar(64),
    SD_DIAG_DOMAIN varchar(32) default 'WESTERN_MEDICINE' not null,
    ID_DIAG_GRP varchar(64),
    JSON_MGMT_SNAP text,
    constraint PK_VIS_ENC_DIAG_REV_PK primary key (ID_ENC_DIAG_REV),
    constraint UK_VIS_ENC_DIAG_R_ENC_DIAG_REV unique (ID_TNT, ID_ENC_DIAG, CD_BUSINESS_VER_NO),
    constraint CK_VIS_ENC_DIAG_R_ENC_DIAG_REV check (SD_CHG_TYPE in ('ADDED', 'UPDATED', 'REORDERED', 'EXCLUDED', 'RESTORED')),
    constraint CK_VIS_ENC_DIAG_R_ENC_DIAG_R_1 check (SD_DIAG_STAGE in ('ENCOUNTER', 'ADMISSION', 'DISCHARGE'))
);

create table RHN_VIS_ENC_IDENT_CHECK (
    ID_ENC_IDENT_CHECK bigint,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    SD_CHECK_SCENARIO varchar(32) not null,
    JSON_FACTOR_RESULT text not null,
    SD_RESULT varchar(16) not null,
    ID_PRACT bigint,
    ID_USER bigint,
    CD_TERMINAL varchar(128),
    CD_COMMAND varchar(128) not null,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_VIS_ENC_IDENT_CHECK_PK primary key (ID_ENC_IDENT_CHECK),
    constraint UK_VIS_ENC_IDENT_ENC_ID_CHECK_ unique (ID_TNT, ID_ENC, CD_COMMAND),
    constraint CK_VIS_ENC_IDENT_ENC_ID_CHECK_ check (SD_CHECK_SCENARIO in ('START', 'RESUME', 'PATIENT_SWITCH', 'HIGH_RISK')),
    constraint CK_VIS_ENC_IDENT_ENC_ID_CHEC_1 check (SD_RESULT in ('PASS', 'FAIL'))
);

create table RHN_VIS_ENC_LOC_HIST (
    ID_ENC_LOC_HIST bigint,
    ID_TNT bigint not null,
    ID_ENC bigint not null,
    ID_SVC_LOC bigint not null,
    SD_STATUS varchar(32) not null,
    DT_START timestamp with time zone not null,
    DT_END timestamp with time zone,
    DES_CHG_REASON varchar(1000),
    ID_USER_CHANGED bigint not null,
    constraint PK_VIS_ENC_LOC_HIST_PK primary key (ID_ENC_LOC_HIST),
    constraint UK_VIS_ENC_LOC_HI_ENC_LOC_HIST unique (ID_TNT, ID_ENC_LOC_HIST),
    constraint CK_VIS_ENC_LOC_HI_ENC_LOC_HIST check (SD_STATUS in ('ACTIVE', 'COMPLETED')),
    constraint CK_VIS_ENC_LOC_HI_ENC_LOC_HI_1 check (DT_END is null or DT_END >= DT_START)
);

create table RHN_VIS_ENC_STATUS_EVT (
    ID_ENC_STATUS_EVT bigint,
    ID_TNT bigint not null,
    ID_ENC bigint not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    SN_EXPECTED_VER bigint not null,
    ID_PRACT bigint,
    ID_USER bigint,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    CD_COMMAND varchar(128) not null,
    DES_REASON varchar(1000),
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_VIS_ENC_STATUS_EVT_PK primary key (ID_ENC_STATUS_EVT),
    constraint UK_VIS_ENC_STATUS_ENC_STATUS_E unique (ID_TNT, ID_ENC, CD_COMMAND)
);

create table RHN_VIS_ENC_WORK_SESSION (
    ID_ENC_WORK_SESSION bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ENC bigint not null,
    ID_PRACT bigint,
    ID_USER bigint,
    CD_TERMINAL varchar(128),
    SD_STATUS varchar(16) not null,
    DT_STARTED timestamp with time zone not null,
    DT_HEARTBEAT timestamp with time zone not null,
    DT_CLOSED timestamp with time zone,
    DES_CLOSE_REASON varchar(32),
    constraint PK_VIS_ENC_WORK_SESSION_PK primary key (ID_ENC_WORK_SESSION),
    constraint CK_VIS_ENC_WORK_S_ENC_WORK_SES check (SD_STATUS in ('ACTIVE', 'CLOSED', 'EXPIRED')),
    constraint CK_VIS_ENC_WORK_S_ENC_WORK_S_1 check ((SD_STATUS = 'ACTIVE' and DT_CLOSED is null and DES_CLOSE_REASON is null) or
        (SD_STATUS in ('CLOSED', 'EXPIRED') and DT_CLOSED is not null and DES_CLOSE_REASON is not null))
);

create table RHN_VIS_HEALTH_EVT (
    ID_HEALTH_EVT bigint,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    SD_EVT_TYPE varchar(64) not null,
    DES_SUM varchar(500) not null,
    JSON_PAYLOAD text not null,
    DT_OCCURRED timestamp with time zone not null,
    DT_RECORDED timestamp with time zone not null,
    ID_USER_RECORDED varchar(100) not null,
    ID_SRC_EVT bigint,
    SN_EVT_VER integer not null default 1,
    SOURCE varchar(100) not null default 'legacy',
    ID_CORRELATION varchar(64) not null default '',
    constraint PK_VIS_HEALTH_EVT_PK primary key (ID_HEALTH_EVT),
    constraint UK_VIS_HEALTH_EVT_HEALTH_EVENT unique (ID_TNT, ID_HEALTH_EVT)
);

create table RHN_VIS_INP_BED_DAY_FACT (
    ID_INP_BED_DAY_FACT bigint,
    ID_TNT bigint not null,
    ID_CARE_EPISODE bigint not null,
    ID_ENC bigint not null,
    ID_ENC_LOC_HIST bigint not null,
    ID_BED_LOC bigint not null,
    DA_BUSINESS date not null,
    CD_COMMAND varchar(128) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_VIS_INP_BED_DAY_FACT_PK primary key (ID_INP_BED_DAY_FACT),
    constraint UK_VIS_INP_BED_DA_IP_BDAY_TENA unique (ID_TNT, ID_INP_BED_DAY_FACT),
    constraint UK_VIS_INP_BED_DA_IP_BDAY_EPIS unique (ID_TNT, ID_CARE_EPISODE, DA_BUSINESS),
    constraint UK_VIS_INP_BED_DA_IP_BDAY_COMM unique (ID_TNT, CD_COMMAND)
);

create table RHN_VIS_INP_BED_OCCUP (
    ID_INP_BED_OCCUP bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_BED_LOC bigint not null,
    ID_CARE_EPISODE bigint not null,
    ID_ENC bigint not null,
    ID_PAT bigint not null,
    DT_STARTED timestamp with time zone not null,
    constraint PK_VIS_INP_BED_OCCUP_PK primary key (ID_INP_BED_OCCUP),
    constraint UK_VIS_INP_BED_OC_INP_OCC_TENA unique (ID_TNT, ID_INP_BED_OCCUP),
    constraint UK_VIS_INP_BED_OC_INP_OCC_BED unique (ID_TNT, ID_BED_LOC),
    constraint UK_VIS_INP_BED_OC_INP_OCC_EPIS unique (ID_TNT, ID_CARE_EPISODE),
    constraint UK_VIS_INP_BED_OC_INP_OCC_ENCO unique (ID_TNT, ID_ENC),
    constraint UK_VIS_INP_BED_OC_INP_OCC_RESI unique (ID_TNT, ID_PAT)
);

create table RHN_VIS_INP_BED_PROF (
    ID_SVC_LOC_BED bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    SD_BED_TYPE varchar(32) not null,
    SD_GENDER_RESTRICTION varchar(16) not null,
    SD_OPERATIONAL_STATUS varchar(32) not null,
    CD_NURS_GRP varchar(64),
    ID_RESPONSIBLE_NURSE bigint,
    PRICE_BED_DAY decimal(18,2),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    ID_CATALOG_ITEM_CHARGE bigint,
    constraint PK_VIS_INP_BED_PROF_PK primary key (ID_SVC_LOC_BED),
    constraint UK_VIS_INP_BED_PR_INP_BED_TENA unique (ID_TNT, ID_SVC_LOC_BED),
    constraint CK_VIS_INP_BED_PR_INP_BED_TYPE check (SD_BED_TYPE in ('PHYSICAL', 'EXTRA', 'VIRTUAL', 'HOME')),
    constraint CK_VIS_INP_BED_PR_INP_BED_GEND check (SD_GENDER_RESTRICTION in ('ANY', 'MALE', 'FEMALE')),
    constraint CK_VIS_INP_BED_PR_INP_BED_STAT check (SD_OPERATIONAL_STATUS in ('AVAILABLE', 'CLEANING', 'BLOCKED', 'MAINTENANCE')),
    constraint CK_VIS_INP_BED_PR_INP_BED_RATE check (PRICE_BED_DAY is null or PRICE_BED_DAY >= 0)
);

create table RHN_VIS_INP_CHART_EVT (
    ID_INP_CHART_EVT bigint,
    ID_TNT bigint not null,
    ID_CARE_EPISODE bigint not null,
    ID_ENC bigint not null,
    SD_EVT_TYPE varchar(32) not null,
    ID_SVC_LOC_SRC bigint,
    NA_SRC_LOC varchar(200),
    ID_SVC_LOC_TARGET bigint,
    NA_TARGET_LOC varchar(200),
    CD_COMMAND varchar(128) not null,
    DES_DISPLAY varchar(200) not null,
    DES_NOTE varchar(1000),
    DT_OCCURRED timestamp with time zone not null,
    ID_USER_RECORDED bigint not null,
    DT_RECORDED timestamp with time zone not null,
    constraint PK_VIS_INP_CHART_EVT_PK primary key (ID_INP_CHART_EVT),
    constraint UK_VIS_INP_CHART_INP_CHART_EVT unique (ID_TNT, ID_INP_CHART_EVT),
    constraint UK_VIS_INP_CHART_INP_CHART_E_1 unique (ID_TNT, CD_COMMAND),
    constraint CK_VIS_INP_CHART_INP_CHART_EVT check (SD_EVT_TYPE in (
        'ADMISSION', 'TRANSFER_IN', 'TRANSFER_OUT', 'BED_TRANSFER', 'WARD_TRANSFER',
        'LEAVE', 'RETURN', 'SURGERY', 'DELIVERY', 'DISCHARGE', 'DEATH', 'OTHER'
    ))
);

create table RHN_VIS_INP_EPISODE_DETAIL (
    ID_CARE_EPISODE bigint,
    ID_TNT bigint not null,
    CD_ADMISSION_TYPE varchar(64),
    CD_ADMISSION_SRC varchar(64),
    ID_SVC_LOC_ADMISSION bigint,
    DES_ADMISSION_REASON varchar(1000),
    CD_DISCHARGE_DISPOSITION varchar(64),
    ID_SVC_LOC_DISCHARGE bigint,
    DES_DISCHARGE_NOTE varchar(2000),
    CD_NURS_LEVEL varchar(64),
    CD_DIET varchar(64),
    CD_BED_SNAP varchar(64),
    ID_RESPONSIBLE_NURSE bigint,
    CD_ADMISSION_METHOD varchar(32),
    CD_COND varchar(32),
    CD_PAY_METHOD varchar(32),
    NA_REFER_ORG varchar(200),
    NA_EMERGENCY_CONTACT varchar(100),
    EMERGENCY_CONTACT_RELATIONSHIP varchar(64),
    EMERGENCY_CONTACT_PHONE varchar(32),
    DES_ADMISSION_NOTE varchar(1000),
    constraint PK_VIS_INP_EPISODE_DETAIL_PK primary key (ID_CARE_EPISODE),
    constraint UK_VIS_INP_EPISOD_INP_EP_DETAI unique (ID_TNT, ID_CARE_EPISODE)
);

create table RHN_VIS_INP_EVT (
    ID_INP_EVT bigint,
    ID_TNT bigint not null,
    ID_CARE_EPISODE bigint,
    ID_ENC bigint,
    SD_EVT_TYPE varchar(32) not null,
    SD_STATUS_FROM varchar(32),
    SD_STATUS_TO varchar(32) not null,
    ID_SVC_LOC_SRC bigint,
    ID_SVC_LOC_TARGET bigint,
    CD_COMMAND varchar(128) not null,
    DES_REASON varchar(1000),
    ID_ACTOR bigint not null,
    DT_OCCURRED timestamp with time zone not null,
    constraint PK_VIS_INP_EVT_PK primary key (ID_INP_EVT),
    constraint UK_VIS_INP_EVT_INP_EVT_TENANT_ unique (ID_TNT, ID_INP_EVT),
    constraint UK_VIS_INP_EVT_INP_EVT_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint CK_VIS_INP_EVT_INP_EVT_TYPE check (SD_EVT_TYPE in ('ADMITTED', 'TRANSFERRED', 'DISCHARGED', 'BED_STATUS_CHANGED'))
);

create table RHN_VIS_INP_NURS_RECORD (
    ID_INP_NURS_RECORD bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_CARE_EPISODE bigint not null,
    ID_ENC bigint not null,
    ID_PAT bigint not null,
    DT_OCCURRED timestamp with time zone not null,
    SD_RECORD_TYPE varchar(32) not null,
    JSON_CONTENT clob not null,
    JSON_OBS_SUM clob,
    JSON_CONTENT_SCHEMA varchar(128) not null,
    CD_COMMAND varchar(128) not null,
    HASH_REQ varchar(64) not null,
    ID_RECORDED_BY_SUBJECT bigint not null,
    ID_RECORDED_BY_PRACT bigint,
    NA_RECORDER varchar(300) not null,
    DT_RECORDED timestamp with time zone not null,
    CONTENT_DIGEST_ALGORITHM varchar(64) not null,
    HASH_CONTENT varchar(512) not null,
    ID_CRYPTO_EVID_INTEGRITY bigint not null,
    JSON_ASSESSMENT clob,
    constraint PK_VIS_INP_NURS_RECORD_PK primary key (ID_INP_NURS_RECORD),
    constraint UK_VIS_INP_NURS_R_INR_TENANT_I unique (ID_TNT, ID_INP_NURS_RECORD),
    constraint UK_VIS_INP_NURS_R_INR_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint UK_VIS_INP_NURS_R_INR_EVIDENCE unique (ID_CRYPTO_EVID_INTEGRITY),
    constraint CK_VIS_INP_NURS_R_INR_ASSESSME check ((SD_RECORD_TYPE = 'ASSESSMENT' and JSON_ASSESSMENT is not null)
    or (SD_RECORD_TYPE <> 'ASSESSMENT' and JSON_ASSESSMENT is null))
);

create table RHN_VIS_INP_OBS (
    ID_INP_OBS bigint,
    ID_TNT bigint not null,
    ID_INP_OBS_GRP bigint not null,
    CD_OBS varchar(64) not null,
    DT_OBSERVED timestamp with time zone not null,
    CD_VAL_NUMBER decimal(18,4) not null,
    CD_UNIT varchar(32) not null,
    CD_BODY_SITE varchar(32),
    constraint PK_VIS_INP_OBS_PK primary key (ID_INP_OBS),
    constraint UK_VIS_INP_OBS_INP_OBS_ID unique (ID_TNT, ID_INP_OBS),
    constraint UK_VIS_INP_OBS_INP_OBS_CODE unique (ID_TNT, ID_INP_OBS_GRP, CD_OBS),
    constraint CK_VIS_INP_OBS_INP_OBS_TYPE check (CD_OBS in (
        'BODY_TEMPERATURE', 'COOLING_TEMPERATURE', 'PULSE_RATE', 'RESPIRATORY_RATE',
        'SYSTOLIC_BLOOD_PRESSURE', 'DIASTOLIC_BLOOD_PRESSURE',
        'OXYGEN_SATURATION', 'BODY_WEIGHT', 'FLUID_INTAKE', 'FLUID_OUTPUT'
    )),
    constraint CK_VIS_INP_OBS_INP_OBS_VALUE check (CD_VAL_NUMBER >= 0)
);

create table RHN_VIS_INP_OBS_GRP (
    ID_INP_OBS_GRP bigint,
    ID_TNT bigint not null,
    ID_CARE_EPISODE bigint not null,
    ID_ENC bigint not null,
    DT_MEASURED timestamp with time zone not null,
    SD_SRC_TYPE varchar(32) not null,
    CD_COMMAND varchar(128) not null,
    DES_NOTE varchar(1000),
    ID_USER_RECORDED bigint not null,
    DT_RECORDED timestamp with time zone not null,
    constraint PK_VIS_INP_OBS_GRP_PK primary key (ID_INP_OBS_GRP),
    constraint UK_VIS_INP_OBS_GR_INP_OBS_GRP_ unique (ID_TNT, ID_INP_OBS_GRP),
    constraint UK_VIS_INP_OBS_GR_INP_OBS_GR_1 unique (ID_TNT, CD_COMMAND),
    constraint CK_VIS_INP_OBS_GR_INP_OBS_GRP_ check (SD_SRC_TYPE in ('MANUAL', 'DEVICE', 'IMPORTED'))
);

create table RHN_VIS_INP_SHIFT_HANDOFF (
    ID_INP_SHIFT_HANDOFF bigint,
    REVISION bigint not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    DT_SHIFT_FROM timestamp with time zone not null,
    DT_SHIFT_TO timestamp with time zone not null,
    DES_WARD_SUM varchar(2000) not null,
    JSON_GENERAL_ITEM clob not null,
    SD_STATUS varchar(32) not null,
    CD_CREATE_COMMAND varchar(128) not null,
    HASH_CREATE_REQ varchar(64) not null,
    ID_CREATED_BY_SUBJECT bigint not null,
    ID_CREATED_BY_PRACT bigint,
    NA_CREATOR varchar(300) not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    JSON_CONTENT_SCHEMA varchar(128) not null,
    CONTENT_DIGEST_ALGORITHM varchar(64) not null,
    HASH_CONTENT varchar(512) not null,
    ID_CRYPTO_EVID_INTEGRITY bigint not null,
    constraint PK_VIS_INP_SHIFT_HANDOFF_PK primary key (ID_INP_SHIFT_HANDOFF),
    constraint UK_VIS_INP_SHIFT_ISH_TENANT_ID unique (ID_TNT, ID_INP_SHIFT_HANDOFF),
    constraint UK_VIS_INP_SHIFT_ISH_COMMAND unique (ID_TNT, CD_CREATE_COMMAND),
    constraint UK_VIS_INP_SHIFT_ISH_EVIDENCE unique (ID_CRYPTO_EVID_INTEGRITY),
    constraint CK_VIS_INP_SHIFT_ISH_STATUS check (SD_STATUS in ('DRAFT', 'SUBMITTED', 'ACCEPTED')),
    constraint CK_VIS_INP_SHIFT_ISH_SHIFT check (DT_SHIFT_TO > DT_SHIFT_FROM)
);

create table RHN_VIS_INP_SHIFT_HANDOFF_ITEM (
    ID_INP_SHIFT_HANDOFF_ITEM bigint,
    ID_TNT bigint not null,
    ID_INP_SHIFT_HANDOFF bigint not null,
    ID_CARE_EPISODE bigint not null,
    ID_ENC bigint not null,
    ID_PAT bigint not null,
    NA_PAT_SNAP varchar(300) not null,
    CD_BED_SNAP varchar(100),
    DES_SITUATION varchar(2000) not null,
    JSON_PENDING_ACTIONS clob not null,
    JSON_RISK_FLAGS clob not null,
    SN_SORT integer not null,
    constraint PK_VIS_INP_SHIFT_PK primary key (ID_INP_SHIFT_HANDOFF_ITEM),
    constraint UK_VIS_INP_SHIFT_ISHI_TENANT_I unique (ID_TNT, ID_INP_SHIFT_HANDOFF_ITEM),
    constraint UK_VIS_INP_SHIFT_ISHI_EPISODE unique (ID_TNT, ID_INP_SHIFT_HANDOFF, ID_CARE_EPISODE)
);

create table RHN_VIS_INP_SHIFT_HANDOFF_SIGN (
    ID_INP_SHIFT_HANDOFF_SIGN bigint,
    ID_TNT bigint not null,
    ID_INP_SHIFT_HANDOFF bigint not null,
    SD_STAGE varchar(32) not null,
    SD_SIGN_MEANING varchar(64) not null,
    ID_SIGNER_SUBJECT bigint not null,
    ID_SIGNER_PRACT bigint,
    NA_SIGNER varchar(300) not null,
    DT_SIGNED timestamp with time zone not null,
    ID_CRYPTO_EVID_SIGN bigint not null,
    CD_COMMAND varchar(128) not null,
    HASH_REQ varchar(64) not null,
    constraint PK_VIS_INP_SHIFT_PK_1 primary key (ID_INP_SHIFT_HANDOFF_SIGN),
    constraint UK_VIS_INP_SHIFT_ISHS_TENANT_I unique (ID_TNT, ID_INP_SHIFT_HANDOFF_SIGN),
    constraint UK_VIS_INP_SHIFT_ISHS_STAGE unique (ID_TNT, ID_INP_SHIFT_HANDOFF, SD_STAGE),
    constraint UK_VIS_INP_SHIFT_ISHS_COMMAND unique (ID_TNT, CD_COMMAND),
    constraint UK_VIS_INP_SHIFT_ISHS_EVIDENCE unique (ID_CRYPTO_EVID_SIGN),
    constraint CK_VIS_INP_SHIFT_ISHS_STAGE check (SD_STAGE in ('HANDOVER', 'TAKEOVER'))
);

create table RHN_VIS_OBS (
    ID_OBS bigint,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint,
    CODE_SYSTEM_URI varchar(300) not null,
    CD_CODE_RELEASE varchar(64),
    CD_OBS varchar(128) not null,
    NA_OBS varchar(300) not null,
    SD_STATUS varchar(32) not null,
    SD_VAL_TYPE varchar(32) not null,
    DT_EFFECTIVE timestamp with time zone not null,
    VALUE_STRING varchar(1000),
    CD_VAL_NUMBER decimal(28,8),
    FG_VAL_BOOLEAN boolean,
    CD_VAL varchar(128),
    DT_VAL_DATETIME timestamp with time zone,
    CD_UNIT varchar(64),
    REFERENCE_RANGE_LOW decimal(28,8),
    REFERENCE_RANGE_HIGH decimal(28,8),
    CD_INTERPRETATION varchar(32),
    CD_PERFORMER varchar(64),
    NA_PERFORMER varchar(100),
    DT_CREATED timestamp with time zone not null,
    constraint PK_VIS_OBS_PK primary key (ID_OBS),
    constraint UK_VIS_OBS_OBSERVATION_TENANT_ unique (ID_TNT, ID_OBS),
    constraint CK_VIS_OBS_OBSERVATION_STATUS check (SD_STATUS in ('PRELIMINARY', 'FINAL', 'CORRECTED', 'CANCELLED')),
    constraint CK_VIS_OBS_OBSERVATION_VALUE_T check (SD_VAL_TYPE in ('STRING', 'NUMBER', 'BOOLEAN', 'CODE', 'DATETIME')),
    constraint CK_VIS_OBS_OBSERVATION_VALUE check ((SD_VAL_TYPE = 'STRING' and VALUE_STRING is not null and CD_VAL_NUMBER is null and FG_VAL_BOOLEAN is null and CD_VAL is null and DT_VAL_DATETIME is null) or
        (SD_VAL_TYPE = 'NUMBER' and VALUE_STRING is null and CD_VAL_NUMBER is not null and FG_VAL_BOOLEAN is null and CD_VAL is null and DT_VAL_DATETIME is null) or
        (SD_VAL_TYPE = 'BOOLEAN' and VALUE_STRING is null and CD_VAL_NUMBER is null and FG_VAL_BOOLEAN is not null and CD_VAL is null and DT_VAL_DATETIME is null) or
        (SD_VAL_TYPE = 'CODE' and VALUE_STRING is null and CD_VAL_NUMBER is null and FG_VAL_BOOLEAN is null and CD_VAL is not null and DT_VAL_DATETIME is null) or
        (SD_VAL_TYPE = 'DATETIME' and VALUE_STRING is null and CD_VAL_NUMBER is null and FG_VAL_BOOLEAN is null and CD_VAL is null and DT_VAL_DATETIME is not null))
);

create table RHN_VIS_SVC_LOC (
    ID_SVC_LOC bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint,
    ID_SVC_LOC_PARENT bigint,
    CD_SVC_LOC varchar(64) not null,
    NA_SVC_LOC varchar(200) not null,
    SD_LOC_TYPE varchar(32) not null,
    SN_SORT integer default 0 not null,
    SD_STATUS varchar(32) not null,
    DA_VALID_FROM date not null,
    DA_VALID_TO date,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    constraint PK_VIS_SVC_LOC_PK primary key (ID_SVC_LOC),
    constraint UK_VIS_SVC_LOC_SRV_LOC_TENANT_ unique (ID_TNT, ID_SVC_LOC),
    constraint UK_VIS_SVC_LOC_SRV_LOC_CODE unique (ID_TNT, ID_ORG, CD_SVC_LOC),
    constraint CK_VIS_SVC_LOC_SRV_LOC_TYPE check (SD_LOC_TYPE in ('WARD', 'ROOM', 'BED', 'COUNTER')),
    constraint CK_VIS_SVC_LOC_SRV_LOC_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE')),
    constraint CK_VIS_SVC_LOC_SRV_LOC_PERIOD check (DA_VALID_TO is null or DA_VALID_TO >= DA_VALID_FROM)
);

-- 2. Foreign Key Constraints
alter table RHN_AI_SUGGEST add constraint FK_AI_SUGGEST_SYS_TNT_AI_SUGGE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_AI_SUGGEST add constraint FK_AI_SUGGEST_PI_PAT_AI_SUGGES foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_AI_SUGGEST add constraint FK_AI_SUGGEST_VIS_ENC_AI_SUGGE foreign key (ID_TNT, ID_PAT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_PAT, ID_ENC);
alter table RHN_AI_SUGGEST add constraint FK_AI_SUGGEST_SYS_ORG_AI_SUGGE foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_AI_SUGGEST add constraint FK_AI_SUGGEST_SYS_DEPT_AI_SUGG foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_AI_SUGGEST add constraint FK_AI_SUGGEST_SYS_PRAC_AI_SUGG foreign key (ID_TNT, ID_PRACT_REQUESTED) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_AI_SUGGEST add constraint FK_AI_SUGGEST_SYS_USER_AI_SUGG foreign key (ID_TNT, ID_USER_REQUESTED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_AI_SUGGEST_EVT add constraint FK_AI_SUGGEST_EVT_SYS_TNT_AI_E foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_AI_SUGGEST_EVT add constraint FK_AI_SUGGEST_EVT_AI_SUGGE_AI_ foreign key (ID_TNT, ID_AI_SUGGEST) references RHN_AI_SUGGEST(ID_TNT, ID_AI_SUGGEST);
alter table RHN_AI_SUGGEST_EVT add constraint FK_AI_SUGGEST_EVT_SYS_PRAC_AI_ foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_AI_SUGGEST_EVT add constraint FK_AI_SUGGEST_EVT_SYS_USER_AI_ foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_ANL_PRES_METRIC_SAMPLE add constraint FK_ANL_PRES_METRI_SYS_TNT_PRES foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_AUD_CRYPTO_EVID add constraint FK_AUD_CRYPTO_EVI_SYS_TNT_CRYP foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_AUD_CRYPTO_EVID add constraint FK_AUD_CRYPTO_EVI_AUD_CRYP_CRY foreign key (ID_TNT, ID_CRYPTO_EVID_PREVIOUS) references RHN_AUD_CRYPTO_EVID(ID_TNT, ID_CRYPTO_EVID);
alter table RHN_AUD_IAM_AUTH_EVT add constraint FK_AUD_IAM_AUTH_E_SYS_TNT_IAM_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_AUD_IAM_AUTH_EVT add constraint FK_AUD_IAM_AUTH_E_SYS_USER_IAM foreign key (ID_TNT, ID_USER_ACTOR) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_AUD_LOG add constraint FK_AUD_LOG_SYS_TNT_AUDIT_LOG_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_CATALOG_CHG_BATCH add constraint FK_BD_CATALOG_CHG_SYS_TNT_CATA foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_CATALOG_CHG_BATCH add constraint FK_BD_CATALOG_CHG_SYS_ORG_CATA foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_CATALOG_CHG_ROW add constraint FK_BD_CATALOG_CHG_SYS_TNT_CA_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_CATALOG_CHG_ROW add constraint FK_BD_CATALOG_CHG_BD_CATAL_CAT foreign key (ID_TNT, ID_CATALOG_CHG_BATCH) references RHN_BD_CATALOG_CHG_BATCH(ID_TNT, ID_CATALOG_CHG_BATCH);
alter table RHN_BD_CATALOG_CHG_ROW add constraint FK_BD_CATALOG_CHG_BD_CATAL_C_1 foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_CATALOG_ITEM add constraint FK_BD_CATALOG_ITE_SYS_TNT_CATA foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_CATALOG_ITEM add constraint FK_BD_CATALOG_ITE_BD_ITEM_CATA foreign key (ID_ITEM_TYPE) references RHN_BD_ITEM_TYPE(ID_ITEM_TYPE);
alter table RHN_BD_CATALOG_ITEM add constraint FK_BD_CATALOG_ITE_BD_ITEM_CA_1 foreign key (ID_ITEM_MASTER) references RHN_BD_ITEM_MASTER(ID_ITEM_MASTER);
alter table RHN_BD_CATALOG_PRICE add constraint FK_BD_CATALOG_PRI_SYS_TNT_CATA foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_CATALOG_PRICE add constraint FK_BD_CATALOG_PRI_BD_CATAL_CAT foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_CATALOG_PRICE add constraint FK_BD_CATALOG_PRI_SYS_ORG_CATA foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_CATALOG_PRICE add constraint FK_BD_CATALOG_PRI_BD_ITEM_CATA foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_BD_CATALOG_PRICE add constraint FK_BD_CATALOG_PRI_BD_CATAL_C_1 foreign key (ID_TNT, ID_CATALOG_PRICE_REPLACES) references RHN_BD_CATALOG_PRICE(ID_TNT, ID_CATALOG_PRICE);
alter table RHN_BD_CONCEPT add constraint FK_BD_CONCEPT_BD_CODE_CONCEPT_ foreign key (ID_CODE_SYSTEM) references RHN_BD_CODE_SYSTEM(ID_CODE_SYSTEM);
alter table RHN_BD_CONCEPT add constraint FK_BD_CONCEPT_BD_CONCE_CONCEPT foreign key (ID_CONCEPT_REPLACEMENT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_CONCEPT_ALIAS add constraint FK_BD_CONCEPT_ALI_BD_CONCE_CON foreign key (ID_CONCEPT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_CONCEPT_MAP add constraint FK_BD_CONCEPT_MAP_BD_CONCE_MAP foreign key (ID_CONCEPT_TARGET) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_CONCEPT_MAP add constraint FK_BD_CONCEPT_MAP_SYS_TNT_CONC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_DICT_ATTR_DEF add constraint FK_BD_DICT_ATTR_D_BD_DICT_DICT foreign key (ID_DICT_DEF_DICT) references RHN_BD_DICT_DEF(ID_DICT_DEF);
alter table RHN_BD_DICT_ATTR_DEF add constraint FK_BD_DICT_ATTR_D_BD_DICT_DI_1 foreign key (ID_DICT_DEF_REFERENCE_DICT) references RHN_BD_DICT_DEF(ID_DICT_DEF);
alter table RHN_BD_DICT_ATTR_DEF add constraint FK_BD_DICT_ATTR_D_SYS_USER_DIC foreign key (ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_USER);
alter table RHN_BD_DICT_ATTR_DEF add constraint FK_BD_DICT_ATTR_D_SYS_USER_D_1 foreign key (ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_USER);
alter table RHN_BD_DICT_CAT add constraint FK_BD_DICT_CAT_SYS_TNT_DICTION foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_DICT_CAT add constraint FK_BD_DICT_CAT_BD_DICT_DICTION foreign key (ID_DICT_CAT_PARENT) references RHN_BD_DICT_CAT(ID_DICT_CAT);
alter table RHN_BD_DICT_CHG add constraint FK_BD_DICT_CHG_SYS_TNT_DICTION foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_DICT_CHG add constraint FK_BD_DICT_CHG_BD_DICT_DICTION foreign key (ID_DICT_DEF_DICT) references RHN_BD_DICT_DEF(ID_DICT_DEF);
alter table RHN_BD_DICT_CHG add constraint FK_BD_DICT_CHG_BD_DICT_DICTI_1 foreign key (ID_DICT_ITEM) references RHN_BD_DICT_ITEM(ID_DICT_ITEM);
alter table RHN_BD_DICT_CHG add constraint FK_BD_DICT_CHG_SYS_USER_DICTIO foreign key (ID_USER_CHANGED) references RHN_SYS_USER_ACCT(ID_USER);
alter table RHN_BD_DICT_CHG add constraint FK_BD_DICT_CHG_BD_DICT_DICTI_2 foreign key (ID_DICT_CAT) references RHN_BD_DICT_CAT(ID_DICT_CAT);
alter table RHN_BD_DICT_CHG add constraint FK_BD_DICT_CHG_BD_DICT_DICTI_3 foreign key (ID_DICT_ATTR_DEF) references RHN_BD_DICT_ATTR_DEF(ID_DICT_ATTR_DEF);
alter table RHN_BD_DICT_DEF add constraint FK_BD_DICT_DEF_SYS_TNT_DICTION foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_DICT_DEF add constraint FK_BD_DICT_DEF_SYS_USER_DICTIO foreign key (ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_USER);
alter table RHN_BD_DICT_DEF add constraint FK_BD_DICT_DEF_SYS_USER_DICT_1 foreign key (ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_USER);
alter table RHN_BD_DICT_DEF add constraint FK_BD_DICT_DEF_BD_DICT_DICTION foreign key (ID_DICT_CAT) references RHN_BD_DICT_CAT(ID_DICT_CAT);
alter table RHN_BD_DICT_ITEM add constraint FK_BD_DICT_ITEM_BD_DICT_DICTIO foreign key (ID_DICT_DEF_DICT) references RHN_BD_DICT_DEF(ID_DICT_DEF);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_BD_DICT_DICT foreign key (ID_DICT_ITEM) references RHN_BD_DICT_ITEM(ID_DICT_ITEM);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_BD_DICT_DI_1 foreign key (ID_DICT_ATTR_DEF) references RHN_BD_DICT_ATTR_DEF(ID_DICT_ATTR_DEF);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_SYS_TNT_DICT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_SYS_ORG_DICT foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_SYS_DEPT_DIC foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_BD_DICT_DI_2 foreign key (ID_DICT_ITEM_REFERENCE) references RHN_BD_DICT_ITEM(ID_DICT_ITEM);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_SYS_USER_DIC foreign key (ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_USER);
alter table RHN_BD_DICT_ITEM_ATTR_VAL add constraint FK_BD_DICT_ITEM_A_SYS_USER_D_1 foreign key (ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_USER);
alter table RHN_BD_EXAM_SVC add constraint FK_BD_EXAM_SVC_BD_CATAL_EXAM_S foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_EXAM_SVC add constraint FK_BD_EXAM_SVC_BD_CATAL_EXAM_A foreign key (ID_TNT, ID_CATALOG_ITEM_ADDL_SITE) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_GRID_ADDR_NODE add constraint FK_BD_GRID_ADDR_N_BD_GRID_GRID foreign key (ID_GRID_ADDR_NODE_PARENT) references RHN_BD_GRID_ADDR_NODE(ID_GRID_ADDR_NODE);
alter table RHN_BD_IMPORT_BATCH add constraint FK_BD_IMPORT_BATC_SYS_TNT_MD_I foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_IMPORT_ROW add constraint FK_BD_IMPORT_ROW_SYS_TNT_MD_IM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_IMPORT_ROW add constraint FK_BD_IMPORT_ROW_BD_IMPOR_MD_I foreign key (ID_TNT, ID_IMPORT_BATCH) references RHN_BD_IMPORT_BATCH(ID_TNT, ID_IMPORT_BATCH);
alter table RHN_BD_ITEM_ALIAS add constraint FK_BD_ITEM_ALIAS_SYS_TNT_ITEM_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_ALIAS add constraint FK_BD_ITEM_ALIAS_BD_CATAL_ITEM foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_ITEM_ATTR_CHG add constraint FK_BD_ITEM_ATTR_C_SYS_TNT_ITEM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_ATTR_CHG add constraint FK_BD_ITEM_ATTR_C_BD_ITEM_ITEM foreign key (ID_ITEM_ATTR_DEF) references RHN_BD_ITEM_ATTR_DEF(ID_ITEM_ATTR_DEF);
alter table RHN_BD_ITEM_ATTR_CHG add constraint FK_BD_ITEM_ATTR_C_BD_ITEM_IT_1 foreign key (ID_ITEM_TYPE) references RHN_BD_ITEM_TYPE(ID_ITEM_TYPE);
alter table RHN_BD_ITEM_ATTR_CHG add constraint FK_BD_ITEM_ATTR_C_BD_ITEM_IT_2 foreign key (ID_ITEM_TYPE_ATTR) references RHN_BD_ITEM_TYPE_ATTR(ID_ITEM_TYPE_ATTR);
alter table RHN_BD_ITEM_ATTR_CHG add constraint FK_BD_ITEM_ATTR_C_BD_ITEM_IT_3 foreign key (ID_ITEM_ATTR_SUBJECT) references RHN_BD_ITEM_ATTR_SUBJECT(ID_ITEM_ATTR_SUBJECT);
alter table RHN_BD_ITEM_ATTR_CHG add constraint FK_BD_ITEM_ATTR_C_BD_ITEM_IT_4 foreign key (ID_ITEM_ATTR_VAL) references RHN_BD_ITEM_ATTR_VAL(ID_ITEM_ATTR_VAL);
alter table RHN_BD_ITEM_ATTR_CHG add constraint FK_BD_ITEM_ATTR_C_BD_ITEM_IT_5 foreign key (ID_ITEM_ATTR_OVRD) references RHN_BD_ITEM_ATTR_OVRD(ID_ITEM_ATTR_OVRD);
alter table RHN_BD_ITEM_ATTR_DEF add constraint FK_BD_ITEM_ATTR_D_SYS_TNT_ITEM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_ATTR_DEF add constraint FK_BD_ITEM_ATTR_D_BD_DICT_ITEM foreign key (ID_DICT_DEF_DICT) references RHN_BD_DICT_DEF(ID_DICT_DEF);
alter table RHN_BD_ITEM_ATTR_OVRD add constraint FK_BD_ITEM_ATTR_O_SYS_TNT_ITEM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_ATTR_OVRD add constraint FK_BD_ITEM_ATTR_O_BD_ITEM_ITEM foreign key (ID_TNT, ID_ITEM_ATTR_SUBJECT) references RHN_BD_ITEM_ATTR_SUBJECT(ID_TNT, ID_ITEM_ATTR_SUBJECT);
alter table RHN_BD_ITEM_ATTR_OVRD add constraint FK_BD_ITEM_ATTR_O_BD_ITEM_IT_1 foreign key (ID_ITEM_ATTR_DEF) references RHN_BD_ITEM_ATTR_DEF(ID_ITEM_ATTR_DEF);
alter table RHN_BD_ITEM_ATTR_OVRD add constraint FK_BD_ITEM_ATTR_O_SYS_ORG_ITEM foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_ITEM_ATTR_OVRD add constraint FK_BD_ITEM_ATTR_O_SYS_DEPT_ITE foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_BD_ITEM_ATTR_SUBJECT add constraint FK_BD_ITEM_ATTR_S_SYS_TNT_ITEM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_ATTR_SUBJECT add constraint FK_BD_ITEM_ATTR_S_BD_ITEM_ITEM foreign key (ID_ITEM_MASTER) references RHN_BD_ITEM_MASTER(ID_ITEM_MASTER);
alter table RHN_BD_ITEM_ATTR_SUBJECT add constraint FK_BD_ITEM_ATTR_S_BD_MED_ITEM_ foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED);
alter table RHN_BD_ITEM_ATTR_SUBJECT add constraint FK_BD_ITEM_ATTR_S_BD_CATAL_ITE foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_ITEM_ATTR_SUBJECT add constraint FK_BD_ITEM_ATTR_S_BD_SVC_V_ITE foreign key (ID_TNT, ID_SVC_VAR) references RHN_BD_SVC_VAR(ID_TNT, ID_SVC_VAR);
alter table RHN_BD_ITEM_ATTR_VAL add constraint FK_BD_ITEM_ATTR_V_SYS_TNT_ITEM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_ATTR_VAL add constraint FK_BD_ITEM_ATTR_V_BD_ITEM_ITEM foreign key (ID_ITEM_ATTR_SUBJECT) references RHN_BD_ITEM_ATTR_SUBJECT(ID_ITEM_ATTR_SUBJECT);
alter table RHN_BD_ITEM_ATTR_VAL add constraint FK_BD_ITEM_ATTR_V_BD_ITEM_IT_1 foreign key (ID_ITEM_ATTR_DEF) references RHN_BD_ITEM_ATTR_DEF(ID_ITEM_ATTR_DEF);
alter table RHN_BD_ITEM_GRP add constraint FK_BD_ITEM_GRP_SYS_TNT_ITEM_GR foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_GRP add constraint FK_BD_ITEM_GRP_SYS_ORG_ITEM_GR foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_ITEM_GRP add constraint FK_BD_ITEM_GRP_SYS_DEPT_ITEM_G foreign key (ID_TNT, ID_ORG, ID_DEPT_EXEC) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_BD_ITEM_GRP_MEMBER add constraint FK_BD_ITEM_GRP_ME_BD_ITEM_ITEM foreign key (ID_TNT, ID_ITEM_GRP) references RHN_BD_ITEM_GRP(ID_TNT, ID_ITEM_GRP);
alter table RHN_BD_ITEM_GRP_MEMBER add constraint FK_BD_ITEM_GRP_ME_BD_CATAL_ITE foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_ITEM_MASTER add constraint FK_BD_ITEM_MASTER_BD_ITEM_ITEM foreign key (ID_ITEM_TYPE) references RHN_BD_ITEM_TYPE(ID_ITEM_TYPE);
alter table RHN_BD_ITEM_PKG add constraint FK_BD_ITEM_PKG_BD_CATAL_ITEM_P foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_ITEM_PKG add constraint FK_BD_ITEM_PKG_BD_ITEM_ITEM_PA foreign key (ID_ITEM_PKG_BASE) references RHN_BD_ITEM_PKG(ID_ITEM_PKG);
alter table RHN_BD_ITEM_TERM_MAP add constraint FK_BD_ITEM_TERM_M_SYS_TNT_ITEM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_TERM_MAP add constraint FK_BD_ITEM_TERM_M_BD_ITEM_ITEM foreign key (ID_TNT, ID_ITEM_ATTR_SUBJECT) references RHN_BD_ITEM_ATTR_SUBJECT(ID_TNT, ID_ITEM_ATTR_SUBJECT);
alter table RHN_BD_ITEM_TERM_MAP add constraint FK_BD_ITEM_TERM_M_BD_CONCE_ITE foreign key (ID_CONCEPT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_ITEM_TERM_MAP add constraint FK_BD_ITEM_TERM_M_BD_ITEM_IT_1 foreign key (ID_ITEM_TERM_MAP_REPLACES) references RHN_BD_ITEM_TERM_MAP(ID_ITEM_TERM_MAP);
alter table RHN_BD_ITEM_TYPE add constraint FK_BD_ITEM_TYPE_SYS_TNT_ITEM_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ITEM_TYPE add constraint FK_BD_ITEM_TYPE_BD_ITEM_ITEM_T foreign key (ID_ITEM_TYPE_PARENT) references RHN_BD_ITEM_TYPE(ID_ITEM_TYPE);
alter table RHN_BD_ITEM_TYPE_ATTR add constraint FK_BD_ITEM_TYPE_A_BD_ITEM_ITEM foreign key (ID_ITEM_TYPE) references RHN_BD_ITEM_TYPE(ID_ITEM_TYPE);
alter table RHN_BD_ITEM_TYPE_ATTR add constraint FK_BD_ITEM_TYPE_A_BD_ITEM_IT_1 foreign key (ID_ITEM_ATTR_DEF) references RHN_BD_ITEM_ATTR_DEF(ID_ITEM_ATTR_DEF);
alter table RHN_BD_LAB_SVC add constraint FK_BD_LAB_SVC_BD_CATAL_LAB_SER foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_MED add constraint FK_BD_MED_SYS_TNT_MEDICATION_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_MED add constraint FK_BD_MED_BD_ITEM_MEDICATION_I foreign key (ID_ITEM_TYPE) references RHN_BD_ITEM_TYPE(ID_ITEM_TYPE);
alter table RHN_BD_MED add constraint FK_BD_MED_BD_ITEM_MEDICATION_1 foreign key (ID_ITEM_MASTER) references RHN_BD_ITEM_MASTER(ID_ITEM_MASTER);
alter table RHN_BD_MED add constraint FK_BD_MED_BD_ORDER_MEDICATION_ foreign key (ID_TNT, ID_ORDER_FREQ_DEFAULT) references RHN_BD_ORDER_FREQ(ID_TNT, ID_ORDER_FREQ);
alter table RHN_BD_MED add constraint FK_BD_MED_BD_CONCE_MEDICATION_ foreign key (ID_CONCEPT_DEFAULT_ROUTE) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_MED_HERBAL add constraint FK_BD_MED_HERBAL_BD_MED_MED_HE foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED);
alter table RHN_BD_MED_HERBAL add constraint FK_BD_MED_HERBAL_BD_DICT_MED_H foreign key (ID_DICT_ITEM_MEDICINAL_PART) references RHN_BD_DICT_ITEM(ID_DICT_ITEM);
alter table RHN_BD_MED_PRODUCT add constraint FK_BD_MED_PRODUCT_BD_CATAL_MED foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_MED_PRODUCT add constraint FK_BD_MED_PRODUCT_BD_MED_MED_P foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED);
alter table RHN_BD_MED_PRODUCT add constraint FK_BD_MED_PRODUCT_BD_MFR_MED_P foreign key (ID_TNT, ID_MFR) references RHN_BD_MFR(ID_TNT, ID_MFR);
alter table RHN_BD_MED_ROUTE_PROF add constraint FK_BD_MED_ROUTE_P_BD_CONCE_MED foreign key (ID_CONCEPT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_MED_VACCINE add constraint FK_BD_MED_VACCINE_BD_MED_MED_V foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED);
alter table RHN_BD_MED_WESTERN add constraint FK_BD_MED_WESTERN_BD_MED_MED_W foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED);
alter table RHN_BD_MFR add constraint FK_BD_MFR_SYS_TNT_MANUFACTURER foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ORDER_FREQ add constraint FK_BD_ORDER_FREQ_SYS_TNT_ORDER foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ORDER_FREQ_CFG add constraint FK_BD_ORDER_FREQ_SYS_TNT_ORD_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ORDER_FREQ_CFG add constraint FK_BD_ORDER_FREQ_SYS_ORG_ORDER foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_ORDER_FREQ_CFG add constraint FK_BD_ORDER_FREQ_SYS_DEPT_ORDE foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_BD_ORDER_FREQ_CFG add constraint FK_BD_ORDER_FREQ_BD_ORDER_ORDE foreign key (ID_TNT, ID_ORDER_FREQ) references RHN_BD_ORDER_FREQ(ID_TNT, ID_ORDER_FREQ);
alter table RHN_BD_ORG_CATALOG_ITEM add constraint FK_BD_ORG_CATALOG_SYS_TNT_ORG_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ORG_CATALOG_ITEM add constraint FK_BD_ORG_CATALOG_SYS_ORG_ORG_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_ORG_CATALOG_ITEM add constraint FK_BD_ORG_CATALOG_BD_CATAL_ORG foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_ORG_CATALOG_ITEM add constraint FK_BD_ORG_CATALOG_SYS_DEPT_ORG foreign key (ID_TNT, ID_ORG, ID_DEPT_DEFAULT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_BD_ORG_CATALOG_ITEM add constraint FK_BD_ORG_CATALOG_BD_ORG_C_ORG foreign key (ID_TNT, ID_ORG_CATALOG_ITEM_REPLACED) references RHN_BD_ORG_CATALOG_ITEM(ID_TNT, ID_ORG_CATALOG_ITEM);
alter table RHN_BD_ORG_CONCEPT add constraint FK_BD_ORG_CONCEPT_SYS_TNT_ORG_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_ORG_CONCEPT add constraint FK_BD_ORG_CONCEPT_SYS_ORG_ORG_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BD_ORG_CONCEPT add constraint FK_BD_ORG_CONCEPT_BD_CONCE_ORG foreign key (ID_CONCEPT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_SUPPLY_ITEM add constraint FK_BD_SUPPLY_ITEM_BD_CATAL_SUP foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_SUPPLY_ITEM add constraint FK_BD_SUPPLY_ITEM_BD_MFR_SUPPL foreign key (ID_TNT, ID_MFR) references RHN_BD_MFR(ID_TNT, ID_MFR);
alter table RHN_BD_SVC_ITEM add constraint FK_BD_SVC_ITEM_BD_CATAL_SERVIC foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_SVC_VAR add constraint FK_BD_SVC_VAR_BD_EXAM_SERVICE_ foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_EXAM_SVC(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_SVC_VAR add constraint FK_BD_SVC_VAR_BD_CONCE_SERVICE foreign key (ID_CONCEPT_BODY_SITE) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BD_UNIT_CONV add constraint FK_BD_UNIT_CONV_SYS_TNT_UNIT_C foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_UNIT_CONV add constraint FK_BD_UNIT_CONV_BD_CATAL_UNIT_ foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BD_UNIT_CONV add constraint FK_BD_UNIT_CONV_BD_UNIT_UNIT_C foreign key (ID_TNT, ID_UNIT_DEF_FROM_UNIT) references RHN_BD_UNIT_DEF(ID_TNT, ID_UNIT_DEF);
alter table RHN_BD_UNIT_CONV add constraint FK_BD_UNIT_CONV_BD_UNIT_UNIT_1 foreign key (ID_TNT, ID_UNIT_DEF_TO_UNIT) references RHN_BD_UNIT_DEF(ID_TNT, ID_UNIT_DEF);
alter table RHN_BD_UNIT_DEF add constraint FK_BD_UNIT_DEF_SYS_TNT_UNIT_TE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BD_VAL_SET_MEMBER add constraint FK_BD_VAL_SET_MEM_BD_VAL_S_VAL foreign key (ID_VAL_SET) references RHN_BD_VAL_SET(ID_VAL_SET);
alter table RHN_BD_VAL_SET_MEMBER add constraint FK_BD_VAL_SET_MEM_BD_CONCE_VAL foreign key (ID_CONCEPT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_BIL_CASHIER_CLOSE add constraint FK_BIL_CASHIER_CL_SYS_TNT_CASH foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_CASHIER_CLOSE add constraint FK_BIL_CASHIER_CL_SYS_ORG_CASH foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_CASHIER_CLOSE add constraint FK_BIL_CASHIER_CL_BIL_CASH_CAS foreign key (ID_TNT, ID_CASHIER_CLOSE_REVERSES) references RHN_BIL_CASHIER_CLOSE(ID_TNT, ID_CASHIER_CLOSE);
alter table RHN_BIL_CASHIER_CLOSE_EVT add constraint FK_BIL_CASHIER_CL_BIL_CASH_C_1 foreign key (ID_TNT, ID_CASHIER_CLOSE) references RHN_BIL_CASHIER_CLOSE(ID_TNT, ID_CASHIER_CLOSE);
alter table RHN_BIL_CASHIER_CLOSE_ITEM add constraint FK_BIL_CASHIER_CL_BIL_CASH_C_2 foreign key (ID_TNT, ID_CASHIER_CLOSE) references RHN_BIL_CASHIER_CLOSE(ID_TNT, ID_CASHIER_CLOSE);
alter table RHN_BIL_CASHIER_CLOSE_ITEM add constraint FK_BIL_CASHIER_CL_BIL_PAY_CASH foreign key (ID_TNT, ID_PAY) references RHN_BIL_PAY(ID_TNT, ID_PAY);
alter table RHN_BIL_CASHIER_CLOSE_LINE add constraint FK_BIL_CASHIER_CL_BIL_CASH_C_3 foreign key (ID_TNT, ID_CASHIER_CLOSE) references RHN_BIL_CASHIER_CLOSE(ID_TNT, ID_CASHIER_CLOSE);
alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_SYS_TNT_CHAR foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_BIL_PAT_CHAR foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_PI_PAT_CHARG foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_VIS_ENC_CHAR foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_BD_CATAL_CHA foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_BIL_CHAR_CHA foreign key (ID_TNT, ID_CHARGE_ITEM_REVERSES) references RHN_BIL_CHARGE_ITEM(ID_TNT, ID_CHARGE_ITEM);
alter table RHN_BIL_CHARGE_ITEM_COMP add constraint FK_BIL_CHARGE_ITE_SYS_TNT_CH_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_CHARGE_ITEM_COMP add constraint FK_BIL_CHARGE_ITE_BIL_CHAR_C_1 foreign key (ID_TNT, ID_CHARGE_ITEM) references RHN_BIL_CHARGE_ITEM(ID_TNT, ID_CHARGE_ITEM);
alter table RHN_BIL_CHARGE_ITEM_COMP add constraint FK_BIL_CHARGE_ITE_BD_CATAL_C_1 foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BIL_INVOICE add constraint FK_BIL_INVOICE_SYS_TNT_INVOICE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_INVOICE add constraint FK_BIL_INVOICE_BIL_PAT_INVOICE foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_BIL_INVOICE_CAT_SUM add constraint FK_BIL_INVOICE_CA_SYS_TNT_INVO foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_INVOICE_CAT_SUM add constraint FK_BIL_INVOICE_CA_BIL_INVO_INV foreign key (ID_TNT, ID_INVOICE) references RHN_BIL_INVOICE(ID_TNT, ID_INVOICE);
alter table RHN_BIL_INVOICE_LINE add constraint FK_BIL_INVOICE_LI_SYS_TNT_INVO foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_INVOICE_LINE add constraint FK_BIL_INVOICE_LI_BIL_INVO_INV foreign key (ID_TNT, ID_INVOICE) references RHN_BIL_INVOICE(ID_TNT, ID_INVOICE);
alter table RHN_BIL_INVOICE_LINE add constraint FK_BIL_INVOICE_LI_BIL_CHAR_INV foreign key (ID_TNT, ID_CHARGE_ITEM) references RHN_BIL_CHARGE_ITEM(ID_TNT, ID_CHARGE_ITEM);
alter table RHN_BIL_LEDGER_ENTRY add constraint FK_BIL_LEDGER_ENT_SYS_TNT_LEDG foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_LEDGER_ENTRY add constraint FK_BIL_LEDGER_ENT_BIL_PAT_LEDG foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_BIL_LEDGER_ENTRY add constraint FK_BIL_LEDGER_ENT_BIL_CHAR_LED foreign key (ID_TNT, ID_CHARGE_ITEM) references RHN_BIL_CHARGE_ITEM(ID_TNT, ID_CHARGE_ITEM);
alter table RHN_BIL_LEDGER_ENTRY add constraint FK_BIL_LEDGER_ENT_BIL_INVO_LED foreign key (ID_TNT, ID_INVOICE) references RHN_BIL_INVOICE(ID_TNT, ID_INVOICE);
alter table RHN_BIL_LEDGER_ENTRY add constraint FK_BIL_LEDGER_ENT_BIL_PAY_LEDG foreign key (ID_TNT, ID_PAY) references RHN_BIL_PAY(ID_TNT, ID_PAY);
alter table RHN_BIL_LEDGER_ENTRY add constraint FK_BIL_LEDGER_ENT_BIL_LEDG_LED foreign key (ID_TNT, ID_LEDGER_ENTRY_REVERSES) references RHN_BIL_LEDGER_ENTRY(ID_TNT, ID_LEDGER_ENTRY);
alter table RHN_BIL_LEDGER_ENTRY add constraint FK_BIL_LEDGER_ENT_INS_CLAI_LED foreign key (ID_TNT, ID_CLAIM_RESP) references RHN_INS_CLAIM_RESP(ID_TNT, ID_CLAIM_RESP);
alter table RHN_BIL_PAT_ACCT add constraint FK_BIL_PAT_ACCT_SYS_TNT_PAT_AC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_PAT_ACCT add constraint FK_BIL_PAT_ACCT_PI_PAT_PAT_ACC foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_BIL_PAT_ACCT add constraint FK_BIL_PAT_ACCT_VIS_ENC_PAT_AC foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_BIL_PAT_ACCT add constraint FK_BIL_PAT_ACCT_SYS_ORG_PAT_AC foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_PAT_ACCT add constraint FK_BIL_PAT_ACCT_SYS_DEPT_PAT_A foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_BIL_PAY add constraint FK_BIL_PAY_SYS_TNT_PAYMENT_TEN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_PAY add constraint FK_BIL_PAY_BIL_PAT_PAYMENT_ACC foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_BIL_PAY add constraint FK_BIL_PAY_BIL_INVO_PAYMENT_IN foreign key (ID_TNT, ID_INVOICE) references RHN_BIL_INVOICE(ID_TNT, ID_INVOICE);
alter table RHN_BIL_PAY add constraint FK_BIL_PAY_BIL_PAY_PAYMENT_REV foreign key (ID_TNT, ID_PAY_REVERSES) references RHN_BIL_PAY(ID_TNT, ID_PAY);
alter table RHN_BIL_PAY add constraint FK_BIL_PAY_BIL_PAY_PAYMENT_ORD foreign key (ID_TNT, ID_PAY_ORDER) references RHN_BIL_PAY_ORDER(ID_TNT, ID_PAY_ORDER);
alter table RHN_BIL_PAY_EVT add constraint FK_BIL_PAY_EVT_SYS_TNT_PAY_EVE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_PAY_EVT add constraint FK_BIL_PAY_EVT_BIL_PAY_PAY_EVE foreign key (ID_TNT, ID_PAY_ORDER) references RHN_BIL_PAY_ORDER(ID_TNT, ID_PAY_ORDER);
alter table RHN_BIL_PAY_EVT add constraint FK_BIL_PAY_EVT_INT_EXT_PAY_EVE foreign key (ID_TNT, ID_EXT_MSG) references RHN_INT_EXT_MSG(ID_TNT, ID_EXT_MSG);
alter table RHN_BIL_PAY_ORDER add constraint FK_BIL_PAY_ORDER_SYS_TNT_PAY_O foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_PAY_ORDER add constraint FK_BIL_PAY_ORDER_BIL_PAT_PAY_O foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_BIL_PAY_ORDER add constraint FK_BIL_PAY_ORDER_BIL_INVO_PAY_ foreign key (ID_TNT, ID_INVOICE) references RHN_BIL_INVOICE(ID_TNT, ID_INVOICE);
alter table RHN_BIL_PAY_ORDER add constraint FK_BIL_PAY_ORDER_BIL_PAY_PAY_O foreign key (ID_TNT, ID_PAY_ORIGINAL) references RHN_BIL_PAY(ID_TNT, ID_PAY);
alter table RHN_BIL_RCPT add constraint FK_BIL_RCPT_SYS_TNT_RECEIPT_TE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_RCPT add constraint FK_BIL_RCPT_BIL_STL_RECEIPT_SE foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_BIL_RCPT add constraint FK_BIL_RCPT_BIL_RCPT_RECEIPT_R foreign key (ID_TNT, ID_RCPT_REVERSES) references RHN_BIL_RCPT(ID_TNT, ID_RCPT);
alter table RHN_BIL_RCPT_EVT add constraint FK_BIL_RCPT_EVT_SYS_TNT_RECEIP foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_RCPT_EVT add constraint FK_BIL_RCPT_EVT_BIL_RCPT_RECEI foreign key (ID_TNT, ID_RCPT) references RHN_BIL_RCPT(ID_TNT, ID_RCPT);
alter table RHN_BIL_RCPT_EVT add constraint FK_BIL_RCPT_EVT_INT_EXT_RECEIP foreign key (ID_TNT, ID_EXT_MSG) references RHN_INT_EXT_MSG(ID_TNT, ID_EXT_MSG);
alter table RHN_BIL_RECON_BATCH add constraint FK_BIL_RECON_BATC_SYS_TNT_RECO foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_RECON_BATCH add constraint FK_BIL_RECON_BATC_SYS_ORG_RECO foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_RECON_BATCH add constraint FK_BIL_RECON_BATC_INT_EXT_RECO foreign key (ID_TNT, ID_EXT_MSG) references RHN_INT_EXT_MSG(ID_TNT, ID_EXT_MSG);
alter table RHN_BIL_RECON_ITEM add constraint FK_BIL_RECON_ITEM_BIL_RECO_REC foreign key (ID_TNT, ID_RECON_BATCH) references RHN_BIL_RECON_BATCH(ID_TNT, ID_RECON_BATCH);
alter table RHN_BIL_RECON_ITEM add constraint FK_BIL_RECON_ITEM_BIL_PAY_RECO foreign key (ID_TNT, ID_PAY) references RHN_BIL_PAY(ID_TNT, ID_PAY);
alter table RHN_BIL_RECON_ITEM add constraint FK_BIL_RECON_ITEM_BIL_CASH_REC foreign key (ID_TNT, ID_CASHIER_CLOSE) references RHN_BIL_CASHIER_CLOSE(ID_TNT, ID_CASHIER_CLOSE);
alter table RHN_BIL_RECON_ITEM add constraint FK_BIL_RECON_ITEM_BIL_RCPT_REC foreign key (ID_TNT, ID_RCPT) references RHN_BIL_RCPT(ID_TNT, ID_RCPT);
alter table RHN_BIL_RECON_ITEM_EVT add constraint FK_BIL_RECON_ITEM_BIL_RECO_R_1 foreign key (ID_TNT, ID_RECON_ITEM) references RHN_BIL_RECON_ITEM(ID_TNT, ID_RECON_ITEM);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_SYS_TNT_REG_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_PI_PAT_REG_B foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_SYS_ORG_REG_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_SYS_DEPT_REG foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_SC_SVC_S_REG foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_BD_CATAL_REG foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_SC_SCHED_REG foreign key (ID_TNT, ID_SCHED_SLOT_HOLD) references RHN_SC_SCHED_SLOT_HOLD(ID_TNT, ID_SCHED_SLOT_HOLD);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_BIL_PAT_REG_ foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_BIL_STL_REG_ foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_BIL_PAY_REG_ foreign key (ID_TNT, ID_PAY_ORDER) references RHN_BIL_PAY_ORDER(ID_TNT, ID_PAY_ORDER);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_VIS_ENC_REG_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_SC_APPT_REG_ foreign key (ID_TNT, ID_APPT) references RHN_SC_APPT(ID_TNT, ID_APPT);
alter table RHN_BIL_REG_BIL_INTENT add constraint FK_BIL_REG_BIL_IN_INS_PAT_REG_ foreign key (ID_TNT, ID_PAT_COVER) references RHN_INS_PAT_COVER(ID_TNT, ID_PAT_COVER);
alter table RHN_BIL_STL add constraint FK_BIL_STL_SYS_TNT_SETTLEMENT_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_STL add constraint FK_BIL_STL_BIL_PAT_SETTLEMENT_ foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_BIL_STL add constraint FK_BIL_STL_BIL_STL_SETTLEMENT_ foreign key (ID_TNT, ID_STL_REVERSES) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_BIL_STL add constraint FK_BIL_STL_BIL_INVO_SETTLEMENT foreign key (ID_TNT, ID_INVOICE_LEGACY) references RHN_BIL_INVOICE(ID_TNT, ID_INVOICE);
alter table RHN_BIL_STL_CAT_SUM add constraint FK_BIL_STL_CAT_SU_SYS_TNT_STL_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_STL_CAT_SUM add constraint FK_BIL_STL_CAT_SU_BIL_STL_STL_ foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_BIL_STL_EVT add constraint FK_BIL_STL_EVT_SYS_TNT_STL_EVE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_STL_EVT add constraint FK_BIL_STL_EVT_BIL_STL_STL_EVE foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_BIL_STL_LINE add constraint FK_BIL_STL_LINE_SYS_TNT_STL_LI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_STL_LINE add constraint FK_BIL_STL_LINE_BIL_STL_STL_LI foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_BIL_STL_LINE add constraint FK_BIL_STL_LINE_BIL_CHAR_STL_L foreign key (ID_TNT, ID_CHARGE_ITEM) references RHN_BIL_CHARGE_ITEM(ID_TNT, ID_CHARGE_ITEM);
alter table RHN_BIL_STL_LINE add constraint FK_BIL_STL_LINE_BIL_INVO_STL_L foreign key (ID_INVOICE_LINE_LEGACY) references RHN_BIL_INVOICE_LINE(ID_INVOICE_LINE);
alter table RHN_BIL_STL_TENDER add constraint FK_BIL_STL_TENDER_SYS_TNT_STL_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_BIL_STL_TENDER add constraint FK_BIL_STL_TENDER_BIL_STL_STL_ foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_BIL_STL_TENDER add constraint FK_BIL_STL_TENDER_BIL_PAY_STL_ foreign key (ID_TNT, ID_PAY) references RHN_BIL_PAY(ID_TNT, ID_PAY);
alter table RHN_BIL_STL_TENDER add constraint FK_BIL_STL_TENDER_INS_CLAI_STL foreign key (ID_TNT, ID_CLAIM_RESP) references RHN_INS_CLAIM_RESP(ID_TNT, ID_CLAIM_RESP);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_SYS_TNT_CARE_RE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_PI_PAT_CARE_REQ foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_VIS_ENC_CARE_RE foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_BD_CATAL_CARE_R foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_BD_ITEM_CARE_RE foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_SYS_ORG_CARE_RE foreign key (ID_TNT, ID_ORG_PERFORMER) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_SYS_DEPT_CARE_R foreign key (ID_TNT, ID_ORG_PERFORMER, ID_DEPT_PERFORMER) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_BD_ORG_C_CARE_R foreign key (ID_TNT, ID_ORG_CATALOG_ITEM_ADOPTION) references RHN_BD_ORG_CATALOG_ITEM(ID_TNT, ID_ORG_CATALOG_ITEM);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_BD_CATAL_CARE_1 foreign key (ID_TNT, ID_CATALOG_PRICE) references RHN_BD_CATALOG_PRICE(ID_TNT, ID_CATALOG_PRICE);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_EX_REQ_G_CARE_R foreign key (ID_TNT, ID_REQ_GRP) references RHN_EX_REQ_GRP(ID_TNT, ID_REQ_GRP);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_EX_CARE_CARE_RE foreign key (ID_TNT, ID_CARE_REQ_PARENT) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_SYS_TNT_DIAG foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_SYS_ORG_DIAG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_SYS_DEPT_DIA foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_PI_PAT_DIAG_ foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_VIS_ENC_DIAG foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_EX_CARE_DIAG foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_BIL_STL_DIAG foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_EX_DIAG_DIAG foreign key (ID_TNT, ID_DIAG_REPORT) references RHN_EX_DIAG_REPORT(ID_TNT, ID_DIAG_REPORT);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_SYS_USER_DIA foreign key (ID_TNT, ID_USER_COLLECTED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_SYS_USER_D_1 foreign key (ID_TNT, ID_USER_STARTED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_EX_DIAG_EXEC_TASK add constraint FK_EX_DIAG_EXEC_T_SYS_USER_D_2 foreign key (ID_TNT, ID_USER_COMPLETED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REPORT_SYS_TNT_DIAG foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REPORT_PI_PAT_DIAGN foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REPORT_VIS_ENC_DIAG foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REPORT_EX_CARE_DIAG foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REPORT_EX_DIAG_DIAG foreign key (ID_TNT, ID_DIAG_REPORT_REPLACES) references RHN_EX_DIAG_REPORT(ID_TNT, ID_DIAG_REPORT);
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REPORT_INT_EXT_DIAG foreign key (ID_TNT, ID_EXT_MSG_INBOUND) references RHN_INT_EXT_MSG(ID_TNT, ID_EXT_MSG);
alter table RHN_EX_DIAG_REPORT_RESULT add constraint FK_EX_DIAG_REPORT_EX_DIAG_REPO foreign key (ID_TNT, ID_DIAG_REPORT) references RHN_EX_DIAG_REPORT(ID_TNT, ID_DIAG_REPORT);
alter table RHN_EX_DIAG_REPORT_RESULT add constraint FK_EX_DIAG_REPORT_VIS_OBS_REPO foreign key (ID_TNT, ID_OBS) references RHN_VIS_OBS(ID_TNT, ID_OBS);
alter table RHN_EX_EXAM_ATTACH_ITEM add constraint FK_EX_EXAM_ATTACH_BD_EXAM_EXAM foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_EXAM_SVC(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_EX_EXAM_ATTACH_ITEM add constraint FK_EX_EXAM_ATTACH_BD_CATAL_EXA foreign key (ID_TNT, ID_CATALOG_ITEM_ATTACH) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_EX_INP_ORDER_EVT add constraint FK_EX_INP_ORDER_E_EX_INP_O_IP_ foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_INP_ORDER_WF(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_INP_ORDER_EVT add constraint FK_EX_INP_ORDER_E_EX_INP_O_I_1 foreign key (ID_TNT, ID_INP_ORDER_TASK) references RHN_EX_INP_ORDER_TASK(ID_TNT, ID_INP_ORDER_TASK);
alter table RHN_EX_INP_ORDER_TASK add constraint FK_EX_INP_ORDER_T_EX_INP_O_IP_ foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_INP_ORDER_WF(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_INP_ORDER_WF add constraint FK_EX_INP_ORDER_W_EX_CARE_IP_W foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_INP_ORDER_WF add constraint FK_EX_INP_ORDER_W_VIS_CARE_IP_ foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_EX_LAB_SVC_SPEC add constraint FK_EX_LAB_SVC_SPE_BD_LAB_S_LAB foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_LAB_SVC(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_EX_LAB_SVC_SPEC add constraint FK_EX_LAB_SVC_SPE_BD_DICT_LAB_ foreign key (ID_DICT_ITEM_SPEC) references RHN_BD_DICT_ITEM(ID_DICT_ITEM);
alter table RHN_EX_LAB_SVC_SPEC add constraint FK_EX_LAB_SVC_SPE_BD_DICT_LA_1 foreign key (ID_DICT_ITEM_CONTAINER) references RHN_BD_DICT_ITEM(ID_DICT_ITEM);
alter table RHN_EX_LAB_SVC_SPEC add constraint FK_EX_LAB_SVC_SPE_BD_CATAL_LAB foreign key (ID_TNT, ID_CATALOG_ITEM_TUBE_CHARGE) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_EX_MED_REQ add constraint FK_EX_MED_REQ_EX_CARE_MED_REQU foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_MED_REQ add constraint FK_EX_MED_REQ_BD_MED_MED_REQUE foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED);
alter table RHN_EX_MED_REQ add constraint FK_EX_MED_REQ_BD_ORDER_MED_REQ foreign key (ID_TNT, ID_ORDER_FREQ) references RHN_BD_ORDER_FREQ(ID_TNT, ID_ORDER_FREQ);
alter table RHN_EX_MED_REQ add constraint FK_EX_MED_REQ_BD_CONCE_MEDICAT foreign key (ID_CONCEPT_ROUTE) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_EX_OP_REFER_EVT add constraint FK_EX_OP_REFER_EV_SYS_TNT_REF_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_OP_REFER_EVT add constraint FK_EX_OP_REFER_EV_EX_OP_RE_REF foreign key (ID_TNT, ID_OP_REFER_REQ) references RHN_EX_OP_REFER_REQ(ID_TNT, ID_OP_REFER_REQ);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_SYS_TNT_REF_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_VIS_ENC_REF_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_PI_PAT_REF_R foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_SYS_ORG_REF_ foreign key (ID_TNT, ID_ORG_TARGET) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_SYS_DEPT_REF foreign key (ID_TNT, ID_ORG_TARGET, ID_DEPT_TARGET) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_SYS_PRAC_REF foreign key (ID_TNT, ID_PRACT_TARGET) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_VIS_ENC_RE_1 foreign key (ID_TNT, ID_ENC_TARGET) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_OP_REFER_REQ add constraint FK_EX_OP_REFER_RE_SC_PAT_R_REF foreign key (ID_TNT, ID_PAT_REG_TARGET) references RHN_SC_PAT_REG(ID_TNT, ID_PAT_REG);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_SYS_TNT_REQUEST_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_PI_PAT_REQUEST_G foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_VIS_ENC_REQUEST_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_SYS_ORG_REQUEST_ foreign key (ID_TNT, ID_ORG_PERFORMER) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_SYS_DEPT_REQUEST foreign key (ID_TNT, ID_ORG_PERFORMER, ID_DEPT_PERFORMER) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_TNT_SKIN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_ORG_SKIN foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_DEPT_SKI foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_PI_PAT_SKIN_ foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_VIS_ENC_SKIN foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_EX_MED_R_SKI foreign key (ID_TNT, ID_CARE_REQ_MED) references RHN_EX_MED_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_BD_MED_SKIN_ foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_BD_CATAL_SKI foreign key (ID_TNT, ID_CATALOG_ITEM_SOLUTION) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SUP_STOC_SKI foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_USER_SKI foreign key (ID_TNT, ID_USER_PERFORMED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_PRAC_SKI foreign key (ID_TNT, ID_PRACT_PERFORMED) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_USER_S_1 foreign key (ID_TNT, ID_USER_READ) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_PRAC_S_1 foreign key (ID_TNT, ID_PRACT_READ) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_EX_SKIN_TEST_EVT add constraint FK_EX_SKIN_TEST_E_SYS_USER_S_2 foreign key (ID_TNT, ID_USER_CANCELLED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_EX_SVC_REQ add constraint FK_EX_SVC_REQ_EX_CARE_SERVICE_ foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_TREAT_EXEC_ITEM add constraint FK_EX_TREAT_EXEC_SYS_TNT_TREAT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_TREAT_EXEC_ITEM add constraint FK_EX_TREAT_EXEC_EX_TREAT_TREA foreign key (ID_TNT, ID_TREAT_EXEC_TASK) references RHN_EX_TREAT_EXEC_TASK(ID_TNT, ID_TREAT_EXEC_TASK);
alter table RHN_EX_TREAT_EXEC_ITEM add constraint FK_EX_TREAT_EXEC_EX_CARE_TREAT foreign key (ID_TNT, ID_CARE_REQ_SRC) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_TREAT_EXEC_ITEM add constraint FK_EX_TREAT_EXEC_EX_CARE_TRE_1 foreign key (ID_TNT, ID_CARE_REQ_PARENT_SRC) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_TREAT_EXEC_ITEM add constraint FK_EX_TREAT_EXEC_BIL_STL_TREAT foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_EX_TREAT_EXEC_ITEM add constraint FK_EX_TREAT_EXEC_BD_ORDER_TREA foreign key (ID_TNT, ID_ORDER_FREQ) references RHN_BD_ORDER_FREQ(ID_TNT, ID_ORDER_FREQ);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_SYS_TNT_TRE_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_SYS_ORG_TREAT foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_SYS_DEPT_TREA foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_PI_PAT_TREAT_ foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_VIS_ENC_TREAT foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_EX_CARE_TRE_2 foreign key (ID_TNT, ID_CARE_REQ_SRC_GRP) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_SYS_USER_TREA foreign key (ID_TNT, ID_USER_STARTED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_EX_TREAT_EXEC_TASK add constraint FK_EX_TREAT_EXEC_SYS_USER_TR_1 foreign key (ID_TNT, ID_USER_COMPLETED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_SYS_TNT_CARE_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_PI_PAT_CARE_T foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_VIS_ENC_CARE_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_HPL_COND_CARE foreign key (ID_TNT, ID_COND) references RHN_HPL_COND(ID_TNT, ID_COND);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_SYS_PRAC_CARE foreign key (ID_TNT, ID_PRACT_OWNER) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_SYS_ORG_CARE_ foreign key (ID_TNT, ID_ORG_OWNER) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_SYS_DEPT_CARE foreign key (ID_TNT, ID_ORG_OWNER, ID_DEPT_OWNER) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_SYS_PRAC_CA_1 foreign key (ID_TNT, ID_PRACT_CREATOR) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_HPL_CARE_TASK add constraint FK_HPL_CARE_TASK_SYS_USER_CARE foreign key (ID_TNT, ID_USER_CREATOR) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_HPL_CARE_TASK_EVT add constraint FK_HPL_CARE_TASK_SYS_TNT_CAR_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_HPL_CARE_TASK_EVT add constraint FK_HPL_CARE_TASK_HPL_CARE_CARE foreign key (ID_TNT, ID_CARE_TASK) references RHN_HPL_CARE_TASK(ID_TNT, ID_CARE_TASK);
alter table RHN_HPL_CARE_TASK_EVT add constraint FK_HPL_CARE_TASK_SYS_PRAC_CA_2 foreign key (ID_TNT, ID_PRACT_ACTOR) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_HPL_CARE_TASK_EVT add constraint FK_HPL_CARE_TASK_SYS_USER_CA_1 foreign key (ID_TNT, ID_USER_ACTOR) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_HPL_COND add constraint FK_HPL_COND_SYS_TNT_CONDITION_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_HPL_COND add constraint FK_HPL_COND_PI_PAT_CONDITION_R foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_HPL_COND add constraint FK_HPL_COND_BD_CONCE_CONDITION foreign key (ID_CONCEPT_TERM) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_HPL_COND add constraint FK_HPL_COND_SYS_PRAC_CONDITION foreign key (ID_TNT, ID_PRACT_RECORDER) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_HPL_COND add constraint FK_HPL_COND_SYS_USER_CONDITION foreign key (ID_TNT, ID_USER_RECORDER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_HPL_DISEASE_MGMT_MEMBER add constraint FK_HPL_DISEASE_MG_HPL_DISE_DIS foreign key (ID_DISEASE_MGMT_PROG) references RHN_HPL_DISEASE_MGMT_PROG(ID_DISEASE_MGMT_PROG);
alter table RHN_HPL_DISEASE_MGMT_MEMBER add constraint FK_HPL_DISEASE_MG_BD_CONCE_DIS foreign key (ID_CONCEPT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_HPL_DISEASE_MGMT_RULE add constraint FK_HPL_DISEASE_MG_HPL_DISE_D_1 foreign key (ID_DISEASE_MGMT_PROG) references RHN_HPL_DISEASE_MGMT_PROG(ID_DISEASE_MGMT_PROG);
alter table RHN_HPL_DISEASE_MGMT_RULE add constraint FK_HPL_DISEASE_MG_BD_CODE_DISE foreign key (ID_CODE_SYSTEM) references RHN_BD_CODE_SYSTEM(ID_CODE_SYSTEM);
alter table RHN_INS_CLAIM add constraint FK_INS_CLAIM_SYS_TNT_INS_CLAIM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_INS_CLAIM add constraint FK_INS_CLAIM_BIL_STL_INS_CLAIM foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_INS_CLAIM add constraint FK_INS_CLAIM_BIL_PAT_INS_CLAIM foreign key (ID_TNT, ID_PAT_ACCT) references RHN_BIL_PAT_ACCT(ID_TNT, ID_PAT_ACCT);
alter table RHN_INS_CLAIM add constraint FK_INS_CLAIM_INS_PAT_INS_CLAIM foreign key (ID_TNT, ID_PAT_COVER) references RHN_INS_PAT_COVER(ID_TNT, ID_PAT_COVER);
alter table RHN_INS_CLAIM_LINE add constraint FK_INS_CLAIM_LINE_SYS_TNT_INS_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_INS_CLAIM_LINE add constraint FK_INS_CLAIM_LINE_INS_CLAI_INS foreign key (ID_TNT, ID_INS_CLAIM) references RHN_INS_CLAIM(ID_TNT, ID_INS_CLAIM);
alter table RHN_INS_CLAIM_LINE add constraint FK_INS_CLAIM_LINE_BIL_STL_INS_ foreign key (ID_TNT, ID_STL_LINE) references RHN_BIL_STL_LINE(ID_TNT, ID_STL_LINE);
alter table RHN_INS_CLAIM_RESP add constraint FK_INS_CLAIM_RESP_SYS_TNT_INS_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_INS_CLAIM_RESP add constraint FK_INS_CLAIM_RESP_INS_CLAI_INS foreign key (ID_TNT, ID_INS_CLAIM) references RHN_INS_CLAIM(ID_TNT, ID_INS_CLAIM);
alter table RHN_INS_CLAIM_RESP add constraint FK_INS_CLAIM_RESP_INT_EXT_INS_ foreign key (ID_TNT, ID_EXT_MSG) references RHN_INT_EXT_MSG(ID_TNT, ID_EXT_MSG);
alter table RHN_INS_PAT_COVER add constraint FK_INS_PAT_COVER_PI_PAT_RESIDE foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_INT_EVT_CONSUME add constraint FK_INT_EVT_CONSUM_SYS_TNT_EVEN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_INT_EXT_MSG add constraint FK_INT_EXT_MSG_SYS_TNT_EXTERNA foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_INT_EXT_MSG add constraint FK_INT_EXT_MSG_SYS_ORG_EXTERNA foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_INT_EXT_MSG add constraint FK_INT_EXT_MSG_SYS_DEPT_EXTERN foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_INT_IDEMP_RECORD add constraint FK_INT_IDEMP_RECO_SYS_TNT_IDEM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_INT_OUTBOX_EVT add constraint FK_INT_OUTBOX_EVT_SYS_TNT_OUTB foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_META_OP_NOTE_FORM_VER add constraint FK_META_OP_NOTE_F_SYS_TNT_ONFV foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_META_OP_NOTE_FORM_VER add constraint FK_META_OP_NOTE_F_SYS_ORG_ONFV foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_META_OP_NOTE_FORM_VER add constraint FK_META_OP_NOTE_F_SYS_DEPT_ONF foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_META_OP_NOTE_FORM_VER add constraint FK_META_OP_NOTE_F_SYS_USER_ONF foreign key (ID_TNT, ID_USER_PUBLISD) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_META_OP_NOTE_TMPL add constraint FK_META_OP_NOTE_T_SYS_TNT_ONT_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_META_OP_NOTE_TMPL add constraint FK_META_OP_NOTE_T_SYS_ORG_ONT_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_META_OP_NOTE_TMPL add constraint FK_META_OP_NOTE_T_SYS_DEPT_ONT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_META_OP_NOTE_TMPL add constraint FK_META_OP_NOTE_T_SYS_USER_ONT foreign key (ID_TNT, ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_META_OP_NOTE_TMPL add constraint FK_META_OP_NOTE_T_SYS_USER_O_1 foreign key (ID_TNT, ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_META_OP_PLAN_DIAG add constraint FK_META_OP_PLAN_D_META_OP_OPD_ foreign key (ID_TNT, ID_OP_PLAN_TMPL) references RHN_META_OP_PLAN_TMPL(ID_TNT, ID_OP_PLAN_TMPL);
alter table RHN_META_OP_PLAN_MED add constraint FK_META_OP_PLAN_M_META_OP_OPM_ foreign key (ID_TNT, ID_OP_PLAN_TMPL) references RHN_META_OP_PLAN_TMPL(ID_TNT, ID_OP_PLAN_TMPL);
alter table RHN_META_OP_PLAN_SVC add constraint FK_META_OP_PLAN_S_META_OP_OPS_ foreign key (ID_TNT, ID_OP_PLAN_TMPL) references RHN_META_OP_PLAN_TMPL(ID_TNT, ID_OP_PLAN_TMPL);
alter table RHN_META_OP_PLAN_TMPL add constraint FK_META_OP_PLAN_T_SYS_TNT_OPT_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_META_OP_PLAN_TMPL add constraint FK_META_OP_PLAN_T_SYS_ORG_OPT_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_META_OP_PLAN_TMPL add constraint FK_META_OP_PLAN_T_SYS_DEPT_OPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_META_OP_PLAN_TMPL add constraint FK_META_OP_PLAN_T_SYS_USER_OPT foreign key (ID_TNT, ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_META_OP_PLAN_TMPL add constraint FK_META_OP_PLAN_T_SYS_USER_O_1 foreign key (ID_TNT, ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_META_PRINT_TMPL add constraint FK_META_PRINT_TMP_SYS_TNT_PRIN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_META_PRINT_TMPL_VER add constraint FK_META_PRINT_TMP_META_PRI_PRI foreign key (ID_PRINT_TMPL) references RHN_META_PRINT_TMPL(ID_PRINT_TMPL);
alter table RHN_PI_PAT add constraint FK_PI_PAT_PI_PAT_RESIDENT_MERG foreign key (ID_PAT_MERGED_INTO) references RHN_PI_PAT(ID_PAT);
alter table RHN_PI_PAT add constraint FK_PI_PAT_SYS_TNT_RESIDENT_TEN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_PI_PAT add constraint FK_PI_PAT_PI_PAT_RESIDENT_ME_1 foreign key (ID_TNT, ID_PAT_MERGED_INTO) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_ADDR add constraint FK_PI_PAT_ADDR_PI_PAT_RESIDENT foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_DEMO_PROF add constraint FK_PI_PAT_DEMO_PR_PI_PAT_RESID foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_EMPL add constraint FK_PI_PAT_EMPL_PI_PAT_RESIDENT foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_IDENT add constraint FK_PI_PAT_IDENT_PI_PAT_RESIDEN foreign key (ID_PAT) references RHN_PI_PAT(ID_PAT);
alter table RHN_PI_PAT_IDENT add constraint FK_PI_PAT_IDENT_SYS_TNT_RESIDE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_PI_PAT_IDENT add constraint FK_PI_PAT_IDENT_PI_PAT_IDENTIF foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_IDENT add constraint FK_PI_PAT_IDENT_SYS_ORG_IDENTI foreign key (ID_TNT, ID_ORG_SRC) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_PI_PAT_MATCH_CAND add constraint FK_PI_PAT_MATCH_C_PI_PAT_S_MAT foreign key (ID_PAT_SRC_RECORD) references RHN_PI_PAT_SRC_RECORD(ID_PAT_SRC_RECORD);
alter table RHN_PI_PAT_MATCH_CAND add constraint FK_PI_PAT_MATCH_C_PI_PAT_MATCH foreign key (ID_PAT_CAND) references RHN_PI_PAT(ID_PAT);
alter table RHN_PI_PAT_MATCH_CAND add constraint FK_PI_PAT_MATCH_C_SYS_TNT_RESI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_PI_PAT_MATCH_CAND add constraint FK_PI_PAT_MATCH_C_PI_PAT_S_M_1 foreign key (ID_TNT, ID_PAT_SRC_RECORD) references RHN_PI_PAT_SRC_RECORD(ID_TNT, ID_PAT_SRC_RECORD);
alter table RHN_PI_PAT_MATCH_CAND add constraint FK_PI_PAT_MATCH_C_PI_PAT_MAT_1 foreign key (ID_TNT, ID_PAT_CAND) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_MERGE_HIST add constraint FK_PI_PAT_MERGE_H_PI_PAT_MERGE foreign key (ID_PAT_SURVIVING) references RHN_PI_PAT(ID_PAT);
alter table RHN_PI_PAT_MERGE_HIST add constraint FK_PI_PAT_MERGE_H_PI_PAT_MER_1 foreign key (ID_PAT_MERGED) references RHN_PI_PAT(ID_PAT);
alter table RHN_PI_PAT_MERGE_HIST add constraint FK_PI_PAT_MERGE_H_SYS_TNT_RESI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_PI_PAT_MERGE_HIST add constraint FK_PI_PAT_MERGE_H_PI_PAT_MER_2 foreign key (ID_TNT, ID_PAT_SURVIVING) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_MERGE_HIST add constraint FK_PI_PAT_MERGE_H_PI_PAT_MER_3 foreign key (ID_TNT, ID_PAT_MERGED) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_RELATED_PERSON add constraint FK_PI_PAT_RELATED_PI_PAT_RESID foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_SPLIT_HIST add constraint FK_PI_PAT_SPLIT_H_PI_PAT_M_SPL foreign key (ID_PAT_MERGE_HIST) references RHN_PI_PAT_MERGE_HIST(ID_PAT_MERGE_HIST);
alter table RHN_PI_PAT_SPLIT_HIST add constraint FK_PI_PAT_SPLIT_H_PI_PAT_SPLIT foreign key (ID_PAT_RESTORED) references RHN_PI_PAT(ID_PAT);
alter table RHN_PI_PAT_SPLIT_HIST add constraint FK_PI_PAT_SPLIT_H_SYS_TNT_RESI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_PI_PAT_SPLIT_HIST add constraint FK_PI_PAT_SPLIT_H_PI_PAT_M_S_1 foreign key (ID_TNT, ID_PAT_MERGE_HIST) references RHN_PI_PAT_MERGE_HIST(ID_TNT, ID_PAT_MERGE_HIST);
alter table RHN_PI_PAT_SPLIT_HIST add constraint FK_PI_PAT_SPLIT_H_PI_PAT_SPL_1 foreign key (ID_TNT, ID_PAT_RESTORED) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_SRC_RECORD add constraint FK_PI_PAT_SRC_REC_PI_PAT_SOURC foreign key (ID_PAT) references RHN_PI_PAT(ID_PAT);
alter table RHN_PI_PAT_SRC_RECORD add constraint FK_PI_PAT_SRC_REC_SYS_TNT_RESI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_PI_PAT_SRC_RECORD add constraint FK_PI_PAT_SRC_REC_PI_PAT_SOU_1 foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_PI_PAT_SRC_RECORD add constraint FK_PI_PAT_SRC_REC_SYS_ORG_SOUR foreign key (ID_TNT, ID_ORG_SRC) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SYS_TNT_APPOINTMENT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SC_SVC_S_APPOINTMEN foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SC_SCHED_APPOINTMEN foreign key (ID_TNT, ID_SCHED_SLOT_POOL) references RHN_SC_SCHED_SLOT_POOL(ID_TNT, ID_SCHED_SLOT_POOL);
alter table RHN_SC_APPT add constraint FK_SC_APPT_PI_PAT_APPOINTMENT_ foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SYS_PRAC_APPOINTMEN foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SYS_USER_APPOINTMEN foreign key (ID_TNT, ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SC_SCHED_APPOINTM_1 foreign key (ID_TNT, ID_SCHED_SLOT_HOLD) references RHN_SC_SCHED_SLOT_HOLD(ID_TNT, ID_SCHED_SLOT_HOLD);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SYS_USER_APPT_UPDAT foreign key (ID_TNT, ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SC_APPT_APPT_RESCHE foreign key (ID_TNT, ID_APPT_RESCHEDULED_FROM) references RHN_SC_APPT(ID_TNT, ID_APPT);
alter table RHN_SC_APPT_EVT add constraint FK_SC_APPT_EVT_SC_APPT_APPT_EV foreign key (ID_TNT, ID_APPT) references RHN_SC_APPT(ID_TNT, ID_APPT);
alter table RHN_SC_APPT_EVT add constraint FK_SC_APPT_EVT_SC_APPT_APPT__1 foreign key (ID_TNT, ID_APPT_REPLACEMENT) references RHN_SC_APPT(ID_TNT, ID_APPT);
alter table RHN_SC_APPT_EVT add constraint FK_SC_APPT_EVT_SYS_USER_APPT_E foreign key (ID_TNT, ID_USER_OCCURRED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_PAT_REG add constraint FK_SC_PAT_REG_SYS_TNT_REGISTRA foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_PAT_REG add constraint FK_SC_PAT_REG_SC_APPT_REGISTRA foreign key (ID_TNT, ID_APPT) references RHN_SC_APPT(ID_TNT, ID_APPT);
alter table RHN_SC_PAT_REG add constraint FK_SC_PAT_REG_SC_SVC_S_REGISTR foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_SC_PAT_REG add constraint FK_SC_PAT_REG_PI_PAT_REGISTRAT foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SC_PAT_REG add constraint FK_SC_PAT_REG_SYS_ORG_REGISTRA foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SC_PAT_REG add constraint FK_SC_PAT_REG_SYS_DEPT_REGISTR foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SC_PAT_REG add constraint FK_SC_PAT_REG_SYS_USER_REGISTR foreign key (ID_TNT, ID_USER_REGISTERED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_SVC_QUEUE add constraint FK_SC_SVC_QUEUE_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SVC_QUEUE add constraint FK_SC_SVC_QUEUE_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SC_SVC_QUEUE add constraint FK_SC_SVC_QUEUE_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SC_SVC_QUEUE add constraint FK_SC_SVC_QUEUE_WAIT_LOC foreign key (ID_TNT, ID_SVC_LOC_WAITING) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_SC_SVC_QUEUE add constraint FK_SC_SVC_QUEUE_CREATED_BY foreign key (ID_TNT, ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_SVC_QUEUE add constraint FK_SC_SVC_QUEUE_UPDATED_BY foreign key (ID_TNT, ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_QUEUE_COUNT add constraint FK_SC_QUEUE_COUNT_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_QUEUE_COUNT add constraint FK_SC_QUEUE_COUNT_QUEUE foreign key (ID_TNT, ID_SVC_QUEUE) references RHN_SC_SVC_QUEUE(ID_TNT, ID_SVC_QUEUE);
alter table RHN_SC_QUEUE_TICKET add constraint FK_SC_QUEUE_TICKET_QUEUE foreign key (ID_TNT, ID_SVC_QUEUE) references RHN_SC_SVC_QUEUE(ID_TNT, ID_SVC_QUEUE);
alter table RHN_SC_QUEUE_TICKET add constraint FK_SC_QUEUE_TICKET_PAT foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SC_QUEUE_TICKET add constraint FK_SC_QUEUE_TICKET_ENC foreign key (ID_TNT, ID_PAT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_PAT, ID_ENC);
alter table RHN_SC_QUEUE_TICKET add constraint FK_SC_QUEUE_TICKET_CUR_LOC foreign key (ID_TNT, ID_SVC_LOC_CURRENT) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_SC_QUEUE_TICKET_EVT add constraint FK_SC_QUEUE_EVT_TICKET foreign key (ID_TNT, ID_QUEUE_TICKET) references RHN_SC_QUEUE_TICKET(ID_TNT, ID_QUEUE_TICKET);
alter table RHN_SC_QUEUE_TICKET_EVT add constraint FK_SC_QUEUE_EVT_USER foreign key (ID_TNT, ID_USER_OCCURRED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_QUEUE_TICKET_EVT add constraint FK_SC_QUEUE_EVENT_LOC foreign key (ID_TNT, ID_SVC_LOC) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_SC_SCHED_EXCEPT add constraint FK_SC_SCHED_EXCEP_SYS_TNT_SCHE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SCHED_EXCEPT add constraint FK_SC_SCHED_EXCEP_SC_SCHED_SCH foreign key (ID_TNT, ID_SCHED_TMPL) references RHN_SC_SCHED_TMPL(ID_TNT, ID_SCHED_TMPL);
alter table RHN_SC_SCHED_EXCEPT add constraint FK_SC_SCHED_EXCEP_SYS_USER_SCH foreign key (ID_TNT, ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_SCHED_GEN_RUN add constraint FK_SC_SCHED_GEN_R_SYS_TNT_SCHE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SCHED_GEN_RUN add constraint FK_SC_SCHED_GEN_R_SC_SCHED_SCH foreign key (ID_TNT, ID_SCHED_TMPL) references RHN_SC_SCHED_TMPL(ID_TNT, ID_SCHED_TMPL);
alter table RHN_SC_SCHED_SLOT_HOLD add constraint FK_SC_SCHED_SLOT_SYS_TNT_SLOT_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SCHED_SLOT_HOLD add constraint FK_SC_SCHED_SLOT_SC_SCHED_SLOT foreign key (ID_TNT, ID_SCHED_SLOT_POOL) references RHN_SC_SCHED_SLOT_POOL(ID_TNT, ID_SCHED_SLOT_POOL);
alter table RHN_SC_SCHED_SLOT_HOLD add constraint FK_SC_SCHED_SLOT_SC_SVC_S_SLOT foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_SC_SCHED_SLOT_HOLD add constraint FK_SC_SCHED_SLOT_PI_PAT_SLOT_H foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SC_SCHED_SLOT_HOLD add constraint FK_SC_SCHED_SLOT_SC_PAT_R_SLOT foreign key (ID_TNT, ID_PAT_REG_CONSUMED) references RHN_SC_PAT_REG(ID_TNT, ID_PAT_REG);
alter table RHN_SC_SCHED_SLOT_POOL add constraint FK_SC_SCHED_SLOT_SYS_TNT_SCHED foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SCHED_SLOT_POOL add constraint FK_SC_SCHED_SLOT_SC_SVC_S_SCHE foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_SC_SCHED_TMPL add constraint FK_SC_SCHED_TMPL_SYS_TNT_SCHED foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SCHED_TMPL add constraint FK_SC_SCHED_TMPL_SYS_SVC_SCHED foreign key (ID_TNT, ID_SVC_RSRC) references RHN_SYS_SVC_RSRC(ID_TNT, ID_SVC_RSRC);
alter table RHN_SC_SCHED_TMPL_PERIOD add constraint FK_SC_SCHED_TMPL_SYS_TNT_SCH_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SCHED_TMPL_PERIOD add constraint FK_SC_SCHED_TMPL_SC_SCHED_SCHE foreign key (ID_TNT, ID_SCHED_TMPL) references RHN_SC_SCHED_TMPL(ID_TNT, ID_SCHED_TMPL);
alter table RHN_SC_SLOT_EVT add constraint FK_SC_SLOT_EVT_SYS_TNT_SLOT_EV foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SLOT_EVT add constraint FK_SC_SLOT_EVT_SC_SCHED_SLOT_E foreign key (ID_TNT, ID_SCHED_SLOT_POOL) references RHN_SC_SCHED_SLOT_POOL(ID_TNT, ID_SCHED_SLOT_POOL);
alter table RHN_SC_SLOT_EVT add constraint FK_SC_SLOT_EVT_SC_SVC_S_SLOT_E foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_SC_SLOT_EVT add constraint FK_SC_SLOT_EVT_SYS_USER_SLOT_E foreign key (ID_TNT, ID_USER_ACTOR) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SYS_TNT_SERVIC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SYS_SVC_SERVIC foreign key (ID_TNT, ID_SVC_RSRC) references RHN_SYS_SVC_RSRC(ID_TNT, ID_SVC_RSRC);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SC_SCHED_SERVI foreign key (ID_TNT, ID_SCHED_TMPL) references RHN_SC_SCHED_TMPL(ID_TNT, ID_SCHED_TMPL);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SC_SCHED_SER_1 foreign key (ID_TNT, ID_SCHED_TMPL_PERIOD) references RHN_SC_SCHED_TMPL_PERIOD(ID_TNT, ID_SCHED_TMPL_PERIOD);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SC_SCHED_SER_2 foreign key (ID_TNT, ID_SCHED_GEN_RUN) references RHN_SC_SCHED_GEN_RUN(ID_TNT, ID_SCHED_GEN_RUN);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SYS_ORG_SERVIC foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SYS_DEPT_SERVI foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SYS_PRAC_SERVI foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_SYS_STAF_SERVI foreign key (ID_TNT, ID_STAFF_ASSIGN) references RHN_SYS_STAFF_ASSIGN(ID_TNT, ID_STAFF_ASSIGN);
alter table RHN_SC_SVC_SCHED add constraint FK_SC_SVC_SCHED_BD_CATAL_SERVI foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_SC_SVC_SCHED_EVT add constraint FK_SC_SVC_SCHED_E_SYS_TNT_SCHE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SC_SVC_SCHED_EVT add constraint FK_SC_SVC_SCHED_E_SC_SVC_S_SCH foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_SC_SVC_SCHED_EVT add constraint FK_SC_SVC_SCHED_E_SYS_USER_SCH foreign key (ID_TNT, ID_USER_ACTOR) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SUP_DISP_ROUTE add constraint FK_SUP_DISP_ROUTE_SYS_TNT_DISP foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_DISP_ROUTE add constraint FK_SUP_DISP_ROUTE_SYS_ORG_DISP foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_DISP_ROUTE add constraint FK_SUP_DISP_ROUTE_SYS_DEPT_DIS foreign key (ID_TNT, ID_ORG, ID_DEPT_SRC) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_DISP_ROUTE add constraint FK_SUP_DISP_ROUTE_SUP_STOC_DIS foreign key (ID_TNT, ID_STOCK_SITE_TARGET) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_DISP_TASK add constraint FK_SUP_DISP_TASK_SYS_TNT_DISPE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_DISP_TASK add constraint FK_SUP_DISP_TASK_PI_PAT_DISPEN foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SUP_DISP_TASK add constraint FK_SUP_DISP_TASK_VIS_ENC_DISPE foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_SUP_DISP_TASK add constraint FK_SUP_DISP_TASK_SUP_STOC_DISP foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_DISP_TASK add constraint FK_SUP_DISP_TASK_SUP_PHAR_DISP foreign key (ID_TNT, ID_PHARM_REVIEW_LATEST) references RHN_SUP_PHARM_REVIEW(ID_TNT, ID_PHARM_REVIEW);
alter table RHN_SUP_DISP_TASK_LINE add constraint FK_SUP_DISP_TASK_SYS_TNT_DIS_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_DISP_TASK_LINE add constraint FK_SUP_DISP_TASK_SUP_DISP_DISP foreign key (ID_TNT, ID_DISP_TASK) references RHN_SUP_DISP_TASK(ID_TNT, ID_DISP_TASK);
alter table RHN_SUP_DISP_TASK_LINE add constraint FK_SUP_DISP_TASK_SUP_STOC_DI_1 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_DISP_TASK_LINE add constraint FK_SUP_DISP_TASK_BD_ITEM_DISPE foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_GOOD_RCPT add constraint FK_SUP_GOOD_RCPT_SYS_TNT_GR_TE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_GOOD_RCPT add constraint FK_SUP_GOOD_RCPT_SYS_ORG_GR_OR foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_GOOD_RCPT add constraint FK_SUP_GOOD_RCPT_SUP_STOC_GR_S foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_GOOD_RCPT add constraint FK_SUP_GOOD_RCPT_SUP_PURC_GR_P foreign key (ID_TNT, ID_PURCH_ORDER) references RHN_SUP_PURCH_ORDER(ID_TNT, ID_PURCH_ORDER);
alter table RHN_SUP_GOOD_RCPT add constraint FK_SUP_GOOD_RCPT_SUP_SUPP_GR_S foreign key (ID_TNT, ID_SUPPL) references RHN_SUP_SUPPL(ID_TNT, ID_SUPPL);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_SYS_TNT_GR_LI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_SUP_GOOD_GR_L foreign key (ID_TNT, ID_GOOD_RCPT) references RHN_SUP_GOOD_RCPT(ID_TNT, ID_GOOD_RCPT);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_SUP_PURC_GR_L foreign key (ID_TNT, ID_PURCH_ORDER_LINE) references RHN_SUP_PURCH_ORDER_LINE(ID_TNT, ID_PURCH_ORDER_LINE);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_SUP_STOC_GR_L foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_BD_ITEM_GR_LI foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_SUP_STOC_GR_1 foreign key (ID_TNT, ID_STOCK_BIN_DESTINATION) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_SUP_STOC_GR_2 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_GOOD_RCPT_LINE add constraint FK_SUP_GOOD_RCPT_SUP_INV_GR_LI foreign key (ID_TNT, ID_INV_TXN) references RHN_SUP_INV_TXN(ID_TNT, ID_INV_TXN);
alter table RHN_SUP_INP_MED_CONSUME add constraint FK_SUP_INP_MED_CO_SYS_TNT_MED_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INP_MED_CONSUME add constraint FK_SUP_INP_MED_CO_EX_CARE_MED_ foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_SUP_INP_MED_CONSUME add constraint FK_SUP_INP_MED_CO_EX_INP_O_MED foreign key (ID_TNT, ID_INP_ORDER_TASK, ID_CARE_REQ) references RHN_EX_INP_ORDER_TASK(ID_TNT, ID_INP_ORDER_TASK, ID_CARE_REQ);
alter table RHN_SUP_INP_MED_CONSUME add constraint FK_SUP_INP_MED_CO_SUP_DISP_MED foreign key (ID_TNT, ID_DISP_TASK_LINE_DISP, ID_CARE_REQ) references RHN_SUP_DISP_TASK_LINE(ID_TNT, ID_DISP_TASK_LINE, ID_CARE_REQ);
alter table RHN_SUP_INP_MED_CONSUME add constraint FK_SUP_INP_MED_CO_SUP_MED_MED_ foreign key (ID_TNT, ID_MED_DISP) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_INP_MED_CONSUME add constraint FK_SUP_INP_MED_CO_SUP_MED_ME_1 foreign key (ID_TNT, ID_MED_DISP_LINE, ID_DISP_TASK_LINE_DISP) references RHN_SUP_MED_DISP_LINE(ID_TNT, ID_MED_DISP_LINE, ID_DISP_TASK_LINE);
alter table RHN_SUP_INP_MED_SUPPLY_BATCH add constraint FK_SUP_INP_MED_SU_SYS_TNT_IPMS foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INP_MED_SUPPLY_BATCH add constraint FK_SUP_INP_MED_SU_SYS_ORG_IPMS foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INP_MED_SUPPLY_BATCH add constraint FK_SUP_INP_MED_SU_SUP_STOC_IPM foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INP_MED_SUPPLY_BATCH add constraint FK_SUP_INP_MED_SU_SYS_DEPT_IPM foreign key (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_INP_MED_SUPPLY_BATCH add constraint FK_SUP_INP_MED_SU_SUP_DISP_IPM foreign key (ID_TNT, ID_DISP_ROUTE) references RHN_SUP_DISP_ROUTE(ID_TNT, ID_DISP_ROUTE);
alter table RHN_SUP_INP_MED_SUPPLY_GEN_RUN add constraint FK_SUP_INP_MED_SU_SYS_TNT_IP_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INP_MED_SUPPLY_GEN_RUN add constraint FK_SUP_INP_MED_SU_SYS_ORG_IP_1 foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INP_MED_SUPPLY_GEN_RUN add constraint FK_SUP_INP_MED_SU_SUP_STOC_I_1 foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INP_MED_SUPPLY_GEN_RUN add constraint FK_SUP_INP_MED_SU_SYS_DEPT_I_1 foreign key (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_INP_MED_SUPPLY_GEN_RUN add constraint FK_SUP_INP_MED_SU_SUP_DISP_I_1 foreign key (ID_TNT, ID_DISP_ROUTE) references RHN_SUP_DISP_ROUTE(ID_TNT, ID_DISP_ROUTE);
alter table RHN_SUP_INP_MED_SUPPLY_GEN_RUN add constraint FK_SUP_INP_MED_SU_SUP_INP_IPMS foreign key (ID_TNT, ID_INP_MED_SUPPLY_BATCH) references RHN_SUP_INP_MED_SUPPLY_BATCH(ID_TNT, ID_INP_MED_SUPPLY_BATCH);
alter table RHN_SUP_INP_MED_SUPPLY_LINE add constraint FK_SUP_INP_MED_SU_SYS_TNT_IP_2 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INP_MED_SUPPLY_LINE add constraint FK_SUP_INP_MED_SU_SUP_INP_IP_1 foreign key (ID_TNT, ID_INP_MED_SUPPLY_BATCH) references RHN_SUP_INP_MED_SUPPLY_BATCH(ID_TNT, ID_INP_MED_SUPPLY_BATCH);
alter table RHN_SUP_INP_MED_SUPPLY_LINE add constraint FK_SUP_INP_MED_SU_EX_CARE_IPMS foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_SUP_INP_MED_SUPPLY_LINE add constraint FK_SUP_INP_MED_SU_VIS_ENC_IPMS foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_SUP_INP_MED_SUPPLY_LINE add constraint FK_SUP_INP_MED_SU_PI_PAT_IPMSL foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SUP_INP_MED_SUPPLY_LINE add constraint FK_SUP_INP_MED_SU_SUP_DISP_I_2 foreign key (ID_TNT, ID_DISP_TASK_LINE) references RHN_SUP_DISP_TASK_LINE(ID_TNT, ID_DISP_TASK_LINE);
alter table RHN_SUP_INP_MED_SUPPLY_TASK add constraint FK_SUP_INP_MED_SU_SYS_TNT_IP_3 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INP_MED_SUPPLY_TASK add constraint FK_SUP_INP_MED_SU_SUP_INP_IP_2 foreign key (ID_TNT, ID_INP_MED_SUPPLY_LINE, ID_CARE_REQ) references RHN_SUP_INP_MED_SUPPLY_LINE(ID_TNT, ID_INP_MED_SUPPLY_LINE, ID_CARE_REQ);
alter table RHN_SUP_INP_MED_SUPPLY_TASK add constraint FK_SUP_INP_MED_SU_EX_INP_O_IPM foreign key (ID_TNT, ID_INP_ORDER_TASK, ID_CARE_REQ) references RHN_EX_INP_ORDER_TASK(ID_TNT, ID_INP_ORDER_TASK, ID_CARE_REQ);
alter table RHN_SUP_INV_BAL add constraint FK_SUP_INV_BAL_SYS_TNT_INV_BAL foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_BAL add constraint FK_SUP_INV_BAL_SUP_STOC_INV_BA foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_BAL add constraint FK_SUP_INV_BAL_SUP_STOC_INV__1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_BAL add constraint FK_SUP_INV_BAL_SUP_STOC_INV__2 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_BAL add constraint FK_SUP_INV_BAL_SUP_STOC_INV__3 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_DOC_EVT add constraint FK_SUP_INV_DOC_EV_SYS_TNT_INV_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_DOC_EVT add constraint FK_SUP_INV_DOC_EV_SYS_ORG_INV_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_SYS_TNT_OPEN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_SYS_ORG_OPEN foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_SUP_STOC_OPE foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_SUP_STOC_O_1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_SUP_STOC_O_2 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_SUP_STOC_O_3 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_BD_ITEM_OPEN foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_INV_OPEN_PKG add constraint FK_SUP_INV_OPEN_P_SUP_INV_OPEN foreign key (ID_TNT, ID_INV_TRACE_CODE) references RHN_SUP_INV_TRACE_CODE(ID_TNT, ID_INV_TRACE_CODE);
alter table RHN_SUP_INV_PERIOD add constraint FK_SUP_INV_PERIOD_SYS_TNT_INV_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PERIOD add constraint FK_SUP_INV_PERIOD_SUP_STOC_INV foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_PERIOD add constraint FK_SUP_INV_PERIOD_SUP_INV_INV_ foreign key (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD_PREVIOUS) references RHN_SUP_INV_PERIOD(ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD);
alter table RHN_SUP_INV_PERIOD add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_1 foreign key (ID_TNT, ID_INV_PERIOD, ID_INV_PERIOD_CLOSE_RUN_CLOSE) references RHN_SUP_INV_PERIOD_CLOSE_RUN(ID_TNT, ID_INV_PERIOD, ID_INV_PERIOD_CLOSE_RUN);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SYS_TNT_IN_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_2 foreign key (ID_TNT, ID_INV_PERIOD, ID_INV_PERIOD_CLOSE_RUN) references RHN_SUP_INV_PERIOD_CLOSE_RUN(ID_TNT, ID_INV_PERIOD, ID_INV_PERIOD_CLOSE_RUN);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_3 foreign key (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD) references RHN_SUP_INV_PERIOD(ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_4 foreign key (ID_TNT, ID_INV_BAL) references RHN_SUP_INV_BAL(ID_TNT, ID_INV_BAL);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_STOC_I_1 foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_STOC_I_2 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_STOC_I_3 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_STOC_I_4 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_PERIOD_BAL_SNAP add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_5 foreign key (ID_TNT, ID_INV_PERIOD_BAL_SNAP_OPENING) references RHN_SUP_INV_PERIOD_BAL_SNAP(ID_TNT, ID_INV_PERIOD_BAL_SNAP);
alter table RHN_SUP_INV_PERIOD_BAL_VAL add constraint FK_SUP_INV_PERIOD_SYS_TNT_IN_2 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PERIOD_BAL_VAL add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_6 foreign key (ID_TNT, ID_INV_PERIOD_BAL_SNAP) references RHN_SUP_INV_PERIOD_BAL_SNAP(ID_TNT, ID_INV_PERIOD_BAL_SNAP);
alter table RHN_SUP_INV_PERIOD_CLOSE_RUN add constraint FK_SUP_INV_PERIOD_SYS_TNT_IN_3 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PERIOD_CLOSE_RUN add constraint FK_SUP_INV_PERIOD_SYS_ORG_INV_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INV_PERIOD_CLOSE_RUN add constraint FK_SUP_INV_PERIOD_SUP_STOC_I_5 foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_PERIOD_CLOSE_RUN add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_7 foreign key (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD) references RHN_SUP_INV_PERIOD(ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD);
alter table RHN_SUP_INV_PERIOD_CLOSE_RUN add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_8 foreign key (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD_PREVIOUS) references RHN_SUP_INV_PERIOD(ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD);
alter table RHN_SUP_INV_PERIOD_CLOSE_RUN add constraint FK_SUP_INV_PERIOD_SUP_INV_IN_9 foreign key (ID_TNT, ID_INV_RECON_RUN) references RHN_SUP_INV_RECON_RUN(ID_TNT, ID_INV_RECON_RUN);
alter table RHN_SUP_INV_PERIOD_CLOSE_TOTAL add constraint FK_SUP_INV_PERIOD_SYS_TNT_IN_4 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PERIOD_CLOSE_TOTAL add constraint FK_SUP_INV_PERIOD_SUP_INV_I_10 foreign key (ID_TNT, ID_INV_PERIOD_CLOSE_RUN) references RHN_SUP_INV_PERIOD_CLOSE_RUN(ID_TNT, ID_INV_PERIOD_CLOSE_RUN);
alter table RHN_SUP_INV_PRICE_ADJ add constraint FK_SUP_INV_PRICE_SYS_TNT_INV_P foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PRICE_ADJ add constraint FK_SUP_INV_PRICE_SYS_ORG_INV_P foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INV_PRICE_ADJ add constraint FK_SUP_INV_PRICE_SUP_STOC_INV_ foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_PRICE_ADJ add constraint FK_SUP_INV_PRICE_SUP_INV_INV_P foreign key (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD) references RHN_SUP_INV_PERIOD(ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD);
alter table RHN_SUP_INV_PRICE_ADJ add constraint FK_SUP_INV_PRICE_BD_CATAL_INV_ foreign key (ID_TNT, ID_CATALOG_CHG_BATCH) references RHN_BD_CATALOG_CHG_BATCH(ID_TNT, ID_CATALOG_CHG_BATCH);
alter table RHN_SUP_INV_PRICE_ADJ add constraint FK_SUP_INV_PRICE_SUP_INV_INV_1 foreign key (ID_TNT, ID_INV_PRICE_ADJ_REVERSAL_OF) references RHN_SUP_INV_PRICE_ADJ(ID_TNT, ID_INV_PRICE_ADJ);
alter table RHN_SUP_INV_PRICE_ADJ_DETAIL add constraint FK_SUP_INV_PRICE_SYS_TNT_INV_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PRICE_ADJ_DETAIL add constraint FK_SUP_INV_PRICE_SUP_INV_INV_2 foreign key (ID_TNT, ID_INV_PRICE_ADJ_LINE) references RHN_SUP_INV_PRICE_ADJ_LINE(ID_TNT, ID_INV_PRICE_ADJ_LINE);
alter table RHN_SUP_INV_PRICE_ADJ_DETAIL add constraint FK_SUP_INV_PRICE_SUP_INV_INV_3 foreign key (ID_TNT, ID_INV_BAL) references RHN_SUP_INV_BAL(ID_TNT, ID_INV_BAL);
alter table RHN_SUP_INV_PRICE_ADJ_DETAIL add constraint FK_SUP_INV_PRICE_SUP_STOC_IN_1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_PRICE_ADJ_DETAIL add constraint FK_SUP_INV_PRICE_SUP_STOC_IN_2 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_PRICE_ADJ_DETAIL add constraint FK_SUP_INV_PRICE_SUP_INV_INV_4 foreign key (ID_TNT, ID_INV_VALUAT_ENTRY) references RHN_SUP_INV_VALUAT_ENTRY(ID_TNT, ID_INV_VALUAT_ENTRY);
alter table RHN_SUP_INV_PRICE_ADJ_LINE add constraint FK_SUP_INV_PRICE_SYS_TNT_INV_2 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_PRICE_ADJ_LINE add constraint FK_SUP_INV_PRICE_SUP_INV_INV_5 foreign key (ID_TNT, ID_INV_PRICE_ADJ) references RHN_SUP_INV_PRICE_ADJ(ID_TNT, ID_INV_PRICE_ADJ);
alter table RHN_SUP_INV_PRICE_ADJ_LINE add constraint FK_SUP_INV_PRICE_SUP_STOC_IN_3 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_PRICE_ADJ_LINE add constraint FK_SUP_INV_PRICE_BD_CATAL_IN_1 foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_SUP_INV_PRICE_ADJ_LINE add constraint FK_SUP_INV_PRICE_BD_ITEM_INV_P foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_INV_PRICE_ADJ_LINE add constraint FK_SUP_INV_PRICE_BD_CATAL_IN_2 foreign key (ID_TNT, ID_CATALOG_PRICE_OLD) references RHN_BD_CATALOG_PRICE(ID_TNT, ID_CATALOG_PRICE);
alter table RHN_SUP_INV_PRICE_ADJ_LINE add constraint FK_SUP_INV_PRICE_BD_CATAL_IN_3 foreign key (ID_TNT, ID_CATALOG_PRICE_NEW) references RHN_BD_CATALOG_PRICE(ID_TNT, ID_CATALOG_PRICE);
alter table RHN_SUP_INV_RECON_LINE add constraint FK_SUP_INV_RECON_SYS_TNT_INV_R foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_RECON_LINE add constraint FK_SUP_INV_RECON_SUP_INV_INV_R foreign key (ID_TNT, ID_INV_RECON_RUN) references RHN_SUP_INV_RECON_RUN(ID_TNT, ID_INV_RECON_RUN);
alter table RHN_SUP_INV_RECON_RUN add constraint FK_SUP_INV_RECON_SYS_TNT_INV_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_RECON_RUN add constraint FK_SUP_INV_RECON_SYS_ORG_INV_R foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INV_RECON_RUN add constraint FK_SUP_INV_RECON_SUP_STOC_INV_ foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_RESV add constraint FK_SUP_INV_RESV_SYS_TNT_INV_RS foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_RESV add constraint FK_SUP_INV_RESV_SUP_STOC_INV_R foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_RESV add constraint FK_SUP_INV_RESV_SUP_STOC_INV_1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_RESV add constraint FK_SUP_INV_RESV_SUP_STOC_INV_2 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_RESV add constraint FK_SUP_INV_RESV_SUP_STOC_INV_3 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_RESV add constraint FK_SUP_INV_RESV_EX_CARE_INV_RS foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_SUP_INV_RESV add constraint FK_SUP_INV_RESV_SUP_DISP_INV_R foreign key (ID_TNT, ID_DISP_TASK_LINE) references RHN_SUP_DISP_TASK_LINE(ID_TNT, ID_DISP_TASK_LINE);
alter table RHN_SUP_INV_SPLIT_EVT add constraint FK_SUP_INV_SPLIT_SYS_TNT_SPLIT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_SPLIT_EVT add constraint FK_SUP_INV_SPLIT_SUP_INV_SPLIT foreign key (ID_TNT, ID_INV_OPEN_PKG) references RHN_SUP_INV_OPEN_PKG(ID_TNT, ID_INV_OPEN_PKG);
alter table RHN_SUP_INV_TRACE_CODE add constraint FK_SUP_INV_TRACE_SYS_TNT_TRACE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_TRACE_CODE add constraint FK_SUP_INV_TRACE_SYS_ORG_TRACE foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INV_TRACE_CODE add constraint FK_SUP_INV_TRACE_SUP_STOC_TRAC foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_TRACE_CODE add constraint FK_SUP_INV_TRACE_SUP_STOC_TR_1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_TRACE_CODE add constraint FK_SUP_INV_TRACE_SUP_STOC_TR_2 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_TRACE_CODE add constraint FK_SUP_INV_TRACE_SUP_STOC_TR_3 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_TRACE_CODE add constraint FK_SUP_INV_TRACE_SUP_GOOD_TRAC foreign key (ID_TNT, ID_GOOD_RCPT_LINE) references RHN_SUP_GOOD_RCPT_LINE(ID_TNT, ID_GOOD_RCPT_LINE);
alter table RHN_SUP_INV_TRACE_EVT add constraint FK_SUP_INV_TRACE_SYS_TNT_TRA_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_TRACE_EVT add constraint FK_SUP_INV_TRACE_SYS_ORG_TRA_1 foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_INV_TRACE_EVT add constraint FK_SUP_INV_TRACE_SUP_INV_TRACE foreign key (ID_TNT, ID_INV_TRACE_CODE) references RHN_SUP_INV_TRACE_CODE(ID_TNT, ID_INV_TRACE_CODE);
alter table RHN_SUP_INV_TRACE_EVT add constraint FK_SUP_INV_TRACE_SUP_STOC_TR_4 foreign key (ID_TNT, ID_STOCK_SITE_FROM) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_TRACE_EVT add constraint FK_SUP_INV_TRACE_SUP_STOC_TR_5 foreign key (ID_TNT, ID_STOCK_SITE_TO) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_TRACE_EVT add constraint FK_SUP_INV_TRACE_SUP_STOC_TR_6 foreign key (ID_TNT, ID_STOCK_BIN_FROM) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_TRACE_EVT add constraint FK_SUP_INV_TRACE_SUP_STOC_TR_7 foreign key (ID_TNT, ID_STOCK_BIN_TO) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_TXN add constraint FK_SUP_INV_TXN_SYS_TNT_INV_TXN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_TXN add constraint FK_SUP_INV_TXN_SUP_INV_INV_TXN foreign key (ID_TNT, ID_INV_PERIOD) references RHN_SUP_INV_PERIOD(ID_TNT, ID_INV_PERIOD);
alter table RHN_SUP_INV_TXN add constraint FK_SUP_INV_TXN_SUP_INV_INV_T_1 foreign key (ID_TNT, ID_INV_TXN_REVERSES) references RHN_SUP_INV_TXN(ID_TNT, ID_INV_TXN);
alter table RHN_SUP_INV_TXN_LINE add constraint FK_SUP_INV_TXN_LI_SYS_TNT_INV_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_TXN_LINE add constraint FK_SUP_INV_TXN_LI_SUP_INV_INV_ foreign key (ID_TNT, ID_INV_TXN) references RHN_SUP_INV_TXN(ID_TNT, ID_INV_TXN);
alter table RHN_SUP_INV_TXN_LINE add constraint FK_SUP_INV_TXN_LI_SUP_STOC_INV foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_TXN_LINE add constraint FK_SUP_INV_TXN_LI_SUP_STOC_I_1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_TXN_LINE add constraint FK_SUP_INV_TXN_LI_SUP_STOC_I_2 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_TXN_LINE add constraint FK_SUP_INV_TXN_LI_SUP_STOC_I_3 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_TXN_LINE add constraint FK_SUP_INV_TXN_LI_BD_ITEM_INV_ foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SYS_TNT_INV_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SUP_INV_INV_ foreign key (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD) references RHN_SUP_INV_PERIOD(ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SUP_INV_IN_1 foreign key (ID_TNT, ID_INV_BAL) references RHN_SUP_INV_BAL(ID_TNT, ID_INV_BAL);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SUP_STOC_INV foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SUP_STOC_I_1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SUP_STOC_I_2 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SUP_STOC_I_3 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_INV_VALUAT_ENTRY add constraint FK_SUP_INV_VALUAT_SUP_INV_IN_2 foreign key (ID_TNT, ID_INV_VALUAT_ENTRY_REVERSES) references RHN_SUP_INV_VALUAT_ENTRY(ID_TNT, ID_INV_VALUAT_ENTRY);
alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_SYS_TNT_MED_DI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_SUP_DISP_MED_D foreign key (ID_TNT, ID_DISP_TASK) references RHN_SUP_DISP_TASK(ID_TNT, ID_DISP_TASK);
alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_PI_PAT_MED_DIS foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_VIS_ENC_MED_DI foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_SUP_STOC_MED_D foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_SUP_MED_MED_DI foreign key (ID_TNT, ID_MED_DISP_ORIGINAL) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SYS_TNT_MED_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SUP_MED_MED_ foreign key (ID_TNT, ID_MED_DISP) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SUP_DISP_MED foreign key (ID_TNT, ID_DISP_TASK_LINE) references RHN_SUP_DISP_TASK_LINE(ID_TNT, ID_DISP_TASK_LINE);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SUP_MED_ME_1 foreign key (ID_TNT, ID_MED_DISP_LINE_ORIGINAL) references RHN_SUP_MED_DISP_LINE(ID_TNT, ID_MED_DISP_LINE);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SUP_STOC_MED foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SUP_STOC_M_1 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SUP_STOC_M_2 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_MED_DISP_LINE add constraint FK_SUP_MED_DISP_L_SUP_INV_MED_ foreign key (ID_TNT, ID_INV_TXN_LINE) references RHN_SUP_INV_TXN_LINE(ID_TNT, ID_INV_TXN_LINE);
alter table RHN_SUP_PHARM_FULFILL_AUTH add constraint FK_SUP_PHARM_FULF_SYS_TNT_PHAR foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_PHARM_FULFILL_AUTH add constraint FK_SUP_PHARM_FULF_SYS_ORG_PHAR foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_PHARM_FULFILL_AUTH add constraint FK_SUP_PHARM_FULF_SYS_DEPT_PHA foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_PHARM_FULFILL_AUTH add constraint FK_SUP_PHARM_FULF_EX_MED_R_PHA foreign key (ID_TNT, ID_CARE_REQ_MED) references RHN_EX_MED_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_SUP_PHARM_FULFILL_AUTH add constraint FK_SUP_PHARM_FULF_BIL_STL_PHAR foreign key (ID_TNT, ID_STL) references RHN_BIL_STL(ID_TNT, ID_STL);
alter table RHN_SUP_PHARM_FULFILL_AUTH add constraint FK_SUP_PHARM_FULF_SUP_DISP_PHA foreign key (ID_TNT, ID_DISP_ROUTE) references RHN_SUP_DISP_ROUTE(ID_TNT, ID_DISP_ROUTE);
alter table RHN_SUP_PHARM_FULFILL_AUTH add constraint FK_SUP_PHARM_FULF_SUP_STOC_PHA foreign key (ID_TNT, ID_STOCK_SITE_ROUTED) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_PHARM_REVIEW add constraint FK_SUP_PHARM_REVI_SYS_TNT_PHAR foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_PHARM_REVIEW add constraint FK_SUP_PHARM_REVI_EX_CARE_PHAR foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_SUP_PHARM_REVIEW add constraint FK_SUP_PHARM_REVI_SUP_DISP_PHA foreign key (ID_TNT, ID_DISP_TASK) references RHN_SUP_DISP_TASK(ID_TNT, ID_DISP_TASK);
alter table RHN_SUP_PURCH_ORDER add constraint FK_SUP_PURCH_ORDE_SYS_TNT_PO_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_PURCH_ORDER add constraint FK_SUP_PURCH_ORDE_SYS_ORG_PO_O foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_PURCH_ORDER add constraint FK_SUP_PURCH_ORDE_SUP_STOC_PO_ foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_PURCH_ORDER add constraint FK_SUP_PURCH_ORDE_SUP_SUPP_PO_ foreign key (ID_TNT, ID_SUPPL) references RHN_SUP_SUPPL(ID_TNT, ID_SUPPL);
alter table RHN_SUP_PURCH_ORDER_LINE add constraint FK_SUP_PURCH_ORDE_SYS_TNT_PO_L foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_PURCH_ORDER_LINE add constraint FK_SUP_PURCH_ORDE_SUP_PURC_PO_ foreign key (ID_TNT, ID_PURCH_ORDER) references RHN_SUP_PURCH_ORDER(ID_TNT, ID_PURCH_ORDER);
alter table RHN_SUP_PURCH_ORDER_LINE add constraint FK_SUP_PURCH_ORDE_SUP_STOC_P_1 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_PURCH_ORDER_LINE add constraint FK_SUP_PURCH_ORDE_BD_ITEM_PO_L foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_STOCK_BIN add constraint FK_SUP_STOCK_BIN_SYS_TNT_STOCK foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_BIN add constraint FK_SUP_STOCK_BIN_SUP_STOC_STOC foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_BIN add constraint FK_SUP_STOCK_BIN_SUP_STOC_ST_1 foreign key (ID_TNT, ID_STOCK_BIN_PARENT) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_STOCK_COUNT add constraint FK_SUP_STOCK_COUN_SYS_TNT_COUN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_COUNT add constraint FK_SUP_STOCK_COUN_SYS_ORG_COUN foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_STOCK_COUNT add constraint FK_SUP_STOCK_COUN_SUP_STOC_COU foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_COUNT add constraint FK_SUP_STOCK_COUN_SUP_STOC_C_1 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_STOCK_COUNT add constraint FK_SUP_STOCK_COUN_SUP_INV_COUN foreign key (ID_TNT, ID_INV_TXN) references RHN_SUP_INV_TXN(ID_TNT, ID_INV_TXN);
alter table RHN_SUP_STOCK_COUNT_LINE add constraint FK_SUP_STOCK_COUN_SYS_TNT_CO_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_COUNT_LINE add constraint FK_SUP_STOCK_COUN_SUP_STOC_C_2 foreign key (ID_TNT, ID_STOCK_COUNT) references RHN_SUP_STOCK_COUNT(ID_TNT, ID_STOCK_COUNT);
alter table RHN_SUP_STOCK_COUNT_LINE add constraint FK_SUP_STOCK_COUN_SUP_INV_CO_1 foreign key (ID_TNT, ID_INV_BAL) references RHN_SUP_INV_BAL(ID_TNT, ID_INV_BAL);
alter table RHN_SUP_STOCK_COUNT_LINE add constraint FK_SUP_STOCK_COUN_SUP_STOC_C_3 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_STOCK_COUNT_LINE add constraint FK_SUP_STOCK_COUN_SUP_STOC_C_4 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_STOCK_COUNT_LINE add constraint FK_SUP_STOCK_COUN_SUP_STOC_C_5 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_STOCK_ITEM add constraint FK_SUP_STOCK_ITEM_SYS_TNT_STOC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_ITEM add constraint FK_SUP_STOCK_ITEM_SUP_STOC_STO foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_ITEM add constraint FK_SUP_STOCK_ITEM_BD_CATAL_STO foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_SUP_STOCK_ITEM add constraint FK_SUP_STOCK_ITEM_BD_ITEM_STOC foreign key (ID_TNT, ID_ITEM_PKG_BASE) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_STOCK_LOT add constraint FK_SUP_STOCK_LOT_SYS_TNT_STOCK foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_LOT add constraint FK_SUP_STOCK_LOT_BD_CATAL_STOC foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_SUP_STOCK_LOT add constraint FK_SUP_STOCK_LOT_BD_ITEM_STOCK foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_STOCK_REQ add constraint FK_SUP_STOCK_REQ_SYS_TNT_REQ_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_REQ add constraint FK_SUP_STOCK_REQ_SYS_ORG_REQ_O foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_STOCK_REQ add constraint FK_SUP_STOCK_REQ_SUP_STOC_REQ_ foreign key (ID_TNT, ID_STOCK_SITE_SRC) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_REQ add constraint FK_SUP_STOCK_REQ_SYS_DEPT_REQ_ foreign key (ID_TNT, ID_ORG, ID_DEPT_REQUESTING) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_STOCK_REQ add constraint FK_SUP_STOCK_REQ_SUP_STOC_RE_1 foreign key (ID_TNT, ID_STOCK_SITE_DESTINATION) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_REQ add constraint FK_SUP_STOCK_REQ_SUP_INV_REQ_T foreign key (ID_TNT, ID_INV_TXN) references RHN_SUP_INV_TXN(ID_TNT, ID_INV_TXN);
alter table RHN_SUP_STOCK_REQ_ALLOC add constraint FK_SUP_STOCK_REQ_SYS_TNT_REQ_A foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_REQ_ALLOC add constraint FK_SUP_STOCK_REQ_SUP_STOC_RE_2 foreign key (ID_TNT, ID_STOCK_REQ_LINE) references RHN_SUP_STOCK_REQ_LINE(ID_TNT, ID_STOCK_REQ_LINE);
alter table RHN_SUP_STOCK_REQ_ALLOC add constraint FK_SUP_STOCK_REQ_SUP_STOC_RE_3 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_STOCK_REQ_ALLOC add constraint FK_SUP_STOCK_REQ_SUP_STOC_RE_4 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_STOCK_REQ_LINE add constraint FK_SUP_STOCK_REQ_SYS_TNT_REQ_L foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_REQ_LINE add constraint FK_SUP_STOCK_REQ_SUP_STOC_RE_5 foreign key (ID_TNT, ID_STOCK_REQ) references RHN_SUP_STOCK_REQ(ID_TNT, ID_STOCK_REQ);
alter table RHN_SUP_STOCK_REQ_LINE add constraint FK_SUP_STOCK_REQ_SUP_STOC_RE_6 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_STOCK_RETURN add constraint FK_SUP_STOCK_RETU_SYS_TNT_STOC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_RETURN add constraint FK_SUP_STOCK_RETU_SUP_STOC_STO foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_RETURN add constraint FK_SUP_STOCK_RETU_PI_PAT_STOCK foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SUP_STOCK_RETURN add constraint FK_SUP_STOCK_RETU_SUP_MED_STOC foreign key (ID_TNT, ID_MED_DISP_ORIGINAL) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_STOCK_RETURN add constraint FK_SUP_STOCK_RETU_SUP_MED_ST_1 foreign key (ID_TNT, ID_MED_DISP_RETURN) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_STOCK_RETURN_LINE add constraint FK_SUP_STOCK_RETU_SYS_TNT_ST_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_RETURN_LINE add constraint FK_SUP_STOCK_RETU_SUP_STOC_S_1 foreign key (ID_TNT, ID_STOCK_RETURN) references RHN_SUP_STOCK_RETURN(ID_TNT, ID_STOCK_RETURN);
alter table RHN_SUP_STOCK_RETURN_LINE add constraint FK_SUP_STOCK_RETU_SUP_MED_ST_2 foreign key (ID_TNT, ID_MED_DISP_LINE_ORIGINAL) references RHN_SUP_MED_DISP_LINE(ID_TNT, ID_MED_DISP_LINE);
alter table RHN_SUP_STOCK_RETURN_LINE add constraint FK_SUP_STOCK_RETU_SUP_STOC_S_2 foreign key (ID_TNT, ID_STOCK_BIN) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_STOCK_RETURN_LINE add constraint FK_SUP_STOCK_RETU_SUP_STOC_S_3 foreign key (ID_TNT, ID_STOCK_ITEM) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_STOCK_RETURN_LINE add constraint FK_SUP_STOCK_RETU_SUP_STOC_S_4 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_STOCK_RETURN_LINE add constraint FK_SUP_STOCK_RETU_SUP_INV_STOC foreign key (ID_TNT, ID_INV_TXN_LINE) references RHN_SUP_INV_TXN_LINE(ID_TNT, ID_INV_TXN_LINE);
alter table RHN_SUP_STOCK_SITE add constraint FK_SUP_STOCK_SITE_SYS_TNT_STOC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_SITE add constraint FK_SUP_STOCK_SITE_SYS_ORG_STOC foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_STOCK_SITE add constraint FK_SUP_STOCK_SITE_SYS_DEPT_STO foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFER_SYS_TNT_TRAN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFER_SYS_ORG_TRAN foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFER_SUP_STOC_TRA foreign key (ID_TNT, ID_STOCK_SITE_SRC) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_1 foreign key (ID_TNT, ID_STOCK_SITE_DESTINATION) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFER_SUP_INV_TRAN foreign key (ID_TNT, ID_INV_TXN_OUTBOUND) references RHN_SUP_INV_TXN(ID_TNT, ID_INV_TXN);
alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFER_SUP_INV_TR_1 foreign key (ID_TNT, ID_INV_TXN_INBOUND) references RHN_SUP_INV_TXN(ID_TNT, ID_INV_TXN);
alter table RHN_SUP_STOCK_XFER_ALLOC add constraint FK_SUP_STOCK_XFER_SYS_TNT_TR_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_XFER_ALLOC add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_2 foreign key (ID_TNT, ID_STOCK_XFER_LINE) references RHN_SUP_STOCK_XFER_LINE(ID_TNT, ID_STOCK_XFER_LINE);
alter table RHN_SUP_STOCK_XFER_ALLOC add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_3 foreign key (ID_TNT, ID_STOCK_BIN_SRC) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_STOCK_XFER_ALLOC add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_4 foreign key (ID_TNT, ID_STOCK_BIN_DESTINATION) references RHN_SUP_STOCK_BIN(ID_TNT, ID_STOCK_BIN);
alter table RHN_SUP_STOCK_XFER_ALLOC add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_5 foreign key (ID_TNT, ID_STOCK_LOT) references RHN_SUP_STOCK_LOT(ID_TNT, ID_STOCK_LOT);
alter table RHN_SUP_STOCK_XFER_LINE add constraint FK_SUP_STOCK_XFER_SYS_TNT_TR_2 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_STOCK_XFER_LINE add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_6 foreign key (ID_TNT, ID_STOCK_XFER) references RHN_SUP_STOCK_XFER(ID_TNT, ID_STOCK_XFER);
alter table RHN_SUP_STOCK_XFER_LINE add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_7 foreign key (ID_TNT, ID_STOCK_ITEM_SRC) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_STOCK_XFER_LINE add constraint FK_SUP_STOCK_XFER_SUP_STOC_T_8 foreign key (ID_TNT, ID_STOCK_ITEM_DESTINATION) references RHN_SUP_STOCK_ITEM(ID_TNT, ID_STOCK_ITEM);
alter table RHN_SUP_SUPPL add constraint FK_SUP_SUPPL_SYS_TNT_SUPPLIER_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_SUPPL add constraint FK_SUP_SUPPL_SYS_ORG_SUPPLIER_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_SUPPL_SUPPLY_ITEM add constraint FK_SUP_SUPPL_SUPP_SYS_TNT_SUPP foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_SUPPL_SUPPLY_ITEM add constraint FK_SUP_SUPPL_SUPP_SUP_SUPP_SUP foreign key (ID_TNT, ID_SUPPL) references RHN_SUP_SUPPL(ID_TNT, ID_SUPPL);
alter table RHN_SUP_SUPPL_SUPPLY_ITEM add constraint FK_SUP_SUPPL_SUPP_BD_CATAL_SUP foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_SUP_SUPPL_SUPPLY_ITEM add constraint FK_SUP_SUPPL_SUPP_BD_ITEM_SUPP foreign key (ID_TNT, ID_ITEM_PKG) references RHN_BD_ITEM_PKG(ID_TNT, ID_ITEM_PKG);
alter table RHN_SUP_WARD_DELIV add constraint FK_SUP_WARD_DELIV_SYS_TNT_WD_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_WARD_DELIV add constraint FK_SUP_WARD_DELIV_SYS_ORG_WD_O foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_WARD_DELIV add constraint FK_SUP_WARD_DELIV_SUP_STOC_WD_ foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_WARD_DELIV add constraint FK_SUP_WARD_DELIV_SYS_DEPT_WD_ foreign key (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_WARD_DELIV_EVT add constraint FK_SUP_WARD_DELIV_SYS_TNT_WDE_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_WARD_DELIV_EVT add constraint FK_SUP_WARD_DELIV_SUP_WARD_WDE foreign key (ID_TNT, ID_WARD_DELIV) references RHN_SUP_WARD_DELIV(ID_TNT, ID_WARD_DELIV);
alter table RHN_SUP_WARD_DELIV_LINE add constraint FK_SUP_WARD_DELIV_SYS_TNT_WDL_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_WARD_DELIV_LINE add constraint FK_SUP_WARD_DELIV_SUP_WARD_WDL foreign key (ID_TNT, ID_WARD_DELIV) references RHN_SUP_WARD_DELIV(ID_TNT, ID_WARD_DELIV);
alter table RHN_SUP_WARD_DELIV_LINE add constraint FK_SUP_WARD_DELIV_SUP_MED_WDL_ foreign key (ID_TNT, ID_MED_DISP) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_WARD_DELIV_LINE add constraint FK_SUP_WARD_DELIV_PI_PAT_WDL_R foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SUP_WARD_DELIV_LINE add constraint FK_SUP_WARD_DELIV_VIS_ENC_WDL_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_SUP_WARD_MED_RETURN_EVT add constraint FK_SUP_WARD_MED_R_SYS_TNT_WMRE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_WARD_MED_RETURN_EVT add constraint FK_SUP_WARD_MED_R_SUP_WARD_WMR foreign key (ID_TNT, ID_WARD_MED_RETURN_REQ) references RHN_SUP_WARD_MED_RETURN_REQ(ID_TNT, ID_WARD_MED_RETURN_REQ);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_SYS_TNT_WMRL foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_SUP_WARD_W_1 foreign key (ID_TNT, ID_WARD_MED_RETURN_REQ) references RHN_SUP_WARD_MED_RETURN_REQ(ID_TNT, ID_WARD_MED_RETURN_REQ);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_EX_CARE_WMRL foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_SUP_MED_WMRL foreign key (ID_TNT, ID_MED_DISP_ORIGINAL) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_SUP_MED_WM_1 foreign key (ID_TNT, ID_MED_DISP_LINE_ORIGINAL) references RHN_SUP_MED_DISP_LINE(ID_TNT, ID_MED_DISP_LINE);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_SUP_DISP_WMR foreign key (ID_TNT, ID_DISP_TASK_LINE) references RHN_SUP_DISP_TASK_LINE(ID_TNT, ID_DISP_TASK_LINE);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_SUP_STOC_WMR foreign key (ID_TNT, ID_STOCK_RETURN) references RHN_SUP_STOCK_RETURN(ID_TNT, ID_STOCK_RETURN);
alter table RHN_SUP_WARD_MED_RETURN_LINE add constraint FK_SUP_WARD_MED_R_SUP_MED_WM_2 foreign key (ID_TNT, ID_MED_DISP_RETURN) references RHN_SUP_MED_DISP(ID_TNT, ID_MED_DISP);
alter table RHN_SUP_WARD_MED_RETURN_REQ add constraint FK_SUP_WARD_MED_R_SYS_TNT_WMR_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SUP_WARD_MED_RETURN_REQ add constraint FK_SUP_WARD_MED_R_SYS_ORG_WMR_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_WARD_MED_RETURN_REQ add constraint FK_SUP_WARD_MED_R_SUP_STOC_W_1 foreign key (ID_TNT, ID_STOCK_SITE) references RHN_SUP_STOCK_SITE(ID_TNT, ID_STOCK_SITE);
alter table RHN_SUP_WARD_MED_RETURN_REQ add constraint FK_SUP_WARD_MED_R_SYS_DEPT_WMR foreign key (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_WARD_MED_RETURN_REQ add constraint FK_SUP_WARD_MED_R_PI_PAT_WMR_R foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SUP_WARD_MED_RETURN_REQ add constraint FK_SUP_WARD_MED_R_VIS_ENC_WMR_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_SYS_ACC_PERM add constraint FK_SYS_ACC_PERM_SYS_TNT_ACCESS foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_ACC_PERM add constraint FK_SYS_ACC_PERM_SYS_MGMT_ACCES foreign key (ID_TNT, ID_MGMT_MOD) references RHN_SYS_MGMT_MOD(ID_TNT, ID_MGMT_MOD);
alter table RHN_SYS_ACC_ROLE add constraint FK_SYS_ACC_ROLE_SYS_TNT_ACCESS foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_ANN add constraint FK_SYS_ANN_SYS_TNT_ANNOUNCEMEN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_ANN add constraint FK_SYS_ANN_SYS_ORG_ANNOUNCEMEN foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ANN add constraint FK_SYS_ANN_SYS_DEPT_ANNOUNCEME foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SYS_ANN add constraint FK_SYS_ANN_SYS_USER_ANNOUNCEME foreign key (ID_TNT, ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_ANN add constraint FK_SYS_ANN_SYS_USER_ANNOUNCE_1 foreign key (ID_TNT, ID_USER_PUBLISD) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_ANN add constraint FK_SYS_ANN_SYS_USER_ANNOUNCE_2 foreign key (ID_TNT, ID_USER_WITHDRAWN) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_ANN_READ_RCPT add constraint FK_SYS_ANN_READ_R_SYS_TNT_ANNO foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_ANN_READ_RCPT add constraint FK_SYS_ANN_READ_R_SYS_ANN_ANNO foreign key (ID_TNT, ID_SYS_ANN) references RHN_SYS_ANN(ID_TNT, ID_SYS_ANN);
alter table RHN_SYS_ANN_READ_RCPT add constraint FK_SYS_ANN_READ_R_SYS_USER_ANN foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_CFG_REV add constraint FK_SYS_CFG_REV_SYS_CFG_CONFIGU foreign key (ID_CFG_DEF) references RHN_SYS_CFG_DEF(ID_CFG_DEF);
alter table RHN_SYS_CFG_REV add constraint FK_SYS_CFG_REV_SYS_TNT_CONFIGU foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_DEPT add constraint FK_SYS_DEPT_SYS_TNT_DEPARTMENT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_DEPT add constraint FK_SYS_DEPT_SYS_ORG_DEPARTMENT foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_DEPT add constraint FK_SYS_DEPT_SYS_DEPT_DEPARTMEN foreign key (ID_TNT, ID_ORG, ID_DEPT_PARENT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SYS_DEPT add constraint FK_SYS_DEPT_SYS_DEPT_DEPARTM_1 foreign key (ID_TNT, ID_ORG, ID_DEPT_MERGED_TO) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SYS_DEPT_CAP add constraint FK_SYS_DEPT_CAP_SYS_TNT_DEPT_C foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_DEPT_CAP add constraint FK_SYS_DEPT_CAP_SYS_DEPT_DEPT_ foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_DEPT_CONTACT add constraint FK_SYS_DEPT_CONTA_SYS_TNT_DEPT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_DEPT_CONTACT add constraint FK_SYS_DEPT_CONTA_SYS_DEPT_DEP foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_DEPT_REL add constraint FK_SYS_DEPT_REL_SYS_TNT_DEPT_R foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_DEPT_REL add constraint FK_SYS_DEPT_REL_SYS_DEPT_DEPT_ foreign key (ID_TNT, ID_DEPT_SRC) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_DEPT_REL add constraint FK_SYS_DEPT_REL_SYS_DEPT_DEP_1 foreign key (ID_TNT, ID_DEPT_TARGET) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_DEPT_RESP add constraint FK_SYS_DEPT_RESP_SYS_TNT_DEPT_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_DEPT_RESP add constraint FK_SYS_DEPT_RESP_SYS_DEPT_DEPT foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_DEPT_RESP add constraint FK_SYS_DEPT_RESP_SYS_STAF_DEPT foreign key (ID_TNT, ID_STAFF_ASSIGN) references RHN_SYS_STAFF_ASSIGN(ID_TNT, ID_STAFF_ASSIGN);
alter table RHN_SYS_EMPL add constraint FK_SYS_EMPL_SYS_TNT_EMPLOYMENT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_EMPL add constraint FK_SYS_EMPL_SYS_PRAC_EMPLOYMEN foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_SYS_EMPL add constraint FK_SYS_EMPL_SYS_ORG_EMPLOYMENT foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_MGMT_MOD add constraint FK_SYS_MGMT_MOD_SYS_TNT_MANAGE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_MGMT_MOD add constraint FK_SYS_MGMT_MOD_SYS_MGMT_MANAG foreign key (ID_TNT, ID_MGMT_MOD_PARENT) references RHN_SYS_MGMT_MOD(ID_TNT, ID_MGMT_MOD);
alter table RHN_SYS_ORG add constraint FK_SYS_ORG_SYS_TNT_ORGANIZATIO foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_ORG add constraint FK_SYS_ORG_SYS_ORG_ORGANIZATIO foreign key (ID_TNT, ID_ORG_PARENT) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG add constraint FK_SYS_ORG_SYS_ORG_ORGANIZAT_1 foreign key (ID_TNT, ID_ORG_MERGED_TO) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_ADDR add constraint FK_SYS_ORG_ADDR_SYS_ORG_ORG_AD foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_CAP add constraint FK_SYS_ORG_CAP_SYS_ORG_ORG_CAP foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_CONTACT add constraint FK_SYS_ORG_CONTAC_SYS_ORG_ORG_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_IDENT add constraint FK_SYS_ORG_IDENT_SYS_ORG_ORG_I foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_IDENT add constraint FK_SYS_ORG_IDENT_SYS_ORG_ORG_1 foreign key (ID_TNT, ID_ORG_ISSUER) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_REL add constraint FK_SYS_ORG_REL_SYS_ORG_ORG_REL foreign key (ID_TNT, ID_ORG_SRC) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_REL add constraint FK_SYS_ORG_REL_SYS_ORG_ORG_R_1 foreign key (ID_TNT, ID_ORG_TARGET) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_RESP add constraint FK_SYS_ORG_RESP_SYS_ORG_ORG_RE foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_ORG_RESP add constraint FK_SYS_ORG_RESP_SYS_STAF_ORG_R foreign key (ID_TNT, ID_STAFF_ASSIGN) references RHN_SYS_STAFF_ASSIGN(ID_TNT, ID_STAFF_ASSIGN);
alter table RHN_SYS_PARAM_CAT add constraint FK_SYS_PARAM_CAT_SYS_PARA_PARA foreign key (ID_PARAM_CAT_PARENT) references RHN_SYS_PARAM_CAT(ID_PARAM_CAT);
alter table RHN_SYS_PARAM_CHG add constraint FK_SYS_PARAM_CHG_SYS_PARA_PARA foreign key (ID_PARAM_DEF) references RHN_SYS_PARAM_DEF(ID_PARAM_DEF);
alter table RHN_SYS_PARAM_CHG add constraint FK_SYS_PARAM_CHG_SYS_PARA_PA_1 foreign key (ID_PARAM_VAL) references RHN_SYS_PARAM_VAL(ID_PARAM_VAL);
alter table RHN_SYS_PARAM_CHG add constraint FK_SYS_PARAM_CHG_SYS_TNT_PARAM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PARAM_DEF add constraint FK_SYS_PARAM_DEF_SYS_PARA_PARA foreign key (ID_PARAM_CAT) references RHN_SYS_PARAM_CAT(ID_PARAM_CAT);
alter table RHN_SYS_PARAM_VAL add constraint FK_SYS_PARAM_VAL_SYS_PARA_PARA foreign key (ID_PARAM_DEF) references RHN_SYS_PARAM_DEF(ID_PARAM_DEF);
alter table RHN_SYS_PARAM_VAL add constraint FK_SYS_PARAM_VAL_SYS_TNT_PARAM foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PORTAL_NOTIFY add constraint FK_SYS_PORTAL_NOT_SYS_TNT_PORT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PORTAL_NOTIFY add constraint FK_SYS_PORTAL_NOT_SYS_ORG_PORT foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_PORTAL_NOTIFY add constraint FK_SYS_PORTAL_NOT_SYS_DEPT_POR foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_PORTAL_NOTIFY add constraint FK_SYS_PORTAL_NOT_SYS_USER_POR foreign key (ID_TNT, ID_USER_RECIPIENT) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_PORTAL_USER_WKSPACE add constraint FK_SYS_PORTAL_USE_SYS_TNT_PORT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PORTAL_USER_WKSPACE add constraint FK_SYS_PORTAL_USE_SYS_USER_POR foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_PORTAL_USER_WKSPACE add constraint FK_SYS_PORTAL_USE_SYS_ORG_PORT foreign key (ID_TNT, ID_ORG_DEFAULT) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_PORTAL_USER_WKSPACE add constraint FK_SYS_PORTAL_USE_SYS_DEPT_POR foreign key (ID_TNT, ID_DEPT_DEFAULT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_POS add constraint FK_SYS_POS_SYS_TNT_POSITION_TE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PRACT add constraint FK_SYS_PRACT_SYS_TNT_PRACTITIO foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PRINT_JOB add constraint FK_SYS_PRINT_JOB_SYS_TNT_PRINT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PRINT_JOB add constraint FK_SYS_PRINT_JOB_SYS_PRIN_PRIN foreign key (ID_TNT, ID_PRINT_OUTPUT) references RHN_SYS_PRINT_OUTPUT(ID_TNT, ID_PRINT_OUTPUT);
alter table RHN_SYS_PRINT_JOB add constraint FK_SYS_PRINT_JOB_SYS_PRIN_PR_1 foreign key (ID_TNT, ID_PRINT_JOB_ORIGINAL) references RHN_SYS_PRINT_JOB(ID_TNT, ID_PRINT_JOB);
alter table RHN_SYS_PRINT_JOB add constraint FK_SYS_PRINT_JOB_SYS_USER_PRIN foreign key (ID_TNT, ID_USER_REQUESTED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_SYS_TNT_PRIN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_META_PRI_PRI foreign key (ID_PRINT_TMPL) references RHN_META_PRINT_TMPL(ID_PRINT_TMPL);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_META_PRI_P_1 foreign key (ID_PRINT_TMPL_VER) references RHN_META_PRINT_TMPL_VER(ID_PRINT_TMPL_VER);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_PI_PAT_PRINT foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_VIS_ENC_PRIN foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_SYS_ORG_PRIN foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_SYS_DEPT_PRI foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTP_SYS_USER_PRI foreign key (ID_TNT, ID_USER_GENERATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_ROLE_PERM_ASSIGN add constraint FK_SYS_ROLE_PERM_SYS_ACC_ROLE_ foreign key (ID_TNT, ID_ACC_ROLE) references RHN_SYS_ACC_ROLE(ID_TNT, ID_ACC_ROLE);
alter table RHN_SYS_ROLE_PERM_ASSIGN add constraint FK_SYS_ROLE_PERM_SYS_ACC_ROL_1 foreign key (ID_TNT, ID_ACC_PERM) references RHN_SYS_ACC_PERM(ID_TNT, ID_ACC_PERM);
alter table RHN_SYS_ROLE_PERM_ASSIGN add constraint FK_SYS_ROLE_PERM_SYS_USER_ROLE foreign key (ID_TNT, ID_USER_GRANTED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_STAFF_ASSIGN add constraint FK_SYS_STAFF_ASSI_SYS_TNT_ASSI foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_STAFF_ASSIGN add constraint FK_SYS_STAFF_ASSI_SYS_EMPL_ASS foreign key (ID_TNT, ID_EMPL) references RHN_SYS_EMPL(ID_TNT, ID_EMPL);
alter table RHN_SYS_STAFF_ASSIGN add constraint FK_SYS_STAFF_ASSI_SYS_POS_ASSI foreign key (ID_TNT, ID_POS) references RHN_SYS_POS(ID_TNT, ID_POS);
alter table RHN_SYS_STAFF_ASSIGN add constraint FK_SYS_STAFF_ASSI_SYS_DEPT_ASS foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SYS_SVC_RSRC add constraint FK_SYS_SVC_RSRC_SYS_TNT_SCHED_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_SVC_RSRC add constraint FK_SYS_SVC_RSRC_SYS_ORG_SCHED_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_SVC_RSRC add constraint FK_SYS_SVC_RSRC_SYS_DEPT_SCHED foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SYS_SVC_RSRC add constraint FK_SYS_SVC_RSRC_SYS_PRAC_SCHED foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_SYS_SVC_RSRC add constraint FK_SYS_SVC_RSRC_SYS_STAF_SCHED foreign key (ID_TNT, ID_STAFF_ASSIGN) references RHN_SYS_STAFF_ASSIGN(ID_TNT, ID_STAFF_ASSIGN);
alter table RHN_SYS_SVC_RSRC add constraint FK_SYS_SVC_RSRC_BD_CATAL_SCHED foreign key (ID_TNT, ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_SYS_USER_ACCT add constraint FK_SYS_USER_ACCT_SYS_TNT_USER_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_USER_ACCT add constraint FK_SYS_USER_ACCT_SYS_PRAC_USER foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_SYS_USER_ROLE_ASSIGN add constraint FK_SYS_USER_ROLE_SYS_USER_USER foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_USER_ROLE_ASSIGN add constraint FK_SYS_USER_ROLE_SYS_ACC_USER_ foreign key (ID_TNT, ID_ACC_ROLE) references RHN_SYS_ACC_ROLE(ID_TNT, ID_ACC_ROLE);
alter table RHN_SYS_USER_ROLE_ASSIGN add constraint FK_SYS_USER_ROLE_SYS_ORG_USER_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_USER_ROLE_ASSIGN add constraint FK_SYS_USER_ROLE_SYS_USER_US_1 foreign key (ID_TNT, ID_USER_GRANTED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_SYS_TNT_WORK_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_SYS_ORG_WORK_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_SYS_DEPT_WORK foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_PI_PAT_WORK_T foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_VIS_ENC_WORK_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_SYS_USER_WORK foreign key (ID_TNT, ID_USER_ASSIGNEE) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_SYS_USER_WO_1 foreign key (ID_TNT, ID_USER_CLAIMED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_SYS_USER_WO_2 foreign key (ID_TNT, ID_USER_COMPLETED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_WORK_TASK add constraint FK_SYS_WORK_TASK_SYS_USER_WO_3 foreign key (ID_TNT, ID_USER_CREATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_SYS_WORK_TASK_HIST add constraint FK_SYS_WORK_TASK_SYS_TNT_WOR_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_SYS_WORK_TASK_HIST add constraint FK_SYS_WORK_TASK_SYS_WORK_WORK foreign key (ID_TNT, ID_WORK_TASK) references RHN_SYS_WORK_TASK(ID_TNT, ID_WORK_TASK);
alter table RHN_SYS_WORK_TASK_HIST add constraint FK_SYS_WORK_TASK_SYS_USER_WO_4 foreign key (ID_TNT, ID_USER_ACTOR) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_SYS_TNT_ALLE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_PI_PAT_ALLER foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_VIS_ENC_ALLE foreign key (ID_TNT, ID_PAT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_PAT, ID_ENC);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_SYS_PRAC_ALL foreign key (ID_TNT, ID_PRACT_RECORDER) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_SYS_USER_ALL foreign key (ID_TNT, ID_USER_RECORDER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_SYS_PRAC_A_1 foreign key (ID_TNT, ID_PRACT_VERIFIER) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_SYS_USER_A_1 foreign key (ID_TNT, ID_USER_INACTIVATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_CARE_EPISODE add constraint FK_VIS_CARE_EPISO_SYS_TNT_CARE foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_CARE_EPISODE add constraint FK_VIS_CARE_EPISO_PI_PAT_CARE_ foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_CARE_EPISODE add constraint FK_VIS_CARE_EPISO_SYS_ORG_CARE foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_CLIN_DOC add constraint FK_VIS_CLIN_DOC_PI_PAT_CLINICA foreign key (ID_PAT) references RHN_PI_PAT(ID_PAT);
alter table RHN_VIS_CLIN_DOC add constraint FK_VIS_CLIN_DOC_VIS_ENC_CLINIC foreign key (ID_ENC) references RHN_VIS_ENC(ID_ENC);
alter table RHN_VIS_CLIN_DOC add constraint FK_VIS_CLIN_DOC_SYS_TNT_CLINIC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_CLIN_DOC add constraint FK_VIS_CLIN_DOC_PI_PAT_CLINI_1 foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_CLIN_DOC add constraint FK_VIS_CLIN_DOC_VIS_ENC_CLIN_1 foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_CLIN_DOC add constraint FK_VIS_CLIN_DOC_SYS_ORG_CLINIC foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_CLIN_DOC_VER add constraint FK_VIS_CLIN_DOC_V_VIS_CLIN_DOC foreign key (ID_CLIN_DOC) references RHN_VIS_CLIN_DOC(ID_CLIN_DOC);
alter table RHN_VIS_CLIN_DOC_VER add constraint FK_VIS_CLIN_DOC_V_SYS_TNT_CLIN foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_CLIN_DOC_VER add constraint FK_VIS_CLIN_DOC_V_VIS_CLIN_D_1 foreign key (ID_TNT, ID_CLIN_DOC) references RHN_VIS_CLIN_DOC(ID_TNT, ID_CLIN_DOC);
alter table RHN_VIS_CLIN_DOC_VER add constraint FK_VIS_CLIN_DOC_V_AUD_CRYP_DOC foreign key (ID_TNT, ID_CRYPTO_EVID_INTEGRITY) references RHN_AUD_CRYPTO_EVID(ID_TNT, ID_CRYPTO_EVID);
alter table RHN_VIS_CLIN_DOC_VER add constraint FK_VIS_CLIN_DOC_V_AUD_CRYP_D_1 foreign key (ID_TNT, ID_CRYPTO_EVID_SIGN) references RHN_AUD_CRYPTO_EVID(ID_TNT, ID_CRYPTO_EVID);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_SYS_TNT_CRIT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_SYS_ORG_CRIT foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_SYS_DEPT_CRI foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_EX_DIAG_CRIT foreign key (ID_TNT, ID_DIAG_REPORT) references RHN_EX_DIAG_REPORT(ID_TNT, ID_DIAG_REPORT);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_VIS_OBS_CRIT foreign key (ID_TNT, ID_OBS) references RHN_VIS_OBS(ID_TNT, ID_OBS);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_PI_PAT_CRITI foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_VIS_ENC_CRIT foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_EX_CARE_CRIT foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_CARE_REQ(ID_TNT, ID_CARE_REQ);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_SYS_USER_CRI foreign key (ID_TNT, ID_USER_RECIPIENT) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_SYS_USER_C_1 foreign key (ID_TNT, ID_USER_ACKNOWLEDGED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_SYS_USER_C_2 foreign key (ID_TNT, ID_USER_CLOSED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_CRIT_VAL_ALERT add constraint FK_VIS_CRIT_VAL_A_EX_DIAG_CR_1 foreign key (ID_TNT, ID_DIAG_REPORT_SUPERSEDED) references RHN_EX_DIAG_REPORT(ID_TNT, ID_DIAG_REPORT);
alter table RHN_VIS_CRIT_VAL_ALERT_EVT add constraint FK_VIS_CRIT_VAL_A_SYS_TNT_CR_1 foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_CRIT_VAL_ALERT_EVT add constraint FK_VIS_CRIT_VAL_A_VIS_CRIT_CRI foreign key (ID_TNT, ID_CRIT_VAL_ALERT) references RHN_VIS_CRIT_VAL_ALERT(ID_TNT, ID_CRIT_VAL_ALERT);
alter table RHN_VIS_CRIT_VAL_ALERT_EVT add constraint FK_VIS_CRIT_VAL_A_SYS_USER_C_3 foreign key (ID_TNT, ID_USER_ACTOR) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_PI_PAT_ENCOUNTER_RE foreign key (ID_PAT) references RHN_PI_PAT(ID_PAT);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_SYS_TNT_ENCOUNTER_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_PI_PAT_ENCOUNTER__1 foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_SYS_ORG_ENCOUNTER_O foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_SC_PAT_R_ENCOUNTER_ foreign key (ID_TNT, ID_PAT_REG) references RHN_SC_PAT_REG(ID_TNT, ID_PAT_REG);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_SC_SVC_S_ENCOUNTER_ foreign key (ID_TNT, ID_SVC_SCHED) references RHN_SC_SVC_SCHED(ID_TNT, ID_SVC_SCHED);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_SC_APPT_ENCOUNTER_A foreign key (ID_TNT, ID_APPT) references RHN_SC_APPT(ID_TNT, ID_APPT);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_VIS_CARE_ENC_CARE_E foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_ENC add constraint FK_VIS_ENC_VIS_SVC_ENC_SERVICE foreign key (ID_TNT, ID_SVC_LOC) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_ENC_COMP_CHECK add constraint FK_VIS_ENC_COMP_C_SYS_TNT_ENC_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_COMP_CHECK add constraint FK_VIS_ENC_COMP_C_VIS_ENC_ENC_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_ENC_COMP_CHECK add constraint FK_VIS_ENC_COMP_C_SYS_PRAC_ENC foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_VIS_ENC_COMP_CHECK add constraint FK_VIS_ENC_COMP_C_SYS_USER_ENC foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ENC_COMP_ISSUE add constraint FK_VIS_ENC_COMP_I_SYS_TNT_ENC_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_COMP_ISSUE add constraint FK_VIS_ENC_COMP_I_VIS_ENC_ENC_ foreign key (ID_TNT, ID_ENC_COMP_CHECK) references RHN_VIS_ENC_COMP_CHECK(ID_TNT, ID_ENC_COMP_CHECK);
alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_VIS_ENC_DIAGNO foreign key (ID_ENC) references RHN_VIS_ENC(ID_ENC);
alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_SYS_TNT_DIAGNO foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_VIS_ENC_DIAG_1 foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_SYS_USER_ENC_D foreign key (ID_TNT, ID_USER_UPDATED) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_BD_CONCE_ENC_D foreign key (ID_CONCEPT) references RHN_BD_CONCEPT(ID_CONCEPT);
alter table RHN_VIS_ENC_DIAG_REV add constraint FK_VIS_ENC_DIAG_R_SYS_TNT_ENC_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_DIAG_REV add constraint FK_VIS_ENC_DIAG_R_VIS_ENC_ENC_ foreign key (ID_TNT, ID_ENC_DIAG) references RHN_VIS_ENC_DIAG(ID_TNT, ID_ENC_DIAG);
alter table RHN_VIS_ENC_DIAG_REV add constraint FK_VIS_ENC_DIAG_R_VIS_ENC_EN_1 foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_ENC_DIAG_REV add constraint FK_VIS_ENC_DIAG_R_SYS_PRAC_ENC foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_VIS_ENC_DIAG_REV add constraint FK_VIS_ENC_DIAG_R_SYS_USER_ENC foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ENC_IDENT_CHECK add constraint FK_VIS_ENC_IDENT_SYS_TNT_ENC_I foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_IDENT_CHECK add constraint FK_VIS_ENC_IDENT_PI_PAT_ENC_ID foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_ENC_IDENT_CHECK add constraint FK_VIS_ENC_IDENT_VIS_ENC_ENC_I foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_ENC_IDENT_CHECK add constraint FK_VIS_ENC_IDENT_SYS_PRAC_ENC_ foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_VIS_ENC_IDENT_CHECK add constraint FK_VIS_ENC_IDENT_SYS_USER_ENC_ foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ENC_LOC_HIST add constraint FK_VIS_ENC_LOC_HI_SYS_TNT_ENC_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_LOC_HIST add constraint FK_VIS_ENC_LOC_HI_VIS_ENC_ENC_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_ENC_LOC_HIST add constraint FK_VIS_ENC_LOC_HI_VIS_SVC_ENC_ foreign key (ID_TNT, ID_SVC_LOC) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_ENC_STATUS_EVT add constraint FK_VIS_ENC_STATUS_SYS_TNT_ENC_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_STATUS_EVT add constraint FK_VIS_ENC_STATUS_VIS_ENC_ENC_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_ENC_STATUS_EVT add constraint FK_VIS_ENC_STATUS_SYS_PRAC_ENC foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_VIS_ENC_STATUS_EVT add constraint FK_VIS_ENC_STATUS_SYS_USER_ENC foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_ENC_STATUS_EVT add constraint FK_VIS_ENC_STATUS_SYS_ORG_ENC_ foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_ENC_STATUS_EVT add constraint FK_VIS_ENC_STATUS_SYS_DEPT_ENC foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_VIS_ENC_WORK_SESSION add constraint FK_VIS_ENC_WORK_S_SYS_TNT_ENC_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_ENC_WORK_SESSION add constraint FK_VIS_ENC_WORK_S_VIS_ENC_ENC_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_ENC_WORK_SESSION add constraint FK_VIS_ENC_WORK_S_SYS_PRAC_ENC foreign key (ID_TNT, ID_PRACT) references RHN_SYS_PRACT(ID_TNT, ID_PRACT);
alter table RHN_VIS_ENC_WORK_SESSION add constraint FK_VIS_ENC_WORK_S_SYS_USER_ENC foreign key (ID_TNT, ID_USER) references RHN_SYS_USER_ACCT(ID_TNT, ID_USER);
alter table RHN_VIS_HEALTH_EVT add constraint FK_VIS_HEALTH_EVT_PI_PAT_HEALT foreign key (ID_PAT) references RHN_PI_PAT(ID_PAT);
alter table RHN_VIS_HEALTH_EVT add constraint FK_VIS_HEALTH_EVT_SYS_TNT_HEAL foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_HEALTH_EVT add constraint FK_VIS_HEALTH_EVT_PI_PAT_HEA_1 foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_HEALTH_EVT add constraint FK_VIS_HEALTH_EVT_VIS_ENC_HEAL foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_BED_DAY_FACT add constraint FK_VIS_INP_BED_DA_SYS_TNT_IP_B foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_BED_DAY_FACT add constraint FK_VIS_INP_BED_DA_VIS_CARE_IP_ foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_BED_DAY_FACT add constraint FK_VIS_INP_BED_DA_VIS_ENC_IP_B foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_BED_DAY_FACT add constraint FK_VIS_INP_BED_DA_VIS_ENC_IP_1 foreign key (ID_TNT, ID_ENC_LOC_HIST) references RHN_VIS_ENC_LOC_HIST(ID_TNT, ID_ENC_LOC_HIST);
alter table RHN_VIS_INP_BED_DAY_FACT add constraint FK_VIS_INP_BED_DA_VIS_INP_IP_B foreign key (ID_TNT, ID_BED_LOC) references RHN_VIS_INP_BED_PROF(ID_TNT, ID_SVC_LOC_BED);
alter table RHN_VIS_INP_BED_OCCUP add constraint FK_VIS_INP_BED_OC_SYS_TNT_INP_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_BED_OCCUP add constraint FK_VIS_INP_BED_OC_VIS_INP_INP_ foreign key (ID_TNT, ID_BED_LOC) references RHN_VIS_INP_BED_PROF(ID_TNT, ID_SVC_LOC_BED);
alter table RHN_VIS_INP_BED_OCCUP add constraint FK_VIS_INP_BED_OC_VIS_CARE_INP foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_BED_OCCUP add constraint FK_VIS_INP_BED_OC_VIS_ENC_INP_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_BED_OCCUP add constraint FK_VIS_INP_BED_OC_PI_PAT_INP_O foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_INP_BED_PROF add constraint FK_VIS_INP_BED_PR_VIS_SVC_INP_ foreign key (ID_TNT, ID_SVC_LOC_BED) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_INP_BED_PROF add constraint FK_VIS_INP_BED_PR_BD_CATAL_IP_ foreign key (ID_TNT, ID_CATALOG_ITEM_CHARGE) references RHN_BD_CATALOG_ITEM(ID_TNT, ID_CATALOG_ITEM);
alter table RHN_VIS_INP_CHART_EVT add constraint FK_VIS_INP_CHART_SYS_TNT_INP_C foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_CHART_EVT add constraint FK_VIS_INP_CHART_VIS_CARE_INP_ foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_CHART_EVT add constraint FK_VIS_INP_CHART_VIS_ENC_INP_C foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_CHART_EVT add constraint FK_VIS_INP_CHART_VIS_SVC_INP_C foreign key (ID_TNT, ID_SVC_LOC_SRC) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_INP_CHART_EVT add constraint FK_VIS_INP_CHART_VIS_SVC_INP_1 foreign key (ID_TNT, ID_SVC_LOC_TARGET) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_INP_EPISODE_DETAIL add constraint FK_VIS_INP_EPISOD_VIS_CARE_INP foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_EPISODE_DETAIL add constraint FK_VIS_INP_EPISOD_VIS_SVC_INP_ foreign key (ID_TNT, ID_SVC_LOC_ADMISSION) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_INP_EPISODE_DETAIL add constraint FK_VIS_INP_EPISOD_VIS_SVC_IN_1 foreign key (ID_TNT, ID_SVC_LOC_DISCHARGE) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_INP_EVT add constraint FK_VIS_INP_EVT_SYS_TNT_INP_EVT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_EVT add constraint FK_VIS_INP_EVT_VIS_CARE_INP_EV foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_EVT add constraint FK_VIS_INP_EVT_VIS_ENC_INP_EVT foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_EVT add constraint FK_VIS_INP_EVT_VIS_SVC_INP_EVT foreign key (ID_TNT, ID_SVC_LOC_SRC) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_INP_EVT add constraint FK_VIS_INP_EVT_VIS_SVC_INP_E_1 foreign key (ID_TNT, ID_SVC_LOC_TARGET) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);
alter table RHN_VIS_INP_NURS_RECORD add constraint FK_VIS_INP_NURS_R_SYS_TNT_INR_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_NURS_RECORD add constraint FK_VIS_INP_NURS_R_SYS_DEPT_INR foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_VIS_INP_NURS_RECORD add constraint FK_VIS_INP_NURS_R_VIS_CARE_INR foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_NURS_RECORD add constraint FK_VIS_INP_NURS_R_VIS_ENC_INR_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_NURS_RECORD add constraint FK_VIS_INP_NURS_R_AUD_CRYP_INR foreign key (ID_TNT, ID_CRYPTO_EVID_INTEGRITY) references RHN_AUD_CRYPTO_EVID(ID_TNT, ID_CRYPTO_EVID);
alter table RHN_VIS_INP_OBS add constraint FK_VIS_INP_OBS_SYS_TNT_INP_OBS foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_OBS add constraint FK_VIS_INP_OBS_VIS_INP_INP_OBS foreign key (ID_TNT, ID_INP_OBS_GRP) references RHN_VIS_INP_OBS_GRP(ID_TNT, ID_INP_OBS_GRP);
alter table RHN_VIS_INP_OBS_GRP add constraint FK_VIS_INP_OBS_GR_SYS_TNT_INP_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_OBS_GRP add constraint FK_VIS_INP_OBS_GR_VIS_CARE_INP foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_OBS_GRP add constraint FK_VIS_INP_OBS_GR_VIS_ENC_INP_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_SHIFT_HANDOFF add constraint FK_VIS_INP_SHIFT_SYS_TNT_ISH_T foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_SHIFT_HANDOFF add constraint FK_VIS_INP_SHIFT_SYS_DEPT_ISH_ foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_VIS_INP_SHIFT_HANDOFF add constraint FK_VIS_INP_SHIFT_AUD_CRYP_ISH_ foreign key (ID_TNT, ID_CRYPTO_EVID_INTEGRITY) references RHN_AUD_CRYPTO_EVID(ID_TNT, ID_CRYPTO_EVID);
alter table RHN_VIS_INP_SHIFT_HANDOFF_ITEM add constraint FK_VIS_INP_SHIFT_SYS_TNT_ISHI_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_SHIFT_HANDOFF_ITEM add constraint FK_VIS_INP_SHIFT_VIS_INP_ISHI_ foreign key (ID_TNT, ID_INP_SHIFT_HANDOFF) references RHN_VIS_INP_SHIFT_HANDOFF(ID_TNT, ID_INP_SHIFT_HANDOFF);
alter table RHN_VIS_INP_SHIFT_HANDOFF_ITEM add constraint FK_VIS_INP_SHIFT_VIS_CARE_ISHI foreign key (ID_TNT, ID_CARE_EPISODE) references RHN_VIS_CARE_EPISODE(ID_TNT, ID_CARE_EPISODE);
alter table RHN_VIS_INP_SHIFT_HANDOFF_ITEM add constraint FK_VIS_INP_SHIFT_VIS_ENC_ISHI_ foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_INP_SHIFT_HANDOFF_SIGN add constraint FK_VIS_INP_SHIFT_SYS_TNT_ISHS_ foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_INP_SHIFT_HANDOFF_SIGN add constraint FK_VIS_INP_SHIFT_VIS_INP_ISHS_ foreign key (ID_TNT, ID_INP_SHIFT_HANDOFF) references RHN_VIS_INP_SHIFT_HANDOFF(ID_TNT, ID_INP_SHIFT_HANDOFF);
alter table RHN_VIS_INP_SHIFT_HANDOFF_SIGN add constraint FK_VIS_INP_SHIFT_AUD_CRYP_ISHS foreign key (ID_TNT, ID_CRYPTO_EVID_SIGN) references RHN_AUD_CRYPTO_EVID(ID_TNT, ID_CRYPTO_EVID);
alter table RHN_VIS_OBS add constraint FK_VIS_OBS_SYS_TNT_OBSERVATION foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_OBS add constraint FK_VIS_OBS_PI_PAT_OBSERVATION_ foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_OBS add constraint FK_VIS_OBS_VIS_ENC_OBSERVATION foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC);
alter table RHN_VIS_SVC_LOC add constraint FK_VIS_SVC_LOC_SYS_TNT_SRV_LOC foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT);
alter table RHN_VIS_SVC_LOC add constraint FK_VIS_SVC_LOC_SYS_ORG_SRV_LOC foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_SVC_LOC add constraint FK_VIS_SVC_LOC_SYS_DEPT_SRV_LO foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_VIS_SVC_LOC add constraint FK_VIS_SVC_LOC_VIS_SVC_SRV_LOC foreign key (ID_TNT, ID_SVC_LOC_PARENT) references RHN_VIS_SVC_LOC(ID_TNT, ID_SVC_LOC);

-- 3. Indexes
create index IDX_AI_SUGGEST_AI_SUGGESTION_E on RHN_AI_SUGGEST (ID_TNT, ID_ENC, SD_STATUS, DT_GENERATED desc);
create index IDX_AI_SUGGEST_AI_SUGGESTION_H on RHN_AI_SUGGEST (ID_TNT, ID_ENC, DT_GENERATED desc);
create index IDX_AI_SUGGEST_AI_SUGGESTION_1 on RHN_AI_SUGGEST (ID_TNT, ID_PAT, ID_ENC, DT_GENERATED desc);
create index IDX_AI_SUGGEST_AI_SUGGESTION_2 on RHN_AI_SUGGEST (ID_TNT, SD_STATUS, DT_EXPIRES);
create index IDX_AI_SUGGEST_AI_SUGGESTION_O on RHN_AI_SUGGEST (ID_TNT, ID_ORG, ID_DEPT, DT_GENERATED desc);
create index IDX_AI_SUGGEST_AI_SUGGESTION_R on RHN_AI_SUGGEST (ID_TNT, ID_PAT, DT_GENERATED desc);
create index IDX_AI_SUGGEST_AI_SUGGESTION_P on RHN_AI_SUGGEST (ID_TNT, ID_PRACT_REQUESTED, DT_GENERATED desc);
create index IDX_AI_SUGGEST_AI_SUGGESTION_U on RHN_AI_SUGGEST (ID_TNT, ID_USER_REQUESTED, DT_GENERATED desc);
create index IDX_AI_SUGGEST_EVT_AI_EVENT_TI on RHN_AI_SUGGEST_EVT (ID_TNT, ID_AI_SUGGEST, DT_OCCURRED);
create index IDX_AI_SUGGEST_EVT_AI_EVENT_TY on RHN_AI_SUGGEST_EVT (ID_TNT, SD_EVT_TYPE, DT_OCCURRED);
create index IDX_AI_SUGGEST_EVT_AI_EVENT_PR on RHN_AI_SUGGEST_EVT (ID_TNT, ID_PRACT, DT_OCCURRED);
create index IDX_AI_SUGGEST_EVT_AI_EVENT_US on RHN_AI_SUGGEST_EVT (ID_TNT, ID_USER, DT_OCCURRED);
create index IDX_ANL_PRES_METRI_PRESENCE_ME on RHN_ANL_PRES_METRIC_SAMPLE (ID_TNT, CD_SCOPE_KEY, DT_BUCKET);
create index IDX_ANL_PRES_METRI_PRESENCE__1 on RHN_ANL_PRES_METRIC_SAMPLE (DT_BUCKET);
create index IDX_AUD_CRYPTO_EVI_CRYPTO_EVID on RHN_AUD_CRYPTO_EVID (ID_TNT, SD_TARGET_TYPE, ID_TARGET, DT_RECORDED, ID_CRYPTO_EVID);
create index IDX_AUD_CRYPTO_EVI_CRYPTO_EV_1 on RHN_AUD_CRYPTO_EVID (ID_TNT, ID_SIGNER_SUBJECT, DT_SIGNED);
create index IDX_AUD_CRYPTO_EVI_CRYPTO_EV_2 on RHN_AUD_CRYPTO_EVID (CD_PROVIDER, ID_KEY, DT_SIGNED);
create index IDX_AUD_IAM_AUTH_E_IAM_EVENT_T on RHN_AUD_IAM_AUTH_EVT (ID_TNT, SD_TARGET_TYPE, ID_TARGET, DT_OCCURRED);
create index IDX_AUD_LOG_AUDIT_TENANT_TIME on RHN_AUD_LOG (ID_TNT, DT_OCCURRED desc);
create index IDX_BD_CATALOG_CHG_CATALOG_CHA on RHN_BD_CATALOG_CHG_BATCH (ID_TNT, DT_CREATED, SD_STATUS);
create index IDX_BD_CATALOG_CHG_CATALOG_C_1 on RHN_BD_CATALOG_CHG_ROW (ID_TNT, ID_CATALOG_CHG_BATCH, SD_STATUS, CD_ROW_NUMBER);
create index IDX_BD_CATALOG_ITE_CATALOG_ITE on RHN_BD_CATALOG_ITEM (ID_TNT, SD_ITEM_TYPE, SD_STATUS, NA_CATALOG_ITEM);
create index IDX_BD_CATALOG_ITE_CATALOG_I_1 on RHN_BD_CATALOG_ITEM (ID_TNT, ID_ITEM_TYPE, SD_STATUS, NA_CATALOG_ITEM);
create index IDX_BD_CATALOG_PRI_CATALOG_PRI on RHN_BD_CATALOG_PRICE (ID_TNT, ID_ORG, SD_STATUS, DA_VALID_FROM);
create index IDX_BD_CATALOG_PRI_CATALOG_P_1 on RHN_BD_CATALOG_PRICE (ID_TNT, ID_CATALOG_PRICE_REPLACES);
create index IDX_BD_CONCEPT_CONCEPT_DISPLAY on RHN_BD_CONCEPT (ID_CODE_SYSTEM, NA_DISPLAY);
create index IDX_BD_CONCEPT_CONCEPT_TYPE_SE on RHN_BD_CONCEPT (ID_CODE_SYSTEM, SD_CONCEPT_TYPE, SD_STATUS, NA_DISPLAY);
create index IDX_BD_CONCEPT_ALI_CONCEPT_ALI on RHN_BD_CONCEPT_ALIAS (NA_ALIAS, SD_STATUS);
create index IDX_BD_DICT_ATTR_D_DICT_ATTR_D on RHN_BD_DICT_ATTR_DEF (ID_DICT_DEF_DICT, SD_STATUS, NA_DICT_ATTR_DEF);
create index IDX_BD_DICT_ATTR_D_DICT_ATTR_R on RHN_BD_DICT_ATTR_DEF (ID_DICT_DEF_REFERENCE_DICT, SD_STATUS);
create index IDX_BD_DICT_CAT_DICTIONARY_CAT on RHN_BD_DICT_CAT (CD_SCOPE, ID_DICT_CAT_PARENT, SN_SORT, NA_DICT_CAT);
create index IDX_BD_DICT_CAT_DICTIONARY_C_1 on RHN_BD_DICT_CAT (CD_SCOPE, SD_STATUS);
create index IDX_BD_DICT_CHG_DICTIONARY_CHA on RHN_BD_DICT_CHG (ID_DICT_DEF_DICT, DT_CHANGED);
create index IDX_BD_DICT_CHG_DICTIONARY_C_1 on RHN_BD_DICT_CHG (ID_TNT, DT_CHANGED);
create index IDX_BD_DICT_CHG_DICTIONARY_C_2 on RHN_BD_DICT_CHG (ID_DICT_CAT, DT_CHANGED);
create index IDX_BD_DICT_CHG_DICTIONARY_C_3 on RHN_BD_DICT_CHG (CD_REQ);
create index IDX_BD_DICT_CHG_DICTIONARY_C_4 on RHN_BD_DICT_CHG (ID_DICT_ATTR_DEF, DT_CHANGED);
create index IDX_BD_DICT_DEF_DICTIONARY_DEF on RHN_BD_DICT_DEF (SD_SCOPE_TYPE, ID_TNT);
create index IDX_BD_DICT_DEF_DICTIONARY_D_1 on RHN_BD_DICT_DEF (ID_TNT, SD_STATUS);
create index IDX_BD_DICT_DEF_DICTIONARY_D_2 on RHN_BD_DICT_DEF (ID_DICT_CAT, SD_STATUS, NA_DICT_DEF);
create index IDX_BD_DICT_ITEM_DICTIONARY_IT on RHN_BD_DICT_ITEM (ID_DICT_DEF_DICT, SN_SORT, CD_DICT_ITEM);
create index IDX_BD_DICT_ITEM_A_DICT_ITEM_A on RHN_BD_DICT_ITEM_ATTR_VAL (ID_DICT_ATTR_DEF, CD_SCOPE, SD_STATUS);
create index IDX_BD_DICT_ITEM_A_DICT_ITEM_1 on RHN_BD_DICT_ITEM_ATTR_VAL (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS);
create index IDX_BD_DICT_ITEM_A_DICT_ITEM_2 on RHN_BD_DICT_ITEM_ATTR_VAL (ID_DICT_ITEM_REFERENCE, ID_DICT_ATTR_DEF, CD_SCOPE, SD_STATUS);
create index IDX_BD_DICT_ITEM_A_DICT_ITEM_3 on RHN_BD_DICT_ITEM_ATTR_VAL (CODE_VALUE, ID_DICT_ATTR_DEF, CD_SCOPE, SD_STATUS);
create index IDX_BD_EXAM_SVC_EXAM_SERVICE_T on RHN_BD_EXAM_SVC (ID_TNT, SD_EXAM_TYPE, FG_BODY_SITE_REQUIRED);
create index IDX_BD_GRID_ADDR_N_GRID_ADDRES on RHN_BD_GRID_ADDR_NODE (ID_GRID_ADDR_NODE_PARENT, SN_SORT, CD_GRID_ADDR_NODE);
create index IDX_BD_GRID_ADDR_N_GRID_ADDR_1 on RHN_BD_GRID_ADDR_NODE (SD_STATUS, CD_LEVEL, CD_PINYIN);
create index IDX_BD_IMPORT_BATC_MD_IMPORT_B on RHN_BD_IMPORT_BATCH (ID_TNT, DT_CREATED, SD_STATUS);
create index IDX_BD_IMPORT_BATC_MD_IMPORT_1 on RHN_BD_IMPORT_BATCH (ID_TNT, SD_IMPORT_TYPE, HASH_FILE);
create index IDX_BD_IMPORT_ROW_MD_IMPORT_RO on RHN_BD_IMPORT_ROW (ID_TNT, ID_IMPORT_BATCH, SD_STATUS, CD_ROW_NUMBER);
create index IDX_BD_IMPORT_ROW_MD_IMPORT__1 on RHN_BD_IMPORT_ROW (ID_TNT, CD_SRC_KEY);
create index IDX_BD_ITEM_ALIAS_ITEM_ALIAS_P on RHN_BD_ITEM_ALIAS (ID_TNT, CD_PINYIN);
create index IDX_BD_ITEM_ALIAS_ITEM_ALIAS_N on RHN_BD_ITEM_ALIAS (ID_TNT, NA_ALIAS, SD_STATUS);
create index IDX_BD_ITEM_ATTR_C_ITEM_ATTR_C on RHN_BD_ITEM_ATTR_CHG (ID_ITEM_ATTR_DEF, DT_CHANGED);
create index IDX_BD_ITEM_ATTR_C_ITEM_ATTR_1 on RHN_BD_ITEM_ATTR_CHG (ID_TNT, ID_ITEM_ATTR_SUBJECT, DT_CHANGED);
create index IDX_BD_ITEM_ATTR_C_ITEM_ATTR_2 on RHN_BD_ITEM_ATTR_CHG (ID_ITEM_ATTR_OVRD, DT_CHANGED);
create index IDX_BD_ITEM_ATTR_D_ITEM_ATTR_D on RHN_BD_ITEM_ATTR_DEF (SD_VARIABILITY, SD_CONTEXT_BASIS, SD_STATUS);
create index IDX_BD_ITEM_ATTR_O_ITEM_ATTR_O on RHN_BD_ITEM_ATTR_OVRD (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, DA_VALID_FROM);
create index IDX_BD_ITEM_ATTR_O_ITEM_ATTR_1 on RHN_BD_ITEM_ATTR_OVRD (ID_TNT, ID_ITEM_ATTR_DEF, SD_SCOPE_TYPE, SD_STATUS);
create index IDX_BD_ITEM_ATTR_S_ITEM_ATTR_S on RHN_BD_ITEM_ATTR_SUBJECT (ID_ITEM_MASTER);
create index IDX_BD_ITEM_ATTR_S_ITEM_ATTR_1 on RHN_BD_ITEM_ATTR_SUBJECT (ID_TNT, ID_MED);
create index IDX_BD_ITEM_ATTR_S_ITEM_ATTR_2 on RHN_BD_ITEM_ATTR_SUBJECT (ID_TNT, ID_CATALOG_ITEM);
create index IDX_BD_ITEM_ATTR_S_ITEM_ATTR_3 on RHN_BD_ITEM_ATTR_SUBJECT (ID_TNT, ID_SVC_VAR);
create index IDX_BD_ITEM_ATTR_V_ITEM_ATTR_V on RHN_BD_ITEM_ATTR_VAL (ID_TNT, ID_ITEM_ATTR_DEF, SD_STATUS, DA_VALID_FROM);
create index IDX_BD_ITEM_GRP_ITEM_GROUP_LOO on RHN_BD_ITEM_GRP (ID_TNT, ID_ORG, ID_DEPT_EXEC, SD_GRP_TYPE, SD_STATUS);
create index IDX_BD_ITEM_GRP_ME_ITEM_GROUP_ on RHN_BD_ITEM_GRP_MEMBER (ID_TNT, ID_CATALOG_ITEM);
create index IDX_BD_ITEM_MASTER_ITEM_MASTER on RHN_BD_ITEM_MASTER (ID_ITEM_TYPE, SD_STATUS, NA_ITEM_MASTER);
create index IDX_BD_ITEM_PKG_ITEM_PACKAGE_B on RHN_BD_ITEM_PKG (ID_TNT, CD_BARCODE);
create index IDX_BD_ITEM_TERM_M_ITEM_TERM_M on RHN_BD_ITEM_TERM_MAP (ID_TNT, ID_ITEM_ATTR_SUBJECT, SD_STATUS, SD_MAP_TYPE, DA_VALID_FROM);
create index IDX_BD_ITEM_TERM_M_ITEM_TERM_1 on RHN_BD_ITEM_TERM_MAP (ID_TNT, ID_CONCEPT, SD_STATUS, DA_VALID_FROM);
create index IDX_BD_ITEM_TERM_M_ITEM_TERM_2 on RHN_BD_ITEM_TERM_MAP (ID_TNT, ID_ITEM_ATTR_SUBJECT, SD_MAP_TYPE, FG_PRIMARY_MAP, SD_STATUS, DA_VALID_FROM, DA_VALID_TO);
create index IDX_BD_ITEM_TYPE_ITEM_TYPE_PAR on RHN_BD_ITEM_TYPE (ID_ITEM_TYPE_PARENT, SN_SORT);
create index IDX_BD_ITEM_TYPE_ITEM_TYPE_SUB on RHN_BD_ITEM_TYPE (SD_SUBJECT_TYPE, SD_STATUS, SN_SORT);
create index IDX_BD_ITEM_TYPE_A_ITEM_TYPE_A on RHN_BD_ITEM_TYPE_ATTR (ID_ITEM_ATTR_DEF, SD_STATUS);
create index IDX_BD_ITEM_TYPE_A_ITEM_TYPE_1 on RHN_BD_ITEM_TYPE_ATTR (ID_ITEM_TYPE, SN_GRP_SORT, SN_ATTR_SORT);
create index IDX_BD_LAB_SVC_LAB_SERVICE_MET on RHN_BD_LAB_SVC (ID_TNT, SD_LAB_METHOD, FG_POINT_OF_CARE);
create index IDX_BD_MED_MEDICATION_SEARCH on RHN_BD_MED (ID_TNT, SD_STATUS, NA_MED, DOSE_FORM);
create index IDX_BD_MED_MEDICATION_CONFIG_T on RHN_BD_MED (ID_TNT, ID_ITEM_TYPE, SD_STATUS, NA_MED);
create index IDX_BD_MED_HERBAL_MED_HERBAL_P on RHN_BD_MED_HERBAL (ID_TNT, ID_DICT_ITEM_MEDICINAL_PART, SD_PROCESSING_METHOD);
create index IDX_BD_MED_PRODUCT_MED_PRODUCT on RHN_BD_MED_PRODUCT (ID_TNT, ID_MED, ID_MFR, CD_APPROVAL);
create index IDX_BD_MED_PRODUCT_MED_PRODU_1 on RHN_BD_MED_PRODUCT (ID_TNT, CD_TRACE);
create index IDX_BD_MED_VACCINE_MED_VACCINE on RHN_BD_MED_VACCINE (ID_TNT, SD_VACCINE_TYPE);
create index IDX_BD_MED_WESTERN_MED_WESTERN on RHN_BD_MED_WESTERN (ID_TNT, SD_THERAPEUTIC_CLASS);
create index IDX_BD_MFR_MANUFACTURER_NAME on RHN_BD_MFR (ID_TNT, NA_MFR, SD_STATUS);
create index IDX_BD_ORDER_FREQ_ORDER_FREQ_L on RHN_BD_ORDER_FREQ (ID_TNT, SD_STATUS, SN_SORT, NA_ORDER_FREQ);
create index IDX_BD_ORDER_FREQ_ORDER_FREQ_C on RHN_BD_ORDER_FREQ_CFG (ID_TNT, ID_ORG, ID_DEPT, ID_ORDER_FREQ, SD_STATUS, DA_VALID_FROM);
create index IDX_BD_ORG_CATALOG_ORG_ITEM_LO on RHN_BD_ORG_CATALOG_ITEM (ID_TNT, ID_ORG, SD_STATUS, ID_CATALOG_ITEM);
create index IDX_BD_ORG_CATALOG_ORG_ITEM_RE on RHN_BD_ORG_CATALOG_ITEM (ID_TNT, ID_ORG_CATALOG_ITEM_REPLACED);
create index IDX_BD_ORG_CONCEPT_ORG_CONCEPT on RHN_BD_ORG_CONCEPT (ID_TNT, ID_ORG, SD_STATUS, FG_SELECTABLE, ID_CONCEPT);
create index IDX_BD_SUPPLY_ITEM_SUPPLY_REGI on RHN_BD_SUPPLY_ITEM (ID_TNT, CD_REG);
create index IDX_BD_SUPPLY_ITEM_SUPPLY_GENE on RHN_BD_SUPPLY_ITEM (ID_TNT, CD_GENERIC, NA_GENERIC);
create index IDX_BD_SVC_ITEM_SERVICE_ITEM_T on RHN_BD_SVC_ITEM (ID_TNT, SD_SVC_TYPE, SD_SVC_SUBTYPE);
create index IDX_BD_SVC_VAR_SERVICE_VARIANT on RHN_BD_SVC_VAR (ID_TNT, ID_CONCEPT_BODY_SITE, SD_METHOD_TYPE, SD_STATUS);
create index IDX_BD_UNIT_CONV_UNIT_CONVERSI on RHN_BD_UNIT_CONV (ID_TNT, CD_SCOPE, ID_UNIT_DEF_FROM_UNIT, ID_UNIT_DEF_TO_UNIT, SD_STATUS, DA_VALID_FROM);
create index IDX_BD_UNIT_DEF_UNIT_LOOKUP on RHN_BD_UNIT_DEF (ID_TNT, DIMENSION, SD_STATUS, NA_UNIT_DEF);
create index IDX_BIL_CASHIER_CL_CASH_CLOSE_ on RHN_BIL_CASHIER_CLOSE (ID_TNT, ID_ORG, ID_CASHIER_USER, CD_TERMINAL, SD_STATUS, DT_RANGE_TO);
create index IDX_BIL_CASHIER_CL_CASH_CLOS_1 on RHN_BIL_CASHIER_CLOSE_EVT (ID_TNT, ID_CASHIER_CLOSE, DT_OCCURRED, ID_CASHIER_CLOSE_EVT);
create index IDX_BIL_CHARGE_ITE_CHARGE_ACCO on RHN_BIL_CHARGE_ITEM (ID_TNT, ID_PAT_ACCT, DT_OCCURRED);
create index IDX_BIL_CHARGE_ITE_CHARGE_ENCO on RHN_BIL_CHARGE_ITEM (ID_TNT, ID_ENC, DT_OCCURRED);
create index IDX_BIL_CHARGE_ITE_CHARGE_REQU on RHN_BIL_CHARGE_ITEM (ID_TNT, ID_CARE_REQ);
create index IDX_BIL_INVOICE_INVOICE_ACCOUN on RHN_BIL_INVOICE (ID_TNT, ID_PAT_ACCT, DT_ISSUED);
create index IDX_BIL_INVOICE_LI_INVOICE_LIN on RHN_BIL_INVOICE_LINE (ID_TNT, ID_CHARGE_ITEM);
create index IDX_BIL_LEDGER_ENT_LEDGER_ACCO on RHN_BIL_LEDGER_ENTRY (ID_TNT, ID_PAT_ACCT, DT_OCCURRED, ID_LEDGER_ENTRY);
create unique index IDX_BIL_LEDGER_ENT_UK_LEDGER_C on RHN_BIL_LEDGER_ENTRY (ID_TNT, ID_CLAIM_RESP, SD_ENTRY_TYPE);
create index IDX_BIL_LEDGER_ENT_LEDGER_CLAI on RHN_BIL_LEDGER_ENTRY (ID_TNT, ID_CLAIM_RESP);
create index IDX_BIL_PAT_ACCT_PAT_ACCT_RESI on RHN_BIL_PAT_ACCT (ID_TNT, ID_PAT, SD_STATUS, DT_OPENED);
create index IDX_BIL_PAT_ACCT_PAT_ACCT_ORG on RHN_BIL_PAT_ACCT (ID_TNT, ID_ORG, DT_OPENED);
create index IDX_BIL_PAY_PAYMENT_ACCOUNT on RHN_BIL_PAY (ID_TNT, ID_PAT_ACCT, DT_PAID);
create index IDX_BIL_PAY_PAYMENT_INVOICE on RHN_BIL_PAY (ID_TNT, ID_INVOICE, DT_PAID);
create index IDX_BIL_PAY_EVT_PAY_EVENT_ORDE on RHN_BIL_PAY_EVT (ID_TNT, ID_PAY_ORDER, DT_OCCURRED, ID_PAY_EVT);
create index IDX_BIL_PAY_EVT_PAY_EVENT_EXTE on RHN_BIL_PAY_EVT (ID_TNT, CD_EXT_TXN_NO);
create index IDX_BIL_PAY_ORDER_PAY_ORDER_IN on RHN_BIL_PAY_ORDER (ID_TNT, ID_INVOICE, SD_STATUS, DT_CREATED);
create index IDX_BIL_PAY_ORDER_PAY_ORDER_AC on RHN_BIL_PAY_ORDER (ID_TNT, ID_PAT_ACCT, DT_CREATED);
create index IDX_BIL_PAY_ORDER_PAY_ORDER_EX on RHN_BIL_PAY_ORDER (ID_TNT, CD_PAY_METHOD, CD_EXT_ORDER_NO);
create index IDX_BIL_PAY_ORDER_PAY_ORDER_OR on RHN_BIL_PAY_ORDER (ID_TNT, ID_PAY_ORIGINAL, SD_STATUS, DT_CREATED);
create index IDX_BIL_RCPT_RECEIPT_SETTLEMEN on RHN_BIL_RCPT (ID_TNT, ID_STL, SD_STATUS, DT_CREATED);
create index IDX_BIL_RCPT_RECEIPT_WORKLIST on RHN_BIL_RCPT (ID_TNT, SD_STATUS, DT_UPDATED, ID_RCPT);
create index IDX_BIL_RCPT_RECEIPT_REVERSE on RHN_BIL_RCPT (ID_TNT, ID_RCPT_REVERSES);
create unique index IDX_BIL_RCPT_UK_RECEIPT_EXTERN on RHN_BIL_RCPT (ID_TNT, CD_FISCAL_AUTHORITY, CD_EXT_RCPT_NO);
create unique index IDX_BIL_RCPT_UK_RECEIPT_SINGLE on RHN_BIL_RCPT (ID_TNT, ID_RCPT_REVERSES);
create index IDX_BIL_RCPT_EVT_RECEIPT_EVENT on RHN_BIL_RCPT_EVT (ID_TNT, ID_RCPT, DT_OCCURRED, ID_RCPT_EVT);
create index IDX_BIL_RCPT_EVT_RECEIPT_EVE_1 on RHN_BIL_RCPT_EVT (ID_TNT, ID_EXT_MSG);
create index IDX_BIL_RECON_BATC_RECON_BATCH on RHN_BIL_RECON_BATCH (ID_TNT, ID_ORG, SD_STATUS, DA_BUSINESS, CD_SRC);
create index IDX_BIL_RECON_ITEM_RECON_ITEM_ on RHN_BIL_RECON_ITEM (ID_TNT, ID_RECON_BATCH, SD_STATUS, SD_MATCH_TYPE);
create index IDX_BIL_RECON_ITEM_RECON_ITE_1 on RHN_BIL_RECON_ITEM (ID_TNT, CD_EXT_TXN_NO);
create index IDX_BIL_RECON_ITEM_RECON_EVENT on RHN_BIL_RECON_ITEM_EVT (ID_TNT, ID_RECON_ITEM, DT_OCCURRED, ID_RECON_ITEM_EVT);
create index IDX_BIL_REG_BIL_IN_REG_BILL_ST on RHN_BIL_REG_BIL_INTENT (ID_TNT, SD_STATUS, DT_EXPIRES, DT_CREATED);
create index IDX_BIL_REG_BIL_IN_REG_BILL_RE on RHN_BIL_REG_BIL_INTENT (ID_TNT, ID_PAT, DT_CREATED);
create index IDX_BIL_REG_BIL_IN_REG_BILL_CO on RHN_BIL_REG_BIL_INTENT (ID_TNT, ID_ORG, ID_DEPT, DT_CREATED);
create index IDX_BIL_REG_BIL_IN_REG_BILL_AP on RHN_BIL_REG_BIL_INTENT (ID_TNT, ID_APPT, SD_STATUS, DT_CREATED);
create index IDX_BIL_REG_BIL_IN_REG_BILL__1 on RHN_BIL_REG_BIL_INTENT (ID_TNT, ID_PAT_COVER, SD_STATUS, DT_CREATED);
create index IDX_BIL_STL_SETTLEMENT_ACCOUNT on RHN_BIL_STL (ID_TNT, ID_PAT_ACCT, SD_STATUS, DT_CREATED);
create index IDX_BIL_STL_SETTLEMENT_REVERSE on RHN_BIL_STL (ID_TNT, ID_STL_REVERSES);
create index IDX_BIL_STL_EVT_STL_EVENT_TIME on RHN_BIL_STL_EVT (ID_TNT, ID_STL, DT_OCCURRED, ID_STL_EVT);
create index IDX_BIL_STL_LINE_STL_LINE_CHAR on RHN_BIL_STL_LINE (ID_TNT, ID_CHARGE_ITEM);
create index IDX_BIL_STL_TENDER_STL_TENDER_ on RHN_BIL_STL_TENDER (ID_TNT, ID_STL, SN_LINE);
create index IDX_BIL_STL_TENDER_STL_TENDE_1 on RHN_BIL_STL_TENDER (ID_TNT, ID_CLAIM_RESP);
create index IDX_EX_CARE_REQ_CARE_REQUEST_E on RHN_EX_CARE_REQ (ID_TNT, ID_ENC, SD_STATUS, DT_AUTHORED);
create index IDX_EX_CARE_REQ_CARE_REQUEST_C on RHN_EX_CARE_REQ (ID_TNT, ID_CATALOG_ITEM, DA_BUSINESS);
create index IDX_EX_CARE_REQ_CARE_REQUEST_G on RHN_EX_CARE_REQ (ID_TNT, ID_REQ_GRP, SD_STATUS);
create index IDX_EX_CARE_REQ_CARE_REQUEST_P on RHN_EX_CARE_REQ (ID_TNT, ID_CARE_REQ_PARENT, DT_AUTHORED);
create index IDX_EX_DIAG_EXEC_T_DIAG_TASK_W on RHN_EX_DIAG_EXEC_TASK (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, DT_CREATED);
create index IDX_EX_DIAG_EXEC_T_DIAG_TASK_E on RHN_EX_DIAG_EXEC_TASK (ID_TNT, ID_ENC, DT_CREATED);
create index IDX_EX_DIAG_REPORT_DIAGNOSTIC_ on RHN_EX_DIAG_REPORT (ID_TNT, ID_CARE_REQ, SN_REPORT_VER);
create index IDX_EX_DIAG_REPORT_DIAGNOSTI_1 on RHN_EX_DIAG_REPORT (ID_TNT, ID_ENC, DT_ISSUED);
create index IDX_EX_EXAM_ATTACH_EXAM_ATTACH on RHN_EX_EXAM_ATTACH_ITEM (ID_TNT, ID_CATALOG_ITEM, SD_STATUS, SN_SORT);
create index IDX_EX_INP_ORDER_E_IP_EVT_REQU on RHN_EX_INP_ORDER_EVT (ID_TNT, ID_CARE_REQ, DT_OCCURRED);
create index IDX_EX_INP_ORDER_T_IP_TASK_WOR on RHN_EX_INP_ORDER_TASK (ID_TNT, SD_STATUS, DT_SCHEDULED);
create index IDX_EX_INP_ORDER_W_IP_WF_EPISO on RHN_EX_INP_ORDER_WF (ID_TNT, ID_CARE_EPISODE, SD_WF_STATUS);
create index IDX_EX_LAB_SVC_SPE_LAB_SPECIME on RHN_EX_LAB_SVC_SPEC (ID_TNT, ID_DICT_ITEM_SPEC, SD_STATUS);
create index IDX_EX_LAB_SVC_SPE_LAB_TUBE_GR on RHN_EX_LAB_SVC_SPEC (ID_TNT, CD_TUBE_GRP, SD_STATUS);
create index IDX_EX_MED_REQ_MED_REQUEST_MED on RHN_EX_MED_REQ (ID_TNT, ID_MED);
create index IDX_EX_MED_REQ_MEDICATION_REQU on RHN_EX_MED_REQ (ID_TNT, CD_ADMIN_GRP_NO);
create index IDX_EX_OP_REFER_EV_REF_EVT_REQ on RHN_EX_OP_REFER_EVT (ID_TNT, ID_OP_REFER_REQ, DT_OCCURRED);
create index IDX_EX_OP_REFER_RE_REF_REQ_SOU on RHN_EX_OP_REFER_REQ (ID_TNT, ID_ENC, SD_STATUS, DT_REQUESTED);
create index IDX_EX_OP_REFER_RE_REF_REQ_INB on RHN_EX_OP_REFER_REQ (ID_TNT, ID_ORG_TARGET, ID_DEPT_TARGET, SD_STATUS, DT_REQUESTED);
create index IDX_EX_REQ_GRP_REQUEST_GROUP_E on RHN_EX_REQ_GRP (ID_TNT, ID_ENC, SD_GRP_TYPE, DT_AUTHORED);
create index IDX_EX_SKIN_TEST_E_SKIN_TEST_W on RHN_EX_SKIN_TEST_EVT (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, DT_STARTED);
create index IDX_EX_SKIN_TEST_E_SKIN_TEST_E on RHN_EX_SKIN_TEST_EVT (ID_TNT, ID_ENC, DT_STARTED);
create index IDX_EX_TREAT_EXEC_TREAT_ITEM_T on RHN_EX_TREAT_EXEC_ITEM (ID_TNT, ID_TREAT_EXEC_TASK, DT_CREATED);
create index IDX_EX_TREAT_EXEC_TREAT_TASK_W on RHN_EX_TREAT_EXEC_TASK (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, DT_CREATED);
create index IDX_EX_TREAT_EXEC_TREAT_TASK_E on RHN_EX_TREAT_EXEC_TASK (ID_TNT, ID_ENC, DT_CREATED);
create index IDX_HPL_CARE_TASK_CARE_TASK_QU on RHN_HPL_CARE_TASK (ID_TNT, ID_ORG_OWNER, ID_DEPT_OWNER, SD_STATUS, DT_DUE);
create index IDX_HPL_CARE_TASK_CARE_TASK_RE on RHN_HPL_CARE_TASK (ID_TNT, ID_PAT, SD_TASK_TYPE, SD_STATUS, DT_DUE);
create index IDX_HPL_CARE_TASK_CARE_TASK_EN on RHN_HPL_CARE_TASK (ID_TNT, ID_ENC, SD_STATUS);
create index IDX_HPL_CARE_TASK_CARE_TASK_EV on RHN_HPL_CARE_TASK_EVT (ID_TNT, ID_CARE_TASK, DT_OCCURRED);
create index IDX_HPL_CARE_TASK_CARE_TASK__1 on RHN_HPL_CARE_TASK_EVT (ID_TNT, CD_RULE, CD_RULE_VER, DT_OCCURRED);
create index IDX_HPL_COND_CONDITION_RESIDEN on RHN_HPL_COND (ID_TNT, ID_PAT, SD_CLIN_STATUS, DT_RECORDED);
create index IDX_HPL_COND_CONDITION_CODE on RHN_HPL_COND (ID_TNT, CD_COND, SD_VERIFICATION_STATUS, SD_CLIN_STATUS);
create index IDX_HPL_DISEASE_MG_DISEASE_MAN on RHN_HPL_DISEASE_MGMT_MEMBER (ID_CONCEPT, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO);
create index IDX_HPL_DISEASE_MG_DISEASE_M_1 on RHN_HPL_DISEASE_MGMT_PROG (SD_SCOPE_TYPE, ID_SCOPE, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO);
create index IDX_HPL_DISEASE_MG_DISEASE_M_2 on RHN_HPL_DISEASE_MGMT_RULE (ID_DISEASE_MGMT_PROG, SD_INCLUSION_MODE);
create index IDX_INS_CLAIM_INS_CLAIM_WORKLI on RHN_INS_CLAIM (ID_TNT, SD_STATUS, DT_UPDATED, ID_INS_CLAIM);
create index IDX_INS_CLAIM_INS_CLAIM_COVERA on RHN_INS_CLAIM (ID_TNT, ID_PAT_COVER, SD_STATUS);
create unique index IDX_INS_CLAIM_UK_INS_CLAIM_EXT on RHN_INS_CLAIM (ID_TNT, CD_REGION, CD_EXT_STL_NO);
create index IDX_INS_CLAIM_LINE_INS_CLAIM_L on RHN_INS_CLAIM_LINE (ID_TNT, ID_STL_LINE);
create index IDX_INS_CLAIM_RESP_INS_RESP_CL on RHN_INS_CLAIM_RESP (ID_TNT, ID_INS_CLAIM, DT_RESPONDED, ID_CLAIM_RESP);
create index IDX_INS_CLAIM_RESP_INS_RESP_ME on RHN_INS_CLAIM_RESP (ID_TNT, ID_EXT_MSG);
create index IDX_INS_PAT_COVER_RESIDENT_COV on RHN_INS_PAT_COVER (ID_TNT, ID_PAT, SD_STATUS, FG_PRIMARY_FLAG);
create index IDX_INT_EXT_MSG_EXTERNAL_MESSA on RHN_INT_EXT_MSG (ID_TNT, ID_ORG, ID_DEPT, CD_ENDPOINT, SD_DIRECTION, SD_STATUS, DT_CREATED);
create index IDX_INT_EXT_MSG_EXTERNAL_MES_1 on RHN_INT_EXT_MSG (ID_TNT, CD_ENDPOINT, ID_CORRELATION);
create index IDX_INT_IDEMP_RECO_IDEMPOTENCY on RHN_INT_IDEMP_RECORD (DT_EXPIRES);
create index IDX_INT_OUTBOX_EVT_OUTBOX_PEND on RHN_INT_OUTBOX_EVT (SD_PUBLICATION_STATUS, DT_RECORDED);
create index IDX_INT_OUTBOX_EVT_OUTBOX_AGGR on RHN_INT_OUTBOX_EVT (ID_TNT, SD_AGGREGATE_TYPE, ID_AGGREGATE, SN_AGGREGATE_VER);
create index IDX_INT_OUTBOX_EVT_OUTBOX_DISP on RHN_INT_OUTBOX_EVT (SD_PUBLICATION_STATUS, DT_NEXT_ATTEMPT, DT_RECORDED);
create index IDX_META_OP_NOTE_F_ONFV_VISIBL on RHN_META_OP_NOTE_FORM_VER (ID_TNT, ID_ORG, ID_DEPT, CD_SPECIALTY, SD_STATUS, CD_FORM, CD_VER_NUMBER);
create index IDX_META_OP_NOTE_T_ONT_VISIBLE on RHN_META_OP_NOTE_TMPL (ID_TNT, ID_ORG, ID_DEPT, CD_SPECIALTY, SD_DOC_TYPE, SD_SCOPE_TYPE, ID_OWNER, SD_STATUS, SN_SORT);
create index IDX_META_OP_PLAN_T_OPT_VISIBLE on RHN_META_OP_PLAN_TMPL (ID_TNT, ID_ORG, ID_DEPT, SD_SCOPE_TYPE, ID_OWNER, SD_STATUS, SN_SORT);
create index IDX_META_PRINT_TMP_PRINT_TEMPL on RHN_META_PRINT_TMPL (ID_TNT, SD_DOC_TYPE, SD_STATUS, DT_UPDATED);
create index IDX_PI_PAT_RESIDENT_TENANT_NAM on RHN_PI_PAT (ID_TNT, NA_FULL);
create index IDX_PI_PAT_RESIDENT_STATUS on RHN_PI_PAT (ID_TNT, SD_STATUS, NA_FULL);
create index IDX_PI_PAT_ADDR_RESIDENT_ADDRE on RHN_PI_PAT_ADDR (ID_TNT, ID_PAT, SD_STATUS, FG_PRIMARY_FLAG);
create index IDX_PI_PAT_EMPL_RESIDENT_EMPLO on RHN_PI_PAT_EMPL (ID_TNT, ID_PAT, SD_STATUS, FG_PRIMARY_FLAG);
create index IDX_PI_PAT_IDENT_RESIDENT_IDEN on RHN_PI_PAT_IDENT (ID_TNT, ID_PAT, SD_STATUS);
create index IDX_PI_PAT_MERGE_H_RESIDENT_ME on RHN_PI_PAT_MERGE_HIST (ID_TNT, ID_PAT_SURVIVING, DT_MERGED);
create index IDX_PI_PAT_RELATED_RESIDENT_RE on RHN_PI_PAT_RELATED_PERSON (ID_TNT, ID_PAT, SD_STATUS);
create index IDX_PI_PAT_SRC_REC_SOURCE_RECO on RHN_PI_PAT_SRC_RECORD (ID_TNT, SD_MATCH_STATUS, DT_LAST_SEEN);
create index IDX_SC_APPT_APPOINTMENT_RESIDE on RHN_SC_APPT (ID_TNT, ID_PAT, DT_START, SD_STATUS);
create index IDX_SC_APPT_APPOINTMENT_SCHEDU on RHN_SC_APPT (ID_TNT, ID_SVC_SCHED, SD_STATUS, DT_START);
create index IDX_SC_APPT_APPT_SOURCE_STATUS on RHN_SC_APPT (ID_TNT, SD_BOOKING_SRC, SD_STATUS, DT_START);
create index IDX_SC_APPT_EVT_APPT_EVT_TIME on RHN_SC_APPT_EVT (ID_TNT, ID_APPT, DT_OCCURRED);
create index IDX_SC_PAT_REG_REGISTRATION_RE on RHN_SC_PAT_REG (ID_TNT, ID_PAT, DT_REGISTERED, SD_STATUS);
create index IDX_SC_PAT_REG_REGISTRATION_CO on RHN_SC_PAT_REG (ID_TNT, ID_ORG, ID_DEPT, DT_REGISTERED, SD_STATUS);
create index IDX_SC_SVC_QUEUE_SCOPE on RHN_SC_SVC_QUEUE (ID_TNT, ID_ORG, ID_DEPT, SD_SCENE, FG_ACTIVE);
create index IDX_SC_QUEUE_TICKET_WORK on RHN_SC_QUEUE_TICKET (ID_TNT, ID_SVC_QUEUE, DA_BUSINESS, SD_STATUS, DT_READY, SN_PRIORITY, SN_SEQUENCE);
create index IDX_SC_QUEUE_TICKET_PAT on RHN_SC_QUEUE_TICKET (ID_TNT, ID_PAT, DA_BUSINESS);
create index IDX_SC_QUEUE_EVT_TICKET on RHN_SC_QUEUE_TICKET_EVT (ID_TNT, ID_QUEUE_TICKET, DT_OCCURRED);
create index IDX_SC_SCHED_EXCEP_SCHED_EXCEP on RHN_SC_SCHED_EXCEPT (ID_TNT, ID_SCHED_TMPL, DA_EXCEPT);
create index IDX_SC_SCHED_GEN_R_SCHED_RUN_T on RHN_SC_SCHED_GEN_RUN (ID_TNT, ID_SCHED_TMPL, DT_STARTED);
create index IDX_SC_SCHED_SLOT_SLOT_HOLD_PO on RHN_SC_SCHED_SLOT_HOLD (ID_TNT, ID_SCHED_SLOT_POOL, SD_STATUS, DT_EXPIRES);
create index IDX_SC_SCHED_SLOT_SLOT_HOLD_RE on RHN_SC_SCHED_SLOT_HOLD (ID_TNT, ID_PAT, SD_STATUS, DT_CREATED);
create index IDX_SC_SCHED_SLOT_SLOT_HOLD_SC on RHN_SC_SCHED_SLOT_HOLD (ID_TNT, ID_SVC_SCHED, SD_STATUS, DT_EXPIRES);
create index IDX_SC_SCHED_SLOT_SLOT_HOLD__1 on RHN_SC_SCHED_SLOT_HOLD (ID_TNT, ID_PAT_REG_CONSUMED);
create index IDX_SC_SCHED_SLOT_SCHED_POOL_S on RHN_SC_SCHED_SLOT_POOL (ID_TNT, SD_STATUS, ID_SVC_SCHED);
create index IDX_SC_SCHED_TMPL_SCHED_TEMPLA on RHN_SC_SCHED_TMPL (ID_TNT, ID_SVC_RSRC, SD_STATUS, DA_VALID_FROM);
create index IDX_SC_SCHED_TMPL_SCHED_PERIOD on RHN_SC_SCHED_TMPL_PERIOD (ID_TNT, ID_SCHED_TMPL, FG_ACTIVE, SD_DAY_OF_WEEK);
create index IDX_SC_SLOT_EVT_SLOT_EVENT_TIM on RHN_SC_SLOT_EVT (ID_TNT, ID_SCHED_SLOT_POOL, DT_OCCURRED);
create index IDX_SC_SVC_SCHED_SERVICE_SCHED on RHN_SC_SVC_SCHED (ID_TNT, ID_ORG, ID_DEPT, DA_SVC, SD_STATUS, DT_START);
create index IDX_SC_SVC_SCHED_SERVICE_SCH_1 on RHN_SC_SVC_SCHED (ID_TNT, ID_PRACT, DA_SVC, DT_START);
create index IDX_SC_SVC_SCHED_SERVICE_SCH_2 on RHN_SC_SVC_SCHED (ID_TNT, ID_SCHED_GEN_RUN, DA_SVC, DT_START);
create index IDX_SC_SVC_SCHED_E_SCHED_EVENT on RHN_SC_SVC_SCHED_EVT (ID_TNT, ID_SVC_SCHED, DT_OCCURRED);
create index IDX_SUP_DISP_ROUTE_DISPENSE_RO on RHN_SUP_DISP_ROUTE (ID_TNT, ID_STOCK_SITE_TARGET, FG_ACTIVE);
create index IDX_SUP_DISP_TASK_DISPENSE_TAS on RHN_SUP_DISP_TASK (ID_TNT, ID_STOCK_SITE, SD_STATUS, SD_PRIORITY, DT_CREATED);
create index IDX_SUP_DISP_TASK_DISPENSE_T_1 on RHN_SUP_DISP_TASK (ID_TNT, ID_PAT, DT_CREATED);
create index IDX_SUP_DISP_TASK_DISPENSE_LIN on RHN_SUP_DISP_TASK_LINE (ID_TNT, ID_STOCK_ITEM, SD_STATUS);
create index IDX_SUP_DISP_TASK_DTL_REQUEST on RHN_SUP_DISP_TASK_LINE (ID_TNT, ID_CARE_REQ, SD_STATUS);
create index IDX_SUP_GOOD_RCPT_GR_WORKLIST on RHN_SUP_GOOD_RCPT (ID_TNT, ID_STOCK_SITE, SD_STATUS, DT_RECEIVED);
create index IDX_SUP_GOOD_RCPT_GR_LINE_ITEM on RHN_SUP_GOOD_RCPT_LINE (ID_TNT, ID_STOCK_ITEM, CD_LOT_NO);
create index IDX_SUP_INP_MED_CO_MED_CONS_DI on RHN_SUP_INP_MED_CONSUME (ID_TNT, ID_MED_DISP_LINE);
create index IDX_SUP_INP_MED_CO_MED_CONS_RE on RHN_SUP_INP_MED_CONSUME (ID_TNT, ID_CARE_REQ, DT_CONSUMED);
create index IDX_SUP_INP_MED_SU_IPMSB_WORKL on RHN_SUP_INP_MED_SUPPLY_BATCH (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT, SD_STATUS, DT_WINDOW_START);
create index IDX_SUP_INP_MED_SU_IPMSB_PHARM on RHN_SUP_INP_MED_SUPPLY_BATCH (ID_TNT, ID_STOCK_SITE, SD_STATUS, DT_CUTOFF);
create index IDX_SUP_INP_MED_SU_IPMSGR_DISP on RHN_SUP_INP_MED_SUPPLY_GEN_RUN (SD_STATUS, DT_NEXT_ATTEMPT, DT_CLAIMED_UNTIL, DT_CREATED);
create index IDX_SUP_INP_MED_SU_IPMSGR_SCOP on RHN_SUP_INP_MED_SUPPLY_GEN_RUN (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT, DA_BUSINESS, CD_SHIFT);
create index IDX_SUP_INP_MED_SU_IPMSL_BATCH on RHN_SUP_INP_MED_SUPPLY_LINE (ID_TNT, ID_INP_MED_SUPPLY_BATCH, SD_STATUS, ID_INP_MED_SUPPLY_LINE);
create index IDX_SUP_INP_MED_SU_IPMSL_REQUE on RHN_SUP_INP_MED_SUPPLY_LINE (ID_TNT, ID_CARE_REQ, SD_STATUS, ID_INP_MED_SUPPLY_LINE);
create index IDX_SUP_INP_MED_SU_IPMST_LINE on RHN_SUP_INP_MED_SUPPLY_TASK (ID_TNT, ID_INP_MED_SUPPLY_LINE, SD_STATUS, DT_SCHEDULED);
create index IDX_SUP_INP_MED_SU_IPMST_TASK on RHN_SUP_INP_MED_SUPPLY_TASK (ID_TNT, ID_INP_ORDER_TASK, SD_STATUS);
create index IDX_SUP_INV_BAL_INV_BAL_ITEM on RHN_SUP_INV_BAL (ID_TNT, ID_STOCK_SITE, ID_STOCK_ITEM, SD_STOCK_STATUS, DT_PROJECTED);
create index IDX_SUP_INV_DOC_EV_INV_DOC_EVE on RHN_SUP_INV_DOC_EVT (ID_TNT, SD_DOC_TYPE, ID_DOC, DT_OCCURRED);
create index IDX_SUP_INV_OPEN_P_OPEN_PKG_DI on RHN_SUP_INV_OPEN_PKG (ID_TNT, ID_STOCK_SITE, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STATUS, DT_OPENED);
create index IDX_SUP_INV_PERIOD_INV_PERIOD_ on RHN_SUP_INV_PERIOD (ID_TNT, ID_STOCK_SITE, SD_STATUS);
create unique index IDX_SUP_INV_PERIOD_UK_INV_PERI on RHN_SUP_INV_PERIOD (ID_TNT, ID_STOCK_SITE, ID_INV_PERIOD_PREVIOUS);
create index IDX_SUP_INV_PERIOD_INV_PERIO_1 on RHN_SUP_INV_PERIOD (ID_TNT, ID_STOCK_SITE, DA_PERIOD_FROM, DA_PERIOD_TO, SD_STATUS);
create unique index IDX_SUP_INV_PERIOD_UK_INV_PE_1 on RHN_SUP_INV_PERIOD (ID_TNT, ID_INV_PERIOD_CLOSE_RUN_CLOSE);
create index IDX_SUP_INV_PERIOD_INV_SNAP_PE on RHN_SUP_INV_PERIOD_BAL_SNAP (ID_TNT, ID_INV_PERIOD, ID_STOCK_ITEM, ID_STOCK_BIN, ID_STOCK_LOT);
create index IDX_SUP_INV_PERIOD_INV_SNAP_OP on RHN_SUP_INV_PERIOD_BAL_SNAP (ID_TNT, ID_INV_PERIOD_BAL_SNAP_OPENING);
create index IDX_SUP_INV_PERIOD_INV_SNAP_VA on RHN_SUP_INV_PERIOD_BAL_VAL (ID_TNT, ID_INV_PERIOD_BAL_SNAP, SD_VALUAT_BASIS);
create index IDX_SUP_INV_PERIOD_INV_CLOSE_P on RHN_SUP_INV_PERIOD_CLOSE_RUN (ID_TNT, ID_INV_PERIOD, SD_STATUS, DT_STARTED);
create index IDX_SUP_INV_PERIOD_INV_CLOSE_S on RHN_SUP_INV_PERIOD_CLOSE_RUN (ID_TNT, ID_STOCK_SITE, DT_STARTED, SD_STATUS);
create index IDX_SUP_INV_PERIOD_INV_CLOSE_T on RHN_SUP_INV_PERIOD_CLOSE_TOTAL (ID_TNT, ID_INV_PERIOD_CLOSE_RUN, SD_VALUAT_BASIS);
create index IDX_SUP_INV_PRICE_INV_PRICE_SI on RHN_SUP_INV_PRICE_ADJ (ID_TNT, ID_STOCK_SITE, DA_BUSINESS, SD_STATUS);
create index IDX_SUP_INV_PRICE_INV_PRICE_PE on RHN_SUP_INV_PRICE_ADJ (ID_TNT, ID_INV_PERIOD, SD_STATUS, DT_POSTED);
create index IDX_SUP_INV_PRICE_INV_PRICE_DE on RHN_SUP_INV_PRICE_ADJ_DETAIL (ID_TNT, ID_INV_BAL, ID_INV_PRICE_ADJ_LINE);
create index IDX_SUP_INV_PRICE_INV_PRICE_LI on RHN_SUP_INV_PRICE_ADJ_LINE (ID_TNT, ID_STOCK_ITEM, ID_INV_PRICE_ADJ);
create index IDX_SUP_INV_RECON_INV_REC_LINE on RHN_SUP_INV_RECON_LINE (ID_TNT, ID_INV_RECON_RUN, SD_SEVERITY, SD_ISSUE_TYPE);
create index IDX_SUP_INV_RECON_INV_REC_SITE on RHN_SUP_INV_RECON_RUN (ID_TNT, ID_STOCK_SITE, DT_STARTED);
create index IDX_SUP_INV_RESV_INV_RSV_REQUE on RHN_SUP_INV_RESV (ID_TNT, ID_CARE_REQ, SD_STATUS);
create index IDX_SUP_INV_RESV_INV_RSV_EXPIR on RHN_SUP_INV_RESV (ID_TNT, DT_EXPIRES, SD_STATUS);
create index IDX_SUP_INV_RESV_INV_RSV_DUE on RHN_SUP_INV_RESV (SD_STATUS, DT_EXPIRES, ID_TNT, ID_CARE_REQ);
create index IDX_SUP_INV_RESV_INV_RSV_DISP_ on RHN_SUP_INV_RESV (ID_TNT, ID_DISP_TASK_LINE, SD_STATUS);
create index IDX_SUP_INV_SPLIT_SPLIT_EVT_PA on RHN_SUP_INV_SPLIT_EVT (ID_TNT, ID_INV_OPEN_PKG, DT_OCCURRED);
create index IDX_SUP_INV_SPLIT_SPLIT_EVT_SO on RHN_SUP_INV_SPLIT_EVT (ID_TNT, SD_SRC_TYPE, ID_SRC, DT_OCCURRED);
create index IDX_SUP_INV_TRACE_TRACE_SITE_S on RHN_SUP_INV_TRACE_CODE (ID_TNT, ID_STOCK_SITE, SD_STATUS, DT_UPDATED);
create index IDX_SUP_INV_TRACE_TRACE_ITEM_L on RHN_SUP_INV_TRACE_CODE (ID_TNT, ID_STOCK_SITE, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STATUS);
create index IDX_SUP_INV_TRACE_TRACE_RECEIP on RHN_SUP_INV_TRACE_CODE (ID_TNT, ID_GOOD_RCPT_LINE, SD_STATUS);
create index IDX_SUP_INV_TRACE_TRACE_DOCUME on RHN_SUP_INV_TRACE_CODE (ID_TNT, SD_CURRENT_DOC_TYPE, ID_CURRENT_DOC);
create index IDX_SUP_INV_TRACE_TRACE_EVT_CO on RHN_SUP_INV_TRACE_EVT (ID_TNT, ID_INV_TRACE_CODE, DT_OCCURRED);
create index IDX_SUP_INV_TRACE_TRACE_EVT_DO on RHN_SUP_INV_TRACE_EVT (ID_TNT, SD_DOC_TYPE, ID_DOC, DT_OCCURRED);
create index IDX_SUP_INV_TXN_INV_TXN_SOURCE on RHN_SUP_INV_TXN (ID_TNT, SD_SRC_TYPE, CD_SRC);
create index IDX_SUP_INV_TXN_INV_TXN_PERIOD on RHN_SUP_INV_TXN (ID_TNT, ID_INV_PERIOD, DT_POSTED);
create index IDX_SUP_INV_TXN_LI_INV_LINE_BA on RHN_SUP_INV_TXN_LINE (ID_TNT, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STOCK_STATUS);
create index IDX_SUP_INV_TXN_LI_INV_LINE_IT on RHN_SUP_INV_TXN_LINE (ID_TNT, ID_STOCK_SITE, ID_STOCK_ITEM, ID_INV_TXN);
create index IDX_SUP_INV_TXN_LI_INV_LINE_RE on RHN_SUP_INV_TXN_LINE (ID_TNT, ID_STOCK_SITE, ID_STOCK_ITEM, ID_STOCK_BIN, ID_STOCK_LOT, SD_STOCK_STATUS);
create index IDX_SUP_INV_VALUAT_INV_VAL_PER on RHN_SUP_INV_VALUAT_ENTRY (ID_TNT, ID_INV_PERIOD, ID_STOCK_ITEM, DT_POSTED);
create index IDX_SUP_INV_VALUAT_INV_VAL_SOU on RHN_SUP_INV_VALUAT_ENTRY (ID_TNT, SD_SRC_TYPE, ID_SRC, DT_POSTED);
create index IDX_SUP_INV_VALUAT_INV_VAL_DIM on RHN_SUP_INV_VALUAT_ENTRY (ID_TNT, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STOCK_STATUS, DT_POSTED);
create index IDX_SUP_MED_DISP_MED_DISP_TASK on RHN_SUP_MED_DISP (ID_TNT, ID_DISP_TASK, DT_OCCURRED);
create index IDX_SUP_MED_DISP_MED_DISP_RESI on RHN_SUP_MED_DISP (ID_TNT, ID_PAT, DT_OCCURRED);
create index IDX_SUP_MED_DISP_L_MED_DISP_LI on RHN_SUP_MED_DISP_LINE (ID_TNT, ID_DISP_TASK_LINE, ID_STOCK_LOT);
create index IDX_SUP_MED_DISP_L_MED_DISP__1 on RHN_SUP_MED_DISP_LINE (ID_TNT, ID_MED_DISP_LINE_ORIGINAL);
create index IDX_SUP_PHARM_FULF_PHARM_AUTH_ on RHN_SUP_PHARM_FULFILL_AUTH (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, DT_READY);
create index IDX_SUP_PHARM_FULF_PHARM_AUT_1 on RHN_SUP_PHARM_FULFILL_AUTH (ID_TNT, ID_CARE_REQ_MED, DT_READY);
create index IDX_SUP_PHARM_FULF_PHARM_AUT_2 on RHN_SUP_PHARM_FULFILL_AUTH (ID_TNT, ID_ORG, ID_STOCK_SITE_ROUTED, SD_STATUS, DT_READY);
create index IDX_SUP_PHARM_REVI_PHARMACY_RE on RHN_SUP_PHARM_REVIEW (ID_TNT, ID_CARE_REQ, DT_REVIEWED);
create index IDX_SUP_PURCH_ORDE_PO_WORKLIST on RHN_SUP_PURCH_ORDER (ID_TNT, ID_STOCK_SITE, SD_STATUS, DA_ORDER);
create index IDX_SUP_PURCH_ORDE_PO_LINE_ITE on RHN_SUP_PURCH_ORDER_LINE (ID_TNT, ID_STOCK_ITEM, SD_LINE_STATUS);
create index IDX_SUP_STOCK_BIN_STOCK_BIN_SI on RHN_SUP_STOCK_BIN (ID_TNT, ID_STOCK_SITE, FG_ACTIVE, SN_SORT);
create index IDX_SUP_STOCK_COUN_COUNT_WORKL on RHN_SUP_STOCK_COUNT (ID_TNT, ID_STOCK_SITE, SD_STATUS, DT_SNAP);
create index IDX_SUP_STOCK_ITEM_STOCK_ITEM_ on RHN_SUP_STOCK_ITEM (ID_TNT, ID_CATALOG_ITEM, SD_STATUS);
create index IDX_SUP_STOCK_LOT_STOCK_LOT_IS on RHN_SUP_STOCK_LOT (ID_TNT, ID_CATALOG_ITEM, SD_QUALITY_STATUS, SD_STATUS, DA_EXPIRY);
create index IDX_SUP_STOCK_REQ_REQ_WORKLIST on RHN_SUP_STOCK_REQ (ID_TNT, ID_STOCK_SITE_SRC, SD_STATUS, DT_REQUESTED);
create index IDX_SUP_STOCK_RETU_STOCK_RET_S on RHN_SUP_STOCK_RETURN (ID_TNT, ID_STOCK_SITE, SD_STATUS, DT_REQUESTED);
create index IDX_SUP_STOCK_RETU_STOCK_RET_R on RHN_SUP_STOCK_RETURN (ID_TNT, ID_PAT, DT_REQUESTED);
create index IDX_SUP_STOCK_RETU_STOCK_RET_L on RHN_SUP_STOCK_RETURN_LINE (ID_TNT, ID_STOCK_ITEM, ID_STOCK_LOT);
create index IDX_SUP_STOCK_SITE_STOCK_SITE_ on RHN_SUP_STOCK_SITE (ID_TNT, ID_ORG, SD_SVC_SCOPE, FG_ACTIVE);
create index IDX_SUP_STOCK_XFER_TRANSFER_SO on RHN_SUP_STOCK_XFER (ID_TNT, ID_STOCK_SITE_SRC, SD_STATUS, DT_REQUESTED);
create index IDX_SUP_STOCK_XFER_TRANSFER_DE on RHN_SUP_STOCK_XFER (ID_TNT, ID_STOCK_SITE_DESTINATION, SD_STATUS, DT_REQUESTED);
create index IDX_SUP_SUPPL_SUPPLIER_ACTIVE on RHN_SUP_SUPPL (ID_TNT, ID_ORG, SD_STATUS, DA_LICENSE_VALID_TO);
create index IDX_SUP_SUPPL_SUPP_SUPPLIER_IT on RHN_SUP_SUPPL_SUPPLY_ITEM (ID_TNT, ID_CATALOG_ITEM, FG_PURCH, DA_VALID_TO);
create index IDX_SUP_WARD_DELIV_WD_WORKLIST on RHN_SUP_WARD_DELIV (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT, SD_STATUS, DT_CREATED);
create index IDX_SUP_WARD_DELIV_WD_SITE on RHN_SUP_WARD_DELIV (ID_TNT, ID_STOCK_SITE, SD_STATUS, DT_CREATED);
create index IDX_SUP_WARD_DELIV_WDE_DELIVER on RHN_SUP_WARD_DELIV_EVT (ID_TNT, ID_WARD_DELIV, DT_OCCURRED);
create index IDX_SUP_WARD_DELIV_WDL_ENCOUNT on RHN_SUP_WARD_DELIV_LINE (ID_TNT, ID_ENC, ID_WARD_DELIV);
create index IDX_SUP_WARD_MED_R_WMRE_REQUES on RHN_SUP_WARD_MED_RETURN_EVT (ID_TNT, ID_WARD_MED_RETURN_REQ, DT_OCCURRED);
create index IDX_SUP_WARD_MED_R_WMRL_DISP_L on RHN_SUP_WARD_MED_RETURN_LINE (ID_TNT, ID_MED_DISP_LINE_ORIGINAL, ID_WARD_MED_RETURN_REQ);
create index IDX_SUP_WARD_MED_R_WMR_WARD_WO on RHN_SUP_WARD_MED_RETURN_REQ (ID_TNT, ID_ORG, ID_DEPT_NURS_UNIT, SD_STATUS, DT_REQUESTED);
create index IDX_SUP_WARD_MED_R_WMR_PHARM_W on RHN_SUP_WARD_MED_RETURN_REQ (ID_TNT, ID_STOCK_SITE, SD_STATUS, DT_HANDED_OVER);
create index IDX_SUP_WARD_MED_R_WMR_ENCOUNT on RHN_SUP_WARD_MED_RETURN_REQ (ID_TNT, ID_ENC, DT_REQUESTED);
create index IDX_SYS_ACC_PERM_ACCESS_PERMIS on RHN_SYS_ACC_PERM (ID_TNT, ID_MGMT_MOD, SD_STATUS);
create index IDX_SYS_ANN_ANNOUNCEMENT_AUDIE on RHN_SYS_ANN (ID_TNT, SD_STATUS, SD_SCOPE_TYPE, ID_ORG, ID_DEPT, DT_PUBLISH);
create index IDX_SYS_ANN_ANNOUNCEMENT_LIFEC on RHN_SYS_ANN (SD_STATUS, DT_PUBLISH, DT_EXPIRE);
create index IDX_SYS_ANN_READ_R_ANNOUNCEMEN on RHN_SYS_ANN_READ_RCPT (ID_TNT, ID_USER, DT_READ);
create index IDX_SYS_CFG_REV_CONFIGURATION_ on RHN_SYS_CFG_REV (ID_CFG_DEF, SD_SCOPE_TYPE, ID_SCOPE, SD_STATUS, DT_EFFECTIVE_FROM);
create index IDX_SYS_CFG_REV_CONFIGURATIO_1 on RHN_SYS_CFG_REV (ID_TNT, ID_CFG_DEF, SD_SCOPE_TYPE, ID_SCOPE, SD_STATUS, DT_EFFECTIVE_FROM);
create index IDX_SYS_DEPT_DEPARTMENT_TREE on RHN_SYS_DEPT (ID_TNT, ID_ORG, ID_DEPT_PARENT, SN_SORT, CD_DEPT);
create index IDX_SYS_DEPT_DEPARTMENT_TYPE on RHN_SYS_DEPT (ID_TNT, SD_DEPT_TYPE, SD_STATUS);
create index IDX_SYS_DEPT_CAP_DEPT_CAPABILI on RHN_SYS_DEPT_CAP (ID_TNT, SD_CAP_TYPE, SD_STATUS);
create index IDX_SYS_DEPT_CONTA_DEPT_CONTAC on RHN_SYS_DEPT_CONTACT (ID_TNT, ID_DEPT, SD_STATUS, SN_SORT);
create index IDX_SYS_DEPT_REL_DEPT_RELATION on RHN_SYS_DEPT_REL (ID_TNT, ID_DEPT_TARGET, SD_REL_TYPE, SD_STATUS);
create index IDX_SYS_DEPT_RESP_DEPT_RESP_ST on RHN_SYS_DEPT_RESP (ID_TNT, ID_DEPT, SD_RESP_TYPE, SD_STATUS);
create index IDX_SYS_EMPL_EMPLOYMENT_PRACTI on RHN_SYS_EMPL (ID_TNT, ID_PRACT, SD_STATUS, FG_PRIMARY_EMPL);
create index IDX_SYS_ORG_ORGANIZATION_PAREN on RHN_SYS_ORG (ID_TNT, ID_ORG_PARENT);
create index IDX_SYS_ORG_ORGANIZATION_KIND_ on RHN_SYS_ORG (ID_TNT, SD_ORG_KIND, SD_STATUS);
create index IDX_SYS_ORG_ORGANIZATION_TREE_ on RHN_SYS_ORG (ID_TNT, ID_ORG_PARENT, SN_SORT, CD_ORG);
create index IDX_SYS_ORG_ORGANIZATION_DEPAR on RHN_SYS_ORG (ID_TNT, CD_DEPT_TYPE, SD_STATUS);
create index IDX_SYS_ORG_ADDR_ORG_ADDRESS_D on RHN_SYS_ORG_ADDR (ID_TNT, CD_DISTRICT, SD_STATUS);
create index IDX_SYS_ORG_CAP_ORG_CAPABILITY on RHN_SYS_ORG_CAP (ID_TNT, SD_CAP_TYPE, SD_STATUS);
create index IDX_SYS_ORG_CONTAC_ORG_CONTACT on RHN_SYS_ORG_CONTACT (ID_TNT, ID_ORG, SD_STATUS, SN_SORT);
create index IDX_SYS_ORG_IDENT_ORG_IDENT_OR on RHN_SYS_ORG_IDENT (ID_TNT, ID_ORG, SD_STATUS);
create index IDX_SYS_ORG_REL_ORG_RELATION_T on RHN_SYS_ORG_REL (ID_TNT, ID_ORG_TARGET, SD_REL_TYPE, SD_STATUS);
create index IDX_SYS_ORG_RESP_ORG_RESPONSIB on RHN_SYS_ORG_RESP (ID_TNT, ID_ORG, SD_RESP_TYPE, SD_STATUS);
create index IDX_SYS_PARAM_CAT_PARAMETER_CA on RHN_SYS_PARAM_CAT (ID_PARAM_CAT_PARENT, SN_SORT, NA_PARAM_CAT);
create index IDX_SYS_PARAM_CHG_PARAMETER_CH on RHN_SYS_PARAM_CHG (ID_PARAM_DEF, DT_CHANGED desc);
create index IDX_SYS_PARAM_DEF_PARAMETER_DE on RHN_SYS_PARAM_DEF (ID_PARAM_CAT, SD_STATUS, NA_PARAM_DEF);
create index IDX_SYS_PARAM_VAL_PARAMETER_VA on RHN_SYS_PARAM_VAL (ID_PARAM_DEF, ID_TNT, SD_SCOPE_TYPE, CD_SCOPE, FG_ACTIVE);
create index IDX_SYS_PORTAL_NOT_PORTAL_NOTI on RHN_SYS_PORTAL_NOTIFY (ID_TNT, ID_USER_RECIPIENT, SD_STATUS, DT_CREATED);
create index IDX_SYS_PORTAL_NOT_PORTAL_NO_1 on RHN_SYS_PORTAL_NOTIFY (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, DT_CREATED);
create index IDX_SYS_PRACT_PRACTITIONER_IDE on RHN_SYS_PRACT (ID_TNT, HASH_IDENT);
create index IDX_SYS_PRINT_JOB_PRINT_JOB_OU on RHN_SYS_PRINT_JOB (ID_TNT, ID_PRINT_OUTPUT, DT_REQUESTED);
create index IDX_SYS_PRINT_OUTP_PRINT_OUTPU on RHN_SYS_PRINT_OUTPUT (ID_TNT, SD_SRC_TYPE, ID_SRC, DT_GENERATED);
create index IDX_SYS_PRINT_OUTP_PRINT_OUT_1 on RHN_SYS_PRINT_OUTPUT (ID_TNT, ID_ENC, DT_GENERATED);
create index IDX_SYS_ROLE_PERM_ROLE_PERMISS on RHN_SYS_ROLE_PERM_ASSIGN (ID_TNT, ID_ACC_ROLE, DT_VALID_FROM, DT_VALID_TO);
create index IDX_SYS_STAFF_ASSI_ASSIGNMENT_ on RHN_SYS_STAFF_ASSIGN (ID_TNT, ID_EMPL, SD_STATUS, FG_PRIMARY_ASSIGN);
create index IDX_SYS_STAFF_ASSI_ASSIGNMEN_1 on RHN_SYS_STAFF_ASSIGN (ID_TNT, ID_ORG, SD_STATUS, FG_PRIMARY_ASSIGN);
create index IDX_SYS_STAFF_ASSI_ASSIGNMEN_2 on RHN_SYS_STAFF_ASSIGN (ID_TNT, ID_DEPT, SD_STATUS, FG_PRIMARY_ASSIGN);
create index IDX_SYS_SVC_RSRC_SCHED_RESOURC on RHN_SYS_SVC_RSRC (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, ID_PRACT);
create index IDX_SYS_USER_ROLE_USER_ROLE_CU on RHN_SYS_USER_ROLE_ASSIGN (ID_TNT, ID_USER, DT_VALID_FROM, DT_VALID_TO);
create index IDX_SYS_WORK_TASK_WORK_TASK_QU on RHN_SYS_WORK_TASK (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, SD_PRIORITY, DT_DUE);
create index IDX_SYS_WORK_TASK_WORK_TASK_AS on RHN_SYS_WORK_TASK (ID_TNT, SD_ASSIGNEE_TYPE, ID_USER_ASSIGNEE, SD_STATUS);
create index IDX_SYS_WORK_TASK_WORK_TASK_HI on RHN_SYS_WORK_TASK_HIST (ID_TNT, ID_WORK_TASK, DT_OCCURRED);
create index IDX_VIS_ALLERGY_IN_ALLERGY_RES on RHN_VIS_ALLERGY_INTOL (ID_TNT, ID_PAT, SD_CLIN_STATUS, DT_RECORDED);
create index IDX_VIS_ALLERGY_IN_ALLERGY_SUB on RHN_VIS_ALLERGY_INTOL (ID_TNT, ID_PAT, CD_CAT, CD_SUBSTANCE);
create index IDX_VIS_CARE_EPISO_CARE_EP_RES on RHN_VIS_CARE_EPISODE (ID_TNT, ID_PAT, SD_STATUS, DT_START);
create index IDX_VIS_CLIN_DOC_CLINICAL_DOCU on RHN_VIS_CLIN_DOC (ID_TNT, ID_PAT, DT_UPDATED desc);
create index IDX_VIS_CLIN_DOC_V_DOCUMENT_VE on RHN_VIS_CLIN_DOC_VER (ID_TNT, ID_CLIN_DOC, CD_VER_NUMBER desc);
create unique index IDX_VIS_CLIN_DOC_V_UK_DOCUMENT on RHN_VIS_CLIN_DOC_VER (ID_CRYPTO_EVID_INTEGRITY);
create unique index IDX_VIS_CLIN_DOC_V_UK_DOCUME_1 on RHN_VIS_CLIN_DOC_VER (ID_CRYPTO_EVID_SIGN);
create index IDX_VIS_CRIT_VAL_A_CRITICAL_AL on RHN_VIS_CRIT_VAL_ALERT (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS, DT_DETECTED);
create index IDX_VIS_CRIT_VAL_A_CRITICAL__1 on RHN_VIS_CRIT_VAL_ALERT (ID_TNT, ID_USER_RECIPIENT, SD_STATUS, DT_ACKNOWLEDGE_DEADLINE);
create index IDX_VIS_CRIT_VAL_A_CRITICAL_EV on RHN_VIS_CRIT_VAL_ALERT_EVT (ID_TNT, ID_CRIT_VAL_ALERT, DT_OCCURRED);
create index IDX_VIS_ENC_ENCOUNTER_RESIDENT on RHN_VIS_ENC (ID_TNT, ID_PAT, DT_REGISTERED);
create index IDX_VIS_ENC_ENCOUNTER_TERMINAT on RHN_VIS_ENC (ID_TNT, SD_STATUS, DT_TERMINATED);
create index IDX_VIS_ENC_ENCOUNTER_EPISODE on RHN_VIS_ENC (ID_TNT, ID_CARE_EPISODE, SD_STATUS);
create index IDX_VIS_ENC_ENCOUNTER_CLASS_WO on RHN_VIS_ENC (ID_TNT, ID_ORG, SD_ENC_CLASS, SD_STATUS, DT_REGISTERED);
create index IDX_VIS_ENC_COMP_C_ENC_COMPLET on RHN_VIS_ENC_COMP_CHECK (ID_TNT, ID_ENC, DT_CHECKED);
create index IDX_VIS_ENC_DIAG_DIAGNOSIS_ENC on RHN_VIS_ENC_DIAG (ID_TNT, ID_ENC);
create index IDX_VIS_ENC_DIAG_ENC_DIAG_CURR on RHN_VIS_ENC_DIAG (ID_TNT, ID_ENC, SD_DIAG_STATUS, SD_DIAG_TYPE, DT_RECORDED);
create index IDX_VIS_ENC_DIAG_ENC_DIAG_STAG on RHN_VIS_ENC_DIAG (ID_TNT, ID_ENC, SD_DIAG_STAGE, SD_DIAG_STATUS, SD_DIAG_TYPE, DT_RECORDED);
create index IDX_VIS_ENC_DIAG_ENC_DIAG_TERM on RHN_VIS_ENC_DIAG (ID_TNT, CD_CODE_SYS_SNAP, CD_ENC_DIAG, SD_DIAG_STATUS);
create index IDX_VIS_ENC_DIAG_R_ENC_DIAG_RE on RHN_VIS_ENC_DIAG_REV (ID_TNT, ID_ENC, DT_OCCURRED);
create index IDX_VIS_ENC_IDENT_ENC_ID_CHECK on RHN_VIS_ENC_IDENT_CHECK (ID_TNT, ID_ENC, DT_OCCURRED);
create index IDX_VIS_ENC_LOC_HI_ENC_LOC_HIS on RHN_VIS_ENC_LOC_HIST (ID_TNT, ID_ENC, DT_START);
create index IDX_VIS_ENC_LOC_HI_ENC_LOC_H_1 on RHN_VIS_ENC_LOC_HIST (ID_TNT, ID_SVC_LOC, SD_STATUS, DT_START);
create index IDX_VIS_ENC_STATUS_ENC_STATUS_ on RHN_VIS_ENC_STATUS_EVT (ID_TNT, ID_ENC, DT_OCCURRED);
create index IDX_VIS_ENC_WORK_S_ENC_WORK_SE on RHN_VIS_ENC_WORK_SESSION (ID_TNT, ID_ENC, SD_STATUS, DT_HEARTBEAT);
create index IDX_VIS_HEALTH_EVT_HEALTH_EVEN on RHN_VIS_HEALTH_EVT (ID_TNT, ID_PAT, DT_OCCURRED desc);
create unique index IDX_VIS_HEALTH_EVT_UK_HEALTH_E on RHN_VIS_HEALTH_EVT (ID_SRC_EVT);
create index IDX_VIS_INP_BED_DA_IP_BDAY_ENC on RHN_VIS_INP_BED_DAY_FACT (ID_TNT, ID_ENC, DA_BUSINESS);
create index IDX_VIS_INP_BED_PR_INP_BED_STA on RHN_VIS_INP_BED_PROF (ID_TNT, SD_OPERATIONAL_STATUS, SD_BED_TYPE);
create index IDX_VIS_INP_CHART_INP_CHART_EV on RHN_VIS_INP_CHART_EVT (ID_TNT, ID_CARE_EPISODE, DT_OCCURRED, ID_INP_CHART_EVT);
create index IDX_VIS_INP_EVT_INP_EVT_EPISOD on RHN_VIS_INP_EVT (ID_TNT, ID_CARE_EPISODE, DT_OCCURRED);
create index IDX_VIS_INP_NURS_R_INR_EPISODE on RHN_VIS_INP_NURS_RECORD (ID_TNT, ID_CARE_EPISODE, DT_OCCURRED, ID_INP_NURS_RECORD);
create index IDX_VIS_INP_NURS_R_INR_WARD_TI on RHN_VIS_INP_NURS_RECORD (ID_TNT, ID_ORG, ID_DEPT, DT_OCCURRED, ID_INP_NURS_RECORD);
create index IDX_VIS_INP_OBS_GR_INP_OBS_GRP on RHN_VIS_INP_OBS_GRP (ID_TNT, ID_CARE_EPISODE, DT_MEASURED, ID_INP_OBS_GRP);
create index IDX_VIS_INP_SHIFT_ISH_WARD_SHI on RHN_VIS_INP_SHIFT_HANDOFF (ID_TNT, ID_ORG, ID_DEPT, DT_SHIFT_FROM, DT_SHIFT_TO, SD_STATUS);
create index IDX_VIS_INP_SHIFT_ISHI_HANDOFF on RHN_VIS_INP_SHIFT_HANDOFF_ITEM (ID_TNT, ID_INP_SHIFT_HANDOFF, SN_SORT, ID_INP_SHIFT_HANDOFF_ITEM);
create index IDX_VIS_OBS_OBSERVATION_RESIDE on RHN_VIS_OBS (ID_TNT, ID_PAT, CD_OBS, DT_EFFECTIVE);
create index IDX_VIS_OBS_OBSERVATION_ENCOUN on RHN_VIS_OBS (ID_TNT, ID_ENC, CD_OBS);
create index IDX_VIS_SVC_LOC_SRV_LOC_TREE on RHN_VIS_SVC_LOC (ID_TNT, ID_ORG, ID_DEPT, ID_SVC_LOC_PARENT, SD_LOC_TYPE, SN_SORT);

-- 4. Comments
comment on table RHN_AI_SUGGEST is 'AI建议；一行代表一条AI建议记录';
comment on column RHN_AI_SUGGEST.ID_AI_SUGGEST is 'AI建议主键';
comment on column RHN_AI_SUGGEST.REVISION is '乐观锁修订号';
comment on column RHN_AI_SUGGEST.ID_TNT is '租户标识';
comment on column RHN_AI_SUGGEST.ID_PAT is '患者标识';
comment on column RHN_AI_SUGGEST.ID_ENC is '就诊标识';
comment on column RHN_AI_SUGGEST.ID_ORG is '机构标识';
comment on column RHN_AI_SUGGEST.ID_DEPT is '科室标识';
comment on column RHN_AI_SUGGEST.CD_SUGGEST is '建议编码';
comment on column RHN_AI_SUGGEST.SD_SUGGEST_TYPE is '建议类型';
comment on column RHN_AI_SUGGEST.SD_STATUS is '状态';
comment on column RHN_AI_SUGGEST.SD_RISK_LEVEL is 'risk等级';
comment on column RHN_AI_SUGGEST.CD_SCHEMA is '模式定义编码';
comment on column RHN_AI_SUGGEST.CD_SCHEMA_VER is '模式定义版本';
comment on column RHN_AI_SUGGEST.HASH_CLIENT_CONTEXT is '客户端上下文指纹';
comment on column RHN_AI_SUGGEST.HASH_CONTEXT is '上下文摘要';
comment on column RHN_AI_SUGGEST.HASH_SERVER_CONTEXT is 'server上下文摘要';
comment on column RHN_AI_SUGGEST.JSON_CONTENT is '内容JSON';
comment on column RHN_AI_SUGGEST.JSON_EVID is '证据JSON';
comment on column RHN_AI_SUGGEST.CD_PROVIDER is '提供方编码';
comment on column RHN_AI_SUGGEST.CD_MODEL is 'model编码';
comment on column RHN_AI_SUGGEST.CD_PROMPT_VER is 'prompt版本';
comment on column RHN_AI_SUGGEST.CD_KNOWLEDGE_VER is 'knowledge版本';
comment on column RHN_AI_SUGGEST.DT_DATA_CUTOFF is '数据cutoff';
comment on column RHN_AI_SUGGEST.DT_GENERATED is '生成时间';
comment on column RHN_AI_SUGGEST.DT_EXPIRES is '到期时间';
comment on column RHN_AI_SUGGEST.DT_INVALIDATED is 'invalidated时间';
comment on column RHN_AI_SUGGEST.DES_INVALIDATION_REASON is 'invalidation原因';
comment on column RHN_AI_SUGGEST.ID_PRACT_REQUESTED is '申请医务人员标识';
comment on column RHN_AI_SUGGEST.ID_USER_REQUESTED is '申请用户标识';
comment on column RHN_AI_SUGGEST.DT_CREATED is '创建时间';
comment on table RHN_AI_SUGGEST_EVT is 'AI建议事件；一行代表一条AI建议事件记录';
comment on column RHN_AI_SUGGEST_EVT.ID_AI_SUGGEST_EVT is 'AI建议事件主键';
comment on column RHN_AI_SUGGEST_EVT.ID_TNT is '租户标识';
comment on column RHN_AI_SUGGEST_EVT.ID_AI_SUGGEST is '建议标识';
comment on column RHN_AI_SUGGEST_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_AI_SUGGEST_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_AI_SUGGEST_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_AI_SUGGEST_EVT.ID_PRACT is '医务人员标识';
comment on column RHN_AI_SUGGEST_EVT.ID_USER is '用户标识';
comment on column RHN_AI_SUGGEST_EVT.CD_SECTION is 'section编码';
comment on column RHN_AI_SUGGEST_EVT.HASH_CONTEXT is '上下文摘要';
comment on column RHN_AI_SUGGEST_EVT.CD_COMMAND is '命令编码';
comment on column RHN_AI_SUGGEST_EVT.DES_DETAIL is '明细';
comment on column RHN_AI_SUGGEST_EVT.JSON_ACTION is '操作JSON';
comment on column RHN_AI_SUGGEST_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_ANL_PRES_METRIC_SAMPLE is '在线状态指标样本；一行代表一条在线状态指标样本记录';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.ID_PRES_METRIC_SAMPLE is '在线状态指标样本主键';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.ID_TNT is '租户标识';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.CD_SCOPE_KEY is '范围键';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.ID_ORG is '机构标识';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.ID_DEPT is '科室标识';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.DT_BUCKET is 'bucket时间';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.QTY_ONLINE_USER is '在线用户数';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.QTY_ACTIVE_USER is '有效用户数';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.QTY_ONLINE_CONTEXTS is '在线上下文数';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.QTY_CONNECTIONS is '连接数';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.QTY_INSTANCES is '实例数';
comment on column RHN_ANL_PRES_METRIC_SAMPLE.DT_CREATED is '创建时间';
comment on table RHN_AUD_CRYPTO_EVID is '密码学证据；一行代表一条密码学证据记录';
comment on column RHN_AUD_CRYPTO_EVID.ID_CRYPTO_EVID is '密码学证据主键';
comment on column RHN_AUD_CRYPTO_EVID.ID_TNT is '租户标识';
comment on column RHN_AUD_CRYPTO_EVID.SD_TARGET_TYPE is 'target类型';
comment on column RHN_AUD_CRYPTO_EVID.ID_TARGET is 'target标识';
comment on column RHN_AUD_CRYPTO_EVID.CD_TARGET_VER_NO is 'target版本编号';
comment on column RHN_AUD_CRYPTO_EVID.CD_OPERATION is '业务操作编码';
comment on column RHN_AUD_CRYPTO_EVID.SD_PROTECTION_PROF is '保护档案';
comment on column RHN_AUD_CRYPTO_EVID.SD_PROTECTION_PURPOSE is '保护用途';
comment on column RHN_AUD_CRYPTO_EVID.JSON_CONTENT_SCHEMA is '内容模式定义';
comment on column RHN_AUD_CRYPTO_EVID.CONTENT_DIGEST_ALGORITHM is '内容摘要算法';
comment on column RHN_AUD_CRYPTO_EVID.HASH_CONTENT is '内容摘要';
comment on column RHN_AUD_CRYPTO_EVID.SN_STATEMENT_VER is '声明版本';
comment on column RHN_AUD_CRYPTO_EVID.JSON_STATEMENT is '声明JSON';
comment on column RHN_AUD_CRYPTO_EVID.STATEMENT_DIGEST_ALGORITHM is '声明摘要算法';
comment on column RHN_AUD_CRYPTO_EVID.HASH_STATEMENT is '声明摘要';
comment on column RHN_AUD_CRYPTO_EVID.ID_CRYPTO_EVID_PREVIOUS is '上一证据标识';
comment on column RHN_AUD_CRYPTO_EVID.CD_PROVIDER is '提供方编码';
comment on column RHN_AUD_CRYPTO_EVID.PROVIDER_ASSURANCE is '提供方可信等级';
comment on column RHN_AUD_CRYPTO_EVID.SD_SIGN_ALGORITHM is '签名算法';
comment on column RHN_AUD_CRYPTO_EVID.SIGNATURE_VALUE is '签名值';
comment on column RHN_AUD_CRYPTO_EVID.ID_KEY is '键标识';
comment on column RHN_AUD_CRYPTO_EVID.SD_SIGNER_TYPE is '签署人类型';
comment on column RHN_AUD_CRYPTO_EVID.ID_SIGNER_SUBJECT is '签署人主体标识';
comment on column RHN_AUD_CRYPTO_EVID.NA_SIGNER is '签署人名称';
comment on column RHN_AUD_CRYPTO_EVID.DES_VERIFICATION_MATERIAL is '验证material';
comment on column RHN_AUD_CRYPTO_EVID.CD_CERTIFICATE_SERIAL is '证书序列号';
comment on column RHN_AUD_CRYPTO_EVID.CERTIFICATE_ISSUER is '证书签发方';
comment on column RHN_AUD_CRYPTO_EVID.DT_SIGNED is '签署时间';
comment on column RHN_AUD_CRYPTO_EVID.TIMESTAMP_AUTHORITY is '时间戳授权机构';
comment on column RHN_AUD_CRYPTO_EVID.TIMESTAMP_TOKEN is '时间戳令牌';
comment on column RHN_AUD_CRYPTO_EVID.ID_CORRELATION is '关联标识';
comment on column RHN_AUD_CRYPTO_EVID.DT_RECORDED is '记录时间';
comment on table RHN_AUD_IAM_AUTH_EVT is '身份权限授权事件；一行代表一条身份权限授权事件记录';
comment on column RHN_AUD_IAM_AUTH_EVT.ID_IAM_AUTH_EVT is '身份权限授权事件主键';
comment on column RHN_AUD_IAM_AUTH_EVT.ID_TNT is '租户标识';
comment on column RHN_AUD_IAM_AUTH_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_AUD_IAM_AUTH_EVT.SD_TARGET_TYPE is 'target类型';
comment on column RHN_AUD_IAM_AUTH_EVT.ID_TARGET is 'target标识';
comment on column RHN_AUD_IAM_AUTH_EVT.ID_USER_ACTOR is '操作人标识';
comment on column RHN_AUD_IAM_AUTH_EVT.JSON_DETAIL is '详情JSON';
comment on column RHN_AUD_IAM_AUTH_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_AUD_LOG is '审计日志；一行代表一条审计日志记录';
comment on column RHN_AUD_LOG.ID_AUD_LOG is '审计日志主键';
comment on column RHN_AUD_LOG.ID_TNT is '租户标识';
comment on column RHN_AUD_LOG.CD_ACTOR is '操作人';
comment on column RHN_AUD_LOG.SD_HTTP_METHOD is 'http方法';
comment on column RHN_AUD_LOG.REQUEST_PATH is '请求路径';
comment on column RHN_AUD_LOG.SD_RESP_STATUS is '响应状态';
comment on column RHN_AUD_LOG.ID_CORRELATION is '关联标识';
comment on column RHN_AUD_LOG.DT_OCCURRED is '发生时间';
comment on table RHN_BD_CATALOG_CHG_BATCH is '目录变更批次；一行代表一条目录变更批次记录';
comment on column RHN_BD_CATALOG_CHG_BATCH.ID_CATALOG_CHG_BATCH is '目录变更批次主键';
comment on column RHN_BD_CATALOG_CHG_BATCH.REVISION is '乐观锁修订号';
comment on column RHN_BD_CATALOG_CHG_BATCH.ID_TNT is '租户标识';
comment on column RHN_BD_CATALOG_CHG_BATCH.SD_BATCH_TYPE is '批次类型';
comment on column RHN_BD_CATALOG_CHG_BATCH.SD_OPERATION_TYPE is '业务操作类型';
comment on column RHN_BD_CATALOG_CHG_BATCH.ID_ORG is '机构标识';
comment on column RHN_BD_CATALOG_CHG_BATCH.CD_REQ is '请求编码';
comment on column RHN_BD_CATALOG_CHG_BATCH.HASH_REQ is '请求摘要';
comment on column RHN_BD_CATALOG_CHG_BATCH.DA_BUSINESS is '业务日期';
comment on column RHN_BD_CATALOG_CHG_BATCH.SD_STATUS is '状态';
comment on column RHN_BD_CATALOG_CHG_BATCH.QTY_TOTAL_ROW is '总计行数';
comment on column RHN_BD_CATALOG_CHG_BATCH.QTY_SUCCEEDED_ROW is 'succeeded行数';
comment on column RHN_BD_CATALOG_CHG_BATCH.QTY_FAILED_ROW is 'failed行数';
comment on column RHN_BD_CATALOG_CHG_BATCH.DT_CREATED is '创建时间';
comment on column RHN_BD_CATALOG_CHG_BATCH.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_CATALOG_CHG_BATCH.DT_UPDATED is '更新时间';
comment on column RHN_BD_CATALOG_CHG_BATCH.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_CATALOG_CHG_ROW is '目录变更批次行；一行代表一条目录变更批次行记录';
comment on column RHN_BD_CATALOG_CHG_ROW.ID_CATALOG_CHG_ROW is '目录变更批次行主键';
comment on column RHN_BD_CATALOG_CHG_ROW.ID_TNT is '租户标识';
comment on column RHN_BD_CATALOG_CHG_ROW.ID_CATALOG_CHG_BATCH is '批次标识';
comment on column RHN_BD_CATALOG_CHG_ROW.CD_ROW_NUMBER is '行编号';
comment on column RHN_BD_CATALOG_CHG_ROW.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_CATALOG_CHG_ROW.ID_PKG is '包装标识';
comment on column RHN_BD_CATALOG_CHG_ROW.JSON_SRC is '来源JSON';
comment on column RHN_BD_CATALOG_CHG_ROW.SD_STATUS is '状态';
comment on column RHN_BD_CATALOG_CHG_ROW.SD_TARGET_RSRC_TYPE is 'target资源类型';
comment on column RHN_BD_CATALOG_CHG_ROW.ID_TARGET is 'target标识';
comment on column RHN_BD_CATALOG_CHG_ROW.CD_ERROR is '错误编码';
comment on column RHN_BD_CATALOG_CHG_ROW.DES_ERROR_MSG is '错误消息';
comment on column RHN_BD_CATALOG_CHG_ROW.DT_CREATED is '创建时间';
comment on column RHN_BD_CATALOG_CHG_ROW.DT_UPDATED is '更新时间';
comment on column RHN_BD_CATALOG_CHG_ROW.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_CATALOG_ITEM is '目录项目；一行代表一条目录项目记录';
comment on column RHN_BD_CATALOG_ITEM.ID_CATALOG_ITEM is '目录项目主键';
comment on column RHN_BD_CATALOG_ITEM.REVISION is '乐观锁修订号';
comment on column RHN_BD_CATALOG_ITEM.ID_TNT is '租户标识';
comment on column RHN_BD_CATALOG_ITEM.CD_CATALOG_ITEM is '编码';
comment on column RHN_BD_CATALOG_ITEM.NA_CATALOG_ITEM is '名称';
comment on column RHN_BD_CATALOG_ITEM.SD_ITEM_TYPE is '项目类型';
comment on column RHN_BD_CATALOG_ITEM.CD_UNIT is '单位编码';
comment on column RHN_BD_CATALOG_ITEM.FG_ORDERABLE is '是否orderable';
comment on column RHN_BD_CATALOG_ITEM.FG_CHARGEABLE is '是否chargeable';
comment on column RHN_BD_CATALOG_ITEM.FG_STOCKED is '是否stocked';
comment on column RHN_BD_CATALOG_ITEM.SD_STATUS is '状态';
comment on column RHN_BD_CATALOG_ITEM.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_CATALOG_ITEM.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_CATALOG_ITEM.DT_CREATED is '创建时间';
comment on column RHN_BD_CATALOG_ITEM.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_CATALOG_ITEM.DT_UPDATED is '更新时间';
comment on column RHN_BD_CATALOG_ITEM.ID_USER_UPDATED is '更新人标识';
comment on column RHN_BD_CATALOG_ITEM.ID_ITEM_TYPE is '项目类型标识';
comment on column RHN_BD_CATALOG_ITEM.ID_ITEM_MASTER is '项目主数据标识';
comment on table RHN_BD_CATALOG_PRICE is '目录价格；一行代表一条目录价格记录';
comment on column RHN_BD_CATALOG_PRICE.ID_CATALOG_PRICE is '目录价格主键';
comment on column RHN_BD_CATALOG_PRICE.REVISION is '乐观锁修订号';
comment on column RHN_BD_CATALOG_PRICE.ID_TNT is '租户标识';
comment on column RHN_BD_CATALOG_PRICE.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_CATALOG_PRICE.ID_ORG is '机构标识';
comment on column RHN_BD_CATALOG_PRICE.ID_ITEM_PKG is '包装标识';
comment on column RHN_BD_CATALOG_PRICE.SD_PRICE_TYPE is '价格类型';
comment on column RHN_BD_CATALOG_PRICE.PRICE_UNIT is '价格';
comment on column RHN_BD_CATALOG_PRICE.CD_CURRENCY is '币种编码';
comment on column RHN_BD_CATALOG_PRICE.CD_PRICE_DOC is '价格文书编码';
comment on column RHN_BD_CATALOG_PRICE.DES_PRICE_REASON is '价格原因';
comment on column RHN_BD_CATALOG_PRICE.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_CATALOG_PRICE.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_CATALOG_PRICE.SD_STATUS is '状态';
comment on column RHN_BD_CATALOG_PRICE.DT_CREATED is '创建时间';
comment on column RHN_BD_CATALOG_PRICE.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_CATALOG_PRICE.DT_UPDATED is '更新时间';
comment on column RHN_BD_CATALOG_PRICE.ID_USER_UPDATED is '更新人标识';
comment on column RHN_BD_CATALOG_PRICE.ID_CATALOG_PRICE_REPLACES is '替代价格标识';
comment on table RHN_BD_CODE_SYSTEM is '编码体系；一行代表一条编码体系记录';
comment on column RHN_BD_CODE_SYSTEM.ID_CODE_SYSTEM is '编码体系主键';
comment on column RHN_BD_CODE_SYSTEM.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_CODE_SYSTEM.ID_SCOPE is '范围标识';
comment on column RHN_BD_CODE_SYSTEM.CD_CODE_SYSTEM is '编码';
comment on column RHN_BD_CODE_SYSTEM.NA_CODE_SYSTEM is '名称';
comment on column RHN_BD_CODE_SYSTEM.CD_CANONICAL_URI is '规范URI';
comment on column RHN_BD_CODE_SYSTEM.CD_VER is '版本编码';
comment on column RHN_BD_CODE_SYSTEM.SD_STATUS is '状态';
comment on column RHN_BD_CODE_SYSTEM.DA_EFFECTIVE_FROM is '生效开始日期';
comment on column RHN_BD_CODE_SYSTEM.DA_EFFECTIVE_TO is '生效结束日期';
comment on column RHN_BD_CODE_SYSTEM.DT_CREATED is '创建时间';
comment on column RHN_BD_CODE_SYSTEM.SD_SYS_TYPE is '体系类型';
comment on column RHN_BD_CODE_SYSTEM.PUBLISHER is '发布方';
comment on column RHN_BD_CODE_SYSTEM.DES_CODE_SYSTEM is '说明';
comment on column RHN_BD_CODE_SYSTEM.SD_SRC_TYPE is '来源类型';
comment on column RHN_BD_CODE_SYSTEM.REVISION is '乐观锁修订号';
comment on column RHN_BD_CODE_SYSTEM.DT_UPDATED is '更新时间';
comment on column RHN_BD_CODE_SYSTEM.SD_AUTHORITY_TYPE is '授权机构类型';
comment on column RHN_BD_CODE_SYSTEM.CD_SRC_URI is '来源URI';
comment on column RHN_BD_CODE_SYSTEM.HASH_CONTENT is '内容摘要';
comment on column RHN_BD_CODE_SYSTEM.SD_DIAG_DOMAIN is '诊断领域';
comment on table RHN_BD_CONCEPT is '概念；一行代表一条概念记录';
comment on column RHN_BD_CONCEPT.ID_CONCEPT is '概念主键';
comment on column RHN_BD_CONCEPT.ID_CODE_SYSTEM is '编码体系标识';
comment on column RHN_BD_CONCEPT.CD_CONCEPT is '编码';
comment on column RHN_BD_CONCEPT.NA_DISPLAY is '显示';
comment on column RHN_BD_CONCEPT.DES_DEF is '定义';
comment on column RHN_BD_CONCEPT.SD_STATUS is '状态';
comment on column RHN_BD_CONCEPT.DA_EFFECTIVE_FROM is '生效开始日期';
comment on column RHN_BD_CONCEPT.DA_EFFECTIVE_TO is '生效结束日期';
comment on column RHN_BD_CONCEPT.DT_CREATED is '创建时间';
comment on column RHN_BD_CONCEPT.SD_CONCEPT_TYPE is '概念类型';
comment on column RHN_BD_CONCEPT.NA_SHORT is '简称显示';
comment on column RHN_BD_CONCEPT.CD_CHAPTER is 'chapter编码';
comment on column RHN_BD_CONCEPT.NA_CHAPTER is 'chapter名称';
comment on column RHN_BD_CONCEPT.CD_SEARCH is 'search编码';
comment on column RHN_BD_CONCEPT.SD_SRC_TYPE is '来源类型';
comment on column RHN_BD_CONCEPT.ID_CONCEPT_REPLACEMENT is 'replacement概念标识';
comment on column RHN_BD_CONCEPT.REVISION is '乐观锁修订号';
comment on column RHN_BD_CONCEPT.DT_UPDATED is '更新时间';
comment on table RHN_BD_CONCEPT_ALIAS is '概念别名；一行代表一条概念别名记录';
comment on column RHN_BD_CONCEPT_ALIAS.ID_CONCEPT_ALIAS is '概念别名主键';
comment on column RHN_BD_CONCEPT_ALIAS.ID_CONCEPT is '概念标识';
comment on column RHN_BD_CONCEPT_ALIAS.SD_ALIAS_TYPE is '别名类型';
comment on column RHN_BD_CONCEPT_ALIAS.NA_ALIAS is '别名名称';
comment on column RHN_BD_CONCEPT_ALIAS.CD_SEARCH is 'search编码';
comment on column RHN_BD_CONCEPT_ALIAS.SD_STATUS is '状态';
comment on table RHN_BD_CONCEPT_MAP is '概念映射；一行代表一条概念映射记录';
comment on column RHN_BD_CONCEPT_MAP.ID_CONCEPT_MAP is '概念映射主键';
comment on column RHN_BD_CONCEPT_MAP.ID_TNT is '租户标识';
comment on column RHN_BD_CONCEPT_MAP.CD_SRC_SYS is '来源体系';
comment on column RHN_BD_CONCEPT_MAP.CD_SRC is '来源编码';
comment on column RHN_BD_CONCEPT_MAP.ID_CONCEPT_TARGET is 'target概念标识';
comment on column RHN_BD_CONCEPT_MAP.SD_EQUIVALENCE is '等价关系';
comment on column RHN_BD_CONCEPT_MAP.SD_STATUS is '状态';
comment on column RHN_BD_CONCEPT_MAP.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_CONCEPT_MAP.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_CONCEPT_MAP.DT_CREATED is '创建时间';
comment on table RHN_BD_DICT_ATTR_DEF is '字典属性定义；一行代表一条字典属性定义记录';
comment on column RHN_BD_DICT_ATTR_DEF.ID_DICT_ATTR_DEF is '字典属性定义主键';
comment on column RHN_BD_DICT_ATTR_DEF.REVISION is '乐观锁修订号';
comment on column RHN_BD_DICT_ATTR_DEF.ID_DICT_DEF_DICT is '字典标识';
comment on column RHN_BD_DICT_ATTR_DEF.CD_DICT_ATTR_DEF is '编码';
comment on column RHN_BD_DICT_ATTR_DEF.NA_DICT_ATTR_DEF is '名称';
comment on column RHN_BD_DICT_ATTR_DEF.DES_DICT_ATTR_DEF is '说明';
comment on column RHN_BD_DICT_ATTR_DEF.SD_DATA_TYPE is '数据类型';
comment on column RHN_BD_DICT_ATTR_DEF.SD_CARDINALITY is '基数';
comment on column RHN_BD_DICT_ATTR_DEF.ID_DICT_DEF_REFERENCE_DICT is '参考字典标识';
comment on column RHN_BD_DICT_ATTR_DEF.JSON_SCHEMA is '模式定义JSON';
comment on column RHN_BD_DICT_ATTR_DEF.SD_MINIMUM_SCOPE is 'minimum范围';
comment on column RHN_BD_DICT_ATTR_DEF.SD_OVRD_POLICY is '覆盖策略';
comment on column RHN_BD_DICT_ATTR_DEF.FG_REQUIRED_VAL is '是否应需值';
comment on column RHN_BD_DICT_ATTR_DEF.FG_SEARCHABLE is '是否searchable';
comment on column RHN_BD_DICT_ATTR_DEF.SD_STATUS is '状态';
comment on column RHN_BD_DICT_ATTR_DEF.DT_CREATED is '创建时间';
comment on column RHN_BD_DICT_ATTR_DEF.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_DICT_ATTR_DEF.DT_UPDATED is '更新时间';
comment on column RHN_BD_DICT_ATTR_DEF.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_DICT_CAT is '字典分类；一行代表一条字典分类记录';
comment on column RHN_BD_DICT_CAT.ID_DICT_CAT is '字典分类主键';
comment on column RHN_BD_DICT_CAT.REVISION is '乐观锁修订号';
comment on column RHN_BD_DICT_CAT.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_DICT_CAT.CD_SCOPE is '范围编码';
comment on column RHN_BD_DICT_CAT.ID_TNT is '租户标识';
comment on column RHN_BD_DICT_CAT.ID_DICT_CAT_PARENT is '上级标识';
comment on column RHN_BD_DICT_CAT.CD_DICT_CAT is '编码';
comment on column RHN_BD_DICT_CAT.NA_DICT_CAT is '名称';
comment on column RHN_BD_DICT_CAT.DES_DICT_CAT is '说明';
comment on column RHN_BD_DICT_CAT.SN_SORT is '排序医嘱';
comment on column RHN_BD_DICT_CAT.SD_STATUS is '状态';
comment on column RHN_BD_DICT_CAT.DT_CREATED is '创建时间';
comment on column RHN_BD_DICT_CAT.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_DICT_CAT.DT_UPDATED is '更新时间';
comment on column RHN_BD_DICT_CAT.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_DICT_CHG is '字典变更；一行代表一条字典变更记录';
comment on column RHN_BD_DICT_CHG.ID_DICT_CHG is '字典变更主键';
comment on column RHN_BD_DICT_CHG.ID_TNT is '租户标识';
comment on column RHN_BD_DICT_CHG.ID_DICT_DEF_DICT is '字典标识';
comment on column RHN_BD_DICT_CHG.ID_DICT_ITEM is '项目标识';
comment on column RHN_BD_DICT_CHG.SD_CHG_TYPE is '变更类型';
comment on column RHN_BD_DICT_CHG.SD_TARGET_TYPE is 'target类型';
comment on column RHN_BD_DICT_CHG.JSON_BEFORE is '前JSON';
comment on column RHN_BD_DICT_CHG.JSON_AFTER is '后JSON';
comment on column RHN_BD_DICT_CHG.DES_REASON is '原因';
comment on column RHN_BD_DICT_CHG.CD_REQ is '请求编码';
comment on column RHN_BD_DICT_CHG.DT_CHANGED is '变更时间';
comment on column RHN_BD_DICT_CHG.ID_USER_CHANGED is '变更人标识';
comment on column RHN_BD_DICT_CHG.ID_DICT_CAT is '分类标识';
comment on column RHN_BD_DICT_CHG.ID_DICT_ATTR_DEF is '属性定义标识';
comment on table RHN_BD_DICT_DEF is '字典定义；一行代表一条字典定义记录';
comment on column RHN_BD_DICT_DEF.ID_DICT_DEF is '字典定义主键';
comment on column RHN_BD_DICT_DEF.REVISION is '乐观锁修订号';
comment on column RHN_BD_DICT_DEF.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_DICT_DEF.CD_SCOPE is '范围编码';
comment on column RHN_BD_DICT_DEF.ID_TNT is '租户标识';
comment on column RHN_BD_DICT_DEF.CD_DICT_DEF is '编码';
comment on column RHN_BD_DICT_DEF.NA_DICT_DEF is '名称';
comment on column RHN_BD_DICT_DEF.DES_DICT_DEF is '说明';
comment on column RHN_BD_DICT_DEF.SD_STATUS is '状态';
comment on column RHN_BD_DICT_DEF.DT_CREATED is '创建时间';
comment on column RHN_BD_DICT_DEF.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_DICT_DEF.DT_UPDATED is '更新时间';
comment on column RHN_BD_DICT_DEF.ID_USER_UPDATED is '更新人标识';
comment on column RHN_BD_DICT_DEF.FG_SYS_MANAGED is '是否体系managed';
comment on column RHN_BD_DICT_DEF.ID_DICT_CAT is '分类标识';
comment on table RHN_BD_DICT_ITEM is '字典项目；一行代表一条字典项目记录';
comment on column RHN_BD_DICT_ITEM.ID_DICT_ITEM is '字典项目主键';
comment on column RHN_BD_DICT_ITEM.ID_DICT_DEF_DICT is '字典标识';
comment on column RHN_BD_DICT_ITEM.CD_DICT_ITEM is '编码';
comment on column RHN_BD_DICT_ITEM.NA_DICT_ITEM is '名称';
comment on column RHN_BD_DICT_ITEM.DES_DICT_ITEM is '说明';
comment on column RHN_BD_DICT_ITEM.SN_SORT is '排序医嘱';
comment on column RHN_BD_DICT_ITEM.SD_STATUS is '状态';
comment on table RHN_BD_DICT_ITEM_ATTR_VAL is '字典项目属性值；一行代表一条字典项目属性值记录';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_DICT_ITEM_ATTR_VAL is '字典项目属性值主键';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_DICT_ITEM is '字典项目标识';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_DICT_ATTR_DEF is '属性定义标识';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.CD_SCOPE is '范围编码';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_TNT is '租户标识';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_ORG is '机构标识';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_DEPT is '科室标识';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.SN_VALUE is '值医嘱';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.SD_VAL_MODE is '值模式';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.FG_BOOLEAN_VAL is '是否boolean值';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.INTEGER_VALUE is 'integer值';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.DECIMAL_VALUE is '小数值';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.TEXT_VALUE is '文本值';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.CODE_VALUE is '编码值';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.DA_DATE_VAL is '日期值';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.DT_DATETIME_VAL is 'datetime值';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_DICT_ITEM_REFERENCE is '参考项目标识';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.SD_STATUS is '状态';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.DT_CREATED is '创建时间';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.DT_UPDATED is '更新时间';
comment on column RHN_BD_DICT_ITEM_ATTR_VAL.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_EXAM_SVC is '检查服务；一行代表一条检查服务记录';
comment on column RHN_BD_EXAM_SVC.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_EXAM_SVC.ID_TNT is '租户标识';
comment on column RHN_BD_EXAM_SVC.SD_EXAM_TYPE is '检查类型';
comment on column RHN_BD_EXAM_SVC.FG_BODY_SITE_REQUIRED is '是否身体部位库房应需';
comment on column RHN_BD_EXAM_SVC.FG_MULTI_BODY_SITE is '是否multi身体部位库房';
comment on column RHN_BD_EXAM_SVC.QTY_MAX_BODY_SITE is '最大身体部位库房盘点';
comment on column RHN_BD_EXAM_SVC.DES_PREPARATION_DESCRIPTION is '制剂说明';
comment on column RHN_BD_EXAM_SVC.REVISION is '乐观锁修订号';
comment on column RHN_BD_EXAM_SVC.DT_CREATED is '创建时间';
comment on column RHN_BD_EXAM_SVC.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_EXAM_SVC.DT_UPDATED is '更新时间';
comment on column RHN_BD_EXAM_SVC.ID_USER_UPDATED is '更新人标识';
comment on column RHN_BD_EXAM_SVC.SD_SITE_PRICING_MODE is '库房pricing模式';
comment on column RHN_BD_EXAM_SVC.QTY_INCLUDED_SITE is 'included库房盘点';
comment on column RHN_BD_EXAM_SVC.PRICE_ADDL_SITE is 'additional库房单价';
comment on column RHN_BD_EXAM_SVC.ID_CATALOG_ITEM_ADDL_SITE is 'additional库房项目标识';
comment on column RHN_BD_EXAM_SVC.QTY_ADDL_SITE is 'additional库房数量';
comment on column RHN_BD_EXAM_SVC.QTY_MAX_CHARGEABLE_SITE is '最大chargeable库房盘点';
comment on table RHN_BD_GRID_ADDR_NODE is '网格地址节点；一行代表一条网格地址节点记录';
comment on column RHN_BD_GRID_ADDR_NODE.ID_GRID_ADDR_NODE is '网格地址节点主键';
comment on column RHN_BD_GRID_ADDR_NODE.REVISION is '乐观锁修订号';
comment on column RHN_BD_GRID_ADDR_NODE.ID_GRID_ADDR_NODE_PARENT is '上级标识';
comment on column RHN_BD_GRID_ADDR_NODE.CD_LEVEL is '等级编码';
comment on column RHN_BD_GRID_ADDR_NODE.CD_GRID_ADDR_NODE is '编码';
comment on column RHN_BD_GRID_ADDR_NODE.NA_GRID_ADDR_NODE is '名称';
comment on column RHN_BD_GRID_ADDR_NODE.NA_SHORT is '简称名称';
comment on column RHN_BD_GRID_ADDR_NODE.CD_PINYIN is 'pinyin编码';
comment on column RHN_BD_GRID_ADDR_NODE.DES_FULL_PATH is 'full路径';
comment on column RHN_BD_GRID_ADDR_NODE.SN_SORT is '排序医嘱';
comment on column RHN_BD_GRID_ADDR_NODE.SD_STATUS is '状态';
comment on column RHN_BD_GRID_ADDR_NODE.FG_SYS_MANAGED is '是否体系managed';
comment on column RHN_BD_GRID_ADDR_NODE.DT_CREATED is '创建时间';
comment on column RHN_BD_GRID_ADDR_NODE.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_GRID_ADDR_NODE.DT_UPDATED is '更新时间';
comment on column RHN_BD_GRID_ADDR_NODE.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_IMPORT_BATCH is '主数据数据导入批次；一行代表一条主数据数据导入批次记录';
comment on column RHN_BD_IMPORT_BATCH.ID_IMPORT_BATCH is '主数据数据导入批次主键';
comment on column RHN_BD_IMPORT_BATCH.REVISION is '乐观锁修订号';
comment on column RHN_BD_IMPORT_BATCH.ID_TNT is '租户标识';
comment on column RHN_BD_IMPORT_BATCH.SD_IMPORT_TYPE is '导入类型';
comment on column RHN_BD_IMPORT_BATCH.NA_FILE is 'file名称';
comment on column RHN_BD_IMPORT_BATCH.HASH_FILE is 'file摘要';
comment on column RHN_BD_IMPORT_BATCH.CD_REQ is '请求编码';
comment on column RHN_BD_IMPORT_BATCH.SD_STATUS is '状态';
comment on column RHN_BD_IMPORT_BATCH.QTY_TOTAL_ROW is '总计行数';
comment on column RHN_BD_IMPORT_BATCH.QTY_READY_ROW is 'ready行数';
comment on column RHN_BD_IMPORT_BATCH.QTY_INVALID_ROW is 'invalid行数';
comment on column RHN_BD_IMPORT_BATCH.QTY_IMPORTED_ROW is 'imported行数';
comment on column RHN_BD_IMPORT_BATCH.QTY_FAILED_ROW is 'failed行数';
comment on column RHN_BD_IMPORT_BATCH.DT_CREATED is '创建时间';
comment on column RHN_BD_IMPORT_BATCH.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_IMPORT_BATCH.DT_UPDATED is '更新时间';
comment on column RHN_BD_IMPORT_BATCH.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_IMPORT_ROW is '主数据数据导入行；一行代表一条主数据数据导入行记录';
comment on column RHN_BD_IMPORT_ROW.ID_IMPORT_ROW is '主数据数据导入行主键';
comment on column RHN_BD_IMPORT_ROW.REVISION is '乐观锁修订号';
comment on column RHN_BD_IMPORT_ROW.ID_TNT is '租户标识';
comment on column RHN_BD_IMPORT_ROW.ID_IMPORT_BATCH is '批次标识';
comment on column RHN_BD_IMPORT_ROW.CD_ROW_NUMBER is '行编号';
comment on column RHN_BD_IMPORT_ROW.CD_SRC_KEY is '来源键';
comment on column RHN_BD_IMPORT_ROW.JSON_SRC is '来源JSON';
comment on column RHN_BD_IMPORT_ROW.JSON_NORMALIZED is '标准化JSON';
comment on column RHN_BD_IMPORT_ROW.JSON_ERRORS is '错误JSON';
comment on column RHN_BD_IMPORT_ROW.SD_STATUS is '状态';
comment on column RHN_BD_IMPORT_ROW.ID_TARGET is 'target标识';
comment on column RHN_BD_IMPORT_ROW.DT_CREATED is '创建时间';
comment on column RHN_BD_IMPORT_ROW.DT_UPDATED is '更新时间';
comment on column RHN_BD_IMPORT_ROW.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_ALIAS is '项目别名；一行代表一条项目别名记录';
comment on column RHN_BD_ITEM_ALIAS.ID_ITEM_ALIAS is '项目别名主键';
comment on column RHN_BD_ITEM_ALIAS.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_ALIAS.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_ITEM_ALIAS.SD_ALIAS_TYPE is '别名类型';
comment on column RHN_BD_ITEM_ALIAS.NA_ALIAS is '别名名称';
comment on column RHN_BD_ITEM_ALIAS.CD_PINYIN is 'pinyin编码';
comment on column RHN_BD_ITEM_ALIAS.CD_WUBI is 'wubi编码';
comment on column RHN_BD_ITEM_ALIAS.CD_MNEMONIC is 'mnemonic编码';
comment on column RHN_BD_ITEM_ALIAS.FG_PRIMARY_ALIAS is '是否主要别名';
comment on column RHN_BD_ITEM_ALIAS.SD_STATUS is '状态';
comment on table RHN_BD_ITEM_ATTR_CHG is '项目属性变更；一行代表一条项目属性变更记录';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_ITEM_ATTR_CHG is '项目属性变更主键';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_ITEM_ATTR_DEF is '属性定义标识';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_ITEM_TYPE is '项目类型标识';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_ITEM_TYPE_ATTR is '项目类型属性标识';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_ITEM_ATTR_SUBJECT is '属性主体标识';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_ITEM_ATTR_VAL is '属性值标识';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_ITEM_ATTR_OVRD is '属性覆盖标识';
comment on column RHN_BD_ITEM_ATTR_CHG.SD_TARGET_TYPE is 'target类型';
comment on column RHN_BD_ITEM_ATTR_CHG.SD_CHG_TYPE is '变更类型';
comment on column RHN_BD_ITEM_ATTR_CHG.CD_SCOPE_KEY is '范围键';
comment on column RHN_BD_ITEM_ATTR_CHG.JSON_BEFORE is '前JSON';
comment on column RHN_BD_ITEM_ATTR_CHG.JSON_AFTER is '后JSON';
comment on column RHN_BD_ITEM_ATTR_CHG.DES_CHG_REASON is '变更原因';
comment on column RHN_BD_ITEM_ATTR_CHG.CD_REQ is '请求编码';
comment on column RHN_BD_ITEM_ATTR_CHG.DT_CHANGED is '变更时间';
comment on column RHN_BD_ITEM_ATTR_CHG.ID_USER_CHANGED is '变更人标识';
comment on table RHN_BD_ITEM_ATTR_DEF is '项目属性定义；一行代表一条项目属性定义记录';
comment on column RHN_BD_ITEM_ATTR_DEF.ID_ITEM_ATTR_DEF is '项目属性定义主键';
comment on column RHN_BD_ITEM_ATTR_DEF.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_ITEM_ATTR_DEF.CD_SCOPE is '范围编码';
comment on column RHN_BD_ITEM_ATTR_DEF.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_ATTR_DEF.CD_ITEM_ATTR_DEF is '编码';
comment on column RHN_BD_ITEM_ATTR_DEF.NA_ITEM_ATTR_DEF is '名称';
comment on column RHN_BD_ITEM_ATTR_DEF.DES_ITEM_ATTR_DEF is '说明';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_DATA_TYPE is '数据类型';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_CARDINALITY is '基数';
comment on column RHN_BD_ITEM_ATTR_DEF.ID_DICT_DEF_DICT is '字典标识';
comment on column RHN_BD_ITEM_ATTR_DEF.CD_UNIT is '单位编码';
comment on column RHN_BD_ITEM_ATTR_DEF.JSON_SCHEMA is '模式定义JSON';
comment on column RHN_BD_ITEM_ATTR_DEF.JSON_DEFAULT is '默认JSON';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_VARIABILITY is '可变性';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_OVRD_POLICY is '覆盖策略';
comment on column RHN_BD_ITEM_ATTR_DEF.JSON_ALLOWED_SCOPE is '允许范围JSON';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_CONTEXT_BASIS is '上下文依据';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_STORAGE_MODE is 'storage模式';
comment on column RHN_BD_ITEM_ATTR_DEF.PROJECTION_FIELD is '投影字段';
comment on column RHN_BD_ITEM_ATTR_DEF.ID_VALIDATION_RULE is 'validation规则标识';
comment on column RHN_BD_ITEM_ATTR_DEF.SENSITIVITY is '敏感级别';
comment on column RHN_BD_ITEM_ATTR_DEF.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_ATTR_DEF.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_ATTR_DEF.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_ATTR_DEF.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_ATTR_DEF.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_ATTR_OVRD is '项目属性覆盖；一行代表一条项目属性覆盖记录';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_ITEM_ATTR_OVRD is '项目属性覆盖主键';
comment on column RHN_BD_ITEM_ATTR_OVRD.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_ITEM_ATTR_SUBJECT is '属性主体标识';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_ITEM_ATTR_DEF is '属性定义标识';
comment on column RHN_BD_ITEM_ATTR_OVRD.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_ITEM_ATTR_OVRD.CD_SCOPE_KEY is '范围键';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_ORG is '机构标识';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_DEPT is '科室标识';
comment on column RHN_BD_ITEM_ATTR_OVRD.SD_VAL_MODE is '值模式';
comment on column RHN_BD_ITEM_ATTR_OVRD.JSON_VAL is '值JSON';
comment on column RHN_BD_ITEM_ATTR_OVRD.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ITEM_ATTR_OVRD.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ITEM_ATTR_OVRD.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_ATTR_OVRD.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_ATTR_OVRD.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_ATTR_OVRD.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_ATTR_SUBJECT is '项目属性主体；一行代表一条项目属性主体记录';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.ID_ITEM_ATTR_SUBJECT is '项目属性主体主键';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.SD_SUBJECT_TYPE is '主体类型';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.CD_SUBJECT_KEY is '主体键';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.ID_ITEM_MASTER is '项目主数据标识';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.ID_MED is '药品标识';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.ID_SVC_VAR is '服务变体标识';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_ATTR_SUBJECT.ID_USER_CREATED is '创建人标识';
comment on table RHN_BD_ITEM_ATTR_VAL is '项目属性值；一行代表一条项目属性值记录';
comment on column RHN_BD_ITEM_ATTR_VAL.ID_ITEM_ATTR_VAL is '项目属性值主键';
comment on column RHN_BD_ITEM_ATTR_VAL.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_ATTR_VAL.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_ITEM_ATTR_VAL.CD_SCOPE is '范围编码';
comment on column RHN_BD_ITEM_ATTR_VAL.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_ATTR_VAL.ID_ITEM_ATTR_SUBJECT is '属性主体标识';
comment on column RHN_BD_ITEM_ATTR_VAL.ID_ITEM_ATTR_DEF is '属性定义标识';
comment on column RHN_BD_ITEM_ATTR_VAL.JSON_VAL is '值JSON';
comment on column RHN_BD_ITEM_ATTR_VAL.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ITEM_ATTR_VAL.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ITEM_ATTR_VAL.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_ATTR_VAL.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_ATTR_VAL.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_ATTR_VAL.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_ATTR_VAL.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_GRP is '项目分组；一行代表一条项目分组记录';
comment on column RHN_BD_ITEM_GRP.ID_ITEM_GRP is '项目分组主键';
comment on column RHN_BD_ITEM_GRP.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_GRP.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_GRP.ID_ORG is '机构标识';
comment on column RHN_BD_ITEM_GRP.ID_DEPT_EXEC is '执行科室标识';
comment on column RHN_BD_ITEM_GRP.CD_ITEM_GRP is '编码';
comment on column RHN_BD_ITEM_GRP.NA_ITEM_GRP is '名称';
comment on column RHN_BD_ITEM_GRP.SD_GRP_TYPE is '分组类型';
comment on column RHN_BD_ITEM_GRP.SD_USAGE_TYPE is '用途类型';
comment on column RHN_BD_ITEM_GRP.FG_POINT_OF_CARE is '是否point时点照护';
comment on column RHN_BD_ITEM_GRP.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_GRP.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ITEM_GRP.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ITEM_GRP.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_GRP.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_GRP.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_GRP.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_GRP_MEMBER is '项目分组成员；一行代表一条项目分组成员记录';
comment on column RHN_BD_ITEM_GRP_MEMBER.ID_ITEM_GRP_MEMBER is '项目分组成员主键';
comment on column RHN_BD_ITEM_GRP_MEMBER.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_GRP_MEMBER.ID_ITEM_GRP is '项目分组标识';
comment on column RHN_BD_ITEM_GRP_MEMBER.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_ITEM_GRP_MEMBER.SN_SORT is '排序医嘱';
comment on column RHN_BD_ITEM_GRP_MEMBER.QTY_MEMBER is '数量';
comment on column RHN_BD_ITEM_GRP_MEMBER.CD_UNIT is '单位编码';
comment on column RHN_BD_ITEM_GRP_MEMBER.FG_REQUIRED_MEMBER is '是否应需成员';
comment on column RHN_BD_ITEM_GRP_MEMBER.DES_MEMBER_DESCRIPTION is '成员说明';
comment on table RHN_BD_ITEM_MASTER is '项目主数据；一行代表一条项目主数据记录';
comment on column RHN_BD_ITEM_MASTER.ID_ITEM_MASTER is '项目主数据主键';
comment on column RHN_BD_ITEM_MASTER.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_MASTER.ID_ITEM_TYPE is '项目类型标识';
comment on column RHN_BD_ITEM_MASTER.CD_ITEM_MASTER is '编码';
comment on column RHN_BD_ITEM_MASTER.NA_ITEM_MASTER is '名称';
comment on column RHN_BD_ITEM_MASTER.SD_SUBJECT_TYPE is '主体类型';
comment on column RHN_BD_ITEM_MASTER.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_MASTER.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ITEM_MASTER.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ITEM_MASTER.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_MASTER.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_MASTER.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_MASTER.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_PKG is '项目包装；一行代表一条项目包装记录';
comment on column RHN_BD_ITEM_PKG.ID_ITEM_PKG is '项目包装主键';
comment on column RHN_BD_ITEM_PKG.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_PKG.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_ITEM_PKG.ID_ITEM_PKG_BASE is '基础包装标识';
comment on column RHN_BD_ITEM_PKG.CD_UNIT is '单位编码';
comment on column RHN_BD_ITEM_PKG.NA_UNIT is '单位名称';
comment on column RHN_BD_ITEM_PKG.PACKAGE_SPEC is '包装规格';
comment on column RHN_BD_ITEM_PKG.QTY_FACTOR is '数量换算系数';
comment on column RHN_BD_ITEM_PKG.SD_USAGE_TYPE is '用途类型';
comment on column RHN_BD_ITEM_PKG.CD_BARCODE is '条码';
comment on column RHN_BD_ITEM_PKG.FG_DEFAULT_PURCH is '是否默认采购';
comment on column RHN_BD_ITEM_PKG.FG_DEFAULT_SALE is '是否默认sale';
comment on column RHN_BD_ITEM_PKG.FG_DEFAULT_DISP is '是否默认发药';
comment on column RHN_BD_ITEM_PKG.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_PKG.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ITEM_PKG.DA_VALID_TO is '有效结束日期';
comment on table RHN_BD_ITEM_TERM_MAP is '项目术语映射；一行代表一条项目术语映射记录';
comment on column RHN_BD_ITEM_TERM_MAP.ID_ITEM_TERM_MAP is '项目术语映射主键';
comment on column RHN_BD_ITEM_TERM_MAP.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_TERM_MAP.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_TERM_MAP.ID_ITEM_ATTR_SUBJECT is '属性主体标识';
comment on column RHN_BD_ITEM_TERM_MAP.ID_CONCEPT is '概念标识';
comment on column RHN_BD_ITEM_TERM_MAP.SD_MAP_TYPE is '映射类型';
comment on column RHN_BD_ITEM_TERM_MAP.SD_EQUIVALENCE is '等价关系';
comment on column RHN_BD_ITEM_TERM_MAP.FG_PRIMARY_MAP is '是否主要映射';
comment on column RHN_BD_ITEM_TERM_MAP.DES_LIMITATION is '限制';
comment on column RHN_BD_ITEM_TERM_MAP.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ITEM_TERM_MAP.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ITEM_TERM_MAP.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_TERM_MAP.ID_ITEM_TERM_MAP_REPLACES is '替代映射标识';
comment on column RHN_BD_ITEM_TERM_MAP.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_TERM_MAP.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_TERM_MAP.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_TERM_MAP.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_TYPE is '项目类型；一行代表一条项目类型记录';
comment on column RHN_BD_ITEM_TYPE.ID_ITEM_TYPE is '项目类型主键';
comment on column RHN_BD_ITEM_TYPE.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_TYPE.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_ITEM_TYPE.CD_SCOPE is '范围编码';
comment on column RHN_BD_ITEM_TYPE.ID_TNT is '租户标识';
comment on column RHN_BD_ITEM_TYPE.ID_ITEM_TYPE_PARENT is '上级标识';
comment on column RHN_BD_ITEM_TYPE.CD_ITEM_TYPE is '编码';
comment on column RHN_BD_ITEM_TYPE.NA_ITEM_TYPE is '名称';
comment on column RHN_BD_ITEM_TYPE.DES_ITEM_TYPE is '说明';
comment on column RHN_BD_ITEM_TYPE.SD_SUBJECT_TYPE is '主体类型';
comment on column RHN_BD_ITEM_TYPE.SN_SORT is '排序医嘱';
comment on column RHN_BD_ITEM_TYPE.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_TYPE.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_TYPE.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_TYPE.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_TYPE.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ITEM_TYPE_ATTR is '项目类型属性；一行代表一条项目类型属性记录';
comment on column RHN_BD_ITEM_TYPE_ATTR.ID_ITEM_TYPE_ATTR is '项目类型属性主键';
comment on column RHN_BD_ITEM_TYPE_ATTR.REVISION is '乐观锁修订号';
comment on column RHN_BD_ITEM_TYPE_ATTR.ID_ITEM_TYPE is '项目类型标识';
comment on column RHN_BD_ITEM_TYPE_ATTR.ID_ITEM_ATTR_DEF is '属性定义标识';
comment on column RHN_BD_ITEM_TYPE_ATTR.FG_REQUIRED_VAL is '是否应需值';
comment on column RHN_BD_ITEM_TYPE_ATTR.JSON_DEFAULT is '默认JSON';
comment on column RHN_BD_ITEM_TYPE_ATTR.SD_WIDGET_TYPE is 'widget类型';
comment on column RHN_BD_ITEM_TYPE_ATTR.NA_GRP is '分组名称';
comment on column RHN_BD_ITEM_TYPE_ATTR.SN_GRP_SORT is '分组排序医嘱';
comment on column RHN_BD_ITEM_TYPE_ATTR.SN_ATTR_SORT is '属性排序医嘱';
comment on column RHN_BD_ITEM_TYPE_ATTR.JSON_VISIBLE_COND is 'visible健康问题JSON';
comment on column RHN_BD_ITEM_TYPE_ATTR.JSON_REQUIRED_COND is '应需健康问题JSON';
comment on column RHN_BD_ITEM_TYPE_ATTR.FG_SEARCHABLE is '是否searchable';
comment on column RHN_BD_ITEM_TYPE_ATTR.FG_LIST_DISPLAY is '是否list显示';
comment on column RHN_BD_ITEM_TYPE_ATTR.SD_STATUS is '状态';
comment on column RHN_BD_ITEM_TYPE_ATTR.DT_CREATED is '创建时间';
comment on column RHN_BD_ITEM_TYPE_ATTR.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ITEM_TYPE_ATTR.DT_UPDATED is '更新时间';
comment on column RHN_BD_ITEM_TYPE_ATTR.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_LAB_SVC is '检验服务；一行代表一条检验服务记录';
comment on column RHN_BD_LAB_SVC.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_LAB_SVC.ID_TNT is '租户标识';
comment on column RHN_BD_LAB_SVC.SD_LAB_METHOD is '检验方法';
comment on column RHN_BD_LAB_SVC.QTY_REPORT_DURATION is '报告时长';
comment on column RHN_BD_LAB_SVC.REPORT_DURATION_UNIT is '报告时长单位';
comment on column RHN_BD_LAB_SVC.FG_FASTING_REQUIRED is '是否fasting应需';
comment on column RHN_BD_LAB_SVC.FG_POINT_OF_CARE is '是否point时点照护';
comment on column RHN_BD_LAB_SVC.DES_COLLECTION_DESCRIPTION is 'collection说明';
comment on column RHN_BD_LAB_SVC.REVISION is '乐观锁修订号';
comment on column RHN_BD_LAB_SVC.DT_CREATED is '创建时间';
comment on column RHN_BD_LAB_SVC.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_LAB_SVC.DT_UPDATED is '更新时间';
comment on column RHN_BD_LAB_SVC.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_MED is '药品；一行代表一条药品记录';
comment on column RHN_BD_MED.ID_MED is '药品主键';
comment on column RHN_BD_MED.REVISION is '乐观锁修订号';
comment on column RHN_BD_MED.ID_TNT is '租户标识';
comment on column RHN_BD_MED.CD_MED is '编码';
comment on column RHN_BD_MED.NA_MED is '名称';
comment on column RHN_BD_MED.NA_ALIAS is '别名名称';
comment on column RHN_BD_MED.SD_MED_TYPE is '药品类型';
comment on column RHN_BD_MED.DOSE_FORM is '剂量表单';
comment on column RHN_BD_MED.PREPARATION_SPEC is '制剂规格';
comment on column RHN_BD_MED.PREPARATION_UNIT is '制剂单位';
comment on column RHN_BD_MED.QTY_STRENGTH_VAL is 'strength值';
comment on column RHN_BD_MED.STRENGTH_UNIT is 'strength单位';
comment on column RHN_BD_MED.SD_STORAGE_TYPE is 'storage类型';
comment on column RHN_BD_MED.FG_PRESCRIPTION_DRUG is '是否prescriptiondrug';
comment on column RHN_BD_MED.FG_ESSENTIAL_DRUG is '是否essentialdrug';
comment on column RHN_BD_MED.FG_ANTIMICROBIAL is '是否抗菌药物';
comment on column RHN_BD_MED.SD_ANTIMICROBIAL_LEVEL is '抗菌药物等级';
comment on column RHN_BD_MED.FG_SKIN_TEST_REQUIRED is '是否皮试检测应需';
comment on column RHN_BD_MED.QTY_DEFAULT_DOSE is '默认剂量';
comment on column RHN_BD_MED.DEFAULT_DOSE_UNIT is '默认剂量单位';
comment on column RHN_BD_MED.DEFAULT_ROUTE is '默认途径';
comment on column RHN_BD_MED.DEFAULT_FREQUENCY is '默认频次';
comment on column RHN_BD_MED.FG_CHRONIC_DISEASE_DRUG is '是否chronic疾病drug';
comment on column RHN_BD_MED.FG_SINGLE_ORDER is '是否single医嘱';
comment on column RHN_BD_MED.SD_STATUS is '状态';
comment on column RHN_BD_MED.DT_CREATED is '创建时间';
comment on column RHN_BD_MED.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_MED.DT_UPDATED is '更新时间';
comment on column RHN_BD_MED.ID_USER_UPDATED is '更新人标识';
comment on column RHN_BD_MED.ID_ITEM_TYPE is '项目类型标识';
comment on column RHN_BD_MED.ID_ITEM_MASTER is '项目主数据标识';
comment on column RHN_BD_MED.ID_ORDER_FREQ_DEFAULT is '默认频次标识';
comment on column RHN_BD_MED.ID_CONCEPT_DEFAULT_ROUTE is '默认途径标识';
comment on table RHN_BD_MED_HERBAL is '药品中药；一行代表一条药品中药记录';
comment on column RHN_BD_MED_HERBAL.ID_MED is '药品标识';
comment on column RHN_BD_MED_HERBAL.ID_TNT is '租户标识';
comment on column RHN_BD_MED_HERBAL.ID_DICT_ITEM_MEDICINAL_PART is 'medicinalpart项目标识';
comment on column RHN_BD_MED_HERBAL.SD_PROCESSING_METHOD is 'processing方法';
comment on column RHN_BD_MED_HERBAL.SD_NATURE_TYPE is 'nature类型';
comment on column RHN_BD_MED_HERBAL.DES_FLAVOR_DESCRIPTION is 'flavor说明';
comment on column RHN_BD_MED_HERBAL.DES_MERIDIAN_DESCRIPTION is 'meridian说明';
comment on column RHN_BD_MED_HERBAL.DES_DECOCTION_DESCRIPTION is 'decoction说明';
comment on column RHN_BD_MED_HERBAL.FG_SEPARATE_DECOCTION is '是否separatedecoction';
comment on table RHN_BD_MED_PRODUCT is '药品产品；一行代表一条药品产品记录';
comment on column RHN_BD_MED_PRODUCT.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_MED_PRODUCT.ID_TNT is '租户标识';
comment on column RHN_BD_MED_PRODUCT.ID_MED is '药品标识';
comment on column RHN_BD_MED_PRODUCT.ID_MFR is '生产厂商标识';
comment on column RHN_BD_MED_PRODUCT.NA_TRADE is 'trade名称';
comment on column RHN_BD_MED_PRODUCT.CD_APPROVAL is '审批编码';
comment on column RHN_BD_MED_PRODUCT.DA_APPROVAL_FROM is '审批开始日期';
comment on column RHN_BD_MED_PRODUCT.DA_APPROVAL_TO is '审批结束日期';
comment on column RHN_BD_MED_PRODUCT.CD_REG is '挂号编码';
comment on column RHN_BD_MED_PRODUCT.DA_REG_FROM is '挂号开始日期';
comment on column RHN_BD_MED_PRODUCT.DA_REG_TO is '挂号结束日期';
comment on column RHN_BD_MED_PRODUCT.CD_PURCH is '采购编码';
comment on column RHN_BD_MED_PRODUCT.SD_MARKET_STATUS is 'market状态';
comment on column RHN_BD_MED_PRODUCT.PRODUCTION_PLACE is '生产place';
comment on column RHN_BD_MED_PRODUCT.FG_OTC is '是否otc';
comment on column RHN_BD_MED_PRODUCT.FG_CENTRAL_PURCH is '是否central采购';
comment on column RHN_BD_MED_PRODUCT.FG_IMPORT is '是否导入允许';
comment on column RHN_BD_MED_PRODUCT.FG_TRACE_SPLIT_REQUIRED is '是否追溯拆分应需';
comment on column RHN_BD_MED_PRODUCT.QTY_SHELF_LIFE_VAL is 'shelflife值';
comment on column RHN_BD_MED_PRODUCT.SHELF_LIFE_UNIT is 'shelflife单位';
comment on column RHN_BD_MED_PRODUCT.DES_INDICATION is '适应症';
comment on column RHN_BD_MED_PRODUCT.DES_INSTRUCTION is '用法';
comment on column RHN_BD_MED_PRODUCT.CD_TRACE is '追溯编码';
comment on table RHN_BD_MED_ROUTE_PROF is '药品途径档案；一行代表一条药品途径档案记录';
comment on column RHN_BD_MED_ROUTE_PROF.ID_CONCEPT is '概念标识';
comment on column RHN_BD_MED_ROUTE_PROF.SD_EXEC_TYPE is '执行类型';
comment on table RHN_BD_MED_VACCINE is '药品疫苗；一行代表一条药品疫苗记录';
comment on column RHN_BD_MED_VACCINE.ID_MED is '药品标识';
comment on column RHN_BD_MED_VACCINE.ID_TNT is '租户标识';
comment on column RHN_BD_MED_VACCINE.SD_VACCINE_TYPE is '疫苗类型';
comment on column RHN_BD_MED_VACCINE.QTY_DOSE_SERIES is '剂量series盘点';
comment on column RHN_BD_MED_VACCINE.QTY_MIN_AGE is '最小年龄';
comment on column RHN_BD_MED_VACCINE.QTY_MAX_AGE is '最大年龄';
comment on column RHN_BD_MED_VACCINE.AGE_UNIT is '年龄单位';
comment on column RHN_BD_MED_VACCINE.SD_RECOMMENDED_ROUTE is 'recommended途径';
comment on column RHN_BD_MED_VACCINE.FG_COLD_CHAIN_REQUIRED is '是否coldchain应需';
comment on column RHN_BD_MED_VACCINE.QTY_MIN_TEMPERATURE is '最小温度';
comment on column RHN_BD_MED_VACCINE.QTY_MAX_TEMPERATURE is '最大温度';
comment on column RHN_BD_MED_VACCINE.IMMUNIZATION_SCHEDULE is 'immunization排班';
comment on table RHN_BD_MED_WESTERN is '药品西药；一行代表一条药品西药记录';
comment on column RHN_BD_MED_WESTERN.ID_MED is '药品标识';
comment on column RHN_BD_MED_WESTERN.ID_TNT is '租户标识';
comment on column RHN_BD_MED_WESTERN.ACTIVE_INGREDIENT is '有效ingredient';
comment on column RHN_BD_MED_WESTERN.SD_THERAPEUTIC_CLASS is '治疗class';
comment on column RHN_BD_MED_WESTERN.FG_BIOLOGIC is '是否biologic';
comment on column RHN_BD_MED_WESTERN.FG_BIOSIMILAR is '是否biosimilar';
comment on table RHN_BD_MFR is '生产厂商；一行代表一条生产厂商记录';
comment on column RHN_BD_MFR.ID_MFR is '生产厂商主键';
comment on column RHN_BD_MFR.REVISION is '乐观锁修订号';
comment on column RHN_BD_MFR.ID_TNT is '租户标识';
comment on column RHN_BD_MFR.CD_MFR is '编码';
comment on column RHN_BD_MFR.NA_MFR is '名称';
comment on column RHN_BD_MFR.NA_SHORT is '简称名称';
comment on column RHN_BD_MFR.SD_MFR_TYPE is '生产厂商类型';
comment on column RHN_BD_MFR.PRODUCTION_PLACE is '生产place';
comment on column RHN_BD_MFR.CD_COUNTRY is 'country编码';
comment on column RHN_BD_MFR.DES_ADDR is '地址';
comment on column RHN_BD_MFR.SD_STATUS is '状态';
comment on column RHN_BD_MFR.DT_CREATED is '创建时间';
comment on column RHN_BD_MFR.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_MFR.DT_UPDATED is '更新时间';
comment on column RHN_BD_MFR.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ORDER_FREQ is '医嘱频次；一行代表一条医嘱频次记录';
comment on column RHN_BD_ORDER_FREQ.ID_ORDER_FREQ is '医嘱频次主键';
comment on column RHN_BD_ORDER_FREQ.REVISION is '乐观锁修订号';
comment on column RHN_BD_ORDER_FREQ.ID_TNT is '租户标识';
comment on column RHN_BD_ORDER_FREQ.CD_ORDER_FREQ is '编码';
comment on column RHN_BD_ORDER_FREQ.NA_ORDER_FREQ is '名称';
comment on column RHN_BD_ORDER_FREQ.NA_SHORT is '简称名称';
comment on column RHN_BD_ORDER_FREQ.DES_ORDER_FREQ is '说明';
comment on column RHN_BD_ORDER_FREQ.SD_RULE_TYPE is '规则类型';
comment on column RHN_BD_ORDER_FREQ.QTY_FREQ is '频次盘点';
comment on column RHN_BD_ORDER_FREQ.QTY_PERIOD_VAL is '期间值';
comment on column RHN_BD_ORDER_FREQ.PERIOD_UNIT is '期间单位';
comment on column RHN_BD_ORDER_FREQ.SD_ANCHOR_TYPE is 'anchor类型';
comment on column RHN_BD_ORDER_FREQ.DEFAULT_EXECUTION_TIMES is '默认执行times';
comment on column RHN_BD_ORDER_FREQ.FG_OP_APPLICABLE is '是否门诊适用';
comment on column RHN_BD_ORDER_FREQ.FG_INP_APPLICABLE is '是否住院适用';
comment on column RHN_BD_ORDER_FREQ.FG_EMERGENCY_APPLICABLE is '是否emergency适用';
comment on column RHN_BD_ORDER_FREQ.FG_MED_APPLICABLE is '是否药品适用';
comment on column RHN_BD_ORDER_FREQ.FG_TREAT_APPLICABLE is '是否治疗适用';
comment on column RHN_BD_ORDER_FREQ.FG_NURS_APPLICABLE is '是否护理适用';
comment on column RHN_BD_ORDER_FREQ.FG_AUTOMATIC_TASK_GEN is '是否automatic任务生成';
comment on column RHN_BD_ORDER_FREQ.SN_SORT is '排序医嘱';
comment on column RHN_BD_ORDER_FREQ.SD_STATUS is '状态';
comment on column RHN_BD_ORDER_FREQ.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ORDER_FREQ.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ORDER_FREQ.DT_CREATED is '创建时间';
comment on column RHN_BD_ORDER_FREQ.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ORDER_FREQ.DT_UPDATED is '更新时间';
comment on column RHN_BD_ORDER_FREQ.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ORDER_FREQ_CFG is '医嘱频次配置；一行代表一条医嘱频次配置记录';
comment on column RHN_BD_ORDER_FREQ_CFG.ID_ORDER_FREQ_CFG is '医嘱频次配置主键';
comment on column RHN_BD_ORDER_FREQ_CFG.REVISION is '乐观锁修订号';
comment on column RHN_BD_ORDER_FREQ_CFG.ID_TNT is '租户标识';
comment on column RHN_BD_ORDER_FREQ_CFG.ID_ORG is '机构标识';
comment on column RHN_BD_ORDER_FREQ_CFG.ID_DEPT is '科室标识';
comment on column RHN_BD_ORDER_FREQ_CFG.CD_SCOPE_KEY is '范围键';
comment on column RHN_BD_ORDER_FREQ_CFG.ID_ORDER_FREQ is '频次标识';
comment on column RHN_BD_ORDER_FREQ_CFG.CD_LOCAL is '本地编码';
comment on column RHN_BD_ORDER_FREQ_CFG.NA_LOCAL is '本地名称';
comment on column RHN_BD_ORDER_FREQ_CFG.EXECUTION_TIMES is '执行times';
comment on column RHN_BD_ORDER_FREQ_CFG.SD_FIRST_DAY_POLICY is 'first日策略';
comment on column RHN_BD_ORDER_FREQ_CFG.FG_ENABLED is '是否enabled';
comment on column RHN_BD_ORDER_FREQ_CFG.SD_STATUS is '状态';
comment on column RHN_BD_ORDER_FREQ_CFG.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ORDER_FREQ_CFG.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ORDER_FREQ_CFG.DT_CREATED is '创建时间';
comment on column RHN_BD_ORDER_FREQ_CFG.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ORDER_FREQ_CFG.DT_UPDATED is '更新时间';
comment on column RHN_BD_ORDER_FREQ_CFG.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_ORG_CATALOG_ITEM is '机构目录项目；一行代表一条机构目录项目记录';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_ORG_CATALOG_ITEM is '机构目录项目主键';
comment on column RHN_BD_ORG_CATALOG_ITEM.REVISION is '乐观锁修订号';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_TNT is '租户标识';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_ORG is '机构标识';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_DEPT_DEFAULT is '默认科室标识';
comment on column RHN_BD_ORG_CATALOG_ITEM.CD_LOCAL is '本地编码';
comment on column RHN_BD_ORG_CATALOG_ITEM.NA_LOCAL is '本地名称';
comment on column RHN_BD_ORG_CATALOG_ITEM.FG_ORDERABLE is '是否orderable';
comment on column RHN_BD_ORG_CATALOG_ITEM.FG_EXECUTABLE is '是否executable';
comment on column RHN_BD_ORG_CATALOG_ITEM.FG_CHARGEABLE is '是否chargeable';
comment on column RHN_BD_ORG_CATALOG_ITEM.FG_PURCHASABLE is '是否purchasable';
comment on column RHN_BD_ORG_CATALOG_ITEM.FG_STOCKED is '是否stocked';
comment on column RHN_BD_ORG_CATALOG_ITEM.FG_DISPENSABLE is '是否dispensable';
comment on column RHN_BD_ORG_CATALOG_ITEM.FG_RETURNABLE is '是否returnable';
comment on column RHN_BD_ORG_CATALOG_ITEM.SD_STATUS is '状态';
comment on column RHN_BD_ORG_CATALOG_ITEM.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ORG_CATALOG_ITEM.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ORG_CATALOG_ITEM.DT_CREATED is '创建时间';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ORG_CATALOG_ITEM.DT_UPDATED is '更新时间';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_USER_UPDATED is '更新人标识';
comment on column RHN_BD_ORG_CATALOG_ITEM.ID_ORG_CATALOG_ITEM_REPLACED is '替代采用标识';
comment on table RHN_BD_ORG_CONCEPT is '机构概念；一行代表一条机构概念记录';
comment on column RHN_BD_ORG_CONCEPT.ID_ORG_CONCEPT is '机构概念主键';
comment on column RHN_BD_ORG_CONCEPT.REVISION is '乐观锁修订号';
comment on column RHN_BD_ORG_CONCEPT.ID_TNT is '租户标识';
comment on column RHN_BD_ORG_CONCEPT.ID_ORG is '机构标识';
comment on column RHN_BD_ORG_CONCEPT.ID_CONCEPT is '概念标识';
comment on column RHN_BD_ORG_CONCEPT.CD_LOCAL is '本地编码';
comment on column RHN_BD_ORG_CONCEPT.NA_LOCAL is '本地名称';
comment on column RHN_BD_ORG_CONCEPT.FG_SELECTABLE is '是否selectable';
comment on column RHN_BD_ORG_CONCEPT.FG_FREQUENT is '是否frequent';
comment on column RHN_BD_ORG_CONCEPT.SD_STATUS is '状态';
comment on column RHN_BD_ORG_CONCEPT.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_ORG_CONCEPT.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_ORG_CONCEPT.DT_CREATED is '创建时间';
comment on column RHN_BD_ORG_CONCEPT.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_ORG_CONCEPT.DT_UPDATED is '更新时间';
comment on column RHN_BD_ORG_CONCEPT.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_SUPPLY_ITEM is '供应项目；一行代表一条供应项目记录';
comment on column RHN_BD_SUPPLY_ITEM.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_SUPPLY_ITEM.ID_TNT is '租户标识';
comment on column RHN_BD_SUPPLY_ITEM.CD_UDI_DI is '唯一器械标识器械标识';
comment on column RHN_BD_SUPPLY_ITEM.CD_GENERIC is 'generic编码';
comment on column RHN_BD_SUPPLY_ITEM.NA_GENERIC is 'generic名称';
comment on column RHN_BD_SUPPLY_ITEM.NA_MODEL is 'model名称';
comment on column RHN_BD_SUPPLY_ITEM.DES_SPEC is '规格说明';
comment on column RHN_BD_SUPPLY_ITEM.SD_MATERIAL_TYPE is 'material类型';
comment on column RHN_BD_SUPPLY_ITEM.SD_DEVICE_CLASS is '器械class';
comment on column RHN_BD_SUPPLY_ITEM.FG_HIGH_VAL is '是否上限值';
comment on column RHN_BD_SUPPLY_ITEM.FG_IMPLANT is '是否implant';
comment on column RHN_BD_SUPPLY_ITEM.FG_INTERVENTION is '是否intervention';
comment on column RHN_BD_SUPPLY_ITEM.FG_STERILE is '是否sterile';
comment on column RHN_BD_SUPPLY_ITEM.FG_SINGLE_USE is '是否single用途';
comment on column RHN_BD_SUPPLY_ITEM.CD_REG is '挂号编码';
comment on column RHN_BD_SUPPLY_ITEM.NA_REG is '挂号名称';
comment on column RHN_BD_SUPPLY_ITEM.NA_REGISTRANT is 'registrant名称';
comment on column RHN_BD_SUPPLY_ITEM.DA_REG_FROM is '挂号开始日期';
comment on column RHN_BD_SUPPLY_ITEM.DA_REG_TO is '挂号结束日期';
comment on column RHN_BD_SUPPLY_ITEM.ID_MFR is '生产厂商标识';
comment on column RHN_BD_SUPPLY_ITEM.DES_STRUCTURE_DESCRIPTION is 'structure说明';
comment on column RHN_BD_SUPPLY_ITEM.DES_SCOPE_DESCRIPTION is '范围说明';
comment on column RHN_BD_SUPPLY_ITEM.DES_INSTRUCTION is '用法';
comment on table RHN_BD_SVC_ITEM is '服务项目；一行代表一条服务项目记录';
comment on column RHN_BD_SVC_ITEM.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_SVC_ITEM.ID_TNT is '租户标识';
comment on column RHN_BD_SVC_ITEM.SD_SVC_TYPE is '服务类型';
comment on column RHN_BD_SVC_ITEM.SD_SVC_SUBTYPE is '服务subtype';
comment on column RHN_BD_SVC_ITEM.SD_USAGE_TYPE is '用途类型';
comment on column RHN_BD_SVC_ITEM.FG_MEDICAL_TECHNOLOGY is '是否medicaltechnology';
comment on column RHN_BD_SVC_ITEM.FG_COMBINATION_ITEM is '是否combination项目';
comment on column RHN_BD_SVC_ITEM.FG_SINGLE_ORDER is '是否single医嘱';
comment on column RHN_BD_SVC_ITEM.SD_SPEC_TYPE is '标本类型';
comment on column RHN_BD_SVC_ITEM.SD_EXAM_TYPE is '检查类型';
comment on column RHN_BD_SVC_ITEM.SD_ACCOUNTING_CAT is 'accounting分类';
comment on column RHN_BD_SVC_ITEM.SD_DUPLICATE_RULE is 'duplicate规则';
comment on column RHN_BD_SVC_ITEM.PRICE_MULTI_SITE is 'multi库房单价';
comment on column RHN_BD_SVC_ITEM.QTY_FREE_SITE is 'free库房盘点';
comment on column RHN_BD_SVC_ITEM.QTY_MAX_BODY_SITE is '最大身体部位库房盘点';
comment on column RHN_BD_SVC_ITEM.CD_MUTUAL_RECOGNITION is 'mutualrecognition编码';
comment on column RHN_BD_SVC_ITEM.FG_PREGNANCY_ALERT is '是否pregnancy预警';
comment on column RHN_BD_SVC_ITEM.DES_ATTENTION is '注意事项';
comment on column RHN_BD_SVC_ITEM.DES_EXAM_NOTE is '检查notes';
comment on table RHN_BD_SVC_VAR is '服务变体；一行代表一条服务变体记录';
comment on column RHN_BD_SVC_VAR.ID_SVC_VAR is '服务变体主键';
comment on column RHN_BD_SVC_VAR.ID_TNT is '租户标识';
comment on column RHN_BD_SVC_VAR.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_SVC_VAR.ID_CONCEPT_BODY_SITE is '身体部位库房概念标识';
comment on column RHN_BD_SVC_VAR.CD_SVC_VAR is '编码';
comment on column RHN_BD_SVC_VAR.NA_SVC_VAR is '名称';
comment on column RHN_BD_SVC_VAR.SD_METHOD_TYPE is '方法类型';
comment on column RHN_BD_SVC_VAR.FG_BODY_SITE_REQUIRED is '是否身体部位库房应需';
comment on column RHN_BD_SVC_VAR.CD_MUTUAL_RECOGNITION is 'mutualrecognition编码';
comment on column RHN_BD_SVC_VAR.SN_SORT is '排序医嘱';
comment on column RHN_BD_SVC_VAR.SD_STATUS is '状态';
comment on column RHN_BD_SVC_VAR.REVISION is '乐观锁修订号';
comment on column RHN_BD_SVC_VAR.DT_CREATED is '创建时间';
comment on column RHN_BD_SVC_VAR.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_SVC_VAR.DT_UPDATED is '更新时间';
comment on column RHN_BD_SVC_VAR.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_UNIT_CONV is '单位换算；一行代表一条单位换算记录';
comment on column RHN_BD_UNIT_CONV.ID_UNIT_CONV is '单位换算主键';
comment on column RHN_BD_UNIT_CONV.REVISION is '乐观锁修订号';
comment on column RHN_BD_UNIT_CONV.ID_TNT is '租户标识';
comment on column RHN_BD_UNIT_CONV.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BD_UNIT_CONV.CD_SCOPE is '范围编码';
comment on column RHN_BD_UNIT_CONV.ID_UNIT_DEF_FROM_UNIT is '原单位标识';
comment on column RHN_BD_UNIT_CONV.ID_UNIT_DEF_TO_UNIT is '目标单位标识';
comment on column RHN_BD_UNIT_CONV.FACTOR is '换算系数';
comment on column RHN_BD_UNIT_CONV.OFFSET_VALUE is 'offset值';
comment on column RHN_BD_UNIT_CONV.DA_VALID_FROM is '有效开始日期';
comment on column RHN_BD_UNIT_CONV.DA_VALID_TO is '有效结束日期';
comment on column RHN_BD_UNIT_CONV.SD_STATUS is '状态';
comment on column RHN_BD_UNIT_CONV.DT_CREATED is '创建时间';
comment on column RHN_BD_UNIT_CONV.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_UNIT_CONV.DT_UPDATED is '更新时间';
comment on column RHN_BD_UNIT_CONV.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_UNIT_DEF is '单位定义；一行代表一条单位定义记录';
comment on column RHN_BD_UNIT_DEF.ID_UNIT_DEF is '单位定义主键';
comment on column RHN_BD_UNIT_DEF.REVISION is '乐观锁修订号';
comment on column RHN_BD_UNIT_DEF.ID_TNT is '租户标识';
comment on column RHN_BD_UNIT_DEF.CD_UNIT_DEF is '编码';
comment on column RHN_BD_UNIT_DEF.NA_UNIT_DEF is '名称';
comment on column RHN_BD_UNIT_DEF.SYMBOL is '符号';
comment on column RHN_BD_UNIT_DEF.DIMENSION is '维度';
comment on column RHN_BD_UNIT_DEF.DECIMAL_SCALE is '小数scale';
comment on column RHN_BD_UNIT_DEF.SD_STATUS is '状态';
comment on column RHN_BD_UNIT_DEF.DT_CREATED is '创建时间';
comment on column RHN_BD_UNIT_DEF.ID_USER_CREATED is '创建人标识';
comment on column RHN_BD_UNIT_DEF.DT_UPDATED is '更新时间';
comment on column RHN_BD_UNIT_DEF.ID_USER_UPDATED is '更新人标识';
comment on table RHN_BD_VAL_SET is '值集；一行代表一条值集记录';
comment on column RHN_BD_VAL_SET.ID_VAL_SET is '值集主键';
comment on column RHN_BD_VAL_SET.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_BD_VAL_SET.ID_SCOPE is '范围标识';
comment on column RHN_BD_VAL_SET.CD_VAL_SET is '编码';
comment on column RHN_BD_VAL_SET.NA_VAL_SET is '名称';
comment on column RHN_BD_VAL_SET.CD_VER is '版本编码';
comment on column RHN_BD_VAL_SET.SD_STATUS is '状态';
comment on column RHN_BD_VAL_SET.DA_EFFECTIVE_FROM is '生效开始日期';
comment on column RHN_BD_VAL_SET.DA_EFFECTIVE_TO is '生效结束日期';
comment on column RHN_BD_VAL_SET.DT_CREATED is '创建时间';
comment on table RHN_BD_VAL_SET_MEMBER is '值集成员；一行代表一条值集成员记录';
comment on column RHN_BD_VAL_SET_MEMBER.ID_VAL_SET_MEMBER is '值集成员主键';
comment on column RHN_BD_VAL_SET_MEMBER.ID_VAL_SET is '值集标识';
comment on column RHN_BD_VAL_SET_MEMBER.ID_CONCEPT is '概念标识';
comment on column RHN_BD_VAL_SET_MEMBER.SN_SORT is '排序医嘱';
comment on column RHN_BD_VAL_SET_MEMBER.DT_CREATED is '创建时间';
comment on table RHN_BIL_CASHIER_CLOSE is '收银日结；一行代表一条收银日结记录';
comment on column RHN_BIL_CASHIER_CLOSE.ID_CASHIER_CLOSE is '收银日结主键';
comment on column RHN_BIL_CASHIER_CLOSE.REVISION is '乐观锁修订号';
comment on column RHN_BIL_CASHIER_CLOSE.ID_TNT is '租户标识';
comment on column RHN_BIL_CASHIER_CLOSE.ID_ORG is '机构标识';
comment on column RHN_BIL_CASHIER_CLOSE.ID_CASHIER_USER is '收银用户标识';
comment on column RHN_BIL_CASHIER_CLOSE.ID_CASHIER_CLOSE_REVERSES is '冲正日结标识';
comment on column RHN_BIL_CASHIER_CLOSE.CD_CLOSE_NO is '日结编号';
comment on column RHN_BIL_CASHIER_CLOSE.CD_COMMAND is '命令编码';
comment on column RHN_BIL_CASHIER_CLOSE.CD_TERMINAL is '终端编码';
comment on column RHN_BIL_CASHIER_CLOSE.SD_STATUS is '状态';
comment on column RHN_BIL_CASHIER_CLOSE.DT_RANGE_FROM is '范围开始日期';
comment on column RHN_BIL_CASHIER_CLOSE.DT_RANGE_TO is '范围结束日期';
comment on column RHN_BIL_CASHIER_CLOSE.QTY_TXN is '流水盘点';
comment on column RHN_BIL_CASHIER_CLOSE.AMT_EXPECTED is '预期金额';
comment on column RHN_BIL_CASHIER_CLOSE.AMT_ACTUAL is '实际金额';
comment on column RHN_BIL_CASHIER_CLOSE.AMT_DIFFERENCE is '差额金额';
comment on column RHN_BIL_CASHIER_CLOSE.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_CASHIER_CLOSE.DES_DIFFERENCE_REASON is '差额原因';
comment on column RHN_BIL_CASHIER_CLOSE.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_CASHIER_CLOSE.DT_CREATED is '创建时间';
comment on column RHN_BIL_CASHIER_CLOSE.ID_USER_CONFIRMED is '确认人标识';
comment on column RHN_BIL_CASHIER_CLOSE.DT_CONFIRMED is '确认时间';
comment on table RHN_BIL_CASHIER_CLOSE_EVT is '收银日结事件；一行代表一条收银日结事件记录';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.ID_CASHIER_CLOSE_EVT is '收银日结事件主键';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.ID_TNT is '租户标识';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.ID_CASHIER_CLOSE is '收银日结标识';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.CD_COMMAND is '命令编码';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.DES_REASON is '原因';
comment on column RHN_BIL_CASHIER_CLOSE_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_BIL_CASHIER_CLOSE_ITEM is '收银日结项目；一行代表一条收银日结项目记录';
comment on column RHN_BIL_CASHIER_CLOSE_ITEM.ID_CASHIER_CLOSE_ITEM is '收银日结项目主键';
comment on column RHN_BIL_CASHIER_CLOSE_ITEM.ID_TNT is '租户标识';
comment on column RHN_BIL_CASHIER_CLOSE_ITEM.ID_CASHIER_CLOSE is '收银日结标识';
comment on column RHN_BIL_CASHIER_CLOSE_ITEM.ID_PAY is '支付标识';
comment on column RHN_BIL_CASHIER_CLOSE_ITEM.CD_ITEM_NO is '项目编号';
comment on column RHN_BIL_CASHIER_CLOSE_ITEM.AMT_ITEM is '项目金额';
comment on column RHN_BIL_CASHIER_CLOSE_ITEM.CD_CURRENCY is '币种编码';
comment on table RHN_BIL_CASHIER_CLOSE_LINE is '收银日结明细；一行代表一条收银日结明细记录';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.ID_CASHIER_CLOSE_LINE is '收银日结明细主键';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.ID_TNT is '租户标识';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.ID_CASHIER_CLOSE is '收银日结标识';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.SN_LINE is '明细编号';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.CD_PAY_METHOD is '支付方法编码';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.SD_CLOSE_LINE_TYPE is '日结明细类型';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.QTY_TXN is '流水盘点';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.AMT_EXPECTED is '预期金额';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.AMT_ACTUAL is '实际金额';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.AMT_DIFFERENCE is '差额金额';
comment on column RHN_BIL_CASHIER_CLOSE_LINE.CD_CURRENCY is '币种编码';
comment on table RHN_BIL_CHARGE_ITEM is '收费项目；一行代表一条收费项目记录';
comment on column RHN_BIL_CHARGE_ITEM.ID_CHARGE_ITEM is '收费项目主键';
comment on column RHN_BIL_CHARGE_ITEM.ID_TNT is '租户标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_PAT is '患者标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_ENC is '就诊标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_CARE_REQ is '请求标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_CARE_EVT is '照护事件标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BIL_CHARGE_ITEM.SD_SRC_TYPE is '来源类型';
comment on column RHN_BIL_CHARGE_ITEM.ID_SRC is '来源标识';
comment on column RHN_BIL_CHARGE_ITEM.CD_REQ is '请求编码';
comment on column RHN_BIL_CHARGE_ITEM.SD_STATUS is '状态';
comment on column RHN_BIL_CHARGE_ITEM.QTY_CHARGE is '数量';
comment on column RHN_BIL_CHARGE_ITEM.CD_UNIT is '单位编码';
comment on column RHN_BIL_CHARGE_ITEM.PRICE_UNIT is '单位单价';
comment on column RHN_BIL_CHARGE_ITEM.AMT_TOTAL is '总计金额';
comment on column RHN_BIL_CHARGE_ITEM.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_CHARGE_ITEM.ID_PRICE is '价格标识';
comment on column RHN_BIL_CHARGE_ITEM.SN_PRICE_VER is '价格修订';
comment on column RHN_BIL_CHARGE_ITEM.SD_PRICE_TYPE is '价格类型';
comment on column RHN_BIL_CHARGE_ITEM.CD_ITEM_SNAP is '项目编码快照';
comment on column RHN_BIL_CHARGE_ITEM.NA_ITEM_SNAP is '项目名称快照';
comment on column RHN_BIL_CHARGE_ITEM.DT_OCCURRED is '发生时间';
comment on column RHN_BIL_CHARGE_ITEM.ID_USER_ENTERED is 'entered人标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_CHARGE_ITEM_REVERSES is '冲正收费项目标识';
comment on table RHN_BIL_CHARGE_ITEM_COMP is '收费项目组成；一行代表一条收费项目组成记录';
comment on column RHN_BIL_CHARGE_ITEM_COMP.ID_CHARGE_ITEM_COMP is '收费项目组成主键';
comment on column RHN_BIL_CHARGE_ITEM_COMP.ID_TNT is '租户标识';
comment on column RHN_BIL_CHARGE_ITEM_COMP.ID_CHARGE_ITEM is '收费项目标识';
comment on column RHN_BIL_CHARGE_ITEM_COMP.SN_LINE is '明细编号';
comment on column RHN_BIL_CHARGE_ITEM_COMP.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BIL_CHARGE_ITEM_COMP.CD_ITEM_SNAP is '项目编码快照';
comment on column RHN_BIL_CHARGE_ITEM_COMP.NA_ITEM_SNAP is '项目名称快照';
comment on column RHN_BIL_CHARGE_ITEM_COMP.CD_BODY_SITE is '身体部位库房编码';
comment on column RHN_BIL_CHARGE_ITEM_COMP.QTY_COMPONENT is '数量';
comment on column RHN_BIL_CHARGE_ITEM_COMP.CD_UNIT is '单位编码';
comment on column RHN_BIL_CHARGE_ITEM_COMP.UNIT_FACTOR is '单位换算系数';
comment on column RHN_BIL_CHARGE_ITEM_COMP.PRICE_UNIT is '单位单价';
comment on column RHN_BIL_CHARGE_ITEM_COMP.AMT_COMPONENT is '金额';
comment on table RHN_BIL_INVOICE is '发票；一行代表一条发票记录';
comment on column RHN_BIL_INVOICE.ID_INVOICE is '发票主键';
comment on column RHN_BIL_INVOICE.ID_TNT is '租户标识';
comment on column RHN_BIL_INVOICE.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_BIL_INVOICE.CD_INVOICE_NO is '发票编号';
comment on column RHN_BIL_INVOICE.SD_INVOICE_TYPE is '发票类型';
comment on column RHN_BIL_INVOICE.SD_STATUS is '状态';
comment on column RHN_BIL_INVOICE.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_INVOICE.AMT_GROSS is '总额金额';
comment on column RHN_BIL_INVOICE.AMT_DISCOUNT is 'discount金额';
comment on column RHN_BIL_INVOICE.AMT_NET is 'net金额';
comment on column RHN_BIL_INVOICE.DT_ISSUED is '签发时间';
comment on column RHN_BIL_INVOICE.ID_USER_ISSUED is '签发人标识';
comment on column RHN_BIL_INVOICE.DT_CANCELLED is '取消时间';
comment on column RHN_BIL_INVOICE.DES_CANCELLATION_REASON is 'cancellation原因';
comment on table RHN_BIL_INVOICE_CAT_SUM is '发票分类汇总；一行代表一条发票分类汇总记录';
comment on column RHN_BIL_INVOICE_CAT_SUM.ID_INVOICE_CAT_SUM is '发票分类汇总主键';
comment on column RHN_BIL_INVOICE_CAT_SUM.ID_TNT is '租户标识';
comment on column RHN_BIL_INVOICE_CAT_SUM.ID_INVOICE is '发票标识';
comment on column RHN_BIL_INVOICE_CAT_SUM.CD_CAT is '分类编码';
comment on column RHN_BIL_INVOICE_CAT_SUM.NA_CAT_SNAP is '分类名称快照';
comment on column RHN_BIL_INVOICE_CAT_SUM.AMT_CATEGORY is '金额';
comment on table RHN_BIL_INVOICE_LINE is '发票明细；一行代表一条发票明细记录';
comment on column RHN_BIL_INVOICE_LINE.ID_INVOICE_LINE is '发票明细主键';
comment on column RHN_BIL_INVOICE_LINE.ID_TNT is '租户标识';
comment on column RHN_BIL_INVOICE_LINE.ID_INVOICE is '发票标识';
comment on column RHN_BIL_INVOICE_LINE.ID_CHARGE_ITEM is '收费项目标识';
comment on column RHN_BIL_INVOICE_LINE.SN_LINE is '明细编号';
comment on column RHN_BIL_INVOICE_LINE.AMT_LINE is '金额';
comment on table RHN_BIL_LEDGER_ENTRY is '台账分录；一行代表一条台账分录记录';
comment on column RHN_BIL_LEDGER_ENTRY.ID_LEDGER_ENTRY is '台账分录主键';
comment on column RHN_BIL_LEDGER_ENTRY.ID_TNT is '租户标识';
comment on column RHN_BIL_LEDGER_ENTRY.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_BIL_LEDGER_ENTRY.SD_ENTRY_TYPE is '分录类型';
comment on column RHN_BIL_LEDGER_ENTRY.SD_DIRECTION is '方向';
comment on column RHN_BIL_LEDGER_ENTRY.AMT_ENTRY is '金额';
comment on column RHN_BIL_LEDGER_ENTRY.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_LEDGER_ENTRY.ID_CHARGE_ITEM is '收费项目标识';
comment on column RHN_BIL_LEDGER_ENTRY.ID_INVOICE is '发票标识';
comment on column RHN_BIL_LEDGER_ENTRY.ID_PAY is '支付标识';
comment on column RHN_BIL_LEDGER_ENTRY.ID_LEDGER_ENTRY_REVERSES is '冲正台账分录标识';
comment on column RHN_BIL_LEDGER_ENTRY.DT_OCCURRED is '发生时间';
comment on column RHN_BIL_LEDGER_ENTRY.DT_RECORDED is '记录时间';
comment on column RHN_BIL_LEDGER_ENTRY.ID_USER_RECORDED is '记录人标识';
comment on column RHN_BIL_LEDGER_ENTRY.ID_CLAIM_RESP is '理赔响应标识';
comment on table RHN_BIL_PAT_ACCT is '患者账户；一行代表一条患者账户记录';
comment on column RHN_BIL_PAT_ACCT.ID_PAT_ACCT is '患者账户主键';
comment on column RHN_BIL_PAT_ACCT.REVISION is '乐观锁修订号';
comment on column RHN_BIL_PAT_ACCT.ID_TNT is '租户标识';
comment on column RHN_BIL_PAT_ACCT.ID_PAT is '患者标识';
comment on column RHN_BIL_PAT_ACCT.ID_ENC is '就诊标识';
comment on column RHN_BIL_PAT_ACCT.ID_ORG is '机构标识';
comment on column RHN_BIL_PAT_ACCT.ID_DEPT is '科室标识';
comment on column RHN_BIL_PAT_ACCT.SD_ACCT_TYPE is '账户类型';
comment on column RHN_BIL_PAT_ACCT.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_PAT_ACCT.SD_STATUS is '状态';
comment on column RHN_BIL_PAT_ACCT.DT_OPENED is 'opened时间';
comment on column RHN_BIL_PAT_ACCT.DT_CLOSED is '关闭时间';
comment on table RHN_BIL_PAY is '支付；一行代表一条支付记录';
comment on column RHN_BIL_PAY.ID_PAY is '支付主键';
comment on column RHN_BIL_PAY.ID_TNT is '租户标识';
comment on column RHN_BIL_PAY.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_BIL_PAY.ID_INVOICE is '发票标识';
comment on column RHN_BIL_PAY.CD_PAY_NO is '支付编号';
comment on column RHN_BIL_PAY.SD_PAY_TYPE is '支付类型';
comment on column RHN_BIL_PAY.CD_PAY_METHOD is '支付方法编码';
comment on column RHN_BIL_PAY.SD_STATUS is '状态';
comment on column RHN_BIL_PAY.AMT_PAYMENT is '金额';
comment on column RHN_BIL_PAY.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_PAY.DT_PAID is 'paid时间';
comment on column RHN_BIL_PAY.CD_EXT_TXN_NO is '外部流水编号';
comment on column RHN_BIL_PAY.ID_PAY_REVERSES is '冲正支付标识';
comment on column RHN_BIL_PAY.ID_USER_ENTERED is 'entered人标识';
comment on column RHN_BIL_PAY.DES_PAY is '说明';
comment on column RHN_BIL_PAY.ID_PAY_ORDER is '支付医嘱标识';
comment on column RHN_BIL_PAY.CD_PAY_SCENE is '支付场景编码';
comment on table RHN_BIL_PAY_EVT is '支付事件；一行代表一条支付事件记录';
comment on column RHN_BIL_PAY_EVT.ID_PAY_EVT is '支付事件主键';
comment on column RHN_BIL_PAY_EVT.ID_TNT is '租户标识';
comment on column RHN_BIL_PAY_EVT.ID_PAY_ORDER is '支付医嘱标识';
comment on column RHN_BIL_PAY_EVT.ID_EXT_MSG is '外部消息标识';
comment on column RHN_BIL_PAY_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_BIL_PAY_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_BIL_PAY_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_BIL_PAY_EVT.CD_COMMAND is '命令编码';
comment on column RHN_BIL_PAY_EVT.CD_EXT_TXN_NO is '外部流水编号';
comment on column RHN_BIL_PAY_EVT.AMT_EVT is '事件金额';
comment on column RHN_BIL_PAY_EVT.CD_ERROR is '错误编码';
comment on column RHN_BIL_PAY_EVT.DES_ERROR_MSG is '错误消息';
comment on column RHN_BIL_PAY_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_BIL_PAY_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_BIL_PAY_ORDER is '支付医嘱；一行代表一条支付医嘱记录';
comment on column RHN_BIL_PAY_ORDER.ID_PAY_ORDER is '支付医嘱主键';
comment on column RHN_BIL_PAY_ORDER.REVISION is '乐观锁修订号';
comment on column RHN_BIL_PAY_ORDER.ID_TNT is '租户标识';
comment on column RHN_BIL_PAY_ORDER.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_BIL_PAY_ORDER.ID_INVOICE is '发票标识';
comment on column RHN_BIL_PAY_ORDER.ID_PAY_ORIGINAL is '原支付标识';
comment on column RHN_BIL_PAY_ORDER.CD_ORDER_NO is '医嘱编号';
comment on column RHN_BIL_PAY_ORDER.CD_IDEMP_KEY is '幂等键';
comment on column RHN_BIL_PAY_ORDER.SD_BUSINESS_SCENE is '业务场景';
comment on column RHN_BIL_PAY_ORDER.CD_PAY_SCENE is '支付场景编码';
comment on column RHN_BIL_PAY_ORDER.CD_PAY_METHOD is '支付方法编码';
comment on column RHN_BIL_PAY_ORDER.NA_PAY_METHOD_SNAP is '支付方法名称快照';
comment on column RHN_BIL_PAY_ORDER.SD_ORDER_TYPE is '医嘱类型';
comment on column RHN_BIL_PAY_ORDER.SD_STATUS is '状态';
comment on column RHN_BIL_PAY_ORDER.AMT_REQUESTED is '申请金额';
comment on column RHN_BIL_PAY_ORDER.AMT_CAPTURED is 'captured金额';
comment on column RHN_BIL_PAY_ORDER.AMT_REFUNDED is 'refunded金额';
comment on column RHN_BIL_PAY_ORDER.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_PAY_ORDER.CD_EXT_ORDER_NO is '外部医嘱编号';
comment on column RHN_BIL_PAY_ORDER.ID_CORRELATION is '关联标识';
comment on column RHN_BIL_PAY_ORDER.CD_TERMINAL is '终端编码';
comment on column RHN_BIL_PAY_ORDER.DT_EXPIRES is '到期时间';
comment on column RHN_BIL_PAY_ORDER.DT_CREATED is '创建时间';
comment on column RHN_BIL_PAY_ORDER.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_PAY_ORDER.DT_UPDATED is '更新时间';
comment on column RHN_BIL_PAY_ORDER.CD_ERROR is '错误编码';
comment on column RHN_BIL_PAY_ORDER.DES_ERROR_MSG is '错误消息';
comment on table RHN_BIL_RCPT is '票据；一行代表一条票据记录';
comment on column RHN_BIL_RCPT.ID_RCPT is '票据主键';
comment on column RHN_BIL_RCPT.REVISION is '乐观锁修订号';
comment on column RHN_BIL_RCPT.ID_TNT is '租户标识';
comment on column RHN_BIL_RCPT.ID_STL is '结算标识';
comment on column RHN_BIL_RCPT.ID_RCPT_REVERSES is '冲正票据标识';
comment on column RHN_BIL_RCPT.CD_RCPT_NO is '票据编号';
comment on column RHN_BIL_RCPT.CD_COMMAND is '命令编码';
comment on column RHN_BIL_RCPT.SD_RCPT_TYPE is '票据类型';
comment on column RHN_BIL_RCPT.SD_STATUS is '状态';
comment on column RHN_BIL_RCPT.CD_FISCAL_AUTHORITY is 'fiscal授权机构编码';
comment on column RHN_BIL_RCPT.CD_FISCAL is 'fiscal编码';
comment on column RHN_BIL_RCPT.CD_FISCAL_NUMBER is 'fiscal编号';
comment on column RHN_BIL_RCPT.CD_VERIFICATION is '验证编码';
comment on column RHN_BIL_RCPT.CONTROLLED_OBJECT_REFERENCE is '受控对象参考';
comment on column RHN_BIL_RCPT.AMT_RCPT is '票据金额';
comment on column RHN_BIL_RCPT.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_RCPT.SD_ISSUE_CHANNEL is '问题channel';
comment on column RHN_BIL_RCPT.NA_PAYER_SNAP is '付款方名称快照';
comment on column RHN_BIL_RCPT.HASH_PAYER_IDENTITY is '付款方身份摘要';
comment on column RHN_BIL_RCPT.ID_CORRELATION is '关联标识';
comment on column RHN_BIL_RCPT.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_RCPT.DT_CREATED is '创建时间';
comment on column RHN_BIL_RCPT.DT_ISSUED is '签发时间';
comment on column RHN_BIL_RCPT.DT_UPDATED is '更新时间';
comment on column RHN_BIL_RCPT.CD_ERROR is '错误编码';
comment on column RHN_BIL_RCPT.DES_ERROR_MSG is '错误消息';
comment on column RHN_BIL_RCPT.CD_EXT_RCPT_NO is '外部票据编号';
comment on table RHN_BIL_RCPT_EVT is '票据事件；一行代表一条票据事件记录';
comment on column RHN_BIL_RCPT_EVT.ID_RCPT_EVT is '票据事件主键';
comment on column RHN_BIL_RCPT_EVT.ID_TNT is '租户标识';
comment on column RHN_BIL_RCPT_EVT.ID_RCPT is '票据标识';
comment on column RHN_BIL_RCPT_EVT.ID_EXT_MSG is '外部消息标识';
comment on column RHN_BIL_RCPT_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_BIL_RCPT_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_BIL_RCPT_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_BIL_RCPT_EVT.CD_COMMAND is '命令编码';
comment on column RHN_BIL_RCPT_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_BIL_RCPT_EVT.CD_ERROR is '错误编码';
comment on column RHN_BIL_RCPT_EVT.DES_ERROR_MSG is '错误消息';
comment on column RHN_BIL_RCPT_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_BIL_RCPT_EVT.DES_ACTION_REASON is '操作原因';
comment on table RHN_BIL_RECON_BATCH is '核对批次；一行代表一条核对批次记录';
comment on column RHN_BIL_RECON_BATCH.ID_RECON_BATCH is '核对批次主键';
comment on column RHN_BIL_RECON_BATCH.REVISION is '乐观锁修订号';
comment on column RHN_BIL_RECON_BATCH.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_BATCH.ID_ORG is '机构标识';
comment on column RHN_BIL_RECON_BATCH.ID_EXT_MSG is '外部消息标识';
comment on column RHN_BIL_RECON_BATCH.CD_BATCH_NO is '批次编号';
comment on column RHN_BIL_RECON_BATCH.CD_COMMAND is '命令编码';
comment on column RHN_BIL_RECON_BATCH.SD_RECON_TYPE is '核对类型';
comment on column RHN_BIL_RECON_BATCH.SD_STATUS is '状态';
comment on column RHN_BIL_RECON_BATCH.CD_SRC is '来源编码';
comment on column RHN_BIL_RECON_BATCH.CD_PAY_METHOD is '支付方法编码';
comment on column RHN_BIL_RECON_BATCH.CD_EXT_BATCH_NO is '外部批次编号';
comment on column RHN_BIL_RECON_BATCH.DA_BUSINESS is '业务日期';
comment on column RHN_BIL_RECON_BATCH.QTY_LOCAL is '本地盘点';
comment on column RHN_BIL_RECON_BATCH.QTY_EXT is '外部盘点';
comment on column RHN_BIL_RECON_BATCH.QTY_DIFFERENCE is '差额盘点';
comment on column RHN_BIL_RECON_BATCH.AMT_LOCAL is '本地金额';
comment on column RHN_BIL_RECON_BATCH.AMT_EXT is '外部金额';
comment on column RHN_BIL_RECON_BATCH.AMT_DIFFERENCE is '差额金额';
comment on column RHN_BIL_RECON_BATCH.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_RECON_BATCH.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_RECON_BATCH.DT_CREATED is '创建时间';
comment on column RHN_BIL_RECON_BATCH.ID_USER_COMPLETED is '完成人标识';
comment on column RHN_BIL_RECON_BATCH.DT_COMPLETED is '完成时间';
comment on table RHN_BIL_RECON_ITEM is '核对项目；一行代表一条核对项目记录';
comment on column RHN_BIL_RECON_ITEM.ID_RECON_ITEM is '核对项目主键';
comment on column RHN_BIL_RECON_ITEM.REVISION is '乐观锁修订号';
comment on column RHN_BIL_RECON_ITEM.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_ITEM.ID_RECON_BATCH is '核对批次标识';
comment on column RHN_BIL_RECON_ITEM.ID_PAY is '支付标识';
comment on column RHN_BIL_RECON_ITEM.ID_CASHIER_CLOSE is '收银日结标识';
comment on column RHN_BIL_RECON_ITEM.ID_RCPT is '票据标识';
comment on column RHN_BIL_RECON_ITEM.CD_EXT_TXN_NO is '外部流水编号';
comment on column RHN_BIL_RECON_ITEM.SD_MATCH_TYPE is '匹配类型';
comment on column RHN_BIL_RECON_ITEM.SD_STATUS is '状态';
comment on column RHN_BIL_RECON_ITEM.AMT_LOCAL is '本地金额';
comment on column RHN_BIL_RECON_ITEM.AMT_EXT is '外部金额';
comment on column RHN_BIL_RECON_ITEM.AMT_DIFFERENCE is '差额金额';
comment on column RHN_BIL_RECON_ITEM.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_RECON_ITEM.ID_OWNER is '责任方标识';
comment on column RHN_BIL_RECON_ITEM.ID_USER_RESOLVED is '已解决人标识';
comment on column RHN_BIL_RECON_ITEM.DT_RESOLVED is '已解决时间';
comment on column RHN_BIL_RECON_ITEM.DES_RESOLUTION is '处理结果';
comment on table RHN_BIL_RECON_ITEM_EVT is '核对项目事件；一行代表一条核对项目事件记录';
comment on column RHN_BIL_RECON_ITEM_EVT.ID_RECON_ITEM_EVT is '核对项目事件主键';
comment on column RHN_BIL_RECON_ITEM_EVT.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_ITEM_EVT.ID_RECON_ITEM is '核对项目标识';
comment on column RHN_BIL_RECON_ITEM_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_BIL_RECON_ITEM_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_BIL_RECON_ITEM_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_BIL_RECON_ITEM_EVT.CD_COMMAND is '命令编码';
comment on column RHN_BIL_RECON_ITEM_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_BIL_RECON_ITEM_EVT.DES_REASON is '原因';
comment on column RHN_BIL_RECON_ITEM_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_BIL_REG_BIL_INTENT is '挂号计费意图；一行代表一条挂号计费意图记录';
comment on column RHN_BIL_REG_BIL_INTENT.ID_REG_BIL_INTENT is '挂号计费意图主键';
comment on column RHN_BIL_REG_BIL_INTENT.REVISION is '乐观锁修订号';
comment on column RHN_BIL_REG_BIL_INTENT.ID_TNT is '租户标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_PAT is '患者标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_ORG is '机构标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_DEPT is '科室标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_SVC_SCHED is '排班标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_SCHED_SLOT_HOLD is '号源占用标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_STL is '结算标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_PAY_ORDER is '支付医嘱标识';
comment on column RHN_BIL_REG_BIL_INTENT.ID_ENC is '就诊标识';
comment on column RHN_BIL_REG_BIL_INTENT.CD_IDEMP is '幂等编码';
comment on column RHN_BIL_REG_BIL_INTENT.SD_REG_SRC is '挂号来源';
comment on column RHN_BIL_REG_BIL_INTENT.SD_VISIT_TYPE is 'visit类型';
comment on column RHN_BIL_REG_BIL_INTENT.SD_STATUS is '状态';
comment on column RHN_BIL_REG_BIL_INTENT.AMT_FEE is 'fee金额';
comment on column RHN_BIL_REG_BIL_INTENT.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_REG_BIL_INTENT.CD_ITEM_SNAP is '项目编码快照';
comment on column RHN_BIL_REG_BIL_INTENT.NA_ITEM_SNAP is '项目名称快照';
comment on column RHN_BIL_REG_BIL_INTENT.DT_EXPIRES is '到期时间';
comment on column RHN_BIL_REG_BIL_INTENT.QTY_COMP_ATTEMPTS is '完成attempts';
comment on column RHN_BIL_REG_BIL_INTENT.CD_LAST_ERROR is 'last错误编码';
comment on column RHN_BIL_REG_BIL_INTENT.DES_LAST_ERROR_MSG is 'last错误消息';
comment on column RHN_BIL_REG_BIL_INTENT.DT_CREATED is '创建时间';
comment on column RHN_BIL_REG_BIL_INTENT.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_REG_BIL_INTENT.DT_UPDATED is '更新时间';
comment on column RHN_BIL_REG_BIL_INTENT.DT_COMPLETED is '完成时间';
comment on column RHN_BIL_REG_BIL_INTENT.ID_APPT is '预约标识';
comment on column RHN_BIL_REG_BIL_INTENT.SD_STL_MODE is '结算模式';
comment on column RHN_BIL_REG_BIL_INTENT.ID_PAT_COVER is '保障标识';
comment on column RHN_BIL_REG_BIL_INTENT.CD_COVER_TYPE_SNAP is '保障类型编码快照';
comment on column RHN_BIL_REG_BIL_INTENT.NA_COVER_PAYER_SNAP is '保障付款方名称快照';
comment on table RHN_BIL_STL is '结算；一行代表一条结算记录';
comment on column RHN_BIL_STL.ID_STL is '结算主键';
comment on column RHN_BIL_STL.REVISION is '乐观锁修订号';
comment on column RHN_BIL_STL.ID_TNT is '租户标识';
comment on column RHN_BIL_STL.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_BIL_STL.ID_STL_REVERSES is '冲正结算标识';
comment on column RHN_BIL_STL.ID_INVOICE_LEGACY is 'legacy发票标识';
comment on column RHN_BIL_STL.CD_STL_NO is '结算编号';
comment on column RHN_BIL_STL.CD_COMMAND is '命令编码';
comment on column RHN_BIL_STL.SD_STL_TYPE is '结算类型';
comment on column RHN_BIL_STL.SD_STL_SCENE is '结算场景';
comment on column RHN_BIL_STL.SD_TERMINAL_SCENE is '终端场景';
comment on column RHN_BIL_STL.SD_STATUS is '状态';
comment on column RHN_BIL_STL.AMT_GROSS is '总额金额';
comment on column RHN_BIL_STL.AMT_DISCOUNT is 'discount金额';
comment on column RHN_BIL_STL.AMT_INS is '医保金额';
comment on column RHN_BIL_STL.AMT_PAT is '患者金额';
comment on column RHN_BIL_STL.AMT_OTHER is 'other金额';
comment on column RHN_BIL_STL.AMT_ROUNDING is '舍入金额';
comment on column RHN_BIL_STL.AMT_NET is 'net金额';
comment on column RHN_BIL_STL.CD_CURRENCY is '币种编码';
comment on column RHN_BIL_STL.CD_TERMINAL is '终端编码';
comment on column RHN_BIL_STL.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_STL.DT_CREATED is '创建时间';
comment on column RHN_BIL_STL.ID_USER_FINALIZED is 'finalized人标识';
comment on column RHN_BIL_STL.DT_FINALIZED is 'finalized时间';
comment on column RHN_BIL_STL.CD_ERROR is '错误编码';
comment on column RHN_BIL_STL.DES_ERROR_MSG is '错误消息';
comment on table RHN_BIL_STL_CAT_SUM is '结算分类汇总；一行代表一条结算分类汇总记录';
comment on column RHN_BIL_STL_CAT_SUM.ID_STL_CAT_SUM is '结算分类汇总主键';
comment on column RHN_BIL_STL_CAT_SUM.ID_TNT is '租户标识';
comment on column RHN_BIL_STL_CAT_SUM.ID_STL is '结算标识';
comment on column RHN_BIL_STL_CAT_SUM.CD_CAT is '分类编码';
comment on column RHN_BIL_STL_CAT_SUM.NA_CAT_SNAP is '分类名称快照';
comment on column RHN_BIL_STL_CAT_SUM.AMT_CAT is '分类金额';
comment on column RHN_BIL_STL_CAT_SUM.DT_AS_OF is '截至时点';
comment on table RHN_BIL_STL_EVT is '结算事件；一行代表一条结算事件记录';
comment on column RHN_BIL_STL_EVT.ID_STL_EVT is '结算事件主键';
comment on column RHN_BIL_STL_EVT.ID_TNT is '租户标识';
comment on column RHN_BIL_STL_EVT.ID_STL is '结算标识';
comment on column RHN_BIL_STL_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_BIL_STL_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_BIL_STL_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_BIL_STL_EVT.CD_COMMAND is '命令编码';
comment on column RHN_BIL_STL_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_BIL_STL_EVT.CD_ERROR is '错误编码';
comment on column RHN_BIL_STL_EVT.DES_ERROR_MSG is '错误消息';
comment on column RHN_BIL_STL_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_BIL_STL_LINE is '结算明细；一行代表一条结算明细记录';
comment on column RHN_BIL_STL_LINE.ID_STL_LINE is '结算明细主键';
comment on column RHN_BIL_STL_LINE.ID_TNT is '租户标识';
comment on column RHN_BIL_STL_LINE.ID_STL is '结算标识';
comment on column RHN_BIL_STL_LINE.ID_CHARGE_ITEM is '收费项目标识';
comment on column RHN_BIL_STL_LINE.ID_INVOICE_LINE_LEGACY is 'legacy发票明细标识';
comment on column RHN_BIL_STL_LINE.SN_LINE is '明细编号';
comment on column RHN_BIL_STL_LINE.QTY_SETTLED is 'settled数量';
comment on column RHN_BIL_STL_LINE.AMT_GROSS is '总额金额';
comment on column RHN_BIL_STL_LINE.AMT_DISCOUNT is 'discount金额';
comment on column RHN_BIL_STL_LINE.AMT_INS is '医保金额';
comment on column RHN_BIL_STL_LINE.AMT_PAT is '患者金额';
comment on column RHN_BIL_STL_LINE.AMT_OTHER is 'other金额';
comment on column RHN_BIL_STL_LINE.AMT_NET is 'net金额';
comment on table RHN_BIL_STL_TENDER is '结算收款方式；一行代表一条结算收款方式记录';
comment on column RHN_BIL_STL_TENDER.ID_STL_TENDER is '结算收款方式主键';
comment on column RHN_BIL_STL_TENDER.ID_TNT is '租户标识';
comment on column RHN_BIL_STL_TENDER.ID_STL is '结算标识';
comment on column RHN_BIL_STL_TENDER.ID_PAY is '支付标识';
comment on column RHN_BIL_STL_TENDER.ID_CLAIM_RESP is '理赔响应标识';
comment on column RHN_BIL_STL_TENDER.SN_LINE is '明细编号';
comment on column RHN_BIL_STL_TENDER.SD_TENDER_TYPE is '收款方式类型';
comment on column RHN_BIL_STL_TENDER.CD_PAYER is '付款方编码';
comment on column RHN_BIL_STL_TENDER.NA_PAYER_SNAP is '付款方名称快照';
comment on column RHN_BIL_STL_TENDER.AMT_TENDER is '收款方式金额';
comment on column RHN_BIL_STL_TENDER.CD_CURRENCY is '币种编码';
comment on table RHN_EX_CARE_REQ is '照护请求；一行代表一条照护请求记录';
comment on column RHN_EX_CARE_REQ.ID_CARE_REQ is '照护请求主键';
comment on column RHN_EX_CARE_REQ.REVISION is '乐观锁修订号';
comment on column RHN_EX_CARE_REQ.ID_TNT is '租户标识';
comment on column RHN_EX_CARE_REQ.ID_PAT is '患者标识';
comment on column RHN_EX_CARE_REQ.ID_ENC is '就诊标识';
comment on column RHN_EX_CARE_REQ.CD_REQ_NO is '请求编号';
comment on column RHN_EX_CARE_REQ.SD_REQ_KIND is '请求kind';
comment on column RHN_EX_CARE_REQ.SD_STATUS is '状态';
comment on column RHN_EX_CARE_REQ.CD_INTENT is '意图编码';
comment on column RHN_EX_CARE_REQ.CD_PRIORITY is '优先级编码';
comment on column RHN_EX_CARE_REQ.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_EX_CARE_REQ.ID_ITEM_PKG is '包装标识';
comment on column RHN_EX_CARE_REQ.ID_ORG_PERFORMER is '执行人机构标识';
comment on column RHN_EX_CARE_REQ.ID_DEPT_PERFORMER is '执行人科室标识';
comment on column RHN_EX_CARE_REQ.DA_BUSINESS is '业务日期';
comment on column RHN_EX_CARE_REQ.DT_AUTHORED is '开立时间';
comment on column RHN_EX_CARE_REQ.ID_USER_AUTHORED is '开立人标识';
comment on column RHN_EX_CARE_REQ.DES_REASON is '原因文本';
comment on column RHN_EX_CARE_REQ.DT_CANCELLED is '取消时间';
comment on column RHN_EX_CARE_REQ.ID_USER_CANCELLED is '取消人标识';
comment on column RHN_EX_CARE_REQ.DES_CANCEL_REASON is '取消原因';
comment on column RHN_EX_CARE_REQ.CD_ITEM_SNAP is '项目编码快照';
comment on column RHN_EX_CARE_REQ.NA_ITEM_SNAP is '项目名称快照';
comment on column RHN_EX_CARE_REQ.CD_UNIT_SNAP is '单位编码快照';
comment on column RHN_EX_CARE_REQ.CD_LOCAL_SNAP is '本地编码快照';
comment on column RHN_EX_CARE_REQ.NA_LOCAL_SNAP is '本地名称快照';
comment on column RHN_EX_CARE_REQ.ID_ORG_CATALOG_ITEM_ADOPTION is '采用标识';
comment on column RHN_EX_CARE_REQ.SN_ADOPTION_VER is '采用修订';
comment on column RHN_EX_CARE_REQ.ID_CATALOG_PRICE is '价格标识';
comment on column RHN_EX_CARE_REQ.SN_PRICE_VER is '价格修订';
comment on column RHN_EX_CARE_REQ.SD_PRICE_TYPE is '价格类型';
comment on column RHN_EX_CARE_REQ.PRICE_UNIT is '单位单价';
comment on column RHN_EX_CARE_REQ.AMT_TOTAL is '总计金额';
comment on column RHN_EX_CARE_REQ.CD_CURRENCY is '币种编码';
comment on column RHN_EX_CARE_REQ.JSON_ITEM_ATTR_SNAP is '项目属性快照';
comment on column RHN_EX_CARE_REQ.HASH_ITEM_ATTR is '项目属性摘要';
comment on column RHN_EX_CARE_REQ.DT_ITEM_ATTR_RESOLVED is '项目属性已解决时间';
comment on column RHN_EX_CARE_REQ.JSON_STD_MAP_SNAP is 'standard映射快照';
comment on column RHN_EX_CARE_REQ.ID_REQ_GRP is '请求分组标识';
comment on column RHN_EX_CARE_REQ.ID_CARE_REQ_PARENT is '上级请求标识';
comment on table RHN_EX_DIAG_EXEC_TASK is '诊疗执行任务；一行代表一条诊疗执行任务记录';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_DIAG_EXEC_TASK is '诊疗执行任务主键';
comment on column RHN_EX_DIAG_EXEC_TASK.REVISION is '乐观锁修订号';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_ORG is '机构标识';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_DEPT is '科室标识';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_PAT is '患者标识';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_ENC is '就诊标识';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_CARE_REQ is '请求标识';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_STL is '结算标识';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_DIAG_REPORT is '报告标识';
comment on column RHN_EX_DIAG_EXEC_TASK.CD_TASK_NO is '任务编号';
comment on column RHN_EX_DIAG_EXEC_TASK.SD_REQ_TYPE is '请求类型';
comment on column RHN_EX_DIAG_EXEC_TASK.CD_ITEM_SNAP is '项目编码快照';
comment on column RHN_EX_DIAG_EXEC_TASK.NA_ITEM_SNAP is '项目名称快照';
comment on column RHN_EX_DIAG_EXEC_TASK.SD_SPEC_TYPE_SNAP is '标本类型快照';
comment on column RHN_EX_DIAG_EXEC_TASK.SD_EXAM_TYPE_SNAP is '检查类型快照';
comment on column RHN_EX_DIAG_EXEC_TASK.SD_STATUS is '状态';
comment on column RHN_EX_DIAG_EXEC_TASK.DT_CREATED is '创建时间';
comment on column RHN_EX_DIAG_EXEC_TASK.DT_COLLECTED is 'collected时间';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_USER_COLLECTED is 'collected人标识';
comment on column RHN_EX_DIAG_EXEC_TASK.CD_SPEC_NO is '标本编号';
comment on column RHN_EX_DIAG_EXEC_TASK.DES_COLLECTION_NOTE is 'collection备注';
comment on column RHN_EX_DIAG_EXEC_TASK.DT_STARTED is '开始时间';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_USER_STARTED is '开始人标识';
comment on column RHN_EX_DIAG_EXEC_TASK.DT_COMPLETED is '完成时间';
comment on column RHN_EX_DIAG_EXEC_TASK.ID_USER_COMPLETED is '完成人标识';
comment on column RHN_EX_DIAG_EXEC_TASK.DES_COMP_NOTE is '完成备注';
comment on column RHN_EX_DIAG_EXEC_TASK.DT_CANCELLED is '取消时间';
comment on column RHN_EX_DIAG_EXEC_TASK.DES_EXCEPT_NOTE is '例外备注';
comment on table RHN_EX_DIAG_REPORT is '诊疗报告；一行代表一条诊疗报告记录';
comment on column RHN_EX_DIAG_REPORT.ID_DIAG_REPORT is '诊疗报告主键';
comment on column RHN_EX_DIAG_REPORT.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_REPORT.ID_PAT is '患者标识';
comment on column RHN_EX_DIAG_REPORT.ID_ENC is '就诊标识';
comment on column RHN_EX_DIAG_REPORT.ID_CARE_REQ is '请求标识';
comment on column RHN_EX_DIAG_REPORT.CD_ENDPOINT is 'endpoint编码';
comment on column RHN_EX_DIAG_REPORT.ID_EXT_REPORT is '外部报告标识';
comment on column RHN_EX_DIAG_REPORT.SN_REPORT_VER is '报告版本';
comment on column RHN_EX_DIAG_REPORT.ID_DIAG_REPORT_REPLACES is '替代报告标识';
comment on column RHN_EX_DIAG_REPORT.SD_REPORT_TYPE is '报告类型';
comment on column RHN_EX_DIAG_REPORT.SD_STATUS is '状态';
comment on column RHN_EX_DIAG_REPORT.CD_REPORT is '报告编码';
comment on column RHN_EX_DIAG_REPORT.NA_REPORT is '报告名称';
comment on column RHN_EX_DIAG_REPORT.DT_ISSUED is '签发时间';
comment on column RHN_EX_DIAG_REPORT.DT_RECEIVED is '接收时间';
comment on column RHN_EX_DIAG_REPORT.DES_CONCLUSION is '结论';
comment on column RHN_EX_DIAG_REPORT.CD_AUTHOR is '开立编码';
comment on column RHN_EX_DIAG_REPORT.NA_AUTHOR is '开立名称';
comment on column RHN_EX_DIAG_REPORT.CONTENT_DIGEST_ALGORITHM is '内容摘要算法';
comment on column RHN_EX_DIAG_REPORT.HASH_CONTENT is '内容摘要';
comment on column RHN_EX_DIAG_REPORT.ID_EXT_MSG_INBOUND is 'inbound消息标识';
comment on column RHN_EX_DIAG_REPORT.DT_CREATED is '创建时间';
comment on column RHN_EX_DIAG_REPORT.ID_USER_CREATED is '创建人标识';
comment on table RHN_EX_DIAG_REPORT_RESULT is '诊疗报告结果；一行代表一条诊疗报告结果记录';
comment on column RHN_EX_DIAG_REPORT_RESULT.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_REPORT_RESULT.ID_DIAG_REPORT is '报告标识';
comment on column RHN_EX_DIAG_REPORT_RESULT.ID_OBS is '观察标识';
comment on column RHN_EX_DIAG_REPORT_RESULT.SN_SORT is '排序医嘱';
comment on table RHN_EX_EXAM_ATTACH_ITEM is '检查附件项目；一行代表一条检查附件项目记录';
comment on column RHN_EX_EXAM_ATTACH_ITEM.ID_EXAM_ATTACH_ITEM is '检查附件项目主键';
comment on column RHN_EX_EXAM_ATTACH_ITEM.REVISION is '乐观锁修订号';
comment on column RHN_EX_EXAM_ATTACH_ITEM.ID_TNT is '租户标识';
comment on column RHN_EX_EXAM_ATTACH_ITEM.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_EX_EXAM_ATTACH_ITEM.ID_CATALOG_ITEM_ATTACH is '附件目录项目标识';
comment on column RHN_EX_EXAM_ATTACH_ITEM.SD_TRIGGER_TYPE is '触发类型';
comment on column RHN_EX_EXAM_ATTACH_ITEM.QTY_BASIS is '数量依据';
comment on column RHN_EX_EXAM_ATTACH_ITEM.QTY_ATTACH is '数量';
comment on column RHN_EX_EXAM_ATTACH_ITEM.FG_REQUIRED_ATTACH is '是否应需附件';
comment on column RHN_EX_EXAM_ATTACH_ITEM.FG_SEPARATELY_CHARGEABLE is '是否separatelychargeable';
comment on column RHN_EX_EXAM_ATTACH_ITEM.SN_SORT is '排序医嘱';
comment on column RHN_EX_EXAM_ATTACH_ITEM.DES_EXAM_ATTACH_ITEM is '说明';
comment on column RHN_EX_EXAM_ATTACH_ITEM.SD_STATUS is '状态';
comment on column RHN_EX_EXAM_ATTACH_ITEM.DT_CREATED is '创建时间';
comment on column RHN_EX_EXAM_ATTACH_ITEM.ID_USER_CREATED is '创建人标识';
comment on column RHN_EX_EXAM_ATTACH_ITEM.DT_UPDATED is '更新时间';
comment on column RHN_EX_EXAM_ATTACH_ITEM.ID_USER_UPDATED is '更新人标识';
comment on table RHN_EX_INP_ORDER_EVT is '住院医嘱事件；一行代表一条住院医嘱事件记录';
comment on column RHN_EX_INP_ORDER_EVT.ID_INP_ORDER_EVT is '住院医嘱事件主键';
comment on column RHN_EX_INP_ORDER_EVT.ID_TNT is '租户标识';
comment on column RHN_EX_INP_ORDER_EVT.ID_CARE_REQ is '请求标识';
comment on column RHN_EX_INP_ORDER_EVT.ID_INP_ORDER_TASK is '任务标识';
comment on column RHN_EX_INP_ORDER_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_EX_INP_ORDER_EVT.SD_ORDER_STATUS_FROM is '医嘱状态原';
comment on column RHN_EX_INP_ORDER_EVT.SD_ORDER_STATUS_TO is '医嘱状态目标';
comment on column RHN_EX_INP_ORDER_EVT.SD_TASK_STATUS_FROM is '任务状态原';
comment on column RHN_EX_INP_ORDER_EVT.SD_TASK_STATUS_TO is '任务状态目标';
comment on column RHN_EX_INP_ORDER_EVT.CD_COMMAND is '命令编码';
comment on column RHN_EX_INP_ORDER_EVT.DES_REASON is '原因';
comment on column RHN_EX_INP_ORDER_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_EX_INP_ORDER_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_EX_INP_ORDER_TASK is '住院医嘱任务；一行代表一条住院医嘱任务记录';
comment on column RHN_EX_INP_ORDER_TASK.ID_INP_ORDER_TASK is '住院医嘱任务主键';
comment on column RHN_EX_INP_ORDER_TASK.REVISION is '乐观锁修订号';
comment on column RHN_EX_INP_ORDER_TASK.ID_TNT is '租户标识';
comment on column RHN_EX_INP_ORDER_TASK.ID_CARE_REQ is '请求标识';
comment on column RHN_EX_INP_ORDER_TASK.CD_OCCURRENCE_NO is 'occurrence编号';
comment on column RHN_EX_INP_ORDER_TASK.DT_SCHEDULED is 'scheduled时间';
comment on column RHN_EX_INP_ORDER_TASK.SD_STATUS is '状态';
comment on column RHN_EX_INP_ORDER_TASK.CD_OUTCOME is 'outcome编码';
comment on column RHN_EX_INP_ORDER_TASK.DES_EXEC_NOTE is '执行备注';
comment on column RHN_EX_INP_ORDER_TASK.DT_COMPLETED is '完成时间';
comment on column RHN_EX_INP_ORDER_TASK.ID_USER_COMPLETED is '完成人标识';
comment on column RHN_EX_INP_ORDER_TASK.DT_CANCELLED is '取消时间';
comment on column RHN_EX_INP_ORDER_TASK.DES_CANCEL_REASON is '取消原因';
comment on column RHN_EX_INP_ORDER_TASK.DT_CREATED is '创建时间';
comment on column RHN_EX_INP_ORDER_TASK.ID_USER_CREATED is '创建人标识';
comment on column RHN_EX_INP_ORDER_TASK.DT_UPDATED is '更新时间';
comment on column RHN_EX_INP_ORDER_TASK.ID_USER_UPDATED is '更新人标识';
comment on table RHN_EX_INP_ORDER_WF is '住院医嘱流程；一行代表一条住院医嘱流程记录';
comment on column RHN_EX_INP_ORDER_WF.ID_CARE_REQ is '请求标识';
comment on column RHN_EX_INP_ORDER_WF.REVISION is '乐观锁修订号';
comment on column RHN_EX_INP_ORDER_WF.ID_TNT is '租户标识';
comment on column RHN_EX_INP_ORDER_WF.ID_CARE_EPISODE is '周期标识';
comment on column RHN_EX_INP_ORDER_WF.SD_DURATION_TYPE is '时长类型';
comment on column RHN_EX_INP_ORDER_WF.SD_WF_STATUS is '流程状态';
comment on column RHN_EX_INP_ORDER_WF.ID_AUTHORED_PRACT is '开立医务人员标识';
comment on column RHN_EX_INP_ORDER_WF.ID_USER_SIGNED is '签署人标识';
comment on column RHN_EX_INP_ORDER_WF.DT_SIGNED is '签署时间';
comment on column RHN_EX_INP_ORDER_WF.ID_USER_VERIFIED is '已验证人标识';
comment on column RHN_EX_INP_ORDER_WF.DT_VERIFIED is '已验证时间';
comment on column RHN_EX_INP_ORDER_WF.ID_USER_STOPPED is 'stopped人标识';
comment on column RHN_EX_INP_ORDER_WF.DT_STOPPED is 'stopped时间';
comment on column RHN_EX_INP_ORDER_WF.DES_STOP_REASON is 'stop原因';
comment on column RHN_EX_INP_ORDER_WF.ID_USER_UPDATED is '更新人标识';
comment on column RHN_EX_INP_ORDER_WF.DT_UPDATED is '更新时间';
comment on column RHN_EX_INP_ORDER_WF.QTY_MED_PER_OCC is '药品数量peroccurrence';
comment on column RHN_EX_INP_ORDER_WF.MEDICATION_QUANTITY_UNIT is '药品数量单位';
comment on column RHN_EX_INP_ORDER_WF.QTY_MED_BASE_PER_OCC is '药品基础数量peroccurrence';
comment on column RHN_EX_INP_ORDER_WF.MEDICATION_BASE_UNIT is '药品基础单位';
comment on table RHN_EX_LAB_SVC_SPEC is '检验服务标本；一行代表一条检验服务标本记录';
comment on column RHN_EX_LAB_SVC_SPEC.ID_LAB_SVC_SPEC is '检验服务标本主键';
comment on column RHN_EX_LAB_SVC_SPEC.ID_TNT is '租户标识';
comment on column RHN_EX_LAB_SVC_SPEC.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_EX_LAB_SVC_SPEC.ID_DICT_ITEM_SPEC is '标本项目标识';
comment on column RHN_EX_LAB_SVC_SPEC.ID_DICT_ITEM_CONTAINER is 'container项目标识';
comment on column RHN_EX_LAB_SVC_SPEC.QTY_MINIMUM is 'minimum数量';
comment on column RHN_EX_LAB_SVC_SPEC.MINIMUM_QUANTITY_UNIT is 'minimum数量单位';
comment on column RHN_EX_LAB_SVC_SPEC.FG_DEFAULT_SPEC is '是否默认标本';
comment on column RHN_EX_LAB_SVC_SPEC.FG_REQUIRED_SPEC is '是否应需标本';
comment on column RHN_EX_LAB_SVC_SPEC.SN_SORT is '排序医嘱';
comment on column RHN_EX_LAB_SVC_SPEC.DES_COLLECTION_DESCRIPTION is 'collection说明';
comment on column RHN_EX_LAB_SVC_SPEC.SD_STATUS is '状态';
comment on column RHN_EX_LAB_SVC_SPEC.REVISION is '乐观锁修订号';
comment on column RHN_EX_LAB_SVC_SPEC.DT_CREATED is '创建时间';
comment on column RHN_EX_LAB_SVC_SPEC.ID_USER_CREATED is '创建人标识';
comment on column RHN_EX_LAB_SVC_SPEC.DT_UPDATED is '更新时间';
comment on column RHN_EX_LAB_SVC_SPEC.ID_USER_UPDATED is '更新人标识';
comment on column RHN_EX_LAB_SVC_SPEC.CD_TUBE_GRP is '试管分组编码';
comment on column RHN_EX_LAB_SVC_SPEC.SD_TUBE_SHARING_MODE is '试管sharing模式';
comment on column RHN_EX_LAB_SVC_SPEC.QTY_BASE_TUBE is '基础试管盘点';
comment on column RHN_EX_LAB_SVC_SPEC.QTY_MAX_TEST_PER_TUBE is '最大testsper试管';
comment on column RHN_EX_LAB_SVC_SPEC.SD_TUBE_CHARGE_MODE is '试管收费模式';
comment on column RHN_EX_LAB_SVC_SPEC.ID_CATALOG_ITEM_TUBE_CHARGE is '试管收费项目标识';
comment on column RHN_EX_LAB_SVC_SPEC.QTY_INCLUDED_TUBE is 'included试管盘点';
comment on column RHN_EX_LAB_SVC_SPEC.QTY_TUBE_CHARGE is '试管收费数量';
comment on table RHN_EX_MED_REQ is '药品请求；一行代表一条药品请求记录';
comment on column RHN_EX_MED_REQ.ID_CARE_REQ is '请求标识';
comment on column RHN_EX_MED_REQ.ID_TNT is '租户标识';
comment on column RHN_EX_MED_REQ.ID_MED is '药品标识';
comment on column RHN_EX_MED_REQ.QTY_DOSE_VAL is '剂量值';
comment on column RHN_EX_MED_REQ.DOSE_UNIT is '剂量单位';
comment on column RHN_EX_MED_REQ.CD_ROUTE is '途径编码';
comment on column RHN_EX_MED_REQ.CD_FREQ is '频次编码';
comment on column RHN_EX_MED_REQ.QTY_DURATION_VAL is '时长值';
comment on column RHN_EX_MED_REQ.DURATION_UNIT is '时长单位';
comment on column RHN_EX_MED_REQ.QTY_ORDERED is '数量';
comment on column RHN_EX_MED_REQ.QTY_UNIT is '数量单位';
comment on column RHN_EX_MED_REQ.QTY_BASE is '基础数量';
comment on column RHN_EX_MED_REQ.BASE_UNIT is '基础单位';
comment on column RHN_EX_MED_REQ.PACKAGE_FACTOR_SNAPSHOT is '包装换算系数快照';
comment on column RHN_EX_MED_REQ.NA_PKG_UNIT_SNAP is '包装单位名称快照';
comment on column RHN_EX_MED_REQ.PACKAGE_SPEC_SNAPSHOT is '包装规格快照';
comment on column RHN_EX_MED_REQ.PRICE_QUANTITY_SNAP is '价格数量快照';
comment on column RHN_EX_MED_REQ.FG_SUBSTITUTION is '是否substitution允许';
comment on column RHN_EX_MED_REQ.FG_SELF_PROVIDED is '是否selfprovided';
comment on column RHN_EX_MED_REQ.DES_MED_INSTRUCTION is '药品用法';
comment on column RHN_EX_MED_REQ.CD_MED_SNAP is '药品编码快照';
comment on column RHN_EX_MED_REQ.NA_MED_SNAP is '药品名称快照';
comment on column RHN_EX_MED_REQ.SD_MED_TYPE_SNAP is '药品类型快照';
comment on column RHN_EX_MED_REQ.DOSE_FORM_SNAPSHOT is '剂量表单快照';
comment on column RHN_EX_MED_REQ.PREPARATION_SPEC_SNAPSHOT is '制剂规格快照';
comment on column RHN_EX_MED_REQ.PREPARATION_UNIT_SNAPSHOT is '制剂单位快照';
comment on column RHN_EX_MED_REQ.FG_SKIN_TEST_REQUIRED_SNAP is '是否皮试检测应需快照';
comment on column RHN_EX_MED_REQ.FG_ANTIMICROBIAL_SNAP is '是否抗菌药物快照';
comment on column RHN_EX_MED_REQ.SD_ANTIMICROBIAL_LEVEL_SNAP is '抗菌药物等级快照';
comment on column RHN_EX_MED_REQ.MEDICATION_SNAPSHOT is '药品快照';
comment on column RHN_EX_MED_REQ.CD_ADMIN_GRP_NO is '管理分组编号';
comment on column RHN_EX_MED_REQ.ID_ORDER_FREQ is '频次标识';
comment on column RHN_EX_MED_REQ.NA_FREQ_SNAP is '频次名称快照';
comment on column RHN_EX_MED_REQ.FREQUENCY_RULE_SNAPSHOT is '频次规则快照';
comment on column RHN_EX_MED_REQ.ID_CONCEPT_ROUTE is '途径标识';
comment on column RHN_EX_MED_REQ.NA_ROUTE_SNAP is '途径名称快照';
comment on column RHN_EX_MED_REQ.SD_ROUTE_EXEC_TYPE_SNAP is '途径执行类型快照';
comment on column RHN_EX_MED_REQ.SD_ROUTE_RESOLUTION_STATUS is '途径处理结果状态';
comment on table RHN_EX_OP_REFER_EVT is '门诊转诊事件；一行代表一条门诊转诊事件记录';
comment on column RHN_EX_OP_REFER_EVT.ID_OP_REFER_EVT is '门诊转诊事件主键';
comment on column RHN_EX_OP_REFER_EVT.ID_TNT is '租户标识';
comment on column RHN_EX_OP_REFER_EVT.ID_OP_REFER_REQ is '转诊请求标识';
comment on column RHN_EX_OP_REFER_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_EX_OP_REFER_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_EX_OP_REFER_EVT.CD_ACTION is '操作编码';
comment on column RHN_EX_OP_REFER_EVT.CD_COMMAND is '命令编码';
comment on column RHN_EX_OP_REFER_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_EX_OP_REFER_EVT.DES_REASON is '原因';
comment on column RHN_EX_OP_REFER_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_EX_OP_REFER_REQ is '门诊转诊请求；一行代表一条门诊转诊请求记录';
comment on column RHN_EX_OP_REFER_REQ.ID_OP_REFER_REQ is '门诊转诊请求主键';
comment on column RHN_EX_OP_REFER_REQ.REVISION is '乐观锁修订号';
comment on column RHN_EX_OP_REFER_REQ.ID_TNT is '租户标识';
comment on column RHN_EX_OP_REFER_REQ.ID_ENC is '就诊标识';
comment on column RHN_EX_OP_REFER_REQ.ID_PAT is '患者标识';
comment on column RHN_EX_OP_REFER_REQ.CD_REQ_NO is '请求编号';
comment on column RHN_EX_OP_REFER_REQ.SD_REFER_TYPE is '转诊类型';
comment on column RHN_EX_OP_REFER_REQ.ID_ORG_TARGET is 'target机构标识';
comment on column RHN_EX_OP_REFER_REQ.ID_DEPT_TARGET is 'target科室标识';
comment on column RHN_EX_OP_REFER_REQ.ID_PRACT_TARGET is 'target医务人员标识';
comment on column RHN_EX_OP_REFER_REQ.SD_URGENCY is '紧急程度';
comment on column RHN_EX_OP_REFER_REQ.DES_REFER_REASON is '转诊原因';
comment on column RHN_EX_OP_REFER_REQ.DES_CLIN_SUM is '临床汇总';
comment on column RHN_EX_OP_REFER_REQ.DT_EXPECTED is '预期时间';
comment on column RHN_EX_OP_REFER_REQ.SD_STATUS is '状态';
comment on column RHN_EX_OP_REFER_REQ.ID_PAT_REG_TARGET is 'target挂号标识';
comment on column RHN_EX_OP_REFER_REQ.ID_ENC_TARGET is 'target就诊标识';
comment on column RHN_EX_OP_REFER_REQ.ID_USER_REQUESTED is '申请人标识';
comment on column RHN_EX_OP_REFER_REQ.DT_REQUESTED is '申请时间';
comment on column RHN_EX_OP_REFER_REQ.ID_USER_ACCEPTED is '接受人标识';
comment on column RHN_EX_OP_REFER_REQ.DT_ACCEPTED is '接受时间';
comment on column RHN_EX_OP_REFER_REQ.ID_USER_COMPLETED is '完成人标识';
comment on column RHN_EX_OP_REFER_REQ.DT_COMPLETED is '完成时间';
comment on column RHN_EX_OP_REFER_REQ.DES_OUTCOME is 'outcome文本';
comment on column RHN_EX_OP_REFER_REQ.DES_REJECTION_REASON is 'rejection原因';
comment on column RHN_EX_OP_REFER_REQ.CD_CREATE_COMMAND is 'create命令编码';
comment on table RHN_EX_REQ_GRP is '请求分组；一行代表一条请求分组记录';
comment on column RHN_EX_REQ_GRP.ID_REQ_GRP is '请求分组主键';
comment on column RHN_EX_REQ_GRP.REVISION is '乐观锁修订号';
comment on column RHN_EX_REQ_GRP.ID_TNT is '租户标识';
comment on column RHN_EX_REQ_GRP.ID_PAT is '患者标识';
comment on column RHN_EX_REQ_GRP.ID_ENC is '就诊标识';
comment on column RHN_EX_REQ_GRP.CD_GRP_NO is '分组编号';
comment on column RHN_EX_REQ_GRP.SD_GRP_TYPE is '分组类型';
comment on column RHN_EX_REQ_GRP.CD_CAT is '分类编码';
comment on column RHN_EX_REQ_GRP.SD_STATUS is '状态';
comment on column RHN_EX_REQ_GRP.ID_ORG_PERFORMER is '执行人机构标识';
comment on column RHN_EX_REQ_GRP.ID_DEPT_PERFORMER is '执行人科室标识';
comment on column RHN_EX_REQ_GRP.DT_AUTHORED is '开立时间';
comment on column RHN_EX_REQ_GRP.ID_USER_AUTHORED is '开立人标识';
comment on column RHN_EX_REQ_GRP.DT_SUBMITTED is '提交时间';
comment on column RHN_EX_REQ_GRP.ID_USER_SUBMITTED is '提交人标识';
comment on column RHN_EX_REQ_GRP.DT_CANCELLED is '取消时间';
comment on column RHN_EX_REQ_GRP.ID_USER_CANCELLED is '取消人标识';
comment on column RHN_EX_REQ_GRP.DES_CANCEL_REASON is '取消原因';
comment on column RHN_EX_REQ_GRP.DES_NOTE is '备注';
comment on table RHN_EX_SKIN_TEST_EVT is '皮试检测事件；一行代表一条皮试检测事件记录';
comment on column RHN_EX_SKIN_TEST_EVT.ID_SKIN_TEST_EVT is '皮试检测事件主键';
comment on column RHN_EX_SKIN_TEST_EVT.REVISION is '乐观锁修订号';
comment on column RHN_EX_SKIN_TEST_EVT.ID_TNT is '租户标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_ORG is '机构标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_DEPT is '科室标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_PAT is '患者标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_ENC is '就诊标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_CARE_REQ_MED is '药品请求标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_MED is '药品标识';
comment on column RHN_EX_SKIN_TEST_EVT.SN_ATTEMPT is 'attempt编号';
comment on column RHN_EX_SKIN_TEST_EVT.CD_MED_SNAP is '药品编码快照';
comment on column RHN_EX_SKIN_TEST_EVT.NA_MED_SNAP is '药品名称快照';
comment on column RHN_EX_SKIN_TEST_EVT.SD_STATUS is '状态';
comment on column RHN_EX_SKIN_TEST_EVT.SD_TEST_METHOD is '检测方法';
comment on column RHN_EX_SKIN_TEST_EVT.FG_ORIGINAL_SOLUTION is '是否原solution';
comment on column RHN_EX_SKIN_TEST_EVT.ID_CATALOG_ITEM_SOLUTION is 'solution目录项目标识';
comment on column RHN_EX_SKIN_TEST_EVT.NA_SOLUTION_SNAP is 'solution名称快照';
comment on column RHN_EX_SKIN_TEST_EVT.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_EX_SKIN_TEST_EVT.CD_LOT_SNAP is '批号no快照';
comment on column RHN_EX_SKIN_TEST_EVT.CONCENTRATION is '浓度';
comment on column RHN_EX_SKIN_TEST_EVT.CONCENTRATION_UNIT is '浓度单位';
comment on column RHN_EX_SKIN_TEST_EVT.BODY_SITE is '身体部位库房';
comment on column RHN_EX_SKIN_TEST_EVT.SD_VERIFICATION_METHOD is '验证方法';
comment on column RHN_EX_SKIN_TEST_EVT.QTY_OBS_MINUTES is '观察minutes';
comment on column RHN_EX_SKIN_TEST_EVT.DT_STARTED is '开始时间';
comment on column RHN_EX_SKIN_TEST_EVT.DT_COMPLETED is '完成时间';
comment on column RHN_EX_SKIN_TEST_EVT.SD_RESULT is '结果';
comment on column RHN_EX_SKIN_TEST_EVT.QTY_WHEAL_DIAMETER_MM is '风团直径毫米';
comment on column RHN_EX_SKIN_TEST_EVT.QTY_FLARE_DIAMETER_MM is '红斑直径毫米';
comment on column RHN_EX_SKIN_TEST_EVT.DES_REACTION_DESCRIPTION is 'reaction说明';
comment on column RHN_EX_SKIN_TEST_EVT.DES_EARLY_READ_REASON is 'early已读原因';
comment on column RHN_EX_SKIN_TEST_EVT.ID_USER_PERFORMED is 'performedby用户标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_PRACT_PERFORMED is 'performedby医务人员标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_USER_READ is '已读by用户标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_PRACT_READ is '已读by医务人员标识';
comment on column RHN_EX_SKIN_TEST_EVT.DT_CANCELLED is '取消时间';
comment on column RHN_EX_SKIN_TEST_EVT.ID_USER_CANCELLED is '取消人标识';
comment on column RHN_EX_SKIN_TEST_EVT.DES_CANCEL_REASON is '取消原因';
comment on column RHN_EX_SKIN_TEST_EVT.DT_CREATED is '创建时间';
comment on table RHN_EX_SVC_REQ is '服务请求；一行代表一条服务请求记录';
comment on column RHN_EX_SVC_REQ.ID_CARE_REQ is '请求标识';
comment on column RHN_EX_SVC_REQ.ID_TNT is '租户标识';
comment on column RHN_EX_SVC_REQ.QTY_ORDERED is '数量';
comment on column RHN_EX_SVC_REQ.DES_CLIN_DESCRIPTION is '临床说明';
comment on column RHN_EX_SVC_REQ.SD_SVC_TYPE_SNAP is '服务类型快照';
comment on column RHN_EX_SVC_REQ.SD_SPEC_TYPE_SNAP is '标本类型快照';
comment on column RHN_EX_SVC_REQ.SD_EXAM_TYPE_SNAP is '检查类型快照';
comment on table RHN_EX_TREAT_EXEC_ITEM is '治疗执行项目；一行代表一条治疗执行项目记录';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_TREAT_EXEC_ITEM is '治疗执行项目主键';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_TNT is '租户标识';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_TREAT_EXEC_TASK is '任务标识';
comment on column RHN_EX_TREAT_EXEC_ITEM.SD_SRC_TYPE is '来源类型';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_CARE_REQ_SRC is '来源标识';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_CARE_REQ_PARENT_SRC is '上级来源标识';
comment on column RHN_EX_TREAT_EXEC_ITEM.CD_REQ_NO is '请求编号';
comment on column RHN_EX_TREAT_EXEC_ITEM.CD_ITEM_SNAP is '项目编码快照';
comment on column RHN_EX_TREAT_EXEC_ITEM.NA_ITEM_SNAP is '项目名称快照';
comment on column RHN_EX_TREAT_EXEC_ITEM.QTY_DOSE_VAL is '剂量值';
comment on column RHN_EX_TREAT_EXEC_ITEM.DOSE_UNIT is '剂量单位';
comment on column RHN_EX_TREAT_EXEC_ITEM.CD_ROUTE is '途径编码';
comment on column RHN_EX_TREAT_EXEC_ITEM.CD_FREQ is '频次编码';
comment on column RHN_EX_TREAT_EXEC_ITEM.QTY_DURATION_VAL is '时长值';
comment on column RHN_EX_TREAT_EXEC_ITEM.DURATION_UNIT is '时长单位';
comment on column RHN_EX_TREAT_EXEC_ITEM.FG_SKIN_TEST_REQUIRED is '是否皮试检测应需';
comment on column RHN_EX_TREAT_EXEC_ITEM.FG_STL_REQUIRED is '是否结算应需';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_STL is '结算标识';
comment on column RHN_EX_TREAT_EXEC_ITEM.FG_FULFILL_REQUIRED is '是否履约应需';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_FULFILL is '履约标识';
comment on column RHN_EX_TREAT_EXEC_ITEM.SD_FULFILL_STATUS is '履约状态';
comment on column RHN_EX_TREAT_EXEC_ITEM.DT_CANCELLED is '取消时间';
comment on column RHN_EX_TREAT_EXEC_ITEM.DT_CREATED is '创建时间';
comment on column RHN_EX_TREAT_EXEC_ITEM.ID_ORDER_FREQ is '频次标识';
comment on column RHN_EX_TREAT_EXEC_ITEM.NA_FREQ_SNAP is '频次名称快照';
comment on column RHN_EX_TREAT_EXEC_ITEM.FREQUENCY_RULE_SNAPSHOT is '频次规则快照';
comment on table RHN_EX_TREAT_EXEC_TASK is '治疗执行任务；一行代表一条治疗执行任务记录';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_TREAT_EXEC_TASK is '治疗执行任务主键';
comment on column RHN_EX_TREAT_EXEC_TASK.REVISION is '乐观锁修订号';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_TNT is '租户标识';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_ORG is '机构标识';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_DEPT is '科室标识';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_PAT is '患者标识';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_ENC is '就诊标识';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_CARE_REQ_SRC_GRP is '来源分组标识';
comment on column RHN_EX_TREAT_EXEC_TASK.CD_TASK_NO is '任务编号';
comment on column RHN_EX_TREAT_EXEC_TASK.SD_TASK_TYPE is '任务类型';
comment on column RHN_EX_TREAT_EXEC_TASK.SD_STATUS is '状态';
comment on column RHN_EX_TREAT_EXEC_TASK.DT_CREATED is '创建时间';
comment on column RHN_EX_TREAT_EXEC_TASK.DT_STARTED is '开始时间';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_USER_STARTED is '开始人标识';
comment on column RHN_EX_TREAT_EXEC_TASK.SD_VERIFICATION_METHOD is '验证方法';
comment on column RHN_EX_TREAT_EXEC_TASK.SD_EXEC_SITE is '执行库房';
comment on column RHN_EX_TREAT_EXEC_TASK.DES_START_NOTE is '开始备注';
comment on column RHN_EX_TREAT_EXEC_TASK.DT_COMPLETED is '完成时间';
comment on column RHN_EX_TREAT_EXEC_TASK.ID_USER_COMPLETED is '完成人标识';
comment on column RHN_EX_TREAT_EXEC_TASK.CD_RESULT is '结果编码';
comment on column RHN_EX_TREAT_EXEC_TASK.DES_COMP_NOTE is '完成备注';
comment on column RHN_EX_TREAT_EXEC_TASK.FG_ADVERSE_REACTION is '是否adversereaction';
comment on column RHN_EX_TREAT_EXEC_TASK.DES_ADVERSE_REACTION_DETAIL is 'adversereaction明细';
comment on column RHN_EX_TREAT_EXEC_TASK.DES_EXCEPT_NOTE is '例外备注';
comment on table RHN_HPL_CARE_TASK is '照护任务；一行代表一条照护任务记录';
comment on column RHN_HPL_CARE_TASK.ID_CARE_TASK is '照护任务主键';
comment on column RHN_HPL_CARE_TASK.REVISION is '乐观锁修订号';
comment on column RHN_HPL_CARE_TASK.ID_TNT is '租户标识';
comment on column RHN_HPL_CARE_TASK.ID_PAT is '患者标识';
comment on column RHN_HPL_CARE_TASK.ID_ENC is '就诊标识';
comment on column RHN_HPL_CARE_TASK.ID_CARE_PLAN is '照护方案标识';
comment on column RHN_HPL_CARE_TASK.ID_CARE_REQ is '请求标识';
comment on column RHN_HPL_CARE_TASK.ID_REPORT_EVT is '报告事件标识';
comment on column RHN_HPL_CARE_TASK.ID_COND is '健康问题标识';
comment on column RHN_HPL_CARE_TASK.CD_TASK is '任务编码';
comment on column RHN_HPL_CARE_TASK.SD_TASK_TYPE is '任务类型';
comment on column RHN_HPL_CARE_TASK.SD_STATUS is '状态';
comment on column RHN_HPL_CARE_TASK.SD_PRIORITY is '优先级';
comment on column RHN_HPL_CARE_TASK.ID_PRACT_OWNER is '责任方医务人员标识';
comment on column RHN_HPL_CARE_TASK.ID_ORG_OWNER is '责任方机构标识';
comment on column RHN_HPL_CARE_TASK.ID_DEPT_OWNER is '责任方科室标识';
comment on column RHN_HPL_CARE_TASK.DT_DUE is '到期时间';
comment on column RHN_HPL_CARE_TASK.CD_ESCALATION_RULE is '升级规则编码';
comment on column RHN_HPL_CARE_TASK.NA_TITLE is '标题';
comment on column RHN_HPL_CARE_TASK.DES_CARE_TASK is '说明';
comment on column RHN_HPL_CARE_TASK.DT_CREATED is '创建时间';
comment on column RHN_HPL_CARE_TASK.ID_PRACT_CREATOR is 'creator医务人员标识';
comment on column RHN_HPL_CARE_TASK.ID_USER_CREATOR is 'creator用户标识';
comment on table RHN_HPL_CARE_TASK_EVT is '照护任务事件；一行代表一条照护任务事件记录';
comment on column RHN_HPL_CARE_TASK_EVT.ID_CARE_TASK_EVT is '照护任务事件主键';
comment on column RHN_HPL_CARE_TASK_EVT.ID_TNT is '租户标识';
comment on column RHN_HPL_CARE_TASK_EVT.ID_CARE_TASK is '照护任务标识';
comment on column RHN_HPL_CARE_TASK_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_HPL_CARE_TASK_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_HPL_CARE_TASK_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_HPL_CARE_TASK_EVT.ID_PRACT_ACTOR is '操作人医务人员标识';
comment on column RHN_HPL_CARE_TASK_EVT.ID_USER_ACTOR is '操作人用户标识';
comment on column RHN_HPL_CARE_TASK_EVT.CD_COMMAND is '命令编码';
comment on column RHN_HPL_CARE_TASK_EVT.DES_RESULT_DESCRIPTION is '结果说明';
comment on column RHN_HPL_CARE_TASK_EVT.CD_RULE is '规则编码';
comment on column RHN_HPL_CARE_TASK_EVT.CD_RULE_VER is '规则版本';
comment on column RHN_HPL_CARE_TASK_EVT.JSON_EVID is '证据JSON';
comment on column RHN_HPL_CARE_TASK_EVT.HASH_EVID is '证据摘要';
comment on column RHN_HPL_CARE_TASK_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_HPL_COND is '健康问题；一行代表一条健康问题记录';
comment on column RHN_HPL_COND.ID_COND is '健康问题主键';
comment on column RHN_HPL_COND.REVISION is '乐观锁修订号';
comment on column RHN_HPL_COND.ID_TNT is '租户标识';
comment on column RHN_HPL_COND.ID_PAT is '患者标识';
comment on column RHN_HPL_COND.ID_CONCEPT_TERM is '术语标识';
comment on column RHN_HPL_COND.CD_COND_KEY is '健康问题键';
comment on column RHN_HPL_COND.CODE_SYSTEM_URI is '编码体系URI';
comment on column RHN_HPL_COND.CD_CODE_RELEASE is '编码release';
comment on column RHN_HPL_COND.CD_COND is '健康问题编码';
comment on column RHN_HPL_COND.NA_COND is '健康问题名称';
comment on column RHN_HPL_COND.SD_CLIN_STATUS is '临床状态';
comment on column RHN_HPL_COND.SD_VERIFICATION_STATUS is '验证状态';
comment on column RHN_HPL_COND.DT_ONSET is 'onset时间';
comment on column RHN_HPL_COND.DT_ABATEMENT is 'abatement时间';
comment on column RHN_HPL_COND.DT_RECORDED is '记录时间';
comment on column RHN_HPL_COND.ID_PRACT_RECORDER is '记录人医务人员标识';
comment on column RHN_HPL_COND.ID_USER_RECORDER is '记录人用户标识';
comment on table RHN_HPL_DISEASE_MGMT_MEMBER is '疾病管理成员；一行代表一条疾病管理成员记录';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.ID_DISEASE_MGMT_MEMBER is '疾病管理成员主键';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.ID_DISEASE_MGMT_PROG is '方案标识';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.ID_CONCEPT is '概念标识';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.SD_STATUS is '状态';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.DA_EFFECTIVE_FROM is '生效开始日期';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.DA_EFFECTIVE_TO is '生效结束日期';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.DES_NOTE is '备注';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.DT_CREATED is '创建时间';
comment on column RHN_HPL_DISEASE_MGMT_MEMBER.SD_INCLUSION_MODE is 'inclusion模式';
comment on table RHN_HPL_DISEASE_MGMT_PROG is '疾病管理方案；一行代表一条疾病管理方案记录';
comment on column RHN_HPL_DISEASE_MGMT_PROG.ID_DISEASE_MGMT_PROG is '疾病管理方案主键';
comment on column RHN_HPL_DISEASE_MGMT_PROG.REVISION is '乐观锁修订号';
comment on column RHN_HPL_DISEASE_MGMT_PROG.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_HPL_DISEASE_MGMT_PROG.ID_SCOPE is '范围标识';
comment on column RHN_HPL_DISEASE_MGMT_PROG.CD_DISEASE_MGMT_PROG is '编码';
comment on column RHN_HPL_DISEASE_MGMT_PROG.NA_DISEASE_MGMT_PROG is '名称';
comment on column RHN_HPL_DISEASE_MGMT_PROG.SD_MGMT_TYPE is '管理类型';
comment on column RHN_HPL_DISEASE_MGMT_PROG.SD_TRIGGER_ACTION is '触发操作';
comment on column RHN_HPL_DISEASE_MGMT_PROG.DES_DISEASE_MGMT_PROG is '说明';
comment on column RHN_HPL_DISEASE_MGMT_PROG.SD_REPORT_CARD_TYPE is '报告card类型';
comment on column RHN_HPL_DISEASE_MGMT_PROG.QTY_REPORT_DEADLINE_HOURS is '报告deadlinehours';
comment on column RHN_HPL_DISEASE_MGMT_PROG.SD_STATUS is '状态';
comment on column RHN_HPL_DISEASE_MGMT_PROG.DA_EFFECTIVE_FROM is '生效开始日期';
comment on column RHN_HPL_DISEASE_MGMT_PROG.DA_EFFECTIVE_TO is '生效结束日期';
comment on column RHN_HPL_DISEASE_MGMT_PROG.DT_CREATED is '创建时间';
comment on column RHN_HPL_DISEASE_MGMT_PROG.DT_UPDATED is '更新时间';
comment on table RHN_HPL_DISEASE_MGMT_RULE is '疾病管理规则；一行代表一条疾病管理规则记录';
comment on column RHN_HPL_DISEASE_MGMT_RULE.ID_DISEASE_MGMT_RULE is '疾病管理规则主键';
comment on column RHN_HPL_DISEASE_MGMT_RULE.ID_DISEASE_MGMT_PROG is '方案标识';
comment on column RHN_HPL_DISEASE_MGMT_RULE.SD_INCLUSION_MODE is 'inclusion模式';
comment on column RHN_HPL_DISEASE_MGMT_RULE.SD_DIAG_DOMAIN is '诊断领域';
comment on column RHN_HPL_DISEASE_MGMT_RULE.ID_CODE_SYSTEM is '编码体系标识';
comment on column RHN_HPL_DISEASE_MGMT_RULE.SD_CONCEPT_TYPE is '概念类型';
comment on column RHN_HPL_DISEASE_MGMT_RULE.CD_CHAPTER is 'chapter编码';
comment on column RHN_HPL_DISEASE_MGMT_RULE.CD_CODE_FROM is '编码原';
comment on column RHN_HPL_DISEASE_MGMT_RULE.CD_CODE_TO is '编码目标';
comment on column RHN_HPL_DISEASE_MGMT_RULE.DES_NOTE is '备注';
comment on column RHN_HPL_DISEASE_MGMT_RULE.DT_CREATED is '创建时间';
comment on table RHN_INS_CLAIM is '医保理赔；一行代表一条医保理赔记录';
comment on column RHN_INS_CLAIM.ID_INS_CLAIM is '医保理赔主键';
comment on column RHN_INS_CLAIM.REVISION is '乐观锁修订号';
comment on column RHN_INS_CLAIM.ID_TNT is '租户标识';
comment on column RHN_INS_CLAIM.ID_STL is '结算标识';
comment on column RHN_INS_CLAIM.ID_PAT_ACCT is '患者账户标识';
comment on column RHN_INS_CLAIM.ID_PAT_COVER is '保障标识';
comment on column RHN_INS_CLAIM.CD_CLAIM_NO is '理赔编号';
comment on column RHN_INS_CLAIM.CD_COMMAND is '命令编码';
comment on column RHN_INS_CLAIM.SD_CLAIM_TYPE is '理赔类型';
comment on column RHN_INS_CLAIM.SD_STATUS is '状态';
comment on column RHN_INS_CLAIM.SD_CURRENT_OPERATION is 'current业务操作';
comment on column RHN_INS_CLAIM.CD_REGION is 'region编码';
comment on column RHN_INS_CLAIM.CD_INS_TYPE is '医保类型编码';
comment on column RHN_INS_CLAIM.NA_PAYER_SNAP is '付款方名称快照';
comment on column RHN_INS_CLAIM.CD_ORG is '机构编码';
comment on column RHN_INS_CLAIM.CD_DEPT is '科室编码';
comment on column RHN_INS_CLAIM.CD_PRACT is '医务人员编码';
comment on column RHN_INS_CLAIM.HASH_DIAG_PAYLOAD is '诊断载荷摘要';
comment on column RHN_INS_CLAIM.DT_SVC_STARTED is '服务开始时间';
comment on column RHN_INS_CLAIM.DT_SVC_ENDED is '服务ended时间';
comment on column RHN_INS_CLAIM.CD_EXT_PRE_STL_NO is '外部pre结算编号';
comment on column RHN_INS_CLAIM.CD_EXT_STL_NO is '外部结算编号';
comment on column RHN_INS_CLAIM.AMT_GROSS is '总额金额';
comment on column RHN_INS_CLAIM.AMT_INS_FUND is '医保fund金额';
comment on column RHN_INS_CLAIM.AMT_PERSONAL_ACCT is 'personal账户金额';
comment on column RHN_INS_CLAIM.AMT_PAT_CASH is '患者cash金额';
comment on column RHN_INS_CLAIM.AMT_OTHER_FUND is 'otherfund金额';
comment on column RHN_INS_CLAIM.CD_CURRENCY is '币种编码';
comment on column RHN_INS_CLAIM.ID_CORRELATION is '关联标识';
comment on column RHN_INS_CLAIM.ID_USER_CREATED is '创建人标识';
comment on column RHN_INS_CLAIM.DT_CREATED is '创建时间';
comment on column RHN_INS_CLAIM.DT_UPDATED is '更新时间';
comment on column RHN_INS_CLAIM.CD_ERROR is '错误编码';
comment on column RHN_INS_CLAIM.DES_ERROR_MSG is '错误消息';
comment on column RHN_INS_CLAIM.DES_REVERSAL_REASON is 'reversal原因';
comment on column RHN_INS_CLAIM.DT_REVERSED is 'reversed时间';
comment on table RHN_INS_CLAIM_LINE is '医保理赔明细；一行代表一条医保理赔明细记录';
comment on column RHN_INS_CLAIM_LINE.ID_INS_CLAIM_LINE is '医保理赔明细主键';
comment on column RHN_INS_CLAIM_LINE.ID_TNT is '租户标识';
comment on column RHN_INS_CLAIM_LINE.ID_INS_CLAIM is '理赔标识';
comment on column RHN_INS_CLAIM_LINE.ID_STL_LINE is '结算明细标识';
comment on column RHN_INS_CLAIM_LINE.SN_LINE is '明细编号';
comment on column RHN_INS_CLAIM_LINE.CD_ITEM is '项目编码';
comment on column RHN_INS_CLAIM_LINE.CD_INS_ITEM is '医保项目编码';
comment on column RHN_INS_CLAIM_LINE.NA_ITEM_SNAP is '项目名称快照';
comment on column RHN_INS_CLAIM_LINE.CD_CAT is '分类编码';
comment on column RHN_INS_CLAIM_LINE.QTY_CLAIM is '数量';
comment on column RHN_INS_CLAIM_LINE.PRICE_UNIT is '单位单价';
comment on column RHN_INS_CLAIM_LINE.AMT_CLAIMED is '认领金额';
comment on column RHN_INS_CLAIM_LINE.AMT_APPROVED is '审批金额';
comment on column RHN_INS_CLAIM_LINE.CD_REJECTION is 'rejection编码';
comment on column RHN_INS_CLAIM_LINE.JSON_TRACE_ATTR is '追溯attributesJSON';
comment on table RHN_INS_CLAIM_RESP is '医保理赔响应；一行代表一条医保理赔响应记录';
comment on column RHN_INS_CLAIM_RESP.ID_CLAIM_RESP is '医保理赔响应主键';
comment on column RHN_INS_CLAIM_RESP.ID_TNT is '租户标识';
comment on column RHN_INS_CLAIM_RESP.ID_INS_CLAIM is '理赔标识';
comment on column RHN_INS_CLAIM_RESP.ID_EXT_MSG is '外部消息标识';
comment on column RHN_INS_CLAIM_RESP.CD_RESP_NO is '响应编号';
comment on column RHN_INS_CLAIM_RESP.CD_COMMAND is '命令编码';
comment on column RHN_INS_CLAIM_RESP.SD_OPERATION is '业务操作';
comment on column RHN_INS_CLAIM_RESP.SD_STATUS is '状态';
comment on column RHN_INS_CLAIM_RESP.CD_EXT_STL_NO is '外部结算编号';
comment on column RHN_INS_CLAIM_RESP.AMT_INS_FUND is '医保fund金额';
comment on column RHN_INS_CLAIM_RESP.AMT_PERSONAL_ACCT is 'personal账户金额';
comment on column RHN_INS_CLAIM_RESP.AMT_PAT_CASH is '患者cash金额';
comment on column RHN_INS_CLAIM_RESP.AMT_OTHER_FUND is 'otherfund金额';
comment on column RHN_INS_CLAIM_RESP.CD_ERROR is '错误编码';
comment on column RHN_INS_CLAIM_RESP.DES_ERROR_MSG is '错误消息';
comment on column RHN_INS_CLAIM_RESP.DT_RESPONDED is 'responded时间';
comment on table RHN_INS_PAT_COVER is '患者保障；一行代表一条患者保障记录';
comment on column RHN_INS_PAT_COVER.ID_PAT_COVER is '患者保障主键';
comment on column RHN_INS_PAT_COVER.REVISION is '乐观锁修订号';
comment on column RHN_INS_PAT_COVER.ID_TNT is '租户标识';
comment on column RHN_INS_PAT_COVER.ID_PAT is '患者标识';
comment on column RHN_INS_PAT_COVER.CD_COVER_TYPE is '保障类型编码';
comment on column RHN_INS_PAT_COVER.NA_PAYER is '付款方名称';
comment on column RHN_INS_PAT_COVER.CD_MEMBER_NO is '成员编号';
comment on column RHN_INS_PAT_COVER.FG_PRIMARY_FLAG is '是否主要flag';
comment on column RHN_INS_PAT_COVER.DA_VALID_FROM is '有效开始日期';
comment on column RHN_INS_PAT_COVER.DA_VALID_TO is '有效结束日期';
comment on column RHN_INS_PAT_COVER.SD_STATUS is '状态';
comment on column RHN_INS_PAT_COVER.DT_CREATED is '创建时间';
comment on column RHN_INS_PAT_COVER.ID_USER_CREATED is '创建人标识';
comment on column RHN_INS_PAT_COVER.DT_UPDATED is '更新时间';
comment on column RHN_INS_PAT_COVER.ID_USER_UPDATED is '更新人标识';
comment on table RHN_INT_EVT_CONSUME is '事件消耗；一行代表一条事件消耗记录';
comment on column RHN_INT_EVT_CONSUME.ID_EVT_CONSUME is '事件消耗主键';
comment on column RHN_INT_EVT_CONSUME.ID_TNT is '租户标识';
comment on column RHN_INT_EVT_CONSUME.NA_CONSUMER is 'consumer名称';
comment on column RHN_INT_EVT_CONSUME.ID_EVT is '事件标识';
comment on column RHN_INT_EVT_CONSUME.SD_STATUS is '状态';
comment on column RHN_INT_EVT_CONSUME.DT_PROCESSED is 'processed时间';
comment on column RHN_INT_EVT_CONSUME.DES_LAST_ERROR is 'last错误';
comment on table RHN_INT_EXT_MSG is '外部消息；一行代表一条外部消息记录';
comment on column RHN_INT_EXT_MSG.ID_EXT_MSG is '外部消息主键';
comment on column RHN_INT_EXT_MSG.REVISION is '乐观锁修订号';
comment on column RHN_INT_EXT_MSG.ID_TNT is '租户标识';
comment on column RHN_INT_EXT_MSG.ID_ORG is '机构标识';
comment on column RHN_INT_EXT_MSG.ID_DEPT is '科室标识';
comment on column RHN_INT_EXT_MSG.CD_ENDPOINT is 'endpoint编码';
comment on column RHN_INT_EXT_MSG.SD_DIRECTION is '方向';
comment on column RHN_INT_EXT_MSG.SD_MSG_TYPE is '消息类型';
comment on column RHN_INT_EXT_MSG.ID_BUSINESS_MSG is '业务消息标识';
comment on column RHN_INT_EXT_MSG.ID_CORRELATION is '关联标识';
comment on column RHN_INT_EXT_MSG.SD_STATUS is '状态';
comment on column RHN_INT_EXT_MSG.JSON_PAYLOAD is '载荷JSON';
comment on column RHN_INT_EXT_MSG.PAYLOAD_DIGEST_ALGORITHM is '载荷摘要算法';
comment on column RHN_INT_EXT_MSG.HASH_PAYLOAD is '载荷摘要';
comment on column RHN_INT_EXT_MSG.SD_RELATED_RSRC_TYPE is '关联资源类型';
comment on column RHN_INT_EXT_MSG.ID_RELATED_RSRC is '关联资源标识';
comment on column RHN_INT_EXT_MSG.SN_RELATED_RSRC_VER is '关联资源版本';
comment on column RHN_INT_EXT_MSG.DT_CREATED is '创建时间';
comment on column RHN_INT_EXT_MSG.DT_SENT is 'sent时间';
comment on column RHN_INT_EXT_MSG.DT_RECEIVED is '接收时间';
comment on column RHN_INT_EXT_MSG.DT_PROCESSED is 'processed时间';
comment on column RHN_INT_EXT_MSG.CD_ERROR is '错误编码';
comment on column RHN_INT_EXT_MSG.DES_ERROR_MSG is '错误消息';
comment on table RHN_INT_IDEMP_RECORD is '幂等记录；一行代表一条幂等记录记录';
comment on column RHN_INT_IDEMP_RECORD.ID_IDEMP_RECORD is '幂等记录主键';
comment on column RHN_INT_IDEMP_RECORD.ID_TNT is '租户标识';
comment on column RHN_INT_IDEMP_RECORD.CD_OPERATION is '业务操作编码';
comment on column RHN_INT_IDEMP_RECORD.CD_IDEMP_KEY is '幂等键';
comment on column RHN_INT_IDEMP_RECORD.HASH_REQ is '请求摘要';
comment on column RHN_INT_IDEMP_RECORD.SD_RSRC_TYPE is '资源类型';
comment on column RHN_INT_IDEMP_RECORD.ID_RSRC is '资源标识';
comment on column RHN_INT_IDEMP_RECORD.SD_STATUS is '状态';
comment on column RHN_INT_IDEMP_RECORD.SD_RESP_STATUS is '响应状态';
comment on column RHN_INT_IDEMP_RECORD.JSON_RESP is '响应JSON';
comment on column RHN_INT_IDEMP_RECORD.DT_CREATED is '创建时间';
comment on column RHN_INT_IDEMP_RECORD.DT_COMPLETED is '完成时间';
comment on column RHN_INT_IDEMP_RECORD.DT_EXPIRES is '到期时间';
comment on table RHN_INT_OUTBOX_EVT is '发件箱事件；一行代表一条发件箱事件记录';
comment on column RHN_INT_OUTBOX_EVT.ID_EVT is '事件标识';
comment on column RHN_INT_OUTBOX_EVT.ID_TNT is '租户标识';
comment on column RHN_INT_OUTBOX_EVT.ID_ORG is '机构标识';
comment on column RHN_INT_OUTBOX_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_INT_OUTBOX_EVT.SN_EVT_VER is '事件版本';
comment on column RHN_INT_OUTBOX_EVT.SD_AGGREGATE_TYPE is 'aggregate类型';
comment on column RHN_INT_OUTBOX_EVT.ID_AGGREGATE is 'aggregate标识';
comment on column RHN_INT_OUTBOX_EVT.SN_AGGREGATE_VER is 'aggregate版本';
comment on column RHN_INT_OUTBOX_EVT.ID_SUBJECT is '主体标识';
comment on column RHN_INT_OUTBOX_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_INT_OUTBOX_EVT.DT_RECORDED is '记录时间';
comment on column RHN_INT_OUTBOX_EVT.CD_ACTOR is '操作人';
comment on column RHN_INT_OUTBOX_EVT.SOURCE is '来源';
comment on column RHN_INT_OUTBOX_EVT.ID_CORRELATION is '关联标识';
comment on column RHN_INT_OUTBOX_EVT.ID_CAUSATION is 'causation标识';
comment on column RHN_INT_OUTBOX_EVT.JSON_PAYLOAD is '载荷JSON';
comment on column RHN_INT_OUTBOX_EVT.SN_SCHEMA_VER is '模式定义版本';
comment on column RHN_INT_OUTBOX_EVT.SD_PUBLICATION_STATUS is 'publication状态';
comment on column RHN_INT_OUTBOX_EVT.DT_PUBLISD is '发布时间';
comment on column RHN_INT_OUTBOX_EVT.QTY_ATTEMPT is 'attempt盘点';
comment on column RHN_INT_OUTBOX_EVT.DES_LAST_ERROR is 'last错误';
comment on column RHN_INT_OUTBOX_EVT.DT_NEXT_ATTEMPT is '下一attempt时间';
comment on column RHN_INT_OUTBOX_EVT.ID_USER_CLAIMED is '认领人标识';
comment on column RHN_INT_OUTBOX_EVT.DT_CLAIMED_UNTIL is '认领until';
comment on table RHN_META_OP_NOTE_FORM_VER is '门诊备注表单版本；一行代表一条门诊备注表单版本记录';
comment on column RHN_META_OP_NOTE_FORM_VER.ID_OP_NOTE_FORM_VER is '门诊备注表单版本主键';
comment on column RHN_META_OP_NOTE_FORM_VER.ID_TNT is '租户标识';
comment on column RHN_META_OP_NOTE_FORM_VER.ID_ORG is '机构标识';
comment on column RHN_META_OP_NOTE_FORM_VER.ID_DEPT is '科室标识';
comment on column RHN_META_OP_NOTE_FORM_VER.CD_FORM is '表单编码';
comment on column RHN_META_OP_NOTE_FORM_VER.CD_VER_NUMBER is '版本编号';
comment on column RHN_META_OP_NOTE_FORM_VER.CD_SPECIALTY is 'specialty编码';
comment on column RHN_META_OP_NOTE_FORM_VER.NA_FORM is '表单名称';
comment on column RHN_META_OP_NOTE_FORM_VER.DES_OP_NOTE_FORM_VER is '说明';
comment on column RHN_META_OP_NOTE_FORM_VER.JSON_DEF_SCHEMA is '定义模式定义';
comment on column RHN_META_OP_NOTE_FORM_VER.JSON_DEF is '定义JSON';
comment on column RHN_META_OP_NOTE_FORM_VER.SD_STATUS is '状态';
comment on column RHN_META_OP_NOTE_FORM_VER.ID_USER_PUBLISD is '发布人标识';
comment on column RHN_META_OP_NOTE_FORM_VER.DT_PUBLISD is '发布时间';
comment on column RHN_META_OP_NOTE_FORM_VER.DT_RETIRED is 'retired时间';
comment on table RHN_META_OP_NOTE_TMPL is '门诊备注模板；一行代表一条门诊备注模板记录';
comment on column RHN_META_OP_NOTE_TMPL.ID_OP_NOTE_TMPL is '门诊备注模板主键';
comment on column RHN_META_OP_NOTE_TMPL.REVISION is '乐观锁修订号';
comment on column RHN_META_OP_NOTE_TMPL.ID_TNT is '租户标识';
comment on column RHN_META_OP_NOTE_TMPL.ID_ORG is '机构标识';
comment on column RHN_META_OP_NOTE_TMPL.ID_DEPT is '科室标识';
comment on column RHN_META_OP_NOTE_TMPL.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_META_OP_NOTE_TMPL.ID_OWNER is '责任方标识';
comment on column RHN_META_OP_NOTE_TMPL.CD_SPECIALTY is 'specialty编码';
comment on column RHN_META_OP_NOTE_TMPL.SD_DOC_TYPE is '文书类型';
comment on column RHN_META_OP_NOTE_TMPL.JSON_CONTENT_SCHEMA is '内容模式定义';
comment on column RHN_META_OP_NOTE_TMPL.NA_TMPL is '模板名称';
comment on column RHN_META_OP_NOTE_TMPL.DES_OP_NOTE_TMPL is '说明';
comment on column RHN_META_OP_NOTE_TMPL.JSON_CONTENT is '内容JSON';
comment on column RHN_META_OP_NOTE_TMPL.SD_STATUS is '状态';
comment on column RHN_META_OP_NOTE_TMPL.SN_SORT is '排序医嘱';
comment on column RHN_META_OP_NOTE_TMPL.QTY_USE is '用途盘点';
comment on column RHN_META_OP_NOTE_TMPL.DT_LAST_USED is 'lastused时间';
comment on column RHN_META_OP_NOTE_TMPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_OP_NOTE_TMPL.DT_CREATED is '创建时间';
comment on column RHN_META_OP_NOTE_TMPL.ID_USER_UPDATED is '更新人标识';
comment on column RHN_META_OP_NOTE_TMPL.DT_UPDATED is '更新时间';
comment on table RHN_META_OP_PLAN_DIAG is '门诊方案诊断；一行代表一条门诊方案诊断记录';
comment on column RHN_META_OP_PLAN_DIAG.ID_OP_PLAN_DIAG is '门诊方案诊断主键';
comment on column RHN_META_OP_PLAN_DIAG.ID_TNT is '租户标识';
comment on column RHN_META_OP_PLAN_DIAG.ID_OP_PLAN_TMPL is '模板标识';
comment on column RHN_META_OP_PLAN_DIAG.SN_LINE is '明细编号';
comment on column RHN_META_OP_PLAN_DIAG.CD_DIAG is '诊断编码';
comment on column RHN_META_OP_PLAN_DIAG.NA_DIAG is '诊断名称';
comment on column RHN_META_OP_PLAN_DIAG.SD_DIAG_TYPE is '诊断类型';
comment on table RHN_META_OP_PLAN_MED is '门诊方案药品；一行代表一条门诊方案药品记录';
comment on column RHN_META_OP_PLAN_MED.ID_OP_PLAN_MED is '门诊方案药品主键';
comment on column RHN_META_OP_PLAN_MED.ID_TNT is '租户标识';
comment on column RHN_META_OP_PLAN_MED.ID_OP_PLAN_TMPL is '模板标识';
comment on column RHN_META_OP_PLAN_MED.SN_LINE is '明细编号';
comment on column RHN_META_OP_PLAN_MED.ID_MED is '药品标识';
comment on column RHN_META_OP_PLAN_MED.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_META_OP_PLAN_MED.ID_PKG is '包装标识';
comment on column RHN_META_OP_PLAN_MED.CD_CAT is '分类编码';
comment on column RHN_META_OP_PLAN_MED.CD_MED is '药品编码';
comment on column RHN_META_OP_PLAN_MED.NA_MED is '药品名称';
comment on column RHN_META_OP_PLAN_MED.PREPARATION_SPEC is '制剂规格';
comment on column RHN_META_OP_PLAN_MED.NA_PRODUCT is '产品名称';
comment on column RHN_META_OP_PLAN_MED.QTY_DOSE_VAL is '剂量值';
comment on column RHN_META_OP_PLAN_MED.DOSE_UNIT is '剂量单位';
comment on column RHN_META_OP_PLAN_MED.CD_ROUTE is '途径编码';
comment on column RHN_META_OP_PLAN_MED.CD_FREQ is '频次编码';
comment on column RHN_META_OP_PLAN_MED.QTY_DURATION_VAL is '时长值';
comment on column RHN_META_OP_PLAN_MED.DURATION_UNIT is '时长单位';
comment on column RHN_META_OP_PLAN_MED.QTY_ORDERED is '数量';
comment on column RHN_META_OP_PLAN_MED.QTY_UNIT is '数量单位';
comment on column RHN_META_OP_PLAN_MED.FG_SUBSTITUTION is '是否substitution允许';
comment on column RHN_META_OP_PLAN_MED.FG_SELF_PROVIDED is '是否selfprovided';
comment on column RHN_META_OP_PLAN_MED.DES_MED_INSTRUCTION is '药品用法';
comment on column RHN_META_OP_PLAN_MED.SD_PRICE_TYPE is '价格类型';
comment on column RHN_META_OP_PLAN_MED.FG_PRICING_REQUIRED is '是否pricing应需';
comment on column RHN_META_OP_PLAN_MED.DES_REASON is '原因文本';
comment on table RHN_META_OP_PLAN_SVC is '门诊方案服务；一行代表一条门诊方案服务记录';
comment on column RHN_META_OP_PLAN_SVC.ID_OP_PLAN_SVC is '门诊方案服务主键';
comment on column RHN_META_OP_PLAN_SVC.ID_TNT is '租户标识';
comment on column RHN_META_OP_PLAN_SVC.ID_OP_PLAN_TMPL is '模板标识';
comment on column RHN_META_OP_PLAN_SVC.SN_LINE is '明细编号';
comment on column RHN_META_OP_PLAN_SVC.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_META_OP_PLAN_SVC.CD_ITEM is '项目编码';
comment on column RHN_META_OP_PLAN_SVC.NA_ITEM is '项目名称';
comment on column RHN_META_OP_PLAN_SVC.SD_SVC_TYPE is '服务类型';
comment on column RHN_META_OP_PLAN_SVC.QTY_ORDERED is '数量';
comment on column RHN_META_OP_PLAN_SVC.CD_UNIT is '单位编码';
comment on column RHN_META_OP_PLAN_SVC.SD_PRICE_TYPE is '价格类型';
comment on column RHN_META_OP_PLAN_SVC.FG_PRICING_REQUIRED is '是否pricing应需';
comment on column RHN_META_OP_PLAN_SVC.DES_REASON is '原因文本';
comment on column RHN_META_OP_PLAN_SVC.DES_CLIN_DESCRIPTION is '临床说明';
comment on table RHN_META_OP_PLAN_TMPL is '门诊方案模板；一行代表一条门诊方案模板记录';
comment on column RHN_META_OP_PLAN_TMPL.ID_OP_PLAN_TMPL is '门诊方案模板主键';
comment on column RHN_META_OP_PLAN_TMPL.REVISION is '乐观锁修订号';
comment on column RHN_META_OP_PLAN_TMPL.ID_TNT is '租户标识';
comment on column RHN_META_OP_PLAN_TMPL.ID_ORG is '机构标识';
comment on column RHN_META_OP_PLAN_TMPL.ID_DEPT is '科室标识';
comment on column RHN_META_OP_PLAN_TMPL.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_META_OP_PLAN_TMPL.ID_OWNER is '责任方标识';
comment on column RHN_META_OP_PLAN_TMPL.NA_TMPL is '模板名称';
comment on column RHN_META_OP_PLAN_TMPL.DES_OP_PLAN_TMPL is '说明';
comment on column RHN_META_OP_PLAN_TMPL.SD_STATUS is '状态';
comment on column RHN_META_OP_PLAN_TMPL.SN_SORT is '排序医嘱';
comment on column RHN_META_OP_PLAN_TMPL.QTY_USE is '用途盘点';
comment on column RHN_META_OP_PLAN_TMPL.DT_LAST_USED is 'lastused时间';
comment on column RHN_META_OP_PLAN_TMPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_OP_PLAN_TMPL.DT_CREATED is '创建时间';
comment on column RHN_META_OP_PLAN_TMPL.ID_USER_UPDATED is '更新人标识';
comment on column RHN_META_OP_PLAN_TMPL.DT_UPDATED is '更新时间';
comment on table RHN_META_PRINT_TMPL is '打印模板；一行代表一条打印模板记录';
comment on column RHN_META_PRINT_TMPL.ID_PRINT_TMPL is '打印模板主键';
comment on column RHN_META_PRINT_TMPL.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_TMPL.ID_TNT is '租户标识';
comment on column RHN_META_PRINT_TMPL.CD_TMPL is '模板编码';
comment on column RHN_META_PRINT_TMPL.NA_TMPL is '模板名称';
comment on column RHN_META_PRINT_TMPL.SD_DOC_TYPE is '文书类型';
comment on column RHN_META_PRINT_TMPL.SD_STATUS is '状态';
comment on column RHN_META_PRINT_TMPL.SN_CURRENT_VER is 'current版本';
comment on column RHN_META_PRINT_TMPL.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_TMPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_TMPL.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_TMPL.ID_USER_UPDATED is '更新人标识';
comment on table RHN_META_PRINT_TMPL_VER is '打印模板版本；一行代表一条打印模板版本记录';
comment on column RHN_META_PRINT_TMPL_VER.ID_PRINT_TMPL_VER is '打印模板版本主键';
comment on column RHN_META_PRINT_TMPL_VER.ID_PRINT_TMPL is '模板标识';
comment on column RHN_META_PRINT_TMPL_VER.CD_VER_NO is '版本编号';
comment on column RHN_META_PRINT_TMPL_VER.JSON_LAYOUT_SCHEMA is '布局模式定义';
comment on column RHN_META_PRINT_TMPL_VER.JSON_CONFIG is '配置JSON';
comment on column RHN_META_PRINT_TMPL_VER.CONTENT_DIGEST_ALGORITHM is '内容摘要算法';
comment on column RHN_META_PRINT_TMPL_VER.HASH_CONTENT is '内容摘要';
comment on column RHN_META_PRINT_TMPL_VER.DT_PUBLISD is '发布时间';
comment on column RHN_META_PRINT_TMPL_VER.ID_USER_PUBLISD is '发布人标识';
comment on table RHN_PI_PAT is '患者；一行代表一条患者记录';
comment on column RHN_PI_PAT.ID_PAT is '患者主键';
comment on column RHN_PI_PAT.ID_TNT is '租户标识';
comment on column RHN_PI_PAT.CD_HEALTH_RECORD_NO is '健康记录编号';
comment on column RHN_PI_PAT.NA_FULL is 'full名称';
comment on column RHN_PI_PAT.ID_NATIONAL is 'national标识';
comment on column RHN_PI_PAT.SD_GENDER is '性别';
comment on column RHN_PI_PAT.DA_BIRTH is 'birth日期';
comment on column RHN_PI_PAT.CD_PHONE is '电话';
comment on column RHN_PI_PAT.DT_CREATED is '创建时间';
comment on column RHN_PI_PAT.ID_USER_CREATED is '创建人标识';
comment on column RHN_PI_PAT.SD_STATUS is '状态';
comment on column RHN_PI_PAT.ID_PAT_MERGED_INTO is '合并into标识';
comment on column RHN_PI_PAT.DT_UPDATED is '更新时间';
comment on column RHN_PI_PAT.REVISION is '乐观锁修订号';
comment on column RHN_PI_PAT.FG_DECEASED is '是否deceased';
comment on column RHN_PI_PAT.DT_DECEASED is 'deceased时间';
comment on column RHN_PI_PAT.ID_USER_UPDATED is '更新人标识';
comment on table RHN_PI_PAT_ADDR is '患者地址；一行代表一条患者地址记录';
comment on column RHN_PI_PAT_ADDR.ID_PAT_ADDR is '患者地址主键';
comment on column RHN_PI_PAT_ADDR.REVISION is '乐观锁修订号';
comment on column RHN_PI_PAT_ADDR.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_ADDR.ID_PAT is '患者标识';
comment on column RHN_PI_PAT_ADDR.CD_USE is '用途编码';
comment on column RHN_PI_PAT_ADDR.CD_PROVINCE is 'province编码';
comment on column RHN_PI_PAT_ADDR.CD_CITY is 'city编码';
comment on column RHN_PI_PAT_ADDR.CD_DISTRICT is 'district编码';
comment on column RHN_PI_PAT_ADDR.CD_STREET is 'street编码';
comment on column RHN_PI_PAT_ADDR.DES_ADDRESS is '地址文本';
comment on column RHN_PI_PAT_ADDR.CD_POSTAL is 'postal编码';
comment on column RHN_PI_PAT_ADDR.FG_PRIMARY_FLAG is '是否主要flag';
comment on column RHN_PI_PAT_ADDR.DA_VALID_FROM is '有效开始日期';
comment on column RHN_PI_PAT_ADDR.DA_VALID_TO is '有效结束日期';
comment on column RHN_PI_PAT_ADDR.SD_STATUS is '状态';
comment on column RHN_PI_PAT_ADDR.DT_CREATED is '创建时间';
comment on column RHN_PI_PAT_ADDR.ID_USER_CREATED is '创建人标识';
comment on column RHN_PI_PAT_ADDR.DT_UPDATED is '更新时间';
comment on column RHN_PI_PAT_ADDR.ID_USER_UPDATED is '更新人标识';
comment on column RHN_PI_PAT_ADDR.CD_COMMUNITY is 'community编码';
comment on table RHN_PI_PAT_DEMO_PROF is '患者人口学档案；一行代表一条患者人口学档案记录';
comment on column RHN_PI_PAT_DEMO_PROF.ID_PAT is '患者标识';
comment on column RHN_PI_PAT_DEMO_PROF.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_DEMO_PROF.CD_NATIONALITY is 'nationality编码';
comment on column RHN_PI_PAT_DEMO_PROF.CD_ETHNICITY is 'ethnicity编码';
comment on column RHN_PI_PAT_DEMO_PROF.CD_MARITAL_STATUS is 'marital状态编码';
comment on column RHN_PI_PAT_DEMO_PROF.CD_EDUCATION is 'education编码';
comment on column RHN_PI_PAT_DEMO_PROF.CD_OCCUPATION is 'occupation编码';
comment on column RHN_PI_PAT_DEMO_PROF.CD_BLOOD_TYPE is 'blood类型编码';
comment on column RHN_PI_PAT_DEMO_PROF.CD_RH_TYPE is 'rh类型编码';
comment on column RHN_PI_PAT_DEMO_PROF.DT_UPDATED is '更新时间';
comment on column RHN_PI_PAT_DEMO_PROF.ID_USER_UPDATED is '更新人标识';
comment on column RHN_PI_PAT_DEMO_PROF.CD_RESIDENCY_TYPE is 'residency类型编码';
comment on table RHN_PI_PAT_EMPL is '患者任职；一行代表一条患者任职记录';
comment on column RHN_PI_PAT_EMPL.ID_PAT_EMPL is '患者任职主键';
comment on column RHN_PI_PAT_EMPL.REVISION is '乐观锁修订号';
comment on column RHN_PI_PAT_EMPL.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_EMPL.ID_PAT is '患者标识';
comment on column RHN_PI_PAT_EMPL.NA_EMPLOYER is 'employer名称';
comment on column RHN_PI_PAT_EMPL.CD_OCCUPATION is 'occupation编码';
comment on column RHN_PI_PAT_EMPL.CD_PHONE is '电话';
comment on column RHN_PI_PAT_EMPL.CD_POSTAL is 'postal编码';
comment on column RHN_PI_PAT_EMPL.DES_ADDRESS is '地址文本';
comment on column RHN_PI_PAT_EMPL.FG_PRIMARY_FLAG is '是否主要flag';
comment on column RHN_PI_PAT_EMPL.DA_VALID_FROM is '有效开始日期';
comment on column RHN_PI_PAT_EMPL.DA_VALID_TO is '有效结束日期';
comment on column RHN_PI_PAT_EMPL.SD_STATUS is '状态';
comment on column RHN_PI_PAT_EMPL.DT_CREATED is '创建时间';
comment on column RHN_PI_PAT_EMPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_PI_PAT_EMPL.DT_UPDATED is '更新时间';
comment on column RHN_PI_PAT_EMPL.ID_USER_UPDATED is '更新人标识';
comment on table RHN_PI_PAT_IDENT is '患者标识；一行代表一条患者标识记录';
comment on column RHN_PI_PAT_IDENT.ID_PAT_IDENT is '患者标识主键';
comment on column RHN_PI_PAT_IDENT.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_IDENT.ID_PAT is '患者标识';
comment on column RHN_PI_PAT_IDENT.CD_IDENT_SYS is '标识体系';
comment on column RHN_PI_PAT_IDENT.CD_IDENT_VAL is '标识值';
comment on column RHN_PI_PAT_IDENT.NORMALIZED_VALUE is '标准化值';
comment on column RHN_PI_PAT_IDENT.SD_USE_TYPE is '用途类型';
comment on column RHN_PI_PAT_IDENT.SD_STATUS is '状态';
comment on column RHN_PI_PAT_IDENT.ID_ORG_SRC is '来源机构标识';
comment on column RHN_PI_PAT_IDENT.DA_VALID_FROM is '有效开始日期';
comment on column RHN_PI_PAT_IDENT.DA_VALID_TO is '有效结束日期';
comment on column RHN_PI_PAT_IDENT.DT_CREATED is '创建时间';
comment on table RHN_PI_PAT_MATCH_CAND is '患者匹配候选；一行代表一条患者匹配候选记录';
comment on column RHN_PI_PAT_MATCH_CAND.ID_PAT_MATCH_CAND is '患者匹配候选主键';
comment on column RHN_PI_PAT_MATCH_CAND.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_MATCH_CAND.ID_PAT_SRC_RECORD is '来源记录标识';
comment on column RHN_PI_PAT_MATCH_CAND.ID_PAT_CAND is '候选患者标识';
comment on column RHN_PI_PAT_MATCH_CAND.MATCH_SCORE is '匹配score';
comment on column RHN_PI_PAT_MATCH_CAND.JSON_REASONS is '原因JSON';
comment on column RHN_PI_PAT_MATCH_CAND.SD_DECISION is '决定';
comment on column RHN_PI_PAT_MATCH_CAND.ID_USER_REVIEWED is 'reviewed人标识';
comment on column RHN_PI_PAT_MATCH_CAND.DT_REVIEWED is 'reviewed时间';
comment on table RHN_PI_PAT_MERGE_HIST is '患者合并历史；一行代表一条患者合并历史记录';
comment on column RHN_PI_PAT_MERGE_HIST.ID_PAT_MERGE_HIST is '患者合并历史主键';
comment on column RHN_PI_PAT_MERGE_HIST.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_MERGE_HIST.ID_PAT_SURVIVING is 'surviving患者标识';
comment on column RHN_PI_PAT_MERGE_HIST.ID_PAT_MERGED is '合并患者标识';
comment on column RHN_PI_PAT_MERGE_HIST.MOVED_IDENTIFIER_IDS is 'moved标识ids';
comment on column RHN_PI_PAT_MERGE_HIST.MOVED_SOURCE_RECORD_IDS is 'moved来源记录ids';
comment on column RHN_PI_PAT_MERGE_HIST.DES_REASON is '原因';
comment on column RHN_PI_PAT_MERGE_HIST.ID_USER_MERGED is '合并人标识';
comment on column RHN_PI_PAT_MERGE_HIST.DT_MERGED is '合并时间';
comment on column RHN_PI_PAT_MERGE_HIST.DT_SPLIT is '拆分时间';
comment on table RHN_PI_PAT_RELATED_PERSON is '患者关联人员；一行代表一条患者关联人员记录';
comment on column RHN_PI_PAT_RELATED_PERSON.ID_PAT_RELATED_PERSON is '患者关联人员主键';
comment on column RHN_PI_PAT_RELATED_PERSON.REVISION is '乐观锁修订号';
comment on column RHN_PI_PAT_RELATED_PERSON.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_RELATED_PERSON.ID_PAT is '患者标识';
comment on column RHN_PI_PAT_RELATED_PERSON.NA_FULL is 'full名称';
comment on column RHN_PI_PAT_RELATED_PERSON.CD_RELATIONSHIP is 'relationship编码';
comment on column RHN_PI_PAT_RELATED_PERSON.CD_PHONE is '电话';
comment on column RHN_PI_PAT_RELATED_PERSON.DES_ADDRESS is '地址文本';
comment on column RHN_PI_PAT_RELATED_PERSON.FG_GUARDIAN_FLAG is '是否guardianflag';
comment on column RHN_PI_PAT_RELATED_PERSON.FG_EMERGENCY_CONTACT_FLAG is '是否emergency联系方式flag';
comment on column RHN_PI_PAT_RELATED_PERSON.DA_VALID_FROM is '有效开始日期';
comment on column RHN_PI_PAT_RELATED_PERSON.DA_VALID_TO is '有效结束日期';
comment on column RHN_PI_PAT_RELATED_PERSON.SD_STATUS is '状态';
comment on column RHN_PI_PAT_RELATED_PERSON.DT_CREATED is '创建时间';
comment on column RHN_PI_PAT_RELATED_PERSON.ID_USER_CREATED is '创建人标识';
comment on column RHN_PI_PAT_RELATED_PERSON.DT_UPDATED is '更新时间';
comment on column RHN_PI_PAT_RELATED_PERSON.ID_USER_UPDATED is '更新人标识';
comment on table RHN_PI_PAT_SPLIT_HIST is '患者拆分历史；一行代表一条患者拆分历史记录';
comment on column RHN_PI_PAT_SPLIT_HIST.ID_PAT_SPLIT_HIST is '患者拆分历史主键';
comment on column RHN_PI_PAT_SPLIT_HIST.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_SPLIT_HIST.ID_PAT_MERGE_HIST is '合并历史标识';
comment on column RHN_PI_PAT_SPLIT_HIST.ID_PAT_RESTORED is 'restored患者标识';
comment on column RHN_PI_PAT_SPLIT_HIST.RESTORED_IDENTIFIER_IDS is 'restored标识ids';
comment on column RHN_PI_PAT_SPLIT_HIST.DES_REASON is '原因';
comment on column RHN_PI_PAT_SPLIT_HIST.ID_USER_SPLIT is '拆分人标识';
comment on column RHN_PI_PAT_SPLIT_HIST.DT_SPLIT is '拆分时间';
comment on table RHN_PI_PAT_SRC_RECORD is '患者来源记录；一行代表一条患者来源记录记录';
comment on column RHN_PI_PAT_SRC_RECORD.ID_PAT_SRC_RECORD is '患者来源记录主键';
comment on column RHN_PI_PAT_SRC_RECORD.ID_TNT is '租户标识';
comment on column RHN_PI_PAT_SRC_RECORD.ID_ORG_SRC is '来源机构标识';
comment on column RHN_PI_PAT_SRC_RECORD.CD_SRC_SYS is '来源体系';
comment on column RHN_PI_PAT_SRC_RECORD.ID_SRC_RECORD is '来源记录标识';
comment on column RHN_PI_PAT_SRC_RECORD.ID_PAT is '患者标识';
comment on column RHN_PI_PAT_SRC_RECORD.SD_MATCH_STATUS is '匹配状态';
comment on column RHN_PI_PAT_SRC_RECORD.JSON_RAW_PAYLOAD is 'raw载荷JSON';
comment on column RHN_PI_PAT_SRC_RECORD.DT_LAST_SEEN is 'lastseen时间';
comment on column RHN_PI_PAT_SRC_RECORD.ID_USER_LINKED is 'linked人标识';
comment on column RHN_PI_PAT_SRC_RECORD.DT_LINKED is 'linked时间';
comment on column RHN_PI_PAT_SRC_RECORD.DES_LINK_REASON is 'link原因';
comment on column RHN_PI_PAT_SRC_RECORD.REVISION is '乐观锁修订号';
comment on table RHN_SC_APPT is '预约；一行代表一条预约记录';
comment on column RHN_SC_APPT.ID_APPT is '预约主键';
comment on column RHN_SC_APPT.REVISION is '乐观锁修订号';
comment on column RHN_SC_APPT.ID_TNT is '租户标识';
comment on column RHN_SC_APPT.ID_SVC_SCHED is '排班标识';
comment on column RHN_SC_APPT.ID_SCHED_SLOT_POOL is '号源池标识';
comment on column RHN_SC_APPT.ID_PAT is '患者标识';
comment on column RHN_SC_APPT.CD_APPT_NO is '预约编号';
comment on column RHN_SC_APPT.CD_IDEMP is '幂等编码';
comment on column RHN_SC_APPT.SD_STATUS is '状态';
comment on column RHN_SC_APPT.CD_SVC is '服务编码';
comment on column RHN_SC_APPT.NA_SVC_SNAP is '服务名称快照';
comment on column RHN_SC_APPT.ID_PRACT is '医务人员标识';
comment on column RHN_SC_APPT.NA_PRACT_SNAP is '医务人员名称快照';
comment on column RHN_SC_APPT.DT_START is '开始时间';
comment on column RHN_SC_APPT.DT_END is '结束时间';
comment on column RHN_SC_APPT.QTY_APPT is '数量';
comment on column RHN_SC_APPT.DT_CONFIRMED is '确认时间';
comment on column RHN_SC_APPT.DT_CHECKED_IN is 'checkedin时间';
comment on column RHN_SC_APPT.DT_CREATED is '创建时间';
comment on column RHN_SC_APPT.ID_USER_CREATED is '创建人标识';
comment on column RHN_SC_APPT.ID_SCHED_SLOT_HOLD is '号源占用标识';
comment on column RHN_SC_APPT.SD_BOOKING_SRC is '预约来源';
comment on column RHN_SC_APPT.DT_CANCELLED is '取消时间';
comment on column RHN_SC_APPT.DES_CANCELLATION_REASON is 'cancellation原因';
comment on column RHN_SC_APPT.ID_APPT_RESCHEDULED_FROM is 'rescheduled原标识';
comment on column RHN_SC_APPT.DT_UPDATED is '更新时间';
comment on column RHN_SC_APPT.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SC_APPT_EVT is '预约事件；一行代表一条预约事件记录';
comment on column RHN_SC_APPT_EVT.ID_APPT_EVT is '预约事件主键';
comment on column RHN_SC_APPT_EVT.ID_TNT is '租户标识';
comment on column RHN_SC_APPT_EVT.ID_APPT is '预约标识';
comment on column RHN_SC_APPT_EVT.ID_APPT_REPLACEMENT is 'replacement预约标识';
comment on column RHN_SC_APPT_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SC_APPT_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_SC_APPT_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_SC_APPT_EVT.CD_COMMAND is '命令编码';
comment on column RHN_SC_APPT_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SC_APPT_EVT.ID_USER_OCCURRED is '发生人标识';
comment on column RHN_SC_APPT_EVT.DES_APPT_EVT is '说明';
comment on table RHN_SC_PAT_REG is '患者挂号；一行代表一条患者挂号记录';
comment on column RHN_SC_PAT_REG.ID_PAT_REG is '患者挂号主键';
comment on column RHN_SC_PAT_REG.REVISION is '乐观锁修订号';
comment on column RHN_SC_PAT_REG.ID_TNT is '租户标识';
comment on column RHN_SC_PAT_REG.ID_APPT is '预约标识';
comment on column RHN_SC_PAT_REG.ID_SVC_SCHED is '排班标识';
comment on column RHN_SC_PAT_REG.ID_PAT is '患者标识';
comment on column RHN_SC_PAT_REG.ID_ORG is '机构标识';
comment on column RHN_SC_PAT_REG.ID_DEPT is '科室标识';
comment on column RHN_SC_PAT_REG.ID_ENC is '就诊标识';
comment on column RHN_SC_PAT_REG.CD_REG_NO is '挂号编号';
comment on column RHN_SC_PAT_REG.CD_IDEMP is '幂等编码';
comment on column RHN_SC_PAT_REG.SD_REG_SRC is '挂号来源';
comment on column RHN_SC_PAT_REG.SD_VISIT_TYPE is 'visit类型';
comment on column RHN_SC_PAT_REG.SD_STATUS is '状态';
comment on column RHN_SC_PAT_REG.DT_REGISTERED is 'registered时间';
comment on column RHN_SC_PAT_REG.ID_USER_REGISTERED is 'registered人标识';
comment on column RHN_SC_PAT_REG.DT_STARTED is '开始时间';
comment on column RHN_SC_PAT_REG.DT_COMPLETED is '完成时间';
comment on table RHN_SC_SVC_QUEUE is '服务队列；一行代表一个可独立编号和调度的服务队列';
comment on column RHN_SC_SVC_QUEUE.ID_SVC_QUEUE is '服务队列主键';
comment on column RHN_SC_SVC_QUEUE.REVISION is '乐观锁修订号';
comment on column RHN_SC_SVC_QUEUE.ID_TNT is '租户标识';
comment on column RHN_SC_SVC_QUEUE.ID_ORG is '机构标识';
comment on column RHN_SC_SVC_QUEUE.ID_DEPT is '科室标识';
comment on column RHN_SC_SVC_QUEUE.ID_SVC_LOC_WAITING is '候诊服务位置标识';
comment on column RHN_SC_SVC_QUEUE.CD_SVC_QUEUE is '服务队列编码';
comment on column RHN_SC_SVC_QUEUE.NA_SVC_QUEUE is '服务队列名称';
comment on column RHN_SC_SVC_QUEUE.SD_SCENE is '排队业务场景';
comment on column RHN_SC_SVC_QUEUE.CD_TICKET_PREFIX is '票号前缀';
comment on column RHN_SC_SVC_QUEUE.FG_ACTIVE is '是否有效';
comment on column RHN_SC_SVC_QUEUE.DT_CREATED is '创建时间';
comment on column RHN_SC_SVC_QUEUE.ID_USER_CREATED is '创建人标识';
comment on column RHN_SC_SVC_QUEUE.DT_UPDATED is '更新时间';
comment on column RHN_SC_SVC_QUEUE.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SC_QUEUE_COUNT is '队列计数器；一行代表一个服务队列在一个业务日期的发号进度';
comment on column RHN_SC_QUEUE_COUNT.ID_QUEUE_COUNT is '队列计数器主键';
comment on column RHN_SC_QUEUE_COUNT.REVISION is '乐观锁修订号';
comment on column RHN_SC_QUEUE_COUNT.ID_TNT is '租户标识';
comment on column RHN_SC_QUEUE_COUNT.ID_SVC_QUEUE is '服务队列标识';
comment on column RHN_SC_QUEUE_COUNT.DA_BUSINESS is '业务日期';
comment on column RHN_SC_QUEUE_COUNT.SN_NEXT is '下一序号';
comment on table RHN_SC_QUEUE_TICKET is '排队号票；一行代表一名患者一次进入一个服务队列';
comment on column RHN_SC_QUEUE_TICKET.ID_QUEUE_TICKET is '队列票号主键';
comment on column RHN_SC_QUEUE_TICKET.REVISION is '乐观锁修订号';
comment on column RHN_SC_QUEUE_TICKET.ID_TNT is '租户标识';
comment on column RHN_SC_QUEUE_TICKET.ID_SVC_QUEUE is '服务队列标识';
comment on column RHN_SC_QUEUE_TICKET.ID_PAT is '患者标识';
comment on column RHN_SC_QUEUE_TICKET.ID_ENC is '就诊标识';
comment on column RHN_SC_QUEUE_TICKET.SD_SOURCE_TYPE is '来源业务类型';
comment on column RHN_SC_QUEUE_TICKET.ID_SOURCE is '来源业务聚合标识';
comment on column RHN_SC_QUEUE_TICKET.CD_IDEMP is '幂等编码';
comment on column RHN_SC_QUEUE_TICKET.DA_BUSINESS is '业务日期';
comment on column RHN_SC_QUEUE_TICKET.CD_TICKET is '票号编码';
comment on column RHN_SC_QUEUE_TICKET.SN_SEQUENCE is '队内原始序号';
comment on column RHN_SC_QUEUE_TICKET.SN_PRIORITY is '调度优先级';
comment on column RHN_SC_QUEUE_TICKET.SD_STATUS is '状态';
comment on column RHN_SC_QUEUE_TICKET.DT_CHECKED_IN is '签到时间';
comment on column RHN_SC_QUEUE_TICKET.DT_READY is '可呼叫时间';
comment on column RHN_SC_QUEUE_TICKET.DT_CALLED is '最近叫号时间';
comment on column RHN_SC_QUEUE_TICKET.DT_STARTED is '开始服务时间';
comment on column RHN_SC_QUEUE_TICKET.DT_COMPLETED is '结束时间';
comment on column RHN_SC_QUEUE_TICKET.QTY_CALL is '叫号次数';
comment on column RHN_SC_QUEUE_TICKET.QTY_MISSED is '过号次数';
comment on column RHN_SC_QUEUE_TICKET.ID_SVC_LOC_CURRENT is '当前服务位置标识';
comment on table RHN_SC_QUEUE_TICKET_EVT is '排队号票事件；一行代表一次不可变的号票业务动作';
comment on column RHN_SC_QUEUE_TICKET_EVT.ID_QUEUE_TICKET_EVT is '队列票号事件主键';
comment on column RHN_SC_QUEUE_TICKET_EVT.ID_TNT is '租户标识';
comment on column RHN_SC_QUEUE_TICKET_EVT.ID_QUEUE_TICKET is '队列票号标识';
comment on column RHN_SC_QUEUE_TICKET_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SC_QUEUE_TICKET_EVT.SD_STATUS_FROM is '变更前状态';
comment on column RHN_SC_QUEUE_TICKET_EVT.SD_STATUS_TO is '变更后状态';
comment on column RHN_SC_QUEUE_TICKET_EVT.CD_COMMAND is '命令编码';
comment on column RHN_SC_QUEUE_TICKET_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SC_QUEUE_TICKET_EVT.ID_USER_OCCURRED is '发生人标识';
comment on column RHN_SC_QUEUE_TICKET_EVT.ID_SVC_LOC is '动作发生或目标服务位置标识';
comment on column RHN_SC_QUEUE_TICKET_EVT.DES_QUEUE_TICKET_EVT is '说明';
comment on table RHN_SC_SCHED_EXCEPT is '排班例外；一行代表一条排班例外记录';
comment on column RHN_SC_SCHED_EXCEPT.ID_SCHED_EXCEPT is '排班例外主键';
comment on column RHN_SC_SCHED_EXCEPT.ID_TNT is '租户标识';
comment on column RHN_SC_SCHED_EXCEPT.ID_SCHED_TMPL is '模板标识';
comment on column RHN_SC_SCHED_EXCEPT.DA_EXCEPT is '例外日期';
comment on column RHN_SC_SCHED_EXCEPT.SD_EXCEPT_TYPE is '例外类型';
comment on column RHN_SC_SCHED_EXCEPT.QTY_MINUTE_START is 'minute开始';
comment on column RHN_SC_SCHED_EXCEPT.QTY_MINUTE_END is 'minute结束';
comment on column RHN_SC_SCHED_EXCEPT.QTY_CAPACITY is '容量';
comment on column RHN_SC_SCHED_EXCEPT.QTY_SLOT_MINUTES is '号源minutes';
comment on column RHN_SC_SCHED_EXCEPT.DES_REASON is '原因';
comment on column RHN_SC_SCHED_EXCEPT.DT_CREATED is '创建时间';
comment on column RHN_SC_SCHED_EXCEPT.ID_USER_CREATED is '创建人标识';
comment on table RHN_SC_SCHED_GEN_RUN is '排班生成运行；一行代表一条排班生成运行记录';
comment on column RHN_SC_SCHED_GEN_RUN.ID_SCHED_GEN_RUN is '排班生成运行主键';
comment on column RHN_SC_SCHED_GEN_RUN.REVISION is '乐观锁修订号';
comment on column RHN_SC_SCHED_GEN_RUN.ID_TNT is '租户标识';
comment on column RHN_SC_SCHED_GEN_RUN.ID_SCHED_TMPL is '模板标识';
comment on column RHN_SC_SCHED_GEN_RUN.CD_IDEMP is '幂等编码';
comment on column RHN_SC_SCHED_GEN_RUN.DA_DATE_FROM is '日期开始日期';
comment on column RHN_SC_SCHED_GEN_RUN.DA_DATE_TO is '日期结束日期';
comment on column RHN_SC_SCHED_GEN_RUN.SD_TRIGGER_TYPE is '触发类型';
comment on column RHN_SC_SCHED_GEN_RUN.SD_STATUS is '状态';
comment on column RHN_SC_SCHED_GEN_RUN.QTY_GENERATED is '生成盘点';
comment on column RHN_SC_SCHED_GEN_RUN.QTY_SKIPPED is 'skipped盘点';
comment on column RHN_SC_SCHED_GEN_RUN.JSON_REQ is '请求JSON';
comment on column RHN_SC_SCHED_GEN_RUN.DT_STARTED is '开始时间';
comment on column RHN_SC_SCHED_GEN_RUN.DT_COMPLETED is '完成时间';
comment on column RHN_SC_SCHED_GEN_RUN.DES_ERROR_MSG is '错误消息';
comment on column RHN_SC_SCHED_GEN_RUN.ID_USER_TRIGGERED is 'triggered人标识';
comment on table RHN_SC_SCHED_SLOT_HOLD is '排班号源占用；一行代表一条排班号源占用记录';
comment on column RHN_SC_SCHED_SLOT_HOLD.ID_SCHED_SLOT_HOLD is '排班号源占用主键';
comment on column RHN_SC_SCHED_SLOT_HOLD.REVISION is '乐观锁修订号';
comment on column RHN_SC_SCHED_SLOT_HOLD.ID_TNT is '租户标识';
comment on column RHN_SC_SCHED_SLOT_HOLD.ID_SCHED_SLOT_POOL is '号源池标识';
comment on column RHN_SC_SCHED_SLOT_HOLD.ID_SVC_SCHED is '排班标识';
comment on column RHN_SC_SCHED_SLOT_HOLD.ID_PAT is '患者标识';
comment on column RHN_SC_SCHED_SLOT_HOLD.CD_IDEMP is '幂等编码';
comment on column RHN_SC_SCHED_SLOT_HOLD.QTY_HELD is '数量';
comment on column RHN_SC_SCHED_SLOT_HOLD.SD_STATUS is '状态';
comment on column RHN_SC_SCHED_SLOT_HOLD.DT_CREATED is '创建时间';
comment on column RHN_SC_SCHED_SLOT_HOLD.DT_EXPIRES is '到期时间';
comment on column RHN_SC_SCHED_SLOT_HOLD.DT_CLOSED is '关闭时间';
comment on column RHN_SC_SCHED_SLOT_HOLD.ID_PAT_REG_CONSUMED is '消耗挂号标识';
comment on table RHN_SC_SCHED_SLOT_POOL is '排班号源池；一行代表一条排班号源池记录';
comment on column RHN_SC_SCHED_SLOT_POOL.ID_SCHED_SLOT_POOL is '排班号源池主键';
comment on column RHN_SC_SCHED_SLOT_POOL.REVISION is '乐观锁修订号';
comment on column RHN_SC_SCHED_SLOT_POOL.ID_TNT is '租户标识';
comment on column RHN_SC_SCHED_SLOT_POOL.ID_SVC_SCHED is '排班标识';
comment on column RHN_SC_SCHED_SLOT_POOL.CD_POOL is '池编码';
comment on column RHN_SC_SCHED_SLOT_POOL.SD_SLOT_MODE is '号源模式';
comment on column RHN_SC_SCHED_SLOT_POOL.SD_QUOTA_MODE is 'quota模式';
comment on column RHN_SC_SCHED_SLOT_POOL.QTY_TOTAL is '总计盘点';
comment on column RHN_SC_SCHED_SLOT_POOL.QTY_HELD is 'held盘点';
comment on column RHN_SC_SCHED_SLOT_POOL.QTY_OCCUPIED is 'occupied盘点';
comment on column RHN_SC_SCHED_SLOT_POOL.QTY_FROZEN is 'frozen盘点';
comment on column RHN_SC_SCHED_SLOT_POOL.SD_STATUS is '状态';
comment on column RHN_SC_SCHED_SLOT_POOL.DT_CREATED is '创建时间';
comment on column RHN_SC_SCHED_SLOT_POOL.DT_UPDATED is '更新时间';
comment on table RHN_SC_SCHED_TMPL is '排班模板；一行代表一条排班模板记录';
comment on column RHN_SC_SCHED_TMPL.ID_SCHED_TMPL is '排班模板主键';
comment on column RHN_SC_SCHED_TMPL.REVISION is '乐观锁修订号';
comment on column RHN_SC_SCHED_TMPL.ID_TNT is '租户标识';
comment on column RHN_SC_SCHED_TMPL.ID_SVC_RSRC is '资源标识';
comment on column RHN_SC_SCHED_TMPL.CD_TMPL is '模板编码';
comment on column RHN_SC_SCHED_TMPL.NA_TMPL is '模板名称';
comment on column RHN_SC_SCHED_TMPL.SD_MGMT_MODE is '管理模式';
comment on column RHN_SC_SCHED_TMPL.CD_TIMEZONE is '时区编码';
comment on column RHN_SC_SCHED_TMPL.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SC_SCHED_TMPL.DA_VALID_TO is '有效结束日期';
comment on column RHN_SC_SCHED_TMPL.SD_STATUS is '状态';
comment on column RHN_SC_SCHED_TMPL.DT_CREATED is '创建时间';
comment on column RHN_SC_SCHED_TMPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_SC_SCHED_TMPL.DT_UPDATED is '更新时间';
comment on column RHN_SC_SCHED_TMPL.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SC_SCHED_TMPL_PERIOD is '排班模板期间；一行代表一条排班模板期间记录';
comment on column RHN_SC_SCHED_TMPL_PERIOD.ID_SCHED_TMPL_PERIOD is '排班模板期间主键';
comment on column RHN_SC_SCHED_TMPL_PERIOD.ID_TNT is '租户标识';
comment on column RHN_SC_SCHED_TMPL_PERIOD.ID_SCHED_TMPL is '模板标识';
comment on column RHN_SC_SCHED_TMPL_PERIOD.SD_DAY_OF_WEEK is '日时点week';
comment on column RHN_SC_SCHED_TMPL_PERIOD.SD_DAY_PART is '日part';
comment on column RHN_SC_SCHED_TMPL_PERIOD.QTY_MINUTE_START is 'minute开始';
comment on column RHN_SC_SCHED_TMPL_PERIOD.QTY_MINUTE_END is 'minute结束';
comment on column RHN_SC_SCHED_TMPL_PERIOD.QTY_DEFAULT_CAPACITY is '默认容量';
comment on column RHN_SC_SCHED_TMPL_PERIOD.SD_SLOT_MODE is '号源模式';
comment on column RHN_SC_SCHED_TMPL_PERIOD.FG_ACTIVE is '是否有效';
comment on column RHN_SC_SCHED_TMPL_PERIOD.QTY_SLOT_MINUTES is '号源minutes';
comment on table RHN_SC_SLOT_EVT is '号源事件；一行代表一条号源事件记录';
comment on column RHN_SC_SLOT_EVT.ID_SLOT_EVT is '号源事件主键';
comment on column RHN_SC_SLOT_EVT.ID_TNT is '租户标识';
comment on column RHN_SC_SLOT_EVT.ID_SCHED_SLOT_POOL is '池标识';
comment on column RHN_SC_SLOT_EVT.ID_SVC_SCHED is '排班标识';
comment on column RHN_SC_SLOT_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SC_SLOT_EVT.SN_SEQUENCE is '序号编号';
comment on column RHN_SC_SLOT_EVT.QTY_TOTAL_DELTA is '总计变动量';
comment on column RHN_SC_SLOT_EVT.QTY_HELD_DELTA is 'held变动量';
comment on column RHN_SC_SLOT_EVT.QTY_OCCUPIED_DELTA is 'occupied变动量';
comment on column RHN_SC_SLOT_EVT.QTY_FROZEN_DELTA is 'frozen变动量';
comment on column RHN_SC_SLOT_EVT.CD_COMMAND is '命令编码';
comment on column RHN_SC_SLOT_EVT.ID_USER_ACTOR is '操作人用户标识';
comment on column RHN_SC_SLOT_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SC_SLOT_EVT.DES_SLOT_EVT is '说明';
comment on table RHN_SC_SVC_SCHED is '服务排班；一行代表一条服务排班记录';
comment on column RHN_SC_SVC_SCHED.ID_SVC_SCHED is '服务排班主键';
comment on column RHN_SC_SVC_SCHED.REVISION is '乐观锁修订号';
comment on column RHN_SC_SVC_SCHED.ID_TNT is '租户标识';
comment on column RHN_SC_SVC_SCHED.ID_SVC_RSRC is '资源标识';
comment on column RHN_SC_SVC_SCHED.ID_SCHED_TMPL is '模板标识';
comment on column RHN_SC_SVC_SCHED.ID_SCHED_TMPL_PERIOD is '模板期间标识';
comment on column RHN_SC_SVC_SCHED.ID_SCHED_GEN_RUN is '生成运行标识';
comment on column RHN_SC_SVC_SCHED.ID_ORG is '机构标识';
comment on column RHN_SC_SVC_SCHED.ID_DEPT is '科室标识';
comment on column RHN_SC_SVC_SCHED.ID_PRACT is '医务人员标识';
comment on column RHN_SC_SVC_SCHED.ID_STAFF_ASSIGN is '任职标识';
comment on column RHN_SC_SVC_SCHED.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_SC_SVC_SCHED.CD_SCHED is '排班编码';
comment on column RHN_SC_SVC_SCHED.SD_MGMT_MODE is '管理模式';
comment on column RHN_SC_SVC_SCHED.SD_SCHED_TYPE is '排班类型';
comment on column RHN_SC_SVC_SCHED.SD_BOOKING_POLICY is '预约策略';
comment on column RHN_SC_SVC_SCHED.SD_DAY_PART is '日part';
comment on column RHN_SC_SVC_SCHED.NA_PRACT_SNAP is '医务人员名称快照';
comment on column RHN_SC_SVC_SCHED.CD_SVC_SNAP is '服务编码快照';
comment on column RHN_SC_SVC_SCHED.NA_SVC_SNAP is '服务名称快照';
comment on column RHN_SC_SVC_SCHED.NA_LOC is '位置名称';
comment on column RHN_SC_SVC_SCHED.CD_TIMEZONE is '时区编码';
comment on column RHN_SC_SVC_SCHED.DA_SVC is '服务日期';
comment on column RHN_SC_SVC_SCHED.DT_START is '开始时间';
comment on column RHN_SC_SVC_SCHED.DT_END is '结束时间';
comment on column RHN_SC_SVC_SCHED.QTY_TOTAL_CAPACITY is '总计容量';
comment on column RHN_SC_SVC_SCHED.SD_STATUS is '状态';
comment on column RHN_SC_SVC_SCHED.DT_CREATED is '创建时间';
comment on column RHN_SC_SVC_SCHED.ID_USER_CREATED is '创建人标识';
comment on column RHN_SC_SVC_SCHED.DT_UPDATED is '更新时间';
comment on column RHN_SC_SVC_SCHED.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SC_SVC_SCHED.SD_REG_SCOPE is '挂号范围';
comment on table RHN_SC_SVC_SCHED_EVT is '服务排班事件；一行代表一条服务排班事件记录';
comment on column RHN_SC_SVC_SCHED_EVT.ID_SVC_SCHED_EVT is '服务排班事件主键';
comment on column RHN_SC_SVC_SCHED_EVT.ID_TNT is '租户标识';
comment on column RHN_SC_SVC_SCHED_EVT.ID_SVC_SCHED is '排班标识';
comment on column RHN_SC_SVC_SCHED_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SC_SVC_SCHED_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_SC_SVC_SCHED_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_SC_SVC_SCHED_EVT.CD_COMMAND is '命令编码';
comment on column RHN_SC_SVC_SCHED_EVT.ID_USER_ACTOR is '操作人用户标识';
comment on column RHN_SC_SVC_SCHED_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SC_SVC_SCHED_EVT.DES_SVC_SCHED_EVT is '说明';
comment on table RHN_SUP_DISP_ROUTE is '发药途径；一行代表一条发药途径记录';
comment on column RHN_SUP_DISP_ROUTE.ID_DISP_ROUTE is '发药途径主键';
comment on column RHN_SUP_DISP_ROUTE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_DISP_ROUTE.ID_TNT is '租户标识';
comment on column RHN_SUP_DISP_ROUTE.ID_ORG is '机构标识';
comment on column RHN_SUP_DISP_ROUTE.CD_DISP_ROUTE is '编码';
comment on column RHN_SUP_DISP_ROUTE.NA_DISP_ROUTE is '名称';
comment on column RHN_SUP_DISP_ROUTE.ID_DEPT_SRC is '来源科室标识';
comment on column RHN_SUP_DISP_ROUTE.SD_MED_TYPE is '药品类型';
comment on column RHN_SUP_DISP_ROUTE.ID_STOCK_SITE_TARGET is 'target库存库房标识';
comment on column RHN_SUP_DISP_ROUTE.FG_ACTIVE is '是否有效';
comment on column RHN_SUP_DISP_ROUTE.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SUP_DISP_ROUTE.DA_VALID_TO is '有效结束日期';
comment on column RHN_SUP_DISP_ROUTE.DES_DISP_ROUTE is '说明';
comment on column RHN_SUP_DISP_ROUTE.DT_CREATED is '创建时间';
comment on column RHN_SUP_DISP_ROUTE.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_DISP_ROUTE.DT_UPDATED is '更新时间';
comment on column RHN_SUP_DISP_ROUTE.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SUP_DISP_ROUTE.SD_CARE_SETTING is '照护setting';
comment on table RHN_SUP_DISP_TASK is '发药任务；一行代表一条发药任务记录';
comment on column RHN_SUP_DISP_TASK.ID_DISP_TASK is '发药任务主键';
comment on column RHN_SUP_DISP_TASK.REVISION is '乐观锁修订号';
comment on column RHN_SUP_DISP_TASK.ID_TNT is '租户标识';
comment on column RHN_SUP_DISP_TASK.ID_PAT is '患者标识';
comment on column RHN_SUP_DISP_TASK.ID_ENC is '就诊标识';
comment on column RHN_SUP_DISP_TASK.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_DISP_TASK.ID_PHARM_REVIEW_LATEST is 'latest审核标识';
comment on column RHN_SUP_DISP_TASK.CD_TASK_NO is '任务编号';
comment on column RHN_SUP_DISP_TASK.SD_TASK_TYPE is '任务类型';
comment on column RHN_SUP_DISP_TASK.SD_PRIORITY is '优先级';
comment on column RHN_SUP_DISP_TASK.SD_STATUS is '状态';
comment on column RHN_SUP_DISP_TASK.DT_CREATED is '创建时间';
comment on column RHN_SUP_DISP_TASK.DT_DUE is '到期时间';
comment on column RHN_SUP_DISP_TASK.DT_PICKED is '拣货时间';
comment on column RHN_SUP_DISP_TASK.ID_ASSIGNED_PRACT is 'assigned医务人员标识';
comment on column RHN_SUP_DISP_TASK.DES_DISP_TASK is '说明';
comment on column RHN_SUP_DISP_TASK.ID_PICKED_BY_USER is '拣货by用户标识';
comment on column RHN_SUP_DISP_TASK.ID_PICKED_ASSIGN is '拣货任职标识';
comment on column RHN_SUP_DISP_TASK.DES_PICK_DESCRIPTION is 'pick说明';
comment on table RHN_SUP_DISP_TASK_LINE is '发药任务明细；一行代表一条发药任务明细记录';
comment on column RHN_SUP_DISP_TASK_LINE.ID_DISP_TASK_LINE is '发药任务明细主键';
comment on column RHN_SUP_DISP_TASK_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_DISP_TASK_LINE.ID_DISP_TASK is '任务标识';
comment on column RHN_SUP_DISP_TASK_LINE.ID_CARE_REQ is '请求标识';
comment on column RHN_SUP_DISP_TASK_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_DISP_TASK_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_DISP_TASK_LINE.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_DISP_TASK_LINE.QTY_REQUESTED is '申请数量';
comment on column RHN_SUP_DISP_TASK_LINE.QTY_PLANNED is 'planned数量';
comment on column RHN_SUP_DISP_TASK_LINE.QTY_DISPENSED is 'dispensed数量';
comment on column RHN_SUP_DISP_TASK_LINE.QTY_RETURNED is 'returned数量';
comment on column RHN_SUP_DISP_TASK_LINE.CD_DISP_UNIT is '发药单位编码';
comment on column RHN_SUP_DISP_TASK_LINE.BASE_QUANTITY_FACTOR is '基础数量换算系数';
comment on column RHN_SUP_DISP_TASK_LINE.FG_SPLIT is '是否拆分';
comment on column RHN_SUP_DISP_TASK_LINE.FG_TRACE_REQUIRED is '是否追溯应需';
comment on column RHN_SUP_DISP_TASK_LINE.SD_STATUS is '状态';
comment on column RHN_SUP_DISP_TASK_LINE.CD_PRODUCT_SNAP is '产品编码快照';
comment on column RHN_SUP_DISP_TASK_LINE.NA_PRODUCT_SNAP is '产品名称快照';
comment on column RHN_SUP_DISP_TASK_LINE.PACKAGE_SPEC_SNAPSHOT is '包装规格快照';
comment on column RHN_SUP_DISP_TASK_LINE.JSON_ITEM_ATTR_SNAP is '项目属性快照';
comment on column RHN_SUP_DISP_TASK_LINE.HASH_ITEM_ATTR is '项目属性摘要';
comment on column RHN_SUP_DISP_TASK_LINE.DT_CREATED is '创建时间';
comment on column RHN_SUP_DISP_TASK_LINE.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_DISP_TASK_LINE.SD_FULFILL_SRC_TYPE is '履约来源类型';
comment on column RHN_SUP_DISP_TASK_LINE.ID_FULFILL_SRC is '履约来源标识';
comment on table RHN_SUP_GOOD_RCPT is '到货票据；一行代表一条到货票据记录';
comment on column RHN_SUP_GOOD_RCPT.ID_GOOD_RCPT is '到货票据主键';
comment on column RHN_SUP_GOOD_RCPT.REVISION is '乐观锁修订号';
comment on column RHN_SUP_GOOD_RCPT.ID_TNT is '租户标识';
comment on column RHN_SUP_GOOD_RCPT.ID_ORG is '机构标识';
comment on column RHN_SUP_GOOD_RCPT.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_GOOD_RCPT.ID_PURCH_ORDER is '采购医嘱标识';
comment on column RHN_SUP_GOOD_RCPT.ID_SUPPL is '供应商标识';
comment on column RHN_SUP_GOOD_RCPT.CD_RCPT_NO is '票据编号';
comment on column RHN_SUP_GOOD_RCPT.CD_REQ is '请求编码';
comment on column RHN_SUP_GOOD_RCPT.CD_DELIV_NOTE_NO is '配送备注编号';
comment on column RHN_SUP_GOOD_RCPT.SD_STATUS is '状态';
comment on column RHN_SUP_GOOD_RCPT.DT_RECEIVED is '接收时间';
comment on column RHN_SUP_GOOD_RCPT.ID_USER_RECEIVED is '接收人标识';
comment on column RHN_SUP_GOOD_RCPT.DT_INSPECTED is 'inspected时间';
comment on column RHN_SUP_GOOD_RCPT.ID_USER_INSPECTED is 'inspected人标识';
comment on column RHN_SUP_GOOD_RCPT.DT_POSTED is '记账时间';
comment on column RHN_SUP_GOOD_RCPT.ID_USER_POSTED is '记账人标识';
comment on column RHN_SUP_GOOD_RCPT.DES_GOOD_RCPT is '说明';
comment on column RHN_SUP_GOOD_RCPT.DT_CREATED is '创建时间';
comment on column RHN_SUP_GOOD_RCPT.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_GOOD_RCPT.DT_UPDATED is '更新时间';
comment on column RHN_SUP_GOOD_RCPT.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_GOOD_RCPT_LINE is '到货票据明细；一行代表一条到货票据明细记录';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_GOOD_RCPT_LINE is '到货票据明细主键';
comment on column RHN_SUP_GOOD_RCPT_LINE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_GOOD_RCPT is '到货票据标识';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_PURCH_ORDER_LINE is '采购医嘱明细标识';
comment on column RHN_SUP_GOOD_RCPT_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_STOCK_BIN_DESTINATION is '目标库位标识';
comment on column RHN_SUP_GOOD_RCPT_LINE.CD_LOT_NO is '批号编号';
comment on column RHN_SUP_GOOD_RCPT_LINE.DA_PRODUCTION is '生产日期';
comment on column RHN_SUP_GOOD_RCPT_LINE.DA_EXPIRY is '失效日期';
comment on column RHN_SUP_GOOD_RCPT_LINE.QTY_DELIVERED is 'delivered数量';
comment on column RHN_SUP_GOOD_RCPT_LINE.QTY_ACCEPTED is '接受数量';
comment on column RHN_SUP_GOOD_RCPT_LINE.QTY_REJECTED is 'rejected数量';
comment on column RHN_SUP_GOOD_RCPT_LINE.PRICE_UNIT_COST is '单位成本';
comment on column RHN_SUP_GOOD_RCPT_LINE.SD_QUALITY_STATUS is '质量状态';
comment on column RHN_SUP_GOOD_RCPT_LINE.DES_REJECTION_REASON is 'rejection原因';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_GOOD_RCPT_LINE.ID_INV_TXN is '库存流水标识';
comment on table RHN_SUP_INP_MED_CONSUME is '住院用药消耗；一行代表一条住院用药消耗记录';
comment on column RHN_SUP_INP_MED_CONSUME.ID_INP_MED_CONSUME is '住院用药消耗主键';
comment on column RHN_SUP_INP_MED_CONSUME.ID_TNT is '租户标识';
comment on column RHN_SUP_INP_MED_CONSUME.ID_CARE_REQ is '请求标识';
comment on column RHN_SUP_INP_MED_CONSUME.SD_CONSUMER_TYPE is 'consumer类型';
comment on column RHN_SUP_INP_MED_CONSUME.ID_INP_ORDER_TASK is '医嘱任务标识';
comment on column RHN_SUP_INP_MED_CONSUME.ID_DISP_TASK_LINE_DISP is '发药任务明细标识';
comment on column RHN_SUP_INP_MED_CONSUME.ID_MED_DISP is '发药标识';
comment on column RHN_SUP_INP_MED_CONSUME.ID_MED_DISP_LINE is '发药明细标识';
comment on column RHN_SUP_INP_MED_CONSUME.QTY_CONSUMED is '消耗数量';
comment on column RHN_SUP_INP_MED_CONSUME.CD_DISP_UNIT is '发药单位编码';
comment on column RHN_SUP_INP_MED_CONSUME.QTY_CONSUMED_BASE is '消耗基础数量';
comment on column RHN_SUP_INP_MED_CONSUME.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_INP_MED_CONSUME.CD_COMMAND is '命令编码';
comment on column RHN_SUP_INP_MED_CONSUME.DT_CONSUMED is '消耗时间';
comment on column RHN_SUP_INP_MED_CONSUME.ID_USER_CONSUMED is '消耗人标识';
comment on table RHN_SUP_INP_MED_SUPPLY_BATCH is '住院用药供应批次；一行代表一条住院用药供应批次记录';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_INP_MED_SUPPLY_BATCH is '住院用药供应批次主键';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_TNT is '租户标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_ORG is '机构标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_DEPT_NURS_UNIT is '护理单位科室标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.CD_BATCH_NO is '批次编号';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.SD_BATCH_TYPE is '批次类型';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.SD_SUPPLY_MODE is '供应模式';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DT_WINDOW_START is '窗口开始';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DT_WINDOW_END is '窗口结束';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DT_CUTOFF is 'cutoff时间';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.SD_STATUS is '状态';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.CD_GEN_COMMAND is '生成命令编码';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.HASH_GEN_PAYLOAD is '生成载荷摘要';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.CD_SUBMIT_COMMAND is 'submit命令编码';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.HASH_SUBMIT_PAYLOAD is 'submit载荷摘要';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.CD_CANCEL_COMMAND is '取消命令编码';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DT_CREATED is '创建时间';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DT_SUBMITTED is '提交时间';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_USER_SUBMITTED is '提交人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DT_CANCELLED is '取消时间';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_USER_CANCELLED is '取消人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DES_CANCEL_REASON is '取消原因';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.DT_CLOSED is '关闭时间';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_USER_CLOSED is '关闭人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.SD_GEN_TRIGGER is '生成触发';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.ID_DISP_ROUTE is '发药途径标识';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.SN_DISP_ROUTE_VER is '发药途径修订';
comment on column RHN_SUP_INP_MED_SUPPLY_BATCH.SD_MED_TYPE_SNAP is '药品类型快照';
comment on table RHN_SUP_INP_MED_SUPPLY_GEN_RUN is '住院用药供应生成运行；一行代表一条住院用药供应生成运行记录';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_INP_MED_SUPPLY_GEN_RUN is '住院用药供应生成运行主键';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_TNT is '租户标识';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_ORG is '机构标识';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_DEPT_NURS_UNIT is '护理单位科室标识';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_DISP_ROUTE is '发药途径标识';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.SN_DISP_ROUTE_VER is '发药途径修订';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DA_BUSINESS is '业务日期';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.CD_SHIFT is '班次编码';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_WINDOW_START is '窗口开始';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_WINDOW_END is '窗口结束';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.CD_JOB_KEY is '作业键';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.CD_COMMAND is '命令编码';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.SD_TRIGGER_TYPE is '触发类型';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.SD_STATUS is '状态';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.QTY_ATTEMPT is 'attempt盘点';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_NEXT_ATTEMPT is '下一attempt时间';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_USER_CLAIMED is '认领人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_CLAIMED_UNTIL is '认领until';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.ID_INP_MED_SUPPLY_BATCH is '批次标识';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DES_LAST_ERROR is 'last错误';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_CREATED is '创建时间';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_STARTED is '开始时间';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_COMPLETED is '完成时间';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.DT_UPDATED is '更新时间';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.SD_MED_TYPE_SNAP is '药品类型快照';
comment on column RHN_SUP_INP_MED_SUPPLY_GEN_RUN.CD_LAST_ERROR is 'last错误编码';
comment on table RHN_SUP_INP_MED_SUPPLY_LINE is '住院用药供应明细；一行代表一条住院用药供应明细记录';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_INP_MED_SUPPLY_LINE is '住院用药供应明细主键';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_INP_MED_SUPPLY_BATCH is '供应批次标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_CARE_REQ is '请求标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_ENC is '就诊标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_PAT is '患者标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.CD_BED_SNAP is '床位no快照';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.NA_PAT_SNAP is '患者名称快照';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.CD_MED_SNAP is '药品编码快照';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.NA_MED_SNAP is '药品名称快照';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.QTY_REQUESTED is '申请数量';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.CD_QUANTITY_UNIT is '数量单位编码';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.QTY_REQUESTED_BASE is '申请基础数量';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.QTY_OCCURRENCE is 'occurrence盘点';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.SD_STATUS is '状态';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_DISP_TASK_LINE is '发药任务明细标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.DT_CREATED is '创建时间';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.DT_SUBMITTED is '提交时间';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_USER_SUBMITTED is '提交人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.DT_TAKEN is 'taken时间';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_USER_TAKEN is 'taken人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.DT_CANCELLED is '取消时间';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.ID_USER_CANCELLED is '取消人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_LINE.DES_CANCEL_REASON is '取消原因';
comment on table RHN_SUP_INP_MED_SUPPLY_TASK is '住院用药供应任务；一行代表一条住院用药供应任务记录';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ID_INP_MED_SUPPLY_TASK is '住院用药供应任务主键';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ID_TNT is '租户标识';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ID_INP_MED_SUPPLY_LINE is '供应明细标识';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ID_CARE_REQ is '请求标识';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ID_INP_ORDER_TASK is '医嘱任务标识';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.DT_SCHEDULED is 'scheduled时间';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.QTY_REQUIRED is '应需数量';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.CD_QUANTITY_UNIT is '数量单位编码';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.QTY_REQUIRED_BASE is '应需基础数量';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.SD_STATUS is '状态';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ACTIVE_SLOT is '有效号源';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.DT_CREATED is '创建时间';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.DT_CANCELLED is '取消时间';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.ID_USER_CANCELLED is '取消人标识';
comment on column RHN_SUP_INP_MED_SUPPLY_TASK.DES_CANCEL_REASON is '取消原因';
comment on table RHN_SUP_INV_BAL is '库存余额；一行代表一条库存余额记录';
comment on column RHN_SUP_INV_BAL.ID_INV_BAL is '库存余额主键';
comment on column RHN_SUP_INV_BAL.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_BAL.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_BAL.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_BAL.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_BAL.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_BAL.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_BAL.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_INV_BAL.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_INV_BAL.QTY_ON_HAND is '数量onhand';
comment on column RHN_SUP_INV_BAL.QTY_RESERVED is '数量reserved';
comment on column RHN_SUP_INV_BAL.QTY_FROZEN is '数量frozen';
comment on column RHN_SUP_INV_BAL.QTY_AVAILABLE is '数量available';
comment on column RHN_SUP_INV_BAL.PRICE_AVERAGE_UNIT_COST is 'average单位成本';
comment on column RHN_SUP_INV_BAL.DT_PROJECTED is 'projected时间';
comment on table RHN_SUP_INV_DOC_EVT is '库存文书事件；一行代表一条库存文书事件记录';
comment on column RHN_SUP_INV_DOC_EVT.ID_INV_DOC_EVT is '库存文书事件主键';
comment on column RHN_SUP_INV_DOC_EVT.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_DOC_EVT.ID_ORG is '机构标识';
comment on column RHN_SUP_INV_DOC_EVT.SD_DOC_TYPE is '文书类型';
comment on column RHN_SUP_INV_DOC_EVT.ID_DOC is '文书标识';
comment on column RHN_SUP_INV_DOC_EVT.CD_DOC_NO is '文书编号';
comment on column RHN_SUP_INV_DOC_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SUP_INV_DOC_EVT.SD_FROM_STATUS is '原状态';
comment on column RHN_SUP_INV_DOC_EVT.SD_TO_STATUS is '目标状态';
comment on column RHN_SUP_INV_DOC_EVT.DES_REASON is '原因';
comment on column RHN_SUP_INV_DOC_EVT.ID_CORRELATION is '关联标识';
comment on column RHN_SUP_INV_DOC_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_INV_DOC_EVT.ID_USER_OCCURRED is '发生人标识';
comment on table RHN_SUP_INV_OPEN_PKG is '库存拆零包装；一行代表一条库存拆零包装记录';
comment on column RHN_SUP_INV_OPEN_PKG.ID_INV_OPEN_PKG is '库存拆零包装主键';
comment on column RHN_SUP_INV_OPEN_PKG.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_OPEN_PKG.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_OPEN_PKG.ID_ORG is '机构标识';
comment on column RHN_SUP_INV_OPEN_PKG.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_OPEN_PKG.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_OPEN_PKG.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_OPEN_PKG.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_OPEN_PKG.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_INV_OPEN_PKG.ID_INV_TRACE_CODE is '追溯编码标识';
comment on column RHN_SUP_INV_OPEN_PKG.CD_REQ is '请求编码';
comment on column RHN_SUP_INV_OPEN_PKG.CD_SRC_UNIT is '来源单位编码';
comment on column RHN_SUP_INV_OPEN_PKG.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_INV_OPEN_PKG.PACKAGE_FACTOR is '包装换算系数';
comment on column RHN_SUP_INV_OPEN_PKG.QTY_OPENED_BASE is 'opened基础数量';
comment on column RHN_SUP_INV_OPEN_PKG.QTY_REMAINING_BASE is 'remaining基础数量';
comment on column RHN_SUP_INV_OPEN_PKG.SD_STATUS is '状态';
comment on column RHN_SUP_INV_OPEN_PKG.DT_OPENED is 'opened时间';
comment on column RHN_SUP_INV_OPEN_PKG.ID_USER_OPENED is 'opened人标识';
comment on column RHN_SUP_INV_OPEN_PKG.DT_UPDATED is '更新时间';
comment on column RHN_SUP_INV_OPEN_PKG.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SUP_INV_OPEN_PKG.DT_CLOSED is '关闭时间';
comment on table RHN_SUP_INV_PERIOD is '库存期间；一行代表一条库存期间记录';
comment on column RHN_SUP_INV_PERIOD.ID_INV_PERIOD is '库存期间主键';
comment on column RHN_SUP_INV_PERIOD.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_PERIOD.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PERIOD.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_PERIOD.CD_PERIOD is '期间编码';
comment on column RHN_SUP_INV_PERIOD.DA_PERIOD_FROM is '期间开始日期';
comment on column RHN_SUP_INV_PERIOD.DA_PERIOD_TO is '期间结束日期';
comment on column RHN_SUP_INV_PERIOD.SD_STATUS is '状态';
comment on column RHN_SUP_INV_PERIOD.DT_CLOSED is '关闭时间';
comment on column RHN_SUP_INV_PERIOD.ID_USER_CLOSED is '关闭人标识';
comment on column RHN_SUP_INV_PERIOD.DES_INV_PERIOD is '说明';
comment on column RHN_SUP_INV_PERIOD.DT_CREATED is '创建时间';
comment on column RHN_SUP_INV_PERIOD.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_INV_PERIOD.ID_INV_PERIOD_PREVIOUS is '上一期间标识';
comment on column RHN_SUP_INV_PERIOD.ID_INV_PERIOD_CLOSE_RUN_CLOSE is '期末运行标识';
comment on table RHN_SUP_INV_PERIOD_BAL_SNAP is '库存期间余额快照；一行代表一条库存期间余额快照记录';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_INV_PERIOD_BAL_SNAP is '库存期间余额快照主键';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_INV_PERIOD_CLOSE_RUN is '日结运行标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_INV_PERIOD is '库存期间标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_INV_PERIOD_BAL_SNAP_OPENING is '期初来源快照标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_INV_BAL is '库存余额标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.SN_INV_BAL_VER is '库存余额修订';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.QTY_OPENING is '期初数量';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.QTY_MOVEMENT is 'movement数量';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.QTY_CLOSE is '期末数量';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.QTY_BAL is '余额数量';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.QTY_DIFFERENCE is '数量差额';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.SD_SNAP_STATUS is '快照状态';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.DT_CREATED is '创建时间';
comment on column RHN_SUP_INV_PERIOD_BAL_SNAP.ID_USER_CREATED is '创建人标识';
comment on table RHN_SUP_INV_PERIOD_BAL_VAL is '库存期间余额值；一行代表一条库存期间余额值记录';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.ID_INV_PERIOD_BAL_VAL is '库存期间余额值主键';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.ID_INV_PERIOD_BAL_SNAP is '期间余额快照标识';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.SD_VALUAT_BASIS is '计价依据';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.CD_CURRENCY is '币种编码';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.PRICE_OPENING is '期初单位值';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.PRICE_CLOSE is '期末单位值';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.AMT_OPENING is '期初值';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.AMT_MOVEMENT is 'movement金额';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.AMT_VALUAT_ADJ is '计价调价金额';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.AMT_ROUNDING_ADJ is '舍入调价金额';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.AMT_CLOSE is '期末值';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.AMT_BAL is '余额值';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.AMT_VAL_DIFFERENCE is '值差额';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.SD_VAL_STATUS is '值状态';
comment on column RHN_SUP_INV_PERIOD_BAL_VAL.DT_CREATED is '创建时间';
comment on table RHN_SUP_INV_PERIOD_CLOSE_RUN is '库存期间日结运行；一行代表一条库存期间日结运行记录';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_INV_PERIOD_CLOSE_RUN is '库存期间日结运行主键';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_ORG is '机构标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_INV_PERIOD is '库存期间标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_INV_PERIOD_PREVIOUS is '上一期间标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_INV_RECON_RUN is '核对运行标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.CD_RUN_NO is '运行编号';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.CD_REQ is '请求编码';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.HASH_REQ is '请求摘要';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.SD_STATUS is '状态';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.QTY_DIMENSION is '维度盘点';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.QTY_DIFFERENCE is '差额盘点';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.DT_STARTED is '开始时间';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_USER_STARTED is '开始人标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.DT_VALIDATED is 'validated时间';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_USER_VALIDATED is 'validated人标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.DT_POSTED is '记账时间';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.ID_USER_POSTED is '记账人标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.DT_COMPLETED is '完成时间';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.CD_FAILURE is 'failure编码';
comment on column RHN_SUP_INV_PERIOD_CLOSE_RUN.DES_FAILURE_MSG is 'failure消息';
comment on table RHN_SUP_INV_PERIOD_CLOSE_TOTAL is '库存期间日结总计；一行代表一条库存期间日结总计记录';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.ID_INV_PERIOD_CLOSE_TOTAL is '库存期间日结总计主键';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.ID_INV_PERIOD_CLOSE_RUN is '日结运行标识';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.SD_VALUAT_BASIS is '计价依据';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.CD_CURRENCY is '币种编码';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.AMT_OPENING is '期初值';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.AMT_MOVEMENT is 'movement金额';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.AMT_VALUAT_ADJ is '计价调价金额';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.AMT_ROUNDING_ADJ is '舍入调价金额';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.AMT_CLOSE is '期末值';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.AMT_BAL is '余额值';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.AMT_VAL_DIFFERENCE is '值差额';
comment on column RHN_SUP_INV_PERIOD_CLOSE_TOTAL.DT_CREATED is '创建时间';
comment on table RHN_SUP_INV_PRICE_ADJ is '库存价格调价；一行代表一条库存价格调价记录';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_INV_PRICE_ADJ is '库存价格调价主键';
comment on column RHN_SUP_INV_PRICE_ADJ.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_ORG is '机构标识';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_INV_PERIOD is '库存期间标识';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_CATALOG_CHG_BATCH is '目录变更批次标识';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_INV_PRICE_ADJ_REVERSAL_OF is 'reversal时点标识';
comment on column RHN_SUP_INV_PRICE_ADJ.CD_ADJ_NO is '调价编号';
comment on column RHN_SUP_INV_PRICE_ADJ.CD_REQ is '请求编码';
comment on column RHN_SUP_INV_PRICE_ADJ.HASH_REQ is '请求摘要';
comment on column RHN_SUP_INV_PRICE_ADJ.SD_ADJ_TYPE is '调价类型';
comment on column RHN_SUP_INV_PRICE_ADJ.SD_PRICE_TYPE is '价格类型';
comment on column RHN_SUP_INV_PRICE_ADJ.DA_BUSINESS is '业务日期';
comment on column RHN_SUP_INV_PRICE_ADJ.CD_CURRENCY is '币种编码';
comment on column RHN_SUP_INV_PRICE_ADJ.CD_PRICE_DOC is '价格文书编码';
comment on column RHN_SUP_INV_PRICE_ADJ.DES_REASON is '原因';
comment on column RHN_SUP_INV_PRICE_ADJ.SD_STATUS is '状态';
comment on column RHN_SUP_INV_PRICE_ADJ.QTY_LINE is '明细盘点';
comment on column RHN_SUP_INV_PRICE_ADJ.AMT_TOTAL_VAL_BEFORE is '总计值前';
comment on column RHN_SUP_INV_PRICE_ADJ.AMT_TOTAL_VAL_AFTER is '总计值后';
comment on column RHN_SUP_INV_PRICE_ADJ.AMT_TOTAL_ADJ is '总计调价金额';
comment on column RHN_SUP_INV_PRICE_ADJ.DT_CREATED is '创建时间';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_INV_PRICE_ADJ.DT_UPDATED is '更新时间';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SUP_INV_PRICE_ADJ.DT_SUBMITTED is '提交时间';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_USER_SUBMITTED is '提交人标识';
comment on column RHN_SUP_INV_PRICE_ADJ.DT_APPROVED is '审批时间';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_USER_APPROVED is '审批人标识';
comment on column RHN_SUP_INV_PRICE_ADJ.DT_POSTED is '记账时间';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_USER_POSTED is '记账人标识';
comment on column RHN_SUP_INV_PRICE_ADJ.DT_REVERSED is 'reversed时间';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_USER_REVERSED is 'reversed人标识';
comment on column RHN_SUP_INV_PRICE_ADJ.DT_CANCELLED is '取消时间';
comment on column RHN_SUP_INV_PRICE_ADJ.ID_USER_CANCELLED is '取消人标识';
comment on table RHN_SUP_INV_PRICE_ADJ_DETAIL is '库存价格调价明细；一行代表一条库存价格调价明细记录';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.ID_INV_PRICE_ADJ_DETAIL is '库存价格调价明细主键';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.ID_INV_PRICE_ADJ_LINE is '调价明细标识';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.ID_INV_BAL is '库存余额标识';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.SN_INV_BAL_VER is '库存余额修订';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.QTY_SNAP is '数量快照';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.PRICE_UNIT_PRICE_BEFORE is '单位价格前';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.PRICE_UNIT_PRICE_AFTER is '单位价格后';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.AMT_VAL_BEFORE is '值前';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.AMT_VAL_AFTER is '值后';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.AMT_ADJ is '调价金额';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.AMT_ROUNDING is '舍入金额';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.ID_INV_VALUAT_ENTRY is '计价分录标识';
comment on column RHN_SUP_INV_PRICE_ADJ_DETAIL.DT_CREATED is '创建时间';
comment on table RHN_SUP_INV_PRICE_ADJ_LINE is '库存价格调价明细；一行代表一条库存价格调价明细记录';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_INV_PRICE_ADJ_LINE is '库存价格调价明细主键';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_INV_PRICE_ADJ is '调价标识';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.SN_LINE is '明细编号';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_CATALOG_PRICE_OLD is 'old目录价格标识';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.SN_OLD_CATALOG_PRICE_VER is 'old目录价格修订';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.ID_CATALOG_PRICE_NEW is 'new目录价格标识';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.SN_NEW_CATALOG_PRICE_VER is 'new目录价格修订';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.PRICE_OLD_SALE is 'oldsale单价';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.PRICE_NEW_SALE is 'newsale单价';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.PRICE_OLD_UNIT_COST is 'old单位成本';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.PRICE_NEW_UNIT_COST is 'new单位成本';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.QTY_SNAP is '数量快照';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.AMT_VAL_BEFORE is '值前';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.AMT_VAL_AFTER is '值后';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.AMT_ADJ is '调价金额';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.AMT_ROUNDING is '舍入金额';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.SD_LINE_STATUS is '明细状态';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.CD_ERROR is '错误编码';
comment on column RHN_SUP_INV_PRICE_ADJ_LINE.DES_ERROR_MSG is '错误消息';
comment on table RHN_SUP_INV_RECON_LINE is '库存核对明细；一行代表一条库存核对明细记录';
comment on column RHN_SUP_INV_RECON_LINE.ID_INV_RECON_LINE is '库存核对明细主键';
comment on column RHN_SUP_INV_RECON_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_RECON_LINE.ID_INV_RECON_RUN is '核对运行标识';
comment on column RHN_SUP_INV_RECON_LINE.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_RECON_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_RECON_LINE.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_RECON_LINE.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_INV_RECON_LINE.SD_ISSUE_TYPE is '问题类型';
comment on column RHN_SUP_INV_RECON_LINE.QTY_EXPECTED is '预期数量';
comment on column RHN_SUP_INV_RECON_LINE.QTY_ACTUAL is '实际数量';
comment on column RHN_SUP_INV_RECON_LINE.QTY_DIFFERENCE is '差额数量';
comment on column RHN_SUP_INV_RECON_LINE.SD_SEVERITY is '严重程度';
comment on column RHN_SUP_INV_RECON_LINE.DES_INV_RECON_LINE is '说明';
comment on column RHN_SUP_INV_RECON_LINE.SD_VALUAT_BASIS is '计价依据';
comment on column RHN_SUP_INV_RECON_LINE.CD_CURRENCY is '币种编码';
comment on column RHN_SUP_INV_RECON_LINE.AMT_EXPECTED is '预期金额';
comment on column RHN_SUP_INV_RECON_LINE.AMT_ACTUAL is '实际金额';
comment on column RHN_SUP_INV_RECON_LINE.AMT_DIFFERENCE is '差额金额';
comment on table RHN_SUP_INV_RECON_RUN is '库存核对运行；一行代表一条库存核对运行记录';
comment on column RHN_SUP_INV_RECON_RUN.ID_INV_RECON_RUN is '库存核对运行主键';
comment on column RHN_SUP_INV_RECON_RUN.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_RECON_RUN.ID_ORG is '机构标识';
comment on column RHN_SUP_INV_RECON_RUN.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_RECON_RUN.CD_RUN_NO is '运行编号';
comment on column RHN_SUP_INV_RECON_RUN.SD_RUN_TYPE is '运行类型';
comment on column RHN_SUP_INV_RECON_RUN.SD_STATUS is '状态';
comment on column RHN_SUP_INV_RECON_RUN.DA_BUSINESS is '业务日期';
comment on column RHN_SUP_INV_RECON_RUN.DT_STARTED is '开始时间';
comment on column RHN_SUP_INV_RECON_RUN.DT_COMPLETED is '完成时间';
comment on column RHN_SUP_INV_RECON_RUN.ID_USER_RUN is '运行人标识';
comment on column RHN_SUP_INV_RECON_RUN.QTY_DIMENSION is '维度盘点';
comment on column RHN_SUP_INV_RECON_RUN.QTY_ISSUE is '问题盘点';
comment on table RHN_SUP_INV_RESV is '库存预留；一行代表一条库存预留记录';
comment on column RHN_SUP_INV_RESV.ID_INV_RESV is '库存预留主键';
comment on column RHN_SUP_INV_RESV.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_RESV.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_RESV.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_RESV.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_RESV.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_RESV.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_RESV.ID_CARE_REQ is '请求标识';
comment on column RHN_SUP_INV_RESV.CD_RESV_GRP is '预留分组编码';
comment on column RHN_SUP_INV_RESV.SD_RESV_TYPE is '预留类型';
comment on column RHN_SUP_INV_RESV.SD_STATUS is '状态';
comment on column RHN_SUP_INV_RESV.QTY_RESERVED is '数量reserved';
comment on column RHN_SUP_INV_RESV.QTY_CONSUMED is '数量消耗';
comment on column RHN_SUP_INV_RESV.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_INV_RESV.DT_CREATED is '创建时间';
comment on column RHN_SUP_INV_RESV.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_INV_RESV.DT_EXPIRES is '到期时间';
comment on column RHN_SUP_INV_RESV.DT_CONSUMED is '消耗时间';
comment on column RHN_SUP_INV_RESV.ID_USER_CONSUMED is '消耗人标识';
comment on column RHN_SUP_INV_RESV.DT_RELEASED is 'released时间';
comment on column RHN_SUP_INV_RESV.ID_USER_RELEASED is 'released人标识';
comment on column RHN_SUP_INV_RESV.DES_RELEASE_REASON is 'release原因';
comment on column RHN_SUP_INV_RESV.ID_DISP_TASK_LINE is '发药任务明细标识';
comment on table RHN_SUP_INV_SPLIT_EVT is '库存拆分事件；一行代表一条库存拆分事件记录';
comment on column RHN_SUP_INV_SPLIT_EVT.ID_INV_SPLIT_EVT is '库存拆分事件主键';
comment on column RHN_SUP_INV_SPLIT_EVT.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_SPLIT_EVT.ID_INV_OPEN_PKG is '拆零包装标识';
comment on column RHN_SUP_INV_SPLIT_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SUP_INV_SPLIT_EVT.SD_SRC_TYPE is '来源类型';
comment on column RHN_SUP_INV_SPLIT_EVT.ID_SRC is '来源标识';
comment on column RHN_SUP_INV_SPLIT_EVT.CD_SRC_NO is '来源编号';
comment on column RHN_SUP_INV_SPLIT_EVT.QTY_DELTA is '数量变动量';
comment on column RHN_SUP_INV_SPLIT_EVT.BALANCE_AFTER is '余额后';
comment on column RHN_SUP_INV_SPLIT_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_INV_SPLIT_EVT.ID_USER_OCCURRED is '发生人标识';
comment on column RHN_SUP_INV_SPLIT_EVT.DES_INV_SPLIT_EVT is '说明';
comment on table RHN_SUP_INV_TRACE_CODE is '库存追溯编码；一行代表一条库存追溯编码记录';
comment on column RHN_SUP_INV_TRACE_CODE.ID_INV_TRACE_CODE is '库存追溯编码主键';
comment on column RHN_SUP_INV_TRACE_CODE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_INV_TRACE_CODE.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_TRACE_CODE.ID_ORG is '机构标识';
comment on column RHN_SUP_INV_TRACE_CODE.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_TRACE_CODE.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_TRACE_CODE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_TRACE_CODE.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_TRACE_CODE.ID_GOOD_RCPT_LINE is '到货票据明细标识';
comment on column RHN_SUP_INV_TRACE_CODE.CD_TRACE is '追溯编码';
comment on column RHN_SUP_INV_TRACE_CODE.CD_NORMALIZED is '标准化编码';
comment on column RHN_SUP_INV_TRACE_CODE.CD_PRODUCT_SNAP is '产品编码快照';
comment on column RHN_SUP_INV_TRACE_CODE.NA_PRODUCT_SNAP is '产品名称快照';
comment on column RHN_SUP_INV_TRACE_CODE.CD_LOT_SNAP is '批号no快照';
comment on column RHN_SUP_INV_TRACE_CODE.QTY_PKG is '包装数量';
comment on column RHN_SUP_INV_TRACE_CODE.QTY_BASE is '基础数量';
comment on column RHN_SUP_INV_TRACE_CODE.SD_STATUS is '状态';
comment on column RHN_SUP_INV_TRACE_CODE.SD_CURRENT_DOC_TYPE is 'current文书类型';
comment on column RHN_SUP_INV_TRACE_CODE.ID_CURRENT_DOC is 'current文书标识';
comment on column RHN_SUP_INV_TRACE_CODE.CD_CURRENT_DOC_NO is 'current文书编号';
comment on column RHN_SUP_INV_TRACE_CODE.DT_RECEIVED is '接收时间';
comment on column RHN_SUP_INV_TRACE_CODE.DT_ISSUED is '签发时间';
comment on column RHN_SUP_INV_TRACE_CODE.DT_CREATED is '创建时间';
comment on column RHN_SUP_INV_TRACE_CODE.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_INV_TRACE_CODE.DT_UPDATED is '更新时间';
comment on column RHN_SUP_INV_TRACE_CODE.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SUP_INV_TRACE_CODE.QTY_REMAINING_BASE is 'remaining基础数量';
comment on table RHN_SUP_INV_TRACE_EVT is '库存追溯事件；一行代表一条库存追溯事件记录';
comment on column RHN_SUP_INV_TRACE_EVT.ID_INV_TRACE_EVT is '库存追溯事件主键';
comment on column RHN_SUP_INV_TRACE_EVT.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_TRACE_EVT.ID_ORG is '机构标识';
comment on column RHN_SUP_INV_TRACE_EVT.ID_INV_TRACE_CODE is '追溯编码标识';
comment on column RHN_SUP_INV_TRACE_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SUP_INV_TRACE_EVT.SD_FROM_STATUS is '原状态';
comment on column RHN_SUP_INV_TRACE_EVT.SD_TO_STATUS is '目标状态';
comment on column RHN_SUP_INV_TRACE_EVT.ID_STOCK_SITE_FROM is '原库房标识';
comment on column RHN_SUP_INV_TRACE_EVT.ID_STOCK_SITE_TO is '目标库房标识';
comment on column RHN_SUP_INV_TRACE_EVT.ID_STOCK_BIN_FROM is '原库位标识';
comment on column RHN_SUP_INV_TRACE_EVT.ID_STOCK_BIN_TO is '目标库位标识';
comment on column RHN_SUP_INV_TRACE_EVT.SD_DOC_TYPE is '文书类型';
comment on column RHN_SUP_INV_TRACE_EVT.ID_DOC is '文书标识';
comment on column RHN_SUP_INV_TRACE_EVT.CD_DOC_NO is '文书编号';
comment on column RHN_SUP_INV_TRACE_EVT.DES_REASON is '原因';
comment on column RHN_SUP_INV_TRACE_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_INV_TRACE_EVT.ID_USER_OCCURRED is '发生人标识';
comment on column RHN_SUP_INV_TRACE_EVT.QTY_DELTA is '数量变动量';
comment on column RHN_SUP_INV_TRACE_EVT.BALANCE_AFTER is '余额后';
comment on table RHN_SUP_INV_TXN is '库存流水；一行代表一条库存流水记录';
comment on column RHN_SUP_INV_TXN.ID_INV_TXN is '库存流水主键';
comment on column RHN_SUP_INV_TXN.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_TXN.ID_INV_PERIOD is '库存期间标识';
comment on column RHN_SUP_INV_TXN.ID_INV_TXN_REVERSES is '冲正流水标识';
comment on column RHN_SUP_INV_TXN.CD_TXN_NO is '流水编号';
comment on column RHN_SUP_INV_TXN.CD_REQ is '请求编码';
comment on column RHN_SUP_INV_TXN.SD_TXN_TYPE is '流水类型';
comment on column RHN_SUP_INV_TXN.SD_SRC_TYPE is '来源类型';
comment on column RHN_SUP_INV_TXN.CD_SRC is '来源编码';
comment on column RHN_SUP_INV_TXN.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_INV_TXN.DT_POSTED is '记账时间';
comment on column RHN_SUP_INV_TXN.ID_USER_POSTED is '记账人标识';
comment on column RHN_SUP_INV_TXN.DES_INV_TXN is '说明';
comment on table RHN_SUP_INV_TXN_LINE is '库存流水明细；一行代表一条库存流水明细记录';
comment on column RHN_SUP_INV_TXN_LINE.ID_INV_TXN_LINE is '库存流水明细主键';
comment on column RHN_SUP_INV_TXN_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_TXN_LINE.ID_INV_TXN is '库存流水标识';
comment on column RHN_SUP_INV_TXN_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_INV_TXN_LINE.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_TXN_LINE.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_TXN_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_TXN_LINE.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_TXN_LINE.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_INV_TXN_LINE.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_INV_TXN_LINE.QTY_OPERATION is '业务操作数量';
comment on column RHN_SUP_INV_TXN_LINE.CD_OPERATION_UNIT is '业务操作单位编码';
comment on column RHN_SUP_INV_TXN_LINE.BASE_QUANTITY_FACTOR is '基础数量换算系数';
comment on column RHN_SUP_INV_TXN_LINE.QTY_DELTA is '数量变动量';
comment on column RHN_SUP_INV_TXN_LINE.PRICE_UNIT_COST is '单位成本';
comment on column RHN_SUP_INV_TXN_LINE.AMT_DELTA is '金额变动量';
comment on table RHN_SUP_INV_VALUAT_ENTRY is '库存计价分录；一行代表一条库存计价分录记录';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_INV_VALUAT_ENTRY is '库存计价分录主键';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_TNT is '租户标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_INV_PERIOD is '库存期间标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_INV_BAL is '库存余额标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_INV_VALUAT_ENTRY.SD_VALUAT_BASIS is '计价依据';
comment on column RHN_SUP_INV_VALUAT_ENTRY.SD_ENTRY_TYPE is '分录类型';
comment on column RHN_SUP_INV_VALUAT_ENTRY.SD_SRC_TYPE is '来源类型';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_SRC is '来源标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.CD_SRC_NO is '来源编号';
comment on column RHN_SUP_INV_VALUAT_ENTRY.CD_REQ is '请求编码';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_INV_VALUAT_ENTRY_REVERSES is '冲正分录标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.QTY_SNAP is '数量快照';
comment on column RHN_SUP_INV_VALUAT_ENTRY.PRICE_UNIT_PRICE_BEFORE is '单位价格前';
comment on column RHN_SUP_INV_VALUAT_ENTRY.PRICE_UNIT_PRICE_AFTER is '单位价格后';
comment on column RHN_SUP_INV_VALUAT_ENTRY.AMT_VAL_BEFORE is '值前';
comment on column RHN_SUP_INV_VALUAT_ENTRY.AMT_VAL_AFTER is '值后';
comment on column RHN_SUP_INV_VALUAT_ENTRY.AMT_DELTA is '金额变动量';
comment on column RHN_SUP_INV_VALUAT_ENTRY.CD_CURRENCY is '币种编码';
comment on column RHN_SUP_INV_VALUAT_ENTRY.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_INV_VALUAT_ENTRY.DT_POSTED is '记账时间';
comment on column RHN_SUP_INV_VALUAT_ENTRY.ID_USER_POSTED is '记账人标识';
comment on column RHN_SUP_INV_VALUAT_ENTRY.DES_INV_VALUAT_ENTRY is '说明';
comment on table RHN_SUP_MED_DISP is '药品发药；一行代表一条药品发药记录';
comment on column RHN_SUP_MED_DISP.ID_MED_DISP is '药品发药主键';
comment on column RHN_SUP_MED_DISP.ID_TNT is '租户标识';
comment on column RHN_SUP_MED_DISP.ID_DISP_TASK is '任务标识';
comment on column RHN_SUP_MED_DISP.ID_PAT is '患者标识';
comment on column RHN_SUP_MED_DISP.ID_ENC is '就诊标识';
comment on column RHN_SUP_MED_DISP.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_MED_DISP.ID_MED_DISP_ORIGINAL is '原发药标识';
comment on column RHN_SUP_MED_DISP.CD_DISP_NO is '发药编号';
comment on column RHN_SUP_MED_DISP.SD_DISP_TYPE is '发药类型';
comment on column RHN_SUP_MED_DISP.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_MED_DISP.ID_DISPENSER_PRACT is 'dispenser医务人员标识';
comment on column RHN_SUP_MED_DISP.ID_DISPENSER_USER is 'dispenser用户标识';
comment on column RHN_SUP_MED_DISP.ID_DISPENSER_ASSIGN is 'dispenser任职标识';
comment on column RHN_SUP_MED_DISP.ID_CHECKER_PRACT is 'checker医务人员标识';
comment on column RHN_SUP_MED_DISP.ID_CHECKER_USER is 'checker用户标识';
comment on column RHN_SUP_MED_DISP.ID_CHECKER_ASSIGN is 'checker任职标识';
comment on column RHN_SUP_MED_DISP.DT_CHECKED is 'checked时间';
comment on column RHN_SUP_MED_DISP.QTY_OPERATION is '业务操作数量';
comment on column RHN_SUP_MED_DISP.CD_OPERATION_UNIT is '业务操作单位编码';
comment on column RHN_SUP_MED_DISP.DES_MED_DISP is '说明';
comment on table RHN_SUP_MED_DISP_LINE is '药品发药明细；一行代表一条药品发药明细记录';
comment on column RHN_SUP_MED_DISP_LINE.ID_MED_DISP_LINE is '药品发药明细主键';
comment on column RHN_SUP_MED_DISP_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_MED_DISP_LINE.ID_MED_DISP is '药品发药标识';
comment on column RHN_SUP_MED_DISP_LINE.ID_DISP_TASK_LINE is '任务明细标识';
comment on column RHN_SUP_MED_DISP_LINE.ID_MED_DISP_LINE_ORIGINAL is '原发药明细标识';
comment on column RHN_SUP_MED_DISP_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_MED_DISP_LINE.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_MED_DISP_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_MED_DISP_LINE.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_MED_DISP_LINE.ID_INV_TXN_LINE is '库存流水明细标识';
comment on column RHN_SUP_MED_DISP_LINE.QTY_DISPENSED is '数量dispensed';
comment on column RHN_SUP_MED_DISP_LINE.CD_DISP_UNIT is '发药单位编码';
comment on column RHN_SUP_MED_DISP_LINE.BASE_QUANTITY_FACTOR is '基础数量换算系数';
comment on table RHN_SUP_PHARM_FULFILL_AUTH is '药房履约授权；一行代表一条药房履约授权记录';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_PHARM_FULFILL_AUTH is '药房履约授权主键';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.REVISION is '乐观锁修订号';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_TNT is '租户标识';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_ORG is '机构标识';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_DEPT is '科室标识';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_CARE_REQ_MED is '药品请求标识';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_STL is '结算标识';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.SD_STATUS is '状态';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.DT_READY is 'ready时间';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.DT_INTAKE_STARTED is 'intake开始时间';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.DT_REVOKED is 'revoked时间';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.DT_UPDATED is '更新时间';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_DISP_ROUTE is '发药途径标识';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.SN_DISP_ROUTE_VER is '发药途径修订';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.ID_STOCK_SITE_ROUTED is 'routed库存库房标识';
comment on column RHN_SUP_PHARM_FULFILL_AUTH.DT_ROUTED is 'routed时间';
comment on table RHN_SUP_PHARM_REVIEW is '药房审核；一行代表一条药房审核记录';
comment on column RHN_SUP_PHARM_REVIEW.ID_PHARM_REVIEW is '药房审核主键';
comment on column RHN_SUP_PHARM_REVIEW.ID_TNT is '租户标识';
comment on column RHN_SUP_PHARM_REVIEW.ID_CARE_REQ is '请求标识';
comment on column RHN_SUP_PHARM_REVIEW.ID_DISP_TASK is '任务标识';
comment on column RHN_SUP_PHARM_REVIEW.CD_REVIEW_NO is '审核编号';
comment on column RHN_SUP_PHARM_REVIEW.SD_RESULT is '结果';
comment on column RHN_SUP_PHARM_REVIEW.CD_REASON is '原因编码';
comment on column RHN_SUP_PHARM_REVIEW.DES_PHARM_REVIEW is '说明';
comment on column RHN_SUP_PHARM_REVIEW.ID_PHARMACIST_PRACT is 'pharmacist医务人员标识';
comment on column RHN_SUP_PHARM_REVIEW.ID_REVIEWER_USER is 'reviewer用户标识';
comment on column RHN_SUP_PHARM_REVIEW.ID_REVIEWER_ASSIGN is 'reviewer任职标识';
comment on column RHN_SUP_PHARM_REVIEW.DT_REVIEWED is 'reviewed时间';
comment on table RHN_SUP_PURCH_ORDER is '采购医嘱；一行代表一条采购医嘱记录';
comment on column RHN_SUP_PURCH_ORDER.ID_PURCH_ORDER is '采购医嘱主键';
comment on column RHN_SUP_PURCH_ORDER.REVISION is '乐观锁修订号';
comment on column RHN_SUP_PURCH_ORDER.ID_TNT is '租户标识';
comment on column RHN_SUP_PURCH_ORDER.ID_ORG is '机构标识';
comment on column RHN_SUP_PURCH_ORDER.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_PURCH_ORDER.ID_SUPPL is '供应商标识';
comment on column RHN_SUP_PURCH_ORDER.CD_ORDER_NO is '医嘱编号';
comment on column RHN_SUP_PURCH_ORDER.CD_REQ is '请求编码';
comment on column RHN_SUP_PURCH_ORDER.SD_STATUS is '状态';
comment on column RHN_SUP_PURCH_ORDER.DA_ORDER is '医嘱日期';
comment on column RHN_SUP_PURCH_ORDER.DA_EXPECTED is '预期日期';
comment on column RHN_SUP_PURCH_ORDER.DT_SUBMITTED is '提交时间';
comment on column RHN_SUP_PURCH_ORDER.ID_USER_SUBMITTED is '提交人标识';
comment on column RHN_SUP_PURCH_ORDER.DT_APPROVED is '审批时间';
comment on column RHN_SUP_PURCH_ORDER.ID_USER_APPROVED is '审批人标识';
comment on column RHN_SUP_PURCH_ORDER.DES_APPROVAL_REASON is '审批原因';
comment on column RHN_SUP_PURCH_ORDER.DES_PURCH_ORDER is '说明';
comment on column RHN_SUP_PURCH_ORDER.DT_CREATED is '创建时间';
comment on column RHN_SUP_PURCH_ORDER.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_PURCH_ORDER.DT_UPDATED is '更新时间';
comment on column RHN_SUP_PURCH_ORDER.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_PURCH_ORDER_LINE is '采购医嘱明细；一行代表一条采购医嘱明细记录';
comment on column RHN_SUP_PURCH_ORDER_LINE.ID_PURCH_ORDER_LINE is '采购医嘱明细主键';
comment on column RHN_SUP_PURCH_ORDER_LINE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_PURCH_ORDER_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_PURCH_ORDER_LINE.ID_PURCH_ORDER is '采购医嘱标识';
comment on column RHN_SUP_PURCH_ORDER_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_PURCH_ORDER_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_PURCH_ORDER_LINE.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_PURCH_ORDER_LINE.QTY_ORDERED is 'ordered数量';
comment on column RHN_SUP_PURCH_ORDER_LINE.QTY_RECEIVED is '接收数量';
comment on column RHN_SUP_PURCH_ORDER_LINE.PRICE_UNIT is '单位单价';
comment on column RHN_SUP_PURCH_ORDER_LINE.TAX_RATE is '税率rate';
comment on column RHN_SUP_PURCH_ORDER_LINE.SD_LINE_STATUS is '明细状态';
comment on column RHN_SUP_PURCH_ORDER_LINE.DES_PURCH_ORDER_LINE is '说明';
comment on table RHN_SUP_STOCK_BIN is '库存库位；一行代表一条库存库位记录';
comment on column RHN_SUP_STOCK_BIN.ID_STOCK_BIN is '库存库位主键';
comment on column RHN_SUP_STOCK_BIN.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_BIN.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_BIN.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_STOCK_BIN.ID_STOCK_BIN_PARENT is '上级库位标识';
comment on column RHN_SUP_STOCK_BIN.CD_STOCK_BIN is '编码';
comment on column RHN_SUP_STOCK_BIN.NA_STOCK_BIN is '名称';
comment on column RHN_SUP_STOCK_BIN.SD_BIN_TYPE is '库位类型';
comment on column RHN_SUP_STOCK_BIN.SD_STOCK_DEFAULT is '库存默认';
comment on column RHN_SUP_STOCK_BIN.FG_RECEIVE is '是否receive允许';
comment on column RHN_SUP_STOCK_BIN.FG_PICK is '是否pick允许';
comment on column RHN_SUP_STOCK_BIN.FG_COUNT is '是否盘点允许';
comment on column RHN_SUP_STOCK_BIN.SN_SORT is '排序医嘱';
comment on column RHN_SUP_STOCK_BIN.FG_ACTIVE is '是否有效';
comment on column RHN_SUP_STOCK_BIN.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_BIN.ID_USER_CREATED is '创建人标识';
comment on table RHN_SUP_STOCK_COUNT is '库存盘点；一行代表一条库存盘点记录';
comment on column RHN_SUP_STOCK_COUNT.ID_STOCK_COUNT is '库存盘点主键';
comment on column RHN_SUP_STOCK_COUNT.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_COUNT.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_COUNT.ID_ORG is '机构标识';
comment on column RHN_SUP_STOCK_COUNT.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_STOCK_COUNT.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_STOCK_COUNT.CD_COUNT_NO is '盘点编号';
comment on column RHN_SUP_STOCK_COUNT.CD_REQ is '请求编码';
comment on column RHN_SUP_STOCK_COUNT.SD_COUNT_TYPE is '盘点类型';
comment on column RHN_SUP_STOCK_COUNT.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_COUNT.DT_SNAP is '快照时间';
comment on column RHN_SUP_STOCK_COUNT.DT_STARTED is '开始时间';
comment on column RHN_SUP_STOCK_COUNT.ID_USER_STARTED is '开始人标识';
comment on column RHN_SUP_STOCK_COUNT.DT_SUBMITTED is '提交时间';
comment on column RHN_SUP_STOCK_COUNT.ID_USER_SUBMITTED is '提交人标识';
comment on column RHN_SUP_STOCK_COUNT.DT_APPROVED is '审批时间';
comment on column RHN_SUP_STOCK_COUNT.ID_USER_APPROVED is '审批人标识';
comment on column RHN_SUP_STOCK_COUNT.DT_POSTED is '记账时间';
comment on column RHN_SUP_STOCK_COUNT.ID_USER_POSTED is '记账人标识';
comment on column RHN_SUP_STOCK_COUNT.DES_REASON is '原因';
comment on column RHN_SUP_STOCK_COUNT.DES_STOCK_COUNT is '说明';
comment on column RHN_SUP_STOCK_COUNT.ID_INV_TXN is '库存流水标识';
comment on column RHN_SUP_STOCK_COUNT.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_COUNT.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_STOCK_COUNT.DT_UPDATED is '更新时间';
comment on column RHN_SUP_STOCK_COUNT.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_STOCK_COUNT_LINE is '库存盘点明细；一行代表一条库存盘点明细记录';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_STOCK_COUNT_LINE is '库存盘点明细主键';
comment on column RHN_SUP_STOCK_COUNT_LINE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_STOCK_COUNT is '库存盘点标识';
comment on column RHN_SUP_STOCK_COUNT_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_INV_BAL is '库存余额标识';
comment on column RHN_SUP_STOCK_COUNT_LINE.SN_INV_BAL_VER is '库存余额修订';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_STOCK_COUNT_LINE.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_STOCK_COUNT_LINE.QTY_BOOK is 'book数量';
comment on column RHN_SUP_STOCK_COUNT_LINE.QTY_COUNTED is 'counted数量';
comment on column RHN_SUP_STOCK_COUNT_LINE.QTY_VARIANCE is 'variance数量';
comment on column RHN_SUP_STOCK_COUNT_LINE.SD_COUNT_RESULT is '盘点结果';
comment on column RHN_SUP_STOCK_COUNT_LINE.DT_COUNTED is 'counted时间';
comment on column RHN_SUP_STOCK_COUNT_LINE.ID_USER_COUNTED is 'counted人标识';
comment on column RHN_SUP_STOCK_COUNT_LINE.DES_VARIANCE_REASON is 'variance原因';
comment on table RHN_SUP_STOCK_ITEM is '库存项目；一行代表一条库存项目记录';
comment on column RHN_SUP_STOCK_ITEM.ID_STOCK_ITEM is '库存项目主键';
comment on column RHN_SUP_STOCK_ITEM.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_ITEM.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_ITEM.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_STOCK_ITEM.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_SUP_STOCK_ITEM.ID_ITEM_PKG_BASE is '基础包装标识';
comment on column RHN_SUP_STOCK_ITEM.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_STOCK_ITEM.SD_ISSUE_POLICY is '问题策略';
comment on column RHN_SUP_STOCK_ITEM.FG_NEGATIVE is '是否negative允许';
comment on column RHN_SUP_STOCK_ITEM.FG_LOT_REQUIRED is '是否批号应需';
comment on column RHN_SUP_STOCK_ITEM.FG_TRACE_REQUIRED is '是否追溯应需';
comment on column RHN_SUP_STOCK_ITEM.FG_SPLIT is '是否拆分允许';
comment on column RHN_SUP_STOCK_ITEM.FG_COLD_CHAIN is '是否coldchain';
comment on column RHN_SUP_STOCK_ITEM.FG_CONTROLLED is '是否受控';
comment on column RHN_SUP_STOCK_ITEM.SD_CONTROL_LEVEL is 'control等级';
comment on column RHN_SUP_STOCK_ITEM.FG_HIGH_ALERT is '是否上限预警';
comment on column RHN_SUP_STOCK_ITEM.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_ITEM.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_ITEM.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_STOCK_ITEM.DT_UPDATED is '更新时间';
comment on column RHN_SUP_STOCK_ITEM.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_STOCK_LOT is '库存批号；一行代表一条库存批号记录';
comment on column RHN_SUP_STOCK_LOT.ID_STOCK_LOT is '库存批号主键';
comment on column RHN_SUP_STOCK_LOT.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_LOT.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_LOT.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_SUP_STOCK_LOT.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_STOCK_LOT.CD_LOT_NO is '批号编号';
comment on column RHN_SUP_STOCK_LOT.DA_PRODUCTION is '生产日期';
comment on column RHN_SUP_STOCK_LOT.DA_EXPIRY is '失效日期';
comment on column RHN_SUP_STOCK_LOT.CD_APPROVAL_SNAP is '审批编码快照';
comment on column RHN_SUP_STOCK_LOT.NA_MFR_SNAP is '生产厂商名称快照';
comment on column RHN_SUP_STOCK_LOT.SD_QUALITY_STATUS is '质量状态';
comment on column RHN_SUP_STOCK_LOT.DT_QUALITY is '质量时间';
comment on column RHN_SUP_STOCK_LOT.ID_QUALITY_USER is '质量用户标识';
comment on column RHN_SUP_STOCK_LOT.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_LOT.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_LOT.ID_USER_CREATED is '创建人标识';
comment on table RHN_SUP_STOCK_REQ is '库存请领；一行代表一条库存请领记录';
comment on column RHN_SUP_STOCK_REQ.ID_STOCK_REQ is '库存请领主键';
comment on column RHN_SUP_STOCK_REQ.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_REQ.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_REQ.ID_ORG is '机构标识';
comment on column RHN_SUP_STOCK_REQ.ID_STOCK_SITE_SRC is '来源库房标识';
comment on column RHN_SUP_STOCK_REQ.ID_DEPT_REQUESTING is 'requesting科室标识';
comment on column RHN_SUP_STOCK_REQ.ID_STOCK_SITE_DESTINATION is '目标库房标识';
comment on column RHN_SUP_STOCK_REQ.CD_REQ_NO is '请领编号';
comment on column RHN_SUP_STOCK_REQ.CD_REQ is '请求编码';
comment on column RHN_SUP_STOCK_REQ.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_REQ.DT_REQUESTED is '申请时间';
comment on column RHN_SUP_STOCK_REQ.ID_USER_REQUESTED is '申请人标识';
comment on column RHN_SUP_STOCK_REQ.DT_APPROVED is '审批时间';
comment on column RHN_SUP_STOCK_REQ.ID_USER_APPROVED is '审批人标识';
comment on column RHN_SUP_STOCK_REQ.DT_PICKED is '拣货时间';
comment on column RHN_SUP_STOCK_REQ.ID_USER_PICKED is '拣货人标识';
comment on column RHN_SUP_STOCK_REQ.DT_ISSUED is '签发时间';
comment on column RHN_SUP_STOCK_REQ.ID_USER_ISSUED is '签发人标识';
comment on column RHN_SUP_STOCK_REQ.DES_REASON is '原因';
comment on column RHN_SUP_STOCK_REQ.DES_STOCK_REQ is '说明';
comment on column RHN_SUP_STOCK_REQ.ID_INV_TXN is '库存流水标识';
comment on column RHN_SUP_STOCK_REQ.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_REQ.DT_UPDATED is '更新时间';
comment on column RHN_SUP_STOCK_REQ.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_STOCK_REQ_ALLOC is '库存请领分配；一行代表一条库存请领分配记录';
comment on column RHN_SUP_STOCK_REQ_ALLOC.ID_STOCK_REQ_ALLOC is '库存请领分配主键';
comment on column RHN_SUP_STOCK_REQ_ALLOC.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_REQ_ALLOC.ID_STOCK_REQ_LINE is '库存请领明细标识';
comment on column RHN_SUP_STOCK_REQ_ALLOC.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_STOCK_REQ_ALLOC.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_STOCK_REQ_ALLOC.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_STOCK_REQ_ALLOC.QTY_ALLOCATED is 'allocated数量';
comment on column RHN_SUP_STOCK_REQ_ALLOC.QTY_ISSUED is '签发数量';
comment on column RHN_SUP_STOCK_REQ_ALLOC.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_REQ_ALLOC.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_REQ_ALLOC.ID_USER_CREATED is '创建人标识';
comment on table RHN_SUP_STOCK_REQ_LINE is '库存请领明细；一行代表一条库存请领明细记录';
comment on column RHN_SUP_STOCK_REQ_LINE.ID_STOCK_REQ_LINE is '库存请领明细主键';
comment on column RHN_SUP_STOCK_REQ_LINE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_REQ_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_REQ_LINE.ID_STOCK_REQ is '库存请领标识';
comment on column RHN_SUP_STOCK_REQ_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_STOCK_REQ_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_STOCK_REQ_LINE.QTY_REQUESTED is '申请数量';
comment on column RHN_SUP_STOCK_REQ_LINE.QTY_APPROVED is '审批数量';
comment on column RHN_SUP_STOCK_REQ_LINE.QTY_ISSUED is '签发数量';
comment on column RHN_SUP_STOCK_REQ_LINE.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_STOCK_REQ_LINE.SD_LINE_STATUS is '明细状态';
comment on column RHN_SUP_STOCK_REQ_LINE.DES_STOCK_REQ_LINE is '说明';
comment on table RHN_SUP_STOCK_RETURN is '库存退回；一行代表一条库存退回记录';
comment on column RHN_SUP_STOCK_RETURN.ID_STOCK_RETURN is '库存退回主键';
comment on column RHN_SUP_STOCK_RETURN.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_RETURN.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_RETURN.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_STOCK_RETURN.ID_PAT is '患者标识';
comment on column RHN_SUP_STOCK_RETURN.ID_MED_DISP_ORIGINAL is '原发药标识';
comment on column RHN_SUP_STOCK_RETURN.ID_MED_DISP_RETURN is '退回发药标识';
comment on column RHN_SUP_STOCK_RETURN.CD_RETURN_NO is '退回编号';
comment on column RHN_SUP_STOCK_RETURN.SD_RETURN_TYPE is '退回类型';
comment on column RHN_SUP_STOCK_RETURN.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_RETURN.CD_REASON is '原因编码';
comment on column RHN_SUP_STOCK_RETURN.DT_REQUESTED is '申请时间';
comment on column RHN_SUP_STOCK_RETURN.ID_USER_REQUESTED is '申请人标识';
comment on column RHN_SUP_STOCK_RETURN.DT_CONFIRMED is '确认时间';
comment on column RHN_SUP_STOCK_RETURN.ID_USER_CONFIRMED is '确认人标识';
comment on column RHN_SUP_STOCK_RETURN.DES_STOCK_RETURN is '说明';
comment on table RHN_SUP_STOCK_RETURN_LINE is '库存退回明细；一行代表一条库存退回明细记录';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_STOCK_RETURN_LINE is '库存退回明细主键';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_STOCK_RETURN is '库存退回标识';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_MED_DISP_LINE_ORIGINAL is '原发药明细标识';
comment on column RHN_SUP_STOCK_RETURN_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_STOCK_BIN is '库存库位标识';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_STOCK_ITEM is '库存项目标识';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_STOCK_RETURN_LINE.ID_INV_TXN_LINE is '库存流水明细标识';
comment on column RHN_SUP_STOCK_RETURN_LINE.QTY_REQUESTED is '数量申请';
comment on column RHN_SUP_STOCK_RETURN_LINE.QTY_ACCEPTED is '数量接受';
comment on column RHN_SUP_STOCK_RETURN_LINE.CD_RETURN_UNIT is '退回单位编码';
comment on column RHN_SUP_STOCK_RETURN_LINE.BASE_QUANTITY_FACTOR is '基础数量换算系数';
comment on column RHN_SUP_STOCK_RETURN_LINE.SD_DISPOSITION is '处置方式';
comment on column RHN_SUP_STOCK_RETURN_LINE.DES_EXCEPT_DESCRIPTION is '例外说明';
comment on table RHN_SUP_STOCK_SITE is '库存库房；一行代表一条库存库房记录';
comment on column RHN_SUP_STOCK_SITE.ID_STOCK_SITE is '库存库房主键';
comment on column RHN_SUP_STOCK_SITE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_SITE.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_SITE.ID_ORG is '机构标识';
comment on column RHN_SUP_STOCK_SITE.ID_DEPT is '科室标识';
comment on column RHN_SUP_STOCK_SITE.CD_STOCK_SITE is '编码';
comment on column RHN_SUP_STOCK_SITE.NA_STOCK_SITE is '名称';
comment on column RHN_SUP_STOCK_SITE.SD_SITE_TYPE is '库房类型';
comment on column RHN_SUP_STOCK_SITE.SD_SVC_SCOPE is '服务范围';
comment on column RHN_SUP_STOCK_SITE.FG_ACTIVE is '是否有效';
comment on column RHN_SUP_STOCK_SITE.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SUP_STOCK_SITE.DA_VALID_TO is '有效结束日期';
comment on column RHN_SUP_STOCK_SITE.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_SITE.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_STOCK_SITE.DT_UPDATED is '更新时间';
comment on column RHN_SUP_STOCK_SITE.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_STOCK_XFER is '库存调拨；一行代表一条库存调拨记录';
comment on column RHN_SUP_STOCK_XFER.ID_STOCK_XFER is '库存调拨主键';
comment on column RHN_SUP_STOCK_XFER.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_XFER.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_XFER.ID_ORG is '机构标识';
comment on column RHN_SUP_STOCK_XFER.ID_STOCK_SITE_SRC is '来源库房标识';
comment on column RHN_SUP_STOCK_XFER.ID_STOCK_SITE_DESTINATION is '目标库房标识';
comment on column RHN_SUP_STOCK_XFER.CD_XFER_NO is '调拨编号';
comment on column RHN_SUP_STOCK_XFER.CD_REQ is '请求编码';
comment on column RHN_SUP_STOCK_XFER.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_XFER.DT_REQUESTED is '申请时间';
comment on column RHN_SUP_STOCK_XFER.ID_USER_REQUESTED is '申请人标识';
comment on column RHN_SUP_STOCK_XFER.DT_APPROVED is '审批时间';
comment on column RHN_SUP_STOCK_XFER.ID_USER_APPROVED is '审批人标识';
comment on column RHN_SUP_STOCK_XFER.DT_DISPATCHED is '发出时间';
comment on column RHN_SUP_STOCK_XFER.ID_USER_DISPATCHED is '发出人标识';
comment on column RHN_SUP_STOCK_XFER.DT_RECEIVED is '接收时间';
comment on column RHN_SUP_STOCK_XFER.ID_USER_RECEIVED is '接收人标识';
comment on column RHN_SUP_STOCK_XFER.DES_REASON is '原因';
comment on column RHN_SUP_STOCK_XFER.DES_STOCK_XFER is '说明';
comment on column RHN_SUP_STOCK_XFER.ID_INV_TXN_OUTBOUND is 'outbound流水标识';
comment on column RHN_SUP_STOCK_XFER.ID_INV_TXN_INBOUND is 'inbound流水标识';
comment on column RHN_SUP_STOCK_XFER.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_XFER.DT_UPDATED is '更新时间';
comment on column RHN_SUP_STOCK_XFER.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_STOCK_XFER_ALLOC is '库存调拨分配；一行代表一条库存调拨分配记录';
comment on column RHN_SUP_STOCK_XFER_ALLOC.ID_STOCK_XFER_ALLOC is '库存调拨分配主键';
comment on column RHN_SUP_STOCK_XFER_ALLOC.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_XFER_ALLOC.ID_STOCK_XFER_LINE is '库存调拨明细标识';
comment on column RHN_SUP_STOCK_XFER_ALLOC.ID_STOCK_BIN_SRC is '来源库位标识';
comment on column RHN_SUP_STOCK_XFER_ALLOC.ID_STOCK_BIN_DESTINATION is '目标库位标识';
comment on column RHN_SUP_STOCK_XFER_ALLOC.ID_STOCK_LOT is '库存批号标识';
comment on column RHN_SUP_STOCK_XFER_ALLOC.SD_STOCK_STATUS is '库存状态';
comment on column RHN_SUP_STOCK_XFER_ALLOC.QTY_DISPATCHED is '发出数量';
comment on column RHN_SUP_STOCK_XFER_ALLOC.QTY_RECEIVED is '接收数量';
comment on column RHN_SUP_STOCK_XFER_ALLOC.QTY_DAMAGED is 'damaged数量';
comment on column RHN_SUP_STOCK_XFER_ALLOC.SD_STATUS is '状态';
comment on column RHN_SUP_STOCK_XFER_ALLOC.DT_CREATED is '创建时间';
comment on column RHN_SUP_STOCK_XFER_ALLOC.ID_USER_CREATED is '创建人标识';
comment on table RHN_SUP_STOCK_XFER_LINE is '库存调拨明细；一行代表一条库存调拨明细记录';
comment on column RHN_SUP_STOCK_XFER_LINE.ID_STOCK_XFER_LINE is '库存调拨明细主键';
comment on column RHN_SUP_STOCK_XFER_LINE.REVISION is '乐观锁修订号';
comment on column RHN_SUP_STOCK_XFER_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_STOCK_XFER_LINE.ID_STOCK_XFER is '库存调拨标识';
comment on column RHN_SUP_STOCK_XFER_LINE.SN_SORT is '排序医嘱';
comment on column RHN_SUP_STOCK_XFER_LINE.ID_STOCK_ITEM_SRC is '来源库存项目标识';
comment on column RHN_SUP_STOCK_XFER_LINE.ID_STOCK_ITEM_DESTINATION is '目标库存项目标识';
comment on column RHN_SUP_STOCK_XFER_LINE.QTY_REQUESTED is '申请数量';
comment on column RHN_SUP_STOCK_XFER_LINE.QTY_APPROVED is '审批数量';
comment on column RHN_SUP_STOCK_XFER_LINE.QTY_DISPATCHED is '发出数量';
comment on column RHN_SUP_STOCK_XFER_LINE.QTY_RECEIVED is '接收数量';
comment on column RHN_SUP_STOCK_XFER_LINE.QTY_DAMAGED is 'damaged数量';
comment on column RHN_SUP_STOCK_XFER_LINE.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_STOCK_XFER_LINE.SD_LINE_STATUS is '明细状态';
comment on column RHN_SUP_STOCK_XFER_LINE.DES_DISCREPANCY_REASON is '差异原因';
comment on column RHN_SUP_STOCK_XFER_LINE.QTY_REQUESTED_OPERATION is '申请业务操作数量';
comment on column RHN_SUP_STOCK_XFER_LINE.CD_OPERATION_UNIT is '业务操作单位编码';
comment on column RHN_SUP_STOCK_XFER_LINE.BASE_QUANTITY_FACTOR is '基础数量换算系数';
comment on table RHN_SUP_SUPPL is '供应商；一行代表一条供应商记录';
comment on column RHN_SUP_SUPPL.ID_SUPPL is '供应商主键';
comment on column RHN_SUP_SUPPL.REVISION is '乐观锁修订号';
comment on column RHN_SUP_SUPPL.ID_TNT is '租户标识';
comment on column RHN_SUP_SUPPL.ID_ORG is '机构标识';
comment on column RHN_SUP_SUPPL.CD_SUPPL is '编码';
comment on column RHN_SUP_SUPPL.NA_SUPPL is '名称';
comment on column RHN_SUP_SUPPL.CD_UNIFIED_CREDIT is 'unifiedcredit编码';
comment on column RHN_SUP_SUPPL.CD_LICENSE_NO is 'license编号';
comment on column RHN_SUP_SUPPL.DA_LICENSE_VALID_TO is 'license有效结束日期';
comment on column RHN_SUP_SUPPL.NA_CONTACT is '联系方式名称';
comment on column RHN_SUP_SUPPL.CONTACT_PHONE is '联系方式电话';
comment on column RHN_SUP_SUPPL.SD_STATUS is '状态';
comment on column RHN_SUP_SUPPL.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SUP_SUPPL.DA_VALID_TO is '有效结束日期';
comment on column RHN_SUP_SUPPL.DT_CREATED is '创建时间';
comment on column RHN_SUP_SUPPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_SUPPL.DT_UPDATED is '更新时间';
comment on column RHN_SUP_SUPPL.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_SUPPL_SUPPLY_ITEM is '供应商供应项目；一行代表一条供应商供应项目记录';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.ID_SUPPL_SUPPLY_ITEM is '供应商供应项目主键';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.REVISION is '乐观锁修订号';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.ID_TNT is '租户标识';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.ID_SUPPL is '供应商标识';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.ID_ITEM_PKG is '包装标识';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.PRICE_AGREEMENT is 'agreement单价';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.TAX_RATE is '税率rate';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.FG_PURCH is '是否采购enabled';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.DA_VALID_TO is '有效结束日期';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.DT_CREATED is '创建时间';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.DT_UPDATED is '更新时间';
comment on column RHN_SUP_SUPPL_SUPPLY_ITEM.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SUP_WARD_DELIV is '病区配送；一行代表一条病区配送记录';
comment on column RHN_SUP_WARD_DELIV.ID_WARD_DELIV is '病区配送主键';
comment on column RHN_SUP_WARD_DELIV.REVISION is '乐观锁修订号';
comment on column RHN_SUP_WARD_DELIV.ID_TNT is '租户标识';
comment on column RHN_SUP_WARD_DELIV.ID_ORG is '机构标识';
comment on column RHN_SUP_WARD_DELIV.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_WARD_DELIV.ID_DEPT_NURS_UNIT is '护理单位科室标识';
comment on column RHN_SUP_WARD_DELIV.CD_DELIV_NO is '配送编号';
comment on column RHN_SUP_WARD_DELIV.SD_STATUS is '状态';
comment on column RHN_SUP_WARD_DELIV.NA_STOCK_SITE_SNAP is '库存库房名称快照';
comment on column RHN_SUP_WARD_DELIV.NA_NURS_UNIT_SNAP is '护理单位名称快照';
comment on column RHN_SUP_WARD_DELIV.DT_CREATED is '创建时间';
comment on column RHN_SUP_WARD_DELIV.ID_USER_CREATED is '创建人标识';
comment on column RHN_SUP_WARD_DELIV.DT_DISPATCHED is '发出时间';
comment on column RHN_SUP_WARD_DELIV.ID_USER_DISPATCHED is '发出人标识';
comment on column RHN_SUP_WARD_DELIV.DES_DISPATCH_NOTE is 'dispatch备注';
comment on column RHN_SUP_WARD_DELIV.DT_RECEIVED is '接收时间';
comment on column RHN_SUP_WARD_DELIV.ID_USER_RECEIVED is '接收人标识';
comment on column RHN_SUP_WARD_DELIV.DES_RCPT_NOTE is '票据备注';
comment on column RHN_SUP_WARD_DELIV.DES_DISCREPANCY_NOTE is '差异备注';
comment on column RHN_SUP_WARD_DELIV.DT_RESOLVED is '已解决时间';
comment on column RHN_SUP_WARD_DELIV.ID_USER_RESOLVED is '已解决人标识';
comment on column RHN_SUP_WARD_DELIV.CD_RESOLUTION is '处理结果编码';
comment on column RHN_SUP_WARD_DELIV.DES_RESOLUTION_NOTE is '处理结果备注';
comment on table RHN_SUP_WARD_DELIV_EVT is '病区配送事件；一行代表一条病区配送事件记录';
comment on column RHN_SUP_WARD_DELIV_EVT.ID_WARD_DELIV_EVT is '病区配送事件主键';
comment on column RHN_SUP_WARD_DELIV_EVT.ID_TNT is '租户标识';
comment on column RHN_SUP_WARD_DELIV_EVT.ID_WARD_DELIV is '配送标识';
comment on column RHN_SUP_WARD_DELIV_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SUP_WARD_DELIV_EVT.SD_FROM_STATUS is '原状态';
comment on column RHN_SUP_WARD_DELIV_EVT.SD_TO_STATUS is '目标状态';
comment on column RHN_SUP_WARD_DELIV_EVT.CD_COMMAND is '命令编码';
comment on column RHN_SUP_WARD_DELIV_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_WARD_DELIV_EVT.ID_USER_OCCURRED is '发生人标识';
comment on column RHN_SUP_WARD_DELIV_EVT.DES_NOTE is '备注';
comment on table RHN_SUP_WARD_DELIV_LINE is '病区配送明细；一行代表一条病区配送明细记录';
comment on column RHN_SUP_WARD_DELIV_LINE.ID_WARD_DELIV_LINE is '病区配送明细主键';
comment on column RHN_SUP_WARD_DELIV_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_WARD_DELIV_LINE.ID_WARD_DELIV is '配送标识';
comment on column RHN_SUP_WARD_DELIV_LINE.ID_MED_DISP is '发药标识';
comment on column RHN_SUP_WARD_DELIV_LINE.ID_PAT is '患者标识';
comment on column RHN_SUP_WARD_DELIV_LINE.ID_ENC is '就诊标识';
comment on column RHN_SUP_WARD_DELIV_LINE.NA_PAT_SNAP is '患者名称快照';
comment on column RHN_SUP_WARD_DELIV_LINE.NA_MED_SNAP is '药品名称快照';
comment on column RHN_SUP_WARD_DELIV_LINE.QTY_EXPECTED is '预期数量';
comment on column RHN_SUP_WARD_DELIV_LINE.QTY_RECEIVED is '接收数量';
comment on column RHN_SUP_WARD_DELIV_LINE.CD_UNIT is '单位编码';
comment on column RHN_SUP_WARD_DELIV_LINE.SD_STATUS is '状态';
comment on column RHN_SUP_WARD_DELIV_LINE.CD_DISCREPANCY is '差异编码';
comment on column RHN_SUP_WARD_DELIV_LINE.DES_DISCREPANCY_NOTE is '差异备注';
comment on table RHN_SUP_WARD_MED_RETURN_EVT is '病区用药退回事件；一行代表一条病区用药退回事件记录';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.ID_WARD_MED_RETURN_EVT is '病区用药退回事件主键';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.ID_TNT is '租户标识';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.ID_WARD_MED_RETURN_REQ is '退回请求标识';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.SD_FROM_STATUS is '原状态';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.SD_TO_STATUS is '目标状态';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.CD_COMMAND is '命令编码';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.HASH_PAYLOAD is '载荷摘要';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.ID_USER_OCCURRED is '发生人标识';
comment on column RHN_SUP_WARD_MED_RETURN_EVT.DES_NOTE is '备注';
comment on table RHN_SUP_WARD_MED_RETURN_LINE is '病区用药退回明细；一行代表一条病区用药退回明细记录';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_WARD_MED_RETURN_LINE is '病区用药退回明细主键';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_TNT is '租户标识';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_WARD_MED_RETURN_REQ is '退回请求标识';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_CARE_REQ is '请求标识';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_MED_DISP_ORIGINAL is '原发药标识';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_MED_DISP_LINE_ORIGINAL is '原发药明细标识';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_DISP_TASK_LINE is '发药任务明细标识';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.NA_MED_SNAP is '药品名称快照';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.QTY_REQUESTED is '申请数量';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.CD_UNIT is '单位编码';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.QTY_REQUESTED_BASE is '申请基础数量';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.CD_BASE_UNIT is '基础单位编码';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.SD_DISPOSITION is '处置方式';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_STOCK_RETURN is '库存退回标识';
comment on column RHN_SUP_WARD_MED_RETURN_LINE.ID_MED_DISP_RETURN is '退回发药标识';
comment on table RHN_SUP_WARD_MED_RETURN_REQ is '病区用药退回请求；一行代表一条病区用药退回请求记录';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_WARD_MED_RETURN_REQ is '病区用药退回请求主键';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.REVISION is '乐观锁修订号';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_TNT is '租户标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_ORG is '机构标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_STOCK_SITE is '库存库房标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_DEPT_NURS_UNIT is '护理单位科室标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_PAT is '患者标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_ENC is '就诊标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.CD_REQ_NO is '请求编号';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.SD_STATUS is '状态';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.DT_REQUESTED is '申请时间';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_USER_REQUESTED is '申请人标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.DES_REQ_NOTE is '请求备注';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.DT_HANDED_OVER is 'handedover时间';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_USER_HANDED_OVER is 'handedover人标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.DES_HANDOVER_NOTE is 'handover备注';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.DT_RECEIVED is '接收时间';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_USER_RECEIVED is '接收人标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_PROCESSOR_PRACT is 'processor医务人员标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.ID_PROCESSOR_ASSIGN is 'processor任职标识';
comment on column RHN_SUP_WARD_MED_RETURN_REQ.DES_RCPT_NOTE is '票据备注';
comment on table RHN_SYS_ACC_PERM is '访问权限；一行代表一条访问权限记录';
comment on column RHN_SYS_ACC_PERM.ID_ACC_PERM is '访问权限主键';
comment on column RHN_SYS_ACC_PERM.ID_TNT is '租户标识';
comment on column RHN_SYS_ACC_PERM.ID_MGMT_MOD is '管理模块标识';
comment on column RHN_SYS_ACC_PERM.CD_ACC_PERM is '编码';
comment on column RHN_SYS_ACC_PERM.NA_ACC_PERM is '名称';
comment on column RHN_SYS_ACC_PERM.CD_ACTION is '操作编码';
comment on column RHN_SYS_ACC_PERM.CD_RSRC is '资源编码';
comment on column RHN_SYS_ACC_PERM.SD_STATUS is '状态';
comment on table RHN_SYS_ACC_ROLE is '访问角色；一行代表一条访问角色记录';
comment on column RHN_SYS_ACC_ROLE.ID_ACC_ROLE is '访问角色主键';
comment on column RHN_SYS_ACC_ROLE.ID_TNT is '租户标识';
comment on column RHN_SYS_ACC_ROLE.CD_ACC_ROLE is '编码';
comment on column RHN_SYS_ACC_ROLE.NA_ACC_ROLE is '名称';
comment on column RHN_SYS_ACC_ROLE.SD_ROLE_TYPE is '角色类型';
comment on column RHN_SYS_ACC_ROLE.SD_STATUS is '状态';
comment on column RHN_SYS_ACC_ROLE.DT_CREATED is '创建时间';
comment on column RHN_SYS_ACC_ROLE.DT_UPDATED is '更新时间';
comment on column RHN_SYS_ACC_ROLE.REVISION is '乐观锁修订号';
comment on table RHN_SYS_ANN is '体系公告；一行代表一条体系公告记录';
comment on column RHN_SYS_ANN.ID_SYS_ANN is '体系公告主键';
comment on column RHN_SYS_ANN.REVISION is '乐观锁修订号';
comment on column RHN_SYS_ANN.ID_TNT is '租户标识';
comment on column RHN_SYS_ANN.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_SYS_ANN.ID_ORG is '机构标识';
comment on column RHN_SYS_ANN.ID_DEPT is '科室标识';
comment on column RHN_SYS_ANN.SD_CAT is '分类';
comment on column RHN_SYS_ANN.SD_PRIORITY is '优先级';
comment on column RHN_SYS_ANN.NA_TITLE is '标题';
comment on column RHN_SYS_ANN.DES_SUM is '汇总';
comment on column RHN_SYS_ANN.DES_CONTENT is '内容文本';
comment on column RHN_SYS_ANN.FG_PINNED is '是否pinned';
comment on column RHN_SYS_ANN.SD_STATUS is '状态';
comment on column RHN_SYS_ANN.DT_PUBLISH is 'publish时间';
comment on column RHN_SYS_ANN.DT_EXPIRE is 'expire时间';
comment on column RHN_SYS_ANN.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_ANN.ID_USER_PUBLISD is '发布人标识';
comment on column RHN_SYS_ANN.DT_PUBLISD is '发布时间';
comment on column RHN_SYS_ANN.ID_USER_WITHDRAWN is 'withdrawn人标识';
comment on column RHN_SYS_ANN.DT_WITHDRAWN is 'withdrawn时间';
comment on column RHN_SYS_ANN.DT_CREATED is '创建时间';
comment on column RHN_SYS_ANN.DT_UPDATED is '更新时间';
comment on table RHN_SYS_ANN_READ_RCPT is '公告已读票据；一行代表一条公告已读票据记录';
comment on column RHN_SYS_ANN_READ_RCPT.ID_ANN_READ_RCPT is '公告已读票据主键';
comment on column RHN_SYS_ANN_READ_RCPT.ID_TNT is '租户标识';
comment on column RHN_SYS_ANN_READ_RCPT.ID_SYS_ANN is '公告标识';
comment on column RHN_SYS_ANN_READ_RCPT.ID_USER is '用户标识';
comment on column RHN_SYS_ANN_READ_RCPT.DT_READ is '已读时间';
comment on table RHN_SYS_CFG_DEF is '配置定义；一行代表一条配置定义记录';
comment on column RHN_SYS_CFG_DEF.ID_CFG_DEF is '配置定义主键';
comment on column RHN_SYS_CFG_DEF.CD_CONFIG_KEY is '配置键';
comment on column RHN_SYS_CFG_DEF.NA_CFG_DEF is '名称';
comment on column RHN_SYS_CFG_DEF.DES_CFG_DEF is '说明';
comment on column RHN_SYS_CFG_DEF.SD_VAL_TYPE is '值类型';
comment on column RHN_SYS_CFG_DEF.JSON_DEFAULT_VAL is '默认值JSON';
comment on column RHN_SYS_CFG_DEF.ALLOWED_SCOPES is '允许范围';
comment on column RHN_SYS_CFG_DEF.SD_STATUS is '状态';
comment on column RHN_SYS_CFG_DEF.DT_CREATED is '创建时间';
comment on column RHN_SYS_CFG_DEF.SD_CFG_CAT is '配置分类';
comment on column RHN_SYS_CFG_DEF.FG_INHERITANCE is '是否inheritanceenabled';
comment on column RHN_SYS_CFG_DEF.FG_CACHE is '是否cacheenabled';
comment on table RHN_SYS_CFG_REV is '配置修订；一行代表一条配置修订记录';
comment on column RHN_SYS_CFG_REV.ID_CFG_REV is '配置修订主键';
comment on column RHN_SYS_CFG_REV.ID_CFG_DEF is '定义标识';
comment on column RHN_SYS_CFG_REV.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_SYS_CFG_REV.ID_SCOPE is '范围标识';
comment on column RHN_SYS_CFG_REV.REVISION is '乐观锁修订号';
comment on column RHN_SYS_CFG_REV.JSON_VAL is '值JSON';
comment on column RHN_SYS_CFG_REV.SD_STATUS is '状态';
comment on column RHN_SYS_CFG_REV.DT_EFFECTIVE_FROM is '生效开始日期';
comment on column RHN_SYS_CFG_REV.DT_EFFECTIVE_TO is '生效结束日期';
comment on column RHN_SYS_CFG_REV.DES_CHG_REASON is '变更原因';
comment on column RHN_SYS_CFG_REV.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_CFG_REV.DT_CREATED is '创建时间';
comment on column RHN_SYS_CFG_REV.ID_USER_PUBLISD is '发布人标识';
comment on column RHN_SYS_CFG_REV.DT_PUBLISD is '发布时间';
comment on column RHN_SYS_CFG_REV.ID_TNT is '租户标识';
comment on table RHN_SYS_DEPT is '科室；一行代表一条科室记录';
comment on column RHN_SYS_DEPT.ID_DEPT is '科室主键';
comment on column RHN_SYS_DEPT.ID_TNT is '租户标识';
comment on column RHN_SYS_DEPT.ID_ORG is '机构标识';
comment on column RHN_SYS_DEPT.ID_DEPT_PARENT is '上级标识';
comment on column RHN_SYS_DEPT.ID_DEPT_MERGED_TO is '合并目标标识';
comment on column RHN_SYS_DEPT.CD_DEPT is '编码';
comment on column RHN_SYS_DEPT.NA_DEPT is '名称';
comment on column RHN_SYS_DEPT.NA_SHORT is '简称名称';
comment on column RHN_SYS_DEPT.DES_DEPT is '说明';
comment on column RHN_SYS_DEPT.SD_DEPT_TYPE is '科室类型';
comment on column RHN_SYS_DEPT.SD_DEPT_PROPERTY is '科室property';
comment on column RHN_SYS_DEPT.FG_VIRTUAL is '是否virtual';
comment on column RHN_SYS_DEPT.SN_SORT is '排序医嘱';
comment on column RHN_SYS_DEPT.SD_STATUS is '状态';
comment on column RHN_SYS_DEPT.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_DEPT.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_DEPT.DT_CREATED is '创建时间';
comment on column RHN_SYS_DEPT.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_DEPT.DT_UPDATED is '更新时间';
comment on column RHN_SYS_DEPT.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SYS_DEPT.REVISION is '乐观锁修订号';
comment on table RHN_SYS_DEPT_CAP is '科室能力；一行代表一条科室能力记录';
comment on column RHN_SYS_DEPT_CAP.ID_DEPT_CAP is '科室能力主键';
comment on column RHN_SYS_DEPT_CAP.ID_TNT is '租户标识';
comment on column RHN_SYS_DEPT_CAP.ID_DEPT is '科室标识';
comment on column RHN_SYS_DEPT_CAP.SD_CAP_TYPE is '能力类型';
comment on column RHN_SYS_DEPT_CAP.CD_QUALIFICATION_BASIS is 'qualification依据编码';
comment on column RHN_SYS_DEPT_CAP.SD_CAP_SCOPE is '能力范围';
comment on column RHN_SYS_DEPT_CAP.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_DEPT_CAP.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_DEPT_CAP.SD_VERIFY_STATUS is 'verify状态';
comment on column RHN_SYS_DEPT_CAP.SD_STATUS is '状态';
comment on table RHN_SYS_DEPT_CONTACT is '科室联系方式；一行代表一条科室联系方式记录';
comment on column RHN_SYS_DEPT_CONTACT.ID_DEPT_CONTACT is '科室联系方式主键';
comment on column RHN_SYS_DEPT_CONTACT.ID_TNT is '租户标识';
comment on column RHN_SYS_DEPT_CONTACT.ID_DEPT is '科室标识';
comment on column RHN_SYS_DEPT_CONTACT.SD_CONTACT_TYPE is '联系方式类型';
comment on column RHN_SYS_DEPT_CONTACT.CONTACT_VALUE is '联系方式值';
comment on column RHN_SYS_DEPT_CONTACT.CONTACT_USE is '联系方式用途';
comment on column RHN_SYS_DEPT_CONTACT.FG_PRIMARY_CONTACT is '是否主要联系方式';
comment on column RHN_SYS_DEPT_CONTACT.SN_SORT is '排序医嘱';
comment on column RHN_SYS_DEPT_CONTACT.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_DEPT_CONTACT.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_DEPT_CONTACT.SD_STATUS is '状态';
comment on table RHN_SYS_DEPT_REL is '科室关系；一行代表一条科室关系记录';
comment on column RHN_SYS_DEPT_REL.ID_DEPT_REL is '科室关系主键';
comment on column RHN_SYS_DEPT_REL.ID_TNT is '租户标识';
comment on column RHN_SYS_DEPT_REL.ID_DEPT_SRC is '来源科室标识';
comment on column RHN_SYS_DEPT_REL.ID_DEPT_TARGET is 'target科室标识';
comment on column RHN_SYS_DEPT_REL.SD_REL_TYPE is '关系类型';
comment on column RHN_SYS_DEPT_REL.FG_PRIMARY_REL is '是否主要关系';
comment on column RHN_SYS_DEPT_REL.DES_DEPT_REL is '说明';
comment on column RHN_SYS_DEPT_REL.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_DEPT_REL.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_DEPT_REL.SD_STATUS is '状态';
comment on table RHN_SYS_DEPT_RESP is '科室职责；一行代表一条科室职责记录';
comment on column RHN_SYS_DEPT_RESP.ID_DEPT_RESP is '科室职责主键';
comment on column RHN_SYS_DEPT_RESP.ID_TNT is '租户标识';
comment on column RHN_SYS_DEPT_RESP.ID_DEPT is '科室标识';
comment on column RHN_SYS_DEPT_RESP.ID_STAFF_ASSIGN is '任职标识';
comment on column RHN_SYS_DEPT_RESP.NA_EXT_RESPONSIBLE is '外部responsible名称';
comment on column RHN_SYS_DEPT_RESP.SD_RESP_TYPE is '职责类型';
comment on column RHN_SYS_DEPT_RESP.FG_PRIMARY_RESP is '是否主要职责';
comment on column RHN_SYS_DEPT_RESP.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_DEPT_RESP.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_DEPT_RESP.SD_STATUS is '状态';
comment on table RHN_SYS_EMPL is '任职；一行代表一条任职记录';
comment on column RHN_SYS_EMPL.ID_EMPL is '任职主键';
comment on column RHN_SYS_EMPL.ID_TNT is '租户标识';
comment on column RHN_SYS_EMPL.ID_PRACT is '医务人员标识';
comment on column RHN_SYS_EMPL.ID_ORG is '机构标识';
comment on column RHN_SYS_EMPL.CD_EMPL is '编码';
comment on column RHN_SYS_EMPL.SD_EMPL_TYPE is '任职类型';
comment on column RHN_SYS_EMPL.FG_PRIMARY_EMPL is '是否主要任职';
comment on column RHN_SYS_EMPL.DA_HIRE is 'hire日期';
comment on column RHN_SYS_EMPL.DA_LEAVE is 'leave日期';
comment on column RHN_SYS_EMPL.SD_STATUS is '状态';
comment on column RHN_SYS_EMPL.DT_CREATED is '创建时间';
comment on column RHN_SYS_EMPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_EMPL.DT_UPDATED is '更新时间';
comment on column RHN_SYS_EMPL.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SYS_EMPL.REVISION is '乐观锁修订号';
comment on table RHN_SYS_MGMT_MOD is '管理模块；一行代表一条管理模块记录';
comment on column RHN_SYS_MGMT_MOD.ID_MGMT_MOD is '管理模块主键';
comment on column RHN_SYS_MGMT_MOD.ID_TNT is '租户标识';
comment on column RHN_SYS_MGMT_MOD.ID_MGMT_MOD_PARENT is '上级标识';
comment on column RHN_SYS_MGMT_MOD.CD_MGMT_MOD is '编码';
comment on column RHN_SYS_MGMT_MOD.NA_MGMT_MOD is '名称';
comment on column RHN_SYS_MGMT_MOD.SD_MOD_TYPE is '模块类型';
comment on column RHN_SYS_MGMT_MOD.ROUTE_PATH is '途径路径';
comment on column RHN_SYS_MGMT_MOD.CD_COMP is '组成编码';
comment on column RHN_SYS_MGMT_MOD.CD_ICON is 'icon编码';
comment on column RHN_SYS_MGMT_MOD.SN_SORT is '排序医嘱';
comment on column RHN_SYS_MGMT_MOD.SD_STATUS is '状态';
comment on column RHN_SYS_MGMT_MOD.DT_CREATED is '创建时间';
comment on column RHN_SYS_MGMT_MOD.DT_UPDATED is '更新时间';
comment on column RHN_SYS_MGMT_MOD.REVISION is '乐观锁修订号';
comment on table RHN_SYS_ORG is '机构；一行代表一条机构记录';
comment on column RHN_SYS_ORG.ID_ORG is '机构主键';
comment on column RHN_SYS_ORG.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG.ID_ORG_PARENT is '上级标识';
comment on column RHN_SYS_ORG.ID_ORG_MERGED_TO is '合并目标标识';
comment on column RHN_SYS_ORG.CD_ORG is '编码';
comment on column RHN_SYS_ORG.NA_ORG is '名称';
comment on column RHN_SYS_ORG.SD_ORG_KIND is '机构kind';
comment on column RHN_SYS_ORG.SD_ORG_TYPE is '机构类型';
comment on column RHN_SYS_ORG.SD_STATUS is '状态';
comment on column RHN_SYS_ORG.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ORG.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ORG.DT_CREATED is '创建时间';
comment on column RHN_SYS_ORG.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_ORG.DT_UPDATED is '更新时间';
comment on column RHN_SYS_ORG.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SYS_ORG.REVISION is '乐观锁修订号';
comment on column RHN_SYS_ORG.NA_SHORT is '简称名称';
comment on column RHN_SYS_ORG.DES_ORG is '说明';
comment on column RHN_SYS_ORG.SD_ORG_PROPERTY is '机构property';
comment on column RHN_SYS_ORG.FG_VIRTUAL is '是否virtual';
comment on column RHN_SYS_ORG.SN_SORT is '排序医嘱';
comment on column RHN_SYS_ORG.CD_TIMEZONE is '时区编码';
comment on column RHN_SYS_ORG.CD_DEPT_TYPE is '科室类型编码';
comment on table RHN_SYS_ORG_ADDR is '机构地址；一行代表一条机构地址记录';
comment on column RHN_SYS_ORG_ADDR.ID_ORG_ADDR is '机构地址主键';
comment on column RHN_SYS_ORG_ADDR.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG_ADDR.ID_ORG is '机构标识';
comment on column RHN_SYS_ORG_ADDR.SD_ADDR_TYPE is '地址类型';
comment on column RHN_SYS_ORG_ADDR.CD_COUNTRY is 'country编码';
comment on column RHN_SYS_ORG_ADDR.CD_PROVINCE is 'province编码';
comment on column RHN_SYS_ORG_ADDR.CD_CITY is 'city编码';
comment on column RHN_SYS_ORG_ADDR.CD_DISTRICT is 'district编码';
comment on column RHN_SYS_ORG_ADDR.DES_STREET_ADDR is 'street地址';
comment on column RHN_SYS_ORG_ADDR.CD_POSTAL is 'postal编码';
comment on column RHN_SYS_ORG_ADDR.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ORG_ADDR.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ORG_ADDR.SD_STATUS is '状态';
comment on table RHN_SYS_ORG_CAP is '机构能力；一行代表一条机构能力记录';
comment on column RHN_SYS_ORG_CAP.ID_ORG_CAP is '机构能力主键';
comment on column RHN_SYS_ORG_CAP.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG_CAP.ID_ORG is '机构标识';
comment on column RHN_SYS_ORG_CAP.SD_CAP_TYPE is '能力类型';
comment on column RHN_SYS_ORG_CAP.CD_QUALIFICATION_BASIS is 'qualification依据编码';
comment on column RHN_SYS_ORG_CAP.SD_CAP_SCOPE is '能力范围';
comment on column RHN_SYS_ORG_CAP.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ORG_CAP.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ORG_CAP.SD_VERIFY_STATUS is 'verify状态';
comment on column RHN_SYS_ORG_CAP.SD_STATUS is '状态';
comment on table RHN_SYS_ORG_CONTACT is '机构联系方式；一行代表一条机构联系方式记录';
comment on column RHN_SYS_ORG_CONTACT.ID_ORG_CONTACT is '机构联系方式主键';
comment on column RHN_SYS_ORG_CONTACT.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG_CONTACT.ID_ORG is '机构标识';
comment on column RHN_SYS_ORG_CONTACT.SD_CONTACT_TYPE is '联系方式类型';
comment on column RHN_SYS_ORG_CONTACT.CONTACT_VALUE is '联系方式值';
comment on column RHN_SYS_ORG_CONTACT.CONTACT_USE is '联系方式用途';
comment on column RHN_SYS_ORG_CONTACT.FG_PRIMARY_CONTACT is '是否主要联系方式';
comment on column RHN_SYS_ORG_CONTACT.SN_SORT is '排序医嘱';
comment on column RHN_SYS_ORG_CONTACT.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ORG_CONTACT.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ORG_CONTACT.SD_STATUS is '状态';
comment on table RHN_SYS_ORG_IDENT is '机构标识；一行代表一条机构标识记录';
comment on column RHN_SYS_ORG_IDENT.ID_ORG_IDENT is '机构标识主键';
comment on column RHN_SYS_ORG_IDENT.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG_IDENT.ID_ORG is '机构标识';
comment on column RHN_SYS_ORG_IDENT.CD_IDENT_SYS is '标识体系';
comment on column RHN_SYS_ORG_IDENT.CD_IDENT is '标识编码';
comment on column RHN_SYS_ORG_IDENT.SD_IDENT_TYPE is '标识类型';
comment on column RHN_SYS_ORG_IDENT.ID_ORG_ISSUER is '签发方机构标识';
comment on column RHN_SYS_ORG_IDENT.FG_PRIMARY_IDENT is '是否主要标识';
comment on column RHN_SYS_ORG_IDENT.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ORG_IDENT.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ORG_IDENT.SD_VERIFY_STATUS is 'verify状态';
comment on column RHN_SYS_ORG_IDENT.DT_VERIFIED is '已验证时间';
comment on column RHN_SYS_ORG_IDENT.ID_USER_VERIFIED is '已验证人标识';
comment on column RHN_SYS_ORG_IDENT.SD_STATUS is '状态';
comment on table RHN_SYS_ORG_REL is '机构关系；一行代表一条机构关系记录';
comment on column RHN_SYS_ORG_REL.ID_ORG_REL is '机构关系主键';
comment on column RHN_SYS_ORG_REL.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG_REL.ID_ORG_SRC is '来源机构标识';
comment on column RHN_SYS_ORG_REL.ID_ORG_TARGET is 'target机构标识';
comment on column RHN_SYS_ORG_REL.SD_REL_TYPE is '关系类型';
comment on column RHN_SYS_ORG_REL.FG_PRIMARY_REL is '是否主要关系';
comment on column RHN_SYS_ORG_REL.DES_ORG_REL is '说明';
comment on column RHN_SYS_ORG_REL.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ORG_REL.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ORG_REL.SD_STATUS is '状态';
comment on table RHN_SYS_ORG_RESP is '机构职责；一行代表一条机构职责记录';
comment on column RHN_SYS_ORG_RESP.ID_ORG_RESP is '机构职责主键';
comment on column RHN_SYS_ORG_RESP.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG_RESP.ID_ORG is '机构标识';
comment on column RHN_SYS_ORG_RESP.ID_STAFF_ASSIGN is '任职标识';
comment on column RHN_SYS_ORG_RESP.NA_EXT_RESPONSIBLE is '外部responsible名称';
comment on column RHN_SYS_ORG_RESP.SD_RESP_TYPE is '职责类型';
comment on column RHN_SYS_ORG_RESP.FG_PRIMARY_RESP is '是否主要职责';
comment on column RHN_SYS_ORG_RESP.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ORG_RESP.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ORG_RESP.SD_STATUS is '状态';
comment on table RHN_SYS_PARAM_CAT is '参数分类；一行代表一条参数分类记录';
comment on column RHN_SYS_PARAM_CAT.ID_PARAM_CAT is '参数分类主键';
comment on column RHN_SYS_PARAM_CAT.ID_PARAM_CAT_PARENT is '上级标识';
comment on column RHN_SYS_PARAM_CAT.CD_PARAM_CAT is '编码';
comment on column RHN_SYS_PARAM_CAT.NA_PARAM_CAT is '名称';
comment on column RHN_SYS_PARAM_CAT.DES_PARAM_CAT is '说明';
comment on column RHN_SYS_PARAM_CAT.SN_SORT is '排序医嘱';
comment on column RHN_SYS_PARAM_CAT.FG_ACTIVE is '是否有效';
comment on column RHN_SYS_PARAM_CAT.REVISION is '乐观锁修订号';
comment on column RHN_SYS_PARAM_CAT.DT_CREATED is '创建时间';
comment on column RHN_SYS_PARAM_CAT.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_PARAM_CAT.DT_UPDATED is '更新时间';
comment on column RHN_SYS_PARAM_CAT.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SYS_PARAM_CHG is '参数变更；一行代表一条参数变更记录';
comment on column RHN_SYS_PARAM_CHG.ID_PARAM_CHG is '参数变更主键';
comment on column RHN_SYS_PARAM_CHG.ID_TNT is '租户标识';
comment on column RHN_SYS_PARAM_CHG.ID_PARAM_DEF is '定义标识';
comment on column RHN_SYS_PARAM_CHG.ID_PARAM_VAL is '值标识';
comment on column RHN_SYS_PARAM_CHG.SD_TARGET_TYPE is 'target类型';
comment on column RHN_SYS_PARAM_CHG.SD_CHG_TYPE is '变更类型';
comment on column RHN_SYS_PARAM_CHG.JSON_BEFORE is '前JSON';
comment on column RHN_SYS_PARAM_CHG.JSON_AFTER is '后JSON';
comment on column RHN_SYS_PARAM_CHG.DES_CHG_REASON is '变更原因';
comment on column RHN_SYS_PARAM_CHG.CD_REQ is '请求编码';
comment on column RHN_SYS_PARAM_CHG.DT_CHANGED is '变更时间';
comment on column RHN_SYS_PARAM_CHG.ID_USER_CHANGED is '变更人标识';
comment on table RHN_SYS_PARAM_DEF is '参数定义；一行代表一条参数定义记录';
comment on column RHN_SYS_PARAM_DEF.ID_PARAM_DEF is '参数定义主键';
comment on column RHN_SYS_PARAM_DEF.ID_PARAM_CAT is '分类标识';
comment on column RHN_SYS_PARAM_DEF.CD_PARAM_KEY is '参数键';
comment on column RHN_SYS_PARAM_DEF.NA_PARAM_DEF is '名称';
comment on column RHN_SYS_PARAM_DEF.DES_PARAM_DEF is '说明';
comment on column RHN_SYS_PARAM_DEF.SD_VAL_TYPE is '值类型';
comment on column RHN_SYS_PARAM_DEF.SD_CONTROL_TYPE is 'control类型';
comment on column RHN_SYS_PARAM_DEF.JSON_SCHEMA is 'JSON模式定义';
comment on column RHN_SYS_PARAM_DEF.JSON_DEFAULT_VAL is '默认值JSON';
comment on column RHN_SYS_PARAM_DEF.JSON_EXAMPLE_VAL is 'example值JSON';
comment on column RHN_SYS_PARAM_DEF.UNIT is '单位';
comment on column RHN_SYS_PARAM_DEF.CD_DICT is '字典编码';
comment on column RHN_SYS_PARAM_DEF.JSON_SCOPE is '范围JSON';
comment on column RHN_SYS_PARAM_DEF.SD_PARAM_CAT is '参数分类';
comment on column RHN_SYS_PARAM_DEF.FG_INHERITANCE is '是否inheritanceenabled';
comment on column RHN_SYS_PARAM_DEF.FG_CACHE is '是否cacheenabled';
comment on column RHN_SYS_PARAM_DEF.FG_NULLABLE_VAL is '是否nullable值';
comment on column RHN_SYS_PARAM_DEF.SENSITIVITY is '敏感级别';
comment on column RHN_SYS_PARAM_DEF.SD_DISPLAY_POLICY is '显示策略';
comment on column RHN_SYS_PARAM_DEF.SD_STATUS is '状态';
comment on column RHN_SYS_PARAM_DEF.REVISION is '乐观锁修订号';
comment on column RHN_SYS_PARAM_DEF.DT_CREATED is '创建时间';
comment on column RHN_SYS_PARAM_DEF.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_PARAM_DEF.DT_UPDATED is '更新时间';
comment on column RHN_SYS_PARAM_DEF.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SYS_PARAM_VAL is '参数值；一行代表一条参数值记录';
comment on column RHN_SYS_PARAM_VAL.ID_PARAM_VAL is '参数值主键';
comment on column RHN_SYS_PARAM_VAL.ID_PARAM_DEF is '定义标识';
comment on column RHN_SYS_PARAM_VAL.ID_TNT is '租户标识';
comment on column RHN_SYS_PARAM_VAL.SD_SCOPE_TYPE is '范围类型';
comment on column RHN_SYS_PARAM_VAL.ID_SCOPE is '范围标识';
comment on column RHN_SYS_PARAM_VAL.SCOPE_REFERENCE is '范围参考';
comment on column RHN_SYS_PARAM_VAL.CD_SCOPE is '范围编码';
comment on column RHN_SYS_PARAM_VAL.SD_VAL_MODE is '值模式';
comment on column RHN_SYS_PARAM_VAL.JSON_VAL is '值JSON';
comment on column RHN_SYS_PARAM_VAL.SECRET_REF is '密钥ref';
comment on column RHN_SYS_PARAM_VAL.FG_ACTIVE is '是否有效';
comment on column RHN_SYS_PARAM_VAL.REVISION is '乐观锁修订号';
comment on column RHN_SYS_PARAM_VAL.DT_CREATED is '创建时间';
comment on column RHN_SYS_PARAM_VAL.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_PARAM_VAL.DT_UPDATED is '更新时间';
comment on column RHN_SYS_PARAM_VAL.ID_USER_UPDATED is '更新人标识';
comment on table RHN_SYS_PORTAL_NOTIFY is '门户通知；一行代表一条门户通知记录';
comment on column RHN_SYS_PORTAL_NOTIFY.ID_PORTAL_NOTIFY is '门户通知主键';
comment on column RHN_SYS_PORTAL_NOTIFY.ID_TNT is '租户标识';
comment on column RHN_SYS_PORTAL_NOTIFY.ID_ORG is '机构标识';
comment on column RHN_SYS_PORTAL_NOTIFY.ID_DEPT is '科室标识';
comment on column RHN_SYS_PORTAL_NOTIFY.ID_USER_RECIPIENT is 'recipient用户标识';
comment on column RHN_SYS_PORTAL_NOTIFY.SD_CAT is '分类';
comment on column RHN_SYS_PORTAL_NOTIFY.SD_SEVERITY is '严重程度';
comment on column RHN_SYS_PORTAL_NOTIFY.NA_TITLE is '标题';
comment on column RHN_SYS_PORTAL_NOTIFY.DES_MSG is '消息';
comment on column RHN_SYS_PORTAL_NOTIFY.SD_STATUS is '状态';
comment on column RHN_SYS_PORTAL_NOTIFY.ROUTE_PATH is '途径路径';
comment on column RHN_SYS_PORTAL_NOTIFY.SD_SRC_TYPE is '来源类型';
comment on column RHN_SYS_PORTAL_NOTIFY.ID_SRC is '来源标识';
comment on column RHN_SYS_PORTAL_NOTIFY.CD_DEDUP_KEY is 'dedup键';
comment on column RHN_SYS_PORTAL_NOTIFY.DT_CREATED is '创建时间';
comment on column RHN_SYS_PORTAL_NOTIFY.DT_READ is '已读时间';
comment on column RHN_SYS_PORTAL_NOTIFY.DT_ARCHIVED is 'archived时间';
comment on column RHN_SYS_PORTAL_NOTIFY.REVISION is '乐观锁修订号';
comment on table RHN_SYS_PORTAL_USER_WKSPACE is '门户用户工作台；一行代表一条门户用户工作台记录';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.ID_PORTAL_USER_WKSPACE is '门户用户工作台主键';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.ID_TNT is '租户标识';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.ID_USER is '用户标识';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.ID_ORG_DEFAULT is '默认机构标识';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.ID_DEPT_DEFAULT is '默认科室标识';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.JSON_FAVORITES is '收藏JSON';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.JSON_TABS is '标签页JSON';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.JSON_LAYOUT is '布局JSON';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.DT_UPDATED is '更新时间';
comment on column RHN_SYS_PORTAL_USER_WKSPACE.REVISION is '乐观锁修订号';
comment on table RHN_SYS_POS is '岗位；一行代表一条岗位记录';
comment on column RHN_SYS_POS.ID_POS is '岗位主键';
comment on column RHN_SYS_POS.ID_TNT is '租户标识';
comment on column RHN_SYS_POS.CD_POS is '编码';
comment on column RHN_SYS_POS.NA_POS is '名称';
comment on column RHN_SYS_POS.SD_POS_TYPE is '岗位类型';
comment on column RHN_SYS_POS.DES_DUTY_DESCRIPTION is 'duty说明';
comment on column RHN_SYS_POS.SD_STATUS is '状态';
comment on column RHN_SYS_POS.DT_CREATED is '创建时间';
comment on column RHN_SYS_POS.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_POS.DT_UPDATED is '更新时间';
comment on column RHN_SYS_POS.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SYS_POS.REVISION is '乐观锁修订号';
comment on table RHN_SYS_PRACT is '医务人员；一行代表一条医务人员记录';
comment on column RHN_SYS_PRACT.ID_PRACT is '医务人员主键';
comment on column RHN_SYS_PRACT.ID_TNT is '租户标识';
comment on column RHN_SYS_PRACT.CD_PRACT is '编码';
comment on column RHN_SYS_PRACT.NA_FULL is 'full名称';
comment on column RHN_SYS_PRACT.SD_GENDER is '性别';
comment on column RHN_SYS_PRACT.HASH_IDENT is '身份摘要';
comment on column RHN_SYS_PRACT.SD_STATUS is '状态';
comment on column RHN_SYS_PRACT.DT_CREATED is '创建时间';
comment on column RHN_SYS_PRACT.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_PRACT.DT_UPDATED is '更新时间';
comment on column RHN_SYS_PRACT.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SYS_PRACT.REVISION is '乐观锁修订号';
comment on table RHN_SYS_PRINT_JOB is '打印作业；一行代表一条打印作业记录';
comment on column RHN_SYS_PRINT_JOB.ID_PRINT_JOB is '打印作业主键';
comment on column RHN_SYS_PRINT_JOB.ID_TNT is '租户标识';
comment on column RHN_SYS_PRINT_JOB.ID_PRINT_OUTPUT is '输出标识';
comment on column RHN_SYS_PRINT_JOB.ID_PRINT_JOB_ORIGINAL is '原作业标识';
comment on column RHN_SYS_PRINT_JOB.SD_REQ_TYPE is '请求类型';
comment on column RHN_SYS_PRINT_JOB.QTY_COPIES is '份数';
comment on column RHN_SYS_PRINT_JOB.SD_STATUS is '状态';
comment on column RHN_SYS_PRINT_JOB.DT_REQUESTED is '申请时间';
comment on column RHN_SYS_PRINT_JOB.ID_USER_REQUESTED is '申请人标识';
comment on column RHN_SYS_PRINT_JOB.ID_CORRELATION is '关联标识';
comment on table RHN_SYS_PRINT_OUTPUT is '打印输出；一行代表一条打印输出记录';
comment on column RHN_SYS_PRINT_OUTPUT.ID_PRINT_OUTPUT is '打印输出主键';
comment on column RHN_SYS_PRINT_OUTPUT.ID_TNT is '租户标识';
comment on column RHN_SYS_PRINT_OUTPUT.ID_PRINT_TMPL is '模板标识';
comment on column RHN_SYS_PRINT_OUTPUT.ID_PRINT_TMPL_VER is '模板版本标识';
comment on column RHN_SYS_PRINT_OUTPUT.SD_SRC_TYPE is '来源类型';
comment on column RHN_SYS_PRINT_OUTPUT.ID_SRC is '来源标识';
comment on column RHN_SYS_PRINT_OUTPUT.SN_SRC_VER is '来源版本';
comment on column RHN_SYS_PRINT_OUTPUT.SD_DOC_TYPE is '文书类型';
comment on column RHN_SYS_PRINT_OUTPUT.ID_PAT is '患者标识';
comment on column RHN_SYS_PRINT_OUTPUT.ID_ENC is '就诊标识';
comment on column RHN_SYS_PRINT_OUTPUT.ID_ORG is '机构标识';
comment on column RHN_SYS_PRINT_OUTPUT.ID_DEPT is '科室标识';
comment on column RHN_SYS_PRINT_OUTPUT.SD_PURPOSE is '用途';
comment on column RHN_SYS_PRINT_OUTPUT.JSON_SNAP is '快照JSON';
comment on column RHN_SYS_PRINT_OUTPUT.NA_FILE is 'file名称';
comment on column RHN_SYS_PRINT_OUTPUT.SD_MEDIA_TYPE is 'media类型';
comment on column RHN_SYS_PRINT_OUTPUT.CONTENT_BASE64 is '内容base64';
comment on column RHN_SYS_PRINT_OUTPUT.CONTENT_DIGEST_ALGORITHM is '内容摘要算法';
comment on column RHN_SYS_PRINT_OUTPUT.HASH_CONTENT is '内容摘要';
comment on column RHN_SYS_PRINT_OUTPUT.DT_GENERATED is '生成时间';
comment on column RHN_SYS_PRINT_OUTPUT.ID_USER_GENERATED is '生成人标识';
comment on table RHN_SYS_ROLE_PERM_ASSIGN is '角色权限任职；一行代表一条角色权限任职记录';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.ID_ROLE_PERM_ASSIGN is '角色权限任职主键';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.ID_TNT is '租户标识';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.ID_ACC_ROLE is '角色标识';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.ID_ACC_PERM is '权限标识';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.DT_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.DT_VALID_TO is '有效结束日期';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.ID_USER_GRANTED is 'granted人标识';
comment on column RHN_SYS_ROLE_PERM_ASSIGN.DT_CREATED is '创建时间';
comment on table RHN_SYS_STAFF_ASSIGN is '员工任职；一行代表一条员工任职记录';
comment on column RHN_SYS_STAFF_ASSIGN.ID_STAFF_ASSIGN is '员工任职主键';
comment on column RHN_SYS_STAFF_ASSIGN.ID_TNT is '租户标识';
comment on column RHN_SYS_STAFF_ASSIGN.ID_EMPL is '任职标识';
comment on column RHN_SYS_STAFF_ASSIGN.ID_ORG is '机构标识';
comment on column RHN_SYS_STAFF_ASSIGN.ID_POS is '岗位标识';
comment on column RHN_SYS_STAFF_ASSIGN.CD_STAFF_ASSIGN is '编码';
comment on column RHN_SYS_STAFF_ASSIGN.SD_ASSIGN_TYPE is '任职类型';
comment on column RHN_SYS_STAFF_ASSIGN.CD_SPECIALTY is 'specialty编码';
comment on column RHN_SYS_STAFF_ASSIGN.FG_PRIMARY_ASSIGN is '是否主要任职';
comment on column RHN_SYS_STAFF_ASSIGN.WORKLOAD_PERCENT is '工作量百分比';
comment on column RHN_SYS_STAFF_ASSIGN.SD_STATUS is '状态';
comment on column RHN_SYS_STAFF_ASSIGN.DA_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_STAFF_ASSIGN.DA_VALID_TO is '有效结束日期';
comment on column RHN_SYS_STAFF_ASSIGN.DT_CREATED is '创建时间';
comment on column RHN_SYS_STAFF_ASSIGN.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_STAFF_ASSIGN.DT_UPDATED is '更新时间';
comment on column RHN_SYS_STAFF_ASSIGN.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SYS_STAFF_ASSIGN.REVISION is '乐观锁修订号';
comment on column RHN_SYS_STAFF_ASSIGN.ID_DEPT is '科室标识';
comment on table RHN_SYS_SVC_RSRC is '服务资源；一行代表一条服务资源记录';
comment on column RHN_SYS_SVC_RSRC.ID_SVC_RSRC is '服务资源主键';
comment on column RHN_SYS_SVC_RSRC.REVISION is '乐观锁修订号';
comment on column RHN_SYS_SVC_RSRC.ID_TNT is '租户标识';
comment on column RHN_SYS_SVC_RSRC.ID_ORG is '机构标识';
comment on column RHN_SYS_SVC_RSRC.ID_DEPT is '科室标识';
comment on column RHN_SYS_SVC_RSRC.ID_PRACT is '医务人员标识';
comment on column RHN_SYS_SVC_RSRC.ID_STAFF_ASSIGN is '任职标识';
comment on column RHN_SYS_SVC_RSRC.ID_CATALOG_ITEM is '目录项目标识';
comment on column RHN_SYS_SVC_RSRC.CD_RSRC is '资源编码';
comment on column RHN_SYS_SVC_RSRC.NA_RSRC is '资源名称';
comment on column RHN_SYS_SVC_RSRC.CD_SVC_SNAP is '服务编码快照';
comment on column RHN_SYS_SVC_RSRC.NA_SVC_SNAP is '服务名称快照';
comment on column RHN_SYS_SVC_RSRC.SD_STATUS is '状态';
comment on column RHN_SYS_SVC_RSRC.DT_CREATED is '创建时间';
comment on column RHN_SYS_SVC_RSRC.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_SVC_RSRC.DT_UPDATED is '更新时间';
comment on column RHN_SYS_SVC_RSRC.ID_USER_UPDATED is '更新人标识';
comment on column RHN_SYS_SVC_RSRC.SD_RSRC_TYPE is '资源类型';
comment on column RHN_SYS_SVC_RSRC.CD_RSRC_KEY is '资源键';
comment on table RHN_SYS_TNT is '租户；一行代表一条租户记录';
comment on column RHN_SYS_TNT.ID_TNT is '租户主键';
comment on column RHN_SYS_TNT.CD_TNT is '编码';
comment on column RHN_SYS_TNT.NA_TNT is '名称';
comment on column RHN_SYS_TNT.CD_TIMEZONE is '时区编码';
comment on column RHN_SYS_TNT.SD_STATUS is '状态';
comment on column RHN_SYS_TNT.DT_CREATED is '创建时间';
comment on column RHN_SYS_TNT.DT_UPDATED is '更新时间';
comment on column RHN_SYS_TNT.REVISION is '乐观锁修订号';
comment on table RHN_SYS_USER_ACCT is '用户账户；一行代表一条用户账户记录';
comment on column RHN_SYS_USER_ACCT.ID_USER is '用户账户主键';
comment on column RHN_SYS_USER_ACCT.ID_TNT is '租户标识';
comment on column RHN_SYS_USER_ACCT.ID_PRACT is '医务人员标识';
comment on column RHN_SYS_USER_ACCT.CD_USERNAME is '用户名';
comment on column RHN_SYS_USER_ACCT.HASH_PASSWORD is 'password摘要';
comment on column RHN_SYS_USER_ACCT.SD_STATUS is '状态';
comment on column RHN_SYS_USER_ACCT.DT_PASSWORD_CHANGED is 'password变更时间';
comment on column RHN_SYS_USER_ACCT.DT_LAST_LOGIN is 'lastlogin时间';
comment on column RHN_SYS_USER_ACCT.DT_CREATED is '创建时间';
comment on column RHN_SYS_USER_ACCT.DT_UPDATED is '更新时间';
comment on column RHN_SYS_USER_ACCT.REVISION is '乐观锁修订号';
comment on table RHN_SYS_USER_ROLE_ASSIGN is '用户角色任职；一行代表一条用户角色任职记录';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_USER_ROLE_ASSIGN is '用户角色任职主键';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_TNT is '租户标识';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_USER is '用户标识';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_ACC_ROLE is '角色标识';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_ORG is '机构标识';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_DEPT is '科室标识';
comment on column RHN_SYS_USER_ROLE_ASSIGN.SD_DATA_SCOPE_TYPE is '数据范围类型';
comment on column RHN_SYS_USER_ROLE_ASSIGN.DT_VALID_FROM is '有效开始日期';
comment on column RHN_SYS_USER_ROLE_ASSIGN.DT_VALID_TO is '有效结束日期';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_USER_GRANTED is 'granted人标识';
comment on column RHN_SYS_USER_ROLE_ASSIGN.DT_CREATED is '创建时间';
comment on table RHN_SYS_WORK_TASK is '工作任务；一行代表一条工作任务记录';
comment on column RHN_SYS_WORK_TASK.ID_WORK_TASK is '工作任务主键';
comment on column RHN_SYS_WORK_TASK.ID_TNT is '租户标识';
comment on column RHN_SYS_WORK_TASK.ID_ORG is '机构标识';
comment on column RHN_SYS_WORK_TASK.ID_DEPT is '科室标识';
comment on column RHN_SYS_WORK_TASK.SD_TASK_TYPE is '任务类型';
comment on column RHN_SYS_WORK_TASK.NA_TITLE is '标题';
comment on column RHN_SYS_WORK_TASK.DES_SUM is '汇总';
comment on column RHN_SYS_WORK_TASK.SD_PRIORITY is '优先级';
comment on column RHN_SYS_WORK_TASK.SD_STATUS is '状态';
comment on column RHN_SYS_WORK_TASK.SD_ASSIGNEE_TYPE is '受理人类型';
comment on column RHN_SYS_WORK_TASK.ID_USER_ASSIGNEE is '受理人标识';
comment on column RHN_SYS_WORK_TASK.ID_PAT is '患者标识';
comment on column RHN_SYS_WORK_TASK.ID_ENC is '就诊标识';
comment on column RHN_SYS_WORK_TASK.SD_SRC_TYPE is '来源类型';
comment on column RHN_SYS_WORK_TASK.ID_SRC is '来源标识';
comment on column RHN_SYS_WORK_TASK.ROUTE_PATH is '途径路径';
comment on column RHN_SYS_WORK_TASK.CD_DEDUP_KEY is 'dedup键';
comment on column RHN_SYS_WORK_TASK.DT_DUE is '到期时间';
comment on column RHN_SYS_WORK_TASK.ID_USER_CLAIMED is '认领人标识';
comment on column RHN_SYS_WORK_TASK.DT_CLAIMED is '认领时间';
comment on column RHN_SYS_WORK_TASK.ID_USER_COMPLETED is '完成人标识';
comment on column RHN_SYS_WORK_TASK.DT_COMPLETED is '完成时间';
comment on column RHN_SYS_WORK_TASK.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_WORK_TASK.DT_CREATED is '创建时间';
comment on column RHN_SYS_WORK_TASK.DT_UPDATED is '更新时间';
comment on column RHN_SYS_WORK_TASK.REVISION is '乐观锁修订号';
comment on table RHN_SYS_WORK_TASK_HIST is '工作任务历史；一行代表一条工作任务历史记录';
comment on column RHN_SYS_WORK_TASK_HIST.ID_WORK_TASK_HIST is '工作任务历史主键';
comment on column RHN_SYS_WORK_TASK_HIST.ID_TNT is '租户标识';
comment on column RHN_SYS_WORK_TASK_HIST.ID_WORK_TASK is '任务标识';
comment on column RHN_SYS_WORK_TASK_HIST.SD_ACTION is '操作';
comment on column RHN_SYS_WORK_TASK_HIST.SD_FROM_STATUS is '原状态';
comment on column RHN_SYS_WORK_TASK_HIST.SD_TO_STATUS is '目标状态';
comment on column RHN_SYS_WORK_TASK_HIST.ID_USER_ACTOR is '操作人标识';
comment on column RHN_SYS_WORK_TASK_HIST.DES_COMMENT is 'comment文本';
comment on column RHN_SYS_WORK_TASK_HIST.ID_CORRELATION is '关联标识';
comment on column RHN_SYS_WORK_TASK_HIST.DT_OCCURRED is '发生时间';
comment on table RHN_VIS_ALLERGY_INTOL is '过敏不耐受；一行代表一条过敏不耐受记录';
comment on column RHN_VIS_ALLERGY_INTOL.ID_ALLERGY_INTOL is '过敏不耐受主键';
comment on column RHN_VIS_ALLERGY_INTOL.REVISION is '乐观锁修订号';
comment on column RHN_VIS_ALLERGY_INTOL.ID_TNT is '租户标识';
comment on column RHN_VIS_ALLERGY_INTOL.ID_PAT is '患者标识';
comment on column RHN_VIS_ALLERGY_INTOL.ID_ENC is '就诊标识';
comment on column RHN_VIS_ALLERGY_INTOL.SD_ASSERTION_TYPE is 'assertion类型';
comment on column RHN_VIS_ALLERGY_INTOL.CD_CAT is '分类编码';
comment on column RHN_VIS_ALLERGY_INTOL.SD_CLIN_STATUS is '临床状态';
comment on column RHN_VIS_ALLERGY_INTOL.SD_VERIFICATION_STATUS is '验证状态';
comment on column RHN_VIS_ALLERGY_INTOL.CD_CRITICALITY is 'criticality编码';
comment on column RHN_VIS_ALLERGY_INTOL.SD_REACTION_SEVERITY is 'reaction严重程度';
comment on column RHN_VIS_ALLERGY_INTOL.SD_INFORMATION_SRC is 'information来源';
comment on column RHN_VIS_ALLERGY_INTOL.CD_SUBSTANCE_CODE_SYS_URI is '物质编码体系URI';
comment on column RHN_VIS_ALLERGY_INTOL.CD_SUBSTANCE is '物质编码';
comment on column RHN_VIS_ALLERGY_INTOL.NA_SUBSTANCE is '物质显示';
comment on column RHN_VIS_ALLERGY_INTOL.DES_REACTION is 'reaction文本';
comment on column RHN_VIS_ALLERGY_INTOL.DT_ONSET is 'onset时间';
comment on column RHN_VIS_ALLERGY_INTOL.DT_RECORDED is '记录时间';
comment on column RHN_VIS_ALLERGY_INTOL.ID_PRACT_RECORDER is '记录人医务人员标识';
comment on column RHN_VIS_ALLERGY_INTOL.ID_USER_RECORDER is '记录人用户标识';
comment on column RHN_VIS_ALLERGY_INTOL.DT_VERIFIED is '已验证时间';
comment on column RHN_VIS_ALLERGY_INTOL.ID_PRACT_VERIFIER is 'verifier医务人员标识';
comment on column RHN_VIS_ALLERGY_INTOL.DT_INACTIVATED is 'inactivated时间';
comment on column RHN_VIS_ALLERGY_INTOL.ID_USER_INACTIVATED is 'inactivated人标识';
comment on column RHN_VIS_ALLERGY_INTOL.DES_INACTIVATION_REASON is 'inactivation原因';
comment on table RHN_VIS_CARE_EPISODE is '照护周期；一行代表一条照护周期记录';
comment on column RHN_VIS_CARE_EPISODE.ID_CARE_EPISODE is '照护周期主键';
comment on column RHN_VIS_CARE_EPISODE.REVISION is '乐观锁修订号';
comment on column RHN_VIS_CARE_EPISODE.ID_TNT is '租户标识';
comment on column RHN_VIS_CARE_EPISODE.ID_PAT is '患者标识';
comment on column RHN_VIS_CARE_EPISODE.ID_ORG is '机构标识';
comment on column RHN_VIS_CARE_EPISODE.CD_EPISODE_NO is '周期编号';
comment on column RHN_VIS_CARE_EPISODE.SD_EPISODE_TYPE is '周期类型';
comment on column RHN_VIS_CARE_EPISODE.SD_STATUS is '状态';
comment on column RHN_VIS_CARE_EPISODE.DT_START is '开始时间';
comment on column RHN_VIS_CARE_EPISODE.DT_END is '结束时间';
comment on column RHN_VIS_CARE_EPISODE.ID_PRIMARY_PRACT is '主要医务人员标识';
comment on column RHN_VIS_CARE_EPISODE.DT_CREATED is '创建时间';
comment on column RHN_VIS_CARE_EPISODE.ID_USER_CREATED is '创建人标识';
comment on column RHN_VIS_CARE_EPISODE.DT_UPDATED is '更新时间';
comment on column RHN_VIS_CARE_EPISODE.ID_USER_UPDATED is '更新人标识';
comment on table RHN_VIS_CLIN_DOC is '临床文书；一行代表一条临床文书记录';
comment on column RHN_VIS_CLIN_DOC.ID_CLIN_DOC is '临床文书主键';
comment on column RHN_VIS_CLIN_DOC.ID_TNT is '租户标识';
comment on column RHN_VIS_CLIN_DOC.ID_PAT is '患者标识';
comment on column RHN_VIS_CLIN_DOC.ID_ENC is '就诊标识';
comment on column RHN_VIS_CLIN_DOC.ID_ORG is '机构标识';
comment on column RHN_VIS_CLIN_DOC.ID_DEPT is '科室标识';
comment on column RHN_VIS_CLIN_DOC.SD_DOC_TYPE is '文书类型';
comment on column RHN_VIS_CLIN_DOC.NA_TITLE is '标题';
comment on column RHN_VIS_CLIN_DOC.SD_STATUS is '状态';
comment on column RHN_VIS_CLIN_DOC.SN_CURRENT_VER is 'current版本';
comment on column RHN_VIS_CLIN_DOC.ID_USER_CREATED is '创建人标识';
comment on column RHN_VIS_CLIN_DOC.DT_CREATED is '创建时间';
comment on column RHN_VIS_CLIN_DOC.DT_UPDATED is '更新时间';
comment on column RHN_VIS_CLIN_DOC.REVISION is '乐观锁修订号';
comment on column RHN_VIS_CLIN_DOC.CD_INSTANCE_KEY is 'instance键';
comment on table RHN_VIS_CLIN_DOC_VER is '临床文书版本；一行代表一条临床文书版本记录';
comment on column RHN_VIS_CLIN_DOC_VER.ID_CLIN_DOC_VER is '临床文书版本主键';
comment on column RHN_VIS_CLIN_DOC_VER.ID_TNT is '租户标识';
comment on column RHN_VIS_CLIN_DOC_VER.ID_CLIN_DOC is '文书标识';
comment on column RHN_VIS_CLIN_DOC_VER.CD_VER_NUMBER is '版本编号';
comment on column RHN_VIS_CLIN_DOC_VER.JSON_CONTENT is '内容JSON';
comment on column RHN_VIS_CLIN_DOC_VER.JSON_CONTENT_SCHEMA is '内容模式定义';
comment on column RHN_VIS_CLIN_DOC_VER.SD_CHG_TYPE is '变更类型';
comment on column RHN_VIS_CLIN_DOC_VER.DES_CHG_REASON is '变更原因';
comment on column RHN_VIS_CLIN_DOC_VER.ID_USER_CREATED is '创建人标识';
comment on column RHN_VIS_CLIN_DOC_VER.DT_CREATED is '创建时间';
comment on column RHN_VIS_CLIN_DOC_VER.ID_USER_SIGNED is '签署人标识';
comment on column RHN_VIS_CLIN_DOC_VER.DT_SIGNED is '签署时间';
comment on column RHN_VIS_CLIN_DOC_VER.SD_SIGN_MEANING is '签名meaning';
comment on column RHN_VIS_CLIN_DOC_VER.CONTENT_DIGEST_ALGORITHM is '内容摘要算法';
comment on column RHN_VIS_CLIN_DOC_VER.HASH_CONTENT is '内容摘要';
comment on column RHN_VIS_CLIN_DOC_VER.ID_CRYPTO_EVID_INTEGRITY is 'integrity证据标识';
comment on column RHN_VIS_CLIN_DOC_VER.ID_CRYPTO_EVID_SIGN is '签名证据标识';
comment on table RHN_VIS_CRIT_VAL_ALERT is '危急值值预警；一行代表一条危急值值预警记录';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_CRIT_VAL_ALERT is '危急值值预警主键';
comment on column RHN_VIS_CRIT_VAL_ALERT.REVISION is '乐观锁修订号';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_TNT is '租户标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_ORG is '机构标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_DEPT is '科室标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_DIAG_REPORT is '报告标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_OBS is '观察标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_PAT is '患者标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_ENC is '就诊标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_CARE_REQ is '请求标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_USER_RECIPIENT is 'recipient用户标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.SD_SEVERITY is '严重程度';
comment on column RHN_VIS_CRIT_VAL_ALERT.CD_RULE is '规则编码';
comment on column RHN_VIS_CRIT_VAL_ALERT.SN_RULE_VER is '规则版本';
comment on column RHN_VIS_CRIT_VAL_ALERT.CD_OBS is '观察编码';
comment on column RHN_VIS_CRIT_VAL_ALERT.NA_OBS is '观察名称';
comment on column RHN_VIS_CRIT_VAL_ALERT.DES_TRIGGER_EVID is '触发证据';
comment on column RHN_VIS_CRIT_VAL_ALERT.SD_STATUS is '状态';
comment on column RHN_VIS_CRIT_VAL_ALERT.DT_DETECTED is 'detected时间';
comment on column RHN_VIS_CRIT_VAL_ALERT.DT_ACKNOWLEDGE_DEADLINE is 'acknowledgedeadline时间';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_USER_ACKNOWLEDGED is 'acknowledged人标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.DT_ACKNOWLEDGED is 'acknowledged时间';
comment on column RHN_VIS_CRIT_VAL_ALERT.DES_ACKNOWLEDGE_NOTE is 'acknowledge备注';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_USER_CLOSED is '关闭人标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.DT_CLOSED is '关闭时间';
comment on column RHN_VIS_CRIT_VAL_ALERT.CD_DISPOSITION is '处置方式编码';
comment on column RHN_VIS_CRIT_VAL_ALERT.DES_CLOSE_NOTE is '日结备注';
comment on column RHN_VIS_CRIT_VAL_ALERT.ID_DIAG_REPORT_SUPERSEDED is 'supersededby报告标识';
comment on column RHN_VIS_CRIT_VAL_ALERT.SD_ESCALATION_LEVEL is '升级等级';
comment on column RHN_VIS_CRIT_VAL_ALERT.DT_UPDATED is '更新时间';
comment on table RHN_VIS_CRIT_VAL_ALERT_EVT is '危急值值预警事件；一行代表一条危急值值预警事件记录';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.ID_CRIT_VAL_ALERT_EVT is '危急值值预警事件主键';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.ID_TNT is '租户标识';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.ID_CRIT_VAL_ALERT is '预警标识';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.ID_USER_ACTOR is '操作人标识';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.DES_NOTE is '备注文本';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.ID_CORRELATION is '关联标识';
comment on column RHN_VIS_CRIT_VAL_ALERT_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_VIS_ENC is '就诊；一行代表一条就诊记录';
comment on column RHN_VIS_ENC.ID_ENC is '就诊主键';
comment on column RHN_VIS_ENC.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC.ID_PAT is '患者标识';
comment on column RHN_VIS_ENC.CD_ENC_NO is '就诊编号';
comment on column RHN_VIS_ENC.ID_ORG is '机构标识';
comment on column RHN_VIS_ENC.ID_DEPT is '科室标识';
comment on column RHN_VIS_ENC.ID_CLINICIAN is 'clinician标识';
comment on column RHN_VIS_ENC.SD_STATUS is '状态';
comment on column RHN_VIS_ENC.DES_CHIEF_COMPLAINT is '主诉求';
comment on column RHN_VIS_ENC.SYSTOLIC is '收缩压';
comment on column RHN_VIS_ENC.DIASTOLIC is '舒张压';
comment on column RHN_VIS_ENC.DT_REGISTERED is 'registered时间';
comment on column RHN_VIS_ENC.DT_STARTED is '开始时间';
comment on column RHN_VIS_ENC.DT_COMPLETED is '完成时间';
comment on column RHN_VIS_ENC.REVISION is '乐观锁修订号';
comment on column RHN_VIS_ENC.ID_PAT_REG is '挂号标识';
comment on column RHN_VIS_ENC.ID_SVC_SCHED is '排班标识';
comment on column RHN_VIS_ENC.ID_APPT is '预约标识';
comment on column RHN_VIS_ENC.SD_REG_SRC is '挂号来源';
comment on column RHN_VIS_ENC.SD_VISIT_TYPE is 'visit类型';
comment on column RHN_VIS_ENC.CD_TERMINATION is 'termination编码';
comment on column RHN_VIS_ENC.DES_TERMINATION_REASON is 'termination原因';
comment on column RHN_VIS_ENC.DT_TERMINATED is 'terminated时间';
comment on column RHN_VIS_ENC.ID_USER_TERMINATED is 'terminated人标识';
comment on column RHN_VIS_ENC.SD_ENC_CLASS is '就诊class';
comment on column RHN_VIS_ENC.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_ENC.ID_SVC_LOC is '服务位置标识';
comment on table RHN_VIS_ENC_COMP_CHECK is '就诊完成核查；一行代表一条就诊完成核查记录';
comment on column RHN_VIS_ENC_COMP_CHECK.ID_ENC_COMP_CHECK is '就诊完成核查主键';
comment on column RHN_VIS_ENC_COMP_CHECK.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_COMP_CHECK.ID_ENC is '就诊标识';
comment on column RHN_VIS_ENC_COMP_CHECK.SN_EXPECTED_VER is '预期修订';
comment on column RHN_VIS_ENC_COMP_CHECK.SD_RESULT is '结果';
comment on column RHN_VIS_ENC_COMP_CHECK.CD_COMMAND is '命令编码';
comment on column RHN_VIS_ENC_COMP_CHECK.ID_PRACT is '医务人员标识';
comment on column RHN_VIS_ENC_COMP_CHECK.ID_USER is '用户标识';
comment on column RHN_VIS_ENC_COMP_CHECK.DT_CHECKED is 'checked时间';
comment on table RHN_VIS_ENC_COMP_ISSUE is '就诊完成问题；一行代表一条就诊完成问题记录';
comment on column RHN_VIS_ENC_COMP_ISSUE.ID_ENC_COMP_ISSUE is '就诊完成问题主键';
comment on column RHN_VIS_ENC_COMP_ISSUE.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_COMP_ISSUE.ID_ENC_COMP_CHECK is '完成核查标识';
comment on column RHN_VIS_ENC_COMP_ISSUE.CD_ISSUE is '问题编码';
comment on column RHN_VIS_ENC_COMP_ISSUE.SD_SEVERITY is '严重程度';
comment on column RHN_VIS_ENC_COMP_ISSUE.DES_ENC_COMP_ISSUE is '说明';
comment on table RHN_VIS_ENC_DIAG is '就诊诊断；一行代表一条就诊诊断记录';
comment on column RHN_VIS_ENC_DIAG.ID_ENC_DIAG is '就诊诊断主键';
comment on column RHN_VIS_ENC_DIAG.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_DIAG.ID_ENC is '就诊标识';
comment on column RHN_VIS_ENC_DIAG.CD_ENC_DIAG is '编码';
comment on column RHN_VIS_ENC_DIAG.NA_DISPLAY is '显示';
comment on column RHN_VIS_ENC_DIAG.SD_DIAG_TYPE is '诊断类型';
comment on column RHN_VIS_ENC_DIAG.DT_RECORDED is '记录时间';
comment on column RHN_VIS_ENC_DIAG.REVISION is '乐观锁修订号';
comment on column RHN_VIS_ENC_DIAG.CD_BUSINESS_VER_NO is '业务版本编号';
comment on column RHN_VIS_ENC_DIAG.SD_VERIFICATION_STATUS is '验证状态';
comment on column RHN_VIS_ENC_DIAG.SD_DIAG_STATUS is '诊断状态';
comment on column RHN_VIS_ENC_DIAG.DES_CLIN_NOTE is '临床备注';
comment on column RHN_VIS_ENC_DIAG.DT_UPDATED is '更新时间';
comment on column RHN_VIS_ENC_DIAG.ID_USER_UPDATED is '更新人标识';
comment on column RHN_VIS_ENC_DIAG.SD_DIAG_STAGE is '诊断阶段';
comment on column RHN_VIS_ENC_DIAG.ID_CONCEPT is '概念标识';
comment on column RHN_VIS_ENC_DIAG.CD_CODE_SYS_SNAP is '编码体系编码快照';
comment on column RHN_VIS_ENC_DIAG.CODE_SYSTEM_VERSION_SNAPSHOT is '编码体系版本快照';
comment on column RHN_VIS_ENC_DIAG.SD_DIAG_DOMAIN is '诊断领域';
comment on column RHN_VIS_ENC_DIAG.ID_DIAG_GRP is '诊断分组标识';
comment on column RHN_VIS_ENC_DIAG.JSON_MGMT_SNAP is '管理快照JSON';
comment on table RHN_VIS_ENC_DIAG_REV is '就诊诊断修订；一行代表一条就诊诊断修订记录';
comment on column RHN_VIS_ENC_DIAG_REV.ID_ENC_DIAG_REV is '就诊诊断修订主键';
comment on column RHN_VIS_ENC_DIAG_REV.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_DIAG_REV.ID_ENC_DIAG is '就诊诊断标识';
comment on column RHN_VIS_ENC_DIAG_REV.ID_ENC is '就诊标识';
comment on column RHN_VIS_ENC_DIAG_REV.CD_BUSINESS_VER_NO is '业务版本编号';
comment on column RHN_VIS_ENC_DIAG_REV.SD_CHG_TYPE is '变更类型';
comment on column RHN_VIS_ENC_DIAG_REV.SD_DIAG_TYPE is '诊断类型';
comment on column RHN_VIS_ENC_DIAG_REV.SD_VERIFICATION_STATUS is '验证状态';
comment on column RHN_VIS_ENC_DIAG_REV.SD_DIAG_STATUS is '诊断状态';
comment on column RHN_VIS_ENC_DIAG_REV.CD_CODE_SNAP is '编码快照';
comment on column RHN_VIS_ENC_DIAG_REV.NA_DISPLAY_SNAP is '显示快照';
comment on column RHN_VIS_ENC_DIAG_REV.DES_CLIN_NOTE is '临床备注';
comment on column RHN_VIS_ENC_DIAG_REV.DES_CHG_REASON is '变更原因';
comment on column RHN_VIS_ENC_DIAG_REV.ID_PRACT is '医务人员标识';
comment on column RHN_VIS_ENC_DIAG_REV.ID_USER is '用户标识';
comment on column RHN_VIS_ENC_DIAG_REV.DT_OCCURRED is '发生时间';
comment on column RHN_VIS_ENC_DIAG_REV.SD_DIAG_STAGE is '诊断阶段';
comment on column RHN_VIS_ENC_DIAG_REV.ID_CONCEPT is '概念标识';
comment on column RHN_VIS_ENC_DIAG_REV.CD_CODE_SYS_SNAP is '编码体系编码快照';
comment on column RHN_VIS_ENC_DIAG_REV.CODE_SYSTEM_VERSION_SNAPSHOT is '编码体系版本快照';
comment on column RHN_VIS_ENC_DIAG_REV.SD_DIAG_DOMAIN is '诊断领域';
comment on column RHN_VIS_ENC_DIAG_REV.ID_DIAG_GRP is '诊断分组标识';
comment on column RHN_VIS_ENC_DIAG_REV.JSON_MGMT_SNAP is '管理快照JSON';
comment on table RHN_VIS_ENC_IDENT_CHECK is '就诊身份核查；一行代表一条就诊身份核查记录';
comment on column RHN_VIS_ENC_IDENT_CHECK.ID_ENC_IDENT_CHECK is '就诊身份核查主键';
comment on column RHN_VIS_ENC_IDENT_CHECK.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_IDENT_CHECK.ID_PAT is '患者标识';
comment on column RHN_VIS_ENC_IDENT_CHECK.ID_ENC is '就诊标识';
comment on column RHN_VIS_ENC_IDENT_CHECK.SD_CHECK_SCENARIO is '核查scenario';
comment on column RHN_VIS_ENC_IDENT_CHECK.JSON_FACTOR_RESULT is '换算系数resultsJSON';
comment on column RHN_VIS_ENC_IDENT_CHECK.SD_RESULT is '结果';
comment on column RHN_VIS_ENC_IDENT_CHECK.ID_PRACT is '医务人员标识';
comment on column RHN_VIS_ENC_IDENT_CHECK.ID_USER is '用户标识';
comment on column RHN_VIS_ENC_IDENT_CHECK.CD_TERMINAL is '终端编码';
comment on column RHN_VIS_ENC_IDENT_CHECK.CD_COMMAND is '命令编码';
comment on column RHN_VIS_ENC_IDENT_CHECK.DT_OCCURRED is '发生时间';
comment on table RHN_VIS_ENC_LOC_HIST is '就诊位置历史；一行代表一条就诊位置历史记录';
comment on column RHN_VIS_ENC_LOC_HIST.ID_ENC_LOC_HIST is '就诊位置历史主键';
comment on column RHN_VIS_ENC_LOC_HIST.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_LOC_HIST.ID_ENC is '就诊标识';
comment on column RHN_VIS_ENC_LOC_HIST.ID_SVC_LOC is '位置标识';
comment on column RHN_VIS_ENC_LOC_HIST.SD_STATUS is '状态';
comment on column RHN_VIS_ENC_LOC_HIST.DT_START is '开始时间';
comment on column RHN_VIS_ENC_LOC_HIST.DT_END is '结束时间';
comment on column RHN_VIS_ENC_LOC_HIST.DES_CHG_REASON is '变更原因';
comment on column RHN_VIS_ENC_LOC_HIST.ID_USER_CHANGED is '变更人标识';
comment on table RHN_VIS_ENC_STATUS_EVT is '就诊状态事件；一行代表一条就诊状态事件记录';
comment on column RHN_VIS_ENC_STATUS_EVT.ID_ENC_STATUS_EVT is '就诊状态事件主键';
comment on column RHN_VIS_ENC_STATUS_EVT.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_STATUS_EVT.ID_ENC is '就诊标识';
comment on column RHN_VIS_ENC_STATUS_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_VIS_ENC_STATUS_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_VIS_ENC_STATUS_EVT.SN_EXPECTED_VER is '预期修订';
comment on column RHN_VIS_ENC_STATUS_EVT.ID_PRACT is '医务人员标识';
comment on column RHN_VIS_ENC_STATUS_EVT.ID_USER is '用户标识';
comment on column RHN_VIS_ENC_STATUS_EVT.ID_ORG is '机构标识';
comment on column RHN_VIS_ENC_STATUS_EVT.ID_DEPT is '科室标识';
comment on column RHN_VIS_ENC_STATUS_EVT.CD_COMMAND is '命令编码';
comment on column RHN_VIS_ENC_STATUS_EVT.DES_REASON is '原因';
comment on column RHN_VIS_ENC_STATUS_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_VIS_ENC_WORK_SESSION is '就诊工作会话；一行代表一条就诊工作会话记录';
comment on column RHN_VIS_ENC_WORK_SESSION.ID_ENC_WORK_SESSION is '就诊工作会话主键';
comment on column RHN_VIS_ENC_WORK_SESSION.REVISION is '乐观锁修订号';
comment on column RHN_VIS_ENC_WORK_SESSION.ID_TNT is '租户标识';
comment on column RHN_VIS_ENC_WORK_SESSION.ID_ENC is '就诊标识';
comment on column RHN_VIS_ENC_WORK_SESSION.ID_PRACT is '医务人员标识';
comment on column RHN_VIS_ENC_WORK_SESSION.ID_USER is '用户标识';
comment on column RHN_VIS_ENC_WORK_SESSION.CD_TERMINAL is '终端编码';
comment on column RHN_VIS_ENC_WORK_SESSION.SD_STATUS is '状态';
comment on column RHN_VIS_ENC_WORK_SESSION.DT_STARTED is '开始时间';
comment on column RHN_VIS_ENC_WORK_SESSION.DT_HEARTBEAT is 'heartbeat时间';
comment on column RHN_VIS_ENC_WORK_SESSION.DT_CLOSED is '关闭时间';
comment on column RHN_VIS_ENC_WORK_SESSION.DES_CLOSE_REASON is '日结原因';
comment on table RHN_VIS_HEALTH_EVT is '健康事件；一行代表一条健康事件记录';
comment on column RHN_VIS_HEALTH_EVT.ID_HEALTH_EVT is '健康事件主键';
comment on column RHN_VIS_HEALTH_EVT.ID_TNT is '租户标识';
comment on column RHN_VIS_HEALTH_EVT.ID_PAT is '患者标识';
comment on column RHN_VIS_HEALTH_EVT.ID_ENC is '就诊标识';
comment on column RHN_VIS_HEALTH_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_VIS_HEALTH_EVT.DES_SUM is '汇总';
comment on column RHN_VIS_HEALTH_EVT.JSON_PAYLOAD is '载荷JSON';
comment on column RHN_VIS_HEALTH_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_VIS_HEALTH_EVT.DT_RECORDED is '记录时间';
comment on column RHN_VIS_HEALTH_EVT.ID_USER_RECORDED is '记录人标识';
comment on column RHN_VIS_HEALTH_EVT.ID_SRC_EVT is '来源事件标识';
comment on column RHN_VIS_HEALTH_EVT.SN_EVT_VER is '事件版本';
comment on column RHN_VIS_HEALTH_EVT.SOURCE is '来源';
comment on column RHN_VIS_HEALTH_EVT.ID_CORRELATION is '关联标识';
comment on table RHN_VIS_INP_BED_DAY_FACT is '住院床位日事实；一行代表一条住院床位日事实记录';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_INP_BED_DAY_FACT is '住院床位日事实主键';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_ENC is '就诊标识';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_ENC_LOC_HIST is '位置历史标识';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_BED_LOC is '床位位置标识';
comment on column RHN_VIS_INP_BED_DAY_FACT.DA_BUSINESS is '业务日期';
comment on column RHN_VIS_INP_BED_DAY_FACT.CD_COMMAND is '命令编码';
comment on column RHN_VIS_INP_BED_DAY_FACT.DT_CREATED is '创建时间';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_USER_CREATED is '创建人标识';
comment on table RHN_VIS_INP_BED_OCCUP is '住院床位占用；一行代表一条住院床位占用记录';
comment on column RHN_VIS_INP_BED_OCCUP.ID_INP_BED_OCCUP is '住院床位占用主键';
comment on column RHN_VIS_INP_BED_OCCUP.REVISION is '乐观锁修订号';
comment on column RHN_VIS_INP_BED_OCCUP.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_BED_OCCUP.ID_BED_LOC is '床位位置标识';
comment on column RHN_VIS_INP_BED_OCCUP.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_BED_OCCUP.ID_ENC is '就诊标识';
comment on column RHN_VIS_INP_BED_OCCUP.ID_PAT is '患者标识';
comment on column RHN_VIS_INP_BED_OCCUP.DT_STARTED is '开始时间';
comment on table RHN_VIS_INP_BED_PROF is '住院床位档案；一行代表一条住院床位档案记录';
comment on column RHN_VIS_INP_BED_PROF.ID_SVC_LOC_BED is '床位位置标识';
comment on column RHN_VIS_INP_BED_PROF.REVISION is '乐观锁修订号';
comment on column RHN_VIS_INP_BED_PROF.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_BED_PROF.SD_BED_TYPE is '床位类型';
comment on column RHN_VIS_INP_BED_PROF.SD_GENDER_RESTRICTION is '性别限制';
comment on column RHN_VIS_INP_BED_PROF.SD_OPERATIONAL_STATUS is 'operational状态';
comment on column RHN_VIS_INP_BED_PROF.CD_NURS_GRP is '护理分组编码';
comment on column RHN_VIS_INP_BED_PROF.ID_RESPONSIBLE_NURSE is 'responsiblenurse标识';
comment on column RHN_VIS_INP_BED_PROF.PRICE_BED_DAY is 'daily床位rate';
comment on column RHN_VIS_INP_BED_PROF.DT_UPDATED is '更新时间';
comment on column RHN_VIS_INP_BED_PROF.ID_USER_UPDATED is '更新人标识';
comment on column RHN_VIS_INP_BED_PROF.ID_CATALOG_ITEM_CHARGE is '收费目录项目标识';
comment on table RHN_VIS_INP_CHART_EVT is '住院病历事件；一行代表一条住院病历事件记录';
comment on column RHN_VIS_INP_CHART_EVT.ID_INP_CHART_EVT is '住院病历事件主键';
comment on column RHN_VIS_INP_CHART_EVT.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_CHART_EVT.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_CHART_EVT.ID_ENC is '就诊标识';
comment on column RHN_VIS_INP_CHART_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_VIS_INP_CHART_EVT.ID_SVC_LOC_SRC is '来源位置标识';
comment on column RHN_VIS_INP_CHART_EVT.NA_SRC_LOC is '来源位置名称';
comment on column RHN_VIS_INP_CHART_EVT.ID_SVC_LOC_TARGET is 'target位置标识';
comment on column RHN_VIS_INP_CHART_EVT.NA_TARGET_LOC is 'target位置名称';
comment on column RHN_VIS_INP_CHART_EVT.CD_COMMAND is '命令编码';
comment on column RHN_VIS_INP_CHART_EVT.DES_DISPLAY is '显示文本';
comment on column RHN_VIS_INP_CHART_EVT.DES_NOTE is '备注';
comment on column RHN_VIS_INP_CHART_EVT.DT_OCCURRED is '发生时间';
comment on column RHN_VIS_INP_CHART_EVT.ID_USER_RECORDED is '记录人标识';
comment on column RHN_VIS_INP_CHART_EVT.DT_RECORDED is '记录时间';
comment on table RHN_VIS_INP_EPISODE_DETAIL is '住院周期明细；一行代表一条住院周期明细记录';
comment on column RHN_VIS_INP_EPISODE_DETAIL.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_EPISODE_DETAIL.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_ADMISSION_TYPE is '入院类型编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_ADMISSION_SRC is '入院来源编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.ID_SVC_LOC_ADMISSION is '入院位置标识';
comment on column RHN_VIS_INP_EPISODE_DETAIL.DES_ADMISSION_REASON is '入院原因';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_DISCHARGE_DISPOSITION is 'discharge处置方式编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.ID_SVC_LOC_DISCHARGE is 'discharge位置标识';
comment on column RHN_VIS_INP_EPISODE_DETAIL.DES_DISCHARGE_NOTE is 'discharge备注';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_NURS_LEVEL is '护理等级编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_DIET is 'diet编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_BED_SNAP is '床位no快照';
comment on column RHN_VIS_INP_EPISODE_DETAIL.ID_RESPONSIBLE_NURSE is 'responsiblenurse标识';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_ADMISSION_METHOD is '入院方法编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_COND is '健康问题编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.CD_PAY_METHOD is '支付方法编码';
comment on column RHN_VIS_INP_EPISODE_DETAIL.NA_REFER_ORG is '转诊机构名称';
comment on column RHN_VIS_INP_EPISODE_DETAIL.NA_EMERGENCY_CONTACT is 'emergency联系方式名称';
comment on column RHN_VIS_INP_EPISODE_DETAIL.EMERGENCY_CONTACT_RELATIONSHIP is 'emergency联系方式relationship';
comment on column RHN_VIS_INP_EPISODE_DETAIL.EMERGENCY_CONTACT_PHONE is 'emergency联系方式电话';
comment on column RHN_VIS_INP_EPISODE_DETAIL.DES_ADMISSION_NOTE is '入院备注';
comment on table RHN_VIS_INP_EVT is '住院事件；一行代表一条住院事件记录';
comment on column RHN_VIS_INP_EVT.ID_INP_EVT is '住院事件主键';
comment on column RHN_VIS_INP_EVT.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_EVT.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_EVT.ID_ENC is '就诊标识';
comment on column RHN_VIS_INP_EVT.SD_EVT_TYPE is '事件类型';
comment on column RHN_VIS_INP_EVT.SD_STATUS_FROM is '状态原';
comment on column RHN_VIS_INP_EVT.SD_STATUS_TO is '状态目标';
comment on column RHN_VIS_INP_EVT.ID_SVC_LOC_SRC is '来源位置标识';
comment on column RHN_VIS_INP_EVT.ID_SVC_LOC_TARGET is 'target位置标识';
comment on column RHN_VIS_INP_EVT.CD_COMMAND is '命令编码';
comment on column RHN_VIS_INP_EVT.DES_REASON is '原因';
comment on column RHN_VIS_INP_EVT.ID_ACTOR is '操作人标识';
comment on column RHN_VIS_INP_EVT.DT_OCCURRED is '发生时间';
comment on table RHN_VIS_INP_NURS_RECORD is '住院护理记录；一行代表一条住院护理记录记录';
comment on column RHN_VIS_INP_NURS_RECORD.ID_INP_NURS_RECORD is '住院护理记录主键';
comment on column RHN_VIS_INP_NURS_RECORD.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_NURS_RECORD.ID_ORG is '机构标识';
comment on column RHN_VIS_INP_NURS_RECORD.ID_DEPT is '科室标识';
comment on column RHN_VIS_INP_NURS_RECORD.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_NURS_RECORD.ID_ENC is '就诊标识';
comment on column RHN_VIS_INP_NURS_RECORD.ID_PAT is '患者标识';
comment on column RHN_VIS_INP_NURS_RECORD.DT_OCCURRED is '发生时间';
comment on column RHN_VIS_INP_NURS_RECORD.SD_RECORD_TYPE is '记录类型';
comment on column RHN_VIS_INP_NURS_RECORD.JSON_CONTENT is '内容JSON';
comment on column RHN_VIS_INP_NURS_RECORD.JSON_OBS_SUM is '观察汇总JSON';
comment on column RHN_VIS_INP_NURS_RECORD.JSON_CONTENT_SCHEMA is '内容模式定义';
comment on column RHN_VIS_INP_NURS_RECORD.CD_COMMAND is '命令编码';
comment on column RHN_VIS_INP_NURS_RECORD.HASH_REQ is '请求摘要';
comment on column RHN_VIS_INP_NURS_RECORD.ID_RECORDED_BY_SUBJECT is '记录by主体标识';
comment on column RHN_VIS_INP_NURS_RECORD.ID_RECORDED_BY_PRACT is '记录by医务人员标识';
comment on column RHN_VIS_INP_NURS_RECORD.NA_RECORDER is '记录人名称';
comment on column RHN_VIS_INP_NURS_RECORD.DT_RECORDED is '记录时间';
comment on column RHN_VIS_INP_NURS_RECORD.CONTENT_DIGEST_ALGORITHM is '内容摘要算法';
comment on column RHN_VIS_INP_NURS_RECORD.HASH_CONTENT is '内容摘要';
comment on column RHN_VIS_INP_NURS_RECORD.ID_CRYPTO_EVID_INTEGRITY is 'integrity证据标识';
comment on column RHN_VIS_INP_NURS_RECORD.JSON_ASSESSMENT is '评估JSON';
comment on table RHN_VIS_INP_OBS is '住院观察；一行代表一条住院观察记录';
comment on column RHN_VIS_INP_OBS.ID_INP_OBS is '住院观察主键';
comment on column RHN_VIS_INP_OBS.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_OBS.ID_INP_OBS_GRP is '观察分组标识';
comment on column RHN_VIS_INP_OBS.CD_OBS is '观察编码';
comment on column RHN_VIS_INP_OBS.DT_OBSERVED is 'observed时间';
comment on column RHN_VIS_INP_OBS.CD_VAL_NUMBER is '值编号';
comment on column RHN_VIS_INP_OBS.CD_UNIT is '单位编码';
comment on column RHN_VIS_INP_OBS.CD_BODY_SITE is '身体部位库房编码';
comment on table RHN_VIS_INP_OBS_GRP is '住院观察分组；一行代表一条住院观察分组记录';
comment on column RHN_VIS_INP_OBS_GRP.ID_INP_OBS_GRP is '住院观察分组主键';
comment on column RHN_VIS_INP_OBS_GRP.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_OBS_GRP.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_OBS_GRP.ID_ENC is '就诊标识';
comment on column RHN_VIS_INP_OBS_GRP.DT_MEASURED is 'measured时间';
comment on column RHN_VIS_INP_OBS_GRP.SD_SRC_TYPE is '来源类型';
comment on column RHN_VIS_INP_OBS_GRP.CD_COMMAND is '命令编码';
comment on column RHN_VIS_INP_OBS_GRP.DES_NOTE is '备注';
comment on column RHN_VIS_INP_OBS_GRP.ID_USER_RECORDED is '记录人标识';
comment on column RHN_VIS_INP_OBS_GRP.DT_RECORDED is '记录时间';
comment on table RHN_VIS_INP_SHIFT_HANDOFF is '住院班次交接；一行代表一条住院班次交接记录';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.ID_INP_SHIFT_HANDOFF is '住院班次交接主键';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.REVISION is '乐观锁修订号';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.ID_ORG is '机构标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.ID_DEPT is '科室标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.DT_SHIFT_FROM is '班次开始日期';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.DT_SHIFT_TO is '班次结束日期';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.DES_WARD_SUM is '病区汇总';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.JSON_GENERAL_ITEM is '通用itemsJSON';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.SD_STATUS is '状态';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.CD_CREATE_COMMAND is 'create命令编码';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.HASH_CREATE_REQ is 'create请求摘要';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.ID_CREATED_BY_SUBJECT is '创建by主体标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.ID_CREATED_BY_PRACT is '创建by医务人员标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.NA_CREATOR is 'creator名称';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.DT_CREATED is '创建时间';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.DT_UPDATED is '更新时间';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.JSON_CONTENT_SCHEMA is '内容模式定义';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.CONTENT_DIGEST_ALGORITHM is '内容摘要算法';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.HASH_CONTENT is '内容摘要';
comment on column RHN_VIS_INP_SHIFT_HANDOFF.ID_CRYPTO_EVID_INTEGRITY is 'integrity证据标识';
comment on table RHN_VIS_INP_SHIFT_HANDOFF_ITEM is '住院班次交接项目；一行代表一条住院班次交接项目记录';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.ID_INP_SHIFT_HANDOFF_ITEM is '住院班次交接项目主键';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.ID_INP_SHIFT_HANDOFF is '交接标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.ID_CARE_EPISODE is '周期标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.ID_ENC is '就诊标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.ID_PAT is '患者标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.NA_PAT_SNAP is '患者名称快照';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.CD_BED_SNAP is '床位no快照';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.DES_SITUATION is '情况';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.JSON_PENDING_ACTIONS is '待办操作JSON';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.JSON_RISK_FLAGS is 'risk标志JSON';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_ITEM.SN_SORT is '排序医嘱';
comment on table RHN_VIS_INP_SHIFT_HANDOFF_SIGN is '住院班次交接签名；一行代表一条住院班次交接签名记录';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.ID_INP_SHIFT_HANDOFF_SIGN is '住院班次交接签名主键';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.ID_TNT is '租户标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.ID_INP_SHIFT_HANDOFF is '交接标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.SD_STAGE is '阶段';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.SD_SIGN_MEANING is '签名meaning';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.ID_SIGNER_SUBJECT is '签署人主体标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.ID_SIGNER_PRACT is '签署人医务人员标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.NA_SIGNER is '签署人名称';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.DT_SIGNED is '签署时间';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.ID_CRYPTO_EVID_SIGN is '签名证据标识';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.CD_COMMAND is '命令编码';
comment on column RHN_VIS_INP_SHIFT_HANDOFF_SIGN.HASH_REQ is '请求摘要';
comment on table RHN_VIS_OBS is '观察；一行代表一条观察记录';
comment on column RHN_VIS_OBS.ID_OBS is '观察主键';
comment on column RHN_VIS_OBS.ID_TNT is '租户标识';
comment on column RHN_VIS_OBS.ID_PAT is '患者标识';
comment on column RHN_VIS_OBS.ID_ENC is '就诊标识';
comment on column RHN_VIS_OBS.CODE_SYSTEM_URI is '编码体系URI';
comment on column RHN_VIS_OBS.CD_CODE_RELEASE is '编码release';
comment on column RHN_VIS_OBS.CD_OBS is '观察编码';
comment on column RHN_VIS_OBS.NA_OBS is '观察名称';
comment on column RHN_VIS_OBS.SD_STATUS is '状态';
comment on column RHN_VIS_OBS.SD_VAL_TYPE is '值类型';
comment on column RHN_VIS_OBS.DT_EFFECTIVE is '生效时间';
comment on column RHN_VIS_OBS.VALUE_STRING is '值string';
comment on column RHN_VIS_OBS.CD_VAL_NUMBER is '值编号';
comment on column RHN_VIS_OBS.FG_VAL_BOOLEAN is '是否值boolean';
comment on column RHN_VIS_OBS.CD_VAL is '值编码';
comment on column RHN_VIS_OBS.DT_VAL_DATETIME is '值datetime';
comment on column RHN_VIS_OBS.CD_UNIT is '单位编码';
comment on column RHN_VIS_OBS.REFERENCE_RANGE_LOW is '参考范围下限';
comment on column RHN_VIS_OBS.REFERENCE_RANGE_HIGH is '参考范围上限';
comment on column RHN_VIS_OBS.CD_INTERPRETATION is 'interpretation编码';
comment on column RHN_VIS_OBS.CD_PERFORMER is '执行人编码';
comment on column RHN_VIS_OBS.NA_PERFORMER is '执行人名称';
comment on column RHN_VIS_OBS.DT_CREATED is '创建时间';
comment on table RHN_VIS_SVC_LOC is '服务位置；一行代表一条服务位置记录';
comment on column RHN_VIS_SVC_LOC.ID_SVC_LOC is '服务位置主键';
comment on column RHN_VIS_SVC_LOC.REVISION is '乐观锁修订号';
comment on column RHN_VIS_SVC_LOC.ID_TNT is '租户标识';
comment on column RHN_VIS_SVC_LOC.ID_ORG is '机构标识';
comment on column RHN_VIS_SVC_LOC.ID_DEPT is '科室标识';
comment on column RHN_VIS_SVC_LOC.ID_SVC_LOC_PARENT is '上级标识';
comment on column RHN_VIS_SVC_LOC.CD_SVC_LOC is '编码';
comment on column RHN_VIS_SVC_LOC.NA_SVC_LOC is '名称';
comment on column RHN_VIS_SVC_LOC.SD_LOC_TYPE is '位置类型';
comment on column RHN_VIS_SVC_LOC.SN_SORT is '排序医嘱';
comment on column RHN_VIS_SVC_LOC.SD_STATUS is '状态';
comment on column RHN_VIS_SVC_LOC.DA_VALID_FROM is '有效开始日期';
comment on column RHN_VIS_SVC_LOC.DA_VALID_TO is '有效结束日期';
comment on column RHN_VIS_SVC_LOC.DT_CREATED is '创建时间';
comment on column RHN_VIS_SVC_LOC.ID_USER_CREATED is '创建人标识';
comment on column RHN_VIS_SVC_LOC.DT_UPDATED is '更新时间';
comment on column RHN_VIS_SVC_LOC.ID_USER_UPDATED is '更新人标识';
