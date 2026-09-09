package com.rhn.platform.dictionary.web;

import com.rhn.platform.dictionary.api.DictionaryChangeResponse;
import com.rhn.platform.dictionary.api.DictionaryCategoryResponse;
import com.rhn.platform.dictionary.api.DictionaryDetailResponse;
import com.rhn.platform.dictionary.api.DictionarySummaryResponse;
import com.rhn.platform.dictionary.api.DictionaryValue;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.ApplicableItemView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.AttributeDefinitionView;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.ItemAttributeConfigurationView;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.platform.dictionary.application.DictionaryApplicationService;
import com.rhn.platform.dictionary.application.DictionaryAttributeService;
import com.rhn.platform.dictionary.application.DictionaryAttributeService.DefinitionCommand;
import com.rhn.platform.dictionary.application.DictionaryAttributeService.ScopeCommand;
import com.rhn.platform.dictionary.application.DictionaryAttributeService.SetValuesCommand;
import com.rhn.platform.dictionary.domain.DictionaryAttributeCardinality;
import com.rhn.platform.dictionary.domain.DictionaryAttributeDataType;
import com.rhn.platform.dictionary.domain.DictionaryAttributeOverridePolicy;
import com.rhn.platform.dictionary.domain.DictionaryAttributeScopeType;
import com.rhn.platform.dictionary.domain.DictionaryAttributeValueMode;
import com.rhn.platform.dictionary.domain.DictionaryCodePolicy;
import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import com.rhn.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigInteger;
import java.util.List;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/platform/dictionaries")
public class DictionaryController {
    private final DictionaryApplicationService service;
    private final DictionaryAttributeService attributeService;
    private final SystemEnumDirectory systemEnumDirectory;

    public DictionaryController(DictionaryApplicationService service, DictionaryAttributeService attributeService,
                                SystemEnumDirectory systemEnumDirectory) {
        this.service = service;
        this.attributeService = attributeService;
        this.systemEnumDirectory = systemEnumDirectory;
    }

    @GetMapping
    List<DictionarySummaryResponse> list(@RequestParam(required = false) String query,
                                         @RequestParam(required = false) Long categoryId,
                                         @RequestParam(required = false) DictionaryScopeType scopeType,
                                         @RequestParam(required = false) DictionaryStatus status) {
        return service.list(query, categoryId, scopeType, status);
    }

    @GetMapping("/categories")
    List<DictionaryCategoryResponse> categories() {
        return service.categories();
    }

