-- =============================================================================
-- Outpatient Prescription Inventory Freeze Tracking Table
-- =============================================================================

create table RHN_SUP_RX_INV_FREEZE (
    ID_RX_INV_FREEZE bigint not null,
    ID_TNT bigint not null,
    ID_RX bigint not null,
    ID_CARE_REQ bigint not null,
    ID_STOCK_SITE bigint not null,
    ID_STOCK_BIN bigint not null,
    ID_STOCK_ITEM bigint not null,
    ID_STOCK_LOT bigint not null,
    QTY_FROZEN numeric(28, 8) not null,
    CD_BASE_UNIT varchar(64) not null,
    SD_STATUS varchar(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    DT_RELEASED timestamp with time zone,
    ID_USER_RELEASED bigint,
    DES_RELEASE_REASON varchar(1000),
    constraint PK_SUP_RX_INV_FREEZE primary key (ID_RX_INV_FREEZE)
);

create index IDX_SUP_RX_INV_FREEZE_RX on RHN_SUP_RX_INV_FREEZE (ID_TNT, ID_RX, SD_STATUS);
