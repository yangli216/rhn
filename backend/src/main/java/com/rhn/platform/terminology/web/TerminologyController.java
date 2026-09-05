package com.rhn.platform.terminology.web;

import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.terminology.api.ConceptView;
import com.rhn.platform.terminology.api.CodeSystemSummary;
import com.rhn.platform.terminology.api.DiseaseConceptView;
import com.rhn.platform.terminology.api.DiseaseManagementProgramView;
import com.rhn.platform.terminology.api.DiseaseSearchPage;
import com.rhn.shared.api.PageResult;
import com.rhn.platform.terminology.application.TerminologyApplicationService;
import com.rhn.platform.terminology.domain.TerminologyCodePolicy;
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

import java.time.LocalDate;
import java.math.BigInteger;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/platform/terminology")
public class TerminologyController {
    private final TerminologyApplicationService service;

    public TerminologyController(TerminologyApplicationService service) {
        this.service = service;
    }

    @GetMapping("/value-sets/{code}/expand")
    List<ConceptView> expand(@PathVariable String code,
                             @RequestParam(required = false) LocalDate at) {
        return service.expandValueSet(TenantContext.requireTenantId(), code,
                at == null ? LocalDate.now() : at);
    }

    @GetMapping("/disease-code-systems")
    List<CodeSystemSummary> diseaseCodeSystems() {
        return service.listDiseaseCodeSystems(TenantContext.requireTenantId());
    }

    @GetMapping("/diseases")
    List<DiseaseConceptView> diseases(@RequestParam(required = false) String query,
                                      @RequestParam(required = false) String conceptType,
                                      @RequestParam(required = false)
                                      com.rhn.platform.terminology.domain.TerminologyStatus status) {
        return service.listDiseases(TenantContext.requireTenantId(), query, conceptType, status);
    }

    @GetMapping("/diseases/search")
    DiseaseSearchPage searchDiseases(@RequestParam(required = false) String query,
                                     @RequestParam(required = false) String conceptType,
                                     @RequestParam(required = false)
                                     com.rhn.platform.terminology.domain.TerminologyStatus status,
                                     @RequestParam(required = false) String diagnosisDomain,
                                     @RequestParam(defaultValue = "0") @Min(0) int page,
                                     @RequestParam(defaultValue = "20") @Min(10) int size) {
        return service.searchDiseases(TenantContext.requireTenantId(), query, conceptType, status,
                diagnosisDomain, page, size);
    }

    @PostMapping("/diseases")
    @ResponseStatus(HttpStatus.CREATED)
    DiseaseConceptView createDisease(@Valid @RequestBody DiseaseRequest request) {
        return service.createDisease(TenantContext.requireTenantId(), request.codeSystemId(), request.code().trim(),
                request.display().trim(), trimToNull(request.shortDisplay()), request.sdConceptType(),
                trimToNull(request.chapterCode()), trimToNull(request.chapterName()), trimToNull(request.definition()),
                trimToNull(request.searchCode()), request.effectiveFrom(), request.effectiveTo(), request.sdStatus(),
                request.aliases());
    }

    @PutMapping("/diseases/{id}")
    DiseaseConceptView updateDisease(@PathVariable Long id, @Valid @RequestBody UpdateDiseaseRequest request) {
        return service.updateDisease(TenantContext.requireTenantId(), id, revision(request.expectedRevision()),
                request.display().trim(), trimToNull(request.shortDisplay()), request.sdConceptType(),
                trimToNull(request.chapterCode()), trimToNull(request.chapterName()), trimToNull(request.definition()),
                trimToNull(request.searchCode()), request.effectiveFrom(), request.effectiveTo(), request.aliases());
    }

    @PostMapping("/diseases/{id}/status")
    DiseaseConceptView changeDiseaseStatus(@PathVariable Long id, @Valid @RequestBody DiseaseStatusRequest request) {
        return service.changeDiseaseStatus(TenantContext.requireTenantId(), id, revision(request.expectedRevision()),
                request.sdStatus(), request.replacementConceptId());
    }

