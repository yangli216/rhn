package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeResolutionResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeSchemaResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeSchemaView;
import com.rhn.platform.masterdata.api.ItemAttributeViews.ResolvedAttributeView;
import com.rhn.platform.masterdata.domain.ItemAttributeDefinition;
import com.rhn.platform.masterdata.domain.ItemAttributeOverride;
import com.rhn.platform.masterdata.domain.ItemAttributeSubject;
import com.rhn.platform.masterdata.domain.ItemAttributeValue;
import com.rhn.platform.masterdata.domain.ItemType;
import com.rhn.platform.masterdata.domain.ItemTypeAttribute;
import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.domain.MedicationProduct;
import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import com.rhn.platform.masterdata.domain.ServiceVariant;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeDefinitionRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeOverrideRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeSubjectRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeValueRepository;
import com.rhn.platform.masterdata.infrastructure.ItemTypeAttributeRepository;
import com.rhn.platform.masterdata.infrastructure.ItemTypeRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationProductRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceVariantRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ItemAttributeResolutionService {
    private final ItemAttributeSubjectRepository subjectRepository;
    private final ItemTypeRepository itemTypeRepository;
    private final ItemTypeAttributeRepository assignmentRepository;
    private final ItemAttributeDefinitionRepository definitionRepository;
    private final ItemAttributeValueRepository valueRepository;
    private final ItemAttributeOverrideRepository overrideRepository;
    private final MedicationRepository medicationRepository;
    private final ServiceCatalogItemRepository serviceRepository;
    private final MedicationProductRepository productRepository;
    private final ServiceVariantRepository variantRepository;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public ItemAttributeResolutionService(ItemAttributeSubjectRepository subjectRepository,
                                          ItemTypeRepository itemTypeRepository,
                                          ItemTypeAttributeRepository assignmentRepository,
                                          ItemAttributeDefinitionRepository definitionRepository,
                                          ItemAttributeValueRepository valueRepository,
                                          ItemAttributeOverrideRepository overrideRepository,
                                          MedicationRepository medicationRepository,
                                          ServiceCatalogItemRepository serviceRepository,
                                          MedicationProductRepository productRepository,
                                          ServiceVariantRepository variantRepository,
                                          ExecutionContextProvider contextProvider,
                                          JsonCodec jsonCodec) {
        this.subjectRepository = subjectRepository;
        this.itemTypeRepository = itemTypeRepository;
        this.assignmentRepository = assignmentRepository;
        this.definitionRepository = definitionRepository;
        this.valueRepository = valueRepository;
        this.overrideRepository = overrideRepository;
        this.medicationRepository = medicationRepository;
        this.serviceRepository = serviceRepository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    public AttributeSchemaResponse schema(String subjectType, Long targetId) {
        SubjectBinding binding = binding(subjectType, targetId);
        List<AssignmentBinding> assignments = assignments(binding.itemTypeId());
        List<AttributeSchemaView> attributes = assignments.stream().map(value -> {
            ItemAttributeDefinition definition = value.definition();
            ItemTypeAttribute assignment = value.assignment();
            return new AttributeSchemaView(assignment.id(), definition.id(), definition.revision(),
                    definition.code(), definition.name(), definition.description(), definition.dataType(),
                    definition.cardinality(), definition.dictionaryId(), definition.unitCode(),
                    json(definition.schemaJson()), json(firstNonBlank(assignment.defaultJson(), definition.defaultJson())),
                    definition.variability(), definition.overridePolicy(), json(definition.allowedScopeJson()),
                    definition.contextBasis(), definition.storageMode(), definition.projectionField(),
                    definition.sensitivity(), assignment.requiredValue(), assignment.widgetType(),
                    assignment.groupName(), assignment.groupSortOrder(), assignment.attributeSortOrder(),
                    json(assignment.visibleConditionJson()), json(assignment.requiredConditionJson()),
                    assignment.searchable(), assignment.listDisplay());
        }).toList();
        return new AttributeSchemaResponse(binding.subject().id(), binding.subject().subjectType(), targetId,
                binding.itemTypeId(), attributes);
    }

    @Transactional(readOnly = true)
    public AttributeResolutionResponse resolve(String subjectType, Long targetId, LocalDate businessDate,
                                               ResolutionContexts contexts) {
        SubjectBinding binding = binding(subjectType, targetId);
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        List<AssignmentBinding> assignments = assignments(binding.itemTypeId());
        List<Long> subjectIds = new ArrayList<>();
        subjectIds.add(binding.subject().id());
        ItemAttributeSubject platformSubject = platformSubject(binding.itemMasterId());
        if (platformSubject != null) subjectIds.add(platformSubject.id());
        List<ItemAttributeValue> values = valueRepository.findCurrent(subjectIds, date);
        List<ItemAttributeOverride> overrides = overrideRepository.findCurrent(
                current().tenantId(), binding.subject().id(), date);
        Instant resolvedAt = Instant.now();
        List<ResolvedAttributeView> resolved = assignments.stream()
                .map(value -> resolveOne(binding, value, values, overrides, contexts, platformSubject, resolvedAt))
                .toList();
        return new AttributeResolutionResponse(binding.subject().id(), binding.subject().subjectType(), targetId,
                binding.itemTypeId(), resolvedAt, resolved);
    }

    private ResolvedAttributeView resolveOne(SubjectBinding binding, AssignmentBinding assignmentBinding,
                                             List<ItemAttributeValue> values,
                                             List<ItemAttributeOverride> overrides,
                                             ResolutionContexts contexts,
                                             ItemAttributeSubject platformSubject,
                                             Instant resolvedAt) {
        ItemAttributeDefinition definition = assignmentBinding.definition();
        ItemTypeAttribute assignment = assignmentBinding.assignment();
        if ("PROJECTED".equals(definition.storageMode())) {
            JsonNode projected = projectedValue(binding, definition);
            return result(definition, projected, "PROJECTED", "PROJECTED", binding.subject().subjectKey(),
                    null, resolvedAt);
        }

        ScopeContext selected = contexts == null ? null : contexts.forBasis(definition.contextBasis());
        if (!"BASE_ONLY".equals(definition.variability())) {
            ItemAttributeOverride override = matchingOverride(overrides, definition.id(), selected, "DEPARTMENT");
            if (override == null) override = matchingOverride(overrides, definition.id(), selected, "ORGANIZATION");
            if (override == null) override = matchingOverride(overrides, definition.id(), selected, "TENANT");
            if (override != null) {
                JsonNode value = "EXPLICIT_NULL".equals(override.valueMode()) ? json("null") : json(override.valueJson());
                return result(definition, value, override.valueMode(), override.scopeType(), override.scopeKey(),
                        override.id(), resolvedAt);
            }
        }

        if (!"LOCAL_ONLY".equals(definition.variability())) {
            ItemAttributeValue tenantValue = matchingValue(values, binding.subject().id(), definition.id(), "TENANT");
            if (tenantValue != null) {
                return result(definition, json(tenantValue.valueJson()), "BASE_VALUE", "TENANT",
                        tenantValue.scopeCode(), tenantValue.id(), resolvedAt);
            }
            if (platformSubject != null) {
                ItemAttributeValue platformValue = matchingValue(values, platformSubject.id(), definition.id(), "PLATFORM");
                if (platformValue != null) {
                    return result(definition, json(platformValue.valueJson()), "BASE_VALUE", "PLATFORM",
                            platformValue.scopeCode(), platformValue.id(), resolvedAt);
                }
            }
            String defaultJson = firstNonBlank(assignment.defaultJson(), definition.defaultJson());
            if (defaultJson != null) {
                String source = assignment.defaultJson() != null ? "TYPE_DEFAULT" : "DEFINITION_DEFAULT";
                return result(definition, json(defaultJson), "DEFAULT", source, null, null, resolvedAt);
            }
        }
        if (assignment.requiredValue() || "LOCAL_ONLY".equals(definition.variability())) {
            throw badRequest("ITEM_ATTRIBUTE_REQUIRED_VALUE_MISSING",
                    "属性 " + definition.code() + " 在当前业务上下文中没有可用值");
        }
        return result(definition, json("null"), "MISSING", "NONE", null, null, resolvedAt);
    }

    private ItemAttributeOverride matchingOverride(List<ItemAttributeOverride> values, Long definitionId,
                                                   ScopeContext context, String scopeType) {
        List<ItemAttributeOverride> matches = values.stream()
                .filter(value -> value.attributeDefinitionId().equals(definitionId))
                .filter(value -> scopeType.equals(value.scopeType()))
                .filter(value -> switch (scopeType) {
                    case "DEPARTMENT" -> context != null && Objects.equals(value.organizationId(), context.organizationId())
                            && Objects.equals(value.departmentId(), context.departmentId());
                    case "ORGANIZATION" -> context != null && Objects.equals(value.organizationId(), context.organizationId());
                    case "TENANT" -> true;
                    default -> false;
                }).toList();
        if (matches.size() > 1) throw badRequest("ITEM_ATTRIBUTE_SCOPE_OVERLAP", "同一属性作用域存在多条同时有效的覆盖值");
        return matches.isEmpty() ? null : matches.getFirst();
    }

    private ItemAttributeValue matchingValue(List<ItemAttributeValue> values, Long subjectId,
                                             Long definitionId, String scopeType) {
        List<ItemAttributeValue> matches = values.stream()
                .filter(value -> value.attributeSubjectId().equals(subjectId))
                .filter(value -> value.attributeDefinitionId().equals(definitionId))
                .filter(value -> scopeType.equals(value.scopeType()))
                .toList();
        if (matches.size() > 1) throw badRequest("ITEM_ATTRIBUTE_VALUE_OVERLAP", "同一属性存在多条同时有效的公共值");
        return matches.isEmpty() ? null : matches.getFirst();
    }

    private JsonNode projectedValue(SubjectBinding binding, ItemAttributeDefinition definition) {
        if (binding.medication() != null && "medications.skin_test_required".equals(definition.projectionField())) {
            return jsonCodec.readTree(Boolean.toString(binding.medication().skinTestRequired()));
        }
        throw badRequest("ITEM_ATTRIBUTE_PROJECTION_UNSUPPORTED",
                "尚未注册投影字段读取器：" + definition.projectionField());
    }

    private List<AssignmentBinding> assignments(Long itemTypeId) {
        List<Long> hierarchy = hierarchy(itemTypeId);
        Map<Long, Integer> depth = new HashMap<>();
        for (int index = 0; index < hierarchy.size(); index++) depth.put(hierarchy.get(index), index);
        List<ItemTypeAttribute> candidates = assignmentRepository.findByItemTypeIdInAndStatus(hierarchy, "ACTIVE")
                .stream().sorted(Comparator.comparingInt(value -> depth.get(value.itemTypeId()))).toList();
        Map<Long, ItemTypeAttribute> merged = new LinkedHashMap<>();
        candidates.forEach(value -> merged.putIfAbsent(value.attributeDefinitionId(), value));
        Map<Long, ItemAttributeDefinition> definitions = definitionRepository.findAllById(merged.keySet()).stream()
                .filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> "PLATFORM".equals(value.scopeType())
                        || Objects.equals(value.tenantId(), current().tenantId()))
                .collect(java.util.stream.Collectors.toMap(ItemAttributeDefinition::id, value -> value));
        return merged.values().stream().filter(value -> definitions.containsKey(value.attributeDefinitionId()))
                .map(value -> new AssignmentBinding(value, definitions.get(value.attributeDefinitionId())))
                .sorted(Comparator.comparingInt((AssignmentBinding value) -> value.assignment().groupSortOrder())
                        .thenComparingInt(value -> value.assignment().attributeSortOrder())
                        .thenComparing(value -> value.definition().code())
                        .thenComparing(value -> value.assignment().id()))
                .toList();
    }

    private List<Long> hierarchy(Long itemTypeId) {
        List<Long> values = new ArrayList<>();
        Long current = itemTypeId;
        while (current != null) {
            if (values.contains(current) || values.size() >= 32) {
                throw badRequest("ITEM_TYPE_HIERARCHY_INVALID", "项目类型树存在循环或层级过深");
            }
            values.add(current);
            current = itemTypeRepository.findById(current).map(ItemType::parentId).orElse(null);
        }
        return values;
    }

    private SubjectBinding binding(String subjectType, Long targetId) {
        ExecutionContext context = current();
        return switch (subjectType) {
            case "MEDICATION" -> {
                Medication medication = medicationRepository.findByIdAndTenantId(targetId, context.tenantId())
                        .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到药品知识"));
                ItemAttributeSubject subject = subjectRepository.findByTenantIdAndMedicationId(context.tenantId(), targetId)
                        .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_SUBJECT_NOT_FOUND", "药品尚未注册属性主体"));
                yield new SubjectBinding(subject, medication.itemTypeId(), medication.itemMasterId(), medication);
            }
            case "CATALOG_ITEM" -> {
                ServiceCatalogItem service = serviceRepository
                        .findByIdAndTenantIdAndItemType(targetId, context.tenantId(), "SERVICE").orElse(null);
                MedicationProduct product = service == null ? productRepository
                        .findByIdAndTenantIdAndItemType(targetId, context.tenantId(), "MED_PRODUCT").orElse(null) : null;
                if (service == null && product == null) throw notFound("CATALOG_ITEM_NOT_FOUND", "未找到目录项目");
                ItemAttributeSubject subject = subjectRepository.findByTenantIdAndCatalogItemId(context.tenantId(), targetId)
                        .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_SUBJECT_NOT_FOUND", "目录项尚未注册属性主体"));
                yield new SubjectBinding(subject, service != null ? service.itemTypeId() : product.itemTypeId(),
                        service != null ? service.itemMasterId() : product.itemMasterId(), null);
            }
            case "SERVICE_VARIANT" -> {
                ServiceVariant variant = variantRepository.findByTenantIdAndId(context.tenantId(), targetId)
                        .orElseThrow(() -> notFound("SERVICE_VARIANT_NOT_FOUND", "未找到检查部位与方式"));
                ServiceCatalogItem service = serviceRepository
                        .findByIdAndTenantIdAndItemType(variant.catalogItemId(), context.tenantId(), "SERVICE")
                        .orElseThrow(() -> notFound("SERVICE_NOT_FOUND", "未找到检查项目"));
                ItemAttributeSubject subject = subjectRepository.findByTenantIdAndServiceVariantId(context.tenantId(), targetId)
                        .orElseThrow(() -> notFound("ITEM_ATTRIBUTE_SUBJECT_NOT_FOUND", "检查变体尚未注册属性主体"));
                yield new SubjectBinding(subject, service.itemTypeId(), service.itemMasterId(), null);
            }
            default -> throw badRequest("ITEM_ATTRIBUTE_SUBJECT_TYPE_INVALID", "不支持的属性主体类型：" + subjectType);
        };
    }

    private ItemAttributeSubject platformSubject(Long itemMasterId) {
        return itemMasterId == null ? null : subjectRepository.findByItemMasterId(itemMasterId).orElse(null);
    }

    private ResolvedAttributeView result(ItemAttributeDefinition definition, JsonNode value, String valueMode,
                                         String sourceLevel, String scopeKey, Long recordId, Instant resolvedAt) {
        return new ResolvedAttributeView(definition.code(), value, valueMode, sourceLevel, scopeKey,
                definition.id(), definition.revision(), recordId, resolvedAt);
    }

    private JsonNode json(String value) {
        if (value == null) return null;
        try { return jsonCodec.readTree(value); }
        catch (IllegalArgumentException exception) {
            throw badRequest("ITEM_ATTRIBUTE_JSON_INVALID", "属性配置包含无效 JSON");
        }
    }

    private String firstNonBlank(String first, String second) {
        return first != null && !first.isBlank() ? first : second != null && !second.isBlank() ? second : null;
    }

    private ExecutionContext current() { return contextProvider.requireCurrent(); }

    private record SubjectBinding(ItemAttributeSubject subject, Long itemTypeId,
                                  Long itemMasterId, Medication medication) {}
    private record AssignmentBinding(ItemTypeAttribute assignment, ItemAttributeDefinition definition) {}

    public record ScopeContext(Long organizationId, Long departmentId) {}
    public record ResolutionContexts(ScopeContext ordering, ScopeContext executing,
                                     ScopeContext dispensing, ScopeContext stocking) {
        ScopeContext forBasis(String basis) {
            return switch (basis) {
                case "ORDERING" -> ordering;
                case "EXECUTING" -> executing;
                case "DISPENSING" -> dispensing;
                case "STOCKING" -> stocking;
                default -> null;
            };
        }
    }
}
