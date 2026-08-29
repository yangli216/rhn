alter table dictionary_definitions add system_managed number(1,0) default 0 not null;
alter table dictionary_definitions modify created_by null;
alter table dictionary_definitions modify updated_by null;
alter table dictionary_definitions add constraint ck_dictionary_definition_management check (
    (system_managed = 1 and created_by is null and updated_by is null) or
    (system_managed = 0 and created_by is not null and updated_by is not null)
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791001, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_SCOPE_TYPE', '参数作用域', '参数当前值可维护的上下文范围',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792001, 362387869791001, 'PLATFORM', '平台', '平台统一默认值', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792002, 362387869791001, 'TENANT', '租户', '当前租户范围', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792003, 362387869791001, 'ORGANIZATION', '机构', '机构及其父子层级', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792004, 362387869791001, 'DEPARTMENT', '科室', '科室及其父子层级', 40, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792005, 362387869791001, 'USER', '用户', '当前用户范围', 50, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792006, 362387869791001, 'PRODUCT', '产品', '产品附加上下文', 60, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792007, 362387869791001, 'MODULE', '模块', '模块附加上下文', 70, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792008, 362387869791001, 'ENVIRONMENT', '环境', '运行环境附加上下文', 80, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791002, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_VALUE_TYPE', '参数值类型', '参数值的强类型 JSON 约束',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792009, 362387869791002, 'STRING', '字符串', 'JSON 字符串', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792010, 362387869791002, 'NUMBER', '数值', 'JSON 数值', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792011, 362387869791002, 'BOOLEAN', '布尔值', 'JSON 布尔值', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792012, 362387869791002, 'JSON', 'JSON 对象', 'JSON 对象或数组', 40, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791003, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_CONTROL_TYPE', '参数控件类型', '参数管理界面的录入控件',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792013, 362387869791003, 'TEXT', '单行文本', '单行字符串输入', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792014, 362387869791003, 'TEXTAREA', '多行文本', '多行字符串输入', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792015, 362387869791003, 'NUMBER', '数值输入', '数值输入控件', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792016, 362387869791003, 'SWITCH', '开关', '布尔开关控件', 40, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792017, 362387869791003, 'SELECT', '字典选择', '绑定字典的下拉选择', 50, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792018, 362387869791003, 'JSON_EDITOR', 'JSON 编辑器', '结构化 JSON 输入', 60, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792019, 362387869791003, 'SECRET_REFERENCE', '密钥引用', '只保存外部秘密管理引用', 70, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791004, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_CONFIG_TYPE', '参数配置属性', '区分底座系统参数和条线业务参数',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792020, 362387869791004, 'SYSTEM', '系统级', '影响平台或基础设施行为', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792021, 362387869791004, 'BUSINESS', '业务级', '影响业务条线行为', 20, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791005, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_SENSITIVITY', '参数敏感级别', '参数内容的安全敏感程度',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792022, 362387869791005, 'NORMAL', '普通', '无敏感内容', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792023, 362387869791005, 'SENSITIVE', '敏感', '需要限制展示', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792024, 362387869791005, 'SECRET', '密钥', '只允许保存密钥引用', 30, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791006, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_DISPLAY_POLICY', '参数展示策略', '管理端参数内容的展示方式',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792025, 362387869791006, 'PLAIN', '明文', '直接显示当前内容', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792026, 362387869791006, 'MASKED', '掩码', '仅显示掩码占位', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792027, 362387869791006, 'HIDDEN', '隐藏', '不返回当前内容', 30, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791007, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_STATUS', '参数状态', '参数定义、分类和当前值的可用状态',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792028, 362387869791007, 'ACTIVE', '已启用', '当前可用', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792029, 362387869791007, 'INACTIVE', '已停用', '停止用于解析，历史记录保留', 20, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791008, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_VALUE_MODE', '参数值模式', '当前作用域对参数解析链的处理方式',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792030, 362387869791008, 'INHERIT', '继续继承', '跳过当前作用域并继续查找上级', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792031, 362387869791008, 'OVERRIDE', '覆盖', '使用当前作用域维护的值', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792032, 362387869791008, 'RESET_DEFAULT', '恢复默认', '短路到参数定义默认值', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792033, 362387869791008, 'EXPLICIT_NULL', '显式空值', '短路并返回空值', 40, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791009, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_CHANGE_TYPE', '参数变更类型', '追加式参数变更日志记录的操作类型',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792034, 362387869791009, 'CREATE', '创建', '创建参数定义或当前值', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792035, 362387869791009, 'UPDATE', '更新', '更新参数定义或当前值', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792036, 362387869791009, 'ENABLE', '启用', '恢复参数定义或当前值', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792037, 362387869791009, 'DISABLE', '停用', '停用参数定义或当前值', 40, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792038, 362387869791009, 'RESET', '恢复默认', '将当前作用域短路到默认值', 50, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792039, 362387869791009, 'ROLLBACK', '人工回退', '使用历史快照重新写入当前值', 60, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791010, 0, 'PLATFORM', 'PLATFORM', null, 'PARAM_CHANGE_TARGET_TYPE', '参数变更目标', '参数变更日志指向的对象类型',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792040, 362387869791010, 'DEFINITION', '参数定义', '变更目标为参数定义', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792041, 362387869791010, 'VALUE', '参数当前值', '变更目标为作用域当前值', 20, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791011, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_KIND', '组织类别', '区分法定机构和内部组织单元',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792042, 362387869791011, 'LEGAL_ORGANIZATION', '法定机构', '可建立聘用关系的医疗机构', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792043, 362387869791011, 'ORG_UNIT', '组织单元', '院区、科室或护理单元', 20, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791012, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_TYPE', '组织类型', '组织树节点的业务类型',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792044, 362387869791012, 'TOWNSHIP_HEALTH_CENTER', '乡镇卫生院', '基层法定医疗机构', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792045, 362387869791012, 'COMMUNITY_HEALTH_CENTER', '社区卫生服务中心', '基层法定医疗机构', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792046, 362387869791012, 'HOSPITAL', '医院', '法定医院机构', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792047, 362387869791012, 'CLINIC', '诊所', '法定诊所机构', 40, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792048, 362387869791012, 'CAMPUS', '院区', '机构下属院区', 50, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792049, 362387869791012, 'CLINICAL_DEPARTMENT', '临床科室', '直接提供临床服务的科室', 60, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792050, 362387869791012, 'ADMINISTRATIVE_DEPARTMENT', '行政科室', '承担行政管理职责的科室', 70, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792051, 362387869791012, 'MEDICAL_TECHNOLOGY_DEPARTMENT', '医技科室', '检验、检查等医技科室', 80, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792052, 362387869791012, 'NURSING_UNIT', '护理单元', '护理或物理病区组织单元', 90, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791013, 0, 'PLATFORM', 'PLATFORM', null, 'ORG_STATUS', '组织状态', '组织节点当前生命周期状态',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792053, 362387869791013, 'DRAFT', '草稿', '尚未投入使用', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792054, 362387869791013, 'PENDING_ACTIVE', '待启用', '已完成维护、等待启用', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792055, 362387869791013, 'ACTIVE', '已启用', '可用于当前业务', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792056, 362387869791013, 'SUSPENDED', '已暂停', '临时停止用于新业务', 40, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792057, 362387869791013, 'INACTIVE', '已停用', '不再用于新业务', 50, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792058, 362387869791013, 'MERGED', '已合并', '已合并到其他机构', 60, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791014, 0, 'PLATFORM', 'PLATFORM', null, 'PRACT_GENDER', '从业人员性别', '人员主档中的性别代码',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792059, 362387869791014, 'MALE', '男', '男性', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792060, 362387869791014, 'FEMALE', '女', '女性', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792061, 362387869791014, 'UNKNOWN', '未知', '未登记或未知', 30, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791015, 0, 'PLATFORM', 'PLATFORM', null, 'PERSONNEL_STATUS', '人员业务状态', '人员、聘用、岗位和任职的当前状态',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792062, 362387869791015, 'ACTIVE', '已启用', '可用于当前业务', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792063, 362387869791015, 'INACTIVE', '已停用', '不再用于新业务', 20, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791016, 0, 'PLATFORM', 'PLATFORM', null, 'EMPLOYMENT_TYPE', '聘用类型', '人员与法定机构之间的聘用方式',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792064, 362387869791016, 'PERMANENT', '正式聘用', '正式劳动聘用关系', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792065, 362387869791016, 'CONTRACT', '合同聘用', '合同制聘用关系', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792066, 362387869791016, 'DISPATCHED', '劳务派遣', '第三方派遣关系', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792067, 362387869791016, 'TEMPORARY', '临时聘用', '短期或临时聘用关系', 40, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791017, 0, 'PLATFORM', 'PLATFORM', null, 'POSITION_TYPE', '岗位类型', '标准岗位的职责分类',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792068, 362387869791017, 'CLINICAL', '临床', '医生等临床岗位', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792069, 362387869791017, 'NURSING', '护理', '护士等护理岗位', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792070, 362387869791017, 'PHARMACY', '药学', '药师等药学岗位', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792071, 362387869791017, 'MEDICAL_TECHNOLOGY', '医技', '检验、检查等医技岗位', 40, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792072, 362387869791017, 'ADMINISTRATIVE', '行政', '行政管理岗位', 50, 'ACTIVE'
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791018, 0, 'PLATFORM', 'PLATFORM', null, 'ASSIGNMENT_TYPE', '任职类型', '人员在组织单元中的任职方式',
    1, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792073, 362387869791018, 'PRIMARY', '主任职', '当前主要工作任职', 10, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792074, 362387869791018, 'PART_TIME', '兼职', '兼任其他组织岗位', 20, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792075, 362387869791018, 'SECONDMENT', '借调', '临时借调任职', 30, 'ACTIVE'
);

insert into dictionary_items (
    id, dictionary_id, code, name, description, sort_order, status
) values (
    362387869792076, 362387869791018, 'ROTATION', '轮转', '按培养或业务安排轮转', 40, 'ACTIVE'
);


