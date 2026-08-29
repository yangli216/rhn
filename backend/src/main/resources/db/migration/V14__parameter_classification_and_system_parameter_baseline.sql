-- First governed parameter baseline rebuilt from the legacy PHIS parameter inventory.
-- Only categories with actual definitions are created. Definition defaults are the
-- product baseline; tenant/organization/user overrides are maintained as parameter values.

insert into parameter_categories (
    id, parent_id, code, name, description, sort_order, active, revision,
    created_at, created_by, updated_at, updated_by
) values (
    362387869794001, null, 'PLATFORM', '平台底座',
    '跨业务共享的平台运行能力；不承载具体条线业务策略', 10, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_categories values (
    362387869794002, 362387869794001, 'PLATFORM_IDENTITY', '身份与访问',
    '登录认证、密码策略和访问保护等平台公共能力', 10, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_categories values (
    362387869794003, null, 'PORTAL', '工作门户',
    '工作台、导航、消息和非关键用户体验策略', 20, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_categories values (
    362387869794004, 362387869794003, 'PORTAL_NAVIGATION', '导航与快捷入口',
    '门户导航、常用功能和热门功能的展示策略', 10, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_categories values (
    362387869794005, 362387869794003, 'PORTAL_NOTIFICATION', '消息提醒',
    '门户消息轮询和浮窗展示等提醒策略', 20, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_categories values (
    362387869794006, 362387869794003, 'PORTAL_SECURITY', '界面安全',
    '门户水印等界面侧辅助安全能力，不替代后端安全控制', 30, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions (
    id, category_id, parameter_key, name, description, value_type, control_type,
    json_schema, default_value_json, example_value_json, unit, dictionary_code,
    scope_json, parameter_category, inheritance_enabled, cache_enabled, nullable_value,
    sensitivity, display_policy, status, revision, created_at, created_by, updated_at, updated_by
) values (
    362387869795001, 362387869794002, 'platform.identity.password-policy.enabled', '启用密码安全策略',
    '控制统一身份认证是否执行密码有效期和失败登录保护；缺值时启用，修改会影响所有账号登录校验',
    'BOOLEAN', 'SWITCH', '{"type":"boolean"}', 'true', 'true', null, null,
    '["PLATFORM","TENANT"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795002, 362387869794002, 'platform.identity.password-policy.min-length', '密码最小长度',
    '统一身份认证允许的新密码最小字符数；缺值时为 8，修改只影响后续设置或重置的密码',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":8,"maximum":128}', '8', '12', 'count', null,
    '["PLATFORM","TENANT"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795003, 362387869794002, 'platform.identity.password-policy.expiry-period', '密码有效期',
    '密码自最近修改起允许使用的天数；缺值时为 30 天，修改会影响到期判定',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":3650}', '30', '90', 'd', null,
    '["PLATFORM","TENANT"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795004, 362387869794002, 'platform.identity.password-policy.expiry-warning', '密码到期提醒提前量',
    '密码到期前开始提醒用户修改密码的天数；0 表示仅在到期时提示，缺值时为 2 天',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":0,"maximum":365}', '2', '7', 'd', null,
    '["PLATFORM","TENANT"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795005, 362387869794002, 'platform.identity.failed-login.max-attempts', '登录失败最大次数',
    '一个统计窗口内允许的连续登录失败次数；达到阈值后进入锁定，缺值时为 3 次',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":20}', '3', '5', 'count', null,
    '["PLATFORM","TENANT"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795006, 362387869794002, 'platform.identity.failed-login.window', '登录失败统计窗口',
    '累计登录失败次数的滚动时间窗口；缺值时为 10 分钟，窗口外的失败记录不计入锁定判断',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":1440}', '10', '15', 'min', null,
    '["PLATFORM","TENANT"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795007, 362387869794002, 'platform.identity.failed-login.lock-duration', '登录失败锁定时长',
    '达到最大失败次数后账号拒绝登录的持续时间；缺值时为 30 分钟',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":10080}', '30', '60', 'min', null,
    '["PLATFORM","TENANT"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795008, 362387869794004, 'portal.navigation.hot-item.limit', '热门功能显示数量',
    '工作门户最多展示的热门功能数量；缺值时为 9，允许租户和用户覆盖',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":50}', '9', '12', 'count', null,
    '["PLATFORM","TENANT","USER"]', 'SYSTEM', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795009, 362387869794004, 'portal.navigation.recent-item.limit', '常用功能显示数量',
    '工作门户最多展示的最近或常用功能数量；缺值时为 9，允许租户和用户覆盖',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":50}', '9', '12', 'count', null,
    '["PLATFORM","TENANT","USER"]', 'SYSTEM', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795010, 362387869794005, 'portal.notification.poll-interval', '消息轮询间隔',
    '工作门户主动获取新消息的时间间隔；缺值时为 5 分钟，允许机构和用户按需覆盖',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":1440}', '5', '10', 'min', null,
    '["PLATFORM","TENANT","ORGANIZATION","USER"]', 'SYSTEM', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795011, 362387869794005, 'portal.notification.display-duration', '消息浮窗停留时间',
    '单条消息浮窗自动关闭前的停留秒数；缺值时为 3 秒，允许机构和用户按需覆盖',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":60}', '3', '5', 's', null,
    '["PLATFORM","TENANT","ORGANIZATION","USER"]', 'SYSTEM', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795012, 362387869794006, 'portal.security.watermark.enabled', '启用界面水印',
    '控制工作门户是否显示用户和机构上下文水印；缺值时关闭，水印仅作辅助追踪且不替代后端审计',
    'BOOLEAN', 'SWITCH', '{"type":"boolean"}', 'false', 'true', null, null,
    '["PLATFORM","TENANT","ORGANIZATION"]', 'SYSTEM', true, false, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

-- Product initialization is also visible in the append-only parameter change stream.
insert into parameter_changes (
    id, tenant_id, definition_id, value_id, target_type, change_type,
    before_json, after_json, change_reason, request_code, changed_at, changed_by
)
select 362387869796000 + row_number() over (order by id), null, id, null, 'DEFINITION', 'CREATE',
       null, '{"source":"PRODUCT_BASELINE","key":"' || parameter_key || '","status":"ACTIVE"}',
       '依据 PHIS 现有参数盘点重建首批高优先级系统参数',
       'baseline-v14:' || parameter_key, current_timestamp, 362387869790222
from parameter_definitions
where id between 362387869795001 and 362387869795012;
