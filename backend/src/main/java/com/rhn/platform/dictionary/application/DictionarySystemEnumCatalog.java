package com.rhn.platform.dictionary.application;

import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.platform.dictionary.api.SystemEnumItem;
import com.rhn.platform.dictionary.domain.DictionaryChangeTargetType;
import com.rhn.platform.dictionary.domain.DictionaryChangeType;
import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class DictionarySystemEnumCatalog implements SystemEnumDirectory {
    public static final String DICT_SCOPE_TYPE = "DICT_SCOPE_TYPE";
    public static final String DICT_STATUS = "DICT_STATUS";
    public static final String DICT_CATEGORY_STATUS = "DICT_CATEGORY_STATUS";
    public static final String DICT_ITEM_STATUS = "DICT_ITEM_STATUS";
    public static final String DICT_CHANGE_TYPE = "DICT_CHANGE_TYPE";
    public static final String DICT_CHANGE_TARGET_TYPE = "DICT_CHANGE_TARGET_TYPE";
    public static final String PARAM_SCOPE_TYPE = "PARAM_SCOPE_TYPE";
    public static final String PARAM_VALUE_TYPE = "PARAM_VALUE_TYPE";
    public static final String PARAM_CONTROL_TYPE = "PARAM_CONTROL_TYPE";
    public static final String PARAM_CONFIG_TYPE = "PARAM_CONFIG_TYPE";
    public static final String PARAM_SENSITIVITY = "PARAM_SENSITIVITY";
    public static final String PARAM_DISPLAY_POLICY = "PARAM_DISPLAY_POLICY";
    public static final String PARAM_STATUS = "PARAM_STATUS";
    public static final String PARAM_VALUE_MODE = "PARAM_VALUE_MODE";
    public static final String PARAM_CHANGE_TYPE = "PARAM_CHANGE_TYPE";
    public static final String PARAM_CHANGE_TARGET_TYPE = "PARAM_CHANGE_TARGET_TYPE";
    public static final String ORG_KIND = "ORG_KIND";
    public static final String ORG_TYPE = "ORG_TYPE";
    public static final String ORG_STATUS = "ORG_STATUS";
    public static final String PRACT_GENDER = "PRACT_GENDER";
    public static final String PERSONNEL_STATUS = "PERSONNEL_STATUS";
    public static final String EMPLOYMENT_TYPE = "EMPLOYMENT_TYPE";
    public static final String POSITION_TYPE = "POSITION_TYPE";
    public static final String ASSIGNMENT_TYPE = "ASSIGNMENT_TYPE";
    public static final String SC_SCHEDULE_MANAGEMENT_MODE = "SC_SCHEDULE_MANAGEMENT_MODE";
    public static final String SC_SCHEDULE_DAY_PART = "SC_SCHEDULE_DAY_PART";
    public static final String SC_SCHEDULE_STATUS = "SC_SCHEDULE_STATUS";
    public static final String SC_BOOKING_POLICY = "SC_BOOKING_POLICY";
    public static final String SC_SLOT_MODE = "SC_SLOT_MODE";
    public static final String SC_QUOTA_MODE = "SC_QUOTA_MODE";
    public static final Set<String> PERSISTED_SYSTEM_ENUM_CODES = Set.of(
            PARAM_SCOPE_TYPE, PARAM_VALUE_TYPE, PARAM_CONTROL_TYPE, PARAM_CONFIG_TYPE,
            PARAM_SENSITIVITY, PARAM_DISPLAY_POLICY, PARAM_STATUS, PARAM_VALUE_MODE,
            PARAM_CHANGE_TYPE, PARAM_CHANGE_TARGET_TYPE,
            ORG_KIND, ORG_TYPE, ORG_STATUS, PRACT_GENDER, PERSONNEL_STATUS,
            EMPLOYMENT_TYPE, POSITION_TYPE, ASSIGNMENT_TYPE);

    private final List<SystemEnumDefinition> definitions = List.of(
            definition(DICT_SCOPE_TYPE, "字典作用域类型", "普通字典定义的可见和维护范围",
                    DictionaryScopeType.class, List.of(
                            item("PLATFORM", "平台共享", "由平台统一维护，对所有租户可见", 10),
                            item("TENANT", "租户私有", "仅当前租户可见和维护", 20))),
            definition(DICT_STATUS, "字典状态", "普通字典定义的当前可用状态",
                    DictionaryStatus.class, List.of(
                            item("ACTIVE", "已启用", "可继续用于新业务", 10),
                            item("INACTIVE", "已停用", "不再用于新业务，历史数据继续保留", 20))),
            definition(DICT_CATEGORY_STATUS, "字典分类状态", "字典管理分类的当前可用状态",
                    DictionaryStatus.class, List.of(
                            item("ACTIVE", "已启用", "可用于归类字典或创建子分类", 10),
                            item("INACTIVE", "已停用", "不再用于新增归类，已有字典继续保留", 20))),
            definition(DICT_ITEM_STATUS, "字典项状态", "普通字典项的当前可用状态",
                    DictionaryStatus.class, List.of(
                            item("ACTIVE", "已启用", "可继续用于新业务", 10),
                            item("INACTIVE", "已停用", "不再用于新业务，历史数据继续保留", 20))),
            definition(DICT_CHANGE_TYPE, "字典变更类型", "追加式字典变更日志记录的操作类型",
                    DictionaryChangeType.class, List.of(
                            item("CREATE_CATEGORY", "创建分类", "创建字典分类节点", 10),
                            item("UPDATE_CATEGORY", "更新分类", "更新字典分类展示属性", 20),
                            item("MOVE_CATEGORY", "移动分类", "调整字典分类层级或排序", 30),
                            item("ENABLE_CATEGORY", "启用分类", "恢复分类用于字典归类", 40),
                            item("DISABLE_CATEGORY", "停用分类", "停止分类用于新增归类", 50),
                            item("CREATE_DICT", "创建字典", "创建普通字典定义", 60),
                            item("UPDATE_DICT", "更新字典", "更新普通字典定义的展示属性", 70),
                            item("MOVE_DICT", "移动字典", "调整普通字典所属分类", 80),
                            item("ENABLE_DICT", "启用字典", "恢复普通字典用于新业务", 90),
                            item("DISABLE_DICT", "停用字典", "停止普通字典用于新业务", 100),
                            item("ADD_ITEM", "新增字典项", "为普通字典新增业务代码", 110),
                            item("UPDATE_ITEM", "更新字典项", "更新字典项的展示属性", 120),
                            item("ENABLE_ITEM", "启用字典项", "恢复字典项用于新业务", 130),
                            item("DISABLE_ITEM", "停用字典项", "停止字典项用于新业务", 140),
                            item("CREATE_ATTRIBUTE", "创建扩展属性", "创建字典项扩展属性定义", 150),
                            item("UPDATE_ATTRIBUTE", "更新扩展属性", "更新字典项扩展属性约束", 160),
                            item("ENABLE_ATTRIBUTE", "启用扩展属性", "恢复属性参与配置和解析", 170),
                            item("DISABLE_ATTRIBUTE", "停用扩展属性", "停止属性参与新业务解析", 180),
                            item("SET_ITEM_ATTRIBUTE", "设置属性值", "设置字典项在一个作用域的属性值集合", 190),
                            item("CLEAR_ITEM_ATTRIBUTE", "恢复继承", "清除当前作用域值并恢复上级继承", 200))),
            definition(DICT_CHANGE_TARGET_TYPE, "字典变更目标类型", "字典变更日志指向的对象类型",
                    DictionaryChangeTargetType.class, List.of(
                            item("CATEGORY", "字典分类", "变更目标为字典分类节点", 10),
                            item("DICT", "字典定义", "变更目标为普通字典定义", 20),
                            item("ITEM", "字典项", "变更目标为普通字典项", 30),
                            item("ATTR_DEFINITION", "扩展属性定义", "变更目标为字典扩展属性定义", 40),
                            item("ITEM_ATTRIBUTE", "字典项属性值", "变更目标为分层字典项属性值集合", 50))),
            definition(PARAM_SCOPE_TYPE, "参数作用域", "参数当前值可维护的上下文范围", List.of(
                            item("PLATFORM", "平台", "平台统一默认值", 10),
                            item("TENANT", "租户", "当前租户范围", 20),
                            item("ORGANIZATION", "机构", "机构及其父子层级", 30),
                            item("DEPARTMENT", "科室", "科室及其父子层级", 40),
                            item("USER", "用户", "当前用户范围", 50),
                            item("PRODUCT", "产品", "产品附加上下文", 60),
                            item("MODULE", "模块", "模块附加上下文", 70),
                            item("ENVIRONMENT", "环境", "运行环境附加上下文", 80))),
            definition(PARAM_VALUE_TYPE, "参数值类型", "参数值的强类型 JSON 约束", List.of(
                            item("STRING", "字符串", "JSON 字符串", 10),
                            item("NUMBER", "数值", "JSON 数值", 20),
                            item("BOOLEAN", "布尔值", "JSON 布尔值", 30),
                            item("JSON", "JSON 对象", "JSON 对象或数组", 40))),
            definition(PARAM_CONTROL_TYPE, "参数控件类型", "参数管理界面的录入控件", List.of(
                            item("TEXT", "单行文本", "单行字符串输入", 10),
                            item("TEXTAREA", "多行文本", "多行字符串输入", 20),
                            item("NUMBER", "数值输入", "数值输入控件", 30),
                            item("SWITCH", "开关", "布尔开关控件", 40),
                            item("SELECT", "字典选择", "绑定字典的下拉选择", 50),
                            item("JSON_EDITOR", "JSON 编辑器", "结构化 JSON 输入", 60),
                            item("SECRET_REFERENCE", "密钥引用", "只保存外部秘密管理引用", 70))),
            definition(PARAM_CONFIG_TYPE, "参数配置属性", "区分底座系统参数和条线业务参数", List.of(
                            item("SYSTEM", "系统级", "影响平台或基础设施行为", 10),
                            item("BUSINESS", "业务级", "影响业务条线行为", 20))),
            definition(PARAM_SENSITIVITY, "参数敏感级别", "参数内容的安全敏感程度", List.of(
                            item("NORMAL", "普通", "无敏感内容", 10),
                            item("SENSITIVE", "敏感", "需要限制展示", 20),
                            item("SECRET", "密钥", "只允许保存密钥引用", 30))),
            definition(PARAM_DISPLAY_POLICY, "参数展示策略", "管理端参数内容的展示方式", List.of(
                            item("PLAIN", "明文", "直接显示当前内容", 10),
                            item("MASKED", "掩码", "仅显示掩码占位", 20),
                            item("HIDDEN", "隐藏", "不返回当前内容", 30))),
            definition(PARAM_STATUS, "参数状态", "参数定义、分类和当前值的可用状态", List.of(
                            item("ACTIVE", "已启用", "当前可用", 10),
                            item("INACTIVE", "已停用", "停止用于解析，历史记录保留", 20))),
            definition(PARAM_VALUE_MODE, "参数值模式", "当前作用域对参数解析链的处理方式", List.of(
                            item("INHERIT", "继续继承", "跳过当前作用域并继续查找上级", 10),
                            item("OVERRIDE", "覆盖", "使用当前作用域维护的值", 20),
                            item("RESET_DEFAULT", "恢复默认", "短路到参数定义默认值", 30),
                            item("EXPLICIT_NULL", "显式空值", "短路并返回空值", 40))),
            definition(PARAM_CHANGE_TYPE, "参数变更类型", "追加式参数变更日志记录的操作类型", List.of(
                            item("CREATE", "创建", "创建参数定义或当前值", 10),
                            item("UPDATE", "更新", "更新参数定义或当前值", 20),
                            item("ENABLE", "启用", "恢复参数定义或当前值", 30),
                            item("DISABLE", "停用", "停用参数定义或当前值", 40),
                            item("RESET", "恢复默认", "将当前作用域短路到默认值", 50),
                            item("ROLLBACK", "人工回退", "使用历史快照重新写入当前值", 60))),
            definition(PARAM_CHANGE_TARGET_TYPE, "参数变更目标", "参数变更日志指向的对象类型", List.of(
                            item("DEFINITION", "参数定义", "变更目标为参数定义", 10),
                            item("VALUE", "参数当前值", "变更目标为作用域当前值", 20))),
            definition(ORG_KIND, "组织类别", "区分法定机构和内部组织单元", List.of(
                            item("LEGAL_ORGANIZATION", "法定机构", "可建立聘用关系的医疗机构", 10),
                            item("ORG_UNIT", "组织单元", "院区、科室或护理单元", 20))),
            definition(ORG_TYPE, "组织类型", "组织树节点的业务类型", List.of(
                            item("TOWNSHIP_HEALTH_CENTER", "乡镇卫生院", "基层法定医疗机构", 10),
                            item("COMMUNITY_HEALTH_CENTER", "社区卫生服务中心", "基层法定医疗机构", 20),
                            item("HOSPITAL", "医院", "法定医院机构", 30),
                            item("CLINIC", "诊所", "法定诊所机构", 40),
                            item("CAMPUS", "院区", "机构下属院区", 50),
                            item("CLINICAL_DEPARTMENT", "临床科室", "直接提供临床服务的科室", 60),
                            item("ADMINISTRATIVE_DEPARTMENT", "行政科室", "承担行政管理职责的科室", 70),
                            item("MEDICAL_TECHNOLOGY_DEPARTMENT", "医技科室", "检验、检查等医技科室", 80),
                            item("NURSING_UNIT", "护理单元", "护理或物理病区组织单元", 90))),
            definition(ORG_STATUS, "组织状态", "组织节点当前生命周期状态", List.of(
                            item("DRAFT", "草稿", "尚未投入使用", 10),
                            item("PENDING_ACTIVE", "待启用", "已完成维护、等待启用", 20),
                            item("ACTIVE", "已启用", "可用于当前业务", 30),
                            item("SUSPENDED", "已暂停", "临时停止用于新业务", 40),
                            item("INACTIVE", "已停用", "不再用于新业务", 50),
                            item("MERGED", "已合并", "已合并到其他机构", 60))),
            definition(PRACT_GENDER, "从业人员性别", "人员主档中的性别代码", List.of(
                            item("MALE", "男", "男性", 10),
                            item("FEMALE", "女", "女性", 20),
                            item("UNKNOWN", "未知", "未登记或未知", 30))),
            definition(PERSONNEL_STATUS, "人员业务状态", "人员、聘用、岗位和任职的当前状态", List.of(
                            item("ACTIVE", "已启用", "可用于当前业务", 10),
                            item("INACTIVE", "已停用", "不再用于新业务", 20))),
            definition(EMPLOYMENT_TYPE, "聘用类型", "人员与法定机构之间的聘用方式", List.of(
                            item("PERMANENT", "正式聘用", "正式劳动聘用关系", 10),
                            item("CONTRACT", "合同聘用", "合同制聘用关系", 20),
                            item("DISPATCHED", "劳务派遣", "第三方派遣关系", 30),
                            item("TEMPORARY", "临时聘用", "短期或临时聘用关系", 40))),
            definition(POSITION_TYPE, "岗位类型", "标准岗位的职责分类", List.of(
                            item("CLINICAL", "临床", "医生等临床岗位", 10),
                            item("NURSING", "护理", "护士等护理岗位", 20),
                            item("PHARMACY", "药学", "药师等药学岗位", 30),
                            item("MEDICAL_TECHNOLOGY", "医技", "检验、检查等医技岗位", 40),
                            item("ADMINISTRATIVE", "行政", "行政管理岗位", 50))),
            definition(ASSIGNMENT_TYPE, "任职类型", "人员在组织单元中的任职方式", List.of(
                            item("PRIMARY", "主任职", "当前主要工作任职", 10),
                            item("PART_TIME", "兼职", "兼任其他组织岗位", 20),
                            item("SECONDMENT", "借调", "临时借调任职", 30),
                            item("ROTATION", "轮转", "按培养或业务安排轮转", 40))),
            definition(SC_SCHEDULE_MANAGEMENT_MODE, "排班管理模式", "基层简易排班与精细化专业排班的管理模式", List.of(
                            item("SIMPLE", "简易模式", "以医生、日期时段和号源数快速生成排班", 10),
                            item("PROFESSIONAL", "专业模式", "启用渠道配额、分时号和规则等精细化能力", 20))),
            definition(SC_SCHEDULE_DAY_PART, "排班时段", "排班模板和实际排班使用的日内时段", List.of(
                            item("MORNING", "上午", "上午门诊时段", 10),
                            item("AFTERNOON", "下午", "下午门诊时段", 20),
                            item("EVENING", "晚间", "晚间门诊时段", 30),
                            item("CUSTOM", "自定义", "自定义起止时间", 40))),
            definition(SC_SCHEDULE_STATUS, "排班状态", "实际排班当前生命周期状态", List.of(
                            item("PUBLISHED", "可预约", "排班已发布并开放号源", 10),
                            item("SUSPENDED", "已停诊", "临时停止预约和挂号", 20),
                            item("CANCELLED", "已取消", "排班已取消", 30),
                            item("COMPLETED", "已结束", "排班服务时段已结束", 40))),
            definition(SC_BOOKING_POLICY, "排班预约策略", "号源在预约渠道之间的分配策略", List.of(
                            item("SHARED", "共享号源", "所有渠道共同使用一个号源池", 10),
                            item("CHANNEL_QUOTA", "渠道配额", "按渠道配置号源额度并支持回收", 20))),
            definition(SC_SLOT_MODE, "号源模式", "排班号源的组织方式", List.of(
                            item("POOL", "号池模式", "按时段共享总量，不逐号指定时间", 10),
                            item("TIMED", "分时模式", "每个号源对应具体可预约时间", 20))),
            definition(SC_QUOTA_MODE, "号源配额模式", "号源是否按渠道拆分配额", List.of(
                            item("SHARED", "统一共享", "预约、窗口等渠道共用可用量", 10),
                            item("CHANNEL_QUOTA", "渠道配额", "各渠道在分配额度内使用号源", 20)))
    );
    private final Map<String, SystemEnumDefinition> definitionsByCode = definitions.stream()
            .collect(Collectors.toUnmodifiableMap(SystemEnumDefinition::code, Function.identity()));

    @Override
    public List<SystemEnumDefinition> listSystemEnums() {
        return definitions;
    }

    @Override
    public Optional<SystemEnumDefinition> findSystemEnum(String code) {
        if (code == null) return Optional.empty();
        return Optional.ofNullable(definitionsByCode.get(code.trim()));
    }

    public List<SystemEnumDefinition> persistedSystemEnums() {
        return definitions.stream()
                .filter(definition -> PERSISTED_SYSTEM_ENUM_CODES.contains(definition.code()))
                .toList();
    }

    private static SystemEnumItem item(String code, String name, String description, int sortOrder) {
        return new SystemEnumItem(code, name, description, sortOrder);
    }

    private static <E extends Enum<E>> SystemEnumDefinition definition(
            String code, String name, String description, Class<E> enumType, List<SystemEnumItem> items) {
        Set<String> expectedCodes = Arrays.stream(enumType.getEnumConstants())
                .map(Enum::name)
                .collect(Collectors.toUnmodifiableSet());
        Set<String> actualCodes = items.stream()
                .map(SystemEnumItem::code)
                .collect(Collectors.toUnmodifiableSet());
        if (items.size() != actualCodes.size() || !expectedCodes.equals(actualCodes)) {
            throw new IllegalStateException(code + " 与 " + enumType.getSimpleName() + " 定义不一致");
        }
        return new SystemEnumDefinition(code, name, description, items);
    }

    private static SystemEnumDefinition definition(
            String code, String name, String description, List<SystemEnumItem> items) {
        Set<String> itemCodes = items.stream().map(SystemEnumItem::code).collect(Collectors.toUnmodifiableSet());
        if (items.isEmpty() || itemCodes.size() != items.size()) {
            throw new IllegalStateException(code + " 存在空项或重复枚举编码");
        }
        return new SystemEnumDefinition(code, name, description, items);
    }
}
