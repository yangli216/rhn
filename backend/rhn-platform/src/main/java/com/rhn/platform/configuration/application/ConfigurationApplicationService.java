package com.rhn.platform.configuration.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationAdministration;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.platform.configuration.api.ParameterCategoryResponse;
import com.rhn.platform.configuration.api.ParameterChangeResponse;
import com.rhn.platform.configuration.api.ParameterDefinitionDetailResponse;
import com.rhn.platform.configuration.api.ParameterDefinitionSummaryResponse;
import com.rhn.platform.configuration.api.ParameterValueResponse;
import com.rhn.platform.configuration.domain.ConfigurationCategory;
import com.rhn.platform.configuration.domain.ConfigurationChangeType;
import com.rhn.platform.configuration.domain.ConfigurationCodePolicy;
import com.rhn.platform.configuration.domain.ConfigurationControlType;
import com.rhn.platform.configuration.domain.ConfigurationDefinition;
import com.rhn.platform.configuration.domain.ConfigurationDependencyBehavior;
import com.rhn.platform.configuration.domain.ConfigurationDisplayPolicy;
import com.rhn.platform.configuration.domain.ConfigurationScope;
import com.rhn.platform.configuration.domain.ConfigurationSensitivity;
import com.rhn.platform.configuration.domain.ConfigurationStatus;
import com.rhn.platform.configuration.domain.ConfigurationValueMode;
import com.rhn.platform.configuration.domain.ConfigurationValueType;
import com.rhn.platform.configuration.domain.ParameterCategory;
import com.rhn.platform.configuration.domain.ParameterChange;
import com.rhn.platform.configuration.domain.ParameterValue;
import com.rhn.platform.configuration.infrastructure.ConfigurationDefinitionRepository;
import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import com.rhn.platform.configuration.infrastructure.ParameterCategoryRepository;
import com.rhn.platform.configuration.infrastructure.ParameterChangeRepository;
import com.rhn.platform.configuration.infrastructure.ParameterValueRepository;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.dictionary.api.DictionaryCodes;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.shared.api.RevisionGuard;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.math.BigDecimal;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;
import static com.rhn.platform.configuration.api.ClinicalAiConfigurationPermissions.MANAGE;
import static com.rhn.platform.configuration.api.ClinicalAiConfigurationPermissions.PLATFORM_ROLE;

@Service
public class ConfigurationApplicationService implements ConfigurationDirectory, ConfigurationAdministration {
    private final ParameterCategoryRepository categoryRepository;
    private final ConfigurationDefinitionRepository definitionRepository;
    private final ParameterValueRepository valueRepository;
    private final ParameterChangeRepository changeRepository;
    private final OrganizationDirectory organizationDirectory;
    private final IdentityAccessDirectory identityAccessDirectory;
    private final DictionaryDirectory dictionaryDirectory;
    private final SystemEnumDirectory systemEnumDirectory;
    private final ConfigurationValueCache valueCache;
    private final JsonCodec jsonCodec;
    private final ExecutionContextProvider contextProvider;

