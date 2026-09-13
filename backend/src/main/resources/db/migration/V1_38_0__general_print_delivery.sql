alter table RHN_SYS_PRINT_DELIVERY alter column ID_PRINT_BATCH drop not null;

comment on column RHN_SYS_PRINT_DELIVERY.ID_PRINT_BATCH is '打印批次标识；单份处方、病历或申请单投递时为空';
