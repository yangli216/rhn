-- Governed, hot-reloadable clinical AI policy with encrypted provider credentials.

insert into RHN_SYS_MGMT_MOD (
    ID_MGMT_MOD, ID_TNT, ID_MGMT_MOD_PARENT, CD_MGMT_MOD, NA_MGMT_MOD, SD_MOD_TYPE,
    ROUTE_PATH, CD_COMP, CD_ICON, SN_SORT, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION
) values (
    362387869896028, 362387869790209, 362387869896017, 'AI_CONFIGURATION', 'AI助理配置', 'MODULE',
    '/settings/ai-assistant', 'AiConfigurationManagement', 'clinical', 66, 'ACTIVE',
    current_timestamp, current_timestamp, 0
);

insert into RHN_SYS_ACC_ROLE (
    ID_ACC_ROLE, ID_TNT, CD_ACC_ROLE, NA_ACC_ROLE, SD_ROLE_TYPE, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION
) values (
    362387869896141, 362387869790209, 'AI_CONFIG_ADMIN', 'AI配置管理员', 'ADMIN', 'ACTIVE',
    current_timestamp, current_timestamp, 0
);

insert into RHN_SYS_ACC_PERM (
    ID_ACC_PERM, ID_TNT, ID_MGMT_MOD, CD_ACC_PERM, NA_ACC_PERM, CD_ACTION, CD_RSRC, SD_STATUS
) values (
    362387869896160, 362387869790209, 362387869896028, 'AI_CONFIGURATION.MANAGE',
    '维护AI助理配置', 'MANAGE', 'AI_CONFIGURATION', 'ACTIVE'
);

insert into RHN_SYS_USER_ROLE_ASSIGN (
    ID_USER_ROLE_ASSIGN, ID_TNT, ID_USER, ID_ACC_ROLE, ID_ORG, ID_DEPT, SD_DATA_SCOPE_TYPE,
    DT_VALID_FROM, DT_VALID_TO, ID_USER_GRANTED, DT_CREATED
) values (
    362387869896260, 362387869790209, 362387869790222, 362387869896141, null, null, 'TENANT',
    current_timestamp, null, 362387869790222, current_timestamp
);

insert into RHN_SYS_ROLE_PERM_ASSIGN (
    ID_ROLE_PERM_ASSIGN, ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM, DT_VALID_TO,
    ID_USER_GRANTED, DT_CREATED
) values (
    362387869896261, 362387869790209, 362387869896141, 362387869896160,
    current_timestamp, null, 362387869790222, current_timestamp
);