    @GetMapping("/disease-management-programs")
    List<DiseaseManagementProgramView> diseaseManagementPrograms(
            @RequestParam(required = false) com.rhn.platform.terminology.domain.TerminologyStatus status) {
        return service.listDiseaseManagementPrograms(TenantContext.requireTenantId(), status);
    }

    @GetMapping("/disease-management-programs/search")
    PageResult<DiseaseManagementProgramView> searchDiseaseManagementPrograms(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String managementType,
            @RequestParam(required = false) com.rhn.platform.terminology.domain.TerminologyStatus status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(10) int size) {
        return service.searchDiseaseManagementPrograms(TenantContext.requireTenantId(), query, managementType,
                status, page, size);
    }

    @PostMapping("/disease-management-programs")
    @ResponseStatus(HttpStatus.CREATED)
    DiseaseManagementProgramView createDiseaseManagementProgram(
            @Valid @RequestBody DiseaseManagementProgramRequest request) {
        return service.createDiseaseManagementProgram(TenantContext.requireTenantId(), request.productScope(),
                request.code().trim(), request.name().trim(), request.sdManagementType(), request.sdTriggerAction(),
                trimToNull(request.description()), trimToNull(request.reportCardType()), request.reportDeadlineHours(),
                request.effectiveFrom(), request.effectiveTo());
    }

    @PutMapping("/disease-management-programs/{id}")
    DiseaseManagementProgramView updateDiseaseManagementProgram(@PathVariable Long id,
            @Valid @RequestBody UpdateDiseaseManagementProgramRequest request) {
        return service.updateDiseaseManagementProgram(TenantContext.requireTenantId(), id,
                revision(request.expectedRevision()), request.name().trim(), request.sdManagementType(),
                request.sdTriggerAction(), trimToNull(request.description()), trimToNull(request.reportCardType()),
                request.reportDeadlineHours(), request.effectiveFrom(), request.effectiveTo());
    }

    @PutMapping("/disease-management-programs/{id}/members")
    DiseaseManagementProgramView replaceDiseaseManagementMembers(@PathVariable Long id,
            @Valid @RequestBody DiseaseManagementMembersRequest request) {
        return service.replaceDiseaseManagementMembers(TenantContext.requireTenantId(), id,
                revision(request.expectedRevision()), request.conceptIds());
    }

    @PutMapping("/disease-management-programs/{id}/scope")
    DiseaseManagementProgramView replaceDiseaseManagementScope(@PathVariable Long id,
            @Valid @RequestBody DiseaseManagementScopeRequest request) {
        return service.replaceDiseaseManagementScope(TenantContext.requireTenantId(), id,
                revision(request.expectedRevision()), request.rules().stream().map(rule ->
                        new TerminologyApplicationService.DiseaseRuleCommand(rule.inclusionMode(),
                                trimToNull(rule.sdDiagnosisDomain()), rule.codeSystemId(),
                                trimToNull(rule.sdConceptType()), trimToNull(rule.chapterCode()),
                                trimToNull(rule.codeFrom()), trimToNull(rule.codeTo()), trimToNull(rule.note())))
                        .toList(), request.exceptions().stream().map(exception ->
                        new TerminologyApplicationService.DiseaseExceptionCommand(exception.conceptId(),
                                exception.inclusionMode(), trimToNull(exception.note()))).toList());
    }

    @PostMapping("/disease-management-programs/{id}/status")
    DiseaseManagementProgramView changeDiseaseManagementProgramStatus(@PathVariable Long id,
            @Valid @RequestBody DiseaseManagementStatusRequest request) {
        return service.changeDiseaseManagementProgramStatus(TenantContext.requireTenantId(), id,
                revision(request.expectedRevision()), request.sdStatus());
    }

