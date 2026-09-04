-- Oracle variant of db/migration/V130.
insert into parameter_categories values (
    362387869794050, null, 'BILLING', '收费与结算',
    '门诊收费、住院结算、预交金与退费等财务业务策略', 30, 1, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
)
/
insert into parameter_categories values (
    362387869794051, 362387869794050, 'BILLING_REFUND', '退费与防损策略',
    '控制未发药未执行医嘱直接退费与退费协同审批防损策略', 10, 1, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
)
/

insert into parameter_definitions values (
    362387869795050, 362387869794051,
    'billing.refund.unexecuted-direct-refund.enabled', '未发药未执行医嘱允许直接退费',
    '默认启用；启用后未发药且未执行的处方/检查申请单允许收费处直接发起原路退费并自动取消下游履约任务；关闭时需开单医生先作废单据',
    'BOOLEAN', 'SWITCH',
    '{"type":"boolean"}',
    'true', 'false', null, null,
    '["PLATFORM","TENANT","ORGANIZATION"]', 'BUSINESS', 1, 1, 0,
    'NORMAL', 'PLAIN', 'ACTIVE', 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
)
/

insert into parameter_changes (
    id, tenant_id, definition_id, value_id, target_type, change_type,
    before_json, after_json, change_reason, request_code, changed_at, changed_by
) values (
    362387869796050, null, 362387869795050, null, 'DEFINITION', 'CREATE', null,
    to_clob('{"source":"PRODUCT_BASELINE","key":"billing.refund.unexecuted-direct-refund.enabled","status":"ACTIVE"}'),
    '初始化未发药未执行医嘱直接退费参数', 'baseline-v130:billing.refund.unexecuted-direct-refund.enabled',
    current_timestamp, 362387869790222
)
/
