package com.rhn.platform.configuration.web;

import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.platform.configuration.api.ParameterCategoryResponse;
import com.rhn.platform.configuration.api.ParameterChangeResponse;
import com.rhn.platform.configuration.api.ParameterDefinitionDetailResponse;
import com.rhn.platform.configuration.api.ParameterDefinitionSummaryResponse;
import com.rhn.platform.configuration.application.ConfigurationApplicationService;
import com.rhn.platform.configuration.application.ConfigurationApplicationService.DefinitionCommand;
import com.rhn.platform.configuration.application.ConfigurationApplicationService.CategoryOrderCommand;
import com.rhn.platform.configuration.application.ConfigurationApplicationService.ValueCommand;
import com.rhn.platform.configuration.domain.ConfigurationCategory;
import com.rhn.platform.configuration.domain.ConfigurationCodePolicy;
import com.rhn.platform.configuration.domain.ConfigurationControlType;
import com.rhn.platform.configuration.domain.ConfigurationDependencyBehavior;
import com.rhn.platform.configuration.domain.ConfigurationDisplayPolicy;
import com.rhn.platform.configuration.domain.ConfigurationScope;
import com.rhn.platform.configuration.domain.ConfigurationSensitivity;
import com.rhn.platform.configuration.domain.ConfigurationStatus;
import com.rhn.platform.configuration.domain.ConfigurationValueMode;
import com.rhn.platform.configuration.domain.ConfigurationValueType;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContextProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
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
import java.util.Set;

@RestController
@RequestMapping("/api/platform/configuration")
public class ConfigurationController {
    private final ConfigurationApplicationService service;
    private final ExecutionContextProvider executionContextProvider;

    public ConfigurationController(ConfigurationApplicationService service,
                                   ExecutionContextProvider executionContextProvider) {
        this.service = service;
        this.executionContextProvider = executionContextProvider;
    }

    @GetMapping("/categories")
    List<ParameterCategoryResponse> categories() {
        return service.categories();
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    ParameterCategoryResponse createCategory(@Valid @RequestBody CreateCategoryRequest request) {
        return service.createCategory(request.parentId(), request.code(), request.name(),
                request.description(), request.sortOrder());
    }

    @PutMapping("/categories/{id}")
    ParameterCategoryResponse updateCategory(@PathVariable Long id,
                                             @Valid @RequestBody UpdateCategoryRequest request) {
        return service.updateCategory(id, revision(request.expectedRevision()), request.parentId(),
                request.name(), request.description(), request.sortOrder(), request.active());
    }

    @PutMapping("/categories/reorder")
    List<ParameterCategoryResponse> reorderCategories(@Valid @RequestBody ReorderCategoriesRequest request) {
        return service.reorderCategories(request.categories().stream()
                .map(item -> new CategoryOrderCommand(item.id(), revision(item.expectedRevision()),
                        item.parentId(), item.sortOrder()))
                .toList());
    }

    @GetMapping("/definitions")
    List<ParameterDefinitionSummaryResponse> definitions(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) ConfigurationCategory category,
            @RequestParam(required = false) ConfigurationStatus status) {
        return service.definitions(query, categoryId, category, status);
    }

    @GetMapping("/definitions/{id}")
    ParameterDefinitionDetailResponse definition(@PathVariable Long id) {
        return service.get(id);
    }

    @GetMapping("/definitions/{id}/changes")
    List<ParameterChangeResponse> changes(@PathVariable Long id) {
        return service.changes(id);
    }

    @PostMapping("/definitions")
    @ResponseStatus(HttpStatus.CREATED)
    ParameterDefinitionDetailResponse createDefinition(@Valid @RequestBody DefinitionRequest request) {
        return service.createDefinition(command(request));
    }

    @PutMapping("/definitions/{id}")
    ParameterDefinitionDetailResponse updateDefinition(@PathVariable Long id,
                                                       @Valid @RequestBody DefinitionRequest request) {
        if (request.expectedRevision() == null) {
            throw new IllegalArgumentException("更新参数定义必须提交当前修订号");
        }
        return service.updateDefinition(id, revision(request.expectedRevision()), command(request));
    }

    @PostMapping("/definitions/{id}/enable")
    ParameterDefinitionDetailResponse enableDefinition(@PathVariable Long id,
                                                       @Valid @RequestBody RevisionCommand request) {
        return service.changeDefinitionStatus(id, revision(request.expectedRevision()), true,
                request.reason(), request.requestCode());
    }

    @PostMapping("/definitions/{id}/disable")
    ParameterDefinitionDetailResponse disableDefinition(@PathVariable Long id,
                                                        @Valid @RequestBody RevisionCommand request) {
        return service.changeDefinitionStatus(id, revision(request.expectedRevision()), false,
                request.reason(), request.requestCode());
    }

    @PutMapping("/definitions/{id}/values")
    ParameterDefinitionDetailResponse saveValue(@PathVariable Long id,
                                                @Valid @RequestBody SaveValueRequest request) {
        return service.saveValue(id, new ValueCommand(optionalRevision(request.expectedRevision()),
                request.scopeType(), request.scopeId(), request.organizationId(), request.scopeReference(),
                request.valueMode(), request.valueJson(), request.secretRef(),
                request.reason(), request.requestCode()));
    }

    @PostMapping("/definitions/{id}/values/{valueId}/enable")
    ParameterDefinitionDetailResponse enableValue(@PathVariable Long id, @PathVariable Long valueId,
                                                  @Valid @RequestBody RevisionCommand request) {
        return service.changeValueStatus(id, valueId, revision(request.expectedRevision()), true,
                request.reason(), request.requestCode());
    }

