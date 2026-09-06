package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.OrderFrequencyCommands.*;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot;
import com.rhn.platform.masterdata.api.OrderFrequencyViews.*;
import com.rhn.platform.masterdata.application.OrderFrequencyService;
import com.rhn.shared.context.ExecutionContextProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/order-frequencies")
public class OrderFrequencyController {
    private static final String CODE_PATTERN = "[A-Za-z][A-Za-z0-9_.-]{0,63}";
    private final OrderFrequencyService service;
    private final ExecutionContextProvider contextProvider;
    public OrderFrequencyController(OrderFrequencyService service, ExecutionContextProvider contextProvider) { this.service = service; this.contextProvider = contextProvider; }

    @GetMapping
    List<FrequencyView> list(@RequestParam(required = false) String query, @RequestParam(required = false) String status) { return service.list(query, status); }
    @GetMapping("/active")
    List<FrequencySnapshot> active(@RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(defaultValue = "OUTPATIENT") String scene,
            @RequestParam(defaultValue = "MEDICATION") String orderType,
            @RequestParam(required = false) LocalDate businessDate) {
        return service.active(contextProvider.requireCurrent().tenantId(), organizationId, departmentId, scene, orderType, businessDate);
    }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    FrequencyView create(@Valid @RequestBody FrequencyRequest request) { return service.create(request.command()); }
    @PutMapping("/{id}") @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    FrequencyView update(@PathVariable Long id, @Valid @RequestBody UpdateFrequencyRequest request) { return service.update(id, request.expectedRevision(), request.command()); }
    @PostMapping("/{id}/configurations") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    FrequencyView createConfiguration(@PathVariable Long id, @Valid @RequestBody ConfigurationRequest request) { return service.createConfiguration(id, request.command()); }
    @PutMapping("/{id}/configurations/{configurationId}") @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    FrequencyView updateConfiguration(@PathVariable Long id, @PathVariable Long configurationId,
            @Valid @RequestBody UpdateConfigurationRequest request) { return service.updateConfiguration(id, configurationId, request.expectedRevision(), request.command()); }
    @PostMapping("/preview")
    SchedulePreview preview(@Valid @RequestBody PreviewRequest request) { return service.preview(request.code(), request.organizationId(), request.departmentId(), request.start(), request.occurrences()); }

    public record FrequencyRequest(@NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 160) String name, @Size(max = 64) String shortName,
            @Size(max = 1000) String description, @NotBlank String ruleType,
            @Positive Integer frequencyCount, @Positive BigDecimal periodValue,
            String periodUnit, @NotBlank String anchorType, @Size(max = 256) String defaultExecutionTimes,
            boolean outpatientApplicable, boolean inpatientApplicable, boolean emergencyApplicable,
            boolean medicationApplicable, boolean treatmentApplicable, boolean nursingApplicable,
            boolean automaticTaskGeneration, @Min(0) int sortOrder, @NotBlank String status,
            @NotNull LocalDate validFrom, LocalDate validTo) {
        FrequencyCommand command() { return new FrequencyCommand(code, name, shortName, description, ruleType,
                frequencyCount, periodValue, periodUnit, anchorType, defaultExecutionTimes,
                outpatientApplicable, inpatientApplicable, emergencyApplicable, medicationApplicable,
                treatmentApplicable, nursingApplicable, automaticTaskGeneration, sortOrder, status, validFrom, validTo); }
    }
    public record UpdateFrequencyRequest(@NotNull Long expectedRevision, @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 160) String name, @Size(max = 64) String shortName,
            @Size(max = 1000) String description, @NotBlank String ruleType,
            @Positive Integer frequencyCount, @Positive BigDecimal periodValue,
            String periodUnit, @NotBlank String anchorType, @Size(max = 256) String defaultExecutionTimes,
            boolean outpatientApplicable, boolean inpatientApplicable, boolean emergencyApplicable,
            boolean medicationApplicable, boolean treatmentApplicable, boolean nursingApplicable,
            boolean automaticTaskGeneration, @Min(0) int sortOrder, @NotBlank String status,
            @NotNull LocalDate validFrom, LocalDate validTo) {
        FrequencyCommand command() { return new FrequencyCommand(code, name, shortName, description, ruleType,
                frequencyCount, periodValue, periodUnit, anchorType, defaultExecutionTimes,
                outpatientApplicable, inpatientApplicable, emergencyApplicable, medicationApplicable,
                treatmentApplicable, nursingApplicable, automaticTaskGeneration, sortOrder, status, validFrom, validTo); }
    }
    public record ConfigurationRequest(@NotNull Long organizationId, Long departmentId,
            @Size(max = 64) String localCode, @Size(max = 160) String localName,
            @Size(max = 256) String executionTimes, @NotBlank String firstDayPolicy,
            boolean enabled, @NotBlank String status, @NotNull LocalDate validFrom, LocalDate validTo) {
        ConfigurationCommand command() { return new ConfigurationCommand(organizationId, departmentId, localCode,
                localName, executionTimes, firstDayPolicy, enabled, status, validFrom, validTo); }
    }
    public record UpdateConfigurationRequest(@NotNull Long expectedRevision, @NotNull Long organizationId,
            Long departmentId, @Size(max = 64) String localCode, @Size(max = 160) String localName,
            @Size(max = 256) String executionTimes, @NotBlank String firstDayPolicy,
            boolean enabled, @NotBlank String status, @NotNull LocalDate validFrom, LocalDate validTo) {
        ConfigurationCommand command() { return new ConfigurationCommand(organizationId, departmentId, localCode,
                localName, executionTimes, firstDayPolicy, enabled, status, validFrom, validTo); }
    }
    public record PreviewRequest(@NotBlank String code, Long organizationId, Long departmentId,
            LocalDateTime start, @Min(1) @Max(30) int occurrences) {}
}
