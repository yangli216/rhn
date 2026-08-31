-- Separate prescription review from outpatient dispensing and default it to disabled.
insert into parameter_categories values (
    362387869794040, null, 'PHARMACY', '药事管理',
    '药房发药、处方审方和药学服务等业务策略', 35, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);
insert into parameter_categories values (
    362387869794041, 362387869794040, 'PHARMACY_PRESCRIPTION_REVIEW', '处方审方',
    '控制处方审方是否启用及其发生在发药前或发药后', 10, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795040, 362387869794041,
    'pharmacy.prescription-review.mode', '处方审方模式',
    '默认不启用；可按平台、租户、机构或科室切换为事前审方或事后审方',
    'STRING', 'SELECT',
    '{"type":"string","enum":["DISABLED","PRE_DISPENSE","POST_DISPENSE"]}',
    '"DISABLED"', '"PRE_DISPENSE"', null, 'SC_PRESCRIPTION_REVIEW_MODE',
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_changes (
    id, tenant_id, definition_id, value_id, target_type, change_type,
    before_json, after_json, change_reason, request_code, changed_at, changed_by
) values (
    362387869796040, null, 362387869795040, null, 'DEFINITION', 'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"pharmacy.prescription-review.mode","status":"ACTIVE"}',
    '初始化处方审方模式参数', 'baseline-v119:pharmacy.prescription-review.mode',
    current_timestamp, 362387869790222
);

-- The new product baseline is review-disabled. Release legacy tasks that only waited for the old mandatory review.
update dispense_task_lines line
   set status = 'READY'
 where status = 'PENDING'
   and exists (
       select 1 from dispense_tasks task
        where task.tenant_id = line.tenant_id
          and task.id = line.task_id
          and task.status = 'PENDING_REVIEW'
          and task.latest_review_id is null
   );
update dispense_tasks
   set status = 'READY_TO_PICK'
 where status = 'PENDING_REVIEW'
   and latest_review_id is null;
