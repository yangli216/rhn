package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeResolutionResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeSchemaResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeMaintenanceResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeChangeView;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory.AttributeContexts;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory.AttributeScope;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory.ItemAttributeSnapshot;
import com.rhn.platform.masterdata.application.ItemAttributeMaintenanceService;
import com.rhn.platform.masterdata.application.ItemAttributeMaintenanceService.BaseValueCommand;
import com.rhn.platform.masterdata.application.ItemAttributeMaintenanceService.OverrideCommand;
import com.rhn.platform.masterdata.application.ItemAttributeResolutionService;
import com.rhn.platform.masterdata.application.ItemAttributeResolutionService.ResolutionContexts;
import com.rhn.platform.masterdata.application.ItemAttributeResolutionService.ScopeContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;

import java.time.LocalDate;
import java.util.List;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/platform/master-data/item-attributes")
public class ItemAttributeController {
    private final ItemAttributeResolutionService service;
    private final ItemAttributeMaintenanceService maintenanceService;
    private final ItemAttributeSnapshotDirectory snapshotDirectory;

    public ItemAttributeController(ItemAttributeResolutionService service,
                                   ItemAttributeMaintenanceService maintenanceService,
                                   ItemAttributeSnapshotDirectory snapshotDirectory) {
        this.service = service;
        this.maintenanceService = maintenanceService;
        this.snapshotDirectory = snapshotDirectory;
    }

    @GetMapping("/schema")
    AttributeSchemaResponse schema(@RequestParam String subjectType, @RequestParam Long targetId) {
        return service.schema(subjectType, targetId);
    }

    @PostMapping("/resolve")
    AttributeResolutionResponse resolve(@Valid @RequestBody ResolveRequest request) {
        return service.resolve(request.subjectType(), request.targetId(), request.businessDate(),
                new ResolutionContexts(scope(request.ordering()), scope(request.executing()),
                        scope(request.dispensing()), scope(request.stocking())));
    }

    @PostMapping("/snapshot")
    ItemAttributeSnapshot snapshot(@Valid @RequestBody ResolveRequest request) {
        return snapshotDirectory.resolveSnapshot(request.subjectType(), request.targetId(), request.businessDate(),
                new AttributeContexts(attributeScope(request.ordering()), attributeScope(request.executing()),
                        attributeScope(request.dispensing()), attributeScope(request.stocking())));
    }

    @GetMapping("/maintenance")
    AttributeMaintenanceResponse maintenance(@RequestParam String subjectType, @RequestParam Long targetId,
                                             @RequestParam(required = false) LocalDate businessDate) {
        return maintenanceService.maintenance(subjectType, targetId, businessDate);
    }

    @GetMapping("/changes")
    List<AttributeChangeView> changes(@RequestParam String subjectType, @RequestParam Long targetId) {
        return maintenanceService.changes(subjectType, targetId);
    }

    @PutMapping("/base-value")
    AttributeMaintenanceResponse saveBaseValue(@Valid @RequestBody SaveBaseValueRequest request) {
        return maintenanceService.saveBaseValue(new BaseValueCommand(request.subjectType(), request.targetId(),
                request.definitionId(), request.valueId(), request.expectedRevision(), request.value(),
                request.validFrom(), request.validTo(), request.reason(), request.requestCode()));
    }

    @PutMapping("/override")
    AttributeMaintenanceResponse saveOverride(@Valid @RequestBody SaveOverrideRequest request) {
        return maintenanceService.saveOverride(new OverrideCommand(request.subjectType(), request.targetId(),
                request.definitionId(), request.overrideId(), request.expectedRevision(), request.scopeType(),
                request.organizationId(), request.departmentId(), request.valueMode(), request.value(),
                request.validFrom(), request.validTo(), request.reason(), request.requestCode()));
    }

    @PostMapping("/base-value/disable")
    AttributeMaintenanceResponse disableBaseValue(@Valid @RequestBody DisableValueRequest request) {
        return maintenanceService.disableBaseValue(request.subjectType(), request.targetId(), request.definitionId(),
                request.recordId(), request.expectedRevision(), request.reason(), request.requestCode());
    }

    @PostMapping("/override/disable")
    AttributeMaintenanceResponse disableOverride(@Valid @RequestBody DisableValueRequest request) {
        return maintenanceService.disableOverride(request.subjectType(), request.targetId(), request.definitionId(),
                request.recordId(), request.expectedRevision(), request.reason(), request.requestCode());
    }

    private ScopeContext scope(ContextRequest value) {
        return value == null ? null : new ScopeContext(value.organizationId(), value.departmentId());
    }

    private AttributeScope attributeScope(ContextRequest value) {
        return value == null ? null : new AttributeScope(value.organizationId(), value.departmentId());
    }

    record ResolveRequest(
            @NotBlank String subjectType,
            @NotNull Long targetId,
            @NotNull LocalDate businessDate,
            ContextRequest ordering,
            ContextRequest executing,
            ContextRequest dispensing,
            ContextRequest stocking) {}

    record ContextRequest(@NotNull Long organizationId, Long departmentId) {}

    record SaveBaseValueRequest(
            @NotBlank String subjectType,
            @NotNull Long targetId,
            @NotNull Long definitionId,
            Long valueId,
            Long expectedRevision,
            @NotNull JsonNode value,
            @NotNull LocalDate validFrom,
            LocalDate validTo,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {}

    record SaveOverrideRequest(
            @NotBlank String subjectType,
            @NotNull Long targetId,
            @NotNull Long definitionId,
            Long overrideId,
            Long expectedRevision,
            @NotBlank String scopeType,
            Long organizationId,
            Long departmentId,
            @NotBlank String valueMode,
            JsonNode value,
            @NotNull LocalDate validFrom,
            LocalDate validTo,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {}

    record DisableValueRequest(
            @NotBlank String subjectType,
            @NotNull Long targetId,
            @NotNull Long definitionId,
            @NotNull Long recordId,
            @NotNull Long expectedRevision,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String requestCode) {}
}
