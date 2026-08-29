package com.rhn.platform.masterdata.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeChangeView;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeMaintenanceResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeOverrideView;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeSchemaResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeSchemaView;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeValueView;
import com.rhn.platform.masterdata.domain.ItemAttributeChange;
import com.rhn.platform.masterdata.domain.ItemAttributeDefinition;
import com.rhn.platform.masterdata.domain.ItemAttributeOverride;
import com.rhn.platform.masterdata.domain.ItemAttributeValue;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeChangeRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeDefinitionRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeOverrideRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeValueRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ItemAttributeMaintenanceService {
    private final ItemAttributeResolutionService resolutionService;
    private final ItemAttributeDefinitionRepository definitionRepository;
    private final ItemAttributeValueRepository valueRepository;
    private final ItemAttributeOverrideRepository overrideRepository;
    private final ItemAttributeChangeRepository changeRepository;
    private final DictionaryDirectory dictionaryDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public ItemAttributeMaintenanceService(ItemAttributeResolutionService resolutionService,
                                           ItemAttributeDefinitionRepository definitionRepository,
                                           ItemAttributeValueRepository valueRepository,
                                           ItemAttributeOverrideRepository overrideRepository,
                                           ItemAttributeChangeRepository changeRepository,
                                           DictionaryDirectory dictionaryDirectory,
                                           OrganizationDirectory organizationDirectory,
                                           ExecutionContextProvider contextProvider,
                                           JsonCodec jsonCodec) {
        this.resolutionService = resolutionService;
        this.definitionRepository = definitionRepository;
        this.valueRepository = valueRepository;
        this.overrideRepository = overrideRepository;
        this.changeRepository = changeRepository;
        this.dictionaryDirectory = dictionaryDirectory;
        this.organizationDirectory = organizationDirectory;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    public AttributeMaintenanceResponse maintenance(String subjectType, Long targetId, LocalDate businessDate) {
        AttributeSchemaResponse schema = resolutionService.schema(subjectType, targetId);
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        Map<Long, String> codes = definitionCodes(schema);
        List<AttributeValueView> values = valueRepository.findCurrent(List.of(schema.subjectId()), date).stream()
                .filter(value -> "TENANT".equals(value.scopeType()))
                .filter(value -> codes.containsKey(value.attributeDefinitionId()))
                .map(value -> valueView(value, codes.get(value.attributeDefinitionId())))
                .toList();
        List<AttributeOverrideView> overrides = overrideRepository.findCurrent(
                        current().tenantId(), schema.subjectId(), date).stream()
                .filter(value -> codes.containsKey(value.attributeDefinitionId()))
                .map(value -> overrideView(value, codes.get(value.attributeDefinitionId())))
                .toList();
        return new AttributeMaintenanceResponse(schema, values, overrides);
    }

    @Transactional(readOnly = true)
    public List<AttributeChangeView> changes(String subjectType, Long targetId) {
        AttributeSchemaResponse schema = resolutionService.schema(subjectType, targetId);
        Map<Long, String> codes = definitionCodes(schema);
        return changeRepository.findTop100ByTenantIdAndAttributeSubjectIdOrderByChangedAtDesc(
                        current().tenantId(), schema.subjectId()).stream()
                .map(value -> new AttributeChangeView(value.id(), value.attributeDefinitionId(),
                        codes.getOrDefault(value.attributeDefinitionId(), "UNKNOWN"), value.targetType(),
                        value.changeType(), value.scopeKey(), value.changeReason(), value.requestCode(),
                        value.changedAt(), value.changedBy()))
                .toList();
    }

    @Transactional
    public AttributeMaintenanceResponse saveBaseValue(BaseValueCommand command) {
        AttributeSchemaResponse schema = resolutionService.schema(command.subjectType(), command.targetId());
        AttributeSchemaView attribute = requireAttribute(schema, command.definitionId());
        ItemAttributeDefinition definition = requireDefinition(attribute.definitionId());
        requireExtension(definition);
        if ("LOCAL_ONLY".equals(definition.variability())) {
            throw badRequest("ITEM_ATTRIBUTE_BASE_VALUE_NOT_ALLOWED", "本地专属属性只能维护作用域覆盖值");
        }
        validateValue(definition, command.value());
        ExecutionContext context = currentWithActor();
        ItemAttributeChange repeated = repeated(command.requestCode(), schema.subjectId(), definition.id(), "BASE_VALUE");
        if (repeated != null) return maintenance(command.subjectType(), command.targetId(), command.validFrom());

        String scopeCode = "TENANT:" + context.tenantId();
        List<ItemAttributeValue> active = valueRepository
                .findByTenantIdAndAttributeSubjectIdAndAttributeDefinitionIdAndScopeCodeAndStatusOrderByValidFromDesc(
                        context.tenantId(), schema.subjectId(), definition.id(), scopeCode, "ACTIVE");
        ItemAttributeValue value = command.valueId() == null ? null : valueRepository
                .findByIdAndTenantIdAndAttributeSubjectId(command.valueId(), context.tenantId(), schema.subjectId())
                .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_VALUE_NOT_FOUND", "未找到待更新的属性值"));
        if (value != null && !value.attributeDefinitionId().equals(definition.id())) {
            throw conflict("ITEM_ATTRIBUTE_VALUE_TARGET_MISMATCH", "属性值不属于当前属性定义");
        }
        assertNoOverlap(active, value == null ? null : value.id(), command.validFrom(), command.validTo());
        String before = value == null ? null : snapshot(value);
        String valueJson = jsonCodec.write(command.value());
        String changeType;
        if (value == null) {
            if (command.expectedRevision() != null) {
                throw conflict("ITEM_ATTRIBUTE_VALUE_REVISION_CONFLICT", "属性值尚未创建，请刷新后重试");
            }
            value = valueRepository.saveAndFlush(new ItemAttributeValue(context.tenantId(), schema.subjectId(),
                    definition.id(), valueJson, command.validFrom(), command.validTo(), context.subjectId()));
            changeType = "CREATE";
        } else {
            requireRevision(value.revision(), command.expectedRevision(), "ITEM_ATTRIBUTE_VALUE_REVISION_STALE");
            value.update(command.expectedRevision(), valueJson, command.validFrom(), command.validTo(), context.subjectId());
            valueRepository.saveAndFlush(value);
            changeType = "UPDATE";
        }
        append(context, definition.id(), schema.subjectId(), value.id(), null, "BASE_VALUE", changeType,
                scopeCode, before, snapshot(value), command.reason(), command.requestCode());
        return maintenance(command.subjectType(), command.targetId(), command.validFrom());
    }

    @Transactional
    public AttributeMaintenanceResponse saveOverride(OverrideCommand command) {
        AttributeSchemaResponse schema = resolutionService.schema(command.subjectType(), command.targetId());
        AttributeSchemaView attribute = requireAttribute(schema, command.definitionId());
        ItemAttributeDefinition definition = requireDefinition(attribute.definitionId());
        requireExtension(definition);
        requireOverrideAllowed(attribute, definition, command.scopeType());
        ExecutionContext context = currentWithActor();
        ScopeTarget scope = validateScope(context, command.scopeType(), command.organizationId(), command.departmentId());
        if ("EXPLICIT_NULL".equals(command.valueMode())) {
            if (attribute.required()) {
                throw badRequest("ITEM_ATTRIBUTE_REQUIRED_NULL", "必填属性不能维护显式空值覆盖");
            }
            if (!schemaAllowsNull(parseSchema(definition.schemaJson()))) {
                throw badRequest("ITEM_ATTRIBUTE_NULL_NOT_ALLOWED", "属性 Schema 未声明允许空值");
            }
            if (command.value() != null && !command.value().isNull()) {
                throw badRequest("ITEM_ATTRIBUTE_EXPLICIT_NULL_VALUE", "显式空值模式不能携带属性值");
            }
        } else if ("OVERRIDE".equals(command.valueMode())) {
            validateValue(definition, command.value());
        } else {
            throw badRequest("ITEM_ATTRIBUTE_VALUE_MODE_INVALID", "属性覆盖值模式仅支持 OVERRIDE 或 EXPLICIT_NULL");
        }
        ItemAttributeChange repeated = repeated(command.requestCode(), schema.subjectId(), definition.id(), "SCOPE_OVERRIDE");
        if (repeated != null) return maintenance(command.subjectType(), command.targetId(), command.validFrom());

        List<ItemAttributeOverride> active = overrideRepository
                .findByTenantIdAndAttributeSubjectIdAndAttributeDefinitionIdAndScopeKeyAndStatusOrderByValidFromDesc(
                        context.tenantId(), schema.subjectId(), definition.id(), scope.scopeKey(), "ACTIVE");
        ItemAttributeOverride value = command.overrideId() == null ? null : overrideRepository
                .findByIdAndTenantIdAndAttributeSubjectId(command.overrideId(), context.tenantId(), schema.subjectId())
                .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_OVERRIDE_NOT_FOUND", "未找到待更新的属性覆盖值"));
        if (value != null && (!value.attributeDefinitionId().equals(definition.id())
                || !value.scopeKey().equals(scope.scopeKey()))) {
            throw conflict("ITEM_ATTRIBUTE_OVERRIDE_TARGET_MISMATCH", "属性覆盖值不属于当前属性或作用域");
        }
        assertNoOverlap(active, value == null ? null : value.id(), command.validFrom(), command.validTo());
        String before = value == null ? null : snapshot(value);
        String valueJson = "OVERRIDE".equals(command.valueMode()) ? jsonCodec.write(command.value()) : null;
        String changeType;
        if (value == null) {
            if (command.expectedRevision() != null) {
                throw conflict("ITEM_ATTRIBUTE_OVERRIDE_REVISION_CONFLICT", "属性覆盖值尚未创建，请刷新后重试");
            }
            value = overrideRepository.saveAndFlush(new ItemAttributeOverride(context.tenantId(), schema.subjectId(),
                    definition.id(), command.scopeType(), scope.scopeKey(), scope.organizationId(), scope.departmentId(),
                    command.valueMode(), valueJson, command.validFrom(), command.validTo(), context.subjectId()));
            changeType = "CREATE";
        } else {
            requireRevision(value.revision(), command.expectedRevision(), "ITEM_ATTRIBUTE_OVERRIDE_REVISION_STALE");
            value.update(command.expectedRevision(), command.valueMode(), valueJson,
                    command.validFrom(), command.validTo(), context.subjectId());
            overrideRepository.saveAndFlush(value);
            changeType = "UPDATE";
        }
        append(context, definition.id(), schema.subjectId(), null, value.id(), "SCOPE_OVERRIDE", changeType,
                scope.scopeKey(), before, snapshot(value), command.reason(), command.requestCode());
        return maintenance(command.subjectType(), command.targetId(), command.validFrom());
    }

    @Transactional
    public AttributeMaintenanceResponse disableBaseValue(String subjectType, Long targetId, Long definitionId,
                                                         Long valueId, long expectedRevision,
                                                         String reason, String requestCode) {
        AttributeSchemaResponse schema = resolutionService.schema(subjectType, targetId);
        requireAttribute(schema, definitionId);
        ExecutionContext context = currentWithActor();
        ItemAttributeChange repeated = repeated(requestCode, schema.subjectId(), definitionId, "BASE_VALUE");
        if (repeated != null) return maintenance(subjectType, targetId, LocalDate.now());
        ItemAttributeValue value = valueRepository
                .findByIdAndTenantIdAndAttributeSubjectId(valueId, context.tenantId(), schema.subjectId())
                .filter(item -> item.attributeDefinitionId().equals(definitionId))
                .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_VALUE_NOT_FOUND", "未找到待停用的属性值"));
        requireRevision(value.revision(), expectedRevision, "ITEM_ATTRIBUTE_VALUE_REVISION_STALE");
        String before = snapshot(value);
        value.disable(expectedRevision, context.subjectId());
        valueRepository.saveAndFlush(value);
        append(context, definitionId, schema.subjectId(), value.id(), null, "BASE_VALUE", "DISABLE",
                value.scopeCode(), before, snapshot(value), reason, requestCode);
        return maintenance(subjectType, targetId, LocalDate.now());
    }

    @Transactional
    public AttributeMaintenanceResponse disableOverride(String subjectType, Long targetId, Long definitionId,
                                                        Long overrideId, long expectedRevision,
                                                        String reason, String requestCode) {
        AttributeSchemaResponse schema = resolutionService.schema(subjectType, targetId);
        requireAttribute(schema, definitionId);
        ExecutionContext context = currentWithActor();
        ItemAttributeChange repeated = repeated(requestCode, schema.subjectId(), definitionId, "SCOPE_OVERRIDE");
        if (repeated != null) return maintenance(subjectType, targetId, LocalDate.now());
        ItemAttributeOverride value = overrideRepository
                .findByIdAndTenantIdAndAttributeSubjectId(overrideId, context.tenantId(), schema.subjectId())
                .filter(item -> item.attributeDefinitionId().equals(definitionId))
                .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_OVERRIDE_NOT_FOUND", "未找到待停用的属性覆盖值"));
        requireRevision(value.revision(), expectedRevision, "ITEM_ATTRIBUTE_OVERRIDE_REVISION_STALE");
        String before = snapshot(value);
        value.disable(expectedRevision, context.subjectId());
        overrideRepository.saveAndFlush(value);
        append(context, definitionId, schema.subjectId(), null, value.id(), "SCOPE_OVERRIDE", "DISABLE",
                value.scopeKey(), before, snapshot(value), reason, requestCode);
        return maintenance(subjectType, targetId, LocalDate.now());
    }

    private void validateValue(ItemAttributeDefinition definition, JsonNode value) {
        if (value == null || value.isNull()) throw badRequest("ITEM_ATTRIBUTE_VALUE_REQUIRED", "属性值不能为空");
        if ("MULTIPLE".equals(definition.cardinality())) {
            if (!value.isArray()) throw badRequest("ITEM_ATTRIBUTE_CARDINALITY_MISMATCH", "多值属性必须提交 JSON 数组");
            JsonNode schema = parseSchema(definition.schemaJson());
            JsonNode itemSchema = schema.get("items");
            for (JsonNode item : value) validateScalar(definition, item, itemSchema == null ? schema : itemSchema);
            validateArrayKeywords(value, schema);
            return;
        }
        if (value.isArray()) throw badRequest("ITEM_ATTRIBUTE_CARDINALITY_MISMATCH", "单值属性不能提交 JSON 数组");
        validateScalar(definition, value, parseSchema(definition.schemaJson()));
        if ("DICT_REF".equals(definition.dataType())) {
            String code = value.asText();
            boolean found = dictionaryDirectory.resolveActiveItems(current().tenantId(), definition.dictionaryId())
                    .stream().anyMatch(item -> item.code().equals(code));
            if (!found) throw badRequest("ITEM_ATTRIBUTE_DICTIONARY_VALUE_INVALID", "属性值不是字典中的有效编码");
        }
    }

    private void validateScalar(ItemAttributeDefinition definition, JsonNode value, JsonNode schema) {
        boolean typeMatches = switch (definition.dataType()) {
            case "BOOLEAN" -> value.isBoolean();
            case "INTEGER" -> value.isIntegralNumber();
            case "DECIMAL" -> value.isNumber();
            case "TEXT", "ENUM", "DATE", "DATETIME", "DURATION", "DICT_REF" -> value.isString();
            case "TERM_REF", "OBJECT" -> value.isObject();
            default -> false;
        };
        if (!typeMatches) {
            throw badRequest("ITEM_ATTRIBUTE_TYPE_MISMATCH", "属性值与声明类型 " + definition.dataType() + " 不匹配");
        }
        validateTemporal(definition.dataType(), value);
        validateAgainstSchema(value, schema);
    }

    private void validateTemporal(String dataType, JsonNode value) {
        try {
            if ("DATE".equals(dataType)) LocalDate.parse(value.asText());
            if ("DATETIME".equals(dataType)) {
                try { Instant.parse(value.asText()); }
                catch (DateTimeParseException ignored) { OffsetDateTime.parse(value.asText()); }
            }
            if ("DURATION".equals(dataType)) Duration.parse(value.asText());
        } catch (DateTimeParseException exception) {
            throw badRequest("ITEM_ATTRIBUTE_TEMPORAL_FORMAT_INVALID", "日期时间属性必须使用 ISO-8601 格式");
        }
    }

    private JsonNode parseSchema(String schemaJson) {
        JsonNode schema;
        try { schema = jsonCodec.readTree(schemaJson); }
        catch (RuntimeException exception) { throw badRequest("ITEM_ATTRIBUTE_SCHEMA_INVALID", "属性 JSON Schema 不合法"); }
        if (!schema.isObject()) throw badRequest("ITEM_ATTRIBUTE_SCHEMA_INVALID", "属性 JSON Schema 必须是对象");
        return schema;
    }

    private void validateAgainstSchema(JsonNode value, JsonNode schema) {
        if (schema == null || !schema.isObject()) return;
        if (schema.has("type") && !schemaTypeMatches(schema.get("type"), value)) {
            throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值与 JSON Schema type 不匹配");
        }
        JsonNode enumeration = schema.get("enum");
        if (enumeration != null && enumeration.isArray()) {
            boolean found = false;
            for (JsonNode option : enumeration) if (option.equals(value)) found = true;
            if (!found) throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值不在允许的枚举范围内");
        }
        if (value.isNumber()) {
            BigDecimal number = value.decimalValue();
            if (schema.has("minimum") && number.compareTo(schema.get("minimum").decimalValue()) < 0) {
                throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值小于允许的最小值");
            }
            if (schema.has("maximum") && number.compareTo(schema.get("maximum").decimalValue()) > 0) {
                throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值大于允许的最大值");
            }
        }
        if (value.isString()) {
            int length = value.asText().length();
            if (schema.has("minLength") && length < schema.get("minLength").asInt()) {
                throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值长度小于允许的最小长度");
            }
            if (schema.has("maxLength") && length > schema.get("maxLength").asInt()) {
                throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值长度超过允许的最大长度");
            }
            if (schema.has("pattern")) {
                try {
                    if (!Pattern.compile(schema.get("pattern").asText()).matcher(value.asText()).matches()) {
                        throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值不符合格式约束");
                    }
                } catch (PatternSyntaxException exception) {
                    throw badRequest("ITEM_ATTRIBUTE_SCHEMA_INVALID", "属性 Schema 中的正则表达式不合法");
                }
            }
        }
        if (value.isObject() && schema.has("required") && schema.get("required").isArray()) {
            for (JsonNode required : schema.get("required")) {
                if (!value.has(required.asText())) {
                    throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值缺少必填字段 " + required.asText());
                }
            }
        }
    }

    private void validateArrayKeywords(JsonNode value, JsonNode schema) {
        if (schema.has("minItems") && value.size() < schema.get("minItems").asInt()) {
            throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值数量少于允许的最小数量");
        }
        if (schema.has("maxItems") && value.size() > schema.get("maxItems").asInt()) {
            throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "属性值数量超过允许的最大数量");
        }
        if (schema.has("uniqueItems") && schema.get("uniqueItems").asBoolean()) {
            for (int left = 0; left < value.size(); left++) {
                for (int right = left + 1; right < value.size(); right++) {
                    if (value.get(left).equals(value.get(right))) {
                        throw badRequest("ITEM_ATTRIBUTE_SCHEMA_VIOLATION", "多值属性不能包含重复值");
                    }
                }
            }
        }
    }

    private boolean schemaTypeMatches(JsonNode declared, JsonNode value) {
        if (declared != null && declared.isArray()) {
            for (JsonNode candidate : declared) if (schemaTypeMatches(candidate, value)) return true;
            return false;
        }
        String type = declared == null ? "" : declared.asText();
        return switch (type) {
            case "string" -> value.isString();
            case "number" -> value.isNumber();
            case "integer" -> value.isIntegralNumber();
            case "boolean" -> value.isBoolean();
            case "object" -> value.isObject();
            case "array" -> value.isArray();
            default -> false;
        };
    }

    private boolean schemaAllowsNull(JsonNode schema) {
        if (schema == null || !schema.isObject()) return false;
        if (schema.path("nullable").asBoolean(false)) return true;
        JsonNode type = schema.get("type");
        if (type != null && type.isArray()) {
            for (JsonNode candidate : type) if ("null".equals(candidate.asText())) return true;
        }
        return false;
    }

    private void requireOverrideAllowed(AttributeSchemaView attribute, ItemAttributeDefinition definition,
                                        String scopeType) {
        if ("BASE_ONLY".equals(definition.variability())) {
            throw badRequest("ITEM_ATTRIBUTE_OVERRIDE_NOT_ALLOWED", "该属性不允许维护作用域覆盖值");
        }
        if ("SCOPE_OVERRIDE".equals(definition.variability())
                && "NO_OVERRIDE".equals(definition.overridePolicy())) {
            throw badRequest("ITEM_ATTRIBUTE_OVERRIDE_NOT_ALLOWED", "该属性不允许维护作用域覆盖值");
        }
        if ("SCOPE_OVERRIDE".equals(definition.variability())
                && "RESTRICTIVE_ONLY".equals(definition.overridePolicy())) {
            throw badRequest("ITEM_ATTRIBUTE_RESTRICTIVE_RULE_REQUIRED", "限制性覆盖属性必须先配置受控比较规则");
        }
        JsonNode allowed = attribute.allowedScopes();
        boolean found = false;
        if (allowed != null && allowed.isArray()) {
            for (JsonNode value : allowed) if (scopeType.equals(value.asText())) found = true;
        }
        if (!found) throw badRequest("ITEM_ATTRIBUTE_SCOPE_NOT_ALLOWED", "该属性不允许维护到 " + scopeType + " 作用域");
    }

    private ScopeTarget validateScope(ExecutionContext context, String scopeType,
                                      Long organizationId, Long departmentId) {
        Long tenantId = context.tenantId();
        return switch (scopeType) {
            case "TENANT" -> {
                if (organizationId != null || departmentId != null) {
                    throw badRequest("ITEM_ATTRIBUTE_SCOPE_INVALID", "租户覆盖不能指定机构或科室");
                }
                yield new ScopeTarget("TENANT:" + tenantId, null, null);
            }
            case "ORGANIZATION" -> {
                if (organizationId == null || departmentId != null) {
                    throw badRequest("ITEM_ATTRIBUTE_SCOPE_INVALID", "机构覆盖必须且只能指定机构");
                }
                organizationDirectory.requireOrganization(tenantId, organizationId);
                requireOrganizationAccess(context, organizationId);
                yield new ScopeTarget("TENANT:" + tenantId + "/ORG:" + organizationId, organizationId, null);
            }
            case "DEPARTMENT" -> {
                if (organizationId == null || departmentId == null) {
                    throw badRequest("ITEM_ATTRIBUTE_SCOPE_INVALID", "科室覆盖必须指定机构和科室");
                }
                organizationDirectory.requireDepartment(tenantId, organizationId, departmentId);
                requireOrganizationAccess(context, organizationId);
                if (context.hasWorkContext() && !context.canAccessDepartment(departmentId)) {
                    throw forbidden("ITEM_ATTRIBUTE_DEPARTMENT_FORBIDDEN", "无权维护该科室的属性覆盖值");
                }
                yield new ScopeTarget("TENANT:" + tenantId + "/ORG:" + organizationId + "/DEPT:" + departmentId,
                        organizationId, departmentId);
            }
            default -> throw badRequest("ITEM_ATTRIBUTE_SCOPE_INVALID", "不支持的属性覆盖作用域");
        };
    }

    private void requireOrganizationAccess(ExecutionContext context, Long organizationId) {
        if (context.hasWorkContext() && !context.canAccessOrganization(organizationId)) {
            throw forbidden("ITEM_ATTRIBUTE_ORGANIZATION_FORBIDDEN", "无权维护该机构的属性覆盖值");
        }
    }

    private ItemAttributeChange repeated(String requestCode, Long subjectId, Long definitionId, String targetType) {
        if (requestCode == null || requestCode.isBlank()) throw badRequest("REQUEST_CODE_REQUIRED", "请求编码不能为空");
        ItemAttributeChange prior = changeRepository.findByRequestCode(requestCode.trim()).orElse(null);
        if (prior == null) return null;
        if (!Objects.equals(prior.tenantId(), current().tenantId())
                || !Objects.equals(prior.attributeSubjectId(), subjectId)
                || !Objects.equals(prior.attributeDefinitionId(), definitionId)
                || !targetType.equals(prior.targetType())) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项属性变更");
        }
        return prior;
    }

    private void append(ExecutionContext context, Long definitionId, Long subjectId, Long valueId,
                        Long overrideId, String targetType, String changeType, String scopeKey,
                        String before, String after, String reason, String requestCode) {
        changeRepository.save(new ItemAttributeChange(context.tenantId(), definitionId, subjectId,
                valueId, overrideId, targetType, changeType, scopeKey, before, after,
                reason, requestCode, context.subjectId()));
    }

    private void assertNoOverlap(List<? extends Object> values, Long currentId,
                                 LocalDate from, LocalDate to) {
        if (from == null) throw badRequest("ITEM_ATTRIBUTE_VALID_FROM_REQUIRED", "生效日期不能为空");
        if (to != null && to.isBefore(from)) {
            throw badRequest("ITEM_ATTRIBUTE_PERIOD_INVALID", "失效日期不能早于生效日期");
        }
        for (Object candidate : values) {
            Long id;
            LocalDate candidateFrom;
            LocalDate candidateTo;
            if (candidate instanceof ItemAttributeValue value) {
                id = value.id(); candidateFrom = value.validFrom(); candidateTo = value.validTo();
            } else if (candidate instanceof ItemAttributeOverride value) {
                id = value.id(); candidateFrom = value.validFrom(); candidateTo = value.validTo();
            } else continue;
            if (Objects.equals(id, currentId)) continue;
            if ((candidateTo == null || !candidateTo.isBefore(from)) && (to == null || !to.isBefore(candidateFrom))) {
                throw conflict("ITEM_ATTRIBUTE_PERIOD_OVERLAP", "同一属性和作用域存在重叠的有效期");
            }
        }
    }

    private AttributeSchemaView requireAttribute(AttributeSchemaResponse schema, Long definitionId) {
        return schema.attributes().stream().filter(value -> value.definitionId().equals(definitionId)).findFirst()
                .orElseThrow(() -> badRequest("ITEM_ATTRIBUTE_NOT_ASSIGNED", "属性未装配到当前项目类型"));
    }

    private ItemAttributeDefinition requireDefinition(Long id) {
        return definitionRepository.findById(id).filter(value -> "ACTIVE".equals(value.status()))
                .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_DEFINITION_NOT_FOUND", "未找到有效的属性定义"));
    }

    void validateConfiguredValue(ItemAttributeDefinition definition, JsonNode value) {
        validateValue(definition, value);
    }

    JsonNode validateSchemaDocument(String schemaJson) {
        return parseSchema(schemaJson);
    }

    private void requireExtension(ItemAttributeDefinition definition) {
        if ("PROJECTED".equals(definition.storageMode())) {
            throw badRequest("ITEM_ATTRIBUTE_PROJECTED_READ_ONLY", "投影属性必须通过对应强类型字段维护");
        }
    }

    private void requireRevision(long current, Long expected, String code) {
        if (expected == null) throw conflict(code, "更新属性值必须提交当前修订号");
        if (current != expected) throw conflict(code, "属性值已被其他用户修改，请刷新后重试");
    }

    private Map<Long, String> definitionCodes(AttributeSchemaResponse schema) {
        Map<Long, String> values = new LinkedHashMap<>();
        schema.attributes().forEach(value -> values.put(value.definitionId(), value.code()));
        return values;
    }

    private AttributeValueView valueView(ItemAttributeValue value, String code) {
        return new AttributeValueView(value.id(), value.revision(), value.attributeDefinitionId(), code,
                json(value.valueJson()), value.validFrom(), value.validTo(), value.status());
    }

    private AttributeOverrideView overrideView(ItemAttributeOverride value, String code) {
        return new AttributeOverrideView(value.id(), value.revision(), value.attributeDefinitionId(), code,
                value.scopeType(), value.scopeKey(), value.organizationId(), value.departmentId(),
                value.valueMode(), json(value.valueJson()), value.validFrom(), value.validTo(), value.status());
    }

    private String snapshot(ItemAttributeValue value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id()); result.put("revision", value.revision());
        result.put("scopeType", value.scopeType()); result.put("scopeCode", value.scopeCode());
        result.put("value", json(value.valueJson())); result.put("validFrom", value.validFrom());
        result.put("validTo", value.validTo()); result.put("status", value.status());
        return jsonCodec.write(result);
    }

    private String snapshot(ItemAttributeOverride value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id()); result.put("revision", value.revision());
        result.put("scopeType", value.scopeType()); result.put("scopeKey", value.scopeKey());
        result.put("organizationId", value.organizationId()); result.put("departmentId", value.departmentId());
        result.put("valueMode", value.valueMode()); result.put("value", json(value.valueJson()));
        result.put("validFrom", value.validFrom()); result.put("validTo", value.validTo());
        result.put("status", value.status());
        return jsonCodec.write(result);
    }

    private JsonNode json(String value) {
        if (value == null) return null;
        try { return jsonCodec.readTree(value); }
        catch (RuntimeException exception) { throw badRequest("ITEM_ATTRIBUTE_JSON_INVALID", "属性配置包含无效 JSON"); }
    }

    private ExecutionContext current() { return contextProvider.requireCurrent(); }

    private ExecutionContext currentWithActor() {
        ExecutionContext context = current();
        if (context.tenantId() == null || context.tenantId() <= 0) {
            throw badRequest("ITEM_ATTRIBUTE_TENANT_REQUIRED", "属性维护必须在租户上下文中执行");
        }
        if (context.subjectId() == null || context.subjectId() <= 0) {
            throw badRequest("ITEM_ATTRIBUTE_ACTOR_REQUIRED", "属性维护必须由可审计用户发起");
        }
        return context;
    }

    private record ScopeTarget(String scopeKey, Long organizationId, Long departmentId) {}

    public record BaseValueCommand(String subjectType, Long targetId, Long definitionId,
                                   Long valueId, Long expectedRevision, JsonNode value,
                                   LocalDate validFrom, LocalDate validTo,
                                   String reason, String requestCode) {}

    public record OverrideCommand(String subjectType, Long targetId, Long definitionId,
                                  Long overrideId, Long expectedRevision, String scopeType,
                                  Long organizationId, Long departmentId, String valueMode,
                                  JsonNode value, LocalDate validFrom, LocalDate validTo,
                                  String reason, String requestCode) {}
}