    @GetMapping("/categories/{id}/changes")
    List<DictionaryChangeResponse> categoryChanges(@PathVariable Long id) {
        return service.categoryChanges(id);
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    DictionaryCategoryResponse createCategory(@Valid @RequestBody CreateDictionaryCategoryRequest request) {
        return service.createCategory(request.scopeType(), request.parentId(), request.code(), request.name(),
                request.description(), request.sortOrder(), request.reason(), request.requestCode());
    }

    @PutMapping("/categories/{id}")
    DictionaryCategoryResponse updateCategory(@PathVariable Long id,
                                               @Valid @RequestBody UpdateDictionaryCategoryRequest request) {
        return service.updateCategory(id, revision(request.expectedRevision()), request.parentId(), request.name(),
                request.description(), request.sortOrder(), request.reason(), request.requestCode());
    }

    @PostMapping("/categories/{id}/enable")
    DictionaryCategoryResponse enableCategory(@PathVariable Long id, @Valid @RequestBody RevisionCommand request) {
        return service.changeCategoryStatus(id, revision(request.expectedRevision()), true,
                request.reason(), request.requestCode());
    }

    @PostMapping("/categories/{id}/disable")
    DictionaryCategoryResponse disableCategory(@PathVariable Long id, @Valid @RequestBody RevisionCommand request) {
        return service.changeCategoryStatus(id, revision(request.expectedRevision()), false,
                request.reason(), request.requestCode());
    }

    @GetMapping("/system-enums")
    List<SystemEnumDefinition> systemEnums() {
        return systemEnumDirectory.listSystemEnums();
    }

    @GetMapping("/system-enums/{code}")
    SystemEnumDefinition systemEnum(@PathVariable String code) {
        return systemEnumDirectory.findSystemEnum(code)
                .orElseThrow(() -> com.rhn.shared.api.BusinessErrors.notFound(
                        "SYSTEM_ENUM_NOT_FOUND", "未找到系统枚举 " + code));
    }

    @GetMapping("/{id}")
    DictionaryDetailResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @GetMapping("/{id}/changes")
    List<DictionaryChangeResponse> changes(@PathVariable Long id) {
        return service.changes(id);
    }

    @GetMapping("/resolve/{code}")
    List<DictionaryValue> resolve(@PathVariable String code) {
        return service.resolveActiveItems(TenantContext.requireTenantId(), code);
    }

    @GetMapping("/resolve/{code}/applicable")
    List<ApplicableItemView> applicable(@PathVariable String code,
                                        @RequestParam String attributeCode,
                                        @RequestParam String referenceCode,
                                        @RequestParam(required = false) Long organizationId,
                                        @RequestParam(required = false) Long departmentId) {
        return attributeService.applicableItems(TenantContext.requireTenantId(), organizationId, departmentId,
                code, attributeCode, referenceCode);
    }

    @GetMapping("/{id}/attributes")
    List<AttributeDefinitionView> attributes(@PathVariable Long id) {
        return attributeService.definitions(id);
    }

    @PostMapping("/{id}/attributes")
    @ResponseStatus(HttpStatus.CREATED)
    AttributeDefinitionView createAttribute(@PathVariable Long id,
                                            @Valid @RequestBody CreateAttributeRequest request) {
        return attributeService.createDefinition(id, revision(request.expectedDictionaryRevision()),
                definitionCommand(request.code(), request.name(), request.description(), request.dataType(),
                        request.cardinality(), request.referenceDictionaryId(), request.schema(),
                        request.minimumScope(), request.overridePolicy(), request.requiredValue(), request.searchable(),
                        request.reason(), request.requestCode()));
    }

    @PutMapping("/{id}/attributes/{attributeId}")
    AttributeDefinitionView updateAttribute(@PathVariable Long id, @PathVariable Long attributeId,
                                            @Valid @RequestBody UpdateAttributeRequest request) {
        return attributeService.updateDefinition(id, attributeId, revision(request.expectedDictionaryRevision()),
                revision(request.expectedAttributeRevision()), definitionCommand(null, request.name(),
                        request.description(), request.dataType(), request.cardinality(),
                        request.referenceDictionaryId(), request.schema(), request.minimumScope(),
                        request.overridePolicy(), request.requiredValue(), request.searchable(),
                        request.reason(), request.requestCode()));
    }

    @PostMapping("/{id}/attributes/{attributeId}/enable")
    AttributeDefinitionView enableAttribute(@PathVariable Long id, @PathVariable Long attributeId,
                                            @Valid @RequestBody AttributeRevisionRequest request) {
        return attributeService.changeDefinitionStatus(id, attributeId,
                revision(request.expectedDictionaryRevision()), revision(request.expectedAttributeRevision()), true,
                request.reason(), request.requestCode());
    }

    @PostMapping("/{id}/attributes/{attributeId}/disable")
    AttributeDefinitionView disableAttribute(@PathVariable Long id, @PathVariable Long attributeId,
                                             @Valid @RequestBody AttributeRevisionRequest request) {
        return attributeService.changeDefinitionStatus(id, attributeId,
                revision(request.expectedDictionaryRevision()), revision(request.expectedAttributeRevision()), false,
                request.reason(), request.requestCode());
    }

    @GetMapping("/{id}/items/{itemId}/attributes")
    ItemAttributeConfigurationView itemAttributes(@PathVariable Long id, @PathVariable Long itemId,
                                                  @RequestParam(required = false) DictionaryAttributeScopeType scopeType,
                                                  @RequestParam(required = false) Long organizationId,
                                                  @RequestParam(required = false) Long departmentId) {
        return attributeService.itemConfiguration(id, itemId, scopeType, organizationId, departmentId);
    }

    @GetMapping("/{id}/item-attribute-configurations")
    List<ItemAttributeConfigurationView> itemAttributeConfigurations(
            @PathVariable Long id,
            @RequestParam(required = false) DictionaryAttributeScopeType scopeType,
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) Long departmentId) {
        return attributeService.itemConfigurations(id, scopeType, organizationId, departmentId);
    }

