-- 项目＋单部位检索复用现有名称/拼音前缀索引，目标为已维护的检查部位方式。
alter table RHN_BD_SEARCH_ENTRY drop constraint CK_BD_SEARCH_ENTRY_TARGET;
alter table RHN_BD_SEARCH_ENTRY add constraint CK_BD_SEARCH_ENTRY_TARGET check (
    SD_TARGET_TYPE in ('CONCEPT', 'MEDICATION', 'CATALOG_ITEM', 'ITEM_GROUP', 'SERVICE_VARIANT')
);
