package com.rhn.platform.masterdata.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.AttributeConfigurationResponse;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.AttributeDefinitionView;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.ConfigurationChangeView;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.ItemTypeOption;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.TypeAttributeView;
import com.rhn.platform.masterdata.domain.ItemAttributeChange;
import com.rhn.platform.masterdata.domain.ItemAttributeDefinition;
import com.rhn.platform.masterdata.domain.ItemType;
import com.rhn.platform.masterdata.domain.ItemTypeAttribute;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeChangeRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeDefinitionRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeOverrideRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeValueRepository;
import com.rhn.platform.masterdata.infrastructure.ItemTypeAttributeRepository;
import com.rhn.platform.masterdata.infrastructure.ItemTypeRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ItemAttributeConfigurationService {
    private static final Pattern CODE = Pattern.compile("[A-Z][A-Z0-9_.-]{2,127}");
    private static final Set<String> DATA_TYPES = Set.of(
            "BOOLEAN", "INTEGER", "DECIMAL", "TEXT", "ENUM", "DATE", "DATETIME",
            "DURATION", "DICT_REF", "TERM_REF", "OBJECT");
    private static final Set<String> CARDINALITIES = Set.of("SINGLE", "MULTIPLE");
    private static final Set<String> VARIABILITIES = Set.of("BASE_ONLY", "SCOPE_OVERRIDE", "LOCAL_ONLY");
    private static final Set<String> CONTEXT_BASES = Set.of(
            "NONE", "ORDERING", "EXECUTING", "DISPENSING", "STOCKING");
    private static final Set<String> SCOPES = Set.of("TENANT", "ORGANIZATION", "DEPARTMENT");
    private static final Set<String> SENSITIVITIES = Set.of(
            "NORMAL", "SENSITIVE", "MEDICAL_SAFETY", "PRIVACY");
    private static final Set<String> WIDGETS = Set.of(
            "INPUT", "TEXTAREA", "SWITCH", "SELECT", "RADIO", "DATE", "DATETIME",
            "NUMBER", "DICT_SELECT", "MULTI_SELECT", "JSON");

    private final ItemAttributeDefinitionRepository definitionRepository;
    private final ItemTypeAttributeRepository assignmentRepository;
    private final ItemTypeRepository itemTypeRepository;
    private final ItemAttributeValueRepository valueRepository;
    private final ItemAttributeOverrideRepository overrideRepository;
    private final ItemAttributeChangeRepository changeRepository;
    private final DictionaryDirectory dictionaryDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final ItemAttributeMaintenanceService maintenanceService;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public ItemAttributeConfigurationService(ItemAttributeDefinitionRepository definitionRepository,
                                             ItemTypeAttributeRepository assignmentRepository,
                                             ItemTypeRepository itemTypeRepository,
                                             ItemAttributeValueRepository valueRepository,
                                             ItemAttributeOverrideRepository overrideRepository,
                                             ItemAttributeChangeRepository changeRepository,
                                             DictionaryDirectory dictionaryDirectory,
                                             OrganizationDirectory organizationDirectory,
                                             ItemAttributeMaintenanceService maintenanceService,
                                             ExecutionContextProvider contextProvider,
                                             JsonCodec jsonCodec) {
        this.definitionRepository = definitionRepository;
        this.assignmentRepository = assignmentRepository;
        this.itemTypeRepository = itemTypeRepository;
        this.valueRepository = valueRepository;
        this.overrideRepository = overrideRepository;
        this.changeRepository = changeRepository;
        this.dictionaryDirectory = dictionaryDirectory;
        this.organizationDirectory = organizationDirectory;
        this.maintenanceService = maintenanceService;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    public AttributeConfigurationResponse configuration(String subjectType, Long itemTypeId, String status) {
        ExecutionContext context = current();
        String namespace = namespace(context.tenantId());
        List<ItemType> itemTypes = itemTypeRepository.findVisibleActive(context.tenantId()).stream()
                .filter(value -> blank(subjectType) || value.subjectType().equals(normalize(subjectType)))
                .toList();
        Set<Long> visibleTypeIds = itemTypes.stream().map(ItemType::id)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        if (itemTypeId != null && !visibleTypeIds.contains(itemTypeId)) {
            throw notFound("ITEM_TYPE_NOT_FOUND", "未找到当前租户可用的项目类型");
        }

        List<ItemAttributeDefinition> definitions = definitionRepository.findVisible(context.tenantId()).stream()
                .filter(value -> blank(status) || value.status().equals(normalize(status)))
                .toList();
        Set<Long> definitionIds = definitions.stream().map(ItemAttributeDefinition::id)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        List<ItemTypeAttribute> assignments = definitionIds.isEmpty() ? List.of()
                : assignmentRepository.findByAttributeDefinitionIdIn(definitionIds).stream()
                .filter(value -> visibleTypeIds.contains(value.itemTypeId()))
                .filter(value -> itemTypeId == null || value.itemTypeId().equals(itemTypeId))
                .toList();
        return new AttributeConfigurationResponse(namespace,
                itemTypes.stream().map(this::typeView).toList(),
                definitions.stream().map(value -> definitionView(context, value)).toList(),
                assignments.stream().map(value -> assignmentView(context, value)).toList());
    }

    @Transactional(readOnly = true)
    public List<ConfigurationChangeView> changes() {
        return changeRepository.findTop100ByTenantIdAndTargetTypeInOrderByChangedAtDesc(
                        current().tenantId(), List.of("DEFINITION", "TYPE_ASSIGNMENT")).stream()
                .map(value -> new ConfigurationChangeView(value.id(), value.attributeDefinitionId(),
                        value.itemTypeId(), value.itemTypeAttributeId(), value.targetType(), value.changeType(),
                        value.scopeKey(), value.changeReason(), value.requestCode(), value.changedAt(), value.changedBy()))
                .toList();
    }

    @Transactional
    public AttributeDefinitionView createDefinition(DefinitionCommand command) {
        ExecutionContext context = currentWithActor();
        String code = normalize(command.code());
        String namespace = namespace(context.tenantId());
        requireDefinitionCode(code, namespace);
        ItemAttributeChange prior = prior(command.requestCode(), context.tenantId(), "DEFINITION");
        if (prior != null) {
            ItemAttributeDefinition repeated = requireOwnedDefinition(prior.attributeDefinitionId(), context.tenantId());
            if (!repeated.code().equals(code)) throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性定义变更");
            return definitionView(context, repeated);
        }
        String scopeCode = "TENANT:" + context.tenantId();
        if (definitionRepository.findByScopeCodeAndCode(scopeCode, code).isPresent()) {
            throw conflict("ITEM_ATTRIBUTE_DEFINITION_CODE_DUPLICATE", "当前租户已存在相同属性编码");
        }
        ValidatedDefinition validated = validateDefinition(command, null);
        ItemAttributeDefinition definition = new ItemAttributeDefinition(context.tenantId(), code,
                command.name(), command.description(), validated.dataType(), validated.cardinality(),
                command.dictionaryId(), command.unitCode(), validated.schemaJson(), validated.defaultJson(),
                validated.variability(), validated.overridePolicy(), validated.allowedScopeJson(),
                validated.contextBasis(), validated.sensitivity(), context.subjectId());
        validateDefault(definition, command.defaultValue());
        definitionRepository.saveAndFlush(definition);
        appendDefinition(context, definition, "CREATE", null, snapshot(definition),
                command.reason(), command.requestCode());
        return definitionView(context, definition);
    }

    @Transactional
    public AttributeDefinitionView updateDefinition(Long id, long expectedRevision, DefinitionUpdateCommand command) {
        ExecutionContext context = currentWithActor();
        ItemAttributeDefinition definition = requireOwnedDefinition(id, context.tenantId());
        ItemAttributeChange prior = prior(command.requestCode(), context.tenantId(), "DEFINITION");
        if (prior != null) {
            if (!Objects.equals(prior.attributeDefinitionId(), id)) {
                throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性定义变更");
            }
            return definitionView(context, definition);
        }
        requireRevision(definition.revision(), expectedRevision, "ITEM_ATTRIBUTE_DEFINITION_REVISION_STALE");
        ValidatedDefinition validated = validateDefinition(command.asDefinitionCommand(definition.code()), definition);
        boolean hasValues = valueRepository.existsByAttributeDefinitionId(id)
                || overrideRepository.existsByAttributeDefinitionId(id);
        if (hasValues && structuralChanged(definition, command, validated)) {
            throw conflict("ITEM_ATTRIBUTE_DEFINITION_IN_USE", "属性已有历史值，只能修改名称、说明、默认值和敏感级别");
        }
        String before = snapshot(definition);
        definition.update(expectedRevision, command.name(), command.description(), validated.dataType(),
                validated.cardinality(), command.dictionaryId(), command.unitCode(), validated.schemaJson(),
                validated.defaultJson(), validated.variability(), validated.overridePolicy(),
                validated.allowedScopeJson(), validated.contextBasis(), validated.sensitivity(), context.subjectId());
        validateDefault(definition, command.defaultValue());
        definitionRepository.saveAndFlush(definition);
        appendDefinition(context, definition, "UPDATE", before, snapshot(definition),
                command.reason(), command.requestCode());
        return definitionView(context, definition);
    }

    @Transactional
    public AttributeDefinitionView changeDefinitionStatus(Long id, long expectedRevision, String status,
                                                          String reason, String requestCode) {
        ExecutionContext context = currentWithActor();
        ItemAttributeDefinition definition = requireOwnedDefinition(id, context.tenantId());
        ItemAttributeChange prior = prior(requestCode, context.tenantId(), "DEFINITION");
        if (prior != null) {
            if (!Objects.equals(prior.attributeDefinitionId(), id)) {
                throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性定义变更");
            }
            return definitionView(context, definition);
        }
        requireRevision(definition.revision(), expectedRevision, "ITEM_ATTRIBUTE_DEFINITION_REVISION_STALE");
        String normalized = normalize(status);
        String before = snapshot(definition);
        definition.changeStatus(expectedRevision, normalized, context.subjectId());
        definitionRepository.saveAndFlush(definition);
        appendDefinition(context, definition, "ACTIVE".equals(normalized) ? "ENABLE" : "DISABLE",
                before, snapshot(definition), reason, requestCode);
        return definitionView(context, definition);
    }

    @Transactional
    public TypeAttributeView createAssignment(AssignmentCommand command) {
        ExecutionContext context = currentWithActor();
        ItemAttributeDefinition definition = requireOwnedDefinition(command.definitionId(), context.tenantId());
        requireActive(definition);
        ItemType type = requireVisibleType(command.itemTypeId(), context.tenantId());
        ItemAttributeChange prior = prior(command.requestCode(), context.tenantId(), "TYPE_ASSIGNMENT");
        if (prior != null) {
            if (!Objects.equals(prior.attributeDefinitionId(), definition.id())
                    || !Objects.equals(prior.itemTypeId(), type.id())) {
                throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性装配变更");
            }
            ItemTypeAttribute repeated = assignmentRepository.findById(prior.itemTypeAttributeId())
                    .orElseThrow(() -> notFound("ITEM_TYPE_ATTRIBUTE_NOT_FOUND", "未找到属性装配"));
            return assignmentView(context, repeated);
        }
        if (assignmentRepository.findByItemTypeIdAndAttributeDefinitionId(type.id(), definition.id()).isPresent()) {
            throw conflict("ITEM_TYPE_ATTRIBUTE_DUPLICATE", "属性已经装配到该项目类型");
        }
        ValidatedAssignment validated = validateAssignment(command, definition, null);
        ItemTypeAttribute assignment = new ItemTypeAttribute(type.id(), definition.id(), command.required(),
                validated.defaultJson(), validated.widgetType(), command.groupName(), command.groupSortOrder(),
                command.attributeSortOrder(), validated.visibleConditionJson(), validated.requiredConditionJson(),
                command.searchable(), command.listDisplay(), context.subjectId());
        assignmentRepository.saveAndFlush(assignment);
        appendAssignment(context, definition.id(), assignment, "CREATE", null, snapshot(assignment),
                command.reason(), command.requestCode());
        return assignmentView(context, assignment);
    }

    @Transactional
    public TypeAttributeView updateAssignment(Long id, long expectedRevision, AssignmentUpdateCommand command) {
        ExecutionContext context = currentWithActor();
        ItemTypeAttribute assignment = assignmentRepository.findById(id)
                .orElseThrow(() -> notFound("ITEM_TYPE_ATTRIBUTE_NOT_FOUND", "未找到属性装配"));
        ItemAttributeDefinition definition = requireOwnedDefinition(assignment.attributeDefinitionId(), context.tenantId());
        requireVisibleType(assignment.itemTypeId(), context.tenantId());
        ItemAttributeChange prior = prior(command.requestCode(), context.tenantId(), "TYPE_ASSIGNMENT");
        if (prior != null) {
            if (!Objects.equals(prior.itemTypeAttributeId(), id)) {
                throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性装配变更");
            }
            return assignmentView(context, assignment);
        }
        requireRevision(assignment.revision(), expectedRevision, "ITEM_TYPE_ATTRIBUTE_REVISION_STALE");
        ValidatedAssignment validated = validateAssignment(command.asAssignmentCommand(
                assignment.itemTypeId(), assignment.attributeDefinitionId()), definition, assignment.id());
        String before = snapshot(assignment);
        assignment.update(expectedRevision, command.required(), validated.defaultJson(), validated.widgetType(),
                command.groupName(), command.groupSortOrder(), command.attributeSortOrder(),
                validated.visibleConditionJson(), validated.requiredConditionJson(), command.searchable(),
                command.listDisplay(), context.subjectId());
        assignmentRepository.saveAndFlush(assignment);
        appendAssignment(context, definition.id(), assignment, "UPDATE", before, snapshot(assignment),
                command.reason(), command.requestCode());
        return assignmentView(context, assignment);
    }

    @Transactional
    public TypeAttributeView changeAssignmentStatus(Long id, long expectedRevision, String status,
                                                    String reason, String requestCode) {
        ExecutionContext context = currentWithActor();
        ItemTypeAttribute assignment = assignmentRepository.findById(id)
                .orElseThrow(() -> notFound("ITEM_TYPE_ATTRIBUTE_NOT_FOUND", "未找到属性装配"));
        ItemAttributeDefinition definition = requireOwnedDefinition(assignment.attributeDefinitionId(), context.tenantId());
        ItemAttributeChange prior = prior(requestCode, context.tenantId(), "TYPE_ASSIGNMENT");
        if (prior != null) {
            if (!Objects.equals(prior.itemTypeAttributeId(), id)) {
                throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性装配变更");
            }
            return assignmentView(context, assignment);
        }
        requireRevision(assignment.revision(), expectedRevision, "ITEM_TYPE_ATTRIBUTE_REVISION_STALE");
        String normalized = normalize(status);
        String before = snapshot(assignment);
        assignment.changeStatus(expectedRevision, normalized, context.subjectId());
        assignmentRepository.saveAndFlush(assignment);
        appendAssignment(context, definition.id(), assignment,
                "ACTIVE".equals(normalized) ? "ENABLE" : "DISABLE", before, snapshot(assignment),
                reason, requestCode);
        return assignmentView(context, assignment);
    }

    private ValidatedDefinition validateDefinition(DefinitionCommand command, ItemAttributeDefinition existing) {
        String dataType = normalize(command.dataType());
        String cardinality = normalize(command.cardinality());
        String variability = normalize(command.variability());
        String contextBasis = normalize(command.contextBasis());
        String sensitivity = normalize(command.sensitivity());
        requireOne(DATA_TYPES, dataType, "ITEM_ATTRIBUTE_DATA_TYPE_INVALID", "不支持的数据类型");
        requireOne(CARDINALITIES, cardinality, "ITEM_ATTRIBUTE_CARDINALITY_INVALID", "不支持的属性基数");
        requireOne(VARIABILITIES, variability, "ITEM_ATTRIBUTE_VARIABILITY_INVALID", "不支持的属性可变性");
        requireOne(CONTEXT_BASES, contextBasis, "ITEM_ATTRIBUTE_CONTEXT_INVALID", "不支持的上下文依据");
        requireOne(SENSITIVITIES, sensitivity, "ITEM_ATTRIBUTE_SENSITIVITY_INVALID", "不支持的敏感级别");
        if ("DICT_REF".equals(dataType)) {
            if (command.dictionaryId() == null) throw badRequest("ITEM_ATTRIBUTE_DICTIONARY_REQUIRED", "字典引用属性必须选择字典");
            dictionaryDirectory.resolveActiveItems(current().tenantId(), command.dictionaryId());
        } else if (command.dictionaryId() != null) {
            throw badRequest("ITEM_ATTRIBUTE_DICTIONARY_NOT_ALLOWED", "只有字典引用属性可以绑定字典");
        }
        JsonNode schema = command.schema();
        if (schema == null || !schema.isObject()) throw badRequest("ITEM_ATTRIBUTE_SCHEMA_INVALID", "JSON Schema 必须是对象");
        validateSchemaType(dataType, cardinality, schema);
        JsonNode enumSchema = "MULTIPLE".equals(cardinality) ? schema.path("items") : schema;
        if ("ENUM".equals(dataType) && (!enumSchema.path("enum").isArray() || enumSchema.path("enum").isEmpty())) {
            throw badRequest("ITEM_ATTRIBUTE_ENUM_REQUIRED", "枚举属性必须配置非空 enum");
        }
        List<String> allowedScopes = normalizedScopes(command.allowedScopes());
        String overridePolicy;
        if ("BASE_ONLY".equals(variability)) {
            if (!allowedScopes.isEmpty()) throw badRequest("ITEM_ATTRIBUTE_SCOPE_NOT_ALLOWED", "基础值属性不能配置覆盖作用域");
            overridePolicy = "NO_OVERRIDE";
        } else if ("LOCAL_ONLY".equals(variability)) {
            if (allowedScopes.isEmpty()) throw badRequest("ITEM_ATTRIBUTE_SCOPE_REQUIRED", "本地专属属性至少需要一个作用域");
            overridePolicy = "NO_OVERRIDE";
        } else {
            if (allowedScopes.isEmpty()) throw badRequest("ITEM_ATTRIBUTE_SCOPE_REQUIRED", "可覆盖属性至少需要一个作用域");
            overridePolicy = normalize(command.overridePolicy());
            if (!"ANY".equals(overridePolicy)) {
                throw badRequest("ITEM_ATTRIBUTE_RESTRICTIVE_RULE_REQUIRED", "本轮租户属性仅支持任意覆盖；限制性覆盖需先配置比较规则");
            }
        }
        String schemaJson = jsonCodec.write(schema);
        maintenanceService.validateSchemaDocument(schemaJson);
        String defaultJson = command.defaultValue() == null || command.defaultValue().isNull()
                ? null : jsonCodec.write(command.defaultValue());
        return new ValidatedDefinition(dataType, cardinality, schemaJson, defaultJson, variability,
                overridePolicy, jsonCodec.write(allowedScopes), contextBasis, sensitivity);
    }

    private ValidatedAssignment validateAssignment(AssignmentCommand command,
                                                   ItemAttributeDefinition definition, Long currentId) {
        String widget = normalize(command.widgetType());
        requireOne(WIDGETS, widget, "ITEM_ATTRIBUTE_WIDGET_INVALID", "不支持的维护控件");
        if (command.groupSortOrder() < 0 || command.attributeSortOrder() < 0) {
            throw badRequest("ITEM_ATTRIBUTE_ORDER_INVALID", "分组和属性排序不能小于 0");
        }
        Long ignored = currentId == null ? -1L : currentId;
        if (assignmentRepository.existsTenantOrderCollision(current().tenantId(), command.itemTypeId(),
                command.groupSortOrder(), command.attributeSortOrder(), ignored)) {
            throw conflict("ITEM_TYPE_ATTRIBUTE_ORDER_DUPLICATE", "同一项目类型内分组和属性排序不能重复");
        }
        if (command.searchable()) {
            throw badRequest("ITEM_ATTRIBUTE_SEARCH_PROJECTION_REQUIRED", "动态属性启用检索前必须先建立受控强类型投影");
        }
        validateCondition(command.visibleCondition(), "显示条件");
        validateCondition(command.requiredCondition(), "必填条件");
        if (command.defaultValue() != null && !command.defaultValue().isNull()) {
            maintenanceService.validateConfiguredValue(definition, command.defaultValue());
        }
        return new ValidatedAssignment(command.defaultValue() == null || command.defaultValue().isNull()
                ? null : jsonCodec.write(command.defaultValue()), widget,
                optionalJson(command.visibleCondition()), optionalJson(command.requiredCondition()));
    }

    private void validateDefault(ItemAttributeDefinition definition, JsonNode value) {
        if (value != null && !value.isNull()) maintenanceService.validateConfiguredValue(definition, value);
    }

    private void validateSchemaType(String dataType, String cardinality, JsonNode schema) {
        JsonNode declared = schema.get("type");
        if ("MULTIPLE".equals(cardinality)) {
            if (!declares(declared, "array")) throw badRequest("ITEM_ATTRIBUTE_SCHEMA_INVALID", "多值属性 Schema 类型必须是 array");
            JsonNode items = schema.get("items");
            if (items == null || !items.isObject() || !declares(items.get("type"), jsonType(dataType))) {
                throw badRequest("ITEM_ATTRIBUTE_SCHEMA_INVALID", "多值属性 items 类型与数据类型不一致");
            }
        } else if (!declares(declared, jsonType(dataType))) {
            throw badRequest("ITEM_ATTRIBUTE_SCHEMA_INVALID", "JSON Schema type 与属性数据类型不一致");
        }
    }

    private boolean structuralChanged(ItemAttributeDefinition current, DefinitionUpdateCommand command,
                                      ValidatedDefinition validated) {
        return !current.dataType().equals(validated.dataType())
                || !current.cardinality().equals(validated.cardinality())
                || !Objects.equals(current.dictionaryId(), command.dictionaryId())
                || !Objects.equals(current.unitCode(), clean(command.unitCode()))
                || !json(current.schemaJson()).equals(command.schema())
                || !current.variability().equals(validated.variability())
                || !current.overridePolicy().equals(validated.overridePolicy())
                || !json(current.allowedScopeJson()).equals(json(validated.allowedScopeJson()))
                || !current.contextBasis().equals(validated.contextBasis());
    }

    private void validateCondition(JsonNode condition, String label) {
        if (condition != null && !condition.isNull() && !condition.isObject()) {
            throw badRequest("ITEM_ATTRIBUTE_CONDITION_INVALID", label + "必须是 JSON 对象");
        }
    }

    private String optionalJson(JsonNode value) {
        return value == null || value.isNull() || (value.isObject() && value.isEmpty()) ? null : jsonCodec.write(value);
    }

    private List<String> normalizedScopes(List<String> values) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        if (values != null) values.forEach(value -> {
            String normalized = normalize(value);
            requireOne(SCOPES, normalized, "ITEM_ATTRIBUTE_SCOPE_INVALID", "不支持的属性作用域");
            result.add(normalized);
        });
        return List.copyOf(result);
    }

    private boolean declares(JsonNode declared, String expected) {
        if (declared == null) return false;
        if (declared.isArray()) {
            for (JsonNode value : declared) if (expected.equals(value.asText())) return true;
            return false;
        }
        return expected.equals(declared.asText());
    }

    private String jsonType(String dataType) {
        return switch (dataType) {
            case "BOOLEAN" -> "boolean";
            case "INTEGER" -> "integer";
            case "DECIMAL" -> "number";
            case "TERM_REF", "OBJECT" -> "object";
            default -> "string";
        };
    }

    private void requireDefinitionCode(String code, String namespace) {
        if (!CODE.matcher(code).matches()) throw badRequest("ITEM_ATTRIBUTE_CODE_INVALID", "属性编码格式不正确");
        if (!code.startsWith(namespace)) {
            throw badRequest("ITEM_ATTRIBUTE_NAMESPACE_REQUIRED", "租户属性编码必须以 " + namespace + " 开头");
        }
    }

    private String namespace(Long tenantId) {
        String code = organizationDirectory.requireTenant(tenantId).code().trim().toUpperCase(Locale.ROOT);
        return "TNT." + code + ".";
    }

    private ItemAttributeDefinition requireOwnedDefinition(Long id, Long tenantId) {
        return definitionRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_DEFINITION_NOT_FOUND", "未找到当前租户可维护的属性定义"));
    }

    private ItemType requireVisibleType(Long id, Long tenantId) {
        ItemType value = itemTypeRepository.findById(id)
                .orElseThrow(() -> notFound("ITEM_TYPE_NOT_FOUND", "未找到项目类型"));
        if (!"ACTIVE".equals(value.status()) || !("PLATFORM".equals(value.scopeType())
                || Objects.equals(value.tenantId(), tenantId))) {
            throw notFound("ITEM_TYPE_NOT_FOUND", "未找到当前租户可用的项目类型");
        }
        return value;
    }

    private void requireActive(ItemAttributeDefinition value) {
        if (!"ACTIVE".equals(value.status())) throw conflict("ITEM_ATTRIBUTE_DEFINITION_INACTIVE", "属性定义已停用");
    }

    private ItemAttributeChange prior(String requestCode, Long tenantId, String targetType) {
        if (blank(requestCode)) throw badRequest("REQUEST_CODE_REQUIRED", "请求编码不能为空");
        ItemAttributeChange value = changeRepository.findByRequestCode(requestCode.trim()).orElse(null);
        if (value == null) return null;
        if (!Objects.equals(value.tenantId(), tenantId) || !targetType.equals(value.targetType())) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性配置变更");
        }
        return value;
    }

    private void appendDefinition(ExecutionContext context, ItemAttributeDefinition definition, String changeType,
                                  String before, String after, String reason, String requestCode) {
        changeRepository.save(ItemAttributeChange.definition(context.tenantId(), definition.id(), changeType,
                before, after, requireReason(reason), requestCode, context.subjectId()));
    }

    private void appendAssignment(ExecutionContext context, Long definitionId, ItemTypeAttribute assignment,
                                  String changeType, String before, String after,
                                  String reason, String requestCode) {
        changeRepository.save(ItemAttributeChange.assignment(context.tenantId(), definitionId,
                assignment.itemTypeId(), assignment.id(), changeType, before, after,
                requireReason(reason), requestCode, context.subjectId()));
    }

    private String requireReason(String value) {
        if (blank(value)) throw badRequest("ITEM_ATTRIBUTE_CHANGE_REASON_REQUIRED", "变更原因不能为空");
        String result = value.trim();
        if (result.length() > 1000) throw badRequest("ITEM_ATTRIBUTE_CHANGE_REASON_INVALID", "变更原因长度不能超过 1000");
        return result;
    }

    private void requireRevision(long current, long expected, String code) {
        if (current != expected) throw conflict(code, "配置已被其他用户修改，请刷新后重试");
    }

    private void requireOne(Set<String> values, String value, String code, String message) {
        if (!values.contains(value)) throw badRequest(code, message + "：" + value);
    }

    private ItemTypeOption typeView(ItemType value) {
        return new ItemTypeOption(value.id(), value.code(), value.name(), value.subjectType(), value.parentId(),
                value.scopeType(), value.sortOrder());
    }

    private AttributeDefinitionView definitionView(ExecutionContext context, ItemAttributeDefinition value) {
        return new AttributeDefinitionView(value.id(), value.revision(), value.scopeType(), value.tenantId(),
                value.code(), value.name(), value.description(), value.dataType(), value.cardinality(),
                value.dictionaryId(), value.unitCode(), json(value.schemaJson()), json(value.defaultJson()),
                value.variability(), value.overridePolicy(), stringList(value.allowedScopeJson()),
                value.contextBasis(), value.storageMode(), value.projectionField(), value.sensitivity(),
                value.status(), Objects.equals(value.tenantId(), context.tenantId()));
    }

    private TypeAttributeView assignmentView(ExecutionContext context, ItemTypeAttribute value) {
        ItemAttributeDefinition definition = definitionRepository.findById(value.attributeDefinitionId()).orElseThrow();
        return new TypeAttributeView(value.id(), value.revision(), value.itemTypeId(), value.attributeDefinitionId(),
                value.requiredValue(), json(value.defaultJson()), value.widgetType(), value.groupName(),
                value.groupSortOrder(), value.attributeSortOrder(), json(value.visibleConditionJson()),
                json(value.requiredConditionJson()), value.searchable(), value.listDisplay(), value.status(),
                Objects.equals(definition.tenantId(), context.tenantId()));
    }

    private String snapshot(ItemAttributeDefinition value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id()); result.put("revision", value.revision()); result.put("code", value.code());
        result.put("name", value.name()); result.put("description", value.description());
        result.put("dataType", value.dataType()); result.put("cardinality", value.cardinality());
        result.put("dictionaryId", value.dictionaryId()); result.put("unitCode", value.unitCode());
        result.put("schema", json(value.schemaJson())); result.put("defaultValue", json(value.defaultJson()));
        result.put("variability", value.variability()); result.put("overridePolicy", value.overridePolicy());
        result.put("allowedScopes", json(value.allowedScopeJson())); result.put("contextBasis", value.contextBasis());
        result.put("sensitivity", value.sensitivity()); result.put("status", value.status());
        return jsonCodec.write(result);
    }

    private String snapshot(ItemTypeAttribute value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id()); result.put("revision", value.revision());
        result.put("itemTypeId", value.itemTypeId()); result.put("definitionId", value.attributeDefinitionId());
        result.put("required", value.requiredValue()); result.put("defaultValue", json(value.defaultJson()));
        result.put("widgetType", value.widgetType()); result.put("groupName", value.groupName());
        result.put("groupSortOrder", value.groupSortOrder()); result.put("attributeSortOrder", value.attributeSortOrder());
        result.put("visibleCondition", json(value.visibleConditionJson()));
        result.put("requiredCondition", json(value.requiredConditionJson()));
        result.put("searchable", value.searchable()); result.put("listDisplay", value.listDisplay());
        result.put("status", value.status());
        return jsonCodec.write(result);
    }

    private JsonNode json(String value) {
        return value == null ? null : jsonCodec.readTree(value);
    }

    private List<String> stringList(String value) {
        JsonNode node = json(value);
        List<String> result = new ArrayList<>();
        if (node != null && node.isArray()) for (JsonNode item : node) result.add(item.asText());
        return List.copyOf(result);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private String clean(String value) {
        return blank(value) ? null : value.trim();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private ExecutionContext current() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.tenantId() == null || context.tenantId() <= 0) {
            throw badRequest("ITEM_ATTRIBUTE_TENANT_REQUIRED", "属性配置必须在租户上下文中执行");
        }
        return context;
    }

    private ExecutionContext currentWithActor() {
        ExecutionContext context = current();
        if (context.subjectId() == null || context.subjectId() <= 0) {
            throw badRequest("ITEM_ATTRIBUTE_ACTOR_REQUIRED", "属性配置必须由可审计用户发起");
        }
        return context;
    }

    private record ValidatedDefinition(String dataType, String cardinality, String schemaJson,
                                       String defaultJson, String variability, String overridePolicy,
                                       String allowedScopeJson, String contextBasis, String sensitivity) {}

    private record ValidatedAssignment(String defaultJson, String widgetType,
                                       String visibleConditionJson, String requiredConditionJson) {}

    public record DefinitionCommand(
            String code, String name, String description, String dataType, String cardinality,
            Long dictionaryId, String unitCode, JsonNode schema, JsonNode defaultValue,
            String variability, String overridePolicy, List<String> allowedScopes,
            String contextBasis, String sensitivity, String reason, String requestCode) {}

    public record DefinitionUpdateCommand(
            String name, String description, String dataType, String cardinality,
            Long dictionaryId, String unitCode, JsonNode schema, JsonNode defaultValue,
            String variability, String overridePolicy, List<String> allowedScopes,
            String contextBasis, String sensitivity, String reason, String requestCode) {
        DefinitionCommand asDefinitionCommand(String code) {
            return new DefinitionCommand(code, name, description, dataType, cardinality, dictionaryId,
                    unitCode, schema, defaultValue, variability, overridePolicy, allowedScopes,
                    contextBasis, sensitivity, reason, requestCode);
        }
    }

    public record AssignmentCommand(
            Long itemTypeId, Long definitionId, boolean required, JsonNode defaultValue,
            String widgetType, String groupName, int groupSortOrder, int attributeSortOrder,
            JsonNode visibleCondition, JsonNode requiredCondition, boolean searchable,
            boolean listDisplay, String reason, String requestCode) {}

    public record AssignmentUpdateCommand(
            boolean required, JsonNode defaultValue, String widgetType, String groupName,
            int groupSortOrder, int attributeSortOrder, JsonNode visibleCondition,
            JsonNode requiredCondition, boolean searchable, boolean listDisplay,
            String reason, String requestCode) {
        AssignmentCommand asAssignmentCommand(Long itemTypeId, Long definitionId) {
            return new AssignmentCommand(itemTypeId, definitionId, required, defaultValue, widgetType,
                    groupName, groupSortOrder, attributeSortOrder, visibleCondition, requiredCondition,
                    searchable, listDisplay, reason, requestCode);
        }
    }
}