insert into RHN_SYS_PARAM_CAT (
    ID_PARAM_CAT, ID_PARAM_CAT_PARENT, CD_PARAM_CAT, NA_PARAM_CAT, DES_PARAM_CAT, SN_SORT,
    FG_ACTIVE, REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED
) values (
    362387869794070, null, 'CLINICAL_AI', 'AI辅助诊疗',
    '模型辅助诊疗的运行模式、模型连接、生成限制、能力开关与灰度策略', 27,
    true, 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHERITANCE, FG_CACHE, FG_NULLABLE_VAL,
    SENSITIVITY, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED
) values
    (362387869795090, 362387869794070, 'ai.clinical.mode', 'AI运行模式',
     'DISABLED关闭；LOCAL_ASSIST仅启用确定性本地规则；MODEL调用服务端模型网关',
     'STRING', 'TEXT', '{"type":"string","enum":["DISABLED","LOCAL_ASSIST","MODEL"]}', null, '"LOCAL_ASSIST"',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795091, 362387869794070, 'ai.clinical.model', '临床模型标识',
     '发送给当前 OpenAI-compatible 模型服务的模型标识',
     'STRING', 'TEXT', '{"type":"string","minLength":1,"maxLength":200}', null, '"clinical-model"',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795092, 362387869794070, 'ai.clinical.request-timeout-seconds', '模型请求超时',
     '模型、语音和知识服务单次请求的最长等待时间',
     'NUMBER', 'NUMBER', '{"type":"integer","minimum":5,"maximum":120}', null, '45',
     's', null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795093, 362387869794070, 'ai.clinical.max-output-tokens', '最大输出Token',
     '单次临床建议允许模型返回的最大Token数',
     'NUMBER', 'NUMBER', '{"type":"integer","minimum":512,"maximum":8000}', null, '3000',
     'token', null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795094, 362387869794070, 'ai.clinical.suggestion-ttl-minutes', '建议有效期',
     'AI建议生成后允许医生采纳的最长时间；临床上下文变化仍会立即使建议失效',
     'NUMBER', 'NUMBER', '{"type":"integer","minimum":5,"maximum":240}', null, '30',
     'min', null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795095, 362387869794070, 'ai.clinical.rollout-percentage', '医生灰度比例',
     '在部署白名单内按执业人员稳定分桶启用AI能力的比例',
     'NUMBER', 'NUMBER', '{"type":"integer","minimum":0,"maximum":100}', null, '10',
     '%', null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795096, 362387869794070, 'ai.clinical.voice-enabled', '启用语音转写',
     '控制当前作用域是否开放服务端语音转写；仍要求语音端点有效',
     'BOOLEAN', 'SWITCH', '{"type":"boolean"}', null, 'true',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795097, 362387869794070, 'ai.clinical.voice-max-audio-mb', '单次录音上限',
     '浏览器上传到服务端进行转写的单个音频文件大小上限',
     'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":20}', null, '20',
     'MB', null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795098, 362387869794070, 'ai.clinical.knowledge-enabled', '启用医学知识检索',
     '控制当前作用域是否开放可追溯医学知识检索；仍要求知识服务端点有效',
     'BOOLEAN', 'SWITCH', '{"type":"boolean"}', null, 'true',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795099, 362387869794070, 'ai.clinical.knowledge-max-results', '知识检索结果上限',
     '单次医学知识检索最多返回并展示的可追溯结果数量',
     'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":10}', null, '5',
     '条', null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795100, 362387869794070, 'ai.clinical.endpoint', '模型服务地址',
     'OpenAI-compatible Chat Completions服务地址',
     'STRING', 'TEXT', '{"type":"string","minLength":8,"maxLength":1000}', null, '"https://ai-gateway.example/v1/chat/completions"',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795101, 362387869794070, 'ai.clinical.api-key', '模型服务API Key',
     '模型与语音服务访问凭据；使用AES-256-GCM加密存储且不回传明文',
     'STRING', 'SECRET_REFERENCE', null, null, null,
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, false, false,
     'SECRET', 'MASKED', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795102, 362387869794070, 'ai.clinical.speech-endpoint', '语音转写服务地址',
     'OpenAI-compatible Audio Transcriptions服务地址',
     'STRING', 'TEXT', '{"type":"string","minLength":8,"maxLength":1000}', null, '"https://ai-gateway.example/v1/audio/transcriptions"',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795103, 362387869794070, 'ai.clinical.speech-model', '语音转写模型',
     '发送给语音转写服务的模型标识',
     'STRING', 'TEXT', '{"type":"string","minLength":1,"maxLength":200}', null, '"gpt-transcribe"',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795104, 362387869794070, 'ai.clinical.knowledge-endpoint', '医学知识服务地址',
     'PMPHAI-compatible医学知识检索服务地址',
     'STRING', 'TEXT', '{"type":"string","minLength":8,"maxLength":1000}', null, '"https://ai-gateway.example/v1/knowledge/pmphai/search"',
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, true, false,
     'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869795105, 362387869794070, 'ai.clinical.knowledge-api-key', '医学知识API Key',
     '医学知识服务独立访问凭据；未配置时继承模型API Key',
     'STRING', 'SECRET_REFERENCE', null, null, null,
     null, null, '["PLATFORM","TENANT"]', 'BUSINESS', true, false, true,
     'SECRET', 'MASKED', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222);
