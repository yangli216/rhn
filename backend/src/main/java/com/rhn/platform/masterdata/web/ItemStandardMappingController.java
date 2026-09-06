package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.StandardMappingViews.ItemTermMappingMaintenanceView;
import com.rhn.platform.masterdata.api.StandardMappingViews.StandardCodeSystemView;
import com.rhn.platform.masterdata.api.StandardMappingViews.StandardTermView;
import com.rhn.platform.masterdata.application.ItemStandardMappingService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigInteger;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/standard-mappings")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class ItemStandardMappingController {
    private final ItemStandardMappingService service;

    public ItemStandardMappingController(ItemStandardMappingService service) {
        this.service = service;
    }

    @GetMapping("/code-systems")
    List<StandardCodeSystemView> codeSystems(@RequestParam(required = false) String query,
                                             @RequestParam(required = false) String systemType,
                                             @RequestParam(required = false) String authorityType,
                                             @RequestParam(required = false) LocalDate businessDate) {
        return service.listCodeSystems(query, systemType, authorityType, businessDate);
    }

    @GetMapping("/terms")
    List<StandardTermView> terms(@RequestParam Long codeSystemId,
                                 @RequestParam(required = false) String query,
                                 @RequestParam(required = false) LocalDate businessDate) {
        return service.listTerms(codeSystemId, query, businessDate);
    }

    @GetMapping("/{subjectType}/{targetId}")
    ItemTermMappingMaintenanceView maintenance(
            @PathVariable @Pattern(regexp = "CATALOG_ITEM|MEDICATION") String subjectType,
            @PathVariable Long targetId,
            @RequestParam(required = false) LocalDate businessDate) {
        return service.maintenance(subjectType, targetId, businessDate);
    }

    @PostMapping("/{subjectType}/{targetId}")
    @ResponseStatus(HttpStatus.CREATED)
    ItemTermMappingMaintenanceView create(
            @PathVariable @Pattern(regexp = "CATALOG_ITEM|MEDICATION") String subjectType,
            @PathVariable Long targetId, @Valid @RequestBody MappingRequest request) {
        return service.create(subjectType, targetId, request.conceptId(), request.mappingType(),
                request.equivalence(), request.primaryMapping(), trimToNull(request.limitation()),
                request.validFrom(), request.validTo(), request.replacesMappingId(),
                request.expectedReplacesRevision() == null ? null : revision(request.expectedReplacesRevision()));
    }

    @PostMapping("/mappings/{mappingId}/status")
    ItemTermMappingMaintenanceView changeStatus(@PathVariable Long mappingId,
                                                 @Valid @RequestBody MappingStatusRequest request) {
        return service.changeStatus(mappingId, revision(request.expectedRevision()), request.status(),
                request.validTo());
    }

    record MappingRequest(
            @NotNull Long conceptId,
            @NotBlank @Pattern(regexp = "CLINICAL|INSURANCE|REGULATORY|LOCAL") String mappingType,
            @NotBlank @Pattern(regexp = "EXACT|EQUIVALENT|WIDER|NARROWER|RELATED") String equivalence,
            boolean primaryMapping,
            @Size(max = 2000) String limitation,
            @NotNull LocalDate validFrom,
            LocalDate validTo,
            Long replacesMappingId,
            @Min(0) BigInteger expectedReplacesRevision) {}

    record MappingStatusRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status,
            LocalDate validTo) {}

    private long revision(BigInteger value) {
        try {
            return value.longValueExact();
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("修订号超出BIGINT范围");
        }
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