    @PostMapping("/definitions/{id}/values/{valueId}/disable")
    ParameterDefinitionDetailResponse disableValue(@PathVariable Long id, @PathVariable Long valueId,
                                                   @Valid @RequestBody RevisionCommand request) {
        return service.changeValueStatus(id, valueId, revision(request.expectedRevision()), false,
                request.reason(), request.requestCode());
    }

    @PostMapping("/definitions/{id}/changes/{changeId}/rollback")
    ParameterDefinitionDetailResponse rollback(@PathVariable Long id, @PathVariable Long changeId,
                                               @Valid @RequestBody RevisionCommand request) {
        return service.rollbackValue(id, changeId, revision(request.expectedRevision()),
                request.reason(), request.requestCode());
    }

    @GetMapping("/values/{key:.+}")
    ConfigurationValue resolve(@PathVariable String key,
                               @RequestParam(required = false) Long userId,
                               @RequestParam(required = false) Long organizationId,
                               @RequestParam(required = false) Long departmentId,
                               @RequestParam(required = false) String productCode,
                               @RequestParam(required = false) String moduleCode,
                               @RequestParam(required = false) String environmentCode) {
        Long effectiveUserId = userId == null
                ? executionContextProvider.requireCurrent().subjectId() : userId;
        ConfigurationValue value = service.resolveCurrent(TenantContext.requireTenantId(), effectiveUserId,
                organizationId, departmentId, productCode, moduleCode, environmentCode, key);
        if (value.secretReference() == null) return value;
        return new ConfigurationValue(value.key(), value.value(), value.valueType(), value.category(),
                value.inheritanceEnabled(), value.cacheEnabled(), value.requestedScope(), value.requestedScopeId(),
                value.requestedScopeCode(), value.resolvedScope(), value.resolvedScopeId(), value.resolvedScopeCode(),
                value.valueMode(), value.inherited(), value.revision(), null);
    }

    private DefinitionCommand command(DefinitionRequest request) {
        return new DefinitionCommand(request.categoryId(), request.key(), request.name(), request.description(),
                request.valueType(), request.controlType(), request.jsonSchema(), request.defaultValueJson(),
                request.exampleValueJson(), request.unit(), request.dictionaryCode(), request.allowedScopes(),
                request.category(), request.inheritanceEnabled() == null || request.inheritanceEnabled(),
                request.cacheEnabled() == null || request.cacheEnabled(),
                request.nullableValue() != null && request.nullableValue(),
                request.sensitivity() == null ? ConfigurationSensitivity.NORMAL : request.sensitivity(),
                request.displayPolicy() == null ? ConfigurationDisplayPolicy.PLAIN : request.displayPolicy(),
                request.dependsOnKey(), request.dependsOnValue(),
                request.dependencyBehavior() == null ? ConfigurationDependencyBehavior.DISABLE_AND_SUPPRESS : request.dependencyBehavior(),
                request.reason(), request.requestCode());
    }

    private long revision(BigInteger value) {
        try {
            return value.longValueExact();
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("修订号超出BIGINT范围");
        }
    }

    private Long optionalRevision(BigInteger value) {
        return value == null ? null : revision(value);
    }

    public record CreateCategoryRequest(
            Long parentId,
            @NotBlank @Size(max = 64)
            @Pattern(regexp = ConfigurationCodePolicy.CATEGORY_CODE_REGEX) String code,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @Min(0) int sortOrder) {
    }

    public record UpdateCategoryRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            Long parentId,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @Min(0) int sortOrder,
            boolean active) {
    }

    public record ReorderCategoriesRequest(
            @NotEmpty @Size(max = 500) List<@Valid CategoryOrderRequest> categories) {
    }

    public record CategoryOrderRequest(
            @NotNull Long id,
            @NotNull @Min(0) BigInteger expectedRevision,
            Long parentId,
            @Min(0) int sortOrder) {
    }

    public record DefinitionRequest(
            @Min(0) BigInteger expectedRevision,
            @NotNull Long categoryId,
            @NotBlank @Size(max = 160)
            @Pattern(regexp = ConfigurationCodePolicy.PARAMETER_KEY_REGEX) String key,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @NotNull ConfigurationValueType valueType,
            @NotNull ConfigurationControlType controlType,
            @Size(max = 10000) String jsonSchema,
            @Size(max = 10000) String defaultValueJson,
            @Size(max = 10000) String exampleValueJson,
            @Size(max = 32) String unit,
            @Size(max = 64) String dictionaryCode,
            @NotEmpty Set<ConfigurationScope> allowedScopes,
            @NotNull ConfigurationCategory category,
            Boolean inheritanceEnabled,
            Boolean cacheEnabled,
            Boolean nullableValue,
            ConfigurationSensitivity sensitivity,
            ConfigurationDisplayPolicy displayPolicy,
            @Size(max = 160) String dependsOnKey,
            @Size(max = 500) String dependsOnValue,
            ConfigurationDependencyBehavior dependencyBehavior,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record SaveValueRequest(
            @Min(0) BigInteger expectedRevision,
            @NotNull ConfigurationScope scopeType,
            Long scopeId,
            Long organizationId,
            @Size(max = 128) String scopeReference,
            @NotNull ConfigurationValueMode valueMode,
            @Size(max = 20000) String valueJson,
            @Size(max = 500) String secretRef,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }

    public record RevisionCommand(
            @NotNull @Min(0) BigInteger expectedRevision,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
    }
}
