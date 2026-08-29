package com.rhn.platform.dictionary.application;

import com.rhn.platform.dictionary.api.DictionaryAttributeDirectory;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.ApplicableItemView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.AttributeDefinitionView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.AttributeValueMemberView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.AttributeValueSetView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.ItemAttributeConfigurationView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.ItemAttributeView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.ReferenceOptionView;
import com.rhn.platform.dictionary.domain.DictionaryAttributeCardinality;
import com.rhn.platform.dictionary.domain.DictionaryAttributeDataType;
import com.rhn.platform.dictionary.domain.DictionaryAttributeDefinition;
import com.rhn.platform.dictionary.domain.DictionaryAttributeOverridePolicy;
import com.rhn.platform.dictionary.domain.DictionaryAttributeScopeType;
import com.rhn.platform.dictionary.domain.DictionaryAttributeValueMode;
import com.rhn.platform.dictionary.domain.DictionaryChange;
import com.rhn.platform.dictionary.domain.DictionaryChangeTargetType;
import com.rhn.platform.dictionary.domain.DictionaryChangeType;
import com.rhn.platform.dictionary.domain.DictionaryCodePolicy;
import com.rhn.platform.dictionary.domain.DictionaryDefinition;
import com.rhn.platform.dictionary.domain.DictionaryItem;
import com.rhn.platform.dictionary.domain.DictionaryItemAttributeValue;
import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import com.rhn.platform.dictionary.infrastructure.DictionaryAttributeDefinitionRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryChangeRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryDefinitionRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryItemAttributeValueRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryItemRepository;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DictionaryAttributeService implements DictionaryAttributeDirectory {
    private final DictionaryDefinitionRepository definitionRepository;
    private final DictionaryItemRepository itemRepository;
    private final DictionaryAttributeDefinitionRepository attributeRepository;
    private final DictionaryItemAttributeValueRepository valueRepository;
    private final DictionaryChangeRepository changeRepository;
    private final ExecutionContextProvider contextProvider;
    private final IdentityAccessDirectory identityAccessDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final JsonCodec jsonCodec;

    public DictionaryAttributeService(DictionaryDefinitionRepository definitionRepository,
                                      DictionaryItemRepository itemRepository,
                                      DictionaryAttributeDefinitionRepository attributeRepository,
                                      DictionaryItemAttributeValueRepository valueRepository,
                                      DictionaryChangeRepository changeRepository,
                                      ExecutionContextProvider contextProvider,
                                      IdentityAccessDirectory identityAccessDirectory,
                                      OrganizationDirectory organizationDirectory,
                                      JsonCodec jsonCodec) {
        this.definitionRepository = definitionRepository;
        this.itemRepository = itemRepository;
        this.attributeRepository = attributeRepository;
        this.valueRepository = valueRepository;
        this.changeRepository = changeRepository;
        this.contextProvider = contextProvider;
        this.identityAccessDirectory = identityAccessDirectory;
        this.organizationDirectory = organizationDirectory;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    public List<AttributeDefinitionView> definitions(Long dictionaryId) {
        requireVisibleDictionary(dictionaryId);
        return attributeRepository.findByDictionaryIdOrderByNameAscCodeAsc(dictionaryId).stream()
                .map(this::definitionView).toList();
    }

    @Transactional
    public AttributeDefinitionView createDefinition(Long dictionaryId, long expectedDictionaryRevision,
                                                    DefinitionCommand command) {
        requireNewRequest(command.requestCode());
        ExecutionContext context = current();
        Long actorId = actorId(context);
        DictionaryDefinition dictionary = requireVisibleDictionary(dictionaryId);
        String code = DictionaryCodePolicy.requireItemCode(command.code());
        if (attributeRepository.existsByDictionaryIdAndCode(dictionaryId, code)) {
            throw conflict("DICTIONARY_ATTRIBUTE_CODE_DUPLICATE", "当前字典已存在相同扩展属性编码");
        }
        validateDefinitionCommand(dictionary, command);
        touchDictionary(dictionary, expectedDictionaryRevision, actorId);
        DictionaryAttributeDefinition definition = attributeRepository.saveAndFlush(new DictionaryAttributeDefinition(
                dictionaryId, code, command.name(), command.description(), command.dataType(), command.cardinality(),
                command.referenceDictionaryId(), normalizeSchema(command.schema()), command.minimumScope(),
                command.overridePolicy(), command.requiredValue(), command.searchable(), actorId));
        definitionRepository.saveAndFlush(dictionary);
        append(dictionary, null, definition.id(), DictionaryChangeType.CREATE_ATTRIBUTE,
                DictionaryChangeTargetType.ATTR_DEFINITION, null, jsonCodec.write(definitionSnapshot(definition)),
                command.reason(), command.requestCode(), actorId);
        return definitionView(definition);
    }

    @Transactional
    public AttributeDefinitionView updateDefinition(Long dictionaryId, Long attributeId,
                                                    long expectedDictionaryRevision,
                                                    long expectedAttributeRevision,
                                                    DefinitionCommand command) {
        requireNewRequest(command.requestCode());
        ExecutionContext context = current();
        Long actorId = actorId(context);
        DictionaryDefinition dictionary = requireVisibleDictionary(dictionaryId);
        DictionaryAttributeDefinition definition = requireAttribute(dictionaryId, attributeId);
        if (definition.revision() != expectedAttributeRevision) {
            throw conflict("DICTIONARY_ATTRIBUTE_REVISION_CONFLICT", "扩展属性已被其他操作更新，请刷新后重试");
        }
        validateDefinitionCommand(dictionary, command);
        if (valueRepository.existsByAttributeDefinitionId(attributeId)
                && (definition.dataType() != command.dataType()
                || definition.cardinality() != command.cardinality()
                || !Objects.equals(definition.referenceDictionaryId(), command.referenceDictionaryId()))) {
            throw conflict("DICTIONARY_ATTRIBUTE_VALUES_EXIST", "已有属性值时不能修改数据类型、基数或引用值域");
        }
        String before = jsonCodec.write(definitionSnapshot(definition));
        touchDictionary(dictionary, expectedDictionaryRevision, actorId);
        definition.update(command.name(), command.description(), command.dataType(), command.cardinality(),
                command.referenceDictionaryId(), normalizeSchema(command.schema()), command.minimumScope(),
                command.overridePolicy(), command.requiredValue(), command.searchable(), actorId);
        try {
            attributeRepository.saveAndFlush(definition);
            definitionRepository.saveAndFlush(dictionary);
        } catch (OptimisticLockingFailureException exception) {
            throw conflict("DICTIONARY_ATTRIBUTE_REVISION_CONFLICT", "扩展属性已被其他操作更新，请刷新后重试");
        }
        append(dictionary, null, definition.id(), DictionaryChangeType.UPDATE_ATTRIBUTE,
                DictionaryChangeTargetType.ATTR_DEFINITION, before, jsonCodec.write(definitionSnapshot(definition)),
                command.reason(), command.requestCode(), actorId);
        return definitionView(definition);
    }

    @Transactional
    public AttributeDefinitionView changeDefinitionStatus(Long dictionaryId, Long attributeId,
                                                          long expectedDictionaryRevision,
                                                          long expectedAttributeRevision,
                                                          boolean enabled, String reason, String requestCode) {
        requireNewRequest(requestCode);
        ExecutionContext context = current();
        Long actorId = actorId(context);
        DictionaryDefinition dictionary = requireVisibleDictionary(dictionaryId);
        DictionaryAttributeDefinition definition = requireAttribute(dictionaryId, attributeId);
        if (definition.revision() != expectedAttributeRevision) {
            throw conflict("DICTIONARY_ATTRIBUTE_REVISION_CONFLICT", "扩展属性已被其他操作更新，请刷新后重试");
        }
        String before = jsonCodec.write(definitionSnapshot(definition));
        touchDictionary(dictionary, expectedDictionaryRevision, actorId);
        definition.changeStatus(enabled ? DictionaryStatus.ACTIVE : DictionaryStatus.INACTIVE, actorId);
        attributeRepository.saveAndFlush(definition);
        definitionRepository.saveAndFlush(dictionary);
        append(dictionary, null, definition.id(), enabled ? DictionaryChangeType.ENABLE_ATTRIBUTE
                        : DictionaryChangeType.DISABLE_ATTRIBUTE,
                DictionaryChangeTargetType.ATTR_DEFINITION, before, jsonCodec.write(definitionSnapshot(definition)),
                reason, requestCode, actorId);
        return definitionView(definition);
    }

    @Transactional(readOnly = true)
    public ItemAttributeConfigurationView itemConfiguration(Long dictionaryId, Long itemId,
                                                            DictionaryAttributeScopeType editingScope,
                                                            Long organizationId, Long departmentId) {
        DictionaryDefinition dictionary = requireVisibleDictionary(dictionaryId);
        DictionaryItem item = requireItem(dictionaryId, itemId);
        Scope editing = scope(editingScope, organizationId, departmentId, current());
        List<ItemAttributeView> attributes = attributeRepository
                .findByDictionaryIdOrderByNameAscCodeAsc(dictionary.id()).stream()
                .map(definition -> {
                    List<DictionaryItemAttributeValue> all = activeValues(item.id(), definition.id());
                    AttributeValueSetView configured = valueSet(all.stream()
                            .filter(value -> value.scopeCode().equals(editing.code())).toList(), definition);
                    AttributeValueSetView resolved = resolvedValueSet(all, definition,
                            editing.organizationId(), editing.departmentId(), current().tenantId(), false);
                    return new ItemAttributeView(definitionView(definition), configured, resolved,
                            configured == null && resolved != null);
                }).toList();
        return new ItemAttributeConfigurationView(dictionary.id(), item.id(), item.code(), item.name(),
                editing.type(), editing.code(), attributes);
    }

    @Transactional(readOnly = true)
    public List<ItemAttributeConfigurationView> itemConfigurations(Long dictionaryId,
                                                                   DictionaryAttributeScopeType editingScope,
                                                                   Long organizationId, Long departmentId) {
        DictionaryDefinition dictionary = requireVisibleDictionary(dictionaryId);
        ExecutionContext context = current();
        Scope editing = scope(editingScope, organizationId, departmentId, context);
        List<DictionaryItem> items = itemRepository.findByDictionaryIdOrderBySortOrderAscCodeAsc(dictionary.id());
        if (items.isEmpty()) return List.of();
        List<DictionaryAttributeDefinition> definitions = attributeRepository
                .findByDictionaryIdOrderByNameAscCodeAsc(dictionary.id());
        List<DictionaryItemAttributeValue> values = valueRepository
                .findByDictionaryItemIdInAndStatusOrderByDictionaryItemIdAscAttributeDefinitionIdAscValueOrderAsc(
                        items.stream().map(DictionaryItem::id).toList(), DictionaryStatus.ACTIVE);
        Map<Long, Map<Long, List<DictionaryItemAttributeValue>>> valuesByItemAndDefinition = new HashMap<>();
        for (DictionaryItemAttributeValue value : values) {
            valuesByItemAndDefinition
                    .computeIfAbsent(value.dictionaryItemId(), ignored -> new HashMap<>())
                    .computeIfAbsent(value.attributeDefinitionId(), ignored -> new ArrayList<>())
                    .add(value);
        }
        return items.stream().map(item -> {
            Map<Long, List<DictionaryItemAttributeValue>> itemValues = valuesByItemAndDefinition
                    .getOrDefault(item.id(), Map.of());
            List<ItemAttributeView> attributes = definitions.stream().map(definition -> {
                List<DictionaryItemAttributeValue> all = itemValues.getOrDefault(definition.id(), List.of());
                AttributeValueSetView configured = valueSet(all.stream()
                        .filter(value -> value.scopeCode().equals(editing.code())).toList(), definition);
                AttributeValueSetView resolved = resolvedValueSet(all, definition,
                        editing.organizationId(), editing.departmentId(), context.tenantId(), false);
                return new ItemAttributeView(definitionView(definition), configured, resolved,
                        configured == null && resolved != null);
            }).toList();
            return new ItemAttributeConfigurationView(dictionary.id(), item.id(), item.code(), item.name(),
                    editing.type(), editing.code(), attributes);
        }).toList();
    }

    @Transactional
    public ItemAttributeConfigurationView setItemValues(Long dictionaryId, Long itemId, Long attributeId,
                                                        long expectedDictionaryRevision,
                                                        SetValuesCommand command) {
        requireNewRequest(command.requestCode());
        ExecutionContext context = current();
        Long actorId = actorId(context);
        DictionaryDefinition dictionary = requireVisibleDictionary(dictionaryId);
        DictionaryItem item = requireItem(dictionaryId, itemId);
        DictionaryAttributeDefinition definition = requireActiveAttribute(dictionaryId, attributeId);
        Scope target = scope(command.scopeType(), command.organizationId(), command.departmentId(), context);
        if (!definition.minimumScope().allows(target.type())) {
            throw badRequest("DICTIONARY_ATTRIBUTE_SCOPE_NOT_ALLOWED", "该属性不允许在所选层级自定义");
        }
        if (definition.overridePolicy() == DictionaryAttributeOverridePolicy.NO_OVERRIDE
                && target.type() != DictionaryAttributeScopeType.PLATFORM) {
            throw badRequest("DICTIONARY_ATTRIBUTE_OVERRIDE_FORBIDDEN", "该属性禁止下级作用域覆盖");
        }
        List<String> values = normalizedValues(command.values());
        if (command.valueMode() == DictionaryAttributeValueMode.EXPLICIT_EMPTY) {
            if (!values.isEmpty()) throw badRequest("DICTIONARY_ATTRIBUTE_EXPLICIT_EMPTY_VALUES", "显式空集不能携带属性值");
        } else {
            if (values.isEmpty()) throw badRequest("DICTIONARY_ATTRIBUTE_VALUES_REQUIRED", "覆盖模式至少需要一个属性值");
            if (definition.cardinality() == DictionaryAttributeCardinality.SINGLE && values.size() != 1) {
                throw badRequest("DICTIONARY_ATTRIBUTE_SINGLE_VALUE_REQUIRED", "单值属性只能配置一个值");
            }
        }
        List<DictionaryItemAttributeValue> beforeValues = valueRepository
                .findByDictionaryItemIdAndAttributeDefinitionIdAndScopeCodeAndStatusOrderByValueOrderAsc(
                        item.id(), definition.id(), target.code(), DictionaryStatus.ACTIVE);
        String before = jsonCodec.write(valueSnapshot(beforeValues, definition));
        touchDictionary(dictionary, expectedDictionaryRevision, actorId);
        valueRepository.deleteByDictionaryItemIdAndAttributeDefinitionIdAndScopeCode(
                item.id(), definition.id(), target.code());
        valueRepository.flush();
        List<DictionaryItemAttributeValue> next = new ArrayList<>();
        if (command.valueMode() == DictionaryAttributeValueMode.EXPLICIT_EMPTY) {
            next.add(newValue(item.id(), definition, target, 0, command.valueMode(), null, actorId));
        } else {
            int order = 1;
            for (String value : values) next.add(newValue(item.id(), definition, target, order++, command.valueMode(), value, actorId));
        }
        valueRepository.saveAllAndFlush(next);
        definitionRepository.saveAndFlush(dictionary);
        append(dictionary, item.id(), definition.id(), DictionaryChangeType.SET_ITEM_ATTRIBUTE,
                DictionaryChangeTargetType.ITEM_ATTRIBUTE, before, jsonCodec.write(valueSnapshot(next, definition)),
                command.reason(), command.requestCode(), actorId);
        return itemConfiguration(dictionaryId, itemId, target.type(), target.organizationId(), target.departmentId());
    }

    @Transactional
    public ItemAttributeConfigurationView inheritItemValues(Long dictionaryId, Long itemId, Long attributeId,
                                                            long expectedDictionaryRevision,
                                                            ScopeCommand command) {
        requireNewRequest(command.requestCode());
        ExecutionContext context = current();
        Long actorId = actorId(context);
        DictionaryDefinition dictionary = requireVisibleDictionary(dictionaryId);
        DictionaryItem item = requireItem(dictionaryId, itemId);
        DictionaryAttributeDefinition definition = requireAttribute(dictionaryId, attributeId);
        Scope target = scope(command.scopeType(), command.organizationId(), command.departmentId(), context);
        List<DictionaryItemAttributeValue> beforeValues = valueRepository
                .findByDictionaryItemIdAndAttributeDefinitionIdAndScopeCodeAndStatusOrderByValueOrderAsc(
                        item.id(), definition.id(), target.code(), DictionaryStatus.ACTIVE);
        if (beforeValues.isEmpty()) throw badRequest("DICTIONARY_ATTRIBUTE_ALREADY_INHERITED", "当前作用域已经处于继承状态");
        touchDictionary(dictionary, expectedDictionaryRevision, actorId);
        valueRepository.deleteByDictionaryItemIdAndAttributeDefinitionIdAndScopeCode(item.id(), definition.id(), target.code());
        valueRepository.flush();
        definitionRepository.saveAndFlush(dictionary);
        append(dictionary, item.id(), definition.id(), DictionaryChangeType.CLEAR_ITEM_ATTRIBUTE,
                DictionaryChangeTargetType.ITEM_ATTRIBUTE, jsonCodec.write(valueSnapshot(beforeValues, definition)), null,
                command.reason(), command.requestCode(), actorId);
        return itemConfiguration(dictionaryId, itemId, target.type(), target.organizationId(), target.departmentId());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ApplicableItemView> applicableItems(Long tenantId, Long organizationId, Long departmentId,
                                                    String dictionaryCode, String attributeCode,
                                                    String referenceItemCode) {
        ExecutionContext context = current();
        Long effectiveTenantId = tenantId == null ? context.tenantId() : tenantId;
        Long effectiveOrganizationId = organizationId == null ? context.organizationId() : organizationId;
        Long effectiveDepartmentId = departmentId == null ? context.departmentId() : departmentId;
        DictionaryDefinition dictionary = resolveDictionary(effectiveTenantId, dictionaryCode);
        DictionaryAttributeDefinition definition = attributeRepository
                .findByDictionaryIdAndCode(dictionary.id(), DictionaryCodePolicy.requireItemCode(attributeCode))
                .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                .orElseThrow(() -> notFound("DICTIONARY_ATTRIBUTE_NOT_FOUND", "未找到可用字典扩展属性 " + attributeCode));
        if (definition.dataType() != DictionaryAttributeDataType.DICT_REF) {
            throw badRequest("DICTIONARY_ATTRIBUTE_REFERENCE_REQUIRED", "适用性筛选仅支持字典引用型属性");
        }
        DictionaryItem reference = itemRepository.findByDictionaryIdAndCode(definition.referenceDictionaryId(),
                        DictionaryCodePolicy.requireItemCode(referenceItemCode))
                .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                .orElseThrow(() -> notFound("DICTIONARY_ATTRIBUTE_REFERENCE_NOT_FOUND", "未找到引用字典项 " + referenceItemCode));
        List<DictionaryItem> items = itemRepository.findByDictionaryIdOrderBySortOrderAscCodeAsc(dictionary.id()).stream()
                .filter(value -> value.status() == DictionaryStatus.ACTIVE).toList();
        List<DictionaryItemAttributeValue> allValues = valueRepository
                .findByDictionaryItemIdInAndAttributeDefinitionIdAndStatusOrderByDictionaryItemIdAscValueOrderAsc(
                        items.stream().map(DictionaryItem::id).toList(), definition.id(), DictionaryStatus.ACTIVE);
        Map<Long, List<DictionaryItemAttributeValue>> byItem = new HashMap<>();
        for (DictionaryItemAttributeValue value : allValues) {
            byItem.computeIfAbsent(value.dictionaryItemId(), ignored -> new ArrayList<>()).add(value);
        }
        List<ApplicableItemView> result = new ArrayList<>();
        for (DictionaryItem item : items) {
            AttributeValueSetView resolved = resolvedValueSet(byItem.getOrDefault(item.id(), List.of()), definition,
                    effectiveOrganizationId, effectiveDepartmentId, effectiveTenantId, true);
            if (resolved != null && resolved.values().stream()
                    .anyMatch(value -> Objects.equals(value.referenceItemId(), reference.id()))) {
                result.add(new ApplicableItemView(item.id(), item.code(), item.name(), item.sortOrder(),
                        definition.code(), reference.code(), resolved.scopeCode()));
            }
        }
        return result;
    }

    private AttributeValueSetView resolvedValueSet(List<DictionaryItemAttributeValue> values,
                                                   DictionaryAttributeDefinition definition,
                                                   Long organizationId, Long departmentId, Long tenantId,
                                                   boolean enforceRequired) {
        for (Scope candidate : resolutionScopes(definition.minimumScope(), tenantId, organizationId, departmentId)) {
            List<DictionaryItemAttributeValue> scoped = values.stream()
                    .filter(value -> value.scopeCode().equals(candidate.code()))
                    .sorted(Comparator.comparingInt(DictionaryItemAttributeValue::valueOrder)).toList();
            AttributeValueSetView result = valueSet(scoped, definition);
            if (result != null) return result;
        }
        if (enforceRequired && definition.requiredValue()) {
            throw badRequest("MISSING_REQUIRED_ATTRIBUTE", "字典项必配属性 " + definition.code() + " 没有最终值");
        }
        return null;
    }

    private List<Scope> resolutionScopes(DictionaryAttributeScopeType minimumScope, Long tenantId,
                                         Long organizationId, Long departmentId) {
        List<Scope> result = new ArrayList<>();
        if (minimumScope.allows(DictionaryAttributeScopeType.DEPARTMENT)
                && tenantId != null && organizationId != null && departmentId != null) {
            result.add(scopeOf(DictionaryAttributeScopeType.DEPARTMENT, tenantId, organizationId, departmentId));
        }
        if (minimumScope.allows(DictionaryAttributeScopeType.ORGANIZATION)
                && tenantId != null && organizationId != null) {
            result.add(scopeOf(DictionaryAttributeScopeType.ORGANIZATION, tenantId, organizationId, null));
        }
        if (minimumScope.allows(DictionaryAttributeScopeType.TENANT) && tenantId != null) {
            result.add(scopeOf(DictionaryAttributeScopeType.TENANT, tenantId, null, null));
        }
        result.add(scopeOf(DictionaryAttributeScopeType.PLATFORM, null, null, null));
        return result;
    }

    private AttributeValueSetView valueSet(List<DictionaryItemAttributeValue> values,
                                           DictionaryAttributeDefinition definition) {
        if (values == null || values.isEmpty()) return null;
        DictionaryItemAttributeValue first = values.getFirst();
        if (values.stream().anyMatch(value -> value.valueMode() != first.valueMode())) {
            throw conflict("DICTIONARY_ATTRIBUTE_VALUE_MODE_CONFLICT", "同一作用域存在冲突的属性值模式");
        }
        List<AttributeValueMemberView> members = first.valueMode() == DictionaryAttributeValueMode.EXPLICIT_EMPTY
                ? List.of() : values.stream().map(value -> memberView(value, definition)).toList();
        return new AttributeValueSetView(first.scopeType(), first.scopeCode(), first.tenantId(),
                first.organizationId(), first.departmentId(), first.valueMode(), members,
                scopeLabel(first.scopeType()));
    }

    private AttributeValueMemberView memberView(DictionaryItemAttributeValue value,
                                                DictionaryAttributeDefinition definition) {
        if (definition.dataType() == DictionaryAttributeDataType.DICT_REF) {
            DictionaryItem item = itemRepository.findById(value.referenceItemId()).orElse(null);
            return new AttributeValueMemberView(value.id(), value.valueOrder(),
                    item == null ? null : item.code(), value.referenceItemId(),
                    item == null ? null : item.code(), item == null ? null : item.name());
        }
        return new AttributeValueMemberView(value.id(), value.valueOrder(), scalarValue(value, definition.dataType()),
                null, null, null);
    }

    private DictionaryItemAttributeValue newValue(Long itemId, DictionaryAttributeDefinition definition,
                                                  Scope scope, int order, DictionaryAttributeValueMode mode,
                                                  String raw, Long actorId) {
        Boolean bool = null; Long integer = null; BigDecimal decimal = null; String text = null; String code = null;
        LocalDate date = null; Instant datetime = null; Long reference = null;
        if (mode == DictionaryAttributeValueMode.OVERRIDE) {
            try {
                switch (definition.dataType()) {
                    case BOOLEAN -> bool = parseBoolean(raw);
                    case INTEGER -> integer = Long.valueOf(raw);
                    case DECIMAL -> decimal = new BigDecimal(raw);
                    case TEXT -> text = raw;
                    case CODE -> code = requireRaw(raw, 256);
                    case DATE -> date = LocalDate.parse(raw);
                    case DATETIME -> datetime = Instant.parse(raw);
                    case DICT_REF -> reference = requireReference(definition, raw).id();
                }
            } catch (RuntimeException exception) {
                throw badRequest("DICTIONARY_ATTRIBUTE_VALUE_INVALID", "属性值与数据类型不匹配：" + raw);
            }
        }
        return new DictionaryItemAttributeValue(itemId, definition.id(), scope.type(), scope.code(),
                scope.tenantId(), scope.organizationId(), scope.departmentId(), order, mode,
                bool, integer, decimal, text, code, date, datetime, reference, actorId);
    }

    private DictionaryItem requireReference(DictionaryAttributeDefinition definition, String raw) {
        Long id;
        try {
            id = Long.valueOf(raw);
        } catch (NumberFormatException exception) {
            return itemRepository.findByDictionaryIdAndCode(definition.referenceDictionaryId(), raw)
                    .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                    .orElseThrow(() -> notFound("DICTIONARY_ATTRIBUTE_REFERENCE_NOT_FOUND", "引用字典项不存在"));
        }
        return itemRepository.findByIdAndDictionaryId(id, definition.referenceDictionaryId())
                .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                .orElseThrow(() -> notFound("DICTIONARY_ATTRIBUTE_REFERENCE_NOT_FOUND", "引用字典项不存在"));
    }

    private AttributeDefinitionView definitionView(DictionaryAttributeDefinition value) {
        DictionaryDefinition reference = value.referenceDictionaryId() == null ? null
                : definitionRepository.findById(value.referenceDictionaryId()).orElse(null);
        List<ReferenceOptionView> options = reference == null ? List.of()
                : itemRepository.findByDictionaryIdOrderBySortOrderAscCodeAsc(reference.id()).stream()
                .filter(item -> item.status() == DictionaryStatus.ACTIVE)
                .map(item -> new ReferenceOptionView(item.id(), item.code(), item.name(), item.sortOrder())).toList();
        return new AttributeDefinitionView(value.id(), value.revision(), value.dictionaryId(), value.code(), value.name(),
                value.description(), value.dataType(), value.cardinality(), value.referenceDictionaryId(),
                reference == null ? null : reference.code(), reference == null ? null : reference.name(),
                jsonCodec.readTree(value.schemaJson()), value.minimumScope(), value.overridePolicy(),
                value.requiredValue(), value.searchable(), value.status(), value.updatedAt(), value.updatedBy(), options);
    }

    private void validateDefinitionCommand(DictionaryDefinition dictionary, DefinitionCommand command) {
        if (command.dataType() == DictionaryAttributeDataType.DICT_REF) {
            DictionaryDefinition reference = requireVisibleDictionary(command.referenceDictionaryId());
            if (reference.status() != DictionaryStatus.ACTIVE) {
                throw badRequest("DICTIONARY_ATTRIBUTE_REFERENCE_INACTIVE", "引用值域字典必须处于启用状态");
            }
            if (reference.id().equals(dictionary.id())) {
                throw badRequest("DICTIONARY_ATTRIBUTE_SELF_REFERENCE", "扩展属性不能引用自身所属字典");
            }
        }
        normalizeSchema(command.schema());
    }

    private String normalizeSchema(JsonNode schema) {
        JsonNode value = schema == null || schema.isNull() ? jsonCodec.readTree("{}") : schema;
        if (!value.isObject()) throw badRequest("DICTIONARY_ATTRIBUTE_SCHEMA_INVALID", "属性值模式必须是JSON对象");
        return jsonCodec.write(value);
    }

    private List<String> normalizedValues(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(Objects::nonNull).map(String::trim).filter(value -> !value.isEmpty()).distinct().toList();
    }

    private Scope scope(DictionaryAttributeScopeType type, Long organizationId, Long departmentId,
                        ExecutionContext context) {
        DictionaryAttributeScopeType actual = type == null ? deepestContextScope(context) : type;
        Long organization = organizationId == null ? context.organizationId() : organizationId;
        Long department = departmentId == null ? context.departmentId() : departmentId;
        if (actual == DictionaryAttributeScopeType.ORGANIZATION) {
            if (organization == null) {
                throw badRequest("DICTIONARY_ATTRIBUTE_ORGANIZATION_REQUIRED", "机构作用域需要选择目标机构");
            }
            organizationDirectory.requireOrganization(context.tenantId(), organization);
        }
        if (actual == DictionaryAttributeScopeType.DEPARTMENT) {
            if (organization == null || department == null) {
                throw badRequest("DICTIONARY_ATTRIBUTE_DEPARTMENT_REQUIRED", "科室作用域需要选择所属机构和目标科室");
            }
            organizationDirectory.requireDepartment(context.tenantId(), organization, department);
        }
        return scopeOf(actual, actual == DictionaryAttributeScopeType.PLATFORM ? null : context.tenantId(),
                actual.depth() >= DictionaryAttributeScopeType.ORGANIZATION.depth() ? organization : null,
                actual == DictionaryAttributeScopeType.DEPARTMENT ? department : null);
    }

    private Scope scopeOf(DictionaryAttributeScopeType type, Long tenantId, Long organizationId, Long departmentId) {
        String code = switch (type) {
            case PLATFORM -> "PLATFORM";
            case TENANT -> "TENANT:" + tenantId;
            case ORGANIZATION -> "TENANT:" + tenantId + "/ORG:" + organizationId;
            case DEPARTMENT -> "TENANT:" + tenantId + "/ORG:" + organizationId + "/DEPT:" + departmentId;
        };
        return new Scope(type, code, tenantId, organizationId, departmentId);
    }

    private DictionaryAttributeScopeType deepestContextScope(ExecutionContext context) {
        if (context.departmentId() != null) return DictionaryAttributeScopeType.DEPARTMENT;
        if (context.organizationId() != null) return DictionaryAttributeScopeType.ORGANIZATION;
        return DictionaryAttributeScopeType.TENANT;
    }

    private List<DictionaryItemAttributeValue> activeValues(Long itemId, Long attributeId) {
        return valueRepository.findByDictionaryItemIdAndAttributeDefinitionIdAndStatusOrderByValueOrderAsc(
                itemId, attributeId, DictionaryStatus.ACTIVE);
    }

    private DictionaryDefinition requireVisibleDictionary(Long id) {
        if (id == null) throw badRequest("DICTIONARY_REQUIRED", "字典标识不能为空");
        return definitionRepository.findVisibleById(id, current().tenantId())
                .orElseThrow(() -> notFound("DICTIONARY_NOT_FOUND", "字典不存在或无权访问"));
    }

    private DictionaryDefinition resolveDictionary(Long tenantId, String code) {
        String normalized = DictionaryCodePolicy.requireDictionaryCode(code);
        return definitionRepository.findByTenantIdAndCode(tenantId, normalized)
                .or(() -> definitionRepository.findByScopeTypeAndCode(DictionaryScopeType.PLATFORM, normalized))
                .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                .orElseThrow(() -> notFound("DICTIONARY_NOT_FOUND", "未找到可用字典 " + normalized));
    }

    private DictionaryItem requireItem(Long dictionaryId, Long itemId) {
        return itemRepository.findByIdAndDictionaryId(itemId, dictionaryId)
                .orElseThrow(() -> notFound("DICTIONARY_ITEM_NOT_FOUND", "字典项不存在"));
    }

    private DictionaryAttributeDefinition requireAttribute(Long dictionaryId, Long attributeId) {
        return attributeRepository.findByIdAndDictionaryId(attributeId, dictionaryId)
                .orElseThrow(() -> notFound("DICTIONARY_ATTRIBUTE_NOT_FOUND", "字典扩展属性不存在"));
    }

    private DictionaryAttributeDefinition requireActiveAttribute(Long dictionaryId, Long attributeId) {
        DictionaryAttributeDefinition value = requireAttribute(dictionaryId, attributeId);
        if (value.status() != DictionaryStatus.ACTIVE) {
            throw badRequest("DICTIONARY_ATTRIBUTE_INACTIVE", "停用扩展属性不能维护新值");
        }
        return value;
    }

    private void touchDictionary(DictionaryDefinition dictionary, long expectedRevision, Long actorId) {
        try {
            dictionary.touchForItemChange(expectedRevision, actorId);
        } catch (RuntimeException exception) {
            throw conflict("DICTIONARY_REVISION_CONFLICT", "字典已被其他操作更新，请刷新后重试");
        }
    }

    private void requireNewRequest(String requestCode) {
        if (requestCode == null || requestCode.isBlank()) throw badRequest("REQUEST_CODE_REQUIRED", "请求编码不能为空");
        if (changeRepository.findFirstByRequestCodeOrderByChangedAtAsc(requestCode.trim()).isPresent()) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项字典变更");
        }
    }

    private void append(DictionaryDefinition dictionary, Long itemId, Long attributeId,
                        DictionaryChangeType changeType, DictionaryChangeTargetType targetType,
                        String before, String after, String reason, String requestCode, Long actorId) {
        changeRepository.save(new DictionaryChange(dictionary, itemId, attributeId, changeType, targetType,
                before, after, reason, requestCode, actorId));
    }

    private Long actorId(ExecutionContext context) {
        if (context.subjectId() != null) return context.subjectId();
        return identityAccessDirectory.findActiveAccount(context.tenantId(), context.actor())
                .map(account -> account.id()).orElseThrow(() -> badRequest(
                        "DICTIONARY_ACTOR_REQUIRED", "字典变更必须由可审计的用户账号发起"));
    }

    private ExecutionContext current() {
        return contextProvider.requireCurrent();
    }

    private Map<String, Object> definitionSnapshot(DictionaryAttributeDefinition value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id().toString()); result.put("code", value.code()); result.put("name", value.name());
        result.put("description", value.description()); result.put("dataType", value.dataType().name());
        result.put("cardinality", value.cardinality().name());
        result.put("referenceDictionaryId", value.referenceDictionaryId() == null ? null : value.referenceDictionaryId().toString());
        result.put("schema", jsonCodec.readTree(value.schemaJson())); result.put("minimumScope", value.minimumScope().name());
        result.put("overridePolicy", value.overridePolicy().name()); result.put("requiredValue", value.requiredValue());
        result.put("searchable", value.searchable()); result.put("status", value.status().name());
        return result;
    }

    private List<Map<String, Object>> valueSnapshot(List<DictionaryItemAttributeValue> values,
                                                    DictionaryAttributeDefinition definition) {
        return values.stream().map(value -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("scopeType", value.scopeType().name()); row.put("scopeCode", value.scopeCode());
            row.put("valueOrder", value.valueOrder()); row.put("valueMode", value.valueMode().name());
            row.put("value", value.valueMode() == DictionaryAttributeValueMode.EXPLICIT_EMPTY
                    ? null : scalarValue(value, definition.dataType()));
            row.put("referenceItemId", value.referenceItemId() == null ? null : value.referenceItemId().toString());
            return row;
        }).toList();
    }

    private String scalarValue(DictionaryItemAttributeValue value, DictionaryAttributeDataType type) {
        return switch (type) {
            case BOOLEAN -> value.booleanValue() == null ? null : value.booleanValue().toString();
            case INTEGER -> value.integerValue() == null ? null : value.integerValue().toString();
            case DECIMAL -> value.decimalValue() == null ? null : value.decimalValue().stripTrailingZeros().toPlainString();
            case TEXT -> value.textValue();
            case CODE -> value.codeValue();
            case DATE -> value.dateValue() == null ? null : value.dateValue().toString();
            case DATETIME -> value.datetimeValue() == null ? null : value.datetimeValue().toString();
            case DICT_REF -> value.referenceItemId() == null ? null : value.referenceItemId().toString();
        };
    }

    private Boolean parseBoolean(String value) {
        if ("true".equalsIgnoreCase(value)) return true;
        if ("false".equalsIgnoreCase(value)) return false;
        throw new IllegalArgumentException("布尔值格式不正确");
    }

    private String requireRaw(String value, int max) {
        if (value == null || value.isBlank() || value.trim().length() > max) throw new IllegalArgumentException("属性值不正确");
        return value.trim();
    }

    private String scopeLabel(DictionaryAttributeScopeType scope) {
        return switch (scope) {
            case PLATFORM -> "全局";
            case TENANT -> "租户";
            case ORGANIZATION -> "机构";
            case DEPARTMENT -> "科室";
        };
    }

    public record DefinitionCommand(
            String code, String name, String description,
            DictionaryAttributeDataType dataType, DictionaryAttributeCardinality cardinality,
            Long referenceDictionaryId, JsonNode schema, DictionaryAttributeScopeType minimumScope,
            DictionaryAttributeOverridePolicy overridePolicy, boolean requiredValue, boolean searchable,
            String reason, String requestCode) {
    }

    public record SetValuesCommand(
            DictionaryAttributeScopeType scopeType, Long organizationId, Long departmentId,
            DictionaryAttributeValueMode valueMode, List<String> values,
            String reason, String requestCode) {
    }

    public record ScopeCommand(
            DictionaryAttributeScopeType scopeType, Long organizationId, Long departmentId,
            String reason, String requestCode) {
    }

    private record Scope(DictionaryAttributeScopeType type, String code, Long tenantId,
                         Long organizationId, Long departmentId) {
    }
}
