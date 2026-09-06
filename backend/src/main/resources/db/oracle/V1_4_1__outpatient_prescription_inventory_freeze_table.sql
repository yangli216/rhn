-- =============================================================================
-- Outpatient Prescription Inventory Freeze Tracking Table
-- =============================================================================

create table RHN_SUP_RX_INV_FREEZE (
    ID_RX_INV_FREEZE number(19) not null,
    ID_TNT number(19) not null,
    ID_RX number(19) not null,
    ID_CARE_REQ number(19) not null,
    ID_STOCK_SITE number(19) not null,
    ID_STOCK_BIN number(19) not null,
    ID_STOCK_ITEM number(19) not null,
    ID_STOCK_LOT number(19) not null,
    QTY_FROZEN number(28, 8) not null,
    CD_BASE_UNIT varchar2(64) not null,
    SD_STATUS varchar2(32) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19) not null,
    DT_RELEASED timestamp with time zone,
    ID_USER_RELEASED number(19),
    DES_RELEASE_REASON varchar2(1000),
    constraint PK_SUP_RX_INV_FREEZE primary key (ID_RX_INV_FREEZE)
);

create index IDX_SUP_RX_INV_FREEZE_RX on RHN_SUP_RX_INV_FREEZE (ID_TNT, ID_RX, SD_STATUS);
