-- Medical insurance is a settlement responsibility/allocation flow, not a patient payment instrument.
update dictionary_items
   set status = 'INACTIVE'
 where id = 362387869852105
   and dictionary_id = 362387869852001
   and code = 'MEDICAL_INSURANCE';

update dictionary_item_attribute_values
   set status = 'INACTIVE',
       updated_at = current_timestamp,
       updated_by = 362387869790222
 where dictionary_item_id = 362387869852105
   and status = 'ACTIVE';

update dictionary_definitions
   set revision = revision + 1,
       updated_at = current_timestamp,
       updated_by = 362387869790222
 where id = 362387869852001;

insert into dictionary_changes (
    id, tenant_id, dictionary_id, item_id, change_type, target_type,
    before_json, after_json, reason, request_code, changed_at, changed_by, category_id
) values (
    362387869899901, null, 362387869852001, 362387869852105,
    'DISABLE_ITEM', 'ITEM',
    '{"code":"MEDICAL_INSURANCE","name":"医保支付","status":"ACTIVE"}',
    '{"code":"MEDICAL_INSURANCE","name":"医保支付","status":"INACTIVE"}',
    '医保是结算类型及资金来源，不属于患者支付方式',
    'baseline-v120:separate-insurance-settlement', current_timestamp, 362387869790222,
    362387869840010
);
