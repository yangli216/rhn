-- 门诊“取消发药”以 CANCEL 事件留痕并冲回原发药库存；原约束未包含该类型，取消发药无法落库。
alter table RHN_SUP_MED_DISP drop constraint CK_SUP_MED_DISP_MED_DISP_TYPE;
alter table RHN_SUP_MED_DISP add constraint CK_SUP_MED_DISP_MED_DISP_TYPE
    check (SD_DISP_TYPE in ('DISPENSE', 'RETURN', 'REDISPENSE', 'CANCEL'));