    public ConfigurationApplicationService(ParameterCategoryRepository categoryRepository,
                                           ConfigurationDefinitionRepository definitionRepository,
                                           ParameterValueRepository valueRepository,
                                           ParameterChangeRepository changeRepository,
                                           OrganizationDirectory organizationDirectory,
                                           IdentityAccessDirectory identityAccessDirectory,
                                           DictionaryDirectory dictionaryDirectory,
                                           SystemEnumDirectory systemEnumDirectory,
                                           ConfigurationValueCache valueCache,
                                           JsonCodec jsonCodec,
                                           ExecutionContextProvider contextProvider) {
        this.categoryRepository = categoryRepository;
        this.definitionRepository = definitionRepository;
        this.valueRepository = valueRepository;
        this.changeRepository = changeRepository;
        this.organizationDirectory = organizationDirectory;
        this.identityAccessDirectory = identityAccessDirectory;
        this.dictionaryDirectory = dictionaryDirectory;
        this.systemEnumDirectory = systemEnumDirectory;
        this.valueCache = valueCache;
        this.jsonCodec = jsonCodec;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<ParameterCategoryResponse> categories() {
        return categoryRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(this::categoryResponse).toList();
    }

    @Transactional
    public ParameterCategoryResponse createCategory(Long parentId, String code, String name,
                                                    String description, int sortOrder) {
        String normalizedCode = ConfigurationCodePolicy.requireCategoryCode(code);
        if (categoryRepository.existsByCode(normalizedCode)) {
            throw conflict("PARAMETER_CATEGORY_CODE_DUPLICATE", "参数分类编码已经存在");
        }
        validateCategoryParent(null, parentId);
        ParameterCategory category = categoryRepository.saveAndFlush(new ParameterCategory(
                parentId, normalizedCode, name, description, sortOrder, currentWithActor().subjectId()));
        return categoryResponse(category);
    }

    @Transactional
    public ParameterCategoryResponse updateCategory(Long id, long expectedRevision, Long parentId,
                                                    String name, String description, int sortOrder,
                                                    boolean active) {
        ParameterCategory category = requireCategory(id);
        validateCategoryParent(id, parentId);
        runRevisionGuard(() -> {
            category.update(expectedRevision, parentId, name, description, sortOrder,
                    active, currentWithActor().subjectId());
            categoryRepository.saveAndFlush(category);
        });
        return categoryResponse(category);
    }

    @Transactional
    public List<ParameterCategoryResponse> reorderCategories(List<CategoryOrderCommand> commands) {
        if (commands == null || commands.isEmpty()) {
            throw badRequest("PARAMETER_CATEGORY_ORDER_REQUIRED", "请提交需要排序的参数分类");
        }
        Map<Long, ParameterCategory> categories = categoryRepository.findAll().stream()
                .collect(Collectors.toMap(ParameterCategory::id, value -> value));
        Map<Long, CategoryOrderCommand> submitted = new LinkedHashMap<>();
        for (CategoryOrderCommand command : commands) {
            if (command == null || command.id() == null || !categories.containsKey(command.id())) {
                throw notFound("PARAMETER_CATEGORY_NOT_FOUND", "未找到参数分类");
            }
            if (submitted.put(command.id(), command) != null) {
                throw badRequest("PARAMETER_CATEGORY_ORDER_DUPLICATE", "同一参数分类不能重复提交");
            }
            runRevisionGuard(() -> categories.get(command.id()).assertRevision(command.expectedRevision()));
            if (command.sortOrder() < 0) {
                throw badRequest("PARAMETER_CATEGORY_ORDER_INVALID", "分类排序不能小于0");
            }
            if (command.parentId() != null) {
                ParameterCategory parent = categories.get(command.parentId());
                if (parent == null) throw notFound("PARAMETER_CATEGORY_NOT_FOUND", "未找到父参数分类");
                if (!parent.active()) {
                    throw badRequest("PARAMETER_CATEGORY_PARENT_INACTIVE", "不能选择停用分类作为父分类");
                }
            }
        }
        Map<Long, Long> proposedParents = new LinkedHashMap<>();
        categories.values().forEach(value -> proposedParents.put(value.id(), value.parentId()));
        submitted.values().forEach(value -> proposedParents.put(value.id(), value.parentId()));
        for (Long categoryId : proposedParents.keySet()) validateCategoryPath(categoryId, proposedParents);

        Long actorId = currentWithActor().subjectId();
        runRevisionGuard(() -> {
            submitted.values().forEach(command -> categories.get(command.id()).reorder(
                    command.expectedRevision(), command.parentId(), command.sortOrder(), actorId));
            categoryRepository.saveAllAndFlush(submitted.keySet().stream().map(categories::get).toList());
        });
        return categoryRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(this::categoryResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ParameterDefinitionSummaryResponse> definitions(String query, Long categoryId,
                                                                ConfigurationCategory category,
                                                                ConfigurationStatus status) {
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        Map<Long, ParameterCategory> categories = categoryRepository.findAll().stream()
                .collect(Collectors.toMap(ParameterCategory::id, value -> value));
        return definitionRepository.findAllByOrderByUpdatedAtDesc().stream()
                .filter(value -> categoryId == null || Objects.equals(value.categoryId(), categoryId))
                .filter(value -> category == null || value.category() == category)
                .filter(value -> status == null || value.status() == status)
                .filter(value -> normalizedQuery.isEmpty()
                        || value.configKey().toLowerCase(Locale.ROOT).contains(normalizedQuery)
                        || value.name().toLowerCase(Locale.ROOT).contains(normalizedQuery))
                .map(value -> summary(value, categories.get(value.categoryId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public ParameterDefinitionDetailResponse get(Long id) {
        return detail(requireDefinition(id));
    }

    @Transactional(readOnly = true)
    public List<ParameterChangeResponse> changes(Long definitionId) {
        ConfigurationDefinition definition = requireDefinition(definitionId);
        return changeRepository.findVisible(definitionId, current().tenantId()).stream()
                .map(value -> changeResponse(definition, value)).toList();
    }

    @Transactional
    public ParameterDefinitionDetailResponse createDefinition(DefinitionCommand command) {
        ParameterDefinitionDetailResponse repeated = repeated(command.requestCode(), null);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        String key = ConfigurationCodePolicy.requireParameterKey(command.key());
        requireAiConfigurationAuthority(key, command.allowedScopes());
        if (definitionRepository.existsByConfigKey(key)) {
            throw conflict("PARAMETER_KEY_DUPLICATE", "参数键已经存在");
        }
        requireActiveCategory(command.categoryId());
        validateDefinition(command, context.tenantId(), false);
        ConfigurationDefinition definition = definitionRepository.saveAndFlush(new ConfigurationDefinition(
                command.categoryId(), key, command.name(), command.description(), command.valueType(),
                command.controlType(), command.jsonSchema(), command.defaultValueJson(),
                command.exampleValueJson(), command.unit(), normalizedDictionaryCode(command.dictionaryCode()),
                command.allowedScopes(), command.category(), command.inheritanceEnabled(), command.cacheEnabled(),
                command.nullableValue(), command.sensitivity(), command.displayPolicy(),
                command.dependsOnKey(), command.dependsOnValue(), command.dependencyBehavior(),
                context.subjectId()));
        append(context.tenantId(), definition.id(), null, ConfigurationChangeType.CREATE,
                null, definitionSnapshot(definition), command.reason(), command.requestCode(), context.subjectId());
        invalidateCacheAfterCommit();
        return detail(definition);
    }

    @Transactional
    public ParameterDefinitionDetailResponse updateDefinition(Long id, long expectedRevision,
                                                              DefinitionCommand command) {
        ParameterDefinitionDetailResponse repeated = repeated(command.requestCode(), id);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        ConfigurationDefinition definition = requireDefinition(id);
        requireAiConfigurationAuthority(definition.configKey(), command.allowedScopes());
        String submittedKey = ConfigurationCodePolicy.requireParameterKey(command.key());
        if (!definition.configKey().equals(submittedKey)) {
            throw badRequest("PARAMETER_KEY_IMMUTABLE", "参数键创建后不可修改");
        }
        DefinitionCommand effectiveCommand = preserveProtectedValues(command, definition);
        requireActiveCategory(effectiveCommand.categoryId());
        validateDefinition(effectiveCommand, context.tenantId(), valueRepository.countByDefinitionId(id) > 0);
        String before = definitionSnapshot(definition);
        runRevisionGuard(() -> {
            definition.update(expectedRevision, effectiveCommand.categoryId(), effectiveCommand.name(), effectiveCommand.description(),
                    effectiveCommand.valueType(), effectiveCommand.controlType(), effectiveCommand.jsonSchema(), effectiveCommand.defaultValueJson(),
                    effectiveCommand.exampleValueJson(), effectiveCommand.unit(), normalizedDictionaryCode(effectiveCommand.dictionaryCode()),
                    effectiveCommand.allowedScopes(), effectiveCommand.category(), effectiveCommand.inheritanceEnabled(), effectiveCommand.cacheEnabled(),
                    effectiveCommand.nullableValue(), effectiveCommand.sensitivity(), effectiveCommand.displayPolicy(),
                    effectiveCommand.dependsOnKey(), effectiveCommand.dependsOnValue(), effectiveCommand.dependencyBehavior(),
                    context.subjectId());
            definitionRepository.saveAndFlush(definition);
        });
        append(context.tenantId(), definition.id(), null, ConfigurationChangeType.UPDATE,
                before, definitionSnapshot(definition), effectiveCommand.reason(), effectiveCommand.requestCode(), context.subjectId());
        invalidateCacheAfterCommit();
        return detail(definition);
    }

    @Transactional
    public ParameterDefinitionDetailResponse changeDefinitionStatus(Long id, long expectedRevision,
                                                                    boolean enabled, String reason,
                                                                    String requestCode) {
        ParameterDefinitionDetailResponse repeated = repeated(requestCode, id);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        ConfigurationDefinition definition = requireDefinition(id);
        requireAiConfigurationAuthority(definition.configKey(), definition.allowedScopes());
        String before = definitionSnapshot(definition);
        runRevisionGuard(() -> {
            definition.changeStatus(expectedRevision, enabled, context.subjectId());
            definitionRepository.saveAndFlush(definition);
        });
        append(context.tenantId(), definition.id(), null,
                enabled ? ConfigurationChangeType.ENABLE : ConfigurationChangeType.DISABLE,
                before, definitionSnapshot(definition), reason, requestCode, context.subjectId());
        invalidateCacheAfterCommit();
        return detail(definition);
    }

    @Transactional
    public ParameterDefinitionDetailResponse saveValue(Long definitionId, ValueCommand command) {
        ParameterDefinitionDetailResponse repeated = repeated(command.requestCode(), definitionId);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        ConfigurationDefinition definition = requireDefinition(definitionId);
        requireAiValueAuthority(definition.configKey(), command.scopeType());
        if (!definition.allows(command.scopeType())) {
            throw badRequest("PARAMETER_SCOPE_NOT_ALLOWED", "该参数不允许维护到 " + command.scopeType() + " 作用域");
        }
        ScopeTarget target = validateScope(context.tenantId(), command.scopeType(), command.scopeId(),
                command.organizationId(), command.scopeReference());
        validateValueCommand(definition, command);
        ParameterValue value = valueRepository.findByDefinitionIdAndScopeCode(definitionId, target.scopeCode())
                .orElse(null);
        String before = value == null ? null : valueSnapshot(definition, value);
        ConfigurationChangeType changeType;
        if (value == null) {
            if (command.expectedRevision() != null) {
                throw conflict("PARAMETER_VALUE_REVISION_CONFLICT", "该作用域尚未维护参数值，请刷新后重试");
            }
            value = valueRepository.saveAndFlush(new ParameterValue(definitionId, target.tenantId(),
                    command.scopeType(), target.scopeId(), target.scopeReference(), target.scopeCode(),
                    command.valueMode(), command.valueJson(), command.secretRef(), context.subjectId()));
            changeType = command.valueMode() == ConfigurationValueMode.RESET_DEFAULT
                    ? ConfigurationChangeType.RESET : ConfigurationChangeType.CREATE;
        } else {
            if (command.expectedRevision() == null) {
                throw conflict("PARAMETER_VALUE_REVISION_REQUIRED", "更新参数值必须提交当前修订号");
            }
            ParameterValue existing = value;
            runRevisionGuard(() -> {
                existing.update(command.expectedRevision(), command.valueMode(), command.valueJson(),
                        command.secretRef(), context.subjectId());
                valueRepository.saveAndFlush(existing);
            });
            changeType = command.valueMode() == ConfigurationValueMode.RESET_DEFAULT
                    ? ConfigurationChangeType.RESET : ConfigurationChangeType.UPDATE;
        }
        append(target.tenantId(), definitionId, value.id(), changeType, before,
                valueSnapshot(definition, value), command.reason(), command.requestCode(), context.subjectId());
        invalidateCacheAfterCommit();
        return detail(definition);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ManagedValue> findValue(String key, String scopeCode) {
        ConfigurationDefinition definition = requireActiveDefinition(key);
        return valueRepository.findByDefinitionIdAndScopeCode(definition.id(), scopeCode)
                .map(value -> new ManagedValue(value.valueJson(), value.secretRef(),
                        ValueMode.valueOf(value.valueMode().name()), value.active(), value.revision()));
    }

    @Override
    @Transactional
    public void saveValue(String key, ManagedValueCommand command) {
        ConfigurationDefinition definition = requireActiveDefinition(key);
        saveValue(definition.id(), new ValueCommand(command.expectedRevision(),
                ConfigurationScope.valueOf(command.scope().name()), command.scopeId(), null, null,
                ConfigurationValueMode.valueOf(command.valueMode().name()), command.valueJson(),
                command.secretReference(), command.reason(), command.requestCode()));
    }

    @Transactional
    public ParameterDefinitionDetailResponse changeValueStatus(Long definitionId, Long valueId,
                                                               long expectedRevision, boolean enabled,
                                                               String reason, String requestCode) {
        ParameterDefinitionDetailResponse repeated = repeated(requestCode, definitionId);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        ConfigurationDefinition definition = requireDefinition(definitionId);
        ParameterValue value = requireVisibleValue(definitionId, valueId, context.tenantId());
        requireAiValueAuthority(definition.configKey(), value.scopeType());
        String before = valueSnapshot(definition, value);
        runRevisionGuard(() -> {
            value.changeStatus(expectedRevision, enabled, context.subjectId());
            valueRepository.saveAndFlush(value);
        });
        append(value.tenantId(), definitionId, value.id(),
                enabled ? ConfigurationChangeType.ENABLE : ConfigurationChangeType.DISABLE,
                before, valueSnapshot(definition, value), reason, requestCode, context.subjectId());
        invalidateCacheAfterCommit();
        return detail(definition);
    }

    @Transactional
    public ParameterDefinitionDetailResponse rollbackValue(Long definitionId, Long changeId,
                                                           long expectedRevision, String reason,
                                                           String requestCode) {
        ParameterDefinitionDetailResponse repeated = repeated(requestCode, definitionId);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        ConfigurationDefinition definition = requireDefinition(definitionId);
        ParameterChange target = changeRepository.findById(changeId)
                .filter(value -> value.definitionId().equals(definitionId)
                        && value.targetType() == com.rhn.platform.configuration.domain.ConfigurationChangeTargetType.VALUE
                        && (value.tenantId() == null || value.tenantId().equals(context.tenantId())))
                .orElseThrow(() -> notFound("PARAMETER_CHANGE_NOT_FOUND", "未找到可回退的参数变更"));
        JsonNode snapshot = parseSnapshot(target.afterJson());
        ParameterValue value = requireVisibleValue(definitionId, target.valueId(), context.tenantId());
        requireAiValueAuthority(definition.configKey(), value.scopeType());
        ConfigurationValueMode mode = ConfigurationValueMode.valueOf(snapshot.get("valueMode").asString());
        String valueJson = textOrNull(snapshot.get("valueJson"));
        String secretRef = textOrNull(snapshot.get("secretRef"));
        boolean active = snapshot.get("active").asBoolean();
        validateValueCommand(definition, new ValueCommand(expectedRevision, value.scopeType(), value.scopeId(),
                null, value.scopeReference(), mode, valueJson, secretRef, reason, requestCode));
        String before = valueSnapshot(definition, value);
        runRevisionGuard(() -> {
            value.restore(expectedRevision, mode, valueJson, secretRef, active, context.subjectId());
            valueRepository.saveAndFlush(value);
        });
        append(value.tenantId(), definitionId, value.id(), ConfigurationChangeType.ROLLBACK,
                before, valueSnapshot(definition, value), reason, requestCode, context.subjectId());
        invalidateCacheAfterCommit();
        return detail(definition);
    }

    @Override
    @Transactional(readOnly = true)
    public ConfigurationValue resolveCurrent(Long tenantId, Long userId, Long organizationId,
                                             Long departmentId, String productCode, String moduleCode,
                                             String environmentCode, String key) {
        ConfigurationValue cached = valueCache.get(tenantId, userId, organizationId, departmentId,
                productCode, moduleCode, environmentCode, key).orElse(null);
        if (cached != null) return cached;
        ConfigurationDefinition definition = requireActiveDefinition(key);
        if (definition.dependsOnKey() != null && !definition.dependsOnKey().isBlank()) {
            boolean satisfied = isDependencySatisfied(tenantId, userId, organizationId, departmentId,
                    productCode, moduleCode, environmentCode, definition.dependsOnKey(), definition.dependsOnValue());
            if (!satisfied) {
                ResolutionContext context = validateResolutionContext(tenantId, userId, organizationId, departmentId,
                        productCode, moduleCode, environmentCode);
                ScopeCandidate requested = requested(context);
                ConfigurationValue suppressed = new ConfigurationValue(
                        definition.configKey(), null, definition.valueType().name(), definition.category().name(),
                        definition.inheritanceEnabled(), definition.cacheEnabled(),
                        requested.scope() == null ? "DEFAULT" : requested.scope().name(),
                        requested.scopeId(), requested.scopeCode(), "SUPPRESSED", null, "SUPPRESSED",
                        "SUPPRESSED", false, definition.revision(), null, true);
                if (definition.cacheEnabled()) {
                    valueCache.put(tenantId, userId, organizationId, departmentId, productCode,
                            moduleCode, environmentCode, key, suppressed);
                }
                return suppressed;
            }
        }
        ResolutionContext context = validateResolutionContext(tenantId, userId, organizationId, departmentId,
                productCode, moduleCode, environmentCode);
        ScopeCandidate requested = requested(context);
        List<ScopeCandidate> candidates = definition.inheritanceEnabled()
                ? candidates(definition, context)
                : exactCandidate(definition, context);
        Map<String, ParameterValue> values = valueRepository.findResolvable(definition.id(), tenantId).stream()
                .collect(Collectors.toMap(ParameterValue::scopeCode, value -> value, (left, right) -> left));
        ConfigurationValue resolved = resolve(definition, requested, candidates, values);
        if (definition.cacheEnabled()) {
            valueCache.put(tenantId, userId, organizationId, departmentId, productCode,
                    moduleCode, environmentCode, key, resolved);
        }
        return resolved;
    }

    private boolean isDependencySatisfied(Long tenantId, Long userId, Long organizationId,
                                         Long departmentId, String productCode, String moduleCode,
                                         String environmentCode, String parentKey, String expectedValue) {
        try {
            ConfigurationValue parentValue = resolveCurrent(tenantId, userId, organizationId, departmentId,
                    productCode, moduleCode, environmentCode, parentKey);
            if (parentValue == null || parentValue.suppressedByDependency() || parentValue.value() == null || parentValue.value().isNull()) {
                return false;
            }
            return matchExpectedValue(parentValue.value(), expectedValue);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean matchExpectedValue(JsonNode actualNode, String expectedExpr) {
        if (actualNode == null || actualNode.isNull() || expectedExpr == null || expectedExpr.isBlank()) {
            return false;
        }
        String cleanExpected = expectedExpr.trim();
        if (cleanExpected.startsWith("\"") && cleanExpected.endsWith("\"") && cleanExpected.length() >= 2) {
            cleanExpected = cleanExpected.substring(1, cleanExpected.length() - 1);
        }
        if (actualNode.isBoolean()) {
            return actualNode.asBoolean() == Boolean.parseBoolean(cleanExpected);
        }
        if (actualNode.isNumber()) {
            try {
                BigDecimal actualNum = new BigDecimal(actualNode.asString());
                BigDecimal expectedNum = new BigDecimal(cleanExpected);
                return actualNum.compareTo(expectedNum) == 0;
            } catch (Exception ignored) {
                return actualNode.asString().equalsIgnoreCase(cleanExpected);
            }
        }
        if (actualNode.isTextual()) {
            return actualNode.asString().equalsIgnoreCase(cleanExpected);
        }
        return actualNode.toString().equals(cleanExpected);
    }

    private ConfigurationValue resolve(ConfigurationDefinition definition, ScopeCandidate requested,
                                       List<ScopeCandidate> candidates, Map<String, ParameterValue> values) {
        for (ScopeCandidate candidate : candidates) {
            ParameterValue value = values.get(candidate.scopeCode());
            if (value == null || value.valueMode() == ConfigurationValueMode.INHERIT) continue;
            if (value.valueMode() == ConfigurationValueMode.RESET_DEFAULT) {
                if (definition.defaultValueJson() == null) continue;
                return resolvedValue(definition, requested, candidate, value, definition.defaultValueJson(), null);
            }
            if (value.valueMode() == ConfigurationValueMode.EXPLICIT_NULL) {
                return resolvedValue(definition, requested, candidate, value, null, null);
            }
            return resolvedValue(definition, requested, candidate, value, value.valueJson(), value.secretRef());
        }
        if (definition.inheritanceEnabled() && definition.defaultValueJson() != null) {
            ScopeCandidate defaultCandidate = new ScopeCandidate(null, null, null, "DEFAULT");
            return resolvedValue(definition, requested, defaultCandidate, null,
                    definition.defaultValueJson(), null);
        }
        throw notFound("PARAMETER_VALUE_NOT_FOUND", "当前上下文没有有效参数值 " + definition.configKey());
    }

    private ConfigurationValue resolvedValue(ConfigurationDefinition definition, ScopeCandidate requested,
                                             ScopeCandidate resolved, ParameterValue source,
                                             String valueJson, String secretRef) {
        boolean inherited = definition.inheritanceEnabled()
                && !Objects.equals(requested.scopeCode(), resolved.scopeCode());
        return new ConfigurationValue(definition.configKey(), valueJson == null ? null : parseValue(valueJson),
                definition.valueType().name(), definition.category().name(), definition.inheritanceEnabled(),
                definition.cacheEnabled(), requested.scope() == null ? "DEFAULT" : requested.scope().name(),
                requested.scopeId(), requested.scopeCode(), resolved.scope() == null ? "DEFAULT" : resolved.scope().name(),
                resolved.scopeId(), resolved.scopeCode(), source == null ? "DEFAULT" : source.valueMode().name(),
                inherited, source == null ? null : source.revision(), secretRef);
    }

    private List<ScopeCandidate> candidates(ConfigurationDefinition definition, ResolutionContext context) {
        List<ScopeCandidate> result = new ArrayList<>();
        if (context.userId() != null && definition.allows(ConfigurationScope.USER)) {
            result.add(idCandidate(ConfigurationScope.USER, context.userId(), context.tenantId()));
        }
        if (context.departmentId() != null && definition.allows(ConfigurationScope.DEPARTMENT)) {
            for (DepartmentView department : organizationDirectory.departmentLineage(
                    context.tenantId(), context.organizationId(), context.departmentId())) {
                result.add(idCandidate(ConfigurationScope.DEPARTMENT, department.id(), context.tenantId()));
            }
        }
        if (context.organizationId() != null && definition.allows(ConfigurationScope.ORGANIZATION)) {
            for (OrganizationView organization : organizationDirectory.organizationLineage(
                    context.tenantId(), context.organizationId())) {
                result.add(idCandidate(ConfigurationScope.ORGANIZATION, organization.id(), context.tenantId()));
            }
        }
        if (definition.allows(ConfigurationScope.TENANT)) {
            result.add(idCandidate(ConfigurationScope.TENANT, context.tenantId(), context.tenantId()));
        }
        addReferenceCandidate(result, definition, ConfigurationScope.MODULE, context.moduleCode(), context.tenantId());
        addReferenceCandidate(result, definition, ConfigurationScope.PRODUCT, context.productCode(), context.tenantId());
        addReferenceCandidate(result, definition, ConfigurationScope.ENVIRONMENT, context.environmentCode(), context.tenantId());
        if (definition.allows(ConfigurationScope.PLATFORM)) {
            result.add(new ScopeCandidate(ConfigurationScope.PLATFORM, null, null, "PLATFORM"));
        }
        return List.copyOf(result);
    }

    private List<ScopeCandidate> exactCandidate(ConfigurationDefinition definition, ResolutionContext context) {
        for (ScopeCandidate candidate : candidatesBySpecificity(context)) {
            if (definition.allows(candidate.scope())) return List.of(candidate);
        }
        return List.of();
    }

    private ScopeCandidate requested(ResolutionContext context) {
        return candidatesBySpecificity(context).getFirst();
    }

    private List<ScopeCandidate> candidatesBySpecificity(ResolutionContext context) {
        List<ScopeCandidate> result = new ArrayList<>();
        if (context.userId() != null) result.add(idCandidate(ConfigurationScope.USER, context.userId(), context.tenantId()));
        if (context.departmentId() != null) result.add(idCandidate(ConfigurationScope.DEPARTMENT, context.departmentId(), context.tenantId()));
        if (context.organizationId() != null) result.add(idCandidate(ConfigurationScope.ORGANIZATION, context.organizationId(), context.tenantId()));
        result.add(idCandidate(ConfigurationScope.TENANT, context.tenantId(), context.tenantId()));
        if (context.moduleCode() != null) result.add(referenceCandidate(ConfigurationScope.MODULE, context.moduleCode(), context.tenantId()));
        if (context.productCode() != null) result.add(referenceCandidate(ConfigurationScope.PRODUCT, context.productCode(), context.tenantId()));
        if (context.environmentCode() != null) result.add(referenceCandidate(ConfigurationScope.ENVIRONMENT, context.environmentCode(), context.tenantId()));
        result.add(new ScopeCandidate(ConfigurationScope.PLATFORM, null, null, "PLATFORM"));
        return List.copyOf(result);
    }

    private ResolutionContext validateResolutionContext(Long tenantId, Long userId, Long organizationId,
                                                        Long departmentId, String productCode, String moduleCode,
                                                        String environmentCode) {
        organizationDirectory.requireTenant(tenantId);
        if (userId != null) identityAccessDirectory.requireAccount(tenantId, userId);
        if (departmentId != null && organizationId == null) {
            throw badRequest("ORGANIZATION_REQUIRED", "解析科室参数时必须提供所属机构");
        }
        if (departmentId != null) organizationDirectory.requireDepartment(tenantId, organizationId, departmentId);
        else if (organizationId != null) organizationDirectory.requireOrganization(tenantId, organizationId);
        return new ResolutionContext(tenantId, userId, organizationId, departmentId,
                normalizeReference(productCode), normalizeReference(moduleCode), normalizeReference(environmentCode));
    }

    private ScopeTarget validateScope(Long tenantId, ConfigurationScope scope, Long scopeId,
                                      Long organizationId, String scopeReference) {
        organizationDirectory.requireTenant(tenantId);
        return switch (scope) {
            case PLATFORM -> new ScopeTarget(null, null, null, "PLATFORM");
            case TENANT -> {
                if (scopeId != null && !scopeId.equals(tenantId)) {
                    throw badRequest("PARAMETER_SCOPE_MISMATCH", "租户参数的作用域标识与当前租户不一致");
                }
                yield new ScopeTarget(tenantId, tenantId, null, "TENANT:" + tenantId);
            }
            case ORGANIZATION -> {
                requireScopeId(scopeId);
                organizationDirectory.requireOrganization(tenantId, scopeId);
                yield new ScopeTarget(tenantId, scopeId, null, "ORGANIZATION:" + scopeId);
            }
            case DEPARTMENT -> {
                requireScopeId(scopeId);
                if (organizationId == null) throw badRequest("PARAMETER_ORGANIZATION_REQUIRED", "科室参数需要所属机构");
                organizationDirectory.requireDepartment(tenantId, organizationId, scopeId);
                yield new ScopeTarget(tenantId, scopeId, null, "DEPARTMENT:" + scopeId);
            }
            case USER -> {
                requireScopeId(scopeId);
                identityAccessDirectory.requireAccount(tenantId, scopeId);
                yield new ScopeTarget(tenantId, scopeId, null, "USER:" + scopeId);
            }
            case PRODUCT, MODULE, ENVIRONMENT -> {
                String reference = ConfigurationCodePolicy.requireScopeReference(scopeReference);
                yield new ScopeTarget(tenantId, null, reference,
                        scope.name() + ":" + tenantId + ":" + reference);
            }
        };
    }

    private void validateDefinition(DefinitionCommand command, Long tenantId, boolean hasValues) {
        if (command.allowedScopes() == null || command.allowedScopes().isEmpty()) {
            throw badRequest("PARAMETER_SCOPE_REQUIRED", "至少需要允许一个参数作用域");
        }
        if (command.valueType() == null || command.controlType() == null || command.category() == null
                || command.sensitivity() == null || command.displayPolicy() == null) {
            throw badRequest("PARAMETER_DEFINITION_INCOMPLETE", "参数类型、控件、配置属性和敏感策略不能为空");
        }
        if (hasValues) {
            ConfigurationDefinition existing = definitionRepository.findByConfigKey(
                    ConfigurationCodePolicy.requireParameterKey(command.key())).orElse(null);
            if (existing != null && existing.valueType() != command.valueType()) {
                throw conflict("PARAMETER_VALUE_TYPE_LOCKED", "参数已存在当前值，不能再修改值类型");
            }
        }
        validateControl(command.valueType(), command.controlType(), command.dictionaryCode());
        validateSchema(command.jsonSchema(), command.valueType());
        if (command.sensitivity() == ConfigurationSensitivity.SECRET) {
            if (command.defaultValueJson() != null) throw badRequest("PARAMETER_SECRET_DEFAULT_FORBIDDEN", "密钥参数不能保存默认明文");
            if (command.controlType() != ConfigurationControlType.SECRET_REFERENCE) {
                throw badRequest("PARAMETER_SECRET_CONTROL_REQUIRED", "密钥参数必须使用密钥引用控件");
            }
            if (command.displayPolicy() == ConfigurationDisplayPolicy.PLAIN) {
                throw badRequest("PARAMETER_SECRET_DISPLAY_FORBIDDEN", "密钥参数不能使用明文展示策略");
            }
        }
        if (command.sensitivity() == ConfigurationSensitivity.SENSITIVE
                && command.displayPolicy() == ConfigurationDisplayPolicy.PLAIN) {
            throw badRequest("PARAMETER_SENSITIVE_DISPLAY_FORBIDDEN", "敏感参数必须使用掩码或隐藏展示策略");
        }
        if (command.defaultValueJson() != null) validateValue(command.valueType(), command.defaultValueJson(), command.jsonSchema());
        if (command.exampleValueJson() != null) validateValue(command.valueType(), command.exampleValueJson(), command.jsonSchema());
        if (command.controlType() == ConfigurationControlType.SELECT) {
            String dictionaryCode = DictionaryCodes.require(command.dictionaryCode());
            if (!systemEnumDirectory.isSystemEnumCode(dictionaryCode)) {
                dictionaryDirectory.resolveActiveItems(tenantId, dictionaryCode);
            }
            if (command.defaultValueJson() != null) {
                validateDictionaryValue(dictionaryCode, command.defaultValueJson(), tenantId);
            }
            if (command.exampleValueJson() != null) {
                validateDictionaryValue(dictionaryCode, command.exampleValueJson(), tenantId);
            }
        }
        validateDependency(command.key(), command.dependsOnKey(), command.dependsOnValue());
    }

    private void validateDependency(String currentKey, String dependsOnKey, String dependsOnValue) {
        if (dependsOnKey == null || dependsOnKey.isBlank()) {
            return;
        }
        String parentKey = dependsOnKey.trim();
        if (parentKey.equalsIgnoreCase(currentKey.trim())) {
            throw badRequest("PARAMETER_DEPENDENCY_SELF", "参数不能依赖自身");
        }
        definitionRepository.findByConfigKey(parentKey)
                .orElseThrow(() -> badRequest("PARAMETER_DEPENDENCY_NOT_FOUND", "所依赖的前置参数不存在: " + parentKey));
        if (dependsOnValue == null || dependsOnValue.isBlank()) {
            throw badRequest("PARAMETER_DEPENDENCY_VALUE_REQUIRED", "必须指定满足依赖的前置期望值");
        }
        Set<String> visited = new HashSet<>();
        visited.add(currentKey.trim());
        String current = parentKey;
        while (current != null && !current.isBlank()) {
            if (!visited.add(current)) {
                throw badRequest("PARAMETER_DEPENDENCY_CYCLE", "参数依赖关系存在循环引用: " + current);
            }
            ConfigurationDefinition next = definitionRepository.findByConfigKey(current).orElse(null);
            if (next == null) break;
            current = next.dependsOnKey();
        }
    }

    private void validateControl(ConfigurationValueType valueType, ConfigurationControlType controlType,
                                 String dictionaryCode) {
        boolean compatible = switch (valueType) {
            case STRING -> Set.of(ConfigurationControlType.TEXT, ConfigurationControlType.TEXTAREA,
                    ConfigurationControlType.SELECT, ConfigurationControlType.SECRET_REFERENCE).contains(controlType);
            case NUMBER -> Set.of(ConfigurationControlType.NUMBER, ConfigurationControlType.SELECT).contains(controlType);
            case BOOLEAN -> Set.of(ConfigurationControlType.SWITCH, ConfigurationControlType.SELECT).contains(controlType);
            case JSON -> controlType == ConfigurationControlType.JSON_EDITOR;
        };
        if (!compatible) throw badRequest("PARAMETER_CONTROL_TYPE_MISMATCH", "界面控件与参数值类型不匹配");
        if (controlType != ConfigurationControlType.SELECT && dictionaryCode != null && !dictionaryCode.isBlank()) {
            throw badRequest("PARAMETER_DICTIONARY_NOT_APPLICABLE", "只有下拉选择控件可以绑定字典");
        }
        if (controlType == ConfigurationControlType.SELECT && (dictionaryCode == null || dictionaryCode.isBlank())) {
            throw badRequest("PARAMETER_DICTIONARY_REQUIRED", "下拉选择控件必须绑定字典");
        }
    }

    private void validateValueCommand(ConfigurationDefinition definition, ValueCommand command) {
        if (command.valueMode() == null) throw badRequest("PARAMETER_VALUE_MODE_REQUIRED", "参数值模式不能为空");
        switch (command.valueMode()) {
            case INHERIT -> {
                if (!definition.inheritanceEnabled()) throw badRequest("PARAMETER_INHERIT_DISABLED", "该参数不允许继承");
                requireNoContent(command);
            }
            case RESET_DEFAULT -> {
                if (definition.defaultValueJson() == null) throw badRequest("PARAMETER_DEFAULT_NOT_DEFINED", "该参数没有定义默认值");
                requireNoContent(command);
            }
            case EXPLICIT_NULL -> {
                if (!definition.nullableValue()) throw badRequest("PARAMETER_NULL_NOT_ALLOWED", "该参数不允许显式空值");
                requireNoContent(command);
            }
            case OVERRIDE -> {
                if (definition.sensitivity() == ConfigurationSensitivity.SECRET) {
                    if (command.secretRef() == null || command.secretRef().isBlank() || command.valueJson() != null) {
                        throw badRequest("PARAMETER_SECRET_REFERENCE_REQUIRED", "密钥参数只能保存密钥引用");
                    }
                    if (isClinicalAiKey(definition.configKey()) && !command.secretRef().startsWith("enc:v1:")) {
                        throw badRequest("AI_SECRET_ENCRYPTION_REQUIRED", "AI 密钥必须由专用配置接口加密保存");
                    }
                } else {
                    if (command.valueJson() == null || command.secretRef() != null) {
                        throw badRequest("PARAMETER_VALUE_REQUIRED", "覆盖模式必须提供参数值");
                    }
                    validateValue(definition.valueType(), command.valueJson(), definition.jsonSchema());
                    validateDictionaryValue(definition, command.valueJson(), current().tenantId());
                    validateAiEndpoint(definition.configKey(), command.valueJson());
                }
            }
        }
    }

    private void validateDictionaryValue(ConfigurationDefinition definition, String rawJson, Long tenantId) {
        if (definition.controlType() != ConfigurationControlType.SELECT) return;
        validateDictionaryValue(definition.dictionaryCode(), rawJson, tenantId);
    }

    private void validateDictionaryValue(String dictionaryCode, String rawJson, Long tenantId) {
        JsonNode value = parseValue(rawJson);
        String code = value.isBoolean() ? (value.asBoolean() ? "TRUE" : "FALSE") : value.asString();
        boolean allowed = systemEnumDirectory.findSystemEnum(dictionaryCode)
                .map(definition -> definition.items().stream().anyMatch(item -> item.code().equals(code)))
                .orElseGet(() -> dictionaryDirectory.resolveActiveItems(tenantId, dictionaryCode).stream()
                        .anyMatch(item -> item.code().equals(code)));
        if (!allowed) throw badRequest("PARAMETER_DICTIONARY_VALUE_INVALID", "参数值不在绑定字典的可选项中");
    }

    private void requireNoContent(ValueCommand command) {
        if (command.valueJson() != null || command.secretRef() != null) {
            throw badRequest("PARAMETER_VALUE_CONTENT_FORBIDDEN", "当前值模式不能携带参数内容");
        }
    }

    private void requireAiConfigurationAuthority(String key, Set<ConfigurationScope> scopes) {
        if (!isClinicalAiKey(key)) return;
        ExecutionContext context = current();
        if (!context.hasAuthority(MANAGE) && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("AI_CONFIGURATION_FORBIDDEN", "当前账号无权维护 AI 配置");
        }
        if (!Set.of(ConfigurationScope.PLATFORM, ConfigurationScope.TENANT).equals(scopes)) {
            throw badRequest("AI_CONFIGURATION_SCOPE_RESTRICTED", "AI 参数仅允许平台和租户作用域");
        }
    }

    private void requireAiValueAuthority(String key, ConfigurationScope scope) {
        if (!isClinicalAiKey(key)) return;
        ExecutionContext context = current();
        if (!context.hasAuthority(MANAGE) && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("AI_CONFIGURATION_FORBIDDEN", "当前账号无权维护 AI 配置");
        }
        if (scope != ConfigurationScope.PLATFORM && scope != ConfigurationScope.TENANT) {
            throw badRequest("AI_CONFIGURATION_SCOPE_RESTRICTED", "AI 参数仅允许平台和租户作用域");
        }
        if (scope == ConfigurationScope.PLATFORM && !context.hasAuthority(PLATFORM_ROLE)
                && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("AI_PLATFORM_CONFIGURATION_FORBIDDEN", "只有 AI 配置管理员可以维护平台默认值");
        }
    }

    private void validateAiEndpoint(String key, String rawJson) {
        if (!isClinicalAiKey(key) || !key.endsWith("endpoint")) return;
        String value = parseValue(rawJson).asString();
        try {
            URI uri = URI.create(value);
            if (!uri.isAbsolute() || !("http".equalsIgnoreCase(uri.getScheme())
                    || "https".equalsIgnoreCase(uri.getScheme()))) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException exception) {
            throw badRequest("AI_ENDPOINT_INVALID", "AI 服务地址必须是完整的 HTTP 或 HTTPS 地址");
        }
    }

    private boolean isClinicalAiKey(String key) {
        return key != null && key.startsWith("ai.clinical.");
    }

    private void validateValue(ConfigurationValueType type, String rawJson, String schemaJson) {
        JsonNode value = parseValue(rawJson);
        boolean matches = switch (type) {
            case STRING -> value.isString();
            case NUMBER -> value.isNumber();
            case BOOLEAN -> value.isBoolean();
            case JSON -> value.isObject() || value.isArray();
        };
        if (!matches) throw badRequest("PARAMETER_TYPE_MISMATCH", "参数值与声明类型 " + type + " 不匹配");
        if (schemaJson != null) validateAgainstSchema(value, parseSchema(schemaJson));
    }

    private void validateSchema(String schemaJson, ConfigurationValueType valueType) {
        if (schemaJson == null) return;
        JsonNode schema = parseSchema(schemaJson);
        if (schema.has("type")) {
            if (!schema.get("type").isString() || !schemaTypeMatches(schema.get("type").asString(), valueType)) {
                throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 type 与参数值类型不一致");
            }
        }
        if (schema.has("enum") && !schema.get("enum").isArray()) {
            throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 enum 必须是数组");
        }
        validateNumericKeyword(schema, "minimum");
        validateNumericKeyword(schema, "maximum");
        if (schema.has("minimum") && schema.has("maximum")
                && schema.get("minimum").decimalValue().compareTo(schema.get("maximum").decimalValue()) > 0) {
            throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 minimum 不能大于 maximum");
        }
        validateLengthKeyword(schema, "minLength");
        validateLengthKeyword(schema, "maxLength");
        if (schema.has("minLength") && schema.has("maxLength")
                && schema.get("minLength").asInt() > schema.get("maxLength").asInt()) {
            throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 minLength 不能大于 maxLength");
        }
        if (schema.has("pattern")) {
            if (!schema.get("pattern").isString()) {
                throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 pattern 必须是字符串");
            }
            try {
                Pattern.compile(schema.get("pattern").asString());
            } catch (PatternSyntaxException exception) {
                throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 中的正则表达式不合法");
            }
        }
        if (schema.has("required")) {
            JsonNode required = schema.get("required");
            if (!required.isArray()) throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 required 必须是数组");
            for (JsonNode field : required) {
                if (!field.isString() || field.asString().isBlank()) {
                    throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 required 只能包含非空字段名");
                }
            }
        }
    }

    private boolean schemaTypeMatches(String schemaType, ConfigurationValueType valueType) {
        return switch (valueType) {
            case STRING -> schemaType.equals("string");
            case NUMBER -> schemaType.equals("number") || schemaType.equals("integer");
            case BOOLEAN -> schemaType.equals("boolean");
            case JSON -> schemaType.equals("object") || schemaType.equals("array");
        };
    }

    private void validateNumericKeyword(JsonNode schema, String keyword) {
        if (schema.has(keyword) && !schema.get(keyword).isNumber()) {
            throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 " + keyword + " 必须是数值");
        }
    }

    private void validateLengthKeyword(JsonNode schema, String keyword) {
        if (schema.has(keyword) && (!schema.get(keyword).isIntegralNumber() || schema.get(keyword).asInt() < 0)) {
            throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 的 " + keyword + " 必须是非负整数");
        }
    }

    private JsonNode parseSchema(String schemaJson) {
        JsonNode schema = parseValue(schemaJson);
        if (!schema.isObject()) throw badRequest("PARAMETER_SCHEMA_INVALID", "参数 JSON Schema 必须是 JSON 对象");
        return schema;
    }

    private void validateAgainstSchema(JsonNode value, JsonNode schema) {
        if (schema.has("type") && !schemaValueTypeMatches(schema.get("type").asString(), value)) {
            throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值与 JSON Schema type 不匹配");
        }
        JsonNode enumeration = schema.get("enum");
        if (enumeration != null && enumeration.isArray()) {
            boolean found = false;
            for (JsonNode option : enumeration) if (option.equals(value)) found = true;
            if (!found) throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值不在 JSON Schema 枚举范围内");
        }
        if (value.isNumber()) {
            BigDecimal number = value.decimalValue();
            if (schema.has("minimum") && number.compareTo(schema.get("minimum").decimalValue()) < 0) {
                throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值小于允许的最小值");
            }
            if (schema.has("maximum") && number.compareTo(schema.get("maximum").decimalValue()) > 0) {
                throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值大于允许的最大值");
            }
        }
        if (value.isString()) {
            int length = value.asString().length();
            if (schema.has("minLength") && length < schema.get("minLength").asInt()) {
                throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值长度小于允许的最小长度");
            }
            if (schema.has("maxLength") && length > schema.get("maxLength").asInt()) {
                throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值长度超过允许的最大长度");
            }
            if (schema.has("pattern")) {
                try {
                    if (!Pattern.compile(schema.get("pattern").asString()).matcher(value.asString()).matches()) {
                        throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值不符合 JSON Schema 格式约束");
                    }
                } catch (PatternSyntaxException exception) {
                    throw badRequest("PARAMETER_SCHEMA_INVALID", "JSON Schema 中的正则表达式不合法");
                }
            }
        }
        if (value.isObject() && schema.has("required") && schema.get("required").isArray()) {
            for (JsonNode required : schema.get("required")) {
                if (!value.has(required.asString())) {
                    throw badRequest("PARAMETER_SCHEMA_VIOLATION", "参数值缺少必填属性 " + required.asString());
                }
            }
        }
    }

    private boolean schemaValueTypeMatches(String schemaType, JsonNode value) {
        return switch (schemaType) {
            case "string" -> value.isString();
            case "number" -> value.isNumber();
            case "integer" -> value.isIntegralNumber();
            case "boolean" -> value.isBoolean();
            case "object" -> value.isObject();
            case "array" -> value.isArray();
            default -> false;
        };
    }

    private JsonNode parseValue(String rawJson) {
        try {
            return jsonCodec.readTree(rawJson);
        } catch (RuntimeException exception) {
            throw badRequest("PARAMETER_JSON_INVALID", "参数内容不是合法 JSON");
        }
    }

    private ParameterDefinitionDetailResponse repeated(String requestCode, Long expectedDefinitionId) {
        if (requestCode == null || requestCode.isBlank()) throw badRequest("REQUEST_CODE_REQUIRED", "请求编码不能为空");
        ParameterChange prior = changeRepository.findByRequestCode(requestCode.trim()).orElse(null);
        if (prior == null) return null;
        if (expectedDefinitionId != null && !expectedDefinitionId.equals(prior.definitionId())) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项参数变更");
        }
        return detail(requireDefinition(prior.definitionId()));
    }

    private void append(Long tenantId, Long definitionId, Long valueId, ConfigurationChangeType type,
                        String before, String after, String reason, String requestCode, Long actorId) {
        changeRepository.save(new ParameterChange(tenantId, definitionId, valueId, type,
                before, after, reason, requestCode, actorId));
    }

    private String definitionSnapshot(ConfigurationDefinition value) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("categoryId", value.categoryId());
        snapshot.put("key", value.configKey());
        snapshot.put("name", value.name());
        snapshot.put("description", value.description());
        snapshot.put("valueType", value.valueType().name());
        snapshot.put("controlType", value.controlType().name());
        snapshot.put("jsonSchema", value.jsonSchema());
        snapshot.put("defaultValueJson", value.sensitivity() == ConfigurationSensitivity.SECRET ? null : value.defaultValueJson());
        snapshot.put("exampleValueJson", value.sensitivity() == ConfigurationSensitivity.SECRET ? null : value.exampleValueJson());
        snapshot.put("unit", value.unit());
        snapshot.put("dictionaryCode", value.dictionaryCode());
        snapshot.put("allowedScopes", value.allowedScopes());
        snapshot.put("category", value.category().name());
        snapshot.put("inheritanceEnabled", value.inheritanceEnabled());
        snapshot.put("cacheEnabled", value.cacheEnabled());
        snapshot.put("nullableValue", value.nullableValue());
        snapshot.put("sensitivity", value.sensitivity().name());
        snapshot.put("displayPolicy", value.displayPolicy().name());
        snapshot.put("status", value.status().name());
        snapshot.put("dependsOnKey", value.dependsOnKey());
        snapshot.put("dependsOnValue", value.dependsOnValue());
        snapshot.put("dependencyBehavior", value.dependencyBehavior() == null ? null : value.dependencyBehavior().name());
        return jsonCodec.write(snapshot);
    }

    private String valueSnapshot(ConfigurationDefinition definition, ParameterValue value) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("scopeType", value.scopeType().name());
        snapshot.put("scopeId", value.scopeId());
        snapshot.put("scopeReference", value.scopeReference());
        snapshot.put("scopeCode", value.scopeCode());
        snapshot.put("valueMode", value.valueMode().name());
        snapshot.put("valueJson", definition.sensitivity() == ConfigurationSensitivity.SECRET ? null : value.valueJson());
        snapshot.put("secretRef", value.secretRef());
        snapshot.put("active", value.active());
        return jsonCodec.write(snapshot);
    }

    private ParameterCategoryResponse categoryResponse(ParameterCategory value) {
        return new ParameterCategoryResponse(value.id(), value.revision(), value.parentId(), value.code(),
                value.name(), value.description(), value.sortOrder(),
                value.active() ? ConfigurationStatus.ACTIVE : ConfigurationStatus.INACTIVE,
                value.updatedAt(), value.updatedBy());
    }

    private ParameterDefinitionSummaryResponse summary(ConfigurationDefinition value, ParameterCategory category) {
        return new ParameterDefinitionSummaryResponse(value.id(), value.revision(), value.categoryId(),
                category == null ? "未分类" : category.name(), value.configKey(), value.name(), value.description(),
                value.valueType(), value.controlType(), value.category(), value.status(),
                valueRepository.countByDefinitionId(value.id()), value.updatedAt(), value.updatedBy(),
                value.dependsOnKey(), value.dependsOnValue(), value.dependencyBehavior());
    }

    private ParameterDefinitionDetailResponse detail(ConfigurationDefinition value) {
        ParameterCategory category = categoryRepository.findById(value.categoryId()).orElse(null);
        List<ParameterValueResponse> values = valueRepository.findVisible(value.id(), current().tenantId())
                .stream()
                .map(item -> valueResponse(value, item)).toList();
        boolean reveal = value.sensitivity() == ConfigurationSensitivity.NORMAL
                && value.displayPolicy() == ConfigurationDisplayPolicy.PLAIN;
        String dependsOnName = null;
        Boolean dependencySatisfied = null;
        if (value.dependsOnKey() != null && !value.dependsOnKey().isBlank()) {
            ConfigurationDefinition parentDef = definitionRepository.findByConfigKey(value.dependsOnKey()).orElse(null);
            if (parentDef != null) {
                dependsOnName = parentDef.name();
            }
            try {
                dependencySatisfied = isDependencySatisfied(current().tenantId(), current().subjectId(), null, null, null, null, null,
                        value.dependsOnKey(), value.dependsOnValue());
            } catch (Exception ignored) {
                dependencySatisfied = false;
            }
        }
        return new ParameterDefinitionDetailResponse(value.id(), value.revision(), value.categoryId(),
                category == null ? "未分类" : category.name(), value.configKey(), value.name(), value.description(),
                value.valueType(), value.controlType(), value.jsonSchema(), reveal ? value.defaultValueJson() : null,
                reveal ? value.exampleValueJson() : null, value.defaultValueJson() != null,
                value.exampleValueJson() != null, value.unit(), value.dictionaryCode(), value.allowedScopes(),
                value.category(), value.inheritanceEnabled(), value.cacheEnabled(), value.nullableValue(),
                value.sensitivity(), value.displayPolicy(), value.status(), value.createdAt(), value.createdBy(),
                value.updatedAt(), value.updatedBy(), values,
                value.dependsOnKey(), value.dependsOnValue(), value.dependencyBehavior(),
                dependsOnName, dependencySatisfied);
    }

    private ParameterValueResponse valueResponse(ConfigurationDefinition definition, ParameterValue value) {
        boolean reveal = definition.sensitivity() == ConfigurationSensitivity.NORMAL
                && definition.displayPolicy() == ConfigurationDisplayPolicy.PLAIN;
        String display = switch (definition.displayPolicy()) {
            case PLAIN -> reveal ? value.valueJson() : null;
            case MASKED -> value.valueMode() == ConfigurationValueMode.OVERRIDE ? "******" : null;
            case HIDDEN -> null;
        };
        return new ParameterValueResponse(value.id(), value.definitionId(), value.revision(), value.tenantId(),
                value.scopeType(), value.scopeId(), value.scopeReference(), value.scopeCode(), value.valueMode(),
                reveal ? value.valueJson() : null, display, value.valueJson() != null || value.secretRef() != null,
                value.secretRef() != null, value.active() ? ConfigurationStatus.ACTIVE : ConfigurationStatus.INACTIVE,
                value.updatedAt(), value.updatedBy());
    }

    private ParameterChangeResponse changeResponse(ConfigurationDefinition definition, ParameterChange value) {
        return new ParameterChangeResponse(value.id(), value.definitionId(), value.valueId(), value.targetType(),
                value.changeType(), visibleSnapshot(definition, value.beforeJson()),
                visibleSnapshot(definition, value.afterJson()),
                value.changeReason(), value.requestCode(), value.changedAt(), value.changedBy());
    }

    private JsonNode visibleSnapshot(ConfigurationDefinition definition, String rawSnapshot) {
        JsonNode snapshot = parseSnapshot(rawSnapshot);
        if (snapshot == null || !snapshot.isObject()
                || definition.sensitivity() == ConfigurationSensitivity.NORMAL
                && definition.displayPolicy() == ConfigurationDisplayPolicy.PLAIN) return snapshot;
        ObjectNode protectedSnapshot = (ObjectNode) snapshot.deepCopy();
        protectedSnapshot.putNull("valueJson");
        protectedSnapshot.putNull("defaultValueJson");
        protectedSnapshot.putNull("exampleValueJson");
        return protectedSnapshot;
    }

    private JsonNode parseSnapshot(String value) { return value == null ? null : jsonCodec.readTree(value); }
    private String textOrNull(JsonNode value) { return value == null || value.isNull() ? null : value.asString(); }

    private ParameterCategory requireCategory(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> notFound("PARAMETER_CATEGORY_NOT_FOUND", "未找到参数分类"));
    }

    private ParameterCategory requireActiveCategory(Long id) {
        ParameterCategory category = requireCategory(id);
        if (!category.active()) throw badRequest("PARAMETER_CATEGORY_INACTIVE", "停用分类下不能维护参数定义");
        return category;
    }

    private ConfigurationDefinition requireDefinition(Long id) {
        return definitionRepository.findById(id)
                .orElseThrow(() -> notFound("PARAMETER_DEFINITION_NOT_FOUND", "未找到参数定义"));
    }

    private ConfigurationDefinition requireActiveDefinition(String key) {
        return definitionRepository.findByConfigKey(ConfigurationCodePolicy.requireParameterKey(key))
                .filter(value -> value.status() == ConfigurationStatus.ACTIVE)
                .orElseThrow(() -> notFound("PARAMETER_NOT_FOUND", "未找到可用参数 " + key));
    }

    private ParameterValue requireVisibleValue(Long definitionId, Long valueId, Long tenantId) {
        return valueRepository.findByIdAndDefinitionId(valueId, definitionId)
                .filter(value -> value.tenantId() == null || value.tenantId().equals(tenantId))
                .orElseThrow(() -> notFound("PARAMETER_VALUE_NOT_FOUND", "未找到参数当前值"));
    }

    private void validateCategoryParent(Long categoryId, Long parentId) {
        if (parentId == null) return;
        ParameterCategory current = requireCategory(parentId);
        if (!current.active()) throw badRequest("PARAMETER_CATEGORY_PARENT_INACTIVE", "不能选择停用分类作为父分类");
        Set<Long> visited = new java.util.HashSet<>();
        for (int depth = 0; current != null && depth < 64; depth++) {
            if (!visited.add(current.id()) || Objects.equals(current.id(), categoryId)) {
                throw badRequest("PARAMETER_CATEGORY_CYCLE", "参数分类不能形成循环层级");
            }
            current = current.parentId() == null ? null : requireCategory(current.parentId());
        }
        if (current != null) throw badRequest("PARAMETER_CATEGORY_DEPTH_EXCEEDED", "参数分类层级不能超过64层");
    }

    private void validateCategoryPath(Long categoryId, Map<Long, Long> proposedParents) {
        Set<Long> visited = new java.util.HashSet<>();
        Long currentId = categoryId;
        for (int depth = 0; currentId != null && depth < 64; depth++) {
            if (!visited.add(currentId)) {
                throw badRequest("PARAMETER_CATEGORY_CYCLE", "参数分类不能形成循环层级");
            }
            currentId = proposedParents.get(currentId);
            if (currentId != null && !proposedParents.containsKey(currentId)) {
                throw notFound("PARAMETER_CATEGORY_NOT_FOUND", "未找到父参数分类");
            }
        }
        if (currentId != null) {
            throw badRequest("PARAMETER_CATEGORY_DEPTH_EXCEEDED", "参数分类层级不能超过64层");
        }
    }

    private void runRevisionGuard(Runnable action) {
        RevisionGuard.run("PARAMETER_REVISION_CONFLICT", "参数已被其他操作更新，请刷新后重试", action);
    }

    private void invalidateCacheAfterCommit() {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            valueCache.invalidateAll();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { valueCache.invalidateAll(); }
        });
    }

    private ExecutionContext current() { return contextProvider.requireCurrent(); }

    private ExecutionContext currentWithActor() {
        ExecutionContext context = current();
        if (context.subjectId() != null) return context;
        Long accountId = identityAccessDirectory.findActiveAccount(context.tenantId(), context.actor())
                .map(account -> account.id())
                .orElseThrow(() -> badRequest("PARAMETER_ACTOR_REQUIRED", "参数变更必须由可审计的用户账号发起"));
        return new ExecutionContext(context.tenantId(), accountId, context.actor(),
                context.correlationId(), context.authorities());
    }

    private String normalizedDictionaryCode(String code) {
        return code == null || code.isBlank() ? null : DictionaryCodes.require(code);
    }

    private DefinitionCommand preserveProtectedValues(DefinitionCommand command,
                                                       ConfigurationDefinition existing) {
        if (command.sensitivity() == ConfigurationSensitivity.SECRET
                || existing.sensitivity() == ConfigurationSensitivity.NORMAL
                && existing.displayPolicy() == ConfigurationDisplayPolicy.PLAIN) return command;
        String defaultValue = command.defaultValueJson() == null
                ? existing.defaultValueJson() : command.defaultValueJson();
        String exampleValue = command.exampleValueJson() == null
                ? existing.exampleValueJson() : command.exampleValueJson();
        return new DefinitionCommand(command.categoryId(), command.key(), command.name(), command.description(),
                command.valueType(), command.controlType(), command.jsonSchema(), defaultValue, exampleValue,
                command.unit(), command.dictionaryCode(), command.allowedScopes(), command.category(),
                command.inheritanceEnabled(), command.cacheEnabled(), command.nullableValue(),
                command.sensitivity(), command.displayPolicy(),
                command.dependsOnKey(), command.dependsOnValue(), command.dependencyBehavior(),
                command.reason(), command.requestCode());
    }

    private String normalizeReference(String value) {
        return value == null || value.isBlank() ? null : ConfigurationCodePolicy.requireScopeReference(value);
    }

    private void requireScopeId(Long value) {
        if (value == null || value <= 0) throw badRequest("PARAMETER_SCOPE_ID_REQUIRED", "参数作用域标识不能为空");
    }

    private ScopeCandidate idCandidate(ConfigurationScope scope, Long id, Long tenantId) {
        String code = scope == ConfigurationScope.TENANT ? "TENANT:" + tenantId : scope.name() + ":" + id;
        return new ScopeCandidate(scope, id, null, code);
    }

    private ScopeCandidate referenceCandidate(ConfigurationScope scope, String reference, Long tenantId) {
        return new ScopeCandidate(scope, null, reference, scope.name() + ":" + tenantId + ":" + reference);
    }

    private void addReferenceCandidate(List<ScopeCandidate> result, ConfigurationDefinition definition,
                                       ConfigurationScope scope, String reference, Long tenantId) {
        if (reference != null && definition.allows(scope)) result.add(referenceCandidate(scope, reference, tenantId));
    }

    public record DefinitionCommand(
            Long categoryId, String key, String name, String description,
            ConfigurationValueType valueType, ConfigurationControlType controlType,
            String jsonSchema, String defaultValueJson, String exampleValueJson,
            String unit, String dictionaryCode, Set<ConfigurationScope> allowedScopes,
            ConfigurationCategory category, boolean inheritanceEnabled, boolean cacheEnabled,
            boolean nullableValue, ConfigurationSensitivity sensitivity,
            ConfigurationDisplayPolicy displayPolicy,
            String dependsOnKey, String dependsOnValue,
            ConfigurationDependencyBehavior dependencyBehavior,
            String reason, String requestCode) {
        public DefinitionCommand(
                Long categoryId, String key, String name, String description,
                ConfigurationValueType valueType, ConfigurationControlType controlType,
                String jsonSchema, String defaultValueJson, String exampleValueJson,
                String unit, String dictionaryCode, Set<ConfigurationScope> allowedScopes,
                ConfigurationCategory category, boolean inheritanceEnabled, boolean cacheEnabled,
                boolean nullableValue, ConfigurationSensitivity sensitivity,
                ConfigurationDisplayPolicy displayPolicy, String reason, String requestCode) {
            this(categoryId, key, name, description, valueType, controlType, jsonSchema, defaultValueJson,
                    exampleValueJson, unit, dictionaryCode, allowedScopes, category, inheritanceEnabled,
                    cacheEnabled, nullableValue, sensitivity, displayPolicy, null, null,
                    ConfigurationDependencyBehavior.DISABLE_AND_SUPPRESS, reason, requestCode);
        }
    }

    public record CategoryOrderCommand(
            Long id, long expectedRevision, Long parentId, int sortOrder) {
    }

    public record ValueCommand(
            Long expectedRevision, ConfigurationScope scopeType, Long scopeId,
            Long organizationId, String scopeReference, ConfigurationValueMode valueMode,
            String valueJson, String secretRef, String reason, String requestCode) {
    }

    private record ScopeTarget(Long tenantId, Long scopeId, String scopeReference, String scopeCode) {}
    private record ScopeCandidate(ConfigurationScope scope, Long scopeId, String scopeReference, String scopeCode) {}
    private record ResolutionContext(Long tenantId, Long userId, Long organizationId, Long departmentId,
                                     String productCode, String moduleCode, String environmentCode) {}
}
