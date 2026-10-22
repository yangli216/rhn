-- RHN Link（健域端联）工作站打印：设备新增 DESKTOP_LINK 通道（NA_QUEUE 保存工作站系统打印机名），
-- 投递新增“已下发待回执”“结果不确定”状态，并记录工作站持久调用编码、实际打印机与系统队列作业号。
alter table RHN_META_PRINT_DEVICE drop constraint CK_META_PRINT_DEVICE_CHANNEL;
alter table RHN_META_PRINT_DEVICE add constraint CK_META_PRINT_DEVICE_CHANNEL
    check (SD_CHANNEL in ('BROWSER_PDF','LOCAL_BRIDGE','DESKTOP_LINK'));
alter table RHN_SYS_PRINT_DELIVERY drop constraint CK_SYS_PRINT_DELIVERY_CHANNEL;
alter table RHN_SYS_PRINT_DELIVERY add constraint CK_SYS_PRINT_DELIVERY_CHANNEL
    check (SD_CHANNEL in ('BROWSER_PDF','LOCAL_BRIDGE','DESKTOP_LINK'));
alter table RHN_SYS_PRINT_DELIVERY drop constraint CK_SYS_PRINT_DELIVERY_STATUS;
alter table RHN_SYS_PRINT_DELIVERY add constraint CK_SYS_PRINT_DELIVERY_STATUS
    check (SD_STATUS in ('GENERATED','QUEUED','DISPATCHED','SENT','UNCERTAIN','DEVICE_CONFIRMED','FAILED','CANCELLED'));
alter table RHN_SYS_PRINT_DELIVERY add CD_DESKTOP_OPER varchar(36);
alter table RHN_SYS_PRINT_DELIVERY add NA_DESKTOP_PRINTER varchar(256);
alter table RHN_SYS_PRINT_DELIVERY add CD_EXT_PRINT_JOB_NO varchar(20);
comment on column RHN_SYS_PRINT_DELIVERY.CD_DESKTOP_OPER is '工作站持久调用操作编码';
comment on column RHN_SYS_PRINT_DELIVERY.NA_DESKTOP_PRINTER is '工作站实际打印机名称';
comment on column RHN_SYS_PRINT_DELIVERY.CD_EXT_PRINT_JOB_NO is '工作站系统打印队列作业号';
