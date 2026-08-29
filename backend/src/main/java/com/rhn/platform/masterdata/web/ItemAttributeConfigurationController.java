package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.AttributeConfigurationResponse;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.AttributeDefinitionView;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.ConfigurationChangeView;
import com.rhn.platform.masterdata.api.ItemAttributeConfigurationViews.TypeAttributeView;
import com.rhn.platform.masterdata.application.ItemAttributeConfigurationService;
import com.rhn.platform.masterdata.application.ItemAttributeConfigurationService.AssignmentCommand;
import com.rhn.platform.masterdata.application.ItemAttributeConfigurationService.AssignmentUpdateCommand;
import com.rhn.platform.masterdata.application.ItemAttributeConfigurationService.DefinitionCommand;
import com.rhn.platform.masterdata.application.ItemAttributeConfigurationService.DefinitionUpdateCommand;
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
import tools.jackson.databind.JsonNode;

import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/item-attribute-configurations")
public class ItemAttributeConfigurationController {
    private static final String CODE_PATTERN = "[A-Za-z][A-Za-z0-9_.-]{2,127}";
    private final ItemAttributeConfigurationService service;

    public ItemAttributeConfigurationController(ItemAttributeConfigurationService service) {
        this.service = service;
    }

    @GetMapping
    AttributeConfigurationResponse configuration(@RequestParam(required = false) String subjectType,
                                                 @RequestParam(required = false) Long itemTypeId,
                                                 @RequestParam(required = false) String status) {
        return service.configuration(subjectType, itemTypeId, status);
    }

    @GetMapping("/changes")
    List<ConfigurationChangeView> changes() {
        return service.changes();
    }

    @PostMapping("/definitions")
    @ResponseStatus(HttpStatus.CREATED)
    AttributeDefinitionView createDefinition(@Valid @RequestBody DefinitionRequest request) {
        return service.createDefinition(request.command());
    }

    @PutMapping("/definitions/{id}")
    AttributeDefinitionView updateDefinition(@PathVariable Long id,
                                             @Valid @RequestBody UpdateDefinitionRequest request) {
        return service.updateDefinition(id, request.expectedRevision(), request.command());
    }

    @PostMapping("/definitions/{id}/status")
    AttributeDefinitionView definitionStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        return service.changeDefinitionStatus(id, request.expectedRevision(), request.status(),
                request.reason(), request.requestCode());
    }

    @PostMapping("/assignments")
    @ResponseStatus(HttpStatus.CREATED)
    TypeAttributeView createAssignment(@Valid @RequestBody AssignmentRequest request) {
        return service.createAssignment(request.command());
    }

    @PutMapping("/assignments/{id}")
    TypeAttributeView updateAssignment(@PathVariable Long id,
                                       @Valid @RequestBody UpdateAssignmentRequest request) {
        return service.updateAssignment(id, request.expectedRevision(), request.command());
    }

    @PostMapping("/assignments/{id}/status")
    TypeAttributeView assignmentStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        return service.changeAssignmentStatus(id, request.expectedRevision(), request.status(),
                request.reason(), request.requestCode());
    }

    record DefinitionRequest(
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 1000) String description,
            @NotBlank @Size(max = 32) String dataType,
            @NotBlank @Size(max = 16) String cardinality,
            Long dictionaryId,
            @Size(max = 64) String unitCode,
            @NotNull JsonNode schema,
            JsonNode defaultValue,
            @NotBlank @Size(max = 32) String variability,
            @NotBlank @Size(max = 32) String overridePolicy,
            @NotNull List<@NotBlank String> allowedScopes,
            @NotBlank @Size(max = 32) String contextBasis,
            @NotBlank @Size(max = 32) String sensitivity,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
        DefinitionCommand command() {
            return new DefinitionCommand(code, name, description, dataType, cardinality, dictionaryId,
                    unitCode, schema, defaultValue, variability, overridePolicy, allowedScopes,
                    contextBasis, sensitivity, reason, requestCode);
        }
    }

    record UpdateDefinitionRequest(
            @NotNull @Min(0) Long expectedRevision,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 1000) String description,
            @NotBlank @Size(max = 32) String dataType,
            @NotBlank @Size(max = 16) String cardinality,
            Long dictionaryId,
            @Size(max = 64) String unitCode,
            @NotNull JsonNode schema,
            JsonNode defaultValue,
            @NotBlank @Size(max = 32) String variability,
            @NotBlank @Size(max = 32) String overridePolicy,
            @NotNull List<@NotBlank String> allowedScopes,
            @NotBlank @Size(max = 32) String contextBasis,
            @NotBlank @Size(max = 32) String sensitivity,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
        DefinitionUpdateCommand command() {
            return new DefinitionUpdateCommand(name, description, dataType, cardinality, dictionaryId,
                    unitCode, schema, defaultValue, variability, overridePolicy, allowedScopes,
                    contextBasis, sensitivity, reason, requestCode);
        }
    }

    record AssignmentRequest(
            @NotNull Long itemTypeId,
            @NotNull Long definitionId,
            boolean required,
            JsonNode defaultValue,
            @NotBlank @Size(max = 32) String widgetType,
            @Size(max = 200) String groupName,
            @Min(0) int groupSortOrder,
            @Min(0) int attributeSortOrder,
            JsonNode visibleCondition,
            JsonNode requiredCondition,
            boolean searchable,
            boolean listDisplay,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
        AssignmentCommand command() {
            return new AssignmentCommand(itemTypeId, definitionId, required, defaultValue, widgetType,
                    groupName, groupSortOrder, attributeSortOrder, visibleCondition, requiredCondition,
                    searchable, listDisplay, reason, requestCode);
        }
    }

    record UpdateAssignmentRequest(
            @NotNull @Min(0) Long expectedRevision,
            boolean required,
            JsonNode defaultValue,
            @NotBlank @Size(max = 32) String widgetType,
            @Size(max = 200) String groupName,
            @Min(0) int groupSortOrder,
            @Min(0) int attributeSortOrder,
            JsonNode visibleCondition,
            JsonNode requiredCondition,
            boolean searchable,
            boolean listDisplay,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {
        AssignmentUpdateCommand command() {
            return new AssignmentUpdateCommand(required, defaultValue, widgetType, groupName,
                    groupSortOrder, attributeSortOrder, visibleCondition, requiredCondition,
                    searchable, listDisplay, reason, requestCode);
        }
    }

    record StatusRequest(
            @NotNull @Min(0) Long expectedRevision,
            @NotBlank @Size(max = 16) String status,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {}
}