    @PutMapping("/{id}/items/{itemId}/attributes/{attributeId}/values")
    ItemAttributeConfigurationView setItemAttribute(@PathVariable Long id, @PathVariable Long itemId,
                                                    @PathVariable Long attributeId,
                                                    @Valid @RequestBody SetAttributeValuesRequest request) {
        return attributeService.setItemValues(id, itemId, attributeId,
                revision(request.expectedDictionaryRevision()), new SetValuesCommand(request.scopeType(),
                        request.organizationId(), request.departmentId(), request.valueMode(), request.values(),
                        request.reason(), request.requestCode()));
    }

    @PostMapping("/{id}/items/{itemId}/attributes/{attributeId}/inherit")
    ItemAttributeConfigurationView inheritItemAttribute(@PathVariable Long id, @PathVariable Long itemId,
                                                        @PathVariable Long attributeId,
                                                        @Valid @RequestBody InheritAttributeRequest request) {
        return attributeService.inheritItemValues(id, itemId, attributeId,
                revision(request.expectedDictionaryRevision()), new ScopeCommand(request.scopeType(),
                        request.organizationId(), request.departmentId(), request.reason(), request.requestCode()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    DictionaryDetailResponse create(@Valid @RequestBody CreateDictionaryRequest request) {
        return service.create(request.scopeType(), request.categoryId(), request.code(), request.name(), request.description(),
                request.reason(), request.requestCode());
    }

    @PutMapping("/{id}")
    DictionaryDetailResponse update(@PathVariable Long id,
                                    @Valid @RequestBody UpdateDictionaryRequest request) {
        return service.update(id, revision(request.expectedRevision()), request.categoryId(), request.name(), request.description(),
                request.reason(), request.requestCode());
    }

    @PostMapping("/{id}/enable")
    DictionaryDetailResponse enable(@PathVariable Long id, @Valid @RequestBody RevisionCommand request) {
        return service.changeStatus(id, revision(request.expectedRevision()), true, request.reason(), request.requestCode());
    }

    @PostMapping("/{id}/disable")
    DictionaryDetailResponse disable(@PathVariable Long id, @Valid @RequestBody RevisionCommand request) {
        return service.changeStatus(id, revision(request.expectedRevision()), false, request.reason(), request.requestCode());
    }

    @PostMapping("/{id}/items")
    @ResponseStatus(HttpStatus.CREATED)
    DictionaryDetailResponse addItem(@PathVariable Long id, @Valid @RequestBody CreateItemRequest request) {
        return service.addItem(id, revision(request.expectedRevision()), request.code(), request.name(),
                request.description(), request.sortOrder(), request.parentItemId(), request.reason(), request.requestCode());
    }

    @PutMapping("/{id}/items/{itemId}")
    DictionaryDetailResponse updateItem(@PathVariable Long id, @PathVariable Long itemId,
                                        @Valid @RequestBody UpdateItemRequest request) {
        return service.updateItem(id, itemId, revision(request.expectedRevision()), request.name(),
                request.description(), request.sortOrder(), request.parentItemId(), request.reason(), request.requestCode());
    }

    @PostMapping("/{id}/items/{itemId}/enable")
    DictionaryDetailResponse enableItem(@PathVariable Long id, @PathVariable Long itemId,
                                        @Valid @RequestBody RevisionCommand request) {
        return service.changeItemStatus(id, itemId, revision(request.expectedRevision()), true,
                request.reason(), request.requestCode());
    }

    @PostMapping("/{id}/items/{itemId}/disable")
    DictionaryDetailResponse disableItem(@PathVariable Long id, @PathVariable Long itemId,
                                         @Valid @RequestBody RevisionCommand request) {
        return service.changeItemStatus(id, itemId, revision(request.expectedRevision()), false,
                request.reason(), request.requestCode());
    }

    public record CreateDictionaryRequest(
            @NotNull DictionaryScopeType scopeType,
            @NotNull Long categoryId,
            @NotBlank @Size(max = 64)
            @Pattern(regexp = DictionaryCodePolicy.DICTIONARY_CODE_REGEX) String code,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record UpdateDictionaryRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotNull Long categoryId,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record RevisionCommand(
            @NotNull @Min(0) BigInteger expectedRevision,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record CreateDictionaryCategoryRequest(
            @NotNull DictionaryScopeType scopeType,
            Long parentId,
            @NotBlank @Size(max = 64)
            @Pattern(regexp = DictionaryCodePolicy.CATEGORY_CODE_REGEX) String code,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @Min(0) int sortOrder,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record UpdateDictionaryCategoryRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            Long parentId,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @Min(0) int sortOrder,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record CreateItemRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Size(max = 128)
            @Pattern(regexp = DictionaryCodePolicy.ITEM_CODE_REGEX) String code,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 1000) String description,
            @Min(0) int sortOrder,
            Long parentItemId,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record UpdateItemRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 1000) String description,
            @Min(0) int sortOrder,
            Long parentItemId,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record CreateAttributeRequest(
            @NotNull @Min(0) BigInteger expectedDictionaryRevision,
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 1000) String description,
            @NotNull DictionaryAttributeDataType dataType,
            @NotNull DictionaryAttributeCardinality cardinality,
            Long referenceDictionaryId,
            JsonNode schema,
            @NotNull DictionaryAttributeScopeType minimumScope,
            @NotNull DictionaryAttributeOverridePolicy overridePolicy,
            boolean requiredValue,
            boolean searchable,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record UpdateAttributeRequest(
            @NotNull @Min(0) BigInteger expectedDictionaryRevision,
            @NotNull @Min(0) BigInteger expectedAttributeRevision,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 1000) String description,
            @NotNull DictionaryAttributeDataType dataType,
            @NotNull DictionaryAttributeCardinality cardinality,
            Long referenceDictionaryId,
            JsonNode schema,
            @NotNull DictionaryAttributeScopeType minimumScope,
            @NotNull DictionaryAttributeOverridePolicy overridePolicy,
            boolean requiredValue,
            boolean searchable,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record AttributeRevisionRequest(
            @NotNull @Min(0) BigInteger expectedDictionaryRevision,
            @NotNull @Min(0) BigInteger expectedAttributeRevision,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record SetAttributeValuesRequest(
            @NotNull @Min(0) BigInteger expectedDictionaryRevision,
            @NotNull DictionaryAttributeScopeType scopeType,
            Long organizationId,
            Long departmentId,
            @NotNull DictionaryAttributeValueMode valueMode,
            List<@NotBlank @Size(max = 4000) String> values,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record InheritAttributeRequest(
            @NotNull @Min(0) BigInteger expectedDictionaryRevision,
            @NotNull DictionaryAttributeScopeType scopeType,
            Long organizationId,
            Long departmentId,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    private DefinitionCommand definitionCommand(String code, String name, String description,
                                                DictionaryAttributeDataType dataType,
                                                DictionaryAttributeCardinality cardinality,
                                                Long referenceDictionaryId, JsonNode schema,
                                                DictionaryAttributeScopeType minimumScope,
                                                DictionaryAttributeOverridePolicy overridePolicy,
                                                boolean requiredValue, boolean searchable,
                                                String reason, String requestCode) {
        return new DefinitionCommand(code, name, description, dataType, cardinality, referenceDictionaryId,
                schema, minimumScope, overridePolicy, requiredValue, searchable, reason, requestCode);
    }

    private long revision(BigInteger value) {
        try {
            return value.longValueExact();
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("修订号超出BIGINT范围");
        }
    }
}