    @PostMapping("/code-systems")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Long> createCodeSystem(@Valid @RequestBody CreateCodeSystemRequest request) {
        Long id = service.createCodeSystem(TenantContext.requireTenantId(), request.productScope(),
                request.code().trim(), request.name().trim(), trimToNull(request.canonicalUri()),
                request.version().trim(), request.systemType() == null ? "COMMON" : request.systemType(),
                trimToNull(request.sdDiagnosisDomain()),
                trimToNull(request.publisher()), trimToNull(request.description()),
                request.authorityType() == null ? "INTERNAL" : request.authorityType(),
                trimToNull(request.sourceUri()), trimToNull(request.contentHash()),
                request.effectiveFrom(), request.effectiveTo());
        return Map.of("id", id);
    }

    @PostMapping("/code-systems/{id}/concepts")
    @ResponseStatus(HttpStatus.CREATED)
    ConceptView addConcept(@PathVariable Long id, @Valid @RequestBody AddConceptRequest request) {
        return service.addConcept(id, request.code().trim(), request.display().trim(),
                trimToNull(request.definition()), request.effectiveFrom(), request.effectiveTo());
    }

    @PostMapping("/code-systems/{id}/activate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void activateCodeSystem(@PathVariable Long id) { service.activateCodeSystem(id); }

    @PostMapping("/concepts/{id}/activate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void activateConcept(@PathVariable Long id) { service.activateConcept(id); }

    @PostMapping("/value-sets")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Long> createValueSet(@Valid @RequestBody CreateValueSetRequest request) {
        Long id = service.createValueSet(TenantContext.requireTenantId(), request.productScope(),
                request.code().trim(), request.name().trim(), request.version().trim(),
                request.effectiveFrom(), request.effectiveTo());
        return Map.of("id", id);
    }

    @PostMapping("/value-sets/{id}/members")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void addMember(@PathVariable Long id, @Valid @RequestBody AddMemberRequest request) {
        service.addValueSetMember(id, request.conceptId(), request.sortOrder());
    }

    @PostMapping("/value-sets/{id}/activate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void activateValueSet(@PathVariable Long id) { service.activateValueSet(id); }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    record CreateCodeSystemRequest(boolean productScope,
                                   @NotBlank @Size(max = 100)
                                   @Pattern(regexp = TerminologyCodePolicy.CODE_SYSTEM_REGEX,
                                           message = "编码体系登记键格式不正确") String code,
                                   @NotBlank @Size(max = 200) String name,
                                   @Size(max = 500) String canonicalUri,
                                   @NotBlank @Size(max = 64) String version,
                                   @Size(max = 32) String systemType,
                                   @Pattern(regexp = "WESTERN_MEDICINE|TCM_DISEASE|TCM_SYNDROME")
                                   String sdDiagnosisDomain,
                                   @Size(max = 300) String publisher,
                                   @Size(max = 2000) String description,
                                   @Pattern(regexp = "NATIONAL|INSURANCE|REGULATORY|LOCAL|INTERNAL|OTHER")
                                   String authorityType,
                                   @Size(max = 1000) String sourceUri,
                                   @Size(max = 128) String contentHash,
                                   @NotNull LocalDate effectiveFrom, LocalDate effectiveTo) {}

    record DiseaseManagementProgramRequest(
            boolean productScope,
            @NotBlank @Size(max = 64) @Pattern(regexp = "[A-Z][A-Z0-9_]{0,63}") String code,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = "CHRONIC_CARE|DISEASE_REPORT|SPECIAL_REGISTRY") String sdManagementType,
            @NotBlank @Pattern(regexp = "PROMPT_CONFIRMATION|CREATE_FOLLOW_UP_TASK|CREATE_REPORT_DRAFT")
            String sdTriggerAction,
            @Size(max = 1000) String description,
            @Size(max = 64) String reportCardType,
            @Min(1) Integer reportDeadlineHours,
            @NotNull LocalDate effectiveFrom,
            LocalDate effectiveTo) {}

    record UpdateDiseaseManagementProgramRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = "CHRONIC_CARE|DISEASE_REPORT|SPECIAL_REGISTRY") String sdManagementType,
            @NotBlank @Pattern(regexp = "PROMPT_CONFIRMATION|CREATE_FOLLOW_UP_TASK|CREATE_REPORT_DRAFT")
            String sdTriggerAction,
            @Size(max = 1000) String description,
            @Size(max = 64) String reportCardType,
            @Min(1) Integer reportDeadlineHours,
            @NotNull LocalDate effectiveFrom,
            LocalDate effectiveTo) {}

    record DiseaseManagementMembersRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotNull @Size(max = 1000) List<@NotNull Long> conceptIds) {}

    record DiseaseManagementScopeRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotNull @Size(max = 100) List<@Valid DiseaseManagementRuleRequest> rules,
            @NotNull @Size(max = 1000) List<@Valid DiseaseManagementExceptionRequest> exceptions) {}

    record DiseaseManagementRuleRequest(
            @NotBlank @Pattern(regexp = "INCLUDE|EXCLUDE") String inclusionMode,
            @Pattern(regexp = "WESTERN_MEDICINE|TCM_DISEASE|TCM_SYNDROME") String sdDiagnosisDomain,
            Long codeSystemId,
            @Pattern(regexp = "DISEASE|SYMPTOM|SIGN|CONDITION|SYNDROME") String sdConceptType,
            @Size(max = 64) String chapterCode,
            @Size(max = 100) String codeFrom,
            @Size(max = 100) String codeTo,
            @Size(max = 500) String note) {}

    record DiseaseManagementExceptionRequest(
            @NotNull Long conceptId,
            @NotBlank @Pattern(regexp = "INCLUDE|EXCLUDE") String inclusionMode,
            @Size(max = 500) String note) {}

    record DiseaseManagementStatusRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotNull com.rhn.platform.terminology.domain.TerminologyStatus sdStatus) {}

    record DiseaseRequest(
            @NotNull Long codeSystemId,
            @NotBlank @Size(max = 100) String code,
            @NotBlank @Size(max = 300) String display,
            @Size(max = 300) String shortDisplay,
            @NotBlank @Pattern(regexp = "DISEASE|SYMPTOM|SIGN|CONDITION|SYNDROME") String sdConceptType,
            @Size(max = 64) String chapterCode,
            @Size(max = 300) String chapterName,
            @Size(max = 1000) String definition,
            @Size(max = 128) String searchCode,
            @NotNull LocalDate effectiveFrom,
            LocalDate effectiveTo,
            @NotNull com.rhn.platform.terminology.domain.TerminologyStatus sdStatus,
            @Size(max = 30) List<@NotBlank @Size(max = 300) String> aliases) {}

    record UpdateDiseaseRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Size(max = 300) String display,
            @Size(max = 300) String shortDisplay,
            @NotBlank @Pattern(regexp = "DISEASE|SYMPTOM|SIGN|CONDITION|SYNDROME") String sdConceptType,
            @Size(max = 64) String chapterCode,
            @Size(max = 300) String chapterName,
            @Size(max = 1000) String definition,
            @Size(max = 128) String searchCode,
            @NotNull LocalDate effectiveFrom,
            LocalDate effectiveTo,
            @Size(max = 30) List<@NotBlank @Size(max = 300) String> aliases) {}

    record DiseaseStatusRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotNull com.rhn.platform.terminology.domain.TerminologyStatus sdStatus,
            Long replacementConceptId) {}

    record AddConceptRequest(@NotBlank @Size(max = 100) String code,
                             @NotBlank @Size(max = 300) String display,
                             @Size(max = 1000) String definition,
                             @NotNull LocalDate effectiveFrom, LocalDate effectiveTo) {}

    record CreateValueSetRequest(boolean productScope,
                                 @NotBlank @Size(max = 100)
                                 @Pattern(regexp = TerminologyCodePolicy.VALUE_SET_REGEX,
                                         message = "值域登记键格式不正确") String code,
                                 @NotBlank @Size(max = 200) String name,
                                 @NotBlank @Size(max = 64) String version,
                                 @NotNull LocalDate effectiveFrom, LocalDate effectiveTo) {}

    record AddMemberRequest(@NotNull Long conceptId, @Min(0) int sortOrder) {}

    private long revision(BigInteger value) {
        try {
            return value.longValueExact();
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("修订号超出BIGINT范围");
        }
    }
}
