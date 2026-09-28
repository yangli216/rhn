insert into RHN_BD_EXAM_SVC (
    ID_CATALOG_ITEM, ID_TNT, SD_EXAM_TYPE, FG_BODY_SITE_RQD, FG_MULTI_BODY_SITE,
    QTY_MAX_BODY_SITE, DES_PREP_DESCR, REVISION, DT_CREATED, ID_USER_CREATED,
    DT_UPDATED, ID_USER_UPDATED, SD_SITE_PRICING_MODE, QTY_INCLD_SITE,
    PRICE_ADDL_SITE, ID_CATALOG_ITEM_ADDL_SITE, QTY_ADDL_SITE, QTY_MAX_CHGBL_SITE
)
select
    s.ID_CATALOG_ITEM, s.ID_TNT, s.SD_EXAM_TYPE,
    1,
    case when s.QTY_MAX_BODY_SITE is not null and s.QTY_MAX_BODY_SITE > 1 then 1 else 0 end,
    s.QTY_MAX_BODY_SITE, s.DES_ATTN, 0, current_timestamp, null,
    current_timestamp, null, 'SINGLE', 1, null, null, 1.0, s.QTY_MAX_BODY_SITE
from RHN_BD_SVC_ITEM s
where s.SD_SVC_TYPE = 'EXAMINATION'
  and not exists (
      select 1 from RHN_BD_EXAM_SVC e where e.ID_CATALOG_ITEM = s.ID_CATALOG_ITEM
  );

insert into RHN_BD_LAB_SVC (
    ID_CATALOG_ITEM, ID_TNT, SD_LAB_METHOD, QTY_REPORT_DUR, REPORT_DUR_UNIT,
    FG_FASTING_RQD, FG_POINT_OF_CARE, DES_COLL_DESCR, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED
)
select
    s.ID_CATALOG_ITEM, s.ID_TNT, null, null, null,
    0, 0, s.DES_ATTN, 0,
    current_timestamp, null, current_timestamp, null
from RHN_BD_SVC_ITEM s
where s.SD_SVC_TYPE = 'LABORATORY'
  and not exists (
      select 1 from RHN_BD_LAB_SVC l where l.ID_CATALOG_ITEM = s.ID_CATALOG_ITEM
  );
